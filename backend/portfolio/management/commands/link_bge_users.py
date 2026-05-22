"""Link existing Django User accounts to BusinessGrowthExpert profiles.

This fixes the situation where BGE user accounts were created manually (or via
a different path) without being linked to a BGE expert record, causing:
  - bge_profile=null in the login response
  - collected_by=null on all snapshots they submit
  - MSMEs returning an empty list for that user

Usage:
    # Show proposed links without saving
    python manage.py link_bge_users --dry-run

    # Auto-link by name/email matching
    python manage.py link_bge_users

    # Link a specific user to a specific BGE expert
    python manage.py link_bge_users --user jimmy.ouni --bge-id 18

    # Unlink a specific user
    python manage.py link_bge_users --unlink jimmy.ouni
"""
import re

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.models import User

from portfolio.models import BusinessGrowthExpert


def _slug(text):
    s = re.sub(r'[^a-z0-9]+', '.', (text or '').lower()).strip('.')
    return re.sub(r'\.+', '.', s)


def _find_best_bge_match(username):
    """Try to match a username to a BGE expert by name similarity."""
    # Username format: firstname.lastname or email-local-part
    parts = username.lower().replace('.', ' ').split()

    # 1. Exact slug match on name
    for bge in BusinessGrowthExpert.objects.filter(user__isnull=True):
        if _slug(bge.name) == username:
            return bge, 'exact name slug'

    # 2. Email local-part match
    for bge in BusinessGrowthExpert.objects.filter(user__isnull=True):
        if bge.email and bge.email.split('@')[0].lower() == username:
            return bge, 'email local-part'

    # 3. All username parts appear in BGE name (case-insensitive)
    if len(parts) >= 2:
        for bge in BusinessGrowthExpert.objects.filter(user__isnull=True):
            name_lower = bge.name.lower()
            if all(p in name_lower for p in parts):
                return bge, 'all name parts match'

    # 4. First+last from username appear in BGE name
    if len(parts) >= 2:
        first, last = parts[0], parts[-1]
        for bge in BusinessGrowthExpert.objects.filter(user__isnull=True):
            name_lower = bge.name.lower()
            if first in name_lower and last in name_lower:
                return bge, 'first+last match'

    return None, None


class Command(BaseCommand):
    help = "Link Django User accounts to BusinessGrowthExpert profiles."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help="Show proposed links without saving.")
        parser.add_argument('--user', type=str,
                            help="Specific username to process.")
        parser.add_argument('--bge-id', type=int,
                            help="BGE expert ID to link to (use with --user).")
        parser.add_argument('--unlink', type=str,
                            help="Username to unlink from its BGE profile.")

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        specific_user = options.get('user')
        specific_bge = options.get('bge_id')
        unlink_user = options.get('unlink')

        if unlink_user:
            self._unlink(unlink_user, dry_run)
            return

        if specific_user and specific_bge:
            self._link_specific(specific_user, specific_bge, dry_run)
            return

        # Auto-link all unlinked non-staff users
        self._auto_link(specific_user, dry_run)

    def _unlink(self, username, dry_run):
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f"User '{username}' not found.")
        try:
            bge = user.bge_profile
        except Exception:
            self.stdout.write(f"User '{username}' has no BGE profile linked.")
            return
        if dry_run:
            self.stdout.write(f"[dry-run] Would unlink {username} from BGE '{bge.name}' (id={bge.id})")
        else:
            bge.user = None
            bge.save(update_fields=['user'])
            self.stdout.write(self.style.SUCCESS(f"Unlinked {username} from '{bge.name}'."))

    def _link_specific(self, username, bge_id, dry_run):
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f"User '{username}' not found.")
        try:
            bge = BusinessGrowthExpert.objects.get(pk=bge_id)
        except BusinessGrowthExpert.DoesNotExist:
            raise CommandError(f"BGE expert with id={bge_id} not found.")

        if bge.user_id and bge.user_id != user.id:
            raise CommandError(
                f"BGE '{bge.name}' is already linked to user '{bge.user.username}'. "
                f"Unlink first with --unlink {bge.user.username}"
            )
        if dry_run:
            self.stdout.write(f"[dry-run] Would link {username} → '{bge.name}' (id={bge_id})")
        else:
            bge.user = user
            bge.save(update_fields=['user'])
            self.stdout.write(self.style.SUCCESS(f"Linked {username} → '{bge.name}' (id={bge_id})."))

    def _auto_link(self, only_user, dry_run):
        if only_user:
            try:
                users = [User.objects.get(username=only_user)]
            except User.DoesNotExist:
                raise CommandError(f"User '{only_user}' not found.")
        else:
            users = User.objects.filter(is_staff=False, is_superuser=False)

        self.stdout.write("\n=== BGE User Link Status ===\n")
        linked = 0
        unlinked_users = []

        for u in users:
            try:
                bge = u.bge_profile
                self.stdout.write(f"  ✓ {u.username:30s} → already linked to '{bge.name}' (id={bge.id})")
                linked += 1
                continue
            except Exception:
                pass  # not linked

            bge_match, reason = _find_best_bge_match(u.username)
            if bge_match:
                if dry_run:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  ? {u.username:30s} → WOULD link to '{bge_match.name}' (id={bge_match.id})  [{reason}]"
                        )
                    )
                else:
                    bge_match.user = u
                    bge_match.save(update_fields=['user'])
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ✓ {u.username:30s} → LINKED to '{bge_match.name}' (id={bge_match.id})  [{reason}]"
                        )
                    )
                    linked += 1
            else:
                self.stdout.write(
                    self.style.ERROR(
                        f"  ✗ {u.username:30s} → no matching BGE expert found"
                    )
                )
                unlinked_users.append(u.username)

        self.stdout.write("")
        if unlinked_users:
            self.stdout.write(
                self.style.WARNING(
                    f"\n{len(unlinked_users)} user(s) could not be auto-matched:\n"
                )
            )
            self.stdout.write("  " + ", ".join(unlinked_users))
            self.stdout.write(
                "\nFor each unmatched user, find their BGE expert ID from the list below"
                "\nand run:  python manage.py link_bge_users --user <username> --bge-id <id>\n"
            )
            self.stdout.write("\n=== Unlinked BGE Expert Records ===")
            for bge in BusinessGrowthExpert.objects.filter(user__isnull=True).order_by('name'):
                self.stdout.write(f"  id={bge.id:3d}  {bge.name!r}")

        if dry_run:
            self.stdout.write(self.style.WARNING(
                "\n[dry-run] No changes made. Run without --dry-run to apply.\n"
            ))
