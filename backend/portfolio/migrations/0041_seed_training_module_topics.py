from django.db import migrations

MODULE_TOPICS = [
    (1, 'Foundations of Formalization & Risk'),
    (2, 'Financial Management & Growth Strategy'),
    (3, 'Market Access & Digital Transformation'),
    (4, 'People & Operational Excellence'),
]


def seed(apps, schema_editor):
    TrainingTopic = apps.get_model('portfolio', 'TrainingTopic')
    for mod_num, mod_name in MODULE_TOPICS:
        TrainingTopic.objects.update_or_create(
            name=mod_name,
            defaults={
                'module_number':  mod_num,
                'module_name':    mod_name,
                'section_number': '',
            },
        )


def unseed(apps, schema_editor):
    TrainingTopic = apps.get_model('portfolio', 'TrainingTopic')
    TrainingTopic.objects.filter(name__in=[m[1] for m in MODULE_TOPICS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0040_seed_training_topics'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
