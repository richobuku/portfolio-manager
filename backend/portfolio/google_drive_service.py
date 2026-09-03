"""
Google Drive integration service for PRUDEV II.

Provides:
  - Centralized Google Drive API client builder (_drive_service / get_drive_service)
  - Folder creation and discovery with proper query escaping
  - Real-time asynchronous upload of BGE field photos and supporting images to:
      'PRUDEV II - BGE Photos / {BGE Name} ({BGE Code}) /'
  - Smart file existence checks to avoid duplicates
"""

import base64
import io
import json
import logging
import os
import re
import threading
from typing import Optional, Tuple

from django.conf import settings

logger = logging.getLogger(__name__)

SCOPES = ['https://www.googleapis.com/auth/drive']
REPORTS_ROOT_FOLDER_NAME = 'PRUDEV II - BGE Reports'
PHOTOS_ROOT_FOLDER_NAME = 'PRUDEV II - BGE Photos'
SERVICE_ACCOUNT_PATH = os.path.join(
    getattr(settings, 'BASE_DIR', ''), '..', 'drive_service_account.json'
)


def safe_drive_name(name: str) -> str:
    """Strip characters illegal in Drive file names."""
    if not name:
        return 'unnamed'
    return re.sub(r'[\\/:*?"<>|]', '_', str(name)).strip()


def escape_drive_query_val(val: str) -> str:
    """Escape backslashes and single quotes for Google Drive API query strings."""
    if not val:
        return ''
    return val.replace('\\', '\\\\').replace("'", "\\'")


def get_drive_service():
    """
    Build an authenticated Google Drive API client.

    Priority:
      1. OAuth2 refresh token (GOOGLE_OAUTH2_* env vars) — uploads count against
         the authorized personal/organization Google Drive quota.
      2. Service account JSON (GOOGLE_DRIVE_CREDENTIALS env var or local file) —
         works with Shared Drives / Google Workspace.
    """
    try:
        from googleapiclient.discovery import build
    except ImportError:
        logger.error("google-api-python-client is not installed.")
        return None

    client_id = os.environ.get('GOOGLE_OAUTH2_CLIENT_ID')
    client_secret = os.environ.get('GOOGLE_OAUTH2_CLIENT_SECRET')
    refresh_token = os.environ.get('GOOGLE_OAUTH2_REFRESH_TOKEN')

    if client_id and client_secret and refresh_token:
        try:
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
        except Exception as e:
            logger.error(f"Failed to build Drive service from OAuth credentials: {e}")

    # Fallback: Service Account
    raw = os.environ.get('GOOGLE_DRIVE_CREDENTIALS')
    if raw:
        try:
            from google.oauth2 import service_account
            raw = raw.strip()
            try:
                decoded = base64.b64decode(raw).decode('utf-8')
                info = json.loads(decoded)
            except Exception:
                info = json.loads(raw)
            creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
            return build('drive', 'v3', credentials=creds, cache_discovery=False)
        except Exception as e:
            logger.error(f"Failed to build Drive service from GOOGLE_DRIVE_CREDENTIALS: {e}")

    # Fallback: local service account file
    key_path = SERVICE_ACCOUNT_PATH
    if not os.path.exists(key_path):
        key_path = os.path.join(getattr(settings, 'BASE_DIR', ''), 'drive_service_account.json')
    if os.path.exists(key_path):
        try:
            from google.oauth2 import service_account
            creds = service_account.Credentials.from_service_account_file(key_path, scopes=SCOPES)
            return build('drive', 'v3', credentials=creds, cache_discovery=False)
        except Exception as e:
            logger.error(f"Failed to build Drive service from {key_path}: {e}")

    logger.warning("No valid Google Drive credentials found in environment.")
    return None


def find_folder(service, name: str, parent_id: Optional[str] = None) -> Optional[str]:
    """Find a folder ID by name under an optional parent folder."""
    if not service:
        return None
    safe_name = escape_drive_query_val(name)
    q = f"name='{safe_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    try:
        results = service.files().list(q=q, fields='files(id, name)', pageSize=10).execute()
        files = results.get('files', [])
        return files[0]['id'] if files else None
    except Exception as e:
        logger.warning(f"Error finding folder '{name}' in Drive: {e}")
        return None


def ensure_folder(service, name: str, parent_id: Optional[str] = None) -> Optional[str]:
    """Return existing folder ID or create it if not found."""
    if not service:
        return None
    folder_id = find_folder(service, name, parent_id)
    if folder_id:
        return folder_id
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        meta['parents'] = [parent_id]
    try:
        folder = service.files().create(body=meta, fields='id').execute()
        return folder['id']
    except Exception as e:
        logger.error(f"Error creating folder '{name}' in Drive: {e}")
        return None


def file_exists(service, name: str, parent_id: str, mimetype: Optional[str] = None) -> bool:
    """Check if a file with the given name exists under parent_id."""
    if not service or not parent_id:
        return False
    safe_name = escape_drive_query_val(name)
    mime_clause = f" and mimeType='{mimetype}'" if mimetype else ''
    q = f"name='{safe_name}' and '{parent_id}' in parents{mime_clause} and trashed=false"
    try:
        results = service.files().list(q=q, fields='files(id)', pageSize=5).execute()
        return bool(results.get('files'))
    except Exception as e:
        logger.warning(f"Error checking file existence for '{name}': {e}")
        return False


def upload_bytes(
    service,
    name: str,
    data_bytes: bytes,
    mimetype: str,
    parent_id: str,
    force: bool = False
) -> Tuple[str, Optional[str], Optional[str]]:
    """
    Upload raw bytes to Drive folder.
    Returns (status, file_id, web_view_link) where status is 'uploaded' | 'skipped' | 'failed'.
    """
    from googleapiclient.http import MediaIoBaseUpload

    if not force:
        try:
            if file_exists(service, name, parent_id, mimetype):
                return 'skipped', None, None
        except Exception:
            pass

    media = MediaIoBaseUpload(io.BytesIO(data_bytes), mimetype=mimetype, resumable=False)
    meta = {'name': name, 'parents': [parent_id]}
    try:
        created = service.files().create(
            body=meta, media_body=media, fields='id, webViewLink'
        ).execute()
        return 'uploaded', created.get('id'), created.get('webViewLink')
    except Exception as e:
        logger.error(f"Failed to upload '{name}' to Drive: {e}")
        return 'failed', None, None


def ext_to_mime(filename: str) -> str:
    """Map filename extension to MIME type."""
    ext = os.path.splitext(filename or '')[1].lower()
    return {
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png':  'image/png',
        '.gif':  'image/gif',
        '.webp': 'image/webp',
        '.pdf':  'application/pdf',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls':  'application/vnd.ms-excel',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }.get(ext, 'application/octet-stream')


def upload_bge_photo_to_drive(
    bge,
    filename: str,
    data_bytes: bytes,
    mimetype: Optional[str] = None,
    prefix: Optional[str] = None,
) -> Tuple[str, Optional[str], Optional[str]]:
    """
    Synchronously upload a BGE photo/image directly to:
      'PRUDEV II - BGE Photos / {BGE Name} ({BGE Code}) /'
    Returns (status, file_id, web_view_link).
    """
    if not data_bytes or not bge:
        return 'failed', None, None

    service = get_drive_service()
    if not service:
        logger.warning(f"Skipping Drive upload for {filename} (Drive service unavailable).")
        return 'failed', None, None

    try:
        # 1. Top-level Photos root folder
        photos_root_id = ensure_folder(service, PHOTOS_ROOT_FOLDER_NAME)
        if not photos_root_id:
            logger.error(f"Could not locate or create root folder '{PHOTOS_ROOT_FOLDER_NAME}'")
            return 'failed', None, None

        # 2. BGE Subfolder
        bge_code = getattr(bge, 'bge_code', '') or f"ID-{bge.id}"
        bge_label = safe_drive_name(f"{bge.name} ({bge_code})")
        bge_folder_id = ensure_folder(service, bge_label, parent_id=photos_root_id)
        if not bge_folder_id:
            logger.error(f"Could not locate or create BGE folder '{bge_label}'")
            return 'failed', None, None

        # 3. Format filename
        clean_name = safe_drive_name(filename)
        if prefix:
            clean_prefix = safe_drive_name(prefix)
            if not clean_name.startswith(clean_prefix):
                clean_name = f"{clean_prefix}_{clean_name}"

        mime = mimetype or ext_to_mime(clean_name)

        status, file_id, web_link = upload_bytes(
            service, clean_name, data_bytes, mime, bge_folder_id, force=False
        )
        logger.info(f"Photo '{clean_name}' for {bge_label} -> Drive status: {status} (ID: {file_id})")
        return status, file_id, web_link
    except Exception as e:
        logger.error(f"Error in upload_bge_photo_to_drive for {filename}: {e}", exc_info=True)
        return 'failed', None, None


def async_upload_bge_photo(
    bge,
    filename: str,
    data_bytes: bytes,
    mimetype: Optional[str] = None,
    prefix: Optional[str] = None,
    on_complete=None,
):
    """
    Spawn a non-blocking background daemon thread to upload the photo to Google Drive
    so that user HTTP requests return immediately without latency.
    """
    def _runner():
        try:
            status, file_id, web_link = upload_bge_photo_to_drive(
                bge=bge,
                filename=filename,
                data_bytes=data_bytes,
                mimetype=mimetype,
                prefix=prefix,
            )
            if on_complete and callable(on_complete):
                try:
                    on_complete(status, file_id, web_link)
                except Exception as cb_err:
                    logger.warning(f"Error in async_upload_bge_photo on_complete callback: {cb_err}")
        except Exception as err:
            logger.error(f"Unhandled error in async_upload_bge_photo daemon thread: {err}")

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    return thread
