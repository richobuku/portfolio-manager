from django.test import TestCase

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
