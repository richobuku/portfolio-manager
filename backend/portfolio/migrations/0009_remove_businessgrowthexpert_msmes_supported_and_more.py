# Generated by Django 5.2.1 on 2025-06-25 11:10

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0008_businessgrowthexpert_status'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='businessgrowthexpert',
            name='msmes_supported',
        ),
        migrations.AddField(
            model_name='businessgrowthexpert',
            name='latitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='businessgrowthexpert',
            name='longitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
    ]
