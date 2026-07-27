from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0085_add_bcp_training_topics_msme_and_bge'),
    ]

    operations = [
        migrations.AddField(
            model_name='trainingsession',
            name='end_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='attendance',
            name='attendance_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
