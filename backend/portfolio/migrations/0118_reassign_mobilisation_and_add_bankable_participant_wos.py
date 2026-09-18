# Generated manually on 2026-09-18

import datetime
import re
from django.db import migrations, models


MAE_OBJECTIVE = (
    "To mobilise and confirm attendance of permanently assigned MSMEs, local cooperative leaders, "
    "and Business Development Service Providers (BDSPs) across Northern Uganda (Agago, Dokolo, "
    "Lira City, Kole, Nwoya, Gulu City, Kitgum Municipality) for the PRUDEV II Market Activation Event "
    "(21 September – 2 October 2026). The BGE will conduct targeted outreach to ensure enterprise participation, "
    "clarify event objectives and logistics (meals covered, no transport refunds), provide on-site session facilitation, "
    "deliver live interactive demonstrations of practical business tools (digital marketing, online presence, POS systems, "
    "accounting/cashbooks, and financial management tools), and actively support B2B networking, supplier-buyer linkages, "
    "and commercial deal negotiations."
)

MAE_KEY_TASKS = """1. Review assigned MSME portfolios, local cooperative registers, and BDSP networks to identify and prioritize target participants for the Market Activation Event.
2. Conduct structured mobilisation outreach (direct telephone contact and physical field visits) to invite and confirm participation of MSME proprietors, enterprise managers, and cooperative leaders.
3. Clearly communicate the schedule of events, session hours (strictly 9:00 AM – 4:00 PM), nearest cluster venue, and logistical conditions: meals will be covered on the day, but transport refunds will NOT be provided to participants.
4. Prepare and submit a verified Mobilisation & Attendee Confirmation Register to the BDS Component Coordinator prior to the scheduled district activation date.
5. Provide follow-up SMS reminders and call confirmations to registered participants 24–48 hours prior to the event date with exact venue directions.
6. Attend and actively facilitate the Market Activation Event session at the designated cluster venue from 9:00 AM to 4:00 PM, coordinating entrance registration and ensuring participants sign the official PRUDEV II attendance register.
7. Deliver live, interactive demonstrations of practical business solutions and tools (digital marketing, online presence, POS, accounting systems, and financial management) to visiting entrepreneurs, applying "The Acid Test" to ensure owners grasp immediate practical benefits.
8. Actively facilitate business-to-business (B2B) networking sessions, helping MSMEs connect with potential raw material suppliers, institutional buyers, and service providers to negotiate commercial deals.
9. Capture photo documentation of participant engagements, tool demonstrations, and B2B linkage discussions.
10. Compile and submit the final post-event Mobilisation & Tool Demonstration Summary Report, original signed attendance registers, client-signed timesheets, and invoice for Team Leader approval."""

MAE_DELIVERABLES = [
    {
        "task_num": "1",
        "description": "Verified Mobilisation & Attendee Confirmation Register — List of confirmed MSMEs, cooperative leaders, and BDSPs mobilised for the cluster event with contact details, business sectors, and confirmation status.",
        "due_date": "Prior to each scheduled cluster event",
        "quantitative_result": "100% of mobilised MSMEs and cooperative leaders documented with verified phone numbers, locations, and confirmed attendance.",
        "qualitative_result": "Participants understand session purpose, timing (9:00 AM – 4:00 PM), and logistics (meals provided, no transport refunds).",
        "means_of_verification": "Submitted and approved mobilisation register in PRUDEV II system.",
        "unit_rate": "",
        "payment_condition": "Prerequisite deliverable for event participation sign-off.",
    },
    {
        "task_num": "2",
        "description": "On-Site Event Facilitation, Registration & Participant Engagement — Active on-site presence supporting entrance registration, crowd guidance, and session facilitation from 9:00 AM to 4:00 PM at designated venue.",
        "due_date": "Day of scheduled event",
        "quantitative_result": "Full-day attendance (9:00 AM – 4:00 PM) verified; 100% of attending mobilised participants registered on official PRUDEV II attendance sheets.",
        "qualitative_result": "Smooth participant registration, active engagement throughout the day, and verified attendance sheets without omissions.",
        "means_of_verification": "Original signed attendance sheets countersigned by BDS Team Leader/Coordinator.",
        "unit_rate": "",
        "payment_condition": "Required milestone for daily rate verification.",
    },
    {
        "task_num": "3",
        "description": "Live Business Tool Demonstrations & B2B Matchmaking Records — Interactive demonstrations of business solutions (digital marketing, POS, accounting, financial management) and documentation of commercial supplier-buyer linkages.",
        "due_date": "Day of scheduled event",
        "quantitative_result": "Minimum 3 live tool demonstrations delivered; documented B2B linkage discussions and deal negotiations with MSMEs.",
        "qualitative_result": "Demonstrations pass \"The Acid Test\" (entrepreneurs articulate concrete tool benefits); linkage records document prospective supply/deal agreements.",
        "means_of_verification": "Demonstration activity logs, B2B linkage notes, and event photo documentation.",
        "unit_rate": "",
        "payment_condition": "Required core technical deliverable.",
    },
    {
        "task_num": "4",
        "description": "Post-Event Mobilisation Summary Report, Signed Timesheets & Invoice — Comprehensive summary report covering mobilisation numbers, tool demonstrations, B2B linkages, signed timesheets, and approved invoice.",
        "due_date": "Within 3 days of event completion",
        "quantitative_result": "1 comprehensive event summary report, 1 client-signed timesheet covering assignment days, photo evidence package, and 1 invoice.",
        "qualitative_result": "Report clearly highlights mobilisation turnout, key deals negotiated, tool adoption interest, and actionable recommendations.",
        "means_of_verification": "Submitted summary report, countersigned timesheets, photo documentation, and approved invoice.",
        "unit_rate": "",
        "payment_condition": "Final payment release contingent upon BDS Expert and Team Leader approval.",
    },
]

MAE_PAYMENT_NOTES = (
    "Total estimated contract value: UGX 420,000 (7 days × UGX 60,000/day).\n"
    "Payment disbursed upon completion of mobilisation and event facilitation, submission of signed attendance registers, "
    "verified tool demonstration logs, final summary report, and approved invoice/timesheet.\n"
    "In accordance with Ugandan Income Tax regulations, professional fees are subject to 6% Withholding Tax (WHT), "
    "deducted at source by GOPA Pro GmbH.\n"
    "BGE travel will be reimbursed in accordance with approved PRUDEV II transport rates upon submission of valid travel claims. "
    "MSME participants do not receive transport refunds (meals are covered on the day)."
)

PARTICIPANT_OBJECTIVE = (
    "To participate actively in the PRUDEV II Business Growth Expert (BGE) Capacity Building Workshop focusing on "
    "Bankable Documents for MSMEs and the structured BGE Field Feedback Review Session (29–30 September 2026). "
    "Participating BGEs will acquire practical skills in diagnosing MSME credit readiness, assembling bank-standard "
    "enterprise documentation (URSB registrations, TINs, digital books/cashbooks, and financial statements), and "
    "packaging loan applications for Financial Service Providers (FSPs). Additionally, BGEs will actively participate "
    "in the reflective field feedback session, sharing ground-level coaching bottlenecks, evaluating adherence to "
    "\"The Acid Test\" verification protocol, reviewing digital tool adoption (One Tap POS, ISM, Zoho), and formulating "
    "actionable coaching plans for their assigned MSME portfolios."
)

PARTICIPANT_KEY_TASKS = """1. Attend all scheduled sessions of the 2-day Bankable Documents & Field Feedback Workshop punctually (8:30 AM – 5:00 PM) at the designated workshop venue in Gulu/Lira.
2. Actively participate in interactive training modules on MSME bankability, credit appraisal criteria, formal registration (URSB/TIN), and financial record-keeping.
3. Complete hands-on group exercises and case study simulations, critiquing mock MSME financial profiles and structuring bank-ready loan dossiers.
4. Actively contribute to the structured BGE Field Feedback Session, presenting candid field observations regarding MSME coaching dynamics, "The Acid Test" verification standards, and digital tool adoption challenges.
5. Sign the official PRUDEV II daily attendance register for each workshop day.
6. Formulate and submit an Individual BGE Action Plan detailing how bankable document preparation and digital tools will be rolled out across assigned MSMEs."""

PARTICIPANT_DELIVERABLES = [
    {
        "task_num": "1",
        "description": "Full Attendance & Active Workshop Participation (Day 1 & Day 2) — Punctual attendance and active engagement throughout the 2-day workshop sessions (29–30 September 2026).",
        "due_date": "30 September 2026",
        "quantitative_result": "100% attendance verified across both days on official PRUDEV II attendance registers countersigned by facilitators.",
        "qualitative_result": "Active participation in plenary discussions, diagnostic simulations, and peer learning exchanges.",
        "means_of_verification": "Signed daily attendance registers countersigned by Lead BDS Facilitator and Team Leader.",
        "unit_rate": "60000",
        "payment_condition": "Mandatory requirement for professional allowance release; unexcused absence forfeits fee.",
    },
    {
        "task_num": "2",
        "description": "Bankability Simulation & Mock Enterprise Dossier Completion — Practical exercise critiquing sample MSME financial profiles, diagnosing documentation gaps, and compiling a mock bank-ready loan dossier.",
        "due_date": "30 September 2026",
        "quantitative_result": "1 completed enterprise bankability simulation worksheet and mock loan proposal dossier submitted.",
        "qualitative_result": "Demonstrated competency in evaluating MSME credit readiness, assembling required statutory records (URSB/TIN), and structuring financial statements.",
        "means_of_verification": "Completed and evaluated simulation worksheets submitted to workshop facilitators.",
        "unit_rate": "30000",
        "payment_condition": "Required technical deliverable for workshop completion sign-off.",
    },
    {
        "task_num": "3",
        "description": "Individual BGE Portfolio Action Plan & Field Rollout Strategy — Structured post-training action plan outlining how bankable document preparation and digital tools (One Tap POS, ISM) will be rolled out to assigned MSMEs.",
        "due_date": "5 October 2026",
        "quantitative_result": "1 individual action plan submitted outlining specific milestone targets for assigned MSME portfolio.",
        "qualitative_result": "Action plan is grounded in field realities, adheres to \"The Acid Test\" verification standards, and details concrete enterprise support steps.",
        "means_of_verification": "Submitted action plan approved by BDS Component Coordinator.",
        "unit_rate": "30000",
        "payment_condition": "Final milestone for closeout and fee clearance.",
    },
]

PARTICIPANT_PAYMENT_NOTES = (
    "Total estimated contract value: UGX 120,000 (2 days × UGX 60,000/day).\n"
    "Payment disbursed upon full attendance (verified by daily signed attendance registers), satisfactory completion of workshop simulation exercises, "
    "and submission of the post-training action plan.\n"
    "In accordance with Ugandan Income Tax regulations, professional fees are subject to 6% Withholding Tax (WHT), deducted at source by GOPA Pro GmbH.\n"
    "BGE travel will be reimbursed in accordance with approved PRUDEV II transport rates upon submission of valid travel claims."
)


def reassign_and_issue_work_orders(apps, schema_editor):
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    User = apps.get_model('auth', 'User')

    admin_user = User.objects.filter(username__in=['richard', 'admin', 'Stephen']).first()
    admin_id = admin_user.pk if admin_user else None

    # 1. Handle Ogwang Abel for Mobilisation Work Order
    abel = BusinessGrowthExpert.objects.filter(
        models.Q(bge_code__icontains='010T-26') | models.Q(name__icontains='Abel')
    ).first()

    if not abel:
        abel = BusinessGrowthExpert.objects.create(
            bge_code='PRUDEV II-BGE-010T-26',
            name='Ogwang Abel',
            email='abel.ogwang@gmail.com',
            phone='256784543081',
            location='Lira',
            status='approved',
        )

    # Delete all mobilisation work orders from any BGE that is NOT Ogwang Abel
    WorkOrder.objects.filter(
        work_order_type='market_activation_mobilisation'
    ).exclude(bge_id=abel.pk).delete()

    # Ensure Ogwang Abel has his mobilisation work order
    abel_mae = WorkOrder.objects.filter(
        bge_id=abel.pk,
        work_order_type='market_activation_mobilisation',
    ).first()

    if not abel_mae:
        WorkOrder.objects.create(
            bge_id=abel.pk,
            work_order_number='PRUDEV II-MAE-010T-26-01',
            work_order_type='market_activation_mobilisation',
            project_name='Promoting Rural Development II (PRUDEV II)',
            issue_date=datetime.date(2026, 9, 18),
            start_date=datetime.date(2026, 9, 21),
            end_date=datetime.date(2026, 10, 2),
            location='Northern Uganda (Agago, Dokolo, Lira, Kole, Nwoya, Gulu, Kitgum)',
            duration='2 weeks (21 Sep – 02 Oct 2026)',
            status='issued',
            rate_per_day=60000,
            max_days=7,
            transport_reimbursed=True,
            objective=MAE_OBJECTIVE,
            key_tasks=MAE_KEY_TASKS,
            deliverables_json=MAE_DELIVERABLES,
            payment_notes=MAE_PAYMENT_NOTES,
            team_leader_name='Stephen Maxi Opwonya',
            team_leader_position='Team Leader',
            created_by_id=admin_id,
            msme_ids_snapshot=[],
        )

    # 2. Handle Jacob Odur for Co-Facilitation
    jacob = BusinessGrowthExpert.objects.filter(
        models.Q(bge_code='PRUDEV II-BGE-010T-01') | models.Q(name__icontains='Jacob')
    ).first()

    if jacob:
        # Delete any accidental co-facilitation work order belonging to other BGEs
        WorkOrder.objects.filter(
            work_order_type='bge_bankable_docs_training'
        ).exclude(bge_id=jacob.pk).delete()

        # Ensure Jacob's PRUDEV II-CONS-JO-03 is issued and properly set
        WorkOrder.objects.filter(work_order_number='PRUDEV II-CONS-JO-03').update(
            work_order_type='bge_bankable_docs_training',
            status='issued'
        )

    # 3. Issue Bankable Documents Participant Work Order to all approved BGEs (excluding Jacob Odur)
    participant_bges = BusinessGrowthExpert.objects.filter(status__in=['approved', 'active'])
    if jacob:
        participant_bges = participant_bges.exclude(pk=jacob.pk)

    for bge in participant_bges:
        if WorkOrder.objects.filter(bge_id=bge.pk, work_order_type='bge_bankable_docs_participant').exists():
            continue

        code = (bge.bge_code or '').strip()
        m = re.search(r'BGE-(.+)$', code)
        short = m.group(1).replace(' ', '') if m else (code.replace('PRUDEV II-', '').replace(' ', '') if code else str(bge.pk))

        wo_num = f"PRUDEV II-PART-BD-{short}-01"
        seq = 1
        while WorkOrder.objects.filter(work_order_number=wo_num).exists():
            seq += 1
            wo_num = f"PRUDEV II-PART-BD-{short}-{seq:02d}"

        WorkOrder.objects.create(
            bge_id=bge.pk,
            work_order_number=wo_num,
            work_order_type='bge_bankable_docs_participant',
            project_name='Promoting Rural Development II (PRUDEV II)',
            issue_date=datetime.date(2026, 9, 18),
            start_date=datetime.date(2026, 9, 29),
            end_date=datetime.date(2026, 9, 30),
            location='Northern Uganda (Gulu & Lira)',
            duration='2 days (29–30 September 2026)',
            status='issued',
            rate_per_day=60000,
            max_days=2,
            transport_reimbursed=True,
            objective=PARTICIPANT_OBJECTIVE,
            key_tasks=PARTICIPANT_KEY_TASKS,
            deliverables_json=PARTICIPANT_DELIVERABLES,
            payment_notes=PARTICIPANT_PAYMENT_NOTES,
            team_leader_name='Stephen Maxi Opwonya',
            team_leader_position='Team Leader',
            created_by_id=admin_id,
            msme_ids_snapshot=[],
        )


def reverse_reassign_work_orders(apps, schema_editor):
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    WorkOrder.objects.filter(work_order_type='bge_bankable_docs_participant').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0117_add_bankable_docs_training_work_order_type'),
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
                    ('bge_bankable_docs_training', 'BGE Co-Facilitator — Bankable Documents & Field Feedback Workshop'),
                    ('bge_bankable_docs_participant', 'BGE Participant — Bankable Documents & Field Feedback Workshop'),
                    ('other', 'Other'),
                ],
                default='msme_support',
                max_length=40,
            ),
        ),
        migrations.RunPython(reassign_and_issue_work_orders, reverse_reassign_work_orders),
    ]
