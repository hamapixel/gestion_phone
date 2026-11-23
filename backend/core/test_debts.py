import json
import uuid
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone

from .models import Product, Sale, SalePayment


class DebtTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = get_user_model().objects.create_superuser(
            username="owner", email="owner@example.com", password="VeryStrong+Owner123"
        )
        cls.product = Product.objects.create(
            name="Pochette", category="other", purchase_price="1000",
            sale_price="4000", quantity=9
        )

    def setUp(self):
        self.client.force_login(self.owner)

    def credit(self, *, paid="1000", due_date=None, name="Awa", phone="75000000"):
        return self.client.post(reverse("sales"), json.dumps({
            "client_ref": str(uuid.uuid4()),
            "lines": [{"product_id": str(self.product.id), "quantity": 1, "unit_price": "4000", "imei": ""}],
            "amount_paid": paid, "method": "cash", "customer_name": name,
            "customer_phone": phone, "due_date": due_date,
        }), content_type="application/json")

    def collect(self, sale_id, amount, ref=None, method="orange", client=None):
        return (client or self.client).post(
            reverse("debt-collect", args=[sale_id]),
            json.dumps({"client_ref": ref or str(uuid.uuid4()), "amount": amount, "method": method}),
            content_type="application/json",
        )

    def test_lists_existing_credit_and_overdue(self):
        due_date = (timezone.localdate() - timedelta(days=2)).isoformat()
        response = self.credit(due_date=due_date)
        self.assertEqual(response.status_code, 201)
        listing = self.client.get(reverse("debts")).json()
        self.assertEqual(len(listing["results"]), 1)
        self.assertEqual(listing["summary"]["outstanding"], "3000.00")
        self.assertTrue(listing["results"][0]["overdue"])
        self.assertEqual(listing["results"][0]["payments"][0]["amount"], "1000.00")
        late = self.client.get(reverse("debts") + "?status=overdue").json()
        self.assertEqual(len(late["results"]), 1)

    def test_partial_then_full_collection_does_not_add_sales_revenue(self):
        created = self.credit()
        sale_id = created.json()["sale"]["id"]
        before = self.client.get(reverse("sales")).json()["today"]["total"]
        p1 = self.collect(sale_id, "1200")
        self.assertEqual(p1.status_code, 201, p1.content)
        self.assertEqual(p1.json()["debt"]["balance"], "1800.00")
        p2 = self.collect(sale_id, "1800", method="cash")
        self.assertEqual(p2.status_code, 201, p2.content)
        self.assertEqual(p2.json()["debt"]["balance"], "0.00")
        self.assertEqual(p2.json()["debt"]["status"], "paid")
        self.assertEqual(Sale.objects.get(pk=sale_id).amount_paid, Decimal("4000"))
        self.assertEqual(SalePayment.objects.filter(sale_id=sale_id).count(), 3)
        self.assertEqual(self.client.get(reverse("sales")).json()["today"]["total"], before)
        self.assertEqual(len(self.client.get(reverse("debts") + "?status=paid").json()["results"]), 1)
        self.assertEqual(len(self.client.get(reverse("debts")).json()["results"]), 0)

    def test_cannot_overpay_or_pay_zero(self):
        sale_id = self.credit().json()["sale"]["id"]
        self.assertEqual(self.collect(sale_id, "3200").status_code, 409)
        self.assertEqual(self.collect(sale_id, "0").status_code, 400)
        self.assertEqual(SalePayment.objects.filter(sale_id=sale_id).count(), 1)

    def test_retries_are_idempotent_even_after_full_payment(self):
        sale_id = self.credit().json()["sale"]["id"]
        key = str(uuid.uuid4())
        first = self.collect(sale_id, "3000", ref=key)
        again = self.collect(sale_id, "3000", ref=key)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(again.status_code, 200)
        self.assertTrue(again.json()["replayed"])
        self.assertEqual(SalePayment.objects.filter(sale_id=sale_id).count(), 2)
        self.assertEqual(self.collect(sale_id, "2000", ref=key).status_code, 409)

    def test_auth_and_csrf_required(self):
        sale_id = self.credit().json()["sale"]["id"]
        guest = Client()
        self.assertEqual(guest.get(reverse("debts")).status_code, 401)
        self.assertEqual(self.collect(sale_id, "500", client=guest).status_code, 401)
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.owner)
        self.assertEqual(self.collect(sale_id, "500", client=browser).status_code, 403)
