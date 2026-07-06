"""
Management command: fix_duplicate_users

Usage:
    python manage.py fix_duplicate_users --email carolyneaber0@gmail.com [--dry-run]

What it does:
1. Finds all user accounts sharing the given email address.
2. Picks the 'winner' — the account that is already linked to a BGE profile,
   or else the oldest account (first created).
3. Deletes the duplicate accounts (those with no BGE link and no login history
   are cleanest to remove; the command is conservative — it always keeps at
   least one account).
4. If a BGE profile with the same email exists and the winner is not yet linked,
   it links them.
5. Resets the winner's must_change_password flag so they can set their password
   fresh via the Forgot Password link.

Run with --dry-run first to preview changes without writing anything.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from portfolio.models import BusinessGrowthExpert, UserSecurityProfile


class Command(BaseCommand):
    help = 'Merge duplicate user accounts sharing the same email address'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True, help='Email address to deduplicate')
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes')

    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        dry = options['dry_run']
        prefix = '[DRY RUN] ' if dry else ''

        users = list(User.objects.filter(email__iexact=email).order_by('date_joined'))
        if not users:
            self.stdout.write(self.style.ERROR(f'No users found with email {email}'))
            return

        self.stdout.write(f'Found {len(users)} account(s) for {email}:')
        for u in users:
            try: bl = f'BGE:{u.bge_profile.id} {u.bge_profile.name}'
            except Exception: bl = 'no BGE linked'
            self.stdout.write(f'  id={u.id} username={u.username!r} active={u.is_active} '
                              f'last_login={u.last_login} joined={u.date_joined.date()} | {bl}')

        if len(users) == 1:
            self.stdout.write(self.style.SUCCESS('Only one account — nothing to deduplicate.'))
            winner = users[0]
        else:
            # Prefer the account already linked to a BGE; otherwise the oldest
            linked = [u for u in users if hasattr(u, 'bge_profile')]
            winner = linked[0] if linked else users[0]
            duplicates = [u for u in users if u.id != winner.id]

            self.stdout.write(f'\n{prefix}Keeping: id={winner.id} username={winner.username!r}')
            for dup in duplicates:
                self.stdout.write(f'{prefix}Deleting duplicate: id={dup.id} username={dup.username!r} '
                                  f'(last_login={dup.last_login})')
                if not dry:
                    dup.delete()

        # Link to BGE profile if not already linked
        try:
            winner.bge_profile
            self.stdout.write(f'{prefix}BGE already linked: {winner.bge_profile.name}')
        except Exception:
            bge = BusinessGrowthExpert.objects.filter(email__iexact=email).first()
            if bge:
                if bge.user_id and bge.user_id != winner.id:
                    self.stdout.write(self.style.WARNING(
                        f'{prefix}BGE id={bge.id} {bge.name!r} is already linked to a different user '
                        f'(id={bge.user_id}). Skipping auto-link — use the admin dashboard to link manually.'
                    ))
                elif not bge.user_id:
                    self.stdout.write(f'{prefix}Linking winner to BGE id={bge.id} {bge.name!r}')
                    if not dry:
                        BusinessGrowthExpert.objects.filter(pk=bge.pk).update(user=winner)
            else:
                self.stdout.write(self.style.WARNING(
                    f'{prefix}No BGE profile found with email {email}. '
                    f'Link manually via the Users admin page after this command.'
                ))

        # Clear must_change_password so they can log in and set a fresh password
        if not dry:
            sec, _ = UserSecurityProfile.objects.get_or_create(user=winner)
            sec.must_change_password = False
            sec.password_last_changed = None
            sec.viewer_approved = True
            sec.save(update_fields=['must_change_password', 'password_last_changed', 'viewer_approved'])
            winner.is_active = True
            winner.save(update_fields=['is_active'])
            self.stdout.write(f'Security profile reset. Winner account is active and ready.')
            self.stdout.write(self.style.SUCCESS(
                f'\nDone. Tell Carolyn to use "Forgot password?" on the login page '
                f'with her email {email} to receive a fresh reset link.'
            ))
        else:
            self.stdout.write(f'{prefix}Would reset security profile and activate account.')
            self.stdout.write(self.style.SUCCESS(f'\nDry run complete. Re-run without --dry-run to apply.'))
