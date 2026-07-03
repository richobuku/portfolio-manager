import logging
import io as _io

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse
from django.utils import timezone

from ..models import TshirtReceipt, TshirtReceiptEntry
from ..serializers import TshirtReceiptSerializer, TshirtReceiptEntrySerializer
from .bge import _bge_signature_bytes, _clean_sig_for_pdf

logger = logging.getLogger(__name__)


def _build_tshirt_pdf(receipt):
    """Generate a signed PDF for a TshirtReceipt using reportlab.

    Landscape A4 with the standard PRUDEV II branded header:
    GOPA AFC logo (left) | PRUDEV II wordmark (centre) | GIZ logo (right)
    — identical to the visit-report and training-report headers.
    """
    try:
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib import colors
        from reportlab.lib.units import cm, mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        from reportlab.lib.utils import ImageReader
        import PIL.Image as PILImage
    except ImportError as e:
        raise ImportError(f"reportlab/Pillow required: {e}")

    # ── Logo paths (same static dir used by pdf_reports.py) ────────────────
    import os as _os
    _logo_dir  = _os.path.join(_os.path.dirname(__file__), '..', 'static', 'portfolio', 'images')
    GOPA_PATH  = _os.path.join(_logo_dir, 'gopa-logo.png')
    GIZ_PATH   = _os.path.join(_logo_dir, 'giz-logo.png')

    NAVY  = colors.HexColor("#1A2F4B")
    RED   = colors.HexColor("#C8102E")
    GREY  = colors.HexColor("#666666")
    LGREY = colors.HexColor("#F2F2F2")

    PAGE_W, PAGE_H = landscape(A4)   # 841.9 × 595.3 pt
    BAND_H  = 24 * mm
    RULE_H  = 1.5 * mm
    TOP_M   = BAND_H + RULE_H + 8 * mm
    SIDE_M  = 15 * mm
    BOT_M   = 15 * mm

    # ── Per-page header callback ────────────────────────────────────────────
    def _draw_header(canvas, doc):
        canvas.saveState()
        w, h = landscape(A4)

        # White band
        canvas.setFillColorRGB(1, 1, 1)
        canvas.rect(0, h - BAND_H, w, BAND_H, fill=1, stroke=0)
        # GIZ-red rule
        canvas.setFillColor(RED)
        canvas.rect(0, h - BAND_H - RULE_H, w, RULE_H, fill=1, stroke=0)

        # Left: GOPA logo (aspect ≈ 3.06)
        if _os.path.isfile(GOPA_PATH):
            logo_h = 14 * mm
            logo_w = logo_h * 3.06
            canvas.drawImage(
                ImageReader(GOPA_PATH),
                x=14 * mm, y=h - BAND_H + (BAND_H - logo_h) / 2,
                width=logo_w, height=logo_h,
                mask='auto', preserveAspectRatio=True,
            )

        # Right: GIZ logo (aspect ≈ 2.71)
        if _os.path.isfile(GIZ_PATH):
            logo_h = 16 * mm
            logo_w = logo_h * 2.71
            canvas.drawImage(
                ImageReader(GIZ_PATH),
                x=w - 14 * mm - logo_w, y=h - BAND_H + (BAND_H - logo_h) / 2,
                width=logo_w, height=logo_h,
                mask='auto', preserveAspectRatio=True,
            )

        # Centre: wordmark
        cy = h - BAND_H / 2
        canvas.setFillColor(NAVY)
        canvas.setFont('Helvetica-Bold', 13)
        canvas.drawCentredString(w / 2, cy + 2 * mm, 'PRUDEV II')
        canvas.setFillColor(GREY)
        canvas.setFont('Helvetica', 8)
        canvas.drawCentredString(w / 2, cy - 2 * mm, 'T-Shirt Distribution Receipt')

        # Page number
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(GREY)
        canvas.drawRightString(w - SIDE_M, 8 * mm, f'Page {doc.page}')
        canvas.restoreState()

    buf = _io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=SIDE_M, rightMargin=SIDE_M,
        topMargin=TOP_M, bottomMargin=BOT_M,
        title=receipt.title,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('TTitle', parent=styles['Title'],
        fontSize=15, textColor=NAVY, spaceAfter=2, alignment=TA_CENTER)
    sub_style   = ParagraphStyle('TSub', parent=styles['Normal'],
        fontSize=10, textColor=GREY, spaceAfter=2,
        alignment=TA_CENTER, fontName='Helvetica-Oblique')
    label_style = ParagraphStyle('TLbl', parent=styles['Normal'],
        fontSize=9, textColor=colors.black, leading=13)
    note_style  = ParagraphStyle('TNote', parent=styles['Normal'],
        fontSize=7.5, textColor=GREY,
        fontName='Helvetica-Oblique', alignment=TA_CENTER)
    conf_style  = ParagraphStyle('TConf', parent=styles['Normal'],
        fontSize=7, textColor=GREY,
        fontName='Helvetica-Oblique', alignment=TA_CENTER)

    entries = list(receipt.entries.select_related('bge').order_by('order', 'bge__name'))

    # ── Column widths — landscape A4 content = 297mm − 30mm margins = 267mm = 26.7cm
    # #(0.7) Name(4.5) Code(3.0) Phone(3.3) Loc(2.2) Size(1.4) Qty(0.8) Sig(6.0) Date(2.8) = 24.7cm
    col_w = [0.7*cm, 4.5*cm, 3.0*cm, 3.3*cm, 2.2*cm, 1.4*cm, 0.8*cm, 6.0*cm, 2.8*cm]

    SIG_ROW_H = 1.1 * cm

    # Paragraph style for body cells — enables word-wrap so nothing overflows
    cell_s = ParagraphStyle('TCell', parent=styles['Normal'],
        fontSize=8, leading=10, wordWrap='LTR', splitLongWords=True)
    # Header cell style (white text on navy background)
    hdr_s = ParagraphStyle('THdrCell', parent=styles['Normal'],
        fontSize=8, leading=10, textColor=colors.white,
        fontName='Helvetica-Bold', alignment=TA_CENTER)

    def _P(text, style=cell_s):
        return Paragraph(str(text) if text else '', style)

    hdr_row = [_P(h, hdr_s) for h in
               ['#', 'BGE Name', 'BGE Code', 'Phone', 'Location',
                'Size', 'Qty', 'BGE Signature', 'Date Signed']]
    rows = [hdr_row]

    for idx, entry in enumerate(entries):
        sig_bytes = _bge_signature_bytes(entry.bge)
        if entry.signed and sig_bytes:
            try:
                # Clean background then embed
                clean_bytes = _clean_sig_for_pdf(sig_bytes)
                img_buf = _io.BytesIO(clean_bytes)
                pil = PILImage.open(img_buf)
                w_px, h_px = pil.size
                aspect = w_px / h_px if h_px else 1
                img_h = SIG_ROW_H * 0.85
                img_w = min(img_h * aspect, col_w[7] - 4 * mm)
                img_buf.seek(0)
                sig_cell = Image(img_buf, width=img_w, height=img_h)
            except Exception:
                sig_cell = _P('(signed)')
        elif entry.signed:
            sig_cell = _P('(signed)')
        else:
            sig_cell = _P('')

        date_str = entry.signed_at.strftime('%d/%m/%Y') if entry.signed_at else ''
        rows.append([
            _P(str(idx + 1)),
            _P(entry.bge.name),
            _P(entry.bge.bge_code or ''),
            _P(entry.bge.phone or ''),
            _P(entry.bge.location or ''),
            _P(entry.size),
            _P(str(entry.quantity)),
            sig_cell,
            _P(date_str),
        ])

    row_heights = [0.65 * cm] + [SIG_ROW_H] * len(entries)
    tbl = Table(rows, colWidths=col_w, rowHeights=row_heights, repeatRows=1)
    tbl.setStyle(TableStyle([
        # Header row background (text style is in hdr_s ParagraphStyle)
        ('BACKGROUND',    (0, 0), (-1, 0), NAVY),
        ('VALIGN',        (0, 0), (-1, 0), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, 0), 5),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
        # Body
        ('VALIGN',        (0, 1), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 1), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 3),
        ('LEFTPADDING',   (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
        # Alternating rows
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LGREY]),
        # Grid
        ('GRID',           (0, 0), (-1, -1), 0.4, colors.HexColor("#BBBBBB")),
    ]))
    story = [
        Paragraph(receipt.title, title_style),
    ]
    sub_parts = []
    if receipt.event:
        sub_parts.append(receipt.event)
    sub_parts.append(f"Colour: {receipt.colour}")
    story.append(Paragraph("  —  ".join(sub_parts), sub_style))
    story.append(Spacer(1, 0.25 * cm))
    from datetime import date as _date, timedelta as _td
    _today = _date.today()
    _this_monday = _today - _td(days=_today.isocalendar()[2] - 1)
    _last_friday = _this_monday - _td(days=3)
    story.append(Paragraph(
        f"Date: {_last_friday.strftime('%d/%m/%Y')}",
        label_style))
    story.append(Spacer(1, 0.15 * cm))
    story.append(Paragraph(
        "Signatures below are embedded from each BGE's registered profile on the PRUDEV II system.",
        note_style))
    story.append(Spacer(1, 0.2 * cm))
    story.append(tbl)
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(
        f"Total BGEs: {len(entries)}     Signed: {receipt.signed_count}     Pending: {len(entries) - receipt.signed_count}",
        label_style))
    story.append(Spacer(1, 0.15 * cm))
    story.append(Paragraph(
        "Distributed by:   Name: Richard Obuku   Title: BDS Expert   Date: _______________",
        label_style))
    story.append(Spacer(1, 0.15 * cm))
    story.append(Paragraph(
        "Verified by: Stella Abote.   Date: _______",
        label_style))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("PRUDEV II Programme — GOPA AFC in partnership with GIZ  |  Confidential", conf_style))

    doc.build(story, onFirstPage=_draw_header, onLaterPages=_draw_header)
    buf.seek(0)
    return buf.read()


class TshirtReceiptViewSet(viewsets.ModelViewSet):
    queryset           = TshirtReceipt.objects.prefetch_related('entries__bge').all()
    serializer_class   = TshirtReceiptSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = TshirtReceipt.objects.prefetch_related('entries__bge').all()
        user = self.request.user
        # BGEs only see receipts that have an entry for them
        if not (user.is_staff or user.is_superuser):
            bge = getattr(user, 'bge_profile', None)
            if bge:
                qs = qs.filter(entries__bge=bge)
        return qs

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        receipt = self.get_object()
        try:
            pdf_bytes = _build_tshirt_pdf(receipt)
        except Exception as e:
            logger.error("TshirtReceipt PDF error: %s", e, exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        filename = f"tshirt_receipt_{receipt.id}.pdf"
        resp = HttpResponse(pdf_bytes, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="{filename}"'
        return resp

    @action(detail=True, methods=['post'], url_path='bulk-sign')
    def bulk_sign(self, request, pk=None):
        """Admin: embed all available signatures at once."""
        receipt = self.get_object()
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can bulk-sign.")
        now = timezone.now()
        updated = 0
        for entry in receipt.entries.select_related('bge').filter(signed=False):
            if _bge_signature_bytes(entry.bge):
                entry.signed    = True
                entry.signed_at = now
                entry.save(update_fields=['signed', 'signed_at'])
                updated += 1
        return Response({'signed': updated, 'total': receipt.total_entries})


class TshirtReceiptEntryViewSet(viewsets.ModelViewSet):
    queryset           = TshirtReceiptEntry.objects.select_related('bge', 'receipt').all()
    serializer_class   = TshirtReceiptEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = TshirtReceiptEntry.objects.select_related('bge', 'receipt').all()
        receipt_id = self.request.query_params.get('receipt')
        if receipt_id:
            qs = qs.filter(receipt_id=receipt_id)
        # BGEs only see their own entries
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            bge = getattr(user, 'bge_profile', None)
            if bge:
                qs = qs.filter(bge=bge)
            else:
                return qs.none()
        return qs

    @action(detail=True, methods=['post'], url_path='sign')
    def sign(self, request, pk=None):
        """BGE signs their own entry.

        The BGE may update their size and/or quantity before signing by
        including ``size`` and/or ``quantity`` in the POST body.
        """
        entry = self.get_object()
        user  = request.user

        # Allow the BGE whose entry this is, or staff
        bge = getattr(user, 'bge_profile', None)
        if not (user.is_staff or user.is_superuser):
            if not bge or entry.bge_id != bge.id:
                raise PermissionDenied("You can only sign your own receipt entry.")

        if entry.signed:
            return Response({'detail': 'Already signed.'}, status=status.HTTP_400_BAD_REQUEST)

        if not _bge_signature_bytes(entry.bge):
            return Response(
                {'detail': 'No signature on file. Please upload your signature first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Let the BGE confirm / adjust their size and quantity before signing
        size     = request.data.get('size')
        quantity = request.data.get('quantity')
        update_fields = ['signed', 'signed_at']

        if size and size in dict(entry.__class__.SIZE_CHOICES):
            entry.size = size
            update_fields.append('size')

        if quantity is not None:
            try:
                qty = int(quantity)
                if qty >= 1:
                    entry.quantity = qty
                    update_fields.append('quantity')
            except (ValueError, TypeError):
                pass

        entry.signed    = True
        entry.signed_at = timezone.now()
        entry.save(update_fields=update_fields)
        return Response(TshirtReceiptEntrySerializer(entry, context={'request': request}).data)
