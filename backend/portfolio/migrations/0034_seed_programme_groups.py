from django.db import migrations


GROUPS = [
    {'name': 'Main',           'color': '#1A2F4B'},
    {'name': 'Green MSMEs',    'color': '#2E7D32'},
    {'name': 'Agroprocessing', 'color': '#E65100'},
]


def seed_groups(apps, schema_editor):
    ProgrammeGroup = apps.get_model('portfolio', 'ProgrammeGroup')

    # Rename legacy 'Agroprocessors' → 'Agroprocessing' before creating groups
    # to avoid UNIQUE constraint collisions on re-runs.
    old = ProgrammeGroup.objects.filter(name='Agroprocessors').first()
    if old:
        if ProgrammeGroup.objects.filter(name='Agroprocessing').exists():
            old.delete()  # target already exists — drop the old spelling
        else:
            old.name = 'Agroprocessing'
            old.save()

    # Ensure all three canonical groups exist with the correct colours
    for g in GROUPS:
        obj, _ = ProgrammeGroup.objects.get_or_create(name=g['name'])
        if obj.color != g['color']:
            obj.color = g['color']
            obj.save()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0033_programme_groups'),
    ]

    operations = [
        migrations.RunPython(seed_groups, noop),
    ]
