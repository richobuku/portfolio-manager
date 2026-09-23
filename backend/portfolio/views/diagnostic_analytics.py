"""
Diagnostic Analytics & Progress Reporting API.

Provides endpoints for programme-level diagnostic baselines,
Cohort 1 vs Cohort 2 comparative analysis, capacity development demand,
and baseline-to-date progress tracking across MSMEs.
"""
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Avg, Sum, Q
from django.shortcuts import get_object_or_404
from collections import Counter
from decimal import Decimal

from ..models import MSME, Cohort, MSMEGrowthSnapshot, MSMEReport
from .mixins import ViewerReadOnlyMixin, _managed_groups, _is_viewer


def get_answer(data, snippet):
    if not data:
        return None
    snip = snippet.lower()
    for k, v in data.items():
        if snip in k.lower():
            return v
    return None


def is_yes(val):
    if val is None:
        return False
    s = str(val).strip().lower()
    return s in ('yes', 'true', '1', 'y', 'always', 'regularly') or s.startswith('yes')


def calc_pct(msmes, snippet):
    if not msmes:
        return 0.0
    cnt = sum(1 for m in msmes if is_yes(get_answer(m.diagnostic_data, snippet)))
    return round(cnt / len(msmes) * 100, 1)


def extract_deep_metrics(msmes, total_count):
    if not total_count or not msmes:
        return {
            'financial_health': {},
            'decent_work': {},
            'technology_digital': {},
            'environmental_sustainability': {},
            'quality_and_standards': {},
            'capacity_demand_tracks': {},
        }

    # Financial Health & Credit Access
    applied_loans = calc_pct(msmes, 'applied for a business loan in the past 3 years')
    successful_loans = calc_pct(msmes, 'SUCCESSFUL')
    outstanding_loans = calc_pct(msmes, 'outstanding business loan')
    crb_card = calc_pct(msmes, 'financial card issued by the CRB')
    audited_records = calc_pct(msmes, 'records audited/checked every year')
    statutory_tax = calc_pct(msmes, 'statutory tax returns')
    cash_reserves = calc_pct(msmes, 'cash reserves aside to keep business afloat')
    suppliers_ontime = calc_pct(msmes, 'pay its suppliers on time')
    employees_ontime = calc_pct(msmes, 'pay its employees according to agreed payment')

    # Decent Work, HR & Social Protection
    written_contracts = calc_pct(msmes, 'written employment contracts')
    harassment_policy = calc_pct(msmes, 'protect workers from harassment')
    grievance_mechanism = calc_pct(msmes, 'mechanisms for employees to complain')
    protective_wear = calc_pct(msmes, 'protective wear')
    vacation_leave = calc_pct(msmes, 'entitled to leave/vacation')
    sick_leave = calc_pct(msmes, 'entitled to sick leave')
    nssf = calc_pct(msmes, 'NSSF contributions')
    health_insurance = calc_pct(msmes, 'health insurance')
    pwd_provisions = calc_pct(msmes, 'provisions been made for employment of persons with disability')

    # Technology & Digitalization
    dedicated_it = calc_pct(msmes, 'person in charge of IT/digitisation')
    internet_conn = calc_pct(msmes, 'internet dedicated for business')
    computer_hardware = calc_pct(msmes, 'computer related hardware')
    digital_payments = calc_pct(msmes, 'digital payments using either a bank')
    momo_bank_accept = calc_pct(msmes, 'allow customers to pay it using a bank account or mobile money')
    cloud_storage = calc_pct(msmes, 'internet based storage')
    social_media = calc_pct(msmes, 'social media to promote')
    online_sales = calc_pct(msmes, 'purchased or sold any good or services online')
    inventory_software = calc_pct(msmes, 'supply chain or inventory')

    # Environmental Sustainability & Green
    env_plan = calc_pct(msmes, 'environmental management plan')
    env_permits = calc_pct(msmes, 'environmental permits/licenses')
    resource_monitoring = calc_pct(msmes, 'monitor its use of resources')
    resource_efficiency = calc_pct(msmes, 'improve resource efficiency')
    waste_reduction = calc_pct(msmes, 'reduce waste generation')
    pollution_control = calc_pct(msmes, 'reduce pollution and environmental')

    # Quality & Standards
    meets_demand = calc_pct(msmes, 'produce to meet the current market demand')
    has_logo = calc_pct(msmes, 'have a brand logo')
    ursb_trademark = calc_pct(msmes, 'trademark registered wsith URSB')
    unbs_cert = calc_pct(msmes, 'from Uganda National Bureau of Standards')
    food_health_cert = calc_pct(msmes, 'received health certificate')
    cert_of_origin = calc_pct(msmes, 'certificate of origin')
    quality_control = calc_pct(msmes, 'quality control measures')

    # Capacity Development Demand Interest
    cap_market = calc_pct(msmes, 'related to market development')
    cap_decent = calc_pct(msmes, 'related to decent working conditions')
    cap_tech = calc_pct(msmes, 'related to technology and digitalizat')
    cap_env = calc_pct(msmes, 'related to environmental sustainabili')
    cap_reg = calc_pct(msmes, 'regarding regulatory compliance')
    cap_qa = calc_pct(msmes, 'regarding quality assurance')

    return {
        'financial_health': {
            'loans_applied_pct': applied_loans,
            'loans_successful_pct': successful_loans,
            'outstanding_loans_pct': outstanding_loans,
            'crb_card_pct': crb_card,
            'audited_accounts_pct': audited_records,
            'statutory_tax_pct': statutory_tax,
            'cash_reserves_pct': cash_reserves,
            'suppliers_ontime_pct': suppliers_ontime,
            'employees_ontime_pct': employees_ontime,
        },
        'decent_work': {
            'written_contracts_pct': written_contracts,
            'harassment_policy_pct': harassment_policy,
            'grievance_mechanism_pct': grievance_mechanism,
            'protective_wear_pct': protective_wear,
            'vacation_leave_pct': vacation_leave,
            'sick_leave_pct': sick_leave,
            'nssf_pct': nssf,
            'health_insurance_pct': health_insurance,
            'pwd_provisions_pct': pwd_provisions,
        },
        'technology_digital': {
            'dedicated_it_pct': dedicated_it,
            'internet_connectivity_pct': internet_conn,
            'computer_hardware_pct': computer_hardware,
            'accepts_digital_payments_pct': digital_payments,
            'momo_bank_accept_pct': momo_bank_accept,
            'cloud_storage_pct': cloud_storage,
            'social_media_pct': social_media,
            'online_sales_pct': online_sales,
            'inventory_software_pct': inventory_software,
        },
        'environmental_sustainability': {
            'env_plan_pct': env_plan,
            'env_permits_pct': env_permits,
            'resource_monitoring_pct': resource_monitoring,
            'resource_efficiency_pct': resource_efficiency,
            'waste_reduction_pct': waste_reduction,
            'pollution_control_pct': pollution_control,
        },
        'quality_and_standards': {
            'meets_demand_pct': meets_demand,
            'has_brand_logo_pct': has_logo,
            'ursb_trademark_pct': ursb_trademark,
            'unbs_cert_pct': unbs_cert,
            'food_health_cert_pct': food_health_cert,
            'cert_of_origin_pct': cert_of_origin,
            'quality_control_pct': quality_control,
        },
        'capacity_demand_tracks': {
            'market_development_pct': cap_market,
            'decent_work_pct': cap_decent,
            'technology_digital_pct': cap_tech,
            'environmental_sustainability_pct': cap_env,
            'regulatory_compliance_pct': cap_reg,
            'quality_assurance_pct': cap_qa,
        }
    }


class DiagnosticSummaryAnalyticsView(APIView):
    """
    Returns aggregate diagnostic baseline metrics with cohort breakdown,
    sector & district distributions, deep multidimensional pillars, and capacity building demands.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        qs = MSME.objects.filter(is_active=True)

        # Apply tenant / role scoping
        group_ids = _managed_groups(user)
        if group_ids is not None:
            qs = qs.filter(programme_groups__in=group_ids).distinct()
        elif not (user.is_staff or user.is_superuser or _is_viewer(user)):
            try:
                bge = user.bge_profile
                qs = qs.filter(
                    Q(assigned_bge=bge) |
                    Q(assigned_group__members=bge) |
                    Q(co_assigned_bges=bge)
                ).distinct()
            except Exception:
                qs = qs.none()

        cohort_param = request.query_params.get('cohort')
        if cohort_param and cohort_param != 'all':
            qs = qs.filter(cohort__name__icontains=cohort_param)

        district_param = request.query_params.get('district')
        if district_param:
            qs = qs.filter(Q(district__iexact=district_param) | Q(city__iexact=district_param))

        sector_param = request.query_params.get('sector')
        if sector_param:
            qs = qs.filter(sector__iexact=sector_param)

        total_msmes = qs.count()
        diag_msmes_qs = qs.filter(diag_imported_at__isnull=False)
        diag_msmes = list(diag_msmes_qs)
        total_assessed = len(diag_msmes)

        # Cohort breakdown
        cohort_counts = {}
        for c in Cohort.objects.all():
            cnt = sum(1 for m in diag_msmes if m.cohort_id == c.id)
            if cnt > 0:
                cohort_counts[c.name] = cnt

        # Workforce baselines
        ft_male = sum(m.diag_employees_ft_male or 0 for m in diag_msmes)
        ft_female = sum(m.diag_employees_ft_female or 0 for m in diag_msmes)
        ft_youth = sum(m.diag_employees_ft_youth or 0 for m in diag_msmes)
        pt_total = sum(m.diag_employees_pt_total or 0 for m in diag_msmes)
        total_baseline_jobs = ft_male + ft_female + pt_total
        female_share = round((ft_female / (ft_male + ft_female) * 100), 1) if (ft_male + ft_female) > 0 else 0
        youth_share = round((ft_youth / (ft_male + ft_female) * 100), 1) if (ft_male + ft_female) > 0 else 0

        # Formalization & Compliance
        has_tin_count = sum(1 for m in diag_msmes if m.diag_has_tin)
        has_unbs_count = sum(1 for m in diag_msmes if m.diag_has_unbs)
        has_bank_count = sum(1 for m in diag_msmes if m.diag_has_business_bank)
        has_momo_count = sum(1 for m in diag_msmes if m.diag_has_mobile_money)

        tin_pct = round((has_tin_count / total_assessed * 100), 1) if total_assessed > 0 else 0
        unbs_pct = round((has_unbs_count / total_assessed * 100), 1) if total_assessed > 0 else 0
        bank_pct = round((has_bank_count / total_assessed * 100), 1) if total_assessed > 0 else 0
        momo_pct = round((has_momo_count / total_assessed * 100), 1) if total_assessed > 0 else 0

        # Digitalization & Innovation
        scores = [m.diag_digitalization_score for m in diag_msmes if m.diag_digitalization_score]
        avg_digital_score = round(sum(scores) / len(scores), 2) if scores else 0.0
        score_dist = {i: scores.count(i) for i in range(1, 6)}

        # Green & Sustainability
        green_msmes_count = sum(1 for m in diag_msmes if m.diag_is_green_business)
        green_pct = round((green_msmes_count / total_assessed * 100), 1) if total_assessed > 0 else 0

        green_cats_counter = Counter()
        for m in diag_msmes:
            if m.diag_green_categories:
                for gc in m.diag_green_categories:
                    green_cats_counter[gc] += 1

        # Capacity Development Demand
        cap_counter = Counter()
        for m in diag_msmes:
            if m.diag_capacity_needs:
                for cn in m.diag_capacity_needs:
                    cap_counter[cn] += 1

        # District distribution
        district_counter = Counter(m.district for m in diag_msmes if m.district)
        district_counts = [{'district': d, 'count': c} for d, c in district_counter.most_common(12)]

        # Sector distribution
        sector_counter = Counter(m.sector for m in diag_msmes if m.sector)
        sector_counts = [{'sector': s, 'count': c} for s, c in sector_counter.most_common(10)]

        # Owner Gender distribution
        male_owners = sum(1 for m in diag_msmes if (m.diag_owner_sex or '').lower() in ('male', 'm'))
        female_owners = sum(1 for m in diag_msmes if (m.diag_owner_sex or '').lower() in ('female', 'f'))

        # Revenue estimates
        valid_revenues = [float(m.annual_revenue) for m in diag_msmes if m.annual_revenue]
        total_baseline_annual_rev = sum(valid_revenues)
        avg_baseline_annual_rev = round(total_baseline_annual_rev / len(valid_revenues), 2) if valid_revenues else 0

        # Deep dimensional analytics
        deep_metrics = extract_deep_metrics(diag_msmes, total_assessed)

        return Response({
            'total_msmes': total_msmes,
            'total_assessed': total_assessed,
            'cohort_counts': cohort_counts,
            'workforce': {
                'total_baseline_jobs': total_baseline_jobs,
                'ft_male': ft_male,
                'ft_female': ft_female,
                'ft_youth': ft_youth,
                'pt_total': pt_total,
                'female_share_pct': female_share,
                'youth_share_pct': youth_share,
            },
            'formalization': {
                'has_tin_count': has_tin_count,
                'has_tin_pct': tin_pct,
                'has_unbs_count': has_unbs_count,
                'has_unbs_pct': unbs_pct,
                'has_bank_count': has_bank_count,
                'has_bank_pct': bank_pct,
                'has_mobile_money_count': has_momo_count,
                'has_mobile_money_pct': momo_pct,
            },
            'digitalization': {
                'avg_score': avg_digital_score,
                'score_distribution': score_dist,
            },
            'green': {
                'green_count': green_msmes_count,
                'green_pct': green_pct,
                'categories': dict(green_cats_counter.most_common(10)),
            },
            'capacity_needs': dict(cap_counter.most_common(10)),
            'demographics': {
                'male_owners': male_owners,
                'female_owners': female_owners,
            },
            'financials': {
                'total_annual_revenue': total_baseline_annual_rev,
                'avg_annual_revenue': avg_baseline_annual_rev,
            },
            'districts': district_counts,
            'sectors': sector_counts,
            'deep_analytics': deep_metrics,
        })


class DiagnosticCohortComparisonView(APIView):
    """
    Returns side-by-side comparative analytics for Cohort 1 vs Cohort 2.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        def get_cohort_stats(cohort_query):
            qs = MSME.objects.filter(is_active=True, diag_imported_at__isnull=False).filter(cohort__name__icontains=cohort_query)
            msmes = list(qs)
            count = len(msmes)
            if count == 0:
                return {
                    'count': 0,
                    'jobs_total': 0, 'jobs_female_pct': 0, 'jobs_youth_pct': 0,
                    'tin_pct': 0, 'unbs_pct': 0, 'bank_pct': 0,
                    'avg_digital_score': 0, 'green_pct': 0,
                    'avg_annual_rev': 0,
                    'capacity_needs': {},
                    'deep_analytics': {},
                }

            ft_m = sum(m.diag_employees_ft_male or 0 for m in msmes)
            ft_f = sum(m.diag_employees_ft_female or 0 for m in msmes)
            ft_y = sum(m.diag_employees_ft_youth or 0 for m in msmes)
            pt = sum(m.diag_employees_pt_total or 0 for m in msmes)
            tot_jobs = ft_m + ft_f + pt
            f_pct = round((ft_f / (ft_m + ft_f) * 100), 1) if (ft_m + ft_f) > 0 else 0
            y_pct = round((ft_y / (ft_m + ft_f) * 100), 1) if (ft_m + ft_f) > 0 else 0

            tin_pct = round((sum(1 for m in msmes if m.diag_has_tin) / count * 100), 1)
            unbs_pct = round((sum(1 for m in msmes if m.diag_has_unbs) / count * 100), 1)
            bank_pct = round((sum(1 for m in msmes if m.diag_has_business_bank) / count * 100), 1)
            green_pct = round((sum(1 for m in msmes if m.diag_is_green_business) / count * 100), 1)

            scores = [m.diag_digitalization_score for m in msmes if m.diag_digitalization_score]
            avg_digital = round(sum(scores) / len(scores), 2) if scores else 0.0

            revs = [float(m.annual_revenue) for m in msmes if m.annual_revenue]
            avg_rev = round(sum(revs) / len(revs), 2) if revs else 0

            cap_cnt = Counter()
            for m in msmes:
                if m.diag_capacity_needs:
                    for cn in m.diag_capacity_needs:
                        cap_cnt[cn] += 1

            deep_metrics = extract_deep_metrics(msmes, count)

            return {
                'count': count,
                'jobs_total': tot_jobs,
                'jobs_male': ft_m,
                'jobs_female': ft_f,
                'jobs_female_pct': f_pct,
                'jobs_youth': ft_y,
                'jobs_youth_pct': y_pct,
                'jobs_part_time': pt,
                'tin_pct': tin_pct,
                'unbs_pct': unbs_pct,
                'bank_pct': bank_pct,
                'avg_digital_score': avg_digital,
                'green_pct': green_pct,
                'avg_annual_rev': avg_rev,
                'capacity_needs': dict(cap_cnt.most_common(6)),
                'deep_analytics': deep_metrics,
            }

        c1_stats = get_cohort_stats('Cohort 1')
        c2_stats = get_cohort_stats('Cohort 2')

        return Response({
            'cohort_1': c1_stats,
            'cohort_2': c2_stats,
        })


class MSMEProgressDetailView(APIView):
    """
    Returns baseline-to-date progression for a single MSME:
    baseline diagnostic snapshot vs subsequent visit snapshots,
    along with full 181-question diagnostic survey data.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        msme = get_object_or_404(MSME, pk=pk)

        # Baseline snapshot
        baseline_snap = msme.growth_snapshots.filter(source='diagnostic').order_by('snapshot_date').first()
        # Latest snapshot
        latest_snap = msme.growth_snapshots.order_by('-snapshot_date', '-id').first()

        snapshots = list(msme.growth_snapshots.order_by('snapshot_date').values(
            'id', 'snapshot_date', 'source', 'annual_turnover', 'last_month_revenue',
            'employees_ft_male', 'employees_ft_female', 'employees_ft_youth',
            'employees_pt_male', 'employees_pt_female',
            'has_tin', 'has_unbs', 'has_ursb', 'has_business_bank', 'has_mobile_money',
            'digitalization_score', 'notes'
        ))

        # Calculate delta / progress
        baseline_jobs = None
        latest_jobs = None
        jobs_growth = None

        if baseline_snap:
            baseline_jobs = (baseline_snap.employees_ft_male or 0) + (baseline_snap.employees_ft_female or 0) + (baseline_snap.employees_pt_male or 0) + (baseline_snap.employees_pt_female or 0)
        if latest_snap:
            latest_jobs = (latest_snap.employees_ft_male or 0) + (latest_snap.employees_ft_female or 0) + (latest_snap.employees_pt_male or 0) + (latest_snap.employees_pt_female or 0)
        if baseline_jobs is not None and latest_jobs is not None:
            jobs_growth = latest_jobs - baseline_jobs

        return Response({
            'msme_id': msme.id,
            'msme_code': msme.msme_code,
            'business_name': msme.business_name,
            'cohort': msme.cohort.name if msme.cohort else None,
            'owner_name': msme.owner_name,
            'district': msme.district,
            'sector': msme.sector,
            'status': msme.status,
            'diag_imported_at': msme.diag_imported_at,
            'progress': {
                'baseline_jobs': baseline_jobs,
                'latest_jobs': latest_jobs,
                'jobs_growth': jobs_growth,
                'baseline_turnover': baseline_snap.annual_turnover if baseline_snap else None,
                'latest_turnover': latest_snap.annual_turnover if latest_snap else None,
                'baseline_has_tin': baseline_snap.has_tin if baseline_snap else None,
                'latest_has_tin': latest_snap.has_tin if latest_snap else None,
                'baseline_has_unbs': baseline_snap.has_unbs if baseline_snap else None,
                'latest_has_unbs': latest_snap.has_unbs if latest_snap else None,
                'baseline_has_bank': baseline_snap.has_business_bank if baseline_snap else None,
                'latest_has_bank': latest_snap.has_business_bank if latest_snap else None,
            },
            'snapshots': snapshots,
            'diagnostic_data': msme.diagnostic_data,
        })


class DiagnosticExcelExportView(APIView):
    """
    Exports the Executive Diagnostic Baseline & Progress Excel report.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.http import HttpResponse
        from ..excel_reports import generate_diagnostic_progress_excel
        from datetime import datetime

        user = request.user
        qs = MSME.objects.filter(is_active=True).select_related('cohort', 'assigned_bge').prefetch_related('growth_snapshots')

        group_ids = _managed_groups(user)
        if group_ids is not None:
            qs = qs.filter(programme_groups__in=group_ids).distinct()
        elif not (user.is_staff or user.is_superuser or _is_viewer(user)):
            try:
                bge = user.bge_profile
                qs = qs.filter(
                    Q(assigned_bge=bge) |
                    Q(assigned_group__members=bge) |
                    Q(co_assigned_bges=bge)
                ).distinct()
            except Exception:
                qs = qs.none()

        cohort_param = request.query_params.get('cohort')
        if cohort_param and cohort_param != 'all':
            qs = qs.filter(cohort__name__icontains=cohort_param)

        excel_bytes = generate_diagnostic_progress_excel(qs)

        filename = f"PRUDEV_II_Diagnostic_Progress_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
