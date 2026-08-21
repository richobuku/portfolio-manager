from django.test import TestCase
from django.contrib.auth.models import User

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


