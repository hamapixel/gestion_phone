from django.urls import path
from core.views import health, meta
from core.auth_views import csrf_token, owner_session, owner_login, owner_logout
from core.catalog_views import products, add_imei, adjust_stock, product_detail
from core.purchase_views import suppliers, purchases
from core.sale_views import sales, sale_detail
from core.debt_views import debts, collect_debt

urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/meta/", meta, name="meta"),
    path("api/auth/csrf/", csrf_token, name="auth-csrf"),
    path("api/auth/session/", owner_session, name="auth-session"),
    path("api/auth/login/", owner_login, name="auth-login"),
    path("api/auth/logout/", owner_logout, name="auth-logout"),
    path("api/products/", products, name="products"),
    path("api/suppliers/", suppliers, name="suppliers"),
    path("api/purchases/", purchases, name="purchases"),
    path("api/sales/", sales, name="sales"),
    path("api/debts/", debts, name="debts"),
    path("api/debts/<uuid:sale_id>/payments/", collect_debt, name="debt-collect"),
    path("api/sales/<uuid:sale_id>/", sale_detail, name="sale-detail"),
    path("api/products/<uuid:product_id>/", product_detail, name="product-detail"),
    path("api/products/<uuid:product_id>/imeis/", add_imei, name="product-imeis"),
    path("api/products/<uuid:product_id>/stock/", adjust_stock, name="product-stock"),
]
