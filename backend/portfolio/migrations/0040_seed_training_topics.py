from django.db import migrations

TOPICS = [
    # (module_number, module_name, section_number, section_name)
    (1, 'Foundations of Formalization & Risk',      '1.1', 'Business Registration, Licensing & Tax Compliance'),
    (1, 'Foundations of Formalization & Risk',      '1.2', 'Standards, Certification & Brand Protection'),
    (1, 'Foundations of Formalization & Risk',      '1.3', 'Green Business Practices & Sustainability'),
    (2, 'Financial Management & Growth Strategy',   '2.1', 'Money Management, Bookkeeping & Access to Finance'),
    (2, 'Financial Management & Growth Strategy',   '2.2', 'Business Health Diagnosis & Strategic Growth Planning'),
    (3, 'Market Access & Digital Transformation',   '3.1', 'Customer Profiling, Marketing & Sales Channels'),
    (3, 'Market Access & Digital Transformation',   '3.2', 'Digital Tools, Mobile Money & Online Platforms'),
    (4, 'People & Operational Excellence',          '4.1', 'Operations, Process Improvement & Supply Chain'),
    (4, 'People & Operational Excellence',          '4.2', 'Human Resource Management & Compliance'),
    (4, 'People & Operational Excellence',          '4.3', 'Innovation, Business Model & Growth Mindset'),
]


def seed_topics(apps, schema_editor):
    TrainingTopic = apps.get_model('portfolio', 'TrainingTopic')
    for mod_num, mod_name, sec_num, sec_name in TOPICS:
        TrainingTopic.objects.update_or_create(
            name=sec_name,
            defaults={
                'module_number':  mod_num,
                'module_name':    mod_name,
                'section_number': sec_num,
            },
        )


def unseed_topics(apps, schema_editor):
    TrainingTopic = apps.get_model('portfolio', 'TrainingTopic')
    names = [t[3] for t in TOPICS]
    TrainingTopic.objects.filter(name__in=names).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0039_trainingtopic_module_fields'),
    ]

    operations = [
        migrations.RunPython(seed_topics, unseed_topics),
    ]
