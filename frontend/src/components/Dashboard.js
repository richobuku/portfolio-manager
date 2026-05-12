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
  Tab, Tabs,
} from '@mui/material';
import {
  Business, People, School, Assessment, ChevronRight,
  Add, Upload, Visibility, Edit, Delete, Search, CheckCircle,
  TrendingUp, Support, LocationOn, EventNote, Group,
  AccountTree, Menu as MenuIcon, Logout, ManageAccounts,
  LockReset, PersonAdd, LinkOff, Email, PictureAsPdf,
  Assignment, DragHandle, ExpandMore,
  Lock, LockOpen, Star, StarBorder, Download,
} from '@mui/icons-material';
import axios from 'axios';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { API_ENDPOINTS, EXPERT_SEND_EMAIL_URL, EXPERT_PREVIEW_EMAIL_URL, WORK_ORDER_ISSUE_URL, WORK_ORDER_PDF_URL, MSME_SET_GROUPS_URL } from '../config';
import { BRAND } from '../theme';

const ROWS_PER_PAGE = 15;
const DRAWER_WIDTH = 220;

const NAV_ITEMS = [
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
];

export default function Dashboard({ token, currentUser, onLogout }) {
  const isViewer = currentUser?.role === 'viewer';
  const isAdmin  = !isViewer && (currentUser?.is_staff || currentUser?.is_superuser || currentUser?.role === 'cohort_admin' || false);
  const headers  = { Authorization: `Bearer ${token}` };

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
  const [programmeGroups, setProgrammeGroups] = useState([]);
  const [trainingSessions, setTrainingSessions] = useState([]);
  const [trainingTopics, setTrainingTopics] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(false);

  // ── work orders ───────────────────────────────────────────────────────────
  const [workOrders, setWorkOrders] = useState([]);
  const [woFilterBge, setWoFilterBge] = useState('');
  const [woFilterStatus, setWoFilterStatus] = useState('');
  const [woDialog, setWoDialog] = useState(false);
  const [woEditing, setWoEditing] = useState(null);
  const [woForm, setWoForm] = useState({});
  const [woSaving, setWoSaving] = useState(false);
  const [woErrors, setWoErrors] = useState('');
  const [woIssuing, setWoIssuing] = useState(null);

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
  const [assignedGroupMsmeIds, setAssignedGroupMsmeIds] = useState([]); // currently-assigned ids for the open group
  const [groupMsmeSession, setGroupMsmeSession] = useState('');
  const [groupMsmeSearch, setGroupMsmeSearch] = useState('');
  const [groupMsmeSaving, setGroupMsmeSaving] = useState(false);

  // ── training dialogs ───────────────────────────────────────────────────────
  const [sessionDialog, setSessionDialog] = useState(false);
  const [sessionForm, setSessionForm] = useState({ title: '', date: '', location: '', description: '', topic: '', work_order: '' });
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
        axios.get(API_ENDPOINTS.BGE_USERS, { headers: h }),
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

  const fetchWorkOrders = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    const params = new URLSearchParams();
    if (woFilterBge) params.append('bge', woFilterBge);
    if (woFilterStatus) params.append('status', woFilterStatus);
    try {
      const res = await axios.get(`${API_ENDPOINTS.WORK_ORDERS}?${params}`, { headers: h });
      setWorkOrders(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      setWorkOrders([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, woFilterBge, woFilterStatus]);

  useEffect(() => { fetchWorkOrders(); }, [fetchWorkOrders]);

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
  const openAssignMsmeDialog = async (group) => {
    setAssignMsmeGroup(group);
    setGroupMsmeSession('');
    setGroupMsmeSearch('');
    try {
      const r = await axios.get(`${API_ENDPOINTS.BGE_GROUPS}${group.id}/msmes/`, { headers });
      const ids = (Array.isArray(r.data) ? r.data : (r.data.results || [])).map(m => m.id);
      setAssignedGroupMsmeIds(ids);
    } catch {
      setAssignedGroupMsmeIds([]);
    }
  };

  const toggleGroupMsme = (msmeId) => {
    setAssignedGroupMsmeIds(prev =>
      prev.includes(msmeId) ? prev.filter(id => id !== msmeId) : [...prev, msmeId]
    );
  };

  const saveGroupMsmeAssignments = async () => {
    if (!assignMsmeGroup) return;
    setGroupMsmeSaving(true);
    try {
      // Wipe current assignments for this group, then re-assign the selected set.
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
      setSessionForm({ title: '', date: '', location: '', description: '', topic: '', work_order: '' });
      fetchAll();
    } catch { notify('Failed to create session', 'error'); }
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
          onChange={e => setMsmeSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchAll()}
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
              <TableCell>Groups</TableCell>
              <TableCell>Assigned BGE</TableCell>
              <TableCell>Location</TableCell>
              <TableCell align="center">Supports</TableCell>
              <TableCell>Last Support</TableCell>
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
                <TableCell sx={{ fontWeight: 500 }}>{s.title}</TableCell>
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
              <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary' }}>FILTER</Typography>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Cohort</InputLabel>
                <Select label="Cohort" value={analyticsFilter.cohort}
                  onChange={e => setAnalyticsFilter(f => ({ ...f, cohort: e.target.value }))}>
                  <MenuItem value="">All</MenuItem>
                  {cohorts.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>District</InputLabel>
                <Select label="District" value={analyticsFilter.district}
                  onChange={e => setAnalyticsFilter(f => ({ ...f, district: e.target.value }))}>
                  <MenuItem value="">All</MenuItem>
                  {(A.top_districts || []).map(d => <MenuItem key={d.state} value={d.state}>{d.state}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Sector</InputLabel>
                <Select label="Sector" value={analyticsFilter.sector}
                  onChange={e => setAnalyticsFilter(f => ({ ...f, sector: e.target.value }))}>
                  <MenuItem value="">All</MenuItem>
                  {(A.sector_stats || []).map(s => <MenuItem key={s.sector} value={s.sector}>{s.sector}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
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
            <Tab label="Overview"       />
            <Tab label="Diagnostic"     />
            <Tab label="Performance"    />
            <Tab label="Geography"      />
          </Tabs>
        </Paper>

        {/* ════════════════════════════════════════════════════════════════
            TAB 0 — Overview
            ════════════════════════════════════════════════════════════════ */}
        {analyticTab === 0 && (
          <Box>
            <SectionLabel>Key Metrics</SectionLabel>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {[
                { val: totalMsmes,                                                              label: 'MSMEs',           sub: 'in filtered view',   color: BRAND.primaryMain },
                { val: A.total_bges   || experts.length,                                        label: 'Experts (BGEs)',  sub: 'total registered',   color: BRAND.gizRed },
                { val: A.total_groups || 0,                                                     label: 'BGE Groups',      sub: 'active teams',       color: '#0288D1' },
                { val: (A.total_reports||0)+(A.total_group_reports||0),                         label: 'Reports Filed',   sub: 'all time',           color: '#2E7D32' },
                { val: A.total_employees || 0,                                                  label: 'Employees',       sub: 'manual entries',     color: '#5D4037' },
                { val: fmt(A.total_annual_revenue),                                             label: 'Annual Revenue',  sub: 'manual entries',     color: '#7B1FA2' },
              ].map((k, i) => <Grid item xs={6} md={4} lg={2} key={i}><KPI {...k} /></Grid>)}
            </Grid>

            <SectionLabel>Business Profile</SectionLabel>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <ChartCard title="By Business Type" subtitle="Share of MSMEs by scale">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData(A.business_type_stats, 'business_type')} dataKey="value" nameKey="name"
                           outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                        {(A.business_type_stats||[]).map((_,i)=><Cell key={i} fill={CHART_PALETTE[i%CHART_PALETTE.length]}/>)}
                      </Pie>
                      <ReTooltip /><Legend wrapperStyle={{fontSize:11}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </Grid>
              <Grid item xs={12} md={4}>
                <ChartCard title="By Sector" subtitle="Industry distribution">
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
                <ChartCard title="By Gender" subtitle="Founder demographics">
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

            <SectionLabel>Growth Over Time</SectionLabel>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={8}>
                <ChartCard title="MSMEs Onboarded Over Time" subtitle="Monthly additions" height={280}>
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
                <ChartCard title="By Cohort" subtitle="Enrolment per cohort" height={280}>
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
          </Box>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 1 — Diagnostic Intelligence
            ════════════════════════════════════════════════════════════════ */}
        {analyticTab === 1 && (
          <Box>
            {diagTotal === 0 ? (
              <Alert severity="info">
                No diagnostic baseline data yet. Run <code>python manage.py import_diagnostics &lt;excel&gt;</code> to import.
              </Alert>
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
            TAB 2 — Performance
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
          </Box>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 3 — Geography
            ════════════════════════════════════════════════════════════════ */}
        {analyticTab === 3 && (
          <Box>
            <SectionLabel>Geographic Distribution</SectionLabel>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <ChartCard title="Top Districts (System)" subtitle="From MSME profiles" height={340}>
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
                <ChartCard title="Districts (Diagnostic)" subtitle="From application diagnostics — more complete" height={340}>
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
      </Box>
    );
  };

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
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
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

  const applyWoDefaults = (type) => {
    const d = WO_DEFAULTS[type] || WO_DEFAULTS.other;
    setWoForm(f => ({ ...f, work_order_type: type, objective: d.objective, key_tasks: d.key_tasks, deliverables_json: d.deliverables_json }));
  };

  const openWoCreate = () => { setWoEditing(null); setWoForm({ ...WO_EMPTY }); setWoErrors(''); setWoDialog(true); };
  const openWoEdit = (wo) => {
    setWoEditing(wo);
    setWoForm({
      bge: wo.bge,
      group: wo.group || '',
      work_order_type: wo.work_order_type,
      project_name: wo.project_name,
      issue_date: wo.issue_date,
      start_date: wo.start_date || '',
      end_date: wo.end_date || '',
      location: wo.location,
      duration: wo.duration,
      objective: wo.objective,
      key_tasks: wo.key_tasks,
      deliverables_json: wo.deliverables_json || [],
      rate_per_day: wo.rate_per_day,
      max_days: wo.max_days,
      transport_reimbursed: wo.transport_reimbursed,
      payment_notes: wo.payment_notes || '',
      team_leader_name: wo.team_leader_name,
      team_leader_position: wo.team_leader_position,
    });
    setWoErrors('');
    setWoDialog(true);
  };

  const saveWo = async () => {
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
      setSuccess(woEditing ? 'Work order updated.' : 'Work order created.');
      setWoDialog(false);
      fetchWorkOrders();
    } catch (err) {
      setWoErrors(err.response?.data?.detail || JSON.stringify(err.response?.data || {}) || 'Save failed.');
    } finally {
      setWoSaving(false);
    }
  };

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
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filter by BGE</InputLabel>
          <Select value={woFilterBge} label="Filter by BGE" onChange={e => setWoFilterBge(e.target.value)}>
            <MenuItem value="">All BGEs</MenuItem>
            {experts.map(e => <MenuItem key={e.id} value={e.id}>{e.name} ({e.bge_code})</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select value={woFilterStatus} label="Status" onChange={e => setWoFilterStatus(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="issued">Issued</MenuItem>
            <MenuItem value="signed">Signed</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {workOrders.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Assignment sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No work orders yet.</Typography>
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
                      {wo.work_order_type_display} · {wo.bge_name} ({wo.bge_code_display})
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Issued: {wo.issue_date}{wo.start_date ? ` · Start: ${wo.start_date}` : ''}{wo.end_date ? ` – ${wo.end_date}` : ''}
                    </Typography>
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

      {/* Create / Edit Dialog */}
      <Dialog open={woDialog} onClose={() => setWoDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle fontWeight={700}>{woEditing ? 'Edit Work Order' : 'New Work Order'}</DialogTitle>
        <DialogContent dividers>
          {woErrors && <Alert severity="error" sx={{ mb: 2 }}>{woErrors}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" required>
                <InputLabel>BGE</InputLabel>
                <Select value={woForm.bge} label="BGE" onChange={e => setWoForm(f => ({ ...f, bge: e.target.value }))}>
                  {experts.map(e => <MenuItem key={e.id} value={e.id}>{e.name} ({e.bge_code})</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Work Order Type</InputLabel>
                <Select value={woForm.work_order_type} label="Work Order Type"
                  onChange={e => applyWoDefaults(e.target.value)}>
                  <MenuItem value="msme_support">MSME CRM & Business Support</MenuItem>
                  <MenuItem value="mobilisation">Mobilisation / Outreach</MenuItem>
                  <MenuItem value="group_session">Peer-to-Peer Group Session</MenuItem>
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
                <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
                  <Typography variant="caption" sx={{ pt: 1.2, minWidth: 22, fontWeight: 700 }}>{d.task_num}.</Typography>
                  <TextField size="small" sx={{ flex: 3 }} multiline label="Deliverable description"
                    value={d.description}
                    onChange={e => {
                      const upd = [...woForm.deliverables_json];
                      upd[i] = { ...d, description: e.target.value };
                      setWoForm(f => ({ ...f, deliverables_json: upd }));
                    }} />
                  <TextField size="small" sx={{ flex: 1 }} label="Due date"
                    value={d.due_date}
                    onChange={e => {
                      const upd = [...woForm.deliverables_json];
                      upd[i] = { ...d, due_date: e.target.value };
                      setWoForm(f => ({ ...f, deliverables_json: upd }));
                    }} />
                  <IconButton size="small" color="error" sx={{ mt: 0.5 }} onClick={() => {
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
        <DialogActions>
          <Button onClick={() => setWoDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveWo} disabled={woSaving}>
            {woSaving ? <CircularProgress size={18} /> : (woEditing ? 'Save Changes' : 'Create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  const renderParticipation = () => {
    const s = participationSummary;
    const statBox = (label, value, color = '#1565C0') => (
      <Grid item xs={6} sm={4} md={3} key={label}>
        <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="h4" fontWeight={700} sx={{ color }}>{value ?? '—'}</Typography>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Paper>
      </Grid>
    );
    return (
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>Participation Summary</Typography>
            <Typography variant="body2" color="text.secondary">
              Aggregated attendance + BGE report data across all sessions and deployments
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Filter by Cohort</InputLabel>
              <Select value={participationCohort} label="Filter by Cohort"
                onChange={e => { setParticipationCohort(e.target.value); fetchParticipationSummary(e.target.value); }}>
                <MenuItem value="">All Cohorts</MenuItem>
                {cohorts.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="outlined" onClick={() => fetchParticipationSummary(participationCohort)}>
              Refresh
            </Button>
          </Box>
        </Box>

        {participationLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : !s ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary" gutterBottom>No data loaded yet.</Typography>
            <Button variant="contained" onClick={() => fetchParticipationSummary('')}>Load Summary</Button>
          </Box>
        ) : (
          <>
            {/* Top-level totals */}
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Overall Attendance Totals</Typography>
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {statBox('Total Attendees', s.total, '#1565C0')}
              {statBox('Female', s.female, '#AD1457')}
              {statBox('Male', s.male, '#1565C0')}
              {statBox('Female Youth (18–34)', s.female_youth, '#AD1457')}
              {statBox('Male Youth (18–34)', s.male_youth, '#1565C0')}
              {statBox('Adult Female', s.female_adult, '#AD1457')}
              {statBox('Adult Male', s.male_adult, '#1565C0')}
              {statBox('Refugees (total)', s.refugees_total, '#E65100')}
              {statBox('Female Refugees', s.refugee_female, '#E65100')}
              {statBox('Male Refugees', s.refugee_male, '#E65100')}
              {statBox('Host Community', s.host_community, '#2E7D32')}
            </Grid>

            {/* BGE report totals */}
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>BGE Field Reports</Typography>
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {statBox('MSME Visit Reports', s.msme_reports, '#5C6BC0')}
              {statBox('Unique MSMEs Visited', s.unique_msmes_visited, '#5C6BC0')}
              {statBox('Group Sessions Filed', s.group_sessions, '#00695C')}
            </Grid>

            {/* Per-work-order breakdown (activity/deployment level) */}
            {(s.by_work_order || []).length > 0 && (
              <>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom sx={{ mt: 2 }}>
                  By BGE Deployment / Work Order
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                      <TableRow>
                        <TableCell>Work Order</TableCell>
                        <TableCell>BGE</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="center">Attendees</TableCell>
                        <TableCell align="center">F</TableCell>
                        <TableCell align="center">M</TableCell>
                        <TableCell align="center">Youth</TableCell>
                        <TableCell align="center">Refugees</TableCell>
                        <TableCell align="center">Reports</TableCell>
                        <TableCell align="center">MSMEs</TableCell>
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
                          <TableCell align="center"><Chip label={w.total} size="small" color="primary" /></TableCell>
                          <TableCell align="center">{w.female}</TableCell>
                          <TableCell align="center">{w.male}</TableCell>
                          <TableCell align="center">{(w.male_youth || 0) + (w.female_youth || 0)}</TableCell>
                          <TableCell align="center">
                            {w.refugees_total > 0 ? <Chip label={w.refugees_total} size="small" color="warning" /> : '0'}
                          </TableCell>
                          <TableCell align="center">{w.msme_reports}</TableCell>
                          <TableCell align="center">{w.unique_msmes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {/* Per-cohort breakdown */}
            {(s.by_cohort || []).length > 0 && (
              <>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>Breakdown by Cohort</Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                      <TableRow>
                        <TableCell>Cohort</TableCell>
                        <TableCell align="center">Attendees</TableCell>
                        <TableCell align="center">Female</TableCell>
                        <TableCell align="center">Male</TableCell>
                        <TableCell align="center">Youth</TableCell>
                        <TableCell align="center">Adults</TableCell>
                        <TableCell align="center">Refugees</TableCell>
                        <TableCell align="center">Host Comm.</TableCell>
                        <TableCell align="center">MSME Reports</TableCell>
                        <TableCell align="center">Unique MSMEs</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {s.by_cohort.map(c => (
                        <TableRow key={c.cohort_id} hover>
                          <TableCell sx={{ fontWeight: 500 }}>{c.cohort_name}</TableCell>
                          <TableCell align="center"><Chip label={c.total} size="small" color="primary" /></TableCell>
                          <TableCell align="center">{c.female}</TableCell>
                          <TableCell align="center">{c.male}</TableCell>
                          <TableCell align="center">{(c.male_youth || 0) + (c.female_youth || 0)}</TableCell>
                          <TableCell align="center">{(c.male_adult || 0) + (c.female_adult || 0)}</TableCell>
                          <TableCell align="center">
                            {c.refugees_total > 0 ? <Chip label={c.refugees_total} size="small" color="warning" /> : '0'}
                          </TableCell>
                          <TableCell align="center">{c.host_community}</TableCell>
                          <TableCell align="center">{c.msme_reports}</TableCell>
                          <TableCell align="center">{c.unique_msmes}</TableCell>
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

  const sectionMap = {
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
      {/* ── Assign MSMEs to Group ─────────────────────────────────────────── */}
      <Dialog open={!!assignMsmeGroup} onClose={() => setAssignMsmeGroup(null)} maxWidth="md" fullWidth>
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
              size="small" placeholder="Search MSMEs..." value={groupMsmeSearch}
              onChange={e => setGroupMsmeSearch(e.target.value)}
              InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
              sx={{ flex: 1, minWidth: 200 }}
            />
            <TextField
              size="small" label="Session # (optional)" type="number"
              value={groupMsmeSession} onChange={e => setGroupMsmeSession(e.target.value)}
              sx={{ width: 160 }} inputProps={{ min: 1, max: 10 }}
            />
            <Chip label={`${assignedGroupMsmeIds.length} selected`} color="primary" />
            <Button size="small" onClick={() => setAssignedGroupMsmeIds([])} disabled={assignedGroupMsmeIds.length === 0}>
              Clear all
            </Button>
          </Box>
          <Box sx={{ maxHeight: 480, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <List dense>
              {msmes
                .filter(m => {
                  if (!groupMsmeSearch) return true;
                  const q = groupMsmeSearch.toLowerCase();
                  return (m.business_name || '').toLowerCase().includes(q)
                      || (m.owner_name    || '').toLowerCase().includes(q)
                      || (m.city          || '').toLowerCase().includes(q)
                      || (m.state         || '').toLowerCase().includes(q);
                })
                .map(m => {
                  const checked = assignedGroupMsmeIds.includes(m.id);
                  const otherGroup = m.assigned_group && m.assigned_group !== assignMsmeGroup?.id;
                  return (
                    <ListItemButton key={m.id} onClick={() => toggleGroupMsme(m.id)} dense>
                      <ListItemIcon>
                        <Checkbox checked={checked} size="small" disableRipple />
                      </ListItemIcon>
                      <ListItemText
                        primary={m.business_name}
                        secondary={`${m.owner_name || '—'} · ${m.city || m.state || '—'}${otherGroup ? ` · already in ${m.assigned_group_name}` : ''}`}
                      />
                      {m.assigned_group_name && (
                        <Chip label={m.assigned_group_name} size="small"
                              color={m.assigned_group === assignMsmeGroup?.id ? 'success' : 'default'} />
                      )}
                    </ListItemButton>
                  );
                })}
              {msmes.length === 0 && (
                <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>No MSMEs available</Box>
              )}
            </List>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignMsmeGroup(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveGroupMsmeAssignments} disabled={groupMsmeSaving}>
            {groupMsmeSaving ? 'Saving…' : 'Save Assignments'}
          </Button>
        </DialogActions>
      </Dialog>

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
            <Grid item xs={12}>
              <FormControl fullWidth size="small"><InputLabel>Link to Work Order / Deployment</InputLabel>
                <Select value={sessionForm.work_order} onChange={e => setSessionForm({...sessionForm, work_order: e.target.value})} label="Link to Work Order / Deployment">
                  <MenuItem value="">— Not linked —</MenuItem>
                  {workOrders.map(wo => (
                    <MenuItem key={wo.id} value={wo.id}>
                      {wo.work_order_number} · {wo.bge_name} ({wo.work_order_type_display})
                    </MenuItem>
                  ))}
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
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2.5 }}>
      <Box>
        <Typography variant="h6" fontWeight={700}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {children && <Box sx={{ display: 'flex', gap: 1 }}>{children}</Box>}
    </Box>
  );
}
