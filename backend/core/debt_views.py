"""Owner-only debt list and idempotent repayments. Repayments never add to sales revenue."""
import json
from decimal import Decimal
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Q, Sum, Exists, OuterRef
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from .catalog_views import amount, owner_only, read_payload
from .models import Sale, SalePayment
from .sale_views import currency


def payment_data(payment):
    return {
        "id": str(payment.id),
        "client_ref": str(payment.client_ref) if payment.client_ref else None,
        "amount": currency(payment.amount),
        "method": payment.method,
        "created_at": payment.created_at.isoformat(),
    }


def debt_data(sale):
    return {
        "id": str(sale.pk),
        "reference": "VTE-" + sale.pk.hex[:10].upper(),
        "created_at": sale.created_at.isoformat(),
        "customer_name": sale.customer_name,
        "customer_phone": sale.customer_phone,
        "due_date": sale.due_date.isoformat() if sale.due_date else None,
        "overdue": sale.balance > 0 and sale.due_date is not None and sale.due_date < timezone.localdate(),
        "total": currency(sale.total),
        "amount_paid": currency(sale.amount_paid),
        "balance": currency(sale.balance),
        "status": sale.status,
        "payments": [payment_data(p) for p in sale.payments.order_by("created_at", "id")],
    }


@require_GET
@owner_only
def debts(request):
    status = request.GET.get("status", "open")
    query = request.GET.get("q", "").strip()[:100]
    if status not in ("open", "all", "paid", "overdue"):
        return JsonResponse({"detail": "Filtre invalide."}, status=400)
    # Payment updates mark a fully reimbursed credit as PAID. Keep those in the debt history
    # by their originating credit metadata, not by their latest payment method.
    repayment = SalePayment.objects.filter(sale_id=OuterRef("pk"), client_ref__isnull=False)
    base = Sale.objects.filter(customer_name__gt="", customer_phone__gt="").annotate(
        has_repayment=Exists(repayment)
    ).filter(Q(balance__gt=0) | Q(has_repayment=True))
    if query:
        base = base.filter(
            Q(customer_name__icontains=query) | Q(customer_phone__icontains=query)
        )
    counts = base.aggregate(outstanding=Sum("balance"))
    outstanding = counts["outstanding"] or Decimal("0.00")
    overdue_count = base.filter(balance__gt=0, due_date__lt=timezone.localdate()).count()
    open_count = base.filter(balance__gt=0).count()

    if status == "open":
        base = base.filter(balance__gt=0)
    elif status == "paid":
        base = base.filter(balance=0)
    elif status == "overdue":
        base = base.filter(balance__gt=0, due_date__lt=timezone.localdate())

    sales = base.order_by("-created_at")[:200].prefetch_related("payments")
    return JsonResponse({
        "results": [debt_data(sale) for sale in sales],
        "summary": {
            "outstanding": currency(outstanding),
            "open_count": open_count,
            "overdue_count": overdue_count,
        },
        "limit": 200,
    })


@require_POST
@owner_only
def collect_debt(request, sale_id):
    try:
        payload = read_payload(request)
        if not isinstance(payload, dict) or set(payload) != {"client_ref", "amount", "method"}:
            raise ValueError("Informations de versement invalides.")
        client_ref = UUID(str(payload.get("client_ref")))
        value = amount(payload.get("amount"), "Versement")
        method = payload.get("method")
        if method not in Sale.PaymentMethod.values:
            raise ValueError("Moyen de paiement invalide.")
    except (ValueError, TypeError) as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    previous = SalePayment.objects.filter(client_ref=client_ref).first()
    if previous:
        if previous.sale_id != sale_id or previous.amount != value or previous.method != method:
            return JsonResponse({"detail": "Cette référence de versement a déjà été utilisée."}, status=409)
        return JsonResponse({"debt": debt_data(previous.sale), "payment": payment_data(previous), "replayed": True}, status=200)

    try:
        with transaction.atomic():
            sale = Sale.objects.select_for_update().get(pk=sale_id)
            if not sale.customer_name or not sale.customer_phone or sale.balance <= 0:
                raise ValueError("Cette vente n'a pas de créance à encaisser.")
            if value > sale.balance:
                raise ValueError("Le versement dépasse le montant restant dû.")
            payment = SalePayment.objects.create(
                sale=sale, client_ref=client_ref, amount=value, method=method
            )
            sale.amount_paid += value
            sale.balance -= value
            if sale.balance == 0:
                sale.status = Sale.Status.PAID
            sale.save(update_fields=["amount_paid", "balance", "status"])
    except Sale.DoesNotExist:
        return JsonResponse({"detail": "Créance introuvable."}, status=404)
    except IntegrityError:
        previous = SalePayment.objects.filter(client_ref=client_ref).first()
        if previous and previous.sale_id == sale_id and previous.amount == value and previous.method == method:
            return JsonResponse({"debt": debt_data(previous.sale), "payment": payment_data(previous), "replayed": True})
        return JsonResponse({"detail": "Versement déjà enregistré."}, status=409)
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=409)
    return JsonResponse({"debt": debt_data(sale), "payment": payment_data(payment), "replayed": False}, status=201)
