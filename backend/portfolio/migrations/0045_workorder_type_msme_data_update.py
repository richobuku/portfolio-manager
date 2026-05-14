# Generated for WorkOrder.work_order_type choices update — adds the new
# 'msme_data_update' template (MSME Data Update & Verification).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0044_add_training_report'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workorder',
            name='work_order_type',
            field=models.CharField(
                choices=[
                    ('msme_support',          'MSME CRM & Business Support'),
                    ('msme_data_update',      'MSME Data Update & Verification'),
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
