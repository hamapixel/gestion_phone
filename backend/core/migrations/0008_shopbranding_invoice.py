from django.db import migrations, models
import django.db.models.deletion
import uuid


def create_default_branding(apps, schema_editor):
    ShopBranding = apps.get_model("core", "ShopBranding")
    ShopConfig = apps.get_model("core", "ShopConfig")
    Sale = apps.get_model("core", "Sale")
    default = ShopBranding.objects.create(
        name="PhoneStock Pro", footer="Merci pour votre confiance."
    )
    ShopConfig.objects.create(id=1, branding=default)
    # Legacy sales did not have a heading. They receive the initial default heading
    # once, so later customization never changes their already-created documents.
    Sale.objects.filter(branding__isnull=True).update(branding=default)


class Migration(migrations.Migration):
    dependencies = [("core", "0007_salepayment_client_ref")]
    operations = [
        migrations.CreateModel(
            name="ShopBranding",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=160)),
                ("phone", models.CharField(blank=True, max_length=40)),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("address", models.CharField(blank=True, max_length=240)),
                ("tax_id", models.CharField(blank=True, max_length=90)),
                ("footer", models.CharField(blank=True, max_length=240)),
                ("logo_data", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="ShopConfig",
            fields=[
                ("id", models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ("branding", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="+", to="core.shopbranding")),
            ],
        ),
        migrations.AddField(
            model_name="sale",
            name="branding",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="sales", to="core.shopbranding"),
        ),
        migrations.RunPython(create_default_branding, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="sale",
            name="branding",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="sales", to="core.shopbranding"),
        ),
    ]
