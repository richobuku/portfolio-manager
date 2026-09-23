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


def build_diagnostic_metrics(qs):
    """
    Computes a comprehensive, multi-dimensional analysis from diagnostic data
    and MSME baseline records.
    """
    total = qs.count()
    if total == 0:
        return {
            'total_assessed': 0,
            'workforce': {'total_baseline_jobs': 0, 'ft_male': 0, 'ft_female': 0, 'ft_youth': 0, 'pt_total': 0, 'female_share_pct': 0, 'youth_share_pct': 0},
            'formalization': {'has_tin_pct': 0, 'has_unbs_pct': 0, 'has_bank_pct': 0, 'has_mobile_money_pct': 0, 'has_brand_logo_pct': 0, 'has_trademark_pct': 0, 'has_association_pct': 0},
            'financial_health': {'profit_breakdown': {}, 'avg_monthly_profit': 0, 'revenue_trend': {}, 'cost_trend': {}, 'bookkeeping': {}, 'audited_pct': 0, 'loan_applied_pct': 0, 'loan_outstanding_pct': 0, 'cash_reserves_pct': 0, 'reserves_duration': {}},
            'operations_quality': {'unbs_pct': 0, 'qc_measures_pct': 0, 'food_health_pct': 0, 'hsseq_pct': 0, 'innovation_2yr_pct': 0, 'meets_demand_pct': 0},
            'digitalization': {'avg_score': 0, 'score_distribution': {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}, 'has_it_staff_pct': 0, 'social_media_pct': 0, 'social_platforms': {}, 'digital_payments_pct': 0, 'cloud_storage_pct': 0, 'data_decision_pct': 0},
            'green': {'green_count': 0, 'green_pct': 0, 'categories': {}, 'env_plan_pct': 0, 'resource_monitor_pct': 0, 'waste_systems_pct': 0},
            'governance': {'legal_forms': {}, 'owner_gender': {'male': 0, 'female': 0}},
            'capacity_needs': {},
            'districts': [],
            'sectors': [],
            'financials': {'total_annual_revenue': 0, 'avg_annual_revenue': 0},
        }

    # Workforce
    ft_male = sum(m.diag_employees_ft_male or 0 for m in qs)
    ft_female = sum(m.diag_employees_ft_female or 0 for m in qs)
    ft_youth = sum(m.diag_employees_ft_youth or 0 for m in qs)
    pt_total = sum(m.diag_employees_pt_total or 0 for m in qs)
    tot_jobs = ft_male + ft_female + pt_total
    f_share = round((ft_female / (ft_male + ft_female) * 100), 1) if (ft_male + ft_female) > 0 else 0
    y_share = round((ft_youth / (ft_male + ft_female) * 100), 1) if (ft_male + ft_female) > 0 else 0

    # Counters and Accumulators
    profit_counts = Counter()
    monthly_profits = []
    rev_trend = Counter()
    cost_trend = Counter()
    bookkeeping = Counter()
    audited = 0
    loan_app = 0
    loan_out = 0
    cash_res = 0
    res_dur = Counter()

    unbs = 0
    qc_in_place = 0
    food_health = 0
    hsseq = 0
    innov_2yr = 0
    meets_demand = 0
    brand_logo = 0
    trademark = 0
    assoc = 0
    legal_forms = Counter()

    it_person = 0
    social_media = 0
    social_plats = Counter()
    cloud_store = 0
    data_decisions = 0
    digital_pay = 0

    env_plan = 0
    resource_mon = 0
    waste_sys = 0
    green_cats = Counter()
    cap_needs = Counter()

    male_owners = 0
    female_owners = 0

    valid_revs = []

    for m in qs:
        d = m.diagnostic_data or {}

        if m.annual_revenue:
            try:
                valid_revs.append(float(m.annual_revenue))
            except Exception:
                pass

        if m.diag_monthly_profit:
            try:
                monthly_profits.append(float(m.diag_monthly_profit))
            except Exception:
                pass

        # Owner Gender
        o_sex = (m.diag_owner_sex or d.get('Sex of main founder/owner: add N/A and not known if shareholders are not persons. Separate founder from current owner') or '').strip().lower()
        if o_sex in ['female', 'f']:
            female_owners += 1
        elif o_sex in ['male', 'm']:
            male_owners += 1

        # Profit status
        p = d.get('Considering all sources of income in the past 12 months, did your business generate a profit') or m.diag_profit_status
        if p:
            p_clean = 'Profitable' if 'yes' in str(p).lower() else ('Loss / Break-even' if 'no' in str(p).lower() else str(p).strip())
            profit_counts[p_clean] += 1

        # Trends
        rt = d.get('Overall, how has business revenue/turnover changed in the past 12 months?')
        if rt:
            rev_trend[str(rt).strip()] += 1

        ct = d.get('Overall, how did the costs develop over the past 12 months?')
        if ct:
            cost_trend[str(ct).strip()] += 1

        # Books
        bk = d.get('Does the business keep financial accounts?')
        if bk:
            bk_str = str(bk).strip()
            if 'electronically' in bk_str.lower():
                bookkeeping['Electronic Software'] += 1
            elif 'paper' in bk_str.lower():
                bookkeeping['Manual / Paper Books'] += 1
            elif 'no' in bk_str.lower():
                bookkeeping['No Formal Records'] += 1
            else:
                bookkeeping[bk_str] += 1

        aud = d.get('If yes, are your financial records audited/checked every year by an accredited accountant?')
        if aud and 'yes' in str(aud).lower():
            audited += 1

        # Loan
        lapp = d.get('Have you applied for a business loan in the past 3 years, including from individuals?  (NOTE: NOT FOR PERSONAL OR HOUSEHOLD USE. ONLY FOR PURPOSES OF THE BUSINESS)')
        if lapp and 'yes' in str(lapp).lower():
            loan_app += 1

        lout = d.get('Do you have an outstanding business loan?')
        if lout and 'yes' in str(lout).lower():
            loan_out += 1

        # Cash reserves
        cres = d.get('Does the business have cash reserves aside to keep business afloat in case of a crisis?')
        if cres and 'yes' in str(cres).lower():
            cash_res += 1

        cdur = d.get('If YES, how long would these cash reserves be able to keep your business afloat in case of a major economic crisis?')
        if cdur:
            res_dur[str(cdur).strip()] += 1

        # Quality & Operations
        if m.diag_has_unbs:
            unbs += 1

        qc = d.get('What quality control measures does the business have?')
        if qc and str(qc).strip().lower() not in ['none', 'no', 'n/a', '']:
            qc_in_place += 1

        fh = d.get('If the business is into food processing, has the business received health certificate for any of its products')
        if fh and 'yes' in str(fh).lower():
            food_health += 1

        hsq = d.get('Is the MSME familiar with the legal aspects in HSSEQ? Kindly define Health, Safety, Security, Environment & Quality (HSSEQ)')
        if hsq and 'yes' in str(hsq).lower():
            hsseq += 1

        inv = d.get('During the last two years, has the business introduced any new or significantly improved processes or product/service offering? (e.g. methods of manufacturing products/offering services, logistics...')
        if inv and 'yes' in str(inv).lower():
            innov_2yr += 1

        md = d.get('Is the business able to produce to meet the current market demand for your products/service?')
        if md and 'yes' in str(md).lower():
            meets_demand += 1

        bl = d.get('Do you have a brand logo?')
        if bl and 'yes' in str(bl).lower():
            brand_logo += 1

        tm = d.get('Do you have a  trademark registered wsith URSB?')
        if tm and 'yes' in str(tm).lower():
            trademark += 1

        ass = d.get('Is this business affiliated to any association (such as UMA; USSIA, FSME, PSFU, UNFFE, BDSPN, UNEDI, Coop360 Network etc)')
        if ass and 'yes' in str(ass).lower():
            assoc += 1

        lf = d.get('Legal form of business')
        if lf:
            lf_str = str(lf).strip()
            if 'shares' in lf_str.lower() or 'limited by shares' in lf_str.lower():
                legal_forms['Limited by Shares'] += 1
            elif 'guarantee' in lf_str.lower():
                legal_forms['Limited by Guarantee'] += 1
            elif 'sole' in lf_str.lower():
                legal_forms['Sole Proprietorship'] += 1
            elif 'partnership' in lf_str.lower():
                legal_forms['Partnership'] += 1
            elif 'cooperative' in lf_str.lower():
                legal_forms['Cooperative'] += 1
            else:
                legal_forms[lf_str] += 1

        # Digital
        itp = d.get('Does the   business have a person in charge of IT/digitisation?')
        if itp and 'yes' in str(itp).lower():
            it_person += 1

        sm = d.get('Does the business use social media to promote its products/services?')
        if sm and 'yes' in str(sm).lower():
            social_media += 1

        smp = d.get('Which social media platform do you use?')
        if smp:
            for p_item in str(smp).replace(';', ',').split(','):
                p_clean = p_item.strip()
                if p_clean and p_clean.lower() not in ['none', 'no']:
                    social_plats[p_clean.capitalize()] += 1

        cs = d.get('Does the business use internet based storage to keep the data?')
        if cs and 'yes' in str(cs).lower():
            cloud_store += 1

        dd = d.get('Does the business store and refer to data to inform decision making?')
        if dd and 'yes' in str(dd).lower():
            data_decisions += 1

        dp = d.get('Does the business make or receive digital payments using either a bank account or mobile money')
        if dp and 'yes' in str(dp).lower():
            digital_pay += 1

        # Environment
        ep = d.get('Does the MSME have an environmental management plan to address the impacts? Eg. how to reduce the business\' negative impact on the environment')
        if ep and 'yes' in str(ep).lower():
            env_plan += 1

        rm = d.get('Does the business monitor its use of resources such as water, energy, soil, land, trees etc?')
        if rm and 'yes' in str(rm).lower():
            resource_mon += 1

        ws = d.get('Has the business put in place systems to reduce waste generation and manage waste?')
        if ws and 'yes' in str(ws).lower():
            waste_sys += 1

        if m.diag_green_categories:
            for gc in m.diag_green_categories:
                green_cats[gc] += 1

        if m.diag_capacity_needs:
            for cn in m.diag_capacity_needs:
                cap_needs[cn] += 1

    # Digital score distribution
    scores = [m.diag_digitalization_score for m in qs if m.diag_digitalization_score]
    avg_digital_score = round(sum(scores) / len(scores), 2) if scores else 0.0
    score_dist = {i: scores.count(i) for i in range(1, 6)}

    # Formalization counts
    has_tin_count = qs.filter(diag_has_tin=True).count()
    has_bank_count = qs.filter(diag_has_business_bank=True).count()
    has_momo_count = qs.filter(diag_has_mobile_money=True).count()
    green_msmes_count = qs.filter(diag_is_green_business=True).count()

    total_ann_rev = sum(valid_revs)
    avg_ann_rev = round(total_ann_rev / len(valid_revs), 2) if valid_revs else 0
    avg_mo_prof = round(sum(monthly_profits) / len(monthly_profits), 2) if monthly_profits else 0

    district_counts = qs.values('district').annotate(count=Count('id')).order_by('-count')[:12]
    sector_counts = qs.values('sector').annotate(count=Count('id')).order_by('-count')

    return {
        'total_assessed': total,
        'workforce': {
            'total_baseline_jobs': tot_jobs,
            'ft_male': ft_male,
            'ft_female': ft_female,
            'ft_youth': ft_youth,
            'pt_total': pt_total,
            'female_share_pct': f_share,
            'youth_share_pct': y_share,
        },
        'formalization': {
            'has_tin_count': has_tin_count,
            'has_tin_pct': round((has_tin_count / total * 100), 1),
            'has_unbs_count': unbs,
            'has_unbs_pct': round((unbs / total * 100), 1),
            'has_bank_count': has_bank_count,
            'has_bank_pct': round((has_bank_count / total * 100), 1),
            'has_mobile_money_count': has_momo_count,
            'has_mobile_money_pct': round((has_momo_count / total * 100), 1),
            'has_brand_logo_pct': round((brand_logo / total * 100), 1),
            'has_trademark_pct': round((trademark / total * 100), 1),
            'has_association_pct': round((assoc / total * 100), 1),
        },
        'financial_health': {
            'profit_breakdown': dict(profit_counts),
            'avg_monthly_profit': avg_mo_prof,
            'revenue_trend': dict(rev_trend),
            'cost_trend': dict(cost_trend),
            'bookkeeping': dict(bookkeeping),
            'audited_pct': round((audited / total * 100), 1),
            'loan_applied_pct': round((loan_app / total * 100), 1),
            'loan_outstanding_pct': round((loan_out / total * 100), 1),
            'cash_reserves_pct': round((cash_res / total * 100), 1),
            'reserves_duration': dict(res_dur),
        },
        'operations_quality': {
            'unbs_pct': round((unbs / total * 100), 1),
            'qc_measures_pct': round((qc_in_place / total * 100), 1),
            'food_health_pct': round((food_health / total * 100), 1),
            'hsseq_pct': round((hsseq / total * 100), 1),
            'innovation_2yr_pct': round((innov_2yr / total * 100), 1),
            'meets_demand_pct': round((meets_demand / total * 100), 1),
        },
        'digitalization': {
            'avg_score': avg_digital_score,
            'score_distribution': score_dist,
            'has_it_staff_pct': round((it_person / total * 100), 1),
            'social_media_pct': round((social_media / total * 100), 1),
            'social_platforms': dict(social_plats.most_common(6)),
            'digital_payments_pct': round((digital_pay / total * 100), 1),
            'cloud_storage_pct': round((cloud_store / total * 100), 1),
            'data_decision_pct': round((data_decisions / total * 100), 1),
        },
        'green': {
            'green_count': green_msmes_count,
            'green_pct': round((green_msmes_count / total * 100), 1),
            'categories': dict(green_cats.most_common(10)),
            'env_plan_pct': round((env_plan / total * 100), 1),
            'resource_monitor_pct': round((resource_mon / total * 100), 1),
            'waste_systems_pct': round((waste_sys / total * 100), 1),
        },
        'governance': {
            'legal_forms': dict(legal_forms),
            'owner_gender': {
                'male': male_owners,
                'female': female_owners,
            },
        },
        'capacity_needs': dict(cap_needs.most_common(12)),
        'financials': {
            'total_annual_revenue': total_ann_rev,
            'avg_annual_revenue': avg_ann_rev,
        },
        'districts': list(district_counts),
        'sectors': list(sector_counts),
    }


class DiagnosticSummaryAnalyticsView(APIView):
    """
    Returns aggregate diagnostic baseline metrics with cohort breakdown,
    sector & district distributions, and comprehensive thematic analysis.
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
        diag_msmes = qs.filter(diag_imported_at__isnull=False)

        # Cohort breakdown
        cohort_counts = {}
        for c in Cohort.objects.all():
            cnt = diag_msmes.filter(cohort=c).count()
            if cnt > 0:
                cohort_counts[c.name] = cnt

        res_data = build_diagnostic_metrics(diag_msmes)
        res_data['total_msmes'] = total_msmes
        res_data['cohort_counts'] = cohort_counts

        return Response(res_data)


class DiagnosticCohortComparisonView(APIView):
    """
    Returns side-by-side comparative analytics for Cohort 1 vs Cohort 2.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        c1_qs = MSME.objects.filter(is_active=True, diag_imported_at__isnull=False, cohort__name__icontains='1')
        c2_qs = MSME.objects.filter(is_active=True, diag_imported_at__isnull=False, cohort__name__icontains='2')

        c1_metrics = build_diagnostic_metrics(c1_qs)
        c2_metrics = build_diagnostic_metrics(c2_qs)

        return Response({
            'cohort_1': c1_metrics,
            'cohort_2': c2_metrics,
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
        latest_snap = msme.growth_snapshots.order_by('-snapshot_date').first()

        # All snapshots
        snapshots = list(msme.growth_snapshots.order_by('snapshot_date').values(
            'id', 'snapshot_date', 'source', 'annual_turnover', 'monthly_turnover',
            'employees_ft_male', 'employees_ft_female', 'employees_ft_youth',
            'employees_pt_male', 'employees_pt_female', 'employees_ft_refugee',
            'has_tin', 'has_ursb', 'has_business_bank', 'has_mobile_money',
            'has_unbs', 'digitalization_score', 'is_green_business', 'notes'
        ))

        # Recent coaching visit reports
        visit_reports = list(msme.reports.order_by('-visit_date')[:5].values(
            'id', 'visit_date', 'visit_type', 'coaching_focus_area', 'general_progress_assessment'
        ))

        return Response({
            'msme_id': msme.id,
            'msme_code': msme.msme_code,
            'business_name': msme.business_name,
            'owner_name': msme.owner_name,
            'district': msme.district,
            'sector': msme.sector,
            'cohort': msme.cohort.name if msme.cohort else None,
            'assigned_bge': msme.assigned_bge.name if msme.assigned_bge else None,
            'diagnostic_baseline': {
                'imported_at': msme.diag_imported_at,
                'digitalization_score': msme.diag_digitalization_score,
                'monthly_profit': msme.diag_monthly_profit,
                'profit_status': msme.diag_profit_status,
                'capacity_needs': msme.diag_capacity_needs,
                'green_categories': msme.diag_green_categories,
                'diagnostic_data': msme.diagnostic_data,
            },
            'baseline_snapshot': {
                'date': baseline_snap.snapshot_date if baseline_snap else None,
                'turnover': baseline_snap.annual_turnover if baseline_snap else msme.annual_revenue,
                'ft_jobs': ((baseline_snap.employees_ft_male or 0) + (baseline_snap.employees_ft_female or 0)) if baseline_snap else ((msme.diag_employees_ft_male or 0) + (msme.diag_employees_ft_female or 0)),
                'youth_jobs': baseline_snap.employees_ft_youth if baseline_snap else msme.diag_employees_ft_youth,
                'has_tin': baseline_snap.has_tin if baseline_snap else msme.diag_has_tin,
                'has_unbs': baseline_snap.has_unbs if baseline_snap else msme.diag_has_unbs,
                'has_bank': baseline_snap.has_business_bank if baseline_snap else msme.diag_has_business_bank,
            } if baseline_snap or msme.diag_imported_at else None,
            'latest_snapshot': {
                'date': latest_snap.snapshot_date if latest_snap else None,
                'turnover': latest_snap.annual_turnover if latest_snap else None,
                'ft_jobs': ((latest_snap.employees_ft_male or 0) + (latest_snap.employees_ft_female or 0)) if latest_snap else None,
                'youth_jobs': latest_snap.employees_ft_youth if latest_snap else None,
                'has_tin': latest_snap.has_tin if latest_snap else None,
                'has_unbs': latest_snap.has_unbs if latest_snap else None,
                'has_bank': latest_snap.has_business_bank if latest_snap else None,
            } if latest_snap else None,
            'snapshots_history': snapshots,
            'recent_visit_reports': visit_reports,
        })


class DiagnosticExcelExportView(APIView):
    """
    Exports comprehensive diagnostic baseline & progress workbook as XLSX.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.http import HttpResponse
        from ..excel_reports import generate_diagnostic_progress_excel

        cohort_param = request.query_params.get('cohort')
        qs = MSME.objects.filter(is_active=True, diag_imported_at__isnull=False)
        if cohort_param and cohort_param != 'all':
            qs = qs.filter(cohort__name__icontains=cohort_param)

        excel_data = generate_diagnostic_progress_excel(qs)

        filename = f"PRUDEV_MSME_Diagnostic_Progress_Report.xlsx"
        response = HttpResponse(
            excel_data,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
