from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0052_msme_report_markets_outside_district'),
    ]

    operations = [
        migrations.AlterField(
            model_name='msmereport',
            name='visit_type',
            field=models.CharField(
                choices=[
                    ('initial',          'Initial Assessment'),
                    ('followup',         'Follow-up Visit'),
                    ('final',            'Final Assessment'),
                    ('training',         'Training Support'),
                    ('mentoring',        'Mentoring Session'),
                    ('annual_review',    'Annual Review'),
                    ('quarterly_review', 'Quarterly Review'),
                ],
                default='followup',
                max_length=20,
            ),
        ),
    ]
