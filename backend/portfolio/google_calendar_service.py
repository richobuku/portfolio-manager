import os
import json
import logging
from datetime import datetime, timedelta
from django.utils import timezone
from django.conf import settings
from django.core.signing import Signer, BadSignature
from django.contrib.auth.models import User

logger = logging.getLogger(__name__)

# Check Google library availability
GOOGLE_CALENDAR_AVAILABLE = False
try:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build
    GOOGLE_CALENDAR_AVAILABLE = True
except ImportError:
    logger.warning("Google Calendar API libraries (google-api-python-client, google-auth-oauthlib) not installed.")

SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
]

def get_google_calendar_config():
    """Retrieve Google OAuth configuration from environment or settings."""
    client_id = (
        os.environ.get('GOOGLE_CALENDAR_CLIENT_ID')
        or os.environ.get('GOOGLE_CLIENT_ID')
        or getattr(settings, 'GOOGLE_CLIENT_ID', '')
    )
    client_secret = (
        os.environ.get('GOOGLE_CALENDAR_CLIENT_SECRET')
        or os.environ.get('GOOGLE_CLIENT_SECRET')
        or getattr(settings, 'GOOGLE_CLIENT_SECRET', '')
    )
    redirect_uri = (
        os.environ.get('GOOGLE_CALENDAR_REDIRECT_URI')
        or getattr(settings, 'GOOGLE_CALENDAR_REDIRECT_URI', '')
    )
    return {
        'client_id': client_id.strip() if client_id else '',
        'client_secret': client_secret.strip() if client_secret else '',
        'redirect_uri': redirect_uri.strip() if redirect_uri else '',
    }

def is_google_calendar_configured():
    cfg = get_google_calendar_config()
    return bool(GOOGLE_CALENDAR_AVAILABLE and cfg['client_id'] and cfg['client_secret'])

def generate_state_token(user_id):
    """Generates a secure, tamper-proof state token encoding the user ID."""
    signer = Signer(salt='google-calendar-oauth')
    payload = json.dumps({'user_id': user_id, 'ts': int(timezone.now().timestamp())})
    return signer.sign(payload)

def verify_state_token(state_str):
    """Verifies the state token and returns user_id, or None if invalid or expired."""
    signer = Signer(salt='google-calendar-oauth')
    try:
        original = signer.unsign(state_str)
        data = json.loads(original)
        # Token valid for 30 minutes
        if int(timezone.now().timestamp()) - data.get('ts', 0) > 1800:
            return None
        return data.get('user_id')
    except (BadSignature, json.JSONDecodeError, Exception):
        return None

def get_authorization_url(user, request=None, custom_redirect_uri=None):
    """
    Generates the Google OAuth 2.0 authorization URL for calendar access.
    Requests offline access to guarantee receiving a refresh_token.
    """
    cfg = get_google_calendar_config()
    if not cfg['client_id']:
        raise ValueError("GOOGLE_CLIENT_ID is not configured.")

    redirect_uri = custom_redirect_uri or cfg['redirect_uri']
    if not redirect_uri and request:
        redirect_uri = request.build_absolute_uri('/api/auth/google-calendar/callback/')
    if not redirect_uri:
        redirect_uri = 'https://bds.glowi.africa/api/auth/google-calendar/callback/'

    # Ensure production redirect URI is always https://
    if redirect_uri and not ('localhost' in redirect_uri or '127.0.0.1' in redirect_uri):
        if redirect_uri.startswith('http://'):
            redirect_uri = 'https://' + redirect_uri[7:]

    client_config = {
        "web": {
            "client_id": cfg['client_id'],
            "client_secret": cfg['client_secret'],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }

    state = generate_state_token(user.id)
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=redirect_uri,
        state=state,
    )

    auth_url, _ = flow.authorization_url(
        access_type='offline',
        prompt='consent',
        include_granted_scopes='true',
    )
    return auth_url, state

def exchange_code_for_credentials(code, state, request=None, custom_redirect_uri=None):
    """
    Exchanges an authorization code for access and refresh tokens,
    retrieves the Google account email, and persists GoogleCalendarCredential.
    """
    from .models import GoogleCalendarCredential

    user_id = verify_state_token(state)
    if not user_id:
        raise ValueError("Invalid or expired OAuth state parameter.")

    user = User.objects.filter(id=user_id, is_active=True).first()
    if not user:
        raise ValueError("User not found or inactive.")

    cfg = get_google_calendar_config()
    redirect_uri = custom_redirect_uri or cfg['redirect_uri']
    if not redirect_uri and request:
        redirect_uri = request.build_absolute_uri('/api/auth/google-calendar/callback/')
    if not redirect_uri:
        redirect_uri = 'https://bds.glowi.africa/api/auth/google-calendar/callback/'

    # Ensure production redirect URI is always https://
    if redirect_uri and not ('localhost' in redirect_uri or '127.0.0.1' in redirect_uri):
        if redirect_uri.startswith('http://'):
            redirect_uri = 'https://' + redirect_uri[7:]

    client_config = {
        "web": {
            "client_id": cfg['client_id'],
            "client_secret": cfg['client_secret'],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }

    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=redirect_uri,
        state=state,
    )

    flow.fetch_token(code=code)
    creds = flow.credentials

    # Fetch user's Google email
    google_email = ''
    try:
        oauth2_service = build('oauth2', 'v2', credentials=creds)
        user_info = oauth2_service.userinfo().get().execute()
        google_email = user_info.get('email', '')
    except Exception as e:
        logger.warning(f"Could not fetch Google user info: {e}")
        google_email = user.email or ''

    token_expiry = None
    if creds.expiry:
        token_expiry = creds.expiry if timezone.is_aware(creds.expiry) else timezone.make_aware(creds.expiry)

    # Persist or update (preserve existing refresh_token if Google does not re-issue one)
    defaults = {
        'google_email': google_email,
        'access_token': creds.token,
        'token_expiry': token_expiry,
        'sync_enabled': True,
        'last_sync_at': timezone.now(),
    }
    if creds.refresh_token:
        defaults['refresh_token'] = creds.refresh_token

    cred_obj, _ = GoogleCalendarCredential.objects.update_or_create(
        user=user,
        defaults=defaults,
    )
    return cred_obj

def get_calendar_service_for_user(user):
    """
    Returns an authenticated Google Calendar API service resource.
    Refreshes the access token automatically if expired.
    """
    from .models import GoogleCalendarCredential

    cred_obj = GoogleCalendarCredential.objects.filter(user=user, sync_enabled=True).first()
    if not cred_obj or not cred_obj.access_token:
        return None

    cfg = get_google_calendar_config()

    creds = Credentials(
        token=cred_obj.access_token,
        refresh_token=cred_obj.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=cfg['client_id'],
        client_secret=cfg['client_secret'],
        scopes=SCOPES,
    )

    # Check expiration and refresh if necessary
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            cred_obj.access_token = creds.token
            if creds.expiry:
                cred_obj.token_expiry = (
                    creds.expiry if timezone.is_aware(creds.expiry) else timezone.make_aware(creds.expiry)
                )
            cred_obj.save(update_fields=['access_token', 'token_expiry', 'updated_at'])
        except Exception as e:
            logger.error(f"Failed to refresh Google Calendar credentials for user {user.username}: {e}")
            return None

    return build('calendar', 'v3', credentials=creds)

def format_event_body(planned_visit):
    """Builds a standardized Google Calendar event payload for a PlannedVisit."""
    msme = planned_visit.msme
    bge = planned_visit.bge
    date_str = planned_visit.scheduled_date.strftime('%Y-%m-%d')

    title = f"MSME Visit: {msme.business_name} ({planned_visit.get_visit_type_display()})"

    lines = [
        "PRUDEV II MSME FIELD VISIT",
        "------------------------------------",
        f"Business Name: {msme.business_name}",
        f"MSME Code: {getattr(msme, 'msme_code', '') or getattr(msme, 'unique_code', '') or '—'}",
        f"District: {msme.district or '—'} | Sector: {msme.sector or '—'}",
        f"Contact Person: {planned_visit.contact_person or msme.owner_name or '—'}",
        f"Phone: {planned_visit.contact_phone or msme.phone or '—'}",
        f"Assigned BGE: {bge.name} ({bge.bge_code or 'BGE'})",
        f"Meeting Venue: {planned_visit.get_meeting_venue_display()}",
        "",
        f"Status: {planned_visit.get_status_display()}",
    ]

    if planned_visit.title:
        lines.extend(["", f"Meeting Title: {planned_visit.title}"])
    if planned_visit.objectives:
        lines.extend(["", "Session Objectives:", planned_visit.objectives])
    if planned_visit.agenda:
        lines.extend(["", "Agenda:", planned_visit.agenda])

    if planned_visit.status == 'missed':
        lines.extend([
            "",
            f"⚠️ MISSED REASON: {planned_visit.get_missed_reason_display() or '—'}",
            f"Notes: {planned_visit.missed_reason_notes or '—'}",
        ])
    elif planned_visit.status == 'completed':
        lines.extend([
            "",
            "✓ VISIT COMPLETED",
            f"Notes: {planned_visit.completion_notes or '—'}",
        ])

    lines.extend([
        "",
        "PRUDEV Portal: https://bds.glowi.africa",
    ])
    description = "\n".join(lines)
    location = f"{planned_visit.get_meeting_venue_display()}, {msme.district or 'Northern Uganda'}, Uganda"

    # Start and End Times
    time_zone = 'Africa/Kampala'
    if planned_visit.start_time:
        st_str = planned_visit.start_time.strftime('%H:%M:%S')
        start_payload = {'dateTime': f"{date_str}T{st_str}", 'timeZone': time_zone}

        if planned_visit.end_time:
            et_str = planned_visit.end_time.strftime('%H:%M:%S')
            end_payload = {'dateTime': f"{date_str}T{et_str}", 'timeZone': time_zone}
        else:
            # Default 1 hour
            dt_start = datetime.combine(planned_visit.scheduled_date, planned_visit.start_time)
            dt_end = dt_start + timedelta(hours=1)
            end_payload = {'dateTime': dt_end.strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': time_zone}
    else:
        # All day
        start_payload = {'date': date_str}
        end_payload = {'date': date_str}

    # Color ID:
    # 10 = Green (Completed), 11 = Red (Missed), 5 = Yellow (Rescheduled), 9 = Blue (Planned)
    color_map = {
        'planned': '9',
        'completed': '10',
        'missed': '11',
        'rescheduled': '5',
        'cancelled': '8',
    }
    color_id = color_map.get(planned_visit.status, '9')

    payload = {
        'summary': title,
        'description': description,
        'location': location,
        'start': start_payload,
        'end': end_payload,
        'colorId': color_id,
        'reminders': {
            'useDefault': False,
            'overrides': [
                {'method': 'popup', 'minutes': 60},
                {'method': 'popup', 'minutes': 1440},
            ],
        },
    }

    # If the MSME has an email on file, add them as a calendar attendee
    # so the session automatically appears in their Google / personal calendar.
    msme_email = (getattr(msme, 'email', '') or getattr(msme, 'business_email', '')).strip()
    if msme_email and '@' in msme_email:
        payload['attendees'] = [
            {
                'email': msme_email,
                'displayName': planned_visit.contact_person or msme.owner_name or msme.business_name,
            }
        ]

    return payload

def sync_visit_to_google(planned_visit):
    """
    Synchronizes a single PlannedVisit instance to Google Calendar.
    Syncs to the assigned BGE's account or visit creator if they have connected Google Calendar.
    Non-blocking: catches exceptions gracefully and marks status as 'failed'.
    """
    from .models import GoogleCalendarCredential

    # Find the target user: assigned BGE first, then creator
    target_users = []
    if planned_visit.bge and planned_visit.bge.user:
        target_users.append(planned_visit.bge.user)
    if planned_visit.created_by and planned_visit.created_by not in target_users:
        target_users.append(planned_visit.created_by)

    # Check who has an active Google Calendar connection
    connected_user = None
    service = None
    for u in target_users:
        if GoogleCalendarCredential.objects.filter(user=u, sync_enabled=True).exists():
            service = get_calendar_service_for_user(u)
            if service:
                connected_user = u
                break

    if not service:
        # No connected Google Calendar for this visit
        planned_visit.google_sync_status = 'disabled'
        planned_visit.save(update_fields=['google_sync_status'])
        return False

    body = format_event_body(planned_visit)
    send_updates = 'all' if body.get('attendees') else 'none'

    try:
        if planned_visit.status == 'cancelled':
            if planned_visit.google_event_id:
                try:
                    service.events().delete(
                        calendarId='primary',
                        eventId=planned_visit.google_event_id,
                        sendUpdates=send_updates,
                    ).execute()
                except Exception as del_err:
                    logger.warning(f"Error deleting Google Calendar event: {del_err}")
                planned_visit.google_event_id = ''
                planned_visit.google_sync_status = 'synced'
                planned_visit.google_last_synced_at = timezone.now()
                planned_visit.save(update_fields=['google_event_id', 'google_sync_status', 'google_last_synced_at'])
                return True

        if planned_visit.google_event_id:
            # Update existing event
            event = service.events().patch(
                calendarId='primary',
                eventId=planned_visit.google_event_id,
                body=body,
                sendUpdates=send_updates,
            ).execute()
        else:
            # Create new event
            event = service.events().insert(
                calendarId='primary',
                body=body,
                sendUpdates=send_updates,
            ).execute()
            planned_visit.google_event_id = event.get('id', '')

        planned_visit.google_sync_status = 'synced'
        planned_visit.google_last_synced_at = timezone.now()
        planned_visit.save(update_fields=['google_event_id', 'google_sync_status', 'google_last_synced_at'])
        return True

    except Exception as e:
        logger.error(f"Google Calendar sync error for visit #{planned_visit.id}: {e}")
        planned_visit.google_sync_status = 'failed'
        planned_visit.save(update_fields=['google_sync_status'])
        return False

def sync_all_visits_for_user(user):
    """
    Syncs all upcoming and active planned visits for the specified user.
    Handles both BGE specialists and Programme Managers/Admins.
    """
    from django.db.models import Q
    from .models import PlannedVisit

    if user.is_staff or user.is_superuser:
        visits = PlannedVisit.objects.exclude(status='cancelled').order_by('scheduled_date')
    else:
        visits = PlannedVisit.objects.filter(
            Q(bge__user=user) | Q(created_by=user)
        ).exclude(status='cancelled').order_by('scheduled_date')

    synced_count = 0
    for v in visits:
        if sync_visit_to_google(v):
            synced_count += 1
    return synced_count

