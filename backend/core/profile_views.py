"""Owner-only account profile and password management. No additional user roles."""
import json

from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods, require_POST

from .auth_views import is_owner

MAX_JSON_BYTES = 8192


def owner_data(user):
    return {
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "display_name": user.get_full_name().strip() or user.username,
        "email": user.email,
        "date_joined": user.date_joined.isoformat(),
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "role": "Propriétaire",
    }


def parse_payload(request, keys):
    if len(request.body) > MAX_JSON_BYTES:
        raise ValueError("La requête est trop longue.")
    try:
        data = json.loads(request.body)
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Données JSON invalides.") from exc
    if not isinstance(data, dict) or set(data) != set(keys):
        raise ValueError("Champs inattendus ou manquants.")
    if any(not isinstance(value, str) for value in data.values()):
        raise ValueError("Tous les champs doivent être des textes.")
    return data


@never_cache
@require_http_methods(["GET", "PUT"])
def owner_profile(request):
    if not is_owner(request.user):
        return JsonResponse({"detail": "Non authentifié."}, status=401)
    if request.method == "GET":
        return JsonResponse({"profile": owner_data(request.user)})
    try:
        data = parse_payload(request, ("first_name", "last_name", "email"))
        first_name = data["first_name"].strip()
        last_name = data["last_name"].strip()
        email = data["email"].strip().lower()
        if len(first_name) > 150 or len(last_name) > 150 or len(email) > 254:
            raise ValueError("Nom ou email trop long.")
        if email:
            try:
                validate_email(email)
            except ValidationError as exc:
                raise ValueError("Adresse email invalide.") from exc
            User = get_user_model()
            if User.objects.exclude(pk=request.user.pk).filter(email__iexact=email).exists():
                raise ValueError("Cette adresse email est déjà utilisée.")
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    user = request.user
    user.first_name = first_name
    user.last_name = last_name
    user.email = email
    user.save(update_fields=["first_name", "last_name", "email"])
    return JsonResponse({"profile": owner_data(user)})


@never_cache
@require_POST
def owner_password(request):
    if not is_owner(request.user):
        return JsonResponse({"detail": "Non authentifié."}, status=401)
    try:
        data = parse_payload(request, ("current_password", "new_password"))
        current = data["current_password"]
        new = data["new_password"]
        if not current or len(current) > 1024 or not new or len(new) > 1024:
            raise ValueError("Mot de passe invalide.")
        if not request.user.check_password(current):
            return JsonResponse({"detail": "Mot de passe actuel incorrect."}, status=400)
        if current == new:
            raise ValueError("Le nouveau mot de passe doit être différent.")
        try:
            validate_password(new, request.user)
        except ValidationError as exc:
            raise ValueError(" ".join(exc.messages)) from exc
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    user = request.user
    user.set_password(new)
    user.save(update_fields=["password"])
    # Preserve this owner's session but invalidate all other sessions using
    # Django's auth-session password hash.
    update_session_auth_hash(request, user)
    return JsonResponse({"detail": "Mot de passe modifié.", "updated": True})
