from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0035_diagnostic_fields_and_growth_snapshots'),
    ]

    operations = [
        migrations.AlterField(
            model_name='msme',
            name='diag_annual_turnover',
            field=models.CharField(
                blank=True, default='', max_length=100,
                help_text='Total sales/turnover band from diagnostic tool (e.g. "10 – 100 million UGX")',
            ),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name='msme',
            name='diag_total_assets',
            field=models.CharField(
                blank=True, default='', max_length=100,
                help_text='Total assets band from diagnostic tool (e.g. "100 – 360 million UGX")',
            ),
            preserve_default=False,
        ),
    ]
