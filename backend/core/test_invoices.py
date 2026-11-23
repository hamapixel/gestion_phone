import base64
import json
import uuid

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from .models import Product, Sale, ShopBranding, ShopConfig


class InvoiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = get_user_model().objects.create_superuser(
            username="owner", password="VeryStrong+Owner123", email="owner@example.com"
        )
        cls.product = Product.objects.create(
            name="Pochette", category="other", purchase_price="1000",
            sale_price="4000", quantity=20
        )

    def setUp(self):
        self.client.force_login(self.owner)

    def shop_data(self, name="Boutique Seydou", **changes):
        data = {
            "name": name, "phone": "74980744", "address": "Bamako, Mali",
            "email": "boutique@example.com", "tax_id": "NIF-001",
            "footer": "Merci pour votre confiance.", "logo_data": "",
        }
        data.update(changes)
        return data

    def save_shop(self, data=None, client=None):
        return (client or self.client).put(
            reverse("shop"), json.dumps(data or self.shop_data()), content_type="application/json"
        )

    def create_sale(self, amount="4000", credit=False):
        response = self.client.post(reverse("sales"), json.dumps({
            "client_ref": str(uuid.uuid4()), "lines": [{
                "product_id": str(self.product.pk), "quantity": 1,
                "unit_price": "4000", "imei": "",
            }],
            "amount_paid": amount, "method": "cash",
            "customer_name": "Awa" if credit else "",
            "customer_phone": "75000000" if credit else "",
        }), content_type="application/json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["sale"]

    def test_shop_heading_updates_and_sales_keep_original_version(self):
        self.assertEqual(self.save_shop().status_code, 200)
        first = self.create_sale()
        second_shop = self.save_shop(self.shop_data("Nouvelle Boutique"))
        self.assertTrue(second_shop.json()["updated"])
        second = self.create_sale()
        old_doc = self.client.get(reverse("sale-invoice", args=[first["id"]])).json()
        new_doc = self.client.get(reverse("sale-invoice", args=[second["id"]])).json()
        self.assertEqual(old_doc["shop"]["name"], "Boutique Seydou")
        self.assertEqual(new_doc["shop"]["name"], "Nouvelle Boutique")
        self.assertNotEqual(old_doc["shop"]["id"], new_doc["shop"]["id"])
        self.assertEqual(ShopBranding.objects.count(), 3)  # default + 2 versions
        self.assertEqual(ShopConfig.objects.get(pk=1).branding.name, "Nouvelle Boutique")
        self.assertNotIn("gross_profit", old_doc["sale"])
        self.assertNotIn("unit_cost", old_doc["sale"]["lines"][0])

    def test_same_shop_information_does_not_create_version(self):
        response = self.save_shop(self.shop_data())
        self.assertTrue(response.json()["updated"])
        second = self.save_shop(self.shop_data())
        self.assertFalse(second.json()["updated"])
        self.assertEqual(ShopBranding.objects.count(), 2)

    def test_logo_raster_validation_and_unsafe_svg_rejected(self):
        png = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\nxyz").decode()
        self.assertEqual(self.save_shop(self.shop_data(logo_data=png)).status_code, 200)
        svg = "data:image/svg+xml;base64," + base64.b64encode(b"<svg></svg>").decode()
        self.assertEqual(self.save_shop(self.shop_data(logo_data=svg)).status_code, 400)
        fake = "data:image/png;base64," + base64.b64encode(b"<script>x</script>").decode()
        self.assertEqual(self.save_shop(self.shop_data(logo_data=fake)).status_code, 400)

    def test_debt_payment_receipt_amount_and_historical_balance(self):
        credit = self.create_sale(amount="1000", credit=True)
        from django.urls import reverse
        paid = self.client.post(reverse("debt-collect", args=[credit["id"]]), json.dumps({
            "client_ref": str(uuid.uuid4()), "amount": "1200", "method": "orange",
        }), content_type="application/json")
        self.assertEqual(paid.status_code, 201, paid.content)
        receipt = self.client.get(reverse("payment-receipt", args=[paid.json()["payment"]["id"]]))
        self.assertEqual(receipt.status_code, 200)
        doc = receipt.json()
        self.assertEqual(doc["payment"]["amount"], "1200.00")
        self.assertEqual(doc["payment"]["balance_after"], "1800.00")
        self.assertEqual(doc["sale"]["customer_name"], "Awa")
        self.assertEqual(doc["kind"], "payment")

    def test_owner_and_csrf_required_for_shop_and_invoices(self):
        sale = self.create_sale()
        guest = Client()
        self.assertEqual(guest.get(reverse("shop")).status_code, 401)
        self.assertEqual(guest.get(reverse("sale-invoice", args=[sale["id"]])).status_code, 401)
        csrf_browser = Client(enforce_csrf_checks=True)
        csrf_browser.force_login(self.owner)
        self.assertEqual(self.save_shop(client=csrf_browser).status_code, 403)
