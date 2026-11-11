# Generated manually to fix misplaced/Kampala GPS coordinates for Northern Uganda MSMEs
# Specifically addresses Borderless (Amuru) and Amanzora/Anyazoru (Adjumani) and other workshop-pinned records

from decimal import Decimal
from django.db import migrations


def fix_kampala_coordinates(apps, schema_editor):
    MSME = apps.get_model('portfolio', 'MSME')

    # 1. Specific known enterprise coordinate corrections:
    # Borderless: Guru Guru / Owadi village, Otici parish, Amuru district
    borderless_count = MSME.objects.filter(business_name__icontains='Borderless').update(
        latitude=Decimal('2.756200'),
        longitude=Decimal('32.062400')
    )

    # Amanzora / Anyazoru: Aliababa village, Subbe parish, Ofua, Adjumani district
    amanzora_count = MSME.objects.filter(business_name__iregex=r'(Amanzora|Anyazoru)').update(
        latitude=Decimal('3.250000'),
        longitude=Decimal('31.725000')
    )

    # Payira Dit Limited: Olwiyo Center, Purongo, Nwoya
    MSME.objects.filter(business_name__icontains='Payira Dit').update(
        latitude=Decimal('2.585000'),
        longitude=Decimal('31.885000')
    )

    # Awelo Millers: Atapara, Oyam
    MSME.objects.filter(business_name__icontains='Awelo Millers').update(
        latitude=Decimal('2.320000'),
        longitude=Decimal('32.480000')
    )

    # Bulenisi Agro: Pakele, Adjumani
    MSME.objects.filter(business_name__icontains='Bulenisi').update(
        latitude=Decimal('3.350000'),
        longitude=Decimal('31.850000')
    )

    # Marindi Maize: Marindi, Adjumani
    MSME.objects.filter(business_name__icontains='Marindi Maize').update(
        latitude=Decimal('3.385000'),
        longitude=Decimal('31.780000')
    )

    # Pago Investment: Adjumani Town
    MSME.objects.filter(business_name__icontains='Pago Investment').update(
        latitude=Decimal('3.377800'),
        longitude=Decimal('31.790900')
    )

    # Adept Agribusiness: Keyo, Amuru
    MSME.objects.filter(business_name__icontains='Adept Agribusiness').update(
        latitude=Decimal('2.780000'),
        longitude=Decimal('32.150000')
    )

    # 2. General cleanup for any remaining MSMEs with Kampala/Central coordinates (< 1.5 N)
    district_centroids = {
        'amuru': (Decimal('2.818000'), Decimal('31.871000')),
        'adjumani': (Decimal('3.377800'), Decimal('31.790900')),
        'gulu': (Decimal('2.774950'), Decimal('32.299110')),
        'lira': (Decimal('2.247200'), Decimal('32.899800')),
        'kitgum': (Decimal('3.284800'), Decimal('32.883700')),
        'nwoya': (Decimal('2.600000'), Decimal('31.950000')),
        'oyam': (Decimal('2.381100'), Decimal('32.500800')),
        'apac': (Decimal('1.975600'), Decimal('32.538600')),
        'dokolo': (Decimal('1.918900'), Decimal('33.176400')),
        'pader': (Decimal('2.824200'), Decimal('32.814400')),
        'agago': (Decimal('3.034020'), Decimal('33.363722')),
        'alebtong': (Decimal('2.260000'), Decimal('33.120000')),
        'otuke': (Decimal('2.450000'), Decimal('33.320000')),
        'omoro': (Decimal('2.650000'), Decimal('32.350000')),
        'kole': (Decimal('2.370000'), Decimal('32.780000')),
        'lamwo': (Decimal('3.530000'), Decimal('32.830000')),
        'arua': (Decimal('3.030300'), Decimal('30.910700')),
        'koboko': (Decimal('3.413600'), Decimal('30.960000')),
        'nebbi': (Decimal('2.478300'), Decimal('31.088900')),
        'yumbe': (Decimal('3.465100'), Decimal('31.246900')),
        'moyo': (Decimal('3.650000'), Decimal('31.720000')),
    }

    bogus_kampala = MSME.objects.filter(latitude__isnull=False, latitude__lt=Decimal('1.500000'))
    cleaned = 0
    for m in bogus_kampala:
        d_str = (m.district or m.city or '').lower().strip()
        matched = False
        for dist_name, coords in district_centroids.items():
            if dist_name in d_str:
                m.latitude = coords[0]
                m.longitude = coords[1]
                m.save(update_fields=['latitude', 'longitude'])
                cleaned += 1
                matched = True
                break
        if not matched:
            m.latitude = None
            m.longitude = None
            m.save(update_fields=['latitude', 'longitude'])
            cleaned += 1

    print(f"[Migration 0133] Fixed {borderless_count} Borderless, {amanzora_count} Amanzora/Anyazoru, and cleaned {cleaned} Kampala-pinned records.")


def reverse_fix(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0132_financialimprovementactionplan_secondary_categories'),
    ]

    operations = [
        migrations.RunPython(fix_kampala_coordinates, reverse_fix),
    ]

