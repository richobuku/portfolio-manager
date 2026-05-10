"""Bulk-create login accounts for every BGE that doesn't already have one.

Usage on Render shell:
    python manage.py create_bge_accounts                   # default 'bds123'
    python manage.py create_bge_accounts --password Xyz123 # custom default
    python manage.py create_bge_accounts --no-email        # skip welcome emails
    python manage.py create_bge_accounts --reset           # rotate already-linked too
    python manage.py create_bge_accounts --dry-run         # preview only

For each BGE without a linked Django User, this calls into
`portfolio.account_setup.ensure_bge_account` — the same helper that the
post_save signal uses, so the bulk run and individual creates produce
identical results (username minting, email content, etc.).

Going forward, any BGE created via API / admin / public-signup form will
automatically get an account + welcome email via the signal — this command
exists for the one-off migration of BGEs that pre-date the signal.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from portfolio.models import BusinessGrowthExpert
from portfolio.account_setup import (
    ensure_bge_account,
    send_welcome_email,
    DEFAULT_PASSWORD,
)


class Command(BaseCommand):
    help = "Bulk-create login accounts for BGEs without users."

    def add_arguments(self, parser):
        parser.add_argument(
            '--password', default=DEFAULT_PASSWORD,
            help=f"Password to set (default: {DEFAULT_PASSWORD}).",
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help="Print what would happen without saving anything.",
        )
        parser.add_argument(
            '--reset', action='store_true',
            help="Also reset password for BGEs that already have a linked User.",
        )
        parser.add_argument(
            '--no-email', action='store_true',
            help="Skip sending welcome emails (just provision accounts).",
        )

    def handle(self, *args, **opts):
        password   = opts['password']
        dry_run    = opts['dry_run']
        reset      = opts['reset']
        send_email = not opts['no_email']

        unlinked = BusinessGrowthExpert.objects.filter(user__isnull=True).order_by('id')
        linked   = BusinessGrowthExpert.objects.filter(user__isnull=False).order_by('id')

        self.stdout.write(self.style.HTTP_INFO(
            f"BGEs without accounts: {unlinked.count()}, with accounts: {linked.count()}"
        ))
        if dry_run:
            self.stdout.write(self.style.WARNING("(dry-run — nothing will be saved)"))

        created = rotated = skipped = 0

        with transaction.atomic():
            for bge in unlinked:
                if dry_run:
                    from portfolio.account_setup import mint_username, unique_username
                    base = mint_username(bge)
                    candidate = unique_username(base) if base else None
                    if candidate:
                        self.stdout.write(f"  ✓ would create: {candidate:24}  →  {bge.name}")
                        created += 1
                    else:
                        skipped += 1
                        self.stdout.write(self.style.WARNING(
                            f"  ⚠ would skip BGE #{bge.id} ({bge.name or '?'}) — no usable identifier"
                        ))
                    continue

                outcome = ensure_bge_account(bge, password=password, send_email=send_email)
                if outcome == 'created':
                    created += 1
                    self.stdout.write(self.style.SUCCESS(
                        f"  ✓ created: {bge.user.username:24}  →  {bge.name}"
                    ))
                elif outcome == 'skipped':
                    skipped += 1

            if reset:
                for bge in linked:
                    if dry_run:
                        self.stdout.write(f"  ✓ would rotate password for {bge.user.username}")
                        rotated += 1
                        continue
                    bge.user.set_password(password)
                    bge.user.save(update_fields=['password'])
                    rotated += 1
                    if send_email:
                        send_welcome_email(bge, bge.user.username, password)
                    self.stdout.write(self.style.SUCCESS(
                        f"  ✓ rotated:  {bge.user.username:24}  →  {bge.name}"
                    ))

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f"Done. created={created}  rotated={rotated}  skipped={skipped}"
        ))
        if not dry_run and (created or rotated):
            self.stdout.write(self.style.WARNING(f"Default password: {password}"))
            if send_email:
                self.stdout.write(self.style.WARNING("Welcome emails sent. Tell BGEs to change their password on first login."))
            else:
                self.stdout.write(self.style.WARNING("Welcome emails NOT sent (--no-email). Distribute credentials manually."))
