import json
import uuid

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from .models import PhoneIdentifier, Product, PurchaseReceipt, StockMovement


def valid_imei(prefix):
    digits = [int(c) for c in prefix]
    total = 0
    for index, digit in enumerate(digits):
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return prefix + str((-total) % 10)


class PurchaseTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = get_user_model().objects.create_superuser(
            username="owner", email="owner@example.com", password="StrongOwnerPass+2026"
        )
        cls.case = Product.objects.create(
            name="Pochette A17", category="other",
            purchase_price="1000", sale_price="2500", quantity=10,
        )
        cls.phone = Product.objects.create(
            name="Téléphone", brand="Samsung", model="Galaxy A17",
            category="phone", purchase_price="70000", sale_price="90000",
        )

    def setUp(self):
        self.client.force_login(self.owner)

    def post(self, lines, ref=None, supplier=None, client=None):
        payload = {
            "client_ref": ref or str(uuid.uuid4()),
            "supplier": supplier or {"name": "Fournisseur Central", "phone": "70000000"},
            "lines": lines,
        }
        return (client or self.client).post(
            reverse("purchases"), json.dumps(payload), content_type="application/json"
        ), payload

    def test_purchase_increases_stock_and_creates_supplier_history(self):
        response, payload = self.post([
            {"product_id": str(self.case.pk), "quantity": 7, "unit_cost": "1400", "phones": []}
        ])
        self.assertEqual(response.status_code, 201, response.content)
        self.case.refresh_from_db()
        self.assertEqual(self.case.quantity, 17)
        self.assertEqual(self.case.purchase_price, 1400)
        self.assertEqual(response.json()["receipt"]["total"], "9800.00")
        self.assertEqual(PurchaseReceipt.objects.count(), 1)
        self.assertEqual(StockMovement.objects.get().reason, "purchase")
        self.assertEqual(len(self.client.get(reverse("suppliers")).json()["results"]), 1)
        self.assertEqual(len(self.client.get(reverse("purchases")).json()["results"]), 1)

    def test_same_client_ref_is_idempotent_and_different_payload_rejected(self):
        ref = str(uuid.uuid4())
        lines = [{"product_id": str(self.case.pk), "quantity": 5, "unit_cost": "1100", "phones": []}]
        first, payload = self.post(lines, ref=ref)
        second, _ = self.post(lines, ref=ref)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()["replayed"])
        self.case.refresh_from_db()
        self.assertEqual(self.case.quantity, 15)
        third, _ = self.post([{"product_id": str(self.case.pk), "quantity": 2, "unit_cost": "1100", "phones": []}], ref=ref)
        self.assertEqual(third.status_code, 409)

    def test_multi_line_receipt_with_phone_imei(self):
        imei = valid_imei("49015420323751")
        result, _ = self.post([
            {"product_id": str(self.case.pk), "quantity": 4, "unit_cost": "1000", "phones": []},
            {"product_id": str(self.phone.pk), "quantity": 1, "unit_cost": "72000", "phones": [{"imei": imei}]},
        ])
        self.assertEqual(result.status_code, 201, result.content)
        self.assertEqual(result.json()["receipt"]["total"], "76000.00")
        self.assertEqual(PhoneIdentifier.objects.count(), 1)
        self.assertEqual(self.phone.phone_units.count(), 1)
        self.case.refresh_from_db()
        self.assertEqual(self.case.quantity, 14)
        self.assertEqual(StockMovement.objects.count(), 2)

    def test_invalid_phone_imei_rolls_back_entire_purchase(self):
        response, _ = self.post([
            {"product_id": str(self.case.pk), "quantity": 4, "unit_cost": "1000", "phones": []},
            {"product_id": str(self.phone.pk), "quantity": 1, "unit_cost": "72000", "phones": []},
        ])
        self.assertEqual(response.status_code, 400)
        self.case.refresh_from_db()
        self.assertEqual(self.case.quantity, 10)
        self.assertEqual(PurchaseReceipt.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_rejects_duplicate_line_and_negative_quantity(self):
        line = {"product_id": str(self.case.pk), "quantity": 1, "unit_cost": "100", "phones": []}
        response, _ = self.post([line, line])
        self.assertEqual(response.status_code, 400)
        response, _ = self.post([{**line, "quantity": -1}])
        self.assertEqual(response.status_code, 400)

    def test_owner_and_csrf_required(self):
        guest = Client()
        self.assertEqual(guest.get(reverse("purchases")).status_code, 401)
        response, _ = self.post([
            {"product_id": str(self.case.pk), "quantity": 1, "unit_cost": "100", "phones": []}
        ], client=guest)
        self.assertEqual(response.status_code, 401)
        csrf_browser = Client(enforce_csrf_checks=True)
        csrf_browser.force_login(self.owner)
        response, _ = self.post([
            {"product_id": str(self.case.pk), "quantity": 1, "unit_cost": "100", "phones": []}
        ], client=csrf_browser)
        self.assertEqual(response.status_code, 403)
