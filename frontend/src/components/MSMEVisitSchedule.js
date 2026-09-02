import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Chip, Grid, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, CircularProgress,
  Alert, IconButton, Tooltip, Stack
} from '@mui/material';
import {
  CalendarMonth, AccessTime, Place, Person, Phone, Event, Add,
  CheckCircle, Cancel, Autorenew, Description, FileDownload
} from '@mui/icons-material';
import axios from 'axios';
import { BRAND } from '../theme';
import {
  API_ENDPOINTS,
  PLANNED_VISIT_MARK_MISSED_URL,
  PLANNED_VISIT_MARK_COMPLETED_URL,
  PLANNED_VISIT_RESCHEDULE_URL,
  PLANNED_VISIT_ICS_URL,
} from '../config';

const h = (token) => ({
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

const VISIT_TYPE_LABELS = {
  diagnostic: 'Diagnostic & Baseline',
  action_plan: 'Action Plan Review',
  coaching: 'Business Coaching',
  training: 'Technical Training',
  monitoring: 'Follow-up & Monitoring',
  milestone_verification: 'Milestone Verification',
  closing: 'Closing / Exit Review',
  other: 'General Field Visit',
};

const VENUE_LABELS = {
  msme_premises: 'MSME Business Premises',
  bge_office: 'BGE / Hub Office',
  virtual_phone: 'Phone / Virtual Session',
  field_site: 'Field Production Site',
  other: 'Other Meeting Venue',
};

const MISSED_REASON_LABELS = {
  owner_absent: 'Owner / Key Decision Maker Absent',
  msme_busy: 'MSME Busy / Peak Business Activity',
  bge_emergency: 'BGE Travel / Official Emergency',
  weather_road: 'Heavy Rainfall / Bad Road Access',
  security: 'Security / Safety Concerns',
  rescheduled_by_msme: 'Rescheduled by MSME Prior to Visit',
  rescheduled_by_bge: 'Rescheduled by BGE Prior to Visit',
  other: 'Other Unforeseen Reason',
};

export default function MSMEVisitSchedule({
  token,
  msme,
  currentUser,
  currentBge,
  onOpenNewReport,
}) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Dialog states
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [newVisit, setNewVisit] = useState({
    scheduled_date: '',
    start_time: '10:00',
    end_time: '11:30',
    visit_type: 'coaching',
    title: '',
    objectives: '',
    meeting_venue: 'msme_premises',
    contact_person: msme?.owner_name || '',
    contact_phone: msme?.phone || '',
  });

  // Lifecycle action dialogs
  const [missedDialogOpen, setMissedDialogOpen] = useState(false);
  const [targetVisit, setTargetVisit] = useState(null);
  const [missedReason, setMissedReason] = useState('owner_absent');
  const [missedNotes, setMissedNotes] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('10:00');
  const [newEndTime, setNewEndTime] = useState('11:30');
  const [rescheduleReason, setRescheduleReason] = useState('');

  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');

  const canManage = !!(
    currentUser?.is_staff ||
    currentUser?.is_superuser ||
    currentUser?.role === 'bge' ||
    currentUser?.role === 'cohort_admin'
  );

  const fetchVisits = useCallback(async () => {
    if (!token || !msme?.id) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_ENDPOINTS.PLANNED_VISITS}?msme=${msme.id}`, h(token));
      const data = Array.isArray(res.data) ? res.data : res.data?.results || [];
      // Sort: upcoming planned first, then by date descending
      data.sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date));
      setVisits(data);
    } catch (err) {
      console.error('Failed to load MSME visits', err);
    } finally {
      setLoading(false);
    }
  }, [token, msme?.id]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  // Identify next upcoming planned visit (earliest planned visit on or after today)
  const today = new Date().toISOString().split('T')[0];
  const plannedVisits = visits.filter((v) => v.status === 'planned');
  const futurePlanned = plannedVisits
    .filter((v) => v.scheduled_date >= today)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const upcomingVisit =
    futurePlanned[0] ||
    (plannedVisits.length > 0 ? plannedVisits[0] : null);
  const pastVisits = visits.filter((v) => v.id !== upcomingVisit?.id);

  // ── Handle Schedule New Visit ──────────────────────────────────────────────
  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (!newVisit.scheduled_date) {
      setFeedback({ type: 'error', text: 'Scheduled date is required.' });
      return;
    }
    setScheduleSubmitting(true);
    try {
      await axios.post(
        API_ENDPOINTS.PLANNED_VISITS,
        {
          msme: msme.id,
          bge: currentBge?.id || msme.assigned_bge || null,
          scheduled_date: newVisit.scheduled_date,
          start_time: newVisit.start_time ? `${newVisit.start_time}:00` : null,
          end_time: newVisit.end_time ? `${newVisit.end_time}:00` : null,
          visit_type: newVisit.visit_type,
          title: newVisit.title.trim() || `${VISIT_TYPE_LABELS[newVisit.visit_type] || 'Field Visit'} - ${msme.business_name}`,
          objectives: newVisit.objectives.trim(),
          meeting_venue: newVisit.meeting_venue,
          contact_person: newVisit.contact_person,
          contact_phone: newVisit.contact_phone,
        },
        h(token)
      );
      setFeedback({ type: 'success', text: 'Field visit scheduled successfully!' });
      setScheduleModalOpen(false);
      fetchVisits();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.error || 'Failed to schedule field visit.',
      });
    } finally {
      setScheduleSubmitting(false);
    }
  };

  // ── Handle Mark Missed ─────────────────────────────────────────────────────
  const handleConfirmMissed = async () => {
    if (!targetVisit) return;
    setActionSubmitting(true);
    try {
      await axios.post(
        PLANNED_VISIT_MARK_MISSED_URL(targetVisit.id),
        { missed_reason: missedReason, missed_reason_notes: missedNotes.trim(), notes: missedNotes.trim() },
        h(token)
      );
      setFeedback({ type: 'info', text: 'Visit marked as missed with reason recorded.' });
      setMissedDialogOpen(false);
      setTargetVisit(null);
      fetchVisits();
    } catch (err) {
      setFeedback({ type: 'error', text: 'Failed to record missed visit.' });
    } finally {
      setActionSubmitting(false);
    }
  };

  // ── Handle Reschedule ──────────────────────────────────────────────────────
  const handleConfirmReschedule = async () => {
    if (!targetVisit || !newDate) return;
    setActionSubmitting(true);
    try {
      await axios.post(
        PLANNED_VISIT_RESCHEDULE_URL(targetVisit.id),
        {
          new_date: newDate,
          new_start_time: newStartTime ? `${newStartTime}:00` : null,
          new_end_time: newEndTime ? `${newEndTime}:00` : null,
          reason: rescheduleReason.trim(),
        },
        h(token)
      );
      setFeedback({ type: 'success', text: `Visit rescheduled to ${newDate}.` });
      setRescheduleDialogOpen(false);
      setTargetVisit(null);
      fetchVisits();
    } catch (err) {
      setFeedback({ type: 'error', text: 'Failed to reschedule visit.' });
    } finally {
      setActionSubmitting(false);
    }
  };

  // ── Handle Complete ────────────────────────────────────────────────────────
  const handleConfirmComplete = async () => {
    if (!targetVisit) return;
    setActionSubmitting(true);
    try {
      await axios.post(
        PLANNED_VISIT_MARK_COMPLETED_URL(targetVisit.id),
        { completion_notes: completionNotes.trim() },
        h(token)
      );
      setFeedback({ type: 'success', text: 'Visit marked as completed.' });
      setCompleteDialogOpen(false);
      setTargetVisit(null);
      fetchVisits();
    } catch (err) {
      setFeedback({ type: 'error', text: 'Failed to mark visit completed.' });
    } finally {
      setActionSubmitting(false);
    }
  };

  // ── 1-Click Google Calendar Link Generator ─────────────────────────────────
  const openGoogleCalendar = (v) => {
    const title = encodeURIComponent(v.title || `PRUDEV Visit: ${msme?.business_name}`);
    const details = encodeURIComponent(
      `BGE Specialist: ${v.bge_name || 'Assigned BGE'}\n` +
      `MSME: ${msme?.business_name} (${msme?.msme_code || ''})\n` +
      `Venue: ${VENUE_LABELS[v.meeting_venue] || v.meeting_venue || 'MSME Premises'}\n` +
      `Contact: ${v.contact_person || msme?.owner_name || ''} (${v.contact_phone || msme?.phone || ''})\n\n` +
      `Objectives:\n${v.objectives || 'Field coaching and monitoring session.'}`
    );
    const location = encodeURIComponent(`${VENUE_LABELS[v.meeting_venue] || ''}, ${msme?.district || 'Northern Uganda'}, Uganda`);

    let dates;
    if (v.start_time) {
      const d = v.scheduled_date.replace(/-/g, '');
      const s = v.start_time.replace(/:/g, '').padEnd(6, '0').slice(0, 6);
      const e = v.end_time ? v.end_time.replace(/:/g, '').padEnd(6, '0').slice(0, 6) : s;
      dates = `${d}T${s}/${d}T${e}`;
    } else {
      const d = v.scheduled_date.replace(/-/g, '');
      dates = `${d}/${d}`;
    }

    const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}&dates=${dates}`;
    window.open(gCalUrl, '_blank', 'noopener,noreferrer');
  };

  const getStatusChip = (status, missedReason) => {
    switch (status) {
      case 'planned':
        return <Chip size="small" icon={<CalendarMonth sx={{ fontSize: '14px !important' }} />} label="Planned" sx={{ bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 700, fontSize: 11 }} />;
      case 'completed':
        return <Chip size="small" icon={<CheckCircle sx={{ fontSize: '14px !important' }} />} label="Completed" sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: 11 }} />;
      case 'missed':
        return <Chip size="small" icon={<Cancel sx={{ fontSize: '14px !important' }} />} label={`Missed: ${MISSED_REASON_LABELS[missedReason] || 'Unspecified'}`} sx={{ bgcolor: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 11 }} />;
      case 'rescheduled':
        return <Chip size="small" icon={<Autorenew sx={{ fontSize: '14px !important' }} />} label="Rescheduled" sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 700, fontSize: 11 }} />;
      default:
        return <Chip size="small" label={status} />;
    }
  };

  const formatDateHuman = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Alert feedback */}
      {feedback && (
        <Alert
          severity={feedback.type}
          onClose={() => setFeedback(null)}
          sx={{ mb: 2, borderRadius: 2 }}
        >
          {feedback.text}
        </Alert>
      )}

      {/* Header bar with "+ Schedule Next Visit" */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={800} sx={{ color: BRAND.primaryMain, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarMonth sx={{ color: '#1A73E8' }} /> Field Visit Schedule
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Upcoming sessions, advisory visits, and engagement history for {msme?.business_name}
          </Typography>
        </Box>

        {canManage && (
          <Button
            variant="contained"
            size="small"
            startIcon={<Add />}
            onClick={() => {
              setNewVisit({
                scheduled_date: '',
                start_time: '10:00',
                end_time: '11:30',
                visit_type: 'coaching',
                title: '',
                objectives: '',
                meeting_venue: 'msme_premises',
                contact_person: msme?.owner_name || '',
                contact_phone: msme?.phone || '',
              });
              setScheduleModalOpen(true);
            }}
            sx={{
              bgcolor: BRAND.primaryMain,
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              px: 2,
              boxShadow: '0 2px 6px rgba(26, 46, 66, 0.25)',
              '&:hover': { bgcolor: BRAND.primaryDark },
            }}
          >
            Schedule Visit
          </Button>
        )}
      </Box>

      {loading && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 3 }} />}

      {/* ── 1. NEXT UPCOMING VISIT HERO CARD ───────────────────────────────── */}
      {!loading && upcomingVisit ? (
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            mb: 3,
            borderRadius: 3,
            border: '2px solid #1A73E8',
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F8FD 100%)',
            boxShadow: '0 4px 16px rgba(26, 115, 232, 0.08)',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label="NEXT SCHEDULED SESSION"
                size="small"
                sx={{ bgcolor: '#1A73E8', color: '#fff', fontWeight: 800, fontSize: 10, letterSpacing: 0.5 }}
              />
              <Chip
                label={VISIT_TYPE_LABELS[upcomingVisit.visit_type] || upcomingVisit.visit_type}
                size="small"
                variant="outlined"
                sx={{ borderColor: '#1A73E8', color: '#1A73E8', fontWeight: 700, fontSize: 11 }}
              />
              {upcomingVisit.is_google_synced && (
                <Chip
                  size="small"
                  label="Synced with Google"
                  sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: 10 }}
                />
              )}
            </Box>

            <Button
              size="small"
              variant="outlined"
              startIcon={<CalendarMonth />}
              onClick={() => openGoogleCalendar(upcomingVisit)}
              sx={{
                fontSize: 12,
                fontWeight: 700,
                borderColor: '#1A73E8',
                color: '#1A73E8',
                bgcolor: '#fff',
                '&:hover': { bgcolor: '#E8F0FE', borderColor: '#1A73E8' },
              }}
            >
              Add to Google Calendar
            </Button>
          </Box>

          <Typography variant="h6" fontWeight={800} sx={{ color: BRAND.primaryMain, mb: 1.5 }}>
            {upcomingVisit.title || `${VISIT_TYPE_LABELS[upcomingVisit.visit_type] || 'Field Visit'} with ${msme?.business_name}`}
          </Typography>

          {/* Key Meeting Metadata Grid */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Event sx={{ color: '#1A73E8', fontSize: 20 }} />
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Date</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: BRAND.primaryMain }}>
                    {formatDateHuman(upcomingVisit.scheduled_date)}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid item xs={12} sm={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTime sx={{ color: '#1A73E8', fontSize: 20 }} />
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Time Window</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: BRAND.primaryMain }}>
                    {upcomingVisit.start_time
                      ? `${upcomingVisit.start_time.slice(0, 5)} – ${upcomingVisit.end_time ? upcomingVisit.end_time.slice(0, 5) : 'End'}`
                      : 'All Day Field Visit'}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid item xs={12} sm={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Place sx={{ color: '#1A73E8', fontSize: 20 }} />
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Meeting Venue</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: BRAND.primaryMain }}>
                    {VENUE_LABELS[upcomingVisit.meeting_venue] || upcomingVisit.meeting_venue || 'MSME Premises'}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>

          {/* Specialist & Objectives */}
          <Paper elevation={0} sx={{ p: 1.5, bgcolor: '#FFFFFF', borderRadius: 2, border: '1px solid #E3E8EF', mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Person sx={{ color: BRAND.primaryMain, fontSize: 18 }} />
                <Typography variant="body2" fontWeight={700} sx={{ color: BRAND.primaryMain }}>
                  Assigned Specialist: {upcomingVisit.bge_name || msme?.assigned_bge_name || 'BGE Specialist'}
                </Typography>
              </Box>
              {(upcomingVisit.contact_phone || msme?.phone) && (
                <Chip
                  icon={<Phone sx={{ fontSize: '13px !important' }} />}
                  label={upcomingVisit.contact_phone || msme?.phone}
                  size="small"
                  component="a"
                  href={`tel:${upcomingVisit.contact_phone || msme?.phone}`}
                  clickable
                  sx={{ bgcolor: '#F1F5F9', fontWeight: 600, fontSize: 11 }}
                />
              )}
            </Box>

            {upcomingVisit.objectives && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                  Session Objectives & Focus:
                </Typography>
                <Typography variant="body2" sx={{ color: '#334155', fontSize: 13, whiteSpace: 'pre-wrap', mt: 0.5 }}>
                  {upcomingVisit.objectives}
                </Typography>
              </Box>
            )}
          </Paper>

          {/* Action buttons for upcoming session */}
          {canManage && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={<Autorenew />}
                onClick={() => {
                  setTargetVisit(upcomingVisit);
                  setNewDate(upcomingVisit.scheduled_date);
                  setNewStartTime(upcomingVisit.start_time ? upcomingVisit.start_time.slice(0, 5) : '10:00');
                  setNewEndTime(upcomingVisit.end_time ? upcomingVisit.end_time.slice(0, 5) : '11:30');
                  setRescheduleReason('');
                  setRescheduleDialogOpen(true);
                }}
                sx={{ fontSize: 12, fontWeight: 600 }}
              >
                Reschedule
              </Button>

              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<Cancel />}
                onClick={() => {
                  setTargetVisit(upcomingVisit);
                  setMissedReason('owner_absent');
                  setMissedNotes('');
                  setMissedDialogOpen(true);
                }}
                sx={{ fontSize: 12, fontWeight: 600 }}
              >
                Mark Missed
              </Button>

              {onOpenNewReport && (
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  startIcon={<Description />}
                  onClick={() => onOpenNewReport(msme.id, upcomingVisit.visit_type)}
                  sx={{ fontSize: 12, fontWeight: 700 }}
                >
                  File Report
                </Button>
              )}

              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<CheckCircle />}
                onClick={() => {
                  setTargetVisit(upcomingVisit);
                  setCompletionNotes('');
                  setCompleteDialogOpen(true);
                }}
                sx={{ fontSize: 12, fontWeight: 700 }}
              >
                Complete Session
              </Button>
            </Box>
          )}
        </Paper>
      ) : !loading ? (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 2.5,
            border: '1px dashed #CBD5E1',
            bgcolor: '#F8FAFC',
            textAlign: 'center',
          }}
        >
          <CalendarMonth sx={{ fontSize: 36, color: '#94A3B8', mb: 1 }} />
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: BRAND.primaryMain }}>
            No Upcoming Field Visit Scheduled
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13, maxWidth: 440, mx: 'auto', mt: 0.5, mb: 2 }}>
            Keep your MSME engagements on track. Schedule your next coaching, diagnostic, or review session with this enterprise.
          </Typography>
          {canManage && (
            <Button
              variant="contained"
              size="small"
              startIcon={<Add />}
              onClick={() => setScheduleModalOpen(true)}
              sx={{ bgcolor: BRAND.primaryMain, fontWeight: 700 }}
            >
              Schedule Next Visit
            </Button>
          )}
        </Paper>
      ) : null}

      {/* ── 2. SESSION HISTORY & PAST VISITS ───────────────────────────────── */}
      <Typography variant="subtitle2" fontWeight={800} sx={{ color: BRAND.primaryMain, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Description sx={{ fontSize: 18, color: '#64748B' }} /> Engagement History ({pastVisits.length})
      </Typography>

      {pastVisits.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 1.5 }}>
          No previous visit records found for this MSME.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {pastVisits.map((v) => (
            <Paper
              key={v.id}
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: v.status === 'completed' ? '#FCFDFD' : v.status === 'missed' ? '#FFFBFB' : '#FFFFFF',
                borderColor: v.status === 'completed' ? '#DCFCE7' : v.status === 'missed' ? '#FEE2E2' : '#E2E8F0',
                transition: 'all 0.15s ease',
                '&:hover': { borderColor: '#94A3B8', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    {getStatusChip(v.status, v.missed_reason)}
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      {formatDateHuman(v.scheduled_date)}
                    </Typography>
                    {v.start_time && (
                      <Typography variant="caption" color="text.secondary">
                        • {v.start_time.slice(0, 5)}
                      </Typography>
                    )}
                  </Box>

                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: BRAND.primaryMain }}>
                    {v.title || `${VISIT_TYPE_LABELS[v.visit_type] || 'Visit'}`}
                  </Typography>

                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.3 }}>
                    Specialist: <strong>{v.bge_name || msme?.assigned_bge_name || 'BGE'}</strong> • Venue: {VENUE_LABELS[v.meeting_venue] || 'Premises'}
                  </Typography>

                  {/* Notes / Reason explanation */}
                  {v.status === 'missed' && (
                    <Box sx={{ mt: 1, p: 1, bgcolor: '#FEF2F2', borderRadius: 1.5, border: '1px solid #FCA5A5' }}>
                      <Typography variant="caption" fontWeight={700} sx={{ color: '#991B1B', display: 'block' }}>
                        Reason for Missing: {MISSED_REASON_LABELS[v.missed_reason] || v.missed_reason || 'Unspecified'}
                      </Typography>
                      {v.missed_reason_notes && (
                        <Typography variant="caption" sx={{ color: '#7F1D1D', display: 'block', mt: 0.25 }}>
                          Notes: {v.missed_reason_notes}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {v.status === 'completed' && v.completion_notes && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                      Completion summary: {v.completion_notes}
                    </Typography>
                  )}
                </Box>

                {/* Right side actions */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Tooltip title="Add / View in Google Calendar">
                    <IconButton size="small" onClick={() => openGoogleCalendar(v)}>
                      <CalendarMonth fontSize="small" sx={{ color: '#1A73E8' }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Download .ICS Calendar File">
                    <IconButton size="small" component="a" href={PLANNED_VISIT_ICS_URL(v.id)} download>
                      <FileDownload fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {v.status === 'planned' && canManage && (
                    <>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => {
                          setTargetVisit(v);
                          setMissedReason('owner_absent');
                          setMissedNotes('');
                          setMissedDialogOpen(true);
                        }}
                        sx={{ fontSize: 11, py: 0.2, minWidth: 'unset' }}
                      >
                        Missed
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={() => {
                          setTargetVisit(v);
                          setCompletionNotes('');
                          setCompleteDialogOpen(true);
                        }}
                        sx={{ fontSize: 11, py: 0.2, minWidth: 'unset' }}
                      >
                        Complete
                      </Button>
                    </>
                  )}
                </Box>
              </Box>
            </Paper>
          ))}
        </Stack>
      )}

      {/* ── SCHEDULE NEW VISIT DIALOG ──────────────────────────────────────── */}
      <Dialog
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ bgcolor: BRAND.primaryMain, color: '#fff', pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarMonth />
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#fff' }}>
                Schedule Field Visit
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                {msme?.business_name} ({msme?.district || 'Northern Uganda'})
              </Typography>
            </Box>
          </Box>
        </DialogTitle>

        <form onSubmit={handleScheduleSubmit}>
          <DialogContent dividers sx={{ p: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Visit Date"
                  type="date"
                  required
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  value={newVisit.scheduled_date}
                  onChange={(e) => setNewVisit({ ...newVisit, scheduled_date: e.target.value })}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Session Type"
                  select
                  required
                  fullWidth
                  size="small"
                  value={newVisit.visit_type}
                  onChange={(e) => setNewVisit({ ...newVisit, visit_type: e.target.value })}
                >
                  {Object.entries(VISIT_TYPE_LABELS).map(([k, label]) => (
                    <MenuItem key={k} value={k}>{label}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={6}>
                <TextField
                  label="Start Time"
                  type="time"
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  value={newVisit.start_time}
                  onChange={(e) => setNewVisit({ ...newVisit, start_time: e.target.value })}
                />
              </Grid>

              <Grid item xs={6}>
                <TextField
                  label="End Time"
                  type="time"
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  value={newVisit.end_time}
                  onChange={(e) => setNewVisit({ ...newVisit, end_time: e.target.value })}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Meeting Venue"
                  select
                  fullWidth
                  size="small"
                  value={newVisit.meeting_venue}
                  onChange={(e) => setNewVisit({ ...newVisit, meeting_venue: e.target.value })}
                >
                  {Object.entries(VENUE_LABELS).map(([k, label]) => (
                    <MenuItem key={k} value={k}>{label}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Session Focus / Title"
                  fullWidth
                  size="small"
                  placeholder="e.g., Financial recordkeeping coaching & cashbook setup"
                  value={newVisit.title}
                  onChange={(e) => setNewVisit({ ...newVisit, title: e.target.value })}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Objectives & Key Topics"
                  multiline
                  rows={3}
                  fullWidth
                  size="small"
                  placeholder="What will you work on with the MSME during this visit?"
                  value={newVisit.objectives}
                  onChange={(e) => setNewVisit({ ...newVisit, objectives: e.target.value })}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Contact Person"
                  fullWidth
                  size="small"
                  value={newVisit.contact_person}
                  onChange={(e) => setNewVisit({ ...newVisit, contact_person: e.target.value })}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Contact Phone"
                  fullWidth
                  size="small"
                  value={newVisit.contact_phone}
                  onChange={(e) => setNewVisit({ ...newVisit, contact_phone: e.target.value })}
                />
              </Grid>
            </Grid>
          </DialogContent>

          <DialogActions sx={{ p: 2, bgcolor: '#F8FAFC' }}>
            <Button onClick={() => setScheduleModalOpen(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={scheduleSubmitting}
              sx={{ bgcolor: BRAND.primaryMain, fontWeight: 700 }}
            >
              {scheduleSubmitting ? 'Saving…' : 'Schedule Visit'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ── MARK MISSED DIALOG ────────────────────────────────────────────── */}
      <Dialog open={missedDialogOpen} onClose={() => setMissedDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: '#FFEBEE', color: '#C62828', pb: 1.5 }}>
          Record Missed Visit
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Please record why the visit could not take place on {formatDateHuman(targetVisit?.scheduled_date)}.
          </Typography>
          <TextField
            label="Reason for Missing"
            select
            fullWidth
            required
            size="small"
            value={missedReason}
            onChange={(e) => setMissedReason(e.target.value)}
            sx={{ mb: 2 }}
          >
            {Object.entries(MISSED_REASON_LABELS).map(([k, label]) => (
              <MenuItem key={k} value={k}>{label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Explanation Notes"
            multiline
            rows={2}
            fullWidth
            size="small"
            placeholder="Additional context or next action…"
            value={missedNotes}
            onChange={(e) => setMissedNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#F8FAFC' }}>
          <Button onClick={() => setMissedDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={actionSubmitting}
            onClick={handleConfirmMissed}
            sx={{ fontWeight: 700 }}
          >
            {actionSubmitting ? 'Recording…' : 'Confirm Missed'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── RESCHEDULE DIALOG ──────────────────────────────────────────────── */}
      <Dialog open={rescheduleDialogOpen} onClose={() => setRescheduleDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: '#FFF3E0', color: '#E65100', pb: 1.5 }}>
          Reschedule Session
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          <TextField
            label="New Date"
            type="date"
            required
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Grid container spacing={1} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField
                label="Start Time"
                type="time"
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="End Time"
                type="time"
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
              />
            </Grid>
          </Grid>
          <TextField
            label="Reason for Rescheduling"
            multiline
            rows={2}
            fullWidth
            size="small"
            placeholder="Why was the session moved?…"
            value={rescheduleReason}
            onChange={(e) => setRescheduleReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#F8FAFC' }}>
          <Button onClick={() => setRescheduleDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!newDate || actionSubmitting}
            onClick={handleConfirmReschedule}
            sx={{ fontWeight: 700 }}
          >
            {actionSubmitting ? 'Updating…' : 'Reschedule'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── COMPLETE DIALOG ────────────────────────────────────────────────── */}
      <Dialog open={completeDialogOpen} onClose={() => setCompleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', pb: 1.5 }}>
          Complete Visit Session
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Mark visit as successfully held on {formatDateHuman(targetVisit?.scheduled_date)}.
          </Typography>
          <TextField
            label="Key Outcomes / Takeaways"
            multiline
            rows={3}
            fullWidth
            size="small"
            placeholder="Summary of coaching provided, topics covered, agreed action points…"
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#F8FAFC' }}>
          <Button onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            disabled={actionSubmitting}
            onClick={handleConfirmComplete}
            sx={{ fontWeight: 700 }}
          >
            {actionSubmitting ? 'Saving…' : 'Mark Completed'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
