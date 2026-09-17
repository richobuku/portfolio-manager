"""
Migration 0115 — Ensure Jacob Odur's Work Order PRUDEV II-CONS-JO-03 is set to 'issued' status.

Draft work orders are hidden from BGE accounts by design.
This migration ensures the work order exists and is set to status='issued' so it is visible to Jacob Odur.
"""
import datetime
from django.db import migrations

OBJECTIVE = (
    "To co-facilitate the PRUDEV II Business Growth Expert (BGE) Capacity Building Workshop focusing on "
    "Bankable Documents for MSMEs and to co-lead the structured BGE Field Feedback Review Session. "
    "The Senior BGE / Co-Facilitator will collaborate with the Lead Trainer and BDS Team to train BGEs "
    "on diagnosing MSME credit readiness, assembling bank-standard documentation (URSB registrations, TINs, "
    "digital books/cashbooks, and financial statements), and packaging loan applications for Financial "
    "Service Providers (FSPs). Additionally, the Consultant will co-lead the reflective BGE feedback session, "
    "synthesizing ground-level coaching bottlenecks, adherence to verification standards (\"The Acid Test\"), "
    "digital tool adoption (One Tap POS, ISM, Zoho), and compiling actionable recommendations for programme leadership."
)

KEY_TASKS = """PHASE 1 — PREPARATION & SESSION MATERIALS HARMONIZATION (2 Days)
1. Review the bankable documents training curriculum, credit appraisal criteria, FSP checklist standards, and session timetable.
2. Develop practical case studies and mock enterprise financial profiles (cashbooks, revenue estimates, asset registers, and loan application forms) for hands-on BGE simulation.
3. Formulate structured breakout discussion templates and diagnostic reflection prompts for the BGE feedback session.
4. Harmonize facilitation roles, session exercises, presentation slide decks, and logistical requirements with the Lead BDS Facilitator.

PHASE 2 — INTERACTIVE TRAINING & FEEDBACK CO-FACILITATION (2 Days)
5. Co-deliver interactive training modules on Bankable Documents:
   - Defining bankability and credit readiness in rural and semi-urban Northern Uganda MSME contexts.
   - Guiding MSMEs to prepare formal legal records (URSB registration, TIN, and local operational licenses).
   - Developing verifiable financial records from informal receipts and digital tools (One Tap POS, ISM, cashbooks).
   - Assembling loan dossier packages and preparing entrepreneurs for bank credit officer interactions.
6. Facilitate practical group simulations where BGEs critique sample business dossiers, identify documentation gaps, and structure bank-ready loan proposals.
7. Co-lead the structured BGE Feedback Session:
   - Plenary and cluster breakouts examining field coaching dynamics and MSME responsiveness.
   - Reviewing the adoption and field rigor of "The Acid Test" verification protocol.
   - Assessing field bottlenecks regarding digital tool onboarding, visit scheduling, and portal reporting.
8. Administer participant feedback and learning assessment instruments; ensure 100% completion of daily signed attendance registers.

PHASE 3 — POST-SESSION SYNTHESIS & REPORTING (1 Day)
9. Collate and evaluate participant learning scores, workshop evaluations, and bankability simulation outputs.
10. Compile a comprehensive Bankable Documents Training & BGE Feedback Session Report, highlighting key learning outcomes, systemic field challenges, and actionable recommendations for PRUDEV II BDS management.
11. Submit final approved report, original attendance sheets, verified travel logs, approved invoice, and timesheet for Team Leader sign-off."""

DELIVERABLES = [
    {
        "task_num": "1",
        "description": "Inception Note & Session Curriculum Package (agenda, presentation deck, mock enterprise bankability case studies, and feedback session reflection guide)",
        "due_date": "28 September 2026",
        "quantitative_result": "1 complete session package (agenda + presentation deck + case study worksheets + feedback templates) submitted and approved",
        "qualitative_result": "Content tailored to Northern Uganda MSME realities and FSP credit appraisal requirements; session exercises directly build BGE coaching capacity",
        "means_of_verification": "Submitted session package approved by Lead BDS Expert / Team Leader",
        "unit_rate": "80000",
        "payment_condition": "Prerequisite for session delivery",
    },
    {
        "task_num": "2",
        "description": "Training & Feedback Co-Facilitation (2 full days of co-facilitation delivered covering bankable documents and BGE feedback review)",
        "due_date": "30 September 2026",
        "quantitative_result": "2 full days of workshop co-facilitation delivered; signed attendance registers capturing 100% of participating BGEs",
        "qualitative_result": "Facilitation is highly engaging and practical; BGEs actively evaluate mock dossiers and draft loan proposals; feedback session yields clear, verified action points",
        "means_of_verification": "Signed daily attendance registers, session photo documentation, and completed participant exercise logs",
        "unit_rate": "160000",
        "payment_condition": "Required for payment — attendance registers and completed exercises must be submitted",
    },
    {
        "task_num": "3",
        "description": "Consolidated Training & BGE Feedback Review Report (comprehensive synthesis of training outcomes, field feedback analysis, and BDS recommendations)",
        "due_date": "2 October 2026",
        "quantitative_result": "1 consolidated final report (including evaluation score analysis, thematic feedback synthesis, and photo evidence) submitted to the BDS team",
        "qualitative_result": "Report provides clear, actionable thematic analysis of BGE feedback; details participant learning progress; outlines practical management follow-ups",
        "means_of_verification": "Submitted final report approved by BDS Expert and Team Leader",
        "unit_rate": "80000",
        "payment_condition": "Phase closeout payment processed upon approval of final report",
    },
    {
        "task_num": "4",
        "description": "Financial Clearance & Administrative Closeout (approved invoice and countersigned timesheet reflecting 5 working days)",
        "due_date": "2 October 2026",
        "quantitative_result": "1 approved invoice and 1 duly signed timesheet reflecting 5 working days",
        "qualitative_result": "Documentation fully compliant with GOPA Pro and GIZ financial guidelines",
        "means_of_verification": "Countersigned invoice and timesheet approved by Team Leader",
        "unit_rate": "80000",
        "payment_condition": "Final fee disbursement contingent on complete verification",
    },
]

PAYMENT_NOTES = (
    "Total contract value: UGX 400,000 (5 days × UGX 80,000/day).\n"
    "Payment disbursed upon completion of the assignment, submission and approval of the final report, "
    "signed attendance lists, and countersigned invoice/timesheet.\n"
    "In accordance with Ugandan Income Tax regulations, professional fees are subject to 6% Withholding Tax (WHT), "
    "deducted at source by GOPA Pro GmbH.\n"
    "Verified travel expenses will be reimbursed in accordance with PRUDEV II approved transport rates."
)


def issue_jacob_bankable_wo(apps, schema_editor):
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    User = apps.get_model('auth', 'User')

    wo_number = 'PRUDEV II-CONS-JO-03'
    wo = WorkOrder.objects.filter(work_order_number=wo_number).first()
    if wo:
        wo.status = 'issued'
        wo.save(update_fields=['status'])
        return

    # If not found, find Jacob via multiple lookups
    bge = (
        BusinessGrowthExpert.objects.filter(bge_code='PRUDEV II-BGE-010T-01').first()
        or BusinessGrowthExpert.objects.filter(name='Jacob Odur').first()
        or BusinessGrowthExpert.objects.filter(name__icontains='Jacob').first()
    )
    if not bge:
        return

    admin_user = User.objects.filter(username__in=['richard', 'admin', 'Stephen']).first()

    WorkOrder.objects.create(
        bge_id=bge.pk,
        work_order_number=wo_number,
        work_order_type='other',
        project_name='Promoting Rural Development II (PRUDEV II)',
        issue_date=datetime.date(2026, 9, 17),
        start_date=datetime.date(2026, 9, 28),
        end_date=datetime.date(2026, 10, 2),
        location='Northern Uganda (Gulu & Lira)',
        duration='5 days (28 Sep – 2 Oct 2026)',
        status='issued',
        rate_per_day=80000,
        max_days=5,
        transport_reimbursed=True,
        objective=OBJECTIVE,
        key_tasks=KEY_TASKS,
        deliverables_json=DELIVERABLES,
        payment_notes=PAYMENT_NOTES,
        team_leader_name='Stephen Maxi Opwonya',
        team_leader_position='Team Leader',
        created_by=admin_user,
        msme_ids_snapshot=[],
    )


def reverse_issue_jacob_bankable_wo(apps, schema_editor):
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    WorkOrder.objects.filter(work_order_number='PRUDEV II-CONS-JO-03').update(status='draft')


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0114_create_jacob_bankable_docs_feedback_work_order'),
    ]

    operations = [
        migrations.RunPython(issue_jacob_bankable_wo, reverse_issue_jacob_bankable_wo),
    ]
