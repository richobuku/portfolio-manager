"""Bulk-create login accounts for every BGE that doesn't already have one.

Usage:
    python manage.py create_bge_accounts                  # creates with default password
    python manage.py create_bge_accounts --password bds123
    python manage.py create_bge_accounts --dry-run        # preview without saving
    python manage.py create_bge_accounts --reset          # also rotate password on already-linked BGEs

Username preference (first non-empty wins):
  1. local-part of email (lowercased)
  2. slug of `name`         (e.g. "Kobusinge Racheal" → "kobusinge.racheal")
  3. slug of `bge_code`     (last-resort)

If a generated username collides with an existing User, the command appends
'2', '3', … until it finds a free slot, so the run never hits an
IntegrityError.
"""
import re

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from portfolio.models import BusinessGrowthExpert


def _slug(text):
    s = re.sub(r'[^a-z0-9]+', '.', (text or '').lower()).strip('.')
    return re.sub(r'\.+', '.', s)


def _mint_username(bge):
    if bge.email:
        return bge.email.split('@')[0].lower()
    if bge.name:
        return _slug(bge.name)
    if bge.bge_code:
        return _slug(bge.bge_code)
    return None


def _unique(base):
    """Walk ('base', 'base2', 'base3', ...) until a free username is found."""
    if not User.objects.filter(username=base).exists():
        return base
    for n in range(2, 1000):
        candidate = f'{base}{n}'
        if not User.objects.filter(username=candidate).exists():
            return candidate
    raise RuntimeError(f'Could not mint a unique username from "{base}" (1000 attempts)')


class Command(BaseCommand):
    help = "Bulk-create login accounts for BGEs without users."

    def add_arguments(self, parser):
        parser.add_argument(
            '--password',
            default='bds123',
            help='Default password (default: bds123).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Print what would happen without saving anything.",
        )
        parser.add_argument(
            '--reset',
            action='store_true',
            help="Also reset password for BGEs that already have a linked User.",
        )

    def handle(self, *args, **opts):
        password = opts['password']
        dry_run  = opts['dry_run']
        reset    = opts['reset']

        unlinked = BusinessGrowthExpert.objects.filter(user__isnull=True).order_by('id')
        linked   = BusinessGrowthExpert.objects.filter(user__isnull=False).order_by('id')

        self.stdout.write(self.style.HTTP_INFO(
            f"BGEs without accounts: {unlinked.count()}, with accounts: {linked.count()}"
        ))
        if dry_run:
            self.stdout.write(self.style.WARNING("(dry-run — nothing will be saved)"))

        created = 0
        skipped = 0
        rotated = 0

        with transaction.atomic():
            for bge in unlinked:
                base = _mint_username(bge)
                if not base:
                    skipped += 1
                    self.stdout.write(self.style.WARNING(
                        f"  ⚠ Skipped BGE #{bge.id} ({bge.name or '?'}) — no email/name/bge_code"
                    ))
                    continue

                username = _unique(base)
                first, _, last = (bge.name or '').partition(' ')

                if dry_run:
                    self.stdout.write(f"  ✓ would create: {username} for {bge.name}")
                    created += 1
                    continue

                user, was_new = User.objects.get_or_create(
                    username=username,
                    defaults={
                        'email':      bge.email or '',
                        'first_name': first,
                        'last_name':  last,
                        'is_active':  True,
                    },
                )
                user.set_password(password)
                user.save()

                bge.user = user
                bge.save(update_fields=['user'])
                created += 1
                self.stdout.write(self.style.SUCCESS(
                    f"  ✓ created: {username:24}  →  {bge.name}"
                ))

            if reset:
                for bge in linked:
                    if dry_run:
                        self.stdout.write(f"  ✓ would rotate password for {bge.user.username}")
                        rotated += 1
                        continue
                    bge.user.set_password(password)
                    bge.user.save(update_fields=['password'])
                    rotated += 1
                    self.stdout.write(self.style.SUCCESS(
                        f"  ✓ rotated:  {bge.user.username:24}  →  {bge.name}"
                    ))

            if dry_run:
                # rollback the empty txn just to be tidy
                transaction.set_rollback(True)

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f"Done. created={created}  rotated={rotated}  skipped={skipped}"
        ))
        if not dry_run and (created or rotated):
            self.stdout.write(self.style.WARNING(
                f"All affected accounts now have password: {password}"
            ))
            self.stdout.write(self.style.WARNING(
                "Tell BGEs to change it on first login (Forgot password? on the login page)."
            ))
