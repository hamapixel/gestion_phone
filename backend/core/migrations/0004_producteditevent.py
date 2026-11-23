from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [("core", "0003_product_condition")]
    operations = [
        migrations.CreateModel(
            name="ProductEditEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("changes", models.JSONField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="edit_events", to="core.product")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
