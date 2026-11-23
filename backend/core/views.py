from django.http import JsonResponse
from django.views.decorators.http import require_GET

@require_GET
def health(request):
    return JsonResponse({"status": "ok", "service": "phonestock-api", "phase": "01"})

@require_GET
def meta(request):
    return JsonResponse({
        "application": "PhoneStock Pro",
        "phase": "01",
        "modules": {
            "dashboard": "prototype", "sales": "planned", "products": "planned",
            "purchases": "planned", "debts": "planned", "reports": "planned",
        },
    })
