import logging
import re

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated as _IsAuth
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from ..models import BusinessGrowthExpert, MSME
from .mixins import _managed_groups

logger = logging.getLogger(__name__)


def _do_send_emails(records, subject, body_text, body_html, skip_sent,
                    already_sent_ids, recipient_type, from_email, reply_to, user_id):
    """Send emails in a background thread using a single SMTP connection."""
    from django.core.mail import get_connection
    from ..models import EmailSendLog

    # Deduplicate by email address (keeps first occurrence per address)
    seen_emails = set()
    deduped = []
    for rec in records:
        addr = (rec['email'] or '').lower().strip()
        if addr and addr not in seen_emails:
            seen_emails.add(addr)
            deduped.append(rec)

    logs_to_create = []
    failed_count = 0

    try:
        connection = get_connection()
        connection.open()
    except Exception as e:
        logger.warning('Bulk email: could not open SMTP connection, falling back to per-message: %s', e)
        connection = None  # fall back to per-message connections

    for rec in deduped:
        if skip_sent and rec['id'] in already_sent_ids:
            continue
        first = (rec['name'] or '').split()[0] or 'Team'
        try:
            txt  = body_text.replace('{{name}}', first)
            html = body_html.replace('{{name}}', first) if body_html else ''
            msg  = EmailMultiAlternatives(
                subject=subject, body=txt,
                from_email=from_email, to=[rec['email']], reply_to=[reply_to],
                connection=connection,
            )
            if html:
                msg.attach_alternative(html, 'text/html')
            msg.send()
            logs_to_create.append(EmailSendLog(
                recipient_type=recipient_type, recipient_id=rec['id'],
                recipient_email=rec['email'], subject=subject,
                sent_by_id=user_id,
            ))
        except Exception as e:
            failed_count += 1
            logger.error('Bulk email: failed to send to %s (id=%s): %s', rec.get('email'), rec.get('id'), e)

    if failed_count:
        logger.warning('Bulk email job finished with %d failure(s) out of %d recipients for subject: %s',
                       failed_count, len(deduped), subject)

    if connection:
        try:
            connection.close()
        except Exception:
            pass

    try:
        if logs_to_create:
            EmailSendLog.objects.bulk_create(logs_to_create, ignore_conflicts=True)
    except Exception as e:
        logger.error('Bulk email: failed to persist send logs: %s', e)


@api_view(['POST'])
@permission_classes([_IsAuth])
def bulk_email_view(request):
    """Admin-only: send a communication email to a selection of BGEs or MSMEs."""
    import threading
    from ..models import EmailSendLog

    user = request.user
    if not (user.is_staff or user.is_superuser or _managed_groups(user) is not None):
        raise PermissionDenied("Only administrators can send bulk emails.")

    recipient_type  = request.data.get('recipient_type', 'bge')
    recipient_ids   = request.data.get('recipient_ids', [])
    subject         = (request.data.get('subject') or '').strip()
    body_text       = (request.data.get('body') or request.data.get('body_text') or '').strip()
    body_html       = (request.data.get('body_html') or '').strip()
    skip_sent       = bool(request.data.get('skip_already_sent', False))

    if not subject:
        return Response({'detail': 'Subject is required.'}, status=400)
    if not body_text:
        return Response({'detail': 'Body is required.'}, status=400)
    if len(subject) > 300:
        return Response({'detail': 'Subject is too long (max 300 characters).'}, status=400)
    if len(body_text) > 50000:
        return Response({'detail': 'Body is too long (max 50,000 characters).'}, status=400)
    if len(body_html) > 100000:
        return Response({'detail': 'HTML body is too long (max 100,000 characters).'}, status=400)
    if isinstance(recipient_ids, list) and len(recipient_ids) > 2000:
        return Response({'detail': 'Too many recipients selected (max 2,000).'}, status=400)

    if recipient_type == 'bge':
        qs = BusinessGrowthExpert.objects.filter(email__isnull=False).exclude(email='')
        if recipient_ids:
            qs = qs.filter(id__in=recipient_ids)
        records = [{'id': b.id, 'name': b.name or 'BGE', 'email': b.email} for b in qs]
    else:
        qs = MSME.objects.filter(email__isnull=False).exclude(email='')
        if recipient_ids:
            qs = qs.filter(id__in=recipient_ids)
        records = [{'id': m.id, 'name': m.owner_name or m.business_name or 'Business Owner', 'email': m.email} for m in qs]

    # Deduplicate by email address before counting
    seen = set()
    deduped_records = []
    for rec in records:
        addr = (rec['email'] or '').lower().strip()
        if addr and addr not in seen:
            seen.add(addr)
            deduped_records.append(rec)

    # Identify already-sent recipients for this subject
    try:
        already_sent_ids = set(
            EmailSendLog.objects.filter(
                recipient_type=recipient_type, subject=subject,
                recipient_id__in=[r['id'] for r in deduped_records],
            ).values_list('recipient_id', flat=True)
        )
    except Exception:
        already_sent_ids = set()

    to_send = len(deduped_records) - (len(already_sent_ids) if skip_sent else 0)
    skipped = len(deduped_records) - to_send
    duplicates_removed = len(records) - len(deduped_records)

    from_email = settings.DEFAULT_FROM_EMAIL
    reply_to   = getattr(settings, 'EMAIL_REPLY_TO', from_email)

    # Fire-and-forget background thread — avoids HTTP timeout for large lists
    t = threading.Thread(
        target=_do_send_emails,
        args=(deduped_records, subject, body_text, body_html, skip_sent,
              already_sent_ids, recipient_type, from_email, reply_to, user.id),
        daemon=True,
    )
    t.start()

    return Response({
        'queued': to_send,
        'skipped': skipped,
        'duplicates_removed': duplicates_removed,
        'already_sent_count': len(already_sent_ids),
        'message': f'{to_send} email{"s" if to_send != 1 else ""} queued for delivery.',
    })


@api_view(['GET'])
@permission_classes([_IsAuth])
def bulk_email_log_view(request):
    """Return how many of the given recipients have already been sent a subject."""
    from ..models import EmailSendLog

    user = request.user
    if not (user.is_staff or user.is_superuser or _managed_groups(user) is not None):
        raise PermissionDenied("Only administrators can view bulk email logs.")

    subject        = request.query_params.get('subject', '')
    recipient_type = request.query_params.get('recipient_type', 'bge')
    ids_raw        = request.query_params.getlist('ids')
    recipient_ids  = [int(i) for i in ids_raw if i.isdigit()]

    if not subject or not recipient_ids:
        return Response({'already_sent': [], 'count': 0})

    already = list(
        EmailSendLog.objects.filter(
            recipient_type=recipient_type, subject=subject,
            recipient_id__in=recipient_ids,
        ).values_list('recipient_id', flat=True).distinct()
    )
    return Response({'already_sent': already, 'count': len(already)})


# ── Bulk SMS (Message Carrier) ────────────────────────────────────────────────

def _normalise_phone(phone):
    """Ensure phone number is in international format for Message Carrier."""
    p = re.sub(r'[\s\-\(\)]', '', str(phone or ''))
    if p.startswith('0'):
        p = '+256' + p[1:]  # Uganda default
    if not p.startswith('+'):
        p = '+' + p
    return p


SMS_BALANCE_CACHE_KEY = 'mc_sms_wallet_balance'


def _cache_sms_balance(balance):
    """Store the latest known SMS wallet balance in Django's cache (24h TTL)."""
    try:
        from django.core.cache import cache
        cache.set(SMS_BALANCE_CACHE_KEY, float(balance), timeout=86400)
    except Exception:
        pass


def _get_cached_sms_balance():
    """Return the last known SMS wallet balance from cache, or None."""
    try:
        from django.core.cache import cache
        return cache.get(SMS_BALANCE_CACHE_KEY)
    except Exception:
        return None


@api_view(['GET'])
@permission_classes([_IsAuth])
def bulk_sms_balance_view(request):
    """Return the current Message Carrier wallet balance (from cache).

    The cache is populated after every bulk SMS send (balanceAfter field).
    Use ?seed=<amount> to manually seed the balance (admin only).
    """
    if not (request.user.is_staff or request.user.is_superuser):
        raise PermissionDenied("Only administrators can view SMS balance.")

    # Allow manual seeding: /api/bulk-sms/balance/?seed=465
    seed = request.query_params.get('seed')
    if seed:
        try:
            _cache_sms_balance(float(seed))
        except ValueError:
            pass

    balance = _get_cached_sms_balance()
    return Response({
        'balance': balance,
        'currency': 'UGX',
        'cost_per_sms': 45,
        'ok': balance is not None,
        'message': '' if balance is not None else 'Balance updates automatically after each SMS send.',
    })


def _do_send_sms(records, message, user_id):
    """Background thread: send SMS to each record via Message Carrier API."""
    import django
    django.setup() if not django.conf.settings.configured else None  # noqa
    from django.conf import settings as _s
    from ..models import SmsSendLog
    from django.contrib.auth.models import User as _User

    api_key = _s.MESSAGE_CARRIER_API_KEY
    base_url = getattr(_s, 'MESSAGE_CARRIER_BASE_URL', 'https://api.bravo.mystyler.xyz')
    endpoint = f'{base_url}/v1/api-keys/send-sms'

    try:
        sent_by = _User.objects.get(pk=user_id)
    except Exception:
        sent_by = None

    logs = []
    last_balance = None
    for rec in records:
        phone = _normalise_phone(rec['phone'])
        personal_msg = message.replace('{{name}}', (rec['name'] or '').split()[0])
        try:
            import requests as _req_lib
            resp_obj = _req_lib.post(
                endpoint,
                json={'phone': phone, 'message': personal_msg},
                headers={'x-api-key': api_key},
                timeout=15,
            )
            resp_data = resp_obj.json() if resp_obj.content else {}
            if resp_obj.status_code < 300:
                status = 'sent'
                err = ''
                # Capture balance from successful send
                if 'balanceAfter' in resp_data:
                    last_balance = resp_data['balanceAfter']
            else:
                status = 'failed'
                err = resp_data.get('message', resp_obj.text[:200])
        except Exception as exc:
            status = 'failed'
            err = str(exc)
            logger.error('SMS send failed for %s (%s): %s', rec['name'], phone, exc)

        logs.append(SmsSendLog(
            recipient_type=rec['rtype'],
            recipient_id=rec['id'],
            recipient_phone=phone,
            message_preview=personal_msg[:160],
            sent_by=sent_by,
            status=status,
            error=err,
        ))

    # Cache the latest balance so the balance endpoint can return it
    if last_balance is not None:
        _cache_sms_balance(last_balance)

    try:
        SmsSendLog.objects.bulk_create(logs, ignore_conflicts=True)
    except Exception as exc:
        logger.error('Bulk SMS: failed to persist send logs: %s', exc)


@api_view(['POST'])
@permission_classes([_IsAuth])
def bulk_sms_view(request):
    """Admin-only: send bulk SMS to BGEs or MSMEs via Message Carrier."""
    import threading

    user = request.user
    if not (user.is_staff or user.is_superuser or _managed_groups(user) is not None):
        raise PermissionDenied("Only administrators can send bulk SMS.")

    recipient_type = request.data.get('recipient_type', 'bge')
    recipient_ids  = request.data.get('recipient_ids', [])
    message        = (request.data.get('message') or '').strip()

    if not message:
        return Response({'detail': 'Message is required.'}, status=400)
    if len(message) > 1600:
        return Response({'detail': 'Message is too long (max 1,600 characters).'}, status=400)
    if isinstance(recipient_ids, list) and len(recipient_ids) > 2000:
        return Response({'detail': 'Too many recipients selected (max 2,000).'}, status=400)

    # Scope filter: programme managers can only message within their groups
    group_ids = _managed_groups(user)  # None for superuser/staff, list for programme managers

    if recipient_type == 'bge':
        qs = BusinessGrowthExpert.objects.filter(phone__isnull=False).exclude(phone='')
        if group_ids is not None:  # programme manager — restrict to managed groups
            qs = qs.filter(bge_groups__programme_group__in=group_ids)
        if recipient_ids:
            qs = qs.filter(id__in=recipient_ids)
        records = [{'id': b.id, 'name': b.name or 'BGE', 'phone': b.phone, 'rtype': 'bge'} for b in qs]
    else:
        qs = MSME.objects.filter(phone__isnull=False).exclude(phone='')
        if group_ids is not None:  # programme manager — restrict to managed groups
            qs = qs.filter(assigned_group__in=group_ids)
        if recipient_ids:
            qs = qs.filter(id__in=recipient_ids)
        records = [{'id': m.id, 'name': m.owner_name or m.business_name or 'Business', 'phone': m.phone, 'rtype': 'msme'} for m in qs]

    # Deduplicate by phone number
    seen = set()
    deduped = []
    for rec in records:
        p = _normalise_phone(rec['phone'])
        if p and p not in seen:
            seen.add(p)
            deduped.append(rec)
    duplicates_removed = len(records) - len(deduped)

    threading.Thread(
        target=_do_send_sms,
        args=(deduped, message, user.id),
        daemon=True,
    ).start()

    return Response({
        'queued': len(deduped),
        'duplicates_removed': duplicates_removed,
        'message': f'{len(deduped)} SMS message{"s" if len(deduped) != 1 else ""} queued for delivery.',
    })


@api_view(['GET'])
@permission_classes([_IsAuth])
def bulk_sms_log_view(request):
    """Return recent SMS send log entries for the given recipients."""
    from ..models import SmsSendLog

    user = request.user
    if not (user.is_staff or user.is_superuser or _managed_groups(user) is not None):
        raise PermissionDenied("Only administrators can view bulk SMS logs.")

    recipient_type = request.query_params.get('recipient_type', 'bge')
    ids_raw        = request.query_params.getlist('ids')
    recipient_ids  = [int(i) for i in ids_raw if i.isdigit()]

    if not recipient_ids:
        return Response({'logs': []})

    logs = SmsSendLog.objects.filter(
        recipient_type=recipient_type,
        recipient_id__in=recipient_ids,
    ).order_by('-sent_at')[:200]

    return Response({'logs': [
        {
            'recipient_id': l.recipient_id,
            'phone': l.recipient_phone,
            'preview': l.message_preview,
            'sent_at': l.sent_at.isoformat(),
            'status': l.status,
        }
        for l in logs
    ]})
