"""Achats fournisseurs : réception multi-lignes atomique, idempotente et auditée."""
import hashlib
import json
from decimal import Decimal
from uuid import UUID

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from .catalog_views import (
    MAX_STOCK, amount, clean_text, number, owner_only, phone_entries, read_payload,
)
from .models import (
    PhoneIdentifier, PhoneUnit, Product, PurchaseLine, PurchaseReceipt,
    StockMovement, Supplier,
)


def supplier_data(supplier):
    return {"id": str(supplier.pk), "name": supplier.name, "phone": supplier.phone}


def purchase_data(receipt):
    return {
        "id": str(receipt.pk),
        "client_ref": str(receipt.client_ref),
        "supplier": supplier_data(receipt.supplier),
        "total": str(receipt.total),
        "created_at": receipt.created_at.isoformat(),
        "lines": [
            {"product_id": str(line.product_id), "product_name": line.product.name,
             "quantity": line.quantity, "unit_cost": str(line.unit_cost),
             "total": str(line.total), "phone_imeis": line.phone_imeis}
            for line in receipt.lines.select_related("product").all()
        ],
    }


@require_GET
@owner_only
def suppliers(request):
    return JsonResponse({"results": [
        supplier_data(s) for s in Supplier.objects.order_by("name")[:300]
    ]})


@require_http_methods(["GET", "POST"])
@owner_only
def purchases(request):
    if request.method == "GET":
        receipts = PurchaseReceipt.objects.select_related("supplier").order_by("-created_at")[:100]
        return JsonResponse({"results": [purchase_data(r) for r in receipts]})

    try:
        data = read_payload(request)
        supplier_data_raw = data.get("supplier")
        if not isinstance(supplier_data_raw, dict):
            raise ValueError("Fournisseur obligatoire.")
        supplier_name = clean_text(supplier_data_raw.get("name"), "Fournisseur", 160, required=True)
        supplier_phone = clean_text(supplier_data_raw.get("phone", ""), "Téléphone fournisseur", 30)
        client_ref = UUID(str(data.get("client_ref")))
        raw_lines = data.get("lines")
        if not isinstance(raw_lines, list) or not 1 <= len(raw_lines) <= 50:
            raise ValueError("Ajoute entre 1 et 50 lignes de marchandises.")
        payload_hash = hashlib.sha256(
            json.dumps(data, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        seen_products = set()
        validated = []
        for raw_line in raw_lines:
            if not isinstance(raw_line, dict):
                raise ValueError("Ligne de marchandise invalide.")
            product_id = UUID(str(raw_line.get("product_id")))
            if product_id in seen_products:
                raise ValueError("Un produit doit apparaître une seule fois par réception.")
            seen_products.add(product_id)
            qty = number(raw_line.get("quantity"), "Quantité")
            if qty < 1:
                raise ValueError("La quantité doit être supérieure à zéro.")
            unit_cost = amount(raw_line.get("unit_cost"), "Prix d'achat", allow_zero=True)
            validated.append((product_id, qty, unit_cost, raw_line.get("phones", [])))
    except (ValueError, TypeError) as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    previous = PurchaseReceipt.objects.filter(client_ref=client_ref).select_related("supplier").first()
    if previous:
        if previous.payload_hash != payload_hash:
            return JsonResponse({"detail": "Cette référence de réception est déjà utilisée."}, status=409)
        return JsonResponse({"receipt": purchase_data(previous), "replayed": True}, status=200)

    try:
        with transaction.atomic():
            supplier, _ = Supplier.objects.get_or_create(
                normalized_name=supplier_name.casefold(),
                defaults={"name": supplier_name, "phone": supplier_phone},
            )
            receipt = PurchaseReceipt.objects.create(
                client_ref=client_ref, payload_hash=payload_hash,
                supplier=supplier, total=Decimal("0.00"),
            )
            total = Decimal("0.00")
            # Lock in stable order, for predictable concurrent updates.
            products = {
                product.id: product for product in Product.objects.select_for_update()
                .filter(pk__in=seen_products).order_by("pk")
            }
            if len(products) != len(seen_products):
                raise ValueError("Un produit sélectionné n'existe plus.")
            for product_id, qty, unit_cost, raw_phones in validated:
                product = products[product_id]
                entries = phone_entries(raw_phones)
                if product.category == Product.Category.PHONE:
                    if len(entries) != qty:
                        raise ValueError("Il faut un IMEI valide et unique par téléphone réceptionné.")
                    for first, second in entries:
                        unit = PhoneUnit.objects.create(product=product)
                        PhoneIdentifier.objects.create(unit=unit, slot=1, imei=first)
                        if second:
                            PhoneIdentifier.objects.create(unit=unit, slot=2, imei=second)
                else:
                    if entries:
                        raise ValueError("Les pochettes et accessoires n'utilisent pas d'IMEI.")
                    if product.quantity + qty > MAX_STOCK:
                        raise ValueError("Limite de stock dépassée.")
                    product.quantity += qty

                product.purchase_price = unit_cost
                product.save(update_fields=["purchase_price"] + (["quantity"] if product.category != Product.Category.PHONE else []))
                line_total = unit_cost * qty
                total += line_total
                PurchaseLine.objects.create(
                    receipt=receipt, product=product, quantity=qty,
                    unit_cost=unit_cost, total=line_total,
                    phone_imeis=[{"imei": a, "imei2": b} for a, b in entries],
                )
                StockMovement.objects.create(
                    product=product, delta=qty, reason=StockMovement.Reason.PURCHASE,
                    note="Réception fournisseur : " + supplier.name[:150],
                )
            receipt.total = total
            receipt.save(update_fields=["total"])
    except IntegrityError:
        # A concurrent retry may have just been committed.
        previous = PurchaseReceipt.objects.filter(client_ref=client_ref).select_related("supplier").first()
        if previous and previous.payload_hash == payload_hash:
            return JsonResponse({"receipt": purchase_data(previous), "replayed": True})
        return JsonResponse({"detail": "IMEI déjà enregistré ou référence en double."}, status=409)
    except (ValueError, TypeError) as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    return JsonResponse({"receipt": purchase_data(receipt), "replayed": False}, status=201)
