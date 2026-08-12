"""
Migration 0094 — Correct Jacob Odur's BGE code.

Migration 0092 set bge_code='PRUDEV II-BGE-JO-01' but the correct
code is 'PRUDEV II-BGE-010T-01'.
"""
from django.db import migrations


def fix_bge_code(apps, schema_editor):
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    BusinessGrowthExpert.objects.filter(name='Jacob Odur').update(
        bge_code='PRUDEV II-BGE-010T-01'
    )


def reverse_bge_code(apps, schema_editor):
    BusinessGrowthExpert = apps.get_model('portfolio', 'BusinessGrowthExpert')
    BusinessGrowthExpert.objects.filter(name='Jacob Odur').update(
        bge_code='PRUDEV II-BGE-JO-01'
    )


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0093_fix_jacob_odur_work_order'),
    ]

    operations = [
        migrations.RunPython(fix_bge_code, reverse_bge_code),
    ]
