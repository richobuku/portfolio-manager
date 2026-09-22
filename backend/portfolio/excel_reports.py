"""Excel report generation for PRUDEV II Portfolio Manager.

Uses xlsxwriter to produce multi-sheet activity reports.
"""
import io
from collections import defaultdict


def generate_activity_excel(data_updates, sessions, mentor_reports,
                             start_date=None, end_date=None, label=''):
    """Generate a Programme Activity Report Excel workbook.

    Args:
        data_updates:   QuerySet of MSMEReport (visit_type='data_update').
        sessions:       QuerySet of TrainingSession with attendance data.
        mentor_reports: QuerySet of MentorTrainingReport.
        start_date:     datetime.date or None.
        end_date:       datetime.date or None.
        label:          Optional period label string.

    Returns:
        io.BytesIO with the .xlsx bytes, seeked to 0.
    """
    import xlsxwriter

    # Materialise querysets
    updates_list  = list(data_updates.select_related('bge', 'msme').order_by('visit_date'))
    sessions_list = list(sessions.prefetch_related('attendances', 'topic').order_by('date'))
    mentor_list   = list(mentor_reports.select_related('bge', 'session').order_by('session__date'))

    # KPI figures
    n_updates    = len(updates_list)
    n_sessions   = len(sessions_list)
    n_attendance = sum(
        s_obj.attendances.filter(present=True).count()
        for s_obj in sessions_list
    )
    n_mentor = len(mentor_list)

    dates_all = (
        [r.visit_date for r in updates_list if r.visit_date]
        + [s_obj.date for s_obj in sessions_list if s_obj.date]
        + [m.session.date for m in mentor_list if m.session and m.session.date]
    )
    period_str = label or (
        f'{min(dates_all)} to {max(dates_all)}' if dates_all else 'All dates'
    )

    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {'in_memory': True})

    # ── Shared formats ────────────────────────────────────────────────────────
    NAVY    = '#162A3A'
    ALT_ROW = '#F4F6F9'

    fmt_title = wb.add_format({
        'bold': True, 'font_size': 14, 'font_color': NAVY,
        'valign': 'vcenter',
    })
    fmt_hdr = wb.add_format({
        'bold': True, 'font_size': 9, 'font_color': '#FFFFFF',
        'bg_color': NAVY, 'border': 1, 'border_color': '#CCCCCC',
        'valign': 'vcenter', 'text_wrap': True,
    })
    fmt_kpi_lbl = wb.add_format({
        'bold': True, 'font_size': 10, 'font_color': NAVY,
    })
    fmt_kpi_val = wb.add_format({
        'bold': True, 'font_size': 18, 'font_color': '#C0392B',
        'valign': 'vcenter',
    })
    fmt_cell = wb.add_format({
        'font_size': 9, 'valign': 'vcenter', 'text_wrap': True,
        'border': 1, 'border_color': '#E0E0E0',
    })
    fmt_cell_alt = wb.add_format({
        'font_size': 9, 'valign': 'vcenter', 'text_wrap': True,
        'bg_color': ALT_ROW, 'border': 1, 'border_color': '#E0E0E0',
    })
    fmt_cell_c = wb.add_format({
        'font_size': 9, 'valign': 'vcenter', 'align': 'center',
        'border': 1, 'border_color': '#E0E0E0',
    })
    fmt_cell_c_alt = wb.add_format({
        'font_size': 9, 'valign': 'vcenter', 'align': 'center',
        'bg_color': ALT_ROW, 'border': 1, 'border_color': '#E0E0E0',
    })

    def _row_fmt(idx):
        """Return (cell_fmt, centre_fmt) for this 0-based data row index."""
        if idx % 2 == 0:
            return fmt_cell, fmt_cell_c
        return fmt_cell_alt, fmt_cell_c_alt

    def _write_hdr(ws, row, cols):
        for col, text in enumerate(cols):
            ws.write(row, col, text, fmt_hdr)

    # ═════════════════════════════════════════════════════════════════════════
    # Sheet 1: Summary
    # ═════════════════════════════════════════════════════════════════════════
    ws_sum = wb.add_worksheet('Summary')
    ws_sum.set_column(0, 0, 28)
    ws_sum.set_column(1, 1, 18)

    ws_sum.write(0, 0, 'PRUDEV II — Programme Activity Report', fmt_title)
    ws_sum.write(1, 0, f'Period: {period_str}', wb.add_format({'font_size': 10, 'italic': True}))
    ws_sum.write(3, 0, 'Key Performance Indicators', fmt_kpi_lbl)

    kpi_rows = [
        ('Data Update Visits',        n_updates),
        ('Training Sessions',         n_sessions),
        ('Total Training Attendance', n_attendance),
        ('Mentor Sessions',           n_mentor),
    ]
    for i, (lbl, val) in enumerate(kpi_rows):
        ws_sum.write(4 + i, 0, lbl, fmt_kpi_lbl)
        ws_sum.write(4 + i, 1, val, fmt_kpi_val)
        ws_sum.set_row(4 + i, 28)

    # Monthly summary table
    month_data = defaultdict(lambda: [0, 0, 0])
    for r in updates_list:
        if r.visit_date:
            key = r.visit_date.strftime('%b %Y')
            month_data[key][0] += 1
    for s_obj in sessions_list:
        if s_obj.date:
            key = s_obj.date.strftime('%b %Y')
            month_data[key][1] += 1
    for m in mentor_list:
        if m.session and m.session.date:
            key = m.session.date.strftime('%b %Y')
            month_data[key][2] += 1

    if month_data:
        import datetime as _dt
        sorted_months = sorted(
            month_data.keys(),
            key=lambda k: _dt.datetime.strptime(k, '%b %Y'),
        )
        ws_sum.set_column(2, 5, 18)
        month_start_row = 9
        ws_sum.write(month_start_row, 0, 'Monthly Activity', fmt_kpi_lbl)
        _write_hdr(ws_sum, month_start_row + 1, ['Month', 'Data Updates', 'Training Sessions', 'Mentor Sessions'])
        for i, month in enumerate(sorted_months):
            r_idx = month_start_row + 2 + i
            cf, cc = _row_fmt(i)
            ws_sum.write(r_idx, 0, month, cf)
            ws_sum.write(r_idx, 1, month_data[month][0], cc)
            ws_sum.write(r_idx, 2, month_data[month][1], cc)
            ws_sum.write(r_idx, 3, month_data[month][2], cc)

        # Bar chart
        chart = wb.add_chart({'type': 'bar'})
        data_rows = len(sorted_months)
        chart.add_series({
            'name':       'Data Updates',
            'categories': ['Summary', month_start_row + 2, 0, month_start_row + 1 + data_rows, 0],
            'values':     ['Summary', month_start_row + 2, 1, month_start_row + 1 + data_rows, 1],
            'fill':       {'color': '#C0392B'},
        })
        chart.add_series({
            'name':       'Training Sessions',
            'categories': ['Summary', month_start_row + 2, 0, month_start_row + 1 + data_rows, 0],
            'values':     ['Summary', month_start_row + 2, 2, month_start_row + 1 + data_rows, 2],
            'fill':       {'color': '#2B5278'},
        })
        chart.add_series({
            'name':       'Mentor Sessions',
            'categories': ['Summary', month_start_row + 2, 0, month_start_row + 1 + data_rows, 0],
            'values':     ['Summary', month_start_row + 2, 3, month_start_row + 1 + data_rows, 3],
            'fill':       {'color': '#E67E22'},
        })
        chart.set_title({'name': 'Monthly Activity Overview'})
        chart.set_x_axis({'name': 'Count'})
        chart.set_y_axis({'name': 'Month'})
        chart.set_size({'width': 480, 'height': 300})
        ws_sum.insert_chart(month_start_row + 2 + data_rows + 2, 0, chart)

    # ═════════════════════════════════════════════════════════════════════════
    # Sheet 2: Data Updates
    # ═════════════════════════════════════════════════════════════════════════
    ws_du = wb.add_worksheet('Data Updates')
    ws_du.set_column(0, 0, 12)   # Date
    ws_du.set_column(1, 1, 22)   # BGE
    ws_du.set_column(2, 2, 22)   # MSME
    ws_du.set_column(3, 3, 28)   # Business Name
    ws_du.set_column(4, 4, 18)   # Sector
    ws_du.set_column(5, 5, 18)   # District
    ws_du.set_column(6, 6, 40)   # Business Overview
    ws_du.set_column(7, 7, 40)   # Support Provided
    ws_du.set_row(0, 20)

    _write_hdr(ws_du, 0, [
        'Visit Date', 'BGE', 'MSME Code', 'Business Name',
        'Sector', 'District', 'Business Overview', 'Support Provided',
    ])

    for i, r in enumerate(updates_list):
        cf, cc = _row_fmt(i)
        msme = r.msme
        bge  = r.bge
        ws_du.write(i + 1, 0, str(r.visit_date) if r.visit_date else '—', cc)
        ws_du.write(i + 1, 1, bge.name if bge else '—', cf)
        ws_du.write(i + 1, 2, (msme.msme_code or '—') if msme else '—', cc)
        ws_du.write(i + 1, 3, msme.business_name if msme else '—', cf)
        ws_du.write(i + 1, 4, (msme.sector or '—') if msme else '—', cf)
        ws_du.write(i + 1, 5, (msme.state or '—') if msme else '—', cf)
        overview = (r.business_overview or '')[:500]
        support  = (r.support_provided  or '')[:500]
        ws_du.write(i + 1, 6, overview, cf)
        ws_du.write(i + 1, 7, support,  cf)
        ws_du.set_row(i + 1, 40)

    # ═════════════════════════════════════════════════════════════════════════
    # Sheet 3: Training Sessions
    # ═════════════════════════════════════════════════════════════════════════
    ws_ts = wb.add_worksheet('Training Sessions')
    ws_ts.set_column(0, 0, 12)
    ws_ts.set_column(1, 1, 12)
    ws_ts.set_column(2, 2, 30)
    ws_ts.set_column(3, 3, 22)
    ws_ts.set_column(4, 4, 22)
    ws_ts.set_column(5, 9, 10)
    ws_ts.set_column(10, 11, 10)
    ws_ts.set_row(0, 20)

    _write_hdr(ws_ts, 0, [
        'Date', 'End Date', 'Title', 'Location', 'Topic',
        'Total Attended', 'Male', 'Female',
        'Youth M', 'Youth F', 'Refugee', 'Host',
    ])

    for i, sess in enumerate(sessions_list):
        cf, cc = _row_fmt(i)
        atts = list(sess.attendances.filter(present=True))
        t_total   = len(atts)
        t_male    = sum(1 for a in atts if a.gender == 'M')
        t_fem     = sum(1 for a in atts if a.gender == 'F')
        t_ym      = sum(1 for a in atts if a.gender == 'M' and a.age_group == '18-34')
        t_yf      = sum(1 for a in atts if a.gender == 'F' and a.age_group == '18-34')
        t_refugee = sum(1 for a in atts if a.refugee_status == 'R')
        t_host    = sum(1 for a in atts if a.refugee_status == 'H')
        topic_name = sess.topic.name if sess.topic else '—'
        ws_ts.write(i + 1, 0, str(sess.date), cc)
        ws_ts.write(i + 1, 1, str(sess.end_date) if sess.end_date else '—', cc)
        ws_ts.write(i + 1, 2, sess.title, cf)
        ws_ts.write(i + 1, 3, sess.location or '—', cf)
        ws_ts.write(i + 1, 4, topic_name, cf)
        ws_ts.write(i + 1, 5, t_total,   cc)
        ws_ts.write(i + 1, 6, t_male,    cc)
        ws_ts.write(i + 1, 7, t_fem,     cc)
        ws_ts.write(i + 1, 8, t_ym,      cc)
        ws_ts.write(i + 1, 9, t_yf,      cc)
        ws_ts.write(i + 1, 10, t_refugee, cc)
        ws_ts.write(i + 1, 11, t_host,    cc)

    # ═════════════════════════════════════════════════════════════════════════
    # Sheet 4: Training Attendance (flat list)
    # ═════════════════════════════════════════════════════════════════════════
    ws_att = wb.add_worksheet('Training Attendance')
    ws_att.set_column(0, 0, 30)
    ws_att.set_column(1, 1, 12)
    ws_att.set_column(2, 2, 24)
    ws_att.set_column(3, 3, 16)
    ws_att.set_column(4, 4, 24)
    ws_att.set_column(5, 5, 8)
    ws_att.set_column(6, 6, 10)
    ws_att.set_column(7, 7, 10)
    ws_att.set_row(0, 20)

    _write_hdr(ws_att, 0, [
        'Session', 'Date', 'Attendee Name', 'Phone',
        'MSME', 'Gender', 'Age Group', 'Refugee Status', 'Present',
    ])

    att_row = 1
    for sess in sessions_list:
        atts = list(sess.attendances.select_related('msme').order_by('attendee_name'))
        for att in atts:
            cf, cc = _row_fmt(att_row - 1)
            refugee_label = (
                'Refugee' if att.refugee_status == 'R'
                else ('Host' if att.refugee_status == 'H' else '—')
            )
            msme_name = att.msme.business_name if att.msme else '—'
            ws_att.write(att_row, 0, sess.title, cf)
            ws_att.write(att_row, 1, str(att.attendance_date) if att.attendance_date else str(sess.date), cc)
            ws_att.write(att_row, 2, att.attendee_name or '—', cf)
            ws_att.write(att_row, 3, att.attendee_phone or '—', cc)
            ws_att.write(att_row, 4, msme_name, cf)
            ws_att.write(att_row, 5, att.gender or '—', cc)
            ws_att.write(att_row, 6, att.age_group or '—', cc)
            ws_att.write(att_row, 7, refugee_label, cc)
            ws_att.write(att_row, 8, 'Yes' if att.present else 'No', cc)
            att_row += 1

    # ═════════════════════════════════════════════════════════════════════════
    # Sheet 5: Mentorship
    # ═════════════════════════════════════════════════════════════════════════
    ws_men = wb.add_worksheet('Mentorship')
    ws_men.set_column(0, 0, 12)
    ws_men.set_column(1, 1, 28)
    ws_men.set_column(2, 2, 24)
    ws_men.set_column(3, 3, 24)
    ws_men.set_column(4, 4, 50)
    ws_men.set_row(0, 20)

    _write_hdr(ws_men, 0, [
        'Date', 'Session', 'Mentor BGE', 'Status', 'Mentoring Activities',
    ])

    for i, m in enumerate(mentor_list):
        cf, cc = _row_fmt(i)
        sess_date = str(m.session.date) if m.session and m.session.date else '—'
        sess_title = m.session.title if m.session else '—'
        bge_name   = m.bge.name if m.bge else '—'
        activities = (m.mentoring_activities or '')[:600]
        ws_men.write(i + 1, 0, sess_date, cc)
        ws_men.write(i + 1, 1, sess_title, cf)
        ws_men.write(i + 1, 2, bge_name, cf)
        ws_men.write(i + 1, 3, m.get_status_display() if hasattr(m, 'get_status_display') else m.status, cc)
        ws_men.write(i + 1, 4, activities, cf)
        ws_men.set_row(i + 1, 40)

    wb.close()
    buf.seek(0)
    return buf


def generate_enterprise_improvement_plan_excel(plan):
    """
    Generate an Excel workbook for an Enterprise Improvement Plan (TBIP)
    matching the official PRUDEV II layout.
    """
    import xlsxwriter

    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {'in_memory': True})
    ws = wb.add_worksheet('MSME Assessment & TBIP')

    # Color definitions
    DARK_RED   = '#9E0A1E'
    NAVY_BLUE  = '#1A365D'
    HEADER_BLUE= '#2A4365'
    LIGHT_GRAY = '#F7FAFC'
    YELLOW     = '#FFFF00'
    LIGHT_GREEN= '#E6FFFA'
    BORDER_CLR = '#CBD5E0'

    # Formats
    fmt_banner = wb.add_format({
        'bold': True, 'font_size': 13, 'font_color': '#FFFFFF',
        'bg_color': DARK_RED, 'align': 'left', 'valign': 'vcenter',
        'border': 1, 'border_color': DARK_RED,
    })
    fmt_subtitle = wb.add_format({
        'italic': True, 'font_size': 9, 'font_color': '#4A5568',
        'align': 'left', 'valign': 'vcenter',
    })
    fmt_section_hdr = wb.add_format({
        'bold': True, 'font_size': 11, 'font_color': '#FFFFFF',
        'bg_color': NAVY_BLUE, 'align': 'left', 'valign': 'vcenter',
        'border': 1, 'border_color': NAVY_BLUE,
    })
    fmt_tbl_hdr = wb.add_format({
        'bold': True, 'font_size': 10, 'font_color': '#FFFFFF',
        'bg_color': HEADER_BLUE, 'align': 'left', 'valign': 'vcenter',
        'border': 1, 'border_color': '#2C5282',
    })
    fmt_tbl_hdr_c = wb.add_format({
        'bold': True, 'font_size': 10, 'font_color': '#FFFFFF',
        'bg_color': HEADER_BLUE, 'align': 'center', 'valign': 'vcenter',
        'border': 1, 'border_color': '#2C5282',
    })
    fmt_cell = wb.add_format({
        'font_size': 9.5, 'valign': 'vcenter', 'border': 1,
        'border_color': BORDER_CLR, 'text_wrap': True,
    })
    fmt_cell_bold = wb.add_format({
        'font_size': 9.5, 'bold': True, 'valign': 'vcenter', 'border': 1,
        'border_color': BORDER_CLR,
    })
    fmt_cell_center = wb.add_format({
        'font_size': 9.5, 'align': 'center', 'valign': 'vcenter',
        'border': 1, 'border_color': BORDER_CLR,
    })
    fmt_answer_cell = wb.add_format({
        'font_size': 9.5, 'bold': True, 'align': 'center', 'valign': 'vcenter',
        'bg_color': '#FEFCBF', 'border': 1, 'border_color': BORDER_CLR,
    })
    fmt_meta_label = wb.add_format({
        'bold': True, 'font_size': 9, 'font_color': '#2D3748',
        'bg_color': '#EDF2F7', 'border': 1, 'border_color': BORDER_CLR,
    })
    fmt_meta_val = wb.add_format({
        'font_size': 9.5, 'border': 1, 'border_color': BORDER_CLR,
    })
    fmt_priority_low = wb.add_format({
        'bold': True, 'font_size': 10, 'align': 'center', 'valign': 'vcenter',
        'bg_color': '#C6F6D5', 'font_color': '#22543D', 'border': 1, 'border_color': BORDER_CLR,
    })
    fmt_priority_med = wb.add_format({
        'bold': True, 'font_size': 10, 'align': 'center', 'valign': 'vcenter',
        'bg_color': '#FEEBC8', 'font_color': '#7B341E', 'border': 1, 'border_color': BORDER_CLR,
    })
    fmt_priority_high = wb.add_format({
        'bold': True, 'font_size': 10, 'align': 'center', 'valign': 'vcenter',
        'bg_color': '#FED7D7', 'font_color': '#742A2A', 'border': 1, 'border_color': BORDER_CLR,
    })

    # Set column widths
    ws.set_column('A:A', 24)
    ws.set_column('B:B', 65)
    ws.set_column('C:C', 15)
    ws.set_column('D:D', 20)
    ws.set_column('E:E', 18)
    ws.set_column('F:F', 30)
    ws.set_column('G:G', 15)

    # 1. Title Banner
    ws.merge_range('A1:G1', 'PRUDEV II — MSME Business Assessment & Technical Business Improvement Plan', fmt_banner)
    ws.set_row(0, 26)
    ws.write('A2', 'Answer each question Yes / No / N/A during the visit. Category status and priority below calculate automatically.', fmt_subtitle)

    # Metadata rows
    ws.write('A3', 'MSME Name:', fmt_meta_label)
    ws.write('B3', f"{plan.msme.name} ({plan.msme.msme_code or '—'})", fmt_meta_val)
    ws.write('C3', 'Assessment Date:', fmt_meta_label)
    ws.write('D3', str(plan.assessment_date), fmt_meta_val)
    ws.write('E3', 'Lead BGE:', fmt_meta_label)
    ws.write('F3', plan.bge.name if plan.bge else '—', fmt_meta_val)

    # Section 1: Business Assessment
    ws.merge_range('A5:C5', 'Business Assessment', fmt_section_hdr)
    ws.write('A6', 'Category', fmt_tbl_hdr)
    ws.write('B6', 'Question', fmt_tbl_hdr)
    ws.write('C6', 'Answer', fmt_tbl_hdr_c)

    from .views.enterprise_improvement_plan import TBIP_CATEGORIES, calculate_diagnostic

    answers = plan.assessment_answers or {}
    gap_notes = plan.gap_notes or {}
    row_idx = 6

    for cat in TBIP_CATEGORIES:
        cat_name = cat['name']
        for q in cat['questions']:
            ans = answers.get(q['id']) or answers.get(q['text']) or 'N/A'
            ws.write(row_idx, 0, cat_name, fmt_cell_bold)
            ws.write(row_idx, 1, q['text'], fmt_cell)
            ws.write(row_idx, 2, ans, fmt_answer_cell)
            row_idx += 1

    row_idx += 1
    # Section 2: Diagnostic Snapshot
    snap_start = row_idx
    ws.merge_range(snap_start, 0, snap_start, 3, 'Diagnostic Snapshot — Category Status (calculated automatically)', fmt_section_hdr)
    row_idx += 1
    ws.write(row_idx, 0, 'Category', fmt_tbl_hdr)
    ws.write(row_idx, 1, 'Status', fmt_tbl_hdr_c)
    ws.write(row_idx, 2, 'Gaps / Applicable', fmt_tbl_hdr_c)
    ws.write(row_idx, 3, 'BGE Note on Key Gap', fmt_tbl_hdr)
    row_idx += 1

    diag = plan.diagnostic_snapshot or calculate_diagnostic(answers)
    categories_diag = diag.get('categories', {})

    for cat in TBIP_CATEGORIES:
        cat_name = cat['name']
        cdata = categories_diag.get(cat_name, {})
        c_status = cdata.get('status', 'N/A')
        c_ratio = cdata.get('ratio', f"{cdata.get('gaps', 0)} / {cdata.get('applicable', 0)}")
        note = gap_notes.get(cat_name) or gap_notes.get(cat['id']) or ''

        ws.write(row_idx, 0, cat_name, fmt_cell_bold)
        ws.write(row_idx, 1, c_status, fmt_cell_center)
        ws.write(row_idx, 2, c_ratio, fmt_cell_center)
        ws.write(row_idx, 3, note, fmt_cell)
        row_idx += 1

    # Overall Priority
    ov_priority = plan.overall_priority or diag.get('overall_priority', 'Low')
    p_fmt = fmt_priority_high if ov_priority == 'High' else (fmt_priority_med if ov_priority == 'Medium' else fmt_priority_low)
    ws.write(row_idx, 0, 'Overall Priority', fmt_cell_bold)
    ws.write(row_idx, 1, ov_priority, p_fmt)
    ws.write(row_idx, 2, f"{diag.get('total_gaps', 0)} total gaps", fmt_cell_center)
    ws.write(row_idx, 3, '', fmt_cell)
    row_idx += 2

    # Section 3: Priority Actions — Technical Business Improvement Plan (3–5 actions)
    ws.merge_range(row_idx, 0, row_idx, 6, 'Priority Actions — Technical Business Improvement Plan (3–5 actions)', fmt_section_hdr)
    row_idx += 1
    ws.write(row_idx, 0, '#', fmt_tbl_hdr_c)
    ws.write(row_idx, 1, 'Priority Action', fmt_tbl_hdr)
    ws.write(row_idx, 2, 'Linked Category', fmt_tbl_hdr)
    ws.write(row_idx, 3, 'Owner (BGE)', fmt_tbl_hdr)
    ws.write(row_idx, 4, 'Timeline', fmt_tbl_hdr_c)
    ws.write(row_idx, 5, 'Expected Outcome', fmt_tbl_hdr)
    ws.write(row_idx, 6, 'Status', fmt_tbl_hdr_c)
    row_idx += 1

    actions_list = plan.priority_actions or []
    if not actions_list:
        actions_list = [{'id': i+1, 'action': '', 'category': '', 'owner': plan.bge.name if plan.bge else '', 'timeline': '', 'outcome': '', 'status': 'Pending'} for i in range(3)]

    for idx, act in enumerate(actions_list):
        ws.write(row_idx, 0, str(act.get('id', idx + 1)), fmt_cell_center)
        ws.write(row_idx, 1, act.get('action', act.get('priority_action', '')), fmt_cell)
        ws.write(row_idx, 2, act.get('category', act.get('linked_category', '')), fmt_cell)
        ws.write(row_idx, 3, act.get('owner', act.get('owner_bge', '')), fmt_cell)
        ws.write(row_idx, 4, act.get('timeline', ''), fmt_cell_center)
        ws.write(row_idx, 5, act.get('outcome', act.get('expected_outcome', '')), fmt_cell)
        ws.write(row_idx, 6, act.get('status', 'Pending'), fmt_cell_center)
        row_idx += 1

    row_idx += 1
    # Section 4: Sign-offs
    ws.write(row_idx, 0, 'BGE Sign-off:', fmt_meta_label)
    ws.write(row_idx, 1, plan.bge_sign_off_name or (plan.bge.name if plan.bge_signed else '—'), fmt_meta_val)
    ws.write(row_idx, 2, 'Date:', fmt_meta_label)
    ws.write(row_idx, 3, str(plan.bge_signed_at or '—'), fmt_meta_val)
    row_idx += 1

    ws.write(row_idx, 0, 'Head of Assignment Approval:', fmt_meta_label)
    ws.write(row_idx, 1, plan.hoa_sign_off_name or (plan.hoa_approved_by.get_full_name() if plan.hoa_approved_by else '—'), fmt_meta_val)
    ws.write(row_idx, 2, 'Date:', fmt_meta_label)
    ws.write(row_idx, 3, str(plan.hoa_approved_at or '—'), fmt_meta_val)

    wb.close()
    buf.seek(0)
    return buf.getvalue()


def generate_diagnostic_progress_excel(msmes_qs=None):
    """Generate an Executive Diagnostic Baseline & Progress Excel Workbook using openpyxl."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from .models import MSME, Cohort

    if msmes_qs is None:
        msmes_qs = MSME.objects.filter(is_active=True).select_related('cohort', 'assigned_bge').prefetch_related('growth_snapshots')

    msmes_list = list(msmes_qs)
    diag_msmes = [m for m in msmes_list if m.diag_imported_at]

    c1_msmes = [m for m in diag_msmes if m.cohort and 'cohort 1' in m.cohort.name.lower()]
    c2_msmes = [m for m in diag_msmes if m.cohort and 'cohort 2' in m.cohort.name.lower()]

    wb = openpyxl.Workbook()
    # Remove default sheet
    wb.remove(wb.active)

    # Styles
    navy_fill = PatternFill(start_color="162A3A", end_color="162A3A", fill_type="solid")
    green_fill = PatternFill(start_color="27AE60", end_color="27AE60", fill_type="solid")
    alt_fill = PatternFill(start_color="F4F6F9", end_color="F4F6F9", fill_type="solid")
    white_bold = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    title_font = Font(name="Arial", size=14, bold=True, color="162A3A")
    subtitle_font = Font(name="Arial", size=10, italic=True, color="555555")
    bold_font = Font(name="Arial", size=10, bold=True, color="162A3A")
    regular_font = Font(name="Arial", size=9)
    center_align = Alignment(horizontal="center", vertical="center")
    left_align = Alignment(horizontal="left", vertical="center")
    thin_border = Border(
        left=Side(style='thin', color='E0E0E0'),
        right=Side(style='thin', color='E0E0E0'),
        top=Side(style='thin', color='E0E0E0'),
        bottom=Side(style='thin', color='E0E0E0')
    )

    # ═════════════════════════════════════════════════════════════════════════
    # Sheet 1: Executive Summary & Cohort Comparison
    # ═════════════════════════════════════════════════════════════════════════
    ws1 = wb.create_sheet(title='Executive Summary')
    ws1.column_dimensions['A'].width = 38
    ws1.column_dimensions['B'].width = 24
    ws1.column_dimensions['C'].width = 20
    ws1.column_dimensions['D'].width = 20

    ws1.cell(row=2, column=1, value='PRUDEV II MSME DIAGNOSTIC BASELINE & COMPARATIVE REPORT').font = title_font
    ws1.cell(row=3, column=1, value='Comprehensive Diagnostic Analysis across Cohort 1 & Cohort 2').font = subtitle_font

    headers_s1 = ['Key Performance Indicator', 'All Diagnostic MSMEs', 'Cohort 1', 'Cohort 2']
    for col_idx, h in enumerate(headers_s1, 1):
        cell = ws1.cell(row=5, column=col_idx, value=h)
        cell.fill = green_fill if col_idx == 2 else navy_fill
        cell.font = white_bold
        cell.alignment = center_align if col_idx > 1 else left_align

    def compute_stats(msme_sub):
        cnt = len(msme_sub)
        if cnt == 0:
            return {'cnt': 0, 'ft_m': 0, 'ft_f': 0, 'ft_y': 0, 'pt': 0, 'tot_jobs': 0, 'f_pct': 0, 'tin_pct': 0, 'unbs_pct': 0, 'bank_pct': 0, 'green_pct': 0, 'avg_score': 0}
        ft_m = sum(m.diag_employees_ft_male or 0 for m in msme_sub)
        ft_f = sum(m.diag_employees_ft_female or 0 for m in msme_sub)
        ft_y = sum(m.diag_employees_ft_youth or 0 for m in msme_sub)
        pt = sum(m.diag_employees_pt_total or 0 for m in msme_sub)
        tot_jobs = ft_m + ft_f + pt
        f_pct = round((ft_f / (ft_m + ft_f) * 100), 1) if (ft_m + ft_f) > 0 else 0
        tin_pct = round((len([m for m in msme_sub if m.diag_has_tin]) / cnt * 100), 1)
        unbs_pct = round((len([m for m in msme_sub if m.diag_has_unbs]) / cnt * 100), 1)
        bank_pct = round((len([m for m in msme_sub if m.diag_has_business_bank]) / cnt * 100), 1)
        green_pct = round((len([m for m in msme_sub if m.diag_is_green_business]) / cnt * 100), 1)
        scores = [m.diag_digitalization_score for m in msme_sub if m.diag_digitalization_score]
        avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0
        return {'cnt': cnt, 'ft_m': ft_m, 'ft_f': ft_f, 'ft_y': ft_y, 'pt': pt, 'tot_jobs': tot_jobs, 'f_pct': f_pct, 'tin_pct': tin_pct, 'unbs_pct': unbs_pct, 'bank_pct': bank_pct, 'green_pct': green_pct, 'avg_score': avg_score}

    st_all = compute_stats(diag_msmes)
    st_c1 = compute_stats(c1_msmes)
    st_c2 = compute_stats(c2_msmes)

    kpis = [
        ('Total Enterprises Assessed', f"{st_all['cnt']}", f"{st_c1['cnt']}", f"{st_c2['cnt']}"),
        ('Total Baseline Jobs', f"{st_all['tot_jobs']:,}", f"{st_c1['tot_jobs']:,}", f"{st_c2['tot_jobs']:,}"),
        ('Full-time Male Employees', f"{st_all['ft_m']:,}", f"{st_c1['ft_m']:,}", f"{st_c2['ft_m']:,}"),
        ('Full-time Female Employees', f"{st_all['ft_f']:,}", f"{st_c1['ft_f']:,}", f"{st_c2['ft_f']:,}"),
        ('Female Workforce Share (%)', f"{st_all['f_pct']}%", f"{st_c1['f_pct']}%", f"{st_c2['f_pct']}%"),
        ('Full-time Youth Employees', f"{st_all['ft_y']:,}", f"{st_c1['ft_y']:,}", f"{st_c2['ft_y']:,}"),
        ('Part-time / Casual Employees', f"{st_all['pt']:,}", f"{st_c1['pt']:,}", f"{st_c2['pt']:,}"),
        ('URA TIN Registered (%)', f"{st_all['tin_pct']}%", f"{st_c1['tin_pct']}%", f"{st_c2['tin_pct']}%"),
        ('UNBS Certified / Standards (%)', f"{st_all['unbs_pct']}%", f"{st_c1['unbs_pct']}%", f"{st_c2['unbs_pct']}%"),
        ('Dedicated Business Bank Account (%)', f"{st_all['bank_pct']}%", f"{st_c1['bank_pct']}%", f"{st_c2['bank_pct']}%"),
        ('Green Business Classification (%)', f"{st_all['green_pct']}%", f"{st_c1['green_pct']}%", f"{st_c2['green_pct']}%"),
        ('Average Digitalization Score (1 to 5)', f"{st_all['avg_score']:.2f}", f"{st_c1['avg_score']:.2f}", f"{st_c2['avg_score']:.2f}"),
    ]

    for idx, (label, v_all, v_c1, v_c2) in enumerate(kpis, 6):
        c1 = ws1.cell(row=idx, column=1, value=label)
        c2 = ws1.cell(row=idx, column=2, value=v_all)
        c3 = ws1.cell(row=idx, column=3, value=v_c1)
        c4 = ws1.cell(row=idx, column=4, value=v_c2)
        c1.font = bold_font
        c1.border = thin_border
        for c in [c2, c3, c4]:
            c.font = bold_font
            c.alignment = center_align
            c.border = thin_border

    # ═════════════════════════════════════════════════════════════════════════
    # Sheet 2: Baseline vs Progress Tracking
    # ═════════════════════════════════════════════════════════════════════════
    ws2 = wb.create_sheet(title='Baseline vs Progress')
    prog_headers = [
        'MSME Code', 'Business Name', 'Cohort', 'District', 'Sector',
        'Baseline FT Jobs', 'Baseline PT Jobs', 'Latest FT Jobs', 'Latest PT Jobs',
        'Net Job Change', 'Has TIN', 'Growth Notes'
    ]
    for col_idx, h in enumerate(prog_headers, 1):
        cell = ws2.cell(row=1, column=col_idx, value=h)
        cell.fill = navy_fill
        cell.font = white_bold
        cell.alignment = center_align if col_idx not in [2, 12] else left_align

    for r_idx, m in enumerate(diag_msmes, 2):
        b_snap = m.growth_snapshots.filter(source='diagnostic').first()
        l_snap = m.growth_snapshots.order_by('-snapshot_date', '-id').first()

        b_ft = ((b_snap.employees_ft_male or 0) + (b_snap.employees_ft_female or 0)) if b_snap else ((m.diag_employees_ft_male or 0) + (m.diag_employees_ft_female or 0))
        b_pt = b_snap.employees_pt_male or 0 if b_snap else (m.diag_employees_pt_total or 0)

        l_ft = ((l_snap.employees_ft_male or 0) + (l_snap.employees_ft_female or 0)) if l_snap else b_ft
        l_pt = ((l_snap.employees_pt_male or 0) + (l_snap.employees_pt_female or 0)) if l_snap else b_pt

        job_delta = (l_ft + l_pt) - (b_ft + b_pt)
        row_fill = alt_fill if r_idx % 2 == 0 else None

        values = [
            m.msme_code or '',
            m.business_name or '',
            m.cohort.name if m.cohort else '',
            m.district or '',
            m.sector or '',
            b_ft,
            b_pt,
            l_ft,
            l_pt,
            f"+{job_delta}" if job_delta > 0 else str(job_delta),
            'Yes' if m.diag_has_tin else 'No',
            l_snap.notes if l_snap else '',
        ]

        for col_idx, val in enumerate(values, 1):
            cell = ws2.cell(row=r_idx, column=col_idx, value=val)
            cell.font = regular_font
            cell.border = thin_border
            if row_fill:
                cell.fill = row_fill
            if col_idx in [1, 6, 7, 8, 9, 10, 11]:
                cell.alignment = center_align

    # ═════════════════════════════════════════════════════════════════════════
    # Sheet 3: Diagnostic Master Table
    # ═════════════════════════════════════════════════════════════════════════
    ws3 = wb.create_sheet(title='Diagnostic Master Data')
    master_hdrs = [
        'MSME Code', 'Business Name', 'Cohort', 'District', 'Sector', 'Owner Name', 'Owner Sex', 'Owner Age',
        'Years Operating', 'Monthly Turnover Band', 'FT Male', 'FT Female', 'FT Youth', 'PT Total',
        'Has TIN', 'Has UNBS', 'Has Bank Account', 'Digital Score (1-5)', 'Is Green', 'Green Categories', 'Capacity Needs'
    ]
    for col_idx, h in enumerate(master_hdrs, 1):
        cell = ws3.cell(row=1, column=col_idx, value=h)
        cell.fill = navy_fill
        cell.font = white_bold
        cell.alignment = center_align if col_idx not in [2, 6, 20, 21] else left_align

    for r_idx, m in enumerate(diag_msmes, 2):
        row_fill = alt_fill if r_idx % 2 == 0 else None
        values = [
            m.msme_code or '',
            m.business_name or '',
            m.cohort.name if m.cohort else '',
            m.district or '',
            m.sector or '',
            m.owner_name or '',
            m.diag_owner_sex or '',
            m.diag_owner_age or '',
            m.diag_years_operating or '',
            m.diag_annual_turnover or '',
            m.diag_employees_ft_male or 0,
            m.diag_employees_ft_female or 0,
            m.diag_employees_ft_youth or 0,
            m.diag_employees_pt_total or 0,
            'Yes' if m.diag_has_tin else 'No',
            'Yes' if m.diag_has_unbs else 'No',
            'Yes' if m.diag_has_business_bank else 'No',
            m.diag_digitalization_score or '',
            'Yes' if m.diag_is_green_business else 'No',
            '; '.join(m.diag_green_categories or []),
            '; '.join(m.diag_capacity_needs or []),
        ]

        for col_idx, val in enumerate(values, 1):
            cell = ws3.cell(row=r_idx, column=col_idx, value=val)
            cell.font = regular_font
            cell.border = thin_border
            if row_fill:
                cell.fill = row_fill
            if col_idx in [1, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19]:
                cell.alignment = center_align

    # Auto-adjust column widths for all sheets
    for ws in [ws1, ws2, ws3]:
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()

