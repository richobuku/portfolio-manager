import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, Chip, IconButton,
  Grid, Alert, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Select, MenuItem,
  FormControl, InputLabel, Checkbox, FormControlLabel,
} from '@mui/material';
import {
  Close, Save, Send, PictureAsPdf, Add, Delete,
  AutoAwesome,
} from '@mui/icons-material';
import axios from 'axios';
import { BRAND } from '../theme';
import {
  API_ENDPOINTS,
  FIAP_PDF_URL,
  FIAP_TEMPLATES_URL,
} from '../config';

export default function FinancialImprovementPlanDialog({
  open,
  onClose,
  msme,
  allMsmes = [],
  bge,
  plan,
  onSaved,
}) {
  const token = localStorage.getItem('access_token') || localStorage.getItem('token');

  // Templates from backend
  const [templates, setTemplates] = useState({
    categories: [],
    standard_gaps: [],
    standard_fsps: [],
    standard_facilities: [],
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Selected MSME
  const [selectedMsmeId, setSelectedMsmeId] = useState('');

  // Form State
  const [form, setForm] = useState({
    category: '1_financial_records',
    category_name: '',
    category_addresses: '',
    assessment_date: new Date().toISOString().slice(0, 10),
    gaps_identified: [],
    gap_notes: '',
    action_plan_steps: [],
    financing_target: 'Working Capital Loan',
    estimated_amount: '',
    preferred_fsp: 'Centenary Bank',
    current_fsp: '',
    has_active_loan: false,
    support_priority: 'High',
    data_source: 'Field Diagnostic & Mentorship',
    owner_committed: false,
    owner_name: '',
    bge_signed: false,
    bge_signature_name: '',
    status: 'draft',
  });

  // Fetch standard templates from API
  useEffect(() => {
    if (!open) return;
    const fetchTemplates = async () => {
      try {
        const res = await axios.get(FIAP_TEMPLATES_URL, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setTemplates(res.data);
      } catch {
        /* fallback to embedded if network delay */
      }
    };
    fetchTemplates();
  }, [open, token]);

  // Initialize or reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    setErrorMsg('');

    if (plan) {
      // Editing existing plan
      setSelectedMsmeId(plan.msme || plan.msme_id);
      setForm({
        category: plan.category || '1_financial_records',
        category_name: plan.category_name || '',
        category_addresses: plan.category_addresses || '',
        assessment_date: plan.assessment_date || new Date().toISOString().slice(0, 10),
        gaps_identified: Array.isArray(plan.gaps_identified) ? plan.gaps_identified : [],
        gap_notes: plan.gap_notes || '',
        action_plan_steps: Array.isArray(plan.action_plan_steps) ? plan.action_plan_steps : [],
        financing_target: plan.financing_target || 'Working Capital Loan',
        estimated_amount: plan.estimated_amount || '',
        preferred_fsp: plan.preferred_fsp || 'Centenary Bank',
        current_fsp: plan.current_fsp || '',
        has_active_loan: Boolean(plan.has_active_loan),
        support_priority: plan.support_priority || 'Medium',
        data_source: plan.data_source || 'Field Diagnostic & Mentorship',
        owner_committed: Boolean(plan.owner_committed),
        owner_name: plan.owner_name || plan.msme_owner_name || '',
        bge_signed: Boolean(plan.bge_signed),
        bge_signature_name: plan.bge_signature_name || (bge?.name || ''),
        status: plan.status || 'draft',
      });
    } else {
      // New Plan
      const initialMsme = msme || (allMsmes.length > 0 ? allMsmes[0] : null);
      setSelectedMsmeId(initialMsme ? initialMsme.id : '');
      
      // Default to Category 1
      loadCategoryDefaults('1_financial_records', initialMsme);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan, msme]);

  const activeMsme = msme || allMsmes.find(m => m.id === selectedMsmeId);

  // Load defaults for a category
  const loadCategoryDefaults = (catId, currentMsme = activeMsme) => {
    const cat = (templates.categories || []).find(c => c.id === catId);
    if (!cat) {
      setForm(prev => ({ ...prev, category: catId }));
      return;
    }

    setForm(prev => ({
      ...prev,
      category: cat.id,
      category_name: cat.name,
      category_addresses: cat.what_it_addresses,
      support_priority: cat.default_priority || prev.support_priority,
      gaps_identified: cat.typical_gaps ? [...cat.typical_gaps] : prev.gaps_identified,
      action_plan_steps: cat.default_steps ? cat.default_steps.map(s => ({ ...s })) : prev.action_plan_steps,
      owner_name: currentMsme?.owner_name || prev.owner_name,
      bge_signature_name: bge?.name || prev.bge_signature_name,
    }));
  };

  const handleCategoryChange = (e) => {
    const newCatId = e.target.value;
    loadCategoryDefaults(newCatId, activeMsme);
  };

  const toggleGap = (gapText) => {
    setForm(prev => {
      const exists = prev.gaps_identified.includes(gapText);
      const nextGaps = exists
        ? prev.gaps_identified.filter(g => g !== gapText)
        : [...prev.gaps_identified, gapText];
      
      // Auto-adjust priority recommendation
      let autoPriority = prev.support_priority;
      if (nextGaps.length >= 5 || nextGaps.includes('No financial records kept') || nextGaps.includes('Business is not formally registered')) {
        autoPriority = 'High';
      } else if (nextGaps.length >= 2) {
        autoPriority = 'Medium';
      } else if (nextGaps.length <= 1) {
        autoPriority = 'Low';
      }

      return {
        ...prev,
        gaps_identified: nextGaps,
        support_priority: autoPriority,
      };
    });
  };

  const handleStepChange = (index, field, value) => {
    setForm(prev => {
      const updated = [...prev.action_plan_steps];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, action_plan_steps: updated };
    });
  };

  const addStep = () => {
    setForm(prev => ({
      ...prev,
      action_plan_steps: [
        ...prev.action_plan_steps,
        {
          step: prev.action_plan_steps.length + 1,
          action: '',
          timeline: 'Months 1-3',
          responsible: 'Owner & BGE',
          verification: 'Verified by BGE',
        },
      ],
    }));
  };

  const removeStep = (index) => {
    setForm(prev => ({
      ...prev,
      action_plan_steps: prev.action_plan_steps
        .filter((_, idx) => idx !== index)
        .map((s, idx) => ({ ...s, step: idx + 1 })),
    }));
  };

  const handleSave = async (submitNow = false) => {
    if (!selectedMsmeId) {
      setErrorMsg('Please select a target MSME.');
      return;
    }
    setErrorMsg('');
    setSaving(true);

    const payload = {
      ...form,
      msme: selectedMsmeId,
      status: submitNow ? 'submitted' : (form.status || 'draft'),
      submitted_at: submitNow ? new Date().toISOString() : null,
    };

    try {
      let savedResult;
      const headers = { Authorization: `Bearer ${token}` };
      if (plan?.id) {
        const res = await axios.patch(
          `${API_ENDPOINTS.FINANCIAL_IMPROVEMENT_PLANS}${plan.id}/`,
          payload,
          { headers }
        );
        savedResult = res.data;
      } else {
        const res = await axios.post(
          API_ENDPOINTS.FINANCIAL_IMPROVEMENT_PLANS,
          payload,
          { headers }
        );
        savedResult = res.data;
      }

      if (onSaved) onSaved(savedResult);
      onClose();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to save Financial Improvement Action Plan.');
    } finally {
      setSaving(false);
    }
  };

  const openPdf = (planId) => {
    if (!planId) return;
    window.open(FIAP_PDF_URL(planId), '_blank');
  };

  const priorityColors = {
    High: { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B' },
    Medium: { bg: '#FFFBEB', border: '#D97706', text: '#92400E' },
    Low: { bg: '#F0FDF4', border: '#16A34A', text: '#166534' },
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" fontWeight={700}>
              {plan ? 'Edit Financial Improvement Action Plan' : 'New Financial Improvement Action Plan'}
            </Typography>
            <Chip
              label={form.status === 'submitted' ? 'Submitted' : 'Draft'}
              size="small"
              color={form.status === 'submitted' ? 'success' : 'warning'}
              sx={{ fontWeight: 700, fontSize: 11 }}
            />
            <Chip
              label={`${form.support_priority} Priority`}
              size="small"
              sx={{
                bgcolor: priorityColors[form.support_priority]?.bg,
                color: priorityColors[form.support_priority]?.text,
                border: `1px solid ${priorityColors[form.support_priority]?.border}`,
                fontWeight: 700,
                fontSize: 11,
              }}
            />
          </Box>
          <Typography variant="caption" display="block" color="text.secondary">
            PRUDEV II Access to Finance & Credit Readiness Roadmap (FIAP)
            {activeMsme ? ` · ${activeMsme.business_name} (${activeMsme.sector || 'MSME'})` : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {plan?.id && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<PictureAsPdf />}
              onClick={() => openPdf(plan.id)}
              sx={{ fontSize: 12 }}
            >
              Download PDF
            </Button>
          )}
          <IconButton size="small" onClick={onClose}><Close fontSize="small" /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

        {/* ── MSME Selection & Assessment Metadata ── */}
        <Box sx={{ p: 2, bgcolor: '#F8FAFC', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={700} color={BRAND.primaryMain} sx={{ mb: 1.5 }}>
            ENTERPRISE & DIAGNOSTIC METADATA
          </Typography>
          <Grid container spacing={2}>
            {!msme && allMsmes.length > 0 && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Select Target MSME *</InputLabel>
                  <Select
                    value={selectedMsmeId}
                    label="Select Target MSME *"
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedMsmeId(id);
                      const target = allMsmes.find(m => m.id === id);
                      if (target) {
                        setForm(prev => ({
                          ...prev,
                          owner_name: target.owner_name || prev.owner_name,
                        }));
                      }
                    }}
                  >
                    {allMsmes.map(m => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.business_name || m.name} ({m.district || '—'}) {m.owner_name ? `· ${m.owner_name}` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12} sm={msme ? 6 : 6}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Diagnostic Assessment Date *"
                InputLabelProps={{ shrink: true }}
                value={form.assessment_date}
                onChange={e => setForm(prev => ({ ...prev, assessment_date: e.target.value }))}
              />
            </Grid>
            {activeMsme && (
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', p: 1.5, bgcolor: '#fff', borderRadius: 1, border: '1px solid #E2E8F0' }}>
                  <Typography variant="caption"><strong>Enterprise:</strong> {activeMsme.business_name}</Typography>
                  <Typography variant="caption"><strong>Sector:</strong> {activeMsme.sector || '—'}</Typography>
                  <Typography variant="caption"><strong>Owner:</strong> {activeMsme.owner_name || '—'} ({activeMsme.contact_phone || '—'})</Typography>
                  <Typography variant="caption"><strong>District:</strong> {activeMsme.district || '—'}</Typography>
                  <Typography variant="caption"><strong>Assigned BGE:</strong> {bge?.name || activeMsme.assigned_bge_name || '—'}</Typography>
                </Box>
              </Grid>
            )}
          </Grid>
        </Box>

        {/* ── Section 1: Primary Action Plan Category ── */}
        <Box sx={{ p: 2, bgcolor: '#EFF6FF', borderRadius: 2, border: '1px solid #BFDBFE' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} color="#1D4ED8">
                1. PRIMARY ACTION PLAN CATEGORY (Most Binding Barrier to Finance)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Rule: Each MSME is placed in ONE primary category addressing its single most restrictive obstacle to finance.
              </Typography>
            </Box>
            <Chip
              label="Standard PRUDEV II Category"
              size="small"
              sx={{ bgcolor: '#DBEAFE', color: '#1E40AF', fontWeight: 600, fontSize: 11 }}
            />
          </Box>

          <FormControl fullWidth size="small" sx={{ mb: 1.5, mt: 1, bgcolor: '#fff' }}>
            <InputLabel>Primary Action Plan Category *</InputLabel>
            <Select
              value={form.category}
              label="Primary Action Plan Category *"
              onChange={handleCategoryChange}
            >
              {(templates.categories || []).map(cat => (
                <MenuItem key={cat.id} value={cat.id}>
                  <strong>{cat.number}. {cat.name}</strong>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Category Description Banner */}
          <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 1, border: '1px solid #93C5FD' }}>
            <Typography variant="caption" color="#1E40AF" fontWeight={700} display="block">
              WHAT THIS CATEGORY ADDRESSES:
            </Typography>
            <Typography variant="body2" color="#1E293B" sx={{ mt: 0.3 }}>
              {form.category_addresses || 'Select a category to view diagnostic focus.'}
            </Typography>
          </Box>
        </Box>

        {/* ── Section 2: Diagnostic Gaps Identified ── */}
        <Box sx={{ p: 2, bgcolor: '#F8FAFC', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} color={BRAND.primaryMain}>
                2. DIAGNOSTIC GAPS IDENTIFIED ({form.gaps_identified.length} Gaps Checked)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Check all specific barriers observed during enterprise diagnostic coaching.
              </Typography>
            </Box>
            <Button
              size="small"
              startIcon={<AutoAwesome />}
              onClick={() => {
                const cat = (templates.categories || []).find(c => c.id === form.category);
                if (cat?.typical_gaps) {
                  setForm(prev => ({ ...prev, gaps_identified: [...cat.typical_gaps] }));
                }
              }}
              sx={{ fontSize: 11 }}
            >
              Reset Category Gaps
            </Button>
          </Box>

          <Grid container spacing={1}>
            {(templates.standard_gaps || []).map((gapText, idx) => {
              const isChecked = form.gaps_identified.includes(gapText);
              return (
                <Grid item xs={12} sm={6} key={idx}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={isChecked}
                        onChange={() => toggleGap(gapText)}
                      />
                    }
                    label={<Typography variant="body2" fontSize={13}>{gapText}</Typography>}
                  />
                </Grid>
              );
            })}
          </Grid>

          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            label="Specific Diagnostic Notes & Enterprise Constraints"
            placeholder="Document specific machinery gaps, power issues, market opportunities, or credit history notes…"
            value={form.gap_notes}
            onChange={e => setForm(prev => ({ ...prev, gap_notes: e.target.value }))}
            sx={{ mt: 2, bgcolor: '#fff' }}
          />
        </Box>

        {/* ── Section 3: Sequenced Phased Action Plan (Roadmap) ── */}
        <Box sx={{ p: 2, bgcolor: '#FFFBEB', borderRadius: 2, border: '1px solid #FDE68A' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} color="#B45309">
                3. SEQUENCED FINANCIAL IMPROVEMENT ACTION PLAN (The Phased Roadmap)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Concrete, measurable milestones with realistic implementation timeframes.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<AutoAwesome />}
                onClick={() => {
                  const cat = (templates.categories || []).find(c => c.id === form.category);
                  if (cat?.default_steps) {
                    setForm(prev => ({
                      ...prev,
                      action_plan_steps: cat.default_steps.map(s => ({ ...s })),
                    }));
                  }
                }}
                sx={{ fontSize: 11, color: '#B45309' }}
              >
                Reset Steps
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Add />}
                onClick={addStep}
                sx={{ fontSize: 11, borderColor: '#D97706', color: '#D97706' }}
              >
                Add Step
              </Button>
            </Box>
          </Box>

          <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: '#fff' }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#FEF3C7' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 45, fontSize: 12 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Action Plan Description</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 140, fontSize: 12 }}>Timeline</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 140, fontSize: 12 }}>Responsible</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 160, fontSize: 12 }}>Verification Evidence</TableCell>
                  <TableCell sx={{ width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {form.action_plan_steps.map((s, idx) => (
                  <TableRow key={idx} hover>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>{idx + 1}</TableCell>
                    <TableCell>
                      <TextField
                        fullWidth
                        multiline
                        size="small"
                        value={s.action}
                        onChange={e => handleStepChange(idx, 'action', e.target.value)}
                        placeholder="Action description…"
                        InputProps={{ style: { fontSize: 13 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        fullWidth
                        size="small"
                        value={s.timeline}
                        onChange={e => handleStepChange(idx, 'timeline', e.target.value)}
                        placeholder="e.g. Months 1-3"
                        InputProps={{ style: { fontSize: 12 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        fullWidth
                        size="small"
                        value={s.responsible}
                        onChange={e => handleStepChange(idx, 'responsible', e.target.value)}
                        placeholder="e.g. Owner & BGE"
                        InputProps={{ style: { fontSize: 12 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        fullWidth
                        size="small"
                        value={s.verification}
                        onChange={e => handleStepChange(idx, 'verification', e.target.value)}
                        placeholder="e.g. Cashbook log"
                        InputProps={{ style: { fontSize: 12 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => removeStep(idx)} color="error">
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* ── Section 4: Financing Target & Institutional Linkage ── */}
        <Box sx={{ p: 2, bgcolor: '#F0FDF4', borderRadius: 2, border: '1px solid #BBF7D0' }}>
          <Typography variant="subtitle2" fontWeight={700} color="#166534" sx={{ mb: 1.5 }}>
            4. FINANCING TARGET & INSTITUTIONAL LINKAGE
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Target Credit Facility *</InputLabel>
                <Select
                  value={form.financing_target}
                  label="Target Credit Facility *"
                  onChange={e => setForm(prev => ({ ...prev, financing_target: e.target.value }))}
                >
                  {(templates.standard_facilities || []).map((fac, idx) => (
                    <MenuItem key={idx} value={fac}>{fac}</MenuItem>
                  ))}
                  <MenuItem value="Other / Custom">Other / Custom</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Estimated Target Size (UGX)"
                placeholder="e.g. UGX 15,000,000"
                value={form.estimated_amount}
                onChange={e => setForm(prev => ({ ...prev, estimated_amount: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Preferred FSP *</InputLabel>
                <Select
                  value={form.preferred_fsp}
                  label="Preferred FSP *"
                  onChange={e => setForm(prev => ({ ...prev, preferred_fsp: e.target.value }))}
                >
                  {(templates.standard_fsps || []).map((fsp, idx) => (
                    <MenuItem key={idx} value={fsp}>{fsp}</MenuItem>
                  ))}
                  <MenuItem value="Other FSP / SACCO">Other FSP / SACCO</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="Current FSP / SACCO in Use"
                placeholder="e.g. Centenary Bank / Mobile Money"
                value={form.current_fsp}
                onChange={e => setForm(prev => ({ ...prev, current_fsp: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Support Priority Level *</InputLabel>
                <Select
                  value={form.support_priority}
                  label="Support Priority Level *"
                  onChange={e => setForm(prev => ({ ...prev, support_priority: e.target.value }))}
                >
                  <MenuItem value="High">High (Severe / multiple gaps)</MenuItem>
                  <MenuItem value="Medium">Medium (Moderate gaps)</MenuItem>
                  <MenuItem value="Low">Low (Close to finance-ready)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.has_active_loan}
                    onChange={e => setForm(prev => ({ ...prev, has_active_loan: e.target.checked }))}
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2">
                    <strong>Enterprise has an active running loan</strong> (Repayment performance protection and avoiding arrears are required)
                  </Typography>
                }
              />
            </Grid>
          </Grid>
        </Box>

        {/* ── Section 5: Commitments & Sign-off ── */}
        <Box sx={{ p: 2, bgcolor: '#FAF5FF', borderRadius: 2, border: '1px solid #E9D5FF' }}>
          <Typography variant="subtitle2" fontWeight={700} color="#7E22CE" sx={{ mb: 1.5 }}>
            5. COMMITMENTS & VERIFICATION SIGN-OFF
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 1, border: '1px solid #E2E8F0' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.owner_committed}
                      onChange={e => setForm(prev => ({ ...prev, owner_committed: e.target.checked }))}
                    />
                  }
                  label={
                    <Typography variant="body2" fontWeight={600}>
                      Enterprise Owner Commitment
                    </Typography>
                  }
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  "I commit to implementing the operational changes and record-keeping discipline specified in this plan."
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  label="Owner / Representative Name"
                  value={form.owner_name}
                  onChange={e => setForm(prev => ({ ...prev, owner_name: e.target.value }))}
                />
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 1, border: '1px solid #E2E8F0' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.bge_signed}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        bge_signed: e.target.checked,
                        bge_signed_at: e.target.checked ? new Date().toISOString().slice(0, 10) : null,
                      }))}
                    />
                  }
                  label={
                    <Typography variant="body2" fontWeight={600}>
                      BGE Mentor Verification Sign-off
                    </Typography>
                  }
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  "I certify that I conducted this diagnostic, co-designed this roadmap, and will verify progress."
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  label="BGE Mentor Name"
                  value={form.bge_signature_name}
                  onChange={e => setForm(prev => ({ ...prev, bge_signature_name: e.target.value }))}
                />
              </Box>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        {plan?.id && (
          <Button
            variant="outlined"
            startIcon={<PictureAsPdf />}
            onClick={() => openPdf(plan.id)}
            disabled={saving}
          >
            Download PDF
          </Button>
        )}
        <Button
          variant="outlined"
          startIcon={<Save />}
          onClick={() => handleSave(false)}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Draft'}
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<Send />}
          onClick={() => handleSave(true)}
          disabled={saving}
        >
          {saving ? 'Submitting…' : 'Submit Action Plan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
