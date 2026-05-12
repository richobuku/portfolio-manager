"""
Create a read-only viewer account.

Viewers can log in and see all data but cannot create, edit, or delete
anything. They have no BGE profile and no programme-manager role.

Usage:
    python manage.py create_viewer --username viewer1 --email viewer@example.com [--name "Full Name"] [--send-email]

Re-running is safe — if the username already exists the password is NOT reset
unless you pass --reset-password.
"""
import secrets
import string

from django.contrib.auth.models import User
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


def _random_password(length=16):
    chars = string.ascii_letters + string.digits + '!@#$%^&*'
    return ''.join(secrets.choice(chars) for _ in range(length))


class Command(BaseCommand):
    help = 'Create a read-only viewer account'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True)
        parser.add_argument('--email',    required=True)
        parser.add_argument('--name',     default='', help='Full name (optional)')
        parser.add_argument('--send-email',     action='store_true', help='Email the temporary password')
        parser.add_argument('--reset-password', action='store_true', help='Reset password if account already exists')

    def handle(self, *args, **options):
        username  = options['username']
        email     = options['email']
        name      = options['name']
        send_mail = options['send_email']
        reset_pw  = options['reset_password']

        first, *rest = (name.split(' ', 1) if name else ['', ''])
        last = rest[0] if rest else ''

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email':      email,
                'first_name': first,
                'last_name':  last,
                'is_active':  True,
                'is_staff':   False,
                'is_superuser': False,
            },
        )

        if created or reset_pw:
            temp_pw = _random_password()
            user.set_password(temp_pw)
            user.save()
            action = 'Created' if created else 'Password reset for'
            self.stdout.write(self.style.SUCCESS(
                f'{action} viewer account: {username}  (temp password: {temp_pw})'
            ))
            if send_mail and user.email:
                self._send_welcome(user, temp_pw)
        else:
            self.stdout.write(f'Viewer account "{username}" already exists — skipped (pass --reset-password to change password).')

        # Make sure there is no BGE profile linking (viewer = no profile)
        try:
            profile = user.bge_profile
            self.stdout.write(self.style.WARNING(
                f'WARNING: {username} already has a BGE profile ({profile.name}). '
                'A viewer with a BGE profile will be treated as a BGE, not a viewer.'
            ))
        except Exception:
            pass

    def _send_welcome(self, user, temp_pw):
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        name = f'{user.first_name} {user.last_name}'.strip() or user.username
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px">
          <h2 style="color:#1A2F4B">PRUDEV II — Viewer Access</h2>
          <p>Dear {name},</p>
          <p>A read-only viewer account has been created for you. You can log in at:</p>
          <p><a href="{frontend_url}" style="color:#C8102E">{frontend_url}</a></p>
          <table style="margin:16px 0;border-collapse:collapse">
            <tr><td style="padding:4px 12px 4px 0;color:#666">Username</td>
                <td style="padding:4px 0;font-weight:700">{user.username}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666">Temporary password</td>
                <td style="padding:4px 0;font-weight:700">{temp_pw}</td></tr>
          </table>
          <p>This account has view-only access. Please change your password after first login.</p>
          <p style="color:#666;font-size:13px">PRUDEV II Programme · GOPA AFC / GIZ</p>
        </div>"""
        msg = EmailMultiAlternatives(
            subject='PRUDEV II — Your Viewer Account',
            body=f'Username: {user.username}\nTemp password: {temp_pw}\nLogin: {frontend_url}',
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        msg.attach_alternative(html, 'text/html')
        try:
            msg.send()
            self.stdout.write(f'  Welcome email sent to {user.email}')
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f'  Email failed: {exc}'))
