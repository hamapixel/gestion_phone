"""Owner-only documents. Every printed invoice/receipt uses the currently configured shop header."""
import base64
import binascii
import json
import re
from decimal import Decimal

from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q, Sum
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from .catalog_views import clean_text, owner_only
from .models import Sale, SalePayment, ShopBranding, ShopConfig
from .sale_views import currency, sale_data

LOGO_MAX_BYTES = 90_000
PAYLOAD_MAX_BYTES = 190_000
IMAGE_PATTERN = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$")


def branding_data(branding):
    return {
        "id": str(branding.id),
        "name": branding.name,
        "phone": branding.phone,
        "email": branding.email,
        "address": branding.address,
        "tax_id": branding.tax_id,
        "footer": branding.footer,
        "logo_data": branding.logo_data,
    }


def validate_logo(value):
    if not value:
        return ""
    if not isinstance(value, str) or len(value) > 140_000:
        raise ValueError("Logo trop volumineux.")
    match = IMAGE_PATTERN.fullmatch(value)
    if not match:
        raise ValueError("Logo invalide : PNG, JPEG ou WebP uniquement.")
    try:
        decoded = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("Logo encodé invalide.")
    if not decoded or len(decoded) > LOGO_MAX_BYTES:
        raise ValueError("Logo trop volumineux (90 Ko maximum).")
    kind = match.group(1)
    if kind == "png" and not decoded.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Le fichier ne correspond pas à une image PNG.")
    if kind == "jpeg" and not decoded.startswith(b"\xff\xd8\xff"):
        raise ValueError("Le fichier ne correspond pas à une image JPEG.")
    if kind == "webp" and not (decoded.startswith(b"RIFF") and decoded[8:12] == b"WEBP"):
        raise ValueError("Le fichier ne correspond pas à une image WebP.")
    return value


def current_branding():
    return ShopConfig.objects.select_related("branding").get(pk=1).branding


@require_http_methods(["GET", "PUT"])
@owner_only
def shop(request):
    if request.method == "GET":
        return JsonResponse({"shop": branding_data(current_branding())})
    if len(request.body) > PAYLOAD_MAX_BYTES:
        return JsonResponse({"detail": "Données trop volumineuses."}, status=400)
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError("Informations de boutique invalides.")
        required_keys = {"name", "phone", "email", "address", "tax_id", "footer", "logo_data"}
        if set(data) != required_keys:
            raise ValueError("Informations manquantes dans l'en-tête.")
        values = {
            "name": clean_text(data["name"], "Nom de boutique", 160, required=True),
            "phone": clean_text(data["phone"], "Téléphone", 40),
            "email": clean_text(data["email"], "Email", 254),
            "address": clean_text(data["address"], "Adresse", 240),
            "tax_id": clean_text(data["tax_id"], "NIF / RCCM", 90),
            "footer": clean_text(data["footer"], "Message de bas de facture", 240),
            "logo_data": validate_logo(data["logo_data"]),
        }
        if values["email"]:
            validate_email(values["email"])
        with transaction.atomic():
            config = ShopConfig.objects.select_for_update().select_related("branding").get(pk=1)
            old = branding_data(config.branding)
            if all(old[key] == value for key, value in values.items()):
                return JsonResponse({"shop": old, "updated": False})
            created = ShopBranding.objects.create(**values)
            config.branding = created
            config.save(update_fields=["branding"])
    except (ValueError, TypeError, ValidationError, json.JSONDecodeError) as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({"shop": branding_data(created), "updated": True})


def public_sale_data(sale):
    info = sale_data(sale)
    info.pop("gross_profit", None)
    for line in info["lines"]:
        line.pop("unit_cost", None)
        line.pop("line_profit", None)
    return info


@require_GET
@owner_only
def invoice(request, sale_id):
    try:
        sale = Sale.objects.get(pk=sale_id)
    except Sale.DoesNotExist:
        return JsonResponse({"detail": "Vente introuvable."}, status=404)
    return JsonResponse({
        "kind": "invoice",
        # The header is an installation-wide setting, not tied to the sale date.
        # Historic totals, sold products, and payment dates still come from the sale.
        "shop": branding_data(current_branding()),
        "sale": public_sale_data(sale),
    })


@require_GET
@owner_only
def payment_receipt(request, payment_id):
    try:
        payment = SalePayment.objects.select_related("sale").get(pk=payment_id)
    except SalePayment.DoesNotExist:
        return JsonResponse({"detail": "Versement introuvable."}, status=404)
    sale = payment.sale
    received = SalePayment.objects.filter(sale=sale).filter(
        Q(created_at__lt=payment.created_at) |
        Q(created_at=payment.created_at, id__lte=payment.id)
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    return JsonResponse({
        "kind": "payment",
        "shop": branding_data(current_branding()),
        "payment": {
            "id": str(payment.id),
            "reference": "REC-" + payment.id.hex[:10].upper(),
            "created_at": payment.created_at.isoformat(),
            "amount": currency(payment.amount),
            "method": payment.method,
            "balance_after": currency(sale.total - received),
        },
        "sale": public_sale_data(sale),
    })
