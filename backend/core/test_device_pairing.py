"""Phase 09C pairing: owner permission, TLS, CSRF, brute-force limits, replay and revoke."""
import json
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import DesktopPairingCode, TrustedDesktop


@override_settings(DEBUG=True)
class DesktopPairingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.owner = User.objects.create_superuser(
            username="owner-pc", email="owner-pc@example.com", password="StrongOwnerPass+2026")
        cls.other = User.objects.create_user(
            username="not-owner", email="regular@example.com", password="StrongNormalPass+2026")

    def setUp(self):
        self.client.force_login(self.owner)
        self.host = {"HTTP_HOST": "127.0.0.1:8031"}
        self.device = str(uuid.uuid4())

    def issue(self, client=None):
        return (client or self.client).post(reverse("device-pairing-new"), **self.host)

    def redeem(self, code, device_ref=None, label="Windows caisse", client=None):
        return (client or Client()).post(
            reverse("device-pairing-redeem"),
            data=json.dumps({"pairing_code": code, "device_ref": device_ref or self.device, "label": label}),
            content_type="application/json", **self.host)

    def test_issue_requires_owner_and_never_persists_code(self):
        guest = Client()
        self.assertEqual(self.issue(guest).status_code, 401)
        guest.force_login(self.other)
        self.assertEqual(self.issue(guest).status_code, 401)
        response = self.issue()
        self.assertEqual(response.status_code, 201, response.content)
        code = response.json()["pairing_code"]
        self.assertEqual(len(code), 12)
        self.assertTrue(code.isdigit())
        self.assertEqual(response.json()["expires_in_seconds"], 300)
        entry = DesktopPairingCode.objects.get()
        self.assertNotEqual(entry.digest, code)
        self.assertNotIn(code, str(entry.__dict__))
        self.assertIn("no-cache", response.headers.get("Cache-Control", ""))

    def test_web_session_csrf_is_required_to_generate_pairing_code(self):
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.owner)
        self.assertEqual(self.issue(browser).status_code, 403)

    def test_exchange_is_one_time_token_only_and_revocable(self):
        code = self.issue().json()["pairing_code"]
        # An anonymous native Windows process can redeem a code without cookies.
        response = self.redeem(code)
        self.assertEqual(response.status_code, 201, response.content)
        token = response.json()["token"]
        self.assertGreater(len(token), 40)
        self.assertEqual(response.json()["scope"], "device-session-only")
        self.assertNotIn(token, repr(TrustedDesktop.objects.get().__dict__))
        self.assertNotEqual(TrustedDesktop.objects.get().token_digest, token)
        header = {"HTTP_AUTHORIZATION": "Bearer " + token, **self.host}
        status = Client().get(reverse("device-session"), **header)
        self.assertEqual(status.status_code, 200, status.content)
        self.assertTrue(status.json()["authorized"])
        self.assertEqual(status.json()["device_ref"], self.device)
        self.assertEqual(self.redeem(code).status_code, 401)
        self.assertEqual(TrustedDesktop.objects.count(), 1)
        self.assertEqual(self.client.get(reverse("device-list")).json()["results"][0]["label"], "Windows caisse")
        response = self.client.post(reverse("device-revoke"),
            json.dumps({"device_ref": self.device}), content_type="application/json")
        self.assertTrue(response.json()["revoked"])
        self.assertEqual(Client().get(reverse("device-session"), **header).status_code, 401)
        self.assertEqual(self.client.post(reverse("device-revoke"),
            json.dumps({"device_ref": self.device}), content_type="application/json").json()["revoked"], False)

    def test_repeat_pairing_rotates_token_and_invalidates_old_one(self):
        first = self.redeem(self.issue().json()["pairing_code"]).json()["token"]
        second = self.redeem(self.issue().json()["pairing_code"]).json()["token"]
        self.assertNotEqual(first, second)
        self.assertEqual(TrustedDesktop.objects.count(), 1)
        self.assertEqual(Client().get(reverse("device-session"),
            HTTP_AUTHORIZATION="Bearer "+first, **self.host).status_code, 401)
        self.assertEqual(Client().get(reverse("device-session"),
            HTTP_AUTHORIZATION="Bearer "+second, **self.host).status_code, 200)

    def test_expired_code_device_and_user_are_rejected(self):
        code = self.issue().json()["pairing_code"]
        DesktopPairingCode.objects.update(expires_at=timezone.now()-timedelta(seconds=1))
        self.assertEqual(self.redeem(code).status_code, 401)
        code = self.issue().json()["pairing_code"]
        token = self.redeem(code).json()["token"]
        TrustedDesktop.objects.update(expires_at=timezone.now()-timedelta(seconds=1))
        self.assertEqual(Client().get(reverse("device-session"), **self.host,
            HTTP_AUTHORIZATION="Bearer "+token).status_code, 401)
        TrustedDesktop.objects.update(expires_at=timezone.now()+timedelta(days=1))
        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])
        self.assertEqual(Client().get(reverse("device-session"), **self.host,
            HTTP_AUTHORIZATION="Bearer "+token).status_code, 401)

    def test_invalid_codes_are_throttled(self):
        code = self.issue().json()["pairing_code"]
        for _ in range(5):
            self.assertEqual(self.redeem("000000000000").status_code, 401)
        self.assertEqual(self.redeem(code).status_code, 429)
        self.assertEqual(TrustedDesktop.objects.count(), 0)

    def test_non_owner_cannot_list_or_revoke(self):
        guest = Client()
        self.assertEqual(guest.get(reverse("device-list")).status_code, 401)
        self.assertEqual(guest.post(reverse("device-revoke"),
            json.dumps({"device_ref": self.device}),
            content_type="application/json").status_code, 401)
        guest.force_login(self.other)
        self.assertEqual(guest.get(reverse("device-list")).status_code, 401)

    @override_settings(DEBUG=False)
    def test_plain_http_is_rejected_outside_debug(self):
        self.assertEqual(self.issue().status_code, 403)
        self.assertEqual(self.redeem("123456789012").status_code, 403)
        self.assertEqual(Client().get(reverse("device-session"), **self.host).status_code, 403)

    def test_earlier_code_revoked_when_new_pairing_requested(self):
        first = self.issue().json()["pairing_code"]
        second = self.issue().json()["pairing_code"]
        self.assertNotEqual(first, second)
        self.assertEqual(self.redeem(first).status_code, 401)
        self.assertEqual(self.redeem(second).status_code, 201)
