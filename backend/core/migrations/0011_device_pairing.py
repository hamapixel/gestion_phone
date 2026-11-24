import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0010_sale_device_origin"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(name="DesktopPairingCode", fields=[
            ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
            ("digest", models.CharField(max_length=64, unique=True)),
            ("expires_at", models.DateTimeField()),
            ("used_at", models.DateTimeField(null=True, blank=True)),
            ("created_at", models.DateTimeField(auto_now_add=True)),
            ("owner", models.ForeignKey(to=settings.AUTH_USER_MODEL,
                on_delete=django.db.models.deletion.CASCADE, related_name="pairing_codes")),
        ]),
        migrations.CreateModel(name="TrustedDesktop", fields=[
            ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
            ("device_ref", models.UUIDField()),
            ("label", models.CharField(max_length=80)),
            ("token_digest", models.CharField(max_length=64, unique=True)),
            ("expires_at", models.DateTimeField()),
            ("revoked_at", models.DateTimeField(null=True, blank=True)),
            ("created_at", models.DateTimeField(auto_now_add=True)),
            ("last_seen_at", models.DateTimeField(null=True, blank=True)),
            ("owner", models.ForeignKey(to=settings.AUTH_USER_MODEL,
                on_delete=django.db.models.deletion.CASCADE, related_name="trusted_desktops")),
        ], options={
            "constraints": [models.UniqueConstraint(fields=["owner", "device_ref"], name="unique_trusted_desktop")],
        }),
    ]
