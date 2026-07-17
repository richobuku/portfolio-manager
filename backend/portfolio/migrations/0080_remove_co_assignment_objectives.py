from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0079_co_assignment_objectives'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='msme',
            name='co_assignment_objectives',
        ),
    ]
