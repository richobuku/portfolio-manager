# Generated manually to backfill and sync MSME latitude/longitude from visit reports

from django.db import migrations


def sync_msme_gps_from_reports(apps, schema_editor):
    MSME = apps.get_model('portfolio', 'MSME')
    MSMEReport = apps.get_model('portfolio', 'MSMEReport')

    # Find all reports that have GPS coordinates
    reports_with_gps = (
        MSMEReport.objects
        .filter(visit_latitude__isnull=False, visit_longitude__isnull=False)
        .order_by('visit_date', 'id')
    )

    synced_count = 0
    for report in reports_with_gps:
        if report.msme:
            msme = report.msme
            msme.latitude = report.visit_latitude
            msme.longitude = report.visit_longitude
            msme.save(update_fields=['latitude', 'longitude'])
            synced_count += 1

    print(f"[Migration 0096] Synced GPS coordinates for {synced_count} MSME visit reports.")


def reverse_sync(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('portfolio', '0095_add_session_fk_to_participant_report'),
    ]

    operations = [
        migrations.RunPython(sync_msme_gps_from_reports, reverse_sync),
    ]
