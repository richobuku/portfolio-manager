import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, Chip, IconButton,
  Grid, Alert, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Select, MenuItem,
  FormControl, InputLabel, Checkbox, FormControlLabel,
  Tooltip, Divider,
} from '@mui/material';
import {
  Close, Save, Send, PictureAsPdf, Add, Delete,
  AutoAwesome, PlaylistAdd, Visibility, EventAvailable, CheckCircle,
} from '@mui/icons-material';
import axios from 'axios';
import { BRAND } from '../theme';
import {
  API_ENDPOINTS,
  FIAP_PDF_URL,
  FIAP_TEMPLATES_URL,
  FIAP_APPROVE_URL,
} from '../config';
import BookFIAPMeetingDialog from './BookFIAPMeetingDialog';
import {
  FIAP_CATEGORIES,
  STANDARD_GAPS,
  STANDARD_FSPS,
  STANDARD_FACILITIES,
  STANDARD_ROADMAP_STEPS,
} from '../fiap_constants';


export default function FinancialImprovementPlanDialog({
  open,
  onClose,
  msme,
  allMsmes = [],
  bge,
  plan,
  onSaved,
  token: propToken,
  currentUser,
  notify,
}) {
  const token =
    propToken ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('access_token');

  const isViewer = currentUser?.role === 'viewer';
  const isReadOnly = isViewer;

  // Templates initialized directly from official template constants — guaranteed never blank
  const [templates, setTemplates] = useState({
    categories: FIAP_CATEGORIES,
    standard_gaps: STANDARD_GAPS,
    standard_fsps: STANDARD_FSPS,
    standard_facilities: STANDARD_FACILITIES,
    standard_steps: STANDARD_ROADMAP_STEPS,
  });

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Selected MSME
  const [selectedMsmeId, setSelectedMsmeId] = useState('');

  // Quick Roadmap Step Selector
  const [stepPickerVal, setStepPickerVal] = useState('');

  // Form State
  const [form, setForm] = useState({
    category: '1_financial_records',
    category_name: 'Financial Records & Documentation Strengthening',
    category_addresses: FIAP_CATEGORIES[0].what_it_addresses,
    category_key_indicators: FIAP_CATEGORIES[0].key_indicators,
    assessment_date: new Date().toISOString().slice(0, 10),
    gaps_identified: [...FIAP_CATEGORIES[0].typical_gaps],
    gap_notes: '',
    action_plan_steps: FIAP_CATEGORIES[0].default_steps.map((s) => ({ ...s })),
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
    bge_signed_at: null,
    bge_signature_name: '',
    status: 'draft',
    approved_by: null,
    approved_by_name: '',
    approved_at: null,
    approval_notes: '',
  });

  const [bookMeetingOpen, setBookMeetingOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');

  const canApprove =
    Boolean(plan?.id) &&
    (currentUser?.is_staff ||
      currentUser?.is_superuser ||
      currentUser?.role === 'admin' ||
      currentUser?.role === 'programme_manager' ||
      currentUser?.username?.includes('rosemary') ||
      currentUser?.username?.includes('harriet') ||
      currentUser?.email?.includes('rosemary') ||
      currentUser?.email?.includes('harriet'));

  const handleApprove = async () => {
    if (!plan?.id) return;
    setApproving(true);
    try {
      const authToken = token || sessionStorage.getItem('token') || localStorage.getItem('token');
      const res = await axios.post(
        FIAP_APPROVE_URL(plan.id),
        { approval_notes: approvalNotes || form.approval_notes || '' },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setForm((prev) => ({
        ...prev,
        status: 'approved',
        approved_by: res.data.approved_by,
        approved_by_name: res.data.approved_by_name,
        approved_at: res.data.approved_at,
        approval_notes: res.data.approval_notes,
      }));
      if (notify) notify(`Financial Action Plan approved by ${res.data.approved_by_name}.`, 'success');
      if (onSaved) onSaved(res.data);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to approve plan.';
      setErrorMsg(msg);
      if (notify) notify(msg, 'error');
    } finally {
      setApproving(false);
    }
  };


  // Fetch updated standard templates from API if available (non-blocking)
  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    const fetchTemplates = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get(FIAP_TEMPLATES_URL, { headers });
        if (isMounted && res.data && Array.isArray(res.data.categories) && res.data.categories.length > 0) {
          setTemplates((prev) => ({
            ...prev,
            categories: res.data.categories,
            standard_gaps: res.data.standard_gaps || prev.standard_gaps,
            standard_fsps: res.data.standard_fsps || prev.standard_fsps,
            standard_facilities: res.data.standard_facilities || prev.standard_facilities,
            standard_steps: res.data.standard_steps || prev.standard_steps,
          }));
        }
      } catch {
        // Fallback already pre-seeded from FIAP_CATEGORIES
      }
    };
    fetchTemplates();
    return () => { isMounted = false; };
  }, [open, token]);

  const activeMsme = msme || allMsmes.find((m) => m.id === selectedMsmeId);

  // Load defaults for a category
  const loadCategoryDefaults = (catId, currentMsme = activeMsme) => {
    const cat = (templates.categories || FIAP_CATEGORIES).find((c) => c.id === catId);
    if (!cat) {
      setForm((prev) => ({ ...prev, category: catId }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      category: cat.id,
      category_name: cat.name,
      category_addresses: cat.what_it_addresses,
      category_key_indicators: cat.key_indicators || '',
      support_priority: cat.default_priority || prev.support_priority,
      gaps_identified: cat.typical_gaps ? [...cat.typical_gaps] : prev.gaps_identified,
      action_plan_steps: cat.default_steps ? cat.default_steps.map((s) => ({ ...s })) : prev.action_plan_steps,
      owner_name: currentMsme?.owner_name || prev.owner_name,
      bge_signature_name: bge?.name || prev.bge_signature_name,
    }));
  };

  // Initialize or reset form when dialog opens or plan changes
  useEffect(() => {
    if (!open) return;
    setErrorMsg('');

    if (plan) {
      // Editing / viewing existing plan
      setSelectedMsmeId(plan.msme || plan.msme_id);
      const catMeta = (templates.categories || FIAP_CATEGORIES).find(
        (c) => c.id === plan.category
      );

      setForm({
        category: plan.category || '1_financial_records',
        category_name: plan.category_name || catMeta?.name || '',
        category_addresses: plan.category_addresses || catMeta?.what_it_addresses || '',
        category_key_indicators: catMeta?.key_indicators || '',
        assessment_date: plan.assessment_date || new Date().toISOString().slice(0, 10),
        gaps_identified: Array.isArray(plan.gaps_identified) ? plan.gaps_identified : [],
        gap_notes: plan.gap_notes || '',
        action_plan_steps: Array.isArray(plan.action_plan_steps) ? plan.action_plan_steps : [],
        financing_target: plan.financing_target || 'Working Capital Loan',
        estimated_amount: plan.estimated_amount || '',
        preferred_fsp: plan.preferred_fsp || 'Centenary Bank',
        current_fsp: plan.current_fsp || '',
        has_active_loan: Boolean(plan.has_active_loan),
        support_priority: plan.support_priority || catMeta?.default_priority || 'Medium',
        data_source: plan.data_source || 'Field Diagnostic & Mentorship',
        owner_committed: Boolean(plan.owner_committed),
        owner_name: plan.owner_name || plan.msme_owner_name || '',
        bge_signed: Boolean(plan.bge_signed),
        bge_signed_at: plan.bge_signed_at || null,
        bge_signature_name: plan.bge_signature_name || (bge?.name || ''),
        status: plan.status || 'draft',
        approved_by: plan.approved_by || null,
        approved_by_name: plan.approved_by_name || '',
        approved_at: plan.approved_at || null,
        approval_notes: plan.approval_notes || '',
      });

    } else {
      // New Plan
      const initialMsme = msme || (allMsmes.length > 0 ? allMsmes[0] : null);
      setSelectedMsmeId(initialMsme ? initialMsme.id : '');
      loadCategoryDefaults('1_financial_records', initialMsme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan, msme]);

  const handleCategoryChange = (e) => {
    if (isReadOnly) return;
    const newCatId = e.target.value;
    loadCategoryDefaults(newCatId, activeMsme);
  };

  const toggleGap = (gapText) => {
    if (isReadOnly) return;
    setForm((prev) => {
      const exists = prev.gaps_identified.includes(gapText);
      const nextGaps = exists
        ? prev.gaps_identified.filter((g) => g !== gapText)
        : [...prev.gaps_identified, gapText];

      // Auto-adjust priority recommendation based on gap severity
      let autoPriority = prev.support_priority;
      if (
        nextGaps.length >= 5 ||
        nextGaps.includes('No financial records kept') ||
        nextGaps.includes('Business is not formally registered')
      ) {
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
    if (isReadOnly) return;
    setForm((prev) => {
      const updated = [...prev.action_plan_steps];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, action_plan_steps: updated };
    });
  };

  const addStep = () => {
    if (isReadOnly) return;
    setForm((prev) => ({
      ...prev,
      action_plan_steps: [
        ...prev.action_plan_steps,
        {
          step: prev.action_plan_steps.length + 1,
          action: '',
          timeline: 'Months 1–3',
          responsible: 'Owner & BGE',
          verification: 'Verified by BGE',
        },
      ],
    }));
  };

  const addPredefinedStep = (stepItem) => {
    if (!stepItem || isReadOnly) return;
    setForm((prev) => ({
      ...prev,
      action_plan_steps: [
        ...prev.action_plan_steps,
        {
          step: prev.action_plan_steps.length + 1,
          action: stepItem.action,
          timeline: stepItem.timeline,
          responsible: stepItem.responsible,
          verification: stepItem.verification,
        },
      ],
    }));
    setStepPickerVal('');
  };

  const removeStep = (index) => {
    if (isReadOnly) return;
    setForm((prev) => ({
      ...prev,
      action_plan_steps: prev.action_plan_steps
        .filter((_, idx) => idx !== index)
        .map((s, idx) => ({ ...s, step: idx + 1 })),
    }));
  };

  const handleSave = async (submitNow = false) => {
    if (isReadOnly) return;
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
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
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

      if (notify) notify(`Financial Improvement Action Plan ${submitNow ? 'submitted' : 'saved'} successfully.`);
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

  const categoriesList = templates.categories && templates.categories.length > 0
    ? templates.categories
    : FIAP_CATEGORIES;

  const currentCategory = categoriesList.find((c) => c.id === form.category) || categoriesList[0];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth disableScrollLock>
      <DialogTitle sx={{ pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" fontWeight={800} sx={{ color: '#0F172A', fontSize: 18 }}>
              {isViewer ? 'View Financial Improvement Action Plan (FIAP)' : plan ? 'Edit Financial Improvement Action Plan' : 'New Financial Improvement Action Plan'}
            </Typography>
            <Chip
              label={form.status === 'submitted' ? 'Submitted' : form.status === 'approved' ? 'Approved' : 'Draft'}
              size="small"
              color={form.status === 'submitted' ? 'success' : form.status === 'approved' ? 'primary' : 'warning'}
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
            {isViewer && (
              <Chip
                icon={<Visibility sx={{ fontSize: 14 }} />}
                label="Reviewer Mode (Read-Only)"
                size="small"
                sx={{ bgcolor: '#F1F5F9', color: '#475569', fontWeight: 600, fontSize: 11 }}
              />
            )}
          </Box>
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.3 }}>
            PRUDEV II Access to Finance & Credit Readiness Roadmap (FIAP) · GOPA Pro & GIZ
            {activeMsme ? ` · ${activeMsme.business_name} (${activeMsme.district || 'MSME'})` : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {plan?.id && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<EventAvailable />}
              onClick={() => setBookMeetingOpen(true)}
              sx={{
                fontSize: 12,
                textTransform: 'none',
                fontWeight: 700,
                borderColor: '#1E3A8A',
                color: '#1E3A8A',
                bgcolor: '#EFF6FF',
                '&:hover': { bgcolor: '#DBEAFE', borderColor: '#172554' },
              }}
            >
              Request Approval Meeting
            </Button>
          )}
          {plan?.id && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<PictureAsPdf />}
              onClick={() => openPdf(plan.id)}
              sx={{ fontSize: 12, textTransform: 'none', fontWeight: 600 }}
            >
              Download PDF
            </Button>
          )}
          <IconButton size="small" onClick={onClose}><Close fontSize="small" /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

        {/* ── Official Approval Status Alerts ── */}
        {form.status === 'approved' && (
          <Alert
            severity="success"
            icon={<CheckCircle sx={{ color: '#059669' }} />}
            sx={{
              borderRadius: 2,
              bgcolor: '#ECFDF5',
              border: '1px solid #A7F3D0',
              color: '#065F46',
              '& .MuiAlert-message': { width: '100%' },
            }}
          >
            <Typography variant="subtitle2" fontWeight={800}>
              Officially Approved by Access to Finance Leadership
            </Typography>
            <Typography variant="body2" sx={{ fontSize: 13, mt: 0.5 }}>
              Approved by <strong>{form.approved_by_name || 'Rosemary Laker / Harriet Daisy Amule'}</strong>
              {form.approved_at ? ` on ${new Date(form.approved_at).toLocaleDateString()}` : ''}
              {form.approval_notes ? ` — "${form.approval_notes}"` : ''}
            </Typography>
          </Alert>
        )}

        {form.status === 'submitted' && (
          <Alert
            severity="info"
            icon={<EventAvailable sx={{ color: '#1E3A8A' }} />}
            action={
              plan?.id && (
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => setBookMeetingOpen(true)}
                  sx={{ bgcolor: '#1E3A8A', '&:hover': { bgcolor: '#172554' }, textTransform: 'none', fontWeight: 700, fontSize: 11.5 }}
                >
                  Book Meeting with Rosemary / Harriet
                </Button>
              )
            }
            sx={{ borderRadius: 2, bgcolor: '#EFF6FF', border: '1px solid #BFDBFE' }}
          >
            <Typography variant="body2" fontWeight={700} color="#1E3A8A">
              Submitted for Access to Finance Approval
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Plan is pending review and sign-off by Rosemary Laker or Harriet Daisy Amule. Book a review session to finalize endorsement.
            </Typography>
          </Alert>
        )}


        {/* ── MSME Selection & Diagnostic Metadata ── */}
        <Box sx={{ p: 2, bgcolor: '#F8FAFC', borderRadius: 2, border: '1px solid #E2E8F0' }}>
          <Typography variant="subtitle2" fontWeight={800} color={BRAND.primaryMain} sx={{ mb: 1.5, letterSpacing: 0.3 }}>
            1. ENTERPRISE & DIAGNOSTIC METADATA (AUTO-POPULATED)
          </Typography>
          <Grid container spacing={2}>
            {!msme && allMsmes.length > 0 && !isReadOnly && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Select Target MSME *</InputLabel>
                  <Select
                    value={selectedMsmeId}
                    label="Select Target MSME *"
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedMsmeId(id);
                      const target = allMsmes.find((m) => m.id === id);
                      if (target) {
                        setForm((prev) => ({
                          ...prev,
                          owner_name: target.owner_name || prev.owner_name,
                        }));
                      }
                    }}
                  >
                    {allMsmes.map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.business_name || m.name} ({m.district || '—'}) {m.owner_name ? `· ${m.owner_name}` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12} sm={(!msme && allMsmes.length > 0 && !isReadOnly) ? 6 : 6}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Diagnostic Assessment Date *"
                InputLabelProps={{ shrink: true }}
                value={form.assessment_date}
                disabled={isReadOnly}
                onChange={(e) => setForm((prev) => ({ ...prev, assessment_date: e.target.value }))}
              />
            </Grid>
            {activeMsme && (
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', p: 1.5, bgcolor: '#fff', borderRadius: 1.5, border: '1px solid #CBD5E1' }}>
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    <strong>Enterprise:</strong> {activeMsme.business_name} {activeMsme.msme_code ? `(${activeMsme.msme_code})` : ''}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    <strong>Sector:</strong> {activeMsme.sector || '—'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    <strong>Owner:</strong> {activeMsme.owner_name || '—'} {activeMsme.contact_phone ? `(${activeMsme.contact_phone})` : ''}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    <strong>Location:</strong> {[activeMsme.district, activeMsme.sub_county, activeMsme.parish].filter(Boolean).join(', ') || '—'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    <strong>Assigned BGE:</strong> {bge?.name || activeMsme.assigned_bge_name || '—'} {bge?.bge_code ? `(${bge.bge_code})` : ''}
                  </Typography>
                </Box>
              </Grid>
            )}
          </Grid>
        </Box>

        {/* ── Section 2: Primary Action Plan Category ── */}
        <Box sx={{ p: 2, bgcolor: '#EFF6FF', borderRadius: 2, border: '1px solid #93C5FD' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={800} color="#1D4ED8" sx={{ fontSize: 14 }}>
                2. PRIMARY ACTION PLAN CATEGORY (Single Most Restrictive Binding Barrier)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Rule: Each MSME is placed in <strong>ONE primary category</strong> representing its primary barrier to obtaining finance.
              </Typography>
            </Box>
            <Chip
              label={`Category ${currentCategory?.number || '1'} of 9`}
              size="small"
              sx={{ bgcolor: '#DBEAFE', color: '#1E40AF', fontWeight: 700, fontSize: 11 }}
            />
          </Box>

          <FormControl fullWidth size="small" sx={{ mb: 1.5, mt: 1, bgcolor: '#fff' }}>
            <InputLabel id="primary-category-select-label">Primary Action Plan Category *</InputLabel>
            <Select
              labelId="primary-category-select-label"
              value={form.category}
              label="Primary Action Plan Category *"
              disabled={isReadOnly}
              onChange={handleCategoryChange}
            >
              {categoriesList.map((cat) => (
                <MenuItem key={cat.id} value={cat.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {cat.number}. {cat.name}
                    </Typography>
                    <Chip
                      label={cat.default_priority}
                      size="small"
                      sx={{
                        fontSize: 10,
                        height: 20,
                        fontWeight: 700,
                        bgcolor: priorityColors[cat.default_priority]?.bg,
                        color: priorityColors[cat.default_priority]?.text,
                      }}
                    />
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Category Description Banner */}
          <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 1.5, border: '1px solid #93C5FD', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box>
              <Typography variant="caption" color="#1E40AF" fontWeight={800} display="block">
                WHAT THIS CATEGORY ADDRESSES:
              </Typography>
              <Typography variant="body2" color="#0F172A" sx={{ mt: 0.3, fontWeight: 500, fontSize: 13 }}>
                {form.category_addresses || currentCategory?.what_it_addresses || 'Select a category to view diagnostic focus.'}
              </Typography>
            </Box>
            {currentCategory?.key_indicators && (
              <Box sx={{ pt: 1, borderTop: '1px dashed #BFDBFE' }}>
                <Typography variant="caption" color="#475569" fontWeight={800} display="block">
                  KEY DIAGNOSTIC INDICATORS IN THE FIELD:
                </Typography>
                <Typography variant="caption" color="#334155" sx={{ mt: 0.2, fontStyle: 'italic', display: 'block' }}>
                  {currentCategory.key_indicators}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* ── Section 3: Diagnostic Gaps Identified ── */}
        <Box sx={{ p: 2, bgcolor: '#F8FAFC', borderRadius: 2, border: '1px solid #E2E8F0' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={800} color={BRAND.primaryMain}>
                3. DIAGNOSTIC GAPS IDENTIFIED ({form.gaps_identified.length} Gaps Checked)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Standardized diagnostic checklist evaluated during BGE field visits.
              </Typography>
            </Box>
            {!isReadOnly && (
              <Button
                size="small"
                startIcon={<AutoAwesome />}
                onClick={() => {
                  const cat = categoriesList.find((c) => c.id === form.category);
                  if (cat?.typical_gaps) {
                    setForm((prev) => ({ ...prev, gaps_identified: [...cat.typical_gaps] }));
                  }
                }}
                sx={{ fontSize: 11, textTransform: 'none' }}
              >
                Reset Typical Category Gaps
              </Button>
            )}
          </Box>

          <Grid container spacing={1}>
            {(templates.standard_gaps || STANDARD_GAPS).map((gapText, idx) => {
              const isChecked = form.gaps_identified.includes(gapText);
              return (
                <Grid item xs={12} sm={6} key={idx}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={isChecked}
                        disabled={isReadOnly}
                        onChange={() => toggleGap(gapText)}
                      />
                    }
                    label={
                      <Typography variant="body2" fontSize={13} fontWeight={isChecked ? 600 : 400} color={isChecked ? '#0F172A' : '#64748B'}>
                        {gapText}
                      </Typography>
                    }
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
            label="Specific Enterprise Gaps & Diagnostic Notes"
            placeholder="Document specific machinery gaps, power constraints, local market contracts, or operational bottlenecks…"
            value={form.gap_notes}
            disabled={isReadOnly}
            onChange={(e) => setForm((prev) => ({ ...prev, gap_notes: e.target.value }))}
            sx={{ mt: 2, bgcolor: '#fff' }}
          />
        </Box>

        {/* ── Section 4: Sequenced Action Plan (Roadmap) ── */}
        <Box sx={{ p: 2, bgcolor: '#FFFBEB', borderRadius: 2, border: '1px solid #FDE68A' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={800} color="#B45309">
                4. SEQUENCED FINANCIAL IMPROVEMENT ACTION PLAN (The Phased Roadmap)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Concrete, time-bound milestones (Months 1–3, Months 2–4, or Months 1–6) tied to verification evidence.
              </Typography>
            </Box>
            {!isReadOnly && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Quick Add from 11 Standard Modules */}
                <FormControl size="small" sx={{ minWidth: 200, bgcolor: '#fff' }}>
                  <InputLabel sx={{ fontSize: 12 }}>+ Insert Standard Step</InputLabel>
                  <Select
                    value={stepPickerVal}
                    label="+ Insert Standard Step"
                    onChange={(e) => {
                      const selectedStep = STANDARD_ROADMAP_STEPS.find((s) => s.step === Number(e.target.value));
                      if (selectedStep) addPredefinedStep(selectedStep);
                    }}
                    sx={{ fontSize: 12, height: 32 }}
                  >
                    <MenuItem value=""><em>Select from 11 standard modules…</em></MenuItem>
                    {STANDARD_ROADMAP_STEPS.map((s) => (
                      <MenuItem key={s.step} value={s.step} sx={{ fontSize: 12 }}>
                        Step {s.step}: {s.title} ({s.timeline})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  size="small"
                  startIcon={<AutoAwesome />}
                  onClick={() => {
                    const cat = categoriesList.find((c) => c.id === form.category);
                    if (cat?.default_steps) {
                      setForm((prev) => ({
                        ...prev,
                        action_plan_steps: cat.default_steps.map((s) => ({ ...s })),
                      }));
                    }
                  }}
                  sx={{ fontSize: 11, color: '#B45309', textTransform: 'none' }}
                >
                  Reset Default Steps
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Add />}
                  onClick={addStep}
                  sx={{ fontSize: 11, borderColor: '#D97706', color: '#D97706', textTransform: 'none' }}
                >
                  Add Custom Step
                </Button>
              </Box>
            )}
          </Box>

          <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: '#fff' }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#FEF3C7' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800, width: 45, fontSize: 12 }}>Step</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 12 }}>Action Description</TableCell>
                  <TableCell sx={{ fontWeight: 800, width: 140, fontSize: 12 }}>Milestone Window</TableCell>
                  <TableCell sx={{ fontWeight: 800, width: 150, fontSize: 12 }}>Responsible Person</TableCell>
                  <TableCell sx={{ fontWeight: 800, width: 180, fontSize: 12 }}>Verification Evidence</TableCell>
                  {!isReadOnly && <TableCell sx={{ width: 40 }} />}
                </TableRow>
              </TableHead>
              <TableBody>
                {form.action_plan_steps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isReadOnly ? 5 : 6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No action steps configured. Click "Reset Default Steps" or "Insert Standard Step".
                    </TableCell>
                  </TableRow>
                ) : (
                  form.action_plan_steps.map((s, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontWeight: 800, fontSize: 12 }}>{idx + 1}</TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          multiline
                          size="small"
                          value={s.action}
                          disabled={isReadOnly}
                          onChange={(e) => handleStepChange(idx, 'action', e.target.value)}
                          placeholder="Action plan description…"
                          InputProps={{ style: { fontSize: 13 } }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          size="small"
                          value={s.timeline}
                          disabled={isReadOnly}
                          onChange={(e) => handleStepChange(idx, 'timeline', e.target.value)}
                          placeholder="e.g. Months 1–3"
                          InputProps={{ style: { fontSize: 12 } }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          size="small"
                          value={s.responsible}
                          disabled={isReadOnly}
                          onChange={(e) => handleStepChange(idx, 'responsible', e.target.value)}
                          placeholder="e.g. Owner & BGE"
                          InputProps={{ style: { fontSize: 12 } }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          size="small"
                          value={s.verification}
                          disabled={isReadOnly}
                          onChange={(e) => handleStepChange(idx, 'verification', e.target.value)}
                          placeholder="e.g. Inspected cashbook entries"
                          InputProps={{ style: { fontSize: 12 } }}
                        />
                      </TableCell>
                      {!isReadOnly && (
                        <TableCell>
                          <IconButton size="small" onClick={() => removeStep(idx)} color="error">
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* ── Section 5: Financing Target & Institutional Linkage ── */}
        <Box sx={{ p: 2, bgcolor: '#F0FDF4', borderRadius: 2, border: '1px solid #BBF7D0' }}>
          <Typography variant="subtitle2" fontWeight={800} color="#166534" sx={{ mb: 1.5 }}>
            5. FINANCING TARGET & INSTITUTIONAL LINKAGE
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Target Credit Facility *</InputLabel>
                <Select
                  value={form.financing_target}
                  label="Target Credit Facility *"
                  disabled={isReadOnly}
                  onChange={(e) => setForm((prev) => ({ ...prev, financing_target: e.target.value }))}
                >
                  {(templates.standard_facilities || STANDARD_FACILITIES).map((fac, idx) => (
                    <MenuItem key={idx} value={fac}>{fac}</MenuItem>
                  ))}
                  <MenuItem value="Other / Custom Facility">Other / Custom Facility</MenuItem>
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
                disabled={isReadOnly}
                onChange={(e) => setForm((prev) => ({ ...prev, estimated_amount: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Preferred FSP *</InputLabel>
                <Select
                  value={form.preferred_fsp}
                  label="Preferred FSP *"
                  disabled={isReadOnly}
                  onChange={(e) => setForm((prev) => ({ ...prev, preferred_fsp: e.target.value }))}
                >
                  {(templates.standard_fsps || STANDARD_FSPS).map((fsp, idx) => (
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
                disabled={isReadOnly}
                onChange={(e) => setForm((prev) => ({ ...prev, current_fsp: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Support Priority Level *</InputLabel>
                <Select
                  value={form.support_priority}
                  label="Support Priority Level *"
                  disabled={isReadOnly}
                  onChange={(e) => setForm((prev) => ({ ...prev, support_priority: e.target.value }))}
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
                    disabled={isReadOnly}
                    onChange={(e) => setForm((prev) => ({ ...prev, has_active_loan: e.target.checked }))}
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2" fontSize={13}>
                    <strong>Enterprise has an active running loan</strong> (Repayment performance protection and avoiding arrears are required)
                  </Typography>
                }
              />
            </Grid>
          </Grid>
        </Box>

        {/* ── Section 6: Commitments & Sign-off ── */}
        <Box sx={{ p: 2, bgcolor: '#FAF5FF', borderRadius: 2, border: '1px solid #E9D5FF' }}>
          <Typography variant="subtitle2" fontWeight={800} color="#7E22CE" sx={{ mb: 1.5 }}>
            6. COMMITMENTS & VERIFICATION SIGN-OFF
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 1.5, border: '1px solid #E2E8F0' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.owner_committed}
                      disabled={isReadOnly}
                      onChange={(e) => setForm((prev) => ({ ...prev, owner_committed: e.target.checked }))}
                    />
                  }
                  label={
                    <Typography variant="body2" fontWeight={700}>
                      Enterprise Owner Commitment
                    </Typography>
                  }
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5, fontStyle: 'italic' }}>
                  "I commit to implementing the operational changes and record-keeping discipline specified in this plan over the next 1–6 months."
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  label="Owner / Representative Name"
                  value={form.owner_name}
                  disabled={isReadOnly}
                  onChange={(e) => setForm((prev) => ({ ...prev, owner_name: e.target.value }))}
                />
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 1.5, border: '1px solid #E2E8F0' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.bge_signed}
                      disabled={isReadOnly}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        bge_signed: e.target.checked,
                        bge_signed_at: e.target.checked ? new Date().toISOString().slice(0, 10) : null,
                      }))}
                    />
                  }
                  label={
                    <Typography variant="body2" fontWeight={700}>
                      BGE Mentor Verification Declaration
                    </Typography>
                  }
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5, fontStyle: 'italic' }}>
                  "I certify that I conducted this diagnostic, verified its physical location, co-designed this roadmap, and will verify implementation."
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  label="BGE Mentor Name"
                  value={form.bge_signature_name}
                  disabled={isReadOnly}
                  onChange={(e) => setForm((prev) => ({ ...prev, bge_signature_name: e.target.value }))}
                />
              </Box>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none' }}>
          {isReadOnly ? 'Close' : 'Cancel'}
        </Button>
        {plan?.id && (
          <Button
            variant="outlined"
            startIcon={<PictureAsPdf />}
            onClick={() => openPdf(plan.id)}
            disabled={saving || approving}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Download PDF
          </Button>
        )}
        {plan?.id && (
          <Button
            variant="outlined"
            startIcon={<EventAvailable />}
            onClick={() => setBookMeetingOpen(true)}
            disabled={saving || approving}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderColor: '#1E3A8A',
              color: '#1E3A8A',
              bgcolor: '#EFF6FF',
              '&:hover': { bgcolor: '#DBEAFE', borderColor: '#172554' },
            }}
          >
            Request Approval Meeting
          </Button>
        )}
        {canApprove && form.status !== 'approved' && (
          <Button
            variant="contained"
            startIcon={<CheckCircle />}
            onClick={handleApprove}
            disabled={saving || approving}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              bgcolor: '#059669',
              '&:hover': { bgcolor: '#047857' },
            }}
          >
            {approving ? 'Approving…' : 'Approve Financial Plan'}
          </Button>
        )}
        {!isReadOnly && (
          <>
            <Button
              variant="outlined"
              startIcon={<Save />}
              onClick={() => handleSave(false)}
              disabled={saving || approving}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {saving ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button
              variant="contained"
              color="success"
              startIcon={<Send />}
              onClick={() => handleSave(true)}
              disabled={saving || approving}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              {saving ? 'Submitting…' : 'Submit Action Plan'}
            </Button>
          </>
        )}
      </DialogActions>

      {/* ── Book Approval Meeting Dialog (Rosemary / Harriet) ── */}
      <BookFIAPMeetingDialog
        open={bookMeetingOpen}
        onClose={() => setBookMeetingOpen(false)}
        plan={plan}
        msme={activeMsme}
        msmes={allMsmes}
        currentUser={currentUser}
        token={token}
        onBooked={(resData) => {
          setForm((prev) => ({ ...prev, status: 'submitted' }));
          if (onSaved) onSaved({ ...plan, status: 'submitted' });
        }}
        notify={notify}
      />
    </Dialog>
  );
}

