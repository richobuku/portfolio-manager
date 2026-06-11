import os
import secrets
import string

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User


def _random_password(length=16):
    chars = string.ascii_letters + string.digits + '!@#$%^&*'
    return ''.join(secrets.choice(chars) for _ in range(length))


class Command(BaseCommand):
    help = 'Create default superuser if none exists'

    def handle(self, *args, **kwargs):
        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write('Superuser already exists — skipping.')
            return

        username = os.environ.get('ADMIN_USERNAME', 'admin')
        email    = os.environ.get('ADMIN_EMAIL', 'admin@prudev.ug')
        password = os.environ.get('ADMIN_PASSWORD')

        generated = password is None
        if generated:
            password = _random_password()

        User.objects.create_superuser(username=username, password=password, email=email)
        self.stdout.write(self.style.SUCCESS(
            f'Superuser created: username={username}'
        ))
        if generated:
            self.stdout.write(self.style.WARNING(
                f'No ADMIN_PASSWORD set — generated a random password: {password}\n'
                'Log in and change it immediately, or set ADMIN_PASSWORD and recreate the account.'
            ))
