from django.urls import path
from core.views import health, meta
from core.auth_views import csrf_token, owner_session, owner_login, owner_logout
from core.profile_views import owner_profile, owner_password
from core.catalog_views import products, add_imei, adjust_stock, product_detail
from core.purchase_views import suppliers, purchases
from core.sale_views import sales, sale_detail
from core.debt_views import debts, collect_debt, debt_payments
from core.invoice_views import shop, shop_identity, shop_manifest, invoice, payment_receipt
from core.reporting_views import expenses, reports, notifications

urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/meta/", meta, name="meta"),
    path("api/auth/csrf/", csrf_token, name="auth-csrf"),
    path("api/auth/session/", owner_session, name="auth-session"),
    path("api/auth/login/", owner_login, name="auth-login"),
    path("api/auth/logout/", owner_logout, name="auth-logout"),
    path("api/account/profile/", owner_profile, name="owner-profile"),
    path("api/account/password/", owner_password, name="owner-password"),
    path("api/products/", products, name="products"),
    path("api/suppliers/", suppliers, name="suppliers"),
    path("api/purchases/", purchases, name="purchases"),
    path("api/sales/", sales, name="sales"),
    path("api/debts/", debts, name="debts"),
    path("api/debt-payments/", debt_payments, name="debt-payments"),
    path("api/shop/", shop, name="shop"),
    path("api/shop/identity/", shop_identity, name="shop-identity"),
    path("api/shop/manifest.webmanifest", shop_manifest, name="shop-manifest"),
    path("api/expenses/", expenses, name="expenses"),
    path("api/reports/", reports, name="reports"),
    path("api/notifications/", notifications, name="notifications"),
    path("api/sales/<uuid:sale_id>/invoice/", invoice, name="sale-invoice"),
    path("api/payments/<uuid:payment_id>/receipt/", payment_receipt, name="payment-receipt"),
    path("api/debts/<uuid:sale_id>/payments/", collect_debt, name="debt-collect"),
    path("api/sales/<uuid:sale_id>/", sale_detail, name="sale-detail"),
    path("api/products/<uuid:product_id>/", product_detail, name="product-detail"),
    path("api/products/<uuid:product_id>/imeis/", add_imei, name="product-imeis"),
    path("api/products/<uuid:product_id>/stock/", adjust_stock, name="product-stock"),
]
