"""Réinitialisation locale par l'administrateur du poste, sans email ni secret en ligne de commande."""
from getpass import getpass

from django.contrib.auth import get_user_model, password_validation
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Réinitialiser de façon interactive le mot de passe du propriétaire."

    def handle(self, *args, **options):
        User = get_user_model()
        owners = User.objects.filter(is_superuser=True, is_active=True)
        if owners.count() != 1:
            raise CommandError("Il faut exactement un propriétaire actif.")
        owner = owners.get()
        password = getpass("Nouveau mot de passe : ")
        confirmation = getpass("Confirmer le nouveau mot de passe : ")
        if password != confirmation:
            raise CommandError("Les mots de passe ne correspondent pas.")
        try:
            password_validation.validate_password(password, user=owner)
        except Exception as exc:
            raise CommandError(str(exc)) from exc
        owner.set_password(password)
        owner.save(update_fields=["password"])
        self.stdout.write(self.style.SUCCESS("Mot de passe modifié. Les anciennes sessions ne sont plus valides."))
