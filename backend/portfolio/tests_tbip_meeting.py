import datetime
from django.test import TestCase
from django.contrib.auth.models import User
from django.core import mail
from rest_framework.test import APIClient
from portfolio.models import (
    MSME, BusinessGrowthExpert, EnterpriseImprovementPlan, EnterpriseImprovementPlanMeeting, Cohort
)


class TBIPMeetingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser('admin_user', 'admin@example.com', 'adminpass123')
        self.bge_user = User.objects.create_user('bge_user', 'bge@example.com', 'bgepass123', first_name='John', last_name='Okello')

        self.cohort = Cohort.objects.create(name='Cohort 1')
        self.bge = BusinessGrowthExpert.objects.create(
            name='John Okello',
            user=self.bge_user,
            bge_code='BGE-GUL-01',
            phone='+256700000001',
            email='bge@example.com',
            location='Gulu',
        )
        self.msme = MSME.objects.create(
            business_name='Acholiland Agro Processors',
            msme_code='MSME-GUL-001',
            business_type='SMALL',
            sector='AGRICULTURE',
            owner_name='Okello David',
            phone='+256770000002',
            district='Gulu',
            cohort=self.cohort,
            assigned_bge=self.bge,
        )
        self.plan = EnterpriseImprovementPlan.objects.create(
            msme=self.msme,
            bge=self.bge,
            assessment_date=datetime.date.today(),
            status='draft',
        )

    def test_get_coaches_endpoint(self):
        self.client.force_authenticate(user=self.bge_user)
        res = self.client.get('/api/tbip-meetings/coaches/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('coaches', res.data)
        names = [c['name'] for c in res.data['coaches']]
        self.assertTrue(any('Richard' in n for n in names))
        self.assertTrue(any('Stephen' in n for n in names))

    def test_book_meeting_direct(self):
        self.client.force_authenticate(user=self.bge_user)
        payload = {
            'msme': self.msme.id,
            'plan': self.plan.id,
            'topic': 'Formulating Priority Actions Roadmap (3–5 Actions)',
            'scheduled_date': '2026-11-15',
            'start_time': '10:00:00',
            'duration_minutes': 45,
            'meeting_format': 'google_meet',
            'agenda_notes': 'Need guidance on prioritizing 3 high-impact actions for financial governance.',
            'requester_name': 'John Okello',
            'requester_email': 'john.okello@prudev.org',
            'requester_phone': '+256770123456',
        }
        res = self.client.post('/api/tbip-meetings/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['status'], 'requested')
        self.assertEqual(res.data['msme_name'], 'Acholiland Agro Processors')
        self.assertTrue(res.data['google_calendar_url'].startswith('https://calendar.google.com/calendar/render'))

        # Verify email was dispatched
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertIn('Acholiland Agro Processors', email.subject)
        self.assertIn('Richard', email.subject)
        self.assertIn('Stephen', email.subject)
        self.assertEqual(email.to, ['john.okello@prudev.org'])
        self.assertTrue(any('richard' in c.lower() for c in email.cc))
        self.assertTrue(any('stephen' in c.lower() for c in email.cc))

        # Check calendar attachment (.ics)
        self.assertEqual(len(email.attachments), 1)
        filename, content, mimetype = email.attachments[0]
        self.assertTrue(filename.endswith('.ics'))
        self.assertIn('text/calendar', mimetype)
        self.assertIn('BEGIN:VCALENDAR', content)
        self.assertIn('METHOD:REQUEST', content)
        self.assertIn('Richard Obuku', content)
        self.assertIn('Stephen Maxi Opwonya', content)

    def test_book_meeting_via_plan_action(self):
        self.client.force_authenticate(user=self.bge_user)
        payload = {
            'topic': '7-Dimension Diagnostic Assessment & Gap Analysis Guidance',
            'scheduled_date': '2026-11-20',
            'start_time': '14:30:00',
            'duration_minutes': 60,
            'meeting_format': 'teams',
            'agenda_notes': 'Reviewing low score on Digital & Technology pillar.',
        }
        res = self.client.post(f'/api/enterprise-improvement-plans/{self.plan.id}/book-meeting/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['topic'], '7-Dimension Diagnostic Assessment & Gap Analysis Guidance')
        self.assertEqual(res.data['plan'], self.plan.id)

    def test_export_ics_endpoint(self):
        self.client.force_authenticate(user=self.bge_user)
        meeting = EnterpriseImprovementPlanMeeting.objects.create(
            msme=self.msme,
            plan=self.plan,
            bge=self.bge,
            requested_by=self.bge_user,
            requester_name='John Okello',
            requester_email='john@example.com',
            scheduled_date=datetime.date(2026, 11, 25),
            start_time=datetime.time(11, 0),
            end_time=datetime.time(11, 45),
            duration_minutes=45,
            topic='Pre-submission TBIP Review & Endorsement',
        )
        res = self.client.get(f'/api/tbip-meetings/{meeting.id}/export-ics/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'text/calendar; charset=utf-8')
        content = res.content.decode('utf-8')
        self.assertIn('BEGIN:VCALENDAR', content)
        self.assertIn('METHOD:REQUEST', content)
        self.assertIn('Acholiland Agro Processors', content)
