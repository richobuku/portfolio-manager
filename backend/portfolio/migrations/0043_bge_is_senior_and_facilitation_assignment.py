import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0042_remove_training_modules_from_visit_templates'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='businessgrowthexpert',
            name='is_senior',
            field=models.BooleanField(default=False, help_text='Designate as Senior BGE (can be assigned training facilitation)'),
        ),
        migrations.CreateModel(
            name='TrainingFacilitationAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assigned_date', models.DateField()),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('bge', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='facilitation_assignments',
                    to='portfolio.businessgrowthexpert',
                )),
                ('topic', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='facilitation_assignments',
                    to='portfolio.trainingtopic',
                )),
                ('assigned_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='training_assignments_made',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['topic__module_number', 'topic__section_number', 'bge__name'],
                'unique_together': {('bge', 'topic')},
            },
        ),
    ]
