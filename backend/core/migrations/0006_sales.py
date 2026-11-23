from django.conf import settings
from django.db import migrations, models
from django.db.models import Q
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0005_purchases"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

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
                    ("sale", "Vente en caisse"),
                ],
                max_length=12,
            ),
        ),
        migrations.CreateModel(
            name="Sale",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("client_ref", models.UUIDField(unique=True)),
                ("payload_hash", models.CharField(max_length=64)),
                ("customer_name", models.CharField(blank=True, max_length=160)),
                ("customer_phone", models.CharField(blank=True, max_length=30)),
                ("due_date", models.DateField(blank=True, null=True)),
                ("method", models.CharField(choices=[("cash", "Espèces"), ("orange", "Orange Money"), ("moov", "Moov Money"), ("transfer", "Virement")], max_length=10)),
                ("status", models.CharField(choices=[("paid", "Payée"), ("credit", "Créance à recevoir")], max_length=8)),
                ("total", models.DecimalField(decimal_places=2, max_digits=15)),
                ("cost_total", models.DecimalField(decimal_places=2, max_digits=15)),
                ("gross_profit", models.DecimalField(decimal_places=2, max_digits=15)),
                ("amount_paid", models.DecimalField(decimal_places=2, max_digits=15)),
                ("balance", models.DecimalField(decimal_places=2, max_digits=15)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="store_sales", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="SaleLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("quantity", models.PositiveIntegerField()),
                ("product_name", models.CharField(max_length=160)),
                ("product_brand", models.CharField(blank=True, max_length=70)),
                ("product_model", models.CharField(blank=True, max_length=70)),
                ("product_condition", models.CharField(default="new", max_length=4)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("unit_cost", models.DecimalField(decimal_places=2, max_digits=12)),
                ("line_total", models.DecimalField(decimal_places=2, max_digits=15)),
                ("line_cost", models.DecimalField(decimal_places=2, max_digits=15)),
                ("phone_unit", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="sale_lines", to="core.phoneunit")),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="sale_lines", to="core.product")),
                ("sale", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="lines", to="core.sale")),
            ],
        ),
        migrations.AddConstraint(
            model_name="saleline",
            constraint=models.UniqueConstraint(
                condition=Q(phone_unit__isnull=False),
                fields=("phone_unit",), name="one_sale_per_phone_unit",
            ),
        ),
        migrations.CreateModel(
            name="SalePayment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=15)),
                ("method", models.CharField(choices=[("cash", "Espèces"), ("orange", "Orange Money"), ("moov", "Moov Money"), ("transfer", "Virement")], max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("sale", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="payments", to="core.sale")),
            ],
        ),
    ]
