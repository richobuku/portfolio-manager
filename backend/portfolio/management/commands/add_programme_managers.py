"""
Add/update programme-manager accounts for Rosemary Laker, Harriet Daisy Amule,
and Gloria Arinaitwe.  All three are assigned to every existing ProgrammeGroup
so they can see the full MSME list.

Usage:
    python manage.py add_programme_managers              # create accounts, print passwords
    python manage.py add_programme_managers --send-email # also email credentials to each person

Re-running is safe — existing accounts are not overwritten (pass --reset-password
to force a new password for any account that already exists).
"""
import secrets
import string

from django.contrib.auth.models import User
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.core.management.base import BaseCommand

from portfolio.models import CohortAdmin, ProgrammeGroup


MANAGERS = [
    {
        'first_name': 'Rosemary',
        'last_name':  'Laker',
        'email':      'rosemary.laker@gopa.eu',
        'username':   'rosemary.laker',
    },
    {
        'first_name': 'Harriet Daisy',
        'last_name':  'Amule',
        'email':      'harrietdaisy.amule@gopa.eu',
        'username':   'harrietdaisy.amule',
    },
    {
        'first_name': 'Gloria',
        'last_name':  'Arinaitwe',
        'email':      'gloria.arinaitwe@gopa.eu',
        'username':   'gloria.arinaitwe',
    },
]


def _random_password(length=16):
    chars = string.ascii_letters + string.digits + '!@#$%^&*'
    return ''.join(secrets.choice(chars) for _ in range(length))


class Command(BaseCommand):
    help = 'Create / update programme-manager accounts for Rosemary, Harriet and Gloria'

    def add_arguments(self, parser):
        parser.add_argument('--send-email',     action='store_true',
                            help='Email credentials to each person')
        parser.add_argument('--reset-password', action='store_true',
                            help='Generate a new password even if the account already exists')

    def handle(self, *args, **options):
        send_email  = options['send_email']
        reset_pw    = options['reset_password']

        all_groups = list(ProgrammeGroup.objects.all())
        if not all_groups:
            self.stdout.write(self.style.WARNING(
                'No ProgrammeGroups found — creating the default set.'
            ))
            for name, color in [('Main', '#1A2F4B'), ('Green MSMEs', '#2E7D32'), ('Agroprocessing', '#E65100')]:
                pg, _ = ProgrammeGroup.objects.get_or_create(name=name, defaults={'color': color})
                all_groups.append(pg)

        group_names = ', '.join(g.name for g in all_groups)
        self.stdout.write(f'Assigning to groups: {group_names}\n')

        for mgr in MANAGERS:
            user, created = User.objects.get_or_create(
                username=mgr['username'],
                defaults={
                    'email':      mgr['email'],
                    'first_name': mgr['first_name'],
                    'last_name':  mgr['last_name'],
                    'is_active':  True,
                    'is_staff':   False,
                    'is_superuser': False,
                },
            )

            if created or reset_pw:
                temp_pw = _random_password()
                user.set_password(temp_pw)
                # Keep email / name up-to-date even on existing accounts
                user.email      = mgr['email']
                user.first_name = mgr['first_name']
                user.last_name  = mgr['last_name']
                user.save()
                action = 'Created' if created else 'Password reset for'
                self.stdout.write(self.style.SUCCESS(
                    f'  {action}: {user.username}   password: {temp_pw}'
                ))
                if send_email and user.email:
                    self._send_welcome(user, temp_pw, created)
            else:
                temp_pw = None
                self.stdout.write(f'  Existing account kept: {user.username}  (pass --reset-password to change password)')

            # Ensure CohortAdmin profile exists and covers all groups
            ca, _ = CohortAdmin.objects.get_or_create(user=user)
            ca.managed_groups.set(all_groups)
            ca.save()
            self.stdout.write(f'    → Programme Manager role confirmed, groups: {group_names}')

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Done.'))

    def _send_welcome(self, user, temp_pw, is_new):
        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://bds.glowi.africa')
        name = f'{user.first_name} {user.last_name}'.strip() or user.username
        subject = 'PRUDEV II — Your Programme Manager Account' if is_new else 'PRUDEV II — Password Reset'
        heading = 'Welcome to PRUDEV II' if is_new else 'Your PRUDEV II password has been reset'
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px">
          <h2 style="color:#1A2F4B">{heading}</h2>
          <p>Dear {name},</p>
          <p>{"Your programme manager account has been created on the PRUDEV II BDS platform." if is_new else "Your password has been reset."}</p>
          <p>Log in at: <a href="{frontend_url}" style="color:#C8102E">{frontend_url}</a></p>
          <table style="margin:16px 0;border-collapse:collapse">
            <tr><td style="padding:4px 16px 4px 0;color:#666">Username</td>
                <td style="padding:4px 0;font-weight:700">{user.username}</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#666">Temporary password</td>
                <td style="padding:4px 0;font-weight:700">{temp_pw}</td></tr>
          </table>
          <p>As a Programme Manager you can view all MSMEs, reports, BGE activity,
             and programme analytics. Please change your password after first login.</p>
          <p style="color:#888;font-size:12px;margin-top:24px">PRUDEV II Programme · GOPA AFC / GIZ Uganda</p>
        </div>"""
        msg = EmailMultiAlternatives(
            subject=subject,
            body=f'Username: {user.username}\nTemporary password: {temp_pw}\nLogin: {frontend_url}',
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        msg.attach_alternative(html, 'text/html')
        try:
            msg.send()
            self.stdout.write(f'    → Welcome email sent to {user.email}')
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f'    → Email failed: {exc}'))
