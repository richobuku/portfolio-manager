"""
Migration 0126 — Add 'csa_eoi_data_entry' to WorkOrder.TYPE_CHOICES and make sure
Racheal Kobusinge's one-time work order (PRUDEV II-BGE-010T-04-01) exists with that type.

Idempotent and robust: finds the BGE by code OR name; updates the work order if it was
already created by 0125 (as 'csa_rapid_assessment'); creates it if it is missing.
"""
import datetime
from django.db import migrations, models
from django.db.models import Q

WO_NUMBER = 'PRUDEV II-BGE-010T-04-01'
BGE_CODE = 'PRUDEV II-BGE-010T-04'
NEW_TYPE = 'csa_eoi_data_entry'

OBJECTIVE = (
    "To establish farmer-led demonstration sites where selected technologies can be "
    "practically used, tested and demonstrated to other farmers. The technologies are "
    "intended to improve production efficiency, reduce post-harvest losses, improve "
    "produce quality and strengthen farmer incomes."
)

KEY_TASKS = (
    "The BGE is tasked to enter the raw data from applicants who are registered members "
    "of one of the PRUDEV II-listed cooperatives and must be located in the eligible "
    "PRUDEV II operational areas, including the Acholi and Lango sub-regions and Adjumani district."
)

DELIVERABLES = [
    {
        "task_num": "1",
        "description": "Data entry of approximately 500 EOI application forms from applicants within the designated cooperatives.",
        "due_date": "100-150 applications per day for not more than 5 working days",
        "quantitative_result": "Approximately 500 EOI application forms entered (100–150 applications/day for a maximum of 5 working days)",
        "qualitative_result": "Accurate data capture of all applicant details, verified against eligible PRUDEV II cooperatives in Acholi, Lango and Adjumani",
        "means_of_verification": "Consolidated soft-copy database / entered records and daily progress log",
        "unit_rate": "60000",
        "payment_condition": "Payment processed upon verified data entry of all assigned application forms (up to 5 days maximum)",
    },
    {
        "task_num": "2",
        "description": "Data entry report detailing name and details of applicants with their preferred technology they wish to cost-share for.",
        "due_date": "Within 2 days after the completion of the assignment",
        "quantitative_result": "1 data entry report submitted within 2 days of assignment completion",
        "qualitative_result": "Clear overview of applicants by cooperative, district and region, with the most demanded CSA technologies identified",
        "means_of_verification": "Submitted and approved data entry report (soft copy)",
        "unit_rate": "",
        "payment_condition": "Payment processed upon approval of the report",
    },
    {
        "task_num": "3",
        "description": "Approved time sheets and signed invoices related to this assignment.",
        "due_date": "Within 2 days after the completion of the assignment",
        "quantitative_result": "1 signed timesheet (max 5 days) and 1 approved invoice submitted",
        "qualitative_result": "Documentation compliant with GOPA Pro and PRUDEV II financial guidelines",
        "means_of_verification": "Approved invoice and countersigned timesheet",
        "unit_rate": "",
        "payment_condition": "Payment processed upon approval of timesheet and invoice alongside all deliverables",
    },
]

PAYMENT_NOTES = (
    "Rate: UGX 60,000 per day worked, maximum 5 days (total contract value UGX 300,000).\n"
    "Transport: N/A.\n"
    "Payment Terms: Paid within fourteen (14) days upon submission and approval of all deliverables listed above, "
    "a duly filled and signed time-sheet, and an approved invoice.\n"
    "In accordance with Ugandan Income Tax regulations, professional fees are subject to 6% Withholding Tax (WHT), "
    "deducted at source by GOPA Pro GmbH."
)


def apply_racheal_wo(apps, schema_editor):
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    User = apps.get_model('auth', 'User')

    existing = WorkOrder.objects.filter(work_order_number=WO_NUMBER).first()
    if existing:
        WorkOrder.objects.filter(pk=existing.pk).update(
            work_order_type=NEW_TYPE,
            objective=OBJECTIVE,
            key_tasks=KEY_TASKS,
            deliverables_json=DELIVERABLES,
            payment_notes=PAYMENT_NOTES,
            transport_reimbursed=False,
        )
        return

    bge = BusinessGrowthExpert.objects.filter(
        Q(bge_code__iexact=BGE_CODE) | Q(name__icontains='Kobusinge')
    ).first()
    if not bge:
        return

    admin_user = User.objects.filter(username__in=['richard', 'admin', 'Stephen']).first()
    WorkOrder.objects.create(
        bge_id=bge.pk,
        work_order_number=WO_NUMBER,
        work_order_type=NEW_TYPE,
        project_name='Promoting Rural Development II (PRUDEV II)',
        issue_date=datetime.date(2026, 10, 5),
        start_date=datetime.date(2026, 10, 5),
        end_date=datetime.date(2026, 10, 12),
        location='Northern Uganda (Gulu Office)',
        duration='Maximum of 5 days',
        status='issued',
        rate_per_day=60000,
        max_days=5,
        transport_reimbursed=False,
        objective=OBJECTIVE,
        key_tasks=KEY_TASKS,
        deliverables_json=DELIVERABLES,
        payment_notes=PAYMENT_NOTES,
        team_leader_name='Stephen Maxi Opwonya',
        team_leader_position='Team Leader',
        created_by_id=admin_user.pk if admin_user else None,
        msme_ids_snapshot=[],
    )


def revert_racheal_wo(apps, schema_editor):
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    WorkOrder.objects.filter(work_order_number=WO_NUMBER).update(work_order_type='csa_rapid_assessment')


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0125_create_racheal_kobusinge_csa_work_order'),
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
                    ('csa_eoi_data_entry', 'CSA Demonstration Sites — EOI Data Entry'),
                    ('bds_manual_module', 'BDS Manual — Additional Module'),
                    ('bge_technical_co_assignment', 'BGE Technical Co-Assignment Support (Specialist Technical Capacity)'),
                    ('market_activation_mobilisation', 'Market Activation Event — MSME Mobilisation & Tool Demonstration'),
                    ('bge_bankable_docs_training', 'BGE Co-Facilitator — Bankable Documents & Field Feedback Workshop'),
                    ('bge_bankable_docs_participant', 'BGE Participant — Bankable Documents & Field Feedback Workshop'),
                    ('other', 'Other'),
                ],
                default='msme_support',
                max_length=40,
            ),
        ),
        migrations.RunPython(apply_racheal_wo, revert_racheal_wo),
    ]
