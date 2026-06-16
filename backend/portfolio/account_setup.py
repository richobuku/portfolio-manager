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

def _generate_temp_password():
    """Generate a unique random temporary password for each account."""
    import secrets
    return secrets.token_urlsafe(12)  # e.g. "X7kR2mNpQs4vWx"


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
    from django.contrib.auth.tokens import PasswordResetTokenGenerator
    from django.utils.http import urlsafe_base64_encode
    from django.utils.encoding import force_bytes
    name = (bge.name or 'BGE').split()[0]
    bge_code = bge.bge_code or '—'
    # Generate a one-time password-reset link for the email CTA
    reset_url = login_url
    if bge.email:
        try:
            from django.contrib.auth.models import User as _User
            u = _User.objects.get(email__iexact=bge.email)
            gen = PasswordResetTokenGenerator()
            uid = urlsafe_base64_encode(force_bytes(u.pk))
            tok = gen.make_token(u)
            reset_url = f"{login_url.rstrip('/login').rstrip('/')}/reset-password/{uid}/{tok}"
        except Exception:
            pass
    return f"""\
<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#f5f5f5;">
  <div style="background:#1A2F4B;padding:24px;border-bottom:3px solid #C8102E;">
    <div style="color:#fff;font-weight:800;font-size:22px;letter-spacing:-0.3px;">PRUDEV II</div>
    <div style="color:rgba(255,255,255,0.7);font-size:12px;">MSME Portfolio Management</div>
  </div>
  <div style="background:#fff;padding:30px 24px;">
    <h2 style="color:#1A2F4B;margin-top:0;">Welcome to PRUDEV II, {name}!</h2>
    <p style="color:#374151;line-height:1.55;">
      Your Business Growth Expert (BGE) account on the PRUDEV II portal is ready.
      Sign in to see the MSMEs assigned to you and start filing visit reports.
    </p>

    <div style="background:#1A2F4B;border-radius:8px;padding:16px 20px;margin:18px 0;text-align:center;">
      <div style="color:rgba(255,255,255,0.7);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Your BGE Code</div>
      <div style="color:#fff;font-family:monospace;font-size:22px;font-weight:800;letter-spacing:2px;">{bge_code}</div>
      <div style="color:rgba(255,255,255,0.6);font-size:11px;margin-top:6px;">Quote this code on every programme engagement</div>
    </div>

    <div style="background:#F5F5F5;border-left:4px solid #C8102E;padding:14px 18px;margin:18px 0;border-radius:4px;">
      <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">BDS Portal Login</div>
      <div style="color:#1A2F4B;font-family:monospace;font-size:14px;line-height:1.8;">
        <div><strong>URL:</strong> <a href="{login_url}" style="color:#C8102E;">{login_url}</a></div>
        <div><strong>Username:</strong> {username}</div>
      </div>
    </div>

    <a href="{reset_url}" style="display:inline-block;background:#C8102E;color:#fff;
       text-decoration:none;font-weight:700;padding:12px 24px;border-radius:6px;margin-top:8px;">
      Set Your Password &amp; Sign In →
    </a>

    <p style="color:#6b7280;font-size:13px;line-height:1.55;margin-top:24px;">
      Click the button above to set your password and access the portal.
      The link expires in 3 days. If it expires, use <em>Forgot password?</em>
      on the sign-in page to receive a fresh link.
    </p>
  </div>
  <div style="text-align:center;color:#9ca3af;font-size:11px;padding:14px;">
    PRUDEV II BDS Team · GIZ · GOPA AFC
  </div>
</div>"""


def _welcome_email_text(bge, username, password, login_url):
    name = (bge.name or 'BGE').split()[0]
    bge_code = bge.bge_code or '—'
    return f"""\
Hello {name},

Welcome to PRUDEV II! Your Business Growth Expert account is ready.

  YOUR BGE CODE: {bge_code}
  (Quote this code on every programme engagement)

  BDS Portal:  {login_url}
  Username:    {username}

Use "Forgot password?" on the sign-in page to set your password.
A reset link will be emailed to you immediately.

— PRUDEV II BDS Team · GIZ · GOPA AFC
"""


def _generate_sms_reset_link(email, base_url):
    """Generate a password-reset URL that can be sent via SMS."""
    try:
        from django.contrib.auth.models import User
        from django.contrib.auth.tokens import PasswordResetTokenGenerator
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        user = User.objects.get(email__iexact=email)
        gen   = PasswordResetTokenGenerator()
        uid   = urlsafe_base64_encode(force_bytes(user.pk))
        token = gen.make_token(user)
        return f"{base_url}/reset-password/{uid}/{token}"
    except Exception:
        return f"{base_url}/login"


def send_welcome_sms(bge, username, password=None):
    """Send a welcome SMS to the BGE's phone via Message Carrier. Best-effort.

    NOTE: We no longer include the password in the SMS. Instead we send a
    password-reset link so credentials are never transmitted over SMS.
    The `password` parameter is kept for backwards-compat but is ignored.
    """
    if not bge.phone:
        log.info("Skipped welcome SMS for BGE #%s — no phone number.", bge.id)
        return False

    import re as _re
    phone = _re.sub(r'[\s\-\(\)]', '', str(bge.phone))
    if phone.startswith('0'):
        phone = '+256' + phone[1:]
    if not phone.startswith('+'):
        phone = '+' + phone

    name      = (bge.name or 'BGE').split()[0]
    code      = bge.bge_code or 'N/A'
    login_url = getattr(settings, 'FRONTEND_URL', 'https://bds.glowi.africa').rstrip('/')

    # Generate a secure password-reset link — never transmit the password itself
    reset_link = _generate_sms_reset_link(bge.email, login_url) if bge.email else f'{login_url}/login'

    message = (
        f"Welcome to PRUDEV II, {name}! "
        f"Your BGE Code: {code}. "
        f"Set your password: {reset_link} "
        f"Username: {username}"
    )

    api_key  = getattr(settings, 'MESSAGE_CARRIER_API_KEY', '')
    base_url = getattr(settings, 'MESSAGE_CARRIER_BASE_URL', 'https://api.bravo.mystyler.xyz')
    endpoint = f'{base_url}/v1/api-keys/send-sms'

    if not api_key:
        log.warning("Skipped welcome SMS for BGE #%s — MESSAGE_CARRIER_API_KEY not set.", bge.id)
        return False

    try:
        import requests as _req
        resp = _req.post(
            endpoint,
            json={'phone': phone, 'message': message},
            headers={'x-api-key': api_key},
            timeout=15,
        )
        resp_data = resp.json() if resp.content else {}
        if resp.status_code < 300 and resp_data.get('sent'):
            # Cache the updated balance
            if 'balanceAfter' in resp_data:
                try:
                    from django.core.cache import cache
                    cache.set('mc_sms_wallet_balance', float(resp_data['balanceAfter']), timeout=86400)
                except Exception:
                    pass
            log.info("Welcome SMS sent to %s for BGE #%s (%s)", phone, bge.id, bge.name)
            return True
        else:
            log.warning("Welcome SMS to %s failed for BGE #%s: %s", phone, bge.id, resp_data)
            return False
    except Exception as exc:
        log.error("Welcome SMS error for BGE #%s (%s): %s", bge.id, bge.phone, exc)
        return False


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


def send_verification_email(user):
    """Best-effort 'verify your email' message for a newly-created account.

    Failures are logged, never raised, so a misconfigured email backend
    can't block account provisioning.
    """
    if not user.email:
        log.info("Skipped verification email for user #%s — no email address.", user.id)
        return False

    from django.utils.http import urlsafe_base64_encode
    from django.utils.encoding import force_bytes
    # Deferred import: auth_views imports send_verification_email from this
    # module inside resend_verification_view, so importing it back here at
    # module load time would create a circular import.
    from .auth_views import _verify_token_gen

    frontend_url = getattr(settings, 'FRONTEND_URL', 'https://bds.glowi.africa').rstrip('/')
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = _verify_token_gen.make_token(user)
    verify_url = f"{frontend_url}/verify-email?uid={uid}&token={token}"

    name = (user.first_name or user.username or '').strip() or 'there'
    subject = 'Verify your email address — PRUDEV II BDS Portal'
    text = f"""\
Hello {name},

Please confirm your email address to activate your PRUDEV II BDS Portal account.

  {verify_url}

If you didn't request this account, you can ignore this email.

— PRUDEV II BDS Team · GIZ · GOPA AFC
"""
    html = f"""\
<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#f5f5f5;">
  <div style="background:#1A2F4B;padding:24px;border-bottom:3px solid #C8102E;">
    <div style="color:#fff;font-weight:800;font-size:22px;letter-spacing:-0.3px;">PRUDEV II</div>
    <div style="color:rgba(255,255,255,0.7);font-size:12px;">MSME Portfolio Management</div>
  </div>
  <div style="background:#fff;padding:30px 24px;">
    <h2 style="color:#1A2F4B;margin-top:0;">Verify your email, {name}</h2>
    <p style="color:#374151;line-height:1.55;">
      Please confirm your email address to activate your PRUDEV II BDS Portal account.
      You won't be able to sign in until it's verified.
    </p>
    <a href="{verify_url}" style="display:inline-block;background:#C8102E;color:#fff;
       text-decoration:none;font-weight:700;padding:12px 24px;border-radius:6px;margin-top:8px;">
      Verify Email Address →
    </a>
    <p style="color:#6b7280;font-size:13px;line-height:1.55;margin-top:24px;">
      If you didn't request this account, you can safely ignore this email.
    </p>
  </div>
  <div style="text-align:center;color:#9ca3af;font-size:11px;padding:14px;">
    PRUDEV II BDS Team · GIZ · GOPA AFC
  </div>
</div>"""

    try:
        reply_to = [getattr(settings, 'EMAIL_REPLY_TO', '')] if getattr(settings, 'EMAIL_REPLY_TO', '') else None
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
            reply_to=reply_to,
        )
        msg.attach_alternative(html, 'text/html')
        msg.send(fail_silently=False)
        log.info("Verification email sent to %s for user #%s", user.email, user.id)
        return True
    except Exception as exc:
        log.error("Verification email failed for user #%s (%s): %s", user.id, user.email, exc)
        return False


# ── The thing every code path calls ─────────────────────────────────────────
def ensure_bge_account(bge, password=None, send_email=True):
    """Idempotently provision a Django User for `bge`.

    Returns one of: 'created', 'already_linked', 'skipped'.

    Each account receives a unique random temporary password.  The BGE is
    sent a password-reset link (not the password itself) via email and SMS,
    and is flagged must_change_password=True so they are prompted on first login.
    """
    from .models import UserSecurityProfile
    from django.utils import timezone as _tz

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

    # Generate a unique random password — never reuse a shared default
    pw = password or _generate_temp_password()
    first, _, last = (bge.name or '').partition(' ')
    user = User.objects.create_user(
        username=username,
        email=bge.email or '',
        first_name=first,
        last_name=last,
        password=pw,
    )

    # Mark must_change_password on first login. New accounts with an email
    # address must verify it before they can log in; accounts without an
    # email (no way to verify) default to email_verified=True.
    UserSecurityProfile.objects.create(
        user=user,
        must_change_password=True,
        password_last_changed=None,
        email_verified=not bool(bge.email),
    )

    # Avoid recursive post_save — bypass the BGE signal by going through
    # the manager-level update() rather than instance.save().
    type(bge).objects.filter(pk=bge.pk).update(user=user)
    bge.user = user

    log.info("Auto-created account %s for BGE #%s (%s)", username, bge.id, bge.name)

    if send_email:
        send_welcome_email(bge, username, pw)
        send_welcome_sms(bge, username)
        if bge.email:
            send_verification_email(user)

    return 'created'
