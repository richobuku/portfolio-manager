"""
Management command: bge_support_summary

Prints a one-on-one support summary suitable for quarterly reporting.

Usage:
    python manage.py bge_support_summary
    python manage.py bge_support_summary --csv        # CSV output
    python manage.py bge_support_summary --all        # include draft reports
"""
from django.core.management.base import BaseCommand
from django.db.models import Count, Sum, Q
from portfolio.models import MSMEReport, BusinessGrowthExpert


VISIT_LABELS = {
    'one_on_one': 'One-on-One Visit',
    'coaching':   'Business Coaching',
    'initial':    'Initial Assessment',
    'followup':   'Follow-up Visit',
    'mentoring':  'Mentoring Session',
}


class Command(BaseCommand):
    help = 'Print BGE one-on-one support summary for quarterly reporting'

    def add_arguments(self, parser):
        parser.add_argument('--csv',  action='store_true', help='Output as CSV')
        parser.add_argument('--all',  action='store_true', help='Include draft reports')

    def handle(self, *args, **options):
        csv_mode = options['csv']
        include_all = options['all']

        qs = MSMEReport.objects.select_related('bge', 'msme')
        if not include_all:
            qs = qs.exclude(status='draft')

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.WARNING('No submitted reports found.'))
            return

        # ── Overall totals ───────────────────────────────────────────────
        self.stdout.write('\n' + '='*70)
        self.stdout.write('BGE ONE-ON-ONE SUPPORT SUMMARY')
        status_label = 'all statuses' if include_all else 'submitted & reviewed only'
        self.stdout.write(f'Reports included: {status_label}')
        self.stdout.write('='*70)

        self.stdout.write(f'\nTotal reports:           {total}')
        self.stdout.write(f'BGEs with reports:       {qs.values("bge").distinct().count()}')
        self.stdout.write(f'MSMEs reached:           {qs.values("msme").distinct().count()}')

        dates = list(qs.values_list('visit_date', flat=True).order_by('visit_date'))
        if dates:
            self.stdout.write(f'Date range:              {dates[0]}  to  {dates[-1]}')

        # ── By visit type ────────────────────────────────────────────────
        self.stdout.write('\n--- REPORTS BY VISIT TYPE ---')
        for row in qs.values('visit_type').annotate(c=Count('id')).order_by('-c'):
            label = VISIT_LABELS.get(row['visit_type'], row['visit_type'])
            self.stdout.write(f'  {label:<30} {row["c"]:>4}')

        # ── By status ────────────────────────────────────────────────────
        self.stdout.write('\n--- REPORTS BY STATUS ---')
        for row in qs.values('status').annotate(c=Count('id')).order_by('status'):
            self.stdout.write(f'  {row["status"]:<20} {row["c"]:>4}')

        # ── Employment from reports ──────────────────────────────────────
        emp = qs.aggregate(
            ft_m=Sum('employees_ft_male'),  ft_f=Sum('employees_ft_female'),
            pt_m=Sum('employees_pt_male'),  pt_f=Sum('employees_pt_female'),
        )
        ft_m = emp['ft_m'] or 0; ft_f = emp['ft_f'] or 0
        pt_m = emp['pt_m'] or 0; pt_f = emp['pt_f'] or 0
        if ft_m + ft_f + pt_m + pt_f > 0:
            self.stdout.write('\n--- EMPLOYMENT RECORDED IN REPORTS ---')
            self.stdout.write(f'  Full-time  Male: {ft_m}   Female: {ft_f}   Total: {ft_m+ft_f}')
            self.stdout.write(f'  Part-time  Male: {pt_m}   Female: {pt_f}   Total: {pt_m+pt_f}')
            self.stdout.write(f'  Grand total jobs: {ft_m+ft_f+pt_m+pt_f}')

        # ── Coaching focus areas ─────────────────────────────────────────
        focus_qs = qs.exclude(coaching_focus_area='').values('coaching_focus_area').annotate(c=Count('id')).order_by('-c')
        if focus_qs.exists():
            self.stdout.write('\n--- COACHING FOCUS AREAS ---')
            for row in focus_qs:
                self.stdout.write(f'  {row["coaching_focus_area"]:<45} {row["c"]:>4}')

        # ── Per-BGE breakdown ────────────────────────────────────────────
        self.stdout.write('\n' + '='*70)
        self.stdout.write('PER-BGE BREAKDOWN')
        self.stdout.write('='*70)

        if csv_mode:
            self.stdout.write('\nBGE Name,Reports,MSMEs Visited,Visit Types,Key Achievements,Challenges')

        for bge in BusinessGrowthExpert.objects.order_by('name'):
            bge_qs = qs.filter(bge=bge)
            n = bge_qs.count()
            if n == 0:
                continue

            msmes_visited = bge_qs.values('msme').distinct().count()
            types = bge_qs.values('visit_type').annotate(c=Count('id')).order_by('-c')
            type_str = ', '.join(
                f"{VISIT_LABELS.get(r['visit_type'], r['visit_type'])} ({r['c']})"
                for r in types
            )

            # Sample achievements and challenges (first 3 non-blank)
            achievements = list(
                bge_qs.exclude(key_achievement='')
                .values_list('msme__business_name', 'key_achievement', 'visit_date')
                .order_by('visit_date')[:3]
            )
            challenges = list(
                bge_qs.exclude(challenges_identified='')
                .values_list('msme__business_name', 'challenges_identified', 'visit_date')
                .order_by('visit_date')[:3]
            )

            if csv_mode:
                ach_str = ' | '.join(f"{m}: {a[:80]}" for m, a, _ in achievements)
                chg_str = ' | '.join(f"{m}: {c[:80]}" for m, c, _ in challenges)
                self.stdout.write(f'"{bge.name}",{n},{msmes_visited},"{type_str}","{ach_str}","{chg_str}"')
            else:
                self.stdout.write(f'\n{"─"*70}')
                self.stdout.write(f'BGE:            {bge.name}')
                self.stdout.write(f'Reports filed:  {n}')
                self.stdout.write(f'MSMEs visited:  {msmes_visited}')
                self.stdout.write(f'Visit types:    {type_str}')

                if achievements:
                    self.stdout.write('Key achievements:')
                    for msme_name, ach, date in achievements:
                        self.stdout.write(f'  [{date}] {msme_name}:')
                        self.stdout.write(f'    {ach[:300]}')

                if challenges:
                    self.stdout.write('Challenges:')
                    for msme_name, chg, date in challenges:
                        self.stdout.write(f'  [{date}] {msme_name}:')
                        self.stdout.write(f'    {chg[:300]}')

                # Support provided sample
                support_sample = bge_qs.exclude(support_provided='').values_list(
                    'msme__business_name', 'support_provided', 'visit_date', 'visit_type'
                ).order_by('visit_date')[:3]
                if support_sample:
                    self.stdout.write('Support provided:')
                    for msme_name, sup, date, vtype in support_sample:
                        label = VISIT_LABELS.get(vtype, vtype)
                        self.stdout.write(f'  [{date} | {label}] {msme_name}:')
                        self.stdout.write(f'    {sup[:300]}')

        self.stdout.write('\n' + '='*70)
        self.stdout.write('END OF REPORT')
        self.stdout.write('='*70 + '\n')
