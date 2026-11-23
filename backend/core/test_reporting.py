import json
import uuid
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone

from .models import Expense, PhoneIdentifier, PhoneUnit, Product, Sale, SalePayment


class Phase07Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = get_user_model().objects.create_superuser(
            username="owner", email="owner@example.com", password="SafePassword+2026!"
        )
        cls.case = Product.objects.create(
            name="Pochette A17", category="other", purchase_price="1000",
            sale_price="2500", quantity=10, low_stock_threshold=3,
        )
        cls.phone = Product.objects.create(
            name="Téléphone", category="phone", brand="Samsung", model="A17",
            purchase_price="85000", sale_price="95000", low_stock_threshold=1,
        )
        cls.phone_unit = PhoneUnit.objects.create(product=cls.phone)
        PhoneIdentifier.objects.create(
            unit=cls.phone_unit, slot=1, imei="490154203237518",
        )

    def setUp(self):
        self.client.force_login(self.owner)

    def sale(self, paid="5000", *, quantity=2, due_date=None):
        payload = {
            "client_ref": str(uuid.uuid4()), "amount_paid": paid,
            "method": "cash",
            "customer_name": "Awa" if Decimal(paid) < Decimal(2500 * quantity) else "",
            "customer_phone": "75000000" if Decimal(paid) < Decimal(2500 * quantity) else "",
            "due_date": due_date,
            "lines": [{
                "product_id": str(self.case.pk), "quantity": quantity,
                "unit_price": "2500", "imei": "",
            }],
        }
        response = self.client.post(reverse("sales"), json.dumps(payload),
                                    content_type="application/json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["sale"]

    def spend(self, *, amount="1200", label="Transport", key=None, day=None, note="Taxi"):
        payload = {
            "client_ref": key or str(uuid.uuid4()),
            "label": label, "amount": amount,
            "spent_on": day or timezone.localdate().isoformat(), "note": note,
        }
        response = self.client.post(reverse("expenses"), json.dumps(payload),
                                    content_type="application/json")
        return response, payload

    def test_period_reports_keep_revenue_and_cash_separate(self):
        self.sale()
        result, _ = self.spend()
        self.assertEqual(result.status_code, 201, result.content)
        report = self.client.get(reverse("reports") + "?period=today").json()
        expected = {
            "sales_count": 1, "revenue": "5000.00",
            "purchase_cost_of_sold_items": "2000.00",
            "gross_profit": "3000.00", "expenses": "1200.00",
            "operating_result": "1800.00", "collected": "5000.00",
            "receivable_from_period_sales": "0.00",
        }
        self.assertEqual(report["summary"], expected)
        self.assertEqual(report["products"][0]["quantity"], 2)
        self.assertEqual(report["products"][0]["gross_profit"], "3000.00")
        self.assertEqual(report["daily"][0]["revenue"], "5000.00")

    def test_credit_repayment_is_cash_collected_not_a_second_sale(self):
        old = self.sale(paid="1000")
        sale_id = old["id"]
        Sale.objects.filter(pk=sale_id).update(
            created_at=timezone.now() - timedelta(days=5)
        )
        SalePayment.objects.filter(sale_id=sale_id).update(
            created_at=timezone.now() - timedelta(days=5)
        )
        response = self.client.post(
            reverse("debt-collect", args=[sale_id]),
            json.dumps({"client_ref": str(uuid.uuid4()), "amount": "1500", "method": "orange"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 201)
        summary = self.client.get(reverse("reports") + "?period=today").json()["summary"]
        self.assertEqual(summary["revenue"], "0.00")
        self.assertEqual(summary["gross_profit"], "0.00")
        self.assertEqual(summary["collected"], "1500.00")

    def test_custom_range_excludes_older_sales_and_expenses(self):
        self.sale()
        past = (timezone.localdate() - timedelta(days=15)).isoformat()
        first, _ = self.spend(day=past, amount="300")
        self.assertEqual(first.status_code, 201)
        today = timezone.localdate().isoformat()
        response = self.client.get(reverse("reports") + f"?period=custom&start={today}&end={today}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"]["expenses"], "0.00")
        self.assertEqual(response.json()["summary"]["revenue"], "5000.00")
        older = self.client.get(reverse("expenses") + "?period=month").json()
        self.assertEqual(older["period"], "month")

    def test_expenses_are_idempotent_and_validate_input(self):
        key = str(uuid.uuid4())
        one, payload = self.spend(key=key)
        two, _ = self.spend(key=key)
        self.assertEqual(one.status_code, 201, one.content)
        self.assertEqual(two.status_code, 200)
        self.assertTrue(two.json()["replayed"])
        self.assertEqual(Expense.objects.count(), 1)
        altered, _ = self.spend(key=key, amount="5000")
        self.assertEqual(altered.status_code, 409)
        bad, _ = self.spend(amount="-500")
        self.assertEqual(bad.status_code, 400)
        empty, _ = self.spend(label="")
        self.assertEqual(empty.status_code, 400)
        result = self.client.get(reverse("expenses") + "?period=today").json()
        self.assertEqual(result["total"], "1200.00")
        self.assertEqual(len(result["results"]), 1)
        self.assertEqual(self.client.patch(reverse("expenses")).status_code, 405)

    def test_period_validation_and_permission_enforcement(self):
        for url in ("?period=wrong",
                    "?period=custom&start=2026-01-02&end=2026-01-01",
                    "?period=custom&start=invalid&end=2026-01-01"):
            self.assertEqual(self.client.get(reverse("reports") + url).status_code, 400)
        unauthenticated = Client()
        for endpoint in ("reports", "expenses", "notifications"):
            self.assertEqual(unauthenticated.get(reverse(endpoint)).status_code, 401)
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.owner)
        body = json.dumps({
            "client_ref": str(uuid.uuid4()),
            "label": "Frais", "amount": "100", "spent_on": timezone.localdate().isoformat(),
            "note": "",
        })
        self.assertEqual(csrf_client.post(reverse("expenses"), body, content_type="application/json").status_code, 403)

    def test_alerts_include_low_stock_phones_and_overdue_debts(self):
        date = (timezone.localdate() - timedelta(days=2)).isoformat()
        self.sale(paid="1000", due_date=date)
        result = self.client.get(reverse("notifications"))
        self.assertEqual(result.status_code, 200)
        data = result.json()
        self.assertEqual(data["mode"], "consultation")
        kinds = {(n["kind"], n["title"]) for n in data["results"]}
        self.assertIn(("stock", "Stock faible"), kinds)
        self.assertIn(("debt", "Créance en retard"), kinds)
        self.assertEqual(data["count"], len(data["results"]))
