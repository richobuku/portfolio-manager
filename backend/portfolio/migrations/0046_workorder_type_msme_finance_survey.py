# Generated for WorkOrder.work_order_type choices update — adds the new
# 'msme_finance_survey' template (MSME Finance Survey via Google Forms).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0045_workorder_type_msme_data_update'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workorder',
            name='work_order_type',
            field=models.CharField(
                choices=[
                    ('msme_support',          'MSME CRM & Business Support'),
                    ('msme_data_update',      'MSME Data Update & Verification'),
                    ('msme_finance_survey',   'MSME Finance Survey (Google Forms)'),
                    ('mobilisation',          'Mobilisation / Outreach'),
                    ('group_session',         'Peer-to-Peer Group Session'),
                    ('training_facilitation', 'Training Facilitation — Senior BGE'),
                    ('other',                 'Other'),
                ],
                default='msme_support',
                max_length=30,
            ),
        ),
    ]
