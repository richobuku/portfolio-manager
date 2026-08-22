from django.db import migrations

def add_al_maghtas_msme(apps, schema_editor):
    MSME = apps.get_model('portfolio', 'MSME')
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    Cohort = apps.get_model('portfolio', 'Cohort')

    # 1. Get or create BGE Racheal Kobusinge
    bge = BusinessGrowthExpert.objects.filter(name__iexact='Racheal Kobusinge').first()
    if not bge:
        # Check next available BGE code
        last_bge = BusinessGrowthExpert.objects.order_by('-id').first()
        next_bge_id = (last_bge.id + 1) if last_bge else 1
        bge_code = f'PRUDEV II-BGE-010T-{next_bge_id:02d}'
        bge = BusinessGrowthExpert.objects.create(
            name='Racheal Kobusinge',
            bge_code=bge_code,
            status='approved',
            location='Kitgum',
        )

    # 2. Get Cohort
    cohort = Cohort.objects.filter(name__icontains='Agroprocessor').first()

    # 3. Create or update MSME Al-Maghtas
    msme = MSME.objects.filter(business_name__iexact='Al-Maghtas Investment Ltd').first()
    if not msme:
        # Determine unique MSME code
        last_msme = MSME.objects.order_by('-id').first()
        next_num = (last_msme.id + 1) if last_msme else 1
        code = f'PRUDEV2-GOPA-COHORT-{next_num:03d}'
        while MSME.objects.filter(msme_code=code).exists():
            next_num += 1
            code = f'PRUDEV2-GOPA-COHORT-{next_num:03d}'

        MSME.objects.create(
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
            assigned_bge=bge,
            is_active=True,
        )
    else:
        msme.business_category = 'agro_processor'
        msme.sector = 'AGRICULTURE'
        msme.cohort = cohort
        msme.assigned_bge = bge
        msme.owner_name = 'Angom Lilian'
        msme.phone = '0784547010 / 078879877 / 0774627026'
        msme.email = 'info@al-maghtasinvestment.com'
        msme.city = 'Kitgum'
        msme.address = 'Pado Division Pangum Cell'
        msme.country = 'Uganda'
        msme.save()

def remove_al_maghtas_msme(apps, schema_editor):
    MSME = apps.get_model('portfolio', 'MSME')
    MSME.objects.filter(business_name__iexact='Al-Maghtas Investment Ltd').delete()

class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0096_sync_msme_gps_from_reports'),
    ]

    operations = [
        migrations.RunPython(add_al_maghtas_msme, remove_al_maghtas_msme),
    ]
