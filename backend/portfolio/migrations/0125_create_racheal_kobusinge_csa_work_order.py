"""
Migration 0125 — Create Racheal Kobusinge's One-Time Work Order for CSA Rapid Assessment (Resilience Activity).

Creates PRUDEV II-BGE-010T-04-01 (5 days @ UGX 60,000/day, 5 Oct – 12 Oct 2026) for
EOI Data Entry of approximately 500 applicants across Acholi, Lango, and Adjumani cooperatives.
Idempotent: safe to run on any DB whether the record exists or not.
"""
import datetime
from django.db import migrations

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
        "due_date": "100-150 applications per day for not more than 5 working days (5th–12th October 2026)",
        "quantitative_result": "Approximately 500 EOI application forms entered into the database/system (100–150 applications/day for maximum 5 working days)",
        "qualitative_result": "Accurate data capture of all applicant details, ensuring 100% verification against eligible PRUDEV II cooperatives in Acholi, Lango, and Adjumani",
        "means_of_verification": "Consolidated soft-copy database / entered records and daily progress log",
        "unit_rate": "60000",
        "payment_condition": "Payment processed upon verified data entry of all assigned application forms (up to 5 days maximum)",
    },
    {
        "task_num": "2",
        "description": "Data entry report detailing name and details of applicants with their preferred technology they wish to cost-share for.",
        "due_date": "Within 2 days after the completion of the assignment",
        "quantitative_result": "1 comprehensive data entry report submitted within 2 days of assignment completion",
        "qualitative_result": "Report provides clear overview and distribution of applicants by cooperative, district, and region, with demand analysis for Climate-Smart Agriculture (CSA) technologies",
        "means_of_verification": "Submitted and approved data entry report (soft copy)",
        "unit_rate": "0",
        "payment_condition": "Prerequisite for final assignment sign-off",
    },
    {
        "task_num": "3",
        "description": "Approved time sheets and signed invoices related to this assignment.",
        "due_date": "Within 2 days after the completion of the assignment",
        "quantitative_result": "1 duly filled and signed timesheet (max 5 days) and 1 approved invoice submitted",
        "qualitative_result": "Documentation compliant with GOPA Pro and PRUDEV II financial and administrative guidelines",
        "means_of_verification": "Duly signed timesheet and invoice approved by Team Leader",
        "unit_rate": "0",
        "payment_condition": "Payment released within 14 days upon approval of all deliverables, timesheet, and invoice",
    },
]

PAYMENT_NOTES = (
    "Rate: UGX 60,000 per day worked for a maximum of 5 days (Total contract value: UGX 300,000).\n"
    "Transport: N/A.\n"
    "Payment Terms: Paid within fourteen (14) days upon submission and approval of all deliverables listed above, "
    "a duly filled and signed time-sheet, and an approved invoice.\n"
    "In accordance with Ugandan Income Tax regulations, professional fees paid to consultants are subject to "
    "6% Withholding Tax (WHT), which will be deducted at source by GOPA Pro GmbH."
)


def create_racheal_csa_wo(apps, schema_editor):
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    User = apps.get_model('auth', 'User')

    bge = BusinessGrowthExpert.objects.filter(name__icontains='Kobusinge').first()
    if not bge:
        return

    # Backfill contact info if missing
    updated = False
    if not bge.email:
        bge.email = 'kobusingeracheal50@gmail.com'
        updated = True
    if not bge.phone:
        bge.phone = '+256750855870'
        updated = True
    if updated:
        bge.save()

    wo_number = 'PRUDEV II-BGE-010T-04-01'
    if WorkOrder.objects.filter(work_order_number=wo_number).exists():
        return

    admin_user = User.objects.filter(username__in=['richard', 'admin', 'Stephen']).first()

    WorkOrder.objects.create(
        bge_id=bge.pk,
        work_order_number=wo_number,
        work_order_type='csa_rapid_assessment',
        project_name='Promoting Rural Development II (PRUDEV II)',
        issue_date=datetime.date(2026, 10, 5),
        start_date=datetime.date(2026, 10, 5),
        end_date=datetime.date(2026, 10, 12),
        location='Northern Uganda (Gulu Office)',
        duration='Maximum of 5 days (5th October to 12th October 2026)',
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


def reverse_racheal_csa_wo(apps, schema_editor):
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    WorkOrder.objects.filter(work_order_number='PRUDEV II-BGE-010T-04-01').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0124_ensure_jimmy_ouni_admin'),
    ]

    operations = [
        migrations.RunPython(create_racheal_csa_wo, reverse_racheal_csa_wo),
    ]
