from django.db import models


class LoginThrottle(models.Model):
    """Compteurs persistants sans identifiants ou adresses IP en clair."""

    key = models.CharField(max_length=64, unique=True)
    failures = models.PositiveIntegerField(default=0)
    blocked_until = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return "LoginThrottle (protégé)"
