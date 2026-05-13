from django.db import migrations

# Names that were incorrectly added as VisitReportTemplate records
# instead of TrainingTopic records.
TRAINING_MODULE_NAMES = [
    # Module-level names
    'Foundations of Formalization & Risk',
    'Financial Management & Growth Strategy',
    'Market Access & Digital Transformation',
    'People & Operational Excellence',
    # Section-level names
    'Business Registration, Licensing & Tax Compliance',
    'Standards, Certification & Brand Protection',
    'Green Business Practices & Sustainability',
    'Money Management, Bookkeeping & Access to Finance',
    'Business Health Diagnosis & Strategic Growth Planning',
    'Customer Profiling, Marketing & Sales Channels',
    'Digital Tools, Mobile Money & Online Platforms',
    'Operations, Process Improvement & Supply Chain',
    'Human Resource Management & Compliance',
    'Innovation, Business Model & Growth Mindset',
]


def remove_incorrectly_placed_topics(apps, schema_editor):
    VisitReportTemplate = apps.get_model('portfolio', 'VisitReportTemplate')
    deleted, _ = VisitReportTemplate.objects.filter(name__in=TRAINING_MODULE_NAMES).delete()
    if deleted:
        print(f'  Removed {deleted} training module(s) from VisitReportTemplate.')


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0041_seed_training_module_topics'),
    ]

    operations = [
        migrations.RunPython(remove_incorrectly_placed_topics, migrations.RunPython.noop),
    ]
