"""Phase 05: atomic sales, unique IMEI assignment, initial payments and credit balances."""
import hashlib
import json
from datetime import date
from decimal import Decimal
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods

from .catalog_views import amount, clean_text, number, owner_only, read_payload
from .models import (
    PhoneIdentifier, PhoneUnit, Product, Sale, SaleLine, SalePayment, StockMovement,
)

MAX_LINES = 80
MAX_LINE_QTY = 1000
ZERO = Decimal("0.00")


def currency(value):
    return str(Decimal(value).quantize(Decimal("0.01")))


def sale_data(sale):
    lines = []
    for line in sale.lines.select_related("product", "phone_unit").all():
        primary_imei = ""
        if line.phone_unit_id:
            identifier = line.phone_unit.identifiers.filter(slot=1).first()
            primary_imei = identifier.imei if identifier else ""
        lines.append({
            "product_id": str(line.product_id),
            "product_name": line.product_name,
            "brand": line.product_brand,
            "model": line.product_model,
            "condition": line.product_condition,
            "quantity": line.quantity,
            "imei": primary_imei,
            "unit_price": currency(line.unit_price),
            "unit_cost": currency(line.unit_cost),
            "total": currency(line.line_total),
            "line_profit": currency(line.line_total - line.line_cost),
        })
    return {
        "id": str(sale.id), "reference": "VTE-" + sale.id.hex[:10].upper(),
        "client_ref": str(sale.client_ref),
        "created_at": sale.created_at.isoformat(),
        "status": sale.status, "method": sale.method,
        "customer_name": sale.customer_name, "customer_phone": sale.customer_phone,
        "due_date": sale.due_date.isoformat() if sale.due_date else None,
        "total": currency(sale.total), "amount_paid": currency(sale.amount_paid),
        "balance": currency(sale.balance), "gross_profit": currency(sale.gross_profit),
        "lines": lines,
    }


@require_http_methods(["GET", "POST"])
@owner_only
def sales(request):
    if request.method == "GET":
        latest = Sale.objects.select_related("owner").order_by("-created_at")[:80]
        today = timezone.localdate()
        stats = Sale.objects.filter(created_at__date=today).aggregate(
            total=Sum("total"), cash_collected=Sum("amount_paid"),
            balance=Sum("balance"), gross_profit=Sum("gross_profit"),
        )
        return JsonResponse({
            "results": [sale_data(s) for s in latest],
            "today": {key: currency(value or ZERO) for key, value in stats.items()},
            "limit": 80,
        })

    try:
        payload = read_payload(request)
        ref = UUID(str(payload.get("client_ref")))
        raw_lines = payload.get("lines")
        if not isinstance(raw_lines, list) or not 1 <= len(raw_lines) <= MAX_LINES:
            raise ValueError("Ajoute entre 1 et 80 articles au panier.")
        method = payload.get("method", Sale.PaymentMethod.CASH)
        if method not in Sale.PaymentMethod.values:
            raise ValueError("Moyen de paiement invalide.")
        paid = amount(payload.get("amount_paid"), "Montant versé", allow_zero=True)
        customer_name = clean_text(payload.get("customer_name", ""), "Nom du client", 160)
        customer_phone = clean_text(payload.get("customer_phone", ""), "Téléphone client", 30)
        raw_date = payload.get("due_date")
        if raw_date:
            if not isinstance(raw_date, str):
                raise ValueError("Échéance invalide.")
            due_date = date.fromisoformat(raw_date)
        else:
            due_date = None

        seen = set()
        validated = []
        for line in raw_lines:
            if not isinstance(line, dict):
                raise ValueError("Une ligne du panier est invalide.")
            pk = UUID(str(line.get("product_id")))
            qty = number(line.get("quantity"), "Quantité", MAX_LINE_QTY)
            if qty < 1:
                raise ValueError("La quantité doit être positive.")
            price = amount(line.get("unit_price"), "Prix de vente")
            imei = line.get("imei") or ""
            if not isinstance(imei, str) or len(imei) > 15:
                raise ValueError("IMEI invalide.")
            if imei and (len(imei) != 15 or not imei.isascii() or not imei.isdigit()):
                raise ValueError("IMEI invalide : 15 chiffres obligatoires.")
            # Same accessory product cannot be split across several lines.
            key = (pk, imei)
            if key in seen or (not imei and any(existing[0] == pk for existing in seen)):
                raise ValueError("Article en double dans le panier.")
            seen.add(key)
            validated.append((pk, qty, price, imei))
        fingerprint = hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        ).hexdigest()
    except (ValueError, TypeError) as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    previous = Sale.objects.filter(client_ref=ref).first()
    if previous:
        if previous.payload_hash != fingerprint:
            return JsonResponse({"detail": "Cette référence de vente est déjà utilisée."}, status=409)
        return JsonResponse({"sale": sale_data(previous), "replayed": True}, status=200)

    try:
        with transaction.atomic():
            products = {
                product.pk: product for product in Product.objects.select_for_update()
                .filter(pk__in=[pk for pk, _, _, _ in validated]).order_by("pk")
            }
            if len(products) != len(set(pk for pk, _, _, _ in validated)):
                raise ValueError("Un article du panier n'existe plus.")

            prepared = []
            requested_accessories = {}
            chosen_units = set()
            total = ZERO
            cost_total = ZERO
            # All input checked before changing stock; transaction rollback is guaranteed.
            for product_id, quantity, unit_price, imei in validated:
                product = products[product_id]
                unit = None
                if product.category == Product.Category.PHONE:
                    if quantity != 1 or not imei:
                        raise ValueError("Chaque téléphone vendu doit avoir son IMEI exact.")
                    identifier = PhoneIdentifier.objects.select_related("unit").filter(
                        imei=imei, unit__product_id=product_id,
                    ).first()
                    if identifier is None:
                        raise ValueError("IMEI introuvable dans le stock de ce modèle.")
                    unit = PhoneUnit.objects.select_for_update().get(pk=identifier.unit_id)
                    if unit.sold or unit.pk in chosen_units:
                        raise ValueError("Ce téléphone a déjà été vendu.")
                    chosen_units.add(unit.pk)
                else:
                    if imei:
                        raise ValueError("Les pochettes et accessoires ne nécessitent pas d'IMEI.")
                    requested_accessories[product_id] = requested_accessories.get(product_id, 0) + quantity
                    if requested_accessories[product_id] > product.quantity:
                        raise ValueError("Stock insuffisant pour " + product.name + ".")
                line_total = unit_price * quantity
                line_cost = product.purchase_price * quantity
                total += line_total
                cost_total += line_cost
                prepared.append((product, unit, quantity, unit_price, line_total, line_cost))

            if total > Decimal("9999999999999.99"):
                raise ValueError("Total de vente trop élevé.")
            if paid > total:
                raise ValueError("Le versement ne peut pas dépasser le total de la vente.")
            balance = total - paid
            if balance and (not customer_name or not customer_phone):
                raise ValueError("Nom et téléphone du client obligatoires pour une vente à crédit.")
            status = Sale.Status.CREDIT if balance else Sale.Status.PAID
            sale = Sale.objects.create(
                client_ref=ref, payload_hash=fingerprint, owner=request.user,
                customer_name=customer_name, customer_phone=customer_phone, due_date=due_date,
                method=method, status=status, total=total, cost_total=cost_total,
                gross_profit=total - cost_total, amount_paid=paid, balance=balance,
            )
            for product, unit, qty, price, line_total, line_cost in prepared:
                SaleLine.objects.create(
                    sale=sale, product=product, phone_unit=unit, quantity=qty,
                    product_name=product.name, product_brand=product.brand,
                    product_model=product.model, product_condition=product.condition,
                    unit_price=price, unit_cost=product.purchase_price,
                    line_total=line_total, line_cost=line_cost,
                )
                if unit:
                    unit.sold = True
                    unit.save(update_fields=["sold"])
                else:
                    product.quantity -= qty
                    product.save(update_fields=["quantity"])
                StockMovement.objects.create(
                    product=product, delta=-qty, reason=StockMovement.Reason.SALE,
                    note="Vente " + str(sale.pk)[:16],
                )
            if paid > ZERO:
                SalePayment.objects.create(sale=sale, amount=paid, method=method)
    except IntegrityError:
        previous = Sale.objects.filter(client_ref=ref).first()
        if previous and previous.payload_hash == fingerprint:
            return JsonResponse({"sale": sale_data(previous), "replayed": True}, status=200)
        return JsonResponse({"detail": "Vente déjà enregistrée ou téléphone déjà vendu."}, status=409)
    except (ValueError, TypeError) as exc:
        return JsonResponse({"detail": str(exc)}, status=409)

    return JsonResponse({"sale": sale_data(sale), "replayed": False}, status=201)


@require_GET
@owner_only
def sale_detail(request, sale_id):
    try:
        sale = Sale.objects.get(pk=sale_id)
    except Sale.DoesNotExist:
        return JsonResponse({"detail": "Vente introuvable."}, status=404)
    return JsonResponse({"sale": sale_data(sale)})
