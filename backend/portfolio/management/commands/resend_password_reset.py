from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Resend password reset email for specified users or all users'

    def add_arguments(self, parser):
        parser.add_argument('-e', '--email', action='append', help='Email address to send reset for. Repeatable.')
        parser.add_argument('--all', action='store_true', help='Send reset email to all users')

    def handle(self, *args, **options):
        emails = options.get('email') or []
        send_all = options.get('all')

        if not settings.GMAIL_APP_PASSWORD and not getattr(settings, 'EMAIL_HOST', None):
            self.stderr.write('SMTP not configured (GMAIL_APP_PASSWORD or EMAIL_HOST missing). Aborting.')
            return

        users_qs = User.objects.none()
        if send_all:
            users_qs = User.objects.filter(is_active=True, email__isnull=False).exclude(email='')
        elif emails:
            users_qs = User.objects.filter(email__in=emails)
        else:
            self.stderr.write('Provide --email EMAIL or --all. Nothing to do.')
            return

        token_gen = PasswordResetTokenGenerator()
        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://bds.glowi.africa')

        sent = 0
        failed = 0
        for user in users_qs:
            try:
                uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
                token = token_gen.make_token(user)
                reset_link = f"{frontend_url}/reset-password?uid={uidb64}&token={token}"

                html = f"""
                <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px">
                  <h2 style="color:#1A2F4B">Password Reset — PRUDEV II</h2>
                  <p>Click the button below to reset your password. This link expires after use.</p>
                  <a href="{reset_link}" style="display:inline-block;margin:20px 0;padding:12px 28px;
                     background:#C8102E;color:#fff;border-radius:6px;text-decoration:none;font-weight:700">
                    Reset Password
                  </a>
                  <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
                </div>"""

                msg = EmailMultiAlternatives(
                    subject='PRUDEV II — Password Reset',
                    body=f'Reset your password: {reset_link}',
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[user.email],
                    reply_to=[getattr(settings, 'EMAIL_REPLY_TO', settings.DEFAULT_FROM_EMAIL)],
                )
                msg.attach_alternative(html, 'text/html')
                msg.send()
                sent += 1
                self.stdout.write(self.style.SUCCESS(f'Sent reset to {user.email}'))
            except Exception as exc:
                failed += 1
                logger.exception('Failed to send reset to %s', user.email)
                self.stderr.write(f'Failed to send to {user.email}: {exc}')

        self.stdout.write(self.style.SUCCESS(f'Done. Sent: {sent}. Failed: {failed}'))
