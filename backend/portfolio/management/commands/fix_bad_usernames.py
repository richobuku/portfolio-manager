"""
Management command: fix_bad_usernames

Finds user accounts whose username looks like a phone number or other
junk (purely numeric, or matching Uganda phone patterns like 07XXXXXXXX).

For each suspicious account it attempts to:
  1. Match a BGE profile whose phone number contains the username digits.
  2. If matched and unlinked: link the user to that BGE and rename the
     username to the standard slug derived from the BGE's name/email.
  3. If no BGE match found: report the account as orphaned.

Flags:
  --dry-run          Preview without writing anything.
  --delete-orphans   Delete suspicious accounts that couldn't be matched
                     to any BGE profile. Use with caution.

Usage:
    python manage.py fix_bad_usernames --dry-run
    python manage.py fix_bad_usernames
    python manage.py fix_bad_usernames --delete-orphans
"""
import re
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from portfolio.models import BusinessGrowthExpert, UserSecurityProfile
from portfolio.account_setup import mint_username, unique_username


def _is_suspicious(username):
    """Return True if the username looks like a phone number or numeric junk."""
    cleaned = re.sub(r'[\s\-\+\(\)]', '', username)
    # Purely numeric and 7+ digits (phone number)
    if re.fullmatch(r'\d{7,}', cleaned):
        return True
    # Starts with 07x / 075 / 076 / 077 / 078 pattern (Uganda mobile)
    if re.fullmatch(r'0[3-9]\d{7,}', cleaned):
        return True
    return False


def _normalise_phone(phone):
    """Strip everything except digits."""
    return re.sub(r'\D', '', phone or '')


def _match_bge_by_phone(username):
    """Try to find a BGE whose phone contains the username digits."""
    digits = re.sub(r'\D', '', username)
    if len(digits) < 7:
        return None
    for bge in BusinessGrowthExpert.objects.exclude(phone=''):
        bge_digits = _normalise_phone(bge.phone)
        # Match if the username digits appear at the end of the phone number
        # e.g. username=772762800 matches phone=0772762800 or +256772762800
        if bge_digits.endswith(digits) or digits.endswith(bge_digits[-7:]):
            return bge
    return None


class Command(BaseCommand):
    help = 'Identify and fix user accounts with phone-number or junk usernames'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Preview without making changes')
        parser.add_argument('--delete-orphans', action='store_true',
                            help='Delete accounts that cannot be matched to any BGE')

    def handle(self, *args, **options):
        dry = options['dry_run']
        delete_orphans = options['delete_orphans']
        p = '[DRY RUN] ' if dry else ''

        suspicious = [
            u for u in User.objects.filter(is_staff=False, is_superuser=False).order_by('username')
            if _is_suspicious(u.username)
        ]

        if not suspicious:
            self.stdout.write(self.style.SUCCESS('No suspicious usernames found.'))
            return

        self.stdout.write(f'Found {len(suspicious)} suspicious account(s):\n')

        fixed = orphaned = 0

        for u in suspicious:
            already_linked = None
            try:
                already_linked = u.bge_profile
            except Exception:
                pass

            self.stdout.write(f'  username={u.username!r}  email={u.email!r}  '
                              f'active={u.is_active}  last_login={u.last_login}')

            if already_linked:
                # Already linked to a BGE — just rename the username
                new_username = unique_username(mint_username(already_linked) or already_linked.name.lower().replace(' ', '.'))
                self.stdout.write(f'    {p}Already linked to BGE {already_linked.name!r}. '
                                  f'Rename username → {new_username!r}')
                if not dry and new_username and new_username != u.username:
                    u.username = new_username
                    u.save(update_fields=['username'])
                fixed += 1
                continue

            # Try to match by phone digits
            bge = _match_bge_by_phone(u.username)

            if bge:
                if bge.user_id and bge.user_id != u.id:
                    self.stdout.write(self.style.WARNING(
                        f'    BGE {bge.name!r} (id={bge.id}) is already linked to a '
                        f'different user (id={bge.user_id}). Skipping auto-link.'
                    ))
                    orphaned += 1
                    continue

                new_username = unique_username(mint_username(bge) or _normalise_phone(bge.phone))
                self.stdout.write(f'    {p}Matched BGE id={bge.id} {bge.name!r} '
                                  f'(phone={bge.phone!r}). '
                                  f'Rename {u.username!r} → {new_username!r} and link.')
                if not dry:
                    if new_username and new_username != u.username:
                        u.username = new_username
                        u.save(update_fields=['username'])
                    BusinessGrowthExpert.objects.filter(pk=bge.pk).update(user=u)
                    sec, _ = UserSecurityProfile.objects.get_or_create(user=u)
                    sec.must_change_password = False
                    sec.viewer_approved = True
                    sec.save(update_fields=['must_change_password', 'viewer_approved'])
                fixed += 1

            else:
                self.stdout.write(self.style.WARNING(
                    f'    No BGE match found for username={u.username!r}.'
                ))
                if delete_orphans:
                    self.stdout.write(f'    {p}Deleting orphaned account id={u.id}.')
                    if not dry:
                        u.delete()
                orphaned += 1

        self.stdout.write('')
        action = 'Would fix' if dry else 'Fixed'
        self.stdout.write(self.style.SUCCESS(
            f'{action} {fixed} account(s). {orphaned} orphaned (no BGE match).'
        ))
        if orphaned and not delete_orphans:
            self.stdout.write(
                'Re-run with --delete-orphans to remove unmatched accounts, '
                'or link them manually via the admin Users page.'
            )
        if dry:
            self.stdout.write('Re-run without --dry-run to apply.')
