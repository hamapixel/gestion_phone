"""Catalogue V1 : accès réservé au seul propriétaire, quantités réelles et IMEI uniques."""
import json
from decimal import Decimal, InvalidOperation
from functools import wraps

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .auth_views import is_owner
from .models import PhoneIdentifier, PhoneUnit, Product, StockMovement, ProductEditEvent

MAX_STOCK = 1_000_000
MAX_BODY = 65536


def owner_only(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not is_owner(request.user):
            return JsonResponse({"detail": "Connexion propriétaire requise."}, status=401)
        return view(request, *args, **kwargs)
    return wrapper


def read_payload(request):
    if len(request.body) > MAX_BODY:
        raise ValueError("Requête trop volumineuse.")
    try:
        data = json.loads(request.body)
    except (ValueError, TypeError):
        raise ValueError("Corps JSON invalide.")
    if not isinstance(data, dict):
        raise ValueError("Objet JSON attendu.")
    return data


def amount(value, label, allow_zero=False):
    try:
        result = Decimal(str(value))
        if not result.is_finite() or result > Decimal("9999999999.99"):
            raise ValueError
        if result < 0 or (not allow_zero and result == 0):
            raise ValueError
        if result != result.quantize(Decimal("0.01")):
            raise ValueError
    except (ValueError, InvalidOperation, TypeError):
        raise ValueError(f"{label} invalide (montant positif, 2 décimales maximum).")
    return result


def number(value, label, maximum=MAX_STOCK):
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError(f"{label} invalide.")
    return value


def clean_text(value, label, max_length, required=False):
    if not isinstance(value, str):
        raise ValueError(f"{label} invalide.")
    result = value.strip()
    if len(result) > max_length or (required and not result):
        raise ValueError(f"{label} invalide.")
    return result


def is_valid_imei(value):
    if not isinstance(value, str) or len(value) != 15 or not value.isascii() or not value.isdigit():
        return False
    digits = [int(n) for n in value]
    total = 0
    for i, digit in enumerate(digits[::-1]):
        if i % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def phone_entries(value):
    """An entry = {'imei':'...', 'imei2': optional '...'} for a physical phone."""
    if not isinstance(value, list) or len(value) > 200:
        raise ValueError("Liste d'IMEI invalide (maximum 200 téléphones).")
    seen = set()
    entries = []
    for entry in value:
        if not isinstance(entry, dict):
            raise ValueError("Format d'IMEI invalide.")
        primary = entry.get("imei")
        secondary = entry.get("imei2") or ""
        if not is_valid_imei(primary) or (secondary and not is_valid_imei(secondary)):
            raise ValueError("IMEI invalide : vérifie les 15 chiffres (compose *#06# sur le téléphone).")
        for current in [primary] + ([secondary] if secondary else []):
            if current in seen:
                raise ValueError("IMEI dupliqué dans la réception.")
            seen.add(current)
        entries.append((primary, secondary))
    return entries


def add_phones(product, entries):
    for primary, secondary in entries:
        unit = PhoneUnit.objects.create(product=product)
        PhoneIdentifier.objects.create(unit=unit, slot=1, imei=primary)
        if secondary:
            PhoneIdentifier.objects.create(unit=unit, slot=2, imei=secondary)
    if entries:
        StockMovement.objects.create(
            product=product, delta=len(entries),
            reason=StockMovement.Reason.IMEI_ADDITION,
            note="Ajout de téléphones identifiés par IMEI.",
        )


def stock_count(product):
    return product.quantity if product.category != Product.Category.PHONE else product.phone_units.filter(sold=False).count()


def product_data(product):
    qty = stock_count(product)
    return {
        "id": str(product.pk), "name": product.name,
        "category": product.category, "sku": product.sku,
        "brand": product.brand, "model": product.model, "condition": product.condition,
        "purchase_price": str(product.purchase_price),
        "sale_price": str(product.sale_price),
        "quantity": qty, "low_stock_threshold": product.low_stock_threshold,
        "low_stock": qty <= product.low_stock_threshold,
    }


@require_http_methods(["GET", "POST"])
@owner_only
def products(request):
    if request.method == "GET":
        search = request.GET.get("q", "").strip()[:100]
        category = request.GET.get("category", "").strip()
        queryset = Product.objects.all()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(sku__icontains=search) |
                Q(brand__icontains=search) | Q(model__icontains=search) |
                Q(phone_units__identifiers__imei__icontains=search)
            ).distinct()
        if category in Product.Category.values:
            queryset = queryset.filter(category=category)
        # Initial MVP limited to the newest 200 items. Pagination follows later.
        result = [product_data(product) for product in queryset[:200]]
        return JsonResponse({"results": result, "limit": 200})

    try:
        data = read_payload(request)
        name = clean_text(data.get("name"), "Nom", 160, required=True)
        category = data.get("category")
        if category not in Product.Category.values:
            raise ValueError("Catégorie invalide.")
        sku = clean_text(data.get("sku", ""), "Référence", 60)
        brand = clean_text(data.get("brand", ""), "Marque", 70, required=category == Product.Category.PHONE)
        model = clean_text(data.get("model", ""), "Modèle", 70, required=category == Product.Category.PHONE)
        condition = data.get("condition", Product.Condition.NEW)
        if condition not in Product.Condition.values:
            raise ValueError("État invalide : Neuf ou Occasion attendu.")
        purchase_price = amount(data.get("purchase_price"), "Prix d'achat", allow_zero=True)
        sale_price = amount(data.get("sale_price"), "Prix de vente")
        threshold = number(data.get("low_stock_threshold", 3), "Seuil d'alerte", 1000)
        quantity = number(data.get("quantity", 0), "Quantité")
        entries = phone_entries(data.get("phones", [])) if category == Product.Category.PHONE else []
        if category == Product.Category.PHONE and quantity != 0:
            raise ValueError("Le stock de téléphones est calculé à partir des IMEI ; ne pas saisir une quantité.")
        if category != Product.Category.PHONE and data.get("phones"):
            raise ValueError("Les IMEI concernent uniquement les téléphones.")
        with transaction.atomic():
            product = Product.objects.create(
                name=name, category=category, sku=sku, brand=brand, model=model, condition=condition,
                purchase_price=purchase_price, sale_price=sale_price,
                quantity=0 if category == Product.Category.PHONE else quantity,
                low_stock_threshold=threshold,
            )
            if category == Product.Category.PHONE:
                add_phones(product, entries)
            elif quantity:
                StockMovement.objects.create(
                    product=product, delta=quantity,
                    reason=StockMovement.Reason.OPENING, note="Stock initial.",
                )
    except (ValueError, TypeError) as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    except IntegrityError:
        return JsonResponse({"detail": "Un IMEI est déjà enregistré dans le stock."}, status=409)
    return JsonResponse({"product": product_data(product)}, status=201)


@require_POST
@owner_only
def add_imei(request, product_id):
    try:
        data = read_payload(request)
        entries = phone_entries(data.get("phones", []))
        if not entries:
            raise ValueError("Ajoute au moins un IMEI.")
        with transaction.atomic():
            product = Product.objects.select_for_update().get(pk=product_id)
            if product.category != Product.Category.PHONE:
                raise ValueError("Ce produit n'est pas un téléphone.")
            add_phones(product, entries)
    except Product.DoesNotExist:
        return JsonResponse({"detail": "Produit introuvable."}, status=404)
    except (ValueError, TypeError) as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    except IntegrityError:
        return JsonResponse({"detail": "Un IMEI est déjà enregistré."}, status=409)
    return JsonResponse({"product": product_data(product)})


@require_POST
@owner_only
def adjust_stock(request, product_id):
    try:
        data = read_payload(request)
        delta = data.get("delta")
        if type(delta) is not int or not -MAX_STOCK <= delta <= MAX_STOCK or delta == 0:
            raise ValueError("Quantité de correction invalide.")
        reason = clean_text(data.get("reason", ""), "Motif", 240, required=True)
        with transaction.atomic():
            product = Product.objects.select_for_update().get(pk=product_id)
            if product.category == Product.Category.PHONE:
                raise ValueError("Utilise les IMEI pour enregistrer les téléphones.")
            new_quantity = product.quantity + delta
            if not 0 <= new_quantity <= MAX_STOCK:
                raise ValueError("Le stock ne peut pas devenir négatif ou dépasser la limite.")
            product.quantity = new_quantity
            product.save(update_fields=["quantity"])
            StockMovement.objects.create(
                product=product, delta=delta,
                reason=StockMovement.Reason.ADJUSTMENT, note=reason,
            )
    except Product.DoesNotExist:
        return JsonResponse({"detail": "Produit introuvable."}, status=404)
    except (ValueError, TypeError) as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({"product": product_data(product)})


@require_http_methods(["GET", "PATCH"])
@owner_only
def product_detail(request, product_id):
    """Details and safe field updates; stock and IMEIs cannot change via this route."""
    try:
        if request.method == "GET":
            product = Product.objects.get(pk=product_id)
            units = []
            if product.category == Product.Category.PHONE:
                for unit in product.phone_units.prefetch_related("identifiers").order_by("-created_at")[:200]:
                    units.append({
                        "id": str(unit.pk), "sold": unit.sold,
                        "imeis": [
                            {"slot": entry.slot, "imei": entry.imei}
                            for entry in sorted(unit.identifiers.all(), key=lambda item: item.slot)
                        ],
                    })
            movements = [
                {"delta": m.delta, "reason": m.get_reason_display(), "note": m.note,
                 "created_at": m.created_at.isoformat()}
                for m in product.movements.order_by("-created_at")[:50]
            ]
            changes = [
                {"changes": event.changes, "created_at": event.created_at.isoformat()}
                for event in product.edit_events.order_by("-created_at")[:20]
            ]
            return JsonResponse({
                "product": product_data(product), "phones": units,
                "movements": movements, "changes": changes,
                "phones_truncated": product.category == Product.Category.PHONE and product.phone_units.count() > 200,
            })

        data = read_payload(request)
        allowed = {
            "name", "brand", "model", "condition",
            "purchase_price", "sale_price", "low_stock_threshold",
        }
        if not data or set(data) - allowed:
            raise ValueError("Modification invalide : stock, IMEI et catégorie sont gérés séparément.")

        with transaction.atomic():
            product = Product.objects.select_for_update().get(pk=product_id)
            values = {}
            for field, value in data.items():
                if field == "name":
                    values[field] = clean_text(value, "Nom", 160, required=True)
                elif field == "brand":
                    values[field] = clean_text(
                        value, "Marque", 70, required=product.category == Product.Category.PHONE
                    )
                elif field == "model":
                    values[field] = clean_text(
                        value, "Modèle", 70, required=product.category == Product.Category.PHONE
                    )
                elif field == "condition":
                    if value not in Product.Condition.values:
                        raise ValueError("État invalide : Neuf ou Occasion.")
                    values[field] = value
                elif field == "purchase_price":
                    values[field] = amount(value, "Prix d'achat", allow_zero=True)
                elif field == "sale_price":
                    values[field] = amount(value, "Prix de vente")
                elif field == "low_stock_threshold":
                    values[field] = number(value, "Seuil d'alerte", 1000)
            differences = {}
            for field, value in values.items():
                old = getattr(product, field)
                if old != value:
                    differences[field] = {"avant": str(old), "apres": str(value)}
                    setattr(product, field, value)
            if differences:
                product.save(update_fields=list(differences))
                ProductEditEvent.objects.create(product=product, changes=differences)
        return JsonResponse({"product": product_data(product), "updated": bool(differences)})
    except Product.DoesNotExist:
        return JsonResponse({"detail": "Produit introuvable."}, status=404)
    except (ValueError, TypeError) as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
