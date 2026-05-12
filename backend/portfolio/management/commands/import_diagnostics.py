"""
Import PRUDEV II MSME diagnostic baseline data.

Handles two Excel formats automatically:
  • Survey tool output  (header row 0 starts with 'ID', col 8 = 'Name of enterprise:')
  • Categorised output  (original format with STATUS column at 163)

Usage:
    python manage.py import_diagnostics <path-to-excel>
    python manage.py import_diagnostics <path-to-excel> --dry-run
"""
import re
from datetime import date

import openpyxl
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from portfolio.models import MSME, MSMEGrowthSnapshot


# ── Column maps ───────────────────────────────────────────────────────────────

# Original "Categorised Output" file column indices
CAT = dict(
    BUSINESS_NAME=2, OWNER_CONTACT=6, BUSINESS_PHONE=15,
    OWNER_SEX=7, OWNER_AGE=9, OWNER_EDUCATION=10, YEARS_OPERATING=39,
    FT_MALE=46, FT_FEMALE=47, PT_MALE=48, PT_FEMALE=49,
    HAS_TIN=62, HAS_UNBS=73, TURNOVER=74, TOTAL_ASSETS=75,
    HAS_BUSINESS_BANK=79, HAS_MOBILE_MONEY=84,
    DISTRICT=162, STATUS=163,
    GREEN_COLS=[
        (55, 'Renewable energies (solar, wind, etc.)'),
        (56, 'Energy-saving technology'),
        (57, 'Organic / sustainable agriculture or fisheries'),
        (58, 'Sustainable forestry'),
        (59, 'Recycling'),
        (60, 'Eco-tourism'),
    ],
)

# Survey tool output column indices (PRUDEV II MSME BUSINESS DIAGNOSTICS TOOL)
SRV = dict(
    BUSINESS_NAME=8, BUSINESS_PHONE=16,
    OWNER_SEX=20, OWNER_AGE=21, YEARS_OPERATING=31,
    FT_TOTAL=85, FT_MALE=86, FT_FEMALE=87, PT_TOTAL=89,
    TURNOVER=94,
    HAS_BUSINESS_BANK=107,
    HAS_MOBILE_MONEY=144,
    HAS_TIN=167,
    HAS_UNBS=168,
    GREEN=36,
    DISTRICT=10,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

STRIP_WORDS = {'limited', 'ltd', 'co.', 'uganda', 'u)', '(u)', 'smc',
               'co-operative', 'cooperative', 'lted', 'ug)', '(ug)'}

def _normalize(name):
    if not name:
        return ''
    s = str(name).lower().strip()
    for w in STRIP_WORDS:
        s = s.replace(w, ' ')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def _clean_phone(value):
    if not value:
        return ''
    return re.sub(r'[^0-9]', '', str(value))[-9:]

def _parse_bool(value):
    if value is None:
        return None
    return str(value).strip().lower() in ('yes', '1', 'true', 'y')

def _parse_int(value, non_negative=False):
    if value is None:
        return None
    try:
        result = int(float(str(value).replace(',', '').strip()))
        if non_negative and result < 0:
            return None
        return result
    except (ValueError, TypeError):
        return None


def _detect_format(header_row):
    """Return 'survey' or 'categorised' based on the first header row."""
    if header_row and str(header_row[0]).strip() == 'ID':
        return 'survey'
    return 'categorised'


def _extract_survey_row(row):
    """Pull diagnostic fields from a survey-tool row. Returns a dict."""
    green_raw = str(row[SRV['GREEN']] or '').strip()
    is_green = bool(green_raw) and 'does not fall' not in green_raw.lower()
    categories = []
    if is_green:
        # Values are semicolon-separated category names
        for part in green_raw.split(';'):
            part = part.strip()
            if part:
                categories.append(part)

    return dict(
        business_name     = str(row[SRV['BUSINESS_NAME']] or '').strip(),
        phone             = _clean_phone(row[SRV['BUSINESS_PHONE']]),
        district          = str(row[SRV['DISTRICT']] or '').strip(),
        owner_sex         = str(row[SRV['OWNER_SEX']] or '').strip(),
        owner_age         = _parse_int(row[SRV['OWNER_AGE']]),
        owner_education   = '',
        years_operating   = str(row[SRV['YEARS_OPERATING']] or '').strip(),
        annual_turnover   = str(row[SRV['TURNOVER']] or '').strip(),
        total_assets      = '',
        ft_male           = _parse_int(row[SRV['FT_MALE']], non_negative=True),
        ft_female         = _parse_int(row[SRV['FT_FEMALE']], non_negative=True),
        # Survey file has only total part-time, no gender split
        pt_male           = None,
        pt_female         = None,
        has_tin           = _parse_bool(row[SRV['HAS_TIN']]),
        has_unbs          = _parse_bool(row[SRV['HAS_UNBS']]),
        has_business_bank = _parse_bool(row[SRV['HAS_BUSINESS_BANK']]),
        has_mobile_money  = _parse_bool(row[SRV['HAS_MOBILE_MONEY']]),
        is_green          = is_green,
        green_categories  = categories,
    )


def _extract_cat_row(row):
    """Pull diagnostic fields from a categorised-output row. Returns a dict."""
    categories = [label for col, label in CAT['GREEN_COLS'] if row[col]]
    is_green   = bool(categories)
    return dict(
        business_name     = str(row[CAT['BUSINESS_NAME']] or '').strip(),
        phone             = _clean_phone(row[CAT['BUSINESS_PHONE']]),
        district          = str(row[CAT['DISTRICT']] or '').strip(),
        owner_sex         = str(row[CAT['OWNER_SEX']] or '').strip(),
        owner_age         = _parse_int(row[CAT['OWNER_AGE']]),
        owner_education   = str(row[CAT['OWNER_EDUCATION']] or '').strip(),
        years_operating   = str(row[CAT['YEARS_OPERATING']] or '').strip(),
        annual_turnover   = str(row[CAT['TURNOVER']] or '').strip(),
        total_assets      = str(row[CAT['TOTAL_ASSETS']] or '').strip(),
        ft_male           = _parse_int(row[CAT['FT_MALE']],   non_negative=True),
        ft_female         = _parse_int(row[CAT['FT_FEMALE']], non_negative=True),
        pt_male           = _parse_int(row[CAT['PT_MALE']],   non_negative=True),
        pt_female         = _parse_int(row[CAT['PT_FEMALE']], non_negative=True),
        has_tin           = _parse_bool(row[CAT['HAS_TIN']]),
        has_unbs          = _parse_bool(row[CAT['HAS_UNBS']]),
        has_business_bank = _parse_bool(row[CAT['HAS_BUSINESS_BANK']]),
        has_mobile_money  = _parse_bool(row[CAT['HAS_MOBILE_MONEY']]),
        is_green          = is_green,
        green_categories  = categories,
    )


# ── Main command ──────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = 'Import PRUDEV II diagnostic baseline into matched MSME records'

    def add_arguments(self, parser):
        parser.add_argument('excel_path', help='Path to the diagnostics Excel file')
        parser.add_argument('--dry-run', action='store_true',
                            help='Show matches without writing anything')
        parser.add_argument('--snapshot-date', default=None,
                            help='ISO date YYYY-MM-DD for the baseline snapshot (default: today)')

    def handle(self, *args, **options):
        path      = options['excel_path']
        dry_run   = options['dry_run']
        snap_date = options['snapshot_date']

        if snap_date:
            try:
                snap_date = date.fromisoformat(snap_date)
            except ValueError:
                raise CommandError(f'Invalid date: {snap_date}')
        else:
            snap_date = date.today()

        self.stdout.write(f'Loading {path} …')
        try:
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        except Exception as exc:
            raise CommandError(f'Could not open file: {exc}')

        ws       = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
        wb.close()

        if len(all_rows) < 2:
            raise CommandError('File appears empty.')

        fmt = _detect_format(all_rows[0])
        self.stdout.write(f'  Detected format: {fmt}')

        if fmt == 'survey':
            data_rows = all_rows[1:]   # all rows — no status filter
            extract   = _extract_survey_row
            name_col  = SRV['BUSINESS_NAME']
            phone_col = SRV['BUSINESS_PHONE']
        else:
            data_rows = [r for r in all_rows[1:] if r[CAT['STATUS']] == 'Selected for Review']
            extract   = _extract_cat_row
            name_col  = CAT['BUSINESS_NAME']
            phone_col = CAT['BUSINESS_PHONE']

        self.stdout.write(f'  {len(data_rows)} candidate rows in Excel')

        # Build lookup indices
        excel_by_norm  = {}
        excel_by_phone = {}
        for row in data_rows:
            d = extract(row)
            norm = _normalize(d['business_name'])
            if norm and norm not in excel_by_norm:
                excel_by_norm[norm] = d
            ph = d['phone']
            if ph and len(ph) >= 7 and ph not in excel_by_phone:
                excel_by_phone[ph] = d

        db_msmes  = list(MSME.objects.all())
        self.stdout.write(f'  {len(db_msmes)} MSMEs in the system')

        matched   = []
        unmatched = []

        for msme in db_msmes:
            sys_norm = _normalize(msme.business_name)
            d, method = None, None

            if sys_norm in excel_by_norm:
                d, method = excel_by_norm[sys_norm], 'name-exact'
            else:
                if len(sys_norm) >= 6:
                    for ex_norm, ex_d in excel_by_norm.items():
                        if len(ex_norm) >= 6 and (sys_norm in ex_norm or ex_norm in sys_norm):
                            d, method = ex_d, 'name-partial'
                            break

            if d is None and msme.phone:
                ph = _clean_phone(msme.phone)
                if ph and len(ph) >= 7 and ph in excel_by_phone:
                    candidate = excel_by_phone[ph]
                    ex_words  = set(_normalize(candidate['business_name']).split())
                    sys_words = set(sys_norm.split())
                    if {w for w in sys_words & ex_words if len(w) > 3}:
                        d, method = candidate, 'phone'

            if d is None:
                unmatched.append(msme.business_name)
            else:
                matched.append((msme, d, method))

        self.stdout.write(
            f'\n  Matched:   {len(matched)}'
            f'\n  Unmatched: {len(unmatched)}'
        )

        if dry_run:
            self.stdout.write(self.style.WARNING('\n[DRY RUN — no changes written]\n'))
            for msme, d, m in matched:
                self.stdout.write(f'  [{m}] {msme.business_name} → {d["business_name"]}')
            if unmatched:
                self.stdout.write(self.style.WARNING(f'\nUnmatched ({len(unmatched)}):'))
                for n in unmatched:
                    self.stdout.write(f'  • {n}')
            return

        now = timezone.now()
        updated = 0
        snapshots = 0

        for msme, d, method in matched:
            msme.diag_annual_turnover     = d['annual_turnover']
            msme.diag_total_assets        = d['total_assets']
            msme.diag_employees_ft_male   = d['ft_male']
            msme.diag_employees_ft_female = d['ft_female']
            msme.diag_employees_pt_male   = d['pt_male']
            msme.diag_employees_pt_female = d['pt_female']
            msme.diag_has_tin             = d['has_tin']
            msme.diag_has_unbs            = d['has_unbs']
            msme.diag_has_business_bank   = d['has_business_bank']
            msme.diag_has_mobile_money    = d['has_mobile_money']
            msme.diag_is_green_business   = d['is_green']
            msme.diag_green_categories    = d['green_categories']
            msme.diag_owner_sex           = d['owner_sex']
            msme.diag_owner_age           = d['owner_age']
            msme.diag_owner_education     = d['owner_education']
            msme.diag_years_operating     = d['years_operating']
            msme.diag_district            = d['district']
            msme.diag_imported_at         = now
            msme.save()
            updated += 1

            if not MSMEGrowthSnapshot.objects.filter(msme=msme, source='diagnostic').exists():
                MSMEGrowthSnapshot.objects.create(
                    msme                = msme,
                    snapshot_date       = snap_date,
                    source              = 'diagnostic',
                    collected_by        = None,
                    annual_turnover     = None,
                    total_assets        = None,
                    employees_ft_male   = d['ft_male'],
                    employees_ft_female = d['ft_female'],
                    employees_pt_male   = d['pt_male'],
                    employees_pt_female = d['pt_female'],
                    has_tin             = d['has_tin'],
                    has_unbs            = d['has_unbs'],
                    has_business_bank   = d['has_business_bank'],
                    has_mobile_money    = d['has_mobile_money'],
                    notes               = f'Baseline imported ({method} match, {fmt} format)',
                )
                snapshots += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nDone.\n'
            f'  Updated MSMEs:      {updated}\n'
            f'  Baseline snapshots: {snapshots}\n'
        ))
        if unmatched:
            self.stdout.write(self.style.WARNING(f'\nUnmatched DB records ({len(unmatched)}):'))
            for n in unmatched:
                self.stdout.write(f'  • {n}')
