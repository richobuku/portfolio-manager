from django.db import migrations, models
from django.db.models import Q

def sync_al_maghtas_full_details(apps, schema_editor):
    MSME = apps.get_model('portfolio', 'MSME')
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    Cohort = apps.get_model('portfolio', 'Cohort')

    bge = BusinessGrowthExpert.objects.filter(
        Q(name__icontains='kopbusinge') |
        Q(name__icontains='kobusinge') |
        Q(name__icontains='racheal') |
        Q(name__icontains='rachael')
    ).order_by('id').first()

    if not bge:
        last_bge = BusinessGrowthExpert.objects.order_by('-id').first()
        next_bge_id = (last_bge.id + 1) if last_bge else 1
        bge = BusinessGrowthExpert.objects.create(
            name='Racheal Kobusinge',
            bge_code=f'PRUDEV II-BGE-010T-{next_bge_id:02d}',
            status='approved',
            location='Kitgum',
        )

    cohort = Cohort.objects.filter(
        Q(name__icontains='Agroprocessor') |
        Q(name__icontains='Agro-processing') |
        Q(name__icontains='Agro processing') |
        Q(name__icontains='Agro')
    ).first()

    msme = MSME.objects.filter(
        Q(business_name__icontains='maghtas') |
        Q(business_name__icontains='magtas') |
        Q(owner_name__icontains='Angom Lilian')
    ).first()

    if not msme:
        last_msme = MSME.objects.order_by('-id').first()
        next_num = (last_msme.id + 1) if last_msme else 1
        code = f'PRUDEV2-GOPA-COHORT-{next_num:03d}'
        while MSME.objects.filter(msme_code=code).exists():
            next_num += 1
            code = f'PRUDEV2-GOPA-COHORT-{next_num:03d}'

        msme = MSME.objects.create(
            msme_code=code,
            business_name='Al-Maghtas Investments Ltd',
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
        msme.business_name = 'Al-Maghtas Investments Ltd'
        msme.business_category = 'agro_processor'
        msme.sector = 'AGRICULTURE'
        if cohort:
            msme.cohort = cohort
        if bge:
            msme.assigned_bge = bge
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
        ('portfolio', '0099_groupreport_payment_confirmed_at_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='msme',
            name='phone',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.RunPython(sync_al_maghtas_full_details, noop_reverse),
    ]
