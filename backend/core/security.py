"""Protection persistante contre les tentatives répétées sur le compte propriétaire."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac

from .models import LoginThrottle

MAX_FAILURES = 5
WINDOW = timedelta(minutes=15)
LOCK_TIME = timedelta(minutes=15)


def throttle_keys(request, identifier):
    # Ne jamais faire confiance à X-Forwarded-For sans reverse-proxy de confiance.
    ip = request.META.get("REMOTE_ADDR") or "unknown"
    username = identifier.casefold().strip()
    return [
        salted_hmac("phonestock.login.by-ip", ip).hexdigest(),
        salted_hmac("phonestock.login.by-identifier", username).hexdigest(),
    ]


def blocked(keys):
    return LoginThrottle.objects.filter(
        key__in=keys, blocked_until__gt=timezone.now()
    ).exists()


def failed(keys):
    now = timezone.now()
    for key in set(keys):
        with transaction.atomic():
            # Unique index protects get_or_create; row lock serializes updates.
            item, _ = LoginThrottle.objects.get_or_create(key=key)
            item = LoginThrottle.objects.select_for_update().get(pk=item.pk)
            if item.updated_at < now - WINDOW and (
                item.blocked_until is None or item.blocked_until <= now
            ):
                item.failures = 0
            item.failures += 1
            if item.failures >= MAX_FAILURES:
                item.blocked_until = now + LOCK_TIME
            item.save(update_fields=["failures", "blocked_until", "updated_at"])


def succeeded(keys):
    LoginThrottle.objects.filter(key__in=set(keys)).delete()
