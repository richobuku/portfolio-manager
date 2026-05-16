from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0049_growth_snapshot_expanded_fields'),
    ]

    operations = [
        migrations.RenameField(
            model_name='msmereport',
            old_name='has_unbs',
            new_name='has_ursb',
        ),
    ]
