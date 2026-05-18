from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0056_msme_report_data_quality_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='workorder',
            name='created_by',
            field=models.ForeignKey(
                blank=True,
                help_text='Admin/PM account that issued this work order',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='created_work_orders',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
