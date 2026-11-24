"""Phase 09C: owner-approved device pairing only. No native sale-submission API."""
import json
import secrets
from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .auth_views import is_owner
from .models import DesktopPairingCode, TrustedDesktop
from .security import blocked, failed, succeeded, throttle_keys

CODE_TTL = timedelta(minutes=5)
TOKEN_TTL = timedelta(days=30)


def digest(value, context):
    return salted_hmac(context, value).hexdigest()


def allowed_transport(request):
    if request.is_secure():
        return True
    if not settings.DEBUG:
        return False
    return request.get_host().split(":")[0] in ("localhost", "127.0.0.1")


def payload(request, fields):
    if len(request.body) > 2048 or request.content_type != "application/json":
        raise ValueError("Corps JSON invalide.")
    try:
        result = json.loads(request.body)
    except (TypeError, ValueError):
        raise ValueError("Corps JSON invalide.")
    if not isinstance(result, dict) or set(result) != set(fields):
        raise ValueError("Champs invalides.")
    return result


@never_cache
@require_POST
def pairing_issue(request):
    """Requires authenticated owner session AND Django CSRF middleware."""
    if not is_owner(request.user):
        return JsonResponse({"detail": "Propriétaire non connecté."}, status=401)
    if not allowed_transport(request):
        return JsonResponse({"detail": "HTTPS obligatoire."}, status=403)
    now = timezone.now()
    with transaction.atomic():
        DesktopPairingCode.objects.filter(owner=request.user, used_at__isnull=True).delete()
        for _ in range(3):
            code = f"{secrets.randbelow(10**12):012d}"
            hashed = digest(code, "yaraphone.desktop.pairing")
            if not DesktopPairingCode.objects.filter(digest=hashed).exists():
                DesktopPairingCode.objects.create(
                    owner=request.user, digest=hashed, expires_at=now+CODE_TTL)
                break
        else:
            return JsonResponse({"detail": "Code indisponible."}, status=503)
    return JsonResponse({
        "pairing_code": code, "expires_at": (now+CODE_TTL).isoformat(),
        "expires_in_seconds": 300,
    }, status=201)


@never_cache
@csrf_exempt
@require_POST
def pairing_redeem(request):
    """No cookies needed; short-lived code + TLS is the only grant."""
    if not allowed_transport(request):
        return JsonResponse({"detail": "HTTPS obligatoire."}, status=403)
    keys = throttle_keys(request, "yaraphone-device-pair")
    if blocked(keys):
        return JsonResponse({"detail": "Trop de tentatives."}, status=429)
    try:
        body = payload(request, ("pairing_code", "device_ref", "label"))
        code = body["pairing_code"]
        if (not isinstance(code, str) or len(code) != 12
                or not code.isascii() or not code.isdecimal()):
            raise ValueError
        device_ref = UUID(str(body["device_ref"]))
        label = body["label"]
        if not isinstance(label, str) or not 1 <= len(label.strip()) <= 80:
            raise ValueError
    except (TypeError, ValueError):
        failed(keys)
        return JsonResponse({"detail": "Appairage invalide."}, status=400)
    now = timezone.now()
    with transaction.atomic():
        grant = DesktopPairingCode.objects.select_for_update().select_related("owner").filter(
            digest=digest(code, "yaraphone.desktop.pairing"), used_at__isnull=True,
            expires_at__gt=now).first()
        if not grant or not is_owner(grant.owner):
            failed(keys)
            return JsonResponse({"detail": "Code invalide ou expiré."}, status=401)
        grant.used_at = now
        grant.save(update_fields=["used_at"])
        token = secrets.token_urlsafe(48)
        expires = now+TOKEN_TTL
        TrustedDesktop.objects.update_or_create(
            owner=grant.owner, device_ref=device_ref,
            defaults={"label": label.strip(), "token_digest": digest(token, "yaraphone.device.token"),
                      "expires_at": expires, "revoked_at": None})
    succeeded(keys)
    return JsonResponse({"token": token, "device_ref": str(device_ref),
                         "expires_at": expires.isoformat(), "scope": "device-session-only"}, status=201)


def authenticated_device(request):
    parts = request.headers.get("Authorization", "").split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or len(parts[1]) > 256:
        return None
    device = TrustedDesktop.objects.select_related("owner").filter(
        token_digest=digest(parts[1], "yaraphone.device.token"),
        revoked_at__isnull=True, expires_at__gt=timezone.now()).first()
    if not device or not is_owner(device.owner):
        return None
    return device


@never_cache
@require_GET
def device_session(request):
    """This credential grants a status check only, never creation of sales."""
    if not allowed_transport(request):
        return JsonResponse({"detail": "HTTPS obligatoire."}, status=403)
    device = authenticated_device(request)
    if not device:
        return JsonResponse({"detail": "Appareil non autorisé."}, status=401)
    device.last_seen_at = timezone.now()
    device.save(update_fields=["last_seen_at"])
    return JsonResponse({"authorized": True, "device_ref": str(device.device_ref),
                         "label": device.label, "expires_at": device.expires_at.isoformat(),
                         "scope": "device-session-only"})


@never_cache
@require_GET
def device_list(request):
    if not is_owner(request.user):
        return JsonResponse({"detail": "Connexion propriétaire requise."}, status=401)
    devices = TrustedDesktop.objects.filter(owner=request.user).order_by("-created_at")[:50]
    return JsonResponse({"results": [{
        "device_ref": str(d.device_ref), "label": d.label, "revoked": bool(d.revoked_at),
        "expires_at": d.expires_at.isoformat(),
        "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
    } for d in devices]})


@never_cache
@require_POST
def device_revoke(request):
    if not is_owner(request.user):
        return JsonResponse({"detail": "Connexion propriétaire requise."}, status=401)
    try:
        device_ref = UUID(str(payload(request, ("device_ref",))["device_ref"]))
    except (ValueError, TypeError):
        return JsonResponse({"detail": "Identifiant d’appareil invalide."}, status=400)
    count = TrustedDesktop.objects.filter(owner=request.user, device_ref=device_ref,
        revoked_at__isnull=True).update(revoked_at=timezone.now())
    return JsonResponse({"revoked": bool(count)})
