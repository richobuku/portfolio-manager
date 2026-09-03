"""
SMS Service helper for PRUDEV II.

Provides:
  - Phone normalization (+256 format for Uganda)
  - MSME Visit Action Summary SMS sending
  - Logging to SmsSendLog
"""

import logging
import re
from typing import Tuple, Optional
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def normalise_uganda_phone(raw: str) -> str:
    """
    Normalise a Ugandan phone number to +256XXXXXXXXX format.
    Accepts: 07XXXXXXXX, 2567XXXXXXXX, +2567XXXXXXXX, 7XXXXXXXX.
    """
    if not raw:
        return ''
    cleaned = re.sub(r'[\s\-().,]', '', str(raw).strip())
    if cleaned.startswith('+'):
        cleaned = cleaned[1:]
    if cleaned.startswith('0') and len(cleaned) == 10:
        cleaned = '256' + cleaned[1:]
    elif cleaned.startswith('7') and len(cleaned) == 9:
        cleaned = '256' + cleaned
    return f"+{cleaned}" if cleaned.startswith('256') else f"+{cleaned}"


def build_msme_visit_sms_text(report) -> str:
    """Generate friendly, actionable visit takeaway text for the entrepreneur."""
    msme = report.msme
    bge = report.bge

    contact_name = (
        getattr(msme, 'contact_person', '') or
        getattr(msme, 'contact_name', '') or
        (msme.business_name if msme else 'Business Owner')
    )
    first_name = contact_name.split()[0] if contact_name else 'Partner'
    bge_name = bge.name.split()[0] if bge and bge.name else 'your BGE'
    business_name = msme.business_name if msme else 'your business'

    takeaway = (
        report.concrete_takeaway or
        report.action_plan or
        report.key_achievement or
        'Implement the agreed business practice'
    ).strip()

    next_step = (
        report.msme_visible_next_step or
        report.recommendations or
        'Follow-up session as agreed'
    ).strip()

    # Truncate slightly if very long to stay around 2 SMS segments
    if len(takeaway) > 120:
        takeaway = takeaway[:117] + '...'
    if len(next_step) > 80:
        next_step = next_step[:77] + '...'

    return (
        f"Hello {first_name}, thank you for your PRUDEV II coaching visit today with {bge_name}. "
        f"Agreed Action: {takeaway}. "
        f"Next Step: {next_step}. "
        f"Together we grow {business_name}! — PRUDEV II / GOPA AFC"
    )


def send_msme_visit_summary_sms(report, custom_message: Optional[str] = None) -> Tuple[bool, str]:
    """
    Send an SMS action summary to the MSME business owner upon completion of a visit.
    Logs result to SmsSendLog and updates report.sms_summary_sent.
    """
    from .models import SmsSendLog

    msme = report.msme
    if not msme or not msme.phone:
        return False, "MSME has no phone number recorded."

    phone = normalise_uganda_phone(msme.phone)
    if not phone or len(phone) < 10:
        return False, f"Invalid MSME phone number: {msme.phone}"

    message = (custom_message or build_msme_visit_sms_text(report)).strip()

    api_key = getattr(settings, 'MESSAGE_CARRIER_API_KEY', '')
    base_url = getattr(settings, 'MESSAGE_CARRIER_BASE_URL', 'https://api.bravo.mystyler.xyz')
    endpoint = f'{base_url}/v1/api-keys/send-sms'

    if not api_key:
        logger.warning("Skipped MSME visit SMS — MESSAGE_CARRIER_API_KEY is not configured.")
        return False, "SMS gateway (MESSAGE_CARRIER_API_KEY) is not configured on server."

    status_str = 'failed'
    err_str = ''
    try:
        import requests
        resp = requests.post(
            endpoint,
            json={'phone': phone, 'message': message},
            headers={'x-api-key': api_key},
            timeout=15,
        )
        resp_data = resp.json() if resp.content else {}
        if resp.status_code < 300 and resp_data.get('sent', True):
            status_str = 'sent'
            # Update cache if balance returned
            if 'balanceAfter' in resp_data:
                try:
                    from django.core.cache import cache
                    cache.set('mc_sms_wallet_balance', float(resp_data['balanceAfter']), timeout=86400)
                except Exception:
                    pass

            # Mark report as SMS sent
            report.sms_summary_sent = True
            report.sms_summary_sent_at = timezone.now()
            report.save(update_fields=['sms_summary_sent', 'sms_summary_sent_at'])
            logger.info("MSME visit action SMS sent to %s for report #%s (%s)", phone, report.id, msme.business_name)
        else:
            err_str = resp_data.get('message', resp.text[:200])
            logger.warning("MSME visit SMS failed to %s: %s", phone, resp_data)
    except Exception as exc:
        err_str = str(exc)
        logger.error("Error sending MSME visit action SMS: %s", exc)

    # Log to SmsSendLog
    try:
        SmsSendLog.objects.create(
            recipient_type='msme',
            recipient_id=msme.id,
            recipient_phone=phone,
            message_preview=message[:160],
            status=status_str,
            error_message=err_str,
            sent_by=getattr(report, 'bge', None) and getattr(report.bge, 'user', None),
        )
    except Exception as log_err:
        logger.warning("Failed to create SmsSendLog for MSME visit: %s", log_err)

    if status_str == 'sent':
        return True, "SMS summary sent successfully to MSME owner."
    return False, f"SMS delivery failed: {err_str or 'Unknown error'}"
