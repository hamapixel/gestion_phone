from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0006_sales")]
    operations = [
        migrations.AddField(
            model_name="salepayment",
            name="client_ref",
            field=models.UUIDField(blank=True, null=True, unique=True),
        ),
    ]
