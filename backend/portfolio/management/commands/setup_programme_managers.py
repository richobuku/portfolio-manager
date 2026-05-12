"""
Create the 'Green MSMEs' and 'Agroprocessors' cohorts and provision
programme-manager accounts for Jimmy Ouni and Gloria Arinaitwe.

Run once on production after deploying the 0032_cohort_admin_role migration:

    python manage.py setup_programme_managers

Re-running is safe — existing objects are left untouched.
"""
import secrets
import string
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from portfolio.models import ProgrammeGroup, CohortAdmin


MANAGERS = [
    {
        'first_name': 'Jimmy',
        'last_name': 'Ouni',
        'email': 'jimmy.ouni@gopa.eu',
        'username': 'jimmy.ouni',
    },
    {
        'first_name': 'Gloria',
        'last_name': 'Arinaitwe',
        'email': 'gloria.arinaitwe@gopa.eu',
        'username': 'gloria.arinaitwe',
    },
]

PROGRAMME_GROUPS = [
    {'name': 'Main',           'color': '#1A2F4B'},
    {'name': 'Green MSMEs',    'color': '#2E7D32'},
    {'name': 'Agroprocessing', 'color': '#E65100'},
]


def _random_password(length=16):
    chars = string.ascii_letters + string.digits + '!@#$%^&*'
    return ''.join(secrets.choice(chars) for _ in range(length))


class Command(BaseCommand):
    help = 'Create Green MSMEs / Agroprocessors cohorts and programme-manager accounts'

    def add_arguments(self, parser):
        parser.add_argument(
            '--send-email', action='store_true',
            help='Email each new account holder their temporary password',
        )

    def handle(self, *args, **options):
        send_email = options['send_email']

        # 1. Programme Groups
        for g in PROGRAMME_GROUPS:
            pg, created = ProgrammeGroup.objects.get_or_create(
                name=g['name'], defaults={'color': g['color']}
            )
            self.stdout.write(f'  ProgrammeGroup "{pg.name}" — {"created" if created else "already exists"}')

        # 2. User accounts + CohortAdmin profiles
        for mgr in MANAGERS:
            user, user_created = User.objects.get_or_create(
                username=mgr['username'],
                defaults={
                    'email': mgr['email'],
                    'first_name': mgr['first_name'],
                    'last_name': mgr['last_name'],
                    'is_active': True,
                    'is_staff': False,
                    'is_superuser': False,
                },
            )
            if user_created:
                temp_pw = _random_password()
                user.set_password(temp_pw)
                user.save()
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  Created user {user.username} — temp password: {temp_pw}'
                    )
                )
                if send_email and user.email:
                    self._send_welcome(user, temp_pw)
            else:
                temp_pw = None
                self.stdout.write(f'  User {user.username} — already exists, skipped')

            # Ensure CohortAdmin profile exists (but don't overwrite cohort assignments)
            ca, ca_created = CohortAdmin.objects.get_or_create(user=user)
            if ca_created:
                self.stdout.write(
                    f'  CohortAdmin profile created for {user.username}'
                    ' — assign cohorts via Django admin or the management panel'
                )
            else:
                self.stdout.write(
                    f'  CohortAdmin profile for {user.username} already exists'
                )

        self.stdout.write('')
        self.stdout.write(self.style.WARNING(
            'Next step: open Django admin → Programme Managers and assign '
            'each manager to their cohorts (Green MSMEs / Agroprocessors).'
        ))

    def _send_welcome(self, user, temp_pw):
        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://bds.glowi.africa')
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px">
          <h2 style="color:#1A2F4B">Welcome to PRUDEV II — Programme Manager Access</h2>
          <p>Dear {user.first_name},</p>
          <p>Your programme manager account has been created. You can log in at:</p>
          <p><a href="{frontend_url}" style="color:#C8102E">{frontend_url}</a></p>
          <table style="margin:16px 0;border-collapse:collapse">
            <tr><td style="padding:4px 12px 4px 0;color:#666">Username</td>
                <td style="padding:4px 0;font-weight:700">{user.username}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666">Temporary password</td>
                <td style="padding:4px 0;font-weight:700">{temp_pw}</td></tr>
          </table>
          <p>Please change your password after your first login.</p>
          <p style="color:#666;font-size:13px">PRUDEV II Programme · GOPA AFC / GIZ</p>
        </div>"""
        msg = EmailMultiAlternatives(
            subject='PRUDEV II — Your Programme Manager Account',
            body=f'Username: {user.username}\nTemporary password: {temp_pw}\nLogin: {frontend_url}',
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        msg.attach_alternative(html, 'text/html')
        try:
            msg.send()
            self.stdout.write(f'  Welcome email sent to {user.email}')
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f'  Email failed: {exc}'))
