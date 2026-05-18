import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Grid, Typography, Button, TextField, FormControl,
  InputLabel, Select, MenuItem, Chip, Alert, CircularProgress,
  Divider, IconButton,
} from '@mui/material';
import {
  Close, Save, Send, Person, School, Psychology,
  Flag, EventNote, Build, EmojiEvents, ArrowForward,
} from '@mui/icons-material';
import axios from 'axios';
import { API_ENDPOINTS } from '../config';

const h = (token) => ({ Authorization: `Bearer ${token}` });

/* ── Visit type definitions ─────────────────────────────────────────────── */
const VISIT_TYPES = [
  {
    value: 'one_on_one',
    label: 'One-on-One Visit',
    icon: <Person />,
    desc: 'Direct visit to one MSME',
    color: '#1A2F4B',
  },
  {
    value: 'training',
    label: 'Training Visit',
    icon: <School />,
    desc: 'Group or individual training session',
    color: '#2E7D32',
  },
  {
    value: 'coaching',
    label: 'Business Coaching',
    icon: <Psychology />,
    desc: 'Structured coaching session',
    color: '#7B1FA2',
  },
];

/* ── Per-type field labels ───────────────────────────────────────────────── */
const TYPE_CONFIG = {
  one_on_one: {
    context_label:    'Business Situation Observed',
    context_hint:     'What is the current state of the business? What did you observe, hear, or assess during the visit?',
    delivered_label:  'Support Delivered',
    delivered_hint:   'What support, advice or assistance did you provide to the business owner during this visit?',
    outcomes_label:   'Key Observations & Outcomes',
    outcomes_hint:    'What progress, concerns or findings did you note? What changed compared to the last visit?',
    msme_label:       'MSME Agreed Actions',
    msme_hint:        'What did the business owner commit to doing before the next visit?',
    bge_label:        'BGE Follow-up Actions',
    bge_hint:         'What will you do as the BGE to support this MSME before the next visit?',
    tools_label:      'Tools & Materials Provided',
    show_participants: false,
    show_delivery:     false,
    show_focus:        false,
  },
  training: {
    context_label:    'Topics Covered',
    context_hint:     'What training topics, modules or content were covered in this session?',
    delivered_label:  'How the Training Was Delivered',
    delivered_hint:   'Describe the session flow — methods used, activities, group exercises, demonstrations.',
    outcomes_label:   'Participant Engagement & Takeaways',
    outcomes_hint:    'How did participants engage? What were the key learning outcomes or takeaways from the session?',
    msme_label:       'Assignments / Tasks Given',
    msme_hint:        'What tasks, homework or commitments did participants take away from this training?',
    bge_label:        'Next Session Plan',
    bge_hint:         'What will the next training session cover? Any preparation required?',
    tools_label:      'Training Materials & Handouts',
    show_participants: true,
    show_delivery:     true,
    show_focus:        false,
  },
  coaching: {
    context_label:    'What Was Discussed',
    context_hint:     'What challenges, opportunities or business topics did you discuss with the owner?',
    delivered_label:  'Coaching Delivered',
    delivered_hint:   'What coaching, frameworks, analysis or structured guidance did you apply during this session?',
    outcomes_label:   "Owner's Insights & Progress",
    outcomes_hint:    'What did the business owner realise, learn or achieve during this session? What shifted?',
    msme_label:       'Owner Commitments',
    msme_hint:        'What specific actions did the business owner commit to completing before the next coaching session?',
    bge_label:        'BGE Follow-up',
    bge_hint:         'What coaching preparation, research or follow-up will you carry out before the next session?',
    tools_label:      'Tools & Frameworks Used',
    show_participants: false,
    show_delivery:     false,
    show_focus:        true,
  },
};

const DEFAULT_CONFIG = TYPE_CONFIG.one_on_one;

const DELIVERY_METHODS = [
  'Lecture / Presentation',
  'Workshop / Group Activity',
  'Practical Demonstration',
  'Peer Discussion',
  'One-on-one within group',
  'Mixed methods',
];

const COACHING_FOCUS_AREAS = [
  'Financial Management',
  'Marketing & Sales',
  'Business Operations',
  'Human Resources',
  'Business Strategy & Planning',
  'Digital Tools & Technology',
  'Record Keeping',
  'Customer Service',
  'Supply Chain & Procurement',
  'Compliance & Registration',
  'Other',
];

const TOOLS_OPTIONS = [
  'Business plan template',
  'Financial tracking spreadsheet',
  'Budget / cash flow tool',
  'Marketing materials / flyer template',
  'Training manual / handout',
  'Business registration guidance',
  'Mobile money setup support',
  'Digital tools demonstration',
  'Referral / recommendation letter',
  'Diagnostic / assessment tool',
  'Sales tracking sheet',
  'HR policy template',
  'Calculator / costing tool',
];

/* Tools are stored as comma-separated string in the model */
const parseTools = (str) =>
  str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];

const serializeTools = (arr) => arr.join(', ');

/* ── Empty form ─────────────────────────────────────────────────────────── */
const EMPTY_FORM = {
  msme:                '',
  visit_type:          'one_on_one',
  visit_date:          new Date().toISOString().slice(0, 10),
  status:              'draft',
  // structured sections
  visit_objectives:    '',
  business_overview:   '',
  delivery_method:     '',
  participant_count:   '',
  coaching_focus_area: '',
  support_provided:    '',
  tools_provided:      '',   // comma-separated
  key_achievement:     '',
  challenges_identified: '',
  action_plan:         '',
  recommendations:     '',
  next_steps:          '',
  additional_notes:    '',
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function SectionBlock({ icon, title, color = '#1A2F4B', children }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box sx={{
          width: 32, height: 32, borderRadius: 1, bgcolor: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {React.cloneElement(icon, { sx: { fontSize: 16, color: '#fff' } })}
        </Box>
        <Typography fontWeight={700} fontSize={14}>{title}</Typography>
      </Box>
      {children}
    </Box>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function VisitReportForm({
  open, onClose, onSaved, msme: preselectedMsme, msmes = [],
  token, bgeProfile, editingReport = null,
}) {
  const [form, setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [selectedTools, setSelectedTools] = useState([]);
  const [toolsOther, setToolsOther]       = useState('');

  /* Populate on open */
  useEffect(() => {
    if (!open) return;
    if (editingReport) {
      const f = { ...EMPTY_FORM };
      Object.keys(EMPTY_FORM).forEach(k => {
        if (editingReport[k] != null) f[k] = String(editingReport[k]);
      });
      f.msme       = editingReport.msme       || '';
      f.visit_type = editingReport.visit_type || 'one_on_one';
      const parsed = parseTools(editingReport.tools_provided || '');
      const knownSelected = parsed.filter(t => TOOLS_OPTIONS.includes(t));
      const otherText = parsed.filter(t => !TOOLS_OPTIONS.includes(t)).join(', ');
      setSelectedTools(knownSelected);
      setToolsOther(otherText);
      setForm(f);
    } else {
      setForm({ ...EMPTY_FORM, msme: preselectedMsme?.id || '' });
      setSelectedTools([]);
      setToolsOther('');
    }
    setError('');
  }, [open, editingReport, preselectedMsme]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const toggleTool = (tool) =>
    setSelectedTools(prev =>
      prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]
    );

  const cfg = TYPE_CONFIG[form.visit_type] || DEFAULT_CONFIG;
  const typeInfo = VISIT_TYPES.find(t => t.value === form.visit_type) || VISIT_TYPES[0];
  const selectedMsme = msmes.find(x => x.id === Number(form.msme) || x.id === form.msme)
    || preselectedMsme || null;

  const save = async (submitNow = false) => {
    if (!form.msme || !form.visit_date) {
      setError('MSME and visit date are required.'); return;
    }
    setSaving(true); setError('');

    const allTools = [
      ...selectedTools,
      ...toolsOther.split(',').map(s => s.trim()).filter(Boolean),
    ];

    const payload = {
      msme:                Number(form.msme),
      bge:                 bgeProfile?.id || null,
      visit_type:          form.visit_type,
      visit_date:          form.visit_date,
      status:              submitNow ? 'submitted' : 'draft',
      visit_objectives:    form.visit_objectives,
      business_overview:   form.business_overview,
      delivery_method:     form.delivery_method,
      participant_count:   form.participant_count !== '' ? Number(form.participant_count) : null,
      coaching_focus_area: form.coaching_focus_area,
      support_provided:    form.support_provided,
      tools_provided:      serializeTools(allTools),
      key_achievement:     form.key_achievement,
      challenges_identified: form.challenges_identified,
      action_plan:         form.action_plan,
      recommendations:     form.recommendations,
      next_steps:          form.next_steps,
      additional_notes:    form.additional_notes,
    };

    try {
      if (editingReport) {
        await axios.patch(`${API_ENDPOINTS.REPORTS}${editingReport.id}/`, payload, { headers: h(token) });
      } else {
        await axios.post(API_ENDPOINTS.REPORTS, payload, { headers: h(token) });
      }
      onSaved?.();
      onClose();
    } catch (e) {
      const data = e.response?.data;
      setError(typeof data === 'object' ? JSON.stringify(data) : String(data || 'Save failed.'));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
      PaperProps={{
        sx: {
          width:  { xs: 'calc(100vw - 16px)', md: '100%' },
          height: { xs: '96dvh', md: '92vh' },
          m: { xs: 1, md: 4 },
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        },
      }}>

      {/* Header */}
      <DialogTitle sx={{ pb: 1, bgcolor: typeInfo.color, color: '#fff' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography fontWeight={700} fontSize={17}>
              {editingReport ? 'Edit Visit Report' : 'New Visit Report'}
            </Typography>
            {selectedMsme && (
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {selectedMsme.business_name}
              </Typography>
            )}
          </Box>
          <IconButton onClick={onClose} sx={{ color: '#fff' }}><Close /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <Box sx={{
          height: '100%', minHeight: 0, display: 'flex',
          flexDirection: { xs: 'column', md: 'row' }, flexWrap: 'nowrap', width: '100%',
        }}>

          {/* ── Left sidebar ── */}
          <Box sx={{
            width: { xs: '100%', md: 280 },
            flexShrink: 0,
            maxHeight: { xs: '42dvh', md: 'none' },
            borderRight: { xs: 0, md: '1px solid #E8EDF2' },
            borderBottom: { xs: '1px solid #E8EDF2', md: 0 },
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            p: { xs: 1.5, sm: 2 },
            bgcolor: '#F8F9FA',
          }}>

            {/* MSME selector */}
            {!preselectedMsme && (
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>MSME *</InputLabel>
                <Select value={form.msme} label="MSME *"
                  onChange={e => set('msme', e.target.value)}>
                  {msmes.map(x => (
                    <MenuItem key={x.id} value={x.id}>{x.business_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Date */}
            <TextField fullWidth size="small" label="Visit Date *" type="date"
              InputLabelProps={{ shrink: true }} value={form.visit_date}
              onChange={e => set('visit_date', e.target.value)} sx={{ mb: 2 }} />

            {/* Visit type selector — 3 cards */}
            <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}
              display="block" sx={{ mb: 1 }}>
              Visit Type
            </Typography>
            {VISIT_TYPES.map(t => (
              <Box key={t.value}
                onClick={() => set('visit_type', t.value)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  p: 1.25, borderRadius: 1.5, cursor: 'pointer', mb: 0.75,
                  border: '2px solid',
                  borderColor: form.visit_type === t.value ? t.color : '#E8EDF2',
                  bgcolor:     form.visit_type === t.value ? `${t.color}12` : '#fff',
                  transition: 'all .12s',
                }}>
                <Box sx={{
                  width: 32, height: 32, borderRadius: 1, flexShrink: 0,
                  bgcolor: form.visit_type === t.value ? t.color : '#E8EDF2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {React.cloneElement(t.icon, {
                    sx: { fontSize: 16, color: form.visit_type === t.value ? '#fff' : '#90A4AE' },
                  })}
                </Box>
                <Box>
                  <Typography fontSize={12} fontWeight={form.visit_type === t.value ? 700 : 500}
                    color={form.visit_type === t.value ? t.color : 'text.primary'}>
                    {t.label}
                  </Typography>
                  <Typography fontSize={10} color="text.secondary">{t.desc}</Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* ── Main content panel ── */}
          <Box sx={{
            flex: 1, minHeight: 0, minWidth: 0,
            overflowY: 'auto', overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            p: { xs: 2, sm: 3 },
          }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* ── 1. OBJECTIVES ── */}
            <SectionBlock icon={<Flag />} title="Objectives of This Visit" color={typeInfo.color}>
              <TextField fullWidth multiline rows={3} size="small"
                label="What did you aim to achieve in this visit?"
                placeholder={`e.g. ${form.visit_type === 'training'
                  ? 'Introduce financial record-keeping to participants and demonstrate the tracking spreadsheet.'
                  : form.visit_type === 'coaching'
                  ? 'Help the owner build a 3-month sales action plan and address pricing challenges.'
                  : 'Assess current business status, resolve challenges identified in the previous visit.'}`}
                value={form.visit_objectives}
                onChange={e => set('visit_objectives', e.target.value)} />
            </SectionBlock>

            <Divider sx={{ my: 3 }} />

            {/* ── 2. CONTEXT (label changes per type) ── */}
            <SectionBlock icon={<EventNote />} title={cfg.context_label} color={typeInfo.color}>
              <Grid container spacing={2}>
                {/* Training-specific: delivery method + participants */}
                {cfg.show_delivery && (
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Delivery Method</InputLabel>
                      <Select value={form.delivery_method} label="Delivery Method"
                        onChange={e => set('delivery_method', e.target.value)}>
                        {DELIVERY_METHODS.map(m => (
                          <MenuItem key={m} value={m}>{m}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                )}
                {cfg.show_participants && (
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth size="small" label="Number of Participants"
                      type="number" inputProps={{ min: 0 }}
                      value={form.participant_count}
                      onChange={e => set('participant_count', e.target.value)} />
                  </Grid>
                )}
                {/* Coaching-specific: focus area */}
                {cfg.show_focus && (
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Coaching Focus Area</InputLabel>
                      <Select value={form.coaching_focus_area} label="Coaching Focus Area"
                        onChange={e => set('coaching_focus_area', e.target.value)}>
                        {COACHING_FOCUS_AREAS.map(a => (
                          <MenuItem key={a} value={a}>{a}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={4} size="small"
                    label={cfg.context_label}
                    placeholder={cfg.context_hint}
                    value={form.business_overview}
                    onChange={e => set('business_overview', e.target.value)} />
                </Grid>
              </Grid>
            </SectionBlock>

            <Divider sx={{ my: 3 }} />

            {/* ── 3. DELIVERED & TOOLS ── */}
            <SectionBlock icon={<Build />} title="What Was Delivered & Tools Used" color={typeInfo.color}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={4} size="small"
                    label={cfg.delivered_label}
                    placeholder={cfg.delivered_hint}
                    value={form.support_provided}
                    onChange={e => set('support_provided', e.target.value)} />
                </Grid>

                {/* Tools multi-select */}
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}
                    display="block" sx={{ mb: 1 }}>
                    {cfg.tools_label} — select all that apply
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
                    {TOOLS_OPTIONS.map(tool => {
                      const checked = selectedTools.includes(tool);
                      return (
                        <Chip key={tool} label={tool} size="small" clickable
                          variant={checked ? 'filled' : 'outlined'}
                          color={checked ? 'primary' : 'default'}
                          onClick={() => toggleTool(tool)}
                          sx={{ fontSize: 11 }} />
                      );
                    })}
                  </Box>
                  <TextField fullWidth size="small"
                    label="Other tools or materials (free text)"
                    placeholder="e.g. Custom pricing calculator, loan application template…"
                    value={toolsOther}
                    onChange={e => setToolsOther(e.target.value)} />
                </Grid>
              </Grid>
            </SectionBlock>

            <Divider sx={{ my: 3 }} />

            {/* ── 4. OUTCOMES ── */}
            <SectionBlock icon={<EmojiEvents />} title={cfg.outcomes_label} color={typeInfo.color}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={3} size="small"
                    label={cfg.outcomes_label}
                    placeholder={cfg.outcomes_hint}
                    value={form.key_achievement}
                    onChange={e => set('key_achievement', e.target.value)} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={2} size="small"
                    label="Challenges Encountered"
                    placeholder="Any difficulties faced — by the MSME, during the session, or in delivery."
                    value={form.challenges_identified}
                    onChange={e => set('challenges_identified', e.target.value)} />
                </Grid>
              </Grid>
            </SectionBlock>

            <Divider sx={{ my: 3 }} />

            {/* ── 5. NEXT STEPS ── */}
            <SectionBlock icon={<ArrowForward />} title="Next Steps" color={typeInfo.color}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth multiline rows={3} size="small"
                    label={cfg.msme_label}
                    placeholder={cfg.msme_hint}
                    value={form.action_plan}
                    onChange={e => set('action_plan', e.target.value)} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth multiline rows={3} size="small"
                    label={cfg.bge_label}
                    placeholder={cfg.bge_hint}
                    value={form.recommendations}
                    onChange={e => set('recommendations', e.target.value)} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={2} size="small"
                    label="Additional Notes"
                    value={form.additional_notes}
                    onChange={e => set('additional_notes', e.target.value)} />
                </Grid>
              </Grid>
            </SectionBlock>
          </Box>
        </Box>
      </DialogContent>

      {/* Footer */}
      <DialogActions sx={{
        borderTop: '1px solid #E8EDF2',
        px: { xs: 1.5, sm: 3 }, py: 1.5, gap: 1, flexWrap: 'wrap',
      }}>
        <Button onClick={onClose} disabled={saving} sx={{ order: { xs: 2, sm: 0 } }}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<Save />} disabled={saving}
          sx={{ flex: { xs: '1 1 140px', sm: '0 0 auto' } }}
          onClick={() => save(false)}>
          {saving ? <CircularProgress size={16} /> : 'Save Draft'}
        </Button>
        <Button variant="contained" startIcon={<Send />} disabled={saving}
          onClick={() => save(true)}
          sx={{ bgcolor: typeInfo.color, flex: { xs: '1 1 150px', sm: '0 0 auto' } }}>
          {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Submit Report'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
