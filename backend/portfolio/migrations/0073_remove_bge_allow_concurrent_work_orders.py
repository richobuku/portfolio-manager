from django.db import migrations


def drop_column_if_exists(apps, schema_editor):
    db = schema_editor.connection.vendor
    if db == 'sqlite':
        conn = schema_editor.connection.connection
        cur = conn.execute("PRAGMA table_info(portfolio_businessgrowthexpert)")
        cols = [row[1] for row in cur.fetchall()]
        if 'allow_concurrent_work_orders' in cols:
            schema_editor.execute(
                "ALTER TABLE portfolio_businessgrowthexpert DROP COLUMN allow_concurrent_work_orders"
            )
    else:
        schema_editor.execute(
            "ALTER TABLE portfolio_businessgrowthexpert DROP COLUMN IF EXISTS allow_concurrent_work_orders"
        )


class Migration(migrations.Migration):
    """
    Remove the allow_concurrent_work_orders column left behind in the DB when
    its migration was reverted (commit 0fdf637). The model no longer has this
    field, so the stale NOT-NULL column causes an IntegrityError on every BGE
    INSERT (manual add and Excel upload both fail).
    """

    dependencies = [
        ('portfolio', '0072_add_biz_continuity_workshop_type'),
    ]

    operations = [
        migrations.RunPython(drop_column_if_exists, migrations.RunPython.noop),
    ]
