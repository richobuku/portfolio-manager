from django.db import migrations
from django.contrib.postgres.operations import TrigramExtension
from django.contrib.postgres.indexes import GinIndex


class Migration(migrations.Migration):
    dependencies = [
        ('portfolio', '0086_multiday_attendance'),
    ]

    operations = [
        # Enable pg_trgm so GIN indexes can use trigram similarity for LIKE queries.
        TrigramExtension(),

        migrations.AddIndex(
            model_name='msme',
            index=GinIndex(
                fields=['business_name'],
                name='msme_business_name_gin',
                opclasses=['gin_trgm_ops'],
            ),
        ),
        migrations.AddIndex(
            model_name='msme',
            index=GinIndex(
                fields=['owner_name'],
                name='msme_owner_name_gin',
                opclasses=['gin_trgm_ops'],
            ),
        ),
        migrations.AddIndex(
            model_name='msme',
            index=GinIndex(
                fields=['msme_code'],
                name='msme_code_gin',
                opclasses=['gin_trgm_ops'],
            ),
        ),
    ]
