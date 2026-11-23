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
