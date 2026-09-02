import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControl, InputLabel, Select,
  MenuItem, Grid, Card, CardContent, Tooltip, CircularProgress, Alert,
  Autocomplete, Divider, Menu, Fade,
} from '@mui/material';
import {
  CalendarMonth, Add, ChevronLeft, ChevronRight, Today,
  CheckCircle, Cancel, Schedule, Refresh,
  LocationOn, Phone, Person, FileDownload,
  Link as LinkIcon, EditCalendar, EventBusy, Assessment,
  School, Psychology, QueryStats, WarningAmber, ViewAgenda,
  CalendarViewMonth, CloudDone, CloudOff, Sync as SyncIcon,
} from '@mui/icons-material';
import axios from 'axios';
import {
  API_ENDPOINTS,
  PLANNED_VISITS_EXPORT_ICS_URL,
  PLANNED_VISITS_SUMMARY_URL,
  PLANNED_VISIT_MARK_MISSED_URL,
  PLANNED_VISIT_MARK_COMPLETED_URL,
  PLANNED_VISIT_RESCHEDULE_URL,
  PLANNED_VISIT_ICS_URL,
  GOOGLE_CALENDAR_CONNECT_URL,
  GOOGLE_CALENDAR_STATUS_URL,
  GOOGLE_CALENDAR_DISCONNECT_URL,
  GOOGLE_CALENDAR_SYNC_NOW_URL,
} from '../config';
import { BRAND } from '../theme';

const h = (token) => ({ Authorization: `Bearer ${token}` });

const STATUS_CONFIG = {
  planned: {
    label: 'Planned Meeting',
    color: '#1976D2',
    bg: '#E3F2FD',
    border: '#90CAF9',
    icon: <Schedule sx={{ fontSize: 16 }} />,
  },
  completed: {
    label: 'Completed',
    color: '#2E7D32',
    bg: '#E8F5E9',
    border: '#A5D6A7',
    icon: <CheckCircle sx={{ fontSize: 16 }} />,
  },
  missed: {
    label: 'Missed',
    color: '#C62828',
    bg: '#FFEBEE',
    border: '#EF9A9A',
    icon: <EventBusy sx={{ fontSize: 16 }} />,
  },
  rescheduled: {
    label: 'Rescheduled',
    color: '#E65100',
    bg: '#FFF3E0',
    border: '#FFE082',
    icon: <EditCalendar sx={{ fontSize: 16 }} />,
  },
  cancelled: {
    label: 'Cancelled',
    color: '#616161',
    bg: '#F5F5F5',
    border: '#E0E0E0',
    icon: <Cancel sx={{ fontSize: 16 }} />,
  },
};

const MISSED_REASONS = [
  { value: 'msme_unavailable',    label: 'MSME Owner / Contact Unavailable' },
  { value: 'msme_closed',         'label': 'Business Premises Closed / Relocated' },
  { value: 'bge_emergency',       label: 'BGE Illness / Personal Emergency' },
  { value: 'transport_logistics', label: 'Transport / Road Impassable / Breakdown' },
  { value: 'weather',             label: 'Adverse Weather / Heavy Rain / Floods' },
  { value: 'rescheduled_msme',    label: 'Rescheduled at MSME Request' },
  { value: 'rescheduled_bge',     label: 'Rescheduled by BGE' },
  { value: 'security',            label: 'Safety / Security Concern in Area' },
  { value: 'other',               label: 'Other Reason (specify in notes)' },
];

const VISIT_TYPES = [
  { value: 'one_on_one',    label: 'One-on-One Visit',       icon: <Person fontSize="small" /> },
  { value: 'coaching',      label: 'Business Coaching',      icon: <Psychology fontSize="small" /> },
  { value: 'data_update',   label: 'Data Collection Visit',  icon: <Assessment fontSize="small" /> },
  { value: 'training',      label: 'Training Visit',         icon: <School fontSize="small" /> },
  { value: 'annual_review', label: 'Annual Review',          icon: <QueryStats fontSize="small" /> },
  { value: 'followup',      label: 'Follow-up Visit',        icon: <Schedule fontSize="small" /> },
];

const VENUES = [
  { value: 'msme_premises', label: 'MSME Business Premises' },
  { value: 'farm_site',     label: 'Farm / Field / Production Site' },
  { value: 'bge_base',      label: 'BGE Field Base / District Office' },
  { value: 'trading_center',label: 'Trading Centre / Neutral Venue' },
  { value: 'virtual',       label: 'Phone Call / Virtual Meeting' },
  { value: 'other',         label: 'Other Venue' },
];

const getGoogleCalendarUrl = (visit) => {
  if (!visit) return '#';
  const dateClean = (visit.scheduled_date || '').replace(/-/g, '');
  let dates = `${dateClean}/${dateClean}`;
  if (visit.start_time) {
    const startTimeClean = visit.start_time.replace(/:/g, '').slice(0, 4) + '00';
    let endTimeClean = startTimeClean;
    if (visit.end_time) {
      endTimeClean = visit.end_time.replace(/:/g, '').slice(0, 4) + '00';
    } else {
      const parts = visit.start_time.split(':').map(Number);
      const endH = String((parts[0] + 1) % 24).padStart(2, '0');
      endTimeClean = `${endH}${String(parts[1] || 0).padStart(2, '0')}00`;
    }
    dates = `${dateClean}T${startTimeClean}/${dateClean}T${endTimeClean}`;
  }
  const title = `MSME Visit: ${visit.msme_name || 'MSME'}${visit.visit_type_display ? ` (${visit.visit_type_display})` : ''}`;
  const details = [
    `BGE: ${visit.bge_name || 'BGE'}`,
    `MSME: ${visit.msme_name || ''} (${visit.msme_code || ''})`,
    `Owner/Contact: ${visit.contact_person || visit.msme_owner_name || '—'} · Phone: ${visit.contact_phone || visit.msme_phone || '—'}`,
    visit.objectives ? `Objectives: ${visit.objectives}` : null,
    visit.agenda ? `Agenda: ${visit.agenda}` : null,
    visit.meeting_venue_display ? `Venue: ${visit.meeting_venue_display}` : null,
  ].filter(Boolean).join('\n');
  const location = `${visit.meeting_venue_display || 'MSME Premises'}, ${visit.msme_district || 'Northern Uganda'}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
};

export default function CalendarPlanner({
  token,
  currentUser,
  msmes = [],
  experts = [],
  currentBge = null,
  onOpenNewReport,
  onViewMsme,
  initialMsmeId = null,
  isEmbedded = false,
}) {
  const isManager = !currentBge && (currentUser?.is_staff || currentUser?.is_superuser || currentUser?.role === 'admin' || currentUser?.role === 'cohort_admin');

  // State
  const [visits, setVisits] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // View state
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState(isEmbedded ? 'agenda' : 'month'); // 'month' | 'agenda'

  // Filters
  const [selectedBge, setSelectedBge] = useState(currentBge ? String(currentBge.id) : '');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialogs
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);

  const [missedDialogOpen, setMissedDialogOpen] = useState(false);
  const [missedReason, setMissedReason] = useState('');
  const [missedNotes, setMissedNotes] = useState('');
  const [missedSubmitting, setMissedSubmitting] = useState(false);

  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completeSubmitting, setCompleteSubmitting] = useState(false);

  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState('09:00');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

  const [syncMenuAnchor, setSyncMenuAnchor] = useState(null);

  // Form State for Planning a Visit
  const [planForm, setPlanForm] = useState({
    msme: initialMsmeId || '',
    bge: currentBge?.id || '',
    scheduled_date: new Date().toISOString().slice(0, 10),
    start_time: '10:00',
    end_time: '11:30',
    visit_type: 'one_on_one',
    title: '',
    objectives: '',
    agenda: '',
    meeting_venue: 'msme_premises',
    meeting_venue_notes: '',
    contact_person: '',
    contact_phone: '',
    notes: '',
  });

  // Fetch Visits
  const fetchVisits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (initialMsmeId) {
        params.set('msme', initialMsmeId);
      } else {
        if (selectedBge) params.set('bge', selectedBge);
        if (selectedDistrict) params.set('district', selectedDistrict);
        if (statusFilter !== 'all') params.set('status', statusFilter);
        // Load visits for the active month plus adjacent buffer
        params.set('year', currentDate.getFullYear());
        params.set('month', currentDate.getMonth() + 1);
      }

      const res = await axios.get(`${API_ENDPOINTS.PLANNED_VISITS}?${params.toString()}`, { headers: h(token) });
      setVisits(res.data || []);

      // Fetch summary KPIs
      const sumRes = await axios.get(PLANNED_VISITS_SUMMARY_URL(params.toString()), { headers: h(token) });
      setSummary(sumRes.data);
    } catch (e) {
      setFeedback({ type: 'error', text: 'Failed to load planned visits. Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [token, initialMsmeId, selectedBge, selectedDistrict, statusFilter, currentDate]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  // Google Calendar OAuth & Sync State
  const [googleStatus, setGoogleStatus] = useState({
    connected: false,
    google_email: '',
    is_configured: false,
    sync_enabled: false,
  });
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleMenuAnchor, setGoogleMenuAnchor] = useState(null);

  const fetchGoogleStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(GOOGLE_CALENDAR_STATUS_URL, { headers: h(token) });
      setGoogleStatus(res.data);
    } catch (e) {
      // Gracefully ignore if unauthenticated or error
    }
  }, [token]);

  useEffect(() => {
    fetchGoogleStatus();
  }, [fetchGoogleStatus]);

  // Listen for OAuth callback redirect query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleSync = params.get('google_sync');
    if (googleSync === 'success') {
      const email = params.get('email');
      setFeedback({
        type: 'success',
        text: `Google Calendar connected successfully${email ? ` (${email})` : ''}! Visits now auto-sync in real time.`,
      });
      const url = new URL(window.location);
      url.searchParams.delete('google_sync');
      url.searchParams.delete('email');
      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
      fetchGoogleStatus();
      fetchVisits();
    } else if (googleSync === 'error') {
      const err = params.get('error') || 'Google Calendar connection was cancelled or failed.';
      setFeedback({ type: 'warning', text: `Google Calendar: ${err}` });
      const url = new URL(window.location);
      url.searchParams.delete('google_sync');
      url.searchParams.delete('error');
      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
    }
  }, [fetchGoogleStatus, fetchVisits]);

  const handleConnectGoogleCalendar = async () => {
    setGoogleConnecting(true);
    try {
      const res = await axios.get(GOOGLE_CALENDAR_CONNECT_URL, { headers: h(token) });
      if (res.data?.authorization_url) {
        window.location.href = res.data.authorization_url;
      } else {
        setFeedback({ type: 'error', text: 'Google authorization URL was not provided.' });
      }
    } catch (e) {
      const msg = e.response?.data?.error || 'Google Calendar OAuth is not yet configured with Client ID & Secret on the backend.';
      setFeedback({ type: 'warning', text: msg });
    } finally {
      setGoogleConnecting(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await axios.post(GOOGLE_CALENDAR_DISCONNECT_URL, {}, { headers: h(token) });
      setGoogleStatus({ connected: false, google_email: '', sync_enabled: false });
      setFeedback({ type: 'info', text: 'Google Calendar disconnected.' });
      setGoogleMenuAnchor(null);
    } catch (e) {
      setFeedback({ type: 'error', text: 'Failed to disconnect Google Calendar.' });
    }
  };

  const handleSyncNowGoogle = async () => {
    setGoogleSyncing(true);
    try {
      const res = await axios.post(GOOGLE_CALENDAR_SYNC_NOW_URL, {}, { headers: h(token) });
      setFeedback({ type: 'success', text: res.data?.message || 'Visits synced to Google Calendar!' });
      fetchVisits();
      fetchGoogleStatus();
      setGoogleMenuAnchor(null);
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to sync visits to Google Calendar.';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setGoogleSyncing(false);
    }
  };

  // Handle MSME selection in form
  const handleMsmeSelect = (msmeObj) => {
    if (!msmeObj) return;
    setPlanForm((prev) => ({
      ...prev,
      msme: msmeObj.id,
      contact_person: msmeObj.owner_name || msmeObj.contact_person || '',
      contact_phone: msmeObj.phone || msmeObj.alt_phone || '',
      meeting_venue_notes: msmeObj.district ? `${msmeObj.district} — ${msmeObj.location || ''}` : '',
      bge: prev.bge || msmeObj.assigned_bge || '',
    }));
  };

  // Submit New Visit
  const handleCreateVisit = async (e) => {
    e.preventDefault();
    if (!planForm.msme) {
      setFeedback({ type: 'error', text: 'Please select an MSME.' });
      return;
    }
    if (!planForm.scheduled_date) {
      setFeedback({ type: 'error', text: 'Please choose a date for the visit.' });
      return;
    }

    try {
      await axios.post(API_ENDPOINTS.PLANNED_VISITS, planForm, { headers: h(token) });
      setFeedback({ type: 'success', text: 'Field visit successfully scheduled! ✓' });
      setPlanDialogOpen(false);
      fetchVisits();
    } catch (err) {
      const msg = err.response?.data ? JSON.stringify(err.response.data) : 'Failed to schedule visit.';
      setFeedback({ type: 'error', text: msg });
    }
  };

  // Mark Missed
  const handleConfirmMissed = async () => {
    if (!selectedVisit || !missedReason) return;
    setMissedSubmitting(true);
    try {
      await axios.post(
        PLANNED_VISIT_MARK_MISSED_URL(selectedVisit.id),
        { missed_reason: missedReason, missed_reason_notes: missedNotes },
        { headers: h(token) }
      );
      setFeedback({ type: 'warning', text: 'Visit recorded as missed.' });
      setMissedDialogOpen(false);
      setDetailDialogOpen(false);
      fetchVisits();
    } catch (e) {
      setFeedback({ type: 'error', text: 'Failed to record missed visit.' });
    } finally {
      setMissedSubmitting(false);
    }
  };

  // Mark Completed
  const handleConfirmCompleted = async () => {
    if (!selectedVisit) return;
    setCompleteSubmitting(true);
    try {
      await axios.post(
        PLANNED_VISIT_MARK_COMPLETED_URL(selectedVisit.id),
        { completion_notes: completionNotes },
        { headers: h(token) }
      );
      setFeedback({ type: 'success', text: 'Visit marked as completed! ✓' });
      setCompleteDialogOpen(false);
      setDetailDialogOpen(false);
      fetchVisits();
    } catch (e) {
      setFeedback({ type: 'error', text: 'Failed to mark visit as completed.' });
    } finally {
      setCompleteSubmitting(false);
    }
  };

  // Reschedule
  const handleConfirmReschedule = async () => {
    if (!selectedVisit || !rescheduleDate) return;
    setRescheduleSubmitting(true);
    try {
      await axios.post(
        PLANNED_VISIT_RESCHEDULE_URL(selectedVisit.id),
        { new_date: rescheduleDate, new_start_time: rescheduleStartTime, reason: rescheduleReason },
        { headers: h(token) }
      );
      setFeedback({ type: 'info', text: 'Visit rescheduled to ' + rescheduleDate });
      setRescheduleDialogOpen(false);
      setDetailDialogOpen(false);
      fetchVisits();
    } catch (e) {
      setFeedback({ type: 'error', text: 'Failed to reschedule visit.' });
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  // Filtered visits for current view
  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = v.msme_name?.toLowerCase().includes(q);
        const matchCode = v.msme_code?.toLowerCase().includes(q);
        const matchBge = v.bge_name?.toLowerCase().includes(q);
        const matchObj = v.objectives?.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchBge && !matchObj) return false;
      }
      return true;
    });
  }, [visits, searchQuery]);

  // Calendar Grid Data
  const calendarGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    // Adjust to Monday start: Mon=0, ..., Sun=6
    const startOffset = (firstDayIndex + 6) % 7;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells = [];

    // Prev month days
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, daysInPrevMonth - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        date: new Date(year, month, d),
        isCurrentMonth: true,
      });
    }

    // Trailing days to round up to 35 or 42
    const totalCells = Math.ceil(cells.length / 7) * 7;
    let nextDay = 1;
    while (cells.length < totalCells) {
      cells.push({
        date: new Date(year, month + 1, nextDay++),
        isCurrentMonth: false,
      });
    }

    return cells;
  }, [currentDate]);

  // Group visits by date string YYYY-MM-DD
  const visitsByDate = useMemo(() => {
    const map = {};
    filteredVisits.forEach((v) => {
      const d = v.scheduled_date;
      if (!map[d]) map[d] = [];
      map[d].push(v);
    });
    return map;
  }, [filteredVisits]);

  // Districts list from msmes
  const districts = useMemo(() => {
    const set = new Set();
    msmes.forEach((m) => {
      if (m.district) set.add(m.district);
    });
    return Array.from(set).sort();
  }, [msmes]);

  const monthYearLabel = currentDate.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  const isToday = (d) => {
    const today = new Date();
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  const toIsoDate = (d) => {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  // Open plan modal pre-filled for a date
  const openPlanForDate = (dateObj) => {
    setPlanForm((prev) => ({
      ...prev,
      scheduled_date: toIsoDate(dateObj),
      msme: initialMsmeId || prev.msme,
    }));
    setPlanDialogOpen(true);
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* ── Header Bar ──────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                bgcolor: BRAND.primaryMain,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(26,46,66,0.25)',
              }}
            >
              <CalendarMonth />
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={800} sx={{ color: BRAND.primaryMain, lineHeight: 1.2 }}>
                {initialMsmeId ? 'MSME Visit Schedule' : 'Field Visit Calendar Planner'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {initialMsmeId
                  ? 'Upcoming, completed, and missed visits planned for this enterprise'
                  : 'Coordinate and track Business Growth Expert (BGE) visits to MSMEs across Northern Uganda'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {/* Google Calendar OAuth 2.0 Button / Status */}
          {googleStatus.connected ? (
            <>
              <Tooltip title={`Connected as ${googleStatus.google_email}. Planned visits auto-sync directly to your Google Calendar in real-time.`}>
                <Button
                  id="btn-google-calendar-status"
                  variant="outlined"
                  size="small"
                  startIcon={<CloudDone sx={{ color: '#2E7D32', fontSize: 16 }} />}
                  onClick={(e) => setGoogleMenuAnchor(e.currentTarget)}
                  sx={{
                    borderColor: '#A5D6A7',
                    bgcolor: '#E8F5E9',
                    color: '#2E7D32',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#C8E6C9', borderColor: '#81C784' },
                  }}
                >
                  Google Calendar: Synced
                </Button>
              </Tooltip>
              <Menu
                anchorEl={googleMenuAnchor}
                open={Boolean(googleMenuAnchor)}
                onClose={() => setGoogleMenuAnchor(null)}
                TransitionComponent={Fade}
              >
                <Box sx={{ p: 2, minWidth: 260 }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: BRAND.primaryMain, mb: 0.5 }}>
                    Google Calendar Auto-Sync
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                    Account: <strong>{googleStatus.google_email || 'Connected'}</strong>
                  </Typography>
                  <Button
                    id="btn-google-sync-now"
                    variant="contained"
                    size="small"
                    fullWidth
                    startIcon={googleSyncing ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
                    onClick={handleSyncNowGoogle}
                    disabled={googleSyncing}
                    sx={{ mb: 1, bgcolor: BRAND.primaryMain }}
                  >
                    {googleSyncing ? 'Syncing...' : 'Sync All Visits Now'}
                  </Button>
                  <Button
                    id="btn-google-disconnect"
                    variant="outlined"
                    color="error"
                    size="small"
                    fullWidth
                    startIcon={<CloudOff />}
                    onClick={handleDisconnectGoogle}
                  >
                    Disconnect Google Calendar
                  </Button>
                </Box>
              </Menu>
            </>
          ) : (
            <Tooltip title="Link your Google Calendar account so visits you plan automatically appear in your personal Google Calendar without manual exports.">
              <Button
                id="btn-connect-google-calendar"
                variant="outlined"
                size="small"
                disabled={googleConnecting}
                onClick={handleConnectGoogleCalendar}
                startIcon={
                  googleConnecting ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                  )
                }
                sx={{
                  borderColor: 'rgba(66,133,244,0.4)',
                  color: '#1A73E8',
                  bgcolor: '#fff',
                  fontWeight: 600,
                  textTransform: 'none',
                  '&:hover': { borderColor: '#1A73E8', bgcolor: 'rgba(66,133,244,0.06)' },
                }}
              >
                {googleConnecting ? 'Connecting...' : 'Connect Google Calendar'}
              </Button>
            </Tooltip>
          )}

          {/* Calendar Sync Menu */}
          <Button
            id="btn-calendar-sync"
            variant="outlined"
            size="small"
            startIcon={<FileDownload />}
            onClick={(e) => setSyncMenuAnchor(e.currentTarget)}
            sx={{
              borderColor: 'rgba(26,46,66,0.3)',
              color: BRAND.primaryMain,
              fontWeight: 600,
              '&:hover': { borderColor: BRAND.primaryMain, bgcolor: 'rgba(26,46,66,0.04)' },
            }}
          >
            Calendar Sync
          </Button>

          <Menu
            anchorEl={syncMenuAnchor}
            open={Boolean(syncMenuAnchor)}
            onClose={() => setSyncMenuAnchor(null)}
            TransitionComponent={Fade}
          >
            <Box sx={{ p: 2, maxWidth: 320 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: BRAND.primaryMain, mb: 0.5 }}>
                Sync to Personal Calendar
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5, lineHeight: 1.4 }}>
                Import visits into Microsoft Outlook, Google Calendar, or Apple Calendar so your schedule stays up to date.
              </Typography>

              {/* Google OAuth direct status in sync menu */}
              <Box sx={{ mb: 2, p: 1.5, bgcolor: '#F4F7FB', borderRadius: 1.5, border: '1px solid #E0E7F1' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={700} sx={{ color: BRAND.primaryMain }}>
                    Google Calendar Auto-Push
                  </Typography>
                  <Chip
                    size="small"
                    label={googleStatus.connected ? 'Active' : 'Not Connected'}
                    sx={{
                      height: 18,
                      fontSize: 10,
                      fontWeight: 700,
                      bgcolor: googleStatus.connected ? '#E8F5E9' : '#FFF3E0',
                      color: googleStatus.connected ? '#2E7D32' : '#E65100',
                    }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 11, mb: 1 }}>
                  {googleStatus.connected
                    ? `Auto-pushing new visits to ${googleStatus.google_email}`
                    : 'Connect once to automatically receive planned visits in your personal Google Calendar.'}
                </Typography>
                {googleStatus.connected ? (
                  <Button
                    size="small"
                    variant="outlined"
                    fullWidth
                    startIcon={<SyncIcon />}
                    onClick={handleSyncNowGoogle}
                    disabled={googleSyncing}
                    sx={{ fontSize: 11, textTransform: 'none' }}
                  >
                    Sync All to Google Now
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="contained"
                    fullWidth
                    onClick={handleConnectGoogleCalendar}
                    disabled={googleConnecting}
                    sx={{ fontSize: 11, textTransform: 'none', bgcolor: '#1A73E8' }}
                  >
                    Connect Google Calendar
                  </Button>
                )}
              </Box>

              <Divider sx={{ my: 1 }} />

              <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 1 }}>
                Calendar Feeds & Downloads:
              </Typography>
              <Button
                id="btn-download-ics"
                variant="contained"
                size="small"
                fullWidth
                startIcon={<FileDownload />}
                href={PLANNED_VISITS_EXPORT_ICS_URL(selectedBge ? `bge=${selectedBge}` : '')}
                download="prudev_msme_visits.ics"
                sx={{ mb: 1, bgcolor: BRAND.primaryMain }}
              >
                Download .ICS File
              </Button>
              <Button
                id="btn-google-calendar-subscribe"
                variant="outlined"
                color="primary"
                size="small"
                fullWidth
                startIcon={<CalendarMonth />}
                onClick={() => {
                  const url = window.location.origin + PLANNED_VISITS_EXPORT_ICS_URL(selectedBge ? `bge=${selectedBge}` : '');
                  navigator.clipboard.writeText(url);
                  window.open('https://calendar.google.com/calendar/u/0/r/settings/addbyurl', '_blank', 'noopener,noreferrer');
                  setFeedback({
                    type: 'info',
                    text: 'Live Calendar Feed URL copied to clipboard! In Google Calendar settings (opened in new tab), paste into "URL of calendar" and click "Add calendar" for permanent auto-sync.',
                  });
                  setSyncMenuAnchor(null);
                }}
                sx={{ mb: 1 }}
              >
                Subscribe in Google Calendar
              </Button>
              <Button
                id="btn-copy-feed-url"
                variant="outlined"
                size="small"
                fullWidth
                startIcon={<LinkIcon />}
                onClick={() => {
                  const url = window.location.origin + PLANNED_VISITS_EXPORT_ICS_URL(selectedBge ? `bge=${selectedBge}` : '');
                  navigator.clipboard.writeText(url);
                  setFeedback({ type: 'success', text: 'Calendar subscription URL copied to clipboard!' });
                  setSyncMenuAnchor(null);
                }}
              >
                Copy Calendar Feed URL
              </Button>
            </Box>
          </Menu>

          {/* Plan Visit Button */}
          <Button
            id="btn-plan-new-visit"
            variant="contained"
            size="small"
            startIcon={<Add />}
            onClick={() => {
              setPlanForm((prev) => ({
                ...prev,
                msme: initialMsmeId || '',
                scheduled_date: new Date().toISOString().slice(0, 10),
              }));
              setPlanDialogOpen(true);
            }}
            sx={{
              bgcolor: BRAND.programmeGreen,
              color: '#fff',
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(0,155,98,0.3)',
              '&:hover': { bgcolor: '#007A4D' },
            }}
          >
            Plan Visit
          </Button>

          <Tooltip title="Refresh schedule">
            <IconButton onClick={fetchVisits} size="small">
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Feedback Notification ──────────────────────────────────────────── */}
      {feedback && (
        <Alert
          severity={feedback.type}
          onClose={() => setFeedback(null)}
          sx={{ mb: 2, borderRadius: 2 }}
        >
          {feedback.text}
        </Alert>
      )}

      {/* ── KPI Metric Strip ────────────────────────────────────────────────── */}
      {!initialMsmeId && summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={4} md={2.4}>
            <Card
              sx={{
                borderRadius: 2.5,
                border: '1px solid #E0E7FF',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F7FC 100%)',
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary">
                    Total Visits
                  </Typography>
                  <CalendarMonth sx={{ fontSize: 18, color: BRAND.primaryMain }} />
                </Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: BRAND.primaryMain }}>
                  {summary.total || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Scheduled this month
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={4} md={2.4}>
            <Card
              sx={{
                borderRadius: 2.5,
                border: '1px solid #BBDEFB',
                boxShadow: '0 2px 8px rgba(25,118,210,0.06)',
                background: 'linear-gradient(135deg, #FFFFFF 0%, #EBF5FF 100%)',
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={600} color="#1565C0">
                    Planned Meetings
                  </Typography>
                  <Schedule sx={{ fontSize: 18, color: '#1976D2' }} />
                </Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: '#1565C0' }}>
                  {summary.planned || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: '#1976D2' }}>
                  {summary.upcoming_7_days || 0} in next 7 days
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={4} md={2.4}>
            <Card
              sx={{
                borderRadius: 2.5,
                border: '1px solid #C8E6C9',
                boxShadow: '0 2px 8px rgba(46,125,50,0.06)',
                background: 'linear-gradient(135deg, #FFFFFF 0%, #EBF7EE 100%)',
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={600} color="#2E7D32">
                    Completed
                  </Typography>
                  <CheckCircle sx={{ fontSize: 18, color: '#2E7D32' }} />
                </Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: '#2E7D32' }}>
                  {summary.completed || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: '#388E3C' }}>
                  {summary.completion_rate}% completion rate
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={4} md={2.4}>
            <Card
              sx={{
                borderRadius: 2.5,
                border: '1px solid #FFCDD2',
                boxShadow: '0 2px 8px rgba(198,40,40,0.06)',
                background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF2F2 100%)',
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={600} color="#C62828">
                    Missed Visits
                  </Typography>
                  <EventBusy sx={{ fontSize: 18, color: '#C62828' }} />
                </Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: '#C62828' }}>
                  {summary.missed || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: '#D32F2F' }}>
                  {summary.missed_breakdown?.length > 0
                    ? `Top: ${summary.missed_breakdown[0].label.slice(0, 18)}…`
                    : 'All meetings attended'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={4} md={2.4}>
            <Card
              sx={{
                borderRadius: 2.5,
                border: '1px solid #FFE082',
                boxShadow: '0 2px 8px rgba(230,81,0,0.06)',
                background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF9EB 100%)',
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={600} color="#E65100">
                    Rescheduled
                  </Typography>
                  <EditCalendar sx={{ fontSize: 18, color: '#E65100' }} />
                </Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: '#E65100' }}>
                  {summary.rescheduled || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: '#F57C00' }}>
                  Dates updated
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ── Toolbar & Filters ───────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2.5,
          border: '1px solid #E8EDF2',
          bgcolor: '#fff',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
        }}
      >
        <Grid container spacing={2} alignItems="center">
          {/* Month / Period Navigator */}
          <Grid item xs={12} sm={6} md={4}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                id="btn-prev-month"
                size="small"
                onClick={() =>
                  setCurrentDate(
                    new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
                  )
                }
                sx={{ border: '1px solid #E0E0E0' }}
              >
                <ChevronLeft />
              </IconButton>
              <Typography variant="h6" fontWeight={700} sx={{ minWidth: 160, textAlign: 'center', color: BRAND.primaryMain }}>
                {monthYearLabel}
              </Typography>
              <IconButton
                id="btn-next-month"
                size="small"
                onClick={() =>
                  setCurrentDate(
                    new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
                  )
                }
                sx={{ border: '1px solid #E0E0E0' }}
              >
                <ChevronRight />
              </IconButton>
              <Button
                id="btn-calendar-today"
                variant="outlined"
                size="small"
                startIcon={<Today />}
                onClick={() => setCurrentDate(new Date())}
                sx={{ textTransform: 'none', borderColor: '#D0D7DE', color: '#333' }}
              >
                Today
              </Button>
            </Box>
          </Grid>

          {/* Search box */}
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              id="input-search-visits"
              size="small"
              placeholder="Search MSME, BGE, or code…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Grid>

          {/* BGE Filter (Manager only) */}
          {isManager && !initialMsmeId && (
            <Grid item xs={6} sm={4} md={2.5}>
              <FormControl size="small" fullWidth>
                <InputLabel id="label-select-bge">BGE Expert</InputLabel>
                <Select
                  labelId="label-select-bge"
                  id="select-filter-bge"
                  value={selectedBge}
                  label="BGE Expert"
                  onChange={(e) => setSelectedBge(e.target.value)}
                >
                  <MenuItem value="">All Experts ({experts.length})</MenuItem>
                  {experts.map((exp) => (
                    <MenuItem key={exp.id} value={String(exp.id)}>
                      {exp.name} ({exp.location || exp.bge_code || 'BGE'})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {/* District Filter */}
          {!initialMsmeId && (
            <Grid item xs={6} sm={4} md={isManager ? 2.5 : 3}>
              <FormControl size="small" fullWidth>
                <InputLabel id="label-select-district">District</InputLabel>
                <Select
                  labelId="label-select-district"
                  id="select-filter-district"
                  value={selectedDistrict}
                  label="District"
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                >
                  <MenuItem value="">All Districts ({districts.length})</MenuItem>
                  {districts.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}
        </Grid>

        <Divider sx={{ my: 1.5, borderColor: '#F0F3F6' }} />

        {/* Status Pill Filters and View Toggle */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mr: 0.5 }}>
              Status:
            </Typography>
            {[
              { id: 'all', label: `All (${visits.length})` },
              { id: 'planned', label: 'Planned', color: STATUS_CONFIG.planned.color },
              { id: 'completed', label: 'Completed', color: STATUS_CONFIG.completed.color },
              { id: 'missed', label: 'Missed', color: STATUS_CONFIG.missed.color },
              { id: 'rescheduled', label: 'Rescheduled', color: STATUS_CONFIG.rescheduled.color },
            ].map((st) => (
              <Chip
                key={st.id}
                id={`chip-filter-${st.id}`}
                size="small"
                label={st.label}
                onClick={() => setStatusFilter(st.id)}
                variant={statusFilter === st.id ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 600,
                  fontSize: 12,
                  borderColor: st.color || '#D0D7DE',
                  bgcolor: statusFilter === st.id ? (st.color || BRAND.primaryMain) : 'transparent',
                  color: statusFilter === st.id ? '#fff' : (st.color || '#333'),
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.9 },
                }}
              />
            ))}
          </Box>

          {/* View Mode Toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#F4F6F8', p: 0.5, borderRadius: 2 }}>
            <Button
              id="btn-view-month"
              size="small"
              startIcon={<CalendarViewMonth />}
              onClick={() => setViewMode('month')}
              sx={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'none',
                bgcolor: viewMode === 'month' ? '#fff' : 'transparent',
                color: viewMode === 'month' ? BRAND.primaryMain : 'text.secondary',
                boxShadow: viewMode === 'month' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Month View
            </Button>
            <Button
              id="btn-view-agenda"
              size="small"
              startIcon={<ViewAgenda />}
              onClick={() => setViewMode('agenda')}
              sx={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'none',
                bgcolor: viewMode === 'agenda' ? '#fff' : 'transparent',
                color: viewMode === 'agenda' ? BRAND.primaryMain : 'text.secondary',
                boxShadow: viewMode === 'agenda' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Agenda Timeline
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* ── Main View Content ──────────────────────────────────────────────── */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : viewMode === 'month' ? (
        /* ── MONTH GRID VIEW ─────────────────────────────────────────────────── */
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: '1px solid #E8EDF2',
            overflow: 'hidden',
            bgcolor: '#fff',
          }}
        >
          {/* Day Names Header */}
          <Grid container sx={{ bgcolor: '#F8FAFC', borderBottom: '1px solid #E8EDF2' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <Grid item xs={12 / 7} key={day} sx={{ py: 1.2, textAlign: 'center' }}>
                <Typography variant="caption" fontWeight={700} sx={{ color: BRAND.primaryMain, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {day}
                </Typography>
              </Grid>
            ))}
          </Grid>

          {/* Calendar Day Cells */}
          <Grid container sx={{ minHeight: 600 }}>
            {calendarGrid.map((cell, index) => {
              const iso = toIsoDate(cell.date);
              const dayVisits = visitsByDate[iso] || [];
              const today = isToday(cell.date);

              return (
                <Grid
                  item
                  xs={12 / 7}
                  key={index}
                  sx={{
                    minHeight: 110,
                    p: 1,
                    borderRight: (index + 1) % 7 !== 0 ? '1px solid #F0F3F6' : 'none',
                    borderBottom: '1px solid #F0F3F6',
                    bgcolor: cell.isCurrentMonth
                      ? today
                        ? '#F0F9FF'
                        : '#FFFFFF'
                      : '#FAFAFA',
                    transition: 'background-color 0.2s',
                    position: 'relative',
                    '&:hover': {
                      bgcolor: today ? '#E6F4FE' : '#F8FAFC',
                      '& .add-visit-btn': { opacity: 1 },
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: today ? BRAND.primaryMain : 'transparent',
                        color: today ? '#fff' : cell.isCurrentMonth ? '#333' : '#A0AEC0',
                        fontWeight: today ? 800 : cell.isCurrentMonth ? 600 : 400,
                        fontSize: 12,
                      }}
                    >
                      {cell.date.getDate()}
                    </Box>

                    {/* Hover "+" button to plan on this day */}
                    <IconButton
                      className="add-visit-btn"
                      size="small"
                      onClick={() => openPlanForDate(cell.date)}
                      sx={{
                        width: 20,
                        height: 20,
                        opacity: 0,
                        p: 0,
                        color: BRAND.primaryMain,
                        transition: 'opacity 0.2s',
                      }}
                      title="Plan visit on this date"
                    >
                      <Add sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>

                  {/* Visit Pills on this day */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, overflowY: 'auto', maxHeight: 85 }}>
                    {dayVisits.map((v) => {
                      const cfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.planned;
                      return (
                        <Box
                          key={v.id}
                          id={`visit-card-${v.id}`}
                          onClick={() => {
                            setSelectedVisit(v);
                            setDetailDialogOpen(true);
                          }}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            p: '2px 6px',
                            borderRadius: 1,
                            bgcolor: cfg.bg,
                            borderLeft: `3px solid ${cfg.color}`,
                            color: cfg.color,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                              filter: 'brightness(0.96)',
                            },
                          }}
                          title={`[${cfg.label}] ${v.msme_name} (${v.bge_name})${v.status === 'missed' ? ` - Reason: ${v.missed_reason_display}` : ''}`}
                        >
                          <Box sx={{ display: 'inline-flex', flexShrink: 0 }}>{cfg.icon}</Box>
                          <Typography variant="inherit" noWrap sx={{ flex: 1 }}>
                            {v.start_time ? `${v.start_time.slice(0, 5)} · ` : ''}
                            {v.msme_name}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Paper>
      ) : (
        /* ── AGENDA TIMELINE VIEW ────────────────────────────────────────────── */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Object.keys(visitsByDate).length === 0 ? (
            <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2.5, border: '1px solid #E8EDF2' }}>
              <CalendarMonth sx={{ fontSize: 48, color: '#A0AEC0', mb: 1 }} />
              <Typography variant="h6" fontWeight={700} color="text.secondary">
                No Planned Visits Found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                There are no scheduled field visits matching your active filters for this period.
              </Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<Add />}
                onClick={() => setPlanDialogOpen(true)}
                sx={{ bgcolor: BRAND.primaryMain }}
              >
                Schedule a Visit
              </Button>
            </Paper>
          ) : (
            Object.entries(visitsByDate)
              .sort(([d1], [d2]) => d1.localeCompare(d2))
              .map(([dateStr, dateVisits]) => {
                const dateObj = new Date(dateStr + 'T00:00:00');
                const formattedDate = dateObj.toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                });
                const isDateToday = isToday(dateObj);

                return (
                  <Paper
                    key={dateStr}
                    elevation={0}
                    sx={{
                      p: 2.5,
                      borderRadius: 2.5,
                      border: isDateToday ? '2px solid #90CAF9' : '1px solid #E8EDF2',
                      bgcolor: '#fff',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box
                          sx={{
                            px: 1.5,
                            py: 0.5,
                            borderRadius: 2,
                            bgcolor: isDateToday ? BRAND.primaryMain : '#F0F4F8',
                            color: isDateToday ? '#fff' : BRAND.primaryMain,
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          {isDateToday ? 'TODAY' : dateObj.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
                        </Box>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ color: BRAND.primaryMain }}>
                          {formattedDate}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${dateVisits.length} ${dateVisits.length === 1 ? 'visit' : 'visits'}`}
                          sx={{ fontSize: 11, fontWeight: 600 }}
                        />
                      </Box>

                      <Button
                        size="small"
                        startIcon={<Add />}
                        onClick={() => openPlanForDate(dateObj)}
                        sx={{ fontSize: 12, textTransform: 'none' }}
                      >
                        Add to this day
                      </Button>
                    </Box>

                    {/* List of visits for this day */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {dateVisits.map((v) => {
                        const cfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.planned;
                        return (
                          <Card
                            key={v.id}
                            variant="outlined"
                            sx={{
                              p: 2,
                              borderRadius: 2,
                              borderColor: '#E8EDF2',
                              borderLeft: `4px solid ${cfg.color}`,
                              transition: 'all 0.15s ease',
                              '&:hover': { borderColor: cfg.color, boxShadow: '0 4px 14px rgba(0,0,0,0.05)' },
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                              {/* Left: Info */}
                              <Box sx={{ flex: 1, minWidth: 260 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                  <Chip
                                    size="small"
                                    icon={cfg.icon}
                                    label={cfg.label}
                                    sx={{
                                      bgcolor: cfg.bg,
                                      color: cfg.color,
                                      fontWeight: 700,
                                      fontSize: 11,
                                      border: `1px solid ${cfg.border}`,
                                    }}
                                  />
                                  <Chip
                                    size="small"
                                    label={v.visit_type_display}
                                    variant="outlined"
                                    sx={{ fontSize: 11, fontWeight: 600 }}
                                  />
                                  {v.start_time && (
                                    <Typography variant="caption" fontWeight={600} color="text.secondary">
                                      ⏰ {v.start_time.slice(0, 5)}
                                      {v.end_time ? ` – ${v.end_time.slice(0, 5)}` : ''}
                                    </Typography>
                                  )}
                                </Box>

                                <Typography variant="subtitle1" fontWeight={800} sx={{ color: BRAND.primaryMain, mt: 0.5 }}>
                                  {v.msme_name}
                                  {v.msme_code && (
                                    <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary', fontWeight: 500 }}>
                                      ({v.msme_code})
                                    </Typography>
                                  )}
                                </Typography>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.75, flexWrap: 'wrap', color: 'text.secondary', fontSize: 12 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Person sx={{ fontSize: 15 }} />
                                    <span>BGE Coach: <strong>{v.bge_name}</strong></span>
                                  </Box>
                                  {v.msme_district && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <LocationOn sx={{ fontSize: 15 }} />
                                      <span>{v.msme_district} ({v.meeting_venue_display})</span>
                                    </Box>
                                  )}
                                  {v.contact_phone && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <Phone sx={{ fontSize: 15 }} />
                                      <span>{v.contact_person || 'Contact'}: {v.contact_phone}</span>
                                    </Box>
                                  )}
                                </Box>

                                {v.objectives && (
                                  <Typography variant="body2" sx={{ mt: 1, color: '#4A5568', bgcolor: '#F8FAFC', p: 1, borderRadius: 1.5, fontSize: 12 }}>
                                    <strong>Objectives:</strong> {v.objectives}
                                  </Typography>
                                )}

                                {/* MISSED ALERT CALLOUT */}
                                {v.status === 'missed' && (
                                  <Box
                                    sx={{
                                      mt: 1.5,
                                      p: 1.5,
                                      borderRadius: 2,
                                      bgcolor: '#FFEBEE',
                                      border: '1px solid #FFCDD2',
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: 1,
                                    }}
                                  >
                                    <WarningAmber sx={{ color: '#C62828', fontSize: 20, mt: 0.2 }} />
                                    <Box>
                                      <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#C62828' }}>
                                        Reason for Missing: {v.missed_reason_display || 'Unspecified'}
                                      </Typography>
                                      {v.missed_reason_notes && (
                                        <Typography variant="caption" sx={{ color: '#5F2120', display: 'block', mt: 0.25 }}>
                                          {v.missed_reason_notes}
                                        </Typography>
                                      )}
                                      {v.missed_recorded_by_name && (
                                        <Typography variant="caption" sx={{ color: '#888', display: 'block', mt: 0.25 }}>
                                          Recorded by: {v.missed_recorded_by_name}
                                        </Typography>
                                      )}
                                    </Box>
                                  </Box>
                                )}

                                {/* COMPLETED CALLOUT */}
                                {v.status === 'completed' && (
                                  <Box
                                    sx={{
                                      mt: 1.5,
                                      p: 1.2,
                                      borderRadius: 2,
                                      bgcolor: '#E8F5E9',
                                      border: '1px solid #C8E6C9',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <Typography variant="caption" sx={{ color: '#2E7D32', fontWeight: 600 }}>
                                      ✓ Visit completed successfully{v.completion_notes ? `: "${v.completion_notes}"` : '.'}
                                    </Typography>
                                    {v.completed_report && (
                                      <Chip
                                        size="small"
                                        label="View Filed Report"
                                        onClick={() => onViewMsme && onViewMsme(v.msme)}
                                        sx={{ bgcolor: '#2E7D32', color: '#fff', fontSize: 10, cursor: 'pointer' }}
                                      />
                                    )}
                                  </Box>
                                )}
                              </Box>

                              {/* Right: Actions */}
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                {v.status === 'planned' && (
                                  <>
                                    <Button
                                      id={`btn-complete-visit-${v.id}`}
                                      size="small"
                                      variant="outlined"
                                      color="success"
                                      startIcon={<CheckCircle />}
                                      onClick={() => {
                                        setSelectedVisit(v);
                                        setCompletionNotes('');
                                        setCompleteDialogOpen(true);
                                      }}
                                      sx={{ fontSize: 11, textTransform: 'none', fontWeight: 700 }}
                                    >
                                      Mark Completed
                                    </Button>

                                    <Button
                                      id={`btn-missed-visit-${v.id}`}
                                      size="small"
                                      variant="outlined"
                                      color="error"
                                      startIcon={<EventBusy />}
                                      onClick={() => {
                                        setSelectedVisit(v);
                                        setMissedReason('');
                                        setMissedNotes('');
                                        setMissedDialogOpen(true);
                                      }}
                                      sx={{ fontSize: 11, textTransform: 'none', fontWeight: 700 }}
                                    >
                                      Mark Missed
                                    </Button>

                                    <Button
                                      id={`btn-reschedule-visit-${v.id}`}
                                      size="small"
                                      variant="outlined"
                                      color="warning"
                                      startIcon={<EditCalendar />}
                                      onClick={() => {
                                        setSelectedVisit(v);
                                        setRescheduleDate(v.scheduled_date);
                                        setRescheduleStartTime(v.start_time || '09:00');
                                        setRescheduleReason('');
                                        setRescheduleDialogOpen(true);
                                      }}
                                      sx={{ fontSize: 11, textTransform: 'none', fontWeight: 700 }}
                                    >
                                      Reschedule
                                    </Button>
                                  </>
                                )}

                                <Button
                                  size="small"
                                  variant="text"
                                  startIcon={<FileDownload />}
                                  href={PLANNED_VISIT_ICS_URL(v.id)}
                                  download={`visit_${v.id}.ics`}
                                  sx={{ fontSize: 11, textTransform: 'none', color: '#666' }}
                                >
                                  .ICS
                                </Button>
                              </Box>
                            </Box>
                          </Card>
                        );
                      })}
                    </Box>
                  </Paper>
                );
              })
          )}
        </Box>
      )}

      {/* ── DETAIL MODAL ────────────────────────────────────────────────────── */}
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        {selectedVisit && (
          <>
            <DialogTitle sx={{ bgcolor: '#F8FAFC', pb: 1.5, borderBottom: '1px solid #E8EDF2' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h6" fontWeight={800} sx={{ color: BRAND.primaryMain }}>
                    {selectedVisit.msme_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Visit Code: #{selectedVisit.id} · {selectedVisit.visit_type_display}
                  </Typography>
                </Box>
                {(() => {
                  const cfg = STATUS_CONFIG[selectedVisit.status] || STATUS_CONFIG.planned;
                  return (
                    <Chip
                      size="small"
                      icon={cfg.icon}
                      label={cfg.label}
                      sx={{ bgcolor: cfg.bg, color: cfg.color, fontWeight: 700, border: `1px solid ${cfg.border}` }}
                    />
                  );
                })()}
              </Box>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 2.5 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Scheduled Date</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    📅 {new Date(selectedVisit.scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Time Window</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    ⏰ {selectedVisit.start_time ? selectedVisit.start_time.slice(0, 5) : 'All Day'}
                    {selectedVisit.end_time ? ` – ${selectedVisit.end_time.slice(0, 5)}` : ''}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">BGE Specialist</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    👤 {selectedVisit.bge_name} ({selectedVisit.bge_code || 'BGE'})
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Venue</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    📍 {selectedVisit.meeting_venue_display}
                  </Typography>
                </Grid>
                {selectedVisit.contact_phone && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">MSME Contact Person</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      📞 {selectedVisit.contact_person} ({selectedVisit.contact_phone})
                    </Typography>
                  </Grid>
                )}
                {selectedVisit.objectives && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">Objectives & Agenda</Typography>
                    <Typography variant="body2" sx={{ bgcolor: '#F8FAFC', p: 1.5, borderRadius: 2, mt: 0.5 }}>
                      {selectedVisit.objectives}
                    </Typography>
                  </Grid>
                )}

                {/* If Missed Details */}
                {selectedVisit.status === 'missed' && (
                  <Grid item xs={12}>
                    <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#FFEBEE', border: '1px solid #FFCDD2' }}>
                      <Typography variant="subtitle2" fontWeight={700} color="#C62828">
                        ⚠️ Reason for Missing: {selectedVisit.missed_reason_display}
                      </Typography>
                      {selectedVisit.missed_reason_notes && (
                        <Typography variant="body2" sx={{ color: '#5F2120', mt: 0.5 }}>
                          {selectedVisit.missed_reason_notes}
                        </Typography>
                      )}
                    </Box>
                  </Grid>
                )}

                {/* If Completed Details */}
                {selectedVisit.status === 'completed' && (
                  <Grid item xs={12}>
                    <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#E8F5E9', border: '1px solid #C8E6C9' }}>
                      <Typography variant="subtitle2" fontWeight={700} color="#2E7D32">
                        ✓ Completed on {selectedVisit.completed_at ? new Date(selectedVisit.completed_at).toLocaleDateString('en-GB') : selectedVisit.scheduled_date}
                      </Typography>
                      {selectedVisit.completion_notes && (
                        <Typography variant="body2" sx={{ color: '#1B5E20', mt: 0.5 }}>
                          {selectedVisit.completion_notes}
                        </Typography>
                      )}
                    </Box>
                  </Grid>
                )}

                {/* Google Calendar Sync Status Bar */}
                <Grid item xs={12}>
                  <Box
                    sx={{
                      p: 1.25,
                      borderRadius: 2,
                      bgcolor: selectedVisit.google_sync_status === 'synced' ? '#E8F5E9' : '#F4F7FB',
                      border: `1px solid ${selectedVisit.google_sync_status === 'synced' ? '#C8E6C9' : '#E0E7F1'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 1,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {selectedVisit.google_sync_status === 'synced' ? (
                        <CloudDone sx={{ color: '#2E7D32', fontSize: 18 }} />
                      ) : (
                        <SyncIcon sx={{ color: '#78909C', fontSize: 18 }} />
                      )}
                      <Typography variant="caption" fontWeight={600} sx={{ color: selectedVisit.google_sync_status === 'synced' ? '#2E7D32' : '#546E7A' }}>
                        {selectedVisit.google_sync_status === 'synced'
                          ? `Synced to Google Calendar ${selectedVisit.google_last_synced_at ? `(${new Date(selectedVisit.google_last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}`
                          : selectedVisit.google_sync_status === 'failed'
                          ? 'Google Calendar sync failed (will retry)'
                          : 'Google Calendar sync ready'}
                      </Typography>
                    </Box>
                    {selectedVisit.google_event_id && (
                      <Chip
                        size="small"
                        label="Event ID Linked ✓"
                        sx={{ fontSize: 10, height: 20, bgcolor: '#C8E6C9', color: '#1B5E20', fontWeight: 700 }}
                      />
                    )}
                  </Box>
                </Grid>
              </Grid>
            </DialogContent>

            <DialogActions sx={{ px: 2.5, py: 1.5, bgcolor: '#F8FAFC', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {selectedVisit.status === 'planned' && (
                  <>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<CheckCircle />}
                      onClick={() => {
                        setCompletionNotes('');
                        setCompleteDialogOpen(true);
                      }}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Mark Completed
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="error"
                      startIcon={<EventBusy />}
                      onClick={() => {
                        setMissedReason('');
                        setMissedNotes('');
                        setMissedDialogOpen(true);
                      }}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Mark Missed
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      startIcon={<EditCalendar />}
                      onClick={() => {
                        setRescheduleDate(selectedVisit.scheduled_date);
                        setRescheduleStartTime(selectedVisit.start_time || '09:00');
                        setRescheduleReason('');
                        setRescheduleDialogOpen(true);
                      }}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Reschedule
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CalendarMonth />}
                      href={getGoogleCalendarUrl(selectedVisit)}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Add to Google Calendar
                    </Button>
                  </>
                )}
              </Box>
              <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── PLAN VISIT MODAL ────────────────────────────────────────────────── */}
      <Dialog
        open={planDialogOpen}
        onClose={() => setPlanDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <form onSubmit={handleCreateVisit}>
          <DialogTitle sx={{ bgcolor: BRAND.primaryMain, color: '#fff', pb: 2 }}>
            <Typography variant="h6" fontWeight={800} color="#fff">
              📅 Plan New MSME Field Visit
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              Set scheduled date, session targets, and contact info for field BDS delivery
            </Typography>
          </DialogTitle>

          <DialogContent dividers sx={{ p: 3 }}>
            <Grid container spacing={2}>
              {/* MSME Selector */}
              <Grid item xs={12} sm={6}>
                {initialMsmeId ? (
                  <TextField
                    label="MSME Enterprise"
                    value={msmes.find((m) => m.id === initialMsmeId)?.business_name || `MSME #${initialMsmeId}`}
                    disabled
                    fullWidth
                    size="small"
                  />
                ) : (
                  <Autocomplete
                    options={msmes}
                    getOptionLabel={(o) => `${o.business_name} (${o.msme_code || o.district || 'MSME'})`}
                    onChange={(_, val) => handleMsmeSelect(val)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Select MSME Enterprise *"
                        size="small"
                        required
                        placeholder="Search by business name or code…"
                      />
                    )}
                  />
                )}
              </Grid>

              {/* BGE Specialist */}
              <Grid item xs={12} sm={6}>
                {isManager ? (
                  <FormControl size="small" fullWidth required>
                    <InputLabel id="plan-bge-label">Assigned BGE Coach *</InputLabel>
                    <Select
                      labelId="plan-bge-label"
                      value={planForm.bge}
                      label="Assigned BGE Coach *"
                      onChange={(e) => setPlanForm({ ...planForm, bge: e.target.value })}
                    >
                      {experts.map((exp) => (
                        <MenuItem key={exp.id} value={exp.id}>
                          {exp.name} ({exp.location || exp.bge_code || 'BGE'})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <TextField
                    label="BGE Coach"
                    value={currentBge?.name || currentUser?.username || 'You'}
                    disabled
                    fullWidth
                    size="small"
                  />
                )}
              </Grid>

              {/* Scheduled Date */}
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Scheduled Date *"
                  type="date"
                  size="small"
                  required
                  fullWidth
                  value={planForm.scheduled_date}
                  onChange={(e) => setPlanForm({ ...planForm, scheduled_date: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              {/* Start Time */}
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Start Time"
                  type="time"
                  size="small"
                  fullWidth
                  value={planForm.start_time}
                  onChange={(e) => setPlanForm({ ...planForm, start_time: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              {/* End Time */}
              <Grid item xs={6} sm={4}>
                <TextField
                  label="End Time"
                  type="time"
                  size="small"
                  fullWidth
                  value={planForm.end_time}
                  onChange={(e) => setPlanForm({ ...planForm, end_time: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              {/* Visit Type */}
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth required>
                  <InputLabel id="plan-type-label">Visit Type *</InputLabel>
                  <Select
                    labelId="plan-type-label"
                    value={planForm.visit_type}
                    label="Visit Type *"
                    onChange={(e) => setPlanForm({ ...planForm, visit_type: e.target.value })}
                  >
                    {VISIT_TYPES.map((vt) => (
                      <MenuItem key={vt.value} value={vt.value}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {vt.icon}
                          <span>{vt.label}</span>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Venue */}
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="plan-venue-label">Meeting Venue</InputLabel>
                  <Select
                    labelId="plan-venue-label"
                    value={planForm.meeting_venue}
                    label="Meeting Venue"
                    onChange={(e) => setPlanForm({ ...planForm, meeting_venue: e.target.value })}
                  >
                    {VENUES.map((vn) => (
                      <MenuItem key={vn.value} value={vn.value}>
                        {vn.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Title / Focus */}
              <Grid item xs={12}>
                <TextField
                  label="Visit Focus / Title (e.g. Q3 Costing & Financial Record-Keeping Review)"
                  size="small"
                  fullWidth
                  value={planForm.title}
                  onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                />
              </Grid>

              {/* Objectives */}
              <Grid item xs={12}>
                <TextField
                  label="Specific Objectives & Expected Outcomes"
                  multiline
                  rows={2}
                  size="small"
                  fullWidth
                  placeholder="What specific tools or assistance will be delivered during this visit?"
                  value={planForm.objectives}
                  onChange={(e) => setPlanForm({ ...planForm, objectives: e.target.value })}
                />
              </Grid>

              {/* Contact Info */}
              <Grid item xs={12} sm={6}>
                <TextField
                  label="MSME Contact Person"
                  size="small"
                  fullWidth
                  value={planForm.contact_person}
                  onChange={(e) => setPlanForm({ ...planForm, contact_person: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Contact Phone Number"
                  size="small"
                  fullWidth
                  value={planForm.contact_phone}
                  onChange={(e) => setPlanForm({ ...planForm, contact_phone: e.target.value })}
                />
              </Grid>
            </Grid>
          </DialogContent>

          <DialogActions sx={{ p: 2.5, bgcolor: '#F8FAFC' }}>
            <Button onClick={() => setPlanDialogOpen(false)} sx={{ color: '#666' }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              sx={{ bgcolor: BRAND.programmeGreen, fontWeight: 700, px: 3, '&:hover': { bgcolor: '#007A4D' } }}
            >
              Save & Plan Visit
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ── MARK MISSED MODAL ──────────────────────────────────────────────── */}
      <Dialog
        open={missedDialogOpen}
        onClose={() => setMissedDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ bgcolor: '#FFEBEE', color: '#C62828', pb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EventBusy />
            <Typography variant="h6" fontWeight={800} color="#C62828">
              Record Missed Field Meeting
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: '#821C1C' }}>
            Please document the specific reason why this scheduled meeting could not take place.
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 2.5 }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              {selectedVisit?.msme_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Scheduled Date: {selectedVisit?.scheduled_date} · Coach: {selectedVisit?.bge_name}
            </Typography>
          </Box>

          <FormControl size="small" fullWidth required sx={{ mb: 2 }}>
            <InputLabel id="select-missed-reason-label">Reason for Missing *</InputLabel>
            <Select
              labelId="select-missed-reason-label"
              id="select-missed-reason"
              value={missedReason}
              label="Reason for Missing *"
              onChange={(e) => setMissedReason(e.target.value)}
            >
              {MISSED_REASONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            id="input-missed-notes"
            label="Detailed Narrative / Circumstances *"
            multiline
            rows={3}
            size="small"
            fullWidth
            required
            placeholder="Explain what happened (e.g. owner called away on emergency, flooded route, etc.)…"
            value={missedNotes}
            onChange={(e) => setMissedNotes(e.target.value)}
            helperText="This explanation will be logged and visible in management reporting."
          />
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: '#F8FAFC' }}>
          <Button onClick={() => setMissedDialogOpen(false)}>Cancel</Button>
          <Button
            id="btn-submit-mark-missed"
            variant="contained"
            color="error"
            disabled={!missedReason || missedSubmitting}
            onClick={handleConfirmMissed}
            sx={{ fontWeight: 700 }}
          >
            {missedSubmitting ? 'Recording…' : 'Confirm as Missed'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── MARK COMPLETED MODAL ───────────────────────────────────────────── */}
      <Dialog
        open={completeDialogOpen}
        onClose={() => setCompleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', pb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircle />
            <Typography variant="h6" fontWeight={800} color="#2E7D32">
              Mark Visit as Completed
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
            {selectedVisit?.msme_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Conducted on: {selectedVisit?.scheduled_date} · Coach: {selectedVisit?.bge_name}
          </Typography>

          <TextField
            id="input-completion-notes"
            label="Session Summary / Completion Notes"
            multiline
            rows={3}
            size="small"
            fullWidth
            placeholder="Key highlights or BDS interventions delivered…"
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            sx={{ mb: 2 }}
          />

          {onOpenNewReport && (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              <Typography variant="caption" display="block">
                Want to file the official field report with GPS coordinates and diagnostic metrics right now?
              </Typography>
              <Button
                id="btn-file-report-now"
                size="small"
                variant="contained"
                sx={{ mt: 1, bgcolor: BRAND.primaryMain, fontSize: 11 }}
                onClick={() => {
                  setCompleteDialogOpen(false);
                  setDetailDialogOpen(false);
                  onOpenNewReport(selectedVisit.msme, selectedVisit.visit_type);
                }}
              >
                File Full Visit Report Now
              </Button>
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: '#F8FAFC' }}>
          <Button onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
          <Button
            id="btn-submit-mark-completed"
            variant="contained"
            color="success"
            disabled={completeSubmitting}
            onClick={handleConfirmCompleted}
            sx={{ fontWeight: 700 }}
          >
            {completeSubmitting ? 'Saving…' : 'Confirm Completed'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── RESCHEDULE MODAL ───────────────────────────────────────────────── */}
      <Dialog
        open={rescheduleDialogOpen}
        onClose={() => setRescheduleDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ bgcolor: '#FFF3E0', color: '#E65100', pb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditCalendar />
            <Typography variant="h6" fontWeight={800} color="#E65100">
              Reschedule Visit
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 2.5 }}>
          <TextField
            id="input-reschedule-date"
            label="New Scheduled Date *"
            type="date"
            size="small"
            required
            fullWidth
            value={rescheduleDate}
            onChange={(e) => setRescheduleDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            id="input-reschedule-time"
            label="Start Time"
            type="time"
            size="small"
            fullWidth
            value={rescheduleStartTime}
            onChange={(e) => setRescheduleStartTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            id="input-reschedule-reason"
            label="Reason for Rescheduling"
            multiline
            rows={2}
            size="small"
            fullWidth
            placeholder="Why was the meeting moved?…"
            value={rescheduleReason}
            onChange={(e) => setRescheduleReason(e.target.value)}
          />
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: '#F8FAFC' }}>
          <Button onClick={() => setRescheduleDialogOpen(false)}>Cancel</Button>
          <Button
            id="btn-submit-reschedule"
            variant="contained"
            color="warning"
            disabled={!rescheduleDate || rescheduleSubmitting}
            onClick={handleConfirmReschedule}
            sx={{ fontWeight: 700 }}
          >
            {rescheduleSubmitting ? 'Updating…' : 'Reschedule'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
