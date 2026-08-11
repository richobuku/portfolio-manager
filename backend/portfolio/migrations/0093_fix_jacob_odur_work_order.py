"""
Migration 0093 — Recreate Jacob Odur's work order with correct full content.

The previous migration (0092) may have created the WO with incomplete data
or the wrong field values. This migration deletes whatever exists and rebuilds
it from scratch to match the bds_manual_module WO template exactly.

Idempotent: safe to run on a DB where the WO doesn't exist yet.
"""
import datetime
from django.db import migrations


DELIVERABLES = [
    {
        "task_num": "1",
        "description": (
            "Inception Note — outlining the content development plan, section structure, "
            "key sources to be referenced, and anticipated gaps in the existing BDS Manual"
        ),
        "due_date": "End of Week 1 (8 August 2026)",
        "quantitative_result": "1 inception note submitted covering content plan and section structure",
        "qualitative_result": (
            "Note is clear, complete, and provides a credible basis for the full "
            "content development phase"
        ),
        "means_of_verification": "Submitted inception note approved by BDS Expert",
        "payment_condition": "Required before content development proceeds — no separate payment",
    },
    {
        "task_num": "2",
        "description": (
            "PPDA Module — covering PPDA role, public procurement principles, thresholds, "
            "bid procedures, and compliance requirements for SMEs and business development "
            "practitioners"
        ),
        "due_date": "22 August 2026",
        "quantitative_result": "1 completed PPDA Module (minimum 10 pages) submitted by 22 August 2026",
        "qualitative_result": (
            "Module is accurate, practically written, referenced to current PPDA guidelines, "
            "and appropriate for DCO and BGE audiences"
        ),
        "means_of_verification": "Submitted draft PPDA Module",
        "payment_condition": "Included in Phase 1 payment upon approval of all Phase 1 deliverables",
    },
    {
        "task_num": "3",
        "description": (
            "Public Procurement Section — step-by-step guide covering solicitation, bid "
            "preparation, evaluation criteria, contract award, and grievance mechanisms "
            "for MSMEs"
        ),
        "due_date": "22 August 2026",
        "quantitative_result": "1 completed Public Procurement Section (minimum 8 pages) submitted by 22 August 2026",
        "qualitative_result": (
            "Section is practical, well-structured, and enables MSMEs and BGEs to navigate "
            "public procurement processes with confidence"
        ),
        "means_of_verification": "Submitted draft Public Procurement Section",
        "payment_condition": "Included in Phase 1 payment upon approval of all Phase 1 deliverables",
    },
    {
        "task_num": "4",
        "description": (
            "Updated URA Section — incorporating all relevant 2026 legislative and regulatory "
            "changes, including updated tax rates, e-Tax portal guidance, VAT thresholds, "
            "and MSME-specific obligations"
        ),
        "due_date": "22 August 2026",
        "quantitative_result": "1 updated URA Section (minimum 8 pages) submitted by 22 August 2026",
        "qualitative_result": (
            "Section accurately reflects 2026 URA changes; all figures, rates, and procedures "
            "are current and referenced; content is accessible to non-tax specialists"
        ),
        "means_of_verification": "Submitted updated URA Section with source references",
        "payment_condition": "Included in Phase 1 payment upon approval of all Phase 1 deliverables",
    },
    {
        "task_num": "5",
        "description": (
            "DCO Training Package — facilitator guide, participant handbook, and session plans "
            "for a 2-day training on the new BDS Manual modules"
        ),
        "due_date": "29 August 2026",
        "quantitative_result": (
            "1 complete DCO Training Package (facilitator guide + participant handbook + "
            "session plans) submitted by 29 August 2026"
        ),
        "qualitative_result": (
            "Package enables any competent facilitator to deliver the 2-day training; "
            "materials are well-structured, practical, and calibrated to the DCO audience"
        ),
        "means_of_verification": "Submitted DCO Training Package approved by BDS Expert",
        "payment_condition": "Included in Phase 1 payment upon approval of all Phase 1 deliverables",
    },
    {
        "task_num": "6",
        "description": (
            "BGE Training Content — practical training materials to equip BGEs with applied "
            "knowledge of procurement participation, tax compliance, and business formalisation "
            "support"
        ),
        "due_date": "29 August 2026",
        "quantitative_result": "1 set of BGE training materials submitted by 29 August 2026",
        "qualitative_result": (
            "Materials are practical, written for a non-specialist audience, and directly "
            "linked to BGE field support roles"
        ),
        "means_of_verification": "Submitted BGE Training Content approved by BDS Expert",
        "payment_condition": "Included in Phase 1 payment upon approval of all Phase 1 deliverables",
    },
    {
        "task_num": "7",
        "description": (
            "Finalised BDS Manual Additional Module — all four sections (PPDA, Public "
            "Procurement, URA Update, Training Content) consolidated, formatted, and "
            "approved for printing"
        ),
        "due_date": "5 September 2026",
        "quantitative_result": "1 finalised, formatted Additional Module document ready for printing and distribution",
        "qualitative_result": (
            "Module is internally consistent, formatted to BDS Manual standards, reviewed "
            "and approved by BDS Expert and Team Leader"
        ),
        "means_of_verification": "Final approved copy of the Additional Module (PDF and Word versions)",
        "payment_condition": "Phase 1 payment processed upon approval of the finalised module",
    },
    {
        "task_num": "8",
        "description": (
            "DCO Training — Gulu (Day 1, 1st week of September 2026): 2-day DCO training "
            "delivered, Day 1 in Gulu"
        ),
        "due_date": "1st Week of September 2026",
        "quantitative_result": "1 day of DCO training delivered in Gulu; signed attendance register submitted",
        "qualitative_result": (
            "Training is well-facilitated; DCOs engage with new content through practical "
            "exercises; facilitator is confident and content is delivered to standard"
        ),
        "means_of_verification": "Signed Gulu attendance register and participant feedback forms",
        "payment_condition": "Required for Phase 2 payment — attendance register must be submitted",
    },
    {
        "task_num": "9",
        "description": (
            "DCO Training — Lira (Day 2, 1st week of September 2026): 2-day DCO training "
            "delivered, Day 2 in Lira"
        ),
        "due_date": "1st Week of September 2026",
        "quantitative_result": "1 day of DCO training delivered in Lira; signed attendance register submitted",
        "qualitative_result": (
            "Training is well-facilitated; DCOs engage with new content through practical "
            "exercises; consistent quality with Gulu session"
        ),
        "means_of_verification": "Signed Lira attendance register and participant feedback forms",
        "payment_condition": "Required for Phase 2 payment — attendance register must be submitted",
    },
    {
        "task_num": "10",
        "description": (
            "Post-Training Report — covering DCO training in Gulu and Lira, participant "
            "engagement, feedback analysis, and recommendations for BGE rollout"
        ),
        "due_date": "Within 5 days of final training day",
        "quantitative_result": "1 post-training report submitted within 5 days of the Lira training day",
        "qualitative_result": (
            "Report documents training content delivered, DCO engagement and feedback, "
            "key observations, and specific recommendations for BGE rollout"
        ),
        "means_of_verification": "Submitted post-training report approved by Team Leader",
        "payment_condition": "Phase 2 payment processed upon approval of the post-training report",
    },
    {
        "task_num": "11",
        "description": "Approved invoice and signed timesheet",
        "due_date": "With post-training report",
        "quantitative_result": "1 approved invoice and 1 signed timesheet reflecting 40 days worked",
        "qualitative_result": (
            "Invoice and timesheet are accurate, consistent with work order terms, and "
            "submitted alongside the post-training report"
        ),
        "means_of_verification": "Approved invoice and countersigned timesheet",
        "payment_condition": "Final payment processed upon approval of invoice, timesheet, and post-training report",
    },
]

OBJECTIVE = (
    "To develop two additional modules for the PRUDEV II BDS Manual — covering the Public "
    "Procurement and Disposal Authority (PPDA) and public procurement framework, and an "
    "updated URA tax compliance section incorporating 2026 legislative and regulatory changes "
    "— together with structured training content and materials for District Commercial Officers "
    "(DCOs) and Business Growth Experts (BGEs), and to co-facilitate the rollout training "
    "sessions for BGEs and DCOs across Gulu and Lira."
)

KEY_TASKS = """\
This is primarily a desk-based assignment, with field delivery limited to co-facilitation \
of BGE and DCO training sessions.

PHASE 1 — MODULE DEVELOPMENT (Desk Assignment)

1. Review the existing BDS Manual and identify the precise scope of additions required \
for the two new modules.
2. Draft Module 1 — PPDA & Public Procurement: covering PPDA's mandate and regulatory \
framework; public procurement principles, thresholds, and procedures; bid preparation and \
evaluation; contract award and management; grievance and appeals mechanisms; and practical \
guidance for MSMEs seeking to participate in public procurement.
3. Draft Module 2 — URA 2026 Update: incorporating all URA legislative and regulatory \
changes effective 2026; updated income tax rates and filing requirements; VAT thresholds \
and compliance; digital tax tools (e-Tax portal guidance); PAYE and withholding tax updates; \
and MSME-specific tax obligations.
4. Develop the DCO Training Package: facilitator guide, participant handbook, and session \
plans covering both new modules, tailored to the DCO's role in supporting business \
development practitioners and MSMEs.
5. Develop the BGE Training Content: practical materials equipping BGEs to support MSMEs \
on procurement participation, tax compliance, and business formalisation — written for a \
non-tax-specialist audience.
6. Submit drafts of both modules and all training materials for review by the BDS Expert \
and Team Leader; revise based on feedback.
7. Finalise and format both modules and training materials in line with the existing BDS \
Manual structure and PRUDEV II standards, ready for printing and distribution.

PHASE 2 — CO-FACILITATION OF TRAINING (5 days, 1st Week of September 2026)

8. Co-facilitate the BGE training sessions on the new BDS Manual modules, supporting \
practical exercises and ensuring BGEs can apply the new content in the field.
9. Co-facilitate the DCO training sessions in Gulu (Day 1) and Lira (Day 2), covering \
both new modules with practical exercises and case studies.
10. Collect participant feedback using the approved PRUDEV II feedback instrument at the \
close of each training day.
11. Prepare and submit a post-training report covering both BGE and DCO sessions, with \
participant engagement observations, feedback analysis, and recommendations for field application."""

PAYMENT_NOTES = (
    "Phase 1 payment (30 days × UGX 80,000 = UGX 2,400,000): upon submission and acceptance "
    "of both final BDS Manual modules and all associated training content.\n"
    "Phase 2 payment (10 days × UGX 80,000 = UGX 800,000): upon completion of 5-day BGE/DCO "
    "training co-facilitation, confirmed by Team Leader sign-off.\n"
    "Total contract value: UGX 3,200,000 (40 days × UGX 80,000/day).\n"
    "10% Withholding Tax (WHT) will be deducted at source per applicable tax regulations."
)


def fix_jacob_odur_wo(apps, schema_editor):
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')

    bge = BusinessGrowthExpert.objects.filter(name='Jacob Odur').first()
    if not bge:
        # BGE not yet created — 0092 handles the BGE creation; if it isn't there
        # this migration is running on a DB where 0092 hasn't applied yet.
        return

    wo_number = 'PRUDEV II-CONS-JO-01'

    # Remove any existing record so we can create a clean one
    WorkOrder.objects.filter(work_order_number=wo_number).delete()

    WorkOrder.objects.create(
        bge_id=bge.pk,
        work_order_number=wo_number,
        work_order_type='bds_manual_module',
        project_name='Promoting Rural Development II (PRUDEV II)',
        issue_date=datetime.date(2026, 8, 4),
        start_date=datetime.date(2026, 8, 4),
        end_date=datetime.date(2026, 9, 26),
        location='Northern Uganda (Gulu & Lira)',
        duration='40 days (4 Aug – 26 Sep 2026)',
        status='issued',
        rate_per_day=80000,
        max_days=40,
        transport_reimbursed=False,
        objective=OBJECTIVE,
        key_tasks=KEY_TASKS,
        deliverables_json=DELIVERABLES,
        payment_notes=PAYMENT_NOTES,
        team_leader_name='Stephen Maxi Opwonya',
        team_leader_position='Team Leader',
        msme_ids_snapshot=[],
    )


def reverse_fix(apps, schema_editor):
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    WorkOrder.objects.filter(work_order_number='PRUDEV II-CONS-JO-01').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0092_create_jacob_odur_consultant'),
    ]

    operations = [
        migrations.RunPython(fix_jacob_odur_wo, reverse_fix),
    ]
