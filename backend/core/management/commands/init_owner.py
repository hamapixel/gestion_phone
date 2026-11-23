"""Initialisation interactive du seul compte propriétaire."""
from getpass import getpass

from django.contrib.auth import get_user_model, password_validation
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Créer le compte du propriétaire unique (première installation uniquement)."

    def handle(self, *args, **options):
        User = get_user_model()
        with transaction.atomic():
            if User.objects.select_for_update().exists():
                raise CommandError("Un compte existe déjà. Utilise reset_owner_password.")
            username = input("Téléphone ou email de connexion : ").strip().lower()
            email = input("Email de récupération (facultatif) : ").strip().lower()
            if not username or len(username) > 150:
                raise CommandError("Identifiant obligatoire (150 caractères maximum).")
            if email and "@" not in email:
                raise CommandError("Email invalide.")
            password = getpass("Mot de passe fort (minimum 12 caractères) : ")
            confirmation = getpass("Confirmer le mot de passe : ")
            if password != confirmation:
                raise CommandError("Les mots de passe ne correspondent pas.")
            candidate = User(username=username, email=email)
            try:
                password_validation.validate_password(password, user=candidate)
            except Exception as exc:
                raise CommandError(str(exc)) from exc
            User.objects.create_superuser(username=username, email=email, password=password)
        self.stdout.write(self.style.SUCCESS("Compte propriétaire créé. Connecte-toi sur PhoneStock Pro."))
