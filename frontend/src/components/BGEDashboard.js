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
} from '@mui/icons-material';
import { PDFDownloadLink } from '@react-pdf/renderer';
import axios from 'axios';
import { API_ENDPOINTS } from '../config';
import { BRAND } from '../theme';
import ReportPDF from './ReportPDF';
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

export default function BGEDashboard({ token, currentUser, onLogout }) {
  const headers = { Authorization: `Bearer ${token}` };
  const bgeName = currentUser?.bge_profile?.name || currentUser?.username || 'BGE';

  const [section, setSection] = useState('msmes');
  const [mobileOpen, setMobileOpen] = useState(false);

  const [msmes, setMsmes] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });

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

  const pushAttempted = useRef(false);

  useEffect(() => {
    fetchMsmes();
    fetchReports();
    // Request push notification permission once per session
    if (!pushAttempted.current) {
      pushAttempted.current = true;
      subscribePush(`Bearer ${token}`);
    }
  }, [fetchMsmes, fetchReports, token]);

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

  // ── sidebar ─────────────────────────────────────────────────────────────────
  const navItems = [
    { key: 'msmes',   label: 'My MSMEs',  icon: <Business /> },
    { key: 'reports', label: 'My Reports', icon: <Assignment /> },
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

        {/* ── My MSMEs ── */}
        {section === 'msmes' && !loading && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>My Assigned MSMEs</Typography>
                <Typography variant="body2" color="text.secondary">{msmes.length} enterprise{msmes.length !== 1 ? 's' : ''} assigned to you</Typography>
              </Box>
              <Button variant="contained" startIcon={<Add />} onClick={() => openNewReport()}>New Report</Button>
            </Box>

            {msmes.length === 0 ? (
              <Paper sx={{ p: 6, textAlign: 'center' }}>
                <Business sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No MSMEs assigned yet. Contact your programme administrator.</Typography>
              </Paper>
            ) : (
              <>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  {msmes.map((m) => {
                    const msmeReportCount = reports.filter(r => r.msme === m.id).length;
                    return (
                      <Grid item xs={12} sm={6} md={4} key={m.id}>
                        <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }} onClick={() => openMsmeDetail(m)}>
                          <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                              <Typography fontWeight={700} fontSize={14} sx={{ flex: 1, mr: 1 }}>{m.business_name}</Typography>
                              <Chip label={m.business_type || 'MSME'} size="small" variant="outlined" />
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{m.msme_code}</Typography>
                            {m.sector && <Typography variant="caption" color="text.secondary">{m.sector}</Typography>}
                            {m.cohort_name && (
                              <Chip label={`Cohort ${m.cohort_name}`} size="small" sx={{ mt: 1, bgcolor: BRAND.programmeGreen + '20', color: BRAND.programmeGreen, fontWeight: 600 }} />
                            )}
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
              </>
            )}
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
                            <Tooltip title="Download PDF">
                              <span>
                                <PDFDownloadLink
                                  document={
                                    <ReportPDF
                                      report={r}
                                      msme={msmes.find(m => m.id === r.msme)}
                                      bgeName={bgeName}
                                    />
                                  }
                                  fileName={`report_${r.msme_code || r.msme}_${r.visit_date}.pdf`}
                                  style={{ textDecoration: 'none' }}
                                >
                                  {({ loading: pdfLoading }) => (
                                    <IconButton size="small" color="error" disabled={pdfLoading}>
                                      <PictureAsPdf fontSize="small" />
                                    </IconButton>
                                  )}
                                </PDFDownloadLink>
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

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" required>
                <InputLabel>MSME</InputLabel>
                <Select value={reportForm.msme} label="MSME" onChange={e => setReportForm({ ...reportForm, msme: e.target.value })}>
                  {msmes.map(m => (
                    <MenuItem key={m.id} value={m.id}>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{m.business_name}</Typography>
                        {m.msme_code && <Typography variant="caption" color="text.secondary">{m.msme_code}</Typography>}
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
              <Button onClick={() => setViewReport(null)}>Close</Button>
              <PDFDownloadLink
                document={<ReportPDF report={vr} msme={vr._msme} bgeName={vr._bgeName} />}
                fileName={`report-${vr.msme_name || vr.msme}-${vr.visit_date}.pdf`}
              >
                {({ loading: pdfLoading }) => (
                  <Button variant="contained" color="error"
                    startIcon={pdfLoading ? <CircularProgress size={14} color="inherit" /> : <PictureAsPdf />}
                    disabled={pdfLoading}>
                    {pdfLoading ? 'Preparing PDF…' : 'Download PDF'}
                  </Button>
                )}
              </PDFDownloadLink>
            </DialogActions>
          </>;
        })()}
      </Dialog>

      <Snackbar
        open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack({ ...snack, open: false })}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
