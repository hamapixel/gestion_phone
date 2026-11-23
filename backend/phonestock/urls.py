from django.urls import path
from core.views import health, meta
from core.auth_views import csrf_token, owner_session, owner_login, owner_logout
from core.catalog_views import products, add_imei, adjust_stock

urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/meta/", meta, name="meta"),
    path("api/auth/csrf/", csrf_token, name="auth-csrf"),
    path("api/auth/session/", owner_session, name="auth-session"),
    path("api/auth/login/", owner_login, name="auth-login"),
    path("api/auth/logout/", owner_logout, name="auth-logout"),
    path("api/products/", products, name="products"),
    path("api/products/<uuid:product_id>/imeis/", add_imei, name="product-imeis"),
    path("api/products/<uuid:product_id>/stock/", adjust_stock, name="product-stock"),
]
