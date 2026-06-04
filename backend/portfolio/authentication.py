"""
HMAC-signed simple token authentication.

Token format:  token_{user_id}_{username}_{issued_ts}_{sig}
  issued_ts = Unix timestamp (seconds) when the token was minted
  sig       = HMAC-SHA256(SECRET_KEY, "{user_id}|{username}|{issued_ts}")[:32]

Tokens expire after SESSION_LIFETIME_SECONDS (default 8 hours).
Tokens can also be individually revoked via the cache (populated on logout).

Legacy 4-part tokens (no issued_ts) are rejected — all users must re-login
after this version is deployed.
"""
import hashlib
import hmac
import time

from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

REVOCATION_PREFIX = 'revoked_token:'
REVOCATION_TTL    = 86400 * 30  # keep revoked tokens for 30 days


def _session_lifetime():
    """Return configured session lifetime in seconds (default 8 hours)."""
    return int(getattr(settings, 'SESSION_LIFETIME_SECONDS', 8 * 3600))


def revoke_token(token: str):
    """Mark a token as revoked. Call from logout_view."""
    cache.set(f'{REVOCATION_PREFIX}{token}', True, timeout=REVOCATION_TTL)


def _sig(user_id, username, issued_ts):
    """Return a 32-char hex HMAC covering id, username, and issue time."""
    msg = f"{user_id}|{username}|{issued_ts}".encode("utf-8")
    key = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:32]


def sign_token(user_id, username):
    """Mint a signed, timestamped token for a (user_id, username) pair."""
    issued_ts = int(time.time())
    sig = _sig(user_id, username, issued_ts)
    return f"token_{user_id}_{username}_{issued_ts}_{sig}"


class SimpleTokenAuthentication(BaseAuthentication):
    """Validates the HMAC-signed token: token_{id}_{username}_{issued_ts}_{sig}."""

    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer token_"):
            return None

        token = auth_header[len("Bearer "):]
        # Split into exactly 5 parts: token, id, username, issued_ts, sig
        # username may contain underscores, so we split from both ends
        parts = token.split("_", 2)   # ['token', '{id}', '{username}_{issued_ts}_{sig}']
        if len(parts) != 3:
            raise AuthenticationFailed("Invalid token format. Please log in again.")

        try:
            user_id = int(parts[1])
        except ValueError:
            raise AuthenticationFailed("Invalid token format.")

        # The remainder is '{username}_{issued_ts}_{sig}' — split from the right
        tail = parts[2]
        tail_parts = tail.rsplit("_", 2)  # username may have underscores; ts and sig never do
        if len(tail_parts) != 3:
            raise AuthenticationFailed("Invalid token format. Please log in again.")

        username, issued_ts_str, provided_sig = tail_parts

        try:
            issued_ts = int(issued_ts_str)
        except ValueError:
            raise AuthenticationFailed("Invalid token format.")

        # Verify HMAC signature
        expected_sig = _sig(user_id, username, issued_ts)
        if not hmac.compare_digest(provided_sig, expected_sig):
            raise AuthenticationFailed("Invalid token signature. Please log in again.")

        # Check token expiry
        age = int(time.time()) - issued_ts
        lifetime = _session_lifetime()
        if age > lifetime:
            raise AuthenticationFailed(
                f"Session expired after {lifetime // 3600} hour(s). Please log in again."
            )

        # Check server-side revocation list (populated on logout)
        if cache.get(f'{REVOCATION_PREFIX}{token}'):
            raise AuthenticationFailed("Token has been revoked. Please log in again.")

        try:
            user = User.objects.get(pk=user_id, username=username)
        except User.DoesNotExist:
            raise AuthenticationFailed("Invalid token.")

        if not user.is_active:
            raise AuthenticationFailed("User inactive.")

        return (user, token)
