import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem, Alert,
  Snackbar, CircularProgress, Avatar, Divider, TablePagination,
  Card, CardContent, Grid, List, ListItemButton, ListItemIcon,
  ListItemText, AppBar, Toolbar, Tooltip,
} from '@mui/material';
import {
  Business, Add, Visibility, Menu as MenuIcon,
  Logout, Assignment, CheckCircle, Edit, PictureAsPdf,
  Group as GroupIcon, Star, Description, Print,
} from '@mui/icons-material';
import axios from 'axios';
import { API_ENDPOINTS } from '../config';
import { BRAND } from '../theme';
import { subscribePush } from '../index';

const DRAWER_WIDTH = 220;
const ROWS_PER_PAGE = 15;

const VISIT_TYPE_LABELS = {
  initial: 'Initial Assessment',
  followup: 'Follow-up Visit',
  final: 'Final Assessment',
  training: 'Training Support',
  mentoring: 'Mentoring Session',
};

const STATUS_COLORS = {
  draft: 'default',
  submitted: 'primary',
  reviewed: 'success',
};

const EMPTY_REPORT = {
  msme: '',
  visit_type: 'followup',
  visit_date: new Date().toISOString().slice(0, 10),
  business_overview: '',
  challenges_identified: '',
  support_provided: '',
  recommendations: '',
  action_plan: '',
  next_steps: '',
  additional_notes: '',
  status: 'draft',
};

const EMPTY_GROUP_REPORT = {
  group: '',
  session_number: '',
  visit_date: new Date().toISOString().slice(0, 10),
  msmes_supported: [],
  attendees: [],
  session_overview: '',
  challenges_identified: '',
  interventions_delivered: '',
  outcomes_achieved: '',
  next_steps: '',
  additional_notes: '',
  status: 'draft',
};

const EMPTY_CONTRIBUTION = {
  group_report: '',
  msmes_observed: [],
  notes: '',
  challenges_observed: '',
  interventions_made: '',
  follow_up_needed: '',
};

const STANDARD_CONDITIONS = [
  'The BGE must use only the standardised PRUDEV II tools and templates and submit all reports in the provided formats.',
  'The BGE is fully accountable for the accuracy, completeness, and timely submission of all attendance sheets and field reports.',
  'Under no circumstances may the BGE retain, store, or record MSME CRM login credentials. All account access details must be handed directly and exclusively to the MSME owner.',
  'All MSME data and business information must be handled strictly confidentially.',
  'GOPA AFC retains ownership of all outputs produced under this Work Order.',
  'A 6% withholding tax will be applied in accordance with Ugandan tax laws.',
  'BGE must use their official BGE code in all documentation.',
  'Timely submission of outputs is required to avoid payment delays.',
  'GOPA AFC reserves the right to terminate this Work Order in cases of non-performance, data mishandling, or breach of any condition above.',
];


export default function BGEDashboard({ token, currentUser, onLogout }) {
  const headers = { Authorization: `Bearer ${token}` };
  const bgeName = currentUser?.bge_profile?.name || currentUser?.username || 'BGE';

  const [section, setSection] = useState('msmes');
  const [mobileOpen, setMobileOpen] = useState(false);

  const [msmes, setMsmes] = useState([]);
  const [reports, setReports] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupReports, setGroupReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });

  // group-report dialog
  const [groupReportDialog, setGroupReportDialog] = useState(false);
  const [editingGroupReport, setEditingGroupReport] = useState(null);
  const [groupReportForm, setGroupReportForm] = useState(EMPTY_GROUP_REPORT);
  const [groupReportSaving, setGroupReportSaving] = useState(false);
  const [groupReportErrors, setGroupReportErrors] = useState('');

  // Member contribution dialog (non-leader BGEs feeding info into a group report)
  const [contributionDialog, setContributionDialog] = useState(false);
  const [contributionForm, setContributionForm] = useState(EMPTY_CONTRIBUTION);
  const [contributionSaving, setContributionSaving] = useState(false);
  const [contributionErrors, setContributionErrors] = useState('');
  const [contributionEditingId, setContributionEditingId] = useState(null);

  // Work orders (read-only for BGE — admin issues, BGE views)
  const [workOrders, setWorkOrders] = useState([]);
  const [workOrderPreview, setWorkOrderPreview] = useState(null);

  // Signature upload
  const [sigFile, setSigFile] = useState(null);
  const [sigUploading, setSigUploading] = useState(false);
  const [sigUrl, setSigUrl] = useState(currentUser?.bge_profile?.signature_url || null);
  const sigInputRef = useRef(null);

  const myBgeId = currentUser?.bge_profile?.id;
  const myBgeCode = currentUser?.bge_profile?.bge_code || '';

  // pagination
  const [reportPage, setReportPage] = useState(0);

  // report dialog
  const [reportDialog, setReportDialog] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [reportForm, setReportForm] = useState(EMPTY_REPORT);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportErrors, setReportErrors] = useState('');

  // MSME detail dialog
  const [msmeDetailDialog, setMsmeDetailDialog] = useState(false);
  const [selectedMsme, setSelectedMsme] = useState(null);
  const [msmeReports, setMsmeReports] = useState([]);

  // in-app report viewer
  const [viewReport, setViewReport] = useState(null);

  const notify = (msg, severity = 'success') => setSnack({ open: true, msg, severity });

  const fetchMsmes = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    setLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.MSMES, { headers: h });
      setMsmes(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      notify('Failed to load MSMEs', 'error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchReports = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(API_ENDPOINTS.REPORTS, { headers: h });
      setReports(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      notify('Failed to load reports', 'error');
    }
  }, [token]);

  const fetchGroups = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(API_ENDPOINTS.BGE_GROUPS, { headers: h });
      const all = Array.isArray(res.data) ? res.data : res.data.results || [];
      // Backend returns every group the BGE-user can see — for a non-admin
      // BGE user, the list endpoint isn't tenant-scoped (it's open), so
      // narrow to just the groups this BGE belongs to client-side.
      setGroups(all.filter(g => (g.members_detail || []).some(m => m.id === myBgeId)));
    } catch {
      // silent — group view is optional
    }
  }, [token, myBgeId]);

  const fetchGroupReports = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(API_ENDPOINTS.GROUP_REPORTS, { headers: h });
      setGroupReports(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      // silent — endpoint may be unreachable on stale deploys
    }
  }, [token]);

  const fetchWorkOrders = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(API_ENDPOINTS.WORK_ORDERS, { headers: h });
      setWorkOrders(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      // silent
    }
  }, [token]);

  const pushAttempted = useRef(false);

  useEffect(() => {
    fetchMsmes();
    fetchReports();
    fetchGroups();
    fetchGroupReports();
    fetchWorkOrders();
    // Request push notification permission once per session
    if (!pushAttempted.current) {
      pushAttempted.current = true;
      subscribePush(`Bearer ${token}`);
    }
  }, [fetchMsmes, fetchReports, fetchGroups, fetchGroupReports, fetchWorkOrders, token]);

  const openNewReport = (msmeId = '') => {
    setEditingReport(null);
    setReportForm({ ...EMPTY_REPORT, msme: msmeId });
    setReportErrors('');
    setReportDialog(true);
  };

  const openEditReport = (report) => {
    setEditingReport(report);
    setReportForm({
      msme: report.msme,
      visit_type: report.visit_type,
      visit_date: report.visit_date,
      business_overview: report.business_overview || '',
      challenges_identified: report.challenges_identified || '',
      support_provided: report.support_provided || '',
      recommendations: report.recommendations || '',
      action_plan: report.action_plan || '',
      next_steps: report.next_steps || '',
      additional_notes: report.additional_notes || '',
      status: report.status,
    });
    setReportErrors('');
    setReportDialog(true);
  };

  const saveReport = async () => {
    if (!reportForm.msme) { setReportErrors('Please select an MSME.'); return; }
    if (!reportForm.visit_date) { setReportErrors('Please set a visit date.'); return; }
    setReportSaving(true);
    setReportErrors('');
    try {
      if (editingReport) {
        await axios.patch(`${API_ENDPOINTS.REPORTS}${editingReport.id}/`, reportForm, { headers });
        notify('Report updated');
      } else {
        await axios.post(API_ENDPOINTS.REPORTS, reportForm, { headers });
        notify('Report saved');
      }
      setReportDialog(false);
      fetchReports();
    } catch (err) {
      setReportErrors(err.response?.data?.detail || 'Failed to save report.');
    } finally {
      setReportSaving(false);
    }
  };

  // ── group reports ─────────────────────────────────────────────────────────
  const openNewGroupReport = (groupId = '') => {
    setEditingGroupReport(null);
    setGroupReportForm({ ...EMPTY_GROUP_REPORT, group: groupId });
    setGroupReportErrors('');
    setGroupReportDialog(true);
  };

  const openEditGroupReport = (rep) => {
    setEditingGroupReport(rep);
    setGroupReportForm({
      group: rep.group,
      session_number: rep.session_number || '',
      visit_date: rep.visit_date,
      msmes_supported: rep.msmes_supported || [],
      attendees: rep.attendees || [],
      session_overview: rep.session_overview || '',
      challenges_identified: rep.challenges_identified || '',
      interventions_delivered: rep.interventions_delivered || '',
      outcomes_achieved: rep.outcomes_achieved || '',
      next_steps: rep.next_steps || '',
      additional_notes: rep.additional_notes || '',
      status: rep.status,
    });
    setGroupReportErrors('');
    setGroupReportDialog(true);
  };

  const saveGroupReport = async () => {
    if (!groupReportForm.group) { setGroupReportErrors('Please select a group.'); return; }
    if (!groupReportForm.visit_date) { setGroupReportErrors('Please set a visit date.'); return; }
    setGroupReportSaving(true);
    setGroupReportErrors('');
    const payload = {
      ...groupReportForm,
      session_number: groupReportForm.session_number === '' ? null : Number(groupReportForm.session_number),
    };
    try {
      if (editingGroupReport) {
        await axios.patch(`${API_ENDPOINTS.GROUP_REPORTS}${editingGroupReport.id}/`, payload, { headers });
        notify('Group report updated');
      } else {
        await axios.post(API_ENDPOINTS.GROUP_REPORTS, payload, { headers });
        notify('Group report saved');
      }
      setGroupReportDialog(false);
      fetchGroupReports();
    } catch (err) {
      setGroupReportErrors(
        err.response?.data?.detail
        || JSON.stringify(err.response?.data || {})
        || 'Failed to save group report.'
      );
    } finally {
      setGroupReportSaving(false);
    }
  };

  const isTeamLeadOf = (group) => group?.team_lead === myBgeId;

  // ── Member contributions ──────────────────────────────────────────────────
  const openContribution = async (groupReport) => {
    setContributionErrors('');
    // If I already have a contribution for this report, load it; otherwise blank
    try {
      const r = await axios.get(
        `${API_ENDPOINTS.GROUP_REPORT_CONTRIBUTIONS}?group_report=${groupReport.id}`,
        { headers }
      );
      const list = Array.isArray(r.data) ? r.data : (r.data.results || []);
      const mine = list.find(c => c.bge === myBgeId);
      if (mine) {
        setContributionEditingId(mine.id);
        setContributionForm({
          group_report:        groupReport.id,
          msmes_observed:      mine.msmes_observed || [],
          notes:               mine.notes || '',
          challenges_observed: mine.challenges_observed || '',
          interventions_made:  mine.interventions_made || '',
          follow_up_needed:    mine.follow_up_needed || '',
        });
      } else {
        setContributionEditingId(null);
        setContributionForm({ ...EMPTY_CONTRIBUTION, group_report: groupReport.id });
      }
    } catch {
      setContributionEditingId(null);
      setContributionForm({ ...EMPTY_CONTRIBUTION, group_report: groupReport.id });
    }
    setContributionDialog(true);
  };

  const saveContribution = async () => {
    if (!contributionForm.group_report) { setContributionErrors('Missing group_report id'); return; }
    setContributionSaving(true);
    setContributionErrors('');
    try {
      if (contributionEditingId) {
        await axios.patch(
          `${API_ENDPOINTS.GROUP_REPORT_CONTRIBUTIONS}${contributionEditingId}/`,
          contributionForm, { headers }
        );
        notify('Contribution updated');
      } else {
        // POST acts as upsert on the backend (same (report, bge) pair → updates)
        await axios.post(API_ENDPOINTS.GROUP_REPORT_CONTRIBUTIONS, contributionForm, { headers });
        notify('Contribution saved');
      }
      setContributionDialog(false);
      fetchGroupReports();
    } catch (err) {
      setContributionErrors(
        err.response?.data?.detail || JSON.stringify(err.response?.data || {})
        || 'Failed to save contribution.'
      );
    } finally {
      setContributionSaving(false);
    }
  };

  // ── PDF / print helpers ───────────────────────────────────────────────────
  // Open the server-rendered PDF for an MSME visit report. `mode='download'`
  // forces a file download (?dl=1); `mode='view'` opens it inline so the
  // browser's PDF viewer handles its own print/save UI.
  const openMsmeReportPdf = async (reportId, mode = 'view') => {
    try {
      const res = await axios.get(
        `${API_ENDPOINTS.REPORTS}${reportId}/pdf/${mode === 'download' ? '?dl=1' : ''}`,
        { headers, responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `MSMEReport_${reportId}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, '_blank');
      }
      // Defer revoke so the new tab can read the URL
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      notify('Failed to render PDF', 'error');
    }
  };

  const openGroupReportPdf = async (reportId, mode = 'view') => {
    try {
      const res = await axios.get(
        `${API_ENDPOINTS.GROUP_REPORTS}${reportId}/pdf/${mode === 'download' ? '?dl=1' : ''}`,
        { headers, responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `GroupReport_${reportId}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      notify('Failed to render PDF', 'error');
    }
  };

  const openMsmeDetail = async (msme) => {
    setSelectedMsme(msme);
    setMsmeDetailDialog(true);
    try {
      const res = await axios.get(`${API_ENDPOINTS.REPORTS}?msme=${msme.id}`, { headers });
      setMsmeReports(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      setMsmeReports([]);
    }
  };

  // ── signature upload ──────────────────────────────────────────────────────
  const uploadSignature = async () => {
    if (!sigFile) return;
    setSigUploading(true);
    try {
      const bgeId = currentUser?.bge_profile?.id;
      const fd = new FormData();
      fd.append('signature', sigFile);
      const res = await axios.post(
        `${API_ENDPOINTS.EXPERTS}${bgeId}/upload-signature/`,
        fd,
        { headers: { ...headers, 'Content-Type': 'multipart/form-data' } },
      );
      setSigUrl(res.data.signature_url);
      setSigFile(null);
      notify('Signature uploaded successfully');
    } catch (err) {
      notify(err.response?.data?.error || 'Signature upload failed', 'error');
    } finally {
      setSigUploading(false);
    }
  };

  // ── sidebar ─────────────────────────────────────────────────────────────────
  const navItems = [
    { key: 'msmes',       label: 'My MSMEs',      icon: <Business /> },
    { key: 'groups',      label: 'My Groups',      icon: <GroupIcon /> },
    { key: 'reports',     label: 'My Reports',     icon: <Assignment /> },
    { key: 'workorders',  label: 'Work Orders',    icon: <Description /> },
  ];

  const SidebarContent = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: BRAND.sidebarBg }}>
      <Box sx={{ px: 2.5, py: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: 1, bgcolor: BRAND.programmeGreen,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography sx={{ fontWeight: 900, fontSize: 10, color: '#fff', lineHeight: 1 }}>GIZ</Typography>
          </Box>
          <Box sx={{
            width: 32, height: 32, borderRadius: 1, bgcolor: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography sx={{ fontWeight: 900, fontSize: 7, color: BRAND.primaryMain, lineHeight: 1.1, textAlign: 'center' }}>GOPA{'\n'}AFC</Typography>
          </Box>
        </Box>
        <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 13, mt: 1 }}>PRUDEV II</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>BGE Portal</Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />

      <List sx={{ flex: 1, px: 1, pt: 1 }}>
        {navItems.map(({ key, label, icon }) => (
          <ListItemButton
            key={key}
            selected={section === key}
            onClick={() => { setSection(key); setMobileOpen(false); }}
            sx={{
              borderRadius: 2, mb: 0.5, color: 'rgba(255,255,255,0.75)',
              '&.Mui-selected': { bgcolor: BRAND.sidebarSelected, color: '#fff' },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{icon}</ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: BRAND.programmeGreen }}>
            {bgeName[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 600 }} noWrap>{bgeName}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>BGE</Typography>
          </Box>
        </Box>
        <Button
          variant="outlined" size="small" startIcon={<Logout />} onClick={onLogout} fullWidth
          sx={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.2)',
            '&:hover': { borderColor: '#fff', color: '#fff', bgcolor: 'rgba(255,255,255,0.05)' }, fontSize: 12 }}
        >
          Sign out
        </Button>
      </Box>
    </Box>
  );

  // ── main content ─────────────────────────────────────────────────────────────
  const paged = (arr, page) => arr.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* mobile appbar */}
      <AppBar position="fixed" sx={{ display: { md: 'none' }, bgcolor: BRAND.sidebarBg, zIndex: (t) => t.zIndex.drawer + 1, boxShadow: 'none' }}>
        <Toolbar>
          <IconButton color="inherit" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 1 }}><MenuIcon /></IconButton>
          <Typography fontWeight={700} fontSize={15}>PRUDEV II · BGE Portal</Typography>
        </Toolbar>
      </AppBar>

      {/* desktop sidebar */}
      <Box sx={{ width: DRAWER_WIDTH, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
        <Box sx={{ width: DRAWER_WIDTH, position: 'fixed', top: 0, bottom: 0 }}>
          <SidebarContent />
        </Box>
      </Box>

      {/* main */}
      <Box component="main" sx={{ flex: 1, p: { xs: 2, md: 3 }, mt: { xs: 7, md: 0 } }}>
        {loading && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 4 }} />}

        {/* ── My MSMEs (direct assignments only) ── */}
        {section === 'msmes' && !loading && (() => {
          const directMsmes = msmes.filter(m => m.assigned_bge === myBgeId);
          return (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>My MSMEs</Typography>
                  <Typography variant="body2" color="text.secondary">
                    <Box component="span" sx={{ color: BRAND.primaryMain, fontWeight: 600 }}>
                      {directMsmes.length}
                    </Box>
                    {' '}directly assigned to you · group MSMEs are in{' '}
                    <Box component="span"
                      sx={{ color: '#F9A825', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setSection('groups')}>
                      My Groups
                    </Box>
                  </Typography>
                </Box>
                <Button variant="contained" startIcon={<Add />} onClick={() => openNewReport()}>New Report</Button>
              </Box>

              {directMsmes.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center' }}>
                  <Business sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">No MSMEs directly assigned yet. Contact your programme administrator.</Typography>
                </Paper>
              ) : (
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  {directMsmes.map((m) => {
                    const msmeReportCount = reports.filter(r => r.msme === m.id).length;
                    return (
                      <Grid item xs={12} sm={6} md={4} key={m.id}>
                        <Card
                          sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 }, borderLeft: `4px solid ${BRAND.primaryMain}` }}
                          onClick={() => openMsmeDetail(m)}
                        >
                          <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                              <Typography fontWeight={700} fontSize={14} sx={{ flex: 1, mr: 1 }}>{m.business_name}</Typography>
                              <Chip label={m.business_type || 'MSME'} size="small" variant="outlined" />
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{m.msme_code}</Typography>
                            {m.sector && <Typography variant="caption" color="text.secondary" display="block">{m.sector}</Typography>}

                            <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                              {m.cohort_name && (
                                <Chip label={`Cohort ${m.cohort_name}`} size="small"
                                  sx={{ bgcolor: BRAND.programmeGreen + '20', color: BRAND.programmeGreen, fontWeight: 600 }} />
                              )}
                              {m.session_number && (
                                <Chip label={`Session ${m.session_number}`} size="small" variant="outlined" />
                              )}
                            </Box>

                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                              <Typography variant="caption" color="text.secondary">
                                {msmeReportCount} report{msmeReportCount !== 1 ? 's' : ''}
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <Tooltip title="View & write reports">
                                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openMsmeDetail(m); }}>
                                    <Visibility fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="New report for this MSME">
                                  <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); openNewReport(m.id); }}>
                                    <Add fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Box>
          );
        })()}

        {/* ── My Groups ── */}
        {section === 'groups' && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>My Groups</Typography>
                <Typography variant="body2" color="text.secondary">
                  {groups.length} group{groups.length !== 1 ? 's' : ''} you're a member of
                </Typography>
              </Box>
            </Box>

            {groups.length === 0 && (
              <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
                You're not currently part of any BGE group.
              </Paper>
            )}

            <Grid container spacing={2}>
              {groups.map(g => {
                const groupMsmes = msmes.filter(m => m.assigned_group === g.id);
                const youAreLead = isTeamLeadOf(g);
                const reports = groupReports.filter(r => r.group === g.id);
                return (
                  <Grid item xs={12} key={g.id}>
                    <Card variant="outlined">
                      <CardContent>
                        {/* Header */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2, flexWrap: 'wrap' }}>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Typography variant="subtitle1" fontWeight={700}>{g.name}</Typography>
                              {youAreLead && (
                                <Chip icon={<Star sx={{ fontSize: 14 }} />} label="You are the team lead" color="warning" size="small" />
                              )}
                            </Box>
                            {g.description && (
                              <Typography variant="caption" color="text.secondary">{g.description}</Typography>
                            )}
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                              Team Lead: <strong>{g.team_lead_name || 'Not assigned'}</strong> · {g.member_count} member{g.member_count !== 1 ? 's' : ''}
                            </Typography>
                          </Box>
                          {youAreLead && (
                            <Button variant="contained" size="small" startIcon={<Add />}
                                    onClick={() => openNewGroupReport(g.id)}>
                              File Group Report
                            </Button>
                          )}
                        </Box>

                        {/* Objectives banner */}
                        {g.objectives && (
                          <Alert severity="info" icon={<Assignment fontSize="small" />} sx={{ mb: 2 }}>
                            <Typography variant="caption" fontWeight={600} display="block">Group objectives</Typography>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{g.objectives}</Typography>
                          </Alert>
                        )}

                        {/* Members */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                          {(g.members_detail || []).map(m => (
                            <Chip
                              key={m.id}
                              label={m.name}
                              size="small"
                              icon={m.id === g.team_lead ? <Star sx={{ fontSize: 14 }} /> : undefined}
                              color={m.id === g.team_lead ? 'warning' : (m.id === myBgeId ? 'primary' : 'default')}
                              variant={m.id === myBgeId ? 'filled' : 'outlined'}
                            />
                          ))}
                        </Box>

                        <Divider sx={{ my: 1.5 }} />

                        {/* Assigned MSMEs — full scrollable list */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <GroupIcon sx={{ fontSize: 16, color: '#F9A825' }} />
                          <Typography variant="caption" fontWeight={600}>
                            Assigned MSMEs ({groupMsmes.length})
                          </Typography>
                        </Box>
                        {groupMsmes.length === 0 ? (
                          <Typography variant="caption" color="text.secondary">No MSMEs assigned to this group yet.</Typography>
                        ) : (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 240, overflow: 'auto' }}>
                            {groupMsmes.map(m => (
                              <Box key={m.id} sx={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                p: 1, borderRadius: 1, bgcolor: 'background.default',
                              }}>
                                <Box>
                                  <Typography variant="body2" fontWeight={500}>{m.business_name}</Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {m.msme_code}{m.session_number ? ` · Session ${m.session_number}` : ''}{m.city ? ` · ${m.city}` : ''}
                                  </Typography>
                                </Box>
                                <Tooltip title="Open MSME">
                                  <IconButton size="small" onClick={() => openMsmeDetail(m)}><Visibility fontSize="small" /></IconButton>
                                </Tooltip>
                              </Box>
                            ))}
                          </Box>
                        )}

                        {/* Group reports already filed */}
                        {reports.length > 0 && (
                          <>
                            <Divider sx={{ my: 1.5 }} />
                            <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
                              Group reports ({reports.length})
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {reports.map(r => (
                                <Box key={r.id} sx={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  p: 1, borderRadius: 1, bgcolor: 'background.default',
                                }}>
                                  <Box>
                                    <Typography variant="body2" fontWeight={500}>
                                      {r.visit_date}{r.session_number ? ` · Session ${r.session_number}` : ''}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {r.msme_count} MSME{r.msme_count !== 1 ? 's' : ''} · by {r.team_lead_name || '—'}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Chip label={r.status} size="small" color={r.status === 'approved' ? 'success' : (r.status === 'submitted' ? 'primary' : 'default')} />
                                    <Tooltip title="View PDF">
                                      <IconButton size="small" onClick={() => openGroupReportPdf(r.id, 'view')}><Visibility fontSize="small" /></IconButton>
                                    </Tooltip>
                                    <Tooltip title="Download PDF">
                                      <IconButton size="small" onClick={() => openGroupReportPdf(r.id, 'download')}><PictureAsPdf fontSize="small" /></IconButton>
                                    </Tooltip>
                                    {youAreLead && r.status !== 'approved' && (
                                      <IconButton size="small" onClick={() => openEditGroupReport(r)}><Edit fontSize="small" /></IconButton>
                                    )}
                                    {!youAreLead && r.status !== 'approved' && (
                                      <Tooltip title="File my contribution">
                                        <IconButton size="small" color="warning" onClick={() => openContribution(r)}>
                                          <Edit fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </Box>
                                </Box>
                              ))}
                            </Box>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* ── My Reports ── */}
        {section === 'reports' && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>My Reports</Typography>
                <Typography variant="body2" color="text.secondary">{reports.length} report{reports.length !== 1 ? 's' : ''} submitted</Typography>
              </Box>
              <Button variant="contained" startIcon={<Add />} onClick={() => openNewReport()}>New Report</Button>
            </Box>

            {reports.length === 0 ? (
              <Paper sx={{ p: 6, textAlign: 'center' }}>
                <Assignment sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No reports yet. Start by writing a report for one of your MSMEs.</Typography>
              </Paper>
            ) : (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>MSME</TableCell>
                      <TableCell>Visit Type</TableCell>
                      <TableCell>Visit Date</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paged(reports, reportPage).map((r) => (
                      <TableRow key={r.id} hover>
                        <TableCell>
                          <Typography fontSize={13} fontWeight={600}>{r.msme_name || r.msme}</Typography>
                          <Typography fontSize={11} color="text.secondary">{r.msme_code}</Typography>
                        </TableCell>
                        <TableCell>{VISIT_TYPE_LABELS[r.visit_type] || r.visit_type}</TableCell>
                        <TableCell>{r.visit_date}</TableCell>
                        <TableCell>
                          <Chip label={r.status} size="small" color={STATUS_COLORS[r.status] || 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="View report">
                              <IconButton size="small" color="primary"
                                onClick={() => setViewReport({ ...r, _msme: msmes.find(m => m.id === r.msme), _bgeName: bgeName })}>
                                <Visibility fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {r.status === 'draft' ? (
                              <Tooltip title="Edit draft">
                                <IconButton size="small" onClick={() => openEditReport(r)}><Edit fontSize="small" /></IconButton>
                              </Tooltip>
                            ) : (
                              <Tooltip title="Submitted — read only">
                                <span><IconButton size="small" disabled><Edit fontSize="small" /></IconButton></span>
                              </Tooltip>
                            )}
                            <Tooltip title="Download PDF not available">
                              <span>
                                <IconButton size="small" color="error" disabled>
                                  <PictureAsPdf fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  component="div" count={reports.length} page={reportPage}
                  rowsPerPage={ROWS_PER_PAGE} rowsPerPageOptions={[ROWS_PER_PAGE]}
                  onPageChange={(_, p) => setReportPage(p)}
                />
              </TableContainer>
            )}
          </Box>
        )}

        {/* ── Work Orders (read-only — admin issues) ── */}
        {section === 'workorders' && (
          <Box>
            {/* Signature upload card */}
            <Card variant="outlined" sx={{ mb: 3, p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>My Signature</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Upload a JPEG or PNG of your signature. It will be cleaned (background removed) and
                embedded in your work orders and reports when you submit them.
              </Typography>
              {sigUrl && (
                <Box sx={{ mb: 1.5, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'inline-block', bgcolor: '#f9f9f9' }}>
                  <img src={sigUrl} alt="My signature" style={{ maxHeight: 60, maxWidth: 220, display: 'block' }} />
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  ref={sigInputRef}
                  style={{ display: 'none' }}
                  onChange={e => setSigFile(e.target.files[0] || null)}
                />
                <Button variant="outlined" size="small" onClick={() => sigInputRef.current?.click()}>
                  {sigFile ? sigFile.name : 'Choose file…'}
                </Button>
                {sigFile && (
                  <Button variant="contained" size="small" onClick={uploadSignature} disabled={sigUploading}>
                    {sigUploading ? <CircularProgress size={16} /> : 'Upload'}
                  </Button>
                )}
                {sigUrl && !sigFile && (
                  <Typography variant="caption" color="success.main">Signature on file ✓</Typography>
                )}
              </Box>
            </Card>

            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>Issued Work Orders</Typography>
              <Typography variant="body2" color="text.secondary">
                {workOrders.length} work order{workOrders.length !== 1 ? 's' : ''} issued to you
                {myBgeCode && (
                  <Box component="span" sx={{ ml: 1, color: BRAND.primaryMain, fontWeight: 600 }}>
                    · BGE code: {myBgeCode}
                  </Box>
                )}
              </Typography>
            </Box>

            {workOrders.length === 0 ? (
              <Paper sx={{ p: 6, textAlign: 'center' }}>
                <Description sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No work orders have been issued to you yet.</Typography>
              </Paper>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {workOrders.map(wo => (
                  <Card variant="outlined" key={wo.id}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                        <Box>
                          <Typography fontWeight={700}>{wo.work_order_number}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {wo.work_order_type_display} · {wo.issue_date}
                            {wo.start_date && ` · ${wo.start_date}`}
                            {wo.end_date && ` – ${wo.end_date}`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">{wo.location}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Chip
                            label={wo.status_display || wo.status}
                            size="small"
                            color={wo.status === 'signed' ? 'success' : 'primary'}
                          />
                          <Tooltip title="Print / Save as PDF">
                            <IconButton size="small" onClick={() => setWorkOrderPreview(wo)}>
                              <Print fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                      {wo.objective && (
                        <Alert severity="info" sx={{ mt: 1.5, py: 0.5 }} icon={false}>
                          <Typography variant="caption" fontWeight={600}>Objective</Typography>
                          <Typography variant="caption" display="block" sx={{ whiteSpace: 'pre-wrap' }}>
                            {wo.objective.length > 200 ? wo.objective.slice(0, 200) + '…' : wo.objective}
                          </Typography>
                        </Alert>
                      )}
                      <Box sx={{ display: 'flex', gap: 2, mt: 1.5, flexWrap: 'wrap' }}>
                        <Typography variant="caption" color="text.secondary">
                          Rate: <strong>UGX {Number(wo.rate_per_day).toLocaleString()}/day</strong>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Max: <strong>{wo.max_days} days</strong>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Team Leader: <strong>{wo.team_leader_name}</strong>
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* ── MSME detail dialog ── */}
      <Dialog open={msmeDetailDialog} onClose={() => setMsmeDetailDialog(false)} maxWidth="sm" fullWidth>
        {selectedMsme && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography fontWeight={700}>{selectedMsme.business_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{selectedMsme.msme_code}</Typography>
                </Box>
                <Button variant="contained" size="small" startIcon={<Add />} onClick={() => { setMsmeDetailDialog(false); openNewReport(selectedMsme.id); }}>
                  New Report
                </Button>
              </Box>
            </DialogTitle>
            <DialogContent dividers>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                {selectedMsme.sector && <Grid item xs={6}><Typography variant="caption" color="text.secondary">Sector</Typography><Typography fontSize={13}>{selectedMsme.sector}</Typography></Grid>}
                {selectedMsme.business_type && <Grid item xs={6}><Typography variant="caption" color="text.secondary">Type</Typography><Typography fontSize={13}>{selectedMsme.business_type}</Typography></Grid>}
                {(selectedMsme.district || selectedMsme.town) && <Grid item xs={6}><Typography variant="caption" color="text.secondary">Location</Typography><Typography fontSize={13}>{[selectedMsme.town, selectedMsme.district].filter(Boolean).join(', ')}</Typography></Grid>}
                {selectedMsme.owner_name && <Grid item xs={6}><Typography variant="caption" color="text.secondary">Owner</Typography><Typography fontSize={13}>{selectedMsme.owner_name}</Typography></Grid>}
                {selectedMsme.phone && <Grid item xs={6}><Typography variant="caption" color="text.secondary">Phone</Typography><Typography fontSize={13}>{selectedMsme.phone}</Typography></Grid>}
                {selectedMsme.cohort_name && <Grid item xs={6}><Typography variant="caption" color="text.secondary">Cohort</Typography><Typography fontSize={13}>{selectedMsme.cohort_name}</Typography></Grid>}
              </Grid>
              <Divider sx={{ mb: 2 }} />
              <Typography fontWeight={600} sx={{ mb: 1 }}>Reports ({msmeReports.length})</Typography>
              {msmeReports.length === 0 ? (
                <Typography color="text.secondary" fontSize={13}>No reports yet for this MSME.</Typography>
              ) : (
                msmeReports.map((r) => (
                  <Box key={r.id} sx={{ border: '1px solid #E8EDF2', borderRadius: 2, p: 1.5, mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography fontSize={13} fontWeight={600}>{VISIT_TYPE_LABELS[r.visit_type] || r.visit_type}</Typography>
                        <Typography fontSize={11} color="text.secondary">{r.visit_date}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Chip label={r.status} size="small" color={STATUS_COLORS[r.status] || 'default'} />
                        {r.status === 'draft' && (
                          <IconButton size="small" onClick={() => { setMsmeDetailDialog(false); openEditReport(r); }}><Edit fontSize="small" /></IconButton>
                        )}
                      </Box>
                    </Box>
                  </Box>
                ))
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setMsmeDetailDialog(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Report form dialog ── */}
      <Dialog open={reportDialog} onClose={() => setReportDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingReport ? 'Edit Report' : 'New Visit Report'}
        </DialogTitle>
        <DialogContent dividers>
          {reportErrors && <Alert severity="error" sx={{ mb: 2 }}>{reportErrors}</Alert>}

          {/* Show the assignment / group objectives for the selected MSME so the BGE
              has the team's mission in front of them while filling out the report. */}
          {(() => {
            const m = msmes.find(x => x.id === reportForm.msme);
            if (!m) return null;
            const ao = (m.assignment_objectives || '').trim();
            const go = (m.assigned_group_objectives || '').trim();
            if (!ao && !go) return null;
            return (
              <Alert severity="info" sx={{ mb: 2 }}>
                {m.assigned_group_name && (
                  <Typography variant="caption" fontWeight={600} display="block">
                    {m.assigned_group_name} · objectives
                  </Typography>
                )}
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {ao || go}
                </Typography>
              </Alert>
            );
          })()}

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" required>
                <InputLabel>MSME</InputLabel>
                <Select value={reportForm.msme} label="MSME" onChange={e => setReportForm({ ...reportForm, msme: e.target.value })}>
                  {msmes.map(m => (
                    <MenuItem key={m.id} value={m.id}>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{m.business_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {m.msme_code}{m.assigned_group_name ? ` · ${m.assigned_group_name}` : ''}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Visit Type</InputLabel>
                <Select value={reportForm.visit_type} label="Visit Type" onChange={e => setReportForm({ ...reportForm, visit_type: e.target.value })}>
                  {Object.entries(VISIT_TYPE_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Visit Date" type="date" required
                value={reportForm.visit_date}
                onChange={e => setReportForm({ ...reportForm, visit_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select value={reportForm.status} label="Status" onChange={e => setReportForm({ ...reportForm, status: e.target.value })}>
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="submitted">Submitted</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>VISIT REPORT TEMPLATE</Typography>
          </Divider>

          {[
            { field: 'business_overview', label: 'Business Overview', hint: 'Describe the current state of the business, operations, and general performance.' },
            { field: 'challenges_identified', label: 'Challenges Identified', hint: 'List key challenges the MSME is facing (financial, operational, market, HR, etc.).' },
            { field: 'support_provided', label: 'Support Provided', hint: 'Describe the support, advice, or services provided during this visit.' },
            { field: 'recommendations', label: 'Recommendations', hint: 'What changes or actions do you recommend for the MSME?' },
            { field: 'action_plan', label: 'Action Plan', hint: 'Detail the agreed action plan with the business owner.' },
            { field: 'next_steps', label: 'Next Steps', hint: 'What are the next steps and follow-up actions planned?' },
            { field: 'additional_notes', label: 'Additional Notes', hint: 'Any other observations, concerns, or information.' },
          ].map(({ field, label, hint }) => (
            <TextField
              key={field}
              fullWidth multiline rows={3} size="small" label={label}
              placeholder={hint}
              value={reportForm[field]}
              onChange={e => setReportForm({ ...reportForm, [field]: e.target.value })}
              sx={{ mb: 2 }}
              InputLabelProps={{ shrink: true }}
            />
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setReportDialog(false)}>Cancel</Button>
          <Button
            variant="contained" onClick={saveReport} disabled={reportSaving}
            startIcon={reportSaving ? <CircularProgress size={16} color="inherit" /> : <CheckCircle />}
          >
            {editingReport ? 'Update Report' : 'Save Report'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Group Report (team lead only) ────────────────────────────────── */}
      <Dialog open={groupReportDialog} onClose={() => setGroupReportDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingGroupReport ? 'Edit Group Report' : 'New Group Report'}
          <Typography variant="caption" display="block" color="text.secondary">
            Team-lead-only. Document the session for the whole group.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {groupReportErrors && <Alert severity="error" sx={{ mb: 2 }}>{groupReportErrors}</Alert>}

          {/* Group + objectives reminder banner */}
          {(() => {
            const g = groups.find(x => x.id === groupReportForm.group);
            if (!g) return null;
            return (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="caption" fontWeight={600} display="block">
                  {g.name} · objectives
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {g.objectives || '(no objectives recorded)'}
                </Typography>
              </Alert>
            );
          })()}

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" required>
                <InputLabel>Group</InputLabel>
                <Select
                  value={groupReportForm.group}
                  label="Group"
                  // Switching group also clears the MSME multi-select — otherwise
                  // ids from the previous group's MSMEs would silently slip into
                  // the POST even though the dropdown filtered them out.
                  onChange={e => setGroupReportForm({
                    ...groupReportForm,
                    group: e.target.value,
                    msmes_supported: [],
                  })}
                  disabled={!!editingGroupReport}
                >
                  {groups.filter(g => isTeamLeadOf(g)).map(g => (
                    <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth size="small" type="number" label="Session # (optional)"
                value={groupReportForm.session_number}
                onChange={e => setGroupReportForm({ ...groupReportForm, session_number: e.target.value })}
                inputProps={{ min: 1, max: 10 }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth size="small" type="date" label="Visit Date" required
                InputLabelProps={{ shrink: true }}
                value={groupReportForm.visit_date}
                onChange={e => setGroupReportForm({ ...groupReportForm, visit_date: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={groupReportForm.status}
                  label="Status"
                  onChange={e => setGroupReportForm({ ...groupReportForm, status: e.target.value })}
                >
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="submitted">Submitted</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>MSMEs supported</InputLabel>
                <Select
                  multiple
                  value={groupReportForm.msmes_supported}
                  label="MSMEs supported"
                  onChange={e => setGroupReportForm({ ...groupReportForm, msmes_supported: e.target.value })}
                  renderValue={(ids) => `${ids.length} selected`}
                >
                  {msmes
                    .filter(m => m.assigned_group === groupReportForm.group)
                    .map(m => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.business_name} {m.session_number ? `· S${m.session_number}` : ''}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* ── Attendance ── */}
          {(() => {
            const g = groups.find(x => x.id === groupReportForm.group);
            const members = g?.members_detail || [];
            if (!members.length) return null;
            const toggleAttendee = (bgeId) => {
              const current = groupReportForm.attendees || [];
              setGroupReportForm({
                ...groupReportForm,
                attendees: current.includes(bgeId)
                  ? current.filter(id => id !== bgeId)
                  : [...current, bgeId],
              });
            };
            const allPresent = members.every(m => (groupReportForm.attendees || []).includes(m.id));
            return (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" fontWeight={700}>
                    Attendance · {(groupReportForm.attendees || []).length}/{members.length} present
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => setGroupReportForm({
                      ...groupReportForm,
                      attendees: allPresent ? [] : members.map(m => m.id),
                    })}
                  >
                    {allPresent ? 'Mark none' : 'Mark all present'}
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {members.map(m => {
                    const present = (groupReportForm.attendees || []).includes(m.id);
                    const isLead  = m.id === g.team_lead;
                    return (
                      <Chip
                        key={m.id}
                        label={m.name}
                        onClick={() => toggleAttendee(m.id)}
                        icon={isLead ? <Star sx={{ fontSize: 14 }} /> : (present ? <CheckCircle sx={{ fontSize: 14 }} /> : undefined)}
                        color={present ? (isLead ? 'warning' : 'success') : 'default'}
                        variant={present ? 'filled' : 'outlined'}
                        size="small"
                      />
                    );
                  })}
                </Box>
              </Box>
            );
          })()}

          {/* ── Member contributions ── (only when editing an existing report) */}
          {editingGroupReport && (editingGroupReport.contributions_detail || []).length > 0 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#FFF8E1', borderRadius: 1, border: '1px solid #F9A825' }}>
              <Typography variant="caption" fontWeight={700} display="block" sx={{ mb: 1, color: '#8a6d00' }}>
                Member contributions ({editingGroupReport.contributions_detail.length})
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                Notes submitted by your group members. Use these as source material to consolidate the report below.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {editingGroupReport.contributions_detail.map(c => (
                  <Box key={c.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#fff', p: 1, borderRadius: 1 }}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{c.bge_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.has_notes ? 'Notes provided' : 'No notes'} · {c.msmes_observed.length} MSMEs observed
                      </Typography>
                    </Box>
                    <Button size="small"
                      onClick={() => openContribution(editingGroupReport)}>
                      Open
                    </Button>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {[
            { field: 'session_overview',        label: 'Session overview',        hint: 'How the session ran, attendance, format used.' },
            { field: 'challenges_identified',   label: 'Challenges identified',   hint: 'Cross-cutting challenges observed across the cohort.' },
            { field: 'interventions_delivered', label: 'Interventions delivered', hint: 'Group-level coaching, training, or facilitated activities.' },
            { field: 'outcomes_achieved',       label: 'Outcomes achieved',       hint: 'Quantitative + qualitative outcomes from the session.' },
            { field: 'next_steps',              label: 'Next steps',              hint: 'Follow-up plan agreed with the group.' },
            { field: 'additional_notes',        label: 'Additional notes',        hint: 'Anything else worth recording.' },
          ].map(({ field, label, hint }) => (
            <TextField
              key={field}
              fullWidth multiline rows={3} size="small" label={label}
              placeholder={hint}
              value={groupReportForm[field]}
              onChange={e => setGroupReportForm({ ...groupReportForm, [field]: e.target.value })}
              sx={{ mt: 2 }}
              InputLabelProps={{ shrink: true }}
            />
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setGroupReportDialog(false)}>Cancel</Button>
          <Button
            variant="contained" onClick={saveGroupReport} disabled={groupReportSaving}
            startIcon={groupReportSaving ? <CircularProgress size={16} color="inherit" /> : <CheckCircle />}
          >
            {editingGroupReport ? 'Update Report' : 'Save Report'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── In-App Report Viewer ─────────────────────────────────────────── */}
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
            {/* Branded letterhead — hidden on screen, only shown when the
                user prints the page so the print fallback looks official.
                Uses raw <div> to avoid MUI's @media-print quirks. */}
            <div className="print-letterhead">
              <img className="gopa" src="/gopa-logo.png" alt="GOPA AFC" />
              <div className="wordmark">
                <div className="title">PRUDEV II</div>
                <div className="subtitle">MSME Portfolio Management</div>
              </div>
              <img className="giz" src="/giz-logo.png" alt="German Cooperation · Implemented by GIZ" />
            </div>
            <Box sx={{ bgcolor: BRAND.sidebarBg, px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Visit Report</Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.3 }}>
                  {visitLabels[vr.visit_type] || vr.visit_type}
                </Typography>
              </Box>
              <Chip label={vr.status} size="small" color={statusColors[vr.status] || 'default'} />
            </Box>
            <DialogContent sx={{ p: 0 }}>
              <Box sx={{ display: 'flex', gap: 3, px: 3, py: 1.5, bgcolor: '#F8FAFC', borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap' }}>
                {[
                  ['Business', vr._msme?.business_name || vr.msme_name],
                  ['MSME Code', vr._msme?.msme_code || vr.msme_code],
                  ['BGE Expert', vr._bgeName],
                  ['Visit Date', vr.visit_date],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Typography>
                    <Typography variant="body2" fontWeight={600}>{val}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ px: 3, py: 2 }}>
                {SECTIONS.map(({ key, label }, idx) => (
                  <Box key={key} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: BRAND.sidebarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{idx + 1}</Typography>
                      </Box>
                      <Typography variant="subtitle2" fontWeight={700} color="primary">{label}</Typography>
                    </Box>
                    <Box sx={{ bgcolor: '#F4F6F9', borderRadius: 1.5, px: 2, py: 1.5, borderLeft: `3px solid ${vr[key] ? '#009B62' : '#E5E7EB'}` }}>
                      {vr[key] ? (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{vr[key]}</Typography>
                      ) : (
                        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>No information recorded.</Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid #E5E7EB', gap: 1 }}>
              <Button onClick={() => openMsmeReportPdf(viewReport.id, 'view')}>
                Open PDF
              </Button>
              <Button startIcon={<PictureAsPdf />} onClick={() => openMsmeReportPdf(viewReport.id, 'download')}>
                Download PDF
              </Button>
              <Button onClick={() => setViewReport(null)}>Close</Button>
            </DialogActions>
          </>;
        })()}
      </Dialog>

      {/* ── Member contribution dialog ── */}
      <Dialog open={contributionDialog} onClose={() => setContributionDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>My Contribution</DialogTitle>
        <DialogContent dividers>
          {contributionErrors && <Alert severity="error" sx={{ mb: 2 }}>{contributionErrors}</Alert>}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Share your field notes with the team lead to help consolidate the group report.
          </Typography>
          <TextField fullWidth multiline minRows={3} label="Notes / Observations" sx={{ mb: 2 }}
            value={contributionForm.notes}
            onChange={e => setContributionForm(f => ({ ...f, notes: e.target.value }))} />
          <TextField fullWidth multiline minRows={2} label="Challenges observed" sx={{ mb: 2 }}
            value={contributionForm.challenges_observed}
            onChange={e => setContributionForm(f => ({ ...f, challenges_observed: e.target.value }))} />
          <TextField fullWidth multiline minRows={2} label="Interventions made" sx={{ mb: 2 }}
            value={contributionForm.interventions_made}
            onChange={e => setContributionForm(f => ({ ...f, interventions_made: e.target.value }))} />
          <TextField fullWidth multiline minRows={2} label="Follow-up needed"
            value={contributionForm.follow_up_needed}
            onChange={e => setContributionForm(f => ({ ...f, follow_up_needed: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContributionDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveContribution} disabled={contributionSaving}>
            {contributionSaving ? <CircularProgress size={18} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Work Order print/preview ── */}
      {workOrderPreview && (
        <Dialog open={Boolean(workOrderPreview)} onClose={() => setWorkOrderPreview(null)} maxWidth="md" fullWidth>
          <DialogTitle>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography fontWeight={700}>{workOrderPreview.work_order_number}</Typography>
              <Button startIcon={<Print />} variant="outlined" onClick={() => window.print()}>Print / Save PDF</Button>
            </Box>
          </DialogTitle>
          <DialogContent dividers>
            <Box sx={{ fontFamily: 'Arial, sans-serif', fontSize: 13, lineHeight: 1.6 }} className="printable-wo">
              <Typography variant="h6" fontWeight={900} align="center" gutterBottom>
                WORK ORDER – Business Growth Expert (BGE)
              </Typography>
              <Typography align="center" variant="subtitle2" color="text.secondary" gutterBottom>
                PRUDEV II Project – {workOrderPreview.work_order_type_display}
              </Typography>
              <Typography variant="body2" align="center" sx={{ mb: 2 }}>
                Pursuant to the Service Contract between GOPA AFC GmbH and{' '}
                <strong>{workOrderPreview.bge_name}</strong>, this Work Order is issued under the PRUDEV II Project framework.
              </Typography>
              <Divider sx={{ mb: 2 }} />

              {/* Header table */}
              <Grid container spacing={1} sx={{ mb: 2 }}>
                {[
                  ['Work Order Number', workOrderPreview.work_order_number],
                  ['Project Name', workOrderPreview.project_name],
                  ['Issue Date', workOrderPreview.issue_date],
                  ['Start Date', workOrderPreview.start_date || '—'],
                  ['Completion Date', workOrderPreview.end_date || '—'],
                  ['Location', workOrderPreview.location],
                  ['Duration', workOrderPreview.duration],
                ].map(([label, val]) => (
                  <React.Fragment key={label}>
                    <Grid item xs={4}>
                      <Typography variant="caption" fontWeight={700}>{label}</Typography>
                    </Grid>
                    <Grid item xs={8}>
                      <Typography variant="caption">{val}</Typography>
                    </Grid>
                  </React.Fragment>
                ))}
              </Grid>
              <Divider sx={{ mb: 2 }} />

              {/* Sections */}
              <Typography fontWeight={700} sx={{ mb: 0.5 }}>1. SCOPE OF SERVICES – Schedule 1</Typography>
              <Typography variant="caption" fontWeight={700}>Objective:</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{workOrderPreview.objective}</Typography>

              <Typography fontWeight={700} sx={{ mb: 0.5 }}>2. KEY TASKS</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{workOrderPreview.key_tasks}</Typography>

              {workOrderPreview.deliverables_json?.length > 0 && (
                <>
                  <Typography fontWeight={700} sx={{ mb: 1 }}>3. DELIVERABLES</Typography>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', mb: 2, fontSize: 12 }}>
                    <Box component="thead">
                      <Box component="tr" sx={{ bgcolor: '#f0f4f8' }}>
                        {['#', 'Deliverable', 'Due Date'].map(h => (
                          <Box component="th" key={h} sx={{ border: '1px solid #ccc', p: 0.75, textAlign: 'left', fontWeight: 700 }}>{h}</Box>
                        ))}
                      </Box>
                    </Box>
                    <Box component="tbody">
                      {workOrderPreview.deliverables_json.map(d => (
                        <Box component="tr" key={d.task_num}>
                          <Box component="td" sx={{ border: '1px solid #ccc', p: 0.75, width: 30 }}>{d.task_num}</Box>
                          <Box component="td" sx={{ border: '1px solid #ccc', p: 0.75 }}>{d.description}</Box>
                          <Box component="td" sx={{ border: '1px solid #ccc', p: 0.75, whiteSpace: 'nowrap' }}>{d.due_date}</Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </>
              )}

              <Typography fontWeight={700} sx={{ mb: 0.5 }}>4. PAYMENT TERMS – Schedule 2</Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Rate: <strong>UGX {Number(workOrderPreview.rate_per_day).toLocaleString()} per day</strong> (maximum of {workOrderPreview.max_days} days)
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Transport: Transport costs will be refunded based on public transport rates upon attendance and submission of valid receipts.
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Payment Terms: Paid upon submission and approval of all deliverables listed above, a duly filled and signed timesheet, and an approved invoice.
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                BGE must use their official BGE code (<strong>{workOrderPreview.bge_code_display || myBgeCode}</strong>) in all documentation.
              </Typography>

              <Typography fontWeight={700} sx={{ mb: 0.5 }}>5. CONDITIONS</Typography>
              {STANDARD_CONDITIONS.map((c, i) => (
                <Typography key={i} variant="body2" sx={{ mb: 0.25 }}>• {c}</Typography>
              ))}

              <Divider sx={{ my: 2 }} />
              <Typography fontWeight={700} sx={{ mb: 1 }}>SIGNATURES</Typography>
              <Grid container spacing={4}>
                <Grid item xs={6}>
                  <Typography variant="caption" fontWeight={700} display="block">On behalf of GOPA AFC GmbH</Typography>
                  <Typography variant="caption" display="block">Name: {workOrderPreview.team_leader_name}</Typography>
                  <Typography variant="caption" display="block">Position: {workOrderPreview.team_leader_position}</Typography>
                  <Typography variant="caption" display="block" sx={{ mt: 3 }}>Signature: ____________________________</Typography>
                  <Typography variant="caption" display="block">Date: ____________________</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" fontWeight={700} display="block">Business Growth Expert (BGE)</Typography>
                  <Typography variant="caption" display="block">Name: {workOrderPreview.bge_name}</Typography>
                  <Typography variant="caption" display="block">BGE Code: {workOrderPreview.bge_code_display || myBgeCode}</Typography>
                  <Typography variant="caption" display="block" sx={{ mt: 3 }}>Signature: ____________________________</Typography>
                  <Typography variant="caption" display="block">
                    Date: {workOrderPreview.bge_signed_date || '____________________'}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setWorkOrderPreview(null)}>Close</Button>
            <Button variant="contained" startIcon={<Print />} onClick={() => window.print()}>Print / Save as PDF</Button>
          </DialogActions>
        </Dialog>
      )}

      <Snackbar
        open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack({ ...snack, open: false })}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
