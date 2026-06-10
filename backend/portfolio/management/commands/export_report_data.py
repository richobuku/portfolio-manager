"""Export all analytics data needed for the Data Update Report as JSON.

Usage:
    python manage.py export_report_data
"""
import json
from datetime import date
from django.core.management.base import BaseCommand
from portfolio.models import MSMEGrowthSnapshot, BusinessGrowthExpert, MSME


class Command(BaseCommand):
    help = 'Export analytics data for the Data Update Analytical Report.'

    def handle(self, *args, **options):
        snaps = list(MSMEGrowthSnapshot.objects.select_related(
            'msme', 'collected_by', 'msme__cohort').all())
        total_msmes = MSME.objects.count()

        # Latest snapshot per MSME
        latest = {}
        for s in snaps:
            if s.msme_id not in latest or s.snapshot_date > latest[s.msme_id].snapshot_date:
                latest[s.msme_id] = s
        L = list(latest.values())
        n = len(L)

        # Baseline (diagnostic) snapshot per MSME — earliest diagnostic record
        baseline = {}
        for s in snaps:
            if s.source == 'diagnostic':
                if s.msme_id not in baseline or s.snapshot_date < baseline[s.msme_id].snapshot_date:
                    baseline[s.msme_id] = s

        # Matched MSMEs: have a baseline AND a later, different snapshot (i.e. updated since baseline)
        matched_ids = [mid for mid in baseline if mid in latest and latest[mid].id != baseline[mid].id]

        def _emp_totals(snap_map, ids):
            ft = pt = ref = 0
            for mid in ids:
                s = snap_map[mid]
                ft  += (s.employees_ft_male or 0) + (s.employees_ft_female or 0)
                pt  += (s.employees_pt_male or 0) + (s.employees_pt_female or 0)
                ref += (s.employees_ft_refugee or 0) + (s.employees_pt_refugee or 0)
            return ft, pt, ref

        baseline_ft, baseline_pt, baseline_ref = _emp_totals(baseline, matched_ids)
        matched_curr_ft, matched_curr_pt, matched_curr_ref = _emp_totals(latest, matched_ids)

        def pct(count):
            return round(count / n * 100, 1) if n else 0

        # BGE Scorecard
        bge_data = {}
        for s in snaps:
            name = s.collected_by.name if s.collected_by else 'Unassigned'
            code = s.collected_by.bge_code if s.collected_by else ''
            if name not in bge_data:
                bge_data[name] = {'code': code, 'msmes': set(), 'snaps': 0, 'last': ''}
            bge_data[name]['msmes'].add(s.msme_id)
            bge_data[name]['snaps'] += 1
            if s.snapshot_date and str(s.snapshot_date) > bge_data[name]['last']:
                bge_data[name]['last'] = str(s.snapshot_date)

        bge_perf = sorted([
            {'name': k, 'code': v['code'], 'msmes': len(v['msmes']),
             'snaps': v['snaps'], 'last': v['last']}
            for k, v in bge_data.items()
        ], key=lambda x: -x['msmes'])

        completeness = {
            'Annual Revenue':    pct(sum(1 for s in L if s.annual_turnover not in (None, ''))),
            'Last Month Rev':    pct(sum(1 for s in L if s.last_month_revenue not in (None, ''))),
            'Total Assets':      pct(sum(1 for s in L if s.total_assets not in (None, ''))),
            'FT Employees':      pct(sum(1 for s in L if s.employees_ft_male is not None or s.employees_ft_female is not None)),
            'PT Employees':      pct(sum(1 for s in L if s.employees_pt_male is not None or s.employees_pt_female is not None)),
            'Refugee Staff':     pct(sum(1 for s in L if (s.employees_ft_refugee or 0) > 0 or (s.employees_pt_refugee or 0) > 0)),
            'TIN':               pct(sum(1 for s in L if s.has_tin is not None)),
            'URSB':              pct(sum(1 for s in L if s.has_ursb is not None)),
            'Business Bank':     pct(sum(1 for s in L if s.has_business_bank is not None)),
            'Mobile Money':      pct(sum(1 for s in L if s.has_mobile_money is not None)),
            'MOMO Pay Code':     pct(sum(1 for s in L if s.has_momo_pay is not None)),
            'SACCO':             pct(sum(1 for s in L if s.has_sacco is not None)),
            'Digital Tools':     pct(sum(1 for s in L if (s.digital_tools or []))),
            'Training Impact':   pct(sum(1 for s in L if s.training_made_changes is not None)),
            'Notes/Context':     pct(sum(1 for s in L if s.notes and s.notes.strip())),
        }

        rev_vals   = [float(s.annual_turnover) for s in L if s.annual_turnover not in (None, '')]
        asset_vals = [float(s.total_assets)    for s in L if s.total_assets    not in (None, '')]
        ft  = sum((s.employees_ft_male or 0) + (s.employees_ft_female or 0) for s in L)
        pt  = sum((s.employees_pt_male or 0) + (s.employees_pt_female or 0) for s in L)
        ref = sum((s.employees_ft_refugee or 0) + (s.employees_pt_refugee or 0) for s in L)

        tool_counts = {}
        for s in L:
            for t in (s.digital_tools or []):
                tool_counts[t] = tool_counts.get(t, 0) + 1
        top_tools = sorted(tool_counts.items(), key=lambda x: -x[1])[:12]

        tr_yes  = sum(1 for s in L if s.training_made_changes is True)
        tr_no   = sum(1 for s in L if s.training_made_changes is False)
        tr_null = n - tr_yes - tr_no
        tr_ch   = {}
        for s in L:
            for c in (s.training_changes or []):
                tr_ch[c] = tr_ch.get(c, 0) + 1
        top_tr = sorted(tr_ch.items(), key=lambda x: -x[1])[:10]

        # Baseline vs current adoption — digital tools & training-change areas,
        # restricted to MSMEs that have both a diagnostic baseline and a later update.
        def _tool_counts(snap_map, ids, field):
            counts = {}
            for mid in ids:
                s = snap_map[mid]
                for t in (getattr(s, field) or []):
                    counts[t] = counts.get(t, 0) + 1
            return counts

        base_tool_counts = _tool_counts(baseline, matched_ids, 'digital_tools')
        curr_tool_counts = _tool_counts(latest, matched_ids, 'digital_tools')
        tool_change = sorted(
            (
                {'tool': t, 'baseline': base_tool_counts.get(t, 0),
                 'current': curr_tool_counts.get(t, 0),
                 'delta': curr_tool_counts.get(t, 0) - base_tool_counts.get(t, 0)}
                for t in set(base_tool_counts) | set(curr_tool_counts)
            ),
            key=lambda x: -x['delta']
        )[:10]

        base_tr_counts = _tool_counts(baseline, matched_ids, 'training_changes')
        curr_tr_counts = _tool_counts(latest, matched_ids, 'training_changes')
        training_change = sorted(
            (
                {'area': a, 'baseline': base_tr_counts.get(a, 0),
                 'current': curr_tr_counts.get(a, 0),
                 'delta': curr_tr_counts.get(a, 0) - base_tr_counts.get(a, 0)}
                for a in set(base_tr_counts) | set(curr_tr_counts)
            ),
            key=lambda x: -x['delta']
        )[:10]

        sources = {}
        for s in snaps:
            k = s.source or 'unknown'
            sources[k] = sources.get(k, 0) + 1

        dates = [s.snapshot_date for s in snaps if s.snapshot_date]

        # Full data view — one row per MSME with latest snapshot
        msme_detail = []
        for s in sorted(L, key=lambda x: x.msme.business_name):
            msme_detail.append({
                'business_name': s.msme.business_name,
                'msme_code':     s.msme.msme_code or '',
                'bge':           s.collected_by.name if s.collected_by else 'Unassigned',
                'snapshot_date': str(s.snapshot_date),
                'source':        s.source,
                'annual_turnover':  float(s.annual_turnover) if s.annual_turnover not in (None, '') else None,
                'last_month_revenue': float(s.last_month_revenue) if s.last_month_revenue not in (None, '') else None,
                'total_assets':  float(s.total_assets) if s.total_assets not in (None, '') else None,
                'ft_employees':  (s.employees_ft_male or 0) + (s.employees_ft_female or 0),
                'pt_employees':  (s.employees_pt_male or 0) + (s.employees_pt_female or 0),
                'has_tin':   s.has_tin,
                'tin_number': s.tin_number,
                'has_ursb':  s.has_ursb,
                'ursb_reg_number': s.ursb_reg_number,
            })

        result = {
            'report_date':   str(date.today()),
            'total_msmes':   total_msmes,
            'msmes_covered': n,
            'total_snaps':   len(snaps),
            'total_bges':    BusinessGrowthExpert.objects.count(),
            'date_min':      str(min(dates)) if dates else 'N/A',
            'date_max':      str(max(dates)) if dates else 'N/A',
            'bge_perf':      bge_perf,
            'completeness':  completeness,
            'ft': ft, 'pt': pt, 'ref': ref,
            'matched_baseline_count': len(matched_ids),
            'baseline_ft':  baseline_ft,  'baseline_pt':  baseline_pt,  'baseline_ref':  baseline_ref,
            'matched_curr_ft': matched_curr_ft, 'matched_curr_pt': matched_curr_pt, 'matched_curr_ref': matched_curr_ref,
            'msme_detail': msme_detail,
            'avg_rev':    round(sum(rev_vals) / len(rev_vals)) if rev_vals else 0,
            'total_rev':  round(sum(rev_vals)) if rev_vals else 0,
            'avg_assets': round(sum(asset_vals) / len(asset_vals)) if asset_vals else 0,
            'tin': sum(1 for s in L if s.has_tin is True),
            'ursb': sum(1 for s in L if s.has_ursb is True),
            'bank': sum(1 for s in L if s.has_business_bank is True),
            'momo': sum(1 for s in L if s.has_mobile_money is True),
            'momo_pay': sum(1 for s in L if s.has_momo_pay is True),
            'sacco': sum(1 for s in L if s.has_sacco is True),
            'top_tools': top_tools,
            'tool_change': tool_change,
            'training_change': training_change,
            'tr_yes': tr_yes, 'tr_no': tr_no, 'tr_null': tr_null,
            'top_tr':   top_tr,
            'sources':  sources,
            'n': n,
        }

        self.stdout.write(json.dumps(result, indent=2))
