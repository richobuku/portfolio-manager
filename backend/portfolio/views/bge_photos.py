import logging
import os
from django.core.files.base import ContentFile
from django.http import HttpResponse, Http404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..google_drive_service import async_upload_bge_photo, safe_drive_name
from ..models import BGEFieldPhoto, BusinessGrowthExpert, MSME, WorkOrder

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.gif', '.webp')
MAX_PHOTO_SIZE = 25 * 1024 * 1024  # 25MB


def _get_bge_for_user(user):
    """Retrieve the BGE profile for the authenticated user, or None."""
    if not user or not user.is_authenticated:
        return None
    try:
        return user.bge_profile
    except Exception:
        # Check if user is linked to BGE
        return BusinessGrowthExpert.objects.filter(user=user).first()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_bge_photo_view(request):
    """
    Endpoint for BGEs (or admins on behalf of BGEs) to upload field photos.
    Instantly saves the photo in DB/storage and spawns a background thread
    to sync it to Google Drive under 'PRUDEV II - BGE Photos / {BGE Name} ({Code}) /'.
    """
    photo_file = request.FILES.get('photo') or request.FILES.get('file') or request.FILES.get('image')
    if not photo_file:
        return Response({'error': 'No photo file provided in request.'}, status=status.HTTP_400_BAD_REQUEST)

    fname = photo_file.name or 'photo.jpg'
    ext = os.path.splitext(fname)[1].lower()
    if not any(ext == e for e in ALLOWED_IMAGE_EXTS):
        return Response(
            {'error': f'Invalid format. Supported photo formats: {", ".join(ALLOWED_IMAGE_EXTS)}'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if photo_file.size > MAX_PHOTO_SIZE:
        return Response({'error': 'Photo size exceeds maximum limit of 25MB.'}, status=status.HTTP_400_BAD_REQUEST)

    # Determine BGE
    bge = _get_bge_for_user(request.user)
    bge_id_param = request.data.get('bge_id') or request.data.get('bge')
    if (request.user.is_staff or request.user.is_superuser or not bge) and bge_id_param:
        bge = BusinessGrowthExpert.objects.filter(id=bge_id_param).first()

    if not bge:
        return Response({'error': 'Authenticated user is not linked to a valid BGE profile.'}, status=status.HTTP_403_FORBIDDEN)

    caption = request.data.get('caption', '').strip()
    category = request.data.get('category', 'general').strip()
    msme_id = request.data.get('msme_id') or request.data.get('msme')
    work_order_id = request.data.get('work_order_id') or request.data.get('work_order')

    msme = MSME.objects.filter(id=msme_id).first() if msme_id else None
    work_order = WorkOrder.objects.filter(id=work_order_id).first() if work_order_id else None

    # Read binary bytes
    data_bytes = photo_file.read()

    field_photo = BGEFieldPhoto.objects.create(
        bge=bge,
        msme=msme,
        work_order=work_order,
        filename=fname,
        caption=caption,
        category=category,
        uploaded_by=request.user,
        photo_data=data_bytes,
    )
    field_photo.photo.save(fname, ContentFile(data_bytes), save=True)

    # Callback to update Drive file ID when sync finishes
    def _on_drive_complete(upload_status, file_id, web_link):
        if upload_status == 'uploaded' and file_id:
            try:
                BGEFieldPhoto.objects.filter(id=field_photo.id).update(
                    drive_file_id=file_id,
                    drive_web_link=web_link or '',
                )
            except Exception as e:
                logger.warning(f"Could not update drive_file_id on photo #{field_photo.id}: {e}")

    # Build meaningful file prefix
    prefix_parts = []
    if msme:
        prefix_parts.append(safe_drive_name(msme.business_name[:25]))
    elif work_order:
        prefix_parts.append(f"WO_{safe_drive_name(work_order.work_order_number)}")
    if category and category != 'general':
        prefix_parts.append(category.capitalize())

    prefix = "_".join(prefix_parts) if prefix_parts else "FieldPhoto"

    # Spawn real-time background upload to Google Drive
    async_upload_bge_photo(
        bge=bge,
        filename=fname,
        data_bytes=data_bytes,
        mimetype=photo_file.content_type,
        prefix=prefix,
        on_complete=_on_drive_complete,
    )

    return Response({
        'success': True,
        'message': 'Photo uploaded successfully and queued for Google Drive sync.',
        'photo': {
            'id': field_photo.id,
            'filename': field_photo.filename,
            'caption': field_photo.caption,
            'category': field_photo.category,
            'bge_name': bge.name,
            'bge_code': bge.bge_code,
            'msme_name': msme.business_name if msme else None,
            'created_at': field_photo.created_at.isoformat(),
        }
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_bge_photos_view(request):
    """List photos uploaded by or associated with the BGE."""
    user = request.user
    bge = _get_bge_for_user(user)

    qs = BGEFieldPhoto.objects.select_related('bge', 'msme', 'work_order')
    if not (user.is_staff or user.is_superuser):
        if not bge:
            return Response([])
        qs = qs.filter(bge=bge)
    else:
        bge_id = request.query_params.get('bge')
        if bge_id:
            qs = qs.filter(bge_id=bge_id)

    msme_id = request.query_params.get('msme')
    if msme_id:
        qs = qs.filter(msme_id=msme_id)

    work_order_id = request.query_params.get('work_order')
    if work_order_id:
        qs = qs.filter(work_order_id=work_order_id)

    results = []
    for p in qs[:100]:
        results.append({
            'id': p.id,
            'filename': p.filename,
            'caption': p.caption,
            'category': p.category,
            'bge_id': p.bge_id,
            'bge_name': p.bge.name,
            'bge_code': p.bge.bge_code,
            'msme_name': p.msme.business_name if p.msme else None,
            'work_order_number': p.work_order.work_order_number if p.work_order else None,
            'drive_file_id': p.drive_file_id,
            'drive_web_link': p.drive_web_link,
            'created_at': p.created_at.isoformat(),
            'download_url': f"/api/bges/photos/{p.id}/download/",
        })
    return Response(results)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def download_bge_photo_view(request, photo_id):
    """Download or view stored photo binary."""
    photo = BGEFieldPhoto.objects.filter(id=photo_id).first()
    if not photo:
        raise Http404("Photo not found.")

    user = request.user
    if not (user.is_staff or user.is_superuser):
        bge = _get_bge_for_user(user)
        if not bge or photo.bge_id != bge.id:
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

    if not photo.photo_data:
        if photo.photo:
            try:
                with open(photo.photo.path, 'rb') as f:
                    data = f.read()
            except Exception:
                raise Http404("Photo file not found on server.")
        else:
            raise Http404("No photo data available.")
    else:
        data = bytes(photo.photo_data)

    ext = os.path.splitext(photo.filename or '')[1].lower()
    ct = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
    }.get(ext, 'image/jpeg')

    response = HttpResponse(data, content_type=ct)
    response['Content-Disposition'] = f'inline; filename="{photo.filename or "photo.jpg"}"'
    return response
