from django.contrib import admin
from django.urls import path
from core.views import health, meta

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/meta/", meta, name="meta"),
]
