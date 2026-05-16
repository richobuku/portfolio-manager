from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0048_growth_snapshot_has_momo_pay'),
    ]

    operations = [
        # Rename has_unbs → has_ursb to reflect the correct regulator name
        migrations.RenameField(
            model_name='msmegrowthsnapshot',
            old_name='has_unbs',
            new_name='has_ursb',
        ),
        migrations.AddField(
            model_name='msmegrowthsnapshot',
            name='last_month_revenue',
            field=models.DecimalField(blank=True, decimal_places=2, help_text='Total sales/revenue in the last calendar month (UGX)', max_digits=18, null=True),
        ),
        migrations.AddField(
            model_name='msmegrowthsnapshot',
            name='tin_number',
            field=models.CharField(blank=True, default='', help_text='Uganda Revenue Authority TIN', max_length=50),
        ),
        migrations.AddField(
            model_name='msmegrowthsnapshot',
            name='ursb_reg_number',
            field=models.CharField(blank=True, default='', help_text='URSB registration number', max_length=50),
        ),
        migrations.AddField(
            model_name='msmegrowthsnapshot',
            name='bank_name',
            field=models.CharField(blank=True, default='', help_text='Name of the business bank', max_length=100),
        ),
        migrations.AddField(
            model_name='msmegrowthsnapshot',
            name='has_sacco',
            field=models.BooleanField(blank=True, help_text='Member of a SACCO', null=True),
        ),
    ]
