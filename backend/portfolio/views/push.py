from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated as _IsAuth, AllowAny as _AllowAny
from rest_framework.response import Response
from django.conf import settings

from ..models import PushSubscription


@api_view(['POST'])
@permission_classes([_IsAuth])
def push_subscribe(request):
    """Save or update a push subscription for the current user.
    Accepts flat format: {endpoint, p256dh, auth} (as sent by the frontend).
    Also accepts nested format: {endpoint, keys: {p256dh, auth}} (Web Push API standard).
    """
    data = request.data
    endpoint = data.get('endpoint', '').strip()
    # Accept both flat and nested key formats
    if 'keys' in data and isinstance(data['keys'], dict):
        p256dh = data['keys'].get('p256dh', '')
        auth   = data['keys'].get('auth', '')
    else:
        p256dh = data.get('p256dh', '')
        auth   = data.get('auth', '')

    if not endpoint:
        return Response({'error': 'endpoint required'}, status=status.HTTP_400_BAD_REQUEST)
    if not p256dh or not auth:
        return Response({'error': 'p256dh and auth keys are required'}, status=status.HTTP_400_BAD_REQUEST)

    PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={'user': request.user, 'p256dh': p256dh, 'auth': auth},
    )
    return Response({'message': 'Subscribed'})


@api_view(['POST'])
@permission_classes([_IsAuth])
def push_unsubscribe(request):
    """Remove a push subscription."""
    endpoint = request.data.get('endpoint', '').strip()
    PushSubscription.objects.filter(endpoint=endpoint, user=request.user).delete()
    return Response({'message': 'Unsubscribed'})


@api_view(['GET'])
@permission_classes([_AllowAny])
def push_vapid_key(request):
    """Return the VAPID public key so the frontend can subscribe. Public endpoint."""
    return Response({'publicKey': settings.VAPID_PUBLIC_KEY})
