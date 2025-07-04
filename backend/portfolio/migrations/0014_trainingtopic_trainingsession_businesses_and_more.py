# Generated by Django 5.2.1 on 2025-06-27 14:19

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0013_trainingsession_attendance'),
    ]

    operations = [
        migrations.CreateModel(
            name='TrainingTopic',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200, unique=True)),
                ('description', models.TextField(blank=True)),
            ],
        ),
        migrations.AddField(
            model_name='trainingsession',
            name='businesses',
            field=models.ManyToManyField(blank=True, related_name='sessions_attended', to='portfolio.msme'),
        ),
        migrations.AddField(
            model_name='trainingsession',
            name='topic',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sessions', to='portfolio.trainingtopic'),
        ),
    ]
