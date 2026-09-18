"""
Migration 0117 — Add 'bge_bankable_docs_training' to WorkOrder.TYPE_CHOICES
and update Jacob Odur's PRUDEV II-CONS-JO-03 work order from 'other' to 'bge_bankable_docs_training'.
"""
from django.db import migrations, models


def set_bankable_wo_type(apps, schema_editor):
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    WorkOrder.objects.filter(work_order_number='PRUDEV II-CONS-JO-03').update(
        work_order_type='bge_bankable_docs_training'
    )


def reverse_bankable_wo_type(apps, schema_editor):
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    WorkOrder.objects.filter(work_order_number='PRUDEV II-CONS-JO-03').update(
        work_order_type='other'
    )


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0116_add_market_activation_work_order_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workorder',
            name='work_order_type',
            field=models.CharField(
                choices=[
                    ('permanent_assignee_support', 'Permanent Assignee Support (3x/Month) — Thematic Enterprise Coaching'),
                    ('msme_support', 'MSME CRM & Business Support'),
                    ('msme_data_update', 'MSME Data Update & Verification'),
                    ('msme_finance_survey', 'MSME Finance Survey (Google Forms)'),
                    ('msme_access_finance', 'Access to Finance & Digital Onboarding'),
                    ('access_to_finance_bge', 'Access to Finance — BGE Template'),
                    ('agro_biz_continuity', 'Agro-processors — Business Continuity & Strategic Planning'),
                    ('bcp_senior_facilitator', 'Agro-processors BCP — Senior BGE Lead Facilitator'),
                    ('mobilisation', 'Mobilisation / Outreach'),
                    ('group_session', 'Peer-to-Peer Group Session'),
                    ('bcp_tool_training', 'BCP Tool Training — BGE Participant'),
                    ('bge_bcp_participant_mentor', 'Agro-processors — Business Continuity & Strategic Planning (BGE Support)'),
                    ('outcome_assessment_tool', 'Outcome Assessment Tool Delivery'),
                    ('fi_mobilisation_bcp', 'BCP Tool - Field Implementation'),
                    ('carbon_emissions_training', 'Carbon Emissions Measurement Framework — Training & Field Implementation'),
                    ('csa_rapid_assessment', 'CSA Rapid Assessment — Resilience Activity'),
                    ('bds_manual_module', 'BDS Manual — Additional Module'),
                    ('bge_technical_co_assignment', 'BGE Technical Co-Assignment Support (Specialist Technical Capacity)'),
                    ('market_activation_mobilisation', 'Market Activation Event — MSME Mobilisation & Tool Demonstration'),
                    ('bge_bankable_docs_training', 'BGE Training — Bankable Documents & Field Feedback Review'),
                    ('other', 'Other'),
                ],
                default='msme_support',
                max_length=40,
            ),
        ),
        migrations.RunPython(set_bankable_wo_type, reverse_bankable_wo_type),
    ]
