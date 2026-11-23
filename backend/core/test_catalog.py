import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from .models import PhoneIdentifier, PhoneUnit, Product, StockMovement


def valid_imei(prefix):
    digits = [int(n) for n in prefix]
    total = 0
    for i, digit in enumerate(digits[::-1], start=1):
        if i % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return prefix + str((-total) % 10)


class CatalogTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = get_user_model().objects.create_superuser(
            username="owner", email="owner@example.com", password="StrongOwnerPass+2026",
        )
        cls.other = get_user_model().objects.create_user(
            username="other", password="OtherStrongPass+2026",
        )

    def setUp(self):
        self.client.force_login(self.owner)

    def post_json(self, url, data, client=None):
        return (client or self.client).post(
            url, json.dumps(data), content_type="application/json"
        )

    def create_case(self, **kwargs):
        data = {
            "name": "Pochette Samsung A15", "category": "case",
            "purchase_price": "1200", "sale_price": "2500",
            "quantity": 15, "low_stock_threshold": 3,
        }
        data.update(kwargs)
        return self.post_json(reverse("products"), data)

    def create_phone(self, phones=None):
        return self.post_json(reverse("products"), {
            "name": "Samsung Galaxy A15", "category": "phone",
            "brand": "Samsung", "model": "A15", "purchase_price": "55000",
            "sale_price": "75000", "quantity": 0, "phones": phones or [],
        })

    def test_authentication_is_required_for_catalog(self):
        guest = Client()
        self.assertEqual(guest.get(reverse("products")).status_code, 401)
        self.assertEqual(self.post_json(reverse("products"), {"name": "X"}, guest).status_code, 401)
        guest.force_login(self.other)
        self.assertEqual(guest.get(reverse("products")).status_code, 401)

    def test_case_creation_sets_initial_stock_and_history(self):
        response = self.create_case()
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["product"]["quantity"], 15)
        self.assertEqual(StockMovement.objects.get().delta, 15)
        self.assertEqual(self.client.get(reverse("products")).json()["results"][0]["name"], "Pochette Samsung A15")

    def test_negative_or_invalid_stock_and_price_are_rejected(self):
        self.assertEqual(self.create_case(quantity=-1).status_code, 400)
        self.assertEqual(self.create_case(sale_price="-3").status_code, 400)
        self.assertEqual(self.create_case(sale_price="1.234").status_code, 400)

    def test_phone_imei_uniqueness_and_inventory(self):
        first = valid_imei("49015420323751")
        second = valid_imei("49015420323752")
        response = self.create_phone([{"imei": first, "imei2": second}])
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["product"]["quantity"], 1)
        self.assertEqual(PhoneUnit.objects.count(), 1)
        self.assertEqual(PhoneIdentifier.objects.count(), 2)
        product_id = response.json()["product"]["id"]
        duplicate = self.post_json(reverse("product-imeis", args=[product_id]), {"phones": [{"imei": second}]})
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(PhoneUnit.objects.count(), 1)

    def test_invalid_imei_and_duplicate_on_create_rollback(self):
        first = valid_imei("49015420323751")
        self.assertEqual(self.create_phone([{"imei": "123456789012345"}]).status_code, 400)
        self.assertEqual(self.create_phone([{"imei": first}, {"imei": first}]).status_code, 400)
        self.assertEqual(Product.objects.count(), 0)

    def test_phone_requires_distinct_model_field(self):
        response = self.post_json(reverse("products"), {
            "name": "Samsung", "category": "phone",
            "purchase_price": "85000", "sale_price": "95000",
            "model": "", "quantity": 0,
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Product.objects.count(), 0)

    def test_add_phones_scanner_batch(self):
        response = self.create_phone()
        product_id = response.json()["product"]["id"]
        first = valid_imei("49015420323751")
        added = self.post_json(reverse("product-imeis", args=[product_id]), {"phones": [{"imei": first}]})
        self.assertEqual(added.status_code, 200)
        self.assertEqual(added.json()["product"]["quantity"], 1)
        found = self.client.get(reverse("products") + "?q=" + first)
        self.assertEqual(len(found.json()["results"]), 1)

    def test_manual_stock_adjustments_are_recorded_and_cannot_overdraw(self):
        response = self.create_case()
        product_id = response.json()["product"]["id"]
        url = reverse("product-stock", args=[product_id])
        self.assertEqual(self.post_json(url, {"delta": -16, "reason": "Inventaire"}).status_code, 400)
        self.assertEqual(self.post_json(url, {"delta": -4, "reason": "Contrôle d'inventaire"}).status_code, 200)
        self.assertEqual(Product.objects.get(pk=product_id).quantity, 11)
        self.assertEqual(StockMovement.objects.count(), 2)

    def test_phones_cannot_adjust_quantity_without_imeis(self):
        response = self.create_phone()
        url = reverse("product-stock", args=[response.json()["product"]["id"]])
        self.assertEqual(self.post_json(url, {"delta": 2, "reason": "test"}).status_code, 400)

    def test_csrf_is_enforced_on_write(self):
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.owner)
        response = self.post_json(reverse("products"), {
            "name": "Pochette", "category": "case",
            "purchase_price": "100", "sale_price": "300", "quantity": 1,
        }, browser)
        self.assertEqual(response.status_code, 403)
