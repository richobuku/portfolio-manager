"""
Data migration: create Jacob Odur as a consultant BGE and issue his work order
(PRUDEV II-CONS-JO-01 — BDS Manual Additional Modules, 4 Aug–26 Sep 2026).

This migration is idempotent — running it twice will not create duplicates.
"""

import datetime
from django.db import migrations


def create_jacob_odur(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')

    # ── User account ─────────────────────────────────────────────────────────
    user, _ = User.objects.get_or_create(
        username='jacob.odur',
        defaults=dict(
            first_name='Jacob',
            last_name='Odur',
            email='jacob.odur@example.com',
            is_staff=False,
            is_active=True,
        ),
    )

    # ── BGE profile ───────────────────────────────────────────────────────────
    bge, _ = BusinessGrowthExpert.objects.get_or_create(
        name='Jacob Odur',
        defaults=dict(
            user=user,
            bge_code='PRUDEV II-BGE-JO-01',
            status='approved',
            is_senior=True,
            phone='',
            email='jacob.odur@example.com',
            location='Gulu',
        ),
    )

    # ── Work Order ────────────────────────────────────────────────────────────
    wo_number = 'PRUDEV II-CONS-JO-01'
    if WorkOrder.objects.filter(work_order_number=wo_number).exists():
        # Already present — just make sure it is issued
        WorkOrder.objects.filter(work_order_number=wo_number).update(
            status='issued',
            rate_per_day=80000,
        )
        return

    WorkOrder.objects.create(
        bge=bge,
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
        objective=(
            "Desk assignment to develop two additional BDS Manual modules — "
            "(1) PPDA/Procurement Module and (2) URA 2026 Tax Compliance Module — "
            "including all training content and materials for BGEs and DCOs. "
            "Additionally, co-facilitate 5 days of BGE/DCO training sessions."
        ),
        key_tasks=(
            "PHASE 1 — MODULE DEVELOPMENT (desk-based)\n"
            "1. Review existing BDS Manual structure and GIZ/GOPA content standards\n"
            "2. Develop PPDA/Procurement Module content and learning objectives\n"
            "3. Develop URA 2026 Tax Compliance Module content and learning objectives\n"
            "4. Prepare training materials, handouts and slide decks for both modules\n"
            "5. Develop facilitator guides and participant workbooks\n"
            "6. Incorporate feedback from programme team review round\n"
            "7. Finalise and submit both modules in agreed format\n"
            "\n"
            "PHASE 2 — TRAINING CO-FACILITATION\n"
            "8. Co-facilitate Day 1 of BGE/DCO Training\n"
            "9. Co-facilitate Day 2 of BGE/DCO Training\n"
            "10. Co-facilitate Day 3 of BGE/DCO Training\n"
            "11. Co-facilitate Days 4–5 of BGE/DCO Training"
        ),
        deliverables_json=[
            {"task_num": "1", "description": "Inception note and module outline (both modules)", "due_date": "2026-08-14"},
            {"task_num": "2", "description": "PPDA/Procurement Module — draft content", "due_date": "2026-08-28"},
            {"task_num": "3", "description": "URA 2026 Tax Compliance Module — draft content", "due_date": "2026-09-04"},
            {"task_num": "4", "description": "Training materials and handouts (both modules)", "due_date": "2026-09-10"},
            {"task_num": "5", "description": "Facilitator guides and participant workbooks", "due_date": "2026-09-10"},
            {"task_num": "6", "description": "Revised modules incorporating review feedback", "due_date": "2026-09-17"},
            {"task_num": "7", "description": "Final BDS Manual modules submitted (both)", "due_date": "2026-09-19"},
            {"task_num": "8", "description": "Co-facilitation of 5-day BGE/DCO Training (attendance + session notes)", "due_date": "2026-09-26"},
        ],
        payment_notes=(
            "Phase 1 payment (30 days × UGX 80,000 = UGX 2,400,000): upon submission and acceptance "
            "of both final BDS Manual modules and all associated training content.\n"
            "Phase 2 payment (10 days × UGX 80,000 = UGX 800,000): upon completion of 5-day BGE/DCO "
            "training co-facilitation, confirmed by Team Leader sign-off.\n"
            "Total contract value: UGX 3,200,000 (40 days × UGX 80,000/day).\n"
            "10% Withholding Tax (WHT) will be deducted at source per applicable tax regulations."
        ),
        team_leader_name='Stephen Maxi Opwonya',
        team_leader_position='Team Leader',
        msme_ids_snapshot=[],
    )


def reverse_jacob_odur(apps, schema_editor):
    # Reverse: remove the work order (leave user/BGE in place)
    WorkOrder = apps.get_model('portfolio', 'WorkOrder')
    WorkOrder.objects.filter(work_order_number='PRUDEV II-CONS-JO-01').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0091_add_gps_fields'),
    ]

    operations = [
        migrations.RunPython(create_jacob_odur, reverse_jacob_odur),
    ]
