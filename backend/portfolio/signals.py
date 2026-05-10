"""Django signals for the portfolio app."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import BusinessGrowthExpert
from .account_setup import ensure_bge_account


@receiver(post_save, sender=BusinessGrowthExpert)
def auto_create_bge_login(sender, instance, created, **kwargs):
    """Provision a Django User + send a branded welcome email whenever a
    new BGE row is saved. Idempotent: existing BGEs and admin-pre-linked
    rows are skipped automatically by ensure_bge_account()."""
    if not created:
        return
    # ensure_bge_account() handles all the safety branches (already linked,
    # missing email/name, send-email failures) and never raises — so a quirk
    # in any one row can't break the create() that triggered the signal.
    try:
        ensure_bge_account(instance)
    except Exception:
        # Defence-in-depth: if anything in the helper escapes, we still let
        # the BGE row commit. The bulk command can repair on the next run.
        import logging
        logging.getLogger(__name__).exception(
            "auto_create_bge_login failed for BGE #%s", instance.pk,
        )
