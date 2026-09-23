# Generated for diagnostic baseline synchronization

import json
import os
from decimal import Decimal
from django.db import migrations
from django.utils import timezone


def seed_diagnostics(apps, schema_editor):
    MSME = apps.get_model('portfolio', 'MSME')
    Cohort = apps.get_model('portfolio', 'Cohort')
    MSMEGrowthSnapshot = apps.get_model('portfolio', 'MSMEGrowthSnapshot')

    fixture_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'fixtures',
        'diagnostic_baseline_data.json'
    )
    if not os.path.exists(fixture_path):
        return

    with open(fixture_path, 'r', encoding='utf-8') as f:
        records = json.load(f)

    cohort_c1, _ = Cohort.objects.get_or_create(name='Cohort 1 (Selected MSMEs)')
    cohort_c2, _ = Cohort.objects.get_or_create(name='Cohort 2 (Selected MSMEs)')

    for idx, rec in enumerate(records):
        b_name = (rec.get('business_name') or '').strip()
        if not b_name:
            continue

        c_name = rec.get('cohort_name') or ''
        cohort = cohort_c2 if '2' in c_name else (cohort_c1 if '1' in c_name else None)

        msme = MSME.objects.filter(business_name__iexact=b_name).first()
        if not msme and rec.get('phone'):
            msme = MSME.objects.filter(phone=rec.get('phone')).first()

        if not msme:
            code = rec.get('msme_code')
            if not code or MSME.objects.filter(msme_code=code).exists():
                code = f"MSME-DIAG-{idx+1:04d}"
                while MSME.objects.filter(msme_code=code).exists():
                    idx += 1000
                    code = f"MSME-DIAG-{idx+1:04d}"

            msme = MSME.objects.create(
                business_name=b_name,
                msme_code=code,
                owner_name=rec.get('owner_name') or '',
                phone=rec.get('phone') or '',
                email=rec.get('email') or '',
                district=rec.get('district') or '',
                sector=rec.get('sector') or 'Agro-processing',
                gender=rec.get('gender') or 'male',
                cohort=cohort,
                is_active=True,
            )
        elif cohort and not msme.cohort:
            msme.cohort = cohort

        # Populate diagnostic fields
        msme.diag_employees_ft_male = rec.get('diag_employees_ft_male')
        msme.diag_employees_ft_female = rec.get('diag_employees_ft_female')
        msme.diag_employees_ft_youth = rec.get('diag_employees_ft_youth')
        msme.diag_employees_pt_total = rec.get('diag_employees_pt_total')
        msme.diag_has_tin = rec.get('diag_has_tin')
        msme.diag_has_business_bank = rec.get('diag_has_business_bank')
        msme.diag_has_mobile_money = rec.get('diag_has_mobile_money')
        msme.diag_has_unbs = rec.get('diag_has_unbs')
        msme.diag_digitalization_score = rec.get('diag_digitalization_score')
        msme.diag_is_green_business = rec.get('diag_is_green_business')
        msme.diag_profit_status = rec.get('diag_profit_status')
        msme.diag_capacity_needs = rec.get('diag_capacity_needs') or []
        msme.diagnostic_data = rec.get('diagnostic_data') or {}
        msme.diag_imported_at = timezone.now()

        if rec.get('annual_revenue'):
            try:
                msme.annual_revenue = Decimal(str(rec.get('annual_revenue')))
            except Exception:
                pass

        if rec.get('diag_monthly_profit'):
            try:
                msme.diag_monthly_profit = Decimal(str(rec.get('diag_monthly_profit')))
            except Exception:
                pass

        msme.save()

        # Growth snapshot baseline
        if not MSMEGrowthSnapshot.objects.filter(msme=msme, source='diagnostic').exists():
            MSMEGrowthSnapshot.objects.create(
                msme=msme,
                snapshot_date=timezone.now().date(),
                source='diagnostic',
                annual_turnover=msme.annual_revenue,
                employees_ft_male=msme.diag_employees_ft_male,
                employees_ft_female=msme.diag_employees_ft_female,
                employees_ft_youth=msme.diag_employees_ft_youth,
                employees_pt_male=msme.diag_employees_pt_total,
                has_tin=msme.diag_has_tin,
                has_business_bank=msme.diag_has_business_bank,
                has_mobile_money=msme.diag_has_mobile_money,
                has_unbs=msme.diag_has_unbs,
                digitalization_score=msme.diag_digitalization_score,
                notes='Baseline diagnostic assessment data',
            )


def reverse_func(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0121_msme_diag_capacity_needs_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_diagnostics, reverse_func),
    ]
