"""
Management command: Sync all 226 MSMEs from the master diagnostic dataset into the database.

Usage:
    python manage.py sync_226_msmes
"""

import os
import re
from datetime import date
import pandas as pd
from django.core.management.base import BaseCommand
from portfolio.models import MSME, MSMEGrowthSnapshot, Cohort


GREEN_COLS = [
    (55, 'Renewable energies (solar, wind, etc.)'),
    (56, 'Energy-saving technology'),
    (57, 'Organic / sustainable agriculture or fisheries'),
    (58, 'Sustainable forestry'),
    (59, 'Recycling'),
    (60, 'Eco-tourism'),
]


def clean_num(val):
    if val is None or pd.isna(val):
        return None
    try:
        s = str(val).replace(',', '').replace('UGX', '').replace('ugx', '').strip()
        num = float(s)
        return int(num) if num.is_integer() else num
    except:
        return None


def clean_int(val):
    v = clean_num(val)
    if v is None:
        return 0
    try:
        return max(0, int(v))
    except:
        return 0


def clean_str(val):
    if val is None or pd.isna(val):
        return ''
    return str(val).strip()


def parse_bool(val):
    if val is None or pd.isna(val):
        return None
    s = str(val).strip().lower()
    if s in ['yes', 'y', '1', 'true']:
        return True
    if s in ['no', 'n', '0', 'false']:
        return False
    return None


def normalize_district(d):
    d_clean = clean_str(d).title()
    # Normalize common variations
    mapping = {
        'Lira City': 'Lira',
        'Lira District': 'Lira',
        'Lira-Northern Uganda': 'Lira',
        'Gulu City': 'Gulu',
        'Zombo District': 'Zombo',
    }
    return mapping.get(d_clean, d_clean)


def infer_business_type(type_str):
    s = clean_str(type_str).lower()
    if 'micro' in s:
        return 'MICRO'
    if 'small' in s:
        return 'SMALL'
    if 'medium' in s:
        return 'MEDIUM'
    return 'SMALL'


def infer_business_category(name, type_str, is_green):
    s = f"{name} {type_str}".lower()
    if is_green or 'solar' in s or 'waste' in s or 'eco' in s or 'recycle' in s:
        return 'green_business'
    if any(k in s for k in ['mill', 'processor', 'processing', 'oil', 'flour', 'dairy', 'bakery', 'roasting', 'juice', 'wine', 'honey']):
        return 'agro_processor'
    if any(k in s for k in ['input', 'seed', 'fertilizer', 'agro-vet', 'agrovets', 'agro vet', 'chemicals']):
        return 'agro_input_dealer'
    if any(k in s for k in ['bulking', 'grain', 'produce', 'store', 'cereal']):
        return 'produce_bulking'
    if any(k in s for k in ['farm', 'farmers', 'ranch', 'poultry', 'pig', 'piggery', 'apiary', 'horticulture', 'cassava', 'maize']):
        return 'farm_enterprise'
    if any(k in s for k in ['tree', 'forest', 'timber', 'nursery', 'wood']):
        return 'forestry_agroforestry'
    if any(k in s for k in ['hotel', 'palace', 'inn', 'resort', 'clinic', 'health', 'hospital', 'consult', 'tech', 'software', 'press', 'service']):
        return 'services'
    if any(k in s for k in ['enterprise', 'invest', 'venture', 'trade', 'shop', 'general', 'distribut']):
        return 'trade_commerce'
    return 'agro_processor'


class Command(BaseCommand):
    help = 'Sync all 226 MSMEs from master diagnostic dataset into Django database.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default='/Users/RICHOBUKU/Downloads/Copy of PRUDEV_II_MSMEs_Categorized_Output.xlsx',
            help='Path to the categorised output Excel file',
        )

    def handle(self, *args, **options):
        fpath = options['file']
        if not os.path.exists(fpath):
            fpath = '/Users/RICHOBUKU/Documents/PRUDEV-GIZ/BGE TOT 2026/BDS system/Copy of PRUDEV_II_MSMEs_Categorized_Outpu.xlsx'

        self.stdout.write(f'Loading master dataset from: {fpath}')
        df = pd.read_excel(fpath, sheet_name='Selected for Review')
        sel = df[df['Status'] == 'Selected for Review'].copy()

        sel['clean_name'] = sel['1.1.  Business Name:'].astype(str).str.strip()
        sel['norm_name'] = sel['clean_name'].str.lower().str.replace(r'[^a-z0-9]', '', regex=True)

        dedup = sel.drop_duplicates(subset=['norm_name']).copy()
        final_226 = dedup[dedup['District'].astype(str).str.lower().str.strip() != 'bugiri'].copy()

        total_records = len(final_226)
        self.stdout.write(f'Found {total_records} valid MSMEs in master dataset.')

        cohort1, _ = Cohort.objects.get_or_create(name='Cohort 1 (Selected MSMEs)')

        synced_count = 0
        created_count = 0
        updated_count = 0

        # Build existing MSME lookup
        existing_msmes = {re.sub(r'[^a-z0-9]', '', m.business_name.lower()): m for m in MSME.objects.all()}

        for idx, (_, row) in enumerate(final_226.iterrows(), 1):
            raw_name = clean_str(row['1.1.  Business Name:'])
            norm_k = re.sub(r'[^a-z0-9]', '', raw_name.lower())

            owner_name = clean_str(row['1.4.  Name of Business Owner:'])
            phone = clean_str(row['1.5.  Business Owner Contacts:'])
            raw_sex = clean_str(row['1.6.  Sex']).upper()
            gender = 'M' if 'M' in raw_sex else ('F' if 'F' in raw_sex else '')
            email = clean_str(row['1.7.  Business Owners Email:'])
            b_type_str = clean_str(row['1.10.  Type of Business:'])
            b_type = infer_business_type(b_type_str)
            district = normalize_district(row['District'])
            city = clean_str(row.get('Town/City', ''))
            reg_no = clean_str(row['1.2.  Business Registration Number (BRN):'])
            bus_email = clean_str(row.get('1.13.  Business email address', ''))
            alt_phone = clean_str(row.get('1.12.  Business Phone Number(s):', ''))

            # Financials & Workforce from row column indices
            ft_m = clean_int(row.iloc[46])
            ft_f = clean_int(row.iloc[47])
            pt_m = clean_int(row.iloc[48])
            pt_f = clean_int(row.iloc[49])
            tot_emp = ft_m + ft_f + pt_m + pt_f

            turnover = clean_num(row.iloc[74])
            assets = clean_num(row.iloc[75])
            has_tin = parse_bool(row.iloc[62])
            has_unbs = parse_bool(row.iloc[73])
            has_bank = parse_bool(row.iloc[79])
            has_momo = parse_bool(row.iloc[84])

            # Green business evaluation
            green_cats = [label for col_idx, label in GREEN_COLS if parse_bool(row.iloc[col_idx])]
            is_green = len(green_cats) > 0
            b_category = infer_business_category(raw_name, b_type_str, is_green)

            msme_obj = existing_msmes.get(norm_k)
            if msme_obj:
                # Update baseline diagnostics if not present
                if not msme_obj.district:
                    msme_obj.district = district
                if not msme_obj.owner_name:
                    msme_obj.owner_name = owner_name
                if not msme_obj.phone:
                    msme_obj.phone = phone
                if not msme_obj.business_category:
                    msme_obj.business_category = b_category
                if not msme_obj.annual_revenue and turnover:
                    msme_obj.annual_revenue = turnover
                if not msme_obj.employee_count:
                    msme_obj.employee_count = tot_emp

                msme_obj.cohort = cohort1
                msme_obj.diag_has_tin = has_tin
                msme_obj.diag_has_business_bank = has_bank
                msme_obj.diag_employees_ft_male = ft_m
                msme_obj.diag_employees_ft_female = ft_f
                msme_obj.diag_employees_pt_male = pt_m
                msme_obj.diag_employees_pt_female = pt_f
                msme_obj.save()
                updated_count += 1
            else:
                # Create new MSME
                msme_obj = MSME(
                    business_name=raw_name,
                    business_type=b_type,
                    sector='AGRICULTURE',
                    business_category=b_category,
                    registration_number=reg_no,
                    owner_name=owner_name or raw_name,
                    gender=gender,
                    phone=phone,
                    email=email,
                    business_email=bus_email,
                    alt_phone=alt_phone,
                    district=district,
                    city=city,
                    status='active',
                    annual_revenue=turnover,
                    employee_count=tot_emp,
                    cohort=cohort1,
                    diag_has_tin=has_tin,
                    diag_has_business_bank=has_bank,
                    diag_employees_ft_male=ft_m,
                    diag_employees_ft_female=ft_f,
                    diag_employees_pt_male=pt_m,
                    diag_employees_pt_female=pt_f,
                )
                msme_obj.save()
                existing_msmes[norm_k] = msme_obj
                created_count += 1

            # Ensure baseline growth snapshot exists
            snap, snap_created = MSMEGrowthSnapshot.objects.get_or_create(
                msme=msme_obj,
                source='diagnostic',
                defaults={
                    'snapshot_date': date(2025, 3, 26),
                    'annual_turnover': turnover,
                    'total_assets': assets,
                    'employees_ft_male': ft_m,
                    'employees_ft_female': ft_f,
                    'employees_pt_male': pt_m,
                    'employees_pt_female': pt_f,
                    'has_tin': has_tin,
                    'has_ursb': has_unbs,
                    'has_business_bank': has_bank,
                    'has_momo_pay': has_momo,
                    'notes': f'Baseline imported from PRUDEV II diagnostic selection ({", ".join(green_cats) if green_cats else "Standard Selection"})',
                }
            )

            synced_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'Successfully synced {synced_count} MSMEs:\n'
            f'  - Created: {created_count}\n'
            f'  - Updated: {updated_count}\n'
            f'  - Total MSMEs in DB now: {MSME.objects.count()}\n'
            f'  - Total Growth Snapshots: {MSMEGrowthSnapshot.objects.count()}'
        ))
