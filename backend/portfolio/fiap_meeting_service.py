import os
import uuid
import logging
import datetime
from urllib.parse import urlencode
from django.conf import settings
from django.utils import timezone
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

# Official Access to Finance Reviewers for Financial Action Plan approval
ROSEMARY_NAME = "Rosemary Laker"
ROSEMARY_EMAIL = os.environ.get("ROSEMARY_EMAIL", "rosemary.laker@gopa.eu")
ROSEMARY_ROLE = "Access to Finance Specialist / Programme Manager, PRUDEV II"

HARRIET_NAME = "Harriet Daisy Amule"
HARRIET_EMAIL = os.environ.get("HARRIET_EMAIL", "harrietdaisy.amule@gopa.eu")
HARRIET_ROLE = "Access to Finance Specialist / Programme Manager, PRUDEV II"

RICHARD_NAME = "Richard Obuku"
RICHARD_EMAIL = os.environ.get("RICHARD_EMAIL", "richard.obuku@gopa.eu")


def get_fiap_reviewers(reviewer_target='both'):
    """
    Returns list of reviewer recipients based on selection.
    Options: 'rosemary', 'harriet', 'both'
    """
    reviewers = []
    if reviewer_target in ('rosemary', 'both'):
        reviewers.append({"name": ROSEMARY_NAME, "email": ROSEMARY_EMAIL, "role": ROSEMARY_ROLE})
    if reviewer_target in ('harriet', 'both'):
        reviewers.append({"name": HARRIET_NAME, "email": HARRIET_EMAIL, "role": HARRIET_ROLE})
    if not reviewers:
        reviewers.append({"name": ROSEMARY_NAME, "email": ROSEMARY_EMAIL, "role": ROSEMARY_ROLE})
    return reviewers


def build_fiap_meeting_ics(meeting):
    """
    Generates an RFC 5545 and RFC 5546 (iTIP) compliant iCalendar (.ics) string
    with METHOD:REQUEST for calendar clients (Google Calendar, Outlook, Apple Mail)
    to render accept/decline buttons and calendar invites.
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
    event_uid = meeting.calendar_event_uid or f"fiap-meeting-{meeting.id}-{uuid.uuid4().hex[:8]}@prudev.gopa.eu"

    format_labels = {
        'google_meet': 'Google Meet (Online Video Call)',
        'teams': 'Microsoft Teams (Online Video Call)',
        'in_person': 'In-Person (PRUDEV II / GOPA Pro Office or Enterprise Location)',
        'phone': 'Phone Call (+256)',
    }
    location_str = meeting.meeting_link or format_labels.get(meeting.meeting_format, 'Google Meet (Online)')

    rev_target = meeting.reviewer_target or 'both'
    rev_str = "Rosemary Laker & Harriet Daisy Amule" if rev_target == 'both' else ("Rosemary Laker" if rev_target == 'rosemary' else "Harriet Daisy Amule")
    summary = f"PRUDEV II · Financial Action Plan Approval: {msme_name} with {rev_str}"

    plan = meeting.plan
    cat_name = getattr(plan, 'category_name', '') or 'Access to Finance Diagnostic'
    target_fsp = getattr(plan, 'preferred_fsp', '') or 'Partner FSP'
    target_facility = getattr(plan, 'financing_target', '') or 'Credit Readiness'
    amount = getattr(plan, 'estimated_amount', '') or 'TBD'

    notes_text = meeting.agenda_notes.strip() if meeting.agenda_notes else "Review diagnostic findings and approve credit readiness roadmap."
    description_lines = [
        "PRUDEV II — Financial Improvement Action Plan (Access to Finance) Approval Session",
        "--------------------------------------------------------------------------------",
        f"MSME: {msme_name} ({msme_code})",
        f"District: {district or 'N/A'}",
        f"Primary Category: {cat_name}",
        f"Target Facility: {target_facility} ({target_fsp}) - UGX {amount}",
        f"Meeting Topic: {meeting.topic}",
        f"Format: {location_str}",
        "",
        "Assigned Reviewers (Access to Finance Leads):",
        f"• {ROSEMARY_NAME} ({ROSEMARY_ROLE}) <{ROSEMARY_EMAIL}>",
        f"• {HARRIET_NAME} ({HARRIET_ROLE}) <{HARRIET_EMAIL}>",
        "",
        f"Requested By: {meeting.requester_name} ({meeting.requester_email})",
        f"Phone: {meeting.requester_phone or 'N/A'}",
        "",
        "Agenda & Action Plan Review Details:",
        notes_text,
        "",
        "Portal Reference: PRUDEV II BDS Management Platform",
    ]
    description = "\\n".join(description_lines)

    organizer_email = getattr(settings, 'GMAIL_HOST_USER', 'richobuku@gmail.com')

    ics_lines = [
        "BEGIN:VCALENDAR",
        "PRODID:-//PRUDEV II//Financial Improvement Action Plan Meeting//EN",
        "VERSION:2.0",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "X-WR-CALNAME:PRUDEV II Financial Action Plan Approval Meetings",
        "X-WR-TIMEZONE:Africa/Kampala",
        "BEGIN:VEVENT",
        f"UID:{event_uid}",
        f"DTSTAMP:{now_utc_str}",
        f"DTSTART:{dtstart}",
        f"DTEND:{dtend}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"LOCATION:{location_str}",
        "STATUS:CONFIRMED",
        "SEQUENCE:0",
        f"ORGANIZER;CN=PRUDEV II Management:mailto:{organizer_email}",
    ]

    reviewers = get_fiap_reviewers(rev_target)
    for rev in reviewers:
        ics_lines.append(
            f"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN={rev['name']}:mailto:{rev['email']}"
        )

    if meeting.requester_email:
        req_clean_name = meeting.requester_name.replace(';', ' ').replace(':', ' ')
        ics_lines.append(
            f"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN={req_clean_name}:mailto:{meeting.requester_email}"
        )

    ics_lines.extend([
        "BEGIN:VALARM",
        "TRIGGER:-PT30M",
        "ACTION:DISPLAY",
        "DESCRIPTION:Reminder: PRUDEV II Financial Action Plan Approval Meeting in 30 minutes",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ])

    return "\r\n".join(ics_lines)


def build_google_calendar_url(meeting):
    """Generates a direct Google Calendar 'Create Event' template link."""
    msme_name = getattr(meeting.msme, 'business_name', '') or getattr(meeting.msme, 'name', 'MSME')
    rev_target = meeting.reviewer_target or 'both'
    rev_str = "Rosemary & Harriet" if rev_target == 'both' else ("Rosemary Laker" if rev_target == 'rosemary' else "Harriet Daisy Amule")
    title = f"PRUDEV II · Financial Action Plan Approval: {msme_name} with {rev_str}"

    s_date = meeting.scheduled_date
    s_time = meeting.start_time
    if meeting.end_time:
        e_time = meeting.end_time
    else:
        duration = meeting.duration_minutes or 45
        dt_start_temp = datetime.datetime.combine(s_date, s_time)
        e_time = (dt_start_temp + datetime.timedelta(minutes=duration)).time()

    dates_param = f"{s_date.strftime('%Y%m%d')}T{s_time.strftime('%H%M%S')}/{s_date.strftime('%Y%m%d')}T{e_time.strftime('%H%M%S')}"

    reviewers = get_fiap_reviewers(rev_target)
    reviewer_emails = [r['email'] for r in reviewers]
    add_emails = reviewer_emails + [meeting.requester_email, RICHARD_EMAIL]
    add_param = ",".join(filter(None, add_emails))

    plan = meeting.plan
    cat_name = getattr(plan, 'category_name', '') or 'Access to Finance Diagnostic'
    details = (
        f"PRUDEV II — Financial Improvement Action Plan Approval Session\\n\\n"
        f"MSME: {msme_name}\\n"
        f"Primary Category: {cat_name}\\n"
        f"Requested by: {meeting.requester_name} ({meeting.requester_email})\\n\\n"
        f"Notes: {meeting.agenda_notes or 'Review diagnostic gaps and approve credit readiness roadmap.'}"
    )

    location = meeting.meeting_link or (
        'PRUDEV II Office, Lira / Online' if meeting.meeting_format == 'in_person' else 'Google Meet'
    )

    params = {
        'action': 'TEMPLATE',
        'text': title,
        'dates': dates_param,
        'details': details,
        'location': location,
        'add': add_param,
    }
    return f"https://calendar.google.com/calendar/render?{urlencode(params)}"


def send_fiap_meeting_invite(meeting):
    """
    Sends email with RFC 5545 .ics calendar attachment to Rosemary Laker / Harriet Daisy Amule,
    CCing requester and Richard Obuku.
    """
    msme_name = getattr(meeting.msme, 'business_name', '') or getattr(meeting.msme, 'name', 'MSME')
    msme_code = getattr(meeting.msme, 'msme_code', '')
    district = getattr(meeting.msme, 'district', '')
    plan = meeting.plan

    cat_name = getattr(plan, 'category_name', '') or 'Financial Records & Documentation'
    cat_num = getattr(plan, 'category', '')
    gaps_count = len(getattr(plan, 'gaps_identified', []) or [])
    steps_count = len(getattr(plan, 'action_plan_steps', []) or [])
    priority = getattr(plan, 'support_priority', 'Medium')
    financing_target = getattr(plan, 'financing_target', '') or 'Working Capital / Asset Finance'
    amount = getattr(plan, 'estimated_amount', '') or 'To be determined'
    preferred_fsp = getattr(plan, 'preferred_fsp', '') or 'Partner Financial Institution'

    rev_target = meeting.reviewer_target or 'both'
    reviewers = get_fiap_reviewers(rev_target)
    rev_names = " & ".join(r['name'] for r in reviewers)

    date_str = meeting.scheduled_date.strftime("%A, %B %d, %Y")
    start_str = meeting.start_time.strftime("%I:%M %p")
    end_str = meeting.end_time.strftime("%I:%M %p") if meeting.end_time else ""
    time_window = f"{start_str} – {end_str} (EAT)" if end_str else f"{start_str} (EAT)"

    format_labels = {
        'google_meet': 'Google Meet (Video Conference)',
        'teams': 'Microsoft Teams (Video Conference)',
        'in_person': 'In-Person (PRUDEV II Office or Enterprise Location)',
        'phone': 'Phone Call (+256)',
    }
    format_label = format_labels.get(meeting.meeting_format, 'Google Meet (Online)')

    gcal_url = build_google_calendar_url(meeting)

    subject = f"[PRUDEV II Approval Request] Financial Action Plan for {msme_name} ({msme_code or district}) — {date_str}"

    text_body = f"""Dear {rev_names},

A meeting request and approval notification has been submitted by BGE Specialist {meeting.requester_name} for the MSME Financial Improvement Action Plan (Access to Finance / Credit Readiness).

MEETING DETAILS:
• Date: {date_str}
• Time: {time_window}
• Duration: {meeting.duration_minutes} minutes
• Format: {format_label}
• Meeting Link / Venue: {meeting.meeting_link or 'Link will be generated / standard office'}

MSME PROFILE & DIAGNOSTIC:
• Enterprise: {msme_name} ({msme_code})
• District / Sector: {district} · {getattr(meeting.msme, 'sector', 'General')}
• Primary Action Plan Category: #{cat_num} — {cat_name}
• Diagnostic Gaps: {gaps_count} binding barrier(s) identified
• Phased Roadmap: {steps_count} sequenced milestone step(s)
• Credit Readiness Priority: {priority} Priority
• Target Facility: {financing_target} (Amount: UGX {amount})
• Preferred FSP: {preferred_fsp}

REQUESTER / BGE DETAILS:
• Name: {meeting.requester_name}
• Email: {meeting.requester_email}
• Phone: {meeting.requester_phone or 'N/A'}

AGENDA & BGE NOTES:
{meeting.agenda_notes or 'Review diagnostic gaps, verify credit readiness roadmap, and endorse for partner financial institution linkage.'}

ADD TO GOOGLE CALENDAR:
{gcal_url}

Please find the attached calendar invitation (.ics) to add this session directly to your schedule and review the submitted action plan in the PRUDEV II Portal.

Best regards,
PRUDEV II Access to Finance & BDS Team
GOPA Pro / GIZ Uganda
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1E293B; background: #F8FAFC; margin: 0; padding: 24px; }}
    .container {{ max-width: 650px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }}
    .header {{ background: linear-gradient(135deg, #1E3A8A 0%, #172554 100%); color: #FFFFFF; padding: 28px; text-align: left; }}
    .header h1 {{ margin: 0 0 6px 0; font-size: 20px; font-weight: 800; letter-spacing: -0.2px; }}
    .header p {{ margin: 0; font-size: 13px; color: #93C5FD; font-weight: 500; }}
    .content {{ padding: 28px; }}
    .badge {{ display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; background: #EFF6FF; color: #1E3A8A; border: 1px solid #BFDBFE; }}
    .badge-priority {{ background: #FEF2F2; color: #991B1B; border-color: #FCA5A5; }}
    .card {{ background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; margin: 18px 0; }}
    .card-title {{ font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #64748B; margin-bottom: 12px; }}
    .data-row {{ display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #E2E8F0; font-size: 13px; }}
    .data-row:last-child {{ border-bottom: none; }}
    .data-label {{ font-weight: 600; color: #64748B; }}
    .data-val {{ font-weight: 700; color: #0F172A; text-align: right; }}
    .btn {{ display: inline-block; background: #1E3A8A; color: #FFFFFF !important; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 8px 4px 8px 0; }}
    .btn-secondary {{ background: #F1F5F9; color: #1E293B !important; border: 1px solid #CBD5E1; }}
    .notes-box {{ background: #FFFBEB; border-left: 4px solid #D97706; padding: 14px; border-radius: 4px; font-size: 13px; color: #78350F; margin: 16px 0; font-style: italic; }}
    .footer {{ background: #F1F5F9; padding: 18px 28px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #E2E8F0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="margin-bottom: 8px;"><span class="badge">PRUDEV II · Access to Finance</span></div>
      <h1>Financial Action Plan Review & Approval</h1>
      <p>Proposed meeting with {rev_names} for {msme_name}</p>
    </div>
    <div class="content">
      <p>Dear <strong>{rev_names}</strong>,</p>
      <p>A meeting request and approval review has been initiated by BGE Specialist <strong>{meeting.requester_name}</strong> for the <strong>MSME Financial Improvement Action Plan</strong> (Credit Readiness Diagnostic & Phased Roadmap).</p>

      <div class="card">
        <div class="card-title">Meeting Schedule & Format</div>
        <div class="data-row"><span class="data-label">Date</span><span class="data-val">{date_str}</span></div>
        <div class="data-row"><span class="data-label">Time Window</span><span class="data-val">{time_window}</span></div>
        <div class="data-row"><span class="data-label">Duration</span><span class="data-val">{meeting.duration_minutes} minutes</span></div>
        <div class="data-row"><span class="data-label">Format</span><span class="data-val">{format_label}</span></div>
        {f'<div class="data-row"><span class="data-label">Link / Location</span><span class="data-val"><a href="{meeting.meeting_link}" target="_blank">{meeting.meeting_link}</a></span></div>' if meeting.meeting_link else ''}
      </div>

      <div class="card">
        <div class="card-title">Enterprise Profile & Credit Readiness Diagnostic</div>
        <div class="data-row"><span class="data-label">Business Name</span><span class="data-val">{msme_name} ({msme_code or 'ID: ' + str(meeting.msme_id)})</span></div>
        <div class="data-row"><span class="data-label">District & Sector</span><span class="data-val">{district} · {getattr(meeting.msme, 'sector', 'General')}</span></div>
        <div class="data-row"><span class="data-label">Primary Binding Barrier</span><span class="data-val" style="color: #1E3A8A;">#{cat_num} — {cat_name}</span></div>
        <div class="data-row"><span class="data-label">Gaps & Phased Steps</span><span class="data-val">{gaps_count} identified gap(s) · {steps_count} roadmap step(s)</span></div>
        <div class="data-row"><span class="data-label">Support Priority</span><span class="data-val"><span class="badge {'badge-priority' if priority == 'High' else ''}">{priority} Priority</span></span></div>
        <div class="data-row"><span class="data-label">Target Facility</span><span class="data-val">{financing_target}</span></div>
        <div class="data-row"><span class="data-label">Estimated Credit Amount</span><span class="data-val">UGX {amount}</span></div>
        <div class="data-row"><span class="data-label">Target Financial Institution</span><span class="data-val">{preferred_fsp}</span></div>
      </div>

      <div class="card">
        <div class="card-title">Requesting BGE Specialist</div>
        <div class="data-row"><span class="data-label">Specialist Name</span><span class="data-val">{meeting.requester_name}</span></div>
        <div class="data-row"><span class="data-label">Email</span><span class="data-val">{meeting.requester_email}</span></div>
        <div class="data-row"><span class="data-label">Phone</span><span class="data-val">{meeting.requester_phone or 'N/A'}</span></div>
      </div>

      {f'<div class="notes-box"><strong>Agenda & BGE Notes:</strong><br>{meeting.agenda_notes}</div>' if meeting.agenda_notes else ''}

      <div style="text-align: center; margin-top: 24px;">
        <a href="{gcal_url}" class="btn" target="_blank">Add to Google Calendar</a>
      </div>
      <p style="font-size: 12px; color: #64748B; text-align: center; margin-top: 12px;">
        An official <strong>.ics calendar invite</strong> is attached to this email. You can accept or decline directly from your email client (Google Calendar / Outlook / Apple Mail).
      </p>
    </div>
    <div class="footer">
      PRUDEV II BDS Management Platform · GOPA Worldwide Consultants / GIZ Uganda<br>
      Access to Finance Component · Supporting Credit Readiness in Northern Uganda
    </div>
  </div>
</body>
</html>
"""

    to_emails = [r['email'] for r in reviewers]
    cc_emails = list(filter(None, [
        meeting.requester_email,
        RICHARD_EMAIL,
    ]))

    ics_content = build_fiap_meeting_ics(meeting)

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'PRUDEV II BDS Team <richobuku@gmail.com>'),
        to=to_emails,
        cc=cc_emails,
    )
    email.attach_alternative(html_body, "text/html")
    email.attach(
        filename="meeting_invite.ics",
        content=ics_content,
        mimetype="text/calendar; method=REQUEST; charset=UTF-8",
    )

    try:
        email.send(fail_silently=False)
        meeting.email_sent = True
        meeting.email_sent_at = timezone.now()
        meeting.email_error = ""
        meeting.save(update_fields=['email_sent', 'email_sent_at', 'email_error'])
        logger.info(f"[FIAP Meeting] Sent meeting invite for plan #{meeting.plan_id} to {to_emails}")
        return True, f"Meeting request and calendar invite successfully emailed to {rev_names} (CC: {meeting.requester_email}, {RICHARD_NAME})."
    except Exception as exc:
        err_msg = str(exc)
        meeting.email_sent = False
        meeting.email_error = err_msg
        meeting.save(update_fields=['email_sent', 'email_error'])
        logger.error(f"[FIAP Meeting] Failed to send email invite: {err_msg}", exc_info=True)
        return False, f"Meeting created in database, but email delivery encountered an issue: {err_msg}"
