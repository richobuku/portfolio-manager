"""
Consolidate TrainingFacilitationAssignment with TrainingSession team fields.

Changes:
- TrainingFacilitationAssignment gains: session FK, role, work_order FK
- Drops unique_together constraint
- Data migration: converts session.lead_bge / mentor_bges into assignments
- TrainingSession drops: lead_bge, work_order, mentor_bges M2M, mentor_work_orders M2M
"""
from django.db import migrations, models
import django.db.models.deletion


def migrate_sessions_to_assignments(apps, schema_editor):
    TrainingSession = apps.get_model('portfolio', 'TrainingSession')
    TrainingFacilitationAssignment = apps.get_model('portfolio', 'TrainingFacilitationAssignment')

    for session in TrainingSession.objects.prefetch_related(
        'mentor_bges', 'mentor_work_orders'
    ).select_related('lead_bge', 'work_order', 'topic'):
        # Build a map of bge_id → work_order for mentors
        mentor_wo_map = {wo.bge_id: wo for wo in session.mentor_work_orders.all() if wo.bge_id}

        # Lead BGE → lead assignment
        if session.lead_bge_id:
            TrainingFacilitationAssignment.objects.get_or_create(
                bge_id=session.lead_bge_id,
                session=session,
                role='lead',
                defaults={
                    'topic': session.topic,
                    'work_order': session.work_order,
                    'assigned_date': session.date,
                },
            )

        # Mentor BGEs → mentor assignments
        for bge in session.mentor_bges.all():
            TrainingFacilitationAssignment.objects.get_or_create(
                bge=bge,
                session=session,
                role='mentor',
                defaults={
                    'topic': session.topic,
                    'work_order': mentor_wo_map.get(bge.id),
                    'assigned_date': session.date,
                },
            )


def reverse_migration(apps, schema_editor):
    pass  # non-reversible data migration


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0060_email_send_log'),
    ]

    operations = [
        # 1. Add new fields to TrainingFacilitationAssignment
        migrations.AddField(
            model_name='trainingfacilitationassignment',
            name='session',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='facilitation_assignments',
                to='portfolio.trainingsession',
            ),
        ),
        migrations.AddField(
            model_name='trainingfacilitationassignment',
            name='role',
            field=models.CharField(
                choices=[('lead', 'Lead Facilitator'), ('mentor', 'Mentor')],
                default='lead', max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='trainingfacilitationassignment',
            name='work_order',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='facilitation_assignments',
                to='portfolio.workorder',
            ),
        ),

        # 2. Drop unique_together constraint
        migrations.AlterUniqueTogether(
            name='trainingfacilitationassignment',
            unique_together=set(),
        ),

        # 3. Data migration
        migrations.RunPython(migrate_sessions_to_assignments, reverse_migration),

        # 4. Remove old fields from TrainingSession
        migrations.RemoveField(model_name='trainingsession', name='lead_bge'),
        migrations.RemoveField(model_name='trainingsession', name='work_order'),
        migrations.RemoveField(model_name='trainingsession', name='mentor_bges'),
        migrations.RemoveField(model_name='trainingsession', name='mentor_work_orders'),
    ]
