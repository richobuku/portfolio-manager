from django.db import migrations


def make_jimmy_ouni_admin(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    try:
        user = User.objects.get(username='jimmy.ouni')
        user.is_staff = True
        user.is_superuser = True
        user.save(update_fields=['is_staff', 'is_superuser'])
    except User.DoesNotExist:
        pass


def reverse_jimmy_ouni_admin(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    try:
        user = User.objects.get(username='jimmy.ouni')
        user.is_staff = False
        user.is_superuser = False
        user.save(update_fields=['is_staff', 'is_superuser'])
    except User.DoesNotExist:
        pass


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0123_add_tbip_help_needed_fields'),
    ]

    operations = [
        migrations.RunPython(make_jimmy_ouni_admin, reverse_jimmy_ouni_admin),
    ]
