import datetime
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from portfolio.models import (
    MSME, BusinessGrowthExpert, PlannedVisit, Cohort
)


class PlannedVisitTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser('admin_user', 'admin@example.com', 'adminpass123')
        self.bge_user = User.objects.create_user('bge_user', 'bge@example.com', 'bgepass123')

        self.cohort = Cohort.objects.create(name='Cohort 1')
        self.bge = BusinessGrowthExpert.objects.create(
            name='Test BGE Specialist',
            user=self.bge_user,
            bge_code='BGE-GUL-01',
            phone='+256700000001',
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

    def test_create_and_list_planned_visit_admin(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'msme': self.msme.id,
            'bge': self.bge.id,
            'scheduled_date': '2026-09-10',
            'start_time': '10:00:00',
            'end_time': '12:00:00',
            'visit_type': 'one_on_one',
            'title': 'Q3 Financial Record-Keeping Review',
            'objectives': 'Review bookkeeping and audit cash transactions',
            'meeting_venue': 'msme_premises',
        }
        res = self.client.post('/api/planned-visits/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['status'], 'planned')
        self.assertEqual(res.data['msme_name'], 'Acholiland Agro Processors')
        self.assertEqual(res.data['bge_name'], 'Test BGE Specialist')

        # List
        list_res = self.client.get('/api/planned-visits/')
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.data), 1)

    def test_mark_missed_requires_reason(self):
        visit = PlannedVisit.objects.create(
            msme=self.msme,
            bge=self.bge,
            scheduled_date=datetime.date(2026, 9, 10),
            visit_type='one_on_one',
            status='planned',
        )
        self.client.force_authenticate(user=self.bge_user)

        # Missing reason fails
        res_fail = self.client.post(f'/api/planned-visits/{visit.id}/mark-missed/', {}, format='json')
        self.assertEqual(res_fail.status_code, 400)

        # Valid reason succeeds
        res_ok = self.client.post(f'/api/planned-visits/{visit.id}/mark-missed/', {
            'missed_reason': 'msme_unavailable',
            'missed_reason_notes': 'Owner was called away for urgent community funeral in Omoro.',
        }, format='json')
        self.assertEqual(res_ok.status_code, 200)
        self.assertEqual(res_ok.data['status'], 'missed')
        self.assertEqual(res_ok.data['missed_reason'], 'msme_unavailable')
        self.assertIn('funeral', res_ok.data['missed_reason_notes'].lower())

    def test_mark_completed(self):
        visit = PlannedVisit.objects.create(
            msme=self.msme,
            bge=self.bge,
            scheduled_date=datetime.date(2026, 9, 10),
            visit_type='one_on_one',
            status='planned',
        )
        self.client.force_authenticate(user=self.bge_user)
        res = self.client.post(f'/api/planned-visits/{visit.id}/mark-completed/', {
            'completion_notes': 'Session successfully held. Books of accounts updated.',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'completed')
        self.assertEqual(res.data['completion_notes'], 'Session successfully held. Books of accounts updated.')

    def test_reschedule_visit(self):
        visit = PlannedVisit.objects.create(
            msme=self.msme,
            bge=self.bge,
            scheduled_date=datetime.date(2026, 9, 10),
            visit_type='coaching',
            status='planned',
        )
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.post(f'/api/planned-visits/{visit.id}/reschedule/', {
            'new_date': '2026-09-17',
            'new_start_time': '14:00:00',
            'reason': 'Heavy flooding on Gulu-Arua road.',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['scheduled_date'], '2026-09-17')
        self.assertEqual(res.data['status'], 'planned')

        # Previous visit is now 'rescheduled'
        visit.refresh_from_db()
        self.assertEqual(visit.status, 'rescheduled')
        self.assertEqual(visit.rescheduled_to.id, res.data['id'])

    def test_export_ics_calendar(self):
        PlannedVisit.objects.create(
            msme=self.msme,
            bge=self.bge,
            scheduled_date=datetime.date(2026, 9, 10),
            start_time=datetime.time(10, 0),
            end_time=datetime.time(11, 30),
            visit_type='one_on_one',
            title='On-site Coaching',
            status='planned',
        )
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get('/api/planned-visits/export-ics/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('text/calendar', res['Content-Type'])
        content = res.content.decode('utf-8')
        self.assertIn('BEGIN:VCALENDAR', content)
        self.assertIn('BEGIN:VEVENT', content)
        self.assertIn('Acholiland Agro Processors', content)
        self.assertIn('END:VCALENDAR', content)

    def test_summary_kpi(self):
        PlannedVisit.objects.create(
            msme=self.msme, bge=self.bge,
            scheduled_date=datetime.date.today(),
            visit_type='one_on_one', status='planned',
        )
        PlannedVisit.objects.create(
            msme=self.msme, bge=self.bge,
            scheduled_date=datetime.date.today(),
            visit_type='coaching', status='completed',
        )
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get('/api/planned-visits/summary/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['total'], 2)
        self.assertEqual(res.data['planned'], 1)
        self.assertEqual(res.data['completed'], 1)
