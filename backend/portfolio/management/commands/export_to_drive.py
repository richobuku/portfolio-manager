"""
Management command: export BGE reports to Google Drive.

Usage:
    python manage.py export_to_drive
    python manage.py export_to_drive --bge 42          # single BGE by ID
    python manage.py export_to_drive --force           # re-upload even if file exists
    python manage.py export_to_drive --dry-run         # list what would be uploaded
"""

import io
import os
import re

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

SERVICE_ACCOUNT_PATH = os.path.join(
    os.path.dirname(settings.BASE_DIR), 'backend', 'drive_service_account.json'
)
ROOT_FOLDER_NAME = 'PRUDEV II - BGE Reports'
SCOPES = ['https://www.googleapis.com/auth/drive']


def _safe_name(name: str) -> str:
    """Strip characters that are illegal in Drive file names."""
    return re.sub(r'[\\/:*?"<>|]', '_', name).strip()


def _drive_service():
    import json
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    # Prefer env var (Render/production) — falls back to local JSON file
    raw = os.environ.get('GOOGLE_DRIVE_CREDENTIALS')
    if raw:
        info = json.loads(raw)
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    else:
        key_path = SERVICE_ACCOUNT_PATH
        if not os.path.exists(key_path):
            key_path = os.path.join(settings.BASE_DIR, '..', 'drive_service_account.json')
        if not os.path.exists(key_path):
            raise CommandError(
                'Google Drive credentials not found. '
                'Set the GOOGLE_DRIVE_CREDENTIALS environment variable (JSON contents) '
                'or place drive_service_account.json in the backend/ directory.'
            )
        creds = service_account.Credentials.from_service_account_file(key_path, scopes=SCOPES)

    return build('drive', 'v3', credentials=creds, cache_discovery=False)


def _find_folder(service, name, parent_id=None):
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    results = service.files().list(q=q, fields='files(id, name)', pageSize=10).execute()
    files = results.get('files', [])
    return files[0]['id'] if files else None


def _ensure_folder(service, name, parent_id=None):
    folder_id = _find_folder(service, name, parent_id)
    if folder_id:
        return folder_id
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        meta['parents'] = [parent_id]
    folder = service.files().create(body=meta, fields='id').execute()
    return folder['id']


def _file_exists(service, name, parent_id):
    q = (
        f"name='{name}' and '{parent_id}' in parents "
        f"and mimeType='application/pdf' and trashed=false"
    )
    results = service.files().list(q=q, fields='files(id)', pageSize=5).execute()
    return bool(results.get('files'))


def _upload_pdf(service, name, pdf_bytes, parent_id, force=False):
    from googleapiclient.http import MediaIoBaseUpload

    if not force and _file_exists(service, name, parent_id):
        return 'skipped'

    media = MediaIoBaseUpload(io.BytesIO(pdf_bytes), mimetype='application/pdf', resumable=False)
    meta = {'name': name, 'parents': [parent_id]}
    service.files().create(body=meta, media_body=media, fields='id').execute()
    return 'uploaded'


class Command(BaseCommand):
    help = 'Export all BGE reports (work orders, training, mentor) to Google Drive.'

    def add_arguments(self, parser):
        parser.add_argument('--bge', type=int, help='Export only this BGE (by database ID)')
        parser.add_argument('--force', action='store_true',
                            help='Re-upload files that already exist in Drive')
        parser.add_argument('--dry-run', action='store_true',
                            help='Show what would be uploaded without actually uploading')

    def handle(self, *args, **options):
        from portfolio.models import BusinessGrowthExpert, WorkOrder, TrainingReport, MentorTrainingReport
        from portfolio.pdf_reports import render_work_order, render_training_report, render_mentor_report

        force = options['force']
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — nothing will be uploaded.\n'))

        # ── Connect to Drive ──────────────────────────────────────────────────
        if not dry_run:
            service = _drive_service()
            root_id = _find_folder(service, ROOT_FOLDER_NAME)
            if not root_id:
                raise CommandError(
                    f'Root folder "{ROOT_FOLDER_NAME}" not found in Drive. '
                    'Create it and share it with the service account.'
                )
            self.stdout.write(f'Root folder found: {ROOT_FOLDER_NAME} ({root_id})\n')
        else:
            service = None
            root_id = None

        # ── Select BGEs ───────────────────────────────────────────────────────
        qs = BusinessGrowthExpert.objects.all().order_by('name')
        if options['bge']:
            qs = qs.filter(pk=options['bge'])
            if not qs.exists():
                raise CommandError(f'No active BGE with ID {options["bge"]}')

        totals = {'uploaded': 0, 'skipped': 0, 'errors': 0}

        for bge in qs:
            bge_label = _safe_name(f'{bge.name} ({bge.bge_code})')
            self.stdout.write(self.style.HTTP_INFO(f'\n── {bge_label}'))

            if not dry_run:
                bge_folder = _ensure_folder(service, bge_label, root_id)
                wo_folder   = _ensure_folder(service, 'Work Orders', bge_folder)
                rep_folder  = _ensure_folder(service, 'Reports', bge_folder)
                lead_folder = _ensure_folder(service, 'Lead Training Reports', rep_folder)
                ment_folder = _ensure_folder(service, 'Mentor Reports', rep_folder)
            else:
                bge_folder = wo_folder = rep_folder = lead_folder = ment_folder = None

            # ── Work Orders ───────────────────────────────────────────────────
            work_orders = WorkOrder.objects.filter(bge=bge).order_by('issue_date')
            self.stdout.write(f'   Work orders: {work_orders.count()}')
            for wo in work_orders:
                fname = _safe_name(
                    f'WO_{wo.work_order_number}_{wo.issue_date}.pdf'
                )
                if dry_run:
                    self.stdout.write(f'     [dry] Work Orders/{fname}')
                    continue
                try:
                    buf = render_work_order(wo)
                    result = _upload_pdf(service, fname, buf.getvalue(), wo_folder, force)
                    totals[result] += 1
                    icon = '✓' if result == 'uploaded' else '–'
                    self.stdout.write(f'     {icon} Work Orders/{fname} [{result}]')
                except Exception as exc:
                    totals['errors'] += 1
                    self.stderr.write(f'     ✗ {fname}: {exc}')

            # ── Lead Training Reports ─────────────────────────────────────────
            training_reports = TrainingReport.objects.filter(bge=bge).order_by('created_at')
            self.stdout.write(f'   Lead training reports: {training_reports.count()}')
            for tr in training_reports:
                date_str = tr.created_at.strftime('%Y-%m-%d')
                fname = _safe_name(
                    f'LeadTraining_{tr.training_title or "Report"}_{date_str}_{tr.pk}.pdf'
                )
                if dry_run:
                    self.stdout.write(f'     [dry] Lead Training Reports/{fname}')
                    continue
                try:
                    buf = render_training_report(tr)
                    result = _upload_pdf(service, fname, buf.getvalue(), lead_folder, force)
                    totals[result] += 1
                    icon = '✓' if result == 'uploaded' else '–'
                    self.stdout.write(f'     {icon} Lead Training Reports/{fname} [{result}]')
                except Exception as exc:
                    totals['errors'] += 1
                    self.stderr.write(f'     ✗ {fname}: {exc}')

            # ── Mentor Reports ────────────────────────────────────────────────
            mentor_reports = MentorTrainingReport.objects.filter(bge=bge).order_by('created_at')
            self.stdout.write(f'   Mentor reports: {mentor_reports.count()}')
            for mr in mentor_reports:
                date_str = mr.created_at.strftime('%Y-%m-%d')
                fname = _safe_name(
                    f'MentorReport_{mr.training_title or "Report"}_{date_str}_{mr.pk}.pdf'
                )
                if dry_run:
                    self.stdout.write(f'     [dry] Mentor Reports/{fname}')
                    continue
                try:
                    buf = render_mentor_report(mr)
                    result = _upload_pdf(service, fname, buf.getvalue(), ment_folder, force)
                    totals[result] += 1
                    icon = '✓' if result == 'uploaded' else '–'
                    self.stdout.write(f'     {icon} Mentor Reports/{fname} [{result}]')
                except Exception as exc:
                    totals['errors'] += 1
                    self.stderr.write(f'     ✗ {fname}: {exc}')

        # ── Summary ───────────────────────────────────────────────────────────
        self.stdout.write('\n' + '─' * 50)
        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run complete. No files were uploaded.'))
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Done.  Uploaded: {totals["uploaded"]}  '
                    f'Skipped: {totals["skipped"]}  '
                    f'Errors: {totals["errors"]}'
                )
            )
