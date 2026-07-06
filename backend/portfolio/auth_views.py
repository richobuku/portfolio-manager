import logging
from django.contrib.auth import authenticate, login
from django.contrib.auth.models import User
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class PasswordResetThrottle(AnonRateThrottle):
    scope = 'password_reset'

logger = logging.getLogger(__name__)
try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from .models import BusinessGrowthExpert, CohortAdmin

# Stateless password-reset tokens. Survive process restarts and work across
# gunicorn workers (the previous in-memory dict failed on both counts).
# `default_token_generator` hashes (user.pk, user.password, last_login,
# timestamp) with SECRET_KEY — invalidated on password change automatically,
# expires after PASSWORD_RESET_TIMEOUT (default 3 days).
_reset_token_gen = PasswordResetTokenGenerator()

import os as _os
GOOGLE_CLIENT_ID = _os.environ.get('GOOGLE_CLIENT_ID', '')


def _build_user_response(user):
    """Shared helper to build the login response payload."""
    from .authentication import sign_token
    token = sign_token(user.id, user.username)
    bge_profile = None
    managed_cohort_ids = None

    if user.is_staff or user.is_superuser:
        role = 'admin'
    else:
        # Check for scoped programme-manager role before falling back to BGE/viewer
        try:
            ca = user.cohort_admin_profile
            role = 'cohort_admin'
            managed_cohort_ids = list(ca.managed_groups.values_list('id', flat=True))
        except CohortAdmin.DoesNotExist:
            role = 'viewer'

    try:
        profile = user.bge_profile
        bge_profile = {'id': profile.id, 'name': profile.name, 'status': profile.status}
        if role == 'viewer':
            role = 'bge'
    except Exception:
        pass

    # ── Password change enforcement ──────────────────────────────────────────
    from django.utils import timezone as _tz
    from datetime import timedelta
    password_change_required = False
    sec = None
    try:
        sec = user.security_profile
        if sec.must_change_password:
            password_change_required = True
        elif sec.password_last_changed:
            if (_tz.now() - sec.password_last_changed) > timedelta(days=30):
                password_change_required = True
        else:
            # No record of last change — treat as requiring change if account > 1 day old
            if (_tz.now() - user.date_joined) > timedelta(days=1):
                password_change_required = True
    except Exception:
        # No security profile yet — create one and flag for change
        try:
            from .models import UserSecurityProfile
            sec, created = UserSecurityProfile.objects.get_or_create(user=user)
            if created:
                sec.must_change_password = True
                sec.save(update_fields=['must_change_password'])
            password_change_required = True
        except Exception:
            pass

    # ── Pending-approval gate ─────────────────────────────────────────────────
    # Viewer accounts created from an out-of-allowlist Google sign-in start
    # with viewer_approved=False and have no data access until an admin
    # approves them.
    if role == 'viewer' and sec is not None and not sec.viewer_approved:
        role = 'pending'

    from django.conf import settings as _dj_settings
    import time as _time
    lifetime = int(getattr(_dj_settings, 'SESSION_LIFETIME_SECONDS', 8 * 3600))

    payload = {
        'token': token,
        'session_expires_at': int(_time.time()) + lifetime,   # Unix timestamp
        'session_lifetime_seconds': lifetime,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
            'role': role,
            'bge_profile': bge_profile,
            'password_change_required': password_change_required,
        }
    }
    if managed_cohort_ids is not None:
        payload['user']['managed_cohort_ids'] = managed_cohort_ids
    return payload


def _try_auto_link_bge(user, google_name, google_email):
    """
    Try to auto-link a Google user to a BGE profile.
    Matching priority:
      1. BGE email == Google email   (exact — high confidence)
      2. BGE name == Google full name (case-insensitive exact — medium confidence)

    Tier 3 (given-name substring) has been intentionally removed.
    A single first name like "Mary" would match any BGE whose name contains
    "Mary" (e.g. "Mary Akello", "Rosemary Otim"), granting the attacker full
    BGE-level access before any admin approval.  The two remaining tiers are
    sufficient for normal onboarding; new BGEs who sign in via Google and have
    neither an email nor a full-name match will be created as regular users and
    must be linked by an admin.

    Returns the linked BGE profile or None.
    """
    # Already linked — nothing to do
    try:
        return user.bge_profile
    except Exception:
        pass

    # 1. Match by email (strongest signal — email uniqueness enforced)
    if google_email:
        bge = BusinessGrowthExpert.objects.filter(
            email__iexact=google_email, user__isnull=True
        ).first()
        if bge:
            bge.user = user
            bge.save()
            return bge

    # Tier 2 (name-match) REMOVED — Google display names are user-controlled,
    # so matching by name allows impersonation of any unlinked BGE.  Only the
    # email tier (above) is safe for automatic linking.  Unmatched users get a
    # regular account and must be linked by an admin via the link_bge_users
    # management command or the admin dashboard.
    return None


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def login_view(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')

    if not username or not password:
        return Response({'message': 'Username and password are required'}, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(username=username, password=password)
    if user is None:
        return Response({'message': 'Invalid username or password'}, status=status.HTTP_401_UNAUTHORIZED)

    if not user.is_active:
        return Response({'message': 'This account has been disabled.'}, status=status.HTTP_403_FORBIDDEN)

    login(request, user)
    return Response(_build_user_response(user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """Revoke the current token so it cannot be reused after logout."""
    from .authentication import revoke_token
    token = getattr(request, 'auth', None)
    if token:
        revoke_token(str(token))
    return Response({'message': 'Logged out successfully'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """Authenticated users change their own password.

    Body: { current_password, new_password }
    On success: updates security profile, revokes old token, returns new token.
    """
    from .authentication import revoke_token, sign_token
    from .models import UserSecurityProfile
    from django.utils import timezone as _tz

    current_password = request.data.get('current_password', '')
    new_password     = request.data.get('new_password', '')

    if not current_password or not new_password:
        return Response({'detail': 'current_password and new_password are required.'},
                        status=status.HTTP_400_BAD_REQUEST)
    if len(new_password) < 8:
        return Response({'detail': 'New password must be at least 8 characters.'},
                        status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    if not user.check_password(current_password):
        return Response({'detail': 'Current password is incorrect.'},
                        status=status.HTTP_400_BAD_REQUEST)

    if current_password == new_password:
        return Response({'detail': 'New password must be different from the current password.'},
                        status=status.HTTP_400_BAD_REQUEST)

    # Apply new password
    user.set_password(new_password)
    user.save(update_fields=['password'])

    # Update security profile
    sec, _ = UserSecurityProfile.objects.get_or_create(user=user)
    sec.must_change_password  = False
    sec.password_last_changed = _tz.now()
    sec.save(update_fields=['must_change_password', 'password_last_changed'])

    # Revoke old token and issue a fresh one
    old_token = getattr(request, 'auth', None)
    if old_token:
        revoke_token(str(old_token))
    new_token = sign_token(user.id, user.username)

    return Response({
        'detail': 'Password changed successfully.',
        'token': new_token,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def request_password_reset(request):
    email = request.data.get('email', '').strip().lower()
    if not email:
        return Response({'message': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # Check that SMTP is actually configured — if not, tell the admin rather than silently failing
    gmail_pw = getattr(settings, 'GMAIL_APP_PASSWORD', '')
    if not gmail_pw:
        logger.error(
            "Password reset requested but GMAIL_APP_PASSWORD is not set. "
            "Set it as an environment variable on your hosting platform."
        )
        return Response(
            {'message': 'Email delivery is not configured on this server. '
                        'Please contact the administrator to reset your password.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    user = User.objects.filter(email__iexact=email).first()
    if user:
        # Stateless token: validates against user.pk + password hash + last_login.
        # Carry the user id alongside so confirm_password_reset can look up.
        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        token  = _reset_token_gen.make_token(user)
        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://bds.glowi.africa')
        reset_link = f"{frontend_url}/reset-password?uid={uidb64}&token={token}"
        reply_to = getattr(settings, 'EMAIL_REPLY_TO', settings.DEFAULT_FROM_EMAIL)
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px">
          <h2 style="color:#1A2F4B">Password Reset — PRUDEV II</h2>
          <p>Click the button below to reset your password. This link expires after use.</p>
          <a href="{reset_link}" style="display:inline-block;margin:20px 0;padding:12px 28px;
             background:#C8102E;color:#fff;border-radius:6px;text-decoration:none;font-weight:700">
            Reset Password
          </a>
          <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
        </div>"""
        msg = EmailMultiAlternatives(
            subject='PRUDEV II — Password Reset',
            body=f'Reset your password: {reset_link}',
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
            reply_to=[reply_to],
        )
        msg.attach_alternative(html, 'text/html')
        try:
            msg.send()
            logger.info("Password reset email sent to %s", user.email)
        except Exception as exc:
            logger.error("Failed to send password reset email to %s: %s", user.email, exc)
            return Response(
                {'message': 'Failed to send reset email. Please try again later or contact the administrator.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # Always return success to avoid email enumeration
    return Response({'message': 'If that email is registered, a reset link has been sent.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def confirm_password_reset(request):
    token    = (request.data.get('token') or '').strip()
    uidb64   = (request.data.get('uid')   or '').strip()
    password = request.data.get('password', '')
    if not token or not password:
        return Response({'message': 'Token and new password are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if len(password) < 8:
        return Response({'message': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

    # Resolve the user from the uid carried alongside the token. Callers that
    # only pass `token` (legacy emails issued before the upgrade) will end up
    # here with no uid and get rejected — that's intentional, those tokens were
    # in-memory and lost on restart anyway.
    user = None
    if uidb64:
        try:
            user_id = int(force_str(urlsafe_base64_decode(uidb64)))
            user = User.objects.filter(pk=user_id).first()
        except (TypeError, ValueError, OverflowError):
            user = None

    if not user or not _reset_token_gen.check_token(user, token):
        return Response({'message': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(password)
    user.save()

    # Clear the forced-change flag so the user isn't looped back to password
    # change immediately after a successful email reset.
    try:
        from .models import UserSecurityProfile
        from django.utils import timezone as _tz
        sec, _ = UserSecurityProfile.objects.get_or_create(user=user)
        sec.must_change_password = False
        sec.password_last_changed = _tz.now()
        sec.save(update_fields=['must_change_password', 'password_last_changed'])
    except Exception as exc:
        logger.warning("Could not update security profile after password reset for user %s: %s", user.id, exc)

    return Response({'message': 'Password reset successfully. You can now sign in.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def google_login_view(request):
    """
    Verify a Google ID token, auto-link to a BGE profile by email/name,
    and return an app session token.
    """
    if not GOOGLE_AUTH_AVAILABLE:
        return Response({'error': 'Google login is not configured on this server.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if not GOOGLE_CLIENT_ID:
        return Response({'error': 'Google login is not configured on this server.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    google_token = request.data.get('token', '')
    if not google_token:
        return Response({'error': 'Google token is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        id_info = id_token.verify_oauth2_token(
            google_token, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        return Response({'error': f'Invalid Google token: {str(e)}'}, status=status.HTTP_401_UNAUTHORIZED)

    email       = id_info.get('email', '')
    given_name  = id_info.get('given_name', '')
    family_name = id_info.get('family_name', '')
    google_name = f"{given_name} {family_name}".strip()
    google_id   = id_info.get('sub', '')

    if not email:
        return Response({'error': 'Google account has no email address.'}, status=status.HTTP_400_BAD_REQUEST)

    # Resolve the local user. Django's User.email is NOT unique by default,
    # so a get_or_create on email could raise MultipleObjectsReturned. Pick
    # the most-recently-active match to keep behaviour predictable.
    candidates = User.objects.filter(email__iexact=email).order_by('-last_login', '-date_joined')
    user = candidates.first()
    created = False
    if user is None:
        # Mint a fresh username; fall back through suffixes if it collides.
        base = (email.split('@')[0] + '_g' + (google_id[-5:] or 'x')).lower()
        username = base
        n = 1
        while User.objects.filter(username=username).exists():
            n += 1
            username = f"{base}{n}"
        user = User.objects.create(
            email=email,
            username=username,
            first_name=given_name,
            last_name=family_name,
            is_active=True,
        )
        user.set_unusable_password()
        user.save()
        created = True

    if not user.is_active:
        return Response({'error': 'This account has been disabled. Contact your administrator.'}, status=status.HTTP_403_FORBIDDEN)

    # Try to auto-link to a BGE profile if not already linked and not admin
    if not (user.is_staff or user.is_superuser):
        _try_auto_link_bge(user, google_name, email)

    # Newly-created accounts that couldn't be linked to a BGE/cohort_admin
    # profile fall back to 'viewer'. Only auto-approve that viewer access if
    # the email domain is on the allowlist — otherwise the account is held
    # in a pending-approval state with no data access until an admin approves.
    if created and not (
        user.is_staff or user.is_superuser
        or hasattr(user, 'cohort_admin_profile')
        or hasattr(user, 'bge_profile')
    ):
        from .models import UserSecurityProfile
        domain = email.rsplit('@', 1)[-1].lower()
        allowed_domains = getattr(settings, 'GOOGLE_LOGIN_ALLOWED_DOMAINS', [])
        sec, _ = UserSecurityProfile.objects.get_or_create(user=user)
        sec.viewer_approved = domain in allowed_domains
        sec.save(update_fields=['viewer_approved'])

    login(request, user)
    data = _build_user_response(user)

    # If still no BGE profile and not admin, signal that linking is needed
    if data['user']['role'] == 'viewer':
        data['needs_linking'] = True
        data['google_name'] = google_name
        return Response(data, status=status.HTTP_200_OK)

    return Response(data)
