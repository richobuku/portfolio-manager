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

        sources = {}
        for s in snaps:
            k = s.source or 'unknown'
            sources[k] = sources.get(k, 0) + 1

        dates = [s.snapshot_date for s in snaps if s.snapshot_date]

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
            'tr_yes': tr_yes, 'tr_no': tr_no, 'tr_null': tr_null,
            'top_tr':   top_tr,
            'sources':  sources,
            'n': n,
        }

        self.stdout.write(json.dumps(result, indent=2))
