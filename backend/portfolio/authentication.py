from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth.models import User


class SimpleTokenAuthentication(BaseAuthentication):
    """Validates the simple token format: token_{user_id}_{username}"""

    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Bearer token_'):
            return None

        token = auth_header[len('Bearer '):]
        parts = token.split('_', 2)  # ['token', '{id}', '{username}']
        if len(parts) != 3:
            raise AuthenticationFailed('Invalid token format.')

        try:
            user_id = int(parts[1])
            user = User.objects.get(pk=user_id, username=parts[2])
        except (ValueError, User.DoesNotExist):
            raise AuthenticationFailed('Invalid token.')

        if not user.is_active:
            raise AuthenticationFailed('User inactive.')

        return (user, token)
