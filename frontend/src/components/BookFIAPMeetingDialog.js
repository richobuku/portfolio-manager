import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, IconButton,
  Grid, Divider, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Avatar, Paper, Stack, RadioGroup,
  FormControlLabel, Radio,
} from '@mui/material';
import {
  Close, Send, CheckCircle,
  CalendarMonth, AccountBalance,
} from '@mui/icons-material';
import axios from 'axios';
import {
  FIAP_MEETINGS,
  FIAP_BOOK_MEETING_URL,
} from '../config';

const REVIEWERS = [
  {
    id: 'rosemary',
    name: 'Rosemary Laker',
    role: 'Access to Finance Specialist / Programme Manager',
    email: 'rosemary.laker@gopa.eu',
    initials: 'RL',
    color: '#1E3A8A',
  },
  {
    id: 'harriet',
    name: 'Harriet Daisy Amule',
    role: 'Access to Finance Specialist / Programme Manager',
    email: 'harrietdaisy.amule@gopa.eu',
    initials: 'HA',
    color: '#0D9488',
  },
];

const STANDARD_TOPICS = [
  'Financial Action Plan Review & Credit Readiness Approval (Standard)',
  'Diagnostic Gap Analysis & Binding Barrier Verification',
  'Bank / SACCO Linkage & Loan Application Endorsement',
  'Cash-Flow & Financial Records Strengthening Guidance',
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

export default function BookFIAPMeetingDialog({
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
  const [reviewerTarget, setReviewerTarget] = useState('both');
  const [topic, setTopic] = useState(STANDARD_TOPICS[0]);
  const [customTopic, setCustomTopic] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
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

      const targetMsme = msme || msmes.find(m => m.id === (plan?.msme || selectedMsmeId));
      const mName = targetMsme?.business_name || targetMsme?.name || 'Assigned MSME';
      const catName = plan?.category_name || (plan?.category ? `Category ${plan.category}` : 'Access to Finance Diagnostic');
      const gapsCount = (plan?.gaps_identified || []).length;
      const targetFsp = plan?.preferred_fsp ? ` · FSP: ${plan.preferred_fsp}` : '';
      const amount = plan?.estimated_amount ? ` · Target UGX: ${plan.estimated_amount}` : '';

      setAgendaNotes(
        `Action Plan Approval Request for ${mName}.\n` +
        `• Primary Category: ${catName}\n` +
        `• Gaps Identified: ${gapsCount} binding barrier(s)\n` +
        `• Target Facility: ${plan?.financing_target || 'Credit Readiness'}${amount}${targetFsp}\n\n` +
        `Dear Rosemary and Harriet, please review our diagnostic findings and phased roadmap for approval.`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan, msme, msmes, currentUser]);

  const activeMsme = msme || msmes.find(m => m.id === selectedMsmeId) || (plan?.msme ? { id: plan.msme, business_name: plan.msme_name } : null);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!selectedMsmeId && !plan?.msme) {
      if (notify) notify('Please select an MSME.', 'error');
      return;
    }
    if (!scheduledDate || !startTime) {
      if (notify) notify('Please select date and start time.', 'error');
      return;
    }

    setLoading(true);
    const authToken = token || sessionStorage.getItem('token') || localStorage.getItem('token') || localStorage.getItem('access_token');
    const finalTopic = topic === 'Other / Custom Advisory' && customTopic.trim() ? customTopic.trim() : topic;

    const payload = {
      msme: selectedMsmeId || plan?.msme,
      plan: plan?.id || undefined,
      reviewer_target: reviewerTarget,
      topic: finalTopic,
      scheduled_date: scheduledDate,
      start_time: startTime,
      duration_minutes: duration,
      meeting_format: meetingFormat,
      meeting_link: meetingLink.trim(),
      agenda_notes: agendaNotes.trim(),
      requester_name: requesterName.trim(),
      requester_email: requesterEmail.trim(),
      requester_phone: requesterPhone.trim(),
    };

    try {
      let res;
      if (plan?.id) {
        res = await axios.post(FIAP_BOOK_MEETING_URL(plan.id), payload, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
      } else {
        res = await axios.post(FIAP_MEETINGS, payload, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
      }

      setBookedResult(res.data);
      if (notify) {
        notify(res.data.invite_status_message || 'Financial Action Plan approval meeting request sent successfully!', 'success');
      }
      if (onBooked) {
        onBooked(res.data);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to submit meeting request.';
      if (notify) notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const buildGoogleCalendarUrl = () => {
    if (!bookedResult) return '#';
    const mName = activeMsme?.business_name || activeMsme?.name || 'MSME';
    const revStr = reviewerTarget === 'both' ? 'Rosemary & Harriet' : (reviewerTarget === 'rosemary' ? 'Rosemary Laker' : 'Harriet Daisy Amule');
    const title = encodeURIComponent(`PRUDEV II · Financial Action Plan Approval: ${mName} with ${revStr}`);
    const details = encodeURIComponent(
      `Financial Improvement Action Plan Approval Session\n\nMSME: ${mName}\nRequested by: ${requesterName} (${requesterEmail})\n\nNotes: ${agendaNotes}`
    );
    const sDateClean = scheduledDate.replace(/-/g, '');
    const sTimeClean = startTime.replace(/:/g, '');
    const dates = `${sDateClean}T${sTimeClean}/${sDateClean}T${sTimeClean}`;
    const addParam = encodeURIComponent(
      reviewerTarget === 'both'
        ? 'rosemary.laker@gopa.eu,harrietdaisy.amule@gopa.eu,richard.obuku@gopa.eu'
        : reviewerTarget === 'rosemary'
        ? 'rosemary.laker@gopa.eu,richard.obuku@gopa.eu'
        : 'harrietdaisy.amule@gopa.eu,richard.obuku@gopa.eu'
    );
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&add=${addParam}&location=${encodeURIComponent(meetingLink || 'Google Meet')}`;
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="md" fullWidth disableScrollLock>
      <DialogTitle sx={{
        bgcolor: '#1E3A8A',
        color: '#FFFFFF',
        py: 2,
        px: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AccountBalance sx={{ fontSize: 26, color: '#93C5FD' }} />
          <Box>
            <Typography variant="h6" fontWeight={800} fontSize={17} lineHeight={1.2}>
              Request Approval Meeting from Rosemary or Harriet
            </Typography>
            <Typography variant="caption" sx={{ color: '#BFDBFE', fontSize: 11.5 }}>
              PRUDEV II / GOPA Pro · Access to Finance & Credit Readiness Approval
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} disabled={loading} sx={{ color: '#FFFFFF', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 }, bgcolor: '#F8FAFC' }}>
        {bookedResult ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Avatar sx={{ width: 64, height: 64, bgcolor: '#ECFDF5', color: '#059669', mx: 'auto', mb: 2 }}>
              <CheckCircle sx={{ fontSize: 40 }} />
            </Avatar>
            <Typography variant="h6" fontWeight={800} color="#0F172A" sx={{ mb: 1 }}>
              Meeting Request & Calendar Invite Sent!
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520, mx: 'auto', mb: 3 }}>
              {bookedResult.invite_status_message ||
                `An official email with an attached iCalendar (.ics) invite has been sent to ${
                  reviewerTarget === 'both' ? 'Rosemary Laker and Harriet Daisy Amule' : (reviewerTarget === 'rosemary' ? 'Rosemary Laker' : 'Harriet Daisy Amule')
                }. The Financial Improvement Action Plan has been set to Submitted for review.`}
            </Typography>

            <Paper elevation={0} sx={{ p: 2.5, maxWidth: 520, mx: 'auto', bgcolor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 2, textAlign: 'left', mb: 3 }}>
              <Typography variant="caption" fontWeight={700} color="#64748B" textTransform="uppercase" letterSpacing={0.5}>
                Meeting Details Summary
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Grid container spacing={1} sx={{ fontSize: 13 }}>
                <Grid item xs={4} sx={{ color: '#64748B', fontWeight: 600 }}>MSME:</Grid>
                <Grid item xs={8} sx={{ fontWeight: 700, color: '#1E3A8A' }}>
                  {activeMsme?.business_name || `MSME #${bookedResult.msme}`}
                </Grid>
                <Grid item xs={4} sx={{ color: '#64748B', fontWeight: 600 }}>Reviewer(s):</Grid>
                <Grid item xs={8} sx={{ fontWeight: 700, color: '#0F172A' }}>
                  {bookedResult.reviewer_target_display || (reviewerTarget === 'both' ? 'Rosemary & Harriet' : reviewerTarget)}
                </Grid>
                <Grid item xs={4} sx={{ color: '#64748B', fontWeight: 600 }}>Date & Time:</Grid>
                <Grid item xs={8} sx={{ fontWeight: 600, color: '#0F172A' }}>
                  {bookedResult.scheduled_date} at {bookedResult.start_time?.slice(0, 5)} EAT ({bookedResult.duration_minutes} min)
                </Grid>
                <Grid item xs={4} sx={{ color: '#64748B', fontWeight: 600 }}>Format:</Grid>
                <Grid item xs={8} sx={{ fontWeight: 600, color: '#0F172A', textTransform: 'capitalize' }}>
                  {(bookedResult.meeting_format || '').replace('_', ' ')}
                </Grid>
              </Grid>
            </Paper>

            <Stack direction="row" spacing={1.5} justifyContent="center">
              <Button
                variant="contained"
                startIcon={<CalendarMonth />}
                href={buildGoogleCalendarUrl()}
                target="_blank"
                rel="noreferrer"
                sx={{ bgcolor: '#1E3A8A', '&:hover': { bgcolor: '#172554' }, fontWeight: 700 }}
              >
                Add to Google Calendar
              </Button>
              <Button
                variant="outlined"
                onClick={onClose}
                sx={{ borderColor: '#CBD5E1', color: '#334155', fontWeight: 700 }}
              >
                Close Window
              </Button>
            </Stack>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleSubmit}>
            {/* Reviewers Banner */}
            <Paper elevation={0} sx={{ p: 2, mb: 2.5, bgcolor: '#FFFFFF', border: '1px solid #BFDBFE', borderRadius: 2 }}>
              <Typography variant="caption" fontWeight={800} color="#1E3A8A" textTransform="uppercase" letterSpacing={0.5} sx={{ display: 'block', mb: 1 }}>
                Select Programme Reviewer for Financial Plan Approval
              </Typography>
              <RadioGroup
                row
                value={reviewerTarget}
                onChange={(e) => setReviewerTarget(e.target.value)}
                sx={{ mb: 1.5 }}
              >
                <FormControlLabel
                  value="both"
                  control={<Radio size="small" sx={{ color: '#1E3A8A', '&.Mui-checked': { color: '#1E3A8A' } }} />}
                  label={<Typography fontSize={13} fontWeight={700} color="#1E3A8A">Both Rosemary & Harriet (Recommended)</Typography>}
                />
                <FormControlLabel
                  value="rosemary"
                  control={<Radio size="small" sx={{ color: '#1E3A8A', '&.Mui-checked': { color: '#1E3A8A' } }} />}
                  label={<Typography fontSize={13} fontWeight={600}>Rosemary Laker</Typography>}
                />
                <FormControlLabel
                  value="harriet"
                  control={<Radio size="small" sx={{ color: '#1E3A8A', '&.Mui-checked': { color: '#1E3A8A' } }} />}
                  label={<Typography fontSize={13} fontWeight={600}>Harriet Daisy Amule</Typography>}
                />
              </RadioGroup>

              <Grid container spacing={1.5}>
                {REVIEWERS.map((rev) => {
                  const isTargeted = reviewerTarget === 'both' || reviewerTarget === rev.id;
                  return (
                    <Grid item xs={12} sm={6} key={rev.id}>
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        p: 1.25,
                        borderRadius: 1.5,
                        bgcolor: isTargeted ? '#EFF6FF' : '#F8FAFC',
                        border: '1px solid',
                        borderColor: isTargeted ? '#93C5FD' : '#E2E8F0',
                        opacity: isTargeted ? 1 : 0.6,
                      }}>
                        <Avatar sx={{ bgcolor: rev.color, width: 36, height: 36, fontSize: 13, fontWeight: 800 }}>
                          {rev.initials}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography fontSize={13} fontWeight={700} color="#0F172A">
                            {rev.name}
                          </Typography>
                          <Typography fontSize={11} color="text.secondary" noWrap>
                            {rev.role}
                          </Typography>
                          <Typography fontSize={11} color="#1E3A8A" fontWeight={600} noWrap>
                            {rev.email}
                          </Typography>
                        </Box>
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </Paper>

            {/* Target Enterprise & Plan */}
            <Paper elevation={0} sx={{ p: 2, mb: 2.5, bgcolor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Enterprise Under Review</InputLabel>
                    <Select
                      value={selectedMsmeId}
                      label="Enterprise Under Review"
                      onChange={(e) => setSelectedMsmeId(e.target.value)}
                      disabled={!!plan?.msme || msmes.length === 0}
                    >
                      {msmes.map((m) => (
                        <MenuItem key={m.id} value={m.id}>
                          {m.business_name || m.name} ({m.msme_code || `ID: ${m.id}`})
                        </MenuItem>
                      ))}
                      {msmes.length === 0 && activeMsme && (
                        <MenuItem value={activeMsme.id}>
                          {activeMsme.business_name || activeMsme.name}
                        </MenuItem>
                      )}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: '#F8FAFC', border: '1px dashed #CBD5E1' }}>
                    <Typography fontSize={11} color="text.secondary" fontWeight={600}>
                      CREDIT READINESS CONTEXT
                    </Typography>
                    <Typography fontSize={12} fontWeight={700} color="#1E3A8A" noWrap>
                      {plan?.category_name || 'Category 1: Financial Records & Documentation'}
                    </Typography>
                    <Typography fontSize={11} color="text.secondary">
                      {plan?.financing_target || 'Target facility'} {plan?.estimated_amount ? `· UGX ${plan.estimated_amount}` : ''}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Paper>

            {/* Schedule & Format */}
            <Paper elevation={0} sx={{ p: 2, mb: 2.5, bgcolor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 2 }}>
              <Typography variant="caption" fontWeight={800} color="#64748B" textTransform="uppercase" letterSpacing={0.5} sx={{ display: 'block', mb: 1.5 }}>
                Proposed Session Schedule & Format
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="Meeting Date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Start Time (EAT)</InputLabel>
                    <Select
                      value={startTime}
                      label="Start Time (EAT)"
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
                    <InputLabel>Duration</InputLabel>
                    <Select
                      value={duration}
                      label="Duration"
                      onChange={(e) => setDuration(Number(e.target.value))}
                    >
                      <MenuItem value={30}>30 Minutes</MenuItem>
                      <MenuItem value={45}>45 Minutes (Standard)</MenuItem>
                      <MenuItem value={60}>60 Minutes (In-Depth)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Meeting Format</InputLabel>
                    <Select
                      value={meetingFormat}
                      label="Meeting Format"
                      onChange={(e) => setMeetingFormat(e.target.value)}
                    >
                      <MenuItem value="google_meet">Google Meet (Online Video Call)</MenuItem>
                      <MenuItem value="teams">Microsoft Teams (Online Video Call)</MenuItem>
                      <MenuItem value="in_person">In-Person (PRUDEV II / GOPA Office)</MenuItem>
                      <MenuItem value="phone">Phone Call (+256)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Online Link or Venue (Optional)"
                    placeholder="https://meet.google.com/... or PRUDEV II Lira Office"
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* Agenda & Notes */}
            <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Primary Topic</InputLabel>
                    <Select
                      value={topic}
                      label="Primary Topic"
                      onChange={(e) => setTopic(e.target.value)}
                    >
                      {STANDARD_TOPICS.map((t) => (
                        <MenuItem key={t} value={t}>{t}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                {topic === 'Other / Custom Advisory' && (
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Custom Meeting Topic"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      required
                    />
                  </Grid>
                )}
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    label="Meeting Notes & Diagnostic Discussion Points"
                    value={agendaNotes}
                    onChange={(e) => setAgendaNotes(e.target.value)}
                    helperText="Pre-filled with MSME profile, primary barrier, and credit targets."
                  />
                </Grid>
              </Grid>
            </Paper>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2.5, bgcolor: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
        {bookedResult ? (
          <Button onClick={onClose} variant="contained" sx={{ bgcolor: '#1E3A8A', '&:hover': { bgcolor: '#172554' } }}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={loading} sx={{ color: '#64748B', fontWeight: 600 }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Send />}
              sx={{
                bgcolor: '#1E3A8A',
                '&:hover': { bgcolor: '#172554' },
                fontWeight: 700,
                px: 3,
              }}
            >
              {loading ? 'Sending Request…' : 'Send Meeting Request & Email'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
