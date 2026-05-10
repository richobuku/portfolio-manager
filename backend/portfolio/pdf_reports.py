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

    doc.build(story, onFirstPage=_header, onLaterPages=_header)
    buf.seek(0)
    return buf
