from django.test import TestCase

from .models import WorkOrder


class WorkOrderTypeChoicesTests(TestCase):
    def test_outcome_assessment_tool_choice_exists(self):
        choice_values = dict(WorkOrder.TYPE_CHOICES)

        self.assertIn('outcome_assessment_tool', choice_values)
        self.assertEqual(
            choice_values['outcome_assessment_tool'],
            'Outcome Assessment Tool Delivery',
        )
