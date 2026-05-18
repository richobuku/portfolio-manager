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
)
from reportlab.lib.enums import TA_LEFT


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
        'body':  ParagraphStyle('body',  parent=base['Normal'],   fontSize=10, leading=14, alignment=TA_LEFT, spaceAfter=8),
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


def _sig_block(s, bge, signed_date=None, reviewer_label='Reviewed by (Senior BGE / Admin)', sig_label='BGE Signature'):
    """Signature row appended to the bottom of any BGE-authored document.
    Left column: reviewer/team-lead placeholder (always equal-height blank).
    Right column: BGE signature image if available, otherwise blank of same height.
    """
    from reportlab.platypus import Image as RLImage, KeepTogether

    reviewer_col = [
        Paragraph(reviewer_label, s['label']),
        Spacer(1, 4),               # same gap as sig column
        Spacer(1, SIG_H),           # blank placeholder, equal to BGE sig height
        Paragraph('_' * 35, s['body']),
        Paragraph('Name: ___________________________', s['meta']),
        Paragraph('Position: ________________________', s['meta']),
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
    s = _styles()
    buf, doc = _build_doc()
    story = []

    msme = report.msme
    bge  = report.bge

    story.append(Paragraph(_safe_html(f'Visit Report — {msme.business_name}'), s['h1']))
    visit_label = report.get_visit_type_display() if hasattr(report, 'get_visit_type_display') else report.visit_type
    story.append(Paragraph(
        f'{visit_label} · {report.visit_date}', s['sub']
    ))

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

    # Narrative sections
    sections = [
        ('Business overview',          report.business_overview),
        ('Challenges identified',      report.challenges_identified),
        ('Support provided',           report.support_provided),
        ('Recommendations',            report.recommendations),
        ('Action plan',                report.action_plan),
        ('Next steps',                 report.next_steps),
        ('Additional notes',           report.additional_notes),
    ]
    for title, body in sections:
        story.extend(_section(s, title, body))

    story.append(Spacer(1, 12))
    story.append(_sig_block(s, bge, getattr(report, 'updated_at', None)))

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
        for i, line in enumerate(work_order.key_tasks.splitlines(), start=1):
            line = line.strip()
            if line:
                story.append(Paragraph(
                    f'{i}. {_safe_html(line)}',
                    ParagraphStyle('task', parent=s['body'], leftIndent=10),
                ))

    deliverables = work_order.deliverables_json or []
    if deliverables:
        story.append(Spacer(1, 6))
        story.append(Paragraph('Deliverables', s['sectiontitle']))
        # Cell styles for body rows — Paragraph ensures long text wraps instead
        # of overflowing into adjacent columns.
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

    if work_order.work_order_type == 'training_facilitation':
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
