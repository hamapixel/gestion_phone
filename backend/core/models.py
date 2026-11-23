from django.db import models


class LoginThrottle(models.Model):
    """Compteurs persistants sans identifiants ou adresses IP en clair."""

    key = models.CharField(max_length=64, unique=True)
    failures = models.PositiveIntegerField(default=0)
    blocked_until = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return "LoginThrottle (protégé)"

import uuid
from django.db.models import Q


class Product(models.Model):
    class Category(models.TextChoices):
        PHONE = "phone", "Téléphone"
        CASE = "case", "Pochette"
        OTHER = "other", "Produit divers"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    category = models.CharField(max_length=8, choices=Category.choices)
    sku = models.CharField(max_length=60, blank=True)
    brand = models.CharField(max_length=70, blank=True)
    model = models.CharField(max_length=70, blank=True)
    class Condition(models.TextChoices):
        NEW = "new", "Neuf"
        USED = "used", "Occasion"

    condition = models.CharField(max_length=4, choices=Condition.choices, default=Condition.NEW)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2)
    sale_price = models.DecimalField(max_digits=12, decimal_places=2)
    # Phones are counted via individual PhoneUnit records, not this field.
    quantity = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.PositiveSmallIntegerField(default=3)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "name"]

    def __str__(self):
        return self.name


class PhoneUnit(models.Model):
    """Each physical phone is a separate stock unit."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="phone_units")
    sold = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class PhoneIdentifier(models.Model):
    """Global unique IMEI across primary and secondary SIM slots."""
    unit = models.ForeignKey(PhoneUnit, on_delete=models.CASCADE, related_name="identifiers")
    slot = models.PositiveSmallIntegerField()
    imei = models.CharField(max_length=15, unique=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["unit", "slot"], name="one_imei_per_sim_slot"),
            models.CheckConstraint(condition=Q(slot__in=[1, 2]), name="imei_slot_one_or_two"),
        ]


class StockMovement(models.Model):
    class Reason(models.TextChoices):
        OPENING = "opening", "Stock initial"
        ADJUSTMENT = "adjustment", "Correction manuelle"
        IMEI_ADDITION = "imei", "Enregistrement IMEI"
        PURCHASE = "purchase", "Achat fournisseur"
        SALE = "sale", "Vente en caisse"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="movements")
    delta = models.IntegerField()
    reason = models.CharField(max_length=12, choices=Reason.choices)
    note = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]



class ProductEditEvent(models.Model):
    """Immutable audit event for editable product fields; no stock mutation."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="edit_events")
    changes = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]



class Supplier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    normalized_name = models.CharField(max_length=160, unique=True)
    phone = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class PurchaseReceipt(models.Model):
    """Immutable receipt. Unique client_ref guarantees retry idempotency."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_ref = models.UUIDField(unique=True)
    payload_hash = models.CharField(max_length=64)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchases")
    total = models.DecimalField(max_digits=15, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class PurchaseLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(PurchaseReceipt, on_delete=models.PROTECT, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="purchase_lines")
    quantity = models.PositiveIntegerField()
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=15, decimal_places=2)
    phone_imeis = models.JSONField(default=list)



class Sale(models.Model):
    """Single-owner sale, immutable totals and request identity."""

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Espèces"
        ORANGE = "orange", "Orange Money"
        MOOV = "moov", "Moov Money"
        TRANSFER = "transfer", "Virement"

    class Status(models.TextChoices):
        PAID = "paid", "Payée"
        CREDIT = "credit", "Créance à recevoir"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_ref = models.UUIDField(unique=True)
    payload_hash = models.CharField(max_length=64)
    origin = models.CharField(max_length=8, default="online", choices=[("online", "En ligne"), ("offline", "Synchronisée")])
    device_ref = models.UUIDField(null=True, blank=True)
    owner = models.ForeignKey("auth.User", on_delete=models.PROTECT, related_name="store_sales")
    branding = models.ForeignKey("ShopBranding", on_delete=models.PROTECT, related_name="sales")
    customer_name = models.CharField(max_length=160, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)
    due_date = models.DateField(null=True, blank=True)
    method = models.CharField(max_length=10, choices=PaymentMethod.choices)
    status = models.CharField(max_length=8, choices=Status.choices)
    total = models.DecimalField(max_digits=15, decimal_places=2)
    cost_total = models.DecimalField(max_digits=15, decimal_places=2)
    gross_profit = models.DecimalField(max_digits=15, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2)
    balance = models.DecimalField(max_digits=15, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class SaleLine(models.Model):
    """Snapshot of price and cost at sale time; one physical phone per phone line."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="sale_lines")
    product_name = models.CharField(max_length=160)
    product_brand = models.CharField(max_length=70, blank=True)
    product_model = models.CharField(max_length=70, blank=True)
    product_condition = models.CharField(max_length=4, default="new")
    phone_unit = models.ForeignKey(
        PhoneUnit, on_delete=models.PROTECT, related_name="sale_lines",
        null=True, blank=True,
    )
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    line_total = models.DecimalField(max_digits=15, decimal_places=2)
    line_cost = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["phone_unit"], condition=Q(phone_unit__isnull=False),
                name="one_sale_per_phone_unit",
            ),
        ]


class SalePayment(models.Model):
    """Initial collection; future debt repayments use this payment ledger."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="payments")
    client_ref = models.UUIDField(unique=True, null=True, blank=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    method = models.CharField(max_length=10, choices=Sale.PaymentMethod.choices)
    created_at = models.DateTimeField(auto_now_add=True)



class ShopBranding(models.Model):
    """Immutable versioned invoice heading, including its optional validated raster logo."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=240, blank=True)
    tax_id = models.CharField(max_length=90, blank=True)
    footer = models.CharField(max_length=240, blank=True)
    logo_data = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ShopConfig(models.Model):
    """One active configuration per installation; old versions are preserved."""
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    branding = models.ForeignKey(ShopBranding, on_delete=models.PROTECT, related_name="+")



class Expense(models.Model):
    """Simple owner-only expense. Keeps an immutable record for profit reports."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_ref = models.UUIDField(unique=True)
    owner = models.ForeignKey("auth.User", on_delete=models.PROTECT, related_name="store_expenses")
    label = models.CharField(max_length=160)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    spent_on = models.DateField()
    note = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-spent_on", "-created_at"]
