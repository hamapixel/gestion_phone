from django.http import JsonResponse
from django.views.decorators.http import require_GET

@require_GET
def health(request):
    return JsonResponse({"status": "ok", "service": "phonestock-api", "phase": "07"})

@require_GET
def meta(request):
    return JsonResponse({
        "application": "PhoneStock Pro",
        "phase": "07",
        "modules": {
            "dashboard": "prototype", "authentication": "ready", "catalog": "ready",
            "sales": "ready", "products": "ready", "purchases": "ready",
            "debts": "ready", "reports": "ready", "expenses": "ready",
            "notifications": "ready",
        },
    })
