"""
HMAC-signed simple token authentication.

Token format:  token_{user_id}_{username}_{sig}
where sig = first 16 hex chars of HMAC-SHA256(SECRET_KEY, "{user_id}|{username}")

This replaces the previous unsigned format which was trivially forgeable
(anyone who guessed user_id=1 + username='admin' could mint admin access).
Without SECRET_KEY an attacker cannot produce a valid `sig`, so forgery is
no longer feasible.

Note: there is no token store, so individual tokens cannot be revoked
short of cycling SECRET_KEY (which invalidates ALL tokens system-wide).
For finer-grained revocation, switch to DRF's TokenAuthentication.
"""
import hashlib
import hmac

from django.conf import settings
from django.contrib.auth.models import User
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


def _sig(user_id, username):
    """Return a hex HMAC of the (id|username) tuple keyed by SECRET_KEY."""
    msg = f"{user_id}|{username}".encode("utf-8")
    key = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:16]


def sign_token(user_id, username):
    """Mint a signed token for a (user_id, username) pair."""
    return f"token_{user_id}_{username}_{_sig(user_id, username)}"


class SimpleTokenAuthentication(BaseAuthentication):
    """Validates the HMAC-signed token format: token_{id}_{username}_{sig}."""

    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer token_"):
            return None

        token = auth_header[len("Bearer "):]
        parts = token.split("_", 3)  # ['token', '{id}', '{username}', '{sig}']

        # Reject any token that doesn't carry a signature segment — these are
        # the legacy 3-part tokens (token_{id}_{username}) which were forgeable.
        if len(parts) != 4:
            raise AuthenticationFailed("Invalid token format. Please log in again.")

        try:
            user_id = int(parts[1])
        except ValueError:
            raise AuthenticationFailed("Invalid token format.")

        username = parts[2]
        provided_sig = parts[3]
        expected_sig = _sig(user_id, username)
        if not hmac.compare_digest(provided_sig, expected_sig):
            raise AuthenticationFailed("Invalid token signature. Please log in again.")

        try:
            user = User.objects.get(pk=user_id, username=username)
        except User.DoesNotExist:
            raise AuthenticationFailed("Invalid token.")

        if not user.is_active:
            raise AuthenticationFailed("User inactive.")

        return (user, token)
