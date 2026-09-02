import datetime
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from .models import PlannedVisit, MSME, BusinessGrowthExpert, GoogleCalendarCredential
from .google_calendar_service import (
    generate_state_token,
    verify_state_token,
    format_event_body,
    sync_visit_to_google,
)


class GoogleCalendarSyncTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='bge_cal_test',
            email='bge_cal_test@example.com',
            password='testpassword123',
            first_name='John',
            last_name='Okello',
        )
        self.bge = BusinessGrowthExpert.objects.create(
            user=self.user,
            name='John Okello',
            email='bge_cal_test@example.com',
            phone='+256700000001',
            location='Gulu',
        )
        self.msme = MSME.objects.create(
            business_name='Acholi Grain Millers Ltd',
            msme_code='MSME-GUL-001',
            district='Gulu',
            sector='Agribusiness',
            owner_name='Grace Achan',
            phone='+256700000002',
            assigned_bge=self.bge,
        )
        self.client.force_authenticate(user=self.user)

    def test_state_token_security(self):
        """State token should encode user ID securely and reject tampering."""
        token = generate_state_token(self.user.id)
        self.assertIsNotNone(token)
        user_id = verify_state_token(token)
        self.assertEqual(user_id, self.user.id)

        # Tampered token fails
        self.assertIsNone(verify_state_token(token + 'tampered'))

    def test_google_status_disconnected(self):
        """Unconnected user should return connected: False."""
        res = self.client.get('/api/auth/google-calendar/status/')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['connected'])

    def test_google_status_connected(self):
        """Connected user returns email and active sync flag."""
        GoogleCalendarCredential.objects.create(
            user=self.user,
            google_email='john.okello@gmail.com',
            access_token='mock_access_token_123',
            refresh_token='mock_refresh_token_456',
            token_expiry=timezone.now() + datetime.timedelta(hours=1),
            sync_enabled=True,
        )
        res = self.client.get('/api/auth/google-calendar/status/')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['connected'])
        self.assertEqual(res.data['google_email'], 'john.okello@gmail.com')

    def test_disconnect_endpoint(self):
        """Disconnect endpoint clears stored credentials."""
        GoogleCalendarCredential.objects.create(
            user=self.user,
            google_email='john.okello@gmail.com',
            access_token='mock_token',
        )
        self.assertTrue(GoogleCalendarCredential.objects.filter(user=self.user).exists())

        res = self.client.post('/api/auth/google-calendar/disconnect/')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(GoogleCalendarCredential.objects.filter(user=self.user).exists())

    def test_format_event_body(self):
        """Format event body generates complete Google Calendar structure."""
        visit = PlannedVisit.objects.create(
            msme=self.msme,
            bge=self.bge,
            scheduled_date=datetime.date(2026, 9, 15),
            start_time=datetime.time(10, 0),
            end_time=datetime.time(12, 0),
            visit_type='coaching',
            title='Financial Recordkeeping Coaching',
            objectives='Review monthly cash flow ledger and prepare profit/loss statement.',
            meeting_venue='msme_premises',
            created_by=self.user,
        )
        body = format_event_body(visit)
        self.assertIn('Acholi Grain Millers Ltd', body['summary'])
        self.assertIn('Financial Recordkeeping Coaching', body['description'])
        self.assertIn('Grace Achan', body['description'])
        self.assertEqual(body['start']['dateTime'], '2026-09-15T10:00:00')
        self.assertEqual(body['end']['dateTime'], '2026-09-15T12:00:00')
        self.assertEqual(body['start']['timeZone'], 'Africa/Kampala')
        self.assertEqual(body['colorId'], '9') # Blue for planned

    def test_format_event_body_includes_msme_attendee(self):
        """When MSME has an email, they are included as a calendar attendee."""
        self.msme.email = 'grace.achan@acholigrain.com'
        self.msme.save(update_fields=['email'])
        visit = PlannedVisit.objects.create(
            msme=self.msme,
            bge=self.bge,
            scheduled_date=datetime.date(2026, 9, 15),
            start_time=datetime.time(10, 0),
            created_by=self.user,
        )
        body = format_event_body(visit)
        self.assertIn('attendees', body)
        self.assertEqual(body['attendees'][0]['email'], 'grace.achan@acholigrain.com')

    @patch('portfolio.google_calendar_service.get_calendar_service_for_user')
    def test_sync_visit_creates_google_event(self, mock_get_service):
        """When user is connected, sync_visit_to_google calls events.insert and stores event ID."""
        GoogleCalendarCredential.objects.create(
            user=self.user,
            google_email='john.okello@gmail.com',
            access_token='valid_token',
            sync_enabled=True,
        )

        mock_service = MagicMock()
        mock_events = MagicMock()
        mock_insert = MagicMock()
        mock_insert.execute.return_value = {'id': 'google_evt_abc_123'}
        mock_events.insert.return_value = mock_insert
        mock_service.events.return_value = mock_events
        mock_get_service.return_value = mock_service

        visit = PlannedVisit.objects.create(
            msme=self.msme,
            bge=self.bge,
            scheduled_date=datetime.date(2026, 9, 20),
            start_time=datetime.time(14, 0),
            visit_type='one_on_one',
            created_by=self.user,
        )

        synced = sync_visit_to_google(visit)
        self.assertTrue(synced)

        visit.refresh_from_db()
        self.assertEqual(visit.google_event_id, 'google_evt_abc_123')
        self.assertEqual(visit.google_sync_status, 'synced')
        self.assertIsNotNone(visit.google_last_synced_at)
        mock_events.insert.assert_called_once()
