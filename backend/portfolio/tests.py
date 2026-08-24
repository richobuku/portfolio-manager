from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from .models import MSME, BusinessGrowthExpert, BGEGroup, WorkOrder
from .serializers import BusinessGrowthExpertSerializer
from .api_views import BusinessGrowthExpertViewSet


class WorkOrderTypeChoicesTests(TestCase):
    def test_outcome_assessment_tool_choice_exists(self):
        choice_values = dict(WorkOrder.TYPE_CHOICES)

        self.assertIn('outcome_assessment_tool', choice_values)
        self.assertEqual(
            choice_values['outcome_assessment_tool'],
            'Outcome Assessment Tool Delivery',
        )


class BGEAssignmentVisibilityTests(TestCase):
    def setUp(self):
        self.bge = BusinessGrowthExpert.objects.create(name='Test BGE')
        self.other_bge = BusinessGrowthExpert.objects.create(name='Other BGE')
        self.group = BGEGroup.objects.create(name='Test Group')
        self.group.members.add(self.bge)

        self.group_assigned_msme = MSME.objects.create(
            business_name='Group MSME',
            business_type='MICRO',
            sector='TRADE',
            owner_name='Group Owner',
            assigned_group=self.group,
        )

        self.co_assigned_msme = MSME.objects.create(
            business_name='Co-assigned MSME',
            business_type='MICRO',
            sector='TRADE',
            owner_name='Co Owner',
            assigned_bge=self.other_bge,
        )
        self.co_assigned_msme.co_assigned_bges.add(self.bge)

    def test_bge_all_msme_ids_includes_group_and_co_assigned(self):
        msme_ids = BusinessGrowthExpertViewSet._bge_all_msme_ids(self.bge)
        self.assertIn(self.group_assigned_msme.id, msme_ids)
        self.assertIn(self.co_assigned_msme.id, msme_ids)

    def test_bge_serializer_includes_group_and_co_assigned_msmes(self):
        serializer = BusinessGrowthExpertSerializer(self.bge, context={'request': None})
        data = serializer.data
        self.assertEqual(data['assigned_msme_count'], 2)
        returned_ids = {m['id'] for m in data['assigned_msmes_list']}
        self.assertSetEqual(returned_ids, {self.group_assigned_msme.id, self.co_assigned_msme.id})


class MSMEPrimaryAndCoAssignedBGETests(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User
        self.admin = User.objects.create_superuser('admin', 'admin@test.com', 'password')
        self.primary_bge = BusinessGrowthExpert.objects.create(name='Primary BGE Expert')
        self.co_bge1 = BusinessGrowthExpert.objects.create(name='Co-assigned BGE 1')
        self.co_bge2 = BusinessGrowthExpert.objects.create(name='Co-assigned BGE 2')
        self.msme = MSME.objects.create(
            business_name='Gulu Green Farms',
            business_type='SMALL',
            sector='AGRICULTURE',
            owner_name='Okello David',
            city='Gulu',
            state='Gulu',
            latitude=2.774950,
            longitude=32.299110,
            assigned_bge=self.primary_bge,
        )

    def test_add_and_remove_co_assigned_bge_preserves_primary_bge(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .views.msme import MSMEViewSet

        factory = APIRequestFactory()
        view = MSMEViewSet.as_view({'patch': 'add_co_assigned'})

        # 1. Add Co-assigned BGE 1
        req1 = factory.patch(f'/api/msmes/{self.msme.id}/add_co_assigned/', {'bge_id': self.co_bge1.id}, format='json')
        force_authenticate(req1, user=self.admin)
        res1 = view(req1, pk=self.msme.id)
        self.assertEqual(res1.status_code, 200)

        # 2. Add Co-assigned BGE 2
        req2 = factory.patch(f'/api/msmes/{self.msme.id}/add_co_assigned/', {'bge_id': self.co_bge2.id}, format='json')
        force_authenticate(req2, user=self.admin)
        res2 = view(req2, pk=self.msme.id)
        self.assertEqual(res2.status_code, 200)

        # Refresh MSME from database and verify Primary BGE is persistent
        self.msme.refresh_from_db()
        self.assertEqual(self.msme.assigned_bge, self.primary_bge)
        self.assertEqual(self.msme.co_assigned_bges.count(), 2)
        self.assertIn(self.co_bge1, self.msme.co_assigned_bges.all())
        self.assertIn(self.co_bge2, self.msme.co_assigned_bges.all())

        # 3. Remove Co-assigned BGE 1
        remove_view = MSMEViewSet.as_view({'patch': 'remove_co_assigned'})
        req_remove = factory.patch(f'/api/msmes/{self.msme.id}/remove_co_assigned/', {'bge_id': self.co_bge1.id}, format='json')
        force_authenticate(req_remove, user=self.admin)
        res_remove = remove_view(req_remove, pk=self.msme.id)
        self.assertEqual(res_remove.status_code, 200)

        # Verify Co-assigned BGE 1 was removed, Co-assigned BGE 2 remains, and Primary BGE is 100% persistent
        self.msme.refresh_from_db()
        self.assertEqual(self.msme.assigned_bge, self.primary_bge)
        self.assertEqual(self.msme.co_assigned_bges.count(), 1)
        self.assertNotIn(self.co_bge1, self.msme.co_assigned_bges.all())
        self.assertIn(self.co_bge2, self.msme.co_assigned_bges.all())

    def test_cannot_co_assign_primary_bge(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .views.msme import MSMEViewSet

        factory = APIRequestFactory()
        view = MSMEViewSet.as_view({'patch': 'add_co_assigned'})
        req = factory.patch(f'/api/msmes/{self.msme.id}/add_co_assigned/', {'bge_id': self.primary_bge.id}, format='json')
        force_authenticate(req, user=self.admin)
        res = view(req, pk=self.msme.id)
        self.assertEqual(res.status_code, 400)


class MSMEGPSReportSyncTests(TestCase):
    def setUp(self):
        self.bge_user = User.objects.create_user(username='bge_tester', password='pw')
        self.bge = BusinessGrowthExpert.objects.create(
            user=self.bge_user,
            name='Simon Tester',
            bge_code='STEST-001',
            status='approved'
        )
        self.msme = MSME.objects.create(
            business_name='Northern Agro Ltd',
            msme_code='MSME-GPS-01',
            assigned_bge=self.bge,
            latitude=None,
            longitude=None,
        )

    def test_visit_report_syncs_gps_to_msme(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .views.visit_reports import MSMEReportViewSet
        from .models import MSMEReport

        factory = APIRequestFactory()
        view = MSMEReportViewSet.as_view({'post': 'create'})
        data = {
            'msme': self.msme.id,
            'visit_type': 'followup',
            'visit_date': '2026-08-20',
            'visit_latitude': 2.774950,
            'visit_longitude': 32.299110,
            'visit_gps_accuracy': 5.2,
        }
        req = factory.post('/api/reports/', data, format='json')
        force_authenticate(req, user=self.bge_user)
        res = view(req)
        self.assertEqual(res.status_code, 201)

        # Confirm parent MSME now has synced coordinates
        self.msme.refresh_from_db()
        self.assertAlmostEqual(float(self.msme.latitude), 2.774950, places=5)
        self.assertAlmostEqual(float(self.msme.longitude), 32.299110, places=5)

    def test_msme_serializer_fallback_to_report_gps(self):
        from .models import MSMEReport
        from .serializers.msme import MSMESerializer

        # Direct MSME has null GPS
        self.msme.latitude = None
        self.msme.longitude = None
        self.msme.save()

        # Create visit report with GPS
        MSMEReport.objects.create(
            msme=self.msme,
            bge=self.bge,
            visit_type='initial',
            visit_date='2026-08-15',
            visit_latitude=3.030300,
            visit_longitude=30.910700,
        )

        serializer = MSMESerializer(self.msme)
        data = serializer.data
        self.assertEqual(float(data['latitude']), 3.030300)
        self.assertEqual(float(data['longitude']), 30.910700)


class PaymentTrackingTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin_tester', 'admin@test.com', 'pass1234')
        self.bge_user = User.objects.create_user('bge_user', 'bge@test.com', 'pass1234')
        self.bge = BusinessGrowthExpert.objects.create(
            name="Denis Okello",
            bge_code="PRUDEV II-BGE-010T-88",
            user=self.bge_user,
            email="bge@test.com",
            status="approved",
        )
        self.msme = MSME.objects.create(
            business_name="Northern Seedlings Ltd",
            msme_code="PRUDEV2-GOPA-COHORT-888",
            business_type="SMALL",
            sector="AGRICULTURE",
            owner_name="Denis Okello",
            assigned_bge=self.bge,
        )
        self.work_order = WorkOrder.objects.create(
            work_order_number="PRUDEV2-WO-TEST-01",
            bge=self.bge,
            issue_date="2026-08-01",
            rate_per_day=60000,
            max_days=4,
            status="signed",
        )
        from .models import MSMEReport
        self.report = MSMEReport.objects.create(
            msme=self.msme,
            bge=self.bge,
            visit_type="coaching",
            visit_date="2026-08-10",
            status="submitted",
        )
        self.client = APIClient()

    def test_admin_submit_work_order_for_payment(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/work-orders/{self.work_order.id}/submit-for-payment/', {
            'payment_reference': 'BATCH-2026-001',
            'payment_notes': 'Submitted to finance for August cycle',
        })
        self.assertEqual(res.status_code, 200)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.payment_status, 'submitted_for_payment')
        self.assertEqual(self.work_order.payment_reference, 'BATCH-2026-001')
        self.assertIsNotNone(self.work_order.payment_submitted_at)

    def test_bge_confirm_work_order_payment(self):
        self.work_order.payment_status = 'submitted_for_payment'
        self.work_order.save()

        self.client.force_authenticate(user=self.bge_user)
        res = self.client.post(f'/api/work-orders/{self.work_order.id}/confirm-payment/', {
            'reference': 'MM-TXN-998822',
            'notes': 'Received in full on Airtel Money',
        })
        self.assertEqual(res.status_code, 200)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.payment_status, 'payment_confirmed')
        self.assertTrue(self.work_order.payment_confirmed_by_bge)
        self.assertIsNotNone(self.work_order.payment_confirmed_at)

    def test_admin_submit_and_bge_confirm_visit_report_payment(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/reports/submit-for-payment/', {
            'report_ids': [self.report.id],
            'payment_reference': 'BATCH-REP-01',
        })
        self.assertEqual(res.status_code, 200)
        self.report.refresh_from_db()
        self.assertEqual(self.report.payment_status, 'submitted')
        self.assertEqual(self.report.payment_reference, 'BATCH-REP-01')

        # BGE confirms
        self.client.force_authenticate(user=self.bge_user)
        c_res = self.client.post(f'/api/reports/{self.report.id}/confirm-payment/', {
            'reference': 'MM-5544',
            'notes': 'Confirmed payment received',
        })
        self.assertEqual(c_res.status_code, 200)
        self.report.refresh_from_db()
        self.assertEqual(self.report.payment_status, 'confirmed')
        self.assertTrue(self.report.payment_confirmed_by_bge)


class MSMEStatusAndAssignmentFlaggingTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('status_admin', 'admin@test.com', 'password123')
        self.bge = BusinessGrowthExpert.objects.create(name='Expert One', bge_code='BGE-01', status='active')
        self.co_bge = BusinessGrowthExpert.objects.create(name='Expert Two', bge_code='BGE-02', status='active')
        self.group = BGEGroup.objects.create(name='Gulu Advisory Team')
        self.group.members.add(self.bge)

        self.active_msme = MSME.objects.create(
            business_name='Active Agro Co',
            business_type='SMALL',
            sector='AGRICULTURE',
            owner_name='John Doe',
            status='active',
        )
        self.closed_msme = MSME.objects.create(
            business_name='Temporarily Closed Millers',
            business_type='SMALL',
            sector='MANUFACTURING',
            owner_name='Jane Smith',
            status='temporarily_closed',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_msme_status_is_active_sync(self):
        msme = MSME.objects.create(
            business_name='Test Status Sync',
            business_type='MICRO',
            sector='TRADE',
            owner_name='Tester',
            status='temporarily_closed'
        )
        self.assertFalse(msme.is_active)
        msme.status = 'active'
        msme.save()
        self.assertTrue(msme.is_active)
        msme.status = 'out_of_business'
        msme.save()
        self.assertFalse(msme.is_active)
        msme.status = 'unavailable'
        msme.save()
        self.assertFalse(msme.is_active)

    def test_set_status_endpoints(self):
        # MSME set-status
        res = self.client.patch(f'/api/msmes/{self.active_msme.id}/set-status/', {'status': 'temporarily_closed'})
        self.assertEqual(res.status_code, 200)
        self.active_msme.refresh_from_db()
        self.assertEqual(self.active_msme.status, 'temporarily_closed')
        self.assertFalse(self.active_msme.is_active)

        # Invalid status rejected
        bad_res = self.client.patch(f'/api/msmes/{self.active_msme.id}/set-status/', {'status': 'invalid_choice'})
        self.assertEqual(bad_res.status_code, 400)

        # BGE set-status
        bge_res = self.client.patch(f'/api/experts/{self.bge.id}/set-status/', {'status': 'unavailable'})
        self.assertEqual(bge_res.status_code, 200)
        self.bge.refresh_from_db()
        self.assertEqual(self.bge.status, 'unavailable')

    def test_inactive_msme_assign_bge_flagging(self):
        # 1. Assigning inactive MSME without confirm_inactive should be flagged with 400
        res = self.client.patch(f'/api/msmes/{self.closed_msme.id}/assign_bge/', {
            'bge_id': self.bge.id,
            'objectives': 'Test Objectives',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(res.data.get('requires_confirmation'))

        # 2. Assigning inactive MSME with confirm_inactive=True should succeed
        res_confirmed = self.client.patch(f'/api/msmes/{self.closed_msme.id}/assign_bge/', {
            'bge_id': self.bge.id,
            'objectives': 'Test Objectives',
            'confirm_inactive': True,
        }, format='json')
        self.assertEqual(res_confirmed.status_code, 200)
        self.closed_msme.refresh_from_db()
        self.assertEqual(self.closed_msme.assigned_bge, self.bge)

    def test_inactive_msme_add_co_assigned_flagging(self):
        # 1. Adding co-assignee to inactive MSME without confirm_inactive should be flagged
        res = self.client.patch(f'/api/msmes/{self.closed_msme.id}/add_co_assigned/', {
            'bge_id': self.co_bge.id,
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(res.data.get('requires_confirmation'))

        # 2. Adding co-assignee with confirm_inactive=True should succeed
        res_confirmed = self.client.patch(f'/api/msmes/{self.closed_msme.id}/add_co_assigned/', {
            'bge_id': self.co_bge.id,
            'confirm_inactive': True,
        }, format='json')
        self.assertEqual(res_confirmed.status_code, 200)
        self.closed_msme.refresh_from_db()
        self.assertIn(self.co_bge, self.closed_msme.co_assigned_bges.all())

    def test_bge_group_assign_inactive_msmes_flagging(self):
        # 1. Bulk assign to group containing an inactive MSME without confirmation
        res = self.client.post(f'/api/bge-groups/{self.group.id}/assign-msmes/', {
            'msme_ids': [self.active_msme.id, self.closed_msme.id],
            'session_number': 1,
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(res.data.get('requires_confirmation'))

        # 2. Bulk assign with confirm_inactive=True
        res_confirmed = self.client.post(f'/api/bge-groups/{self.group.id}/assign-msmes/', {
            'msme_ids': [self.active_msme.id, self.closed_msme.id],
            'session_number': 1,
            'confirm_inactive': True,
        }, format='json')
        self.assertEqual(res_confirmed.status_code, 200)
        self.closed_msme.refresh_from_db()
        self.active_msme.refresh_from_db()
        self.assertEqual(self.closed_msme.assigned_group, self.group)
        self.assertEqual(self.active_msme.assigned_group, self.group)




