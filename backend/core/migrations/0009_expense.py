from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0008_shopbranding_invoice"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name="Expense",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("client_ref", models.UUIDField(unique=True)),
                ("label", models.CharField(max_length=160)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("spent_on", models.DateField()),
                ("note", models.CharField(blank=True, max_length=240)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="store_expenses", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-spent_on", "-created_at"]},
        ),
    ]
