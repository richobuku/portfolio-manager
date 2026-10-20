from django.db import migrations
from django.utils import timezone


def configure_reviewers(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    User = apps.get_model('auth', 'User')
    UserSecurityProfile = apps.get_model('portfolio', 'UserSecurityProfile')

    viewer_group, _ = Group.objects.get_or_create(name='Viewer')

    # Configure Mathias
    mathias_users = list(User.objects.filter(username__iexact='mathias'))
    if not mathias_users:
        mathias_by_email = User.objects.filter(email__iexact='mathias@gopa.eu').first()
        if mathias_by_email:
            mathias_users = [mathias_by_email]
        else:
            u = User.objects.create(
                username='mathias',
                email='mathias@gopa.eu',
                first_name='Mathias',
                last_name='Arimpa',
                is_active=True,
                password='!',
            )
            mathias_users = [u]

    for u in mathias_users:
        u.is_active = True
        u.save(update_fields=['is_active'])
        u.groups.add(viewer_group)
        sec, _ = UserSecurityProfile.objects.get_or_create(user=u)
        sec.viewer_approved = True
        sec.must_change_password = False
        sec.password_last_changed = timezone.now()
        sec.save(update_fields=['viewer_approved', 'must_change_password', 'password_last_changed'])

    # Configure Stephen
    stephen_query = User.objects.filter(
        username__in=['stephen.opwonya', 'Stephen', 'stephen']
    ) | User.objects.filter(
        email__in=['stephenmaxi.opwonya@gopa.eu', 'stephen.opwonyamaxi@gopa.eu']
    )

    for u in stephen_query.distinct():
        u.is_active = True
        u.save(update_fields=['is_active'])
        u.groups.add(viewer_group)
        sec, _ = UserSecurityProfile.objects.get_or_create(user=u)
        sec.viewer_approved = True
        sec.must_change_password = False
        sec.password_last_changed = timezone.now()
        sec.save(update_fields=['viewer_approved', 'must_change_password', 'password_last_changed'])

    # Ensure all approved viewers without BGE/CohortAdmin profiles are in the Viewer group
    for sec in UserSecurityProfile.objects.filter(viewer_approved=True):
        u = sec.user
        if not (u.is_staff or u.is_superuser or hasattr(u, 'cohort_admin_profile') or hasattr(u, 'bge_profile')):
            u.groups.add(viewer_group)


def revert_reviewers(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0128_enterpriseimprovementplanmeeting'),
    ]

    operations = [
        migrations.RunPython(configure_reviewers, revert_reviewers),
    ]
