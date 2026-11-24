import base64
import json
import uuid

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from .models import Product, Sale, SalePayment, ShopBranding, ShopConfig


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

    def test_configured_heading_appears_on_all_old_and_new_invoices(self):
        # A sale registered before shop personalization must use the current header.
        before_config = self.create_sale()
        self.assertEqual(self.save_shop().status_code, 200)
        first = self.create_sale()
        second_shop = self.save_shop(self.shop_data(
            "Nouvelle Boutique", phone="74001122", address="Sikasso, Mali",
            footer="À bientôt !",
        ))
        self.assertTrue(second_shop.json()["updated"])
        second = self.create_sale()
        docs = [
            self.client.get(reverse("sale-invoice", args=[item["id"]])).json()
            for item in (before_config, first, second)
        ]
        current_id = second_shop.json()["shop"]["id"]
        for doc in docs:
            self.assertEqual(doc["shop"]["id"], current_id)
            self.assertEqual(doc["shop"]["name"], "Nouvelle Boutique")
            self.assertEqual(doc["shop"]["phone"], "74001122")
            self.assertEqual(doc["shop"]["address"], "Sikasso, Mali")
            self.assertEqual(doc["shop"]["footer"], "À bientôt !")
            self.assertNotIn("gross_profit", doc["sale"])
            self.assertNotIn("unit_cost", doc["sale"]["lines"][0])
        # Historical versions are retained internally, without freezing the printed header.
        self.assertEqual(ShopBranding.objects.count(), 3)
        self.assertEqual(ShopConfig.objects.get(pk=1).branding.name, "Nouvelle Boutique")
        original = Sale.objects.get(pk=first["id"])
        self.assertEqual(original.branding.name, "Boutique Seydou")
        self.assertEqual(docs[1]["sale"]["total"], first["total"])

    def test_existing_payment_receipts_use_current_configured_header(self):
        self.assertEqual(self.save_shop().status_code, 200)
        old_sale = self.create_sale(amount="1000", credit=True)
        initial_payment = SalePayment.objects.get(sale_id=old_sale["id"])
        changed_logo = "data:image/png;base64," + base64.b64encode(
            bytes([137, 80, 78, 71, 13, 10, 26, 10]) + b"new-logo"
        ).decode()
        changed = self.save_shop(self.shop_data(
            name="Boutique Nouvelle", logo_data=changed_logo, phone="71234567"
        ))
        self.assertEqual(changed.status_code, 200, changed.content)
        receipt = self.client.get(reverse("payment-receipt", args=[initial_payment.id]))
        self.assertEqual(receipt.status_code, 200)
        self.assertEqual(receipt.json()["shop"]["name"], "Boutique Nouvelle")
        self.assertEqual(receipt.json()["shop"]["phone"], "71234567")
        self.assertEqual(receipt.json()["shop"]["logo_data"], changed_logo)
        self.assertEqual(receipt.json()["payment"]["amount"], "1000.00")
        self.assertEqual(receipt.json()["sale"]["reference"], old_sale["reference"])


    def test_public_identity_displays_configured_brand_without_private_contact_data(self):
        data = self.shop_data(name="YaraPhone")
        self.assertEqual(self.save_shop(data).status_code, 200)
        guest = Client()
        response = guest.get(reverse("shop-identity"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"identity": {"name": "YaraPhone", "logo_data": ""}})
        for sensitive in ("phone", "email", "address", "tax_id", "footer"):
            self.assertNotIn(sensitive, response.content.decode())
        self.assertIn("no-cache", response.headers.get("Cache-Control", ""))
        self.assertEqual(guest.get(reverse("shop")).status_code, 401)
        manifest = guest.get(reverse("shop-manifest"))
        self.assertEqual(manifest.status_code, 200)
        self.assertTrue(manifest["Content-Type"].startswith("application/manifest+json"))
        self.assertEqual(manifest.json()["name"], "YaraPhone — Gestion de boutique")
        self.assertEqual(manifest.json()["short_name"], "YaraPhone")
        self.assertNotIn("74980744", manifest.content.decode())
        self.assertNotIn("boutique@example.com", manifest.content.decode())

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
