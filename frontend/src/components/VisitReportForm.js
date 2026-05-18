/**
 * VisitReportForm — full-screen BGE visit report with template-driven sections.
 *
 * Usage:
 *   <VisitReportForm
 *     open={bool}
 *     onClose={() => {}}
 *     onSaved={() => {}}       // called after successful save
 *     msme={msmeObject}        // pre-selected MSME (or null)
 *     msmes={[]}               // all MSMEs for the BGE (for selector)
 *     token={string}
 *     bgeProfile={object}      // currentUser.bge_profile
 *     editingReport={null}     // if set, load existing report for editing
 *   />
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Grid, Typography, Button, TextField, FormControl,
  InputLabel, Select, MenuItem, Chip, Alert, CircularProgress,
  Divider, ToggleButton, ToggleButtonGroup, IconButton,
} from '@mui/material';
import {
  CheckCircle, Cancel, Close, Save, Send,
  TrendingUp, People, AccountBalance, Store, Settings, Star,
} from '@mui/icons-material';
import axios from 'axios';
import { API_ENDPOINTS } from '../config';

const h = (token) => ({ Authorization: `Bearer ${token}` });

const SECTIONS = [
  { key: 'narrative',     label: 'Visit Narrative',    icon: <Store />,         always: true },
  { key: 'financials',    label: 'Financials',          icon: <TrendingUp />,    templateFlag: 'include_financials' },
  { key: 'workforce',     label: 'Workforce',           icon: <People />,        templateFlag: 'include_workforce' },
  { key: 'compliance',    label: 'Compliance & Access', icon: <AccountBalance />,templateFlag: 'include_compliance' },
  { key: 'market',        label: 'Market Access',       icon: <Store />,         templateFlag: 'include_market' },
  { key: 'business_mgmt', label: 'Business Management', icon: <Settings />,      templateFlag: 'include_business_mgmt' },
  { key: 'rating',        label: 'Growth Rating',       icon: <Star />,          templateFlag: 'include_growth_rating' },
];

const VISIT_TYPES = [
  { value: 'initial',   label: 'Initial Assessment' },
  { value: 'followup',  label: 'Follow-up Visit' },
  { value: 'final',     label: 'Final Assessment' },
  { value: 'training',  label: 'Training Support' },
  { value: 'mentoring', label: 'Mentoring Session' },
];

const EMPTY_FORM = {
  msme: '', template: '', visit_type: 'followup',
  visit_date: new Date().toISOString().slice(0, 10),
  status: 'draft',
  // narrative
  business_overview: '', challenges_identified: '', support_provided: '',
  recommendations: '', action_plan: '', next_steps: '', additional_notes: '',
  key_achievement: '',
  // financials
  revenue_ugx: '', monthly_profit_ugx: '', total_assets_ugx: '',
  // workforce
  employees_ft_male: '', employees_ft_female: '',
  employees_pt_male: '', employees_pt_female: '',
  // compliance
  has_tin: '', has_unbs: '', has_business_bank: '', has_mobile_money: '', has_nssf: '',
  // market
  is_exporting: '', introduced_new_product: '', active_customers_count: '',
  markets_outside_district: '',
  // business mgmt
  has_business_plan: '', uses_digital_accounting: '', has_hr_policy: '', accepts_digital_payments: '',
  // rating
  growth_rating: '',
};

/** Three-state toggle: Yes / No / Unknown */
const YesNoToggle = ({ value, onChange, label }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>{label}</Typography>
    <ToggleButtonGroup size="small" exclusive value={value === '' ? null : value}
      onChange={(_, v) => onChange(v === null ? '' : v)}
      sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.5, fontSize: 12 } }}>
      <ToggleButton value="true"  sx={{ color: 'success.main', '&.Mui-selected': { bgcolor: 'success.light', color: '#fff' } }}>
        <CheckCircle sx={{ fontSize: 14, mr: 0.5 }} />Yes
      </ToggleButton>
      <ToggleButton value="false" sx={{ color: 'error.main', '&.Mui-selected': { bgcolor: 'error.light', color: '#fff' } }}>
        <Cancel sx={{ fontSize: 14, mr: 0.5 }} />No
      </ToggleButton>
    </ToggleButtonGroup>
  </Box>
);

/** Shows a baseline value vs new value side-by-side */
const BaselineCompare = ({ label, baseline, color = '#1565C0' }) => {
  if (baseline == null || baseline === '') return null;
  return (
    <Box sx={{ mt: 0.5, px: 1, py: 0.5, bgcolor: '#EEF2FF', borderRadius: 1, borderLeft: `3px solid ${color}` }}>
      <Typography variant="caption" color="text.secondary">Baseline: </Typography>
      <Typography variant="caption" fontWeight={700}>{String(baseline)}</Typography>
    </Box>
  );
};

export default function VisitReportForm({
  open, onClose, onSaved, msme: preselectedMsme, msmes = [],
  token, bgeProfile, editingReport = null,
}) {
  const [templates, setTemplates]   = useState([]);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [selectedMsme, setSelectedMsme] = useState(null);

  // Load templates once
  useEffect(() => {
    if (!open) return;
    axios.get(`${API_ENDPOINTS.VISIT_TEMPLATES}?active_only=1`, { headers: h(token) })
      .then(r => setTemplates(Array.isArray(r.data) ? r.data : r.data.results || []))
      .catch(() => {});
  }, [open, token]);

  // Populate form when editing or when msme is pre-selected
  useEffect(() => {
    if (!open) return;
    if (editingReport) {
      const f = { ...EMPTY_FORM };
      Object.keys(EMPTY_FORM).forEach(k => {
        if (editingReport[k] != null) f[k] = editingReport[k] === null ? '' : String(editingReport[k]);
      });
      f.msme     = editingReport.msme     || '';
      f.template = editingReport.template || '';
      setForm(f);
    } else {
      setForm({ ...EMPTY_FORM, msme: preselectedMsme?.id || '' });
    }
    setError('');
  }, [open, editingReport, preselectedMsme]);

  // Keep selectedMsme in sync with form.msme
  useEffect(() => {
    const m = msmes.find(x => x.id === Number(form.msme) || x.id === form.msme);
    setSelectedMsme(m || preselectedMsme || null);
  }, [form.msme, msmes, preselectedMsme]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const activeTemplate = templates.find(t => t.id === Number(form.template) || t.id === form.template);

  const visibleSections = SECTIONS.filter(s => {
    if (s.always) return true;
    if (!activeTemplate) return true; // show all if no template selected
    return activeTemplate[s.templateFlag];
  });

  const toBool = v => v === '' ? null : v === 'true' || v === true;
  const toNum  = v => v === '' || v == null ? null : Number(v);

  const buildPayload = (statusOverride) => ({
    msme:       form.msme,
    template:   form.template || null,
    visit_type: form.visit_type,
    visit_date: form.visit_date,
    status:     statusOverride || form.status,
    bge:        bgeProfile?.id || null,
    // narrative
    business_overview:     form.business_overview,
    challenges_identified: form.challenges_identified,
    support_provided:      form.support_provided,
    recommendations:       form.recommendations,
    action_plan:            form.action_plan,
    next_steps:             form.next_steps,
    additional_notes:       form.additional_notes,
    key_achievement:        form.key_achievement,
    // financials
    revenue_ugx:        toNum(form.revenue_ugx),
    monthly_profit_ugx: toNum(form.monthly_profit_ugx),
    total_assets_ugx:   toNum(form.total_assets_ugx),
    // workforce
    employees_ft_male:   toNum(form.employees_ft_male),
    employees_ft_female: toNum(form.employees_ft_female),
    employees_pt_male:   toNum(form.employees_pt_male),
    employees_pt_female: toNum(form.employees_pt_female),
    // compliance
    has_tin:           toBool(form.has_tin),
    has_unbs:          toBool(form.has_unbs),
    has_business_bank: toBool(form.has_business_bank),
    has_mobile_money:  toBool(form.has_mobile_money),
    has_nssf:          toBool(form.has_nssf),
    // market
    is_exporting:             toBool(form.is_exporting),
    introduced_new_product:   toBool(form.introduced_new_product),
    active_customers_count:   toNum(form.active_customers_count),
    markets_outside_district: toBool(form.markets_outside_district),
    // business mgmt
    has_business_plan:        toBool(form.has_business_plan),
    uses_digital_accounting:  toBool(form.uses_digital_accounting),
    has_hr_policy:            toBool(form.has_hr_policy),
    accepts_digital_payments: toBool(form.accepts_digital_payments),
    // rating
    growth_rating: toNum(form.growth_rating),
  });

  const save = async (submitNow = false) => {
    if (!form.msme || !form.visit_date) {
      setError('MSME and visit date are required.'); return;
    }
    setSaving(true); setError('');
    const payload = buildPayload(submitNow ? 'submitted' : undefined);
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

  const m = selectedMsme;
  const hasDiag = m && !!m.diag_imported_at;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
      PaperProps={{
        sx: {
          width: { xs: 'calc(100vw - 16px)', md: '100%' },
          height: { xs: '96dvh', md: '92vh' },
          m: { xs: 1, md: 4 },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}>

      {/* ── Header ── */}
      <DialogTitle sx={{ pb: 1, bgcolor: '#1A2F4B', color: '#fff' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography fontWeight={700} fontSize={17}>
              {editingReport ? 'Edit Visit Report' : 'New Visit Report'}
            </Typography>
            {m && <Typography variant="caption" sx={{ opacity: 0.8 }}>{m.business_name}</Typography>}
          </Box>
          <IconButton onClick={onClose} sx={{ color: '#fff' }}><Close /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <Grid
          container
          sx={{
            height: '100%',
            minHeight: 0,
            flexDirection: { xs: 'column', md: 'row' },
            flexWrap: 'nowrap',
          }}
        >

          {/* ── Left sidebar: metadata + baseline ── */}
          <Grid item xs={12} md={3.5}
            sx={{
              width: { xs: '100%', md: 'auto' },
              flexBasis: { xs: 'auto', md: '29.166667%' },
              maxWidth: { xs: '100%', md: '29.166667%' },
              flexShrink: 0,
              maxHeight: { xs: '38dvh', md: 'none' },
              borderRight: { xs: 0, md: '1px solid #E8EDF2' },
              borderBottom: { xs: '1px solid #E8EDF2', md: 0 },
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              p: { xs: 1.5, sm: 2 },
              bgcolor: '#F8F9FA',
              WebkitOverflowScrolling: 'touch',
              '&::-webkit-scrollbar': { width: 8 },
              '&::-webkit-scrollbar-thumb': { bgcolor: '#C8D2DD', borderRadius: 8 },
            }}>

            {/* MSME selector */}
            {!preselectedMsme && (
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>MSME *</InputLabel>
                <Select value={form.msme} label="MSME *" onChange={e => set('msme', e.target.value)}>
                  {msmes.map(x => <MenuItem key={x.id} value={x.id}>{x.business_name}</MenuItem>)}
                </Select>
              </FormControl>
            )}

            {/* Template selector */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Report Template</InputLabel>
              <Select value={form.template} label="Report Template"
                onChange={e => set('template', e.target.value)}>
                <MenuItem value=""><em>— No template (show all sections) —</em></MenuItem>
                {templates.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    <Box><Typography fontSize={13}>{t.name}</Typography>
                    {t.description && <Typography fontSize={11} color="text.secondary">{t.description}</Typography>}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Visit metadata */}
            <TextField fullWidth size="small" label="Visit Date *" type="date"
              InputLabelProps={{ shrink: true }} value={form.visit_date}
              onChange={e => set('visit_date', e.target.value)} sx={{ mb: 1.5 }} />
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Visit Type</InputLabel>
              <Select value={form.visit_type} label="Visit Type"
                onChange={e => set('visit_type', e.target.value)}>
                {VISIT_TYPES.map(v => <MenuItem key={v.value} value={v.value}>{v.label}</MenuItem>)}
              </Select>
            </FormControl>

            {/* Diagnostic baseline */}
            {hasDiag && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>
                  Diagnostic Baseline
                </Typography>
                <Box sx={{ mt: 1 }}>
                  {m.diag_annual_turnover && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" display="block">Revenue (band)</Typography>
                      <Typography fontSize={12} fontWeight={600}>{m.diag_annual_turnover}</Typography>
                    </Box>
                  )}
                  {(m.diag_employees_ft_male != null || m.diag_employees_ft_female != null) && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" display="block">Employees at baseline</Typography>
                      <Typography fontSize={12}>
                        FT: {m.diag_employees_ft_male ?? '—'}M / {m.diag_employees_ft_female ?? '—'}F &nbsp;
                        PT: {m.diag_employees_pt_male ?? '—'}M / {m.diag_employees_pt_female ?? '—'}F
                      </Typography>
                    </Box>
                  )}
                  <Box sx={{ mt: 1 }}>
                    {[
                      { key: 'diag_has_tin',           label: 'TIN' },
                      { key: 'diag_has_unbs',          label: 'UNBS' },
                      { key: 'diag_has_business_bank', label: 'Business Bank' },
                      { key: 'diag_has_mobile_money',  label: 'Mobile Money' },
                    ].map(({ key, label }) => (
                      <Chip key={key} size="small" label={label}
                        color={m[key] ? 'success' : 'default'} variant={m[key] ? 'filled' : 'outlined'}
                        sx={{ mr: 0.5, mb: 0.5, fontSize: 10 }} />
                    ))}
                  </Box>
                </Box>
              </>
            )}

            {/* Section list — informational, no click-to-switch */}
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>Sections in this report</Typography>
            <Box sx={{ mt: 0.5 }}>
              {visibleSections.map(s => (
                <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, mb: 0.25 }}>
                  {React.cloneElement(s.icon, { sx: { fontSize: 14, color: 'text.secondary' } })}
                  <Typography fontSize={11} color="text.secondary">{s.label}</Typography>
                </Box>
              ))}
            </Box>
          </Grid>

          {/* ── Main content panel ── */}
          <Grid item xs={12} md={8.5}
            sx={{
              flex: 1,
              minHeight: 0,
              maxWidth: { xs: '100%', md: '70.833333%' },
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              p: { xs: 2, sm: 3 },
            }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* NARRATIVE — always visible */}
            <Box sx={{ mb: 3 }}>
              <SectionHeading icon={<Store />} title="Visit Narrative" />
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={3} size="small"
                    label="Business Overview — current state of the business"
                    value={form.business_overview}
                    onChange={e => set('business_overview', e.target.value)} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={3} size="small"
                    label="Key Achievement since last visit"
                    value={form.key_achievement}
                    onChange={e => set('key_achievement', e.target.value)}
                    placeholder="What has the business accomplished since the last visit?" />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={3} size="small"
                    label="Challenges Identified"
                    value={form.challenges_identified}
                    onChange={e => set('challenges_identified', e.target.value)} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={3} size="small"
                    label="Support Provided during this visit"
                    value={form.support_provided}
                    onChange={e => set('support_provided', e.target.value)} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={2} size="small"
                    label="Recommendations"
                    value={form.recommendations}
                    onChange={e => set('recommendations', e.target.value)} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={2} size="small"
                    label="Agreed Action Plan"
                    value={form.action_plan}
                    onChange={e => set('action_plan', e.target.value)} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={2} size="small"
                    label="Next Steps"
                    value={form.next_steps}
                    onChange={e => set('next_steps', e.target.value)} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={2} size="small"
                    label="Additional Notes"
                    value={form.additional_notes}
                    onChange={e => set('additional_notes', e.target.value)} />
                </Grid>
              </Grid>
            </Box>

            {/* FINANCIALS */}
            {visibleSections.some(s => s.key === 'financials') && (
              <>
                <Divider sx={{ my: 3 }} />
                <Box sx={{ mb: 3 }}>
                  <SectionHeading icon={<TrendingUp />} title="Financial Metrics" />
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small" label="Annual Revenue / Turnover (UGX)"
                        type="number" inputProps={{ min: 0 }}
                        value={form.revenue_ugx}
                        onChange={e => set('revenue_ugx', e.target.value)}
                        helperText="Total sales last 12 months" />
                      {hasDiag && m.diag_annual_turnover &&
                        <BaselineCompare label="Baseline turnover" baseline={m.diag_annual_turnover} color="#1565C0" />}
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small" label="Average Monthly Profit (UGX)"
                        type="number" inputProps={{ min: 0 }}
                        value={form.monthly_profit_ugx}
                        onChange={e => set('monthly_profit_ugx', e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small" label="Total Assets (UGX)"
                        type="number" inputProps={{ min: 0 }}
                        value={form.total_assets_ugx}
                        onChange={e => set('total_assets_ugx', e.target.value)} />
                      {hasDiag && m.diag_total_assets &&
                        <BaselineCompare label="Baseline assets" baseline={m.diag_total_assets} color="#00695C" />}
                    </Grid>
                  </Grid>
                </Box>
              </>
            )}

            {/* WORKFORCE */}
            {visibleSections.some(s => s.key === 'workforce') && (
              <>
                <Divider sx={{ my: 3 }} />
                <Box sx={{ mb: 3 }}>
                  <SectionHeading icon={<People />} title="Workforce" />
                  {hasDiag && (m.diag_employees_ft_male != null || m.diag_employees_ft_female != null) && (
                    <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>
                      Baseline — FT: {m.diag_employees_ft_male ?? '—'}M / {m.diag_employees_ft_female ?? '—'}F &nbsp;|&nbsp;
                      PT: {m.diag_employees_pt_male ?? '—'}M / {m.diag_employees_pt_female ?? '—'}F
                    </Alert>
                  )}
                  <Typography variant="overline" color="text.secondary" fontSize={10}>Full-time Employees</Typography>
                  <Grid container spacing={2} sx={{ mb: 2, mt: 0 }}>
                    {[
                      { key: 'employees_ft_male',   label: 'Male' },
                      { key: 'employees_ft_female', label: 'Female' },
                    ].map(({ key, label }) => (
                      <Grid item xs={6} key={key}>
                        <TextField fullWidth size="small" label={label} type="number"
                          inputProps={{ min: 0 }}
                          value={form[key]} onChange={e => set(key, e.target.value)} />
                      </Grid>
                    ))}
                  </Grid>
                  <Typography variant="overline" color="text.secondary" fontSize={10}>Part-time Employees</Typography>
                  <Grid container spacing={2} sx={{ mt: 0 }}>
                    {[
                      { key: 'employees_pt_male',   label: 'Male' },
                      { key: 'employees_pt_female', label: 'Female' },
                    ].map(({ key, label }) => (
                      <Grid item xs={6} key={key}>
                        <TextField fullWidth size="small" label={label} type="number"
                          inputProps={{ min: 0 }}
                          value={form[key]} onChange={e => set(key, e.target.value)} />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </>
            )}

            {/* COMPLIANCE */}
            {visibleSections.some(s => s.key === 'compliance') && (
              <>
                <Divider sx={{ my: 3 }} />
                <Box sx={{ mb: 3 }}>
                  <SectionHeading icon={<AccountBalance />} title="Compliance & Financial Access" />
                  {hasDiag && (
                    <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>
                      Baseline compliance: &nbsp;
                      {[['TIN', m.diag_has_tin], ['UNBS', m.diag_has_unbs],
                        ['Bank', m.diag_has_business_bank], ['MoMo', m.diag_has_mobile_money]]
                        .map(([l, v]) => (
                          <Chip key={l} size="small" label={l}
                            color={v ? 'success' : 'default'} variant={v ? 'filled' : 'outlined'}
                            sx={{ mr: 0.5, fontSize: 10 }} />
                        ))}
                    </Alert>
                  )}
                  <Grid container spacing={3}>
                    {[
                      { key: 'has_tin',           label: 'Has TIN (Tax ID registered)' },
                      { key: 'has_unbs',          label: 'Registered with UNBS' },
                      { key: 'has_business_bank', label: 'Has Business Bank Account' },
                      { key: 'has_mobile_money',  label: 'Uses Mobile Money (business)' },
                      { key: 'has_nssf',          label: 'Making NSSF Contributions' },
                    ].map(({ key, label }) => (
                      <Grid item xs={12} sm={6} key={key}>
                        <YesNoToggle label={label} value={form[key]}
                          onChange={v => set(key, v)} />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </>
            )}

            {/* MARKET ACCESS */}
            {visibleSections.some(s => s.key === 'market') && (
              <>
                <Divider sx={{ my: 3 }} />
                <Box sx={{ mb: 3 }}>
                  <SectionHeading icon={<Store />} title="Market Access" />
                  <Grid container spacing={3}>
                    <Grid item xs={12} sm={6}>
                      <YesNoToggle label="Currently Exporting" value={form.is_exporting}
                        onChange={v => set('is_exporting', v)} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <YesNoToggle label="Introduced New Product / Service" value={form.introduced_new_product}
                        onChange={v => set('introduced_new_product', v)} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <YesNoToggle label="Accesses markets outside district of operation" value={form.markets_outside_district}
                        onChange={v => set('markets_outside_district', v)} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small" label="Number of Active Customers"
                        type="number" inputProps={{ min: 0 }}
                        value={form.active_customers_count}
                        onChange={e => set('active_customers_count', e.target.value)} />
                    </Grid>
                  </Grid>
                </Box>
              </>
            )}

            {/* BUSINESS MANAGEMENT */}
            {visibleSections.some(s => s.key === 'business_mgmt') && (
              <>
                <Divider sx={{ my: 3 }} />
                <Box sx={{ mb: 3 }}>
                  <SectionHeading icon={<Settings />} title="Business Management" />
                  <Grid container spacing={3}>
                    {[
                      { key: 'has_business_plan',        label: 'Has Written Business Plan' },
                      { key: 'uses_digital_accounting',  label: 'Uses Digital Accounting System' },
                      { key: 'has_hr_policy',            label: 'Has HR Policy / Manual' },
                      { key: 'accepts_digital_payments', label: 'Accepts Digital Payments' },
                    ].map(({ key, label }) => (
                      <Grid item xs={12} sm={6} key={key}>
                        <YesNoToggle label={label} value={form[key]}
                          onChange={v => set(key, v)} />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </>
            )}

            {/* GROWTH RATING */}
            {visibleSections.some(s => s.key === 'rating') && (
              <>
                <Divider sx={{ my: 3 }} />
                <Box sx={{ mb: 3 }}>
                  <SectionHeading icon={<Star />} title="Growth Rating" />
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Rate the business's overall growth trajectory since the last assessment.
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Box key={n} onClick={() => set('growth_rating', String(n))}
                        sx={{
                          width: 64, height: 64, display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', borderRadius: 2,
                          border: '2px solid',
                          borderColor: form.growth_rating === String(n) ? '#1A2F4B' : '#E8EDF2',
                          bgcolor: form.growth_rating === String(n) ? '#1A2F4B' : '#fff',
                          color:   form.growth_rating === String(n) ? '#fff' : 'inherit',
                          cursor: 'pointer', transition: 'all .15s',
                          '&:hover': { borderColor: '#1A2F4B' },
                        }}>
                        <Typography fontWeight={700} fontSize={22}>{n}</Typography>
                        <Typography fontSize={9} sx={{ opacity: 0.7 }}>
                          {['', 'No change', 'Slight', 'Moderate', 'Good', 'Excellent'][n]}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                  <TextField fullWidth multiline rows={3} size="small"
                    label="Justification for rating"
                    value={form.key_achievement}
                    onChange={e => set('key_achievement', e.target.value)}
                    placeholder="Describe the key achievement or reason for this growth rating" />
                </Box>
              </>
            )}
          </Grid>
        </Grid>
      </DialogContent>

      {/* ── Footer ── */}
      <DialogActions sx={{
        borderTop: '1px solid #E8EDF2',
        px: { xs: 1.5, sm: 3 },
        py: 1.5,
        gap: 1,
        flexWrap: 'wrap',
      }}>
        <Button onClick={onClose} disabled={saving} sx={{ order: { xs: 2, sm: 0 } }}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<Save />} disabled={saving}
          sx={{ flex: { xs: '1 1 140px', sm: '0 0 auto' } }}
          onClick={() => save(false)}>
          {saving ? <CircularProgress size={16} /> : 'Save Draft'}
        </Button>
        <Button variant="contained" startIcon={<Send />} disabled={saving}
          onClick={() => save(true)}
          sx={{ bgcolor: '#1A2F4B', flex: { xs: '1 1 150px', sm: '0 0 auto' } }}>
          {saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Submit Report'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SectionHeading({ icon, title }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
      {React.cloneElement(icon, { sx: { color: '#1A2F4B', fontSize: 20 } })}
      <Typography fontWeight={700} fontSize={16}>{title}</Typography>
    </Box>
  );
}
