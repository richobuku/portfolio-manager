"""
Import PRUDEV II MSME diagnostic baseline data for Cohorts 1 & 2.

Handles:
  • Survey tool output (181 indicators, header starting with 'ID')
  • Categorised output (legacy format)
  • Matching against existing MSME records via exact, normalized, substring, fuzzy, phone, and owner match
  • Auto-creation of missing MSMEs (--create-missing) assigned to specified cohort
  • Full 181 survey indicators stored in diagnostic_data JSONField
  • Baseline MSMEGrowthSnapshot (source='diagnostic') generation

Usage:
    python manage.py import_diagnostics <path-to-excel> --cohort "Cohort 1"
    python manage.py import_diagnostics <path-to-excel> --cohort "Cohort 2" --create-missing
    python manage.py import_diagnostics <path-to-excel> --dry-run
"""
import re
from datetime import date
from difflib import SequenceMatcher
from decimal import Decimal

import openpyxl
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from portfolio.models import MSME, MSMEGrowthSnapshot, Cohort


# ── Column definitions for the 181-question Survey format ───────────────────────
SRV = dict(
    ID=0, START_TIME=1, END_TIME=2, EMAIL=3, SURVEYOR_NAME=4,
    ASSESSMENT_DATE_1=6, ASSESSMENT_DATE_LATEST=7,
    BUSINESS_NAME=8, REGION=9, DISTRICT=10, CITY=11, PHYSICAL_LOCATION=12,
    CONTACT_NAME=13, CONTACT_ROLE=14, CONTACT_GENDER=15, BUSINESS_PHONE=16,
    CONTACT_EMAIL=17, BUSINESS_EMAIL=18,
    OWNER_NAME=19, OWNER_SEX=20, OWNER_AGE=21,
    NUM_SHAREHOLDERS=22, MALE_SHAREHOLDERS=23, FEMALE_SHAREHOLDERS=24,
    REGISTRATION_STATUS=25, REGISTRATION_BODY=26, REGISTRATION_EVIDENCE=27,
    LEGAL_FORM=28, ASSOCIATION=29, ASSOCIATION_NAME=30,
    YEARS_OPERATING=31, IS_FAMILY_BIZ=32, BIZ_TYPE=33, BIZ_FIELD=34, PRODUCT_SERVICE=35,
    GREEN=36, IS_EXPORTING=37,
    STRATEGIC_PLAN=38, IMPLEMENTING_PLAN=39, STRATEGIC_GOALS=40,
    BOARD_OF_DIRECTORS=41, BOARD_COUNT=42, BOARD_MEETINGS=43, BOARD_MINUTES=44,
    HAS_MENTORS=45, SEPARATED_MANAGEMENT=46, HR_FINANCE_POLICIES=47,
    STRATEGIC_DECISIONS=48, OPERATIONAL_DECISIONS=49,
    DIGITAL_ACCOUNTING=50, DIGITAL_ACCOUNTING_SYS=51,
    SKILLS_NEEDED=52, PARTNERSHIPS=53, CONTRACT_TYPES=54,
    CUSTOMERS=57, CUSTOMER_STRATEGY=59, CUSTOMER_DATABASE=61,
    PROCUREMENT_TENDERS=62, SECTOR_ASSOCIATION=64,
    EMPLOYS_OTHERS=66, JOB_ROLES_WRITTEN=67,
    EMPLOYEE_TRAINING=68, EMPLOYEES_TRAINED=69, EMPLOYEE_TRAINING_NEEDS=70,
    EMPLOYMENT_CONTRACTS=71, WORKER_PROTECTION=72, PPE_ACCESS=73,
    LEAVE_ENTITLED=74, SICK_LEAVE=75, NSSF_PAID=76, OTHER_SOCIAL_SEC=77,
    HEALTH_INSURANCE=78, OTHER_BENEFITS=79, GRIEVANCE_MECHANISM=80,
    WOMEN_MOTHERS_FACILITIES=82, PWD_PROVISIONS=83,
    CAPACITY_DECENT_WORK=84,
    FT_TOTAL=85, FT_MALE=86, FT_FEMALE=87, FT_YOUTH=88,
    PT_TOTAL=89, CASUAL_TOTAL=90, RELATIVE_EMPLOYEES=91, WORKING_HOURS=92,
    WAGE_LEVEL=93,
    TURNOVER_MONTHLY=94, TURNOVER_TREND=95,
    COSTS_MONTHLY=96, COSTS_TREND=97,
    IS_PROFITABLE=98, PROFIT_MONTHLY=99, PROFIT_TREND=100,
    HAS_LOGO=101, HAS_TRADEMARK=102, MEETS_DEMAND=103, MARKET_EXPANSION=104,
    CAPACITY_MARKET_DEV=105,
    SAVINGS_METHOD=106, HAS_BUSINESS_BANK=107,
    PAYS_SUPPLIERS_ON_TIME=108, PAYS_EMPLOYEES_ON_TIME=109, PAYS_UTILITIES_ON_TIME=110,
    HAS_CASH_RESERVES=111, CASH_RESERVES_RUNWAY=112, OTHER_LIQUID_ASSETS=113,
    KEEPS_FINANCIAL_ACCOUNTS=114, ACCOUNTING_SOFTWARE=115, AUDITED_ACCOUNTS=116,
    FILES_TAX_RETURNS=117, FIXED_ASSETS=118, CRB_CARD=119,
    APPLIED_LOAN_3YRS=120, LOAN_PURPOSE=121, LOAN_SOURCE_SUCCESS=122, LOAN_SOURCE_FAIL=123,
    LOAN_OUTCOME=124, OUTSTANDING_LOAN=125, REPAYMENT_ON_TIME=126,
    NEW_PROCESS_PRODUCT=127, NEW_PROCESS_DETAILS=128,
    TECH_MEETS_DEMAND=130, HAS_HARDWARE=131, HARDWARE_DETAILS=132,
    INTERNET_CONNECTIVITY=133, TECH_INNOVATION_NEEDS=134,
    USES_DIGITAL_TOOLS=135, INTENDS_DIGITAL_TOOLS=136,
    DIGITALIZATION_RATING=137, IT_PERSON_IN_CHARGE=138,
    SOCIAL_MEDIA=139, SOCIAL_MEDIA_PLATFORMS=140,
    ONLINE_TRADING_PLATFORM=141, PURCHASED_SOLD_ONLINE=142,
    INVENTORY_SOFTWARE=143, DIGITAL_PAYMENTS=144, CUSTOMER_PAYMENT_METHODS=145,
    ELECTRONIC_DOCS=146, DATA_DRIVEN_DECISIONS=147, DATA_TYPES_STORED=148,
    CLOUD_STORAGE=149, CLOUD_STORAGE_SERVICES=150,
    MOMO_BILL_PAYMENTS=151, THIRD_PARTY_SOFTWARE=152, PROPRIETARY_SOFTWARE=154,
    CAPACITY_TECH_DIGITAL=155,
    ENV_IMPACT_AWARE=156, ENV_NEGATIVE_IMPACT=157,
    ENV_MANAGEMENT_PLAN=158, ENV_PLAN_IMPLEMENTED=159,
    ENV_PERMITS=160, RESOURCE_MONITORING=161,
    CAPACITY_ENV_GREEN=162, RESOURCE_EFFICIENCY_SYSTEMS=163,
    WASTE_MANAGEMENT_SYSTEMS=164, POLLUTION_REDUCTION_SYSTEMS=165,
    HAS_URSB=166, HAS_TIN=167, HAS_UNBS=168, UNBS_CERT_DETAILS=169,
    HEALTH_CERTIFICATE=170, CERTIFICATE_OF_ORIGIN=171,
    CAPACITY_REGULATORY=172, MEETS_STANDARDS=173,
    PRODUCT_DEV_BLUEPRINT=174, QUALITY_CONTROL=175,
    HSSEQ_FAMILIAR=176, INTERNATIONAL_CERTIFICATIONS=177, INTL_CERT_DETAILS=178,
    CAPACITY_QA=179, OTHER_COMMENTS=180,
)

# Legacy Categorised Output file column indices
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


# ── String and normalization helpers ──────────────────────────────────────────

STRIP_WORDS = {'limited', 'ltd', 'co.', 'uganda', 'u)', '(u)', 'smc',
               'co-operative', 'cooperative', 'lted', 'ug)', '(ug)',
               'enterprise', 'enterprises', 'farm', 'farms', 'group', 'company'}

def normalize_name(name):
    if not name:
        return ''
    s = str(name).lower().strip()
    for w in STRIP_WORDS:
        s = re.sub(r'\b' + re.escape(w) + r'\b', ' ', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def clean_phone(value):
    if not value:
        return ''
    s = re.sub(r'[^0-9]', '', str(value))
    return s[-9:] if len(s) >= 7 else ''

def parse_bool(value):
    if value is None:
        return None
    s = str(value).strip().lower()
    if s in ('yes', '1', 'true', 'y', 'registered', 'available'):
        return True
    if s in ('no', '0', 'false', 'n', 'not registered', 'none'):
        return False
    return None

def parse_int(value, non_negative=False):
    if value is None:
        return None
    try:
        s = str(value).replace(',', '').strip()
        result = int(float(s))
        if non_negative and result < 0:
            return None
        return result
    except (ValueError, TypeError):
        return None

def parse_amount(value):
    if value is None:
        return None
    try:
        s = str(value).replace(',', '').replace('UGX', '').replace('ugx', '').strip()
        if '-' in s:
            parts = [float(p.strip()) for p in s.split('-') if p.strip()]
            if parts:
                return Decimal(str(sum(parts) / len(parts)))
        return Decimal(str(float(s)))
    except (ValueError, TypeError):
        return None

def detect_format(header_row):
    if header_row and str(header_row[0]).strip() == 'ID':
        return 'survey'
    return 'categorised'


def extract_survey_row(row, headers):
    """Extract structured data and full 181 responses from a survey row."""
    raw_dict = {}
    for idx, h in enumerate(headers):
        if idx < len(row):
            raw_dict[h] = str(row[idx]) if row[idx] is not None else ''

    # Green category
    green_raw = str(row[SRV['GREEN']] or '').strip()
    is_green = bool(green_raw) and 'does not fall' not in green_raw.lower()
    green_cats = []
    if is_green:
        for part in green_raw.split(';'):
            p = part.strip()
            if p and p not in green_cats:
                green_cats.append(p)

    # Capacity development needs
    cap_needs = []
    if parse_bool(row[SRV['CAPACITY_MARKET_DEV']]):
        cap_needs.append('Market Development')
    if parse_bool(row[SRV['CAPACITY_TECH_DIGITAL']]):
        cap_needs.append('Technology & Digitalization')
    if parse_bool(row[SRV['CAPACITY_ENV_GREEN']]):
        cap_needs.append('Environmental Sustainability & Greening')
    if parse_bool(row[SRV['CAPACITY_REGULATORY']]):
        cap_needs.append('Regulatory Compliance')
    if parse_bool(row[SRV['CAPACITY_QA']]):
        cap_needs.append('Quality Assurance')
    if parse_bool(row[SRV['CAPACITY_DECENT_WORK']]):
        cap_needs.append('Decent Working Conditions')

    # Digital tools list
    digital_tools = []
    dt_raw = str(row[SRV['USES_DIGITAL_TOOLS']] or '').strip()
    if dt_raw and dt_raw.lower() not in ('no', 'none', 'n/a', 'na'):
        for p in dt_raw.split(';'):
            clean_p = p.strip()
            if clean_p and clean_p not in digital_tools:
                digital_tools.append(clean_p)

    # Monthly revenue & profit
    monthly_rev_raw = str(row[SRV['TURNOVER_MONTHLY']] or '').strip()
    monthly_rev_num = parse_amount(monthly_rev_raw)
    annual_rev_est = (monthly_rev_num * 12) if monthly_rev_num else None

    profit_status = str(row[SRV['IS_PROFITABLE']] or '').strip()
    profit_monthly_raw = str(row[SRV['PROFIT_MONTHLY']] or '').strip()

    ft_male = parse_int(row[SRV['FT_MALE']], non_negative=True)
    ft_female = parse_int(row[SRV['FT_FEMALE']], non_negative=True)
    ft_youth = parse_int(row[SRV['FT_YOUTH']], non_negative=True)
    ft_total = parse_int(row[SRV['FT_TOTAL']], non_negative=True)
    pt_total = parse_int(row[SRV['PT_TOTAL']], non_negative=True)

    calc_employees = None
    if ft_total is not None or pt_total is not None:
        calc_employees = (ft_total or 0) + (pt_total or 0)
    elif ft_male is not None or ft_female is not None:
        calc_employees = (ft_male or 0) + (ft_female or 0) + (pt_total or 0)

    biz_name = str(row[SRV['BUSINESS_NAME']] or '').strip()
    owner_name = str(row[SRV['OWNER_NAME']] or '').strip()
    if not owner_name or owner_name.lower() in ('na', 'n/a', 'none'):
        owner_name = str(row[SRV['CONTACT_NAME']] or '').strip()

    phone = clean_phone(row[SRV['BUSINESS_PHONE']]) or clean_phone(row[SRV['BUSINESS_PHONE']])
    email = str(row[SRV['BUSINESS_EMAIL']] or row[SRV['CONTACT_EMAIL']] or '').strip()
    if email.lower() in ('na', 'n/a', 'none'):
        email = ''

    return dict(
        business_name             = biz_name,
        owner_name                = owner_name,
        phone                     = phone,
        email                     = email,
        district                  = str(row[SRV['DISTRICT']] or '').strip(),
        city                      = str(row[SRV['CITY']] or '').strip(),
        address                   = str(row[SRV['PHYSICAL_LOCATION']] or '').strip(),
        owner_sex                 = str(row[SRV['OWNER_SEX']] or row[SRV['CONTACT_GENDER']] or '').strip(),
        owner_age                 = parse_int(row[SRV['OWNER_AGE']]),
        owner_education           = '',
        years_operating           = str(row[SRV['YEARS_OPERATING']] or '').strip(),
        annual_turnover           = monthly_rev_raw,
        annual_revenue            = annual_rev_est,
        employee_count            = calc_employees,
        total_assets              = '',
        ft_male                   = ft_male,
        ft_female                 = ft_female,
        ft_youth                  = ft_youth,
        ft_total                  = ft_total,
        pt_total                  = pt_total,
        pt_male                   = None,
        pt_female                 = None,
        has_tin                   = parse_bool(row[SRV['HAS_TIN']]),
        has_unbs                  = parse_bool(row[SRV['HAS_UNBS']]),
        has_ursb                  = parse_bool(row[SRV['HAS_URSB']]),
        has_business_bank         = parse_bool(row[SRV['HAS_BUSINESS_BANK']]),
        has_mobile_money          = parse_bool(row[SRV['DIGITAL_PAYMENTS']]) or parse_bool(row[SRV['MOMO_BILL_PAYMENTS']]),
        is_green                  = is_green,
        green_categories          = green_cats,
        digitalization_score      = parse_int(row[SRV['DIGITALIZATION_RATING']]),
        digital_tools             = digital_tools,
        profit_status             = profit_status,
        monthly_profit            = profit_monthly_raw,
        capacity_needs            = cap_needs,
        product_service           = str(row[SRV['PRODUCT_SERVICE']] or '').strip(),
        legal_form                = str(row[SRV['LEGAL_FORM']] or '').strip(),
        sector_raw                = str(row[SRV['BIZ_FIELD']] or row[SRV['BIZ_TYPE']] or '').strip(),
        diagnostic_data           = raw_dict,
    )


import os

# ── Command ───────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = 'Import PRUDEV II diagnostic baseline data and match with DB MSMEs'

    def add_arguments(self, parser):
        parser.add_argument('excel_path', nargs='?', default=None, help='Path to the diagnostics Excel file')
        parser.add_argument('--cohort', default='Cohort 1',
                            help='Cohort name to assign (e.g. "Cohort 1", "Cohort 2")')
        parser.add_argument('--create-missing', action='store_true',
                            help='Create new MSME records for diagnostic entries not already in the DB')
        parser.add_argument('--auto', action='store_true',
                            help='Automatically import both bundled Cohort 1 and Cohort 2 diagnostic datasets')
        parser.add_argument('--dry-run', action='store_true',
                            help='Show matches without writing anything')
        parser.add_argument('--snapshot-date', default=None,
                            help='ISO date YYYY-MM-DD for the baseline snapshot (default: today)')

    def handle(self, *args, **options):
        snap_date = options['snapshot_date']
        if snap_date:
            try:
                snap_date = date.fromisoformat(snap_date)
            except ValueError:
                raise CommandError(f'Invalid date: {snap_date}')
        else:
            snap_date = date.today()

        auto_mode = options['auto'] or options['excel_path'] is None

        if auto_mode:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            data_dir = os.path.join(base_dir, 'data', 'diagnostics')
            c1_path = os.path.join(data_dir, 'cohort_1_diagnostics.xlsx')
            c2_path = os.path.join(data_dir, 'cohort_2_diagnostics.xlsx')

            if os.path.exists(c1_path):
                self.stdout.write(self.style.MIGRATE_HEADING('=== Ingesting Cohort 1 Diagnostics ==='))
                self._import_file(c1_path, 'Cohort 1', create_missing=False, dry_run=options['dry_run'], snap_date=snap_date)
            else:
                self.stdout.write(self.style.WARNING(f'Cohort 1 file not found at {c1_path}'))

            if os.path.exists(c2_path):
                self.stdout.write(self.style.MIGRATE_HEADING('\n=== Ingesting Cohort 2 Diagnostics ==='))
                self._import_file(c2_path, 'Cohort 2', create_missing=True, dry_run=options['dry_run'], snap_date=snap_date)
            else:
                self.stdout.write(self.style.WARNING(f'Cohort 2 file not found at {c2_path}'))
            return

        self._import_file(
            options['excel_path'],
            options['cohort'],
            create_missing=options['create_missing'],
            dry_run=options['dry_run'],
            snap_date=snap_date
        )

    def _import_file(self, path, cohort_arg, create_missing, dry_run, snap_date):
        self.stdout.write(f'Loading {path} …')
        try:
            wb = openpyxl.load_workbook(path, data_only=True)
        except Exception as exc:
            raise CommandError(f'Could not open file: {exc}')

        ws = wb['Sheet1'] if 'Sheet1' in wb.sheetnames else wb.active
        all_rows = list(ws.iter_rows(values_only=True))
        wb.close()

        if len(all_rows) < 2:
            raise CommandError('File appears empty.')

        headers = [str(h or '').strip() for h in all_rows[0]]
        fmt = detect_format(all_rows[0])
        self.stdout.write(f'  Detected format: {fmt}')
        self.stdout.write(f'  Total rows in Excel: {len(all_rows) - 1}')

        # Resolve or create Cohort object
        cohort_name_clean = f"{cohort_arg} (Selected MSMEs)" if not cohort_arg.endswith(')') else cohort_arg
        cohort_obj, _ = Cohort.objects.get_or_create(
            name=cohort_name_clean,
            defaults={'description': f'PRUDEV II {cohort_arg}'}
        )

        # Parse valid candidate records
        data_records = []
        for r_idx, row in enumerate(all_rows[1:], 2):
            if not any(row):
                continue
            d = extract_survey_row(row, headers)
            if not d['business_name'] and not d['owner_name']:
                continue
            d['excel_row'] = r_idx
            data_records.append(d)

        self.stdout.write(f'  Valid diagnostic records: {len(data_records)}')

        # Load existing MSMEs
        db_msmes = list(MSME.objects.all().select_related('cohort'))
        self.stdout.write(f'  Existing MSMEs in DB: {len(db_msmes)}')

        matched_results = []   # (msme, diag_data, method, is_new)
        unmatched_diags = []
        matched_msme_ids = set()

        for d in data_records:
            d_name = d['business_name']
            d_norm = normalize_name(d_name)
            d_phone = d['phone']
            d_owner_norm = normalize_name(d['owner_name'])

            best_m = None
            best_method = None
            best_score = 0.0

            for m in db_msmes:
                if m.id in matched_msme_ids:
                    continue

                m_norm = normalize_name(m.business_name)
                m_phone = clean_phone(m.phone)
                m_owner_norm = normalize_name(m.owner_name)

                score = 0.0
                method = None

                # Tier 1: Exact normalized name match
                if m_norm and d_norm and m_norm == d_norm:
                    score, method = 1.0, 'exact_name'
                # Tier 2: Substring name match
                elif m_norm and d_norm and len(m_norm) >= 6 and len(d_norm) >= 6 and (m_norm in d_norm or d_norm in m_norm):
                    score, method = 0.95, 'substring_name'
                # Tier 3: Fuzzy name similarity
                elif m_norm and d_norm:
                    ratio = SequenceMatcher(None, m_norm, d_norm).ratio()
                    if ratio >= 0.82:
                        score, method = ratio, 'fuzzy_name'

                # Tier 4: Phone match (require high phone match and not conflicting name)
                if score < 0.90 and m_phone and d_phone and len(m_phone) >= 7 and m_phone == d_phone:
                    if not m_norm or not d_norm or SequenceMatcher(None, m_norm, d_norm).ratio() >= 0.5:
                        score, method = 0.90, 'phone_match'

                # Tier 5: Owner name match (only if at least partial business name or district matches)
                if score < 0.85 and m_owner_norm and d_owner_norm and len(m_owner_norm) >= 6:
                    if (m_owner_norm == d_owner_norm or SequenceMatcher(None, m_owner_norm, d_owner_norm).ratio() >= 0.90):
                        if (m_norm and d_norm and SequenceMatcher(None, m_norm, d_norm).ratio() >= 0.5) or (m.district and d['district'] and m.district.lower() == d['district'].lower()):
                            score, method = 0.85, 'owner_name'

                if score > best_score:
                    best_score = score
                    best_method = method
                    best_m = m

            if best_score >= 0.80 and best_m:
                matched_msme_ids.add(best_m.id)
                matched_results.append((best_m, d, best_method, False))
            else:
                unmatched_diags.append(d)

        self.stdout.write(
            f'\n  Matched existing MSMEs: {len(matched_results)}'
            f'\n  Unmatched diagnostics:  {len(unmatched_diags)}'
        )

        to_create = []
        if unmatched_diags:
            if create_missing:
                self.stdout.write(f'  Creating {len(unmatched_diags)} new MSME records for {cohort_arg} …')
                for d in unmatched_diags:
                    to_create.append(d)
            else:
                self.stdout.write(self.style.WARNING(
                    f'  Notice: {len(unmatched_diags)} diagnostic records had no DB match. '
                    f'Pass --create-missing to register them as new MSMEs in {cohort_arg}.'
                ))

        if dry_run:
            self.stdout.write(self.style.WARNING('\n[DRY RUN — no changes written]\n'))
            for msme, d, m, _ in matched_results[:15]:
                self.stdout.write(f'  [{m}] DB ID {msme.id}: "{msme.business_name}" ← Excel: "{d["business_name"]}"')
            if len(matched_results) > 15:
                self.stdout.write(f'  ... and {len(matched_results) - 15} more matches.')
            if to_create:
                self.stdout.write(self.style.NOTICE(f'\nWould create {len(to_create)} new MSMEs in {cohort_arg}:'))
                for d in to_create[:10]:
                    self.stdout.write(f'  • "{d["business_name"]}" ({d["district"]}) - {d["owner_name"]}')
            return

        # ── Execution ─────────────────────────────────────────────────────────
        now = timezone.now()
        updated_count = 0
        created_count = 0
        snapshots_count = 0

        def apply_diagnostic_fields(msme_inst, d_data, target_cohort):
            msme_inst.diag_annual_turnover     = d_data['annual_turnover']
            msme_inst.diag_total_assets        = d_data['total_assets']
            msme_inst.diag_employees_ft_male   = d_data['ft_male']
            msme_inst.diag_employees_ft_female = d_data['ft_female']
            msme_inst.diag_employees_ft_youth  = d_data['ft_youth']
            msme_inst.diag_employees_pt_total  = d_data['pt_total']
            msme_inst.diag_employees_pt_male   = d_data['pt_male']
            msme_inst.diag_employees_pt_female = d_data['pt_female']
            msme_inst.diag_has_tin             = d_data['has_tin']
            msme_inst.diag_has_unbs            = d_data['has_unbs']
            msme_inst.diag_has_business_bank   = d_data['has_business_bank']
            msme_inst.diag_has_mobile_money    = d_data['has_mobile_money']
            msme_inst.diag_is_green_business   = d_data['is_green']
            msme_inst.diag_green_categories    = d_data['green_categories']
            msme_inst.diag_digitalization_score= d_data['digitalization_score']
            msme_inst.diag_profit_status       = d_data['profit_status']
            msme_inst.diag_monthly_profit      = d_data['monthly_profit']
            msme_inst.diag_capacity_needs      = d_data['capacity_needs']
            msme_inst.diagnostic_data          = d_data['diagnostic_data']
            msme_inst.diag_owner_sex           = d_data['owner_sex']
            msme_inst.diag_owner_age           = d_data['owner_age']
            msme_inst.diag_owner_education     = d_data['owner_education']
            msme_inst.diag_years_operating     = d_data['years_operating']
            msme_inst.diag_district            = d_data['district']
            msme_inst.diag_imported_at         = now

            if d_data['annual_revenue'] and not msme_inst.annual_revenue:
                msme_inst.annual_revenue = d_data['annual_revenue']
            if d_data['employee_count'] and not msme_inst.employee_count:
                msme_inst.employee_count = d_data['employee_count']
            if d_data['district'] and not msme_inst.district:
                msme_inst.district = d_data['district']
                msme_inst.city = d_data['city'] or d_data['district']
            if d_data['phone'] and not msme_inst.phone:
                msme_inst.phone = d_data['phone']
            if d_data['owner_name'] and not msme_inst.owner_name:
                msme_inst.owner_name = d_data['owner_name']

            if not msme_inst.cohort:
                msme_inst.cohort = target_cohort

        # 1. Update matched MSMEs
        for msme, d, method, _ in matched_results:
            apply_diagnostic_fields(msme, d, cohort_obj)
            msme.save()
            updated_count += 1

            snap, created = MSMEGrowthSnapshot.objects.update_or_create(
                msme=msme,
                source='diagnostic',
                defaults=dict(
                    snapshot_date       = snap_date,
                    annual_turnover     = d['annual_revenue'],
                    employees_ft_male   = d['ft_male'],
                    employees_ft_female = d['ft_female'],
                    employees_ft_youth  = d['ft_youth'],
                    employees_pt_male   = d['pt_male'],
                    employees_pt_female = d['pt_female'],
                    has_tin             = d['has_tin'],
                    has_unbs            = d['has_unbs'],
                    has_ursb            = d['has_ursb'],
                    has_business_bank   = d['has_business_bank'],
                    has_mobile_money    = d['has_mobile_money'],
                    digitalization_score= d['digitalization_score'],
                    digital_tools       = d['digital_tools'],
                    notes               = f'Baseline diagnostic imported ({method} match)',
                )
            )
            snapshots_count += 1

        # 2. Create missing MSMEs (e.g. for Cohort 2)
        for d in to_create:
            new_msme = MSME(
                business_name = d['business_name'],
                owner_name    = d['owner_name'] or 'Founder/Owner',
                phone         = d['phone'],
                email         = d['email'],
                district      = d['district'],
                city          = d['city'] or d['district'],
                address       = d['address'],
                business_type = 'SMALL',
                sector        = 'AGRICULTURE' if 'farm' in d['business_name'].lower() or 'agro' in d['business_name'].lower() else 'MANUFACTURING',
                cohort        = cohort_obj,
                source_file   = f'Diagnostics {cohort_arg}',
            )
            apply_diagnostic_fields(new_msme, d, cohort_obj)
            new_msme.save()
            created_count += 1

            MSMEGrowthSnapshot.objects.update_or_create(
                msme                = new_msme,
                source              = 'diagnostic',
                defaults            = dict(
                    snapshot_date       = snap_date,
                    collected_by        = None,
                    annual_turnover     = d['annual_revenue'],
                    employees_ft_male   = d['ft_male'],
                    employees_ft_female = d['ft_female'],
                    employees_ft_youth  = d['ft_youth'],
                    employees_pt_male   = d['pt_male'],
                    employees_pt_female = d['pt_female'],
                    has_tin             = d['has_tin'],
                    has_unbs            = d['has_unbs'],
                    has_ursb            = d['has_ursb'],
                    has_business_bank   = d['has_business_bank'],
                    has_mobile_money    = d['has_mobile_money'],
                    digitalization_score= d['digitalization_score'],
                    digital_tools       = d['digital_tools'],
                    notes               = f'Baseline diagnostic imported for newly registered {cohort_arg} enterprise',
                )
            )
            snapshots_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nSuccessfully completed diagnostic baseline ingestion for {cohort_arg}:\n'
            f'  Enriched existing MSMEs: {updated_count}\n'
            f'  Newly registered MSMEs:  {created_count}\n'
            f'  Total baseline snapshots: {snapshots_count}\n'
        ))
