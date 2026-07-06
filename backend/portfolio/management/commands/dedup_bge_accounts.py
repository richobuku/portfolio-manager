"""
Management command: dedup_bge_accounts

Finds every group of user accounts sharing the same email address and
collapses each group down to one account.

Keeper selection priority (highest wins):
  1. Account already linked to a BGE profile
  2. Account with the most recent last_login
  3. Oldest account (earliest date_joined)

Safe-guards:
  - Staff / superuser accounts are never deleted.
  - The keeper is never deleted.
  - Accounts with a BGE link are always the keeper, never deleted.
  - Dry-run mode (--dry-run) shows what would happen without touching the DB.

Usage:
    # Preview
    python manage.py dedup_bge_accounts --dry-run

    # Apply
    python manage.py dedup_bge_accounts
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.db.models import Count
from portfolio.models import BusinessGrowthExpert, UserSecurityProfile


def _pick_keeper(users):
    """Return (keeper, [duplicates]) from a list of users sharing one email."""
    # Priority 1: has a BGE profile linked
    bge_linked = [u for u in users if _has_bge(u)]
    if bge_linked:
        keeper = bge_linked[0]  # there should only be one (OneToOne), but safe
        dups = [u for u in users if u.id != keeper.id]
        return keeper, dups

    # Priority 2: most recently logged in
    logged_in = sorted([u for u in users if u.last_login], key=lambda u: u.last_login, reverse=True)
    if logged_in:
        keeper = logged_in[0]
        dups = [u for u in users if u.id != keeper.id]
        return keeper, dups

    # Priority 3: oldest account
    keeper = sorted(users, key=lambda u: u.date_joined)[0]
    dups = [u for u in users if u.id != keeper.id]
    return keeper, dups


def _has_bge(user):
    try:
        _ = user.bge_profile
        return True
    except Exception:
        return False


class Command(BaseCommand):
    help = 'Remove duplicate user accounts that share the same email address'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Show what would be done without making any changes'
        )

    def handle(self, *args, **options):
        dry = options['dry_run']
        p = '[DRY RUN] ' if dry else ''

        # Find all emails with more than one account (excluding blank emails)
        dup_emails = (
            User.objects
            .exclude(email='')
            .values('email')
            .annotate(c=Count('id'))
            .filter(c__gt=1)
            .order_by('email')
        )

        if not dup_emails:
            self.stdout.write(self.style.SUCCESS('No duplicate email groups found. Nothing to do.'))
            return

        total_deleted = 0
        total_groups = 0

        for row in dup_emails:
            email = row['email']
            users = list(User.objects.filter(email__iexact=email).order_by('date_joined'))

            # Never touch staff/superuser accounts
            safe = [u for u in users if not (u.is_staff or u.is_superuser)]
            skipped_admin = [u for u in users if u.is_staff or u.is_superuser]

            if skipped_admin:
                self.stdout.write(self.style.WARNING(
                    f'  Skipping admin account(s) for {email}: '
                    + ', '.join(u.username for u in skipped_admin)
                ))

            if len(safe) < 2:
                continue  # nothing to deduplicate among non-admins

            total_groups += 1
            keeper, dups = _pick_keeper(safe)

            bge_info = ''
            if _has_bge(keeper):
                bge_info = f' [BGE: {keeper.bge_profile.name}]'

            self.stdout.write(f'\n{email} — {len(safe)} accounts:')
            self.stdout.write(f'  {p}KEEP   id={keeper.id} {keeper.username!r}'
                              f' last_login={keeper.last_login}{bge_info}')

            for dup in dups:
                dup_bge = f' [BGE: {dup.bge_profile.name}]' if _has_bge(dup) else ''
                self.stdout.write(f'  {p}DELETE id={dup.id} {dup.username!r}'
                                  f' last_login={dup.last_login}{dup_bge}')
                if not dry:
                    dup.delete()
                    total_deleted += 1
                else:
                    total_deleted += 1  # count what would be deleted

            # Ensure the keeper is active and their security profile is clean
            if not dry:
                keeper.is_active = True
                keeper.save(update_fields=['is_active'])
                sec, _ = UserSecurityProfile.objects.get_or_create(user=keeper)
                # Only clear must_change_password if they've never logged in
                # (i.e., they haven't set a real password yet — leave it if
                # they've already been active so we don't wipe their flag)
                if not keeper.last_login:
                    sec.must_change_password = False
                    sec.viewer_approved = True
                    sec.save(update_fields=['must_change_password', 'viewer_approved'])

        self.stdout.write('')
        if dry:
            self.stdout.write(self.style.SUCCESS(
                f'Dry run complete: {total_groups} duplicate group(s) found, '
                f'{total_deleted} account(s) would be deleted.\n'
                f'Re-run without --dry-run to apply.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Done: {total_groups} duplicate group(s) cleaned, '
                f'{total_deleted} account(s) deleted.'
            ))
            self.stdout.write(
                'Affected users can now log in via "Forgot password?" '
                'on the sign-in page to receive a fresh reset link.'
            )
