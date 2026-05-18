from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0055_restructure_visit_report_fields'),
    ]

    operations = [
        # Add data_update as a first-class visit type (already in DB values via 0053,
        # this migration updates the choices list ordering only — no schema change needed).
        # New data-quality fields for annual_review (and data_update) visits:
        migrations.AddField(
            model_name='msmereport',
            name='data_confidence_level',
            field=models.CharField(
                blank=True, max_length=30,
                choices=[
                    ('confirmed',        'Confirmed — figures from actual records'),
                    ('mostly_confident', 'Mostly confident — minor estimates only'),
                    ('mixed',            'Mixed — owner unsure on several items'),
                    ('largely_estimated','Largely estimated — few actual records'),
                    ('unreliable',       'Unreliable — mostly guessing'),
                ],
                help_text='BGE assessment of overall data reliability for this visit',
            ),
        ),
        migrations.AddField(
            model_name='msmereport',
            name='records_sighted',
            field=models.BooleanField(
                null=True, blank=True,
                help_text='BGE physically saw business records / books',
            ),
        ),
        migrations.AddField(
            model_name='msmereport',
            name='owner_certainty_observation',
            field=models.TextField(
                blank=True,
                help_text='Qualitative notes on how confident the owner was when answering — '
                          'what they were unsure about, where they appeared to guess',
            ),
        ),
        migrations.AddField(
            model_name='msmereport',
            name='data_collection_challenges',
            field=models.TextField(
                blank=True,
                help_text='Difficulties encountered during data collection '
                          '(reluctance, missing records, conflicting figures, etc.)',
            ),
        ),
        # Add annual_review as an explicit active visit type alongside data_update
        migrations.AlterField(
            model_name='msmereport',
            name='visit_type',
            field=models.CharField(
                max_length=20, default='followup',
                choices=[
                    ('data_update',      'Data Collection Visit'),
                    ('one_on_one',       'One-on-One Visit'),
                    ('training',         'Training Visit'),
                    ('coaching',         'Business Coaching Visit'),
                    ('annual_review',    'Annual Review'),
                    ('initial',          'Initial Assessment'),
                    ('followup',         'Follow-up Visit'),
                    ('final',            'Final Assessment'),
                    ('mentoring',        'Mentoring Session'),
                    ('quarterly_review', 'Quarterly Review'),
                ],
            ),
        ),
    ]
