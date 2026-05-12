from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0036_turnover_band_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='businessgrowthexpert',
            name='signature_data',
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='workorder',
            name='signed_pdf_data',
            field=models.BinaryField(blank=True, null=True),
        ),
    ]
