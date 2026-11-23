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

    def test_phone_brand_and_condition_are_saved(self):
        response = self.post_json(reverse("products"), {
            "name": "Téléphone", "category": "phone", "brand": "Samsung",
            "model": "Galaxy A17", "condition": "used",
            "purchase_price": "85000", "sale_price": "95000", "quantity": 0,
        })
        self.assertEqual(response.status_code, 201, response.content)
        created = response.json()["product"]
        self.assertEqual(created["brand"], "Samsung")
        self.assertEqual(created["model"], "Galaxy A17")
        self.assertEqual(created["condition"], "used")
        self.assertEqual(created["quantity"], 0)

    def test_phone_brand_and_condition_are_checked(self):
        data = {
            "name": "Téléphone", "category": "phone",
            "model": "Galaxy A17", "condition": "new",
            "purchase_price": "85000", "sale_price": "95000", "quantity": 0,
        }
        self.assertEqual(self.post_json(reverse("products"), data).status_code, 400)
        data["brand"] = "Samsung"
        data["condition"] = "unknown"
        self.assertEqual(self.post_json(reverse("products"), data).status_code, 400)
        self.assertEqual(Product.objects.count(), 0)

    def test_incomplete_imei_is_rejected_without_partial_creation(self):
        response = self.create_phone([{"imei": "96366666455456"}])
        self.assertEqual(response.status_code, 400)
        self.assertIn("15 chiffres", response.json()["detail"])
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

    def test_detail_shows_phone_imeis_and_stock_history(self):
        imei = valid_imei("49015420323751")
        response = self.create_phone([{"imei": imei}])
        self.assertEqual(response.status_code, 201)
        pk = response.json()["product"]["id"]
        detail = self.client.get(reverse("product-detail", args=[pk]))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["phones"][0]["imeis"][0]["imei"], imei)
        self.assertEqual(detail.json()["product"]["quantity"], 1)
        self.assertEqual(detail.json()["movements"][0]["delta"], 1)

    def test_edit_price_and_name_keep_stock_and_audit_change(self):
        response = self.create_case()
        pk = response.json()["product"]["id"]
        edit = self.client.patch(
            reverse("product-detail", args=[pk]),
            json.dumps({"name": "Coque A15", "purchase_price": "1400", "sale_price": "3100"}),
            content_type="application/json",
        )
        self.assertEqual(edit.status_code, 200, edit.content)
        self.assertTrue(edit.json()["updated"])
        self.assertEqual(edit.json()["product"]["quantity"], 15)
        detail = self.client.get(reverse("product-detail", args=[pk])).json()
        self.assertEqual(detail["product"]["name"], "Coque A15")
        self.assertEqual(len(detail["changes"]), 1)
        self.assertEqual(detail["changes"][0]["changes"]["sale_price"]["avant"], "2500.00")
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_edit_rejects_direct_stock_or_category_changes(self):
        response = self.create_case()
        pk = response.json()["product"]["id"]
        url = reverse("product-detail", args=[pk])
        for data in ({"quantity": 999}, {"category": "phone"}, {"imei": "12345"}):
            denied = self.client.patch(url, json.dumps(data), content_type="application/json")
            self.assertEqual(denied.status_code, 400)
        self.assertEqual(Product.objects.get(pk=pk).quantity, 15)

    def test_edit_phone_requires_brand_model_and_checks_prices(self):
        response = self.create_phone()
        pk = response.json()["product"]["id"]
        url = reverse("product-detail", args=[pk])
        for data in (
            {"brand": ""}, {"model": ""}, {"sale_price": "-10"},
            {"condition": "bad"}, {"low_stock_threshold": 99999},
        ):
            denied = self.client.patch(url, json.dumps(data), content_type="application/json")
            self.assertEqual(denied.status_code, 400)
        accepted = self.client.patch(
            url, json.dumps({"brand": "Samsung", "model": "Galaxy A15", "condition": "used"}),
            content_type="application/json",
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["product"]["condition"], "used")

    def test_anonymous_cannot_read_or_edit_product_detail(self):
        response = self.create_case()
        pk = response.json()["product"]["id"]
        guest = Client()
        url = reverse("product-detail", args=[pk])
        self.assertEqual(guest.get(url).status_code, 401)
        self.assertEqual(guest.patch(url, json.dumps({"name": "Hacked"}), content_type="application/json").status_code, 401)

    def test_csrf_is_enforced_on_write(self):
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.owner)
        response = self.post_json(reverse("products"), {
            "name": "Pochette", "category": "case",
            "purchase_price": "100", "sale_price": "300", "quantity": 1,
        }, browser)
        self.assertEqual(response.status_code, 403)
