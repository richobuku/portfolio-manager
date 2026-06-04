import React, { useState, useEffect, useCallback, startTransition } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip, LinearProgress,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem, Alert,
  Snackbar, CircularProgress, Avatar, Divider, TablePagination,
  Tooltip, Checkbox, Card, CardContent, Grid, Drawer, List,
  ListItemButton, ListItemIcon, ListItemText, AppBar, Toolbar,
  Badge, Accordion, AccordionSummary, AccordionDetails,
  Tab, Tabs, ListSubheader,
} from '@mui/material';
import {
  Business, People, School, Assessment, ChevronRight,
  Add, Upload, Visibility, Edit, Delete, Search, CheckCircle,
  TrendingUp, LocationOn, EventNote, Group,
  AccountTree, Menu as MenuIcon, Logout, ManageAccounts,
  LockReset, PersonAdd, LinkOff, Email, PictureAsPdf,
  Assignment, DragHandle, ExpandMore,
  Lock, LockOpen, Star, StarBorder, Download, Undo,
  Campaign, Send as SendIcon, Checkroom, DrawOutlined,
  RotateLeft, RotateRight, Dashboard as DashboardIcon,
  ArrowForward, TaskAlt,
} from '@mui/icons-material';
import axios from 'axios';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { API_ENDPOINTS, EXPERT_SEND_EMAIL_URL, EXPERT_PREVIEW_EMAIL_URL, EXPERT_ROTATE_SIGNATURE_URL, EXPERT_CLEAN_SIGNATURE_URL, WORK_ORDER_ISSUE_URL, WORK_ORDER_PDF_URL, WORK_ORDER_WITHDRAW_URL, MSME_SET_GROUPS_URL, BULK_EMAIL, BULK_EMAIL_LOG, BULK_SMS, BULK_SMS_BALANCE, TRAINING_REPORT_PDF_URL, MENTOR_REPORT_PDF_URL, REPORT_REVERT_URL, GROUP_REPORT_REVERT_URL, TSHIRT_RECEIPT_PDF_URL, TSHIRT_RECEIPT_BULK_SIGN } from '../config';
import { BRAND } from '../theme';

const ROWS_PER_PAGE = 15;
const DRAWER_WIDTH = 220;

const NAV_ITEMS = [
  { key: 'overview',    label: 'Overview',        icon: <DashboardIcon /> },
  { key: 'msmes',       label: 'MSMEs',          icon: <Business /> },
  { key: 'experts',     label: 'BGE Experts',    icon: <People /> },
  { key: 'assignments', label: 'Assignments',    icon: <Assignment /> },
  { key: 'users',       label: 'User Accounts',  icon: <ManageAccounts /> },
  { key: 'bgegroups',   label: 'BGE Groups',     icon: <Group /> },
  { key: 'cohorts',     label: 'Cohorts',        icon: <AccountTree /> },
  { key: 'training',       label: 'Training',       icon: <School /> },
  { key: 'participation',  label: 'Participation',  icon: <TrendingUp /> },
  { key: 'reports',        label: 'Reports',        icon: <PictureAsPdf /> },
  { key: 'workorders',     label: 'Work Orders',    icon: <Assignment /> },
  { key: 'analytics',      label: 'Analytics',      icon: <Assessment /> },
  { key: 'communications', label: 'Communications', icon: <Campaign /> },
  { key: 'tshirts',        label: 'T-Shirt Receipts', icon: <Checkroom /> },
];

// Each row is its own memoised component. With React.memo, a row only
// re-renders when its specific props change (its msme, its checked state, or
// the onToggle callback). So when the user types into the search box and only
// `searchText` changes (not `filtered`, not `selectedSet`), zero rows re-render.
const AssignMsmeRow = React.memo(function AssignMsmeRow({
  msme, checked, otherGroup, otherGroupName, groupId, onToggle,
}) {
  return (
    <ListItemButton onClick={() => onToggle(msme.id)} dense>
      <ListItemIcon>
        <Checkbox checked={checked} size="small" disableRipple tabIndex={-1} />
      </ListItemIcon>
      <ListItemText
        primary={msme.business_name}
        secondary={`${msme.owner_name || '—'} · ${msme.city || msme.state || '—'}${otherGroup ? ` · already in ${otherGroupName || ''}` : ''}`}
      />
      {msme.assigned_group_name && (
        <Chip label={msme.assigned_group_name} size="small"
              color={msme.assigned_group === groupId ? 'success' : 'default'} />
      )}
    </ListItemButton>
  );
});

// Wrap the entire row list in its own memo'd component so the parent dialog's
// keystroke-driven re-renders don't re-create the row array unless its inputs
// (filtered, selectedSet, groupId, onToggle) actually changed.
const AssignMsmeRows = React.memo(function AssignMsmeRows({
  filtered, selectedSet, groupId, onToggle,
}) {
  return (
    <>
      {filtered.map(m => (
        <AssignMsmeRow
          key={m.id}
          msme={m}
          checked={selectedSet.has(m.id)}
          otherGroup={!!(m.assigned_group && m.assigned_group !== groupId)}
          otherGroupName={m.assigned_group_name}
          groupId={groupId}
          onToggle={onToggle}
        />
      ))}
    </>
  );
});

// ── AssignMsmesDialog ─────────────────────────────────────────────────────
// Extracted as a memoised component because rendering 200+ MSMEs inside the
// Dashboard's main render cycle made the search input lock up (browser fired
// "Page Unresponsive" after ~5s of blocked main thread). Optimisations:
//
//  1. Debounce the search box (200ms) so the filter only re-runs when the
//     user pauses typing, instead of on every keystroke.
//  2. Wrap the filter result in useMemo keyed on [msmes, debouncedSearch,
//     groupId] — keystrokes that don't change the debounced value don't
//     re-filter at all.
//  3. Convert assignedGroupMsmeIds (Array.includes is O(N) per row) into a
//     Set (O(1) per row) — turns the row-render from O(N²) into O(N).
//  4. Stable onClick handlers via useCallback so React skips re-rendering
//     unchanged rows.
const AssignMsmesDialog = React.memo(function AssignMsmesDialog({
  assignMsmeGroup, setAssignMsmeGroup, msmes, headers, notify, fetchAll,
}) {
  // All mutable state for this dialog lives here — so checkbox toggles only
  // re-render this component, not the entire 4500-line Dashboard tree.
  const [assignedGroupMsmeIds, setAssignedGroupMsmeIds] = React.useState([]);
  const [groupMsmeSession, setGroupMsmeSession] = React.useState('');
  const [groupMsmeSaving, setGroupMsmeSaving] = React.useState(false);

  // Search state lives INSIDE the dialog. This is critical — when it lived on
  // the parent Dashboard component (a ~4500-line tree), every keystroke
  // re-rendered the whole tree which blocked the main thread for ~230ms. Now
  // keystrokes only re-render this dialog.
  const [searchText, setSearchText] = React.useState('');

  // Reset state when a different group's dialog opens, and load current assignments.
  React.useEffect(() => {
    if (!assignMsmeGroup) return;
    setSearchText('');
    setGroupMsmeSession('');
    setAssignedGroupMsmeIds([]);
    axios.get(`${API_ENDPOINTS.BGE_GROUPS}${assignMsmeGroup.id}/msmes/`, { headers })
      .then(r => {
        const ids = (Array.isArray(r.data) ? r.data : (r.data.results || [])).map(m => m.id);
        setAssignedGroupMsmeIds(ids);
      })
      .catch(() => setAssignedGroupMsmeIds([]));
  }, [assignMsmeGroup?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced copy — the filter reads this.
  // Wrapped in startTransition so React treats the 280-row reconciliation as
  // a low-priority update; the browser paints the typed character first and
  // the list refilter happens without blocking the input (fixes INP ~392ms).
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const h = setTimeout(() => React.startTransition(() => setDebouncedSearch(searchText)), 150);
    return () => clearTimeout(h);
  }, [searchText]);

  // Defer mounting the (potentially huge) MSME list until *after* the dialog's
  // open animation finishes.
  const [listReady, setListReady] = React.useState(false);
  React.useEffect(() => {
    if (!assignMsmeGroup) { setListReady(false); return; }
    const h = setTimeout(() => setListReady(true), 32);
    return () => clearTimeout(h);
  }, [assignMsmeGroup]);

  const groupId = assignMsmeGroup?.id;

  // useDeferredValue lets React render with the stale list first so the input
  // stays responsive, then re-renders with the updated filter in the background.
  const deferredSearch = React.useDeferredValue(debouncedSearch);

  const filtered = React.useMemo(() => {
    if (!deferredSearch) return msmes;
    const q = deferredSearch.toLowerCase();
    return msmes.filter(m =>
      (m.business_name || '').toLowerCase().includes(q) ||
      (m.owner_name    || '').toLowerCase().includes(q) ||
      (m.city          || '').toLowerCase().includes(q) ||
      (m.state         || '').toLowerCase().includes(q)
    );
  }, [msmes, deferredSearch]);

  // O(1) membership check inside the row map.
  const selectedSet = React.useMemo(
    () => new Set(assignedGroupMsmeIds),
    [assignedGroupMsmeIds]
  );

  const toggleGroupMsme = React.useCallback((msmeId) => {
    setAssignedGroupMsmeIds(prev =>
      prev.includes(msmeId) ? prev.filter(id => id !== msmeId) : [...prev, msmeId]
    );
  }, []);

  const saveGroupMsmeAssignments = React.useCallback(async () => {
    if (!assignMsmeGroup) return;
    setGroupMsmeSaving(true);
    try {
      await axios.post(`${API_ENDPOINTS.BGE_GROUPS}${assignMsmeGroup.id}/unassign-msmes/`, {}, { headers });
      if (assignedGroupMsmeIds.length > 0) {
        const payload = { msme_ids: assignedGroupMsmeIds };
        if (groupMsmeSession) payload.session_number = parseInt(groupMsmeSession, 10);
        await axios.post(`${API_ENDPOINTS.BGE_GROUPS}${assignMsmeGroup.id}/assign-msmes/`, payload, { headers });
      }
      notify(`${assignedGroupMsmeIds.length} MSME${assignedGroupMsmeIds.length === 1 ? '' : 's'} assigned to ${assignMsmeGroup.name}`);
      setAssignMsmeGroup(null);
      fetchAll();
    } catch (e) {
      notify(e.response?.data?.error || 'Failed to assign MSMEs', 'error');
    } finally {
      setGroupMsmeSaving(false);
    }
  }, [assignMsmeGroup, assignedGroupMsmeIds, groupMsmeSession, headers, notify, fetchAll, setAssignMsmeGroup]);

  const onToggle = React.useCallback((id) => toggleGroupMsme(id), [toggleGroupMsme]);
  const onClose  = React.useCallback(() => setAssignMsmeGroup(null), [setAssignMsmeGroup]);
  const onClear  = React.useCallback(() => setAssignedGroupMsmeIds([]), []);

  return (
    <Dialog open={!!assignMsmeGroup} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Assign MSMEs — {assignMsmeGroup?.name}
        <Typography variant="caption" display="block" color="text.secondary">
          Select MSMEs to assign to this BGE group. Every group member will see them in their dashboard.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {assignMsmeGroup?.objectives && (
          <Alert severity="info" sx={{ mb: 2 }} icon={<Assignment fontSize="small" />}>
            <Typography variant="caption" fontWeight={600} display="block">Group objectives (inherited by each MSME):</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{assignMsmeGroup.objectives}</Typography>
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small" placeholder="Search MSMEs..." value={searchText}
            onChange={e => setSearchText(e.target.value)}
            InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <TextField
            size="small" label="Session # (optional)" type="number"
            value={groupMsmeSession} onChange={e => setGroupMsmeSession(e.target.value)}
            sx={{ width: 160 }} inputProps={{ min: 1, max: 10 }}
          />
          <Chip label={`${assignedGroupMsmeIds.length} selected`} color="primary" />
          <Chip
            label={deferredSearch ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : `${msmes.length} MSMEs`}
            size="small" variant="outlined"
          />
          <Button size="small" onClick={onClear} disabled={assignedGroupMsmeIds.length === 0}>
            Clear all
          </Button>
        </Box>
        <Box sx={{ maxHeight: 480, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {!listReady ? (
            <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <List dense>
              <AssignMsmeRows
                filtered={filtered}
                selectedSet={selectedSet}
                groupId={groupId}
                onToggle={onToggle}
              />
              {msmes.length === 0 && (
                <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>No MSMEs available</Box>
              )}
              {msmes.length > 0 && filtered.length === 0 && (
                <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                  No MSMEs match “{deferredSearch}”
                </Box>
              )}
            </List>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={saveGroupMsmeAssignments} disabled={groupMsmeSaving}>
          {groupMsmeSaving ? 'Saving…' : 'Save Assignments'}
        </Button>

      </DialogActions>
    </Dialog>
  );
});

// ── Work Order Dialog (memoised to prevent full-Dashboard re-renders on keystrokes) ──
const WO_DEFAULTS = {
  msme_support: {
    objective: `To mobilise assigned MSMEs (up to 65 per peer-to-peer group) for peer-to-peer learning sessions, onboard them onto a suitable CRM platform based on their individual interest and business needs (such as Message Carrier, Brevo, or an equivalent tool), ensure their customer information is accurate and up to date, unlock sales opportunities, and provide structured 1-on-1 business development support.`,
    key_tasks: `1. Mobilise assigned MSMEs by reaching out, explaining session objectives, and confirming participation dates and location.
2. Document any MSME that is unavailable or declines in the non-engagement register and notify the Senior BGE promptly.
3. Assess each MSME's interest, digital capacity, and business needs to recommend the most appropriate CRM platform.
4. Ensure all CRM account login credentials are handed directly to the MSME owner and not stored by the BGE.
5. Assist each MSME in configuring their chosen CRM system by helping them input, structure, and verify their customer contact list.
6. Work with each MSME to identify and unlock sales opportunities using their updated customer data.
7. Conduct a structured 1-on-1 session with each assigned MSME using the standardised PRUDEV II session template.
8. Attend and actively participate in the peer-to-peer learning sessions, supporting facilitation and ensuring MSMEs are engaged.
9. Maintain personal accountability for the accuracy and timely submission of all attendance sheets and field reports.
10. Document all field activities, session notes, and MSME progress in the required PRUDEV II formats.
11. Maintain confidentiality of all MSME data and business information at all times.`,
    deliverables_json: [
      { task_num: 1, description: 'MSME mobilisation list – names and contacts of all MSMEs confirmed for the peer-to-peer session', due_date: 'End of Week 1' },
      { task_num: 2, description: 'MSME non-engagement register – documented record of any MSME that was unavailable or declined', due_date: 'Rolling – within 2 days of each contact attempt' },
      { task_num: 3, description: 'Signed MSME registration forms for the selected CRM platform', due_date: 'Rolling – per MSME onboarded' },
      { task_num: 4, description: 'CRM set-up confirmation report – evidence that each MSME has an active account and customer list uploaded', due_date: 'End of Week 2' },
      { task_num: 5, description: 'Updated customer list per MSME – cleaned, verified, and entered into the CRM system', due_date: 'End of Week 2' },
      { task_num: 6, description: '1-on-1 session notes for each MSME (using standardised PRUDEV II template)', due_date: 'Within 2 days of each session' },
      { task_num: 7, description: 'Signed peer-to-peer session attendance sheets submitted to the Senior BGE', due_date: 'Per session, day of event' },
      { task_num: 8, description: 'Monthly field activity report covering CRM adoption, sessions conducted, and key MSME challenges', due_date: 'Last working day of each month' },
      { task_num: 9, description: 'Approved invoice and signed timesheet', due_date: 'With monthly report submission' },
    ],
  },
  msme_data_update: {
    objective: `To support the updating and validation of MSME records within the BDS system through field visits, ensuring that business profiles, operational data, and compliance information are accurate, complete, and up to date.`,
    key_tasks: `1. Participate in orientation and training to fully understand the BDS system, data collection process, and reporting expectations.
2. Receive field materials including branded T-shirts and assignment guidelines.
3. Visit assigned MSMEs (approximately 10 per BGE) to conduct detailed data verification and updates.
4. Review and update MSME business profiles including ownership, location, products/services, staffing, and operational status.
5. Verify and update business registration and compliance information where applicable.
6. Capture updated contact details, customer channels, and digital presence information.
7. Update financial, production, and market-related information in the BDS system.
8. Identify missing or inconsistent records and validate information directly with MSME owners/managers.
9. Upload and synchronize all verified updates into the BDS system accurately and in a timely manner.
10. Submit feedback on challenges, observations, and recommendations arising from the field verification process.`,
    deliverables_json: [
      { task_num: 1, description: 'Orientation on the BDS System and Assignment Expectations Completed',                 due_date: 'Day 1' },
      { task_num: 2, description: 'Distribution of Field Materials and Branded T-Shirts',                               due_date: 'Day 1' },
      { task_num: 3, description: 'Assigned MSME Visit Plan',                                                            due_date: 'Day 1' },
      { task_num: 4, description: 'MSME Field Visits and Data Collection Conducted',                                    due_date: 'Day 2 – Day 5' },
      { task_num: 5, description: 'Verified and Updated MSME Records in the BDS System',                                due_date: 'Day 2 – Day 5' },
      { task_num: 6, description: 'Summary Report on Key Findings, Gaps, and Recommendations',                          due_date: 'Final Day' },
      { task_num: 7, description: 'Submission of Supporting Documentation and Completed Updates',                       due_date: 'Final Day' },
    ],
  },
  msme_finance_survey: {
    objective: `To support the collection and updating of MSME financial and business data through structured field visits using the Google Forms data collection tool, ensuring accurate and complete records within the BDS system.`,
    key_tasks: `1. Participate in orientation and training on the finance questionnaire, Google Forms tool, and field data collection procedures.
2. Receive assignment guidelines, field materials, and branded T-shirts.
3. Conduct field visits to at least 25 assigned MSMEs over a 15-day period.
4. Administer the finance questionnaire using the Google Forms platform.
5. Verify and update key MSME data: business ownership and contact details, sales and revenue, employment and staffing, production and operational capacity, market access and customer information, and business registration / compliance status.
6. Validate existing BDS records and correct any missing or inaccurate information.
7. Upload and synchronize collected data accurately and on time.
8. Provide daily progress updates and field feedback to the coordination team.
9. Identify MSMEs requiring additional business development or financial support services.`,
    deliverables_json: [
      { task_num: 1, description: 'Orientation on Finance Questionnaire and Google Forms Tool Completed',  due_date: 'Monday, 18 May 2026' },
      { task_num: 2, description: 'Distribution of Field Materials and Branded T-Shirts',                  due_date: 'Monday, 18 May 2026' },
      { task_num: 3, description: 'MSME Field Visit Schedule and Assignment Plan',                         due_date: 'Monday, 18 May 2026' },
      { task_num: 4, description: 'Completion of Field Visits to at Least 25 MSMEs',                       due_date: '19 May – 31 May 2026' },
      { task_num: 5, description: 'Completed Finance Questionnaires Submitted through Google Forms',       due_date: '19 May – 31 May 2026' },
      { task_num: 6, description: 'Updated MSME Records in the BDS System',                                due_date: 'Throughout Assignment Period' },
      { task_num: 7, description: 'Daily Progress Updates Submitted',                                      due_date: 'Daily' },
      { task_num: 8, description: 'Final Summary Report with Key Findings and Recommendations',            due_date: 'Monday, 1 June 2026' },
      { task_num: 9, description: 'Submission of All Verified and Updated MSME Data',                      due_date: 'Monday, 1 June 2026' },
    ],
  },
  msme_access_finance: {
    objective: `To increase access to finance by digitizing the MSMEs and making them bankable through the credit and digital payment ecosystem. Each BGE will work with 15 assigned MSMEs from Cohort 1 and Cohort 2 over 7 working days, onboarding businesses onto digital financial platforms and mapping their interest in credit products for follow-up engagement.`,
    key_tasks: `1. Attend orientation on the Access to Finance assignment, digital financial tools, and reporting expectations.
2. Receive the list of 15 assigned MSMEs from Cohort 1 and Cohort 2 and develop a field visit plan.
3. Visit each assigned MSME and onboard them onto at least two (2) of the following digital financial platforms:
   • MOMO Pays
   • Flexy Pay
   • Wendi
   • Online Banking
   • Online Payments
   • Business Accounts
4. Document the specific platforms each MSME has been onboarded onto and capture evidence of registration (screenshots, confirmation messages, or account details).
5. Conduct a credit needs assessment with each MSME — identify which credit product the MSME is interested in and from which financial institution.
6. Compile a Credit Interest Mapping Report summarising MSME interest by product type, financial institution, and readiness level, to guide further engagement and follow-up.
7. Document all field activities and MSME progress in the required PRUDEV II formats.
8. Submit daily progress updates to the BDS Component Coordinator.
9. Flag any MSMEs with barriers to digital onboarding (no smartphone, no ID, etc.) and document in the barrier register.
10. Maintain confidentiality of all MSME data and financial information at all times.
11. Submit completed invoice and signed timesheet with the final report.`,
    deliverables_json: [
      { task_num: 1, description: 'Orientation on Access to Finance Assignment and Digital Financial Tools Completed', due_date: '3 June 2026' },
      { task_num: 2, description: 'MSME Visit Plan — assignment list of 15 MSMEs from Cohort 1 & Cohort 2 with field schedule', due_date: '3 June 2026' },
      { task_num: 3, description: 'MSME Digital Platform Onboarding Records — minimum 2 platforms per MSME with registration evidence', due_date: 'Rolling — throughout assignment' },
      { task_num: 4, description: 'Digital Platform Registration Evidence per MSME (screenshots / confirmations)', due_date: 'Rolling — per MSME onboarded' },
      { task_num: 5, description: 'Credit Interest Mapping Report — by MSME, product type, and financial institution with readiness assessment', due_date: '15 June 2026' },
      { task_num: 6, description: 'Barrier Register — MSMEs with obstacles to digital onboarding and recommended follow-up', due_date: '15 June 2026' },
      { task_num: 7, description: 'Final Access to Finance Field Report — summary of onboarding outcomes, credit interest, observations, and recommendations', due_date: '16 June 2026' },
      { task_num: 8, description: 'Approved Invoice and Signed Timesheet', due_date: '16 June 2026' },
    ],
  },
  biz_continuity: {
    objective: `To develop a business continuity strategy and business operational plan for 05 agro-processors attached to you. These two documents are meant to help agro-processors to protect their businesses from disruptions.`,
    key_tasks: `The BGE will visit the assigned agro-processors to specifically carry out the following:

• Conduct a Business Impact Analysis (BIA): Identify time-sensitive operations, estimate the financial and operational impacts of disruptions, and determine their Maximum Tolerable Downtime (MTD) for critical processes.

• Perform a Risk Assessment: Identify potential threats (e.g., inflation, raw material seasonality, cyberattacks, supply chain failures, natural disasters) and evaluate the probability and impact of each to prioritize mitigation efforts.

• Develop Recovery Strategies: Outline specific, actionable steps to resume critical functions for the business.

• Document the Plan: Create a clear, easily accessible written document detailing response procedures, team member roles and contact lists, communication protocols, among others.

• Train and Test: Educate employees on their specific responsibilities during a crisis as per the strategy. Conduct a simulation exercise (tabletop or full-scale) to identify weaknesses and refine the strategy.`,
    deliverables_json: [
      { task_num: 1, description: 'Business Continuity Strategy and Business Operational Plan', due_date: '1 week after deployment' },
      { task_num: 2, description: 'Non-engagement register — documented record of any MSME that was unavailable or declined to participate, including reason and date of contact attempt', due_date: 'Rolling — updated within 2 days of each attempted contact' },
      { task_num: 3, description: 'Close-out report', due_date: 'Within 2 days after submission of Business Continuity Strategy and Business Operational Plan' },
      { task_num: 4, description: 'Approved invoice and signed timesheet', due_date: 'Within 2 days after submission of Business Continuity Strategy and Business Operational Plan' },
    ],
  },
  mobilisation: {
    objective: `To mobilise and confirm participation of selected applicants for the scheduled programme. The BGE will conduct structured telephone outreach to confirm interest, clarify programme expectations, verify qualifications and readiness, gather required information, and address any concerns or logistical barriers.`,
    key_tasks: `1. Telephone outreach to confirm applicant participation using the list provided by the BDS Component Coordinator.
2. Clarify programme expectations – this is NOT a job offer; it is training to build their own business.
3. Gather applicant information: full name, contact number, district, qualifications, smartphone access, and logistics concerns.
4. Identify and flag barriers to participation (transport, accommodation, timing) and document in the barrier report.
5. Provide follow-up SMS reminders to confirmed participants with dates, venue details, and what to bring.
6. Track confirmed vs. declined applicants and provide updates to the BDS Component Coordinator.`,
    deliverables_json: [
      { task_num: 1, description: 'Daily Call Log – record of each call made, time, outcome, and notes', due_date: 'Daily' },
      { task_num: 2, description: 'Applicant Information Sheet – confirmed participants, qualifications verified, logistics information', due_date: 'End of mobilisation period' },
      { task_num: 3, description: 'Barrier Report – summary of identified barriers and recommendations for support', due_date: 'End of mobilisation period' },
      { task_num: 4, description: 'Final Mobilisation Summary Report – confirmation rates, analysis of no-shows/declines, final participant count', due_date: 'Day after mobilisation closes' },
    ],
  },
  group_session: {
    objective: `To facilitate and document peer-to-peer learning sessions with assigned MSME groups. The BGE will ensure effective knowledge sharing, monitor MSME engagement and progress, and submit timely session reports.`,
    key_tasks: `1. Prepare session materials and agenda in line with PRUDEV II session templates.
2. Facilitate the peer-to-peer group session, ensuring all assigned MSMEs are engaged and participate actively.
3. Document attendance and participation using the official PRUDEV II attendance sheet.
4. Capture key discussions, challenges raised, and outcomes agreed during the session.
5. Support individual MSMEs with queries or follow-up actions arising from the session.
6. Submit session notes and attendance records within the required timelines.`,
    deliverables_json: [
      { task_num: 1, description: 'Signed attendance sheet – original submitted to Senior BGE on the day of the session', due_date: 'Day of session' },
      { task_num: 2, description: 'Session notes – key topics discussed, challenges raised, and agreed follow-up actions', due_date: 'Within 2 days of session' },
      { task_num: 3, description: 'Individual MSME follow-up log – specific action points agreed with each MSME', due_date: 'Within 2 days of session' },
    ],
  },
  training_facilitation: {
    objective: `To lead the design and facilitation of structured training for MSMEs and Business Growth Experts (BGEs) under the Prudev II programme. The Senior BGE will work alongside the BDS Expert to develop training content, deliver sessions, co-facilitate with the broader BGE team, monitor active participation, collect participant feedback, and share lessons learnt with the programme team.`,
    key_tasks: `1. Collaborate with the BDS Expert to design and develop training content, materials, and session plans in line with PRUDEV II programme standards.
2. Lead the delivery of assigned training modules for MSME cohorts and/or BGE capacity-building sessions.
3. Co-facilitate training sessions alongside the Lead Facilitator and guest trainers, ensuring structured and effective delivery.
4. Brief and prepare assigned BGEs before each session to ensure active, confident participation in facilitation.
5. Monitor BGE engagement during sessions and provide real-time coaching and support where needed.
6. Design and administer participant feedback forms at the end of each training session.
7. Consolidate and analyse participant feedback, identifying trends, strengths, and areas for improvement.
8. Conduct a structured post-training review with the delivery team within 3 days of each session.
9. Compile and share a detailed Training Report and Lessons Learnt document with the programme team after each training.
10. Maintain training records, attendance sheets, and all programme documentation in the required PRUDEV II formats.`,
    deliverables_json: [
      { task_num: 1, description: 'Training Content Package – session plans, facilitator guides, and participant materials approved by the BDS Expert', due_date: 'Before first training session' },
      { task_num: 2, description: 'Signed attendance sheets – collected and submitted for every session', due_date: 'Day of each session' },
      { task_num: 3, description: 'Participant Feedback Summary – consolidated analysis of feedback forms from each training', due_date: 'Within 3 days of each session' },
      { task_num: 4, description: 'Post-Training Review Notes – documented debrief with the facilitation team', due_date: 'Within 3 days of each session' },
      { task_num: 5, description: 'Detailed Training Report – covering objectives, activities, key findings, observations, and recommendations', due_date: 'Within 5 days of each session' },
      { task_num: 6, description: 'Lessons Learnt Report – structured document capturing insights for future training design and delivery', due_date: 'End of assignment' },
      { task_num: 7, description: 'Approved invoice and signed timesheet', due_date: 'Monthly, with report submission' },
    ],
  },
  other: { objective: '', key_tasks: '', deliverables_json: [] },
};

const WO_EMPTY = {
  bge: '',
  group: '',
  work_order_type: 'msme_support',
  project_name: 'Promoting Rural Development II (PRUDEV II)',
  issue_date: new Date().toISOString().slice(0, 10),
  start_date: '',
  end_date: '',
  location: 'Northern Uganda (Gulu & Lira)',
  duration: '2 months',
  ...WO_DEFAULTS.msme_support,
  rate_per_day: 60000,
  max_days: 4,
  transport_reimbursed: true,
  payment_notes: '',
  team_leader_name: 'Stephen Maxi Opwonya',
  team_leader_position: 'Team Leader',
};

const WorkOrderDialog = React.memo(function WorkOrderDialog({ open, onClose, woEditing, experts, headers, onSaved, fetchWorkOrders }) {
  const [woForm, setWoForm] = React.useState({});
  const [woErrors, setWoErrors] = React.useState('');
  const [woSaving, setWoSaving] = React.useState(false);
  const [woConflict, setWoConflict] = React.useState(null);

  // Reset conflict when dialog closes
  React.useEffect(() => { if (!open) setWoConflict(null); }, [open]);

  // Live overlap check whenever BGE or dates change
  React.useEffect(() => {
    const { bge, start_date, end_date } = woForm;
    if (!bge || !start_date || !end_date) { setWoConflict(null); return; }
    let cancelled = false;
    axios.get(API_ENDPOINTS.WORK_ORDERS, {
      headers,
      params: { bge },
    }).then(res => {
      if (cancelled) return;
      const orders = res.data?.results ?? res.data ?? [];
      const conflict = orders.find(wo => {
        if (!wo.start_date || !wo.end_date) return false;
        if (woEditing && wo.id === woEditing.id) return false;
        return wo.start_date <= end_date && wo.end_date >= start_date;
      });
      setWoConflict(conflict || null);
    }).catch(() => setWoConflict(null));
    return () => { cancelled = true; };
  }, [woForm.bge, woForm.start_date, woForm.end_date, woEditing, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) return;
    if (woEditing) {
      setWoForm({
        bge: woEditing.bge,
        group: woEditing.group || '',
        work_order_type: woEditing.work_order_type,
        project_name: woEditing.project_name,
        issue_date: woEditing.issue_date,
        start_date: woEditing.start_date || '',
        end_date: woEditing.end_date || '',
        location: woEditing.location,
        duration: woEditing.duration,
        objective: woEditing.objective,
        key_tasks: woEditing.key_tasks,
        deliverables_json: woEditing.deliverables_json || [],
        rate_per_day: woEditing.rate_per_day,
        max_days: woEditing.max_days,
        transport_reimbursed: woEditing.transport_reimbursed,
        payment_notes: woEditing.payment_notes || '',
        team_leader_name: woEditing.team_leader_name,
        team_leader_position: woEditing.team_leader_position,
      });
    } else {
      setWoForm({ ...WO_EMPTY });
    }
    setWoErrors('');
  }, [open, woEditing]);

  const applyWoDefaults = React.useCallback((type) => {
    const d = WO_DEFAULTS[type] || WO_DEFAULTS.other;
    const extra = {};
    if (type === 'msme_access_finance') {
      extra.start_date = '2026-06-03';
      extra.end_date   = '2026-06-16';
      extra.duration   = '7 working days';
      extra.max_days   = 7;
      extra.location   = 'Acholi Sub-region, Northern Uganda';
    }
    if (type === 'biz_continuity') {
      extra.duration   = 'Maximum of 4 days';
      extra.max_days   = 4;
      extra.location   = 'Northern Uganda (Gulu & Lira)';
      extra.project_name = 'PRUDEV II Project – Financial Institution Mobilisation (Access to Finance Events)';
    }
    setWoForm(f => ({ ...f, work_order_type: type, objective: d.objective, key_tasks: d.key_tasks, deliverables_json: d.deliverables_json, ...extra }));
  }, []);

  const saveWo = React.useCallback(async () => {
    if (!woForm.bge) { setWoErrors('BGE is required.'); return; }
    if (!woForm.issue_date) { setWoErrors('Issue date is required.'); return; }
    setWoSaving(true); setWoErrors('');
    try {
      const payload = { ...woForm, group: woForm.group || null };
      if (woEditing) {
        await axios.put(`${API_ENDPOINTS.WORK_ORDERS}${woEditing.id}/`, payload, { headers });
      } else {
        await axios.post(API_ENDPOINTS.WORK_ORDERS, payload, { headers });
      }
      const msg = woEditing ? 'Work order updated.' : 'Work order created.';
      fetchWorkOrders();
      onSaved(msg);
    } catch (err) {
      setWoErrors(err.response?.data?.detail || JSON.stringify(err.response?.data || {}) || 'Save failed.');
    } finally {
      setWoSaving(false);
    }
  }, [woForm, woEditing, headers, fetchWorkOrders, onSaved]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          width: { xs: 'calc(100vw - 16px)', md: '100%' },
          height: { xs: '96dvh', md: '90vh' },
          maxHeight: '96dvh',
          m: { xs: 1, md: 4 },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle fontWeight={700} sx={{ flexShrink: 0 }}>
        {woEditing ? 'Edit Work Order' : 'New Work Order'}
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          px: { xs: 2, sm: 3 },
        }}
      >
        {woErrors && <Alert severity="error" sx={{ mb: 2 }}>{woErrors}</Alert>}
        {woConflict && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Date overlap detected.</strong> This BGE is already assigned work order{' '}
            <strong>{woConflict.work_order_number}</strong> from{' '}
            <strong>{woConflict.start_date}</strong> to <strong>{woConflict.end_date}</strong>.
            BGEs cannot be double-assigned during overlapping periods.
          </Alert>
        )}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small" required>
              <InputLabel>BGE</InputLabel>
              <Select value={woForm.bge} label="BGE" onChange={e => setWoForm(f => ({ ...f, bge: e.target.value }))}>
                {woForm.work_order_type === 'training_facilitation' ? (
                  experts.filter(e => e.is_senior).length > 0
                    ? experts.filter(e => e.is_senior).map(e =>
                        <MenuItem key={e.id} value={e.id}>{e.name} ({e.bge_code})</MenuItem>)
                    : <MenuItem disabled value="">No Senior BGEs found</MenuItem>
                ) : (
                  experts.map(e => <MenuItem key={e.id} value={e.id}>{e.name} ({e.bge_code})</MenuItem>)
                )}
              </Select>
            </FormControl>
            {woForm.work_order_type === 'training_facilitation' && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Only Senior BGEs are listed for this work order type.
              </Typography>
            )}
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Work Order Type</InputLabel>
              <Select value={woForm.work_order_type} label="Work Order Type"
                onChange={e => applyWoDefaults(e.target.value)}>
                <MenuItem value="msme_support">MSME CRM &amp; Business Support</MenuItem>
                <MenuItem value="msme_data_update">MSME Data Update &amp; Verification</MenuItem>
                <MenuItem value="msme_finance_survey">MSME Finance Survey (Google Forms)</MenuItem>
                <MenuItem value="msme_access_finance">Access to Finance &amp; Digital Onboarding</MenuItem>
                <MenuItem value="biz_continuity">Business Continuity &amp; Operational Planning</MenuItem>
                <MenuItem value="mobilisation">Mobilisation / Outreach</MenuItem>
                <MenuItem value="group_session">Peer-to-Peer Group Session</MenuItem>
                <MenuItem value="training_facilitation">Training Facilitation — Senior BGE</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Issue Date" type="date" InputLabelProps={{ shrink: true }}
              value={woForm.issue_date} onChange={e => setWoForm(f => ({ ...f, issue_date: e.target.value }))} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Start Date" type="date" InputLabelProps={{ shrink: true }}
              value={woForm.start_date} onChange={e => setWoForm(f => ({ ...f, start_date: e.target.value }))} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="End Date" type="date" InputLabelProps={{ shrink: true }}
              value={woForm.end_date} onChange={e => setWoForm(f => ({ ...f, end_date: e.target.value }))} />
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField fullWidth size="small" label="Location"
              value={woForm.location} onChange={e => setWoForm(f => ({ ...f, location: e.target.value }))} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Duration"
              value={woForm.duration} onChange={e => setWoForm(f => ({ ...f, duration: e.target.value }))} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline minRows={3} size="small" label="Objective"
              value={woForm.objective} onChange={e => setWoForm(f => ({ ...f, objective: e.target.value }))} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline minRows={5} size="small" label="Key Tasks (one per line)"
              helperText="Each numbered task on its own line — pre-populated by type, fully editable."
              value={woForm.key_tasks} onChange={e => setWoForm(f => ({ ...f, key_tasks: e.target.value }))} />
          </Grid>

          {/* Deliverables table */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>Deliverables</Typography>
              <Button size="small" startIcon={<Add />} onClick={() => setWoForm(f => ({
                ...f,
                deliverables_json: [...f.deliverables_json, { task_num: f.deliverables_json.length + 1, description: '', due_date: '' }],
              }))}>Add row</Button>
            </Box>
            {(woForm.deliverables_json || []).map((d, i) => (
              <Box
                key={i}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '24px 1fr 40px', sm: '28px minmax(0, 1fr) minmax(170px, 220px) 40px' },
                  gap: 1,
                  mb: 1,
                  alignItems: 'flex-start',
                }}
              >
                <Typography variant="caption" sx={{ pt: 1.2, fontWeight: 700 }}>{d.task_num}.</Typography>
                <TextField size="small" fullWidth multiline minRows={1} label="Deliverable description"
                  value={d.description}
                  onChange={e => {
                    const upd = [...woForm.deliverables_json];
                    upd[i] = { ...d, description: e.target.value };
                    setWoForm(f => ({ ...f, deliverables_json: upd }));
                  }} />
                <TextField
                  size="small"
                  fullWidth
                  label="Due date"
                  sx={{ gridColumn: { xs: '2 / 3', sm: 'auto' } }}
                  value={d.due_date}
                  onChange={e => {
                    const upd = [...woForm.deliverables_json];
                    upd[i] = { ...d, due_date: e.target.value };
                    setWoForm(f => ({ ...f, deliverables_json: upd }));
                  }} />
                <IconButton size="small" color="error" sx={{ mt: 0.5, gridColumn: { xs: '3 / 4', sm: 'auto' } }} onClick={() => {
                  const upd = woForm.deliverables_json.filter((_, j) => j !== i)
                    .map((x, j) => ({ ...x, task_num: j + 1 }));
                  setWoForm(f => ({ ...f, deliverables_json: upd }));
                }}>
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Rate / day (UGX)" type="number"
              value={woForm.rate_per_day} onChange={e => setWoForm(f => ({ ...f, rate_per_day: Number(e.target.value) }))} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Maximum days" type="number"
              value={woForm.max_days} onChange={e => setWoForm(f => ({ ...f, max_days: Number(e.target.value) }))} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Team Leader Name"
              value={woForm.team_leader_name} onChange={e => setWoForm(f => ({ ...f, team_leader_name: e.target.value }))} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth size="small" label="Payment notes (optional)"
              value={woForm.payment_notes} onChange={e => setWoForm(f => ({ ...f, payment_notes: e.target.value }))} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{
        flexShrink: 0,
        px: { xs: 2, sm: 3 },
        py: 1.5,
        gap: 1,
        flexWrap: 'wrap',
      }}>
        <Button onClick={onClose} sx={{ order: { xs: 2, sm: 0 } }}>Cancel</Button>
        <Button variant="contained" onClick={saveWo} disabled={woSaving}>
          {woSaving ? <CircularProgress size={18} /> : (woEditing ? 'Save Changes' : 'Create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

export default function Dashboard({ token, currentUser, onLogout }) {
  const isViewer          = currentUser?.role === 'viewer';
  const isStaff           = !!(currentUser?.is_staff || currentUser?.is_superuser || currentUser?.role === 'admin');
  const isProgrammeManager = !isStaff && currentUser?.role === 'cohort_admin';
  const isAdmin           = !isViewer && (isStaff || currentUser?.role === 'cohort_admin');
  const headers   = { Authorization: `Bearer ${token}` };

  const [section, setSection] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('section');
    return NAV_ITEMS.some((item) => item.key === requested) ? requested : 'overview';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── nav drag-and-drop ──────────────────────────────────────────────────────
  const [navOrder, setNavOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dashNavOrder') || 'null');
      if (Array.isArray(saved) && saved.every(k => NAV_ITEMS.some(n => n.key === k))) return saved;
    } catch {}
    return NAV_ITEMS.map(n => n.key);
  });
  // Tabs hidden based on role
  const HIDDEN_TABS = isStaff
    ? []
    : isProgrammeManager
      ? ['users', 'cohorts', 'communications']
      : ['users', 'communications'];
  const orderedNav = navOrder.map(k => NAV_ITEMS.find(n => n.key === k)).filter(n => n && !HIDDEN_TABS.includes(n.key));
  const [dragKey, setDragKey] = useState(null);
  const [navLocked, setNavLocked] = useState(true);

  // ── data ───────────────────────────────────────────────────────────────────
  const [msmes, setMsmes] = useState([]);
  const [experts, setExperts] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [bgeGroups, setBgeGroups] = useState([]);
  const [programmeGroups, setProgrammeGroups] = useState([]);
  const [trainingSessions, setTrainingSessions] = useState([]);
  const [trainingTopics, setTrainingTopics] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(false);

  // ── work orders ───────────────────────────────────────────────────────────
  const [workOrders, setWorkOrders] = useState([]);
  const [woFilterBge, setWoFilterBge] = useState('');
  const [woFilterStatus, setWoFilterStatus] = useState('');
  const [woFilterType, setWoFilterType] = useState('');
  const [woDialog, setWoDialog] = useState(false);
  const [woEditing, setWoEditing] = useState(null);
  const [woIssuing, setWoIssuing] = useState(null);
  const [woWithdrawing, setWoWithdrawing] = useState(null);
  const [woWithdrawDialog, setWoWithdrawDialog] = useState(false);
  const [woWithdrawTarget, setWoWithdrawTarget] = useState(null);
  const [woWithdrawReason, setWoWithdrawReason] = useState('');

  // ── filters ────────────────────────────────────────────────────────────────
  const [msmeSearch, setMsmeSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [filterCohort, setFilterCohort] = useState('');

  // ── pagination ─────────────────────────────────────────────────────────────
  const [msmePage, setMsmePage] = useState(0);
  const [expertPage, setExpertPage] = useState(0);
  const [sessionPage, setSessionPage] = useState(0);

  // ── notifications ──────────────────────────────────────────────────────────
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── dialogs ────────────────────────────────────────────────────────────────
  const [viewItem, setViewItem] = useState(null);
  const [viewType, setViewType] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [editType, setEditType] = useState('');
  const [editForm, setEditForm] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteType, setDeleteType] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── cohort dialog ──────────────────────────────────────────────────────────
  const [cohortDialog, setCohortDialog] = useState(false);
  const [cohortForm, setCohortForm] = useState({ name: '', description: '' });
  const [cohortLoading, setCohortLoading] = useState(false);

  // ── bge group dialog ───────────────────────────────────────────────────────
  const [groupDialog, setGroupDialog] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', objectives: '' });
  const [groupLoading, setGroupLoading] = useState(false);
  const [manageGroupItem, setManageGroupItem] = useState(null);

  // ── group MSME assignment dialog ───────────────────────────────────────────
  const [assignMsmeGroup, setAssignMsmeGroup] = useState(null);  // group object or null
  // assignedGroupMsmeIds, groupMsmeSession, groupMsmeSaving, toggleGroupMsme,
  // saveGroupMsmeAssignments all live inside AssignMsmesDialog to prevent
  // checkbox toggles from re-rendering the full Dashboard tree (was 312ms INP).

  // ── training dialogs ───────────────────────────────────────────────────────
  const [sessionDialog, setSessionDialog] = useState(false);
  const [sessionEditing, setSessionEditing] = useState(null);
  // team = [{role:'lead'|'mentor', bge_id:'', work_order_id:'', _key: uniqueKey}]
  const EMPTY_SESSION_FORM = { title: '', date: '', location: '', description: '', topic: '', businesses: [], team: [] };
  const [sessionForm, setSessionForm] = useState(EMPTY_SESSION_FORM);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [attendanceDialog, setAttendanceDialog] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionAttendees, setSessionAttendees] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // ── participation summary ──────────────────────────────────────────────────
  const [participationSummary, setParticipationSummary] = useState(null);
  const [participationLoading, setParticipationLoading] = useState(false);
  const [participationCohort, setParticipationCohort] = useState('');

  // ── reports ────────────────────────────────────────────────────────────────
  const [reports, setReports] = useState([]);
  const [groupReports, setGroupReports] = useState([]);
  const [reportFilterBge, setReportFilterBge] = useState('');
  const [reportFilterStatus, setReportFilterStatus] = useState('');
  const [viewReport, setViewReport] = useState(null);
  const [reportPage, setReportPage] = useState(0);
  const [emailingBgeId, setEmailingBgeId] = useState(null);
  const [emailPreview, setEmailPreview] = useState(null);   // { subject, body, to, bge }
  const [emailEditBody, setEmailEditBody] = useState('');   // editable copy of body
  const [emailEditSubject, setEmailEditSubject] = useState(''); // editable subject
  const [emailSending, setEmailSending] = useState(false);

  // ── training / mentor reports (admin) ─────────────────────────────────────
  const [adminTrainingReports, setAdminTrainingReports] = useState([]);
  const [adminMentorReports, setAdminMentorReports] = useState([]);
  const [trReportsLoaded, setTrReportsLoaded] = useState(false);
  const [trReportTab, setTrReportTab] = useState(0);
  const [viewTrReport, setViewTrReport] = useState(null);
  const [viewMrReport, setViewMrReport] = useState(null);

  // ── assignment dialog ──────────────────────────────────────────────────────
  const [assignDialog, setAssignDialog] = useState(false);
  const [inactiveMsmes, setInactiveMsmes]   = useState(null);  // null=unchecked, [] or array when loaded
  const [reactivating, setReactivating]     = useState(false);

  const [assignTarget, setAssignTarget] = useState(null);  // MSME being assigned
  const [assignForm, setAssignForm] = useState({ bge_id: '', objectives: '', assignment_date: '' });
  const [assignSaving, setAssignSaving] = useState(false);

  // ── BGE-first assignments state ────────────────────────────────────────────
  const [bgeObjectives, setBgeObjectives] = useState({});
  const [savingObjectives, setSavingObjectives] = useState({});
  const [addMsmeDialog, setAddMsmeDialog] = useState(null); // bge object
  const [addMsmePick, setAddMsmePick] = useState('');
  const [addMsmeSearch, setAddMsmeSearch] = useState('');

  // ── t-shirt receipts ──────────────────────────────────────────────────────
  const [tshirtReceipts, setTshirtReceipts] = useState([]);
  const [tshirtLoading, setTshirtLoading] = useState(false);
  const [tshirtDialog, setTshirtDialog] = useState(false);
  const [tshirtForm, setTshirtForm] = useState({ title: 'PRUDEV II T-Shirt Collection', event: '', colour: 'Blue', notes: '' });
  const [tshirtFormEntries, setTshirtFormEntries] = useState([]); // [{bge_id, name, size, quantity}]
  const [tshirtSaving, setTshirtSaving] = useState(false);
  const [tshirtDetailId, setTshirtDetailId] = useState(null); // receipt id being viewed
  const [tshirtBulkSigning, setTshirtBulkSigning] = useState(false);
  const [tshirtBgeSearch, setTshirtBgeSearch] = useState('');
  const [tshirtPage, setTshirtPage] = useState(0);

  // ── user management ────────────────────────────────────────────────────────
  const [bgeUsers, setBgeUsers] = useState([]);
  const [userDialog, setUserDialog] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', password: '', email: '', bge_id: '', role: 'bge', group_ids: [] });
  const [userLoading, setUserLoading] = useState(false);
  const [pwdDialog, setPwdDialog] = useState(false);
  const [pwdUser, setPwdUser] = useState(null);
  const [newPwd, setNewPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [roleDialog, setRoleDialog] = useState(false);
  const [roleUser, setRoleUser] = useState(null);
  const [roleForm, setRoleForm] = useState({ role: 'viewer', group_ids: [] });

  // ── fetch ──────────────────────────────────────────────────────────────────
  // Heavy initial load — runs once after login and after explicit refreshes
  // (e.g. mutations). Does NOT include search/filter state in deps, so a user
  // typing in the search box no longer fires 9 parallel HTTP calls per character.
  const fetchAll = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (msmeSearch) params.append('search', msmeSearch);
      if (filterType) params.append('business_type', filterType);
      if (filterSector) params.append('sector', filterSector);
      if (filterCohort) params.append('cohort', filterCohort);

      const reportParams = new URLSearchParams();
      if (reportFilterBge) reportParams.append('bge', reportFilterBge);
      if (reportFilterStatus) reportParams.append('status', reportFilterStatus);

      const [mRes, eRes, cRes, gRes, sRes, tRes, aRes, uRes, rRes, grRes, pgRes] = await Promise.all([
        axios.get(`${API_ENDPOINTS.MSMES}?${params}`, { headers: h }),
        axios.get(API_ENDPOINTS.EXPERTS, { headers: h }),
        axios.get(API_ENDPOINTS.COHORTS, { headers: h }),
        axios.get(API_ENDPOINTS.BGE_GROUPS, { headers: h }),
        axios.get(API_ENDPOINTS.TRAINING_SESSIONS, { headers: h }),
        axios.get(API_ENDPOINTS.TRAINING_TOPICS, { headers: h }),
        axios.get(`${API_ENDPOINTS.MSMES}analytics/`, { headers: h }),
        axios.get(API_ENDPOINTS.BGE_USERS, { headers: h }).catch(() => ({ data: [] })),
        axios.get(`${API_ENDPOINTS.REPORTS}?${reportParams}`, { headers: h }),
        axios.get(API_ENDPOINTS.GROUP_REPORTS, { headers: h }).catch(() => ({ data: [] })),
        axios.get(API_ENDPOINTS.PROGRAMME_GROUPS, { headers: h }).catch(() => ({ data: [] })),
      ]);

      const toArr = (d) => (Array.isArray(d) ? d : d.results || []);
      setMsmes(toArr(mRes.data));
      setExperts(toArr(eRes.data));
      setCohorts(toArr(cRes.data));
      setBgeGroups(toArr(gRes.data));
      setProgrammeGroups(toArr(pgRes.data));
      setTrainingSessions(toArr(sRes.data));
      setTrainingTopics(toArr(tRes.data));
      setAnalytics(aRes.data);
      setBgeUsers(Array.isArray(uRes.data) ? uRes.data : []);
      setGroupReports(toArr(grRes.data));
      setReports(toArr(rRes.data));
      setError('');
    } catch {
      setError('Failed to load data. Check your connection.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_title: `Admin - ${section}`, page_path: `/admin/${section}` });
    }
  }, [section]);

  // Auto-load participation summary whenever the user navigates to the tab.
  useEffect(() => {
    if (section === 'participation') fetchParticipationSummary(participationCohort);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    if (section !== 'reports' || trReportsLoaded) return;
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      axios.get(API_ENDPOINTS.TRAINING_REPORTS, { headers: h }).catch(() => ({ data: [] })),
      axios.get(API_ENDPOINTS.MENTOR_REPORTS, { headers: h }).catch(() => ({ data: [] })),
    ]).then(([trRes, mrRes]) => {
      const toArr = d => Array.isArray(d) ? d : d.results || [];
      setAdminTrainingReports(toArr(trRes.data));
      setAdminMentorReports(toArr(mrRes.data));
      setTrReportsLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, trReportsLoaded, token]);

  const fetchWorkOrders = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    const params = new URLSearchParams();
    if (woFilterBge) params.append('bge', woFilterBge);
    if (woFilterStatus) params.append('status', woFilterStatus);
    if (woFilterType) params.append('work_order_type', woFilterType);
    try {
      const res = await axios.get(`${API_ENDPOINTS.WORK_ORDERS}?${params}`, { headers: h });
      setWorkOrders(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      setWorkOrders([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, woFilterBge, woFilterStatus, woFilterType]);

  useEffect(() => { fetchWorkOrders(); }, [fetchWorkOrders]);

  const fetchTshirtReceipts = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    setTshirtLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.TSHIRT_RECEIPTS, { headers: h });
      setTshirtReceipts(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      setTshirtReceipts([]);
    } finally {
      setTshirtLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (section !== 'tshirts') return;
    fetchTshirtReceipts();
    // Ensure BGEs are loaded for the create-receipt dialog
    if (experts.length === 0) {
      const h = { Authorization: `Bearer ${token}` };
      axios.get(API_ENDPOINTS.EXPERTS, { headers: h })
        .then(res => setExperts(Array.isArray(res.data) ? res.data : res.data.results || []))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, fetchTshirtReceipts]);

  // Lightweight, debounced refetch JUST for the MSME list when search/filter
  // changes. AbortController cancels any in-flight request when the user keeps
  // typing, so we never paint stale results over fresh ones.
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      const h = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams();
      if (msmeSearch) params.append('search', msmeSearch);
      if (filterType) params.append('business_type', filterType);
      if (filterSector) params.append('sector', filterSector);
      if (filterCohort) params.append('cohort', filterCohort);
      try {
        const r = await axios.get(`${API_ENDPOINTS.MSMES}?${params}`, {
          headers: h, signal: controller.signal,
        });
        setMsmes(Array.isArray(r.data) ? r.data : (r.data.results || []));
      } catch (e) {
        if (!axios.isCancel(e) && e.name !== 'CanceledError') {
          // surface non-abort errors only
          setError('Failed to refresh MSME list.');
        }
      }
    }, 300);
    return () => { clearTimeout(handle); controller.abort(); };
  }, [token, msmeSearch, filterType, filterSector, filterCohort]);

  // Same pattern for the Reports list — debounced + cancellable
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      const h = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams();
      if (reportFilterBge) params.append('bge', reportFilterBge);
      if (reportFilterStatus) params.append('status', reportFilterStatus);
      try {
        const r = await axios.get(`${API_ENDPOINTS.REPORTS}?${params}`, {
          headers: h, signal: controller.signal,
        });
        setReports(Array.isArray(r.data) ? r.data : (r.data.results || []));
      } catch (e) {
        if (!axios.isCancel(e) && e.name !== 'CanceledError') {
          setError('Failed to refresh reports.');
        }
      }
    }, 300);
    return () => { clearTimeout(handle); controller.abort(); };
  }, [token, reportFilterBge, reportFilterStatus]);

  // ── helpers ────────────────────────────────────────────────────────────────
  const fmt = (n) => new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n || 0);
  const statusColor = (s) => ({ approved: 'success', pending: 'warning', rejected: 'error' }[s] || 'default');

  const notify = (msg, type = 'success') => type === 'success' ? setSuccess(msg) : setError(msg);

  // ── email BGE — two-step: preview (editable) then confirm send ───────────
  const previewBgeEmail = async (bge) => {
    if (!bge.email) { notify(`${bge.name} has no email address on record`, 'error'); return; }
    const assignedCount = (bge.assigned_msmes_list || []).length || bge.assigned_msme_count || 0;
    if (!assignedCount) { notify(`${bge.name} has no assigned MSMEs — assign at least one before sending`, 'error'); return; }
    setEmailingBgeId(bge.id);
    try {
      const res = await axios.get(EXPERT_PREVIEW_EMAIL_URL(bge.id), { headers });
      const data = res.data;
      setEmailPreview({ ...data, bge });
      setEmailEditSubject(data.subject || '');
      setEmailEditBody(data.body || '');
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Could not load email preview. Ensure the BGE has assigned MSMEs.';
      notify(msg, 'error');
    } finally {
      setEmailingBgeId(null);
    }
  };

  const confirmSendEmail = async () => {
    if (!emailPreview) return;
    setEmailSending(true);
    try {
      const res = await axios.post(
        EXPERT_SEND_EMAIL_URL(emailPreview.bge.id),
        { subject: emailEditSubject, body: emailEditBody },
        { headers }
      );
      notify(res.data.message || `Email sent to ${emailPreview.to}`);
      setEmailPreview(null);
    } catch (err) {
      notify(err.response?.data?.error || err.response?.data?.detail || 'Failed to send email', 'error');
    } finally {
      setEmailSending(false);
    }
  };

  // ── open expert view (fetches fresh data) ─────────────────────────────────
  // Track the currently-requested expert id so a slow response from a previously
  // closed dialog can't overwrite the data of whatever the user has open now.
  const expertFetchSeq = React.useRef(0);
  const openExpertView = async (bge) => {
    const seq = ++expertFetchSeq.current;
    setViewItem(bge);
    setViewType('expert');
    try {
      const res = await axios.get(`${API_ENDPOINTS.EXPERTS}${bge.id}/`, { headers });
      // Only commit the response if no newer openExpertView() has fired since
      // we started, AND the dialog is still showing the same expert.
      if (seq === expertFetchSeq.current) setViewItem(res.data);
    } catch {
      // keep the cached item already shown
    }
  };

  // ── rotate / clean BGE signature ─────────────────────────────────────────
  const [rotatingSig, setRotatingSig] = useState(false);
  const [cleaningSig, setCleaningSig] = useState(false);
  const rotateBgeSignature = async (bgeId, direction) => {
    setRotatingSig(true);
    try {
      await axios.post(EXPERT_ROTATE_SIGNATURE_URL(bgeId), { direction }, { headers });
      notify(`Signature rotated ${direction === 'ccw' ? '↺ CCW' : '↻ CW'} and saved.`);
      const fresh = await axios.get(`${API_ENDPOINTS.EXPERTS}${bgeId}/`, { headers });
      setViewItem(fresh.data);
    } catch (err) {
      notify(err.response?.data?.detail || 'Rotation failed.', 'error');
    } finally {
      setRotatingSig(false);
    }
  };
  const cleanBgeSignature = async (bgeId) => {
    setCleaningSig(true);
    try {
      await axios.post(EXPERT_CLEAN_SIGNATURE_URL(bgeId), {}, { headers });
      notify('Signature background removed successfully.');
      const fresh = await axios.get(`${API_ENDPOINTS.EXPERTS}${bgeId}/`, { headers });
      setViewItem(fresh.data);
    } catch (err) {
      notify(err.response?.data?.detail || 'Cleaning failed.', 'error');
    } finally {
      setCleaningSig(false);
    }
  };

  // ── edit/delete ────────────────────────────────────────────────────────────
  const openEdit = (item, type) => { setEditItem(item); setEditType(type); setEditForm({ ...item }); };
  const closeEdit = () => { setEditItem(null); setEditForm({}); };

  const saveEdit = async () => {
    setEditLoading(true);
    try {
      const url = editType === 'msme'
        ? `${API_ENDPOINTS.MSMES}${editItem.id}/`
        : `${API_ENDPOINTS.EXPERTS}${editItem.id}/`;

      // Strip computed / file fields that can't be PATCH'd as plain JSON.
      // Signature files are managed via the dedicated upload/rotate endpoints.
      const STRIP_FIELDS = [
        'signature', 'signature_data', 'signature_url',
        'assigned_msme_count', 'assigned_msmes_list', 'group_names',
        'created_at', 'updated_at',
      ];
      const payload = Object.fromEntries(
        Object.entries(editForm).filter(([k]) => !STRIP_FIELDS.includes(k))
      );

      await axios.patch(url, payload, { headers });
      notify('Saved successfully');
      closeEdit();
      fetchAll();
    } catch (err) {
      notify(err.response?.data ? JSON.stringify(err.response.data) : 'Failed to save', 'error');
    }
    finally { setEditLoading(false); }
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      const url = deleteType === 'msme'
        ? `${API_ENDPOINTS.MSMES}${deleteItem.id}/`
        : deleteType === 'expert'
        ? `${API_ENDPOINTS.EXPERTS}${deleteItem.id}/`
        : deleteType === 'cohort'
        ? `${API_ENDPOINTS.COHORTS}${deleteItem.id}/`
        : `${API_ENDPOINTS.BGE_GROUPS}${deleteItem.id}/`;
      await axios.delete(url, { headers });
      notify('Deleted');
      setDeleteItem(null);
      fetchAll();
    } catch (e) { notify(e.response?.data?.detail || 'Failed to delete', 'error'); }
    finally { setDeleteLoading(false); }
  };

  const openAssignDialog = (msme) => {
    setAssignTarget(msme);
    setAssignForm({
      bge_id: msme.assigned_bge || '',
      objectives: msme.assignment_objectives || '',
      assignment_date: msme.assignment_date || new Date().toISOString().slice(0, 10),
    });
    setAssignDialog(true);
  };

  const saveAssignment = async () => {
    if (!assignForm.bge_id) { notify('Please select a BGE Expert', 'error'); return; }
    if (assignTarget && assignTarget.assigned_bge === parseInt(assignForm.bge_id)) {
      notify('This MSME is already assigned to the selected BGE Expert', 'error');
      return;
    }
    setAssignSaving(true);
    try {
      await axios.patch(
        `${API_ENDPOINTS.MSMES}${assignTarget.id}/assign_bge/`,
        { bge_id: assignForm.bge_id, objectives: assignForm.objectives, assignment_date: assignForm.assignment_date || null },
        { headers }
      );
      notify('Assignment saved');
      setAssignDialog(false);
      fetchAll();
    } catch (err) {
      notify(err.response?.data?.error || 'Failed to save assignment', 'error');
    } finally {
      setAssignSaving(false);
    }
  };

  // ── assign cohort ──────────────────────────────────────────────────────────
  const assignCohort = async (msmeId, cohortId) => {
    try {
      await axios.patch(`${API_ENDPOINTS.MSMES}${msmeId}/assign_cohort/`, { cohort_id: cohortId || null }, { headers });
      notify('Cohort assigned');
      fetchAll();
    } catch { notify('Failed to assign cohort', 'error'); }
  };

  const toggleProgrammeGroup = async (msme, groupId) => {
    const current = (msme.programme_groups_detail || []).map(g => g.id);
    const next = current.includes(groupId)
      ? current.filter(id => id !== groupId)
      : [...current, groupId];
    try {
      const res = await axios.patch(MSME_SET_GROUPS_URL(msme.id), { group_ids: next }, { headers });
      setMsmes(prev => prev.map(m => m.id === msme.id ? res.data : m));
    } catch { notify('Failed to update programme group', 'error'); }
  };

  // ── MSME upload dialog ─────────────────────────────────────────────────────
  const [msmeUploadDialog, setMsmeUploadDialog] = useState(false);
  const [msmeUploadCohort, setMsmeUploadCohort] = useState('');
  const [msmeUploadNewCohort, setMsmeUploadNewCohort] = useState('');
  const [msmeUploadFile, setMsmeUploadFile] = useState(null);
  const [msmeUploading, setMsmeUploading] = useState(false);
  const [msmeUploadSkipDups, setMsmeUploadSkipDups] = useState(false);
  const [msmeUploadResult, setMsmeUploadResult] = useState(null);
  const msmeFileRef = React.useRef();

  const checkInactiveMsmes = async () => {
    try {
      const r = await axios.get(`${API_ENDPOINTS.MSMES}inactive/`, { headers: { Authorization: `Bearer ${token}` } });
      setInactiveMsmes(r.data.msmes || []);
    } catch { notify('Failed to fetch inactive MSMEs', 'error'); }
  };

  const reactivateAll = async () => {
    setReactivating(true);
    try {
      const r = await axios.post(`${API_ENDPOINTS.MSMES}reactivate-all/`, {}, { headers: { Authorization: `Bearer ${token}` } });
      notify(r.data.message || 'MSMEs reactivated', 'success');
      setInactiveMsmes(null);
      fetchAll();
    } catch { notify('Reactivation failed', 'error'); }
    finally { setReactivating(false); }
  };

  const openMsmeUpload = () => {
    setMsmeUploadDialog(true);
    setMsmeUploadCohort('');
    setMsmeUploadNewCohort('');
    setMsmeUploadFile(null);
    setMsmeUploadSkipDups(false);
    setMsmeUploadResult(null);
  };

  const downloadMsmeTemplate = async () => {
    try {
      const res = await axios.get(API_ENDPOINTS.UPLOAD_MSMES_TEMPLATE, {
        headers, responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MSME_Upload_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      notify('Could not download template', 'error');
    }
  };

  const doMsmeUpload = async () => {
    if (!msmeUploadFile) { notify('Please select a file', 'error'); return; }
    setMsmeUploading(true);
    setMsmeUploadResult(null);
    const fd = new FormData();
    fd.append('file', msmeUploadFile);
    const cohortName = msmeUploadCohort === '__new__' ? msmeUploadNewCohort.trim() : msmeUploadCohort;
    if (cohortName) fd.append('cohort_name', cohortName);
    fd.append('update_existing', msmeUploadSkipDups ? 'false' : 'true');
    try {
      const res = await axios.post(API_ENDPOINTS.UPLOAD_MSMES, fd, { headers });
      setMsmeUploadResult(res.data);
      notify(res.data?.message || 'MSMEs uploaded');
      fetchAll();
    } catch (err) {
      notify(err.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setMsmeUploading(false);
      if (msmeFileRef.current) msmeFileRef.current.value = '';
    }
  };

  // ── BGE upload dialog ──────────────────────────────────────────────────────
  const [bgeUploadDialog, setBgeUploadDialog] = useState(false);
  const [bgeUploadFile, setBgeUploadFile] = useState(null);
  const [bgeUploading, setBgeUploading] = useState(false);
  const [bgeUploadSkipDups, setBgeUploadSkipDups] = useState(false);
  const bgeFileRef = React.useRef();

  const openBgeUpload = () => {
    setBgeUploadDialog(true);
    setBgeUploadFile(null);
    setBgeUploadSkipDups(false);
  };

  const doBgeUpload = async () => {
    if (!bgeUploadFile) { notify('Please select a file', 'error'); return; }
    setBgeUploading(true);
    const fd = new FormData();
    fd.append('file', bgeUploadFile);
    fd.append('update_existing', bgeUploadSkipDups ? 'false' : 'true');
    try {
      const res = await axios.post(`${API_ENDPOINTS.EXPERTS}upload/`, fd, { headers });
      notify(res.data?.message || 'BGE data uploaded');
      setBgeUploadDialog(false);
      fetchAll();
    } catch (err) {
      notify(err.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setBgeUploading(false);
      if (bgeFileRef.current) bgeFileRef.current.value = '';
    }
  };

  // ── cohort CRUD ────────────────────────────────────────────────────────────
  const createCohort = async () => {
    setCohortLoading(true);
    try {
      await axios.post(API_ENDPOINTS.COHORTS, cohortForm, { headers });
      notify('Cohort created');
      setCohortDialog(false);
      setCohortForm({ name: '', description: '' });
      fetchAll();
    } catch { notify('Failed to create cohort', 'error'); }
    finally { setCohortLoading(false); }
  };

  // ── BGE group CRUD ─────────────────────────────────────────────────────────
  const createGroup = async () => {
    setGroupLoading(true);
    try {
      await axios.post(API_ENDPOINTS.BGE_GROUPS, groupForm, { headers });
      notify('Group created');
      setGroupDialog(false);
      setGroupForm({ name: '', description: '', objectives: '' });
      fetchAll();
    } catch { notify('Failed to create group', 'error'); }
    finally { setGroupLoading(false); }
  };

  const toggleGroupMember = async (groupId, bgeId, isMember) => {
    const action = isMember ? 'remove_member' : 'add_member';
    try {
      const res = await axios.post(`${API_ENDPOINTS.BGE_GROUPS}${groupId}/${action}/`, { bge_id: bgeId }, { headers });
      // The endpoint returns the freshly-serialised group — push it into the open
      // dialog so the checkbox flips instantly instead of waiting for fetchAll().
      if (res.data && manageGroupItem?.id === groupId) setManageGroupItem(res.data);
      fetchAll();
    } catch { notify('Failed to update group', 'error'); }
  };

  // ── Group report approval (admin) ──────────────────────────────────────────
  const approveGroupReport = async (id) => {
    try {
      await axios.patch(`${API_ENDPOINTS.GROUP_REPORTS}${id}/`, { status: 'approved' }, { headers });
      notify('Group report approved');
      fetchAll();
    } catch (e) {
      notify(e.response?.data?.error || 'Failed to approve report', 'error');
    }
  };

  const revertReport = async (kind, id) => {
    const label = kind === 'group' ? 'group report' : 'visit report';
    if (!window.confirm(`Revert this ${label} to draft? The BGE will be able to edit and resubmit it.`)) return;
    try {
      const url = kind === 'group' ? GROUP_REPORT_REVERT_URL(id) : REPORT_REVERT_URL(id);
      await axios.post(url, {}, { headers });
      notify(`${label.charAt(0).toUpperCase() + label.slice(1)} reverted to draft`);
      fetchAll();
    } catch (e) {
      notify(e.response?.data?.detail || `Failed to revert ${label}`, 'error');
    }
  };

  // ── PDF helpers (MSME + Group reports) ─────────────────────────────────────
  const openReportPdf = async (kind, reportId, mode = 'view') => {
    const base = kind === 'group' ? API_ENDPOINTS.GROUP_REPORTS : API_ENDPOINTS.REPORTS;
    try {
      const res = await axios.get(
        `${base}${reportId}/pdf/${mode === 'download' ? '?dl=1' : ''}`,
        { headers, responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${kind === 'group' ? 'GroupReport' : 'MSMEReport'}_${reportId}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      notify('Failed to render PDF', 'error');
    }
  };

  const openTrainingReportPdf = async (kind, reportId, mode = 'view') => {
    const urlFn = kind === 'mentor' ? MENTOR_REPORT_PDF_URL : TRAINING_REPORT_PDF_URL;
    try {
      const res = await axios.get(
        `${urlFn(reportId)}${mode === 'download' ? '?dl=1' : ''}`,
        { headers, responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${kind === 'mentor' ? 'MentorReport' : 'TrainingReport'}_${reportId}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      notify('Failed to render PDF', 'error');
    }
  };

  // Set / clear the group's team lead (must be a current member)
  const setGroupTeamLead = async (groupId, bgeId) => {
    try {
      const res = await axios.patch(`${API_ENDPOINTS.BGE_GROUPS}${groupId}/`, { team_lead: bgeId }, { headers });
      if (res.data && manageGroupItem?.id === groupId) setManageGroupItem(res.data);
      fetchAll();
      notify(bgeId ? 'Team lead set' : 'Team lead cleared');
    } catch { notify('Failed to set team lead', 'error'); }
  };

  // ── group MSME assignment ──────────────────────────────────────────────────
  const openAssignMsmeDialog = (group) => setAssignMsmeGroup(group);

  // ── facilitation assignments ───────────────────────────────────────────────
  // ── training sessions ──────────────────────────────────────────────────────
  const openSessionEdit = (s) => {
    setSessionEditing(s.id);
    setSessionForm({
      title: s.title,
      date: s.date,
      location: s.location || '',
      description: s.description || '',
      topic: s.topic || '',
      businesses: (s.businesses || []),
      team: (s.team || []).map(m => ({ ...m, _key: Math.random() })),
    });
    setSessionDialog(true);
  };

  const createSession = async () => {
    setSessionLoading(true);
    try {
      // 1. Save the session itself (no team fields on TrainingSession any more)
      const { team, ...sessionPayload } = sessionForm;
      if (!sessionPayload.topic) delete sessionPayload.topic;
      let sessionId = sessionEditing;
      if (sessionEditing) {
        await axios.put(`${API_ENDPOINTS.TRAINING_SESSIONS}${sessionEditing}/`, sessionPayload, { headers });
        notify('Session updated');
      } else {
        const res = await axios.post(API_ENDPOINTS.TRAINING_SESSIONS, sessionPayload, { headers });
        sessionId = res.data.id;
        notify('Session created');
      }

      // 2. Sync team assignments: delete existing for this session, recreate
      const existingRes = await axios.get(`${API_ENDPOINTS.FACILITATION_ASSIGNMENTS}?session=${sessionId}`, { headers });
      const existing = existingRes.data.results || existingRes.data;
      await Promise.all(existing.map(a => axios.delete(`${API_ENDPOINTS.FACILITATION_ASSIGNMENTS}${a.id}/`, { headers })));
      await Promise.all(
        team.filter(m => m.bge_id).map(m =>
          axios.post(API_ENDPOINTS.FACILITATION_ASSIGNMENTS, {
            bge: m.bge_id,
            topic: sessionPayload.topic || null,
            session: sessionId,
            role: m.role,
            work_order: m.work_order_id || null,
            assigned_date: sessionPayload.date,
          }, { headers })
        )
      );

      setSessionDialog(false);
      setSessionEditing(null);
      setSessionForm(EMPTY_SESSION_FORM);
      fetchAll();
    } catch (e) { notify(e.response?.data?.detail || 'Failed to save session', 'error'); }
    finally { setSessionLoading(false); }
  };

  const EMPTY_ATTENDEE = () => ({
    _key: Math.random(),
    id: null,
    msme: '',
    attendee_name: '',
    attendee_phone: '',
    gender: '',
    age_group: '',
    refugee_status: 'H',
    consent_photo: true,
    consent_contact: true,
    present: true,
  });

  const deleteSession = async (session) => {
    if (!window.confirm(`Delete "${session.title}"? This will also remove all attendance records and reports for this session.`)) return;
    try {
      await axios.delete(`${API_ENDPOINTS.TRAINING_SESSIONS}${session.id}/`, { headers });
      notify('Session deleted');
      fetchAll();
    } catch (e) { notify(e.response?.data?.detail || 'Failed to delete session', 'error'); }
  };

  const openAttendance = async (session) => {
    setSelectedSession(session);
    setAttendanceLoading(true);
    setAttendanceDialog(true);
    try {
      const res = await axios.get(`${API_ENDPOINTS.ATTENDANCE}?session=${session.id}`, { headers });
      const records = Array.isArray(res.data) ? res.data : (res.data.results || []);
      if (records.length > 0) {
        setSessionAttendees(records.map(r => ({ ...r, _key: r.id })));
      } else {
        // Pre-fill from session's MSMEs for convenience
        const sessionMsmeList = msmes.filter(m => m.is_active);
        setSessionAttendees(sessionMsmeList.length > 0
          ? sessionMsmeList.slice(0, 20).map(m => ({
              ...EMPTY_ATTENDEE(),
              msme: m.id,
              attendee_name: m.owner_name || '',
              attendee_phone: m.phone || '',
              gender: m.gender === 'MALE' ? 'M' : m.gender === 'FEMALE' ? 'F' : '',
            }))
          : [EMPTY_ATTENDEE()]);
      }
    } catch { notify('Failed to load attendance', 'error'); }
    finally { setAttendanceLoading(false); }
  };

  const updateAttendee = (key, field, value) => {
    setSessionAttendees(prev => prev.map(a => a._key === key ? { ...a, [field]: value } : a));
  };

  const addAttendeeRow = () => {
    setSessionAttendees(prev => [...prev, EMPTY_ATTENDEE()]);
  };

  const removeAttendeeRow = (key) => {
    setSessionAttendees(prev => prev.filter(a => a._key !== key));
  };

  const saveAttendance = async () => {
    setAttendanceLoading(true);
    try {
      const present = sessionAttendees.filter(a => a.present);
      await Promise.all(present.map(a => {
        const payload = {
          session: selectedSession.id,
          msme: a.msme || null,
          attendee_name: a.attendee_name,
          attendee_phone: a.attendee_phone,
          gender: a.gender,
          age_group: a.age_group,
          refugee_status: a.refugee_status || 'H',
          consent_photo: a.consent_photo,
          consent_contact: a.consent_contact,
          present: true,
        };
        if (a.id) return axios.patch(`${API_ENDPOINTS.ATTENDANCE}${a.id}/`, payload, { headers });
        return axios.post(API_ENDPOINTS.ATTENDANCE, payload, { headers });
      }));
      notify('Attendance saved');
      setAttendanceDialog(false);
      fetchAll();
      // Live-refresh participation tab if it's currently visible
      if (section === 'participation') fetchParticipationSummary(participationCohort);
    } catch { notify('Failed to save attendance', 'error'); }
    finally { setAttendanceLoading(false); }
  };

  const fetchParticipationSummary = useCallback(async (cohortId = '') => {
    setParticipationLoading(true);
    try {
      const url = cohortId
        ? `${API_ENDPOINTS.ATTENDANCE_SUMMARY}?cohort=${cohortId}`
        : API_ENDPOINTS.ATTENDANCE_SUMMARY;
      const res = await axios.get(url, { headers });
      setParticipationSummary(res.data);
    } catch { notify('Failed to load participation summary', 'error'); }
    finally { setParticipationLoading(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── user management helpers ────────────────────────────────────────────────
  const createBGEUser = async () => {
    if (!userForm.username || !userForm.password) return;
    setUserLoading(true);
    try {
      const res = await axios.post(API_ENDPOINTS.BGE_USERS, {
        username: userForm.username,
        password: userForm.password,
        email: userForm.email,
        bge_id: userForm.role === 'bge' ? userForm.bge_id : '',
      }, { headers });
      // Set role if not a plain BGE account
      if (userForm.role !== 'bge') {
        await axios.patch(`${API_ENDPOINTS.BGE_USERS}${res.data.id}/set-role/`,
          { role: userForm.role, group_ids: userForm.group_ids }, { headers });
      }
      notify('Account created — welcome email sent if an email address was provided');
      setUserDialog(false);
      setUserForm({ username: '', password: '', email: '', bge_id: '', role: 'bge', group_ids: [] });
      fetchAll();
    } catch (e) { notify(e.response?.data?.error || 'Failed to create user', 'error'); }
    finally { setUserLoading(false); }
  };

  const bulkCreateMissingAccounts = async () => {
    setUserLoading(true);
    try {
      const res = await axios.post(`${API_ENDPOINTS.BGE_USERS}bulk-create-missing/`, { password: 'bds123' }, { headers });
      const { created, skipped, names } = res.data;
      if (created > 0) {
        notify(`Created ${created} account${created !== 1 ? 's' : ''}: ${names.join(', ')}. Welcome emails sent. Default password: bds123`);
      } else {
        notify('All BGE experts already have accounts.');
      }
      if (skipped > 0) notify(`${skipped} BGE(s) skipped — no name/email to generate username.`, 'warning');
      fetchAll();
    } catch (e) { notify(e.response?.data?.error || 'Failed to bulk create accounts', 'error'); }
    finally { setUserLoading(false); }
  };

  // Auto-fill username/email when BGE is selected in the Create Account dialog
  const handleUserBgeSelect = (bgeId) => {
    const bge = experts.find(e => e.id === Number(bgeId) || e.id === bgeId);
    if (!bge) { setUserForm(f => ({ ...f, bge_id: bgeId })); return; }
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').replace(/\.+/g, '.');
    const suggestedUsername = bge.email ? bge.email.split('@')[0].toLowerCase() : slug(bge.name || '');
    setUserForm(f => ({
      ...f,
      bge_id: bgeId,
      role: 'bge',
      username: f.username || suggestedUsername,
      email: f.email || bge.email || '',
    }));
  };

  const resetPassword = async () => {
    if (!newPwd || newPwd.length < 6) return;
    setPwdLoading(true);
    try {
      await axios.post(`${API_ENDPOINTS.BGE_USERS}${pwdUser.id}/set-password/`, { password: newPwd }, { headers });
      notify(`Password reset for ${pwdUser.username}`);
      setPwdDialog(false);
      setNewPwd('');
    } catch (e) { notify(e.response?.data?.error || 'Failed to reset password', 'error'); }
    finally { setPwdLoading(false); }
  };

  const openRoleDialog = (u) => {
    setRoleUser(u);
    setRoleForm({
      role: ['cohort_admin', 'viewer', 'bge'].includes(u.role) ? u.role : 'viewer',
      group_ids: u.managed_groups?.map(g => g.id) || [],
      bge_id: u.bge_profile?.id || '',
    });
    setRoleDialog(true);
  };

  const saveRole = async () => {
    if (!roleUser) return;
    setUserLoading(true);
    try {
      await axios.patch(`${API_ENDPOINTS.BGE_USERS}${roleUser.id}/set-role/`, roleForm, { headers });
      notify(`Role updated for ${roleUser.username}`);
      setRoleDialog(false);
      fetchAll();
    } catch (e) { notify(e.response?.data?.error || 'Failed to update role', 'error'); }
    finally { setUserLoading(false); }
  };

  const toggleUserActive = async (user) => {
    try {
      await axios.patch(`${API_ENDPOINTS.BGE_USERS}${user.id}/toggle-active/`, {}, { headers });
      notify(`${user.username} ${user.is_active ? 'deactivated' : 'activated'}`);
      fetchAll();
    } catch { notify('Failed to update user', 'error'); }
  };

  const unlinkBGE = async (userId) => {
    try {
      await axios.patch(`${API_ENDPOINTS.BGE_USERS}${userId}/link-bge/`, { bge_id: null }, { headers });
      notify('BGE profile unlinked');
      fetchAll();
    } catch { notify('Failed to unlink', 'error'); }
  };

  const linkBGE = async (userId, bgeId) => {
    if (!bgeId) return;
    try {
      await axios.patch(`${API_ENDPOINTS.BGE_USERS}${userId}/link-bge/`, { bge_id: bgeId }, { headers });
      notify('BGE profile linked successfully');
      setLinkBgeUser(null);
      fetchAll();
    } catch (err) { notify(err.response?.data?.error || 'Failed to link BGE', 'error'); }
  };

  // ── link BGE dialog ────────────────────────────────────────────────────────
  const [linkBgeUser, setLinkBgeUser] = useState(null);
  const [linkBgeId, setLinkBgeId] = useState('');

  // ── sidebar ────────────────────────────────────────────────────────────────
  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: 0, bgcolor: BRAND.sidebarBg }}>
      <Box sx={{ p: 2.5, borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.2 }}>
              PRUDEV II
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
              Portfolio Manager
            </Typography>
          </Box>
          <Tooltip title={navLocked ? 'Unlock to reorder tabs' : 'Lock tab order'}>
            <IconButton size="small" onClick={() => setNavLocked(!navLocked)}
              sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: '#fff' } }}>
              {navLocked ? <Lock fontSize="small" /> : <LockOpen fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <List sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        py: 1,
        WebkitOverflowScrolling: 'touch',
        '&::-webkit-scrollbar': { width: 8 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.24)', borderRadius: 8 },
      }}>
        {orderedNav.map(({ key, label, icon }) => (
          <ListItemButton
            key={key}
            selected={section === key}
            onClick={() => { startTransition(() => setSection(key)); setMobileOpen(false); }}
            draggable={!navLocked}
            onDragStart={!navLocked ? () => setDragKey(key) : undefined}
            onDragOver={!navLocked ? e => e.preventDefault() : undefined}
            onDrop={!navLocked ? () => {
              if (!dragKey || dragKey === key) return;
              const from = navOrder.indexOf(dragKey);
              const to = navOrder.indexOf(key);
              const next = [...navOrder];
              next.splice(from, 1);
              next.splice(to, 0, dragKey);
              setNavOrder(next);
              localStorage.setItem('dashNavOrder', JSON.stringify(next));
              setDragKey(null);
            } : undefined}
            onDragEnd={!navLocked ? () => setDragKey(null) : undefined}
            sx={{
              mx: 1, mb: 0.5, borderRadius: 2,
              color: 'rgba(255,255,255,0.7)',
              '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.15)', color: '#fff' },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' },
              opacity: dragKey === key ? 0.4 : 1,
              cursor: navLocked ? 'pointer' : 'grab',
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{icon}</ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14 }} />
            {!navLocked && <DragHandle sx={{ fontSize: 16, opacity: 0.35, ml: 0.5 }} />}
          </ListItemButton>
        ))}
      </List>
      <Box sx={{
        p: 1.5,
        borderTop: '1px solid rgba(255,255,255,0.12)',
        bgcolor: 'rgba(0,0,0,0.12)',
        flexShrink: 0,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.25 }}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: 'rgba(255,255,255,0.18)', fontSize: 14, fontWeight: 700 }}>
            {currentUser?.username?.[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.15 }} noWrap>
              {currentUser?.username}
            </Typography>
            {isAdmin && (
              <Typography variant="caption" sx={{ color: '#ffd54f', fontWeight: 600 }}>Admin</Typography>
            )}
          </Box>
        </Box>
        <Button
          fullWidth size="small" variant="outlined" startIcon={<Logout />}
          onClick={onLogout}
          sx={{
            color: '#fff',
            borderColor: 'rgba(255,255,255,0.28)',
            justifyContent: 'center',
            textTransform: 'none',
            bgcolor: 'rgba(255,255,255,0.04)',
            '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
          }}
        >
          Sign out
        </Button>
      </Box>
    </Box>
  );

  // ── section renderers ──────────────────────────────────────────────────────
  const paginate = (arr, page) => arr.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);

  const ActionCell = ({ item, type }) => (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      <Tooltip title="View">
        <IconButton size="small" onClick={() => {
          if (type === 'expert') { openExpertView(item); }
          else { setViewItem(item); setViewType(type); }
        }}>
          <Visibility fontSize="small" />
        </IconButton>
      </Tooltip>
      {isStaff && <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(item, type)}><Edit fontSize="small" /></IconButton></Tooltip>}
      {isStaff && <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => { setDeleteItem(item); setDeleteType(type); }}><Delete fontSize="small" /></IconButton></Tooltip>}
    </Box>
  );

  const renderMSMEs = () => (
    <Box>
      <SectionHeader title="MSMEs" subtitle={`${msmes.length} records`}>
        <Button variant="outlined" color="warning" size="small" onClick={checkInactiveMsmes}>
          Check Inactive
        </Button>
        <Button variant="outlined" startIcon={<Upload />} size="small" onClick={openMsmeUpload}>
          Import MSME List
        </Button>
      </SectionHeader>

      {/* filters */}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search name, owner, sector…" value={msmeSearch}
          onChange={e => setMsmeSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchAll()}
          InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} /> }}
          sx={{ flex: '1 1 160px', minWidth: 0 }}
        />
        <FormControl size="small" sx={{ flex: '1 1 100px', minWidth: 0 }}>
          <InputLabel>Type</InputLabel>
          <Select value={filterType} onChange={e => { setFilterType(e.target.value); setMsmePage(0); }} label="Type">
            <MenuItem value="">All</MenuItem>
            {['MICRO','SMALL','MEDIUM'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: '1 1 120px', minWidth: 0 }}>
          <InputLabel>Sector</InputLabel>
          <Select value={filterSector} onChange={e => { setFilterSector(e.target.value); setMsmePage(0); }} label="Sector">
            <MenuItem value="">All</MenuItem>
            {['MANUFACTURING','SERVICES','TRADE','AGRICULTURE','TECHNOLOGY','CONSTRUCTION','HEALTHCARE','EDUCATION','OTHER'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: '1 1 120px', minWidth: 0 }}>
          <InputLabel>Cohort</InputLabel>
          <Select value={filterCohort} onChange={e => { setFilterCohort(e.target.value); setMsmePage(0); }} label="Cohort">
            <MenuItem value="">All</MenuItem>
            {cohorts.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" size="small" onClick={fetchAll}>Search</Button>
          {(msmeSearch || filterType || filterSector || filterCohort) &&
            <Button size="small" onClick={() => { setMsmeSearch(''); setFilterType(''); setFilterSector(''); setFilterCohort(''); }}>Clear</Button>}
        </Box>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Business</TableCell>
              <TableCell>Owner</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Cohort</TableCell>
              <TableCell>Groups</TableCell>
              <TableCell>Assigned BGE</TableCell>
              <TableCell>Location</TableCell>
              <TableCell align="center">Supports</TableCell>
              <TableCell>Last Support</TableCell>
              <TableCell>Growth Update</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginate(msmes, msmePage).length === 0 ? (
              <TableRow><TableCell colSpan={11} align="center" sx={{ py: 4, color: 'text.secondary' }}>No MSMEs found</TableCell></TableRow>
            ) : paginate(msmes, msmePage).map(m => (
              <TableRow key={m.id} hover>
                <TableCell><Chip label={m.msme_code} size="small" variant="outlined" /></TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{m.business_name}</TableCell>
                <TableCell>{m.owner_name}</TableCell>
                <TableCell><Chip label={m.business_type} size="small" color="primary" /></TableCell>
                <TableCell>
                  <Select
                    size="small" value={m.cohort || ''} displayEmpty variant="standard" disableUnderline
                    onChange={e => assignCohort(m.id, e.target.value)}
                    sx={{ fontSize: 12, minWidth: 90 }}
                  >
                    <MenuItem value=""><em>None</em></MenuItem>
                    {cohorts.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </Select>
                </TableCell>
                <TableCell sx={{ minWidth: 160 }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                    {(m.programme_groups_detail || []).map(g => (
                      <Chip
                        key={g.id}
                        label={g.name}
                        size="small"
                        onDelete={isAdmin ? () => toggleProgrammeGroup(m, g.id) : undefined}
                        sx={{
                          fontSize: 10, height: 20,
                          bgcolor: g.color || '#1A2F4B',
                          color: '#fff',
                          '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
                        }}
                      />
                    ))}
                    {isAdmin && programmeGroups.filter(g =>
                      !(m.programme_groups_detail || []).some(mg => mg.id === g.id)
                    ).length > 0 && (
                      <Select
                        value=""
                        displayEmpty
                        variant="standard"
                        disableUnderline
                        size="small"
                        onChange={e => { if (e.target.value) toggleProgrammeGroup(m, e.target.value); }}
                        sx={{ fontSize: 11, minWidth: 28, '& .MuiSelect-select': { py: 0, px: 0.5 } }}
                        renderValue={() => <Typography sx={{ fontSize: 18, lineHeight: 1, color: 'text.secondary' }}>+</Typography>}
                      >
                        <MenuItem value="" disabled><em>Add to group…</em></MenuItem>
                        {programmeGroups
                          .filter(g => !(m.programme_groups_detail || []).some(mg => mg.id === g.id))
                          .map(g => <MenuItem key={g.id} value={g.id} sx={{ fontSize: 13 }}>{g.name}</MenuItem>)
                        }
                      </Select>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  {m.assigned_bge_name ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Chip
                        label={m.assigned_bge_name}
                        size="small"
                        color="success"
                        variant="outlined"
                        onClick={() => openAssignDialog(m)}
                        sx={{ cursor: 'pointer', fontSize: 11 }}
                      />
                    </Box>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<People fontSize="small" />}
                      onClick={() => openAssignDialog(m)}
                      sx={{ fontSize: 11, py: 0.3, px: 1 }}
                    >
                      Assign
                    </Button>
                  )}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12 }}>
                    <LocationOn sx={{ fontSize: 14, color: 'text.secondary' }} />{m.city}
                  </Box>
                </TableCell>
                <TableCell align="center">
                  {m.total_reports > 0 ? (
                    <Chip label={m.total_reports} size="small" color="primary" variant="outlined" />
                  ) : (
                    <Typography variant="caption" color="text.disabled">—</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {m.last_support_date ? (
                    <Typography variant="caption" color={
                      // highlight recent (within 30 days) vs stale (>90 days)
                      (new Date() - new Date(m.last_support_date)) / 86400000 < 30
                        ? 'success.main'
                        : (new Date() - new Date(m.last_support_date)) / 86400000 > 90
                          ? 'warning.main'
                          : 'text.primary'
                    }>{m.last_support_date}</Typography>
                  ) : (
                    <Typography variant="caption" color="text.disabled">No visits yet</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {(() => {
                    const snaps = adminSnapshots.filter(s => s.msme === m.id);
                    if (!snaps.length) return <Typography variant="caption" color="text.disabled">—</Typography>;
                    const latest = snaps.sort((a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date))[0];
                    const days = Math.floor((new Date() - new Date(latest.snapshot_date)) / 86400000);
                    const color = days <= 30 ? 'success.main' : days <= 90 ? 'warning.main' : 'error.main';
                    return (
                      <Tooltip title={`${snaps.length} update${snaps.length !== 1 ? 's' : ''}`}>
                        <Typography variant="caption" color={color}>{latest.snapshot_date}</Typography>
                      </Tooltip>
                    );
                  })()}
                </TableCell>
                <TableCell><ActionCell item={m} type="msme" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div" count={msmes.length} page={msmePage}
          rowsPerPage={ROWS_PER_PAGE} rowsPerPageOptions={[ROWS_PER_PAGE]}
          onPageChange={(_, p) => setMsmePage(p)}
        />
      </TableContainer>
    </Box>
  );

  // ── Overview / Home Dashboard ─────────────────────────────────────────────
  const renderOverview = () => {
    const A = analytics || {};

    const totalMsmes     = A.total_msmes  || msmes.length;
    const totalBges      = A.total_bges   || experts.length;
    const totalSessions  = trainingSessions.length;
    const totalReports   = (A.total_reports || 0) + (A.total_group_reports || 0);
    const totalGroups    = A.total_groups  || bgeGroups.length;
    // const totalRevenue = fmt(A.total_annual_revenue);  // reserved for future use
    // const diag_total  = A.diag_total || 0;            // reserved for future use

    // Employees from latest data-update snapshots
    const snapEmp        = A.snapshot_employees || {};
    const totalEmployees = A.total_employees || 0;
    const ftTotal        = (snapEmp.ft_male || 0) + (snapEmp.ft_female || 0);
    const ptTotal        = (snapEmp.pt_male || 0) + (snapEmp.pt_female || 0);
    const refugeeTotal   = (snapEmp.ft_refugee || 0) + (snapEmp.pt_refugee || 0);
    const empSub         = totalEmployees
      ? `FT ${ftTotal} · PT ${ptTotal}${refugeeTotal ? ` · Refugee ${refugeeTotal}` : ''}`
      : 'from latest data updates';

    const kpiCards = [
      { val: totalMsmes,    label: 'MSMEs Enrolled',   sub: 'programme participants', color: BRAND.primaryMain, key: 'msmes' },
      { val: totalBges,     label: 'BGE Experts',      sub: 'coaches in field',       color: BRAND.gizRed,      key: 'experts' },
      { val: totalSessions, label: 'Training Sessions',sub: 'conducted to date',      color: '#0288D1',         key: 'training' },
      { val: totalReports,  label: 'Reports Filed',    sub: 'MSME + group visits',    color: '#2E7D32',         key: 'reports' },
      { val: totalGroups,   label: 'BGE Groups',       sub: 'active teams',           color: '#E65100',         key: 'bgegroups' },
      { val: totalEmployees,label: 'Total Employees',  sub: empSub,                   color: '#5D4037',         key: 'analytics' },
    ];

    const quickLinks = [
      { key: 'msmes',         label: 'MSMEs',             icon: <Business />,      desc: 'Browse and manage enrolled businesses' },
      { key: 'experts',       label: 'BGE Experts',       icon: <People />,        desc: 'View coach profiles and assignments' },
      { key: 'training',      label: 'Training',          icon: <School />,        desc: 'Sessions, attendance and reports' },
      { key: 'reports',       label: 'Reports',           icon: <PictureAsPdf />,  desc: 'Field visit and mentor reports' },
      { key: 'analytics',     label: 'Analytics',         icon: <Assessment />,    desc: 'Programme-wide insights and trends' },
      { key: 'participation', label: 'Participation',     icon: <TrendingUp />,    desc: 'Per-session MSME participation' },
      { key: 'workorders',    label: 'Work Orders',       icon: <Assignment />,    desc: 'Issue and track BGE work orders' },
      { key: 'communications',label: 'Communications',    icon: <Campaign />,      desc: 'Email MSMEs and send bulk messages' },
    ];

    // Upcoming / recent sessions
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = trainingSessions
      .filter(s => s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
    const recent = trainingSessions
      .filter(s => s.date < today)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4);

    return (
      <Box>
        {/* ── Welcome bar ── */}
        <Box sx={{ mb: 3, p: 2.5, borderRadius: 2, background: `linear-gradient(135deg, ${BRAND.sidebarBg} 0%, #1a3a5c 100%)`, color: '#fff' }}>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            PRUDEV II Programme Dashboard
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            Welcome back{currentUser?.name ? `, ${currentUser.name}` : ''}. Here's the programme at a glance.
          </Typography>
        </Box>

        {/* ── KPI cards ── */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {kpiCards.map(({ val, label, sub, color, key }) => (
            <Grid item xs={6} sm={4} lg={2} key={key}>
              <Card
                variant="outlined"
                sx={{ height: '100%', borderLeft: `4px solid ${color}`, cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                onClick={() => startTransition(() => setSection(key))}
              >
                <CardContent sx={{ pb: '12px !important', pt: '14px !important' }}>
                  <Typography variant="h5" fontWeight={800} color={color}>{val}</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2, mt: 0.5 }}>{label}</Typography>
                  <Typography variant="caption" color="text.secondary">{sub}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* ── Highlight cards ── */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ height: '100%', borderTop: `3px solid ${BRAND.primaryMain}` }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">Active BGEs (Last 30 Days)</Typography>
                <Typography variant="h4" fontWeight={800} color={BRAND.primaryMain}>
                  {A.active_bges_30d ?? '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  BGEs who filed a report or data update · out of {totalBges} total
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ height: '100%', borderTop: '3px solid #2E7D32' }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">Data Update Coverage</Typography>
                <Typography variant="h4" fontWeight={800} color="#2E7D32">
                  {A.msmes_with_updates ?? '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  MSMEs with at least one data update
                  {totalMsmes > 0 && A.msmes_with_updates != null
                    ? ` (${Math.round(A.msmes_with_updates / totalMsmes * 100)}% of enrolled)`
                    : ''}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%', borderTop: '3px solid #0288D1' }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">Training Engagement</Typography>
                <Typography variant="h4" fontWeight={800} color="#0288D1">{totalSessions}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Sessions held · {trainingSessions.reduce((t, s) => t + (s.attendance_count || 0), 0)} total attendances
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* ── Quick links grid ── */}
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Quick Access</Typography>
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {quickLinks.map(({ key, label, icon, desc }) => (
            <Grid item xs={12} sm={6} md={3} key={key}>
              <Card
                variant="outlined"
                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3, borderColor: BRAND.primaryMain } }}
                onClick={() => startTransition(() => setSection(key))}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: '12px !important' }}>
                  <Box sx={{ color: BRAND.primaryMain, display: 'flex', flexShrink: 0 }}>{icon}</Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={700}>{label}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>{desc}</Typography>
                  </Box>
                  <ArrowForward fontSize="small" sx={{ ml: 'auto', color: 'text.disabled', flexShrink: 0 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* ── Upcoming & recent sessions ── */}
        {(upcoming.length > 0 || recent.length > 0) && (
          <Grid container spacing={2}>
            {upcoming.length > 0 && (
              <Grid item xs={12} md={6}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  <TaskAlt fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle', color: '#2E7D32' }} />
                  Upcoming Sessions
                </Typography>
                <Paper variant="outlined">
                  {upcoming.map((s, i) => (
                    <Box key={s.id} sx={{ px: 2, py: 1.5, borderBottom: i < upcoming.length - 1 ? '1px solid #eee' : 'none',
                      display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EventNote fontSize="small" sx={{ color: '#0288D1' }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{s.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {s.date} · {(s.team || []).find(m => m.role === 'lead')?.bge_name || 'Lead TBC'}
                        </Typography>
                      </Box>
                      <Chip label={`${s.attendance_count ?? 0} attending`} size="small" />
                    </Box>
                  ))}
                </Paper>
              </Grid>
            )}
            {recent.length > 0 && (
              <Grid item xs={12} md={6}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  <School fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle', color: BRAND.gizRed }} />
                  Recent Sessions
                </Typography>
                <Paper variant="outlined">
                  {recent.map((s, i) => (
                    <Box key={s.id} sx={{ px: 2, py: 1.5, borderBottom: i < recent.length - 1 ? '1px solid #eee' : 'none',
                      display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EventNote fontSize="small" sx={{ color: BRAND.gizRed }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{s.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {s.date} · {(s.team || []).find(m => m.role === 'lead')?.bge_name || 'No lead'}
                        </Typography>
                      </Box>
                      <Chip label={`${s.attendance_count ?? 0} attended`} size="small" variant="outlined" />
                    </Box>
                  ))}
                </Paper>
              </Grid>
            )}
          </Grid>
        )}
      </Box>
    );
  };

  const renderExperts = () => (
    <Box>
      <SectionHeader title="BGE Experts" subtitle={`${experts.length} experts`}>
        {isStaff && (
          <Button variant="outlined" startIcon={<Upload />} size="small" onClick={openBgeUpload}>
            Import BGE Excel
          </Button>
        )}
      </SectionHeader>

      <Alert severity="info" sx={{ mb: 2 }} icon={false}>
        Upload your <strong>PRUDEV II BGE list</strong> Excel file. Required columns: <code>Full name</code>, <code>Phone number</code>, <code>Email address</code>, <code>Location</code>, <code>BGE code</code>. Existing experts are updated by name unless you choose to skip duplicates.
      </Alert>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>BGE Code</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Assigned MSMEs</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginate(experts, expertPage).length === 0 ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>No experts yet — use Import BGE Excel to upload your list</TableCell></TableRow>
            ) : paginate(experts, expertPage).map(e => (
              <TableRow key={e.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: BRAND.primaryMain }}>{(e.name || '?')[0]}</Avatar>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>{e.name}</Typography>
                      {e.email && <Typography variant="caption" color="text.secondary">{e.email}</Typography>}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  {e.bge_code
                    ? <Chip label={e.bge_code} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: 11 }} />
                    : <Typography variant="caption" color="text.disabled">—</Typography>}
                </TableCell>
                <TableCell><Typography variant="body2">{e.phone || '—'}</Typography></TableCell>
                <TableCell>{e.location}</TableCell>
                <TableCell>
                  <Badge badgeContent={e.assigned_msme_count} color="primary" showZero>
                    <Business fontSize="small" color="action" />
                  </Badge>
                </TableCell>
                <TableCell><Chip label={e.status} color={statusColor(e.status)} size="small" /></TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title={e.email ? `Preview & send MSME list to ${e.email}` : 'No email on record'}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={!e.email || emailingBgeId === e.id}
                          onClick={() => previewBgeEmail(e)}
                          color="primary"
                        >
                          {emailingBgeId === e.id
                            ? <CircularProgress size={16} />
                            : <Email fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <ActionCell item={e} type="expert" />
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div" count={experts.length} page={expertPage}
          rowsPerPage={ROWS_PER_PAGE} rowsPerPageOptions={[ROWS_PER_PAGE]}
          onPageChange={(_, p) => setExpertPage(p)}
        />
      </TableContainer>
    </Box>
  );

  const renderBGEGroups = () => (
    <Box>
      <SectionHeader title="BGE Groups" subtitle="Organise experts into teams">
        <Button variant="contained" startIcon={<Add />} size="small" onClick={() => setGroupDialog(true)}>
          New Group
        </Button>
      </SectionHeader>

      <Grid container spacing={2}>
        {bgeGroups.length === 0 ? (
          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
              No BGE groups yet. Create one to start organising experts.
            </Paper>
          </Grid>
        ) : bgeGroups.map(group => (
          <Grid item xs={12} md={6} lg={4} key={group.id}>
            <Card variant="outlined">
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>{group.name}</Typography>
                    {group.description && <Typography variant="caption" color="text.secondary">{group.description}</Typography>}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Manage members">
                      <IconButton size="small" onClick={() => setManageGroupItem(group)}><People fontSize="small" /></IconButton>
                    </Tooltip>
                    {isAdmin && (
                      <Tooltip title="Assign MSMEs">
                        <IconButton size="small" onClick={() => openAssignMsmeDialog(group)}>
                          <Assignment fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {isStaff && (
                      <Tooltip title="Delete group">
                        <IconButton size="small" color="error" onClick={() => { setDeleteItem(group); setDeleteType('group'); }}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                  <Chip size="small" icon={<People sx={{ fontSize: 14 }} />}
                        label={`${group.member_count} member${group.member_count !== 1 ? 's' : ''}`} />
                  <Chip size="small" icon={<Business sx={{ fontSize: 14 }} />}
                        label={`${msmes.filter(m => m.assigned_group === group.id).length} MSMEs`}
                        color="primary" variant="outlined" />
                  {group.team_lead_name && (
                    <Chip size="small" icon={<Star sx={{ fontSize: 14 }} />}
                          label={`Lead: ${group.team_lead_name}`}
                          color="warning" variant="outlined" />
                  )}
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {group.members_detail?.slice(0, 5).map(m => (
                    <Chip key={m.id} avatar={<Avatar sx={{ fontSize: 10 }}>{(m.name || '?')[0]}</Avatar>} label={m.name} size="small" />
                  ))}
                  {group.member_count > 5 && <Chip label={`+${group.member_count - 5} more`} size="small" variant="outlined" />}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );

  const renderCohorts = () => (
    <Box>
      <SectionHeader title="Cohorts" subtitle="Group MSMEs by programme cohort">
        <Button variant="contained" startIcon={<Add />} size="small" onClick={() => setCohortDialog(true)}>
          New Cohort
        </Button>
      </SectionHeader>

      <Grid container spacing={2}>
        {cohorts.length === 0 ? (
          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>No cohorts yet.</Paper>
          </Grid>
        ) : cohorts.map(c => (
          <Grid item xs={12} sm={6} md={4} key={c.id}>
            <Card
              variant="outlined"
              sx={{ cursor: 'pointer', '&:hover': { boxShadow: 2 } }}
              onClick={() => { setFilterCohort(c.id); startTransition(() => setSection('msmes')); }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>{c.name}</Typography>
                    {c.description && <Typography variant="caption" color="text.secondary">{c.description}</Typography>}
                  </Box>
                  {isAdmin && (
                    <IconButton size="small" color="error"
                      onClick={ev => { ev.stopPropagation(); setDeleteItem(c); setDeleteType('cohort'); }}
                    ><Delete fontSize="small" /></IconButton>
                  )}
                </Box>
                <Divider sx={{ my: 1.5 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="h4" fontWeight={700} color="primary">{c.msme_count}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                    <Typography variant="body2">MSMEs</Typography>
                    <ChevronRight fontSize="small" />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );

  const renderTraining = () => (
    <Box>
      {/* ── Training Sessions ── */}
      <SectionHeader title="Training Sessions" subtitle={`${trainingSessions.length} sessions`}>
        <Button variant="contained" startIcon={<Add />} size="small" onClick={() => { setSessionEditing(null); setSessionForm(EMPTY_SESSION_FORM); setSessionDialog(true); }}>
          New Session
        </Button>
      </SectionHeader>

      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520, overflowY: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: '#f5f5f5', fontWeight: 600 }}>Title</TableCell>
              <TableCell sx={{ bgcolor: '#f5f5f5', fontWeight: 600 }}>Date</TableCell>
              <TableCell sx={{ bgcolor: '#f5f5f5', fontWeight: 600 }}>Lead BGE</TableCell>
              <TableCell sx={{ bgcolor: '#f5f5f5', fontWeight: 600 }}>Mentors</TableCell>
              <TableCell sx={{ bgcolor: '#f5f5f5', fontWeight: 600 }}>MSMEs</TableCell>
              <TableCell sx={{ bgcolor: '#f5f5f5', fontWeight: 600 }}>Attendance</TableCell>
              <TableCell sx={{ bgcolor: '#f5f5f5', fontWeight: 600 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginate(trainingSessions, sessionPage).length === 0 ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>No sessions yet</TableCell></TableRow>
            ) : paginate(trainingSessions, sessionPage).map(s => (
              <TableRow key={s.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{s.title}</TableCell>
                <TableCell>{s.date}</TableCell>
                <TableCell>{(s.team || []).find(m => m.role === 'lead')?.bge_name || '—'}</TableCell>
                <TableCell>
                  {(s.team || []).filter(m => m.role === 'mentor').length > 0
                    ? <Chip label={`${(s.team || []).filter(m => m.role === 'mentor').length} mentor${(s.team || []).filter(m => m.role === 'mentor').length !== 1 ? 's' : ''}`} size="small" color="secondary" />
                    : <Typography variant="caption" color="text.secondary">—</Typography>}
                </TableCell>
                <TableCell>
                  {(s.businesses_detail || []).length > 0
                    ? <Chip label={`${s.businesses_detail.length} MSME${s.businesses_detail.length !== 1 ? 's' : ''}`} size="small" color="info" />
                    : <Typography variant="caption" color="text.secondary">—</Typography>}
                </TableCell>
                <TableCell><Chip icon={<EventNote />} label={`${s.attendance_count ?? 0} present`} size="small" /></TableCell>
                <TableCell>
                  <Tooltip title="Edit session">
                    <IconButton size="small" onClick={() => openSessionEdit(s)}><Edit fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title={`Notify ${(s.businesses_detail || []).length} MSME${(s.businesses_detail || []).length !== 1 ? 's' : ''} by email`}>
                    <span>
                      <IconButton size="small" color="secondary" disabled={!(s.businesses_detail || []).length}
                        onClick={() => openSessionNotify(s)}>
                        <Email fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Mark attendance">
                    <IconButton size="small" color="primary" onClick={() => openAttendance(s)}><CheckCircle fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete session">
                    <IconButton size="small" color="error" onClick={() => deleteSession(s)}><Delete fontSize="small" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div" count={trainingSessions.length} page={sessionPage}
          rowsPerPage={ROWS_PER_PAGE} rowsPerPageOptions={[ROWS_PER_PAGE]}
          onPageChange={(_, p) => setSessionPage(p)}
        />
      </TableContainer>
    </Box>
  );

  // Brand-aligned palette for charts
  const CHART_PALETTE = [
    '#1A2F4B', '#C8102E', '#2E7D32', '#F9A825', '#0288D1',
    '#7B1FA2', '#5D4037', '#00897B', '#FF6F00', '#3949AB',
  ];

  // Drill-down filter state for the analytics page
  const [analyticsFilter, setAnalyticsFilter] = useState({
    cohort: '', district: '', sector: '', bge: '',
  });
  const [richAnalytics, setRichAnalytics] = useState(null);
  const [analyticTab, setAnalyticTab] = useState(0);

  // ── growth snapshots (admin view) ─────────────────────────────────────────
  const [adminSnapshots, setAdminSnapshots] = useState([]);
  const [adminSnapshotsLoading, setAdminSnapshotsLoading] = useState(false);
  const [msmeDetailTab, setMsmeDetailTab] = useState(0);
  const [snapshotFilterBge, setSnapshotFilterBge] = useState('');
  const [snapshotFilterSource, setSnapshotFilterSource] = useState('');
  const [snapshotPage, setSnapshotPage] = useState(0);
  const [viewSnapshot, setViewSnapshot] = useState(null);

  // Fetch all growth snapshots for the admin view (MSMEs table + analytics + reports).
  // Runs once on mount and whenever section switches to msmes/analytics/reports.
  useEffect(() => {
    if (!token) return;
    if (section !== 'msmes' && section !== 'analytics' && section !== 'reports') return;
    setAdminSnapshotsLoading(true);
    axios.get(API_ENDPOINTS.GROWTH_SNAPSHOTS, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : (r.data.results || []);
        setAdminSnapshots(data);
      })
      .catch(err => {
        if (!axios.isCancel(err)) console.error('Failed to load growth snapshots:', err);
      })
      .finally(() => setAdminSnapshotsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, section]);

  // Refetch analytics whenever the filter changes — debounced + cancellable.
  // Without this the page fired a request on every Select change and a slow
  // response could overwrite a fresher one.
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      const params = new URLSearchParams();
      Object.entries(analyticsFilter).forEach(([k, v]) => { if (v) params.append(k, v); });
      try {
        const r = await axios.get(
          `${API_ENDPOINTS.MSMES}analytics/?${params}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
        );
        setRichAnalytics(r.data || null);
      } catch (e) {
        if (!axios.isCancel(e) && e.name !== 'CanceledError') {
          // Drop back to the unfiltered baseline so charts don't blank out
          setRichAnalytics(null);
        }
      }
    }, 250);
    return () => { clearTimeout(handle); controller.abort(); };
  }, [token, analyticsFilter]);

  // Prefer the filtered payload, else the baseline `analytics` state, else
  // an empty object so chart components don't crash on undefined.
  const A = (richAnalytics && Object.keys(richAnalytics).length > 0)
    ? richAnalytics
    : (analytics || {});

  // Helper: convert a [{key:value, count}] list into recharts shape
  const pieData = (rows, labelKey) =>
    (rows || []).map(r => ({ name: r[labelKey] || 'Unspecified', value: r.count }));

  const DiagnosticImporter = ({ token: tok, onImported, isAdmin: admin }) => {
    const [file, setFile] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [result, setResult] = React.useState(null);
    const [error, setError] = React.useState(null);
    const doImport = () => {
      if (!file) return;
      setLoading(true); setResult(null); setError(null);
      const fd = new FormData(); fd.append('file', file);
      axios.post(`${API_ENDPOINTS.MSMES}import-diagnostics/`, fd,
        { headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'multipart/form-data' } })
        .then(r => { setResult(r.data.detail); setLoading(false); onImported(); })
        .catch(e => {
          const data = e.response?.data;
          setError(data?.error || data?.detail || JSON.stringify(data) || `HTTP ${e.response?.status}: Import failed`);
          setLoading(false);
        });
    };
    if (!admin) return (
      <Alert severity="info">No diagnostic baseline data yet. Contact an admin to import the diagnostics Excel.</Alert>
    );
    return (
      <Box sx={{ p: 3, border: '1px dashed #ccc', borderRadius: 2, maxWidth: 480 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>Import Diagnostic Baseline</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload the <em>PRUDEV_II_MSMEs_Categorized_Output.xlsx</em> file to populate the diagnostic dashboard.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="outlined" component="label" size="small">
            {file ? file.name : 'Choose Excel file'}
            <input type="file" hidden accept=".xlsx,.xls" onChange={e => setFile(e.target.files[0])} />
          </Button>
          <Button variant="contained" size="small" disabled={!file || loading} onClick={doImport}>
            {loading ? 'Importing…' : 'Import'}
          </Button>
        </Box>
        {result && <Alert severity="success" sx={{ mt: 2 }}><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{result}</pre></Alert>}
        {error  && <Alert severity="error"   sx={{ mt: 2 }}><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 200, overflow: 'auto' }}>{error}</pre></Alert>}
      </Box>
    );
  };

  const renderAnalytics = () => {
    const monthlyData = (A.time_series || []).map(t => ({
      month: t.month ? new Date(t.month).toLocaleString('en', { month: 'short', year: '2-digit' }) : '?',
      MSMEs: t.count,
    }));
    // ── shared sub-components ────────────────────────────────────────────────
    const KPI = ({ val, label, sub, color = BRAND.primaryMain, pct }) => (
      <Card sx={{ height: '100%', borderLeft: `4px solid ${color}` }} variant="outlined">
        <CardContent sx={{ pb: '12px !important', pt: '14px !important' }}>
          <Typography variant="h5" fontWeight={800} color={color}>{val}</Typography>
          <Typography variant="body2" fontWeight={600} sx={{ mt: 0.25 }}>{label}</Typography>
          {sub  && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
          {pct != null && (
            <Box sx={{ mt: 0.75 }}>
              <LinearProgress variant="determinate" value={Math.min(pct, 100)}
                sx={{ height: 5, borderRadius: 3, bgcolor: '#E8EDF2', '& .MuiLinearProgress-bar': { bgcolor: color } }} />
              <Typography variant="caption" color="text.secondary">{pct.toFixed(0)}%</Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    );
    const ChartCard = ({ title, subtitle, children, height = 260, action }) => (
      <Card variant="outlined" sx={{ height: '100%' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
              {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
            </Box>
            {action}
          </Box>
          <Box sx={{ width: '100%', height }}>{children}</Box>
        </CardContent>
      </Card>
    );
    const SectionLabel = ({ children }) => (
      <Typography variant="overline" color="text.secondary" fontWeight={700}
        sx={{ display: 'block', mb: 1, mt: 0.5, letterSpacing: 1.2 }}>{children}</Typography>
    );
    const ComplianceStat = ({ label, count, total, color }) => (
      <Box sx={{ mb: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
          <Typography variant="body2">{label}</Typography>
          <Typography variant="body2" fontWeight={700} color={color}>
            {count} <Typography component="span" variant="caption" color="text.secondary">/ {total}</Typography>
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={total ? (count / total) * 100 : 0}
          sx={{ height: 8, borderRadius: 4, bgcolor: '#E8EDF2', '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 4 } }} />
      </Box>
    );

    const totalMsmes = A.total_msmes || 0;
    const diagTotal  = A.diag_total  || 0;
    const dropFilters = () => setAnalyticsFilter({ cohort: '', district: '', sector: '', bge: '' });
    const hasFilters = !!(analyticsFilter.cohort || analyticsFilter.district || analyticsFilter.sector || analyticsFilter.bge);

    // Band sort order for turnover/assets charts
    const bandOrder = ['Up to 10 million UGX', '10 – 100 million UGX', '100 – 360 million UGX', 'More than 360 million UGX'];
    const shortBand = s => (s || '').replace(' million UGX','M').replace('More than ','> ').replace('Up to ','< ').trim();
    const turnoverData = [...(A.diag_turnover_bands || [])].sort((a,b)=>bandOrder.indexOf(a.diag_annual_turnover)-bandOrder.indexOf(b.diag_annual_turnover)).map(b=>({name:shortBand(b.diag_annual_turnover),count:b.count}));
    const assetData    = [...(A.diag_asset_bands    || [])].sort((a,b)=>bandOrder.indexOf(a.diag_total_assets   )-bandOrder.indexOf(b.diag_total_assets   )).map(b=>({name:shortBand(b.diag_total_assets),    count:b.count}));

    return (
      <Box>
        <SectionHeader title="Analytics" subtitle="Programme intelligence dashboard" />

        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>FILTER</Typography>
              <FormControl size="small" sx={{ flex: '1 1 120px', minWidth: 0 }}>
                <InputLabel>Cohort</InputLabel>
                <Select label="Cohort" value={analyticsFilter.cohort}
                  onChange={e => setAnalyticsFilter(f => ({ ...f, cohort: e.target.value }))}>
                  <MenuItem value="">All</MenuItem>
                  {cohorts.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: '1 1 120px', minWidth: 0 }}>
                <InputLabel>District</InputLabel>
                <Select label="District" value={analyticsFilter.district}
                  onChange={e => setAnalyticsFilter(f => ({ ...f, district: e.target.value }))}>
                  <MenuItem value="">All</MenuItem>
                  {(A.top_districts || []).map(d => <MenuItem key={d.state} value={d.state}>{d.state}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: '1 1 120px', minWidth: 0 }}>
                <InputLabel>Sector</InputLabel>
                <Select label="Sector" value={analyticsFilter.sector}
                  onChange={e => setAnalyticsFilter(f => ({ ...f, sector: e.target.value }))}>
                  <MenuItem value="">All</MenuItem>
                  {(A.sector_stats || []).map(s => <MenuItem key={s.sector} value={s.sector}>{s.sector}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: '1 1 140px', minWidth: 0 }}>
                <InputLabel>BGE</InputLabel>
                <Select label="BGE" value={analyticsFilter.bge}
                  onChange={e => setAnalyticsFilter(f => ({ ...f, bge: e.target.value }))}>
                  <MenuItem value="">All</MenuItem>
                  {experts.map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
                </Select>
              </FormControl>
              {hasFilters && <Button size="small" onClick={dropFilters}>Clear</Button>}
              {hasFilters && <Chip size="small" label="Filtered view" color="warning" variant="outlined" />}
            </Box>
          </CardContent>
        </Card>

        {/* ── Tab navigation ──────────────────────────────────────────────── */}
        <Paper variant="outlined" sx={{ mb: 2 }}>
          <Tabs value={analyticTab} onChange={(_, v) => setAnalyticTab(v)}
            textColor="primary" indicatorColor="primary" variant="scrollable" scrollButtons="auto">
            <Tab label="Programme Health"  />
            <Tab label="Growth & Impact"   />
            <Tab label="Operations"        />
            <Tab label="Business Profiles" />
            <Tab label="Data Updates"      />
          </Tabs>
        </Paper>

        {/* ════════════════════════════════════════════════════════════════
            TAB 0 — Overview
            ════════════════════════════════════════════════════════════════ */}
        {analyticTab === 0 && (
          <Box>
            {/* ── Programme context banner ── */}
            <Box sx={{ mb: 2.5, p: 2, bgcolor: '#F0F4FA', borderRadius: 2, borderLeft: `4px solid ${BRAND.primaryMain}` }}>
              <Typography variant="subtitle2" fontWeight={700} color={BRAND.primaryMain} gutterBottom>
                About PRUDEV II
              </Typography>
              <Typography variant="body2" color="text.secondary">
                PRUDEV II is a GIZ-funded business growth programme that enrols micro and small enterprises (MSMEs),
                assigns Business Growth Experts (BGEs) to coach them, and tracks progress through a series of
                field visits and growth updates. This dashboard shows the programme at a glance — use the other
                tabs to explore growth impact, operations performance, and the business baseline.
              </Typography>
            </Box>

            {/* ── Headline numbers ── */}
            <SectionLabel>Programme at a Glance</SectionLabel>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {[
                { val: totalMsmes,                                          label: 'MSMEs Enrolled',    sub: 'in filtered view',   color: BRAND.primaryMain },
                { val: A.total_bges || experts.length,                      label: 'BGE Experts',       sub: 'coaches in field',   color: BRAND.gizRed },
                { val: A.total_groups || 0,                                 label: 'BGE Groups',        sub: 'active teams',       color: '#0288D1' },
                { val: (A.total_reports||0)+(A.total_group_reports||0),     label: 'Reports Filed',     sub: 'MSME + group visits', color: '#2E7D32' },
                { val: A.total_employees || 0,                              label: 'Total Employees',   sub: 'from latest data updates', color: '#5D4037' },
                { val: fmt(A.total_annual_revenue),                         label: 'Total Revenue',     sub: 'self-reported',      color: '#7B1FA2' },
              ].map((k, i) => <Grid item xs={6} sm={4} lg={2} key={i}><KPI {...k} /></Grid>)}
            </Grid>

            {/* ── Attention required ── */}
            {(() => {
              if (adminSnapshotsLoading) return null;
              if (!adminSnapshots.length) return null;
              const now2 = new Date();
              const latB = {};
              adminSnapshots.forEach(s => {
                const cur = latB[s.msme];
                if (!cur || s.snapshot_date > cur.snapshot_date) latB[s.msme] = s;
              });
              const allLatest = Object.values(latB);
              const stale90 = allLatest.filter(s => (now2 - new Date(s.snapshot_date)) / 86400000 > 90);
              const firstB = {};
              adminSnapshots.forEach(s => {
                const cur = firstB[s.msme];
                if (!cur || s.snapshot_date < cur.snapshot_date) firstB[s.msme] = s;
              });
              const declining = allLatest.filter(s => {
                const f = firstB[s.msme];
                return f && f.id !== s.id &&
                  Number(f.annual_turnover) > 0 && Number(s.annual_turnover) > 0 &&
                  Number(s.annual_turnover) < Number(f.annual_turnover);
              });
              const zeroComp = allLatest.filter(s =>
                !s.has_tin && !s.has_ursb && !s.has_business_bank && !s.has_mobile_money && !s.has_sacco
              );
              const noUpdate = msmes.filter(m => !latB[m.id]);
              const attentionItems = [
                { count: stale90.length,   label: 'No update in 90+ days',   sub: 'BGE visit overdue',         color: '#E65100', severity: 'warning' },
                { count: noUpdate.length,  label: 'Never updated',           sub: 'no growth data at all',     color: '#C8102E', severity: 'error' },
                { count: declining.length, label: 'Declining revenue',       sub: 'latest < first update',     color: '#B71C1C', severity: 'error' },
                { count: zeroComp.length,  label: 'Zero compliance items',   sub: 'no TIN, URSB, Bank or SACCO', color: '#827717', severity: 'warning' },
              ].filter(a => a.count > 0);
              if (!attentionItems.length) return (
                <Alert severity="success" sx={{ mb: 3 }}>
                  All MSMEs with growth data are up-to-date and at least one compliance item is ticked.
                </Alert>
              );
              return (
                <>
                  <SectionLabel>Action Required</SectionLabel>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    {attentionItems.map((a, i) => (
                      <Grid item xs={12} sm={6} md={3} key={i}>
                        <Card variant="outlined" sx={{ borderLeft: `4px solid ${a.color}`, height: '100%' }}>
                          <CardContent sx={{ py: '14px !important' }}>
                            <Typography variant="h4" fontWeight={800} color={a.color}>{a.count}</Typography>
                            <Typography variant="body2" fontWeight={700}>{a.label}</Typography>
                            <Typography variant="caption" color="text.secondary">{a.sub}</Typography>
                            <Box sx={{ mt: 1 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                → See Growth &amp; Impact tab for details
                              </Typography>
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </>
              );
            })()}

            {/* ── Enrolment trend & cohort ── */}
            <SectionLabel>Enrolment Over Time</SectionLabel>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={8}>
                <ChartCard title="MSMEs Onboarded Over Time" subtitle="Monthly additions — all cohorts" height={260}>
                  <ResponsiveContainer>
                    <AreaChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                      <XAxis dataKey="month" tick={{fontSize:11}}/>
                      <YAxis tick={{fontSize:11}}/>
                      <ReTooltip/>
                      <Area type="monotone" dataKey="MSMEs" stroke="#1A2F4B" fill="#1A2F4B" fillOpacity={0.18} strokeWidth={2}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={4}>
                <ChartCard title="By Cohort" subtitle="Enrolment per cohort" height={260}>
                  <ResponsiveContainer>
                    <BarChart data={(A.cohort_stats||[]).map(c=>({name:c.cohort__name||'Unassigned',count:c.count}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                      <XAxis dataKey="name" tick={{fontSize:10}}/>
                      <YAxis tick={{fontSize:11}}/>
                      <ReTooltip/>
                      <Bar dataKey="count" fill="#C8102E" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
            </Grid>

            {/* ── Quick sector + gender split ── */}
            <SectionLabel>Who Is in the Programme?</SectionLabel>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <ChartCard title="Business Type" subtitle="Scale of enrolled MSMEs" height={240}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData(A.business_type_stats, 'business_type')} dataKey="value" nameKey="name"
                           outerRadius={80} label={({ name, percent }) => `${(percent*100).toFixed(0)}%`}>
                        {(A.business_type_stats||[]).map((_,i)=><Cell key={i} fill={CHART_PALETTE[i%CHART_PALETTE.length]}/>)}
                      </Pie>
                      <ReTooltip /><Legend wrapperStyle={{fontSize:11}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={4}>
                <ChartCard title="Sector" subtitle="Industry distribution" height={240}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData(A.sector_stats, 'sector')} dataKey="value" nameKey="name"
                           innerRadius={45} outerRadius={80} paddingAngle={2}>
                        {(A.sector_stats||[]).map((_,i)=><Cell key={i} fill={CHART_PALETTE[(i+2)%CHART_PALETTE.length]}/>)}
                      </Pie>
                      <ReTooltip /><Legend wrapperStyle={{fontSize:11}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={4}>
                <ChartCard title="Owner Gender" subtitle="Founder demographics" height={240}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData(A.gender_stats, 'gender')} dataKey="value" nameKey="name"
                           innerRadius={45} outerRadius={80}>
                        {(A.gender_stats||[]).map((_,i)=><Cell key={i} fill={['#1A2F4B','#C8102E','#999'][i%3]}/>)}
                      </Pie>
                      <ReTooltip /><Legend wrapperStyle={{fontSize:11}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 3 — Business Profiles (was Diagnostic)
            ════════════════════════════════════════════════════════════════ */}
        {analyticTab === 3 && (
          <Box>
            {diagTotal === 0 ? (
              <DiagnosticImporter token={token} onImported={() => {
                axios.get(`${API_ENDPOINTS.MSMES}analytics/`, { headers: { Authorization: `Token ${token}` } })
                  .then(r => setAnalytics(r.data))
                  .catch(err => console.warn('Analytics refresh failed after import:', err));
              }} isAdmin={isAdmin} />
            ) : (
              <>
                <SectionLabel>Baseline Summary — {diagTotal} MSMEs with diagnostic data</SectionLabel>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  {[
                    { val: A.diag_green?.green||0,                                                                   label:'Green Businesses',   sub:`${diagTotal?(((A.diag_green?.green||0)/diagTotal*100).toFixed(0)):'0'}% of total`,  color:'#2E7D32', pct:diagTotal?((A.diag_green?.green||0)/diagTotal*100):0 },
                    { val: A.diag_compliance?.has_tin||0,                                                            label:'Have TIN',            sub:'Tax ID registered',   color:'#1565C0', pct:diagTotal?((A.diag_compliance?.has_tin||0)/diagTotal*100):0 },
                    { val: A.diag_compliance?.has_business_bank||0,                                                  label:'Business Bank Acct',  sub:'Financial access',    color:'#00695C', pct:diagTotal?((A.diag_compliance?.has_business_bank||0)/diagTotal*100):0 },
                    { val: A.diag_compliance?.has_unbs||0,                                                           label:'UNBS Registered',     sub:'Product standard',    color:'#4527A0', pct:diagTotal?((A.diag_compliance?.has_unbs||0)/diagTotal*100):0 },
                    { val:(A.diag_employees?.ft_male||0)+(A.diag_employees?.ft_female||0),                          label:'Full-time Staff',      sub:'Total at baseline',   color:'#5D4037' },
                    { val:(A.diag_employees?.pt_male||0)+(A.diag_employees?.pt_female||0),                          label:'Part-time Staff',      sub:'Total at baseline',   color:'#827717' },
                  ].map((k,i)=><Grid item xs={6} md={4} lg={2} key={i}><KPI {...k}/></Grid>)}
                </Grid>

                <SectionLabel>Compliance & Financial Access</SectionLabel>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardContent>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>Compliance Rates</Typography>
                        <ComplianceStat label="Has TIN (Tax ID)"            count={A.diag_compliance?.has_tin||0}           total={diagTotal} color="#1565C0"/>
                        <ComplianceStat label="Registered with UNBS"        count={A.diag_compliance?.has_unbs||0}          total={diagTotal} color="#4527A0"/>
                        <ComplianceStat label="Has Business Bank Account"   count={A.diag_compliance?.has_business_bank||0} total={diagTotal} color="#00695C"/>
                        <ComplianceStat label="Has Mobile Money Account"    count={A.diag_compliance?.has_mobile_money||0}  total={diagTotal} color="#E65100"/>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <ChartCard title="Green vs Non-Green" subtitle="Green business classification" height={220}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={[{name:'Green',value:A.diag_green?.green||0},{name:'Non-Green',value:A.diag_green?.non_green||0}]}
                               dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
                            <Cell fill="#2E7D32"/><Cell fill="#CFD8DC"/>
                          </Pie>
                          <ReTooltip/><Legend wrapperStyle={{fontSize:11}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </Grid>
                </Grid>

                <SectionLabel>Revenue & Assets (Self-Reported Bands)</SectionLabel>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={6}>
                    <ChartCard title="Annual Turnover Bands" subtitle="Total sales last 12 months (UGX)" height={220}>
                      <ResponsiveContainer>
                        <BarChart data={turnoverData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                          <XAxis dataKey="name" tick={{fontSize:10}}/>
                          <YAxis tick={{fontSize:11}}/>
                          <ReTooltip/>
                          <Bar dataKey="count" fill="#0288D1" radius={[4,4,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <ChartCard title="Total Assets Bands" subtitle="Investment in assets (UGX)" height={220}>
                      <ResponsiveContainer>
                        <BarChart data={assetData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                          <XAxis dataKey="name" tick={{fontSize:10}}/>
                          <YAxis tick={{fontSize:11}}/>
                          <ReTooltip/>
                          <Bar dataKey="count" fill="#00695C" radius={[4,4,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </Grid>
                </Grid>

                <SectionLabel>Workforce & Business Maturity</SectionLabel>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={4}>
                    <ChartCard title="Workforce by Type & Gender" subtitle="Full-time vs part-time" height={220}>
                      <ResponsiveContainer>
                        <BarChart data={[
                          {name:'Full-time', Male:A.diag_employees?.ft_male||0, Female:A.diag_employees?.ft_female||0},
                          {name:'Part-time', Male:A.diag_employees?.pt_male||0, Female:A.diag_employees?.pt_female||0},
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                          <XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/>
                          <ReTooltip/><Legend wrapperStyle={{fontSize:11}}/>
                          <Bar dataKey="Male"   stackId="a" fill="#1A2F4B"/>
                          <Bar dataKey="Female" stackId="a" fill="#C8102E" radius={[4,4,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <ChartCard title="Years in Business" subtitle="Business maturity distribution" height={220}>
                      <ResponsiveContainer>
                        <BarChart data={(A.diag_years_operating||[]).map(y=>({name:(y.diag_years_operating||'').trim(),count:y.count}))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                          <XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/>
                          <ReTooltip/>
                          <Bar dataKey="count" fill="#E65100" radius={[4,4,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <ChartCard title="Owner Gender (Diagnostic)" subtitle="Self-reported at application" height={220}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={(A.diag_owner_sex||[]).map(s=>({name:s.diag_owner_sex,value:s.count}))}
                               dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                            {(A.diag_owner_sex||[]).map((_,i)=><Cell key={i} fill={['#1A2F4B','#C8102E','#999'][i%3]}/>)}
                          </Pie>
                          <ReTooltip/><Legend wrapperStyle={{fontSize:11}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </Grid>
                </Grid>
              </>
            )}
          </Box>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 2 — Operations (Performance + Geography)
            ════════════════════════════════════════════════════════════════ */}
        {analyticTab === 2 && (
          <Box>
            <SectionLabel>BGE Activity</SectionLabel>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={6}>
                <ChartCard title="BGE Workload" subtitle="MSMEs assigned (direct + via group)" height={320}>
                  <ResponsiveContainer>
                    <BarChart layout="vertical"
                      data={(A.bge_workload||[]).slice(0,12).map(b=>({name:(b.bge_name||'').slice(0,20),Direct:b.direct,ViaGroup:b.via_group}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                      <XAxis type="number" tick={{fontSize:11}}/>
                      <YAxis dataKey="name" type="category" width={130} tick={{fontSize:10}}/>
                      <ReTooltip/><Legend wrapperStyle={{fontSize:11}}/>
                      <Bar dataKey="Direct"   stackId="a" fill="#1A2F4B"/>
                      <Bar dataKey="ViaGroup" stackId="a" fill="#C8102E" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={6}>
                <ChartCard title="BGE Pipeline" subtitle="Approval funnel" height={320}>
                  <ResponsiveContainer>
                    <BarChart data={(A.bge_status_stats||[]).map(s=>({name:s.status,count:s.count}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                      <XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/>
                      <ReTooltip/>
                      <Bar dataKey="count" radius={[4,4,0,0]}>
                        {(A.bge_status_stats||[]).map((s,i)=>(
                          <Cell key={i} fill={s.status==='approved'?'#2E7D32':s.status==='pending'?'#F9A825':'#C8102E'}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
            </Grid>

            <SectionLabel>Group Performance</SectionLabel>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12}>
                <ChartCard title="Groups — MSMEs & Reports" subtitle="Performance per BGE group" height={280}>
                  <ResponsiveContainer>
                    <BarChart data={(A.group_stats||[]).slice(0,12).map(g=>({name:(g.group_name||'').slice(0,18),MSMEs:g.msme_count,Reports:g.reports_count}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                      <XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/>
                      <ReTooltip/><Legend wrapperStyle={{fontSize:11}}/>
                      <Bar dataKey="MSMEs"   fill="#1A2F4B" radius={[4,4,0,0]}/>
                      <Bar dataKey="Reports" fill="#2E7D32" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
            </Grid>

            <SectionLabel>Report Pipeline</SectionLabel>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <ChartCard title="MSME Reports — by status" subtitle={`${A.total_reports||0} reports total`} height={220}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData(A.report_status_stats,'status')} dataKey="value" nameKey="name" outerRadius={70}>
                        {(A.report_status_stats||[]).map((s,i)=>(
                          <Cell key={i} fill={s.status==='submitted'?'#1A2F4B':s.status==='reviewed'?'#2E7D32':'#C8102E'}/>
                        ))}
                      </Pie>
                      <ReTooltip/><Legend wrapperStyle={{fontSize:11}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={6}>
                <ChartCard title="Group Reports — by status" subtitle={`${A.total_group_reports||0} group reports total`} height={220}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData(A.group_report_status_stats,'status')} dataKey="value" nameKey="name" outerRadius={70}>
                        {(A.group_report_status_stats||[]).map((s,i)=>(
                          <Cell key={i} fill={s.status==='submitted'?'#1A2F4B':s.status==='approved'?'#2E7D32':'#C8102E'}/>
                        ))}
                      </Pie>
                      <ReTooltip/><Legend wrapperStyle={{fontSize:11}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
            </Grid>
            {/* ── Geography (merged into Operations) ── */}
            <SectionLabel>Geographic Distribution</SectionLabel>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={6}>
                <ChartCard title="Districts (Diagnostic)" subtitle="From application forms — most complete coverage" height={340}>
                  <ResponsiveContainer>
                    <BarChart layout="vertical"
                      data={(A.diag_districts||[]).map(d=>({name:d.diag_district,count:d.count}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                      <XAxis type="number" tick={{fontSize:11}}/>
                      <YAxis dataKey="name" type="category" width={110} tick={{fontSize:11}}/>
                      <ReTooltip/>
                      <Bar dataKey="count" fill="#4527A0" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={6}>
                <ChartCard title="Districts (MSME Profile)" subtitle="From system registration" height={340}>
                  <ResponsiveContainer>
                    <BarChart layout="vertical"
                      data={(A.top_districts||[]).map(d=>({name:d.state,count:d.count}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                      <XAxis type="number" tick={{fontSize:11}}/>
                      <YAxis dataKey="name" type="category" width={110} tick={{fontSize:11}}/>
                      <ReTooltip/>
                      <Bar dataKey="count" fill="#1A2F4B" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={6}>
                <ChartCard title="Top Cities" subtitle="MSME concentration by city" height={280}>
                  <ResponsiveContainer>
                    <BarChart layout="vertical"
                      data={(A.top_cities||[]).map(d=>({name:d.city,count:d.count}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                      <XAxis type="number" tick={{fontSize:11}}/>
                      <YAxis dataKey="name" type="category" width={100} tick={{fontSize:11}}/>
                      <ReTooltip/>
                      <Bar dataKey="count" fill="#0288D1" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 1 — Growth & Impact (was Growth Data, Tab 4)
            ════════════════════════════════════════════════════════════════ */}
        {analyticTab === 1 && (() => {
          if (adminSnapshotsLoading) return <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Box>;
          if (!adminSnapshots.length) return (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <TrendingUp sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">No growth update data yet.</Typography>
              <Typography variant="body2" color="text.secondary">BGEs need to fill in "Record Growth Update" for their MSMEs before analytics appear here.</Typography>
            </Box>
          );
          /* ── print CSS injected once ──────────────────────────────── */
          if (!document.getElementById('prudev2-print-css')) {
            const s = document.createElement('style');
            s.id = 'prudev2-print-css';
            s.textContent = `@media print{body>*{display:none!important}.prudev2-printable{display:block!important;position:fixed;top:0;left:0;width:100%;background:#fff;z-index:99999;padding:24px}}`;
            document.head.appendChild(s);
          }

          // ── Core data derivations ─────────────────────────────────────────
          const firstByMsme = {};
          const latestByMsme = {};
          adminSnapshots.forEach(s => {
            const cur = firstByMsme[s.msme];
            if (!cur || s.snapshot_date < cur.snapshot_date || (s.snapshot_date === cur.snapshot_date && s.id < cur.id))
              firstByMsme[s.msme] = s;
            const lat = latestByMsme[s.msme];
            if (!lat || s.snapshot_date > lat.snapshot_date || (s.snapshot_date === lat.snapshot_date && s.id > lat.id))
              latestByMsme[s.msme] = s;
          });
          const msmeIds = Object.keys(latestByMsme).map(Number);
          const latestList = msmeIds.map(id => ({ ...latestByMsme[id], _first: firstByMsme[id] }))
            .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
          const paired = latestList.filter(s => s._first && s._first.id !== s.id);

          // ── Helpers ───────────────────────────────────────────────────────
          const fmtUGX = v => v == null || v === '' ? '—' : `UGX ${Number(v).toLocaleString()}`;
          const compFields = [
            { label: 'URSB',         key: 'has_ursb',          color: '#4527A0' },
            { label: 'TIN',          key: 'has_tin',           color: '#1565C0' },
            { label: 'Bank Account', key: 'has_business_bank', color: '#00695C' },
            { label: 'Mobile Money', key: 'has_mobile_money',  color: '#E65100' },
            { label: 'MOMO Pay',     key: 'has_momo_pay',      color: '#F57C00' },
            { label: 'SACCO',        key: 'has_sacco',         color: '#2E7D32' },
          ];
          const compBefore = (key) => paired.filter(s => s._first[key]).length;
          const compAfter  = (key) => paired.filter(s => s[key]).length;

          // ── Summary stats ─────────────────────────────────────────────────
          const withRev = latestList.filter(s => s.annual_turnover);
          const withRevFirst = paired.filter(s => Number(s._first.annual_turnover) > 0 && Number(s.annual_turnover) > 0);
          const avgRevBefore = withRevFirst.length
            ? withRevFirst.reduce((a,s) => a+Number(s._first.annual_turnover), 0) / withRevFirst.length : 0;
          const avgRevAfter  = withRevFirst.length
            ? withRevFirst.reduce((a,s) => a+Number(s.annual_turnover), 0) / withRevFirst.length : 0;
          const avgRevLatest = withRev.length
            ? withRev.reduce((a,x) => a+Number(x.annual_turnover), 0) / withRev.length : 0;
          const totalRevGrowth = withRevFirst.reduce((acc, s) =>
            acc + (Number(s.annual_turnover) - Number(s._first.annual_turnover)), 0);
          const pctRevGrowth = withRevFirst.length
            ? ((withRevFirst.reduce((a,s) =>
                a + (Number(s.annual_turnover)/Number(s._first.annual_turnover)-1), 0)
              / withRevFirst.length) * 100).toFixed(0)
            : null;

          const totalStaffBefore = paired.reduce((a,s) =>
            a + (s._first.employees_ft_male||0)+(s._first.employees_ft_female||0)
              + (s._first.employees_pt_male||0)+(s._first.employees_pt_female||0), 0);
          const totalStaffAfter  = paired.reduce((a,s) =>
            a + (s.employees_ft_male||0)+(s.employees_ft_female||0)
              + (s.employees_pt_male||0)+(s.employees_pt_female||0), 0);

          // ── Compliance counts from latest snapshots ───────────────────────
          const bankCount        = latestList.filter(s => s.has_business_bank).length;
          const momoCount        = latestList.filter(s => s.has_momo_pay).length;
          const tinCount         = latestList.filter(s => s.has_tin).length;
          const ursbCount        = latestList.filter(s => s.has_ursb).length;
          const saccoCount       = latestList.filter(s => s.has_sacco).length;
          const mobileMoneyCount = latestList.filter(s => s.has_mobile_money).length;

          // ── Diagnostic Baseline vs Growth Update comparison ───────────────
          const diagTotal = A.diag_total || 0;
          const diagComp  = A.diag_compliance || {};
          const diagEmp   = A.diag_employees  || {};

          const diagVsGrowthCompliance = [
            { metric: 'TIN',           Diagnostic: diagTotal ? Math.round((diagComp.has_tin||0)/diagTotal*100)            : 0, GrowthUpdate: latestList.length ? Math.round(tinCount/latestList.length*100)         : 0, diagRaw: diagComp.has_tin||0,            growthRaw: tinCount },
            { metric: 'Business Bank', Diagnostic: diagTotal ? Math.round((diagComp.has_business_bank||0)/diagTotal*100)  : 0, GrowthUpdate: latestList.length ? Math.round(bankCount/latestList.length*100)        : 0, diagRaw: diagComp.has_business_bank||0,  growthRaw: bankCount },
            { metric: 'Mobile Money',  Diagnostic: diagTotal ? Math.round((diagComp.has_mobile_money||0)/diagTotal*100)   : 0, GrowthUpdate: latestList.length ? Math.round(mobileMoneyCount/latestList.length*100) : 0, diagRaw: diagComp.has_mobile_money||0,   growthRaw: mobileMoneyCount },
            { metric: 'URSB/UNBS',    Diagnostic: diagTotal ? Math.round((diagComp.has_unbs||0)/diagTotal*100)            : 0, GrowthUpdate: latestList.length ? Math.round(ursbCount/latestList.length*100)        : 0, diagRaw: diagComp.has_unbs||0,           growthRaw: ursbCount },
          ];

          const diagVsGrowthEmployees = [
            { category: 'FT Male',   Diagnostic: diagEmp.ft_male||0,   GrowthUpdate: latestList.reduce((a,s) => a+(s.employees_ft_male||0),    0) },
            { category: 'FT Female', Diagnostic: diagEmp.ft_female||0, GrowthUpdate: latestList.reduce((a,s) => a+(s.employees_ft_female||0),  0) },
            { category: 'PT Male',   Diagnostic: diagEmp.pt_male||0,   GrowthUpdate: latestList.reduce((a,s) => a+(s.employees_pt_male||0),    0) },
            { category: 'PT Female', Diagnostic: diagEmp.pt_female||0, GrowthUpdate: latestList.reduce((a,s) => a+(s.employees_pt_female||0),  0) },
          ].filter(r => r.Diagnostic > 0 || r.GrowthUpdate > 0);

          // ── Employee breakdown by category (before vs after, paired only) ─
          const empCats = [
            { key: 'employees_ft_male',    label: 'FT Male'    },
            { key: 'employees_ft_female',  label: 'FT Female'  },
            { key: 'employees_pt_male',    label: 'PT Male'    },
            { key: 'employees_pt_female',  label: 'PT Female'  },
            { key: 'employees_ft_refugee', label: 'FT Refugee' },
            { key: 'employees_pt_refugee', label: 'PT Refugee' },
          ];
          const empChart = empCats.map(({ key, label }) => ({
            category: label,
            Before: paired.reduce((a, s) => a + (s._first[key]||0), 0),
            After:  paired.reduce((a, s) => a + (s[key]||0), 0),
          })).filter(r => r.Before > 0 || r.After > 0);

          const totalEmpBefore = empCats.reduce((a, { key }) =>
            a + paired.reduce((b, s) => b + (s._first[key]||0), 0), 0);
          const totalEmpAfter  = empCats.reduce((a, { key }) =>
            a + paired.reduce((b, s) => b + (s[key]||0), 0), 0);

          const now = new Date();
          const fresh = latestList.filter(s => (now - new Date(s.snapshot_date)) / 86400000 <= 30).length;

          // ── Programme summary chart data ──────────────────────────────────
          // Financial chart: avg revenue before vs after (in thousands)
          const financialChart = withRevFirst.length ? [
            { metric: 'Avg Annual Revenue (K)', Before: Math.round(avgRevBefore/1000), After: Math.round(avgRevAfter/1000) },
          ] : [];
          if (paired.length) {
            financialChart.push({ metric: 'Total Staff', Before: totalStaffBefore, After: totalStaffAfter });
          }

          // Compliance chart: before vs after % for each flag
          const complianceChart = compFields.map(({ label, key }) => ({
            metric: label,
            Before: compBefore(key),
            After: compAfter(key),
          }));

          // ── Quarterly trend ───────────────────────────────────────────────
          const currentYear = new Date().getFullYear();
          const qData = {};
          adminSnapshots.forEach(s => {
            const y = new Date(s.snapshot_date).getFullYear();
            const q = `Q${Math.floor(new Date(s.snapshot_date).getMonth()/3)+1}`;
            if (y !== currentYear && y !== currentYear - 1) return;
            const key = `${y} ${q}`;
            if (!qData[key]) qData[key] = { period: key, revenue: 0, count: 0 };
            if (s.annual_turnover) { qData[key].revenue += Number(s.annual_turnover); qData[key].count++; }
          });
          const quarterlyChart = Object.values(qData)
            .sort((a,b) => a.period.localeCompare(b.period))
            .map(q => ({ period: q.period, 'Avg Revenue (K)': q.count ? Math.round(q.revenue/q.count/1000) : 0 }));

          // ── CSV Export ────────────────────────────────────────────────────
          const exportCSV = () => {
            const rows = [
              ['MSME', 'Code', 'BGE', 'First Update', 'Latest Update', '# Updates',
               'Annual Revenue (Before)', 'Annual Revenue (After)', 'Rev Change %',
               'Last Month Revenue', 'FT Staff (Before)', 'FT Staff (After)',
               'PT Staff (Before)', 'PT Staff (After)',
               'TIN (Before)', 'TIN (After)', 'URSB (Before)', 'URSB (After)',
               'Bank (Before)', 'Bank (After)', 'SACCO (Before)', 'SACCO (After)',
               'MoMo (Before)', 'MoMo (After)', 'Bank Name'].join(','),
              ...latestList.map(s => {
                const f = s._first || {};
                const bFT = (f.employees_ft_male||0)+(f.employees_ft_female||0);
                const bPT = (f.employees_pt_male||0)+(f.employees_pt_female||0);
                const aFT = (s.employees_ft_male||0)+(s.employees_ft_female||0);
                const aPT = (s.employees_pt_male||0)+(s.employees_pt_female||0);
                const revPct = (f.annual_turnover && s.annual_turnover)
                  ? ((Number(s.annual_turnover)/Number(f.annual_turnover)-1)*100).toFixed(1)+'%' : '';
                const m = msmes.find(m => m.id === s.msme);
                return [
                  `"${s.msme_name||''}"`, m?.msme_code||'', `"${m?.assigned_bge_name||''}"`,
                  f.snapshot_date||'', s.snapshot_date,
                  adminSnapshots.filter(x => x.msme === s.msme).length,
                  f.annual_turnover||'', s.annual_turnover||'', revPct, s.last_month_revenue||'',
                  bFT, aFT, bPT, aPT,
                  f.has_tin?'Yes':'No', s.has_tin?'Yes':'No',
                  f.has_ursb?'Yes':'No', s.has_ursb?'Yes':'No',
                  f.has_business_bank?'Yes':'No', s.has_business_bank?'Yes':'No',
                  f.has_sacco?'Yes':'No', s.has_sacco?'Yes':'No',
                  f.has_mobile_money?'Yes':'No', s.has_mobile_money?'Yes':'No',
                  `"${s.bank_name||''}"`,
                ].join(',');
              }),
            ].join('\n');
            const blob = new Blob([rows], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `prudev2-growth-report-${new Date().toISOString().slice(0,10)}.csv`;
            a.click(); URL.revokeObjectURL(url);
          };

          return (
            <Box>
              {/* ── Header ── */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>Growth Analytics</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Before/after comparison · {msmeIds.length} MSMEs · {adminSnapshots.length} total updates · {paired.length} paired
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" size="small" startIcon={<Download />} onClick={exportCSV}>
                    Export CSV
                  </Button>
                  <Button variant="contained" size="small" startIcon={<Assessment />}
                    onClick={() => window.print()}
                    sx={{ bgcolor: BRAND.primaryMain }}>
                    Export Chart (PDF)
                  </Button>
                </Box>
              </Box>

              {/* ════════════════════════════════════════════════════════════
                  PRINTABLE SUMMARY REPORT (hidden on screen, shown on print)
                  ════════════════════════════════════════════════════════════ */}
              <Box className="prudev2-printable" sx={{ display: 'none' }}>
                <Box sx={{ mb: 3, pb: 2, borderBottom: '2px solid #1A2F4B' }}>
                  <Typography variant="h5" fontWeight={800} color="#1A2F4B">PRUDEV II — Growth Impact Report</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Generated {new Date().toLocaleDateString('en-UG', { day: 'numeric', month: 'long', year: 'numeric' })} ·
                    {msmeIds.length} MSMEs · {paired.length} with before/after comparison
                  </Typography>
                </Box>

                {/* KPI summary row */}
                <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Avg Revenue (After)',  val: `UGX ${(avgRevLatest/1000).toFixed(0)}K` },
                    { label: 'Revenue Growth',       val: pctRevGrowth != null ? `+${pctRevGrowth}%` : '—' },
                    { label: 'Total Revenue Uplift', val: `UGX ${(totalRevGrowth/1000).toFixed(0)}K` },
                    { label: 'Staff Change',         val: totalStaffAfter > totalStaffBefore ? `+${totalStaffAfter - totalStaffBefore}` : String(totalStaffAfter - totalStaffBefore) },
                  ].map(({ label, val }) => (
                    <Box key={label} sx={{ textAlign: 'center', minWidth: 110 }}>
                      <Typography fontSize={22} fontWeight={800} color="#1A2F4B">{val}</Typography>
                      <Typography fontSize={11} color="#555">{label}</Typography>
                    </Box>
                  ))}
                </Box>

                {/* Printable financial chart */}
                {financialChart.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography fontWeight={700} fontSize={13} sx={{ mb: 1 }}>Financial Impact — Before vs After</Typography>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={financialChart} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF2"/>
                        <XAxis dataKey="metric" tick={{ fontSize: 11 }}/>
                        <YAxis tick={{ fontSize: 10 }}/>
                        <ReTooltip/>
                        <Legend wrapperStyle={{ fontSize: 11 }}/>
                        <Bar dataKey="Before" fill="#90A4AE" radius={[3,3,0,0]}/>
                        <Bar dataKey="After"  fill="#1A2F4B" radius={[3,3,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}

                {/* Printable compliance chart */}
                {paired.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography fontWeight={700} fontSize={13} sx={{ mb: 1 }}>Compliance Improvements — Before vs After (# MSMEs)</Typography>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={complianceChart} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF2"/>
                        <XAxis dataKey="metric" tick={{ fontSize: 11 }}/>
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }}/>
                        <ReTooltip/>
                        <Legend wrapperStyle={{ fontSize: 11 }}/>
                        <Bar dataKey="Before" fill="#90A4AE" radius={[3,3,0,0]}/>
                        <Bar dataKey="After"  fill="#C8102E" radius={[3,3,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}

                {/* Quarterly trend */}
                {quarterlyChart.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography fontWeight={700} fontSize={13} sx={{ mb: 1 }}>
                      Quarterly Average Revenue — {currentYear-1}/{currentYear} (UGX thousands)
                    </Typography>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={quarterlyChart} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF2"/>
                        <XAxis dataKey="period" tick={{ fontSize: 11 }}/>
                        <YAxis tickFormatter={v => `${v}K`} tick={{ fontSize: 10 }}/>
                        <ReTooltip formatter={v => [`UGX ${(v*1000).toLocaleString()}`, 'Avg Revenue']}/>
                        <Bar dataKey="Avg Revenue (K)" fill="#1A2F4B" radius={[3,3,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </Box>

              {/* ════════════════════════════════════════════════════════════
                  PROGRAMME SUMMARY KPIs (screen view)
                  ════════════════════════════════════════════════════════════ */}
              <SectionLabel>Programme Summary</SectionLabel>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  { val: msmeIds.length,                                    label: 'MSMEs with Data',    sub: `of ${msmes.length} total`,   color: BRAND.primaryMain },
                  { val: paired.length,                                     label: 'Paired (Before/After)', sub: '≥2 snapshots',            color: '#0288D1' },
                  { val: `UGX ${(avgRevLatest/1000).toFixed(0)}K`,         label: 'Avg Annual Revenue', sub: 'latest snapshot',            color: '#2E7D32' },
                  { val: pctRevGrowth != null ? `+${pctRevGrowth}%` : '—', label: 'Avg Revenue Growth', sub: 'first → latest',            color: Number(pctRevGrowth) > 0 ? '#2E7D32' : '#C8102E' },
                  { val: `UGX ${(totalRevGrowth/1000).toFixed(0)}K`,       label: 'Total Revenue Uplift', sub: 'across paired MSMEs',     color: '#7B1FA2' },
                  { val: fresh, label: 'Updated ≤30 days', sub: 'recently active', color: '#2E7D32' },
                ].map((k, i) => <Grid item xs={6} sm={4} lg={2} key={i}><KPI {...k} /></Grid>)}
              </Grid>

              {/* ════════════════════════════════════════════════════════════
                  PROGRAMME SUMMARY CHARTS (screen view)
                  ════════════════════════════════════════════════════════════ */}
              {/* ════════════════════════════════════════════════════════════
                  BUSINESS METRICS SUMMARY
                  ════════════════════════════════════════════════════════════ */}
              <SectionLabel>Business Metrics Summary (Latest Updates)</SectionLabel>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  { val: `UGX ${(avgRevLatest/1000).toFixed(0)}K`, label: 'Avg Annual Revenue',  sub: 'across all updated MSMEs',    color: '#2E7D32' },
                  { val: `${bankCount} / ${latestList.length}`,    label: 'Business Bank Acct',  sub: 'have formal bank account',    color: '#00695C',
                    pct: latestList.length ? bankCount/latestList.length*100 : 0 },
                  { val: `${momoCount} / ${latestList.length}`,    label: 'MOMO Pay Code',       sub: 'registered mobile payment',   color: '#F57C00',
                    pct: latestList.length ? momoCount/latestList.length*100 : 0 },
                  { val: `${tinCount} / ${latestList.length}`,     label: 'TIN Registered',      sub: 'tax identification number',   color: '#1565C0',
                    pct: latestList.length ? tinCount/latestList.length*100 : 0 },
                  { val: `${ursbCount} / ${latestList.length}`,    label: 'URSB Registered',     sub: 'business registration',       color: '#4527A0',
                    pct: latestList.length ? ursbCount/latestList.length*100 : 0 },
                  { val: `${saccoCount} / ${latestList.length}`,   label: 'SACCO Members',       sub: 'savings cooperative',         color: '#2E7D32',
                    pct: latestList.length ? saccoCount/latestList.length*100 : 0 },
                ].map((k, i) => <Grid item xs={6} sm={4} lg={2} key={i}><KPI {...k} /></Grid>)}
              </Grid>

              {/* Employee totals before vs after */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Total Employees</Typography>
                      {[
                        { label: 'Before (first update)', val: totalEmpBefore, color: '#90A4AE' },
                        { label: 'After (latest update)',  val: totalEmpAfter,  color: '#1A2F4B' },
                        { label: 'Net change',
                          val: `${totalEmpAfter - totalEmpBefore >= 0 ? '+' : ''}${totalEmpAfter - totalEmpBefore}`,
                          color: totalEmpAfter >= totalEmpBefore ? '#2E7D32' : '#C8102E' },
                      ].map(({ label, val, color }) => (
                        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                          <Typography variant="body2" color="text.secondary">{label}</Typography>
                          <Typography variant="body2" fontWeight={700} color={color}>{val}</Typography>
                        </Box>
                      ))}
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="caption" color="text.secondary">
                        Based on {paired.length} MSMEs with ≥2 updates
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {empChart.length > 0 && (
                  <Grid item xs={12} sm={8}>
                    <ChartCard title="Employees Before vs After — By Category"
                      subtitle={`${paired.length} paired MSMEs · first update vs latest update`} height={200}>
                      <ResponsiveContainer>
                        <BarChart data={empChart} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                          <XAxis dataKey="category" tick={{ fontSize: 11 }}/>
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }}/>
                          <ReTooltip/>
                          <Legend wrapperStyle={{ fontSize: 11 }}/>
                          <Bar dataKey="Before" fill="#90A4AE" radius={[3,3,0,0]}/>
                          <Bar dataKey="After"  fill="#1A2F4B" radius={[3,3,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </Grid>
                )}
              </Grid>

              {/* ════════════════════════════════════════════════════════════
                  DIAGNOSTIC BASELINE vs GROWTH UPDATE COMPARISON
                  ════════════════════════════════════════════════════════════ */}
              {(diagTotal > 0 || latestList.length > 0) && (
                <>
                  <SectionLabel>Diagnostic Baseline vs Growth Update</SectionLabel>
                  <Box sx={{ mb: 2, p: 1.5, bgcolor: '#F3F6FA', borderRadius: 2, border: '1px solid #DDE4EE' }}>
                    <Typography variant="caption" color="text.secondary">
                      <strong>Diagnostic Baseline</strong> — data collected during the initial diagnostic assessment
                      ({diagTotal} MSMEs). &nbsp;
                      <strong>Growth Update</strong> — latest update submitted by BGEs
                      ({latestList.length} MSMEs). &nbsp;
                      Compliance shown as % of each respective population.
                    </Typography>
                  </Box>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    {diagVsGrowthCompliance.some(r => r.Diagnostic > 0 || r.GrowthUpdate > 0) && (
                      <Grid item xs={12} md={6}>
                        <ChartCard
                          title="Compliance — Diagnostic vs Growth Update"
                          subtitle="% of each population with the compliance flag"
                          height={260}>
                          <ResponsiveContainer>
                            <BarChart data={diagVsGrowthCompliance} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                              <XAxis dataKey="metric" tick={{ fontSize: 10 }}/>
                              <YAxis unit="%" domain={[0,100]} tick={{ fontSize: 10 }}/>
                              <ReTooltip formatter={(val, name, props) => [
                                `${val}% (${name === 'Diagnostic' ? props.payload.diagRaw : props.payload.growthRaw} MSMEs)`,
                                name,
                              ]}/>
                              <Legend wrapperStyle={{ fontSize: 11 }}/>
                              <Bar dataKey="Diagnostic"   fill="#C8102E" radius={[3,3,0,0]}/>
                              <Bar dataKey="GrowthUpdate" name="Growth Update" fill="#1A2F4B" radius={[3,3,0,0]}/>
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartCard>
                      </Grid>
                    )}
                    {diagVsGrowthEmployees.length > 0 && (
                      <Grid item xs={12} md={6}>
                        <ChartCard
                          title="Employees — Diagnostic vs Growth Update"
                          subtitle="Total headcount per category across all MSMEs"
                          height={260}>
                          <ResponsiveContainer>
                            <BarChart data={diagVsGrowthEmployees} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                              <XAxis dataKey="category" tick={{ fontSize: 10 }}/>
                              <YAxis allowDecimals={false} tick={{ fontSize: 10 }}/>
                              <ReTooltip/>
                              <Legend wrapperStyle={{ fontSize: 11 }}/>
                              <Bar dataKey="Diagnostic"   fill="#C8102E" radius={[3,3,0,0]}/>
                              <Bar dataKey="GrowthUpdate" name="Growth Update" fill="#1A2F4B" radius={[3,3,0,0]}/>
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartCard>
                      </Grid>
                    )}
                  </Grid>
                </>
              )}

              <SectionLabel>Programme Before / After Charts</SectionLabel>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {financialChart.length > 0 && (
                  <Grid item xs={12} md={5}>
                    <ChartCard title="Financial Impact" subtitle="Avg revenue (UGX K) & total staff — first vs latest" height={240}>
                      <ResponsiveContainer>
                        <BarChart data={financialChart}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                          <XAxis dataKey="metric" tick={{ fontSize: 10 }}/>
                          <YAxis tick={{ fontSize: 10 }}/>
                          <ReTooltip/>
                          <Legend wrapperStyle={{ fontSize: 11 }}/>
                          <Bar dataKey="Before" fill="#90A4AE" radius={[3,3,0,0]}/>
                          <Bar dataKey="After"  fill="#1A2F4B" radius={[3,3,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </Grid>
                )}
                {paired.length > 0 && (
                  <Grid item xs={12} md={financialChart.length > 0 ? 7 : 12}>
                    <ChartCard title="Compliance Improvements" subtitle={`# MSMEs (of ${paired.length} paired) — first vs latest update`} height={240}>
                      <ResponsiveContainer>
                        <BarChart data={complianceChart}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                          <XAxis dataKey="metric" tick={{ fontSize: 10 }}/>
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }}/>
                          <ReTooltip/>
                          <Legend wrapperStyle={{ fontSize: 11 }}/>
                          <Bar dataKey="Before" fill="#90A4AE" radius={[3,3,0,0]}/>
                          <Bar dataKey="After"  fill="#C8102E" radius={[3,3,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </Grid>
                )}
                {quarterlyChart.length > 0 && (
                  <Grid item xs={12}>
                    <ChartCard title="Quarterly Average Revenue" subtitle={`${currentYear-1} / ${currentYear} — UGX thousands`} height={220}>
                      <ResponsiveContainer>
                        <BarChart data={quarterlyChart}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                          <XAxis dataKey="period" tick={{ fontSize: 11 }}/>
                          <YAxis tickFormatter={v => `${v}K`} tick={{ fontSize: 10 }} width={48}/>
                          <ReTooltip formatter={v => [`UGX ${(v*1000).toLocaleString()}`, 'Avg Revenue']}/>
                          <Bar dataKey="Avg Revenue (K)" fill="#1A2F4B" radius={[3,3,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </Grid>
                )}
              </Grid>

              {/* ════════════════════════════════════════════════════════════
                  REVENUE DISTRIBUTION + PERFORMERS (scales to 200+ MSMEs)
                  ════════════════════════════════════════════════════════════ */}
              {paired.length > 0 && (() => {
                // Revenue bracket distribution — how many MSMEs fall into each revenue band
                const revBrackets = [
                  { label: '< 1M',      min: 0,          max: 1000000    },
                  { label: '1M – 5M',   min: 1000000,    max: 5000000    },
                  { label: '5M – 20M',  min: 5000000,    max: 20000000   },
                  { label: '20M – 100M',min: 20000000,   max: 100000000  },
                  { label: '100M+',     min: 100000000,  max: Infinity   },
                ];
                const revDist = revBrackets.map(b => ({
                  band: b.label,
                  Before: paired.filter(s => { const r = Number(s._first.annual_turnover)||0; return r > 0 && r >= b.min && r < b.max; }).length,
                  After:  paired.filter(s => { const r = Number(s.annual_turnover)||0;        return r > 0 && r >= b.min && r < b.max; }).length,
                })).filter(b => b.Before > 0 || b.After > 0);

                // Top & declining performers (list-based — works at any scale)
                const perfRows = withRevFirst
                  .map(s => ({
                    id: s.id,
                    name: (s.msme_name || `MSME ${s.msme}`).slice(0, 32),
                    before: Number(s._first.annual_turnover),
                    after:  Number(s.annual_turnover),
                    pct: ((Number(s.annual_turnover) / Number(s._first.annual_turnover) - 1) * 100),
                  }))
                  .sort((a, b) => b.pct - a.pct);
                const topPerformers      = perfRows.filter(r => r.pct > 0).slice(0, 10);
                const decliningPerformers = perfRows.filter(r => r.pct < 0).sort((a,b) => a.pct - b.pct).slice(0, 10);

                return (
                  <>
                    {/* Revenue distribution chart */}
                    {revDist.length > 0 && (
                      <>
                        <SectionLabel>Revenue Distribution — Before vs After</SectionLabel>
                        <Box sx={{ mb: 2, p: 1.5, bgcolor: '#F3F6FA', borderRadius: 2, border: '1px solid #DDE4EE' }}>
                          <Typography variant="caption" color="text.secondary">
                            How many of the <strong>{paired.length} paired MSMEs</strong> fall into each annual revenue bracket at first update vs latest update.
                            Moving right = revenue growth; larger "After" bar = more businesses reaching that tier.
                          </Typography>
                        </Box>
                        <Grid container spacing={2} sx={{ mb: 3 }}>
                          <Grid item xs={12}>
                            <ChartCard title="Annual Revenue Bands" subtitle="# MSMEs per bracket — first update vs latest update" height={260}>
                              <ResponsiveContainer>
                                <BarChart data={revDist} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                                  <XAxis dataKey="band" tick={{ fontSize: 11 }}/>
                                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: '# MSMEs', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}/>
                                  <ReTooltip formatter={(v, n) => [`${v} MSMEs`, n]}/>
                                  <Legend wrapperStyle={{ fontSize: 11 }}/>
                                  <Bar dataKey="Before" name="First update"  fill="#90A4AE" radius={[3,3,0,0]}/>
                                  <Bar dataKey="After"  name="Latest update" fill="#1A2F4B" radius={[3,3,0,0]}/>
                                </BarChart>
                              </ResponsiveContainer>
                            </ChartCard>
                          </Grid>
                        </Grid>
                      </>
                    )}

                    {/* Top & Declining performers */}
                    {(topPerformers.length > 0 || decliningPerformers.length > 0) && (
                      <>
                        <SectionLabel>Revenue Performance — Top & Declining Businesses</SectionLabel>
                        <Grid container spacing={2} sx={{ mb: 3 }}>
                          {topPerformers.length > 0 && (
                            <Grid item xs={12} md={decliningPerformers.length > 0 ? 6 : 12}>
                              <Card variant="outlined">
                                <CardContent>
                                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                                    🏆 Top {topPerformers.length} — Highest Revenue Growth
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                                    Annual revenue % change, first → latest update
                                  </Typography>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow sx={{ bgcolor: '#F5F5F5' }}>
                                        <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Business</TableCell>
                                        <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="right">Before</TableCell>
                                        <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="right">After</TableCell>
                                        <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="right">Growth</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {topPerformers.map(r => (
                                        <TableRow key={r.id} hover>
                                          <TableCell sx={{ fontSize: 11 }}>{r.name}</TableCell>
                                          <TableCell sx={{ fontSize: 11, color: 'text.secondary' }} align="right">
                                            {(r.before/1000).toFixed(0)}K
                                          </TableCell>
                                          <TableCell sx={{ fontSize: 11, fontWeight: 600 }} align="right">
                                            {(r.after/1000).toFixed(0)}K
                                          </TableCell>
                                          <TableCell align="right">
                                            <Chip size="small" label={`+${r.pct.toFixed(0)}%`}
                                              sx={{ fontSize: 10, height: 18, bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 700 }}/>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </CardContent>
                              </Card>
                            </Grid>
                          )}
                          {decliningPerformers.length > 0 && (
                            <Grid item xs={12} md={topPerformers.length > 0 ? 6 : 12}>
                              <Card variant="outlined" sx={{ borderColor: '#FFCDD2' }}>
                                <CardContent>
                                  <Typography variant="subtitle2" fontWeight={700} color="#C62828" gutterBottom>
                                    ⚠ Needs Attention — Declining Revenue ({decliningPerformers.length})
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                                    These businesses earn less now than when they first joined. Follow up with their BGEs.
                                  </Typography>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow sx={{ bgcolor: '#FFF8F8' }}>
                                        <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Business</TableCell>
                                        <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="right">Before</TableCell>
                                        <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="right">After</TableCell>
                                        <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="right">Change</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {decliningPerformers.map(r => (
                                        <TableRow key={r.id} hover>
                                          <TableCell sx={{ fontSize: 11 }}>{r.name}</TableCell>
                                          <TableCell sx={{ fontSize: 11, color: 'text.secondary' }} align="right">
                                            {(r.before/1000).toFixed(0)}K
                                          </TableCell>
                                          <TableCell sx={{ fontSize: 11, fontWeight: 600, color: '#C62828' }} align="right">
                                            {(r.after/1000).toFixed(0)}K
                                          </TableCell>
                                          <TableCell align="right">
                                            <Chip size="small" label={`${r.pct.toFixed(0)}%`}
                                              sx={{ fontSize: 10, height: 18, bgcolor: '#FFEBEE', color: '#C62828', fontWeight: 700 }}/>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </CardContent>
                              </Card>
                            </Grid>
                          )}
                        </Grid>
                      </>
                    )}

                    {/* ── Compliance transition (unchanged) ── */}
                    {(() => {
                      // For each metric, categorise each paired MSME into one of 4 buckets
                      const transData = compFields.map(({ label, key }) => {
                        const gained    = paired.filter(s => !s._first[key] && s[key]).length;
                        const maintained= paired.filter(s =>  s._first[key] && s[key]).length;
                        const stillNo   = paired.filter(s => !s._first[key] && !s[key]).length;
                        const lost      = paired.filter(s =>  s._first[key] && !s[key]).length;
                        return { metric: label, '↑ Gained': gained, '✓ Maintained': maintained, '— Still No': stillNo, '↓ Lost': lost };
                      });

                      // Which MSMEs changed on at least one metric?
                      const changedMsmes = paired.filter(s =>
                        compFields.some(f => !!s._first[f.key] !== !!s[f.key])
                      );

                      return (
                        <>
                          {/* ── Six metric summary cards ── */}
                          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                            Compliance — Before vs After ({paired.length} businesses with paired updates)
                          </Typography>
                          <Grid container spacing={1.5} sx={{ mb: 3 }}>
                            {transData.map(({ metric, ...counts }) => {
                              const gained = counts['↑ Gained'];
                              const lost   = counts['↓ Lost'];
                              const afterYes = counts['↑ Gained'] + counts['✓ Maintained'];
                              const beforeYes = counts['✓ Maintained'] + counts['↓ Lost'];
                              const net = gained - lost;
                              const pctAfter = paired.length ? Math.round(afterYes / paired.length * 100) : 0;
                              const pctBefore = paired.length ? Math.round(beforeYes / paired.length * 100) : 0;
                              return (
                                <Grid item xs={6} sm={4} md={2} key={metric}>
                                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, height: '100%' }}>
                                    <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" noWrap>
                                      {metric}
                                    </Typography>

                                    {/* Before → After counts */}
                                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mt: 0.5 }}>
                                      <Typography variant="body2" color="text.disabled" sx={{ fontSize: 13 }}>
                                        {beforeYes}
                                      </Typography>
                                      <Typography variant="caption" color="text.disabled">→</Typography>
                                      <Typography variant="h6" fontWeight={800} color={net > 0 ? '#2E7D32' : net < 0 ? '#C62828' : 'text.primary'} sx={{ lineHeight: 1 }}>
                                        {afterYes}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">/ {paired.length}</Typography>
                                    </Box>

                                    {/* Progress bar: before (grey) → after (coloured fill) */}
                                    <Box sx={{ mt: 1, mb: 0.5 }}>
                                      <Box sx={{ position: 'relative', height: 6, bgcolor: '#E0E0E0', borderRadius: 3 }}>
                                        <Box sx={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pctBefore}%`, bgcolor: '#BDBDBD', borderRadius: 3 }}/>
                                        <Box sx={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pctAfter}%`, bgcolor: net >= 0 ? '#2E7D32' : '#C62828', borderRadius: 3, opacity: 0.85 }}/>
                                      </Box>
                                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                                        {pctBefore}% → {pctAfter}%
                                      </Typography>
                                    </Box>

                                    {/* Net change badge */}
                                    {(gained > 0 || lost > 0) && (
                                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                                        {gained > 0 && (
                                          <Chip label={`+${gained} gained`} size="small"
                                            sx={{ fontSize: 10, height: 18, bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 700 }}/>
                                        )}
                                        {lost > 0 && (
                                          <Chip label={`−${lost} lost`} size="small"
                                            sx={{ fontSize: 10, height: 18, bgcolor: '#FFEBEE', color: '#C62828', fontWeight: 700 }}/>
                                        )}
                                      </Box>
                                    )}
                                    {gained === 0 && lost === 0 && (
                                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>No change</Typography>
                                    )}
                                  </Paper>
                                </Grid>
                              );
                            })}
                          </Grid>

                          {/* ── Changes-only table ── */}
                          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                            What Changed — businesses with at least one compliance shift
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                            Only showing {changedMsmes.length} of {paired.length} businesses where something moved.
                            {changedMsmes.length === 0 && ' No compliance changes recorded yet.'}
                          </Typography>
                          {changedMsmes.length > 0 && (
                            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, overflowX: 'auto' }}>
                              <Table size="small">
                                <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Business</TableCell>
                                    {compFields.map(f => (
                                      <TableCell key={f.key} align="center" sx={{ fontWeight: 700, fontSize: 11 }}>{f.label}</TableCell>
                                    ))}
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {changedMsmes.map(s => (
                                    <TableRow key={s.id} hover>
                                      <TableCell sx={{ fontSize: 11, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {(s.msme_name || `MSME ${s.msme}`).slice(0, 30)}
                                      </TableCell>
                                      {compFields.map(f => {
                                        const before = !!s._first[f.key];
                                        const after  = !!s[f.key];
                                        if (after && !before) return (
                                          <TableCell key={f.key} align="center" sx={{ fontSize: 12, color: '#2E7D32', fontWeight: 700 }}>↑ Gained</TableCell>
                                        );
                                        if (!after && before) return (
                                          <TableCell key={f.key} align="center" sx={{ fontSize: 12, color: '#C62828', fontWeight: 700 }}>↓ Lost</TableCell>
                                        );
                                        // Unchanged — show muted current state
                                        return (
                                          <TableCell key={f.key} align="center" sx={{ fontSize: 11, color: after ? '#1565C0' : '#BDBDBD' }}>
                                            {after ? '✓' : '—'}
                                          </TableCell>
                                        );
                                      })}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          )}
                        </>
                      );
                    })()}
                  </>
                );
              })()}

              {/* ════════════════════════════════════════════════════════════
                  RAW DATA TABLE (scrollable)
                  ════════════════════════════════════════════════════════════ */}
              <SectionLabel>Full Data Table</SectionLabel>
              <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 900 }}>
                  <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                    <TableRow>
                      <TableCell>MSME</TableCell>
                      <TableCell>BGE</TableCell>
                      <TableCell># Updates</TableCell>
                      <TableCell>Annual Revenue (Before → After)</TableCell>
                      <TableCell>Last Month Rev.</TableCell>
                      <TableCell>FT Staff</TableCell>
                      <TableCell>PT Staff</TableCell>
                      <TableCell>TIN</TableCell>
                      <TableCell>URSB</TableCell>
                      <TableCell>Bank</TableCell>
                      <TableCell>SACCO</TableCell>
                      <TableCell>MoMo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {latestList.map(s => {
                      const f = s._first || {};
                      const m = msmes.find(x => x.id === s.msme);
                      const hasPair = f.id && f.id !== s.id;
                      const bFT = (f.employees_ft_male||0)+(f.employees_ft_female||0);
                      const bPT = (f.employees_pt_male||0)+(f.employees_pt_female||0);
                      const aFT = (s.employees_ft_male||0)+(s.employees_ft_female||0);
                      const aPT = (s.employees_pt_male||0)+(s.employees_pt_female||0);
                      const updateCount = adminSnapshots.filter(x => x.msme === s.msme).length;
                      const revPct = hasPair && f.annual_turnover && s.annual_turnover
                        ? ((Number(s.annual_turnover)/Number(f.annual_turnover)-1)*100).toFixed(0) : null;

                      const DotCell = ({ before, after }) => (
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                            {hasPair && <Typography fontSize={10} color="text.disabled">{before ? '✓' : '✗'}</Typography>}
                            <Typography fontSize={11} fontWeight={hasPair && after !== before ? 700 : 400}
                              color={hasPair && after !== before ? (after ? 'success.main' : 'error.main') : 'text.primary'}>
                              {after ? '✓' : '✗'}
                            </Typography>
                          </Box>
                        </TableCell>
                      );

                      return (
                        <TableRow key={s.id} hover>
                          <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>{s.msme_name || `MSME ${s.msme}`}</TableCell>
                          <TableCell sx={{ fontSize: 11 }}>{m?.assigned_bge_name || '—'}</TableCell>
                          <TableCell align="center">
                            <Chip label={updateCount} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                          </TableCell>
                          <TableCell sx={{ fontSize: 11 }}>
                            {hasPair ? (
                              <Box>
                                <Typography fontSize={10} color="text.disabled">{fmtUGX(f.annual_turnover)}</Typography>
                                <Typography fontSize={11} fontWeight={600}>→ {fmtUGX(s.annual_turnover)}</Typography>
                                {revPct != null && (
                                  <Chip size="small" label={`${revPct > 0 ? '+' : ''}${revPct}%`}
                                    sx={{ fontSize: 9, height: 15, bgcolor: revPct > 0 ? '#E8F5E9' : '#FFEBEE',
                                      color: revPct > 0 ? '#2E7D32' : '#C8102E', fontWeight: 700 }} />
                                )}
                              </Box>
                            ) : <Typography fontSize={11}>{fmtUGX(s.annual_turnover)}</Typography>}
                          </TableCell>
                          <TableCell sx={{ fontSize: 11 }}>{s.last_month_revenue ? fmtUGX(s.last_month_revenue) : '—'}</TableCell>
                          <TableCell sx={{ fontSize: 11 }}>
                            {hasPair ? <><Typography fontSize={10} color="text.disabled">{bFT}</Typography><Typography fontSize={11} fontWeight={600}>→ {aFT}</Typography></> : aFT || '—'}
                          </TableCell>
                          <TableCell sx={{ fontSize: 11 }}>
                            {hasPair ? <><Typography fontSize={10} color="text.disabled">{bPT}</Typography><Typography fontSize={11} fontWeight={600}>→ {aPT}</Typography></> : aPT || '—'}
                          </TableCell>
                          <DotCell before={f.has_tin} after={s.has_tin} />
                          <DotCell before={f.has_ursb} after={s.has_ursb} />
                          <TableCell>
                            {hasPair && <Typography fontSize={10} color="text.disabled">{f.has_business_bank ? '✓' : '✗'}</Typography>}
                            {s.has_business_bank == null
                              ? <Typography fontSize={11} color="text.disabled">—</Typography>
                              : <Chip size="small" label={s.bank_name || (s.has_business_bank ? '✓' : '✗')}
                                  color={s.has_business_bank ? 'success' : 'default'}
                                  variant={s.has_business_bank ? 'filled' : 'outlined'} sx={{ fontSize: 10, height: 18 }} />}
                          </TableCell>
                          <DotCell before={f.has_sacco} after={s.has_sacco} />
                          <DotCell before={f.has_mobile_money} after={s.has_mobile_money} />
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          );
        })()}

        {/* ════════════════════════════════════════════════════════════════
            TAB 4 — Data Updates (coverage, freshness, BGE scorecard)
            ════════════════════════════════════════════════════════════════ */}
        {analyticTab === 4 && (() => {
          if (adminSnapshotsLoading) return <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Box>;

          const now3 = new Date();
          const daysSince = s => (now3 - new Date(s.snapshot_date)) / 86400000;

          // Latest snapshot per MSME
          const latB3 = {};
          adminSnapshots.forEach(s => {
            const cur = latB3[s.msme];
            if (!cur || s.snapshot_date > cur.snapshot_date) latB3[s.msme] = s;
          });
          const updatedSnaps = Object.values(latB3);

          // Update count per MSME
          const updCounts = {};
          adminSnapshots.forEach(s => { updCounts[s.msme] = (updCounts[s.msme] || 0) + 1; });

          // Freshness buckets
          const fresh30    = updatedSnaps.filter(s => daysSince(s) <= 30);
          const stale3090  = updatedSnaps.filter(s => daysSince(s) > 30 && daysSince(s) <= 90);
          const stale90180 = updatedSnaps.filter(s => daysSince(s) > 90 && daysSince(s) <= 180);
          const stale180p  = updatedSnaps.filter(s => daysSince(s) > 180);
          const neverUpdatedMsmes = msmes.filter(m => !latB3[m.id]);

          const freshnessData = [
            { label: '≤ 30 days',   count: fresh30.length,            fill: '#2E7D32' },
            { label: '31–90 days',  count: stale3090.length,          fill: '#F9A825' },
            { label: '91–180 days', count: stale90180.length,         fill: '#E65100' },
            { label: '180+ days',   count: stale180p.length,          fill: '#C62828' },
            { label: 'Never',       count: neverUpdatedMsmes.length,  fill: '#9E9E9E' },
          ].filter(d => d.count > 0);

          // Update frequency distribution
          const freqMap = {};
          Object.values(updCounts).forEach(n => {
            const k = n >= 5 ? '5+' : String(n);
            freqMap[k] = (freqMap[k] || 0) + 1;
          });
          const freqData = ['1','2','3','4','5+']
            .map(k => ({ updates: `${k} update${k === '1' ? '' : 's'}`, count: freqMap[k] || 0 }))
            .filter(d => d.count > 0);

          // BGE update scorecard — built from snapshots (collected_by_name), not MSME assignments.
          // For snapshots submitted before BGE accounts were linked (collected_by=null), fall back
          // to the assigned BGE of that MSME so pre-linking submissions are not lost in "Unassigned".
          const msmeBgeFallback = {};
          msmes.forEach(m => {
            if (m.assigned_bge_name) msmeBgeFallback[m.id] = m.assigned_bge_name;
          });
          // Also build fallback from bge_workload assignment data for group-assigned MSMEs.
          // bge_workload carries bge_name but not individual msme ids, so msme-level fallback
          // is limited to direct assignments (assigned_bge_name). Group-assigned unlinked
          // snapshots will still show as "Unassigned" until collected_by is backfilled.
          const bgeSnapBuckets = {};
          adminSnapshots.forEach(s => {
            const bgeName = s.collected_by_name || msmeBgeFallback[s.msme] || 'Unassigned';
            if (!bgeSnapBuckets[bgeName]) bgeSnapBuckets[bgeName] = { msmeSet: new Set(), snapCount: 0, lastDate: null, hasUnlinked: false };
            bgeSnapBuckets[bgeName].msmeSet.add(s.msme);
            bgeSnapBuckets[bgeName].snapCount++;
            if (!s.collected_by_name && bgeName !== 'Unassigned') bgeSnapBuckets[bgeName].hasUnlinked = true;
            if (!bgeSnapBuckets[bgeName].lastDate || s.snapshot_date > bgeSnapBuckets[bgeName].lastDate)
              bgeSnapBuckets[bgeName].lastDate = s.snapshot_date;
          });
          // Join with analytics workload to get total-assigned count (handles direct + group assignments)
          const workloadLookup = {};
          (A.bge_workload || []).forEach(b => { workloadLookup[b.bge_name] = (b.direct||0) + (b.via_group||0); });
          const bgeScoreRows = Object.entries(bgeSnapBuckets).map(([bgeName, d]) => {
            const overdue90 = [...d.msmeSet].filter(id => { const lat = latB3[id]; return lat && daysSince(lat) > 90; }).length;
            return {
              name: bgeName,
              assigned: workloadLookup[bgeName] || 0,
              covered: d.msmeSet.size,
              snapCount: d.snapCount,
              lastDate: d.lastDate,
              overdue90,
              hasUnlinked: d.hasUnlinked || false,
            };
          }).sort((a, b) => b.overdue90 - a.overdue90);

          // Stale list: never updated + updated but 60+ days ago
          const staleAll = [
            ...neverUpdatedMsmes.map(m => ({
              name: m.business_name, bgeName: m.assigned_bge_name || '—',
              lastUpdate: null, days: Infinity,
            })),
            ...updatedSnaps
              .filter(s => daysSince(s) > 60)
              .map(s => {
                const m = msmes.find(x => x.id === s.msme);
                return {
                  name: s.msme_name || `MSME ${s.msme}`,
                  bgeName: m?.assigned_bge_name || '—',
                  lastUpdate: s.snapshot_date,
                  days: Math.floor(daysSince(s)),
                };
              }),
          ].sort((a, b) => b.days - a.days);

          const coveragePct = msmes.length ? Math.round(updatedSnaps.length / msmes.length * 100) : 0;
          const avgUpd = updatedSnaps.length ? (adminSnapshots.length / updatedSnaps.length).toFixed(1) : '—';

          return (
            <Box>
              {/* ── Coverage KPIs ── */}
              <SectionLabel>Data Coverage</SectionLabel>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  { val: `${updatedSnaps.length} / ${msmes.length}`, label: 'MSMEs Updated',      sub: 'have at least one growth update',    color: BRAND.primaryMain, pct: coveragePct },
                  { val: fresh30.length,                             label: 'Fresh (≤ 30 days)',  sub: 'updated in the last month',          color: '#2E7D32' },
                  { val: neverUpdatedMsmes.length,                  label: 'Never Updated',       sub: 'no growth data at all',              color: '#C8102E' },
                  { val: stale90180.length + stale180p.length,      label: 'Overdue (90+ days)',  sub: 'last update was 3+ months ago',      color: '#E65100' },
                  { val: avgUpd,                                     label: 'Avg Updates / MSME',  sub: 'among MSMEs with any data',          color: '#0288D1' },
                  { val: adminSnapshots.length,                      label: 'Total Snapshots',     sub: 'all updates ever submitted',         color: '#7B1FA2' },
                ].map((k, i) => <Grid item xs={6} sm={4} lg={2} key={i}><KPI {...k} /></Grid>)}
              </Grid>

              {/* ── Freshness + frequency + coverage rate ── */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} md={5}>
                  <ChartCard title="Update Freshness" subtitle="Days since last growth update — how stale is the data?" height={240}>
                    <ResponsiveContainer>
                      <BarChart data={freshnessData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                        <XAxis dataKey="label" tick={{ fontSize: 11 }}/>
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false}/>
                        <ReTooltip formatter={v => [`${v} MSMEs`, '']}/>
                        <Bar dataKey="count" radius={[4,4,0,0]}>
                          {freshnessData.map((d, i) => <Cell key={i} fill={d.fill}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </Grid>
                <Grid item xs={12} md={4}>
                  <ChartCard title="Update Frequency" subtitle="How many snapshots has each MSME submitted?" height={240}>
                    <ResponsiveContainer>
                      <BarChart data={freqData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
                        <XAxis dataKey="updates" tick={{ fontSize: 11 }}/>
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false}/>
                        <ReTooltip formatter={v => [`${v} MSMEs`, '']}/>
                        <Bar dataKey="count" fill="#1A2F4B" radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <CardContent>
                      <Typography variant="subtitle2" fontWeight={700} gutterBottom>Data Coverage Rate</Typography>
                      <Typography variant="h3" fontWeight={800} sx={{ lineHeight: 1.1 }}
                        color={coveragePct >= 80 ? '#2E7D32' : coveragePct >= 50 ? '#F9A825' : '#C8102E'}>
                        {coveragePct}%
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        of enrolled MSMEs have at least one growth update
                      </Typography>
                      <LinearProgress variant="determinate" value={Math.min(coveragePct, 100)}
                        sx={{ height: 8, borderRadius: 4, bgcolor: '#E8EDF2',
                          '& .MuiLinearProgress-bar': { bgcolor: coveragePct >= 80 ? '#2E7D32' : coveragePct >= 50 ? '#F9A825' : '#C8102E' } }}/>
                      <Typography variant="caption" color="text.secondary">
                        {updatedSnaps.length} of {msmes.length} MSMEs
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* ── BGE Update Scorecard ── */}
              {bgeScoreRows.length > 0 && (
                <>
                  <SectionLabel>BGE Update Scorecard</SectionLabel>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                    Built from who actually <em>submitted</em> each update (collected_by field). Where collected_by is missing
                    (submissions before account linking), the BGE is inferred from MSME assignment — those rows show a <strong style={{color:'#E65100'}}>~</strong> badge.
                    "MSMEs Updated" = distinct MSMEs this BGE has submitted data for. "Overdue" = MSMEs whose most recent update is 90+ days old. Sorted by most overdue first.
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#F5F5F5' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>BGE Name</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, fontSize: 11 }}>Total Assigned</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, fontSize: 11 }}>MSMEs Updated</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, fontSize: 11 }}>Total Snapshots</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Last Submitted</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, fontSize: 11, color: '#C8102E' }}>Overdue (90+ d)</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {bgeScoreRows.map((b, i) => (
                          <TableRow key={i} hover sx={b.overdue90 > 0 ? { bgcolor: '#FFF8F8' } : {}}>
                            <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {b.name}
                                {b.hasUnlinked && (
                                  <Tooltip title="Some snapshots here were submitted before this BGE's account was linked — attributed by MSME assignment">
                                    <Chip label="~" size="small" sx={{ fontSize: 9, height: 16, bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 700, cursor: 'help' }}/>
                                  </Tooltip>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: 12, color: b.assigned ? 'inherit' : 'text.disabled' }}>
                              {b.assigned || '—'}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: 12, fontWeight: 600 }}>{b.covered}</TableCell>
                            <TableCell align="center" sx={{ fontSize: 12, color: 'text.secondary' }}>{b.snapCount}</TableCell>
                            <TableCell sx={{ fontSize: 11, color: 'text.secondary' }}>
                              {b.lastDate
                                ? new Date(b.lastDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                                : '—'}
                            </TableCell>
                            <TableCell align="center">
                              {b.overdue90 > 0
                                ? <Chip label={b.overdue90} size="small"
                                    sx={{ fontSize: 10, height: 20, bgcolor: '#FFEBEE', color: '#C62828', fontWeight: 700 }}/>
                                : <Typography fontSize={12} color="text.disabled">—</Typography>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              {/* ── Data Completeness ── */}
              {updatedSnaps.length > 0 && (() => {
                const total4 = updatedSnaps.length;
                const pct4 = n => total4 ? Math.round(n / total4 * 100) : 0;
                const completenessFields = [
                  { label: 'Annual Revenue',    filled: updatedSnaps.filter(s => s.annual_turnover != null && s.annual_turnover !== '').length },
                  { label: 'Last Month Rev.',   filled: updatedSnaps.filter(s => s.last_month_revenue != null && s.last_month_revenue !== '').length },
                  { label: 'Total Assets',      filled: updatedSnaps.filter(s => s.total_assets != null && s.total_assets !== '').length },
                  { label: 'FT Staff',          filled: updatedSnaps.filter(s => s.employees_ft_male != null || s.employees_ft_female != null).length },
                  { label: 'PT Staff',          filled: updatedSnaps.filter(s => s.employees_pt_male != null || s.employees_pt_female != null).length },
                  { label: 'Refugee Staff',     filled: updatedSnaps.filter(s => (s.employees_ft_refugee||0) > 0 || (s.employees_pt_refugee||0) > 0).length },
                  { label: 'TIN',               filled: updatedSnaps.filter(s => s.has_tin != null).length },
                  { label: 'URSB',              filled: updatedSnaps.filter(s => s.has_ursb != null).length },
                  { label: 'Business Bank',     filled: updatedSnaps.filter(s => s.has_business_bank != null).length },
                  { label: 'Mobile Money',      filled: updatedSnaps.filter(s => s.has_mobile_money != null).length },
                  { label: 'MOMO Pay Code',     filled: updatedSnaps.filter(s => s.has_momo_pay != null).length },
                  { label: 'SACCO',             filled: updatedSnaps.filter(s => s.has_sacco != null).length },
                  { label: 'Digital Tools',     filled: updatedSnaps.filter(s => (s.digital_tools||[]).length > 0).length },
                  { label: 'Training Impact',   filled: updatedSnaps.filter(s => s.training_made_changes != null).length },
                  { label: 'Notes / Context',   filled: updatedSnaps.filter(s => s.notes && s.notes.trim().length > 0).length },
                ].map(f => ({ ...f, pct: pct4(f.filled) }));

                const sourceData = (() => {
                  const sc = {};
                  updatedSnaps.forEach(s => { const k = s.source || 'unknown'; sc[k] = (sc[k]||0) + 1; });
                  const labels = { bge_visit: 'BGE Visit', self_report: 'Self-Report', imported: 'Imported', other: 'Other', unknown: 'Unknown' };
                  return Object.entries(sc).map(([k,v]) => ({ source: labels[k]||k, count: v })).sort((a,b)=>b.count-a.count);
                })();

                return (
                  <>
                    <SectionLabel>Data Completeness — What Fields Are Being Filled In?</SectionLabel>
                    <Box sx={{ mb: 1.5, p: 1.5, bgcolor: '#F3F6FA', borderRadius: 2, border: '1px solid #DDE4EE' }}>
                      <Typography variant="caption" color="text.secondary">
                        Based on the latest snapshot for each of the <strong>{total4} MSMEs with data</strong>.
                        Fields showing a low fill rate indicate areas where BGEs may need reminders to collect that information.
                      </Typography>
                    </Box>
                    {/* Completeness Key legend strip */}
                    <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', mb: 1.5, px: 0.5 }}>
                      {[['#2E7D32','80–100%','Good coverage'],['#F9A825','50–79%','Needs attention'],['#C8102E','< 50%','Often skipped']].map(([c,pct,lbl]) => (
                        <Box key={c} sx={{ display:'flex', alignItems:'center', gap: 0.75 }}>
                          <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: c, flexShrink: 0 }}/>
                          <Typography variant="caption" fontWeight={700} color={c}>{pct}</Typography>
                          <Typography variant="caption" color="text.secondary">— {lbl}</Typography>
                        </Box>
                      ))}
                    </Box>
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                      <Grid item xs={12} md={8}>
                        <ChartCard title="Field Fill Rate" subtitle="% of latest snapshots where each field is filled in" height={360}>
                          <ResponsiveContainer>
                            <BarChart
                              data={completenessFields}
                              layout="vertical"
                              margin={{ top: 4, right: 48, left: 4, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false}/>
                              <XAxis type="number" domain={[0,100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }}/>
                              <YAxis dataKey="label" type="category" width={115} tick={{ fontSize: 10 }}/>
                              <ReTooltip formatter={(v, _, props) => [`${v}% (${props.payload.filled}/${total4} MSMEs)`, '']}/>
                              <Bar dataKey="pct" radius={[0,4,4,0]} label={{ position:'right', fontSize:9, formatter: v => `${v}%` }}>
                                {completenessFields.map((f, i) => (
                                  <Cell key={i} fill={f.pct >= 80 ? '#2E7D32' : f.pct >= 50 ? '#F9A825' : '#C8102E'}/>
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartCard>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <ChartCard title="Update Source" subtitle="How was the data collected?" height={360}>
                          <ResponsiveContainer>
                            <BarChart data={sourceData} layout="vertical" margin={{ top: 4, right: 32, left: 4, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false}/>
                              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false}/>
                              <YAxis dataKey="source" type="category" width={90} tick={{ fontSize: 11 }}/>
                              <ReTooltip formatter={v => [`${v} snapshots`, '']}/>
                              <Bar dataKey="count" fill="#1A2F4B" radius={[0,4,4,0]}
                                label={{ position:'right', fontSize:10, fill:'#555' }}/>
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartCard>
                      </Grid>
                    </Grid>
                  </>
                );
              })()}

              {/* ── Digital Tools & Training Impact ── */}
              {updatedSnaps.length > 0 && (() => {
                const toolCounts = {};
                updatedSnaps.forEach(s => (s.digital_tools||[]).forEach(t => { toolCounts[t] = (toolCounts[t]||0)+1; }));
                const toolData = Object.entries(toolCounts)
                  .sort((a,b) => b[1]-a[1]).slice(0,12)
                  .map(([tool, count]) => ({ tool: tool.length > 28 ? tool.slice(0,26)+'…' : tool, count }));

                const trainingYes  = updatedSnaps.filter(s => s.training_made_changes === true).length;
                const trainingNo   = updatedSnaps.filter(s => s.training_made_changes === false).length;
                const trainingNull = updatedSnaps.length - trainingYes - trainingNo;
                const trainingChanges = {};
                updatedSnaps.forEach(s => (s.training_changes||[]).forEach(c => { trainingChanges[c] = (trainingChanges[c]||0)+1; }));
                const trainingChangeData = Object.entries(trainingChanges)
                  .sort((a,b)=>b[1]-a[1]).slice(0,10)
                  .map(([chg,count]) => ({ change: chg.length > 28 ? chg.slice(0,26)+'…' : chg, count }));

                const trainingTotal = trainingYes + trainingNo + trainingNull;
                return (
                  <>
                    <SectionLabel>Digital Tools Adoption &amp; Training Impact</SectionLabel>

                    {/* Row 1: Digital Tools chart + Training impact side-by-side */}
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      {/* Left: Digital Tools bar chart */}
                      <Grid item xs={12} md={toolData.length > 0 ? 6 : 12}>
                        {toolData.length > 0 ? (
                          <ChartCard title="Digital Tools in Use" subtitle="Top tools adopted across businesses (latest data updates)" height={320}>
                            <ResponsiveContainer>
                              <BarChart data={toolData} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false}/>
                                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }}/>
                                <YAxis dataKey="tool" type="category" width={135} tick={{ fontSize: 10 }}/>
                                <ReTooltip formatter={v => [`${v} businesses`, '']}/>
                                <Bar dataKey="count" fill="#0288D1" radius={[0,4,4,0]}
                                  label={{ position:'right', fontSize:10, fill:'#0288D1' }}/>
                              </BarChart>
                            </ResponsiveContainer>
                          </ChartCard>
                        ) : (
                          <Card variant="outlined" sx={{ height: 320, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Typography variant="body2" color="text.secondary">No digital tool data recorded yet.</Typography>
                          </Card>
                        )}
                      </Grid>

                      {/* Right: Training impact summary */}
                      <Grid item xs={12} md={6}>
                        <Card variant="outlined" sx={{ height: 320, display:'flex', flexDirection:'column' }}>
                          <CardContent sx={{ flex: 1 }}>
                            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Training Made a Difference?</Typography>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                              BGE-reported training impact across latest snapshots
                            </Typography>
                            {[
                              { label: 'Yes — changes observed', count: trainingYes,  color: '#2E7D32', bg: '#E8F5E9' },
                              { label: 'No change reported',     count: trainingNo,   color: '#C8102E', bg: '#FFEBEE' },
                              { label: 'Not answered',           count: trainingNull, color: '#757575', bg: '#F5F5F5' },
                            ].map(({ label, count, color, bg }) => (
                              <Box key={label} sx={{ mb: 2 }}>
                                <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb: 0.5 }}>
                                  <Typography variant="body2" fontSize={12} fontWeight={500}>{label}</Typography>
                                  <Box sx={{ display:'flex', alignItems:'center', gap: 0.75 }}>
                                    <Typography variant="body2" fontWeight={700} color={color}>{count}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      ({trainingTotal ? Math.round(count/trainingTotal*100) : 0}%)
                                    </Typography>
                                  </Box>
                                </Box>
                                <LinearProgress variant="determinate"
                                  value={trainingTotal ? count/trainingTotal*100 : 0}
                                  sx={{ height: 10, borderRadius: 5, bgcolor: bg,
                                    '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 5 } }}/>
                              </Box>
                            ))}
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>

                    {/* Row 2: Training Change Areas — full width */}
                    {trainingChangeData.length > 0 && (
                      <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={12}>
                          <ChartCard title="Training Change Areas" subtitle="Which business aspects improved as a result of PRUDEV II training?" height={280}>
                            <ResponsiveContainer>
                              <BarChart data={trainingChangeData} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false}/>
                                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }}/>
                                <YAxis dataKey="change" type="category" width={160} tick={{ fontSize: 10 }}/>
                                <ReTooltip formatter={v => [`${v} businesses`, '']}/>
                                <Bar dataKey="count" fill="#2E7D32" radius={[0,4,4,0]}
                                  label={{ position:'right', fontSize:10, fill:'#2E7D32' }}/>
                              </BarChart>
                            </ResponsiveContainer>
                          </ChartCard>
                        </Grid>
                      </Grid>
                    )}
                  </>
                );
              })()}

              {/* ── Latest Snapshot Data Table ── */}
              {updatedSnaps.length > 0 && (
                <>
                  <SectionLabel>Latest Snapshot — Full Data View ({updatedSnaps.length} MSMEs)</SectionLabel>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                    The most recent growth update submitted for each MSME. All key fields visible — scroll right to see more.
                    Values in <span style={{ color: '#9E9E9E' }}>grey</span> were not filled in.
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, maxHeight: 520, overflowY: 'auto', overflowX: 'auto' }}>
                    <Table size="small" stickyHeader sx={{ minWidth: 1200 }}>
                      <TableHead>
                        <TableRow>
                          {[
                            'Business','BGE','Date','Source',
                            'Ann. Revenue','Last Mo. Rev.','Total Assets',
                            'FT Staff','PT Staff','Refugee',
                            'TIN','URSB','Bank','MoMo','MoMo Pay','SACCO',
                            'Digital Tools','Training','Notes',
                          ].map(h => (
                            <TableCell key={h} sx={{ fontWeight: 700, fontSize: 10, bgcolor: '#F5F5F5', whiteSpace: 'nowrap' }}>{h}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {[...updatedSnaps].sort((a,b) => b.snapshot_date.localeCompare(a.snapshot_date)).map(s => {
                          const fmtUGX2 = v => (v == null || v === '') ? null : `${(Number(v)/1000).toFixed(0)}K`;
                          const ft = (s.employees_ft_male||0)+(s.employees_ft_female||0);
                          const pt = (s.employees_pt_male||0)+(s.employees_pt_female||0);
                          const ref = (s.employees_ft_refugee||0)+(s.employees_pt_refugee||0);
                          const Tick = ({ val, label }) => val == null
                            ? <Typography fontSize={10} color="text.disabled">—</Typography>
                            : <Chip size="small" label={val ? (label||'✓') : '✗'}
                                sx={{ fontSize: 9, height: 16, fontWeight: 700,
                                  bgcolor: val ? '#E8F5E9' : '#FFEBEE',
                                  color: val ? '#2E7D32' : '#C62828' }}/>;
                          return (
                            <TableRow key={s.id} hover>
                              <TableCell sx={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {s.msme_name || `MSME ${s.msme}`}
                              </TableCell>
                              <TableCell sx={{ fontSize: 10, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                                {s.collected_by_name || '—'}
                              </TableCell>
                              <TableCell sx={{ fontSize: 10, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                                {new Date(s.snapshot_date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'2-digit' })}
                              </TableCell>
                              <TableCell>
                                <Chip size="small" label={s.source === 'bge_visit' ? 'BGE' : s.source === 'self_report' ? 'Self' : s.source || '?'}
                                  sx={{ fontSize: 9, height: 16, bgcolor: s.source === 'bge_visit' ? '#E3F2FD' : '#F3E5F5', color: '#333' }}/>
                              </TableCell>
                              {[fmtUGX2(s.annual_turnover), fmtUGX2(s.last_month_revenue), fmtUGX2(s.total_assets)].map((v,i) => (
                                <TableCell key={i} sx={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                                  {v ? <Typography fontSize={10} fontWeight={600}>{v}</Typography>
                                     : <Typography fontSize={10} color="text.disabled">—</Typography>}
                                </TableCell>
                              ))}
                              <TableCell sx={{ fontSize: 10 }}>
                                {ft > 0 ? <><Typography fontSize={10} fontWeight={600} display="inline">{ft}</Typography><Typography fontSize={9} color="text.secondary" display="inline"> ({s.employees_ft_male||0}M/{s.employees_ft_female||0}F)</Typography></> : <Typography fontSize={10} color="text.disabled">—</Typography>}
                              </TableCell>
                              <TableCell sx={{ fontSize: 10 }}>
                                {pt > 0 ? <><Typography fontSize={10} fontWeight={600} display="inline">{pt}</Typography><Typography fontSize={9} color="text.secondary" display="inline"> ({s.employees_pt_male||0}M/{s.employees_pt_female||0}F)</Typography></> : <Typography fontSize={10} color="text.disabled">—</Typography>}
                              </TableCell>
                              <TableCell sx={{ fontSize: 10 }}>
                                {ref > 0 ? <Typography fontSize={10} fontWeight={600}>{ref}</Typography> : <Typography fontSize={10} color="text.disabled">—</Typography>}
                              </TableCell>
                              <TableCell><Tick val={s.has_tin}           label={s.tin_number || '✓'}/></TableCell>
                              <TableCell><Tick val={s.has_ursb}          label={s.ursb_reg_number || '✓'}/></TableCell>
                              <TableCell><Tick val={s.has_business_bank} label={s.bank_name || '✓'}/></TableCell>
                              <TableCell><Tick val={s.has_mobile_money}/></TableCell>
                              <TableCell><Tick val={s.has_momo_pay}      label={s.momo_pay_code || '✓'}/></TableCell>
                              <TableCell><Tick val={s.has_sacco}/></TableCell>
                              <TableCell sx={{ fontSize: 10 }}>
                                {(s.digital_tools||[]).length > 0
                                  ? <Chip size="small" label={`${(s.digital_tools||[]).length} tool${(s.digital_tools||[]).length > 1 ? 's' : ''}`}
                                      sx={{ fontSize: 9, height: 16, bgcolor: '#E3F2FD', color: '#0277BD' }}/>
                                  : <Typography fontSize={10} color="text.disabled">—</Typography>}
                              </TableCell>
                              <TableCell>
                                {s.training_made_changes == null
                                  ? <Typography fontSize={10} color="text.disabled">—</Typography>
                                  : <Chip size="small" label={s.training_made_changes ? 'Yes' : 'No'}
                                      sx={{ fontSize: 9, height: 16,
                                        bgcolor: s.training_made_changes ? '#E8F5E9' : '#FFEBEE',
                                        color:   s.training_made_changes ? '#2E7D32' : '#C62828', fontWeight: 700 }}/>}
                              </TableCell>
                              <TableCell sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {s.notes && s.notes.trim()
                                  ? <Tooltip title={s.notes} placement="left">
                                      <Typography fontSize={10} color="text.secondary" sx={{ cursor: 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                                        {s.notes.trim().slice(0, 50)}{s.notes.trim().length > 50 ? '…' : ''}
                                      </Typography>
                                    </Tooltip>
                                  : <Typography fontSize={10} color="text.disabled">—</Typography>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              {/* ── Stale MSME list ── */}
              {staleAll.length > 0 && (
                <>
                  <SectionLabel>MSMEs Needing a Visit ({staleAll.length})</SectionLabel>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                    MSMEs that have never been updated, or whose last growth update was more than 60 days ago.
                    Share this list with BGEs to prioritise field visits.
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, maxHeight: 440, overflowY: 'auto' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, fontSize: 11, bgcolor: '#F5F5F5' }}>Business Name</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 11, bgcolor: '#F5F5F5' }}>Assigned BGE</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 11, bgcolor: '#F5F5F5' }}>Last Update</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, fontSize: 11, bgcolor: '#F5F5F5' }}>Days Since Update</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {staleAll.slice(0, 100).map((r, i) => (
                          <TableRow key={i} hover
                            sx={r.days === Infinity ? { bgcolor: '#FFF3E0' } : r.days > 180 ? { bgcolor: '#FFF8F8' } : {}}>
                            <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>{r.name}</TableCell>
                            <TableCell sx={{ fontSize: 11, color: 'text.secondary' }}>{r.bgeName}</TableCell>
                            <TableCell sx={{ fontSize: 11 }}>
                              {r.lastUpdate
                                ? new Date(r.lastUpdate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                                : <Chip size="small" label="Never updated"
                                    sx={{ fontSize: 10, bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 700 }}/>}
                            </TableCell>
                            <TableCell align="right">
                              {r.days === Infinity
                                ? <Chip size="small" label="No data"
                                    sx={{ fontSize: 10, height: 18, bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 700 }}/>
                                : <Chip size="small" label={`${r.days} days`}
                                    sx={{ fontSize: 10, height: 18, fontWeight: 700,
                                      bgcolor: r.days > 180 ? '#FFEBEE' : r.days > 90 ? '#FFF3E0' : '#FFFDE7',
                                      color:   r.days > 180 ? '#C62828' : r.days > 90 ? '#E65100' : '#F57F17' }}/>}
                            </TableCell>
                          </TableRow>
                        ))}
                        {staleAll.length > 100 && (
                          <TableRow>
                            <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', fontSize: 11, py: 1.5 }}>
                              Showing first 100 of {staleAll.length} — export the full list via the CSV button on the Growth &amp; Impact tab
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              {adminSnapshots.length === 0 && (
                <Box sx={{ py: 8, textAlign: 'center' }}>
                  <Assessment sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="h6" color="text.secondary">No growth updates yet.</Typography>
                  <Typography variant="body2" color="text.secondary">
                    BGEs need to submit at least one growth update before data appears here.
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })()}
      </Box>
    );
  };

  const renderUsers = () => (
    <Box>
      <SectionHeader title="User Accounts" subtitle={`${bgeUsers.length} account${bgeUsers.length !== 1 ? 's' : ''} — BGEs, Programme Managers, Viewers`}>
        {experts.some(e => !bgeUsers.some(u => u.bge_profile?.id === e.id)) && (
          <Button variant="outlined" size="small" sx={{ mr: 1 }} onClick={bulkCreateMissingAccounts} disabled={userLoading}>
            {userLoading ? 'Creating…' : 'Create Missing Accounts'}
          </Button>
        )}
        <Button variant="contained" size="small" startIcon={<PersonAdd />} onClick={() => setUserDialog(true)}>
          Create Account
        </Button>
      </SectionHeader>

      <Alert severity="info" sx={{ mb: 2 }}>
        Create and manage login accounts for all users. <strong>BGE</strong> accounts are linked to an expert profile and see only their assigned MSMEs. <strong>Programme Managers</strong> see all MSMEs in their assigned groups. <strong>Viewers</strong> have read-only access to everything. Use the <ManageAccounts sx={{ fontSize: 14, verticalAlign: 'middle' }} /> icon on any row to change a user's role.
      </Alert>

      {bgeUsers.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <ManageAccounts sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No BGE user accounts yet.</Typography>
          <Typography variant="body2" color="text.secondary">Click "Create Account" to give a BGE Expert login access.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Username</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Linked BGE Expert</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bgeUsers.map(u => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: BRAND.programmeGreen }}>{(u.username || '?')[0].toUpperCase()}</Avatar>
                      <Typography fontSize={13} fontWeight={600}>{u.username}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell><Typography fontSize={13}>{u.email || '—'}</Typography></TableCell>
                  <TableCell>
                    {u.bge_profile ? (
                      <Chip label={u.bge_profile.name} size="small" color="success" variant="outlined" />
                    ) : (
                      <Chip label="Not linked" size="small" color="warning" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      {u.role === 'cohort_admin' ? (
                        <>
                          <Chip label="Programme Manager" size="small" color="primary" variant="outlined"
                            onClick={() => openRoleDialog(u)} sx={{ cursor: 'pointer' }} />
                          {u.managed_groups?.map(g => (
                            <Chip key={g.id} label={g.name} size="small" sx={{ fontSize: 10 }} />
                          ))}
                        </>
                      ) : u.role === 'bge' ? (
                        <Chip label="BGE" size="small" color="success" variant="outlined"
                          onClick={() => openRoleDialog(u)} sx={{ cursor: 'pointer' }} />
                      ) : (
                        <Chip label="Viewer" size="small" color="default" variant="outlined"
                          onClick={() => openRoleDialog(u)} sx={{ cursor: 'pointer' }} />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={u.is_active ? 'Active' : 'Disabled'} size="small" color={u.is_active ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Change role">
                      <IconButton size="small" color="secondary" onClick={() => openRoleDialog(u)}>
                        <ManageAccounts fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Reset password">
                      <IconButton size="small" onClick={() => { setPwdUser(u); setPwdDialog(true); }}>
                        <LockReset fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {u.bge_profile ? (
                      <Tooltip title="Unlink BGE profile">
                        <IconButton size="small" onClick={() => unlinkBGE(u.id)}>
                          <LinkOff fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Link to BGE profile">
                        <IconButton size="small" color="primary" onClick={() => { setLinkBgeUser(u); setLinkBgeId(''); }}>
                          <People fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title={u.is_active ? 'Disable login' : 'Enable login'}>
                      <IconButton size="small" color={u.is_active ? 'error' : 'success'} onClick={() => toggleUserActive(u)}>
                        {u.is_active ? <Delete fontSize="small" /> : <CheckCircle fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  const REPORT_STATUS_COLORS = { draft: 'default', submitted: 'primary', reviewed: 'success' };
  const VISIT_LABELS = { initial: 'Initial', followup: 'Follow-up', final: 'Final', training: 'Training', mentoring: 'Mentoring' };

  const renderReports = () => (
    <Box>
      <SectionHeader title="Visit Reports" subtitle={`${reports.length} reports`}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ flex: '1 1 140px', minWidth: 0 }}>
            <InputLabel>Filter by BGE</InputLabel>
            <Select value={reportFilterBge} label="Filter by BGE"
              onChange={e => { setReportFilterBge(e.target.value); setReportPage(0); }}>
              <MenuItem value="">All BGEs</MenuItem>
              {experts.map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: '1 1 110px', minWidth: 0 }}>
            <InputLabel>Status</InputLabel>
            <Select value={reportFilterStatus} label="Status"
              onChange={e => { setReportFilterStatus(e.target.value); setReportPage(0); }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="submitted">Submitted</MenuItem>
              <MenuItem value="reviewed">Reviewed</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </SectionHeader>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>MSME</TableCell>
              <TableCell>BGE Expert</TableCell>
              <TableCell>Visit Type</TableCell>
              <TableCell>Visit Date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginate(reports, reportPage).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No reports found
                </TableCell>
              </TableRow>
            ) : paginate(reports, reportPage).map(r => {
              const msme = msmes.find(m => m.id === r.msme) || { business_name: r.msme_name, msme_code: r.msme_code };
              const bge  = experts.find(e => e.id === r.bge)  || { name: r.bge_name };
              return (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{r.msme_name || msme.business_name}</Typography>
                    {(r.msme_code || msme.msme_code) &&
                      <Typography variant="caption" color="text.secondary">{r.msme_code || msme.msme_code}</Typography>}
                  </TableCell>
                  <TableCell>{r.bge_name || bge.name}</TableCell>
                  <TableCell>
                    <Chip label={VISIT_LABELS[r.visit_type] || r.visit_type} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{r.visit_date}</TableCell>
                  <TableCell>
                    <Chip label={r.status} size="small" color={REPORT_STATUS_COLORS[r.status] || 'default'} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="View report">
                        <IconButton size="small" color="primary" onClick={() => setViewReport({ ...r, _msme: msme, _bgeName: r.bge_name || bge.name })}>
                          <Visibility fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Open PDF">
                        <IconButton size="small" onClick={() => openReportPdf('msme', r.id, 'view')}>
                          <PictureAsPdf fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Download PDF">
                        <IconButton size="small" onClick={() => openReportPdf('msme', r.id, 'download')}>
                          <Download fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {r.status !== 'draft' && (
                        <Tooltip title="Revert to draft">
                          <IconButton size="small" color="warning" onClick={() => revertReport('msme', r.id)}>
                            <Undo fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination
          component="div" count={reports.length} page={reportPage}
          rowsPerPage={ROWS_PER_PAGE} rowsPerPageOptions={[ROWS_PER_PAGE]}
          onPageChange={(_, p) => setReportPage(p)}
        />
      </TableContainer>

      {/* ── Group Reports panel (admin approval) ─────────────────────── */}
      <Box sx={{ mt: 4 }}>
        <SectionHeader title="Group Reports" subtitle={`${groupReports.length} group report${groupReports.length === 1 ? '' : 's'} filed`} />
        {groupReports.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.secondary' }}>
            No group reports yet. Team leads file these from the BGE dashboard.
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell>Group</TableCell>
                  <TableCell>Team Lead</TableCell>
                  <TableCell>Session</TableCell>
                  <TableCell>Visit Date</TableCell>
                  <TableCell>MSMEs</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groupReports.map(g => (
                  <TableRow key={g.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{g.group_name}</Typography>
                    </TableCell>
                    <TableCell>{g.team_lead_name || '—'}</TableCell>
                    <TableCell>{g.session_number ? `Session ${g.session_number}` : '—'}</TableCell>
                    <TableCell>{g.visit_date}</TableCell>
                    <TableCell>{g.msme_count || 0}</TableCell>
                    <TableCell>
                      <Chip
                        label={g.status} size="small"
                        color={g.status === 'approved' ? 'success' : (g.status === 'submitted' ? 'primary' : 'default')}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Open PDF">
                          <IconButton size="small" onClick={() => openReportPdf('group', g.id, 'view')}>
                            <PictureAsPdf fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download PDF">
                          <IconButton size="small" onClick={() => openReportPdf('group', g.id, 'download')}>
                            <Download fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {g.status === 'submitted' && (
                          <Tooltip title="Approve report">
                            <IconButton size="small" color="success" onClick={() => approveGroupReport(g.id)}>
                              <CheckCircle fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {g.status !== 'draft' && (
                          <Tooltip title="Revert to draft">
                            <IconButton size="small" color="warning" onClick={() => revertReport('group', g.id)}>
                              <Undo fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* ── Training & Mentor Reports ───────────────────────────────────── */}
      <Box sx={{ mt: 4 }}>
        <SectionHeader
          title="Training Reports"
          subtitle={`${adminTrainingReports.length} lead · ${adminMentorReports.length} mentor`}
        />
        <Tabs value={trReportTab} onChange={(_, v) => setTrReportTab(v)}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={`Lead Reports (${adminTrainingReports.length})`} />
          <Tab label={`Mentor Reports (${adminMentorReports.length})`} />
        </Tabs>

        {trReportTab === 0 && (
          adminTrainingReports.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.secondary' }}>
              No training reports submitted yet.
            </Paper>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                  <TableRow>
                    <TableCell>Session</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Lead BGE</TableCell>
                    <TableCell>Participants</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {adminTrainingReports.map(r => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{r.session_title}</Typography>
                        {r.session_location && (
                          <Typography variant="caption" color="text.secondary">{r.session_location}</Typography>
                        )}
                      </TableCell>
                      <TableCell>{r.session_date || '—'}</TableCell>
                      <TableCell>{r.bge_name || '—'}</TableCell>
                      <TableCell>
                        {r.total_participants > 0 ? (
                          <Chip label={`${r.total_participants} participants`} size="small" variant="outlined" />
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Chip label={r.status} size="small"
                          color={r.status === 'submitted' ? 'primary' : 'default'} />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="View report">
                            <IconButton size="small" color="primary" onClick={() => setViewTrReport(r)}>
                              <Visibility fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Open PDF">
                            <IconButton size="small" onClick={() => openTrainingReportPdf('lead', r.id, 'view')}>
                              <PictureAsPdf fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Download PDF">
                            <IconButton size="small" onClick={() => openTrainingReportPdf('lead', r.id, 'download')}>
                              <Download fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )
        )}

        {trReportTab === 1 && (
          adminMentorReports.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.secondary' }}>
              No mentor reports submitted yet.
            </Paper>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                  <TableRow>
                    <TableCell>Session</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Mentor BGE</TableCell>
                    <TableCell>Lead BGE</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {adminMentorReports.map(r => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{r.session_title}</Typography>
                        {r.session_location && (
                          <Typography variant="caption" color="text.secondary">{r.session_location}</Typography>
                        )}
                      </TableCell>
                      <TableCell>{r.session_date || '—'}</TableCell>
                      <TableCell>{r.bge_name || '—'}</TableCell>
                      <TableCell>{r.lead_bge_name || '—'}</TableCell>
                      <TableCell>
                        <Chip label={r.status} size="small"
                          color={r.status === 'submitted' ? 'primary' : 'default'} />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="View report">
                            <IconButton size="small" color="primary" onClick={() => setViewMrReport(r)}>
                              <Visibility fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Open PDF">
                            <IconButton size="small" onClick={() => openTrainingReportPdf('mentor', r.id, 'view')}>
                              <PictureAsPdf fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Download PDF">
                            <IconButton size="small" onClick={() => openTrainingReportPdf('mentor', r.id, 'download')}>
                              <Download fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )
        )}
      </Box>

      {/* ── Growth Updates (Snapshots) ──────────────────────────────────── */}
      <Box sx={{ mt: 4 }}>
        <SectionHeader
          title="Growth Updates"
          subtitle={`${adminSnapshots.length} submission${adminSnapshots.length === 1 ? '' : 's'} · ${[...new Set(adminSnapshots.map(s => s.msme))].length} MSMEs covered`}
        >
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ flex: '1 1 140px', minWidth: 0 }}>
              <InputLabel>Filter by BGE</InputLabel>
              <Select value={snapshotFilterBge} label="Filter by BGE"
                onChange={e => { setSnapshotFilterBge(e.target.value); setSnapshotPage(0); }}>
                <MenuItem value="">All BGEs</MenuItem>
                {experts.map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ flex: '1 1 130px', minWidth: 0 }}>
              <InputLabel>Source</InputLabel>
              <Select value={snapshotFilterSource} label="Source"
                onChange={e => { setSnapshotFilterSource(e.target.value); setSnapshotPage(0); }}>
                <MenuItem value="">All Sources</MenuItem>
                <MenuItem value="diagnostic">Baseline Diagnostic</MenuItem>
                <MenuItem value="bge_visit">BGE Visit</MenuItem>
                <MenuItem value="quarterly">Quarterly Review</MenuItem>
                <MenuItem value="annual">Data Update</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </SectionHeader>

        {adminSnapshotsLoading ? (
          <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (() => {
          if (adminSnapshots.length === 0) return (
            <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.secondary' }}>
              No growth updates recorded yet.
            </Paper>
          );

          // ── Core derivations (all snapshots, not filtered) ─────────────
          const SOURCE_LABELS = {
            diagnostic: 'Baseline', bge_visit: 'BGE Visit', quarterly: 'Quarterly',
            annual: 'Data Update', other: 'Other',
          };
          const fmtUGX = v => (v == null || v === '') ? '—' : `UGX ${Number(v).toLocaleString()}`;

          const latestByMsme = {};
          const firstByMsme  = {};
          adminSnapshots.forEach(s => {
            const lat = latestByMsme[s.msme];
            if (!lat || s.snapshot_date > lat.snapshot_date || (s.snapshot_date === lat.snapshot_date && s.id > lat.id))
              latestByMsme[s.msme] = s;
            const cur = firstByMsme[s.msme];
            if (!cur || s.snapshot_date < cur.snapshot_date || (s.snapshot_date === cur.snapshot_date && s.id < cur.id))
              firstByMsme[s.msme] = s;
          });
          const latestList = Object.values(latestByMsme);
          const paired = latestList
            .filter(s => firstByMsme[s.msme] && firstByMsme[s.msme].id !== s.id)
            .map(s => ({ ...s, _first: firstByMsme[s.msme] }))
            .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));

          const bgeCnt = new Set(adminSnapshots.filter(x => x.collected_by).map(x => x.collected_by)).size;

          // ── Compliance (latest snapshot per MSME) ─────────────────────
          const compFields = [
            { label: 'TIN',           key: 'has_tin',           color: '#1565C0' },
            { label: 'URSB',          key: 'has_ursb',          color: '#4527A0' },
            { label: 'Business Bank', key: 'has_business_bank', color: '#00695C' },
            { label: 'SACCO',         key: 'has_sacco',         color: '#2E7D32' },
            { label: 'Mobile Money',  key: 'has_mobile_money',  color: '#E65100' },
            { label: 'MOMO Pay',      key: 'has_momo_pay',      color: '#F57C00' },
          ];

          // ── Financials ────────────────────────────────────────────────
          const withRev     = latestList.filter(s => s.annual_turnover);
          const totalRev    = withRev.reduce((a, s) => a + Number(s.annual_turnover), 0);
          const avgRev      = withRev.length ? totalRev / withRev.length : 0;
          const withMoRev   = latestList.filter(s => s.last_month_revenue);
          const avgMoRev    = withMoRev.length
            ? withMoRev.reduce((a, s) => a + Number(s.last_month_revenue), 0) / withMoRev.length : 0;
          const totalEmpAll = latestList.reduce((a, s) =>
            a + (s.employees_ft_male||0)+(s.employees_ft_female||0)
              + (s.employees_pt_male||0)+(s.employees_pt_female||0), 0);
          const femaleEmp   = latestList.reduce((a, s) =>
            a + (s.employees_ft_female||0)+(s.employees_pt_female||0), 0);
          const refugeeEmp  = latestList.reduce((a, s) =>
            a + (s.employees_ft_refugee||0)+(s.employees_pt_refugee||0), 0);
          const trainingImpact = latestList.filter(s => s.training_made_changes === true).length;

          // ── Filtered table ────────────────────────────────────────────
          const filtered = adminSnapshots.filter(s =>
            (!snapshotFilterBge    || s.collected_by === Number(snapshotFilterBge)) &&
            (!snapshotFilterSource || s.source === snapshotFilterSource)
          );
          const pageSlice = filtered.slice(snapshotPage * ROWS_PER_PAGE, (snapshotPage + 1) * ROWS_PER_PAGE);

          const COMP_LABELS = { has_tin: 'TIN', has_ursb: 'URSB', has_business_bank: 'Bank', has_sacco: 'SACCO', has_mobile_money: 'MoMo', has_momo_pay: 'MOMO Pay' };
          const COMP_KEYS   = Object.keys(COMP_LABELS);

          return (
            <>
              {/* ── Coverage stat chips ─────────────────────────────────── */}
              <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
                {[
                  { label: 'Total Submissions',  value: adminSnapshots.length },
                  { label: 'MSMEs Covered',      value: latestList.length },
                  { label: 'BGEs Reporting',     value: bgeCnt },
                  { label: 'With Baseline Data', value: paired.length, sub: 'baseline + update' },
                  { label: 'Training Impact',    value: trainingImpact, sub: 'training made a change' },
                ].map(({ label, value, sub }) => (
                  <Box key={label} sx={{ flex: '1 1 130px', textAlign: 'center',
                    bgcolor: '#F4F6F9', borderRadius: 2, px: 2, py: 1.5 }}>
                    <Typography variant="h5" fontWeight={700} color="primary.main">{value}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>{label}</Typography>
                    {sub && <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>{sub}</Typography>}
                  </Box>
                ))}
              </Box>

              {/* ── Compliance summary ──────────────────────────────────── */}
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                  Compliance &amp; Access
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    (based on latest snapshot · {latestList.length} MSMEs)
                  </Typography>
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {compFields.map(({ label, key, color }) => {
                    const cnt = latestList.filter(s => s[key]).length;
                    const pct = latestList.length > 0 ? Math.round(cnt / latestList.length * 100) : 0;
                    return (
                      <Box key={key} sx={{ flex: '1 1 130px', bgcolor: '#FAFAFA',
                        borderRadius: 1.5, p: 1.5, borderLeft: `3px solid ${color}` }}>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                          <Typography variant="h6" fontWeight={700} sx={{ color }}>{cnt}</Typography>
                          <Typography variant="caption" color="text.disabled">/ {latestList.length}</Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>{label}</Typography>
                        <LinearProgress variant="determinate" value={pct}
                          sx={{ height: 6, borderRadius: 3, bgcolor: '#E0E0E0',
                            '& .MuiLinearProgress-bar': { bgcolor: color } }} />
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>{pct}%</Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Paper>

              {/* ── Financial & workforce summary ───────────────────────── */}
              <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                  Financial &amp; Workforce
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    (latest snapshot per MSME)
                  </Typography>
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Total Annual Turnover',   value: fmtUGX(Math.round(totalRev)),  sub: `${withRev.length} MSMEs reported` },
                    { label: 'Avg Annual Turnover',     value: fmtUGX(Math.round(avgRev)),    sub: 'per MSME' },
                    { label: 'Avg Last Month Revenue',  value: fmtUGX(Math.round(avgMoRev)),  sub: `${withMoRev.length} MSMEs reported` },
                    { label: 'Total Employees (FT+PT)', value: totalEmpAll,                   sub: 'across all MSMEs' },
                    { label: 'Female Employees',        value: femaleEmp,                     sub: `${totalEmpAll > 0 ? Math.round(femaleEmp/totalEmpAll*100) : 0}% of total` },
                    { label: 'Refugee Employees',       value: refugeeEmp,                    sub: 'FT + PT refugees' },
                  ].map(({ label, value, sub }) => (
                    <Box key={label} sx={{ flex: '1 1 155px', bgcolor: '#F4F6F9', borderRadius: 1.5, px: 2, py: 1.5 }}>
                      <Typography variant="caption" color="text.secondary"
                        sx={{ textTransform: 'uppercase', fontSize: 10, display: 'block' }}>{label}</Typography>
                      <Typography variant="body1" fontWeight={700}
                        sx={{ fontFamily: typeof value === 'string' ? 'monospace' : 'inherit', mt: 0.25 }}>
                        {value}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>{sub}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>

              {/* ── Baseline vs Latest comparison ───────────────────────── */}
              {paired.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                    Baseline vs Latest Comparison
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      {paired.length} MSME{paired.length !== 1 ? 's' : ''} with both baseline &amp; update
                    </Typography>
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                        <TableRow>
                          <TableCell>MSME</TableCell>
                          <TableCell>Baseline</TableCell>
                          <TableCell>Latest</TableCell>
                          <TableCell>Annual Turnover</TableCell>
                          <TableCell>Last Month Revenue</TableCell>
                          <TableCell>Employees</TableCell>
                          <TableCell>Compliance Change</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paired.map(s => {
                          const f = s._first;
                          const revB = Number(f.annual_turnover) || 0;
                          const revA = Number(s.annual_turnover) || 0;
                          const revDelta = revB > 0 && revA > 0
                            ? ((revA - revB) / revB * 100).toFixed(0) : null;
                          const moRevB = Number(f.last_month_revenue) || 0;
                          const moRevA = Number(s.last_month_revenue) || 0;
                          const moRevDelta = moRevB > 0 && moRevA > 0
                            ? ((moRevA - moRevB) / moRevB * 100).toFixed(0) : null;
                          const empB = (f.employees_ft_male||0)+(f.employees_ft_female||0)+(f.employees_pt_male||0)+(f.employees_pt_female||0);
                          const empA = (s.employees_ft_male||0)+(s.employees_ft_female||0)+(s.employees_pt_male||0)+(s.employees_pt_female||0);
                          const empDelta = empA - empB;
                          const gained = COMP_KEYS.filter(k => !f[k] && s[k]);
                          const lost   = COMP_KEYS.filter(k =>  f[k] && !s[k]);
                          return (
                            <TableRow key={s.id} hover>
                              <TableCell>
                                <Typography variant="body2" fontWeight={500}>{s.msme_name}</Typography>
                                <Typography variant="caption" color="text.secondary">{s.collected_by_name || ''}</Typography>
                              </TableCell>
                              <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>
                                {f.snapshot_date}<br/>
                                <Typography variant="caption" color="text.disabled">{SOURCE_LABELS[f.source] || f.source}</Typography>
                              </TableCell>
                              <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>
                                {s.snapshot_date}<br/>
                                <Typography variant="caption" color="text.disabled">{SOURCE_LABELS[s.source] || s.source}</Typography>
                              </TableCell>
                              <TableCell>
                                {(revB > 0 || revA > 0) ? (
                                  <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }}>
                                      {fmtUGX(revB)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
                                      {fmtUGX(revA)}
                                    </Typography>
                                    {revDelta && (
                                      <Chip label={`${revDelta > 0 ? '+' : ''}${revDelta}%`} size="small"
                                        color={Number(revDelta) > 0 ? 'success' : 'error'}
                                        sx={{ height: 18, fontSize: 10, mt: 0.5 }} />
                                    )}
                                  </Box>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                {(moRevB > 0 || moRevA > 0) ? (
                                  <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block' }}>
                                      {fmtUGX(moRevB)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
                                      {fmtUGX(moRevA)}
                                    </Typography>
                                    {moRevDelta && (
                                      <Chip label={`${moRevDelta > 0 ? '+' : ''}${moRevDelta}%`} size="small"
                                        color={Number(moRevDelta) > 0 ? 'success' : 'error'}
                                        sx={{ height: 18, fontSize: 10, mt: 0.5 }} />
                                    )}
                                  </Box>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" color="text.secondary" display="block">{empB} → {empA}</Typography>
                                {empDelta !== 0 && (
                                  <Chip label={`${empDelta > 0 ? '+' : ''}${empDelta}`} size="small"
                                    color={empDelta > 0 ? 'success' : 'error'} sx={{ height: 18, fontSize: 10 }} />
                                )}
                              </TableCell>
                              <TableCell>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  {gained.map(k => (
                                    <Chip key={k} label={`+${COMP_LABELS[k]}`} size="small" color="success"
                                      sx={{ height: 18, fontSize: 10 }} />
                                  ))}
                                  {lost.map(k => (
                                    <Chip key={k} label={`−${COMP_LABELS[k]}`} size="small" color="error"
                                      sx={{ height: 18, fontSize: 10 }} />
                                  ))}
                                  {gained.length === 0 && lost.length === 0 && (
                                    <Typography variant="caption" color="text.disabled">No change</Typography>
                                  )}
                                </Box>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* ── All submissions table ───────────────────────────────── */}
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                All Submissions
                {(snapshotFilterBge || snapshotFilterSource) && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    (filtered · {filtered.length} result{filtered.length !== 1 ? 's' : ''})
                  </Typography>
                )}
              </Typography>
              {filtered.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                  No submissions match the current filters.
                </Paper>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                      <TableRow>
                        <TableCell>MSME</TableCell>
                        <TableCell>BGE</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Source</TableCell>
                        <TableCell>Annual Turnover</TableCell>
                        <TableCell>Last Mo. Revenue</TableCell>
                        <TableCell>Employees</TableCell>
                        <TableCell>Compliance</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pageSlice.map(s => {
                        const totalEmp = (s.employees_ft_male||0)+(s.employees_ft_female||0)
                          +(s.employees_pt_male||0)+(s.employees_pt_female||0);
                        return (
                          <TableRow key={s.id} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight={500}>{s.msme_name}</Typography>
                            </TableCell>
                            <TableCell>{s.collected_by_name || '—'}</TableCell>
                            <TableCell>{s.snapshot_date}</TableCell>
                            <TableCell>
                              <Chip label={SOURCE_LABELS[s.source] || s.source} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                              {fmtUGX(s.annual_turnover)}
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                              {fmtUGX(s.last_month_revenue)}
                            </TableCell>
                            <TableCell>{totalEmp > 0 ? totalEmp : '—'}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {s.has_tin           && <Chip label="TIN"  size="small" color="success" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
                                {s.has_ursb          && <Chip label="URSB" size="small" color="success" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
                                {s.has_business_bank && <Chip label="Bank" size="small" color="success" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
                                {s.has_sacco         && <Chip label="SACCO" size="small" color="success" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
                                {s.has_mobile_money  && <Chip label="MoMo" size="small" color="info"    variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
                                {s.has_momo_pay      && <Chip label="MoMo Pay" size="small" color="info" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Tooltip title="View full update">
                                <IconButton size="small" color="primary" onClick={() => setViewSnapshot(s)}>
                                  <Visibility fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div" count={filtered.length} page={snapshotPage}
                    rowsPerPage={ROWS_PER_PAGE} rowsPerPageOptions={[ROWS_PER_PAGE]}
                    onPageChange={(_, p) => setSnapshotPage(p)}
                  />
                </TableContainer>
              )}
            </>
          );
        })()}
      </Box>
    </Box>
  );

  const openAddMsme = (bge) => {
    setAssignTarget(null);
    setAddMsmeDialog(bge);
    setAddMsmePick('');
    setAddMsmeSearch('');
  };

  const renderAssignments = () => {
    const unassigned = msmes.filter(m => !m.assigned_bge);

    // Sort BGEs: those with assignments first (desc by count), then without
    const sortedExperts = [...experts].sort((a, b) => {
      const aCount = msmes.filter(m => m.assigned_bge === a.id).length;
      const bCount = msmes.filter(m => m.assigned_bge === b.id).length;
      return bCount - aCount;
    });

    return (
      <Box>
        <SectionHeader
          title="BGE Assignments"
          subtitle={`${msmes.filter(m => m.assigned_bge).length} assigned · ${unassigned.length} unassigned`}
        />

        {/* Unassigned MSMEs summary */}
        {unassigned.length > 0 && (
          <Accordion variant="outlined" sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Chip label={`${unassigned.length} unassigned`} color="warning" size="small" />
                <Typography variant="body2" fontWeight={600}>Unassigned MSMEs</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Table size="small">
                <TableBody>
                  {unassigned.map(m => (
                    <TableRow key={m.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{m.business_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{m.sector}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={m.msme_code} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: 11 }} />
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="outlined" onClick={() => openAssignDialog(m)} sx={{ fontSize: 11 }}>
                          Assign
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AccordionDetails>
          </Accordion>
        )}

        {/* BGE cards */}
        {experts.length === 0 ? (
          <Paper variant="outlined" sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
            No BGE experts yet. Import experts first.
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {sortedExperts.map(e => {
              const bgeMsmes = msmes.filter(m => m.assigned_bge === e.id);
              // Initialize bgeObjectives from expert data if not already in state
              const objValue = e.id in bgeObjectives ? bgeObjectives[e.id] : (e.deployment_objectives || '');

              return (
                <Grid item xs={12} md={6} key={e.id}>
                  <Card variant="outlined">
                    <CardContent>
                      {/* Header row */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                        <Avatar sx={{ width: 36, height: 36, fontSize: 14, bgcolor: BRAND.primaryMain }}>
                          {(e.name || '?')[0]}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={700} noWrap>
                            {e.name}
                            {e.bge_code && (
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                · {e.bge_code}
                              </Typography>
                            )}
                          </Typography>
                          {e.email && (
                            <Typography variant="caption" color="text.secondary" noWrap display="block">{e.email}</Typography>
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                          <Tooltip title={(!e.email || bgeMsmes.length === 0) ? 'Need email and assigned MSMEs to send' : `Preview & send email to ${e.email}`}>
                            <span>
                              <IconButton
                                size="small"
                                disabled={!e.email || bgeMsmes.length === 0 || emailingBgeId === e.id}
                                onClick={() => previewBgeEmail(e)}
                                color="primary"
                              >
                                {emailingBgeId === e.id ? <CircularProgress size={16} /> : <Email fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Add MSME to this BGE">
                            <IconButton size="small" color="success" onClick={() => openAddMsme(e)}>
                              <Add fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>

                      <Divider sx={{ my: 1 }} />

                      {/* Assigned MSMEs list */}
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                        Assigned MSMEs ({bgeMsmes.length}):
                      </Typography>
                      {bgeMsmes.length === 0 ? (
                        <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                          No MSMEs assigned yet
                        </Typography>
                      ) : (
                        <Box sx={{ mb: 1 }}>
                          {bgeMsmes.map((m, idx) => (
                            <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
                              <Typography variant="caption" color="text.disabled" sx={{ minWidth: 18, fontSize: 11 }}>
                                {idx + 1}.
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{ flex: 1, cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                                onClick={() => openAssignDialog(m)}
                              >
                                {m.business_name}
                                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                                  ({m.msme_code}) — {m.sector}
                                </Typography>
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}

                      <Divider sx={{ my: 1 }} />

                      {/* Deployment Objectives */}
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                        Deployment Objectives:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        <TextField
                          fullWidth
                          size="small"
                          multiline
                          rows={2}
                          placeholder="Shared objectives for this BGE's deployment…"
                          value={objValue}
                          onChange={ev => !isProgrammeManager && setBgeObjectives(prev => ({ ...prev, [e.id]: ev.target.value }))}
                          onFocus={() => {
                            if (!(e.id in bgeObjectives)) {
                              setBgeObjectives(prev => ({ ...prev, [e.id]: e.deployment_objectives || '' }));
                            }
                          }}
                          InputProps={{ readOnly: isProgrammeManager }}
                          InputLabelProps={{ shrink: true }}
                        />
                        {isStaff && (
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={!!savingObjectives[e.id]}
                            sx={{ flexShrink: 0, mt: 0.5 }}
                            onClick={async () => {
                              setSavingObjectives(prev => ({ ...prev, [e.id]: true }));
                              try {
                                await axios.patch(
                                  `${API_ENDPOINTS.EXPERTS}${e.id}/set-objectives/`,
                                  { deployment_objectives: objValue },
                                  { headers }
                                );
                                notify('Objectives saved');
                                fetchAll();
                              } catch {
                                notify('Failed to save objectives', 'error');
                              } finally {
                                setSavingObjectives(prev => ({ ...prev, [e.id]: false }));
                              }
                            }}
                          >
                            {savingObjectives[e.id] ? <CircularProgress size={14} /> : 'Save'}
                          </Button>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}

        {/* Add MSME to BGE dialog */}
        <Dialog open={!!addMsmeDialog} onClose={() => setAddMsmeDialog(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Add MSME to {addMsmeDialog?.name}</DialogTitle>
          <DialogContent>
            {(() => {
              const sortedMsmes = [...msmes].sort((a, b) => {
                const aOwn = a.assigned_bge === addMsmeDialog?.id;
                const bOwn = b.assigned_bge === addMsmeDialog?.id;
                if (aOwn !== bOwn) return aOwn ? -1 : 1;
                const aFree = !a.assigned_bge, bFree = !b.assigned_bge;
                if (aFree !== bFree) return aFree ? -1 : 1;
                return (a.business_name || '').localeCompare(b.business_name || '');
              });
              const filtered = sortedMsmes.filter(m =>
                !addMsmeSearch || (m.business_name || '').toLowerCase().includes(addMsmeSearch.toLowerCase())
              );
              const alreadyElsewhere = addMsmePick
                ? msmes.find(m => m.id === addMsmePick && m.assigned_bge && m.assigned_bge !== addMsmeDialog?.id)
                : null;
              return (
                <>
                  <Alert severity="info" sx={{ mb: 2, mt: 1 }} icon={false}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                      Deploying multiple BGEs to the same MSMEs?
                    </Typography>
                    <Typography variant="body2">
                      All MSMEs are shown — including those assigned to other BGEs.
                      MSMEs tagged <strong style={{color:'#E65100'}}>→ [BGE Name]</strong> are already assigned.
                      Selecting one will move the primary assignment to <strong>{addMsmeDialog?.name}</strong>.
                    </Typography>
                  </Alert>
                  <TextField
                    size="small" fullWidth placeholder="Search MSMEs…"
                    value={addMsmeSearch} onChange={e => setAddMsmeSearch(e.target.value)}
                    sx={{ mb: 1.5 }}
                    InputProps={{ startAdornment: <Search sx={{ mr: 0.5, color: 'text.secondary', fontSize: 18 }} /> }}
                  />
                  <FormControl fullWidth size="small">
                    <InputLabel>Select MSME</InputLabel>
                    <Select value={addMsmePick} label="Select MSME" onChange={ev => setAddMsmePick(ev.target.value)}>
                      <MenuItem value=""><em>Choose…</em></MenuItem>
                      {filtered.map(m => {
                        const isOwn  = m.assigned_bge === addMsmeDialog?.id;
                        const isFree = !m.assigned_bge;
                        const other  = !isFree && !isOwn ? m.assigned_bge_name : null;
                        return (
                          <MenuItem key={m.id} value={m.id}
                            sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                            <span>{m.business_name}</span>
                            {isOwn  && <Chip label="Already here" size="small" sx={{ fontSize:10, height:18, bgcolor:'#E8F5E9', color:'#2E7D32' }}/>}
                            {isFree && <Chip label="Unassigned"   size="small" sx={{ fontSize:10, height:18, bgcolor:'#E3F2FD', color:'#0277BD' }}/>}
                            {other  && <Chip label={`→ ${other}`} size="small" sx={{ fontSize:10, height:18, bgcolor:'#FFF3E0', color:'#E65100' }}/>}
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                  {alreadyElsewhere && (
                    <Alert severity="warning" sx={{ mt: 1.5 }} icon={false}>
                      <Typography variant="body2">
                        <strong>{alreadyElsewhere.business_name}</strong> is currently assigned to{' '}
                        <strong>{alreadyElsewhere.assigned_bge_name}</strong>.
                        Proceeding moves the primary assignment to <strong>{addMsmeDialog?.name}</strong>.
                        Both BGEs retain access for reporting.
                      </Typography>
                    </Alert>
                  )}
                </>
              );
            })()}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddMsmeDialog(null)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!addMsmePick}
              onClick={() => {
                const msme = msmes.find(m => m.id === addMsmePick);
                if (msme) {
                  setAddMsmeDialog(null);
                  setAssignTarget(msme);
                  setAssignForm({
                    bge_id: addMsmeDialog.id,
                    objectives: msme.assignment_objectives || '',
                    assignment_date: msme.assignment_date || new Date().toISOString().slice(0, 10),
                  });
                  setAssignDialog(true);
                }
              }}
            >
              Next: Set Objectives
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  };

  const openWoCreate = () => { setWoEditing(null); setWoDialog(true); };
  const openWoEdit = (wo) => { setWoEditing(wo); setWoDialog(true); };

  const issueWo = async (wo) => {
    setWoIssuing(wo.id);
    try {
      await axios.post(WORK_ORDER_ISSUE_URL(wo.id), {}, { headers });
      setSuccess(`Work order ${wo.work_order_number} issued and emailed to ${wo.bge_name}.`);
      fetchWorkOrders();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to issue work order.');
    } finally {
      setWoIssuing(null);
    }
  };

  const deleteWo = async (wo) => {
    if (!window.confirm(`Delete work order ${wo.work_order_number}?`)) return;
    try {
      await axios.delete(`${API_ENDPOINTS.WORK_ORDERS}${wo.id}/`, { headers });
      setSuccess('Work order deleted.');
      fetchWorkOrders();
    } catch {
      setError('Failed to delete work order.');
    }
  };

  const withdrawWo = async () => {
    if (!woWithdrawTarget) return;
    setWoWithdrawing(woWithdrawTarget.id);
    try {
      await axios.post(WORK_ORDER_WITHDRAW_URL(woWithdrawTarget.id), { reason: woWithdrawReason }, { headers });
      setSuccess(`Work order ${woWithdrawTarget.work_order_number} withdrawn. BGE has been notified by email.`);
      setWoWithdrawDialog(false);
      setWoWithdrawTarget(null);
      setWoWithdrawReason('');
      fetchWorkOrders();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to withdraw work order.');
    } finally {
      setWoWithdrawing(null);
    }
  };

  const downloadWoPdf = async (wo) => {
    try {
      const res = await axios.get(WORK_ORDER_PDF_URL(wo.id), {
        headers, responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `WorkOrder_${(wo.work_order_number || wo.id).replace(/\s/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { notify('Failed to download PDF', 'error'); }
  };

  const renderWorkOrders = () => (
    <Box>
      <SectionHeader title="Work Orders" subtitle={`${workOrders.length} work orders`}>
        <Button variant="contained" startIcon={<Add />} size="small" onClick={openWoCreate}>New Work Order</Button>
      </SectionHeader>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ flex: '1 1 160px', minWidth: 0 }}>
          <InputLabel>Filter by BGE</InputLabel>
          <Select value={woFilterBge} label="Filter by BGE" onChange={e => setWoFilterBge(e.target.value)}>
            <MenuItem value="">All BGEs</MenuItem>
            {experts.map(e => <MenuItem key={e.id} value={e.id}>{e.name} ({e.bge_code})</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: '1 1 110px', minWidth: 0 }}>
          <InputLabel>Status</InputLabel>
          <Select value={woFilterStatus} label="Status" onChange={e => setWoFilterStatus(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="issued">Issued</MenuItem>
            <MenuItem value="signed">Signed</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: '1 1 160px', minWidth: 0 }}>
          <InputLabel>Type</InputLabel>
          <Select value={woFilterType || ''} label="Type" onChange={e => setWoFilterType(e.target.value)}>
            <MenuItem value="">All Types</MenuItem>
            <MenuItem value="msme_support">MSME CRM &amp; Business Support</MenuItem>
            <MenuItem value="msme_data_update">MSME Data Update &amp; Verification</MenuItem>
            <MenuItem value="msme_finance_survey">MSME Finance Survey (Google Forms)</MenuItem>
            <MenuItem value="msme_access_finance">Access to Finance &amp; Digital Onboarding</MenuItem>
            <MenuItem value="biz_continuity">Business Continuity &amp; Operational Planning</MenuItem>
            <MenuItem value="mobilisation">Mobilisation / Outreach</MenuItem>
            <MenuItem value="group_session">Peer-to-Peer Group Session</MenuItem>
            <MenuItem value="training_facilitation">Training Facilitation — Senior BGE</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      {workOrders.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Assignment sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No work orders yet.</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {workOrders.map(wo => (
            <Card variant="outlined" key={wo.id}
              sx={wo.work_order_type === 'training_facilitation' ? { borderLeft: '4px solid #7B1FA2' } : {}}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                      <Typography fontWeight={700}>{wo.work_order_number}</Typography>
                      {wo.work_order_type === 'training_facilitation' && (
                        <Chip label="Senior BGE" size="small"
                          sx={{ bgcolor: '#7B1FA2', color: '#fff', fontSize: 10, fontWeight: 700 }} />
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {wo.work_order_type_display} · {wo.bge_name} ({wo.bge_code_display})
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Issued: {wo.issue_date}{wo.start_date ? ` · Start: ${wo.start_date}` : ''}{wo.end_date ? ` – ${wo.end_date}` : ''}
                    </Typography>
                    {wo.status === 'signed' && wo.bge_signed_date && (
                      <Typography variant="caption" color="success.main" display="block" fontWeight={600}>
                        Signed by BGE: {wo.bge_signed_date}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" display="block">{wo.location}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Chip
                      label={wo.status_display || wo.status}
                      size="small"
                      color={wo.status === 'signed' ? 'success' : wo.status === 'issued' ? 'primary' : 'default'}
                    />
                    {wo.status === 'draft' && (
                      <Tooltip title="Issue & email PDF to BGE">
                        <span>
                          <Button
                            variant="contained" size="small" color="success"
                            startIcon={woIssuing === wo.id ? <CircularProgress size={14} color="inherit" /> : <Email />}
                            disabled={woIssuing === wo.id}
                            onClick={() => issueWo(wo)}
                          >
                            Issue
                          </Button>
                        </span>
                      </Tooltip>
                    )}
                    {(wo.status === 'issued' || wo.status === 'signed') && (
                      <Tooltip title="Withdraw work order back to draft">
                        <Button
                          variant="outlined" size="small" color="warning"
                          startIcon={woWithdrawing === wo.id ? <CircularProgress size={14} color="inherit" /> : <Undo />}
                          disabled={woWithdrawing === wo.id}
                          onClick={() => { setWoWithdrawTarget(wo); setWoWithdrawReason(''); setWoWithdrawDialog(true); }}
                        >
                          Withdraw
                        </Button>
                      </Tooltip>
                    )}
                    {wo.status !== 'draft' && (
                      <Tooltip title={wo.status === 'signed' ? 'Download signed work order PDF' : 'Download work order PDF'}>
                        <IconButton
                          size="small"
                          color={wo.status === 'signed' ? 'success' : 'primary'}
                          onClick={() => downloadWoPdf(wo)}
                        >
                          <Download fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openWoEdit(wo)} disabled={wo.status !== 'draft'}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => deleteWo(wo)} disabled={wo.status !== 'draft'}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                {wo.objective && (
                  <Alert severity="info" sx={{ mt: 1.5, py: 0.5 }} icon={false}>
                    <Typography variant="caption" fontWeight={600}>Objective</Typography>
                    <Typography variant="caption" display="block">
                      {wo.objective.length > 200 ? wo.objective.slice(0, 200) + '…' : wo.objective}
                    </Typography>
                  </Alert>
                )}
                <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                  <Typography variant="caption" color="text.secondary">
                    Rate: <strong>UGX {Number(wo.rate_per_day).toLocaleString()}/day</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Max: <strong>{wo.max_days} days</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Net: <strong>UGX {(wo.rate_per_day * wo.max_days * 0.94).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Create / Edit Dialog — extracted to WorkOrderDialog to prevent full-Dashboard re-renders on keystrokes */}
      <WorkOrderDialog
        open={woDialog}
        onClose={() => setWoDialog(false)}
        woEditing={woEditing}
        experts={experts}
        headers={headers}
        fetchWorkOrders={fetchWorkOrders}
        onSaved={(msg) => { setSuccess(msg); setWoDialog(false); }}
      />

      {/* Withdraw confirmation dialog */}
      <Dialog open={woWithdrawDialog} onClose={() => setWoWithdrawDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Withdraw Work Order</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Withdrawing <strong>{woWithdrawTarget?.work_order_number}</strong> will reset it to draft status
            and notify <strong>{woWithdrawTarget?.bge_name}</strong> by email. You can then edit and re-issue it.
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Reason for withdrawal (optional)"
            multiline
            rows={3}
            value={woWithdrawReason}
            onChange={e => setWoWithdrawReason(e.target.value)}
            placeholder="e.g. Budget revision required, dates need updating..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWoWithdrawDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={withdrawWo}
            disabled={woWithdrawing === woWithdrawTarget?.id}
            startIcon={woWithdrawing === woWithdrawTarget?.id ? <CircularProgress size={14} color="inherit" /> : null}
          >
            Withdraw & Notify BGE
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  const renderParticipation = () => {
    const s = participationSummary;

    const statBox = (label, value, color = '#1565C0') => (
      <Grid item xs={6} sm={4} md={3} lg={2} key={label}>
        <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="h4" fontWeight={700} sx={{ color }}>{value ?? '—'}</Typography>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Paper>
      </Grid>
    );

    const demCells = (row) => (
      <>
        <TableCell align="center">
          <Chip label={row.total} size="small"
            color={row.total > 0 ? 'primary' : 'default'} />
        </TableCell>
        <TableCell align="center">{row.female || 0}</TableCell>
        <TableCell align="center">{row.male || 0}</TableCell>
        <TableCell align="center" sx={{ color: '#E65100' }}>
          {(row.female_youth || 0) + (row.male_youth || 0) || 0}
        </TableCell>
        <TableCell align="center">
          {row.refugees_total > 0
            ? <Chip label={row.refugees_total} size="small" color="warning" />
            : 0}
        </TableCell>
        <TableCell align="center">{row.host_community || 0}</TableCell>
      </>
    );

    const demHeader = (
      <>
        <TableCell align="center">Present</TableCell>
        <TableCell align="center">F</TableCell>
        <TableCell align="center">M</TableCell>
        <TableCell align="center">Youth</TableCell>
        <TableCell align="center">Refugees</TableCell>
        <TableCell align="center">Host Comm.</TableCell>
      </>
    );

    return (
      <Box sx={{ p: 3 }}>
        {/* Header row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>Participation</Typography>
            <Typography variant="body2" color="text.secondary">
              Live attendance tracking across all training sessions
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Filter by Cohort</InputLabel>
              <Select value={participationCohort} label="Filter by Cohort"
                onChange={e => { setParticipationCohort(e.target.value); fetchParticipationSummary(e.target.value); }}>
                <MenuItem value="">All Cohorts</MenuItem>
                {cohorts.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="outlined" size="small" startIcon={participationLoading ? <CircularProgress size={14} /> : null}
              onClick={() => fetchParticipationSummary(participationCohort)} disabled={participationLoading}>
              Refresh
            </Button>
          </Box>
        </Box>

        {participationLoading && !s ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : !s ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary" gutterBottom>No participation data yet.</Typography>
            <Button variant="contained" onClick={() => fetchParticipationSummary('')}>Load Summary</Button>
          </Box>
        ) : (
          <>
            {/* ── 1. Per-Session table ───────────────────────────────────────── */}
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Training Sessions ({(s.by_session || []).length})
            </Typography>
            {(s.by_session || []).length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 3 }}>No training sessions recorded yet.</Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#EEF2F8' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Session / Topic</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Lead BGE</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Reg.</TableCell>
                      {demHeader}
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Lead Report</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Mentor Reports</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(s.by_session || []).map(sess => {
                      const noAtt = sess.total === 0;
                      const bgColor = noAtt ? '#FFFDE7' : 'inherit';
                      return (
                        <TableRow key={sess.session_id} hover sx={{ bgcolor: bgColor }}>
                          <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            {sess.session_date}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 220 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {sess.session_title}
                            </Typography>
                            {sess.topic_name && (
                              <Typography variant="caption" color="text.secondary" display="block" noWrap>
                                {sess.topic_number ? `§${sess.topic_number} · ` : ''}{sess.topic_name}
                              </Typography>
                            )}
                            {sess.session_location && (
                              <Typography variant="caption" color="text.secondary" display="block" noWrap>
                                📍 {sess.session_location}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontSize: 12 }}>
                            {sess.lead_bge_name || <Typography variant="caption" color="text.secondary">—</Typography>}
                            {(sess.mentor_names || []).length > 0 && (
                              <Typography variant="caption" display="block" color="text.secondary" noWrap>
                                +{sess.mentor_names.length} mentor{sess.mentor_names.length > 1 ? 's' : ''}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="caption" color="text.secondary">{sess.registered_count}</Typography>
                          </TableCell>
                          {demCells(sess)}
                          <TableCell align="center">
                            {sess.has_training_report
                              ? <Chip label="Filed" size="small" color="success" />
                              : <Chip label="Pending" size="small" color="default" />}
                          </TableCell>
                          <TableCell align="center">
                            {sess.mentor_report_count > 0
                              ? <Chip label={sess.mentor_report_count} size="small" color="info" />
                              : <Typography variant="caption" color="text.secondary">—</Typography>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* ── 2. Overall totals ─────────────────────────────────────────── */}
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Overall Attendance Totals</Typography>
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {statBox('Total Present', s.total, '#1565C0')}
              {statBox('Female', s.female, '#AD1457')}
              {statBox('Male', s.male, '#1565C0')}
              {statBox('Female Youth (18–34)', s.female_youth, '#AD1457')}
              {statBox('Male Youth (18–34)', s.male_youth, '#1565C0')}
              {statBox('Adult Female', s.female_adult, '#AD1457')}
              {statBox('Adult Male', s.male_adult, '#1565C0')}
              {statBox('Refugees', s.refugees_total, '#E65100')}
              {statBox('Female Refugees', s.refugee_female, '#E65100')}
              {statBox('Male Refugees', s.refugee_male, '#E65100')}
              {statBox('Host Community', s.host_community, '#2E7D32')}
            </Grid>

            {/* ── 3. BGE report totals ──────────────────────────────────────── */}
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>BGE Field Reports</Typography>
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {statBox('MSME Visit Reports', s.msme_reports, '#5C6BC0')}
              {statBox('Unique MSMEs Visited', s.unique_msmes_visited, '#5C6BC0')}
              {statBox('Group Sessions Filed', s.group_sessions, '#00695C')}
            </Grid>

            {/* ── 4. Per-cohort breakdown ───────────────────────────────────── */}
            {(s.by_cohort || []).length > 0 && (
              <>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>Attendance by Cohort</Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Cohort</TableCell>
                        {demHeader}
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Youth Total</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Adults</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>MSME Reports</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Unique MSMEs</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {s.by_cohort.map(c => (
                        <TableRow key={c.cohort_id} hover>
                          <TableCell sx={{ fontWeight: 500 }}>{c.cohort_name}</TableCell>
                          {demCells(c)}
                          <TableCell align="center">{(c.male_youth || 0) + (c.female_youth || 0)}</TableCell>
                          <TableCell align="center">{(c.male_adult || 0) + (c.female_adult || 0)}</TableCell>
                          <TableCell align="center">{c.msme_reports}</TableCell>
                          <TableCell align="center">{c.unique_msmes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {/* ── 5. Per-work-order (BGE deployment) breakdown ─────────────── */}
            {(s.by_work_order || []).length > 0 && (
              <>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>By BGE Deployment / Work Order</Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Work Order</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>BGE</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                        {demHeader}
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Reports</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Unique MSMEs</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {s.by_work_order.map(w => (
                        <TableRow key={w.work_order_id} hover>
                          <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>{w.work_order_number}</TableCell>
                          <TableCell sx={{ fontSize: 12 }}>{w.bge_name}</TableCell>
                          <TableCell sx={{ fontSize: 12 }}>{w.work_order_type}</TableCell>
                          <TableCell>
                            <Chip label={w.status} size="small"
                              color={w.status === 'signed' ? 'success' : w.status === 'issued' ? 'primary' : 'default'} />
                          </TableCell>
                          {demCells(w)}
                          <TableCell align="center">{w.msme_reports}</TableCell>
                          <TableCell align="center">{w.unique_msmes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </>
        )}
      </Box>
    );
  };

  // ── Communications ────────────────────────────────────────────────────────
  const COMM_TEMPLATES = [
    {
      key: 'bge_guidance',
      label: 'BGE — Data Update & Annual Review Guide',
      subject: 'How to Use the Data Update Tool and Annual Review Template',
      body: `Dear {{name}},

We hope this message finds you well. This email provides a quick guide on two key tools you will use during your support visits.

---

DATA COLLECTION VISIT — Data Update Tool

The Data Update Tool helps you capture the latest business metrics for each MSME you support. Please follow these steps:

1. Log in to the portal and navigate to "My MSMEs".
2. Select the MSME you just visited.
3. Click "Record Growth Snapshot" and fill in the current figures (revenue, employees, etc.).
4. Submit the form. The data is saved immediately.

Tips:
- Record figures as reported by the business owner. Do not estimate.
- If the owner is unsure of a number, note this in the "Remarks" field.
- Always confirm the reporting period with the owner before submitting.

---

ANNUAL REVIEW TEMPLATE

After completing a Data Update visit, you should also file an Annual Review Report. This report captures qualitative observations that the numbers alone cannot show.

1. Go to "My Reports" and click "New Report".
2. Select "Annual Review" as the report type and choose the MSME.
3. Complete all sections, paying special attention to:
   - Data Confidence Level — Was the business owner confident or guessing?
   - Records Sighted — Did you see physical or digital records to verify the figures?
   - Owner Certainty Observation — Note any hesitations or inconsistencies.
   - Data Collection Challenges — Record any difficulties encountered.
4. Submit the report. It will be reviewed and signed off by the programme team.

If you have any questions, please reply to this email.

Best regards,
PRUDEV II BDS Team`,
    },
    {
      key: 'msme_data_visit',
      label: 'MSME — Upcoming Data Visit Notification',
      subject: 'A Quick Check-In From the PRUDEV II Team',
      body: `Dear {{name}},

We hope you and your business are doing well.

As you may recall, we recently held a training session on business compliance and governance — and we are truly grateful for your participation and continued engagement with the PRUDEV II programme.

As part of our ongoing commitment to supporting your growth, we are now reaching out to check on how things are progressing. We want to understand the real impact our training and support have been making, and to hear directly from you about what is working and what more we can do.

To that end, we are sending one of our Business Growth Experts (BGEs) to visit you at your business. They will be in touch with you shortly to arrange a convenient time to come by. The visit will be brief and informal — they simply want to sit with you, listen, and document how your business is doing at this stage.

We kindly ask that you make yourself available this week or next week to receive them. Your honest feedback means a great deal to us and will directly shape how we support you going forward.

Thank you for being such a valued part of the PRUDEV II community. We look forward to seeing you soon.

Warm regards,
PRUDEV II BDS Team`,
    },
  ];

  const [commChannel, setCommChannel] = React.useState('email'); // 'email' | 'sms'
  const [commTab, setCommTab] = React.useState(0); // 0=BGEs 1=MSMEs
  const [commSearch, setCommSearch] = React.useState('');
  const [commSelected, setCommSelected] = React.useState(new Set());
  const [commSubject, setCommSubject] = React.useState('');
  const [commBody, setCommBody] = React.useState('');
  const [commTemplate, setCommTemplate] = React.useState('');
  const [commSending, setCommSending] = React.useState(false);
  const [commConfirm, setCommConfirm] = React.useState(false);
  const [commSkipSent, setCommSkipSent] = React.useState(false);
  const [commAlreadySent, setCommAlreadySent] = React.useState([]);  // ids already sent this subject
  // ── SMS state ──────────────────────────────────────────────────────────────
  const [smsTab, setSmsTab] = React.useState(0); // 0=BGEs 1=MSMEs
  const [smsSearch, setSmsSearch] = React.useState('');
  const [smsSelected, setSmsSelected] = React.useState(new Set());
  const [smsBody, setSmsBody] = React.useState('');
  const [smsSending, setSmsSending] = React.useState(false);
  const [smsConfirm, setSmsConfirm] = React.useState(false);
  const [smsBalance, setSmsBalance] = React.useState(null);      // credits balance
  const [smsBalanceLoading, setSmsBalanceLoading] = React.useState(false);
  const [smsBalanceError, setSmsBalanceError] = React.useState(null);
  const [smsBalanceBefore, setSmsBalanceBefore] = React.useState(null); // snapshot before send

  // ── Session MSME notification dialog ────────────────────────────────────
  const [sessionNotifyDialog, setSessionNotifyDialog] = React.useState(false);
  const [sessionNotifySession, setSessionNotifySession] = React.useState(null);
  const [sessionNotifySubject, setSessionNotifySubject] = React.useState('');
  const [sessionNotifyBody, setSessionNotifyBody] = React.useState('');
  const [sessionNotifySending, setSessionNotifySending] = React.useState(false);
  const [sessionNotifySkip, setSessionNotifySkip] = React.useState(false);
  const [sessionNotifyAlreadySent, setSessionNotifyAlreadySent] = React.useState([]);

  const openSessionNotify = async (s) => {
    setSessionNotifySession(s);
    setSessionNotifySkip(false);
    setSessionNotifyAlreadySent([]);
    const msmeNames = (s.businesses_detail || []).map(m => `- ${m.business_name}${m.owner_name ? ` (${m.owner_name})` : ''}`).join('\n');
    setSessionNotifySubject(`Training Session: ${s.title}`);
    setSessionNotifyBody(
`Dear {{name}},

We are pleased to inform you that your business has been registered to participate in an upcoming training session under the PRUDEV II programme.

Training Details:
- Title: ${s.title}
- Date: ${s.date}${s.location ? `\n- Location: ${s.location}` : ''}${(s.team||[]).find(m=>m.role==='lead')?.bge_name ? `\n- Lead Facilitator: ${(s.team||[]).find(m=>m.role==='lead').bge_name}` : ''}

${(s.businesses_detail || []).length > 1 ? `Participating MSMEs:\n${msmeNames}\n\n` : ''}Please make sure you are available on the day of the training. Your participation is very important for your business growth and for the success of the programme.

If you have any questions or need to make alternative arrangements, please get in touch with us as soon as possible.

We look forward to seeing you there.

Warm regards,
PRUDEV II BDS Team`
    );
    setSessionNotifyDialog(true);
    // check who was already sent this subject
    const ids = (s.businesses_detail || []).map(m => m.id);
    if (ids.length) {
      const subject = `Training Session: ${s.title}`;
      const params = new URLSearchParams({ subject, recipient_type: 'msme' });
      ids.forEach(id => params.append('ids', id));
      try {
        const r = await axios.get(`${BULK_EMAIL_LOG}?${params}`, { headers });
        setSessionNotifyAlreadySent(r.data.already_sent || []);
      } catch { /* silent */ }
    }
  };

  const sendSessionNotify = async () => {
    setSessionNotifySending(true);
    try {
      const ids = (sessionNotifySession.businesses_detail || []).map(m => m.id);
      const res = await axios.post(BULK_EMAIL, {
        recipient_type: 'msme',
        recipient_ids: ids,
        subject: sessionNotifySubject,
        body: sessionNotifyBody,
        skip_already_sent: sessionNotifySkip,
      }, { headers });
      const d = res.data;
      const parts = [`Queued: ${d.queued ?? d.sent ?? 0}`];
      if (d.skipped > 0) parts.push(`Skipped: ${d.skipped}`);
      if (d.duplicates_removed > 0) parts.push(`Duplicates removed: ${d.duplicates_removed}`);
      notify(parts.join(' · '), 'success');
      setSessionNotifyDialog(false);
    } catch (err) {
      const d = err.response?.data;
      notify(d?.detail || d?.error || 'Failed to send notifications', 'error');
    } finally {
      setSessionNotifySending(false);
    }
  };

  const commRecipients = commTab === 0
    ? experts.filter(e => e.email)
    : msmes.filter(m => m.email);

  const commFiltered = commRecipients.filter(r => {
    const name = commTab === 0
      ? (r.name || r.full_name || r.expert_name || '')
      : (r.business_name || r.owner_name || '');
    return name.toLowerCase().includes(commSearch.toLowerCase()) ||
      (r.email || '').toLowerCase().includes(commSearch.toLowerCase());
  });

  const commAllSelected = commFiltered.length > 0 && commFiltered.every(r => commSelected.has(r.id));

  const toggleCommAll = () => {
    if (commAllSelected) {
      setCommSelected(prev => {
        const next = new Set(prev);
        commFiltered.forEach(r => next.delete(r.id));
        return next;
      });
    } else {
      setCommSelected(prev => {
        const next = new Set(prev);
        commFiltered.forEach(r => next.add(r.id));
        return next;
      });
    }
  };

  const handleCommTemplate = (key) => {
    setCommTemplate(key);
    const tmpl = COMM_TEMPLATES.find(t => t.key === key);
    if (tmpl) {
      setCommSubject(tmpl.subject);
      setCommBody(tmpl.body);
    }
  };

  // Check send log whenever subject or recipient list changes
  React.useEffect(() => {
    if (!commSubject.trim() || commFiltered.length === 0) { setCommAlreadySent([]); return; }
    const ids = commFiltered.map(r => r.id);
    const rtype = commTab === 0 ? 'bge' : 'msme';
    const params = new URLSearchParams({ subject: commSubject, recipient_type: rtype });
    ids.forEach(id => params.append('ids', id));
    axios.get(`${BULK_EMAIL_LOG}?${params}`, { headers })
      .then(r => setCommAlreadySent(r.data.already_sent || []))
      .catch(() => setCommAlreadySent([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commSubject, commTab, commFiltered.length]);

  const handleCommSend = async () => {
    setCommConfirm(false);
    setCommSending(true);
    try {
      const selectedList = commFiltered.filter(r => commSelected.has(r.id));
      const payload = {
        recipient_type: commTab === 0 ? 'bge' : 'msme',
        recipient_ids: selectedList.map(r => r.id),
        subject: commSubject,
        body: commBody,
        skip_already_sent: commSkipSent,
      };
      const res = await axios.post(BULK_EMAIL, payload, { headers });
      const d = res.data;
      const parts = [`Queued: ${d.queued ?? d.sent ?? 0}`];
      if (d.skipped > 0) parts.push(`Skipped (already sent): ${d.skipped}`);
      if (d.duplicates_removed > 0) parts.push(`Duplicates removed: ${d.duplicates_removed}`);
      if (d.failed > 0) parts.push(`Failed: ${d.failed}`);
      notify(parts.join(' · '), 'success');
      setCommSelected(new Set());
      setCommAlreadySent([]);
    } catch (err) {
      const d = err.response?.data;
      notify(d?.detail || d?.error || d?.body?.[0] || 'Failed to send emails', 'error');
    } finally {
      setCommSending(false);
    }
  };

  // ── SMS helpers ────────────────────────────────────────────────────────────
  const fetchSmsBalance = React.useCallback(async () => {
    setSmsBalanceLoading(true);
    setSmsBalanceError(null);
    try {
      const res = await axios.get(BULK_SMS_BALANCE, { headers });
      const bal = res.data.balance;
      if (bal != null) {
        setSmsBalance(bal);
      } else {
        setSmsBalance(null);
        setSmsBalanceError(res.data.message || 'Could not read balance');
      }
    } catch (err) {
      setSmsBalance(null);
      setSmsBalanceError(err.response?.data?.detail || 'Failed to connect to SMS provider');
    } finally {
      setSmsBalanceLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-fetch balance when switching to SMS channel
  React.useEffect(() => {
    if (commChannel === 'sms') fetchSmsBalance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commChannel]);

  const SMS_TEMPLATES = [
    {
      key: 'data_reminder',
      label: 'BGE — Data update reminder',
      body: 'Dear {{name}}, please log in to the PRUDEV II portal and submit data updates for your MSMEs. Thank you. — PRUDEV II BDS Team',
    },
    {
      key: 'visit_notify',
      label: 'MSME — BGE visit notification',
      body: 'Dear {{name}}, a PRUDEV II Business Growth Expert will visit your business this week to check on your progress. Kindly be available. — PRUDEV II BDS Team',
    },
    {
      key: 'training_reminder',
      label: 'MSME — Training session reminder',
      body: 'Dear {{name}}, you are invited to a PRUDEV II training session. Please contact your BGE for the date and venue. — PRUDEV II BDS Team',
    },
  ];

  const smsRecipients = smsTab === 0
    ? experts.filter(e => e.phone)
    : msmes.filter(m => m.phone);

  const smsFiltered = smsRecipients.filter(r => {
    const name = smsTab === 0 ? (r.name || '') : (r.business_name || r.owner_name || '');
    return name.toLowerCase().includes(smsSearch.toLowerCase()) ||
      (r.phone || '').includes(smsSearch);
  });

  const smsAllSelected = smsFiltered.length > 0 && smsFiltered.every(r => smsSelected.has(r.id));
  const toggleSmsAll = () => {
    if (smsAllSelected) {
      setSmsSelected(prev => { const n = new Set(prev); smsFiltered.forEach(r => n.delete(r.id)); return n; });
    } else {
      setSmsSelected(prev => { const n = new Set(prev); smsFiltered.forEach(r => n.add(r.id)); return n; });
    }
  };

  const handleSmsSend = async () => {
    setSmsConfirm(false);
    setSmsSending(true);
    setSmsBalanceBefore(smsBalance); // snapshot balance before send
    try {
      const selectedList = smsFiltered.filter(r => smsSelected.has(r.id));
      const res = await axios.post(BULK_SMS, {
        recipient_type: smsTab === 0 ? 'bge' : 'msme',
        recipient_ids: selectedList.map(r => r.id),
        message: smsBody,
      }, { headers });
      const d = res.data;
      notify(`Queued: ${d.queued} SMS message${d.queued !== 1 ? 's' : ''}${d.duplicates_removed > 0 ? ` · Duplicates removed: ${d.duplicates_removed}` : ''}`, 'success');
      setSmsSelected(new Set());
      // Refresh balance after a short delay to let the provider update
      setTimeout(() => fetchSmsBalance(), 3000);
    } catch (err) {
      const d = err.response?.data;
      notify(d?.detail || d?.error || 'Failed to send SMS', 'error');
    } finally {
      setSmsSending(false);
    }
  };

  const renderCommunications = () => (
    <Box>
      <SectionHeader title="Communications" subtitle="Send bulk emails or SMS to BGEs or MSMEs" />

      {/* Channel toggle */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1 }}>
        <Button
          variant={commChannel === 'email' ? 'contained' : 'outlined'}
          size="small"
          startIcon={<span>✉️</span>}
          onClick={() => setCommChannel('email')}
        >Email</Button>
        <Button
          variant={commChannel === 'sms' ? 'contained' : 'outlined'}
          size="small"
          color={commChannel === 'sms' ? 'success' : 'primary'}
          startIcon={<span>💬</span>}
          onClick={() => { setCommChannel('sms'); fetchSmsBalance(); }}
        >SMS</Button>
      </Paper>

      {commChannel === 'sms' ? (
        /* ── SMS panel ──────────────────────────────────────────────── */
        <Box>
          {/* Wallet / balance card */}
          <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, bgcolor: 'success.50', borderColor: 'success.200' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ fontSize: 28 }}>💳</Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>SMS Credits</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, color: smsBalanceLoading ? 'text.disabled' : smsBalance != null ? 'success.dark' : 'error.main' }}>
                  {smsBalanceLoading ? '…' : smsBalance != null ? `UGX ${smsBalance}` : '—'}
                </Typography>
                {smsBalanceError && !smsBalanceLoading && (
                  <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                    {smsBalanceError}
                  </Typography>
                )}
                {smsBalanceBefore != null && smsBalance != null && smsBalanceBefore !== smsBalance && (
                  <Typography variant="caption" color="text.secondary">
                    Was UGX {smsBalanceBefore} → now UGX {smsBalance}
                  </Typography>
                )}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" variant="outlined" color="success" onClick={fetchSmsBalance} disabled={smsBalanceLoading}>
                {smsBalanceLoading ? <CircularProgress size={14} /> : '↻ Refresh'}
              </Button>
              <Button size="small" variant="contained" color="success"
                href="https://www.messagecarrier.africa/app/wallet" target="_blank" rel="noopener">
                + Top Up
              </Button>
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>SMS Template</Typography>
            <FormControl size="small" fullWidth sx={{ mb: 2 }}>
              <InputLabel>Load a template (optional)</InputLabel>
              <Select
                value={''}
                label="Load a template (optional)"
                onChange={e => { const t = SMS_TEMPLATES.find(x => x.key === e.target.value); if (t) setSmsBody(t.body); }}
              >
                <MenuItem value=""><em>— none —</em></MenuItem>
                {SMS_TEMPLATES.map(t => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="Message"
              value={smsBody}
              onChange={e => setSmsBody(e.target.value)}
              fullWidth multiline minRows={4}
              inputProps={{ maxLength: 480 }}
              helperText={`${smsBody.length} characters · ${Math.ceil(smsBody.length / 160) || 1} SMS part(s). Use {{name}} to personalise.`}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              <Tabs value={smsTab} onChange={(_, v) => { setSmsTab(v); setSmsSelected(new Set()); setSmsSearch(''); }}>
                <Tab label={`BGE Experts (${experts.filter(e => e.phone).length})`} />
                <Tab label={`MSMEs (${msmes.filter(m => m.phone).length})`} />
              </Tabs>
              {smsSelected.size > 0 && (
                <Chip label={`${smsSelected.size} selected`} color="success" size="small" onDelete={() => setSmsSelected(new Set())} />
              )}
            </Box>

            <TextField
              size="small" placeholder="Search by name or phone…"
              value={smsSearch} onChange={e => setSmsSearch(e.target.value)}
              InputProps={{ startAdornment: <Search sx={{ mr: 0.5, color: 'text.secondary', fontSize: 18 }} /> }}
              sx={{ mb: 1, width: { xs: '100%', sm: 280 } }}
            />

            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 320, overflowY: 'auto' }}>
              <ListItemButton onClick={toggleSmsAll} dense sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
                <ListItemIcon><Checkbox checked={smsAllSelected} indeterminate={smsSelected.size > 0 && !smsAllSelected} size="small" disableRipple tabIndex={-1} /></ListItemIcon>
                <ListItemText primary={<Typography variant="body2" fontWeight={600}>{smsAllSelected ? 'Deselect all' : `Select all (${smsFiltered.length})`}</Typography>} />
              </ListItemButton>
              {smsFiltered.length === 0 && (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">No recipients with phone numbers found.</Typography>
                </Box>
              )}
              {smsFiltered.map(r => {
                const name = smsTab === 0 ? (r.name || '—') : (r.business_name || '—');
                const sub  = smsTab === 0 ? (r.location || r.bge_code || '') : (r.owner_name || '');
                return (
                  <ListItemButton key={r.id} onClick={() => setSmsSelected(prev => {
                    const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n;
                  })} dense>
                    <ListItemIcon><Checkbox checked={smsSelected.has(r.id)} size="small" disableRipple tabIndex={-1} /></ListItemIcon>
                    <ListItemText
                      primary={name}
                      secondary={`📱 ${r.phone}${sub ? ' · ' + sub : ''}`}
                    />
                  </ListItemButton>
                );
              })}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={smsSending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                disabled={smsSelected.size === 0 || !smsBody.trim() || smsSending}
                onClick={() => setSmsConfirm(true)}
              >
                Send SMS to {smsSelected.size} recipient{smsSelected.size !== 1 ? 's' : ''}
              </Button>
            </Box>
          </Paper>

          {/* SMS Confirm dialog */}
          <Dialog open={smsConfirm} onClose={() => setSmsConfirm(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Confirm Bulk SMS</DialogTitle>
            <DialogContent>
              <Typography variant="body2" sx={{ mb: 1 }}>
                You are about to send an SMS to <strong>{smsSelected.size} recipient{smsSelected.size !== 1 ? 's' : ''}</strong>.
              </Typography>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                  {smsBody.substring(0, 200)}{smsBody.length > 200 ? '…' : ''}
                </Typography>
              </Paper>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {Math.ceil(smsBody.length / 160)} SMS part(s) per recipient · via Message Carrier
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSmsConfirm(false)}>Cancel</Button>
              <Button variant="contained" color="success" startIcon={<SendIcon />} onClick={handleSmsSend}>Send</Button>
            </DialogActions>
          </Dialog>
        </Box>
      ) : (
        /* ── Email panel (existing) ──────────────────────────────────── */
        <Box>

      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Email Template</Typography>
        <FormControl size="small" fullWidth>
          <InputLabel>Load a template (optional)</InputLabel>
          <Select
            value={commTemplate}
            label="Load a template (optional)"
            onChange={e => handleCommTemplate(e.target.value)}
          >
            <MenuItem value=""><em>— none —</em></MenuItem>
            {COMM_TEMPLATES.map(t => (
              <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Message</Typography>
        <TextField
          label="Subject"
          value={commSubject}
          onChange={e => setCommSubject(e.target.value)}
          fullWidth size="small" sx={{ mb: 1.5 }}
        />
        <TextField
          label="Body"
          value={commBody}
          onChange={e => setCommBody(e.target.value)}
          fullWidth multiline minRows={8}
          helperText="Use {{name}} to personalise with the recipient's first name."
        />
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          <Tabs value={commTab} onChange={(_, v) => { setCommTab(v); setCommSelected(new Set()); setCommSearch(''); }}>
            <Tab label={`BGE Experts (${experts.filter(e => e.email).length})`} />
            <Tab label={`MSMEs (${msmes.filter(m => m.email).length})`} />
          </Tabs>
          {commSelected.size > 0 && (
            <Chip
              label={`${commSelected.size} selected`}
              color="primary" size="small"
              onDelete={() => setCommSelected(new Set())}
            />
          )}
        </Box>

        <TextField
          size="small" placeholder="Search by name or email…"
          value={commSearch} onChange={e => setCommSearch(e.target.value)}
          InputProps={{ startAdornment: <Search sx={{ mr: 0.5, color: 'text.secondary', fontSize: 18 }} /> }}
          sx={{ mb: 1, width: { xs: '100%', sm: 280 } }}
        />

        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 320, overflowY: 'auto' }}>
          <ListItemButton onClick={toggleCommAll} dense sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
            <ListItemIcon><Checkbox checked={commAllSelected} indeterminate={commSelected.size > 0 && !commAllSelected} size="small" disableRipple tabIndex={-1} /></ListItemIcon>
            <ListItemText primary={<Typography variant="body2" fontWeight={600}>{commAllSelected ? 'Deselect all' : `Select all (${commFiltered.length})`}</Typography>} />
          </ListItemButton>
          {commFiltered.length === 0 && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">No recipients found.</Typography>
            </Box>
          )}
          {commFiltered.map(r => {
            const name = commTab === 0
              ? (r.name || r.full_name || r.expert_name || '—')
              : (r.business_name || '—');
            const email = r.email;
            const sub = commTab === 0 ? (r.location || r.bge_code || '') : (r.owner_name || '');
            return (
              <ListItemButton key={r.id} onClick={() => setCommSelected(prev => {
                const next = new Set(prev);
                next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                return next;
              })} dense>
                <ListItemIcon><Checkbox checked={commSelected.has(r.id)} size="small" disableRipple tabIndex={-1} /></ListItemIcon>
                <ListItemText
                  primary={name}
                  secondary={`${email}${sub ? ' · ' + sub : ''}`}
                />
              </ListItemButton>
            );
          })}
        </Box>

        {commAlreadySent.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1.5 }}
            action={
              <Button size="small" color="inherit" onClick={() => setCommSkipSent(s => !s)}>
                {commSkipSent ? 'Include all' : 'Skip already sent'}
              </Button>
            }>
            {commAlreadySent.length} of your selected recipients already received this subject.
            {commSkipSent && ` They will be skipped.`}
          </Alert>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button
            variant="contained"
            startIcon={commSending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            disabled={commSelected.size === 0 || !commSubject.trim() || !commBody.trim() || commSending}
            onClick={() => setCommConfirm(true)}
          >
            Send to {commSelected.size} recipient{commSelected.size !== 1 ? 's' : ''}
          </Button>
        </Box>
      </Paper>

      {/* Confirmation dialog */}
      <Dialog open={commConfirm} onClose={() => setCommConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Bulk Email</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            You are about to send <strong>"{commSubject}"</strong> to{' '}
            <strong>{commSelected.size} recipient{commSelected.size !== 1 ? 's' : ''}</strong>.
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommConfirm(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<SendIcon />} onClick={handleCommSend}>
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
      )} {/* end email/sms ternary */}
    </Box>
  );

  // ── T-Shirt Receipts helpers ───────────────────────────────────────────────
  const tshirtDetail = tshirtDetailId ? tshirtReceipts.find(r => r.id === tshirtDetailId) : null;

  const openCreateTshirt = async () => {
    setTshirtForm({ title: 'PRUDEV II T-Shirt Collection', event: '', colour: 'Blue', notes: '' });
    setTshirtFormEntries([]);
    setTshirtBgeSearch('');
    setTshirtDialog(true);

    // Fetch experts fresh every time the dialog opens so the list is always current
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(API_ENDPOINTS.EXPERTS, { headers: h });
      const bgeList = Array.isArray(res.data) ? res.data : res.data.results || [];
      setExperts(bgeList);
      const sorted = [...bgeList].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setTshirtFormEntries(sorted.map((e, idx) => ({ bge_id: e.id, name: e.name, size: 'L', quantity: 1, order: idx })));
    } catch {
      // fall back to whatever is already in state
      const sorted = [...experts].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setTshirtFormEntries(sorted.map((e, idx) => ({ bge_id: e.id, name: e.name, size: 'L', quantity: 1, order: idx })));
    }
  };

  const handleCreateTshirt = async () => {
    const h = { Authorization: `Bearer ${token}` };
    setTshirtSaving(true);
    try {
      const rRes = await axios.post(API_ENDPOINTS.TSHIRT_RECEIPTS, {
        title: tshirtForm.title,
        event: tshirtForm.event,
        colour: tshirtForm.colour,
        notes: tshirtForm.notes,
      }, { headers: h });
      const receiptId = rRes.data.id;
      const selected = tshirtFormEntries.filter(e => e._selected !== false);
      await Promise.all(selected.map((e, idx) =>
        axios.post(API_ENDPOINTS.TSHIRT_ENTRIES, {
          receipt: receiptId,
          bge: e.bge_id,
          size: e.size,
          quantity: e.quantity,
          order: e.order ?? idx,
        }, { headers: h })
      ));
      setTshirtDialog(false);
      await fetchTshirtReceipts();
      setSuccess('T-shirt receipt created successfully.');
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || 'Failed to create receipt.');
    } finally {
      setTshirtSaving(false);
    }
  };

  const handleTshirtBulkSign = async (receiptId) => {
    const h = { Authorization: `Bearer ${token}` };
    setTshirtBulkSigning(true);
    try {
      const res = await axios.post(TSHIRT_RECEIPT_BULK_SIGN(receiptId), {}, { headers: h });
      await fetchTshirtReceipts();
      setSuccess(`Bulk sign complete — ${res.data.signed} BGE(s) signed.`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Bulk sign failed.');
    } finally {
      setTshirtBulkSigning(false);
    }
  };

  const handleDownloadTshirtPdf = async (receiptId) => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(TSHIRT_RECEIPT_PDF_URL(receiptId), { headers: h, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      const receipt = tshirtReceipts.find(r => r.id === receiptId);
      a.download = `tshirt-receipt-${receipt?.title?.replace(/\s+/g, '-') || receiptId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download PDF.');
    }
  };

  // ── renderTshirtReceipts ───────────────────────────────────────────────────
  const renderTshirtReceipts = () => {
    const filteredFormEntries = tshirtFormEntries.filter(e =>
      !tshirtBgeSearch || (e.name || '').toLowerCase().includes(tshirtBgeSearch.toLowerCase())
    );
    const selectedCount = tshirtFormEntries.filter(e => e._selected !== false).length;

    return (
      <Box>
        <SectionHeader
          title="T-Shirt Receipts"
          subtitle="Create digital sign-off receipts for BGE t-shirt distribution"
        >
          <Button variant="contained" startIcon={<Add />} onClick={openCreateTshirt}>
            Create Receipt
          </Button>
        </SectionHeader>

        {tshirtLoading && <LinearProgress sx={{ mb: 2 }} />}

        {tshirtReceipts.length === 0 && !tshirtLoading && (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
            <Checkroom sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" color="text.secondary">No receipts yet.</Typography>
            <Typography variant="body2" color="text.secondary">Create a receipt to track t-shirt distribution.</Typography>
          </Paper>
        )}

        {tshirtReceipts.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Event</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Colour</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Progress</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {tshirtReceipts.slice(tshirtPage * ROWS_PER_PAGE, (tshirtPage + 1) * ROWS_PER_PAGE).map(r => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{r.title}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{r.event || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{r.colour}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          size="small"
                          label={`${r.signed_count}/${r.total_entries} signed`}
                          color={r.fully_signed ? 'success' : r.signed_count > 0 ? 'warning' : 'default'}
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="View details">
                          <IconButton size="small" onClick={() => setTshirtDetailId(r.id)}>
                            <Visibility fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download PDF">
                          <IconButton size="small" onClick={() => handleDownloadTshirtPdf(r.id)}>
                            <Download fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {tshirtReceipts.length > ROWS_PER_PAGE && (
              <TablePagination
                component="div"
                count={tshirtReceipts.length}
                rowsPerPage={ROWS_PER_PAGE}
                page={tshirtPage}
                onPageChange={(_, p) => setTshirtPage(p)}
                rowsPerPageOptions={[ROWS_PER_PAGE]}
              />
            )}
          </TableContainer>
        )}

        {/* ── Create Receipt dialog ────────────────────────────────────────── */}
        <Dialog open={tshirtDialog} onClose={() => setTshirtDialog(false)} maxWidth="md" fullWidth
          PaperProps={{ sx: { maxHeight: '90vh' } }}>
          <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkroom sx={{ color: BRAND.sidebarBg }} />
              <Typography variant="h6" fontWeight={700}>Create T-Shirt Receipt</Typography>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Receipt Title" fullWidth size="small"
                  value={tshirtForm.title}
                  onChange={e => setTshirtForm(f => ({ ...f, title: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Event / Programme" fullWidth size="small"
                  value={tshirtForm.event}
                  onChange={e => setTshirtForm(f => ({ ...f, event: e.target.value }))}
                  placeholder="e.g. BGE TOT 2026, Adjumani"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl size="small" fullWidth>
                  <InputLabel>T-Shirt Colour</InputLabel>
                  <Select
                    label="T-Shirt Colour"
                    value={tshirtForm.colour}
                    onChange={e => setTshirtForm(f => ({ ...f, colour: e.target.value }))}
                  >
                    {['Blue', 'White', 'Navy', 'Black', 'Grey', 'Green', 'Red'].map(c => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField
                  label="Notes (optional)" fullWidth size="small"
                  value={tshirtForm.notes}
                  onChange={e => setTshirtForm(f => ({ ...f, notes: e.target.value }))}
                />
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                BGE Recipients ({selectedCount} selected)
              </Typography>
              <TextField
                size="small" placeholder="Search BGEs…"
                value={tshirtBgeSearch}
                onChange={e => setTshirtBgeSearch(e.target.value)}
                InputProps={{ startAdornment: <Search sx={{ mr: 0.5, color: 'text.secondary', fontSize: 18 }} /> }}
                sx={{ width: 220 }}
              />
            </Box>

            <Paper variant="outlined" sx={{ maxHeight: 360, overflowY: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={tshirtFormEntries.length > 0 && tshirtFormEntries.every(e => e._selected !== false)}
                        indeterminate={tshirtFormEntries.some(e => e._selected !== false) && !tshirtFormEntries.every(e => e._selected !== false)}
                        onChange={e => setTshirtFormEntries(prev => prev.map(x => ({ ...x, _selected: e.target.checked })))}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>BGE Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 110 }}>Size</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 80 }}>Qty</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredFormEntries.map(entry => (
                    <TableRow key={entry.bge_id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={entry._selected !== false}
                          onChange={ev => setTshirtFormEntries(prev =>
                            prev.map(x => x.bge_id === entry.bge_id ? { ...x, _selected: ev.target.checked } : x)
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{entry.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {experts.find(e => e.id === entry.bge_id)?.bge_code || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Select
                          size="small" value={entry.size}
                          onChange={ev => setTshirtFormEntries(prev =>
                            prev.map(x => x.bge_id === entry.bge_id ? { ...x, size: ev.target.value } : x)
                          )}
                          sx={{ fontSize: 13, minWidth: 80 }}
                        >
                          {['L', 'XL', '2XL'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number" size="small" value={entry.quantity}
                          inputProps={{ min: 1, max: 5, style: { width: 44, textAlign: 'center' } }}
                          onChange={ev => setTshirtFormEntries(prev =>
                            prev.map(x => x.bge_id === entry.bge_id ? { ...x, quantity: Math.max(1, parseInt(ev.target.value) || 1) } : x)
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredFormEntries.length === 0 && tshirtFormEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Box sx={{ py: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                          <CircularProgress size={16} />
                          <Typography variant="body2" color="text.secondary">Loading BGE list…</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredFormEntries.length === 0 && tshirtFormEntries.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No BGEs match your search.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>
          </DialogContent>
          <DialogActions sx={{ borderTop: 1, borderColor: 'divider', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1, ml: 1 }}>
              {selectedCount} BGE(s) will be added to this receipt.
            </Typography>
            <Button onClick={() => setTshirtDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={tshirtSaving || !tshirtForm.title.trim() || selectedCount === 0}
              startIcon={tshirtSaving ? <CircularProgress size={16} color="inherit" /> : <Add />}
              onClick={handleCreateTshirt}
            >
              Create Receipt
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Detail / Signing dialog ──────────────────────────────────────── */}
        <Dialog open={!!tshirtDetailId} onClose={() => setTshirtDetailId(null)} maxWidth="md" fullWidth
          PaperProps={{ sx: { maxHeight: '90vh' } }}>
          {tshirtDetail && (() => {
            const r = tshirtDetail;
            return (
              <>
                <Box sx={{ bgcolor: BRAND.sidebarBg, px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                      T-Shirt Receipt
                    </Typography>
                    <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>{r.title}</Typography>
                    {r.event && <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>{r.event}</Typography>}
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Chip
                      label={`${r.signed_count}/${r.total_entries} signed`}
                      color={r.fully_signed ? 'success' : r.signed_count > 0 ? 'warning' : 'default'}
                      sx={{ fontWeight: 700 }}
                    />
                    {r.created_by_name && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.6)', mt: 0.5 }}>
                        Created by {r.created_by_name}
                      </Typography>
                    )}
                  </Box>
                </Box>

                <DialogContent sx={{ p: 0 }}>
                  <Box sx={{ display: 'flex', gap: 3, px: 3, py: 1.5, bgcolor: '#F8FAFC', borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap' }}>
                    {[
                      ['Colour', r.colour],
                      ['Total BGEs', r.total_entries],
                      ['Signed', r.signed_count],
                      ['Pending', r.total_entries - r.signed_count],
                      ['Created', r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'],
                    ].map(([label, val]) => (
                      <Box key={label}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Typography>
                        <Typography variant="body2" fontWeight={600}>{val}</Typography>
                      </Box>
                    ))}
                  </Box>

                  <TableContainer sx={{ maxHeight: 420 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                          <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>BGE Name</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Size</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Qty</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Signature</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(r.entries || []).map((entry, idx) => (
                          <TableRow key={entry.id} hover sx={{ bgcolor: entry.signed ? 'rgba(0,155,98,0.04)' : 'inherit' }}>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">{idx + 1}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{entry.bge_name}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">{entry.bge_code || '—'}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">{entry.bge_location || '—'}</Typography>
                            </TableCell>
                            <TableCell>
                              <Chip label={entry.size} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{entry.quantity}</Typography>
                            </TableCell>
                            <TableCell>
                              {entry.has_signature
                                ? <Chip label="On file" size="small" color="success" variant="outlined" />
                                : <Chip label="Missing" size="small" color="default" variant="outlined" />
                              }
                            </TableCell>
                            <TableCell>
                              {entry.signed ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <CheckCircle sx={{ fontSize: 16, color: '#009B62' }} />
                                  <Typography variant="body2" color="success.main" fontWeight={600}>
                                    Signed {entry.signed_at ? new Date(entry.signed_at).toLocaleDateString() : ''}
                                  </Typography>
                                </Box>
                              ) : (
                                <Chip label="Pending" size="small" color="default" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </DialogContent>

                <DialogActions sx={{ borderTop: '1px solid #E5E7EB', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    startIcon={tshirtBulkSigning ? <CircularProgress size={16} /> : <DrawOutlined />}
                    disabled={tshirtBulkSigning}
                    onClick={() => handleTshirtBulkSign(r.id)}
                  >
                    Bulk Sign (Admin)
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button
                    startIcon={<Download />}
                    onClick={() => handleDownloadTshirtPdf(r.id)}
                  >
                    Download PDF
                  </Button>
                  <Button onClick={() => setTshirtDetailId(null)}>Close</Button>
                </DialogActions>
              </>
            );
          })()}
        </Dialog>
      </Box>
    );
  };

  const sectionMap = {
    overview: renderOverview,
    msmes: renderMSMEs,
    experts: renderExperts,
    assignments: renderAssignments,
    users: renderUsers,
    bgegroups: renderBGEGroups,
    cohorts: renderCohorts,
    training: renderTraining,
    participation: renderParticipation,
    reports: renderReports,
    workorders: renderWorkOrders,
    analytics: renderAnalytics,
    communications: renderCommunications,
    tshirts: renderTshirtReceipts,
  };

  // ── main render ────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#fafafa' }}>
      {/* mobile top bar */}
      <AppBar position="fixed" sx={{ display: { md: 'none' }, bgcolor: BRAND.sidebarBg, zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <IconButton
            color="inherit" edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 1, p: 1.25, touchAction: 'manipulation' }}
            aria-label="Open navigation menu">
            <MenuIcon />
          </IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} noWrap>PRUDEV II</Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.7)', lineHeight: 1 }} noWrap>
              {orderedNav.find(item => item.key === section)?.label || 'Dashboard'}
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      {/* sidebar — permanent on desktop, drawer on mobile */}
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
          keepMounted disableScrollLock
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, maxWidth: '86vw', height: '100dvh', boxSizing: 'border-box', border: 'none' } }}>
          {drawerContent}
        </Drawer>
        <Drawer variant="permanent"
          sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, height: '100dvh', boxSizing: 'border-box', border: 'none' } }}>
          {drawerContent}
        </Drawer>
      </Box>

      {/* main content */}
      <Box component="main" sx={{
        flex: 1,
        width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` },
        p: { xs: 1.5, sm: 2, md: 3 },
        mt: { xs: 7, md: 0 },
        overflow: 'auto',
        minWidth: 0,
        overflowX: 'hidden',
      }}>
        {loading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}
        {sectionMap[section]?.()}
      </Box>

      {/* ── View dialog ──────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onClose={() => { setViewItem(null); setMsmeDetailTab(0); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', pb: 0 }}>
          <Typography variant="subtitle1" fontWeight={700}>{viewItem?.business_name || viewItem?.name} — Details</Typography>
          {viewItem && viewType === 'msme' && (
            <Tabs value={msmeDetailTab} onChange={(_, v) => setMsmeDetailTab(v)}
              textColor="primary" indicatorColor="primary" sx={{ mt: 0.5 }}>
              <Tab label="Profile" sx={{ fontSize: 12 }} />
              <Tab label={`Growth History (${adminSnapshots.filter(s => s.msme === viewItem.id).length})`} sx={{ fontSize: 12 }} />
            </Tabs>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {viewItem && viewType === 'expert' ? (
            /* ── BGE Expert view: show profile + assigned MSMEs ── */
            <Box>
              <Grid container spacing={1.5} sx={{ mb: 2 }}>
                {[
                  ['BGE Code', viewItem.bge_code],
                  ['Phone', viewItem.phone],
                  ['Email', viewItem.email],
                  ['Location', viewItem.location],
                  ['Status', viewItem.status],
                  ['Groups', (viewItem.group_names || []).join(', ') || '—'],
                ].map(([label, val]) => (
                  <Grid item xs={6} key={label}>
                    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                    <Typography variant="body2">{val || '—'}</Typography>
                  </Grid>
                ))}
              </Grid>

              <Divider sx={{ mb: 2 }} />

              {/* Signature preview + admin rotation controls */}
              {(viewItem.signature_url || viewItem.signature_data) && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Signature</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{
                      border: '1px solid #e0e0e0', borderRadius: 1, p: 1,
                      // checkered pattern so transparency is visible
                      backgroundImage: 'linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)',
                      backgroundSize: '10px 10px',
                      backgroundPosition: '0 0,0 5px,5px -5px,-5px 0',
                      display: 'inline-flex',
                    }}>
                      <img
                        src={viewItem.signature_url}
                        alt="BGE signature"
                        style={{ maxHeight: 64, maxWidth: 200, objectFit: 'contain' }}
                      />
                    </Box>
                    {isStaff && (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Rotate 90° counter-clockwise (left)">
                          <span>
                            <Button
                              size="small" variant="outlined" disabled={rotatingSig}
                              startIcon={rotatingSig ? <CircularProgress size={14}/> : <RotateLeft fontSize="small"/>}
                              onClick={() => rotateBgeSignature(viewItem.id, 'ccw')}
                            >CCW</Button>
                          </span>
                        </Tooltip>
                        <Tooltip title="Rotate 90° clockwise (right)">
                          <span>
                            <Button
                              size="small" variant="outlined" disabled={rotatingSig}
                              startIcon={rotatingSig ? <CircularProgress size={14}/> : <RotateRight fontSize="small"/>}
                              onClick={() => rotateBgeSignature(viewItem.id, 'cw')}
                            >CW</Button>
                          </span>
                        </Tooltip>
                        <Tooltip title="Remove background — flood-fills from corners to erase white, grey or coloured backgrounds">
                          <span>
                            <Button
                              size="small" variant="outlined" color="secondary" disabled={cleaningSig}
                              startIcon={cleaningSig ? <CircularProgress size={14}/> : <DrawOutlined fontSize="small"/>}
                              onClick={() => cleanBgeSignature(viewItem.id)}
                            >Clean BG</Button>
                          </span>
                        </Tooltip>
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
              {isStaff && !viewItem.signature_url && !viewItem.signature_data && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.disabled">No signature uploaded yet.</Typography>
                </Box>
              )}

              <Divider sx={{ mb: 2 }} />

              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                Assigned MSMEs ({(viewItem.assigned_msmes_list || []).length})
              </Typography>

              {(viewItem.assigned_msmes_list || []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">No MSMEs assigned yet.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {(viewItem.assigned_msmes_list || []).map((m, idx) => (
                    <Box key={m.id} sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      p: 1.2, borderRadius: 1.5,
                      bgcolor: idx % 2 === 0 ? '#F8FAFC' : '#fff',
                      border: '1px solid #E8EDF2',
                    }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 24, color: 'text.disabled', fontSize: 11 }}>
                        {idx + 1}.
                      </Typography>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{m.business_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {[m.msme_code, m.business_type, m.sector, m.city].filter(Boolean).join(' · ')}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ) : viewItem && viewType === 'msme' && msmeDetailTab === 0 ? (
            /* ── MSME Profile tab ── */
            <Grid container spacing={1.5}>
              {Object.entries(viewItem)
                .filter(([k]) => !['id','is_active','source_file','created_at','updated_at','latitude','longitude','assigned_msmes_list','group_names','programme_groups_detail','programme_groups'].includes(k))
                .map(([k, v]) => (
                  <Grid item xs={6} key={k}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Typography>
                    <Typography variant="body2">{v !== null && v !== '' && v !== undefined ? String(v) : '—'}</Typography>
                  </Grid>
                ))}
            </Grid>
          ) : viewItem && viewType === 'msme' && msmeDetailTab === 1 ? (
            /* ── MSME Growth History tab ── */
            (() => {
              const snaps = adminSnapshots
                .filter(s => s.msme === viewItem.id)
                .sort((a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date));
              if (!snaps.length) return (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <TrendingUp sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">No growth updates recorded yet.</Typography>
                </Box>
              );
              return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {snaps.map((s, idx) => (
                    <Card key={s.id} variant="outlined" sx={{ borderLeft: `3px solid ${idx === 0 ? '#2E7D32' : '#90A4AE'}` }}>
                      <CardContent sx={{ pb: '12px !important', pt: '12px !important' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="subtitle2" fontWeight={700}>{s.snapshot_date}</Typography>
                          {idx === 0 && <Chip label="Latest" size="small" color="success" />}
                        </Box>
                        <Grid container spacing={1}>
                          {[
                            ['FT Employees', s.employees_ft_male != null ? `${(s.employees_ft_male||0)+(s.employees_ft_female||0)} (M:${s.employees_ft_male||0}/F:${s.employees_ft_female||0})` : '—'],
                            ['PT Employees', s.employees_pt_male != null ? `${(s.employees_pt_male||0)+(s.employees_pt_female||0)} (M:${s.employees_pt_male||0}/F:${s.employees_pt_female||0})` : '—'],
                            ['Annual Turnover', s.annual_turnover ? `UGX ${Number(s.annual_turnover).toLocaleString()}` : '—'],
                            ['Last Month Revenue', s.last_month_revenue ? `UGX ${Number(s.last_month_revenue).toLocaleString()}` : '—'],
                            ['Has URSB', s.has_ursb ? `Yes${s.ursb_reg_number ? ` (${s.ursb_reg_number})` : ''}` : 'No'],
                            ['Has TIN', s.has_tin ? `Yes${s.tin_number ? ` (${s.tin_number})` : ''}` : 'No'],
                            ['Business Bank', s.has_business_bank ? `Yes${s.bank_name ? ` — ${s.bank_name}` : ''}` : 'No'],
                            ['Mobile Money', s.has_mobile_money ? 'Yes' : 'No'],
                            ['MOMO Pay', s.has_momo_pay ? `Yes${s.momo_pay_code ? ` (${s.momo_pay_code})` : ''}` : 'No'],
                            ['SACCO', s.has_sacco ? 'Yes' : 'No'],
                            ['Collected By', s.collected_by_name || '—'],
                          ].map(([label, val]) => (
                            <Grid item xs={6} key={label}>
                              <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                              <Typography variant="body2">{val}</Typography>
                            </Grid>
                          ))}
                        </Grid>
                        {s.notes && (
                          <Box sx={{ mt: 1, p: 1, bgcolor: '#F8FAFC', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">Notes</Typography>
                            <Typography variant="body2" sx={{ fontSize: 12 }}>{s.notes}</Typography>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              );
            })()
          ) : null}
        </DialogContent>
        <DialogActions><Button onClick={() => { setViewItem(null); setMsmeDetailTab(0); }}>Close</Button></DialogActions>
      </Dialog>

      {/* ── Edit dialog ──────────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onClose={closeEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Edit {editType === 'msme' ? 'MSME' : 'Expert'}</DialogTitle>
        <DialogContent dividers>
          {editType === 'msme' && (
            <Grid container spacing={2}>
              {[['business_name','Business Name'],['owner_name','Owner Name'],['email','Email'],['phone','Phone'],['city','City'],['state','State']].map(([f,l]) => (
                <Grid item xs={12} sm={6} key={f}>
                  <TextField fullWidth size="small" label={l} value={editForm[f] || ''} onChange={e => setEditForm({...editForm, [f]: e.target.value})} />
                </Grid>
              ))}
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small"><InputLabel>Type</InputLabel>
                  <Select value={editForm.business_type || ''} onChange={e => setEditForm({...editForm, business_type: e.target.value})} label="Type">
                    {['MICRO','SMALL','MEDIUM'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small"><InputLabel>Sector</InputLabel>
                  <Select value={editForm.sector || ''} onChange={e => setEditForm({...editForm, sector: e.target.value})} label="Sector">
                    {['MANUFACTURING','SERVICES','TRADE','AGRICULTURE','TECHNOLOGY','CONSTRUCTION','HEALTHCARE','EDUCATION','OTHER'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              {[['annual_revenue','Annual Revenue'],['investment_needed','Investment Needed'],['employee_count','Employees']].map(([f,l]) => (
                <Grid item xs={12} sm={4} key={f}>
                  <TextField fullWidth size="small" label={l} type="number" value={editForm[f] || ''} onChange={e => setEditForm({...editForm, [f]: e.target.value})} />
                </Grid>
              ))}
              <Grid item xs={12}>
                <TextField fullWidth size="small" multiline rows={2} label="Description" value={editForm.business_description || ''} onChange={e => setEditForm({...editForm, business_description: e.target.value})} />
              </Grid>
            </Grid>
          )}
          {editType === 'expert' && (
            <Grid container spacing={2}>
              {[['name','Name'],['email','Email'],['phone','Phone'],['location','Location']].map(([f,l]) => (
                <Grid item xs={12} sm={6} key={f}>
                  <TextField fullWidth size="small" label={l} value={editForm[f] || ''} onChange={e => setEditForm({...editForm, [f]: e.target.value})} />
                </Grid>
              ))}
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="Years of Experience" type="number" value={editForm.years_of_experience || ''} onChange={e => setEditForm({...editForm, years_of_experience: e.target.value})} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small"><InputLabel>Status</InputLabel>
                  <Select value={editForm.status || 'pending'} onChange={e => setEditForm({...editForm, status: e.target.value})} label="Status">
                    {['pending','approved','rejected'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              {[['top_skills','Top Skills'],['second_area','Second Area'],['third_area','Third Area']].map(([f,l]) => (
                <Grid item xs={12} sm={4} key={f}>
                  <TextField fullWidth size="small" label={l} value={editForm[f] || ''} onChange={e => setEditForm({...editForm, [f]: e.target.value})} />
                </Grid>
              ))}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={editLoading}>
            {editLoading ? <CircularProgress size={18} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete confirm ────────────────────────────────────────────────── */}
      <Dialog open={!!deleteItem} onClose={() => setDeleteItem(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteItem?.business_name || deleteItem?.name}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteItem(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={deleteLoading}>
            {deleteLoading ? <CircularProgress size={18} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Import MSME List ─────────────────────────────────────────────── */}
      {/* ── Inactive MSMEs dialog ── */}
      <Dialog open={inactiveMsmes !== null} onClose={() => setInactiveMsmes(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Inactive MSMEs
          <Typography variant="caption" display="block" color="text.secondary">
            {inactiveMsmes?.length
              ? `${inactiveMsmes.length} MSME(s) currently marked inactive (hidden from all views)`
              : 'No inactive MSMEs found — all records are active.'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {inactiveMsmes?.length > 0 ? (
            <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F3F6FA' }}>
                    {['#', 'Business Name', 'MSME Code', 'Owner', 'City'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #DDE4EE' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inactiveMsmes.map((m, i) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #EEF1F5' }}>
                      <td style={{ padding: '5px 8px', color: '#888' }}>{i + 1}</td>
                      <td style={{ padding: '5px 8px', fontWeight: 500 }}>{m.business_name}</td>
                      <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{m.msme_code || '—'}</td>
                      <td style={{ padding: '5px 8px' }}>{m.owner_name || '—'}</td>
                      <td style={{ padding: '5px 8px' }}>{m.city || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">Nothing to do.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInactiveMsmes(null)}>Close</Button>
          {inactiveMsmes?.length > 0 && (
            <Button variant="contained" color="success" disabled={reactivating}
              onClick={reactivateAll}>
              {reactivating ? 'Reactivating…' : `Reactivate All (${inactiveMsmes.length})`}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={msmeUploadDialog} onClose={() => setMsmeUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Import MSME List
          <Typography variant="caption" display="block" color="text.secondary">
            Use the unified template — works for any cohort.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={
              <Button size="small" variant="outlined" onClick={downloadMsmeTemplate}>
                Download template
              </Button>
            }
          >
            Required columns: <strong>Business Name, Owner Name, Sex, Phone, Email, District, Town</strong>.
            Optional: Business Email, Business Type, Physical Location, Role, Cohort.
            Legacy Cohort 1 / Cohort 2 files still upload — format is auto-detected.
          </Alert>

          {/* File picker */}
          <Box
            onClick={() => msmeFileRef.current?.click()}
            sx={{
              border: '2px dashed', borderColor: msmeUploadFile ? 'success.main' : 'divider',
              borderRadius: 2, p: 3, mb: 2, textAlign: 'center', cursor: 'pointer',
              bgcolor: msmeUploadFile ? 'success.50' : 'background.default',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <Upload sx={{ fontSize: 36, color: msmeUploadFile ? 'success.main' : 'text.secondary', mb: 1 }} />
            <Typography variant="body2" color={msmeUploadFile ? 'success.dark' : 'text.secondary'}>
              {msmeUploadFile ? `✓ ${msmeUploadFile.name}` : 'Click to select a CSV or Excel file'}
            </Typography>
            <input
              ref={msmeFileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              hidden
              onChange={e => setMsmeUploadFile(e.target.files[0] || null)}
            />
          </Box>

          {/* Cohort assignment */}
          <FormControl fullWidth size="small" sx={{ mb: msmeUploadCohort === '__new__' ? 1.5 : 0 }}>
            <InputLabel>Assign to Cohort (optional)</InputLabel>
            <Select
              value={msmeUploadCohort}
              label="Assign to Cohort (optional)"
              onChange={e => setMsmeUploadCohort(e.target.value)}
            >
              <MenuItem value=""><em>No cohort</em></MenuItem>
              {cohorts.map(c => (
                <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>
              ))}
              <MenuItem value="__new__">+ Create new cohort…</MenuItem>
            </Select>
          </FormControl>
          {msmeUploadCohort === '__new__' && (
            <TextField
              fullWidth size="small"
              label="New cohort name (e.g. Cohort 3)"
              value={msmeUploadNewCohort}
              onChange={e => setMsmeUploadNewCohort(e.target.value)}
              sx={{ mb: 2 }}
            />
          )}

          {/* Duplicate handling */}
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
            <Checkbox
              size="small"
              checked={msmeUploadSkipDups}
              onChange={e => setMsmeUploadSkipDups(e.target.checked)}
            />
            <Typography variant="body2" color="text.secondary">
              Skip duplicates (leave existing records unchanged)
            </Typography>
          </Box>

          {/* Result panel */}
          {msmeUploadResult && (
            <Alert severity={msmeUploadResult.skipped ? 'warning' : 'success'} sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                {msmeUploadResult.message}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                <Chip size="small" color="success" label={`${msmeUploadResult.created || 0} created`} />
                <Chip size="small" color="info"    label={`${msmeUploadResult.updated || 0} updated`} />
                {msmeUploadResult.skipped > 0 && (
                  <Chip size="small" color="warning" label={`${msmeUploadResult.skipped} skipped`} />
                )}
                {msmeUploadResult.blank_rows > 0 && (
                  <Chip size="small" variant="outlined" label={`${msmeUploadResult.blank_rows} blank`} />
                )}
                <Chip size="small" variant="outlined" label={`${msmeUploadResult.total_rows || 0} total`} />
              </Box>
              {msmeUploadResult.errors?.length > 0 && (
                <Box sx={{ mt: 1.5, maxHeight: 160, overflow: 'auto', bgcolor: 'background.paper', p: 1, borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    Skipped rows:
                  </Typography>
                  {msmeUploadResult.errors.slice(0, 20).map((e, i) => (
                    <Typography key={i} variant="caption" display="block" sx={{ fontFamily: 'monospace' }}>
                      Row {e.row}: {e.error}
                    </Typography>
                  ))}
                  {msmeUploadResult.errors.length > 20 && (
                    <Typography variant="caption" color="text.secondary">
                      …and {msmeUploadResult.errors.length - 20} more
                    </Typography>
                  )}
                </Box>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMsmeUploadDialog(false)}>
            {msmeUploadResult ? 'Close' : 'Cancel'}
          </Button>
          {msmeUploadResult && (
            <Button onClick={() => { setMsmeUploadResult(null); setMsmeUploadFile(null); }}>
              Upload another
            </Button>
          )}
          <Button
            variant="contained"
            onClick={doMsmeUpload}
            disabled={msmeUploading || !msmeUploadFile || !!msmeUploadResult || (msmeUploadCohort === '__new__' && !msmeUploadNewCohort.trim())}
            startIcon={msmeUploading ? <CircularProgress size={16} /> : <Upload />}
          >
            {msmeUploading ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── BGE Upload ────────────────────────────────────────────────────── */}
      <Dialog open={bgeUploadDialog} onClose={() => setBgeUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import BGE Experts</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }} icon={false}>
            Required columns: <code>Full name</code>, <code>Phone number</code>, <code>Email address</code>, <code>Location</code>, <code>BGE code</code>.
          </Alert>

          <Box
            onClick={() => bgeFileRef.current?.click()}
            sx={{
              border: '2px dashed', borderColor: bgeUploadFile ? 'success.main' : 'divider',
              borderRadius: 2, p: 3, mb: 2, textAlign: 'center', cursor: 'pointer',
              bgcolor: bgeUploadFile ? 'success.50' : 'background.default',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <Upload sx={{ fontSize: 36, color: bgeUploadFile ? 'success.main' : 'text.secondary', mb: 1 }} />
            <Typography variant="body2" color={bgeUploadFile ? 'success.dark' : 'text.secondary'}>
              {bgeUploadFile ? `✓ ${bgeUploadFile.name}` : 'Click to select an Excel file (.xlsx or .xls)'}
            </Typography>
            <input
              ref={bgeFileRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={e => setBgeUploadFile(e.target.files[0] || null)}
            />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Checkbox
              size="small"
              checked={bgeUploadSkipDups}
              onChange={e => setBgeUploadSkipDups(e.target.checked)}
            />
            <Typography variant="body2" color="text.secondary">
              Skip duplicates (leave existing BGE records unchanged)
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBgeUploadDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={doBgeUpload}
            disabled={bgeUploading || !bgeUploadFile}
            startIcon={bgeUploading ? <CircularProgress size={16} /> : <Upload />}
          >
            {bgeUploading ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Create Cohort ─────────────────────────────────────────────────── */}
      <Dialog open={cohortDialog} onClose={() => setCohortDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Cohort</DialogTitle>
        <DialogContent dividers>
          <TextField fullWidth size="small" label="Name (e.g. Cohort 4)" sx={{ mb: 2 }} value={cohortForm.name} onChange={e => setCohortForm({...cohortForm, name: e.target.value})} />
          <TextField fullWidth size="small" multiline rows={2} label="Description" value={cohortForm.description} onChange={e => setCohortForm({...cohortForm, description: e.target.value})} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCohortDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={createCohort} disabled={cohortLoading || !cohortForm.name}>
            {cohortLoading ? <CircularProgress size={18} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Create BGE Group ──────────────────────────────────────────────── */}
      <Dialog open={groupDialog} onClose={() => setGroupDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          New BGE Group
          <Typography variant="caption" display="block" color="text.secondary">
            Objectives flow into every MSME assigned to this group and appear in the BGE's report context.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <TextField fullWidth size="small" label="Group Name" sx={{ mb: 2 }} value={groupForm.name} onChange={e => setGroupForm({...groupForm, name: e.target.value})} />
          <TextField fullWidth size="small" multiline rows={2} label="Description" sx={{ mb: 2 }} value={groupForm.description} onChange={e => setGroupForm({...groupForm, description: e.target.value})} />
          <TextField fullWidth size="small" multiline rows={4} label="Objectives" placeholder="What is this team's mission? e.g. Drive financial-literacy uptake among Lira & Gulu Cohort 1 MSMEs through 2 BGE-led sessions per quarter…"
            value={groupForm.objectives} onChange={e => setGroupForm({...groupForm, objectives: e.target.value})}
            helperText="Shown to the BGE inside their report context for each assigned MSME."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGroupDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={createGroup} disabled={groupLoading || !groupForm.name}>
            {groupLoading ? <CircularProgress size={18} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Manage group members ──────────────────────────────────────────── */}
      <AssignMsmesDialog
        assignMsmeGroup={assignMsmeGroup}
        setAssignMsmeGroup={setAssignMsmeGroup}
        msmes={msmes}
        headers={headers}
        notify={notify}
        fetchAll={fetchAll}
      />

      <Dialog open={!!manageGroupItem} onClose={() => setManageGroupItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Manage Members — {manageGroupItem?.name}
          <Typography variant="caption" display="block" color="text.secondary">
            Tick a row to add/remove the BGE; click the star to designate them as team lead.
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <List dense>
            {experts.map(e => {
              const isMember = manageGroupItem?.members_detail?.some(m => m.id === e.id);
              const isLead = manageGroupItem?.team_lead === e.id;
              return (
                <ListItemButton key={e.id} onClick={() => toggleGroupMember(manageGroupItem.id, e.id, isMember)}>
                  <ListItemIcon>
                    <Checkbox checked={!!isMember} size="small" disableRipple />
                  </ListItemIcon>
                  <ListItemText
                    primary={e.name}
                    secondary={`${e.location || '—'} · ${e.top_skills || '—'}${isLead ? ' · Team Lead' : ''}`}
                  />
                  <Tooltip title={isLead ? 'Remove team-lead' : (isMember ? 'Make team lead' : 'Add as member first')}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!isMember}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setGroupTeamLead(manageGroupItem.id, isLead ? null : e.id);
                        }}
                        sx={{ mr: 1, color: isLead ? '#FFB300' : 'text.disabled' }}
                      >
                        {isLead ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Chip label={e.status} color={statusColor(e.status)} size="small" />
                </ListItemButton>
              );
            })}
            {experts.length === 0 && <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>No experts to add</Box>}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setManageGroupItem(null); fetchAll(); }}>Done</Button>
        </DialogActions>
      </Dialog>

      {/* ── Create Training Session ───────────────────────────────────────── */}
      {/* ── Session MSME notification dialog ─────────────────────────────── */}
      <Dialog open={sessionNotifyDialog} onClose={() => setSessionNotifyDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Notify MSMEs — {sessionNotifySession?.title}
          <Typography variant="caption" display="block" color="text.secondary">
            {(sessionNotifySession?.businesses_detail || []).length} recipient{(sessionNotifySession?.businesses_detail || []).length !== 1 ? 's' : ''}
            {' · '}{sessionNotifySession?.date}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Sending to:</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {(sessionNotifySession?.businesses_detail || []).map(m => (
                <Chip key={m.id} label={m.business_name} size="small" color="info" variant="outlined" />
              ))}
            </Box>
          </Box>
          {sessionNotifyAlreadySent.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }}
              action={
                <Button size="small" color="inherit" onClick={() => setSessionNotifySkip(s => !s)}>
                  {sessionNotifySkip ? 'Include all' : 'Skip already sent'}
                </Button>
              }>
              {sessionNotifyAlreadySent.length} MSME{sessionNotifyAlreadySent.length !== 1 ? 's' : ''} already received this notification.
              {sessionNotifySkip && ' They will be skipped.'}
            </Alert>
          )}
          <TextField label="Subject" value={sessionNotifySubject}
            onChange={e => setSessionNotifySubject(e.target.value)}
            fullWidth size="small" sx={{ mb: 1.5 }} />
          <TextField label="Message" value={sessionNotifyBody}
            onChange={e => setSessionNotifyBody(e.target.value)}
            fullWidth multiline minRows={10}
            helperText="{{name}} is replaced with the business owner's first name." />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSessionNotifyDialog(false)}>Cancel</Button>
          <Button variant="contained" startIcon={sessionNotifySending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            onClick={sendSessionNotify}
            disabled={sessionNotifySending || !sessionNotifySubject.trim() || !sessionNotifyBody.trim()}>
            Send to {(sessionNotifySession?.businesses_detail || []).length} MSME{(sessionNotifySession?.businesses_detail || []).length !== 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sessionDialog} onClose={() => { setSessionDialog(false); setSessionEditing(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{sessionEditing ? 'Edit Training Session' : 'New Training Session'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}><TextField fullWidth size="small" required label="Title" value={sessionForm.title} onChange={e => setSessionForm({...sessionForm, title: e.target.value})} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" required label="Date" type="date" InputLabelProps={{shrink:true}} value={sessionForm.date} onChange={e => setSessionForm({...sessionForm, date: e.target.value})} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Location" value={sessionForm.location} onChange={e => setSessionForm({...sessionForm, location: e.target.value})} /></Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small"><InputLabel>Topic</InputLabel>
                <Select value={sessionForm.topic} onChange={e => setSessionForm({...sessionForm, topic: e.target.value})} label="Topic">
                  <MenuItem value="">None</MenuItem>
                  {(() => {
                    const grouped = trainingTopics.reduce((acc, t) => {
                      const key = t.module_number || 0;
                      if (!acc[key]) acc[key] = { label: t.module_name || 'Other', items: [] };
                      acc[key].items.push(t);
                      return acc;
                    }, {});
                    return Object.entries(grouped).map(([modNum, { label, items }]) => [
                      <ListSubheader key={`mod-${modNum}`} sx={{ fontWeight: 700, lineHeight: '2em', bgcolor: 'grey.100' }}>
                        {modNum > 0 ? `Module ${modNum}: ${label}` : label}
                      </ListSubheader>,
                      ...items.map(t => (
                        <MenuItem key={t.id} value={t.id} sx={{ pl: 3 }}>
                          {t.section_number ? `${t.section_number} – ` : ''}{t.name}
                        </MenuItem>
                      )),
                    ]);
                  })()}
                </Select>
              </FormControl>
            </Grid>
            {/* ── Team (facilitation assignments) ── */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" fontWeight={600} color="text.secondary">Facilitation Team</Typography>
                <Box>
                  <Button size="small" startIcon={<Add />}
                    onClick={() => setSessionForm(f => ({ ...f, team: [...f.team, { _key: Math.random(), role: 'lead', bge_id: '', work_order_id: '' }] }))}>
                    Add Lead
                  </Button>
                  <Button size="small" startIcon={<Add />} color="secondary"
                    onClick={() => setSessionForm(f => ({ ...f, team: [...f.team, { _key: Math.random(), role: 'mentor', bge_id: '', work_order_id: '' }] }))}>
                    Add Mentor
                  </Button>
                </Box>
              </Box>
              {sessionForm.team.length === 0 && (
                <Typography variant="caption" color="text.disabled">No team members added yet.</Typography>
              )}
              {sessionForm.team.map((member, idx) => (
                <Box key={member._key} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                  <Chip
                    label={member.role === 'lead' ? 'Lead' : 'Mentor'}
                    size="small"
                    color={member.role === 'lead' ? 'primary' : 'secondary'}
                    sx={{ minWidth: 62, flexShrink: 0 }}
                  />
                  <FormControl size="small" sx={{ flex: 2 }}>
                    <InputLabel>BGE</InputLabel>
                    <Select value={member.bge_id} label="BGE"
                      onChange={e => setSessionForm(f => ({ ...f, team: f.team.map((m, i) => i === idx ? { ...m, bge_id: e.target.value } : m) }))}>
                      <MenuItem value="">— Select —</MenuItem>
                      {experts.map(ex => <MenuItem key={ex.id} value={ex.id}>{ex.name}{ex.bge_code ? ` (${ex.bge_code})` : ''}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ flex: 2 }}>
                    <InputLabel>Work Order</InputLabel>
                    <Select value={member.work_order_id} label="Work Order"
                      onChange={e => setSessionForm(f => ({ ...f, team: f.team.map((m, i) => i === idx ? { ...m, work_order_id: e.target.value } : m) }))}>
                      <MenuItem value="">— None —</MenuItem>
                      {workOrders.map(wo => <MenuItem key={wo.id} value={wo.id}>{wo.work_order_number} · {wo.bge_name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <IconButton size="small" color="error"
                    onClick={() => setSessionForm(f => ({ ...f, team: f.team.filter((_, i) => i !== idx) }))}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Attendee MSMEs</InputLabel>
                <Select
                  multiple value={sessionForm.businesses}
                  onChange={e => setSessionForm({...sessionForm, businesses: e.target.value})}
                  label="Attendee MSMEs"
                  renderValue={sel => `${sel.length} MSME${sel.length !== 1 ? 's' : ''} selected`}
                >
                  {msmes.map(m => (
                    <MenuItem key={m.id} value={m.id}>
                      <Checkbox checked={sessionForm.businesses.includes(m.id)} size="small" />
                      {m.business_name} {m.owner_name ? `· ${m.owner_name}` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}><TextField fullWidth size="small" multiline rows={2} label="Description" value={sessionForm.description} onChange={e => setSessionForm({...sessionForm, description: e.target.value})} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setSessionDialog(false); setSessionEditing(null); }}>Cancel</Button>
          <Button variant="contained" onClick={createSession} disabled={sessionLoading || !sessionForm.title || !sessionForm.date}>
            {sessionLoading ? <CircularProgress size={18} /> : sessionEditing ? 'Save Changes' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Attendance (per-person demographic sheet) ─────────────────────── */}
      <Dialog open={attendanceDialog} onClose={() => setAttendanceDialog(false)} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          Attendance Sheet — {selectedSession?.title}
          <Typography variant="caption" display="block" color="text.secondary">
            {selectedSession?.date} · {selectedSession?.location}
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {attendanceLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <Box>
              {/* Per-person rows */}
              <Table size="small" stickyHeader>
                <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                  <TableRow>
                    <TableCell sx={{ minWidth: 30 }}>#</TableCell>
                    <TableCell sx={{ minWidth: 160 }}>Name</TableCell>
                    <TableCell sx={{ minWidth: 120 }}>Phone</TableCell>
                    <TableCell sx={{ minWidth: 180 }}>MSME / Business</TableCell>
                    <TableCell sx={{ minWidth: 60 }}>Sex</TableCell>
                    <TableCell sx={{ minWidth: 90 }}>Age Group</TableCell>
                    <TableCell sx={{ minWidth: 90 }}>Status</TableCell>
                    <TableCell sx={{ minWidth: 80 }} align="center">Consent</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessionAttendees.map((att, idx) => (
                    <TableRow key={att._key} hover>
                      <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{idx + 1}</TableCell>
                      <TableCell>
                        <TextField size="small" placeholder="Full name" variant="standard"
                          value={att.attendee_name}
                          onChange={e => updateAttendee(att._key, 'attendee_name', e.target.value)}
                          sx={{ minWidth: 140 }} />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" placeholder="Phone" variant="standard"
                          value={att.attendee_phone}
                          onChange={e => updateAttendee(att._key, 'attendee_phone', e.target.value)}
                          sx={{ minWidth: 110 }} />
                      </TableCell>
                      <TableCell>
                        <Select size="small" variant="standard" displayEmpty
                          value={att.msme || ''}
                          onChange={e => {
                            const m = msmes.find(x => x.id === e.target.value);
                            updateAttendee(att._key, 'msme', e.target.value);
                            if (m && !att.attendee_name) updateAttendee(att._key, 'attendee_name', m.owner_name || '');
                          }}
                          sx={{ minWidth: 160 }}>
                          <MenuItem value=""><em>— walk-in —</em></MenuItem>
                          {msmes.filter(m => m.is_active).map(m => (
                            <MenuItem key={m.id} value={m.id}>{m.business_name}</MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select size="small" variant="standard" displayEmpty
                          value={att.gender}
                          onChange={e => updateAttendee(att._key, 'gender', e.target.value)}
                          sx={{ minWidth: 55 }}>
                          <MenuItem value=""><em>—</em></MenuItem>
                          <MenuItem value="M">M</MenuItem>
                          <MenuItem value="F">F</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select size="small" variant="standard" displayEmpty
                          value={att.age_group}
                          onChange={e => updateAttendee(att._key, 'age_group', e.target.value)}
                          sx={{ minWidth: 80 }}>
                          <MenuItem value=""><em>—</em></MenuItem>
                          <MenuItem value="18-34">18–34</MenuItem>
                          <MenuItem value="35-45">35–45</MenuItem>
                          <MenuItem value="46-55">46–55</MenuItem>
                          <MenuItem value="56+">56+</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select size="small" variant="standard"
                          value={att.refugee_status}
                          onChange={e => updateAttendee(att._key, 'refugee_status', e.target.value)}
                          sx={{ minWidth: 80 }}>
                          <MenuItem value="H">Host Comm.</MenuItem>
                          <MenuItem value="R">Refugee</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Photo consent">
                          <Checkbox size="small" checked={!!att.consent_photo}
                            onChange={e => updateAttendee(att._key, 'consent_photo', e.target.checked)} />
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error" onClick={() => removeAttendeeRow(att._key)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Summary table — mirrors the PRUDEV II attendance sheet footer */}
              {sessionAttendees.length > 0 && (() => {
                const present = sessionAttendees;
                const male   = present.filter(a => a.gender === 'M');
                const female = present.filter(a => a.gender === 'F');
                const youth  = present.filter(a => a.age_group === '18-34');
                const adult  = present.filter(a => ['35-45','46-55','56+'].includes(a.age_group));
                const ref    = present.filter(a => a.refugee_status === 'R');
                const host   = present.filter(a => a.refugee_status === 'H');
                return (
                  <Box sx={{ m: 2, p: 2, bgcolor: '#F3F6FB', border: '1px solid #c5d5e8', borderRadius: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>Summary</Typography>
                    <Grid container spacing={1}>
                      {[
                        { label: 'Total', value: present.length, color: '#1565C0' },
                        { label: 'Female', value: female.length, color: '#AD1457' },
                        { label: 'Male', value: male.length, color: '#1565C0' },
                        { label: 'Female Youth', value: youth.filter(a => a.gender === 'F').length, color: '#AD1457' },
                        { label: 'Male Youth', value: youth.filter(a => a.gender === 'M').length, color: '#1565C0' },
                        { label: 'Adult Female', value: adult.filter(a => a.gender === 'F').length, color: '#AD1457' },
                        { label: 'Adult Male', value: adult.filter(a => a.gender === 'M').length, color: '#1565C0' },
                        { label: 'Refugees', value: ref.length, color: '#E65100' },
                        { label: 'Female Refugee', value: ref.filter(a => a.gender === 'F').length, color: '#E65100' },
                        { label: 'Male Refugee', value: ref.filter(a => a.gender === 'M').length, color: '#E65100' },
                        { label: 'Host Community', value: host.length, color: '#2E7D32' },
                      ].map(({ label, value, color }) => (
                        <Grid item xs={6} sm={4} md={3} lg={2} key={label}>
                          <Box sx={{ textAlign: 'center', p: 1, bgcolor: '#fff', borderRadius: 1, border: `1px solid ${color}20` }}>
                            <Typography variant="h6" fontWeight={700} sx={{ color }}>{value}</Typography>
                            <Typography variant="caption" color="text.secondary">{label}</Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                );
              })()}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button size="small" startIcon={<Add />} onClick={addAttendeeRow} sx={{ mr: 'auto' }}>
            Add row
          </Button>
          <Button onClick={() => setAttendanceDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveAttendance} disabled={attendanceLoading}>
            {attendanceLoading ? <CircularProgress size={18} /> : 'Save Attendance'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Create User Account ───────────────────────────────────────────── */}
      <Dialog open={userDialog} onClose={() => setUserDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create Login Account</DialogTitle>
        <DialogContent dividers>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Account Type</InputLabel>
            <Select value={userForm.role} label="Account Type"
              onChange={e => setUserForm(f => ({ ...f, role: e.target.value, bge_id: '', group_ids: [] }))}>
              <MenuItem value="bge">BGE Expert — sees only their assigned MSMEs</MenuItem>
              <MenuItem value="cohort_admin">Programme Manager — manages specific groups</MenuItem>
              <MenuItem value="viewer">Viewer — read-only access to all data</MenuItem>
            </Select>
          </FormControl>

          {userForm.role === 'bge' && (
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Link to BGE Expert Profile</InputLabel>
              <Select value={userForm.bge_id} label="Link to BGE Expert Profile"
                onChange={e => handleUserBgeSelect(e.target.value)}>
                <MenuItem value="">— Not linked yet —</MenuItem>
                {experts.filter(e => !bgeUsers.some(u => u.bge_profile?.id === e.id)).map(e => (
                  <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {userForm.role === 'cohort_admin' && (
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Managed Programme Groups</InputLabel>
              <Select multiple value={userForm.group_ids} label="Managed Programme Groups"
                onChange={e => setUserForm(f => ({ ...f, group_ids: e.target.value }))}>
                {programmeGroups.map(g => (
                  <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField fullWidth size="small" label="Username" sx={{ mb: 2 }}
            value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} />
          <TextField fullWidth size="small" label="Password" type="password" sx={{ mb: 2 }}
            value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} />
          <TextField fullWidth size="small" label="Email (optional)"
            value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialog(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<PersonAdd />} onClick={createBGEUser}
            disabled={userLoading || !userForm.username || !userForm.password ||
              (userForm.role === 'cohort_admin' && userForm.group_ids.length === 0)}>
            {userLoading ? <CircularProgress size={18} /> : 'Create Account'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Reset Password ─────────────────────────────────────────────────── */}
      <Dialog open={pwdDialog} onClose={() => { setPwdDialog(false); setNewPwd(''); }} maxWidth="xs" fullWidth>
        <DialogTitle>Reset Password — {pwdUser?.username}</DialogTitle>
        <DialogContent dividers>
          <TextField fullWidth size="small" label="New Password" type="password"
            value={newPwd} onChange={e => setNewPwd(e.target.value)}
            helperText="Minimum 6 characters" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setPwdDialog(false); setNewPwd(''); }}>Cancel</Button>
          <Button variant="contained" startIcon={<LockReset />}
            onClick={resetPassword}
            disabled={pwdLoading || newPwd.length < 6}>
            {pwdLoading ? <CircularProgress size={18} /> : 'Reset Password'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Set Role ──────────────────────────────────────────────────────── */}
      <Dialog open={roleDialog} onClose={() => setRoleDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Change Role
          <Typography variant="caption" display="block" color="text.secondary">{roleUser?.username}</Typography>
        </DialogTitle>
        <DialogContent dividers>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Role</InputLabel>
            <Select value={roleForm.role} label="Role"
              onChange={e => setRoleForm(f => ({ ...f, role: e.target.value, group_ids: [] }))}>
              <MenuItem value="bge">BGE Expert — sees only their assigned MSMEs</MenuItem>
              <MenuItem value="cohort_admin">Programme Manager — sees all MSMEs in assigned groups</MenuItem>
              <MenuItem value="viewer">Viewer — read-only access to all data</MenuItem>
            </Select>
          </FormControl>

          {roleForm.role === 'bge' && (
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
              <InputLabel>Link to BGE Expert Profile</InputLabel>
              <Select value={roleForm.bge_id || ''} label="Link to BGE Expert Profile"
                onChange={e => setRoleForm(f => ({ ...f, bge_id: e.target.value }))}>
                <MenuItem value="">— Not linked —</MenuItem>
                {experts
                  .filter(e => !bgeUsers.some(u => u.bge_profile?.id === e.id && u.id !== roleUser?.id))
                  .map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}

          {roleForm.role === 'cohort_admin' && (
            <FormControl fullWidth size="small">
              <InputLabel>Programme Groups</InputLabel>
              <Select multiple value={roleForm.group_ids} label="Programme Groups"
                onChange={e => setRoleForm(f => ({ ...f, group_ids: e.target.value }))}>
                {programmeGroups.map(g => (
                  <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                Select all groups this person should see MSMEs from.
              </Typography>
            </FormControl>
          )}

          {roleForm.role === 'viewer' && (
            <Typography variant="body2" color="text.secondary">
              Viewers can see all MSMEs, reports and analytics but cannot create or edit anything.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveRole} disabled={userLoading ||
            (roleForm.role === 'cohort_admin' && roleForm.group_ids.length === 0)}>
            {userLoading ? <CircularProgress size={18} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Email Preview (editable) ──────────────────────────────────────── */}
      <Dialog open={!!emailPreview} onClose={() => setEmailPreview(null)} maxWidth="md" fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}>
        <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
          <Typography variant="h6" fontWeight={700}>Email Preview — {emailPreview?.bge?.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            Edit the subject or body before sending. Changes only affect this send.
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>TO</Typography>
            <Typography variant="body2" fontWeight={600}>{emailPreview?.to}</Typography>
          </Box>
          <TextField
            label="Subject"
            size="small"
            fullWidth
            value={emailEditSubject}
            onChange={e => setEmailEditSubject(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Message Body"
            multiline
            minRows={12}
            fullWidth
            value={emailEditBody}
            onChange={e => setEmailEditBody(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 13, lineHeight: 1.7 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEmailPreview(null)}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={emailSending ? <CircularProgress size={16} color="inherit" /> : <Email />}
            disabled={emailSending || !emailEditSubject || !emailEditBody}
            onClick={confirmSendEmail}
          >
            {emailSending ? 'Sending…' : 'Send Email'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Assign BGE + Objectives ────────────────────────────────────────── */}
      <Dialog open={assignDialog} onClose={() => setAssignDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {assignForm.bge_id ? 'Edit Assignment' : 'Assign BGE Expert'}
        </DialogTitle>
        <DialogContent dividers>
          {assignTarget && (
            <Alert severity="info" icon={false} sx={{ mb: 2 }}>
              <strong>{assignTarget.business_name}</strong>{' '}
              <Typography component="span" variant="caption" color="text.secondary">({assignTarget.msme_code})</Typography>
            </Alert>
          )}
          {assignTarget && (
            <Accordion defaultExpanded={false} variant="outlined" sx={{ mb: 2 }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="body2" fontWeight={600}>MSME Background &amp; Challenges</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 1 }}>
                {!assignTarget.business_description && !assignTarget.challenges && !assignTarget.opportunities ? (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No diagnostic data recorded for this MSME yet.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {assignTarget.business_description && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" display="block">Business Description</Typography>
                        <Typography variant="body2">{assignTarget.business_description}</Typography>
                      </Box>
                    )}
                    {assignTarget.challenges && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" display="block">Key Challenges</Typography>
                        <Typography variant="body2">{assignTarget.challenges}</Typography>
                      </Box>
                    )}
                    {assignTarget.opportunities && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" display="block">Opportunities</Typography>
                        <Typography variant="body2">{assignTarget.opportunities}</Typography>
                      </Box>
                    )}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {assignTarget.sector && <Chip label={assignTarget.sector} size="small" variant="outlined" />}
                      {assignTarget.business_type && <Chip label={assignTarget.business_type} size="small" variant="outlined" color="primary" />}
                      {assignTarget.city && <Chip label={assignTarget.city} size="small" variant="outlined" icon={<LocationOn sx={{ fontSize: 14 }} />} />}
                    </Box>
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          )}
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>BGE Expert</InputLabel>
            <Select
              value={assignForm.bge_id}
              label="BGE Expert"
              onChange={e => setAssignForm({ ...assignForm, bge_id: e.target.value })}
            >
              <MenuItem value=""><em>None (unassign)</em></MenuItem>
              {experts.map(e => (
                <MenuItem key={e.id} value={e.id}>{e.name}{e.bge_code ? ` · ${e.bge_code}` : ''}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth size="small" label="Assignment Date" type="date"
            value={assignForm.assignment_date}
            onChange={e => setAssignForm({ ...assignForm, assignment_date: e.target.value })}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth size="small" multiline rows={4}
            label="Deployment Objectives"
            placeholder="Describe the objectives and scope of this BGE's deployment for this MSME — e.g. areas of business development support, expected outcomes, milestones…"
            value={assignForm.objectives}
            onChange={e => setAssignForm({ ...assignForm, objectives: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          {assignForm.bge_id && (
            <Button color="error" sx={{ mr: 'auto' }} onClick={async () => {
              await axios.patch(`${API_ENDPOINTS.MSMES}${assignTarget.id}/assign_bge/`, { bge_id: null }, { headers });
              notify('BGE unassigned'); setAssignDialog(false); fetchAll();
            }}>
              Remove Assignment
            </Button>
          )}
          <Button onClick={() => setAssignDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={assignSaving}
            startIcon={assignSaving ? <CircularProgress size={16} color="inherit" /> : null}
            onClick={saveAssignment}
          >
            {assignSaving ? 'Saving…' : 'Save Assignment'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Link BGE Profile ──────────────────────────────────────────────── */}
      <Dialog open={!!linkBgeUser} onClose={() => setLinkBgeUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Link BGE Profile</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select the BGE Expert profile to link to <strong>{linkBgeUser?.username}</strong> ({linkBgeUser?.email || 'no email'}).
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>BGE Expert</InputLabel>
            <Select
              value={linkBgeId}
              label="BGE Expert"
              onChange={e => setLinkBgeId(e.target.value)}
            >
              <MenuItem value=""><em>Select a BGE Expert…</em></MenuItem>
              {experts
                .filter(e => !bgeUsers.some(u => u.bge_profile?.id === e.id))
                .map(e => (
                  <MenuItem key={e.id} value={e.id}>{e.name}{e.email ? ` (${e.email})` : ''}</MenuItem>
                ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkBgeUser(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!linkBgeId}
            onClick={() => linkBGE(linkBgeUser.id, linkBgeId)}
          >
            Link Profile
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── In-App Report Viewer ──────────────────────────────────────────── */}
      {/* ── Growth Snapshot detail dialog ────────────────────────────────── */}
      <Dialog open={!!viewSnapshot} onClose={() => setViewSnapshot(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}>
        {viewSnapshot && (() => {
          const s = viewSnapshot;
          const fmtUGX = v => v == null || v === '' ? '—' : `UGX ${Number(v).toLocaleString()}`;
          const SOURCE_LABELS = {
            diagnostic: 'Baseline Diagnostic', bge_visit: 'BGE Visit',
            quarterly: 'Quarterly Review', annual: 'Data Update', other: 'Other',
          };
          const ftTotal = (s.employees_ft_male||0)+(s.employees_ft_female||0);
          const ptTotal = (s.employees_pt_male||0)+(s.employees_pt_female||0);
          return <>
            <Box sx={{ bgcolor: '#1565C0', px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                  Growth Update
                </Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.3 }}>
                  {s.msme_name}
                </Typography>
              </Box>
              <Chip label={SOURCE_LABELS[s.source] || s.source} size="small"
                sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fff' }} />
            </Box>
            <DialogContent sx={{ p: 0 }}>
              <Box sx={{ display: 'flex', gap: 3, px: 3, py: 1.5, bgcolor: '#F8FAFC',
                borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap' }}>
                {[
                  ['BGE', s.collected_by_name],
                  ['Date', s.snapshot_date],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary" display="block"
                      sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Typography>
                    <Typography variant="body2" fontWeight={600}>{val}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ px: 3, py: 2 }}>
                {/* Financials */}
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Financials</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
                  {[
                    { label: 'Annual Turnover', value: fmtUGX(s.annual_turnover) },
                    { label: 'Last Month Revenue', value: fmtUGX(s.last_month_revenue) },
                    { label: 'Total Assets', value: fmtUGX(s.total_assets) },
                  ].map(({ label, value }) => (
                    <Box key={label} sx={{ bgcolor: '#F4F6F9', borderRadius: 1.5, px: 2, py: 1, flex: '1 1 140px' }}>
                      <Typography variant="caption" color="text.secondary" display="block"
                        sx={{ fontSize: 10, textTransform: 'uppercase' }}>{label}</Typography>
                      <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>{value}</Typography>
                    </Box>
                  ))}
                </Box>
                {/* Workforce */}
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Workforce</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
                  {[
                    { label: 'FT Male', value: s.employees_ft_male ?? '—' },
                    { label: 'FT Female', value: s.employees_ft_female ?? '—' },
                    { label: 'PT Male', value: s.employees_pt_male ?? '—' },
                    { label: 'PT Female', value: s.employees_pt_female ?? '—' },
                    { label: 'FT Total', value: ftTotal },
                    { label: 'PT Total', value: ptTotal },
                    { label: 'FT Refugee', value: s.employees_ft_refugee ?? '—' },
                    { label: 'PT Refugee', value: s.employees_pt_refugee ?? '—' },
                  ].map(({ label, value }) => (
                    <Box key={label} sx={{ textAlign: 'center', bgcolor: '#F4F6F9',
                      borderRadius: 1.5, px: 1.5, py: 1, minWidth: 68 }}>
                      <Typography variant="h6" fontWeight={700}>{value}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{label}</Typography>
                    </Box>
                  ))}
                </Box>
                {/* Compliance */}
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Compliance & Access</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  {[
                    { key: 'has_tin', label: 'TIN', detail: s.tin_number },
                    { key: 'has_ursb', label: 'URSB', detail: s.ursb_reg_number },
                    { key: 'has_business_bank', label: 'Business Bank', detail: s.bank_name },
                    { key: 'has_sacco', label: 'SACCO' },
                    { key: 'has_mobile_money', label: 'Mobile Money' },
                    { key: 'has_momo_pay', label: 'MOMO Pay', detail: s.momo_pay_code },
                  ].map(({ key, label, detail }) => (
                    <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5,
                      bgcolor: s[key] ? '#E8F5E9' : '#FAFAFA', borderRadius: 1, px: 1.5, py: 0.5,
                      border: `1px solid ${s[key] ? '#A5D6A7' : '#E0E0E0'}` }}>
                      <CheckCircle sx={{ fontSize: 14, color: s[key] ? '#2E7D32' : '#BDBDBD' }} />
                      <Typography variant="caption" fontWeight={500}>{label}</Typography>
                      {detail && <Typography variant="caption" color="text.secondary">({detail})</Typography>}
                    </Box>
                  ))}
                </Box>
                {/* Digital tools */}
                {s.digital_tools && s.digital_tools.length > 0 && (
                  <>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Digital Tools Adopted</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
                      {s.digital_tools.map(t => (
                        <Chip key={t} label={t} size="small" variant="outlined" />
                      ))}
                      {s.digital_tools_other && <Chip label={s.digital_tools_other} size="small" variant="outlined" />}
                    </Box>
                  </>
                )}
                {/* Training impact */}
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Training Impact</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
                  bgcolor: s.training_made_changes ? '#E8F5E9' : '#FFF3E0', borderRadius: 1,
                  border: `1px solid ${s.training_made_changes ? '#A5D6A7' : '#FFE0B2'}` }}>
                  <CheckCircle sx={{ fontSize: 16, color: s.training_made_changes ? '#2E7D32' : '#BDBDBD' }} />
                  <Typography variant="body2">
                    {s.training_made_changes === true
                      ? 'Training delivered by the programme has made changes to this business'
                      : s.training_made_changes === false
                        ? 'Training has not yet made changes to this business'
                        : 'Training impact not recorded'}
                  </Typography>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid #E5E7EB' }}>
              <Button onClick={() => setViewSnapshot(null)}>Close</Button>
            </DialogActions>
          </>;
        })()}
      </Dialog>

      {/* ── Training Report detail dialog ────────────────────────────────── */}
      <Dialog open={!!viewTrReport} onClose={() => setViewTrReport(null)} maxWidth="md" fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}>
        {viewTrReport && (() => {
          const tr = viewTrReport;
          const total = (tr.participants_male_youth || 0) + (tr.participants_female_youth || 0)
            + (tr.participants_adult_male || 0) + (tr.participants_adult_female || 0);
          const SECTIONS = [
            { key: 'training_purpose',    label: 'Background & Purpose' },
            { key: 'session_objectives',  label: 'Session Objectives' },
            { key: 'activities_delivered', label: 'Activities Delivered' },
            { key: 'key_lessons',         label: 'Key Lessons Learnt' },
            { key: 'growth_support_areas', label: 'Growth Support Areas' },
            { key: 'key_findings',        label: 'Key Findings & Critical Issues' },
            { key: 'bge_contributions',   label: 'BGE Contributions & Development Needs' },
            { key: 'bds_actions',         label: 'Proposed BDS Actions (Next 3 Months)' },
            { key: 'recommendations',     label: 'Recommendations' },
            { key: 'next_steps',          label: 'Next Steps' },
            { key: 'conclusion',          label: 'Conclusion' },
          ];
          return <>
            <Box sx={{ bgcolor: BRAND.sidebarBg, px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                  Lead Training Report
                </Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.3 }}>
                  {tr.session_title}
                </Typography>
              </Box>
              <Chip label={tr.status} size="small" color={tr.status === 'submitted' ? 'primary' : 'default'} />
            </Box>
            <DialogContent sx={{ p: 0 }}>
              <Box sx={{ display: 'flex', gap: 3, px: 3, py: 1.5, bgcolor: '#F8FAFC', borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap' }}>
                {[
                  ['Lead BGE', tr.bge_name],
                  ['Session Date', tr.session_date],
                  ['Location', tr.session_location],
                  ['Training Dates', tr.training_dates],
                  ['Venue', tr.venue],
                  ['District', tr.district],
                  ['Time Allocation', tr.time_allocation],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary" display="block"
                      sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Typography>
                    <Typography variant="body2" fontWeight={600}>{val}</Typography>
                  </Box>
                ))}
              </Box>
              {/* Demographics */}
              <Box sx={{ px: 3, pt: 2, pb: 1 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Participant Demographics</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Male Youth', value: tr.participants_male_youth || 0 },
                    { label: 'Female Youth', value: tr.participants_female_youth || 0 },
                    { label: 'Adult Male', value: tr.participants_adult_male || 0 },
                    { label: 'Adult Female', value: tr.participants_adult_female || 0 },
                    { label: 'Total', value: total },
                  ].map(({ label, value }) => (
                    <Box key={label} sx={{ textAlign: 'center', minWidth: 72,
                      bgcolor: '#F4F6F9', borderRadius: 1.5, px: 1.5, py: 1 }}>
                      <Typography variant="h6" fontWeight={700}>{value}</Typography>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                    </Box>
                  ))}
                </Box>
                {tr.facilitation_team && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 10 }}>
                      Facilitation Team
                    </Typography>
                    <Typography variant="body2">{tr.facilitation_team}</Typography>
                  </Box>
                )}
              </Box>
              <Divider />
              <Box sx={{ px: 3, py: 2 }}>
                {SECTIONS.map(({ key, label }, idx) => (
                  <Box key={key} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: BRAND.sidebarBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{idx + 1}</Typography>
                      </Box>
                      <Typography variant="subtitle2" fontWeight={700} color="primary">{label}</Typography>
                    </Box>
                    <Box sx={{ bgcolor: '#F4F6F9', borderRadius: 1.5, px: 2, py: 1.5,
                      borderLeft: `3px solid ${tr[key] ? '#009B62' : '#E5E7EB'}` }}>
                      {tr[key] ? (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{tr[key]}</Typography>
                      ) : (
                        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>No information recorded.</Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid #E5E7EB', gap: 1 }}>
              <Button onClick={() => openTrainingReportPdf('lead', tr.id, 'view')} startIcon={<PictureAsPdf />}>
                Open PDF
              </Button>
              <Button onClick={() => openTrainingReportPdf('lead', tr.id, 'download')} startIcon={<Download />}>
                Download
              </Button>
              <Button onClick={() => setViewTrReport(null)}>Close</Button>
            </DialogActions>
          </>;
        })()}
      </Dialog>

      {/* ── Mentor Training Report detail dialog ─────────────────────────── */}
      <Dialog open={!!viewMrReport} onClose={() => setViewMrReport(null)} maxWidth="md" fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}>
        {viewMrReport && (() => {
          const mr = viewMrReport;
          const SECTIONS = [
            { key: 'mentoring_activities', label: 'Mentoring Activities' },
            { key: 'msmes_mentored',       label: 'MSMEs Specifically Supported' },
            { key: 'key_observations',     label: 'Key Observations' },
            { key: 'challenges',           label: 'Challenges Encountered' },
            { key: 'recommendations',      label: 'Recommendations' },
            { key: 'next_steps',           label: 'Next Steps' },
          ];
          return <>
            <Box sx={{ bgcolor: '#6a1b9a', px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                  Mentor Training Report
                </Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.3 }}>
                  {mr.session_title}
                </Typography>
              </Box>
              <Chip label={mr.status} size="small" color={mr.status === 'submitted' ? 'primary' : 'default'} />
            </Box>
            <DialogContent sx={{ p: 0 }}>
              <Box sx={{ display: 'flex', gap: 3, px: 3, py: 1.5, bgcolor: '#F8FAFC', borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap' }}>
                {[
                  ['Mentor BGE', mr.bge_name],
                  ['Lead BGE', mr.lead_bge_name],
                  ['Session Date', mr.session_date],
                  ['Location', mr.session_location],
                  ['Training Dates', mr.training_dates],
                  ['Venue', mr.venue],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary" display="block"
                      sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Typography>
                    <Typography variant="body2" fontWeight={600}>{val}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ px: 3, py: 2 }}>
                {SECTIONS.map(({ key, label }, idx) => (
                  <Box key={key} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: '#6a1b9a',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{idx + 1}</Typography>
                      </Box>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#6a1b9a' }}>{label}</Typography>
                    </Box>
                    <Box sx={{ bgcolor: '#F4F6F9', borderRadius: 1.5, px: 2, py: 1.5,
                      borderLeft: `3px solid ${mr[key] ? '#6a1b9a' : '#E5E7EB'}` }}>
                      {mr[key] ? (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{mr[key]}</Typography>
                      ) : (
                        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>No information recorded.</Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid #E5E7EB', gap: 1 }}>
              <Button onClick={() => openTrainingReportPdf('mentor', mr.id, 'view')} startIcon={<PictureAsPdf />}>
                Open PDF
              </Button>
              <Button onClick={() => openTrainingReportPdf('mentor', mr.id, 'download')} startIcon={<Download />}>
                Download
              </Button>
              <Button onClick={() => setViewMrReport(null)}>Close</Button>
            </DialogActions>
          </>;
        })()}
      </Dialog>

      <Dialog open={!!viewReport} onClose={() => setViewReport(null)} maxWidth="md" fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}>
        {viewReport && (() => {
          const vr = viewReport;
          const visitLabels = { initial: 'Initial Assessment', followup: 'Follow-up Visit', final: 'Final Assessment', training: 'Training Support', mentoring: 'Mentoring Session' };
          const statusColors = { draft: 'default', submitted: 'primary', reviewed: 'success' };
          const SECTIONS = [
            { key: 'business_overview',     label: 'Business Overview' },
            { key: 'challenges_identified', label: 'Challenges Identified' },
            { key: 'support_provided',      label: 'Support Provided' },
            { key: 'recommendations',       label: 'Recommendations' },
            { key: 'action_plan',           label: 'Action Plan' },
            { key: 'next_steps',            label: 'Next Steps' },
            { key: 'additional_notes',      label: 'Additional Notes' },
          ];
          return <>
            {/* Branded letterhead — hidden on screen, shown on print only. */}
            <div className="print-letterhead">
              <img className="gopa" src="/gopa-logo.png" alt="GOPA AFC" />
              <div className="wordmark">
                <div className="title">PRUDEV II</div>
                <div className="subtitle">MSME Portfolio Management</div>
              </div>
              <img className="giz" src="/giz-logo.png" alt="German Cooperation · Implemented by GIZ" />
            </div>
            {/* Header bar */}
            <Box sx={{ bgcolor: BRAND.sidebarBg, px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                  Visit Report
                </Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.3 }}>
                  {visitLabels[vr.visit_type] || vr.visit_type}
                </Typography>
              </Box>
              <Chip label={vr.status} size="small" color={statusColors[vr.status] || 'default'} />
            </Box>

            <DialogContent sx={{ p: 0 }}>
              {/* Meta strip */}
              <Box sx={{ display: 'flex', gap: 3, px: 3, py: 1.5, bgcolor: '#F8FAFC', borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap' }}>
                {[
                  ['Business', vr._msme?.business_name || vr.msme_name],
                  ['MSME Code', vr._msme?.msme_code || vr.msme_code],
                  ['Sector', vr._msme?.sector],
                  ['Location', vr._msme?.city || vr._msme?.location],
                  ['BGE Expert', vr._bgeName],
                  ['Visit Date', vr.visit_date],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Typography>
                    <Typography variant="body2" fontWeight={600}>{val}</Typography>
                  </Box>
                ))}
              </Box>

              {/* Report sections */}
              <Box sx={{ px: 3, py: 2 }}>
                {SECTIONS.map(({ key, label }, idx) => (
                  <Box key={key} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                      <Box sx={{
                        width: 22, height: 22, borderRadius: '50%', bgcolor: BRAND.sidebarBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{idx + 1}</Typography>
                      </Box>
                      <Typography variant="subtitle2" fontWeight={700} color="primary">{label}</Typography>
                    </Box>
                    <Box sx={{
                      bgcolor: '#F4F6F9', borderRadius: 1.5, px: 2, py: 1.5,
                      borderLeft: `3px solid ${vr[key] ? '#009B62' : '#E5E7EB'}`,
                    }}>
                      {vr[key] ? (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                          {vr[key]}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                          No information recorded.
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid #E5E7EB', gap: 1 }}>
              <Button onClick={() => setViewReport(null)}>Close</Button>
            </DialogActions>
          </>;
        })()}
      </Dialog>

      {/* ── Notifications ─────────────────────────────────────────────────── */}
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError('')} anchorOrigin={{vertical:'bottom',horizontal:'center'}}>
        <Alert severity="error" onClose={() => setError('')} sx={{ width: '100%' }}>{error}</Alert>
      </Snackbar>
      <Snackbar open={!!success} autoHideDuration={3000} onClose={() => setSuccess('')} anchorOrigin={{vertical:'bottom',horizontal:'center'}}>
        <Alert severity="success" onClose={() => setSuccess('')} sx={{ width: '100%' }}>{success}</Alert>
      </Snackbar>
    </Box>
  );
}

// ── Shared section header ──────────────────────────────────────────────────
function SectionHeader({ title, subtitle, children }) {
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: { xs: 'column', sm: 'row' },
      alignItems: { xs: 'stretch', sm: 'flex-start' },
      justifyContent: 'space-between',
      gap: { xs: 1.5, sm: 2 },
      mb: 2.5,
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" fontWeight={700}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {children && (
        <Box sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          justifyContent: { xs: 'stretch', sm: 'flex-end' },
          '& > *': { flex: { xs: '1 1 150px', sm: '0 0 auto' } },
        }}>
          {children}
        </Box>
      )}
    </Box>
  );
}
