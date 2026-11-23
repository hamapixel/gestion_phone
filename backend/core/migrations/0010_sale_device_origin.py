from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0009_expense")]
    operations = [
        migrations.AddField(
            model_name="sale",
            name="origin",
            field=models.CharField(
                choices=[("online", "En ligne"), ("offline", "Synchronisée")],
                default="online", max_length=8,
            ),
        ),
        migrations.AddField(
            model_name="sale",
            name="device_ref",
            field=models.UUIDField(blank=True, null=True),
        ),
    ]
