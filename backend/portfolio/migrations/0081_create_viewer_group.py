from django.db import migrations


def create_viewer_group_and_assign(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    User = apps.get_model('auth', 'User')
    viewer_group, _ = Group.objects.get_or_create(name='Viewer')
    # Accounts that were legitimate viewers under the old implicit rule
    for username in ('stephen.opwonya',):
        try:
            u = User.objects.get(username=username)
            u.groups.add(viewer_group)
        except User.DoesNotExist:
            pass


def remove_viewer_group(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.filter(name='Viewer').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0080_remove_co_assignment_objectives'),
    ]

    operations = [
        migrations.RunPython(create_viewer_group_and_assign, remove_viewer_group),
    ]
