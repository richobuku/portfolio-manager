from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0038_visit_templates_and_report_metrics'),
    ]

    operations = [
        migrations.AddField(
            model_name='trainingtopic',
            name='module_number',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='trainingtopic',
            name='module_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='trainingtopic',
            name='section_number',
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.AlterModelOptions(
            name='trainingtopic',
            options={'ordering': ['module_number', 'section_number']},
        ),
    ]
