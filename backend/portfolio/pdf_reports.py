"""PDF generation for MSME visit reports and BGE group reports.

Uses ReportLab Platypus (paragraphs/tables flowing onto pages) so the
output paginates cleanly without us hand-cranking coordinates.

Branded palette: navy #1A2F4B header, GIZ red #C8102E accents,
GIZ logo (German Cooperation + Implemented by giz) and GOPA AFC logo
embedded in the header band on every page.
"""
import io
import os
from xml.sax.saxutils import escape as xml_escape
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY, TA_CENTER


NAVY = HexColor('#1A2F4B')
RED  = HexColor('#C8102E')
GREY = HexColor('#666666')
LIGHT_GREY = HexColor('#F5F5F5')

SIG_H = 10 * mm  # signature block height — 50% of original 20mm

# Logo assets — copied into static/portfolio/images/ alongside the React
# /public copies, so the PDF generator doesn't depend on the frontend
# build artefacts.
_LOGO_DIR = os.path.join(os.path.dirname(__file__), 'static', 'portfolio', 'images')
GIZ_LOGO_PATH  = os.path.join(_LOGO_DIR, 'giz-logo.png')
GOPA_LOGO_PATH = os.path.join(_LOGO_DIR, 'gopa-logo.png')


def _safe_image(path):
    """Return a ReportLab ImageReader if the file exists, else None.
    Caches across calls so we don't re-read on every page header."""
    if not getattr(_safe_image, '_cache', None):
        _safe_image._cache = {}
    if path in _safe_image._cache:
        return _safe_image._cache[path]
    try:
        if os.path.isfile(path):
            _safe_image._cache[path] = ImageReader(path)
        else:
            _safe_image._cache[path] = None
    except Exception:
        _safe_image._cache[path] = None
    return _safe_image._cache[path]


def _styles():
    base = getSampleStyleSheet()
    s = {
        'h1':    ParagraphStyle('h1',    parent=base['Heading1'], fontSize=18, textColor=NAVY, spaceAfter=4),
        'sub':   ParagraphStyle('sub',   parent=base['Normal'],   fontSize=10, textColor=GREY, spaceAfter=10),
        'h2':    ParagraphStyle('h2',    parent=base['Heading2'], fontSize=12, textColor=NAVY, spaceBefore=12, spaceAfter=4),
        'label': ParagraphStyle('lbl',   parent=base['Normal'],   fontSize=8,  textColor=GREY, spaceAfter=2),
        'body':  ParagraphStyle('body',  parent=base['Normal'],   fontSize=10, leading=14, alignment=TA_JUSTIFY, spaceAfter=8),
        'meta':  ParagraphStyle('meta',  parent=base['Normal'],   fontSize=9,  textColor=GREY),
        'sectiontitle': ParagraphStyle('sectiontitle', parent=base['Normal'], fontSize=11, textColor=RED, spaceBefore=12, spaceAfter=2, fontName='Helvetica-Bold'),
    }
    return s


def _header(canvas, doc):
    """Painted on every page — white band with GOPA logo (left), PRUDEV II
    wordmark (centre), GIZ logo (right). A 1.5 mm GIZ-red rule sits below
    the band as the visual brand accent."""
    canvas.saveState()
    w, h = A4
    band_height = 24 * mm

    # Background band: white surface so the logo backgrounds look clean.
    canvas.setFillColorRGB(1, 1, 1)
    canvas.rect(0, h - band_height, w, band_height, fill=1, stroke=0)

    # GIZ-red accent rule sitting flush below the white band
    canvas.setFillColor(RED)
    canvas.rect(0, h - band_height - 1.5 * mm, w, 1.5 * mm, fill=1, stroke=0)

    # ── Left: GOPA AFC logo ──────────────────────────────────────────────
    gopa = _safe_image(GOPA_LOGO_PATH)
    if gopa:
        # GOPA aspect ratio ≈ 3.06:1; render at 14mm tall.
        logo_h = 14 * mm
        logo_w = logo_h * 3.06
        canvas.drawImage(
            gopa,
            x=14 * mm, y=h - band_height + (band_height - logo_h) / 2,
            width=logo_w, height=logo_h,
            mask='auto', preserveAspectRatio=True,
        )

    # ── Right: GIZ + German Cooperation lockup ───────────────────────────
    giz = _safe_image(GIZ_LOGO_PATH)
    if giz:
        # GIZ aspect ratio ≈ 2.71:1 (German Cooperation + "Implemented by giz")
        logo_h = 16 * mm
        logo_w = logo_h * 2.71
        canvas.drawImage(
            giz,
            x=w - 14 * mm - logo_w, y=h - band_height + (band_height - logo_h) / 2,
            width=logo_w, height=logo_h,
            mask='auto', preserveAspectRatio=True,
        )

    # ── Centre: programme wordmark ───────────────────────────────────────
    centre_y = h - band_height / 2
    canvas.setFillColor(NAVY)
    canvas.setFont('Helvetica-Bold', 13)
    canvas.drawCentredString(w / 2, centre_y + 2 * mm, 'PRUDEV II')
    canvas.setFillColor(GREY)
    canvas.setFont('Helvetica', 8)
    canvas.drawCentredString(w / 2, centre_y - 2 * mm, 'Portfolio Manager · MSME Programme')

    # ── Footer ───────────────────────────────────────────────────────────
    canvas.setFillColor(GREY)
    canvas.setFont('Helvetica', 8)
    canvas.drawCentredString(
        w / 2, 10 * mm,
        f'Page {doc.page} · PRUDEV II Programme · GIZ · GOPA AFC'
    )
    canvas.restoreState()


def _kv_table(rows):
    """Two-column key/value table used for the metadata strip."""
    t = Table(rows, colWidths=[40 * mm, 130 * mm], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('FONT',       (0, 0), (0, -1), 'Helvetica-Bold', 9),
        ('FONT',       (1, 0), (1, -1), 'Helvetica',      10),
        ('TEXTCOLOR',  (0, 0), (0, -1), GREY),
        ('TEXTCOLOR',  (1, 0), (1, -1), NAVY),
        ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW',  (0, 0), (-1, -1), 0.25, LIGHT_GREY),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
    ]))
    return t


def _safe_html(text):
    """Escape user-entered text for ReportLab Paragraph (which parses XML/HTML
    markup) and convert newlines to <br/>. Without this, an `&`, `<`, or `>`
    in any narrative field crashes the build with a parse error or — worse —
    is interpreted as markup."""
    if text is None:
        return ''
    return xml_escape(str(text)).replace('\n', '<br/>')


def _section(s, title, body_text):
    """A titled paragraph block. body_text is whatever's stored, may be empty."""
    body = (body_text or '').strip() or '—'
    return [
        Paragraph(_safe_html(title), s['sectiontitle']),
        Paragraph(_safe_html(body), s['body']),
    ]


def _build_doc():
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        # Header band is 24mm + 1.5mm accent + 8mm visual breathing room
        topMargin=34 * mm, bottomMargin=18 * mm,
    )
    return buf, doc


def _sig_block(s, bge, signed_date=None, reviewer_label='Reviewed by (Senior BGE / Admin)',
               sig_label='BGE Signature', reviewer_name=None, reviewer_position=None):
    """Signature row appended to the bottom of any BGE-authored document.
    Left column: endorser/reviewer block (name+position pre-printed if supplied).
    Right column: BGE signature image if available, otherwise blank of same height.
    """
    from reportlab.platypus import Image as RLImage, KeepTogether

    reviewer_col = [
        Paragraph(reviewer_label, s['label']),
        Spacer(1, 4),
        Spacer(1, SIG_H),           # signature placeholder
        Paragraph('_' * 35, s['body']),
        Paragraph(f'Name: {reviewer_name}' if reviewer_name else 'Name: ___________________________', s['meta']),
        Paragraph(f'Position: {reviewer_position}' if reviewer_position else 'Position: ________________________', s['meta']),
        Paragraph('Date: ____________________________', s['meta']),
    ]

    bge_col = [Paragraph(sig_label, s['label']), Spacer(1, 4)]
    sig_drawn = False
    if bge and getattr(bge, 'signature_data', None):
        try:
            bge_col.append(RLImage(io.BytesIO(bytes(bge.signature_data)),
                                   width=40 * mm, height=SIG_H, kind='proportional'))
            sig_drawn = True
        except Exception:
            pass
    if not sig_drawn and bge and bge.signature:
        try:
            sig_path = bge.signature.path
            if os.path.isfile(sig_path):
                bge_col.append(RLImage(sig_path, width=40 * mm, height=SIG_H,
                                       kind='proportional'))
                sig_drawn = True
        except Exception:
            pass
    if not sig_drawn:
        bge_col.append(Spacer(1, SIG_H))

    # Format date — signed_date may be a date, datetime, or string
    if signed_date:
        try:
            date_str = signed_date.strftime('%d %b %Y') if hasattr(signed_date, 'strftime') else str(signed_date)[:10]
        except Exception:
            date_str = str(signed_date)
    else:
        date_str = None

    bge_col += [
        Paragraph('_' * 35, s['body']),
        Paragraph(_safe_html(bge.name if bge else '—'), s['body']),
        Paragraph(_safe_html((bge.bge_code if bge else '') or ''), s['label']),
        Paragraph(
            f'Date: {date_str}' if date_str else 'Date: ___________________________',
            s['meta'],
        ),
    ]

    t = Table([[reviewer_col, bge_col]], colWidths=[85 * mm, 85 * mm], hAlign='LEFT')
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    return KeepTogether([t])


def render_msme_report(report):
    """Build a styled PDF for one MSMEReport."""
    from django.conf import settings as django_settings

    s = _styles()
    buf, doc = _build_doc()
    story = []

    msme = report.msme
    bge  = report.bge
    is_annual = getattr(report, 'visit_type', '') == 'annual_review'

    visit_label = report.get_visit_type_display() if hasattr(report, 'get_visit_type_display') else report.visit_type
    story.append(Paragraph(_safe_html(f'Visit Report — {msme.business_name}'), s['h1']))
    story.append(Paragraph(f'{visit_label} · {report.visit_date}', s['sub']))

    story.append(_kv_table([
        ['MSME',          msme.business_name],
        ['MSME Code',     msme.msme_code or '—'],
        ['Owner',         msme.owner_name or '—'],
        ['Location',      f'{msme.city or "—"}, {msme.state or "—"}'],
        ['BGE',           bge.name if bge else '—'],
        ['BGE Code',      (bge.bge_code if bge else '') or '—'],
        ['Visit Type',    visit_label],
        ['Visit Date',    str(report.visit_date)],
        ['Status',        report.get_status_display() if hasattr(report, 'get_status_display') else report.status],
    ]))

    story.append(Spacer(1, 8))

    # 1. Objectives
    if getattr(report, 'visit_objectives', None):
        story.extend(_section(s, 'Objectives of this visit', report.visit_objectives))

    # 2. Context / business status
    story.extend(_section(s, 'Business status observed', report.business_overview))

    # 3. Data quality (annual_review only)
    if is_annual:
        dq_lines = []
        confidence = getattr(report, 'data_confidence_level', '')
        conf_labels = {
            'confirmed':        'Confirmed — figures from actual records',
            'mostly_confident': 'Mostly confident — minor estimates only',
            'mixed':            'Mixed — owner unsure on several items',
            'largely_estimated':'Largely estimated — few actual records',
            'unreliable':       'Unreliable — mostly guessing',
        }
        if confidence:
            dq_lines.append(f'Data confidence: {conf_labels.get(confidence, confidence)}')
        records_sighted = getattr(report, 'records_sighted', None)
        if records_sighted is not None:
            dq_lines.append(f'Physical records sighted: {"Yes" if records_sighted else "No"}')
        if dq_lines:
            story.extend(_section(s, 'Data quality summary', ' | '.join(dq_lines)))
        if getattr(report, 'owner_certainty_observation', None):
            story.extend(_section(s, 'Owner certainty & confidence observations',
                                  report.owner_certainty_observation))
        if getattr(report, 'data_collection_challenges', None):
            story.extend(_section(s, 'Data collection challenges',
                                  report.data_collection_challenges))

    # 4. Support delivered & tools (not for annual_review)
    if not is_annual:
        story.extend(_section(s, 'Support provided', report.support_provided))
        if getattr(report, 'tools_provided', None):
            story.extend(_section(s, 'Tools & materials provided', report.tools_provided))

    # 5. Outcomes / key findings
    story.extend(_section(s, 'Key findings & outcomes', report.key_achievement))
    story.extend(_section(s, 'Challenges identified',   report.challenges_identified))

    # 6. Next steps
    story.extend(_section(s, 'Business owner actions',  report.action_plan))
    story.extend(_section(s, 'BGE follow-up actions',   report.recommendations))
    story.extend(_section(s, 'Additional notes',         report.additional_notes))

    story.append(Spacer(1, 12))

    # Endorser: the admin who created the work order covering this visit period.
    # Falls back to the settings-level default if no matching work order is found.
    endorser_name = endorser_position = None
    try:
        from .models import WorkOrder
        wo = WorkOrder.objects.filter(
            bge=bge,
            start_date__isnull=False,
            end_date__isnull=False,
            start_date__lte=report.visit_date,
            end_date__gte=report.visit_date,
        ).select_related('created_by').first()
        if wo and wo.created_by:
            endorser_name = (wo.created_by.get_full_name().strip()
                             or wo.created_by.username)
            endorser_position = wo.team_leader_position or 'Team Leader, PRUDEV II — GOPA AFC'
        elif wo:
            # Work order found but no created_by — use the configured team leader name
            endorser_name     = wo.team_leader_name or None
            endorser_position = wo.team_leader_position or None
    except Exception:
        pass

    if not endorser_name:
        endorser_name     = getattr(django_settings, 'REPORT_ENDORSER_NAME',     None)
        endorser_position = getattr(django_settings, 'REPORT_ENDORSER_POSITION', None)

    story.append(_sig_block(
        s, bge,
        signed_date=getattr(report, 'updated_at', None),
        reviewer_label='Endorsed by — For GOPA AFC / PRUDEV II Programme',
        reviewer_name=endorser_name,
        reviewer_position=endorser_position,
    ))

    doc.build(story, onFirstPage=_header, onLaterPages=_header)
    buf.seek(0)
    return buf


def render_group_report(report):
    """Build a styled PDF for one GroupReport."""
    s = _styles()
    buf, doc = _build_doc()
    story = []

    group = report.group

    story.append(Paragraph(_safe_html(f'Group Report — {group.name}'), s['h1']))
    sess = f'Session {report.session_number}' if report.session_number else 'Group session'
    story.append(Paragraph(_safe_html(f'{sess} · {report.visit_date}'), s['sub']))

    story.append(_kv_table([
        ['Group',         group.name],
        ['Description',   group.description or '—'],
        ['Team Lead',     report.team_lead.name if report.team_lead else (group.team_lead.name if group.team_lead else '—')],
        ['Members',       ', '.join(m.name for m in group.members.all()) or '—'],
        ['Session',       (str(report.session_number) if report.session_number else '—')],
        ['Visit Date',    str(report.visit_date)],
        ['Status',        report.get_status_display() if hasattr(report, 'get_status_display') else report.status],
    ]))

    # Group-level objectives banner
    if group.objectives:
        story.append(Spacer(1, 6))
        story.append(Paragraph('Group objectives', s['sectiontitle']))
        story.append(Paragraph(_safe_html(group.objectives), s['body']))

    # MSMEs supported
    msmes = list(report.msmes_supported.all())
    if msmes:
        story.append(Spacer(1, 4))
        story.append(Paragraph(f'MSMEs supported ({len(msmes)})', s['sectiontitle']))
        rows = [['#', 'Business Name', 'Code', 'District', 'Town']]
        for i, m in enumerate(msmes, start=1):
            rows.append([
                str(i), m.business_name, m.msme_code or '—',
                m.state or '—', m.city or '—',
            ])
        t = Table(rows, hAlign='LEFT', colWidths=[12 * mm, 70 * mm, 32 * mm, 28 * mm, 28 * mm], repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), NAVY),
            ('TEXTCOLOR',  (0, 0), (-1, 0), HexColor('#FFFFFF')),
            ('FONT',       (0, 0), (-1, 0), 'Helvetica-Bold', 9),
            ('FONT',       (0, 1), (-1, -1), 'Helvetica', 9),
            ('LINEBELOW',  (0, 0), (-1, -1), 0.25, LIGHT_GREY),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING',    (0, 0), (-1, -1), 6),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor('#FFFFFF'), HexColor('#FAFAFA')]),
        ]))
        story.append(t)

    story.append(Spacer(1, 8))

    sections = [
        ('Session overview',          report.session_overview),
        ('Challenges identified',     report.challenges_identified),
        ('Interventions delivered',   report.interventions_delivered),
        ('Outcomes achieved',         report.outcomes_achieved),
        ('Next steps',                report.next_steps),
        ('Additional notes',          report.additional_notes),
    ]
    for title, body in sections:
        story.extend(_section(s, title, body))

    story.append(Spacer(1, 12))
    team_lead = report.team_lead if report.team_lead else (group.team_lead if group.team_lead else None)
    story.append(_sig_block(
        s, team_lead,
        reviewer_label='For GOPA AFC / PRUDEV II Programme',
        sig_label='Team Lead Signature',
    ))

    doc.build(story, onFirstPage=_header, onLaterPages=_header)
    buf.seek(0)
    return buf


def render_work_order(work_order):
    """Build a styled PDF for one WorkOrder (PRUDEV II template)."""
    import os
    from reportlab.platypus import Image as RLImage, KeepTogether

    s = _styles()
    buf, doc = _build_doc()
    story = []

    bge = work_order.bge

    story.append(Paragraph('WORK ORDER', s['h1']))
    story.append(Paragraph(
        f'{work_order.get_work_order_type_display()} · {work_order.work_order_number}',
        s['sub'],
    ))

    story.append(_kv_table([
        ['Work Order #',    work_order.work_order_number or '—'],
        ['Project',         work_order.project_name or '—'],
        ['Type',            work_order.get_work_order_type_display()],
        ['Issue Date',      str(work_order.issue_date)],
        ['BGE',             bge.name],
        ['BGE Code',        bge.bge_code or '—'],
        ['Email',           bge.email or '—'],
        ['Location',        work_order.location or '—'],
        ['Duration',        work_order.duration or '—'],
        ['Start Date',      str(work_order.start_date) if work_order.start_date else '—'],
        ['End Date',        str(work_order.end_date) if work_order.end_date else '—'],
    ]))

    story.append(Spacer(1, 8))

    story.append(Paragraph('SCHEDULE 1 — SCOPE OF WORK', s['sectiontitle']))
    story.extend(_section(s, 'Objective', work_order.objective))

    if work_order.key_tasks:
        story.append(Paragraph('Key Tasks', s['sectiontitle']))
        for line in work_order.key_tasks.splitlines():
            line = line.strip()
            if line:
                story.append(Paragraph(
                    _safe_html(line),
                    ParagraphStyle('task', parent=s['body'], leftIndent=10),
                ))

    deliverables = work_order.deliverables_json or []
    if deliverables:
        story.append(Spacer(1, 6))
        story.append(Paragraph('Deliverables', s['sectiontitle']))
        cell_style = ParagraphStyle('del_cell', parent=s['body'],
                                    fontSize=9, leading=12, spaceAfter=0)
        hdr_style  = ParagraphStyle('del_hdr',  parent=cell_style,
                                    fontName='Helvetica-Bold',
                                    textColor=HexColor('#FFFFFF'))
        rows = [[
            Paragraph('#',           hdr_style),
            Paragraph('Description', hdr_style),
            Paragraph('Due Date',    hdr_style),
        ]]
        for d in deliverables:
            rows.append([
                Paragraph(str(d.get('task_num', '')),      cell_style),
                Paragraph(_safe_html(d.get('description', '')), cell_style),
                Paragraph(_safe_html(str(d.get('due_date', '—'))), cell_style),
            ])
        # Col widths: # (10mm) | Description (108mm) | Due Date (52mm) = 170mm
        t = Table(rows, hAlign='LEFT',
                  colWidths=[10 * mm, 108 * mm, 52 * mm], repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (-1, 0),  NAVY),
            ('LINEBELOW',     (0, 0), (-1, -1), 0.25, LIGHT_GREY),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING',    (0, 0), (-1, -1), 6),
            ('LEFTPADDING',   (0, 0), (-1, -1), 4),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
            ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor('#FFFFFF'), HexColor('#FAFAFA')]),
        ]))
        story.append(t)

        # Results-Based Payment Matrix — rendered only when outcome fields are present
        outcome_rows = [d for d in deliverables if any(d.get(k) for k in (
            'quantitative_result', 'qualitative_result', 'means_of_verification',
            'unit_rate', 'payment_condition',
        ))]
        if outcome_rows:
            story.append(Spacer(1, 10))
            story.append(Paragraph('SCHEDULE 1A — RESULTS-BASED PAYMENT MATRIX', s['sectiontitle']))
            note_style = ParagraphStyle('rbm_note', parent=s['body'],
                                        fontSize=8, leading=11,
                                        textColor=HexColor('#333333'), spaceAfter=6)
            story.append(Paragraph(
                '<b>A BGE must achieve BOTH:</b> Quantitative Targets = 50% <b>AND</b> '
                'Qualitative Outcomes = 50% to qualify for payment.',
                note_style,
            ))
            sm = ParagraphStyle('rbm_cell', parent=s['body'],
                                fontSize=7.5, leading=10, spaceAfter=0)
            hm = ParagraphStyle('rbm_hdr', parent=sm,
                                fontName='Helvetica-Bold',
                                textColor=HexColor('#FFFFFF'))
            matrix_rows = [[
                Paragraph('#',                            hm),
                Paragraph('Quantitative Result Required', hm),
                Paragraph('Qualitative Result Required',  hm),
                Paragraph('Means of Verification',       hm),
                Paragraph('Unit Rate (UGX)',              hm),
                Paragraph('Payment Condition',            hm),
            ]]
            for d in outcome_rows:
                matrix_rows.append([
                    Paragraph(str(d.get('task_num', '')),                       sm),
                    Paragraph(_safe_html(d.get('quantitative_result', '—')),    sm),
                    Paragraph(_safe_html(d.get('qualitative_result', '—')),     sm),
                    Paragraph(_safe_html(d.get('means_of_verification', '—')), sm),
                    Paragraph(_safe_html(str(d.get('unit_rate', '—'))),         sm),
                    Paragraph(_safe_html(d.get('payment_condition', '—')),      sm),
                ])
            # Col widths: # 8 | Quant 38 | Qual 38 | Means 35 | Rate 22 | Condition 29 = 170mm
            mt = Table(matrix_rows, hAlign='LEFT',
                       colWidths=[8*mm, 38*mm, 38*mm, 35*mm, 22*mm, 29*mm], repeatRows=1)
            mt.setStyle(TableStyle([
                ('BACKGROUND',     (0, 0), (-1, 0),  NAVY),
                ('LINEBELOW',      (0, 0), (-1, -1), 0.25, LIGHT_GREY),
                ('BOTTOMPADDING',  (0, 0), (-1, -1), 5),
                ('TOPPADDING',     (0, 0), (-1, -1), 5),
                ('LEFTPADDING',    (0, 0), (-1, -1), 3),
                ('RIGHTPADDING',   (0, 0), (-1, -1), 3),
                ('VALIGN',         (0, 0), (-1, -1), 'TOP'),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor('#FFFFFF'), HexColor('#FAFAFA')]),
            ]))
            story.append(mt)

    story.append(Spacer(1, 8))

    story.append(Paragraph('SCHEDULE 2 — PAYMENT TERMS', s['sectiontitle']))
    gross = work_order.rate_per_day * work_order.max_days
    wht   = int(gross * 0.06)
    net   = gross - wht
    story.append(_kv_table([
        ['Daily Rate',    f'UGX {work_order.rate_per_day:,}'],
        ['Maximum Days',  str(work_order.max_days)],
        ['Gross Amount',  f'UGX {gross:,}'],
        ['WHT (6%)',      f'UGX {wht:,}'],
        ['Net Payable',   f'UGX {net:,}'],
        ['Transport',     'Reimbursed at cost' if work_order.transport_reimbursed else 'Not reimbursed'],
    ]))
    if work_order.payment_notes:
        story.extend(_section(s, 'Payment Notes', work_order.payment_notes))

    story.append(Spacer(1, 8))

    if work_order.work_order_type in ('training_facilitation', 'biz_continuity_workshop'):
        CONDITIONS = [
            'The Senior BGE shall carry out all training facilitation duties with professionalism and in accordance with GOPA AFC and GIZ quality standards.',
            'All training content and session plans must be reviewed and approved by the BDS Expert before delivery.',
            'The Senior BGE shall submit a Training Report within 5 working days of each training session.',
            'A Lessons Learnt document must be submitted at the conclusion of the assignment.',
            'Participant feedback must be collected using the approved PRUDEV II feedback instrument at the close of every session.',
            'The Senior BGE is responsible for briefing and preparing assigned BGEs before each session and for monitoring their active participation throughout.',
            'Fees are conditional on satisfactory delivery of reports, approved training content, and completed feedback analysis.',
            'Transport will be reimbursed upon submission of receipts / fuel log.',
            'The Senior BGE shall maintain confidentiality of all MSME, BGE, and programme information.',
            'GOPA AFC reserves the right to withhold payment for incomplete or unsatisfactory deliverables.',
            'This work order is subject to the PRUDEV II Programme guidelines and GIZ contract conditions.',
            'Any changes to the scope or training schedule require written approval from the Team Leader.',
            '6% Withholding Tax (WHT) will be deducted from fees as required by Uganda Revenue Authority regulations.',
        ]
    else:
        CONDITIONS = [
            'The BGE shall carry out the assignment with due diligence and in accordance with GOPA AFC and GIZ standards.',
            'The BGE shall submit field visit reports within 5 working days of each visit.',
            'Fees are conditional on satisfactory delivery of reports and approved deliverables.',
            'Transport will be reimbursed upon submission of receipts / fuel log.',
            'The BGE shall maintain confidentiality of all MSME and programme information.',
            'GOPA AFC reserves the right to withhold payment for incomplete or unsatisfactory deliverables.',
            'This work order is subject to the PRUDEV II Programme guidelines and GIZ contract conditions.',
            'Any changes to the scope require written approval from the Team Leader.',
            '6% Withholding Tax (WHT) will be deducted from fees as required by Uganda Revenue Authority regulations.',
        ]
    story.append(Paragraph('CONDITIONS', s['sectiontitle']))
    for i, cond in enumerate(CONDITIONS, start=1):
        story.append(Paragraph(
            f'{i}. {_safe_html(cond)}',
            ParagraphStyle('cond', parent=s['body'], fontSize=9, leftIndent=10),
        ))

    story.append(Spacer(1, 12))

    # Signature block: team leader left, BGE right — both sides use the same
    # fixed height (SIG_H) so the columns are visually equal even when the TL
    # signature image hasn't been applied yet.
    tl_col = [
        Paragraph('For GOPA AFC / PRUDEV II Programme', s['label']),
        Spacer(1, 4),               # same gap as BGE column before the sig area
        Spacer(1, SIG_H),           # equal-height placeholder, always
        Paragraph('_' * 35, s['body']),
        Paragraph(_safe_html(work_order.team_leader_name or 'Stephen Maxi Opwonya'), s['body']),
        Paragraph(_safe_html(work_order.team_leader_position or 'Team Leader'), s['label']),
        Paragraph(f'Date: {work_order.issue_date}', s['meta']),
    ]

    bge_col = [Paragraph('Accepted by BGE', s['label']), Spacer(1, 4)]
    sig_drawn = False
    # Only embed the BGE signature when they have actually signed — prevents
    # the signature appearing on issued-but-unsigned work order previews.
    if work_order.status == 'signed':
        # Prefer DB-stored bytes (survives Render filesystem wipes), then file path
        if getattr(bge, 'signature_data', None):
            try:
                bge_col.append(RLImage(io.BytesIO(bytes(bge.signature_data)),
                                       width=40 * mm, height=SIG_H, kind='proportional'))
                sig_drawn = True
            except Exception:
                pass
        if not sig_drawn and bge.signature:
            try:
                sig_path = bge.signature.path
                if os.path.isfile(sig_path):
                    bge_col.append(RLImage(sig_path, width=40 * mm, height=SIG_H,
                                           kind='proportional'))
                    sig_drawn = True
            except Exception:
                pass
    if not sig_drawn:
        bge_col.append(Spacer(1, SIG_H))

    bge_col += [
        Paragraph('_' * 35, s['body']),
        Paragraph(_safe_html(bge.name), s['body']),
        Paragraph(_safe_html(bge.bge_code or ''), s['label']),
        Paragraph(
            f'Date: {work_order.bge_signed_date}' if work_order.bge_signed_date else 'Date: ___________________________',
            s['meta'],
        ),
    ]

    sig_table = Table([[tl_col, bge_col]], colWidths=[85 * mm, 85 * mm], hAlign='LEFT')
    sig_table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    story.append(KeepTogether([sig_table]))

    doc.build(story, onFirstPage=_header, onLaterPages=_header)
    buf.seek(0)
    return buf


def render_training_report(report):
    """Build a styled PDF for one TrainingReport (lead facilitator)."""
    s = _styles()
    buf, doc = _build_doc()
    story = []

    session = report.session
    bge = report.bge

    story.append(Paragraph(_safe_html(f'Training Report — {session.title}'), s['h1']))
    story.append(Paragraph(f'Lead Training Report · {session.date}', s['sub']))

    story.append(_kv_table([
        ['Session',           session.title],
        ['Date',              str(session.date)],
        ['Location',          session.location or '—'],
        ['Lead BGE',          bge.name if bge else '—'],
        ['Training Dates',    report.training_dates or '—'],
        ['Venue',             report.venue or '—'],
        ['District',          report.district or '—'],
        ['Time Allocation',   report.time_allocation or '—'],
        ['Facilitation Team', report.facilitation_team or '—'],
        ['Status',            report.get_status_display() if hasattr(report, 'get_status_display') else report.status],
    ]))

    story.append(Spacer(1, 8))

    # Participant demographics
    total = (report.participants_male_youth + report.participants_female_youth
             + report.participants_adult_male + report.participants_adult_female)
    demo_rows = [
        ['Male Youth (15–35)', 'Female Youth (15–35)', 'Adult Male (36+)', 'Adult Female (36+)', 'Total'],
        [
            str(report.participants_male_youth),
            str(report.participants_female_youth),
            str(report.participants_adult_male),
            str(report.participants_adult_female),
            str(total),
        ],
    ]
    demo_table = Table(demo_rows, hAlign='LEFT')
    demo_table.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, 0), NAVY),
        ('TEXTCOLOR',     (0, 0), (-1, 0), HexColor('#FFFFFF')),
        ('FONT',          (0, 0), (-1, 0), 'Helvetica-Bold', 9),
        ('FONT',          (0, 1), (-1, 1), 'Helvetica', 11),
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('GRID',          (0, 0), (-1, -1), 0.5, LIGHT_GREY),
        ('BACKGROUND',    (4, 1), (4, 1), LIGHT_GREY),
        ('FONT',          (4, 1), (4, 1), 'Helvetica-Bold', 11),
    ]))
    story.append(Paragraph('Participant Demographics', s['sectiontitle']))
    story.append(demo_table)
    story.append(Spacer(1, 10))

    narrative_sections = [
        ('Background & Purpose',                  report.training_purpose),
        ('Session Objectives',                     report.session_objectives),
        ('Activities Delivered',                   report.activities_delivered),
        ('Key Lessons Learnt',                     report.key_lessons),
        ('Growth Support Areas Observed',          report.growth_support_areas),
        ('Key Findings & Critical Issues',         report.key_findings),
        ('BGE Contributions & Development Needs',  report.bge_contributions),
        ('Proposed BDS Actions (Next 3 Months)',   report.bds_actions),
        ('Recommendations',                        report.recommendations),
        ('Next Steps',                             report.next_steps),
        ('Conclusion',                             report.conclusion),
    ]
    for title, body in narrative_sections:
        story.extend(_section(s, title, body))

    story.append(Spacer(1, 12))
    story.append(_sig_block(s, bge, signed_date=report.updated_at))

    doc.build(story, onFirstPage=_header, onLaterPages=_header)
    buf.seek(0)
    return buf


def render_mentor_report(report):
    """Build a styled PDF for one MentorTrainingReport."""
    s = _styles()
    buf, doc = _build_doc()
    story = []

    session = report.session
    bge = report.bge

    lead_assignment = session.facilitation_assignments.filter(role='lead').select_related('bge').first()
    lead_name = lead_assignment.bge.name if lead_assignment and lead_assignment.bge_id else '—'

    story.append(Paragraph(_safe_html(f'Mentor Training Report — {session.title}'), s['h1']))
    story.append(Paragraph(f'Mentor Report · {session.date}', s['sub']))

    story.append(_kv_table([
        ['Session',        session.title],
        ['Date',           str(session.date)],
        ['Location',       session.location or '—'],
        ['Mentor BGE',     bge.name if bge else '—'],
        ['Lead BGE',       lead_name],
        ['Training Dates', report.training_dates or '—'],
        ['Venue',          report.venue or '—'],
        ['Status',         report.get_status_display() if hasattr(report, 'get_status_display') else report.status],
    ]))

    story.append(Spacer(1, 8))

    narrative_sections = [
        ('Mentoring Activities',          report.mentoring_activities),
        ('MSMEs Specifically Supported',  report.msmes_mentored),
        ('Key Observations',              report.key_observations),
        ('Challenges Encountered',        report.challenges),
        ('Recommendations',               report.recommendations),
        ('Next Steps',                    report.next_steps),
    ]
    for title, body in narrative_sections:
        story.extend(_section(s, title, body))

    story.append(Spacer(1, 12))
    story.append(_sig_block(s, bge, signed_date=report.updated_at))

    doc.build(story, onFirstPage=_header, onLaterPages=_header)
    buf.seek(0)
    return buf


# ─────────────────────────────────────────────────────────────────────────────
# Quarterly / Programme-period summary report
# ─────────────────────────────────────────────────────────────────────────────

VISIT_LABELS_Q = {
    'data_update':      'Data Collection',
    'one_on_one':       'One-on-One Visit',
    'training':         'Training Visit',
    'coaching':         'Business Coaching',
    'annual_review':    'Annual Review',
    'initial':          'Initial Assessment',
    'followup':         'Follow-up Visit',
    'final':            'Final Assessment',
    'mentoring':        'Mentoring Session',
    'quarterly_review': 'Quarterly Review',
}


def _qr_styles():
    base = getSampleStyleSheet()
    NAVY2 = HexColor('#162A3A')
    MID   = HexColor('#2B5278')
    GREY2 = HexColor('#555555')
    return {
        'title':   ParagraphStyle('qrt',  fontName='Helvetica-Bold', fontSize=17,
                                  textColor=NAVY2, alignment=TA_CENTER, spaceAfter=2, leading=22),
        'sub':     ParagraphStyle('qrs',  fontName='Helvetica', fontSize=10,
                                  textColor=GREY2, alignment=TA_CENTER, spaceAfter=2),
        'h1':      ParagraphStyle('qrh1', fontName='Helvetica-Bold', fontSize=12,
                                  textColor=NAVY2, spaceBefore=12, spaceAfter=4, leading=16),
        'body':    ParagraphStyle('qrb',  fontName='Helvetica', fontSize=9.5,
                                  leading=14, spaceAfter=4, alignment=TA_JUSTIFY),
        'th':      ParagraphStyle('qrth', fontName='Helvetica-Bold', fontSize=8.5,
                                  textColor=HexColor('#FFFFFF'), alignment=TA_CENTER, leading=11),
        'td':      ParagraphStyle('qrtd',  fontName='Helvetica', fontSize=8.5, leading=11),
        'tdc':     ParagraphStyle('qrtdc', fontName='Helvetica', fontSize=8.5, leading=11,
                                  alignment=TA_CENTER),
        'tdb':     ParagraphStyle('qrtdb', fontName='Helvetica-Bold', fontSize=8.5, leading=11),
        'bge_hdr': ParagraphStyle('qrbh', fontName='Helvetica-Bold', fontSize=9.5,
                                  textColor=HexColor('#FFFFFF'), backColor=MID, leading=14,
                                  spaceBefore=6, spaceAfter=2),
    }


def _qr_table(data, cws, hrows=1, extra_cmds=()):
    """Build a styled quarterly-report table.  Pass ``extra_cmds`` for per-table
    style overrides instead of reaching into ReportLab private state afterwards."""
    NAVY2 = HexColor('#162A3A')
    t = Table(data, colWidths=cws, repeatRows=hrows)
    cmds = [
        ('BACKGROUND',    (0, 0), (-1, hrows-1), NAVY2),
        ('TEXTCOLOR',     (0, 0), (-1, hrows-1), HexColor('#FFFFFF')),
        ('FONTNAME',      (0, 0), (-1, hrows-1), 'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, -1), 8.5),
        ('LEADING',       (0, 0), (-1, -1), 11),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 5),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 5),
        ('GRID',          (0, 0), (-1, -1), 0.3, HexColor('#CCCCCC')),
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('ALIGN',         (0, 0), (-1, hrows-1), 'CENTER'),
    ]
    for i in range(hrows, len(data)):
        if i % 2 == 0:
            cmds.append(('BACKGROUND', (0, i), (-1, i), HexColor('#F5F5F5')))
    cmds.extend(extra_cmds)
    t.setStyle(TableStyle(cmds))
    return t


def render_quarterly_report(qs, start_date=None, end_date=None, label=''):
    """Generate a programme-period summary PDF from a queryset of MSMEReports.

    Args:
        qs:          Iterable / QuerySet of MSMEReport instances.
        start_date:  datetime.date or None (display only).
        end_date:    datetime.date or None (display only).
        label:       Optional period label, e.g. 'Q2 2026'.

    Returns:
        io.BytesIO with the PDF bytes, seeked to 0.
    """
    from collections import defaultdict, Counter

    NAVY2   = HexColor('#162A3A')
    ACCENT2 = HexColor('#C0392B')
    GREEN   = HexColor('#2E7D32')
    AMBER   = HexColor('#E67E22')
    MID     = HexColor('#2B5278')

    s = _qr_styles()
    reports = list(
        qs.select_related('bge', 'msme')
          .order_by('bge__name', 'msme__business_name', 'visit_date')
    )

    total_reports = len(reports)
    bge_ids  = {r.bge_id  for r in reports}
    msme_ids = {r.msme_id for r in reports}
    dates    = [r.visit_date for r in reports if r.visit_date]

    period_str = label or (f'{min(dates)} to {max(dates)}' if dates else 'All dates')
    start_str  = str(start_date) if start_date else (str(min(dates))  if dates else 'start')
    end_str    = str(end_date)   if end_date   else (str(max(dates))   if dates else 'end')

    by_bge = defaultdict(list)
    for r in reports:
        by_bge[r.bge].append(r)

    buf, doc = _build_doc()
    PAGE_W = A4[0]
    LM = RM = 20 * mm
    CW = PAGE_W - LM - RM
    story = []

    # ── Cover / KPI strip ────────────────────────────────────────────────────
    story.append(Spacer(1, 8))
    story.append(Paragraph('BGE One-on-One Support Summary', s['title']))
    story.append(Paragraph(f'PRUDEV II Programme  ·  Period: {period_str}', s['sub']))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width='100%', thickness=1.5, color=ACCENT2, spaceAfter=6))

    def _kpi_cell(num_txt, lbl_txt, idx):
        num_s = ParagraphStyle(f'kn{idx}', fontName='Helvetica-Bold', fontSize=20,
                               textColor=HexColor('#FFFFFF'), alignment=TA_CENTER, leading=24)
        lbl_s = ParagraphStyle(f'kl{idx}', fontName='Helvetica', fontSize=8,
                               textColor=HexColor('#FFFFFF'), alignment=TA_CENTER)
        return [Paragraph(num_txt, num_s), Paragraph(lbl_txt, lbl_s)]

    kpi_t = Table([[
        _kpi_cell(str(total_reports),  'Reports Filed',  0),
        _kpi_cell(str(len(bge_ids)),   'BGEs Reporting', 1),
        _kpi_cell(str(len(msme_ids)),  'MSMEs Visited',  2),
        _kpi_cell(f'{start_str[:10]}', f'to {end_str[:10]}', 3),
    ]], colWidths=[CW / 4] * 4)
    kpi_t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), ACCENT2),
        ('BACKGROUND', (1, 0), (1, 0), MID),
        ('BACKGROUND', (2, 0), (2, 0), GREEN),
        ('BACKGROUND', (3, 0), (3, 0), AMBER),
        ('TOPPADDING',    (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING',   (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN',  (0, 0), (-1, -1), 'CENTER'),
        ('GRID',   (0, 0), (-1, -1), 0, HexColor('#FFFFFF')),
    ]))
    story.append(kpi_t)
    story.append(Spacer(1, 12))

    # ── Visit-type breakdown table ────────────────────────────────────────────
    story.append(Paragraph('Overview — Reports by Visit Type', s['h1']))
    story.append(HRFlowable(width='100%', thickness=0.8, color=ACCENT2, spaceAfter=4))
    vt_counts = Counter(r.visit_type for r in reports)
    vt_rows = [[
        Paragraph('<b>Visit Type</b>', s['th']),
        Paragraph('<b>Count</b>', s['th']),
        Paragraph('<b>% of Total</b>', s['th']),
    ]]
    for vt, cnt in sorted(vt_counts.items(), key=lambda x: -x[1]):
        pct = f'{100 * cnt / total_reports:.0f}%' if total_reports else '—'
        vt_rows.append([
            Paragraph(VISIT_LABELS_Q.get(vt, vt), s['td']),
            Paragraph(str(cnt), s['tdc']),
            Paragraph(pct, s['tdc']),
        ])
    vt_rows.append([
        Paragraph('<b>TOTAL</b>', s['tdb']),
        Paragraph(f'<b>{total_reports}</b>',
                  ParagraphStyle('vtot', fontName='Helvetica-Bold', fontSize=8.5, alignment=TA_CENTER)),
        Paragraph('<b>100%</b>',
                  ParagraphStyle('vp',   fontName='Helvetica-Bold', fontSize=8.5, alignment=TA_CENTER)),
    ])
    vt_t = _qr_table(vt_rows, [CW * 0.55, CW * 0.22, CW * 0.23], extra_cmds=[
        ('BACKGROUND', (0, len(vt_rows)-1), (-1, len(vt_rows)-1), NAVY2),
        ('TEXTCOLOR',  (0, len(vt_rows)-1), (-1, len(vt_rows)-1), HexColor('#FFFFFF')),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
    ])
    story.append(vt_t)
    story.append(Spacer(1, 12))

    # ── Per-BGE summary table ─────────────────────────────────────────────────
    story.append(Paragraph('Per-BGE Summary', s['h1']))
    story.append(HRFlowable(width='100%', thickness=0.8, color=ACCENT2, spaceAfter=4))
    bge_rows = [[
        Paragraph('<b>BGE Name</b>', s['th']),
        Paragraph('<b>Reports</b>', s['th']),
        Paragraph('<b>MSMEs</b>', s['th']),
        Paragraph('<b>Visit Types</b>', s['th']),
    ]]
    for bge, rpts in sorted(by_bge.items(), key=lambda x: x[0].name):
        mc = len({r.msme_id for r in rpts})
        vt_str = ', '.join(
            f'{VISIT_LABELS_Q.get(vt, vt)} ({cnt})'
            for vt, cnt in sorted(Counter(r.visit_type for r in rpts).items(), key=lambda x: -x[1])
        )
        bge_rows.append([
            Paragraph(bge.name, s['td']),
            Paragraph(str(len(rpts)), s['tdc']),
            Paragraph(str(mc), s['tdc']),
            Paragraph(vt_str, s['td']),
        ])
    bge_rows.append([
        Paragraph(f'<b>TOTAL — {len(by_bge)} BGEs</b>', s['tdb']),
        Paragraph(f'<b>{total_reports}</b>',
                  ParagraphStyle('btot', fontName='Helvetica-Bold', fontSize=8.5, alignment=TA_CENTER)),
        Paragraph(f'<b>{len(msme_ids)}</b>',
                  ParagraphStyle('bmsme', fontName='Helvetica-Bold', fontSize=8.5, alignment=TA_CENTER)),
        '',
    ])
    bge_t = _qr_table(bge_rows, [CW * 0.31, CW * 0.12, CW * 0.11, CW * 0.46], extra_cmds=[
        ('BACKGROUND', (0, len(bge_rows)-1), (-1, len(bge_rows)-1), NAVY2),
        ('TEXTCOLOR',  (0, len(bge_rows)-1), (-1, len(bge_rows)-1), HexColor('#FFFFFF')),
        ('ALIGN', (1, 0), (2, -1), 'CENTER'),
    ])
    story.append(bge_t)

    # ── Detailed narratives per BGE ───────────────────────────────────────────
    story.append(Spacer(1, 8))
    story.append(Paragraph('Detailed BGE Activity Narratives', s['h1']))
    story.append(HRFlowable(width='100%', thickness=0.8, color=ACCENT2, spaceAfter=6))

    # Hoist repeated ParagraphStyles out of the inner loops — one object per style is enough
    _s_msmeh = ParagraphStyle('qr_msmeh', fontName='Helvetica-Bold', fontSize=9,
                               textColor=MID, spaceBefore=4, spaceAfter=2)
    _s_vrh   = ParagraphStyle('qr_vrh', fontName='Helvetica-Oblique', fontSize=8.5,
                               textColor=HexColor('#666666'), spaceBefore=2, spaceAfter=1)
    _s_vrb   = ParagraphStyle('qr_vrb', fontName='Helvetica', fontSize=8.5,
                               leading=12, spaceAfter=2, leftIndent=8, alignment=TA_JUSTIFY)
    _s_vrn   = ParagraphStyle('qr_vrn', fontName='Helvetica-Oblique', fontSize=8.5,
                               textColor=HexColor('#999999'), leftIndent=8, spaceAfter=2)

    for bge, rpts in sorted(by_bge.items(), key=lambda x: x[0].name):
        mc = len({r.msme_id for r in rpts})
        vt_str = ', '.join(
            f'{VISIT_LABELS_Q.get(vt, vt)} ({cnt})'
            for vt, cnt in sorted(Counter(r.visit_type for r in rpts).items(), key=lambda x: -x[1])
        )
        hdr = (
            f'<b>{_safe_html(bge.name)}</b>'
            f'  —  {len(rpts)} report{"s" if len(rpts)!=1 else ""}  |  '
            f'{mc} MSME{"s" if mc!=1 else ""}  |  {_safe_html(vt_str)}'
        )
        bge_block = [Spacer(1, 6), Paragraph(hdr, s['bge_hdr'])]

        by_msme = defaultdict(list)
        for r in rpts:
            by_msme[r.msme].append(r)

        for msme, mrpts in sorted(by_msme.items(), key=lambda x: x[0].business_name):
            mrpts_s = sorted(mrpts, key=lambda r: r.visit_date or '')
            bge_block.append(Spacer(1, 4))
            bge_block.append(Paragraph(
                f'<b>{_safe_html(msme.business_name)}</b>'
                f'  ({len(mrpts_s)} visit{"s" if len(mrpts_s)!=1 else ""})',
                _s_msmeh,
            ))
            for r in mrpts_s:
                vt_lbl   = VISIT_LABELS_Q.get(r.visit_type, r.visit_type)
                date_str = str(r.visit_date) if r.visit_date else '—'
                parts = [
                    ('Support',     r.support_provided),
                    ('Achievement', r.key_achievement),
                    ('Challenges',  r.challenges_identified),
                    ('Action Plan', r.action_plan),
                ]
                bge_block.append(Paragraph(f'[{date_str} | {_safe_html(vt_lbl)}]', _s_vrh))
                has_text = False
                for fl, fv in parts:
                    if fv and fv.strip():
                        snippet = fv.strip()[:400] + ('…' if len(fv.strip()) > 400 else '')
                        bge_block.append(Paragraph(
                            f'<b>{_safe_html(fl)}:</b> {_safe_html(snippet)}',
                            _s_vrb,
                        ))
                        has_text = True
                if not has_text:
                    bge_block.append(Paragraph('(No narrative recorded)', _s_vrn))

        story.append(KeepTogether(bge_block[:4]))
        story.extend(bge_block[4:])

    story.append(Spacer(1, 12))
    story.append(HRFlowable(width='100%', thickness=0.8, color=NAVY2, spaceAfter=4))
    story.append(Paragraph(
        f'Generated from PRUDEV II Portfolio Management System  ·  Period: {period_str}',
        ParagraphStyle('foot2', fontName='Helvetica', fontSize=7.5,
                       textColor=HexColor('#888888'), alignment=TA_CENTER),
    ))

    doc.build(story, onFirstPage=_header, onLaterPages=_header)
    buf.seek(0)
    return buf
