from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0002_catalog")]

    operations = [
        migrations.AddField(
            model_name="product",
            name="condition",
            field=models.CharField(
                choices=[("new", "Neuf"), ("used", "Occasion")],
                default="new",
                max_length=4,
            ),
        ),
    ]
