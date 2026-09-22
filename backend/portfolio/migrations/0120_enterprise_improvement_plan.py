import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0119_alter_msmereport_coaching_focus_area'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EnterpriseImprovementPlan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assessment_date', models.DateField(help_text='Date of diagnostic assessment')),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('approved', 'Approved'), ('rejected', 'Rejected')], default='draft', max_length=20)),
                ('assessment_answers', models.JSONField(blank=True, default=dict)),
                ('diagnostic_snapshot', models.JSONField(blank=True, default=dict)),
                ('gap_notes', models.JSONField(blank=True, default=dict)),
                ('priority_actions', models.JSONField(blank=True, default=list)),
                ('overall_priority', models.CharField(choices=[('Low', 'Low'), ('Medium', 'Medium'), ('High', 'High')], default='Low', max_length=20)),
                ('bge_signed', models.BooleanField(default=False)),
                ('bge_signed_at', models.DateField(blank=True, null=True)),
                ('bge_sign_off_name', models.CharField(blank=True, max_length=255)),
                ('hoa_approved_at', models.DateField(blank=True, null=True)),
                ('hoa_sign_off_name', models.CharField(blank=True, max_length=255)),
                ('hoa_notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('bge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='enterprise_improvement_plans', to='portfolio.businessgrowthexpert')),
                ('hoa_approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='approved_improvement_plans', to=settings.AUTH_USER_MODEL)),
                ('msme', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='enterprise_improvement_plans', to='portfolio.msme')),
            ],
            options={
                'verbose_name': 'Enterprise Improvement Plan',
                'verbose_name_plural': 'Enterprise Improvement Plans',
                'ordering': ['-assessment_date', '-created_at'],
            },
        ),
    ]
