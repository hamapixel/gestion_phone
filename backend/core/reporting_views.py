"""Phase 07: operating results by period, owner expenses and actionable notifications."""
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods

from .catalog_views import amount, clean_text, owner_only, read_payload
from .models import Expense, Product, Sale, SaleLine, SalePayment
from .sale_views import currency

ZERO = Decimal("0.00")
MAX_REPORT_DAYS = 3660


def choose_period(request):
    today = timezone.localdate()
    period = request.GET.get("period", "month")
    if period == "today":
        start = end = today
    elif period == "week":
        start = today - timedelta(days=today.weekday())
        end = today
    elif period == "month":
        start = today.replace(day=1)
        end = today
    elif period == "year":
        start = today.replace(month=1, day=1)
        end = today
    elif period == "custom":
        try:
            start = date.fromisoformat(request.GET["start"])
            end = date.fromisoformat(request.GET["end"])
        except (ValueError, KeyError):
            raise ValueError("Dates de début et de fin obligatoires (AAAA-MM-JJ).")
        if end < start or (end - start).days > MAX_REPORT_DAYS:
            raise ValueError("Période invalide (10 ans maximum).")
    else:
        raise ValueError("Période inconnue : aujourd'hui, semaine, mois, année ou dates.")
    return period, start, end


def expense_data(item):
    return {
        "id": str(item.id), "client_ref": str(item.client_ref),
        "label": item.label, "amount": currency(item.amount),
        "spent_on": item.spent_on.isoformat(), "note": item.note,
        "created_at": item.created_at.isoformat(),
    }


@require_http_methods(["GET", "POST"])
@owner_only
def expenses(request):
    if request.method == "GET":
        try:
            period, start, end = choose_period(request)
        except ValueError as exc:
            return JsonResponse({"detail": str(exc)}, status=400)
        items = Expense.objects.filter(spent_on__range=(start, end)).order_by("-spent_on", "-created_at")
        total = items.aggregate(value=Sum("amount"))["value"] or ZERO
        return JsonResponse({
            "results": [expense_data(item) for item in items[:200]],
            "period": period, "start": start.isoformat(), "end": end.isoformat(),
            "total": currency(total), "limit": 200,
        })

    try:
        data = read_payload(request)
        if set(data) != {"client_ref", "label", "amount", "spent_on", "note"}:
            raise ValueError("Informations de dépense invalides.")
        client_ref = UUID(str(data["client_ref"]))
        label = clean_text(data["label"], "Motif de dépense", 160, required=True)
        value = amount(data["amount"], "Dépense")
        note = clean_text(data["note"], "Note", 240)
        spent_on = date.fromisoformat(data["spent_on"])
        if spent_on > timezone.localdate() + timedelta(days=366):
            raise ValueError("Date de dépense trop éloignée.")
    except (ValueError, TypeError, KeyError) as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    previous = Expense.objects.filter(client_ref=client_ref).first()
    if previous:
        same = (previous.label == label and previous.amount == value
                and previous.note == note and previous.spent_on == spent_on)
        if not same:
            return JsonResponse({"detail": "Référence de dépense déjà utilisée."}, status=409)
        return JsonResponse({"expense": expense_data(previous), "replayed": True}, status=200)
    try:
        with transaction.atomic():
            item = Expense.objects.create(
                client_ref=client_ref, owner=request.user,
                label=label, amount=value, spent_on=spent_on, note=note,
            )
    except IntegrityError:
        previous = Expense.objects.filter(client_ref=client_ref).first()
        if previous and (previous.label, previous.amount, previous.note, previous.spent_on) == (
            label, value, note, spent_on
        ):
            return JsonResponse({"expense": expense_data(previous), "replayed": True})
        return JsonResponse({"detail": "Dépense déjà enregistrée."}, status=409)
    return JsonResponse({"expense": expense_data(item), "replayed": False}, status=201)


@require_GET
@owner_only
def reports(request):
    try:
        period, start, end = choose_period(request)
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    sales = Sale.objects.filter(created_at__date__range=(start, end))
    total_values = sales.aggregate(
        sales_count=Count("pk"), revenue=Sum("total"),
        cost=Sum("cost_total"), gross_profit=Sum("gross_profit"),
    )
    # Cash is grouped by the collection date, independently of when a sale happened.
    collected = SalePayment.objects.filter(
        created_at__date__range=(start, end)
    ).aggregate(total=Sum("amount"))["total"] or ZERO
    spent = Expense.objects.filter(spent_on__range=(start, end)).aggregate(
        total=Sum("amount")
    )["total"] or ZERO
    gross = total_values["gross_profit"] or ZERO

    lines = SaleLine.objects.filter(
        sale__created_at__date__range=(start, end)
    ).values("product_id", "product_name").annotate(
        quantity=Sum("quantity"), revenue=Sum("line_total"), profit=Sum("line_total") - Sum("line_cost")
    ).order_by("-revenue", "product_name")[:50]

    # Trend by sale date, not by cash collection date.
    from django.db.models.functions import TruncDate
    chart = sales.annotate(day=TruncDate("created_at")).values("day").annotate(
        revenue=Sum("total"), gross_profit=Sum("gross_profit")
    ).order_by("day")[:366]

    return JsonResponse({
        "period": period, "start": start.isoformat(), "end": end.isoformat(),
        "summary": {
            "sales_count": total_values["sales_count"] or 0,
            "revenue": currency(total_values["revenue"] or ZERO),
            "purchase_cost_of_sold_items": currency(total_values["cost"] or ZERO),
            "gross_profit": currency(gross),
            "expenses": currency(spent),
            "operating_result": currency(gross - spent),
            "collected": currency(collected),
            "receivable_from_period_sales": currency(sales.aggregate(total=Sum("balance"))["total"] or ZERO),
        },
        "products": [
            {
                "product_id": str(line["product_id"]),
                "product_name": line["product_name"],
                "quantity": line["quantity"],
                "revenue": currency(line["revenue"]),
                "gross_profit": currency(line["profit"]),
            }
            for line in lines
        ],
        "daily": [
            {"date": item["day"].isoformat(),
             "revenue": currency(item["revenue"]),
             "gross_profit": currency(item["gross_profit"])}
            for item in chart
        ],
        "limit": {"products": 50, "days": 366},
    })


@require_GET
@owner_only
def notifications(request):
    today = timezone.localdate()
    items = []
    queryset = Product.objects.annotate(
        ready_phones=Count("phone_units", filter=Q(phone_units__sold=False))
    ).order_by("name")
    for product in queryset:
        quantity = product.ready_phones if product.category == Product.Category.PHONE else product.quantity
        if quantity <= product.low_stock_threshold:
            items.append({
                "id": "stock-" + str(product.id), "kind": "stock",
                "level": "warning" if quantity == 0 else "info",
                "title": "Stock épuisé" if quantity == 0 else "Stock faible",
                "description": product.name + (
                    (" — " + product.brand + " " + product.model).strip() if product.category == Product.Category.PHONE else ""
                ) + " : " + str(quantity) + " unité(s) disponible(s)",
                "target": "products",
            })
    overdue = Sale.objects.filter(
        balance__gt=0, due_date__lt=today
    ).order_by("due_date")
    for debt in overdue:
        items.append({
            "id": "late-" + str(debt.id), "kind": "debt",
            "level": "warning", "title": "Créance en retard",
            "description": debt.customer_name + " — " + currency(debt.balance) + " à recevoir",
            "target": "debts",
        })
    upcoming = Sale.objects.filter(
        balance__gt=0, due_date__gte=today,
        due_date__lte=today + timedelta(days=3)
    ).order_by("due_date")
    for debt in upcoming:
        items.append({
            "id": "due-" + str(debt.id), "kind": "debt",
            "level": "info", "title": "Créance à échéance proche",
            "description": debt.customer_name + " — " + currency(debt.balance) + " à recevoir",
            "target": "debts",
        })
    return JsonResponse({
        "results": items[:100], "count": len(items), "limit": 100,
        "generated_at": timezone.now().isoformat(),
        "mode": "consultation",  # No background pushes yet; evaluated on each visit.
    })
