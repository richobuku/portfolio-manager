import logging
from django.shortcuts import redirect
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status

from ..models import GoogleCalendarCredential
from ..google_calendar_service import (
    get_authorization_url,
    exchange_code_for_credentials,
    sync_all_visits_for_user,
    is_google_calendar_configured,
)

logger = logging.getLogger(__name__)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def google_calendar_connect_view(request):
    """
    Generates the Google OAuth 2.0 authorization URL for calendar access.
    """
    if not is_google_calendar_configured():
        return Response(
            {
                'error': 'Google Calendar OAuth is not configured on this server. '
                         'Please configure GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET.'
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    try:
        auth_url, state = get_authorization_url(request.user, request=request)
        return Response({'authorization_url': auth_url, 'state': state})
    except Exception as e:
        logger.error(f"Error generating Google Calendar auth URL for {request.user}: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def google_calendar_callback_view(request):
    """
    Handles the redirect from Google OAuth with the authorization code.
    Exchanges code for tokens, triggers initial sync, and redirects back to frontend.
    """
    code = request.GET.get('code')
    state = request.GET.get('state')
    error = request.GET.get('error')

    # Base frontend URL (production or local)
    frontend_origin = (
        getattr(settings, 'FRONTEND_URL', '')
        or getattr(settings, 'FRONTEND_ORIGIN', '')
        or request.build_absolute_uri('/').rstrip('/')
    ).rstrip('/')

    if error:
        logger.warning(f"Google OAuth denied or errored: {error}")
        return redirect(f"{frontend_origin}/?google_sync=error&error={error}")

    if not code or not state:
        return redirect(f"{frontend_origin}/?google_sync=error&error=missing_parameters")

    try:
        cred = exchange_code_for_credentials(code, state, request=request)
        # Trigger background sync of upcoming visits
        sync_count = sync_all_visits_for_user(cred.user)
        logger.info(f"Successfully connected Google Calendar for {cred.user.username} ({cred.google_email}). Synced {sync_count} visits.")
        return redirect(f"{frontend_origin}/?google_sync=success&email={cred.google_email}&section=calendar")
    except Exception as e:
        logger.error(f"Error exchanging Google OAuth code: {e}")
        return redirect(f"{frontend_origin}/?google_sync=error&error=exchange_failed&section=calendar")


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def google_calendar_status_view(request):
    """
    Returns the current Google Calendar connection status for the authenticated user.
    """
    cred = GoogleCalendarCredential.objects.filter(user=request.user).first()
    is_configured = is_google_calendar_configured()

    if not cred or not cred.sync_enabled:
        return Response({
            'connected': False,
            'is_configured': is_configured,
            'google_email': '',
            'last_sync_at': None,
        })

    return Response({
        'connected': True,
        'is_configured': is_configured,
        'google_email': cred.google_email,
        'sync_enabled': cred.sync_enabled,
        'last_sync_at': cred.last_sync_at.isoformat() if cred.last_sync_at else None,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def google_calendar_disconnect_view(request):
    """
    Disconnects Google Calendar for the authenticated user and removes stored credentials.
    """
    deleted_count, _ = GoogleCalendarCredential.objects.filter(user=request.user).delete()
    return Response({
        'success': True,
        'message': 'Google Calendar disconnected successfully.',
        'deleted': deleted_count > 0,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def google_calendar_sync_now_view(request):
    """
    Forces an immediate sync of all active visits for the authenticated user to Google Calendar.
    """
    cred = GoogleCalendarCredential.objects.filter(user=request.user, sync_enabled=True).first()
    if not cred:
        return Response(
            {'error': 'Google Calendar is not connected for this account.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        synced_count = sync_all_visits_for_user(request.user)
        cred.last_sync_at = cred.last_sync_at # updated inside sync
        return Response({
            'success': True,
            'synced_count': synced_count,
            'message': f'Successfully synchronized {synced_count} visits to Google Calendar.',
        })
    except Exception as e:
        logger.error(f"Error in manual Google sync for {request.user}: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
