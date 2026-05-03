import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip, LinearProgress,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem, Alert,
  Snackbar, CircularProgress, Avatar, Divider, TablePagination,
  Tooltip, Checkbox, Card, CardContent, Grid, Drawer, List,
  ListItemButton, ListItemIcon, ListItemText, AppBar, Toolbar,
  Badge, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import {
  Business, People, School, Assessment, ChevronRight,
  Add, Upload, Visibility, Edit, Delete, Search, CheckCircle,
  TrendingUp, Support, LocationOn, EventNote, Group,
  AccountTree, Menu as MenuIcon, Logout, ManageAccounts,
  LockReset, PersonAdd, LinkOff, Email, PictureAsPdf,
  Assignment, DragHandle, ExpandMore,
  Lock, LockOpen,
} from '@mui/icons-material';
import { PDFDownloadLink } from '@react-pdf/renderer';
import axios from 'axios';
import { API_ENDPOINTS, EXPERT_SEND_EMAIL_URL, EXPERT_PREVIEW_EMAIL_URL } from '../config';
import { BRAND } from '../theme';
import ReportPDF from './ReportPDF';

const ROWS_PER_PAGE = 15;
const DRAWER_WIDTH = 220;

const NAV_ITEMS = [
  { key: 'msmes',       label: 'MSMEs',          icon: <Business /> },
  { key: 'experts',     label: 'BGE Experts',    icon: <People /> },
  { key: 'assignments', label: 'Assignments',    icon: <Assignment /> },
  { key: 'users',       label: 'User Accounts',  icon: <ManageAccounts /> },
  { key: 'bgegroups',   label: 'BGE Groups',     icon: <Group /> },
  { key: 'cohorts',     label: 'Cohorts',        icon: <AccountTree /> },
  { key: 'training',    label: 'Training',       icon: <School /> },
  { key: 'reports',     label: 'Reports',        icon: <PictureAsPdf /> },
  { key: 'analytics',   label: 'Analytics',      icon: <Assessment /> },
];

export default function Dashboard({ token, currentUser, onLogout }) {
  const isAdmin = currentUser?.is_staff || currentUser?.is_superuser || false;
  const headers = { Authorization: `Bearer ${token}` };

  const [section, setSection] = useState('msmes');
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── nav drag-and-drop ──────────────────────────────────────────────────────
  const [navOrder, setNavOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dashNavOrder') || 'null');
      if (Array.isArray(saved) && saved.every(k => NAV_ITEMS.some(n => n.key === k))) return saved;
    } catch {}
    return NAV_ITEMS.map(n => n.key);
  });
  const orderedNav = navOrder.map(k => NAV_ITEMS.find(n => n.key === k)).filter(Boolean);
  const [dragKey, setDragKey] = useState(null);
  const [navLocked, setNavLocked] = useState(true);

  // ── data ───────────────────────────────────────────────────────────────────
  const [msmes, setMsmes] = useState([]);
  const [experts, setExperts] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [bgeGroups, setBgeGroups] = useState([]);
  const [trainingSessions, setTrainingSessions] = useState([]);
  const [trainingTopics, setTrainingTopics] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(false);

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
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [groupLoading, setGroupLoading] = useState(false);
  const [manageGroupItem, setManageGroupItem] = useState(null);

  // ── training dialogs ───────────────────────────────────────────────────────
  const [sessionDialog, setSessionDialog] = useState(false);
  const [sessionForm, setSessionForm] = useState({ title: '', date: '', location: '', description: '', topic: '' });
  const [sessionLoading, setSessionLoading] = useState(false);
  const [attendanceDialog, setAttendanceDialog] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionMsmes, setSessionMsmes] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // ── reports ────────────────────────────────────────────────────────────────
  const [reports, setReports] = useState([]);
  const [reportFilterBge, setReportFilterBge] = useState('');
  const [reportFilterStatus, setReportFilterStatus] = useState('');
  const [viewReport, setViewReport] = useState(null);
  const [reportPage, setReportPage] = useState(0);
  const [emailingBgeId, setEmailingBgeId] = useState(null);
  const [emailPreview, setEmailPreview] = useState(null);   // { subject, body, to, bge }
  const [emailEditBody, setEmailEditBody] = useState('');   // editable copy of body
  const [emailEditSubject, setEmailEditSubject] = useState(''); // editable subject
  const [emailSending, setEmailSending] = useState(false);

  // ── assignment dialog ──────────────────────────────────────────────────────
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);  // MSME being assigned
  const [assignForm, setAssignForm] = useState({ bge_id: '', objectives: '', assignment_date: '' });
  const [assignSaving, setAssignSaving] = useState(false);

  // ── BGE-first assignments state ────────────────────────────────────────────
  const [bgeObjectives, setBgeObjectives] = useState({});
  const [savingObjectives, setSavingObjectives] = useState({});
  const [addMsmeDialog, setAddMsmeDialog] = useState(null); // bge object
  const [addMsmePick, setAddMsmePick] = useState('');

  // ── user management ────────────────────────────────────────────────────────
  const [bgeUsers, setBgeUsers] = useState([]);
  const [userDialog, setUserDialog] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', password: '', email: '', bge_id: '' });
  const [userLoading, setUserLoading] = useState(false);
  const [pwdDialog, setPwdDialog] = useState(false);
  const [pwdUser, setPwdUser] = useState(null);
  const [newPwd, setNewPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  // ── fetch ──────────────────────────────────────────────────────────────────
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

      const [mRes, eRes, cRes, gRes, sRes, tRes, aRes, uRes, rRes] = await Promise.all([
        axios.get(`${API_ENDPOINTS.MSMES}?${params}`, { headers: h }),
        axios.get(API_ENDPOINTS.EXPERTS, { headers: h }),
        axios.get(API_ENDPOINTS.COHORTS, { headers: h }),
        axios.get(API_ENDPOINTS.BGE_GROUPS, { headers: h }),
        axios.get(API_ENDPOINTS.TRAINING_SESSIONS, { headers: h }),
        axios.get(API_ENDPOINTS.TRAINING_TOPICS, { headers: h }),
        axios.get(`${API_ENDPOINTS.MSMES}analytics/`, { headers: h }),
        axios.get(API_ENDPOINTS.BGE_USERS, { headers: h }),
        axios.get(`${API_ENDPOINTS.REPORTS}?${reportParams}`, { headers: h }),
      ]);

      const toArr = (d) => (Array.isArray(d) ? d : d.results || []);
      setMsmes(toArr(mRes.data));
      setExperts(toArr(eRes.data));
      setCohorts(toArr(cRes.data));
      setBgeGroups(toArr(gRes.data));
      setTrainingSessions(toArr(sRes.data));
      setTrainingTopics(toArr(tRes.data));
      setAnalytics(aRes.data);
      setBgeUsers(Array.isArray(uRes.data) ? uRes.data : []);
      setReports(toArr(rRes.data));
      setError('');
    } catch {
      setError('Failed to load data. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [token, msmeSearch, filterType, filterSector, filterCohort, reportFilterBge, reportFilterStatus]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
  const openExpertView = async (bge) => {
    setViewItem(bge);
    setViewType('expert');
    try {
      const res = await axios.get(`${API_ENDPOINTS.EXPERTS}${bge.id}/`, { headers });
      setViewItem(res.data);
    } catch {
      // keep the cached item already shown
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
      await axios.patch(url, editForm, { headers });
      notify('Saved successfully');
      closeEdit();
      fetchAll();
    } catch { notify('Failed to save', 'error'); }
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

  // ── MSME upload dialog ─────────────────────────────────────────────────────
  const [msmeUploadDialog, setMsmeUploadDialog] = useState(false);
  const [msmeUploadCohort, setMsmeUploadCohort] = useState('');
  const [msmeUploadNewCohort, setMsmeUploadNewCohort] = useState('');
  const [msmeUploadFile, setMsmeUploadFile] = useState(null);
  const [msmeUploading, setMsmeUploading] = useState(false);
  const [msmeUploadSkipDups, setMsmeUploadSkipDups] = useState(false);
  const msmeFileRef = React.useRef();

  const openMsmeUpload = () => {
    setMsmeUploadDialog(true);
    setMsmeUploadCohort('');
    setMsmeUploadNewCohort('');
    setMsmeUploadFile(null);
    setMsmeUploadSkipDups(false);
  };

  const doMsmeUpload = async () => {
    if (!msmeUploadFile) { notify('Please select a file', 'error'); return; }
    setMsmeUploading(true);
    const fd = new FormData();
    fd.append('file', msmeUploadFile);
    const cohortName = msmeUploadCohort === '__new__' ? msmeUploadNewCohort.trim() : msmeUploadCohort;
    if (cohortName) fd.append('cohort_name', cohortName);
    fd.append('update_existing', msmeUploadSkipDups ? 'false' : 'true');
    try {
      const res = await axios.post(API_ENDPOINTS.UPLOAD_MSMES, fd, { headers });
      notify(res.data?.message || 'MSMEs uploaded');
      setMsmeUploadDialog(false);
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
      setGroupForm({ name: '', description: '' });
      fetchAll();
    } catch { notify('Failed to create group', 'error'); }
    finally { setGroupLoading(false); }
  };

  const toggleGroupMember = async (groupId, bgeId, isMember) => {
    const action = isMember ? 'remove_member' : 'add_member';
    try {
      await axios.post(`${API_ENDPOINTS.BGE_GROUPS}${groupId}/${action}/`, { bge_id: bgeId }, { headers });
      fetchAll();
    } catch { notify('Failed to update group', 'error'); }
  };

  // ── training ───────────────────────────────────────────────────────────────
  const createSession = async () => {
    setSessionLoading(true);
    try {
      const payload = { ...sessionForm };
      if (!payload.topic) delete payload.topic;
      await axios.post(API_ENDPOINTS.TRAINING_SESSIONS, payload, { headers });
      notify('Session created');
      setSessionDialog(false);
      setSessionForm({ title: '', date: '', location: '', description: '', topic: '' });
      fetchAll();
    } catch { notify('Failed to create session', 'error'); }
    finally { setSessionLoading(false); }
  };

  const openAttendance = async (session) => {
    setSelectedSession(session);
    setAttendanceLoading(true);
    setAttendanceDialog(true);
    try {
      const res = await axios.get(`${API_ENDPOINTS.ATTENDANCE}?session=${session.id}`, { headers });
      const attended = new Set((Array.isArray(res.data) ? res.data : res.data.results || []).filter(a => a.present).map(a => a.msme));
      setSessionMsmes(msmes.map(m => ({ ...m, present: attended.has(m.id) })));
    } catch { notify('Failed to load attendance', 'error'); }
    finally { setAttendanceLoading(false); }
  };

  const saveAttendance = async () => {
    setAttendanceLoading(true);
    try {
      await Promise.all(sessionMsmes.map(m =>
        axios.post(`${API_ENDPOINTS.TRAINING_SESSIONS}${selectedSession.id}/mark_attendance/`, { msme_id: m.id, present: m.present }, { headers })
      ));
      notify('Attendance saved');
      setAttendanceDialog(false);
      fetchAll();
    } catch { notify('Failed to save attendance', 'error'); }
    finally { setAttendanceLoading(false); }
  };

  // ── user management helpers ────────────────────────────────────────────────
  const createBGEUser = async () => {
    if (!userForm.username || !userForm.password) return;
    setUserLoading(true);
    try {
      await axios.post(API_ENDPOINTS.BGE_USERS, userForm, { headers });
      notify('User account created');
      setUserDialog(false);
      setUserForm({ username: '', password: '', email: '', bge_id: '' });
      fetchAll();
    } catch (e) { notify(e.response?.data?.error || 'Failed to create user', 'error'); }
    finally { setUserLoading(false); }
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: BRAND.sidebarBg }}>
      <Box sx={{ p: 2.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
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
      <List sx={{ flex: 1, py: 1 }}>
        {orderedNav.map(({ key, label, icon }) => (
          <ListItemButton
            key={key}
            selected={section === key}
            onClick={() => { setSection(key); setMobileOpen(false); }}
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
      <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Avatar sx={{ width: 30, height: 30, bgcolor: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
            {currentUser?.username?.[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600, lineHeight: 1 }} noWrap>
              {currentUser?.username}
            </Typography>
            {isAdmin && (
              <Typography variant="caption" sx={{ color: '#ffd54f' }}>Admin</Typography>
            )}
          </Box>
        </Box>
        <Button
          fullWidth size="small" startIcon={<Logout />}
          onClick={onLogout}
          sx={{ color: 'rgba(255,255,255,0.7)', justifyContent: 'flex-start', textTransform: 'none' }}
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
      <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(item, type)}><Edit fontSize="small" /></IconButton></Tooltip>
      {isAdmin && <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => { setDeleteItem(item); setDeleteType(type); }}><Delete fontSize="small" /></IconButton></Tooltip>}
    </Box>
  );

  const renderMSMEs = () => (
    <Box>
      <SectionHeader title="MSMEs" subtitle={`${msmes.length} records`}>
        <Button variant="outlined" startIcon={<Upload />} size="small" onClick={openMsmeUpload}>
          Import MSME List
        </Button>
      </SectionHeader>

      {/* filters */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search name, owner, sector…" value={msmeSearch}
          onChange={e => setMsmeSearch(e.target.value)} onKeyPress={e => e.key === 'Enter' && fetchAll()}
          InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} /> }}
          sx={{ minWidth: 220 }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Type</InputLabel>
          <Select value={filterType} onChange={e => { setFilterType(e.target.value); setMsmePage(0); }} label="Type">
            <MenuItem value="">All</MenuItem>
            {['MICRO','SMALL','MEDIUM'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Sector</InputLabel>
          <Select value={filterSector} onChange={e => { setFilterSector(e.target.value); setMsmePage(0); }} label="Sector">
            <MenuItem value="">All</MenuItem>
            {['MANUFACTURING','SERVICES','TRADE','AGRICULTURE','TECHNOLOGY','CONSTRUCTION','HEALTHCARE','EDUCATION','OTHER'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Cohort</InputLabel>
          <Select value={filterCohort} onChange={e => { setFilterCohort(e.target.value); setMsmePage(0); }} label="Cohort">
            <MenuItem value="">All</MenuItem>
            {cohorts.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
        <Button variant="contained" size="small" onClick={fetchAll}>Search</Button>
        {(msmeSearch || filterType || filterSector || filterCohort) &&
          <Button size="small" onClick={() => { setMsmeSearch(''); setFilterType(''); setFilterSector(''); setFilterCohort(''); }}>Clear</Button>}
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
              <TableCell>Assigned BGE</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginate(msmes, msmePage).length === 0 ? (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>No MSMEs found</TableCell></TableRow>
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

  const renderExperts = () => (
    <Box>
      <SectionHeader title="BGE Experts" subtitle={`${experts.length} experts`}>
        <Button variant="outlined" startIcon={<Upload />} size="small" onClick={openBgeUpload}>
          Import BGE Excel
        </Button>
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
                    <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: BRAND.primaryMain }}>{e.name[0]}</Avatar>
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
                      <Tooltip title="Delete group">
                        <IconButton size="small" color="error" onClick={() => { setDeleteItem(group); setDeleteType('group'); }}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {group.members_detail?.slice(0, 5).map(m => (
                    <Chip key={m.id} avatar={<Avatar sx={{ fontSize: 10 }}>{m.name[0]}</Avatar>} label={m.name} size="small" />
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
              onClick={() => { setFilterCohort(c.id); setSection('msmes'); }}
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
      <SectionHeader title="Training Sessions" subtitle={`${trainingSessions.length} sessions`}>
        <Button variant="contained" startIcon={<Add />} size="small" onClick={() => setSessionDialog(true)}>
          New Session
        </Button>
      </SectionHeader>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Topic</TableCell>
              <TableCell>Attendance</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginate(trainingSessions, sessionPage).length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>No sessions yet</TableCell></TableRow>
            ) : paginate(trainingSessions, sessionPage).map(s => (
              <TableRow key={s.id} hover>
                <TableCell fontWeight={500}>{s.title}</TableCell>
                <TableCell>{s.date}</TableCell>
                <TableCell>{s.location || '—'}</TableCell>
                <TableCell>{s.topic_name || '—'}</TableCell>
                <TableCell><Chip icon={<EventNote />} label={`${s.attendance_count ?? 0} present`} size="small" color="info" /></TableCell>
                <TableCell>
                  <Tooltip title="Mark attendance">
                    <IconButton size="small" color="primary" onClick={() => openAttendance(s)}><CheckCircle fontSize="small" /></IconButton>
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

  const renderAnalytics = () => (
    <Box>
      <SectionHeader title="Analytics" subtitle="Programme overview" />
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { icon: <Business />, val: analytics.total_msmes || 0, label: 'Total MSMEs', color: BRAND.primaryMain },
          { icon: <People />, val: analytics.total_employees || 0, label: 'Total Employees', color: BRAND.sidebarBg },
          { icon: <TrendingUp />, val: fmt(analytics.total_annual_revenue), label: 'Annual Revenue', color: BRAND.programmeGreen },
          { icon: <Support />, val: experts.length, label: 'Experts', color: BRAND.gizRed },
        ].map((s, i) => (
          <Grid item xs={6} md={3} key={i}>
            <Card sx={{ bgcolor: s.color, color: '#fff' }}>
              <CardContent sx={{ pb: '16px !important' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h5" fontWeight={700}>{s.val}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.8 }}>{s.label}</Typography>
                  </Box>
                  <Box sx={{ opacity: 0.7 }}>{s.icon}</Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        {[
          { title: 'By Type', data: analytics.business_type_stats, key: 'business_type' },
          { title: 'By Sector', data: analytics.sector_stats, key: 'sector' },
          { title: 'By Cohort', data: analytics.cohort_stats, key: 'cohort__name' },
        ].map(chart => (
          <Grid item xs={12} md={4} key={chart.title}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>{chart.title}</Typography>
                {(chart.data || []).map((stat, i) => (
                  <Box key={i} sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                      <Typography variant="caption">{stat[chart.key] || 'Unassigned'}</Typography>
                      <Typography variant="caption" fontWeight={600}>{stat.count}</Typography>
                    </Box>
                    <LinearProgress variant="determinate"
                      value={analytics.total_msmes ? (stat.count / analytics.total_msmes) * 100 : 0}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );

  const renderUsers = () => (
    <Box>
      <SectionHeader title="User Accounts" subtitle={`${bgeUsers.length} BGE login account${bgeUsers.length !== 1 ? 's' : ''}`}>
        <Button variant="contained" size="small" startIcon={<PersonAdd />} onClick={() => setUserDialog(true)}>
          Create Account
        </Button>
      </SectionHeader>

      <Alert severity="info" sx={{ mb: 2 }}>
        Create login accounts here for BGE Experts so they can sign in. Link each account to a BGE Expert profile so they only see their assigned MSMEs.
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
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bgeUsers.map(u => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: BRAND.programmeGreen }}>{u.username[0].toUpperCase()}</Avatar>
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
                    <Chip label={u.is_active ? 'Active' : 'Disabled'} size="small" color={u.is_active ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="right">
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Filter by BGE</InputLabel>
            <Select value={reportFilterBge} label="Filter by BGE"
              onChange={e => { setReportFilterBge(e.target.value); setReportPage(0); }}>
              <MenuItem value="">All BGEs</MenuItem>
              {experts.map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 130 }}>
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
                      <PDFDownloadLink
                        document={
                          <ReportPDF
                            report={r}
                            msme={msme}
                            bgeName={r.bge_name || bge.name}
                          />
                        }
                        fileName={`report-${r.msme_name || r.id}-${r.visit_date}.pdf`}
                      >
                        {({ loading: pdfLoading }) => (
                          <Tooltip title="Download PDF">
                            <span>
                              <IconButton size="small" color="error" disabled={pdfLoading}>
                                {pdfLoading ? <CircularProgress size={16} /> : <PictureAsPdf fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </PDFDownloadLink>
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
    </Box>
  );

  const openAddMsme = (bge) => {
    setAssignTarget(null);
    setAddMsmeDialog(bge);
    setAddMsmePick('');
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
                          {e.name[0]}
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
                          onChange={ev => setBgeObjectives(prev => ({ ...prev, [e.id]: ev.target.value }))}
                          onFocus={() => {
                            if (!(e.id in bgeObjectives)) {
                              setBgeObjectives(prev => ({ ...prev, [e.id]: e.deployment_objectives || '' }));
                            }
                          }}
                          InputLabelProps={{ shrink: true }}
                        />
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
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}

        {/* Add MSME to BGE dialog */}
        <Dialog open={!!addMsmeDialog} onClose={() => setAddMsmeDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Add MSME to {addMsmeDialog?.name}</DialogTitle>
          <DialogContent>
            <FormControl fullWidth size="small" sx={{ mt: 1 }}>
              <InputLabel>Select MSME</InputLabel>
              <Select value={addMsmePick} label="Select MSME" onChange={ev => setAddMsmePick(ev.target.value)}>
                <MenuItem value=""><em>Choose...</em></MenuItem>
                {msmes.filter(m => !m.assigned_bge || m.assigned_bge === addMsmeDialog?.id).map(m => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.business_name} {m.assigned_bge ? '(reassign)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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

  const sectionMap = {
    msmes: renderMSMEs,
    experts: renderExperts,
    assignments: renderAssignments,
    users: renderUsers,
    bgegroups: renderBGEGroups,
    cohorts: renderCohorts,
    training: renderTraining,
    reports: renderReports,
    analytics: renderAnalytics,
  };

  // ── main render ────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#fafafa' }}>
      {/* mobile top bar */}
      <AppBar position="fixed" sx={{ display: { md: 'none' }, bgcolor: BRAND.sidebarBg, zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="subtitle1" fontWeight={700}>PRUDEV II</Typography>
        </Toolbar>
      </AppBar>

      {/* sidebar — permanent on desktop, drawer on mobile */}
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', border: 'none' } }}>
          {drawerContent}
        </Drawer>
        <Drawer variant="permanent"
          sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', border: 'none' } }}>
          {drawerContent}
        </Drawer>
      </Box>

      {/* main content */}
      <Box component="main" sx={{ flex: 1, p: { xs: 2, md: 3 }, mt: { xs: 7, md: 0 }, overflow: 'auto' }}>
        {loading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}
        {sectionMap[section]?.()}
      </Box>

      {/* ── View dialog ──────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onClose={() => setViewItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider' }}>
          {viewItem?.business_name || viewItem?.name} — Details
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
          ) : viewItem ? (
            /* ── MSME / generic view ── */
            <Grid container spacing={1.5}>
              {Object.entries(viewItem)
                .filter(([k]) => !['id','is_active','source_file','created_at','updated_at','latitude','longitude','assigned_msmes_list','group_names'].includes(k))
                .map(([k, v]) => (
                  <Grid item xs={6} key={k}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Typography>
                    <Typography variant="body2">{v !== null && v !== '' && v !== undefined ? String(v) : '—'}</Typography>
                  </Grid>
                ))}
            </Grid>
          ) : null}
        </DialogContent>
        <DialogActions><Button onClick={() => setViewItem(null)}>Close</Button></DialogActions>
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
      <Dialog open={msmeUploadDialog} onClose={() => setMsmeUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import MSME List</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }} icon={false}>
            Supports <strong>Cohort 1</strong> format (CSV or Excel with columns: <em>Name, District, Town, Name of contact person, Mobile phone numbers…</em>) and <strong>Cohort 2</strong> survey format (Excel with columns: <em>1.1. Business Name:, District, Town/City…</em>). The format is detected automatically.
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMsmeUploadDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={doMsmeUpload}
            disabled={msmeUploading || !msmeUploadFile || (msmeUploadCohort === '__new__' && !msmeUploadNewCohort.trim())}
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
      <Dialog open={groupDialog} onClose={() => setGroupDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New BGE Group</DialogTitle>
        <DialogContent dividers>
          <TextField fullWidth size="small" label="Group Name" sx={{ mb: 2 }} value={groupForm.name} onChange={e => setGroupForm({...groupForm, name: e.target.value})} />
          <TextField fullWidth size="small" multiline rows={2} label="Description" value={groupForm.description} onChange={e => setGroupForm({...groupForm, description: e.target.value})} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGroupDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={createGroup} disabled={groupLoading || !groupForm.name}>
            {groupLoading ? <CircularProgress size={18} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Manage group members ──────────────────────────────────────────── */}
      <Dialog open={!!manageGroupItem} onClose={() => setManageGroupItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Manage Members — {manageGroupItem?.name}</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <List dense>
            {experts.map(e => {
              const isMember = manageGroupItem?.members_detail?.some(m => m.id === e.id);
              return (
                <ListItemButton key={e.id} onClick={() => toggleGroupMember(manageGroupItem.id, e.id, isMember)}>
                  <ListItemIcon>
                    <Checkbox checked={!!isMember} size="small" disableRipple />
                  </ListItemIcon>
                  <ListItemText primary={e.name} secondary={`${e.location} · ${e.top_skills}`} />
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
      <Dialog open={sessionDialog} onClose={() => setSessionDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Training Session</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}><TextField fullWidth size="small" required label="Title" value={sessionForm.title} onChange={e => setSessionForm({...sessionForm, title: e.target.value})} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" required label="Date" type="date" InputLabelProps={{shrink:true}} value={sessionForm.date} onChange={e => setSessionForm({...sessionForm, date: e.target.value})} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Location" value={sessionForm.location} onChange={e => setSessionForm({...sessionForm, location: e.target.value})} /></Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small"><InputLabel>Topic</InputLabel>
                <Select value={sessionForm.topic} onChange={e => setSessionForm({...sessionForm, topic: e.target.value})} label="Topic">
                  <MenuItem value="">None</MenuItem>
                  {trainingTopics.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}><TextField fullWidth size="small" multiline rows={2} label="Description" value={sessionForm.description} onChange={e => setSessionForm({...sessionForm, description: e.target.value})} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSessionDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={createSession} disabled={sessionLoading || !sessionForm.title || !sessionForm.date}>
            {sessionLoading ? <CircularProgress size={18} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Attendance ────────────────────────────────────────────────────── */}
      <Dialog open={attendanceDialog} onClose={() => setAttendanceDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Attendance — {selectedSession?.title} ({selectedSession?.date})</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {attendanceLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <Table size="small">
              <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell padding="checkbox">Present</TableCell>
                  <TableCell>Code</TableCell>
                  <TableCell>Business</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Location</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessionMsmes.map(m => (
                  <TableRow key={m.id} hover onClick={() => setSessionMsmes(prev => prev.map(x => x.id === m.id ? {...x, present: !x.present} : x))} sx={{cursor:'pointer'}}>
                    <TableCell padding="checkbox"><Checkbox checked={!!m.present} size="small" /></TableCell>
                    <TableCell><Chip label={m.msme_code} size="small" variant="outlined" /></TableCell>
                    <TableCell>{m.business_name}</TableCell>
                    <TableCell>{m.owner_name}</TableCell>
                    <TableCell>{m.city}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Typography variant="body2" sx={{ flex:1, pl:2, color:'text.secondary' }}>
            {sessionMsmes.filter(m => m.present).length} / {sessionMsmes.length} present
          </Typography>
          <Button onClick={() => setAttendanceDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveAttendance} disabled={attendanceLoading}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* ── Create BGE User ───────────────────────────────────────────────── */}
      <Dialog open={userDialog} onClose={() => setUserDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create BGE Login Account</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create a username and password for a BGE Expert so they can sign in to their portal.
          </Typography>
          <TextField fullWidth size="small" label="Username" sx={{ mb: 2 }}
            value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} />
          <TextField fullWidth size="small" label="Password" type="password" sx={{ mb: 2 }}
            value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} />
          <TextField fullWidth size="small" label="Email (optional)" sx={{ mb: 2 }}
            value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} />
          <FormControl fullWidth size="small">
            <InputLabel>Link to BGE Expert Profile</InputLabel>
            <Select value={userForm.bge_id} label="Link to BGE Expert Profile"
              onChange={e => setUserForm({ ...userForm, bge_id: e.target.value })}>
              <MenuItem value="">— Not linked yet —</MenuItem>
              {experts.filter(e => !bgeUsers.some(u => u.bge_profile?.id === e.id)).map(e => (
                <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialog(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<PersonAdd />}
            onClick={createBGEUser}
            disabled={userLoading || !userForm.username || !userForm.password}>
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
              <PDFDownloadLink
                document={<ReportPDF report={vr} msme={vr._msme} bgeName={vr._bgeName} />}
                fileName={`report-${vr.msme_name || vr.id}-${vr.visit_date}.pdf`}
              >
                {({ loading: pdfLoading }) => (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={pdfLoading ? <CircularProgress size={14} color="inherit" /> : <PictureAsPdf />}
                    disabled={pdfLoading}
                  >
                    {pdfLoading ? 'Preparing PDF…' : 'Download PDF'}
                  </Button>
                )}
              </PDFDownloadLink>
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
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2.5 }}>
      <Box>
        <Typography variant="h6" fontWeight={700}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {children && <Box sx={{ display: 'flex', gap: 1 }}>{children}</Box>}
    </Box>
  );
}
