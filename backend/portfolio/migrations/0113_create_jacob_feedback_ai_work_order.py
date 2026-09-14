"""
Migration 0113 — Create Jacob Odur's Work Order for BGE Feedback Review & AI Productivity.

Creates PRUDEV II-CONS-JO-02 (5 days @ UGX 80,000/day, 28 Sep – 2 Oct 2026) in draft status.
Idempotent: safe to run on any DB whether the record exists or not.
"""
import datetime
from django.db import migrations

OBJECTIVE = (
    "To design, coordinate, and lead a structured BGE Feedback Review & Capacity Building Workshop "
    "for Business Growth Experts (BGEs) under PRUDEV II. The Senior BGE / Lead Facilitator will synthesize "
    "ground-level field feedback, facilitate reflective peer-to-peer discussions on MSME advisory bottlenecks, "
    "and deliver an applied, hands-on learning module focused on professional documentation standards and the "
    "practical application of Artificial Intelligence (AI) tools for meeting preparation, voice-to-text notetaking, "
    "synthesis of field observations, and accelerated portal reporting."
)

KEY_TASKS = """PHASE 1 — PREPARATION & CURRICULUM DESIGN (2 Days)
1. Collate, review, and synthesize operational feedback, diagnostic findings, and common field coaching challenges encountered by BGEs across Northern Uganda.
2. Develop the workshop curriculum, facilitator guide, and session timetable balancing feedback reflection with practical technology training.
3. Create hands-on training materials, prompt templates, and step-by-step guidance on practical AI tools (voice-to-text dictation, LLM-driven meeting preparation, summarization of client notes, and automated action checklists).
4. Formulate PRUDEV II AI data privacy and confidentiality rules, ensuring no sensitive MSME financial details, proprietor identity, or proprietary secrets are fed into public AI models.

PHASE 2 — WORKSHOP DELIVERY & APPLIED AI TRAINING (2 Days)
5. Facilitate structured plenary and breakout feedback sessions where BGEs reflect on field dynamics, adoption of "The Acid Test", MSME formalization barriers, and visit reporting timelines.
6. Deliver interactive training on documentation best practices—bridging on-site diagnosis with concrete client action handouts and verifiable portal reporting.
7. Lead live demonstrations of AI-assisted productivity tools:
   - Voice-to-text dictation tools (capturing detailed observation notes in the field without friction).
   - AI-assisted meeting preparation (generating tailored enterprise diagnostic questions, agro-processing industry briefs, and structured agendas).
   - Synthesis & structured reporting (converting raw field notes into concise, professional PRUDEV II visit narratives and client-facing SMS Action Handouts).
8. Conduct guided practical simulation exercises where each participating BGE uses AI tools to draft meeting prep notes and synthesize mock field visit reports.
9. Administer participant feedback and learning assessment instruments to measure comprehension and tool uptake.

PHASE 3 — POST-WORKSHOP SYNTHESIS, EVALUATION & REPORTING (1 Day)
10. Collate participant feedback, exercise outputs, and post-session evaluations.
11. Compile a comprehensive BGE Feedback Review & AI Documentation Training Report, synthesizing common operational challenges, systemic recommendations for the BDS team, and individual BGE readiness.
12. Submit the completed report, original signed attendance sheets, approved invoice, and timesheet for Team Leader sign-off."""

DELIVERABLES = [
    {
        "task_num": "1",
        "description": "Inception Note & Session Curriculum Package (agenda, presentation deck, and AI exercise worksheets)",
        "due_date": "29 September 2026",
        "quantitative_result": "1 complete session package (agenda + presentation deck + exercise worksheets) submitted and approved",
        "qualitative_result": "Content tailored to PRUDEV II field realities; AI tools selected are accessible via standard mobile smartphones; data privacy safeguards clearly articulated",
        "means_of_verification": "Submitted session package approved by BDS Expert / Team Leader",
        "unit_rate": "80000",
        "payment_condition": "Prerequisite for workshop delivery",
    },
    {
        "task_num": "2",
        "description": "Workshop Facilitation & Applied AI Simulation (2-day interactive BGE Feedback & AI Productivity Workshop delivered)",
        "due_date": "1 October 2026",
        "quantitative_result": "2 full days of workshop facilitation delivered; signed attendance registers capturing 100% of participating BGEs",
        "qualitative_result": "Facilitation is participatory and engaging; all BGEs actively execute live voice-to-text and AI meeting prep simulations; feedback session yields clear action points",
        "means_of_verification": "Signed daily attendance registers, session photo documentation, and completed participant exercise logs",
        "unit_rate": "160000",
        "payment_condition": "Required for payment — attendance registers and completed exercises must be submitted",
    },
    {
        "task_num": "3",
        "description": "BGE AI Productivity & Documentation Toolkit (cheat sheet on prompt templates, voice dictation, meeting prep, and confidentiality rules)",
        "due_date": "1 October 2026",
        "quantitative_result": "1 practical AI Productivity & Documentation Toolkit (minimum 4–6 pages, PDF/digital format) distributed to all participating BGEs",
        "qualitative_result": "Guide is practical, non-technical, immediately actionable in rural and semi-urban MSME field contexts, and reinforces PRUDEV II reporting quality",
        "means_of_verification": "Distributed toolkit copy and confirmation of BGE distribution",
        "unit_rate": "80000",
        "payment_condition": "Prerequisite for final deliverable sign-off",
    },
    {
        "task_num": "4",
        "description": "Consolidated BGE Feedback & Session Delivery Report (synthesis of BGE field feedback, evaluation score analysis, and management recommendations)",
        "due_date": "2 October 2026",
        "quantitative_result": "1 consolidated final report (including evaluation score analysis and photo evidence) submitted to the BDS team",
        "qualitative_result": "Report provides clear, actionable thematic analysis of BGE feedback; details participant learning progress; outlines practical management follow-ups",
        "means_of_verification": "Submitted final report approved by BDS Expert and Team Leader",
        "unit_rate": "80000",
        "payment_condition": "Phase closeout payment processed upon approval of final report",
    },
    {
        "task_num": "5",
        "description": "Financial Clearance & Administrative Closeout (approved invoice and signed timesheet)",
        "due_date": "2 October 2026",
        "quantitative_result": "1 approved invoice and 1 duly signed timesheet reflecting 5 working days",
        "qualitative_result": "Documentation fully compliant with GOPA Pro and GIZ financial guidelines",
        "means_of_verification": "Countersigned invoice and timesheet approved by Team Leader",
        "unit_rate": "0",
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


def create_jacob_ai_wo(apps, schema_editor):
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    User = apps.get_model('auth', 'User')

    bge = BusinessGrowthExpert.objects.filter(name='Jacob Odur').first()
    if not bge:
        return

    wo_number = 'PRUDEV II-CONS-JO-02'
    if WorkOrder.objects.filter(work_order_number=wo_number).exists():
        return

    admin_user = User.objects.filter(username__in=['richard', 'admin', 'Stephen']).first()

    WorkOrder.objects.create(
        bge_id=bge.pk,
        work_order_number=wo_number,
        work_order_type='other',
        project_name='Promoting Rural Development II (PRUDEV II)',
        issue_date=datetime.date(2026, 9, 14),
        start_date=datetime.date(2026, 9, 28),
        end_date=datetime.date(2026, 10, 2),
        location='Northern Uganda (Gulu & Lira)',
        duration='5 days (28 Sep – 2 Oct 2026)',
        status='draft',
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


def reverse_jacob_ai_wo(apps, schema_editor):
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    WorkOrder.objects.filter(work_order_number='PRUDEV II-CONS-JO-02').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0112_alter_msmereport_options'),
    ]

    operations = [
        migrations.RunPython(create_jacob_ai_wo, reverse_jacob_ai_wo),
    ]
