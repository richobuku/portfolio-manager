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

    def test_bge_technical_co_assignment_choice_exists(self):
        choice_values = dict(WorkOrder.TYPE_CHOICES)

        self.assertIn('bge_technical_co_assignment', choice_values)
        self.assertEqual(
            choice_values['bge_technical_co_assignment'],
            'BGE Technical Co-Assignment Support (Specialist Technical Capacity)',
        )


class WorkOrderTechnicalCoAssignmentTests(TestCase):
    def setUp(self):
        self.specialist = BusinessGrowthExpert.objects.create(
            name='Specialist BGE',
            bge_code='PRUDEV-SPEC-01',
            top_skills='Financial Management & Bookkeeping',
        )
        self.primary_bge = BusinessGrowthExpert.objects.create(
            name='Primary BGE',
            bge_code='PRUDEV-PRIM-02',
            top_skills='Agribusiness Development',
        )
        self.msme = MSME.objects.create(
            business_name='Northern Grains Ltd',
            assigned_bge=self.primary_bge,
            district='Gulu',
        )

    def test_technical_co_assignment_work_order_creation_and_serialization(self):
        from .serializers import WorkOrderSerializer
        from datetime import date

        wo = WorkOrder.objects.create(
            bge=self.specialist,
            supported_bge=self.primary_bge,
            technical_area='Financial Management & Bookkeeping',
            work_order_type='bge_technical_co_assignment',
            issue_date=date.today(),
            msme_ids_snapshot=[self.msme.id],
        )

        serializer = WorkOrderSerializer(wo)
        data = serializer.data

        self.assertEqual(data['supported_bge'], self.primary_bge.id)
        self.assertEqual(data['supported_bge_name'], 'Primary BGE')
        self.assertEqual(data['supported_bge_code'], 'PRUDEV-PRIM-02')
        self.assertEqual(data['bge_top_skills'], 'Financial Management & Bookkeeping')
        self.assertEqual(data['technical_area'], 'Financial Management & Bookkeeping')
        self.assertEqual(len(data['target_msmes_detail']), 1)
        self.assertEqual(data['target_msmes_detail'][0]['business_name'], 'Northern Grains Ltd')

    def test_handle_technical_co_assignment_links_co_bge_and_msmes(self):
        from .views.work_orders import WorkOrderViewSet
        from datetime import date

        wo = WorkOrder.objects.create(
            bge=self.specialist,
            supported_bge=self.primary_bge,
            technical_area='Financial Management & Bookkeeping',
            work_order_type='bge_technical_co_assignment',
            issue_date=date.today(),
            msme_ids_snapshot=[self.msme.id],
        )

        viewset = WorkOrderViewSet()
        viewset._handle_technical_co_assignment(wo)

        self.assertIn(self.primary_bge, wo.co_bges.all())
        self.assertIn(self.specialist, self.msme.co_assigned_bges.all())

    def test_work_order_serialization_with_null_supported_bge(self):
        from .serializers import WorkOrderSerializer
        from datetime import date

        wo = WorkOrder.objects.create(
            bge=self.specialist,
            supported_bge=None,
            technical_area='',
            work_order_type='msme_support',
            issue_date=date.today(),
            msme_ids_snapshot=[],
        )

        serializer = WorkOrderSerializer(wo)
        data = serializer.data
        self.assertIsNone(data['supported_bge'])
        self.assertIsNone(data['supported_bge_name'])
        self.assertIsNone(data['supported_bge_code'])
        self.assertIsNone(data['supported_bge_top_skills'])
        self.assertEqual(data['bge_top_skills'], 'Financial Management & Bookkeeping')
        self.assertEqual(data['target_msmes_detail'], [])

    def test_msme_viewset_assigned_bge_filtering(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from django.contrib.auth.models import User
        from .views.msme import MSMEViewSet

        admin = User.objects.create_superuser('testadmin_bge_filter', 'admin@example.com', 'pass')
        factory = APIRequestFactory()

        # Query assigned_bge for primary_bge
        req = factory.get(f'/api/msmes/?assigned_bge={self.primary_bge.id}&all=1')
        force_authenticate(req, user=admin)
        view = MSMEViewSet.as_view({'get': 'list'})
        resp = view(req)
        self.assertEqual(resp.status_code, 200)
        msme_ids = [m['id'] for m in resp.data]
        self.assertIn(self.msme.id, msme_ids)

        # Query assigned_bge for specialist (who is not primary)
        req2 = factory.get(f'/api/msmes/?assigned_bge={self.specialist.id}&primary_only=1&all=1')
        force_authenticate(req2, user=admin)
        resp2 = view(req2)
        self.assertEqual(resp2.status_code, 200)
        msme_ids_2 = [m['id'] for m in resp2.data]
        self.assertNotIn(self.msme.id, msme_ids_2)


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


class MSMEStatusLocationAndAltContactTests(TestCase):
    def setUp(self):
        self.bge_user = User.objects.create_user('bge_expert', 'bge@test.com', 'pass123')
        self.other_bge_user = User.objects.create_user('other_bge', 'other@test.com', 'pass123')

        self.bge = BusinessGrowthExpert.objects.create(name='BGE Expert', user=self.bge_user)
        self.other_bge = BusinessGrowthExpert.objects.create(name='Other BGE', user=self.other_bge_user)

        self.msme = MSME.objects.create(
            business_name='Arua Solar Solutions',
            business_type='SMALL',
            sector='TECHNOLOGY',
            owner_name='Adrole Robert',
            phone='0772000111',
            email='arua.solar@example.com',
            city='Arua City',
            district='Arua',
            state='Arua',
            status='active',
            is_active=True,
            assigned_bge=self.bge,
        )

        self.client = APIClient()

    def test_bge_updates_msme_status_and_is_active_sync(self):
        self.client.force_authenticate(user=self.bge_user)

        # Update to temporarily_closed
        res = self.client.patch(f'/api/msmes/{self.msme.id}/', {
            'status': 'temporarily_closed',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.msme.refresh_from_db()
        self.assertEqual(self.msme.status, 'temporarily_closed')
        self.assertFalse(self.msme.is_active)

        # Update back to active
        res2 = self.client.patch(f'/api/msmes/{self.msme.id}/', {
            'status': 'active',
        }, format='json')
        self.assertEqual(res2.status_code, 200)
        self.msme.refresh_from_db()
        self.assertEqual(self.msme.status, 'active')
        self.assertTrue(self.msme.is_active)

    def test_bge_updates_msme_location_and_district_sync(self):
        self.client.force_authenticate(user=self.bge_user)

        res = self.client.patch(f'/api/msmes/{self.msme.id}/', {
            'district': 'Gulu',
            'city': 'Gulu City',
            'address': 'Plot 45 Gulu Main Road',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.msme.refresh_from_db()
        self.assertEqual(self.msme.district, 'Gulu')
        self.assertEqual(self.msme.state, 'Gulu')
        self.assertEqual(self.msme.city, 'Gulu City')
        self.assertEqual(self.msme.address, 'Plot 45 Gulu Main Road')

    def test_bge_updates_msme_alternative_contact(self):
        self.client.force_authenticate(user=self.bge_user)

        res = self.client.patch(f'/api/msmes/{self.msme.id}/', {
            'alt_contact_name': 'Ayikoru Sarah',
            'alt_phone': '0782334455',
            'alt_email': 'sarah.manager@example.com',
            'alt_contact_role': 'Manager',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.msme.refresh_from_db()
        self.assertEqual(self.msme.alt_contact_name, 'Ayikoru Sarah')
        self.assertEqual(self.msme.alt_phone, '0782334455')
        self.assertEqual(self.msme.alt_email, 'sarah.manager@example.com')
        self.assertEqual(self.msme.alt_contact_role, 'Manager')

    def test_bge_updates_msme_gps_coordinates(self):
        self.client.force_authenticate(user=self.bge_user)

        res = self.client.patch(f'/api/msmes/{self.msme.id}/', {
            'latitude': 2.774950,
            'longitude': 32.299110,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.msme.refresh_from_db()
        self.assertAlmostEqual(float(self.msme.latitude), 2.774950, places=5)
        self.assertAlmostEqual(float(self.msme.longitude), 32.299110, places=5)

    def test_bge_auth_response_includes_gps_coordinates(self):
        from .auth_views import _build_user_response
        self.bge.location = 'Gulu City Base'
        self.bge.latitude = 2.774950
        self.bge.longitude = 32.299110
        self.bge.save()

        self.bge_user.refresh_from_db()
        res_data = _build_user_response(self.bge_user)
        bge_profile = res_data.get('user', {}).get('bge_profile')
        self.assertIsNotNone(bge_profile)
        self.assertEqual(bge_profile['location'], 'Gulu City Base')
        self.assertAlmostEqual(bge_profile['latitude'], 2.774950, places=5)
        self.assertAlmostEqual(bge_profile['longitude'], 32.299110, places=5)


class WorkOrderAttachmentAccessTests(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .models import BusinessGrowthExpert, WorkOrder, WorkOrderAttachment

        self.user_primary = User.objects.create_user(username='bge_primary', password='password123')
        self.bge_primary = BusinessGrowthExpert.objects.create(
            user=self.user_primary, name='Primary Expert', bge_code='PRUDEV-001'
        )

        self.user_co = User.objects.create_user(username='bge_co', password='password123')
        self.bge_co = BusinessGrowthExpert.objects.create(
            user=self.user_co, name='Co Assigned Expert', bge_code='PRUDEV-002'
        )

        self.user_supported = User.objects.create_user(username='bge_sup', password='password123')
        self.bge_supported = BusinessGrowthExpert.objects.create(
            user=self.user_supported, name='Supported Expert', bge_code='PRUDEV-003'
        )

        self.work_order = WorkOrder.objects.create(
            bge=self.bge_primary,
            supported_bge=self.bge_supported,
            work_order_type='bge_technical_co_assignment',
            work_order_number='WO-ATTACH-TEST',
            status='issued',
        )
        self.work_order.co_bges.add(self.bge_co)

        self.pdf_file = SimpleUploadedFile("evidence.pdf", b"%PDF-1.4 dummy pdf content", content_type="application/pdf")
        self.client = APIClient()

    def test_primary_bge_and_co_assigned_bge_visibility(self):
        from .models import WorkOrderAttachment
        # Primary BGE creates an attachment
        att = WorkOrderAttachment.objects.create(
            work_order=self.work_order,
            filename='field_report.pdf',
            file_data=b"%PDF-1.4 test",
            uploaded_by=self.user_primary,
        )

        # Primary BGE lists attachments
        self.client.force_authenticate(user=self.user_primary)
        res_primary = self.client.get('/api/work-order-attachments/')
        self.assertEqual(res_primary.status_code, 200)
        items = res_primary.data if isinstance(res_primary.data, list) else res_primary.data.get('results', [])
        att_ids = [item['id'] for item in items]
        self.assertIn(att.id, att_ids)

        # Co-assigned BGE lists attachments
        self.client.force_authenticate(user=self.user_co)
        res_co = self.client.get('/api/work-order-attachments/')
        self.assertEqual(res_co.status_code, 200)
        items_co = res_co.data if isinstance(res_co.data, list) else res_co.data.get('results', [])
        att_ids_co = [item['id'] for item in items_co]
        self.assertIn(att.id, att_ids_co)

        # Supported BGE lists attachments
        self.client.force_authenticate(user=self.user_supported)
        res_sup = self.client.get('/api/work-order-attachments/')
        self.assertEqual(res_sup.status_code, 200)
        items_sup = res_sup.data if isinstance(res_sup.data, list) else res_sup.data.get('results', [])
        att_ids_sup = [item['id'] for item in items_sup]
        self.assertIn(att.id, att_ids_sup)







