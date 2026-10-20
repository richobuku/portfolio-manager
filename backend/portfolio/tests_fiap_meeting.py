import datetime
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from portfolio.models import MSME, BusinessGrowthExpert, FinancialImprovementActionPlan, FinancialImprovementPlanMeeting
from portfolio.fiap_meeting_service import build_fiap_meeting_ics, get_fiap_reviewers, send_fiap_meeting_invite


class FIAPMeetingTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.bge_user = User.objects.create_user(
            username='bge_specialist', password='testpassword',
            first_name='Specialist', last_name='One', email='specialist@example.com'
        )
        self.rosemary_user = User.objects.create_user(
            username='rosemary.laker', password='testpassword',
            first_name='Rosemary', last_name='Laker', email='rosemary.laker@gopa.eu',
            is_staff=True
        )

        self.bge = BusinessGrowthExpert.objects.create(
            user=self.bge_user, name='Specialist One', email='specialist@example.com',
            phone='+256700000001', bge_code='BGE-001'
        )

        self.msme = MSME.objects.create(
            business_name='Northern Sun Agro Processors',
            msme_code='PRUDEV-MSME-999',
            sector='Agriculture',
            district='Lira',
            phone='+256700111222',
            owner_name='Awor Grace',
            assigned_bge=self.bge
        )

        self.plan = FinancialImprovementActionPlan.objects.create(
            msme=self.msme,
            bge=self.bge,
            assessment_date=datetime.date(2026, 10, 20),
            category='1_financial_records',
            category_name='1. Financial Records & Documentation Strengthening',
            category_addresses='Helps enterprises establish basic double-entry bookkeeping',
            gaps_identified=['GAP-01', 'GAP-02'],
            support_priority='High',
            financing_target='Working Capital',
            estimated_amount='25,000,000',
            preferred_fsp='Centenary Bank',
            status='draft'
        )

    def test_fiap_reviewers(self):
        both = get_fiap_reviewers('both')
        self.assertEqual(len(both), 2)
        names = [r['name'] for r in both]
        self.assertIn('Rosemary Laker', names)
        self.assertIn('Harriet Daisy Amule', names)

        rose = get_fiap_reviewers('rosemary')
        self.assertEqual(len(rose), 1)
        self.assertEqual(rose[0]['name'], 'Rosemary Laker')

    def test_build_ics_output(self):
        meeting = FinancialImprovementPlanMeeting.objects.create(
            plan=self.plan,
            msme=self.msme,
            bge=self.bge,
            requested_by=self.bge_user,
            requester_name='Specialist One',
            requester_email='specialist@example.com',
            reviewer_target='both',
            topic='Financial Action Plan Review & Credit Readiness Approval',
            scheduled_date=datetime.date(2026, 11, 5),
            start_time=datetime.time(10, 0),
            end_time=datetime.time(10, 45),
            meeting_format='google_meet',
            meeting_link='https://meet.google.com/abc-defg-hij',
            agenda_notes='Review financial records GAP-01 & GAP-02 for Centenary Bank facility.'
        )

        ics_str = build_fiap_meeting_ics(meeting)
        self.assertIn('BEGIN:VCALENDAR', ics_str)
        self.assertIn('METHOD:REQUEST', ics_str)
        self.assertIn('Rosemary Laker', ics_str)
        self.assertIn('Harriet Daisy Amule', ics_str)
        self.assertIn('Northern Sun Agro Processors', ics_str)
        self.assertIn('Centenary Bank', ics_str)

    def test_book_meeting_api_action(self):
        self.client.force_authenticate(user=self.bge_user)
        url = f'/api/financial-improvement-plans/{self.plan.id}/book-meeting/'
        payload = {
            'reviewer_target': 'rosemary',
            'topic': 'Financial Action Plan Approval',
            'scheduled_date': '2026-11-10',
            'start_time': '14:00:00',
            'duration_minutes': 45,
            'meeting_format': 'google_meet',
            'agenda_notes': 'Please review credit readiness before loan application to Centenary Bank.'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('invite_status_message', res.data)

        # Plan transitioned from draft to submitted
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.status, 'submitted')
        self.assertIsNotNone(self.plan.submitted_at)

        # Meeting created
        self.assertTrue(FinancialImprovementPlanMeeting.objects.filter(plan=self.plan).exists())

    def test_approve_plan_api(self):
        self.client.force_authenticate(user=self.rosemary_user)
        url = f'/api/financial-improvement-plans/{self.plan.id}/approve/'
        res = self.client.post(url, {'approval_notes': 'Approved for Centenary Bank linkage.'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.plan.refresh_from_db()
        self.assertEqual(self.plan.status, 'approved')
        self.assertEqual(self.plan.approved_by, self.rosemary_user)
        self.assertEqual(self.plan.approved_by_name, 'Rosemary Laker')
        self.assertIsNotNone(self.plan.approved_at)
        self.assertEqual(self.plan.approval_notes, 'Approved for Centenary Bank linkage.')
