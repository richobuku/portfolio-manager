# Generated manually on 2026-09-18

import datetime
import re
from django.db import migrations, models


OBJECTIVE = (
    "To mobilise and confirm attendance of permanently assigned MSMEs, local cooperative leaders, "
    "and Business Development Service Providers (BDSPs) across Northern Uganda (Agago, Dokolo, "
    "Lira City, Kole, Nwoya, Gulu City, Kitgum Municipality) for the PRUDEV II Market Activation Event "
    "(21 September – 2 October 2026). The BGE will conduct targeted outreach to ensure enterprise participation, "
    "clarify event objectives and logistics (meals covered, no transport refunds), provide on-site session facilitation, "
    "deliver live interactive demonstrations of practical business tools (digital marketing, online presence, POS systems, "
    "accounting/cashbooks, and financial management tools), and actively support B2B networking, supplier-buyer linkages, "
    "and commercial deal negotiations."
)

KEY_TASKS = """1. Review assigned MSME portfolios, local cooperative registers, and BDSP networks to identify and prioritize target participants for the Market Activation Event.
2. Conduct structured mobilisation outreach (direct telephone contact and physical field visits) to invite and confirm participation of MSME proprietors, enterprise managers, and cooperative leaders.
3. Clearly communicate the schedule of events, session hours (strictly 9:00 AM – 4:00 PM), nearest cluster venue, and logistical conditions: meals will be covered on the day, but transport refunds will NOT be provided to participants.
4. Prepare and submit a verified Mobilisation & Attendee Confirmation Register to the BDS Component Coordinator prior to the scheduled district activation date.
5. Provide follow-up SMS reminders and call confirmations to registered participants 24–48 hours prior to the event date with exact venue directions.
6. Attend and actively facilitate the Market Activation Event session at the designated cluster venue from 9:00 AM to 4:00 PM, coordinating entrance registration and ensuring participants sign the official PRUDEV II attendance register.
7. Deliver live, interactive demonstrations of practical business solutions and tools (digital marketing, online presence, POS, accounting systems, and financial management) to visiting entrepreneurs, applying "The Acid Test" to ensure owners grasp immediate practical benefits.
8. Actively facilitate business-to-business (B2B) networking sessions, helping MSMEs connect with potential raw material suppliers, institutional buyers, and service providers to negotiate commercial deals.
9. Capture photo documentation of participant engagements, tool demonstrations, and B2B linkage discussions.
10. Compile and submit the final post-event Mobilisation & Tool Demonstration Summary Report, original signed attendance registers, client-signed timesheets, and invoice for Team Leader approval."""

DELIVERABLES = [
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

PAYMENT_NOTES = (
    "Total estimated contract value: UGX 420,000 (7 days × UGX 60,000/day).\n"
    "Payment disbursed upon completion of mobilisation and event facilitation, submission of signed attendance registers, "
    "verified tool demonstration logs, final summary report, and approved invoice/timesheet.\n"
    "In accordance with Ugandan Income Tax regulations, professional fees are subject to 6% Withholding Tax (WHT), "
    "deducted at source by GOPA Pro GmbH.\n"
    "BGE travel will be reimbursed in accordance with approved PRUDEV II transport rates upon submission of valid travel claims. "
    "MSME participants do not receive transport refunds (meals are covered on the day)."
)


def create_market_activation_work_orders(apps, schema_editor):
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    User = apps.get_model('auth', 'User')

    admin_user = User.objects.filter(username__in=['richard', 'admin', 'Stephen']).first()
    admin_id = admin_user.pk if admin_user else None

    # Retrieve all active / approved BGEs
    bges = list(BusinessGrowthExpert.objects.filter(status__in=['approved', 'active']))
    if not bges:
        bges = list(BusinessGrowthExpert.objects.all())

    for bge in bges:
        if WorkOrder.objects.filter(bge_id=bge.pk, work_order_type='market_activation_mobilisation').exists():
            continue

        code = bge.bge_code or ''
        m = re.search(r'BGE-([A-Z0-9]+)-', code)
        short = m.group(1) if m else str(bge.pk)

        wo_number = f"PRUDEV II-MAE-{short}-01"
        seq = 1
        while WorkOrder.objects.filter(work_order_number=wo_number).exists():
            seq += 1
            wo_number = f"PRUDEV II-MAE-{short}-{seq:02d}"

        WorkOrder.objects.create(
            bge_id=bge.pk,
            work_order_number=wo_number,
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
            objective=OBJECTIVE,
            key_tasks=KEY_TASKS,
            deliverables_json=DELIVERABLES,
            payment_notes=PAYMENT_NOTES,
            team_leader_name='Stephen Maxi Opwonya',
            team_leader_position='Team Leader',
            created_by_id=admin_id,
            msme_ids_snapshot=[],
        )


def reverse_market_activation_work_orders(apps, schema_editor):
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    WorkOrder.objects.filter(work_order_type='market_activation_mobilisation').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0115_issue_jacob_bankable_work_order'),
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
                    ('other', 'Other'),
                ],
                default='msme_support',
                max_length=40,
            ),
        ),
        migrations.RunPython(create_market_activation_work_orders, reverse_market_activation_work_orders),
    ]
