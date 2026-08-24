from django.db import migrations, models


def set_initial_statuses(apps, schema_editor):
    MSME = apps.get_model('portfolio', 'MSME')
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')

    # Populate MSME statuses
    MSME.objects.filter(is_active=True).update(status='active')
    MSME.objects.filter(is_active=False).update(status='unavailable')

    # Populate / standardize BGE statuses
    BusinessGrowthExpert.objects.filter(status='approved').update(status='active')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0100_alter_msme_phone'),
    ]

    operations = [
        migrations.AddField(
            model_name='msme',
            name='status',
            field=models.CharField(
                choices=[
                    ('active', 'Active'),
                    ('temporarily_closed', 'Temporarily Closed'),
                    ('out_of_business', 'Out of Business'),
                    ('unavailable', 'Unavailable'),
                ],
                db_index=True,
                default='active',
                help_text='Operational status: Active, Temporarily Closed, Out of Business, Unavailable',
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name='businessgrowthexpert',
            name='status',
            field=models.CharField(
                choices=[
                    ('active', 'Active'),
                    ('temporarily_closed', 'Temporarily Closed'),
                    ('out_of_business', 'Out of Business'),
                    ('unavailable', 'Unavailable'),
                    ('approved', 'Approved'),
                    ('pending', 'Pending Approval'),
                    ('rejected', 'Rejected'),
                ],
                db_index=True,
                default='active',
                help_text='Operational/Account status: Active, Temporarily Closed, Out of Business, Unavailable',
                max_length=30,
            ),
        ),
        migrations.RunPython(set_initial_statuses, noop_reverse),
    ]
