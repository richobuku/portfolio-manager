from django.db import migrations


TOPICS = [
    {
        'name': 'Business Continuity Plan Training — MSMEs',
        'module_number': 0,
        'module_name': 'BCP Training',
        'section_number': '',
        'description': (
            'Training session for MSME owners and managers on Business Continuity Planning, '
            'covering risk identification, continuity strategies, and strategic planning tools.'
        ),
    },
    {
        'name': 'Business Continuity Plan Training — BGEs',
        'module_number': 0,
        'module_name': 'BCP Training',
        'section_number': '',
        'description': (
            'Capacity building session for Business Growth Experts (BGEs) on Business Continuity '
            'Planning, equipping them to facilitate BCP training and apply the BCP tool with MSMEs.'
        ),
    },
]


def add_topics(apps, schema_editor):
    TrainingTopic = apps.get_model('portfolio', 'TrainingTopic')
    for t in TOPICS:
        TrainingTopic.objects.get_or_create(name=t['name'], defaults={k: v for k, v in t.items() if k != 'name'})


def remove_topics(apps, schema_editor):
    TrainingTopic = apps.get_model('portfolio', 'TrainingTopic')
    TrainingTopic.objects.filter(name__in=[t['name'] for t in TOPICS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0084_add_bcp_tool_training_topic'),
    ]

    operations = [
        migrations.RunPython(add_topics, remove_topics),
    ]
