"""
Import PRUDEV II MSME diagnostic baseline data from the categorised Excel export.

Usage:
    python manage.py import_diagnostics <path-to-excel>

    # Dry-run — shows matches without writing anything:
    python manage.py import_diagnostics <path-to-excel> --dry-run

The command matches Excel rows (Status = "Selected for Review") against
existing MSMEs in the database using a three-tier strategy:
  1. Normalised business name (primary)
  2. Partial name containment (fallback)
  3. Phone number (last resort)

Only MSMEs already in the system are updated.  Unmatched Excel rows and
unmatched DB records are skipped and reported at the end.

Each matched MSME gets:
  • Its diag_* baseline fields populated
  • A MSMEGrowthSnapshot (source="diagnostic") created as the baseline record
    so future BGE-visit snapshots can be compared against it.
"""
import re
from datetime import date

import openpyxl
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from portfolio.models import MSME, MSMEGrowthSnapshot


# ── Column indices in the Categorised Output file ────────────────────────────
C_BUSINESS_NAME      = 2
C_REG_NUMBER         = 3
C_OWNER_NAME         = 5
C_OWNER_CONTACT      = 6
C_OWNER_SEX          = 7
C_OWNER_EMAIL        = 8
C_OWNER_AGE          = 9
C_OWNER_EDUCATION    = 10
C_BUSINESS_PHONE     = 15
C_FT_MALE            = 46
C_FT_FEMALE          = 47
C_PT_MALE            = 48
C_PT_FEMALE          = 49
C_GREEN_RENEWABLE    = 55
C_GREEN_ENERGY_SAVE  = 56
C_GREEN_ORGANIC      = 57
C_GREEN_FORESTRY     = 58
C_GREEN_RECYCLING    = 59
C_GREEN_ECOTOURISM   = 60
C_GREEN_NONE         = 61
C_HAS_TIN            = 62
C_HAS_UNBS           = 73
C_TURNOVER           = 74
C_TOTAL_ASSETS       = 75
C_HAS_BUSINESS_BANK  = 79
C_HAS_MOBILE_MONEY   = 84
C_YEARS_OPERATING    = 39
C_DISTRICT_CLEAN     = 162
C_STATUS             = 163

GREEN_CATEGORY_COLS = [
    (C_GREEN_RENEWABLE,   'Renewable energies (solar, wind, etc.)'),
    (C_GREEN_ENERGY_SAVE, 'Energy-saving technology'),
    (C_GREEN_ORGANIC,     'Organic / sustainable agriculture or fisheries'),
    (C_GREEN_FORESTRY,    'Sustainable forestry'),
    (C_GREEN_RECYCLING,   'Recycling'),
    (C_GREEN_ECOTOURISM,  'Eco-tourism'),
]


# ── Normalisation helpers ─────────────────────────────────────────────────────

STRIP_WORDS = {
    'limited', 'ltd', 'co.', 'uganda', 'u)', '(u)', 'smc',
    'co-operative', 'cooperative', 'lted', 'ug)', '(ug)',
}

def _normalize(name: str) -> str:
    if not name:
        return ''
    s = str(name).lower().strip()
    for w in STRIP_WORDS:
        s = s.replace(w, ' ')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def _clean_phone(value) -> str:
    if not value:
        return ''
    return re.sub(r'[^0-9]', '', str(value))[-9:]


def _parse_bool(value) -> bool | None:
    if value is None:
        return None
    return str(value).strip().lower() in ('yes', '1', 'true', 'y')


def _parse_int(value, non_negative=False) -> int | None:
    if value is None:
        return None
    try:
        result = int(float(str(value).replace(',', '')))
        if non_negative and result < 0:
            return None
        return result
    except (ValueError, TypeError):
        return None


def _parse_decimal(value):
    if value is None:
        return None
    try:
        s = str(value).replace(',', '').strip()
        return float(s) if s else None
    except (ValueError, TypeError):
        return None


# ── Main command ──────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = 'Import PRUDEV II diagnostic baseline into matched MSME records'

    def add_arguments(self, parser):
        parser.add_argument('excel_path', help='Path to the Categorised Output Excel file')
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Show what would be updated without writing to the database',
        )
        parser.add_argument(
            '--snapshot-date', default=None,
            help='ISO date (YYYY-MM-DD) to use for the baseline snapshot (default: today)',
        )

    def handle(self, *args, **options):
        path       = options['excel_path']
        dry_run    = options['dry_run']
        snap_date  = options['snapshot_date']

        if snap_date:
            try:
                snap_date = date.fromisoformat(snap_date)
            except ValueError:
                raise CommandError(f'Invalid date: {snap_date}')
        else:
            snap_date = date.today()

        # ── Load Excel ────────────────────────────────────────────────────────
        self.stdout.write(f'Loading {path} …')
        try:
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        except Exception as exc:
            raise CommandError(f'Could not open file: {exc}')

        ws      = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
        selected = [r for r in all_rows[1:] if r[C_STATUS] == 'Selected for Review']
        self.stdout.write(f'  {len(selected)} rows with Status = "Selected for Review"')

        # Build lookup indices from Excel
        excel_by_norm  = {}   # normalised_name → row
        excel_by_phone = {}   # last-9-digit phone → row
        for row in selected:
            norm = _normalize(row[C_BUSINESS_NAME])
            if norm and norm not in excel_by_norm:
                excel_by_norm[norm] = row
            for ph_col in (C_OWNER_CONTACT, C_BUSINESS_PHONE):
                ph = _clean_phone(row[ph_col])
                if ph and len(ph) >= 7 and ph not in excel_by_phone:
                    excel_by_phone[ph] = row

        # ── Load system MSMEs ─────────────────────────────────────────────────
        db_msmes = list(MSME.objects.all())
        self.stdout.write(f'  {len(db_msmes)} MSMEs in the system')

        matched   = []
        unmatched = []

        for msme in db_msmes:
            sys_norm = _normalize(msme.business_name)
            row      = None
            method   = None

            # 1. Exact normalised name
            if sys_norm in excel_by_norm:
                row, method = excel_by_norm[sys_norm], 'name-exact'
            else:
                # 2. Partial containment (min 6 chars each side)
                if len(sys_norm) >= 6:
                    for ex_norm, ex_row in excel_by_norm.items():
                        if len(ex_norm) >= 6 and (sys_norm in ex_norm or ex_norm in sys_norm):
                            row, method = ex_row, 'name-partial'
                            break

            # 3. Phone fallback
            if row is None and msme.phone:
                ph = _clean_phone(msme.phone)
                if ph and len(ph) >= 7 and ph in excel_by_phone:
                    candidate = excel_by_phone[ph]
                    # Only accept phone match if normalised names share at least
                    # one significant word (avoids cross-matching different businesses
                    # that happen to share a phone number).
                    ex_norm = _normalize(candidate[C_BUSINESS_NAME])
                    sys_words = set(sys_norm.split())
                    ex_words  = set(ex_norm.split())
                    significant = {w for w in sys_words & ex_words if len(w) > 3}
                    if significant:
                        row, method = candidate, 'phone'

            if row is None:
                unmatched.append(msme.business_name)
                continue

            matched.append((msme, row, method))

        self.stdout.write(
            f'\n  Matched:   {len(matched)}'
            f'\n  Unmatched: {len(unmatched)}'
        )

        if dry_run:
            self.stdout.write(self.style.WARNING('\n[DRY RUN — no changes written]\n'))
            self._print_matched(matched)
            self._print_unmatched(unmatched)
            return

        # ── Apply updates ─────────────────────────────────────────────────────
        now = timezone.now()
        created_snapshots = 0
        updated_msmes     = 0

        for msme, row, method in matched:
            # Green categories
            categories = [label for col, label in GREEN_CATEGORY_COLS if row[col]]
            is_green   = bool(categories)

            msme.diag_annual_turnover     = str(row[C_TURNOVER] or '').strip()
            msme.diag_total_assets        = str(row[C_TOTAL_ASSETS] or '').strip()
            msme.diag_employees_ft_male   = _parse_int(row[C_FT_MALE],   non_negative=True)
            msme.diag_employees_ft_female = _parse_int(row[C_FT_FEMALE], non_negative=True)
            msme.diag_employees_pt_male   = _parse_int(row[C_PT_MALE],   non_negative=True)
            msme.diag_employees_pt_female = _parse_int(row[C_PT_FEMALE], non_negative=True)
            msme.diag_has_tin             = _parse_bool(row[C_HAS_TIN])
            msme.diag_has_unbs            = _parse_bool(row[C_HAS_UNBS])
            msme.diag_has_business_bank   = _parse_bool(row[C_HAS_BUSINESS_BANK])
            msme.diag_has_mobile_money    = _parse_bool(row[C_HAS_MOBILE_MONEY])
            msme.diag_is_green_business   = is_green
            msme.diag_green_categories    = categories
            msme.diag_owner_sex           = str(row[C_OWNER_SEX] or '').strip()
            msme.diag_owner_age           = _parse_int(row[C_OWNER_AGE])
            msme.diag_owner_education     = str(row[C_OWNER_EDUCATION] or '').strip()
            msme.diag_years_operating     = str(row[C_YEARS_OPERATING] or '').strip()
            msme.diag_district            = str(row[C_DISTRICT_CLEAN] or '').strip()
            msme.diag_imported_at         = now

            msme.save()
            updated_msmes += 1

            # Create baseline snapshot (skip if one already exists for this MSME)
            if not MSMEGrowthSnapshot.objects.filter(msme=msme, source='diagnostic').exists():
                MSMEGrowthSnapshot.objects.create(
                    msme             = msme,
                    snapshot_date    = snap_date,
                    source           = 'diagnostic',
                    collected_by     = None,
                    annual_turnover  = None,  # diagnostic data is a band, not a number
                    total_assets     = None,  # BGE visits will capture actual figures
                    employees_ft_male   = msme.diag_employees_ft_male   if (msme.diag_employees_ft_male   or 0) >= 0 else None,
                    employees_ft_female = msme.diag_employees_ft_female if (msme.diag_employees_ft_female or 0) >= 0 else None,
                    employees_pt_male   = msme.diag_employees_pt_male   if (msme.diag_employees_pt_male   or 0) >= 0 else None,
                    employees_pt_female = msme.diag_employees_pt_female if (msme.diag_employees_pt_female or 0) >= 0 else None,
                    has_tin           = msme.diag_has_tin,
                    has_unbs          = msme.diag_has_unbs,
                    has_business_bank = msme.diag_has_business_bank,
                    has_mobile_money  = msme.diag_has_mobile_money,
                    notes             = f'Baseline imported from PRUDEV II diagnostics ({method} match)',
                )
                created_snapshots += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nDone.\n'
            f'  Updated MSMEs:       {updated_msmes}\n'
            f'  Baseline snapshots:  {created_snapshots}\n'
        ))
        self._print_unmatched(unmatched)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _print_matched(self, matched):
        self.stdout.write('\nMatched:')
        for msme, row, method in matched:
            self.stdout.write(f'  [{method}] {msme.business_name}')
            if method != 'name-exact':
                self.stdout.write(f'        → {row[C_BUSINESS_NAME]}')

    def _print_unmatched(self, unmatched):
        if unmatched:
            self.stdout.write(self.style.WARNING(f'\nUnmatched DB records ({len(unmatched)}):'))
            for name in unmatched:
                self.stdout.write(f'  • {name}')
