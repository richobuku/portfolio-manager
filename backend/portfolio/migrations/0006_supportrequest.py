# Generated by Django 5.2.1 on 2025-06-24 12:43

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0005_businessgrowthexpert_second_area_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='SupportRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('msme_name', models.CharField(max_length=200)),
                ('contact_email', models.EmailField(blank=True, max_length=254)),
                ('contact_phone', models.CharField(blank=True, max_length=20)),
                ('business_need', models.TextField()),
                ('location', models.CharField(blank=True, max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('matched_bges', models.ManyToManyField(blank=True, related_name='support_requests', to='portfolio.businessgrowthexpert')),
            ],
        ),
    ]
