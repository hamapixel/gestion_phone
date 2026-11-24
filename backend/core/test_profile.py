import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse


class OwnerProfileTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.owner = User.objects.create_superuser(
            username="owner-test", email="owner@example.com", password="OwnerStrongPass+2026"
        )
        cls.other = User.objects.create_user(
            username="other", email="already@example.com", password="OtherStrongPass+2026"
        )

    def setUp(self):
        self.client.force_login(self.owner)

    def put_profile(self, **changes):
        data = {"first_name": "Awa", "last_name": "Traoré", "email": "awa@example.com"}
        data.update(changes)
        return self.client.put(reverse("owner-profile"), json.dumps(data), content_type="application/json")

    def password(self, **changes):
        data = {"current_password": "OwnerStrongPass+2026", "new_password": "NewStrongPassword!2026"}
        data.update(changes)
        return self.client.post(reverse("owner-password"), json.dumps(data), content_type="application/json")

    def test_owner_profile_can_be_read_and_updated_without_username_change(self):
        original = self.client.get(reverse("owner-profile"))
        self.assertEqual(original.status_code, 200)
        self.assertEqual(original.json()["profile"]["role"], "Propriétaire")
        self.assertEqual(original.json()["profile"]["username"], "owner-test")
        self.assertNotIn("password", original.content.decode().lower())
        edited = self.put_profile()
        self.assertEqual(edited.status_code, 200, edited.content)
        self.assertEqual(edited.json()["profile"]["display_name"], "Awa Traoré")
        self.assertEqual(edited.json()["profile"]["email"], "awa@example.com")
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.username, "owner-test")
        self.assertEqual(self.owner.email, "awa@example.com")

    def test_profile_validates_email_types_and_unexpected_fields(self):
        self.assertEqual(self.put_profile(email="pas-un-email").status_code, 400)
        self.assertEqual(self.put_profile(email="already@example.com").status_code, 400)
        self.assertEqual(self.put_profile(first_name="a" * 151).status_code, 400)
        self.assertEqual(self.put_profile(email=5).status_code, 400)
        payload = {"first_name": "A", "last_name": "B", "email": "", "is_superuser": True}
        self.assertEqual(self.client.put(reverse("owner-profile"),
                                         json.dumps(payload), content_type="application/json").status_code, 400)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.first_name, "")

    def test_password_change_requires_old_password_enforces_policy_and_keeps_owner_session(self):
        self.assertEqual(self.password(current_password="incorrect").status_code, 400)
        self.assertEqual(self.password(new_password="123").status_code, 400)
        self.assertEqual(self.password(new_password="OwnerStrongPass+2026").status_code, 400)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password("OwnerStrongPass+2026"))
        updated = self.password()
        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertTrue(updated.json()["updated"])
        self.assertNotIn("NewStrongPassword!2026", updated.content.decode())
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password("NewStrongPassword!2026"))
        self.assertFalse(self.owner.check_password("OwnerStrongPass+2026"))
        self.assertTrue(self.client.get(reverse("auth-session")).json()["authenticated"])

    def test_anonymous_and_non_owner_cannot_view_or_change_account(self):
        outsider = Client()
        regular = Client()
        regular.force_login(self.other)
        for client in (outsider, regular):
            self.assertEqual(client.get(reverse("owner-profile")).status_code, 401)
            self.assertEqual(client.put(reverse("owner-profile"), json.dumps({
                "first_name": "Changed", "last_name": "", "email": "bad@example.com",
            }), content_type="application/json").status_code, 401)
            self.assertEqual(client.post(reverse("owner-password"), json.dumps({
                "current_password": "anything", "new_password": "StrongPassword+2026",
            }), content_type="application/json").status_code, 401)

    def test_csrf_is_mandatory_for_profile_and_password_writes(self):
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.owner)
        url = reverse("owner-profile")
        body = json.dumps({"first_name": "Awa", "last_name": "", "email": "test@example.com"})
        self.assertEqual(browser.put(url, body, content_type="application/json").status_code, 403)
        body = json.dumps({"current_password": "OwnerStrongPass+2026", "new_password": "AnotherStrongPassword!2026"})
        self.assertEqual(browser.post(reverse("owner-password"), body, content_type="application/json").status_code, 403)
        self.assertEqual(self.client.get(reverse("owner-password")).status_code, 405)

    def test_no_cache_for_sensitive_profile(self):
        response = self.client.get(reverse("owner-profile"))
        self.assertIn("no-cache", response.headers.get("Cache-Control", ""))
