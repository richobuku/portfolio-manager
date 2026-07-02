from django.db import migrations


def drop_email_verified_if_exists(apps, schema_editor):
    db = schema_editor.connection.vendor
    if db == 'sqlite':
        conn = schema_editor.connection.connection
        cur = conn.execute("PRAGMA table_info(portfolio_usersecurityprofile)")
        cols = [row[1] for row in cur.fetchall()]
        if 'email_verified' in cols:
            schema_editor.execute(
                "ALTER TABLE portfolio_usersecurityprofile DROP COLUMN email_verified"
            )
    else:
        schema_editor.execute(
            "ALTER TABLE portfolio_usersecurityprofile DROP COLUMN IF EXISTS email_verified"
        )


class Migration(migrations.Migration):
    """
    Remove the email_verified column left behind in portfolio_usersecurityprofile
    when its source migration was reverted (commit 0fdf637 reverted 53a6fca).
    The UserSecurityProfile model no longer has this field, so the stale NOT-NULL
    column causes an IntegrityError when auto_create_bge_login tries to create a
    UserSecurityProfile during BGE save — silently breaking account auto-provisioning.
    """

    dependencies = [
        ('portfolio', '0073_remove_bge_allow_concurrent_work_orders'),
    ]

    operations = [
        migrations.RunPython(drop_email_verified_if_exists, migrations.RunPython.noop),
    ]
