from django.test import SimpleTestCase
from django.urls import reverse

class HealthEndpointTests(SimpleTestCase):
    def test_health(self):
        response = self.client.get(reverse("health"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_post_is_disallowed(self):
        self.assertEqual(self.client.post(reverse("health")).status_code, 405)

    def test_meta_labels_unimplemented_modules(self):
        response = self.client.get(reverse("meta"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["modules"]["sales"], "planned")
