from django.db import migrations
from django.db.models import Q

def smart_sync_al_maghtas_and_bge(apps, schema_editor):
    MSME = apps.get_model('portfolio', 'MSME')
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    Cohort = apps.get_model('portfolio', 'Cohort')

    # 1. Find existing BGE by any common spelling/variant
    # e.g. Racheal Kopbusinge, Racheal Kobusinge, Rachael, Rachel
    bge_qs = BusinessGrowthExpert.objects.filter(
        Q(name__icontains='kopbusinge') |
        Q(name__icontains='kobusinge') |
        Q(name__icontains='racheal') |
        Q(name__icontains='rachael')
    ).order_by('id')

    primary_bge = None
    # Prefer one linked to a user or with existing assignments/reports
    for b in bge_qs:
        if getattr(b, 'user_id', None):
            primary_bge = b
            break
    if not primary_bge:
        primary_bge = bge_qs.first()

    if not primary_bge:
        last_bge = BusinessGrowthExpert.objects.order_by('-id').first()
        next_bge_id = (last_bge.id + 1) if last_bge else 1
        bge_code = f'PRUDEV II-BGE-010T-{next_bge_id:02d}'
        primary_bge = BusinessGrowthExpert.objects.create(
            name='Racheal Kobusinge',
            bge_code=bge_code,
            status='approved',
            location='Kitgum',
        )

    # 2. Get Agroprocessors cohort
    cohort = Cohort.objects.filter(name__icontains='Agroprocessor').first()

    # 3. Find any MSME matching Al-Maghtas variants
    msme_qs = MSME.objects.filter(
        Q(business_name__icontains='maghtas') |
        Q(business_name__icontains='magtas') |
        Q(owner_name__icontains='Angom Lilian')
    )

    msme = msme_qs.first()
    if not msme:
        last_msme = MSME.objects.order_by('-id').first()
        next_num = (last_msme.id + 1) if last_msme else 1
        code = f'PRUDEV2-GOPA-COHORT-{next_num:03d}'
        while MSME.objects.filter(msme_code=code).exists():
            next_num += 1
            code = f'PRUDEV2-GOPA-COHORT-{next_num:03d}'

        msme = MSME.objects.create(
            msme_code=code,
            business_name='Al-Maghtas Investment Ltd',
            business_type='SMALL',
            sector='AGRICULTURE',
            business_category='agro_processor',
            owner_name='Angom Lilian',
            phone='0784547010 / 078879877 / 0774627026',
            email='info@al-maghtasinvestment.com',
            city='Kitgum',
            state='Kitgum',
            address='Pado Division Pangum Cell',
            country='Uganda',
            cohort=cohort,
            assigned_bge=primary_bge,
            is_active=True,
        )
    else:
        msme.business_name = 'Al-Maghtas Investment Ltd'
        msme.business_category = 'agro_processor'
        msme.sector = 'AGRICULTURE'
        msme.cohort = cohort
        msme.assigned_bge = primary_bge
        msme.owner_name = 'Angom Lilian'
        msme.phone = '0784547010 / 078879877 / 0774627026'
        msme.email = 'info@al-maghtasinvestment.com'
        msme.city = 'Kitgum'
        msme.state = 'Kitgum'
        msme.address = 'Pado Division Pangum Cell'
        msme.country = 'Uganda'
        msme.is_active = True
        msme.save()

def noop_reverse(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0097_add_al_maghtas_msme'),
    ]

    operations = [
        migrations.RunPython(smart_sync_al_maghtas_and_bge, noop_reverse),
    ]
