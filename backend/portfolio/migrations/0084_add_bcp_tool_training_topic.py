from django.db import migrations


def add_bcp_topic(apps, schema_editor):
    TrainingTopic = apps.get_model('portfolio', 'TrainingTopic')
    TrainingTopic.objects.get_or_create(
        name='Business Continuity Plan Tool Training',
        defaults={
            'module_number': 0,
            'module_name': 'BCP Tool Training',
            'section_number': '',
            'description': (
                'Capacity building session for Business Growth Experts (BGEs) on the '
                'Business Continuity Planning (BCP) tool, covering orientation, strategic '
                'planning, enterprise risk assessment exercises, and participant evaluation.'
            ),
        },
    )


def remove_bcp_topic(apps, schema_editor):
    TrainingTopic = apps.get_model('portfolio', 'TrainingTopic')
    TrainingTopic.objects.filter(name='Business Continuity Plan Tool Training').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0083_add_bge_participants_to_training_session'),
    ]

    operations = [
        migrations.RunPython(add_bcp_topic, remove_bcp_topic),
    ]
