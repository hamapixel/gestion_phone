import json
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from .models import (
    PhoneIdentifier, PhoneUnit, Product, Sale, SaleLine, SalePayment, StockMovement,
)


class SaleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = get_user_model().objects.create_superuser(
            username="owner", email="owner@example.com", password="StrongOwnerPass+2026"
        )
        cls.case = Product.objects.create(
            name="Pochette Galaxy A17", category="other",
            purchase_price="1000", sale_price="2500", quantity=10,
        )
        cls.other = Product.objects.create(
            name="Chargeur USB-C", category="other",
            purchase_price="1500", sale_price="3000", quantity=3,
        )
        cls.phone = Product.objects.create(
            name="Téléphone", brand="Samsung", model="Galaxy A17", category="phone",
            purchase_price="85000", sale_price="95000", quantity=0,
        )
        cls.unit = PhoneUnit.objects.create(product=cls.phone)
        PhoneIdentifier.objects.create(unit=cls.unit, imei="490154203237518", slot=1)
        PhoneIdentifier.objects.create(unit=cls.unit, imei="356938035643809", slot=2)

    def setUp(self):
        self.client.force_login(self.owner)

    def line(self, product=None, qty=2, price="2500", imei=""):
        return {
            "product_id": str((product or self.case).pk),
            "quantity": qty, "unit_price": price, "imei": imei,
        }

    def sale(self, lines=None, paid="5000", ref=None, client=None, **overrides):
        body = {
            "client_ref": ref or str(uuid.uuid4()),
            "lines": lines if lines is not None else [self.line()],
            "amount_paid": paid, "method": "cash",
            "customer_name": "", "customer_phone": "", "due_date": None,
        }
        body.update(overrides)
        result = (client or self.client).post(
            reverse("sales"), json.dumps(body), content_type="application/json"
        )
        return result, body

    def test_paid_accessory_sale_reduces_stock_tracks_cost_and_cash(self):
        response, _ = self.sale()
        self.assertEqual(response.status_code, 201, response.content)
        result = response.json()["sale"]
        self.assertEqual(result["total"], "5000.00")
        self.assertEqual(result["amount_paid"], "5000.00")
        self.assertEqual(result["balance"], "0.00")
        self.assertEqual(result["gross_profit"], "3000.00")
        self.assertEqual(result["status"], "paid")
        self.assertTrue(result["reference"].startswith("VTE-"))
        self.case.refresh_from_db()
        self.assertEqual(self.case.quantity, 8)
        self.assertEqual(SalePayment.objects.get().amount, Decimal("5000"))
        self.assertEqual(StockMovement.objects.get().delta, -2)
        self.assertEqual(StockMovement.objects.get().reason, "sale")
        summary = self.client.get(reverse("sales")).json()["today"]
        self.assertEqual(summary["total"], "5000.00")
        self.assertEqual(summary["cash_collected"], "5000.00")

    def test_mixed_sale_imei_and_cases_is_atomic(self):
        response, _ = self.sale(lines=[
            self.line(product=self.phone, qty=1, price="95000", imei="490154203237518"),
            self.line(qty=2, price="2500"),
        ], paid="100000")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["sale"]["total"], "100000.00")
        self.assertEqual(response.json()["sale"]["gross_profit"], "13000.00")
        self.unit.refresh_from_db()
        self.case.refresh_from_db()
        self.assertTrue(self.unit.sold)
        self.assertEqual(self.case.quantity, 8)
        self.assertEqual(SaleLine.objects.count(), 2)
        self.assertEqual(StockMovement.objects.count(), 2)

    def test_phone_second_imei_can_be_used_to_find_physical_unit(self):
        response, _ = self.sale(lines=[
            self.line(product=self.phone, qty=1, price="95000", imei="356938035643809")
        ], paid="95000")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["sale"]["lines"][0]["imei"], "490154203237518")

    def test_sold_phone_cannot_be_sold_again(self):
        line = self.line(product=self.phone, qty=1, price="95000", imei="490154203237518")
        first, _ = self.sale(lines=[line], paid="95000")
        second, _ = self.sale(lines=[line], paid="95000")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(Sale.objects.count(), 1)

    def test_oversell_rolls_back_all_lines(self):
        response, _ = self.sale(lines=[
            self.line(qty=2),
            self.line(product=self.other, qty=9, price="3000"),
        ], paid="32000")
        self.assertEqual(response.status_code, 409)
        self.case.refresh_from_db()
        self.other.refresh_from_db()
        self.assertEqual((self.case.quantity, self.other.quantity), (10, 3))
        self.assertEqual(Sale.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_credit_requires_customer_name_and_phone(self):
        result, _ = self.sale(paid="2500")
        self.assertEqual(result.status_code, 409)
        result, _ = self.sale(paid="2500", customer_name="Awa")
        self.assertEqual(result.status_code, 409)
        self.assertEqual(Sale.objects.count(), 0)
        result, _ = self.sale(
            paid="2500", customer_name="Awa", customer_phone="70000000",
            due_date="2026-12-10",
        )
        self.assertEqual(result.status_code, 201, result.content)
        self.assertEqual(result.json()["sale"]["balance"], "2500.00")
        self.assertEqual(result.json()["sale"]["status"], "credit")
        self.assertEqual(SalePayment.objects.count(), 1)
        self.assertEqual(SalePayment.objects.get().amount, Decimal("2500"))

    def test_zero_advance_creates_credit_without_payment_record(self):
        result, _ = self.sale(
            paid="0", customer_name="Baba", customer_phone="72000000"
        )
        self.assertEqual(result.status_code, 201, result.content)
        self.assertEqual(SalePayment.objects.count(), 0)
        self.assertEqual(result.json()["sale"]["balance"], "5000.00")

    def test_overpayment_and_invalid_method_rejected(self):
        result, _ = self.sale(paid="5001")
        self.assertEqual(result.status_code, 409)
        result, _ = self.sale(method="crypto")
        self.assertEqual(result.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)

    def test_retries_cannot_duplicate_sale_or_change_same_reference(self):
        ref = str(uuid.uuid4())
        line = [self.line(qty=2)]
        a, _ = self.sale(lines=line, ref=ref)
        b, _ = self.sale(lines=line, ref=ref)
        self.assertEqual(a.status_code, 201)
        self.assertEqual(b.status_code, 200)
        self.assertTrue(b.json()["replayed"])
        self.assertEqual(Sale.objects.count(), 1)
        self.case.refresh_from_db()
        self.assertEqual(self.case.quantity, 8)
        c, _ = self.sale(lines=line, ref=ref, paid="0",
                         customer_name="Awa", customer_phone="76000000")
        self.assertEqual(c.status_code, 409)

    def test_sale_lines_keep_original_product_name_when_catalog_is_edited(self):
        response, _ = self.sale()
        self.case.name = "Pochette modifiée"
        self.case.purchase_price = "1300"
        self.case.save(update_fields=["name", "purchase_price"])
        detail = self.client.get(reverse("sale-detail", args=[response.json()["sale"]["id"]]))
        self.assertEqual(detail.json()["sale"]["lines"][0]["product_name"], "Pochette Galaxy A17")
        self.assertEqual(detail.json()["sale"]["lines"][0]["unit_cost"], "1000.00")

    def test_unauthenticated_or_non_owner_cannot_access_sales(self):
        guest = Client()
        self.assertEqual(guest.get(reverse("sales")).status_code, 401)
        unauth, _ = self.sale(client=guest)
        self.assertEqual(unauth.status_code, 401)
        standard = get_user_model().objects.create_user(username="standard", password="StrongPass+2026")
        guest.force_login(standard)
        self.assertEqual(guest.get(reverse("sales")).status_code, 401)

    def test_csrf_protects_sale_creation(self):
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.owner)
        response, _ = self.sale(client=browser)
        self.assertEqual(response.status_code, 403)

    def test_duplicate_accessory_line_is_rejected(self):
        response, _ = self.sale(lines=[self.line(qty=1), self.line(qty=2)], paid="7500")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)

    def test_client_ref_required_and_bad_imei_rejected(self):
        response, _ = self.sale(ref="not-a-uuid")
        self.assertEqual(response.status_code, 400)
        response, _ = self.sale(lines=[
            self.line(product=self.phone, qty=1, price="95000", imei="000000000000000"),
        ], paid="95000")
        self.assertEqual(response.status_code, 409)
