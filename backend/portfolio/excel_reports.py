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
