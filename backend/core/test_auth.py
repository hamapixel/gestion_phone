import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from .models import LoginThrottle


class OwnerAuthenticationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = get_user_model().objects.create_superuser(
            username="74980744", email="owner@example.com", password="StrongOwnerPass+2026"
        )
        cls.normal = get_user_model().objects.create_user(
            username="seller", email="seller@example.com", password="StrongSellerPass+2026"
        )

    def payload(self, identifier="74980744", password="StrongOwnerPass+2026"):
        return json.dumps({"identifier": identifier, "password": password})

    def test_anonymous_session_does_not_expose_owner(self):
        response = self.client.get(reverse("auth-session"))
        self.assertEqual(response.json(), {"authenticated": False})

    def test_owner_sign_in_with_phone_and_logout(self):
        response = self.client.post(reverse("auth-login"), self.payload(), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["authenticated"])
        self.assertNotIn("password", response.content.decode().lower())
        self.assertTrue(self.client.get(reverse("auth-session")).json()["authenticated"])
        self.assertEqual(self.client.post(reverse("auth-logout")).status_code, 200)
        self.assertFalse(self.client.get(reverse("auth-session")).json()["authenticated"])

    def test_email_login_case_insensitive(self):
        response = self.client.post(
            reverse("auth-login"), self.payload(identifier="OWNER@EXAMPLE.COM"), content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)

    def test_non_owner_is_rejected(self):
        response = self.client.post(
            reverse("auth-login"),
            self.payload("seller", "StrongSellerPass+2026"),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_failed_logins_are_persistently_throttled(self):
        for _ in range(5):
            response = self.client.post(
                reverse("auth-login"), self.payload(password="wrong"), content_type="application/json"
            )
            self.assertEqual(response.status_code, 401)
        self.assertEqual(LoginThrottle.objects.count(), 2)
        response = self.client.post(reverse("auth-login"), self.payload(), content_type="application/json")
        self.assertEqual(response.status_code, 429)

    def test_csrf_is_required_for_login_and_logout(self):
        browser = Client(enforce_csrf_checks=True)
        self.assertEqual(browser.post(reverse("auth-login"), self.payload(), content_type="application/json").status_code, 403)
        cookie_response = browser.get(reverse("auth-csrf"))
        self.assertIn("csrftoken", cookie_response.cookies)
        token = cookie_response.cookies["csrftoken"].value
        authenticated = browser.post(
            reverse("auth-login"), self.payload(),
            content_type="application/json", HTTP_X_CSRFTOKEN=token
        )
        self.assertEqual(authenticated.status_code, 200)
        self.assertEqual(browser.post(reverse("auth-logout")).status_code, 403)
        self.assertEqual(browser.post(reverse("auth-logout"), HTTP_X_CSRFTOKEN=browser.cookies["csrftoken"].value).status_code, 200)
