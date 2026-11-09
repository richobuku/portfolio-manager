# Generated for secondary_categories on FinancialImprovementActionPlan

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0131_alter_workorder_work_order_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='financialimprovementactionplan',
            name='secondary_categories',
            field=models.JSONField(blank=True, default=list, help_text='Additional action point areas addressed by this plan'),
        ),
    ]

