from django.db import migrations, models
import django.db.models.deletion
import uuid
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("core", "0001_loginthrottle")]
    operations = [
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=160)),
                ("category", models.CharField(choices=[("phone", "Téléphone"), ("case", "Pochette"), ("other", "Produit divers")], max_length=8)),
                ("sku", models.CharField(blank=True, max_length=60)),
                ("brand", models.CharField(blank=True, max_length=70)),
                ("model", models.CharField(blank=True, max_length=70)),
                ("purchase_price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("sale_price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("quantity", models.PositiveIntegerField(default=0)),
                ("low_stock_threshold", models.PositiveSmallIntegerField(default=3)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-created_at", "name"]},
        ),
        migrations.CreateModel(
            name="PhoneUnit",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("sold", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="phone_units", to="core.product")),
            ],
        ),
        migrations.CreateModel(
            name="PhoneIdentifier",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slot", models.PositiveSmallIntegerField()),
                ("imei", models.CharField(max_length=15, unique=True)),
                ("unit", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="identifiers", to="core.phoneunit")),
            ],
        ),
        migrations.AddConstraint(
            model_name="phoneidentifier",
            constraint=models.UniqueConstraint(fields=("unit", "slot"), name="one_imei_per_sim_slot"),
        ),
        migrations.AddConstraint(
            model_name="phoneidentifier",
            constraint=models.CheckConstraint(condition=Q(slot__in=[1, 2]), name="imei_slot_one_or_two"),
        ),
        migrations.CreateModel(
            name="StockMovement",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("delta", models.IntegerField()),
                ("reason", models.CharField(choices=[("opening", "Stock initial"), ("adjustment", "Correction manuelle"), ("imei", "Enregistrement IMEI")], max_length=12)),
                ("note", models.CharField(blank=True, max_length=240)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="movements", to="core.product")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
