import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, Chip, IconButton,
  Grid, Divider, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Avatar, Paper, Stack,
} from '@mui/material';
import {
  Close, EventAvailable, Send, Download, CheckCircle,
  CalendarMonth, Business,
} from '@mui/icons-material';
import axios from 'axios';
import { BRAND } from '../theme';
import {
  TBIP_MEETINGS,
  TBIP_MEETING_ICS_URL,
  TBIP_PLAN_BOOK_MEETING_URL,
} from '../config';


const COACHES = [
  {
    name: 'Richard Obuku',
    role: 'BDS Manager / Programme Coordinator',
    email: 'richard.obuku@gopa.eu',
    initials: 'RO',
    color: '#0F172A',
  },
  {
    name: 'Stephen Maxi Opwonya',
    role: 'Team Leader, PRUDEV II — GOPA Pro',
    email: 'stephenmaxi.opwonya@gopa.eu',
    initials: 'SO',
    color: BRAND.gizRed,
  },
];

const STANDARD_TOPICS = [
  'Formulating Priority Actions Roadmap (3–5 Actions)',
  '7-Dimension Diagnostic Assessment & Gap Analysis Guidance',
  'Pre-submission TBIP Review & Endorsement',
  'MSME Specific BDS Intervention & Coaching Strategy',
  'Other / Custom Advisory',
];

const TIME_SLOTS = [
  { value: '09:00:00', label: '09:00 AM EAT (Morning)' },
  { value: '10:30:00', label: '10:30 AM EAT (Mid-Morning)' },
  { value: '11:30:00', label: '11:30 AM EAT' },
  { value: '14:00:00', label: '02:00 PM EAT (Afternoon)' },
  { value: '15:30:00', label: '03:30 PM EAT (Late Afternoon)' },
  { value: '16:30:00', label: '04:30 PM EAT' },
];

export default function BookTBIPMeetingDialog({
  open,
  onClose,
  plan,
  msme,
  msmes = [],
  currentUser,
  token,
  onBooked,
  notify,
}) {
  const [selectedMsmeId, setSelectedMsmeId] = useState(msme?.id || plan?.msme || '');
  const [topic, setTopic] = useState(STANDARD_TOPICS[0]);
  const [customTopic, setCustomTopic] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => {
    // Default to tomorrow or next business day
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2); // skip Saturday
    if (d.getDay() === 0) d.setDate(d.getDate() + 1); // skip Sunday
    return d.toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState('10:30:00');
  const [duration, setDuration] = useState(45);
  const [meetingFormat, setMeetingFormat] = useState('google_meet');
  const [meetingLink, setMeetingLink] = useState('');
  const [agendaNotes, setAgendaNotes] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [requesterPhone, setRequesterPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [bookedResult, setBookedResult] = useState(null);

  // Sync state when dialog opens or props change
  useEffect(() => {
    if (open) {
      setBookedResult(null);
      if (msme?.id) setSelectedMsmeId(msme.id);
      else if (plan?.msme) setSelectedMsmeId(plan.msme);

      const name = currentUser?.name || currentUser?.full_name || currentUser?.first_name || currentUser?.username || '';
      const email = currentUser?.email || currentUser?.bge_profile?.email || '';
      const phone = currentUser?.phone || currentUser?.bge_profile?.phone || '';

      setRequesterName(name);
      setRequesterEmail(email);
      setRequesterPhone(phone);
    }
  }, [open, msme, plan, currentUser]);

  const activeMsme = msme || msmes.find((m) => m.id === Number(selectedMsmeId));

  const handleQuickDate = (daysAhead) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    setScheduledDate(d.toISOString().split('T')[0]);
  };

  const handleBook = async () => {
    if (!selectedMsmeId) {
      notify?.('Please select an MSME for the Enterprise Improvement Plan meeting.', 'warning');
      return;
    }
    if (!scheduledDate) {
      notify?.('Please select a proposed meeting date.', 'warning');
      return;
    }
    if (!startTime) {
      notify?.('Please select a proposed start time.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const finalTopic = topic === 'Other / Custom Advisory' && customTopic.trim() ? customTopic.trim() : topic;
      const payload = {
        msme: selectedMsmeId,
        plan: plan?.id || undefined,
        topic: finalTopic,
        scheduled_date: scheduledDate,
        start_time: startTime,
        duration_minutes: duration,
        meeting_format: meetingFormat,
        meeting_link: meetingLink.trim(),
        agenda_notes: agendaNotes.trim(),
        requester_name: requesterName.trim() || undefined,
        requester_email: requesterEmail.trim() || undefined,
        requester_phone: requesterPhone.trim() || undefined,
      };

      let res;
      if (plan?.id) {
        res = await axios.post(TBIP_PLAN_BOOK_MEETING_URL(plan.id), payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        res = await axios.post(TBIP_MEETINGS, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      setBookedResult(res.data);
      notify?.('Meeting request initiated! Email and calendar invites have been dispatched to Richard & Stephen.', 'success');
      onBooked?.(res.data);
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.message || 'Failed to request meeting. Please try again.';
      notify?.(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadIcs = async () => {
    if (!bookedResult?.id) return;
    try {
      const res = await axios.get(TBIP_MEETING_ICS_URL(bookedResult.id), {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/calendar' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `tbip_meeting_${bookedResult.msme_code || 'MSME'}_${bookedResult.scheduled_date}.ics`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      notify?.('Failed to download calendar invite.', 'error');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="md"
      fullWidth
      disableScrollLock
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          overflow: 'hidden',
          bgcolor: '#FAFBFD',
        },
      }}
    >
      {/* Brand Top Header Accent */}
      <Box sx={{ height: 5, background: `linear-gradient(90deg, ${BRAND.gopaGold} 0%, ${BRAND.gopaGold} 50%, ${BRAND.gizRed} 50%, ${BRAND.gizRed} 100%)` }} />

      <DialogTitle sx={{ p: 2.5, pb: 1.5, bgcolor: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <CalendarMonth sx={{ color: BRAND.gizRed, fontSize: 24 }} />
              <Typography variant="h6" fontWeight={800} sx={{ color: BRAND.primaryMain, fontSize: 18 }}>
                Book Enterprise Improvement Plan Meeting
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Schedule a dedicated coaching & review session with <strong>Richard Obuku</strong> & <strong>Stephen Maxi Opwonya</strong>
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} disabled={loading} sx={{ color: '#64748B' }}>
            <Close fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* If booking was successful, show rich success state with calendar links */}
        {bookedResult ? (
          <Box sx={{ py: 2 }}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 2.5,
                bgcolor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                textAlign: 'center',
                mb: 3,
              }}
            >
              <CheckCircle sx={{ color: '#059669', fontSize: 52, mb: 1.5 }} />
              <Typography variant="h6" fontWeight={800} color="#065F46" gutterBottom>
                Meeting Request & Calendar Invite Sent!
              </Typography>
              <Typography variant="body2" color="#047857" sx={{ maxWidth: 520, mx: 'auto', mb: 2 }}>
                An official email request with an attached RFC 5545 iCalendar invite has been sent to <strong>Richard Obuku</strong>, <strong>Stephen Maxi Opwonya</strong>, and your email address (<strong>{bookedResult.requester_email}</strong>).
              </Typography>

              <Divider sx={{ my: 2, borderColor: '#A7F3D0' }} />

              <Grid container spacing={2} sx={{ textAlign: 'left', mt: 0.5 }}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>TARGET MSME</Typography>
                  <Typography variant="body2" fontWeight={700} color={BRAND.primaryMain}>
                    {bookedResult.msme_name} ({bookedResult.msme_code})
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>DATE & TIME</Typography>
                  <Typography variant="body2" fontWeight={700} color={BRAND.primaryMain}>
                    📅 {bookedResult.scheduled_date} at {bookedResult.start_time} EAT ({bookedResult.duration_minutes} mins)
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>MEETING TOPIC</Typography>
                  <Typography variant="body2" fontWeight={600} color="#334155">
                    {bookedResult.topic}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>FORMAT</Typography>
                  <Typography variant="body2" fontWeight={600} color="#334155">
                    {bookedResult.meeting_format === 'google_meet' ? '🎥 Google Meet (Online)' : bookedResult.meeting_format}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>

            {/* Direct Calendar Actions */}
            <Typography variant="subtitle2" fontWeight={800} color={BRAND.primaryMain} sx={{ mb: 1.5 }}>
              Add to your Calendar:
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              {bookedResult.google_calendar_url && (
                <Button
                  variant="contained"
                  startIcon={<EventAvailable />}
                  href={bookedResult.google_calendar_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    bgcolor: '#2563EB',
                    '&:hover': { bgcolor: '#1D4ED8' },
                    fontWeight: 700,
                    textTransform: 'none',
                    borderRadius: 2,
                    flex: 1,
                    py: 1.2,
                  }}
                >
                  Add to Google Calendar
                </Button>
              )}
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={handleDownloadIcs}
                sx={{
                  borderColor: '#CBD5E1',
                  color: BRAND.primaryMain,
                  fontWeight: 700,
                  textTransform: 'none',
                  borderRadius: 2,
                  flex: 1,
                  py: 1.2,
                }}
              >
                Download .ics Calendar Invite
              </Button>
            </Stack>
          </Box>
        ) : (
          /* Booking Form */
          <Box sx={{ mt: 1 }}>
            {/* Coaches Showcase Card */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: '#F1F5F9',
                border: '1px solid #E2E8F0',
                mb: 3,
              }}
            >
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                Session Coaches & Endorsers
              </Typography>
              <Grid container spacing={2}>
                {COACHES.map((coach) => (
                  <Grid item xs={12} sm={6} key={coach.name}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ bgcolor: coach.color, width: 40, height: 40, fontSize: 14, fontWeight: 800 }}>
                        {coach.initials}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" fontWeight={800} color={BRAND.primaryMain} sx={{ lineHeight: 1.2 }}>
                          {coach.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11.5 }}>
                          {coach.role}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, color: '#64748B' }}>
                          ✉️ {coach.email}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Paper>

            {/* Target MSME Information */}
            <Box sx={{ mb: 2.5 }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, display: 'block' }}>
                1. Target Enterprise
              </Typography>
              {activeMsme ? (
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    px: 2,
                    borderRadius: 2,
                    border: '1px solid #CBD5E1',
                    bgcolor: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Business sx={{ color: BRAND.primaryMain }} />
                    <Box>
                      <Typography variant="subtitle2" fontWeight={800} color={BRAND.primaryMain}>
                        {activeMsme.business_name || activeMsme.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Code: {activeMsme.msme_code || '—'} · District: {activeMsme.district || '—'} · Sector: {activeMsme.sector || '—'}
                      </Typography>
                    </Box>
                  </Box>
                  <Chip label="Selected" size="small" color="primary" sx={{ fontWeight: 700 }} />
                </Paper>
              ) : (
                <FormControl fullWidth size="small">
                  <InputLabel id="select-msme-label">Choose Assigned MSME</InputLabel>
                  <Select
                    labelId="select-msme-label"
                    value={selectedMsmeId}
                    label="Choose Assigned MSME"
                    onChange={(e) => setSelectedMsmeId(e.target.value)}
                  >
                    {msmes.map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.business_name || m.name} ({m.msme_code || '—'})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>

            {/* Topic & Objectives */}
            <Box sx={{ mb: 2.5 }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, display: 'block' }}>
                2. Meeting Objective & Focus Area
              </Typography>
              <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                <InputLabel id="topic-label">Meeting Topic</InputLabel>
                <Select
                  labelId="topic-label"
                  value={topic}
                  label="Meeting Topic"
                  onChange={(e) => setTopic(e.target.value)}
                >
                  {STANDARD_TOPICS.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {topic === 'Other / Custom Advisory' && (
                <TextField
                  size="small"
                  fullWidth
                  label="Specific Meeting Subject"
                  placeholder="e.g. Environmental compliance roadmap guidance"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  sx={{ mb: 1.5 }}
                />
              )}

              <TextField
                fullWidth
                size="small"
                multiline
                rows={3}
                label="Specific Discussion Points & Questions for Richard & Stephen"
                placeholder="Mention any priority gaps identified, challenges with the 7-dimension assessment, or specific action formulation questions..."
                value={agendaNotes}
                onChange={(e) => setAgendaNotes(e.target.value)}
              />
            </Box>

            {/* Date, Time & Format */}
            <Box sx={{ mb: 2.5 }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, display: 'block' }}>
                3. Proposed Date, Time & Format
              </Typography>

              {/* Quick Date Shortcuts */}
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                <Chip label="Tomorrow" size="small" onClick={() => handleQuickDate(1)} clickable />
                <Chip label="In 2 Days" size="small" onClick={() => handleQuickDate(2)} clickable />
                <Chip label="Next Monday" size="small" onClick={() => handleQuickDate(5)} clickable />
                <Chip label="In 1 Week" size="small" onClick={() => handleQuickDate(7)} clickable />
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="Date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="start-time-label">Start Time</InputLabel>
                    <Select
                      labelId="start-time-label"
                      value={startTime}
                      label="Start Time"
                      onChange={(e) => setStartTime(e.target.value)}
                    >
                      {TIME_SLOTS.map((slot) => (
                        <MenuItem key={slot.value} value={slot.value}>
                          {slot.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="duration-label">Duration</InputLabel>
                    <Select
                      labelId="duration-label"
                      value={duration}
                      label="Duration"
                      onChange={(e) => setDuration(e.target.value)}
                    >
                      <MenuItem value={30}>30 minutes</MenuItem>
                      <MenuItem value={45}>45 minutes (Recommended)</MenuItem>
                      <MenuItem value={60}>60 minutes (1 Hour)</MenuItem>
                      <MenuItem value={90}>90 minutes</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="format-label">Meeting Format</InputLabel>
                    <Select
                      labelId="format-label"
                      value={meetingFormat}
                      label="Meeting Format"
                      onChange={(e) => setMeetingFormat(e.target.value)}
                    >
                      <MenuItem value="google_meet">🎥 Google Meet (Online Video Call)</MenuItem>
                      <MenuItem value="teams">💼 Microsoft Teams (Online Video Call)</MenuItem>
                      <MenuItem value="in_person">🏢 In-Person (Gulu / Lira Office or Field)</MenuItem>
                      <MenuItem value="phone">📞 Phone Call</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Meeting Link / Venue (Optional)"
                    placeholder="https://meet.google.com/... or Office venue"
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* Requester Contact Info */}
            <Box>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, display: 'block' }}>
                4. Your Contact Details (for Calendar & Email Confirmation)
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Your Name"
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    size="small"
                    type="email"
                    label="Your Email"
                    value={requesterEmail}
                    onChange={(e) => setRequesterEmail(e.target.value)}
                    helperText="Will receive calendar invite & confirmation"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Your Phone"
                    value={requesterPhone}
                    onChange={(e) => setRequesterPhone(e.target.value)}
                  />
                </Grid>
              </Grid>
            </Box>
          </Box>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2.5, justifyContent: 'space-between', bgcolor: '#F8FAFC' }}>
        <Button onClick={onClose} disabled={loading} sx={{ textTransform: 'none', color: '#64748B', fontWeight: 600 }}>
          {bookedResult ? 'Close' : 'Cancel'}
        </Button>

        {!bookedResult && (
          <Button
            variant="contained"
            onClick={handleBook}
            disabled={loading || !selectedMsmeId}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Send />}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              bgcolor: BRAND.gizRed,
              '&:hover': { bgcolor: BRAND.gizDarkRed },
              px: 3,
            }}
          >
            {loading ? 'Sending Request…' : 'Send Meeting Request & Calendar Invite'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
