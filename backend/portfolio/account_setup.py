"""Helpers for auto-provisioning Django Users for BGE rows.

Used by:
- portfolio/signals.py     (fires whenever a BGE is created via API, admin,
                            public signup form, or any other path that calls
                            BusinessGrowthExpert.save()/create())
- portfolio/management/commands/create_bge_accounts.py
                           (one-shot bulk run for BGEs that already exist)

Single source of truth for username minting + welcome-email content, so the
signal and the bulk command behave identically.
"""
import logging
import re

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import EmailMultiAlternatives

log = logging.getLogger(__name__)

DEFAULT_PASSWORD = 'bds123'


# ── Username helpers ────────────────────────────────────────────────────────
def _slug(text):
    s = re.sub(r'[^a-z0-9]+', '.', (text or '').lower()).strip('.')
    return re.sub(r'\.+', '.', s)


def mint_username(bge):
    """Username preference: email local-part > slug(name) > slug(bge_code)."""
    if bge.email:
        return bge.email.split('@')[0].lower()
    if bge.name:
        return _slug(bge.name)
    if bge.bge_code:
        return _slug(bge.bge_code)
    return None


def unique_username(base):
    """'jdoe', 'jdoe2', 'jdoe3' … until we find a free one."""
    if not base:
        return None
    if not User.objects.filter(username=base).exists():
        return base
    for n in range(2, 1000):
        candidate = f'{base}{n}'
        if not User.objects.filter(username=candidate).exists():
            return candidate
    return None


# ── Welcome email ───────────────────────────────────────────────────────────
def _welcome_email_html(bge, username, password, login_url):
    """Branded HTML body matching the password-reset email."""
    name = (bge.name or 'BGE').split()[0]
    return f"""\
<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#f5f5f5;">
  <div style="background:#1A2F4B;padding:24px;border-bottom:3px solid #C8102E;">
    <div style="color:#fff;font-weight:800;font-size:22px;letter-spacing:-0.3px;">PRUDEV II</div>
    <div style="color:rgba(255,255,255,0.7);font-size:12px;">MSME Portfolio Management</div>
  </div>
  <div style="background:#fff;padding:30px 24px;">
    <h2 style="color:#1A2F4B;margin-top:0;">Welcome, {name}.</h2>
    <p style="color:#374151;line-height:1.55;">
      Your Business Growth Expert account on the PRUDEV II portal is ready.
      Sign in to see the MSMEs assigned to you and start filing visit reports.
    </p>
    <div style="background:#F5F5F5;border-left:4px solid #C8102E;padding:14px 18px;margin:18px 0;border-radius:4px;">
      <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Your credentials</div>
      <div style="color:#1A2F4B;font-family:monospace;font-size:14px;">
        <div><strong>Username:</strong> {username}</div>
        <div><strong>Password:</strong> {password}</div>
      </div>
    </div>
    <a href="{login_url}" style="display:inline-block;background:#C8102E;color:#fff;
       text-decoration:none;font-weight:700;padding:12px 24px;border-radius:6px;margin-top:8px;">
      Sign in to PRUDEV II
    </a>
    <p style="color:#6b7280;font-size:13px;line-height:1.55;margin-top:24px;">
      For your security, please change this password on first login —
      use the <em>Forgot password?</em> link on the sign-in page if you'd
      like a fresh reset link emailed to you.
    </p>
  </div>
  <div style="text-align:center;color:#9ca3af;font-size:11px;padding:14px;">
    PRUDEV II BDS Team · GIZ · GOPA AFC
  </div>
</div>"""


def _welcome_email_text(bge, username, password, login_url):
    name = (bge.name or 'BGE').split()[0]
    return f"""\
Hello {name},

Your Business Growth Expert account on the PRUDEV II portal is ready.

  Sign in:  {login_url}
  Username: {username}
  Password: {password}

For your security, please change this password on first login. Use
"Forgot password?" on the sign-in page if you'd prefer a reset link.

— PRUDEV II BDS Team · GIZ · GOPA AFC
"""


def send_welcome_email(bge, username, password):
    """Best-effort welcome email. Failures are logged, never raised, so a
    misconfigured email backend can't block account provisioning."""
    if not bge.email:
        log.info("Skipped welcome email for BGE #%s — no email address.", bge.id)
        return False

    login_url = getattr(settings, 'FRONTEND_URL', 'https://bds.glowi.africa').rstrip('/') + '/login'
    subject = 'Welcome to PRUDEV II — your BGE login is ready'
    text    = _welcome_email_text(bge, username, password, login_url)
    html    = _welcome_email_html(bge, username, password, login_url)

    try:
        reply_to = [getattr(settings, 'EMAIL_REPLY_TO', '')] if getattr(settings, 'EMAIL_REPLY_TO', '') else None

        # BCC the admin (or whoever BGE_WELCOME_EMAIL_BCC points at) so there's
        # a paper trail of every auto-provisioned account. Skip if the BCC
        # address is the same as the recipient — no need to double-deliver.
        bcc_addr = (getattr(settings, 'BGE_WELCOME_EMAIL_BCC', '') or '').strip()
        bcc = [bcc_addr] if bcc_addr and bcc_addr.lower() != bge.email.lower() else None

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[bge.email],
            bcc=bcc,
            reply_to=reply_to,
        )
        msg.attach_alternative(html, 'text/html')
        msg.send(fail_silently=False)
        log.info(
            "Welcome email sent to %s%s for BGE #%s",
            bge.email,
            f" (BCC {bcc_addr})" if bcc else "",
            bge.id,
        )
        return True
    except Exception as exc:
        log.error("Welcome email failed for BGE #%s (%s): %s", bge.id, bge.email, exc)
        return False


# ── The thing every code path calls ─────────────────────────────────────────
def ensure_bge_account(bge, password=None, send_email=True):
    """Idempotently provision a Django User for `bge`.

    Returns one of: 'created', 'already_linked', 'skipped'.

    `password` defaults to DEFAULT_PASSWORD ('bds123'). When `send_email`
    is True (default) and a brand-new account is provisioned, the BGE
    receives the welcome email with their credentials.
    """
    if bge.user_id:
        return 'already_linked'

    base = mint_username(bge)
    username = unique_username(base)
    if not username:
        log.warning(
            "Skipped auto-account for BGE #%s — no usable email/name/bge_code.",
            bge.id,
        )
        return 'skipped'

    pw = password or DEFAULT_PASSWORD
    first, _, last = (bge.name or '').partition(' ')
    user = User.objects.create_user(
        username=username,
        email=bge.email or '',
        first_name=first,
        last_name=last,
        password=pw,
    )

    # Avoid recursive post_save — bypass the BGE signal by going through
    # the manager-level update() rather than instance.save().
    type(bge).objects.filter(pk=bge.pk).update(user=user)
    bge.user = user

    log.info("Auto-created account %s for BGE #%s (%s)", username, bge.id, bge.name)

    if send_email:
        send_welcome_email(bge, username, pw)

    return 'created'
