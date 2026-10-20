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
        # Ensure designated admin users like Jimmy Ouni have admin privileges
        jimmy = User.objects.filter(username='jimmy.ouni').first()
        if jimmy and (not jimmy.is_staff or not jimmy.is_superuser):
            jimmy.is_staff = True
            jimmy.is_superuser = True
            jimmy.save(update_fields=['is_staff', 'is_superuser'])
            self.stdout.write(self.style.SUCCESS('Ensured jimmy.ouni is staff and superuser.'))

        # Ensure Viewer group and reviewer accounts (Stephen & Mathias) have full read-only access
        from django.contrib.auth.models import Group
        from django.utils import timezone
        from portfolio.models import UserSecurityProfile

        viewer_group, _ = Group.objects.get_or_create(name='Viewer')

        # Mathias
        mathias_user = User.objects.filter(username__iexact='mathias').first() or User.objects.filter(email__iexact='mathias@gopa.eu').first()
        if not mathias_user:
            mathias_user = User.objects.create(
                username='mathias',
                email='mathias@gopa.eu',
                first_name='Mathias',
                last_name='Arimpa',
                is_active=True,
            )
            mathias_user.set_unusable_password()
            mathias_user.save()
        mathias_user.is_active = True
        mathias_user.save(update_fields=['is_active'])
        mathias_user.groups.add(viewer_group)
        sec_m, _ = UserSecurityProfile.objects.get_or_create(user=mathias_user)
        sec_m.viewer_approved = True
        sec_m.must_change_password = False
        sec_m.password_last_changed = timezone.now()
        sec_m.save(update_fields=['viewer_approved', 'must_change_password', 'password_last_changed'])

        # Stephen
        for stephen_u in User.objects.filter(
            username__in=['stephen.opwonya', 'Stephen', 'stephen']
        ) | User.objects.filter(
            email__in=['stephenmaxi.opwonya@gopa.eu', 'stephen.opwonyamaxi@gopa.eu']
        ):
            stephen_u.is_active = True
            stephen_u.save(update_fields=['is_active'])
            stephen_u.groups.add(viewer_group)
            sec_s, _ = UserSecurityProfile.objects.get_or_create(user=stephen_u)
            sec_s.viewer_approved = True
            sec_s.must_change_password = False
            sec_s.password_last_changed = timezone.now()
            sec_s.save(update_fields=['viewer_approved', 'must_change_password', 'password_last_changed'])

        self.stdout.write(self.style.SUCCESS('Ensured Stephen and Mathias reviewer accounts are in Viewer group with full view access.'))

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
