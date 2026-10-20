import os
import uuid
import logging
import datetime
from urllib.parse import urlencode
from django.conf import settings
from django.utils import timezone
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

# Official coaches for Enterprise Improvement Plan meetings
RICHARD_NAME = "Richard Obuku"
RICHARD_EMAIL = os.environ.get("RICHARD_EMAIL", "richard.obuku@gopa.eu")
RICHARD_ROLE = "BDS Manager / Programme Coordinator"

STEPHEN_NAME = os.environ.get("REPORT_ENDORSER_NAME", "Stephen Maxi Opwonya")
STEPHEN_EMAIL = os.environ.get("STEPHEN_EMAIL", "stephenmaxi.opwonya@gopa.eu")
STEPHEN_ROLE = os.environ.get("REPORT_ENDORSER_POSITION", "Team Leader, PRUDEV II — GOPA Pro")


def get_coach_recipients():
    """Returns list of primary coaching staff for TBIP formulation meetings."""
    return [
        {"name": RICHARD_NAME, "email": RICHARD_EMAIL, "role": RICHARD_ROLE},
        {"name": STEPHEN_NAME, "email": STEPHEN_EMAIL, "role": STEPHEN_ROLE},
    ]


def build_tbip_meeting_ics(meeting):
    """
    Generates an RFC 5545 and RFC 5546 (iTIP) compliant iCalendar (.ics) string
    with METHOD:REQUEST so mail and calendar clients (Google Calendar, Outlook,
    Apple Mail/Calendar) natively render accept/decline buttons and calendar invites.
    """
    msme_name = getattr(meeting.msme, 'business_name', '') or getattr(meeting.msme, 'name', 'MSME')
    msme_code = getattr(meeting.msme, 'msme_code', '') or f"MSME-{meeting.msme_id}"
    district = getattr(meeting.msme, 'district', '')

    s_date = meeting.scheduled_date
    s_time = meeting.start_time

    if meeting.end_time:
        e_time = meeting.end_time
    else:
        duration = meeting.duration_minutes or 45
        dt_start_temp = datetime.datetime.combine(s_date, s_time)
        dt_end_temp = dt_start_temp + datetime.timedelta(minutes=duration)
        e_time = dt_end_temp.time()

    dtstart = f"{s_date.strftime('%Y%m%d')}T{s_time.strftime('%H%M%S')}"
    dtend = f"{s_date.strftime('%Y%m%d')}T{e_time.strftime('%H%M%S')}"

    now_utc_str = timezone.now().strftime('%Y%m%dT%H%M%SZ')
    event_uid = meeting.calendar_event_uid or f"tbip-meeting-{meeting.id}-{uuid.uuid4().hex[:8]}@prudev.gopa.eu"

    format_labels = {
        'google_meet': 'Google Meet (Online Video Call)',
        'teams': 'Microsoft Teams (Online Video Call)',
        'in_person': 'In-Person (GOPA Pro / PRUDEV II Office or Enterprise Location)',
        'phone': f'Phone Call (+256)',
    }
    location_str = meeting.meeting_link or format_labels.get(meeting.meeting_format, 'Google Meet (Online)')

    summary = f"PRUDEV II · Enterprise Improvement Plan (TBIP): {msme_name} with Richard & Stephen"

    notes_text = meeting.agenda_notes.strip() if meeting.agenda_notes else "General coaching and formulation guidance."
    description_lines = [
        f"PRUDEV II — Enterprise Improvement Plan (TBIP) Formulation & Review Session",
        f"-------------------------------------------------------------------------",
        f"MSME: {msme_name} ({msme_code})",
        f"District: {district or 'N/A'}",
        f"Meeting Topic: {meeting.topic}",
        f"Format: {location_str}",
        f"",
        f"Lead Coaches:",
        f"• {RICHARD_NAME} ({RICHARD_ROLE}) <{RICHARD_EMAIL}>",
        f"• {STEPHEN_NAME} ({STEPHEN_ROLE}) <{STEPHEN_EMAIL}>",
        f"",
        f"Requested By: {meeting.requester_name} ({meeting.requester_email})",
        f"Phone: {meeting.requester_phone or 'N/A'}",
        f"",
        f"Agenda & Discussion Points:",
        notes_text,
        f"",
        f"Portal Reference: PRUDEV II BDS Management Platform",
    ]
    description = "\\n".join(description_lines)

    organizer_email = getattr(settings, 'GMAIL_HOST_USER', 'richobuku@gmail.com')

    ics_lines = [
        "BEGIN:VCALENDAR",
        "PRODID:-//PRUDEV II//Enterprise Improvement Plan Meeting//EN",
        "VERSION:2.0",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "X-WR-CALNAME:PRUDEV II Enterprise Improvement Plan Meetings",
        "X-WR-TIMEZONE:Africa/Kampala",
        "BEGIN:VEVENT",
        f"UID:{event_uid}",
        f"DTSTAMP:{now_utc_str}",
        f"DTSTART;TZID=Africa/Kampala:{dtstart}",
        f"DTEND;TZID=Africa/Kampala:{dtend}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"LOCATION:{location_str}",
        f'ORGANIZER;CN="PRUDEV II BDS Portal":mailto:{organizer_email}',
        f'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="{RICHARD_NAME}":mailto:{RICHARD_EMAIL}',
        f'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="{STEPHEN_NAME}":mailto:{STEPHEN_EMAIL}',
        f'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN="{meeting.requester_name}":mailto:{meeting.requester_email}',
        "STATUS:CONFIRMED",
        "SEQUENCE:0",
        "TRANSP:OPAQUE",
        "END:VEVENT",
        "END:VCALENDAR",
    ]

    return "\r\n".join(ics_lines)


def build_google_calendar_url(meeting):
    """
    Generates a pre-filled direct Google Calendar add event URL.
    """
    msme_name = getattr(meeting.msme, 'business_name', '') or getattr(meeting.msme, 'name', 'MSME')
    s_date = meeting.scheduled_date
    s_time = meeting.start_time

    if meeting.end_time:
        e_time = meeting.end_time
    else:
        duration = meeting.duration_minutes or 45
        dt_start_temp = datetime.datetime.combine(s_date, s_time)
        dt_end_temp = dt_start_temp + datetime.timedelta(minutes=duration)
        e_time = dt_end_temp.time()

    # Dates parameter in format: YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS
    dtstart_str = f"{s_date.strftime('%Y%m%d')}T{s_time.strftime('%H%M%S')}"
    dtend_str = f"{s_date.strftime('%Y%m%d')}T{e_time.strftime('%H%M%S')}"

    title = f"PRUDEV II TBIP Meeting: {msme_name} with Richard & Stephen"
    notes = meeting.agenda_notes.strip() if meeting.agenda_notes else "Enterprise Improvement Plan formulation"
    details = (
        f"Enterprise Improvement Plan Formulation Meeting\n"
        f"MSME: {msme_name}\n"
        f"Topic: {meeting.topic}\n"
        f"Coaches: {RICHARD_NAME} & {STEPHEN_NAME}\n"
        f"Requested by: {meeting.requester_name}\n\n"
        f"Agenda:\n{notes}"
    )

    format_labels = {
        'google_meet': 'Google Meet (Online)',
        'teams': 'Microsoft Teams',
        'in_person': 'Office / Field Location',
        'phone': 'Phone Call',
    }
    location = meeting.meeting_link or format_labels.get(meeting.meeting_format, 'Google Meet (Online)')

    attendees = [RICHARD_EMAIL, STEPHEN_EMAIL, meeting.requester_email]
    add_param = ",".join(filter(None, attendees))

    params = {
        'action': 'TEMPLATE',
        'text': title,
        'dates': f"{dtstart_str}/{dtend_str}",
        'details': details,
        'location': location,
        'ctz': 'Africa/Kampala',
        'add': add_param,
    }
    return f"https://calendar.google.com/calendar/render?{urlencode(params)}"


def send_tbip_meeting_invite(meeting):
    """
    Dispatches a branded HTML email with an attached RFC 5545 iCalendar (.ics) invite
    to Richard Obuku, Stephen Maxi Opwonya, and the meeting requester.
    """
    msme_name = getattr(meeting.msme, 'business_name', '') or getattr(meeting.msme, 'name', 'MSME')
    msme_code = getattr(meeting.msme, 'msme_code', '') or f"MSME-{meeting.msme_id}"
    district = getattr(meeting.msme, 'district', '')

    format_labels = {
        'google_meet': 'Google Meet (Online Video Call)',
        'teams': 'Microsoft Teams (Online Video Call)',
        'in_person': 'In-Person (Office / Enterprise Visit)',
        'phone': 'Phone Call',
    }
    format_display = format_labels.get(meeting.meeting_format, 'Google Meet (Online Video Call)')
    meeting_link = meeting.meeting_link or 'Link will be coordinated before session'

    formatted_date = meeting.scheduled_date.strftime('%A, %d %B %Y')
    formatted_start = meeting.start_time.strftime('%I:%M %p')
    formatted_end = meeting.end_time.strftime('%I:%M %p') if meeting.end_time else ''
    time_display = f"{formatted_start} – {formatted_end} EAT" if formatted_end else f"{formatted_start} EAT"

    gcal_url = build_google_calendar_url(meeting)

    subject = f"Meeting Request: Enterprise Improvement Plan (TBIP) — {msme_name} with Richard & Stephen"

    # Plain text version
    plain_text = f"""PRUDEV II — Enterprise Improvement Plan (TBIP) Meeting Request

Dear {meeting.requester_name}, Richard Obuku, and Stephen Maxi Opwonya,

A meeting has been scheduled to formulate and review the Enterprise Improvement Plan (TBIP) for {msme_name}.

MEETING DETAILS:
• MSME: {msme_name} ({msme_code})
• District: {district or 'N/A'}
• Topic: {meeting.topic}
• Date: {formatted_date}
• Time: {time_display} ({meeting.duration_minutes} minutes)
• Format: {format_display}
• Location / Link: {meeting_link}

COACHING TEAM:
• {RICHARD_NAME} ({RICHARD_ROLE}) <{RICHARD_EMAIL}>
• {STEPHEN_NAME} ({STEPHEN_ROLE}) <{STEPHEN_EMAIL}>

REQUESTED BY:
• Name: {meeting.requester_name}
• Email: {meeting.requester_email}
• Phone: {meeting.requester_phone or 'N/A'}

AGENDA & DISCUSSION POINTS:
{meeting.agenda_notes or 'General coaching and formulation guidance.'}

CALENDAR INVITE:
An iCalendar (.ics) invite is attached to this email. You can also add it to Google Calendar via:
{gcal_url}

Best regards,
PRUDEV II BDS Team
GOPA Pro / GIZ
"""

    # HTML version
    notes_html = (meeting.agenda_notes or 'General coaching and guidance on formulating the Enterprise Improvement Plan.').replace('\n', '<br>')

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{subject}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; background-color: #F8FAFC; margin: 0; padding: 24px; }}
    .container {{ max-width: 620px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .accent-bar {{ height: 6px; background: linear-gradient(90deg, #F5A623 0%, #F5A623 50%, #C8102E 50%, #C8102E 100%); }}
    .header {{ padding: 28px 32px 20px; background-color: #0F172A; color: #FFFFFF; }}
    .header h1 {{ margin: 0 0 6px; font-size: 20px; font-weight: 800; letter-spacing: -0.2px; }}
    .header p {{ margin: 0; font-size: 13px; color: #94A3B8; font-weight: 500; }}
    .badge {{ display: inline-block; background-color: rgba(245, 166, 35, 0.2); color: #F5A623; border: 1px solid #F5A623; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-top: 10px; }}
    .content {{ padding: 28px 32px; }}
    .intro {{ font-size: 14.5px; line-height: 1.6; color: #334155; margin-bottom: 24px; }}
    .card {{ background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px 20px; margin-bottom: 24px; }}
    .card-title {{ font-size: 12px; text-transform: uppercase; font-weight: 800; color: #64748B; letter-spacing: 0.5px; margin-bottom: 12px; }}
    .grid-row {{ display: flex; margin-bottom: 10px; font-size: 13.5px; }}
    .grid-label {{ width: 140px; font-weight: 700; color: #475569; }}
    .grid-value {{ flex: 1; color: #0F172A; font-weight: 600; }}
    .btn {{ display: inline-block; padding: 12px 22px; font-size: 13.5px; font-weight: 700; text-decoration: none; border-radius: 8px; margin-right: 12px; margin-bottom: 10px; }}
    .btn-primary {{ background-color: #0F172A; color: #FFFFFF !important; }}
    .btn-gcal {{ background-color: #2563EB; color: #FFFFFF !important; }}
    .footer {{ padding: 20px 32px; background: #F1F5F9; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B; line-height: 1.5; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="accent-bar"></div>
    <div class="header">
      <h1>PRUDEV II · Enterprise Improvement Plan (TBIP)</h1>
      <p>Coaching & Formulation Session with Richard Obuku & Stephen Maxi Opwonya</p>
      <span class="badge">Meeting Confirmed & Invite Dispatched</span>
    </div>

    <div class="content">
      <p class="intro">
        Hello <strong>{meeting.requester_name}</strong>, <strong>{RICHARD_NAME}</strong>, and <strong>{STEPHEN_NAME}</strong>,<br><br>
        A dedicated coaching and review meeting has been requested to guide and formulate the <strong>Enterprise Improvement Plan (TBIP)</strong> for <strong>{msme_name}</strong>.
      </p>

      <div class="card">
        <div class="card-title">📅 Session Schedule & Details</div>
        <div class="grid-row">
          <div class="grid-label">Target MSME:</div>
          <div class="grid-value">{msme_name} <span style="color:#64748B;font-weight:400;">({msme_code} · {district or 'N/A'})</span></div>
        </div>
        <div class="grid-row">
          <div class="grid-label">Meeting Topic:</div>
          <div class="grid-value" style="color:#C8102E;">{meeting.topic}</div>
        </div>
        <div class="grid-row">
          <div class="grid-label">Date & Time:</div>
          <div class="grid-value">{formatted_date} · <strong>{time_display}</strong> ({meeting.duration_minutes} mins)</div>
        </div>
        <div class="grid-row">
          <div class="grid-label">Meeting Format:</div>
          <div class="grid-value">{format_display}</div>
        </div>
        <div class="grid-row">
          <div class="grid-label">Venue / Link:</div>
          <div class="grid-value">{meeting_link}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">👥 Participants</div>
        <div class="grid-row">
          <div class="grid-label">Lead Coaches:</div>
          <div class="grid-value">
            • <strong>{RICHARD_NAME}</strong> ({RICHARD_ROLE}) &lt;{RICHARD_EMAIL}&gt;<br>
            • <strong>{STEPHEN_NAME}</strong> ({STEPHEN_ROLE}) &lt;{STEPHEN_EMAIL}&gt;
          </div>
        </div>
        <div class="grid-row" style="margin-top:8px;">
          <div class="grid-label">Requested By:</div>
          <div class="grid-value">
            <strong>{meeting.requester_name}</strong> &lt;{meeting.requester_email}&gt;
            {f"<br>Phone: {meeting.requester_phone}" if meeting.requester_phone else ""}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📝 Specific Discussion Points & Questions</div>
        <div style="font-size:13.5px;color:#334155;line-height:1.6;">
          {notes_html}
        </div>
      </div>

      <div style="margin-top: 24px; text-align: left;">
        <a href="{gcal_url}" class="btn btn-gcal" target="_blank">📅 Add to Google Calendar</a>
      </div>
    </div>

    <div class="footer">
      <strong>PRUDEV II BDS Management Platform</strong> · GOPA Pro / GIZ<br>
      An official iCalendar (.ics) invite has been attached to this email. Opening the attachment will automatically add this session to your calendar.
    </div>
  </div>
</body>
</html>"""

    # Build recipients
    to_emails = [meeting.requester_email]
    cc_emails = [RICHARD_EMAIL, STEPHEN_EMAIL]

    # Include admin/gmail host if not already in list
    admin_email = getattr(settings, 'ADMIN_EMAIL', 'richobuku@gmail.com')
    if admin_email and admin_email not in to_emails and admin_email not in cc_emails:
        cc_emails.append(admin_email)

    # Unique list
    cc_emails = list(dict.fromkeys(cc_emails))

    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', f'PRUDEV II BDS Team <{admin_email}>')
    reply_to = [RICHARD_EMAIL, STEPHEN_EMAIL]

    # Generate ICS
    ics_string = build_tbip_meeting_ics(meeting)

    try:
        email = EmailMultiAlternatives(
            subject=subject,
            body=plain_text,
            from_email=from_email,
            to=to_emails,
            cc=cc_emails,
            reply_to=reply_to,
        )
        email.attach_alternative(html_content, "text/html")

        # Attach .ics calendar invite with standard RFC 5546 method=REQUEST
        ics_filename = f"tbip_meeting_{msme_code}.ics"
        email.attach(
            filename=ics_filename,
            content=ics_string,
            mimetype='text/calendar; charset="utf-8"; method=REQUEST'
        )

        email.send(fail_silently=False)

        meeting.email_sent = True
        meeting.email_sent_at = timezone.now()
        meeting.email_error = ""
        meeting.save(update_fields=['email_sent', 'email_sent_at', 'email_error'])
        logger.info("Successfully sent TBIP meeting invite for meeting %s to %s (CC: %s)", meeting.id, to_emails, cc_emails)
        return True, "Invite sent successfully."

    except Exception as exc:
        err_msg = str(exc)
        logger.error("Failed to send TBIP meeting invite for meeting %s: %s", meeting.id, err_msg)
        meeting.email_sent = False
        meeting.email_error = err_msg
        meeting.save(update_fields=['email_sent', 'email_error'])
        return False, err_msg
