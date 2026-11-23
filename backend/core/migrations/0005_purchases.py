from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [("core", "0004_producteditevent")]
    operations = [
        migrations.AlterField(
            model_name="stockmovement",
            name="reason",
            field=models.CharField(
                choices=[
                    ("opening", "Stock initial"),
                    ("adjustment", "Correction manuelle"),
                    ("imei", "Enregistrement IMEI"),
                    ("purchase", "Achat fournisseur"),
                ], max_length=12
            ),
        ),
        migrations.CreateModel(
            name="Supplier",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=160)),
                ("normalized_name", models.CharField(max_length=160, unique=True)),
                ("phone", models.CharField(blank=True, max_length=30)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="PurchaseReceipt",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("client_ref", models.UUIDField(unique=True)),
                ("payload_hash", models.CharField(max_length=64)),
                ("total", models.DecimalField(decimal_places=2, max_digits=15)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("supplier", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="purchases", to="core.supplier")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="PurchaseLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("quantity", models.PositiveIntegerField()),
                ("unit_cost", models.DecimalField(decimal_places=2, max_digits=12)),
                ("total", models.DecimalField(decimal_places=2, max_digits=15)),
                ("phone_imeis", models.JSONField(default=list)),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="purchase_lines", to="core.product")),
                ("receipt", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="lines", to="core.purchasereceipt")),
            ],
        ),
    ]
