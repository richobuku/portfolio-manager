"""
Management command: export BGE reports to Google Drive.

Usage:
    python manage.py export_to_drive
    python manage.py export_to_drive --bge 42          # single BGE by ID
    python manage.py export_to_drive --force           # re-upload even if file exists
    python manage.py export_to_drive --dry-run         # list what would be uploaded

Folder structure per BGE:
    {BGE Name} ({Code})/
    ├── Work Orders/
    ├── Visit Reports/
    ├── Timesheets/
    ├── Invoices/
    └── Reports/
        ├── Lead Training Reports/
        └── Mentor Reports/
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
PHOTOS_ROOT_FOLDER_NAME = 'PRUDEV II - BGE Photos'
SCOPES = ['https://www.googleapis.com/auth/drive']


def _safe_name(name: str) -> str:
    """Strip characters illegal in Drive file names."""
    return re.sub(r'[\\/:*?"<>|]', '_', name).strip()


def _drive_service():
    """
    Build a Drive API client.

    Priority:
      1. OAuth2 refresh token (GOOGLE_OAUTH2_* env vars) — works with personal Gmail,
         uploads count against the real user's quota.
      2. Service account JSON (GOOGLE_DRIVE_CREDENTIALS env var or local file) —
         only works with Shared Drives / Google Workspace.
    """
    from googleapiclient.discovery import build

    client_id     = os.environ.get('GOOGLE_OAUTH2_CLIENT_ID')
    client_secret = os.environ.get('GOOGLE_OAUTH2_CLIENT_SECRET')
    refresh_token = os.environ.get('GOOGLE_OAUTH2_REFRESH_TOKEN')

    if client_id and client_secret and refresh_token:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request

        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri='https://oauth2.googleapis.com/token',
            client_id=client_id,
            client_secret=client_secret,
            scopes=SCOPES,
        )
        creds.refresh(Request())
        return build('drive', 'v3', credentials=creds, cache_discovery=False)

    # Fallback: service account (requires Shared Drive or Google Workspace)
    import json
    from google.oauth2 import service_account

    raw = os.environ.get('GOOGLE_DRIVE_CREDENTIALS')
    if raw:
        import base64
        raw = raw.strip()
        try:
            decoded = base64.b64decode(raw).decode('utf-8')
            info = json.loads(decoded)
        except Exception:
            info = json.loads(raw)
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    else:
        key_path = SERVICE_ACCOUNT_PATH
        if not os.path.exists(key_path):
            key_path = os.path.join(settings.BASE_DIR, '..', 'drive_service_account.json')
        if not os.path.exists(key_path):
            raise CommandError(
                'No Google Drive credentials found. Set GOOGLE_OAUTH2_CLIENT_ID, '
                'GOOGLE_OAUTH2_CLIENT_SECRET, and GOOGLE_OAUTH2_REFRESH_TOKEN in Render, '
                'or run backend/get_drive_token.py to generate them.'
            )
        creds = service_account.Credentials.from_service_account_file(key_path, scopes=SCOPES)

    return build('drive', 'v3', credentials=creds, cache_discovery=False)


def _find_folder(service, name, parent_id=None):
    safe_name = name.replace('\\', '\\\\').replace("'", "\\'")
    q = f"name='{safe_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    try:
        results = service.files().list(q=q, fields='files(id, name)', pageSize=10).execute()
        files = results.get('files', [])
        return files[0]['id'] if files else None
    except Exception:
        return None


def _ensure_folder(service, name, parent_id=None):
    folder_id = _find_folder(service, name, parent_id)
    if folder_id:
        return folder_id
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        meta['parents'] = [parent_id]
    folder = service.files().create(body=meta, fields='id').execute()
    return folder['id']


def _file_exists(service, name, parent_id, mimetype=None):
    safe_name = name.replace('\\', '\\\\').replace("'", "\\'")
    mime_clause = f" and mimeType='{mimetype}'" if mimetype else ''
    q = f"name='{safe_name}' and '{parent_id}' in parents{mime_clause} and trashed=false"
    try:
        results = service.files().list(q=q, fields='files(id)', pageSize=5).execute()
        return bool(results.get('files'))
    except Exception:
        return False


def _upload_bytes(service, name, data_bytes, mimetype, parent_id, force=False):
    from googleapiclient.http import MediaIoBaseUpload

    if not force:
        try:
            if _file_exists(service, name, parent_id):
                return 'skipped'
        except Exception:
            pass

    media = MediaIoBaseUpload(io.BytesIO(data_bytes), mimetype=mimetype, resumable=False)
    meta = {'name': name, 'parents': [parent_id]}
    service.files().create(body=meta, media_body=media, fields='id').execute()
    return 'uploaded'


def _ext_to_mime(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return {
        '.pdf':  'application/pdf',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls':  'application/vnd.ms-excel',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }.get(ext, 'application/octet-stream')


class Command(BaseCommand):
    help = 'Export all BGE documents (work orders, visit reports, timesheets, invoices, training reports) to Google Drive.'

    def add_arguments(self, parser):
        parser.add_argument('--bge', type=int, help='Export only this BGE (by database ID)')
        parser.add_argument('--force', action='store_true',
                            help='Re-upload files that already exist in Drive')
        parser.add_argument('--dry-run', action='store_true',
                            help='Show what would be uploaded without actually uploading')

    def handle(self, *args, **options):
        from portfolio.models import (
            BusinessGrowthExpert, WorkOrder, MSMEReport,
            TrainingReport, MentorTrainingReport, WorkOrderSubmission,
            WorkOrderAttachment, BGEFieldPhoto,
        )
        from portfolio.pdf_reports import render_work_order, render_training_report, render_mentor_report, render_msme_report

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
            self.stdout.write(f'Reports root folder found: {ROOT_FOLDER_NAME} ({root_id})\n')

            # Ensure or create top-level 'PRUDEV II - BGE Photos' folder
            photos_root_id = _ensure_folder(service, PHOTOS_ROOT_FOLDER_NAME)
            self.stdout.write(f'Photos root folder: {PHOTOS_ROOT_FOLDER_NAME} ({photos_root_id})\n')
        else:
            service = None
            root_id = None
            photos_root_id = None

        # ── Select BGEs ───────────────────────────────────────────────────────
        qs = BusinessGrowthExpert.objects.all().order_by('name')
        if options['bge']:
            qs = qs.filter(pk=options['bge'])
            if not qs.exists():
                raise CommandError(f'No BGE with ID {options["bge"]}')

        totals = {'uploaded': 0, 'skipped': 0, 'errors': 0}

        for bge in qs:
            bge_label = _safe_name(f'{bge.name} ({bge.bge_code})')
            self.stdout.write(self.style.HTTP_INFO(f'\n── {bge_label}'))

            if not dry_run:
                bge_folder   = _ensure_folder(service, bge_label, root_id)
                wo_folder    = _ensure_folder(service, 'Work Orders', bge_folder)
                vr_folder    = _ensure_folder(service, 'Visit Reports', bge_folder)
                ts_folder    = _ensure_folder(service, 'Timesheets', bge_folder)
                inv_folder   = _ensure_folder(service, 'Invoices', bge_folder)
                rep_folder   = _ensure_folder(service, 'Reports', bge_folder)
                lead_folder  = _ensure_folder(service, 'Lead Training Reports', rep_folder)
                ment_folder  = _ensure_folder(service, 'Mentor Reports', rep_folder)
                bge_photo_folder = _ensure_folder(service, bge_label, photos_root_id) if photos_root_id else None
            else:
                bge_folder = wo_folder = vr_folder = ts_folder = inv_folder = None
                rep_folder = lead_folder = ment_folder = bge_photo_folder = None

            # ── Work Orders ───────────────────────────────────────────────────
            work_orders = WorkOrder.objects.filter(bge=bge).order_by('issue_date')
            self.stdout.write(f'   Work orders: {work_orders.count()}')
            for wo in work_orders:
                fname = _safe_name(f'WO_{wo.work_order_number}_{wo.issue_date}.pdf')
                if dry_run:
                    self.stdout.write(f'     [dry] Work Orders/{fname}')
                    continue
                try:
                    buf = render_work_order(wo)
                    result = _upload_bytes(service, fname, buf.getvalue(), 'application/pdf', wo_folder, force)
                    totals[result] += 1
                    self.stdout.write(f'     {"✓" if result == "uploaded" else "–"} Work Orders/{fname} [{result}]')
                except Exception as exc:
                    totals['errors'] += 1
                    self.stderr.write(f'     ✗ {fname}: {exc}')

            # ── Visit Reports ─────────────────────────────────────────────────
            visit_reports = MSMEReport.objects.filter(bge=bge).select_related('msme').order_by('visit_date')
            self.stdout.write(f'   Visit reports: {visit_reports.count()}')
            for vr in visit_reports:
                msme_name = _safe_name(vr.msme.business_name[:40])
                fname = _safe_name(f'VisitReport_{vr.visit_date}_{msme_name}_{vr.pk}.pdf')
                if dry_run:
                    self.stdout.write(f'     [dry] Visit Reports/{fname}')
                    continue
                try:
                    buf = render_msme_report(vr)
                    result = _upload_bytes(service, fname, buf.getvalue(), 'application/pdf', vr_folder, force)
                    totals[result] += 1
                    self.stdout.write(f'     {"✓" if result == "uploaded" else "–"} Visit Reports/{fname} [{result}]')
                except Exception as exc:
                    totals['errors'] += 1
                    self.stderr.write(f'     ✗ {fname}: {exc}')

            # ── Timesheets & Invoices (uploaded files from WorkOrderSubmission) ─
            submissions = WorkOrderSubmission.objects.filter(bge=bge).select_related('work_order').order_by('created_at')
            ts_count  = sum(1 for s in submissions if s.timesheet_data)
            inv_count = sum(1 for s in submissions if s.invoice_data)
            self.stdout.write(f'   Timesheets: {ts_count}  |  Invoices: {inv_count}')

            for sub in submissions:
                wo_num = _safe_name(sub.work_order.work_order_number)
                date_str = sub.created_at.strftime('%Y-%m-%d')

                if sub.timesheet_data:
                    raw_name = sub.timesheet_filename or f'Timesheet_{wo_num}_{date_str}'
                    fname = _safe_name(f'Timesheet_{wo_num}_{date_str}_{os.path.splitext(raw_name)[1] or ".xlsx"}')
                    # Ensure extension is on the filename
                    if not os.path.splitext(fname)[1]:
                        fname += os.path.splitext(raw_name)[1] or '.xlsx'
                    if dry_run:
                        self.stdout.write(f'     [dry] Timesheets/{fname}')
                    else:
                        try:
                            mime = _ext_to_mime(fname)
                            result = _upload_bytes(service, fname, bytes(sub.timesheet_data), mime, ts_folder, force)
                            totals[result] += 1
                            self.stdout.write(f'     {"✓" if result == "uploaded" else "–"} Timesheets/{fname} [{result}]')
                        except Exception as exc:
                            totals['errors'] += 1
                            self.stderr.write(f'     ✗ {fname}: {exc}')

                if sub.invoice_data:
                    raw_name = sub.invoice_filename or f'Invoice_{wo_num}_{date_str}'
                    fname = _safe_name(f'Invoice_{wo_num}_{date_str}')
                    ext = os.path.splitext(sub.invoice_filename)[1] if sub.invoice_filename else '.xlsx'
                    fname += ext
                    if dry_run:
                        self.stdout.write(f'     [dry] Invoices/{fname}')
                    else:
                        try:
                            mime = _ext_to_mime(fname)
                            result = _upload_bytes(service, fname, bytes(sub.invoice_data), mime, inv_folder, force)
                            totals[result] += 1
                            self.stdout.write(f'     {"✓" if result == "uploaded" else "–"} Invoices/{fname} [{result}]')
                        except Exception as exc:
                            totals['errors'] += 1
                            self.stderr.write(f'     ✗ {fname}: {exc}')

            # ── Lead Training Reports ─────────────────────────────────────────
            training_reports = TrainingReport.objects.filter(bge=bge).order_by('created_at')
            self.stdout.write(f'   Lead training reports: {training_reports.count()}')
            for tr in training_reports:
                date_str = tr.created_at.strftime('%Y-%m-%d')
                fname = _safe_name(f'LeadTraining_{tr.training_title or "Report"}_{date_str}_{tr.pk}.pdf')
                if dry_run:
                    self.stdout.write(f'     [dry] Lead Training Reports/{fname}')
                    continue
                try:
                    buf = render_training_report(tr)
                    result = _upload_bytes(service, fname, buf.getvalue(), 'application/pdf', lead_folder, force)
                    totals[result] += 1
                    self.stdout.write(f'     {"✓" if result == "uploaded" else "–"} Lead Training Reports/{fname} [{result}]')
                except Exception as exc:
                    totals['errors'] += 1
                    self.stderr.write(f'     ✗ {fname}: {exc}')

            # ── Mentor Reports ────────────────────────────────────────────────
            mentor_reports = MentorTrainingReport.objects.filter(bge=bge).order_by('created_at')
            self.stdout.write(f'   Mentor reports: {mentor_reports.count()}')
            for mr in mentor_reports:
                date_str = mr.created_at.strftime('%Y-%m-%d')
                fname = _safe_name(f'MentorReport_{mr.training_title or "Report"}_{date_str}_{mr.pk}.pdf')
                if dry_run:
                    self.stdout.write(f'     [dry] Mentor Reports/{fname}')
                    continue
                try:
                    buf = render_mentor_report(mr)
                    result = _upload_bytes(service, fname, buf.getvalue(), 'application/pdf', ment_folder, force)
                    totals[result] += 1
                    self.stdout.write(f'     {"✓" if result == "uploaded" else "–"} Mentor Reports/{fname} [{result}]')
                except Exception as exc:
                    totals['errors'] += 1
                    self.stderr.write(f'     ✗ {fname}: {exc}')

            # ── Photos & Supporting Images (WorkOrderAttachment & BGEFieldPhoto) ──
            wo_attachments = WorkOrderAttachment.objects.filter(
                work_order__bge=bge
            ).select_related('work_order').order_by('created_at')
            field_photos = BGEFieldPhoto.objects.filter(bge=bge).select_related('msme', 'work_order').order_by('created_at')
            total_photos = wo_attachments.count() + field_photos.count()
            self.stdout.write(f'   Photos & Images: {total_photos}')

            for att in wo_attachments:
                data = att.file_data
                if not data and att.file:
                    try:
                        with open(att.file.path, 'rb') as f:
                            data = f.read()
                    except Exception:
                        data = None
                if not data:
                    continue

                wo_num = _safe_name(att.work_order.work_order_number)
                clean_fname = _safe_name(f'WO_{wo_num}_{att.filename}')
                if dry_run:
                    self.stdout.write(f'     [dry] Photos/{clean_fname}')
                    continue
                try:
                    mime = _ext_to_mime(clean_fname)
                    result = _upload_bytes(service, clean_fname, bytes(data), mime, bge_photo_folder, force)
                    totals[result] += 1
                    self.stdout.write(f'     {"✓" if result == "uploaded" else "–"} Photos/{clean_fname} [{result}]')
                except Exception as exc:
                    totals['errors'] += 1
                    self.stderr.write(f'     ✗ Photos/{clean_fname}: {exc}')

            for fp in field_photos:
                data = fp.photo_data
                if not data and fp.photo:
                    try:
                        with open(fp.photo.path, 'rb') as f:
                            data = f.read()
                    except Exception:
                        data = None
                if not data:
                    continue

                date_str = fp.created_at.strftime('%Y-%m-%d')
                clean_fname = _safe_name(f'Photo_{date_str}_{fp.filename}')
                if dry_run:
                    self.stdout.write(f'     [dry] Photos/{clean_fname}')
                    continue
                try:
                    mime = _ext_to_mime(clean_fname)
                    result = _upload_bytes(service, clean_fname, bytes(data), mime, bge_photo_folder, force)
                    totals[result] += 1
                    self.stdout.write(f'     {"✓" if result == "uploaded" else "–"} Photos/{clean_fname} [{result}]')
                except Exception as exc:
                    totals['errors'] += 1
                    self.stderr.write(f'     ✗ Photos/{clean_fname}: {exc}')

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
