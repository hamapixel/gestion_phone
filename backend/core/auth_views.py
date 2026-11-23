"""Authentification web par session, réservée au propriétaire unique."""
import json

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .security import blocked, failed, succeeded, throttle_keys


def is_owner(user):
    return user.is_authenticated and user.is_active and user.is_superuser


@require_GET
@ensure_csrf_cookie
def csrf_token(request):
    return JsonResponse({"status": "ok"})


@require_GET
def owner_session(request):
    if is_owner(request.user):
        return JsonResponse({"authenticated": True, "owner": request.user.username})
    return JsonResponse({"authenticated": False})


@require_POST
def owner_login(request):
    if len(request.body) > 8192:
        return JsonResponse({"detail": "Requête invalide."}, status=400)
    try:
        data = json.loads(request.body)
        identifier = data.get("identifier", "").strip()
        password = data.get("password", "")
        if not isinstance(identifier, str) or not isinstance(password, str):
            raise ValueError
    except (ValueError, AttributeError, TypeError, json.JSONDecodeError):
        return JsonResponse({"detail": "Requête invalide."}, status=400)
    if not identifier or not password or len(identifier) > 254 or len(password) > 1024:
        return JsonResponse({"detail": "Identifiant ou mot de passe invalide."}, status=400)

    keys = throttle_keys(request, identifier)
    if blocked(keys):
        return JsonResponse({"detail": "Trop de tentatives. Réessaie dans quelques minutes."}, status=429)

    User = get_user_model()
    user = User.objects.filter(
        Q(username__iexact=identifier) | Q(email__iexact=identifier),
        is_active=True,
        is_superuser=True,
    ).first()
    account = authenticate(request, username=user.username, password=password) if user else None
    if account is None or not is_owner(account):
        failed(keys)
        return JsonResponse({"detail": "Identifiant ou mot de passe incorrect."}, status=401)

    succeeded(keys)
    login(request, account)
    request.session.set_expiry(12 * 60 * 60)
    return JsonResponse({"authenticated": True, "owner": account.username})


@require_POST
def owner_logout(request):
    if not is_owner(request.user):
        return JsonResponse({"detail": "Non authentifié."}, status=401)
    logout(request)
    return JsonResponse({"authenticated": False})
