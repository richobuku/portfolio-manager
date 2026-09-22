import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, Chip, IconButton,
  Grid, Tabs, Tab, Divider, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  LinearProgress, Select, MenuItem, FormControl, InputLabel,
  Checkbox, FormControlLabel, Tooltip, CircularProgress,
} from '@mui/material';
import {
  Close, Download, Save, Send, CheckCircle,
  Add, Delete, Assignment, Check, DoNotDisturb,
  TrendingUp, FactCheck, ArrowForward, ArrowBack, Verified,
} from '@mui/icons-material';
import axios from 'axios';
import { BRAND } from '../theme';
import {
  API_ENDPOINTS,
  TBIP_PDF_URL,
  TBIP_EXCEL_URL,
  TBIP_SUBMIT_URL,
  TBIP_APPROVE_URL,
  TBIP_REJECT_URL,
} from '../config';

export const TBIP_CATEGORIES = [
  {
    id: 'governance',
    name: 'Governance & Strategy',
    icon: '🏛️',
    questions: [
      { id: 'gov_1', text: 'Does the business have a written business/strategic plan?' },
      { id: 'gov_2', text: 'Is the business actively implementing that plan (using it for decisions/investments)?' },
      { id: 'gov_3', text: 'Does the business have a Board of Directors/Advisors supporting decisions?' },
      { id: 'gov_4', text: 'Are minutes kept of board/advisor meetings?' },
      { id: 'gov_5', text: 'Does the business have segregated/independent management structures (e.g. finance and HR)?' },
      { id: 'gov_6', text: 'Does the business have HR and finance policies/manuals in place?' },
    ],
  },
  {
    id: 'finance',
    name: 'Financial Management',
    icon: '💰',
    questions: [
      { id: 'fin_1', text: 'Does the business have a digital accounting system?' },
      { id: 'fin_2', text: 'Does the business have a bank account in the business’s own name?' },
      { id: 'fin_3', text: 'Does the business have cash reserves set aside for a crisis?' },
      { id: 'fin_4', text: 'Does the business keep financial accounts (paper or electronic)?' },
      { id: 'fin_5', text: 'Does the business file statutory tax returns?' },
    ],
  },
  {
    id: 'hr',
    name: 'HR & Decent Work',
    icon: '👥',
    questions: [
      { id: 'hr_1', text: 'Are individual staff roles/targets documented in writing?' },
      { id: 'hr_2', text: 'Does the business have written employment contracts with employees?' },
      { id: 'hr_3', text: 'Are there arrangements to protect workers from harassment/unfair treatment?' },
      { id: 'hr_4', text: 'Does the business make NSSF contributions for staff?' },
      { id: 'hr_5', text: 'Does the business provide health insurance for employees?' },
    ],
  },
  {
    id: 'market',
    name: 'Market & Customers',
    icon: '🛍️',
    questions: [
      { id: 'mkt_1', text: 'Does the business have a reward programme for customers?' },
      { id: 'mkt_2', text: 'Does the business maintain a customer database?' },
      { id: 'mkt_3', text: 'Is the business (or owner) a member of a sector association?' },
      { id: 'mkt_4', text: 'Does the business participate in sector/value-chain events (fairs, dialogues, networking)?' },
      { id: 'mkt_5', text: 'Is the business able to produce/deliver enough to meet current market demand?' },
    ],
  },
  {
    id: 'digital',
    name: 'Digital & Technology',
    icon: '💻',
    questions: [
      { id: 'dig_1', text: 'Does the business own computer-related hardware?' },
      { id: 'dig_2', text: 'Does the business have dedicated internet connectivity for operations?' },
      { id: 'dig_3', text: 'Does the business use digital tools (website, online booking/deliveries, stock, payroll, management systems)?' },
      { id: 'dig_4', text: 'Does the business use social media to promote products/services?' },
      { id: 'dig_5', text: 'Is the business registered on an online trading/procurement platform?' },
      { id: 'dig_6', text: 'Does the business make/receive digital payments (bank or mobile money)?' },
      { id: 'dig_7', text: 'Does the business store and refer to data to inform decisions?' },
    ],
  },
  {
    id: 'env',
    name: 'Environmental Sustainability',
    icon: '🌱',
    questions: [
      { id: 'env_1', text: 'Has the business thought about its environmental impact?' },
      { id: 'env_2', text: 'Does the business have an environmental management plan, and is it implemented?' },
      { id: 'env_3', text: 'Does the business monitor its use of resources (water, energy, land, etc.)?' },
      { id: 'env_4', text: 'Does the business practice waste management/recycling or energy efficiency measures?' },
      { id: 'env_5', text: 'Does the business promote environmentally friendly practices among staff and suppliers?' },
    ],
  },
  {
    id: 'regulatory',
    name: 'Regulatory Compliance & Quality',
    icon: '⚖️',
    questions: [
      { id: 'reg_1', text: 'Is the business able to meet applicable regulatory standards (e.g. Halal, Kosher, UNBS)?' },
      { id: 'reg_2', text: 'Does the business maintain necessary operating licenses and sector permits?' },
      { id: 'reg_3', text: 'Does the business have quality assurance or safety standards/certifications in place?' },
      { id: 'reg_4', text: 'Does the business conduct regular compliance and standards reviews?' },
    ],
  },
];

export function computeLocalDiagnostic(answers) {
  const categories = {};
  let totalGaps = 0;
  let totalApplicable = 0;

  TBIP_CATEGORIES.forEach((cat) => {
    let applicable = 0;
    let gaps = 0;
    cat.questions.forEach((q) => {
      const a = answers[q.id];
      if (a === 'Yes' || a === 'No') {
        applicable++;
        if (a === 'No') gaps++;
      }
    });

    let status = 'N/A';
    let gapPct = 0;
    if (applicable > 0) {
      gapPct = Math.round((gaps / applicable) * 100);
      if (gaps === 0) status = 'Satisfactory';
      else if (gapPct >= 50) status = 'Critical Gap';
      else status = 'Needs Improvement';
    }

    totalGaps += gaps;
    totalApplicable += applicable;

    categories[cat.name] = {
      total: cat.questions.length,
      applicable,
      gaps,
      status,
      gapPct,
      ratio: `${gaps} / ${applicable}`,
    };
  });

  let overallPriority = 'Low';
  if (totalApplicable > 0) {
    const overallPct = (totalGaps / totalApplicable) * 100;
    if (overallPct >= 45 || totalGaps >= 8) overallPriority = 'High';
    else if (overallPct >= 20 || totalGaps >= 4) overallPriority = 'Medium';
    else overallPriority = 'Low';
  }

  return { categories, totalGaps, totalApplicable, overallPriority };
}

export default function EnterpriseImprovementPlanDialog({
  open,
  onClose,
  plan,
  msme,
  bge,
  currentUser,
  token,
  onSaved,
  notify,
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [activeCatIdx, setActiveCatIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Form State
  const [assessmentDate, setAssessmentDate] = useState(() =>
    plan?.assessment_date || new Date().toISOString().split('T')[0]
  );
  const [answers, setAnswers] = useState(() => plan?.assessment_answers || {});
  const [gapNotes, setGapNotes] = useState(() => plan?.gap_notes || {});
  const [priorityActions, setPriorityActions] = useState(() => {
    if (plan?.priority_actions && plan.priority_actions.length > 0) {
      return plan.priority_actions;
    }
    return [
      { id: 1, action: '', category: 'Governance & Strategy', owner: bge?.name || '', timeline: 'Within 30 days', outcome: '', status: 'Pending' },
      { id: 2, action: '', category: 'Financial Management', owner: bge?.name || '', timeline: 'Within 60 days', outcome: '', status: 'Pending' },
      { id: 3, action: '', category: 'Market & Customers', owner: bge?.name || '', timeline: 'Within 90 days', outcome: '', status: 'Pending' },
    ];
  });
  const [bgeSigned, setBgeSigned] = useState(() => plan?.bge_signed || false);
  const [bgeSignOffName, setBgeSignOffName] = useState(() => plan?.bge_sign_off_name || bge?.name || currentUser?.name || '');
  const [hoaNotes, setHoaNotes] = useState(() => plan?.hoa_notes || '');
  const [hoaSignOffName, setHoaSignOffName] = useState(() => plan?.hoa_sign_off_name || currentUser?.name || '');

  // Live Diagnostic Metrics
  const diagnostic = useMemo(() => computeLocalDiagnostic(answers), [answers]);

  const isAdminOrManager = !!(
    currentUser?.is_staff ||
    currentUser?.is_superuser ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'cohort_admin'
  );

  const isApproved = plan?.status === 'approved';
  const isSubmitted = plan?.status === 'submitted';
  const isReadOnly = isApproved || (!isAdminOrManager && isSubmitted);

  // Sync state when plan changes
  useEffect(() => {
    if (plan) {
      setAssessmentDate(plan.assessment_date || new Date().toISOString().split('T')[0]);
      setAnswers(plan.assessment_answers || {});
      setGapNotes(plan.gap_notes || {});
      setPriorityActions(
        plan.priority_actions?.length > 0
          ? plan.priority_actions
          : [
              { id: 1, action: '', category: 'Governance & Strategy', owner: bge?.name || '', timeline: 'Within 30 days', outcome: '', status: 'Pending' },
              { id: 2, action: '', category: 'Financial Management', owner: bge?.name || '', timeline: 'Within 60 days', outcome: '', status: 'Pending' },
              { id: 3, action: '', category: 'Market & Customers', owner: bge?.name || '', timeline: 'Within 90 days', outcome: '', status: 'Pending' },
            ]
      );
      setBgeSigned(plan.bge_signed || false);
      setBgeSignOffName(plan.bge_sign_off_name || bge?.name || currentUser?.name || '');
      setHoaNotes(plan.hoa_notes || '');
      setHoaSignOffName(plan.hoa_sign_off_name || currentUser?.name || '');
    } else {
      setAssessmentDate(new Date().toISOString().split('T')[0]);
      setAnswers({});
      setGapNotes({});
      setPriorityActions([
        { id: 1, action: '', category: 'Governance & Strategy', owner: bge?.name || '', timeline: 'Within 30 days', outcome: '', status: 'Pending' },
        { id: 2, action: '', category: 'Financial Management', owner: bge?.name || '', timeline: 'Within 60 days', outcome: '', status: 'Pending' },
        { id: 3, action: '', category: 'Market & Customers', owner: bge?.name || '', timeline: 'Within 90 days', outcome: '', status: 'Pending' },
      ]);
      setBgeSigned(false);
      setBgeSignOffName(bge?.name || currentUser?.name || '');
      setHoaNotes('');
      setHoaSignOffName(currentUser?.name || '');
    }
    setActiveTab(0);
    setActiveCatIdx(0);
  }, [plan, bge, currentUser]);

  const handleAnswerChange = (qId, val) => {
    if (isReadOnly) return;
    setAnswers((prev) => ({ ...prev, [qId]: val }));
  };

  const handleGapNoteChange = (catName, text) => {
    if (isReadOnly) return;
    setGapNotes((prev) => ({ ...prev, [catName]: text }));
  };

  const handleAddAction = () => {
    if (isReadOnly) return;
    setPriorityActions((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        action: '',
        category: 'Governance & Strategy',
        owner: bge?.name || '',
        timeline: '',
        outcome: '',
        status: 'Pending',
      },
    ]);
  };

  const handleRemoveAction = (idx) => {
    if (isReadOnly) return;
    setPriorityActions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleActionChange = (idx, field, val) => {
    if (isReadOnly) return;
    setPriorityActions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const buildPayload = (newStatus = 'draft') => ({
    msme: msme?.id || plan?.msme,
    bge: bge?.id || plan?.bge,
    assessment_date: assessmentDate,
    status: newStatus,
    assessment_answers: answers,
    diagnostic_snapshot: diagnostic,
    gap_notes: gapNotes,
    priority_actions: priorityActions,
    overall_priority: diagnostic.overallPriority,
    bge_signed: bgeSigned,
    bge_sign_off_name: bgeSignOffName,
  });

  const handleSave = async (statusOverride) => {
    const targetStatus = statusOverride || plan?.status || 'draft';
    const payload = buildPayload(targetStatus);
    setSaving(true);
    try {
      let res;
      if (plan?.id) {
        res = await axios.patch(`${API_ENDPOINTS.ENTERPRISE_IMPROVEMENT_PLANS}${plan.id}/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        res = await axios.post(API_ENDPOINTS.ENTERPRISE_IMPROVEMENT_PLANS, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      notify?.('Enterprise Improvement Plan saved successfully.', 'success');
      onSaved?.(res.data);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to save improvement plan.';
      notify?.(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!bgeSigned) {
      notify?.('Please check the BGE Sign-off confirmation before submitting.', 'warning');
      setActiveTab(3);
      return;
    }
    setSubmitting(true);
    try {
      // Save first
      let planId = plan?.id;
      if (!planId) {
        const createRes = await axios.post(API_ENDPOINTS.ENTERPRISE_IMPROVEMENT_PLANS, buildPayload('draft'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        planId = createRes.data.id;
      } else {
        await axios.patch(`${API_ENDPOINTS.ENTERPRISE_IMPROVEMENT_PLANS}${planId}/`, buildPayload('draft'), {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      const res = await axios.post(
        TBIP_SUBMIT_URL(planId),
        { bge_sign_off_name: bgeSignOffName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      notify?.('Plan submitted for Head of Assignment approval.', 'success');
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      notify?.(err.response?.data?.detail || 'Failed to submit plan.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!plan?.id) return;
    setApproving(true);
    try {
      const res = await axios.post(
        TBIP_APPROVE_URL(plan.id),
        { hoa_notes: hoaNotes, hoa_sign_off_name: hoaSignOffName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      notify?.('Enterprise Improvement Plan approved.', 'success');
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      notify?.(err.response?.data?.detail || 'Failed to approve plan.', 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!plan?.id) return;
    setApproving(true);
    try {
      const res = await axios.post(
        TBIP_REJECT_URL(plan.id),
        { hoa_notes: hoaNotes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      notify?.('Plan returned for revision.', 'info');
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      notify?.(err.response?.data?.detail || 'Failed to return plan.', 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!plan?.id) {
      notify?.('Please save the plan before exporting PDF.', 'warning');
      return;
    }
    setDownloading(true);
    try {
      const res = await axios.get(TBIP_PDF_URL(plan.id), {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `TBIP_${msme?.name || 'MSME'}_${assessmentDate}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      notify?.('Failed to download PDF.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!plan?.id) {
      notify?.('Please save the plan before exporting Excel.', 'warning');
      return;
    }
    setDownloading(true);
    try {
      const res = await axios.get(TBIP_EXCEL_URL(plan.id), {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `TBIP_${msme?.name || 'MSME'}_${assessmentDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      notify?.('Failed to download Excel workbook.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const currentCategory = TBIP_CATEGORIES[activeCatIdx];
  const currentCatData = diagnostic.categories[currentCategory.name] || {};

  const priorityColor = (p) => {
    if (p === 'High') return { bg: '#FEE2E2', text: '#991B1B', border: '#F87171' };
    if (p === 'Medium') return { bg: '#FEF3C7', text: '#92400E', border: '#FBBF24' };
    return { bg: '#D1FAE5', text: '#065F46', border: '#34D399' };
  };

  const statusChipColor = (st) => {
    if (st === 'approved') return 'success';
    if (st === 'submitted') return 'primary';
    if (st === 'rejected') return 'error';
    return 'default';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth disableScrollLock PaperProps={{ sx: { borderRadius: 2.5, minHeight: '82vh' } }}>
      {/* Brand Top Header Accent */}
      <Box sx={{ height: 4, background: `linear-gradient(90deg, ${BRAND.gopaGold} 0%, ${BRAND.gopaGold} 50%, ${BRAND.gizRed} 50%, ${BRAND.gizRed} 100%)` }} />

      <DialogTitle sx={{ p: 2.5, pb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography variant="h6" fontWeight={800} sx={{ color: BRAND.primaryMain, fontSize: 18 }}>
                PRUDEV II · Enterprise Improvement Plan
              </Typography>
              <Chip
                label={`Priority: ${diagnostic.overallPriority}`}
                size="small"
                sx={{
                  bgcolor: priorityColor(diagnostic.overallPriority).bg,
                  color: priorityColor(diagnostic.overallPriority).text,
                  fontWeight: 800,
                  fontSize: 12,
                  border: `1px solid ${priorityColor(diagnostic.overallPriority).border}`,
                }}
              />
              <Chip
                label={plan?.status ? plan.status.toUpperCase() : 'NEW DRAFT'}
                size="small"
                color={statusChipColor(plan?.status)}
                sx={{ fontWeight: 700, fontSize: 11 }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              MSME Business Assessment & Technical Business Improvement Plan (TBIP) · <b>{msme?.name || plan?.msme_name}</b> ({msme?.msme_code || plan?.msme_code || '—'})
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {plan?.id && (
              <>
                <Tooltip title="Download official PRUDEV II branded PDF">
                  <Button size="small" variant="outlined" startIcon={<Download />} onClick={handleDownloadPdf} disabled={downloading} sx={{ fontSize: 12, textTransform: 'none' }}>
                    PDF
                  </Button>
                </Tooltip>
                <Tooltip title="Download Excel template workbook">
                  <Button size="small" variant="outlined" startIcon={<Download />} onClick={handleDownloadExcel} disabled={downloading} sx={{ fontSize: 12, textTransform: 'none' }}>
                    Excel
                  </Button>
                </Tooltip>
              </>
            )}
            <IconButton size="small" onClick={onClose}><Close /></IconButton>
          </Box>
        </Box>

        {/* Diagnostic Overview Strip */}
        <Box
          sx={{
            mt: 1.5,
            p: 1.5,
            bgcolor: '#F8FAFC',
            borderRadius: 2,
            border: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 3 }, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', fontSize: 11 }}>
                TOTAL GAPS IDENTIFIED
              </Typography>
              <Typography variant="subtitle1" fontWeight={800} color={diagnostic.totalGaps > 0 ? '#C8102E' : '#009B62'}>
                {diagnostic.totalGaps} / {diagnostic.totalApplicable}
                <Typography component="span" sx={{ ml: 0.5, fontSize: 12, fontWeight: 600, color: '#64748B' }}>
                  ({diagnostic.totalApplicable > 0 ? Math.round((diagnostic.totalGaps / diagnostic.totalApplicable) * 100) : 0}% gap rate)
                </Typography>
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', fontSize: 11 }}>
                ASSESSMENT DATE
              </Typography>
              <Typography variant="subtitle2" fontWeight={700} color={BRAND.primaryMain}>
                {assessmentDate || 'Today'}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', fontSize: 11 }}>
                LEAD BGE
              </Typography>
              <Typography variant="subtitle2" fontWeight={700} color={BRAND.primaryMain}>
                {bge?.name || plan?.bge_name || '—'}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={`${priorityActions.length} Priority Actions Defined`}
              size="small"
              variant="outlined"
              sx={{ fontWeight: 700, borderColor: BRAND.primaryMain, color: BRAND.primaryMain }}
            />
          </Box>
        </Box>

        {/* Step Navigation Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            mt: 2,
            borderBottom: '2px solid #E2E8F0',
            '& .MuiTab-root': {
              fontWeight: 700,
              textTransform: 'none',
              fontSize: 13.5,
              minHeight: 46,
              px: 2,
            },
            '& .Mui-selected': {
              color: `${BRAND.primaryMain} !important`,
            },
            '& .MuiTabs-indicator': {
              backgroundColor: BRAND.gopaGold,
              height: 3,
            },
          }}
        >
          <Tab icon={<FactCheck fontSize="small" />} iconPosition="start" label="1. Diagnostic Questions" />
          <Tab icon={<TrendingUp fontSize="small" />} iconPosition="start" label="2. Snapshot & Gap Notes" />
          <Tab icon={<Assignment fontSize="small" />} iconPosition="start" label="3. Priority Actions Roadmap" />
          <Tab icon={<Verified fontSize="small" />} iconPosition="start" label="4. Review & Sign-off" />
        </Tabs>
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 2, md: 3 }, pt: { xs: 1.5, md: 2 } }}>
        {/* ── TAB 0: DIAGNOSTIC QUESTIONS ── */}
        {activeTab === 0 && (
          <Box>
            <Grid container spacing={2.5}>
              {/* Left Column: Vertical Category Navigation Rail */}
              <Grid item xs={12} md={4} lg={3.5}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 2.5,
                    border: '1px solid #E2E8F0',
                    bgcolor: '#F8FAFC',
                    position: { md: 'sticky' },
                    top: 10,
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, px: 0.5 }}>
                    <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>
                      Diagnostic Areas (7)
                    </Typography>
                    <Typography variant="caption" fontWeight={700} color={BRAND.primaryMain}>
                      {Object.keys(answers).length} / {TBIP_CATEGORIES.reduce((acc, c) => acc + c.questions.length, 0)} answered
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {TBIP_CATEGORIES.map((cat, idx) => {
                      const cdata = diagnostic.categories[cat.name] || {};
                      const isSelected = activeCatIdx === idx;
                      const hasGap = (cdata.gaps || 0) > 0;
                      const catAnsweredCount = cat.questions.filter((q) => answers[q.id] !== undefined).length;
                      const isComplete = catAnsweredCount === cat.questions.length;

                      return (
                        <Paper
                          key={cat.id}
                          elevation={0}
                          onClick={() => setActiveCatIdx(idx)}
                          sx={{
                            p: 1.5,
                            borderRadius: 2,
                            cursor: 'pointer',
                            border: '1.5px solid',
                            borderColor: isSelected ? BRAND.primaryMain : '#E2E8F0',
                            bgcolor: isSelected ? '#F0FDF4' : '#FFFFFF',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              borderColor: isSelected ? BRAND.primaryMain : '#CBD5E1',
                              bgcolor: isSelected ? '#F0FDF4' : '#F8FAFC',
                              transform: 'translateX(2px)',
                            },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                              <Box
                                sx={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 14,
                                  bgcolor: isSelected ? BRAND.primaryMain : '#F1F5F9',
                                  color: isSelected ? '#fff' : BRAND.primaryMain,
                                  fontWeight: 800,
                                }}
                              >
                                {idx + 1}
                              </Box>
                              <Box>
                                <Typography
                                  variant="body2"
                                  fontWeight={isSelected ? 800 : 700}
                                  sx={{
                                    fontSize: 13,
                                    color: isSelected ? BRAND.primaryMain : '#1E293B',
                                    lineHeight: 1.2,
                                  }}
                                >
                                  {cat.icon} {cat.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, mt: 0.3, display: 'block' }}>
                                  {catAnsweredCount}/{cat.questions.length} answered
                                </Typography>
                              </Box>
                            </Box>

                            {/* Category Status Chip */}
                            <Chip
                              label={hasGap ? `${cdata.gaps} Gap${cdata.gaps > 1 ? 's' : ''}` : isComplete ? 'OK' : 'Pending'}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: 10.5,
                                fontWeight: 800,
                                bgcolor: hasGap ? '#FEE2E2' : isComplete ? '#ECFDF5' : '#F1F5F9',
                                color: hasGap ? '#991B1B' : isComplete ? '#065F46' : '#64748B',
                                border: '1px solid',
                                borderColor: hasGap ? '#F87171' : isComplete ? '#A7F3D0' : '#E2E8F0',
                              }}
                            />
                          </Box>
                        </Paper>
                      );
                    })}
                  </Box>
                </Paper>
              </Grid>

              {/* Right Column: Questions Canvas */}
              <Grid item xs={12} md={8} lg={8.5}>
                {/* Category Header Card */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    mb: 2,
                    borderRadius: 2,
                    bgcolor: '#FFFFFF',
                    border: '1.5px solid #E2E8F0',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ letterSpacing: 0.5 }}>
                        CATEGORY {activeCatIdx + 1} OF {TBIP_CATEGORIES.length}
                      </Typography>
                      <Typography variant="h6" fontWeight={800} color={BRAND.primaryMain} sx={{ fontSize: 17, mt: 0.2 }}>
                        {currentCategory.icon} {currentCategory.name}
                      </Typography>
                    </Box>
                    <Chip
                      label={currentCatData.status || 'In Assessment'}
                      size="small"
                      sx={{
                        fontWeight: 800,
                        fontSize: 11,
                        bgcolor: currentCatData.status === 'Critical Gap' ? '#FEE2E2' : currentCatData.status === 'Needs Improvement' ? '#FEF3C7' : '#ECFDF5',
                        color: currentCatData.status === 'Critical Gap' ? '#991B1B' : currentCatData.status === 'Needs Improvement' ? '#92400E' : '#065F46',
                      }}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: 12.5 }}>
                    Select <b>Yes</b> (Compliance/Strength), <b>No (Gap)</b> (Area needing intervention), or <b>N/A</b> (Not applicable) for each item below.
                  </Typography>
                </Paper>

                {/* Questions List */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {currentCategory.questions.map((q, qIdx) => {
                    const currentAns = answers[q.id];
                    return (
                      <Paper
                        key={q.id}
                        elevation={0}
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          border: '1.5px solid',
                          borderColor: currentAns === 'No' ? '#FCA5A5' : currentAns === 'Yes' ? '#A7F3D0' : '#E2E8F0',
                          bgcolor: currentAns === 'No' ? '#FFF5F5' : currentAns === 'Yes' ? '#F0FDF4' : '#FFFFFF',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Grid container spacing={1.5} alignItems="center">
                          <Grid item xs={12} sm={7} md={7.5}>
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                              <Typography sx={{ fontWeight: 800, fontSize: 13, color: '#64748B', minWidth: 26, pt: 0.2 }}>
                                #{qIdx + 1}
                              </Typography>
                              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B', lineHeight: 1.45 }}>
                                {q.text}
                              </Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={12} sm={5} md={4.5}>
                            <Box sx={{ display: 'flex', gap: 0.8, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                              <Button
                                size="small"
                                variant={currentAns === 'Yes' ? 'contained' : 'outlined'}
                                onClick={() => handleAnswerChange(q.id, 'Yes')}
                                disabled={isReadOnly}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: 11.5,
                                  px: 1.5,
                                  minWidth: 64,
                                  borderRadius: 1.5,
                                  bgcolor: currentAns === 'Yes' ? '#009B62' : 'transparent',
                                  color: currentAns === 'Yes' ? '#fff' : '#009B62',
                                  borderColor: '#009B62',
                                  '&:hover': { bgcolor: currentAns === 'Yes' ? '#007A4D' : '#ECFDF5' },
                                }}
                                startIcon={<Check fontSize="small" />}
                              >
                                Yes
                              </Button>
                              <Button
                                size="small"
                                variant={currentAns === 'No' ? 'contained' : 'outlined'}
                                onClick={() => handleAnswerChange(q.id, 'No')}
                                disabled={isReadOnly}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: 11.5,
                                  px: 1.5,
                                  minWidth: 84,
                                  borderRadius: 1.5,
                                  bgcolor: currentAns === 'No' ? BRAND.gizRed : 'transparent',
                                  color: currentAns === 'No' ? '#fff' : BRAND.gizRed,
                                  borderColor: BRAND.gizRed,
                                  '&:hover': { bgcolor: currentAns === 'No' ? BRAND.gizDarkRed : '#FFF1F2' },
                                }}
                                startIcon={<Close fontSize="small" />}
                              >
                                No (Gap)
                              </Button>
                              <Button
                                size="small"
                                variant={currentAns === 'N/A' ? 'contained' : 'outlined'}
                                onClick={() => handleAnswerChange(q.id, 'N/A')}
                                disabled={isReadOnly}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: 11.5,
                                  px: 1,
                                  minWidth: 50,
                                  borderRadius: 1.5,
                                  bgcolor: currentAns === 'N/A' ? '#64748B' : 'transparent',
                                  color: currentAns === 'N/A' ? '#fff' : '#64748B',
                                  borderColor: '#94A3B8',
                                  '&:hover': { bgcolor: currentAns === 'N/A' ? '#475569' : '#F1F5F9' },
                                }}
                                startIcon={<DoNotDisturb fontSize="small" />}
                              >
                                N/A
                              </Button>
                            </Box>
                          </Grid>
                        </Grid>
                      </Paper>
                    );
                  })}
                </Box>

                {/* Bottom Category Stepper Footer */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3, pt: 2, borderTop: '1px solid #E2E8F0' }}>
                  <Button
                    disabled={activeCatIdx === 0}
                    onClick={() => setActiveCatIdx((i) => i - 1)}
                    startIcon={<ArrowBack />}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Previous: {activeCatIdx > 0 ? TBIP_CATEGORIES[activeCatIdx - 1].name : ''}
                  </Button>
                  {activeCatIdx < TBIP_CATEGORIES.length - 1 ? (
                    <Button
                      variant="contained"
                      onClick={() => setActiveCatIdx((i) => i + 1)}
                      endIcon={<ArrowForward />}
                      sx={{ textTransform: 'none', fontWeight: 700, bgcolor: BRAND.primaryMain }}
                    >
                      Next: {TBIP_CATEGORIES[activeCatIdx + 1].name}
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      onClick={() => setActiveTab(1)}
                      endIcon={<ArrowForward />}
                      sx={{ textTransform: 'none', fontWeight: 700, bgcolor: BRAND.gopaGold, color: '#262523', '&:hover': { bgcolor: BRAND.gopaGoldHover } }}
                    >
                      Proceed to Snapshot & Notes
                    </Button>
                  )}
                </Box>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* ── TAB 1: DIAGNOSTIC SNAPSHOT & GAP NOTES ── */}
        {activeTab === 1 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2 }}>
              <b>Diagnostic Snapshot</b> is automatically computed from your Yes/No answers. Please record a concise <b>BGE Note on Key Gap</b> for each category where challenges were identified.
            </Alert>

            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #CBD5E1', borderRadius: 2, mb: 3 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#1A365D' }}>
                  <TableRow>
                    <TableCell sx={{ color: '#fff', fontWeight: 700, py: 1.2 }}>Category</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700, py: 1.2, width: 140 }} align="center">Status</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700, py: 1.2, width: 150 }} align="center">Gaps / Applicable</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700, py: 1.2 }}>BGE Note on Key Gap</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {TBIP_CATEGORIES.map((cat) => {
                    const cdata = diagnostic.categories[cat.name] || {};
                    const isCritical = cdata.status === 'Critical Gap';
                    const isNeedsImp = cdata.status === 'Needs Improvement';
                    const isSatisfactory = cdata.status === 'Satisfactory';

                    return (
                      <TableRow key={cat.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: 13.5, color: BRAND.primaryMain }}>
                          {cat.icon} {cat.name}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={cdata.status || 'N/A'}
                            size="small"
                            sx={{
                              fontWeight: 800,
                              fontSize: 11,
                              bgcolor: isCritical ? '#FEE2E2' : isNeedsImp ? '#FEF3C7' : isSatisfactory ? '#ECFDF5' : '#F1F5F9',
                              color: isCritical ? '#991B1B' : isNeedsImp ? '#92400E' : isSatisfactory ? '#065F46' : '#64748B',
                              border: '1px solid',
                              borderColor: isCritical ? '#F87171' : isNeedsImp ? '#FBBF24' : isSatisfactory ? '#A7F3D0' : '#CBD5E1',
                            }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={800} color={cdata.gaps > 0 ? '#C8102E' : '#009B62'}>
                            {cdata.ratio || `${cdata.gaps || 0} / ${cdata.applicable || 0}`}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={cdata.applicable > 0 ? (cdata.gaps / cdata.applicable) * 100 : 0}
                            sx={{
                              height: 5,
                              borderRadius: 3,
                              mt: 0.5,
                              bgcolor: '#E2E8F0',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: isCritical ? '#C8102E' : isNeedsImp ? '#F59E0B' : '#009B62',
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ py: 1 }}>
                          <TextField
                            size="small"
                            fullWidth
                            placeholder={`Observations & key gaps for ${cat.name}...`}
                            value={gapNotes[cat.name] || ''}
                            onChange={(e) => handleGapNoteChange(cat.name, e.target.value)}
                            disabled={isReadOnly}
                            multiline
                            maxRows={3}
                            sx={{ '& .MuiInputBase-root': { fontSize: 13 } }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Summary Row */}
                  <TableRow sx={{ bgcolor: '#F8FAFC', borderTop: '2px solid #CBD5E1' }}>
                    <TableCell sx={{ fontWeight: 800, fontSize: 14 }}>
                      Overall Priority & Gaps Total
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={`${diagnostic.overallPriority} Priority`}
                        sx={{
                          bgcolor: priorityColor(diagnostic.overallPriority).bg,
                          color: priorityColor(diagnostic.overallPriority).text,
                          fontWeight: 900,
                          fontSize: 12,
                          border: `1.5px solid ${priorityColor(diagnostic.overallPriority).border}`,
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="subtitle2" fontWeight={900} color={diagnostic.totalGaps > 0 ? '#C8102E' : '#009B62'}>
                        {diagnostic.totalGaps} / {diagnostic.totalApplicable} gaps
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        Overall priority calculated across all applicable assessment areas.
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              <Button onClick={() => setActiveTab(0)} startIcon={<ArrowBack />} sx={{ textTransform: 'none' }}>
                Back to Questions
              </Button>
              <Button
                variant="contained"
                onClick={() => setActiveTab(2)}
                endIcon={<ArrowForward />}
                sx={{ textTransform: 'none', fontWeight: 700, bgcolor: BRAND.gopaGold, color: '#262523', '&:hover': { bgcolor: BRAND.gopaGoldHover } }}
              >
                Proceed to Priority Actions (TBIP)
              </Button>
            </Box>
          </Box>
        )}

        {/* ── TAB 2: PRIORITY ACTIONS ROADMAP (TBIP) ── */}
        {activeTab === 2 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={800} color={BRAND.primaryMain}>
                  Priority Actions — Technical Business Improvement Plan
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Define <b>3 to 5 high-impact priority actions</b> addressing the diagnostic gaps identified above.
                </Typography>
              </Box>
              {!isReadOnly && priorityActions.length < 5 && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Add />}
                  onClick={handleAddAction}
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  Add Priority Action
                </Button>
              )}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {priorityActions.map((act, idx) => (
                <Paper
                  key={idx}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: '1.5px solid #CBD5E1',
                    bgcolor: '#FFFFFF',
                    position: 'relative',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={`Priority Action #${idx + 1}`} size="small" sx={{ bgcolor: BRAND.primaryMain, color: '#fff', fontWeight: 800 }} />
                      <FormControl size="small" sx={{ minWidth: 220 }}>
                        <Select
                          value={act.category || 'Governance & Strategy'}
                          onChange={(e) => handleActionChange(idx, 'category', e.target.value)}
                          disabled={isReadOnly}
                          sx={{ fontSize: 13, fontWeight: 600, height: 32 }}
                        >
                          {TBIP_CATEGORIES.map((cat) => (
                            <MenuItem key={cat.id} value={cat.name} sx={{ fontSize: 13 }}>
                              {cat.icon} {cat.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                    {!isReadOnly && priorityActions.length > 1 && (
                      <IconButton size="small" color="error" onClick={() => handleRemoveAction(idx)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    )}
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        size="small"
                        label="Priority Action Description"
                        placeholder="e.g. Set up a digital accounting system and train the manager on daily reconciliation"
                        value={act.action || act.priority_action || ''}
                        onChange={(e) => handleActionChange(idx, 'action', e.target.value)}
                        disabled={isReadOnly}
                        fullWidth
                        multiline
                        rows={2}
                        required
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        size="small"
                        label="Expected Outcome"
                        placeholder="e.g. Clean monthly financial records and cashflow visibility by end of month 2"
                        value={act.outcome || act.expected_outcome || ''}
                        onChange={(e) => handleActionChange(idx, 'outcome', e.target.value)}
                        disabled={isReadOnly}
                        fullWidth
                        multiline
                        rows={2}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        size="small"
                        label="Owner (BGE / MSME Lead)"
                        value={act.owner || act.owner_bge || ''}
                        onChange={(e) => handleActionChange(idx, 'owner', e.target.value)}
                        disabled={isReadOnly}
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        size="small"
                        label="Timeline"
                        placeholder="e.g. Within 30 days / Q3 2026"
                        value={act.timeline || ''}
                        onChange={(e) => handleActionChange(idx, 'timeline', e.target.value)}
                        disabled={isReadOnly}
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <FormControl size="small" fullWidth>
                        <InputLabel>Status</InputLabel>
                        <Select
                          label="Status"
                          value={act.status || 'Pending'}
                          onChange={(e) => handleActionChange(idx, 'status', e.target.value)}
                          disabled={isReadOnly}
                        >
                          <MenuItem value="Pending">Pending</MenuItem>
                          <MenuItem value="In Progress">In Progress</MenuItem>
                          <MenuItem value="Completed">Completed</MenuItem>
                          <MenuItem value="Deferred">Deferred</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </Paper>
              ))}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              <Button onClick={() => setActiveTab(1)} startIcon={<ArrowBack />} sx={{ textTransform: 'none' }}>
                Back to Snapshot
              </Button>
              <Button
                variant="contained"
                onClick={() => setActiveTab(3)}
                endIcon={<ArrowForward />}
                sx={{ textTransform: 'none', fontWeight: 700, bgcolor: BRAND.gopaGold, color: '#262523', '&:hover': { bgcolor: BRAND.gopaGoldHover } }}
              >
                Proceed to Review & Sign-off
              </Button>
            </Box>
          </Box>
        )}

        {/* ── TAB 3: REVIEW & SIGN-OFF / APPROVAL ── */}
        {activeTab === 3 && (
          <Box>
            <Grid container spacing={3}>
              {/* Summary Left Column */}
              <Grid item xs={12} md={7}>
                <Typography variant="subtitle1" fontWeight={800} color={BRAND.primaryMain} sx={{ mb: 1.5 }}>
                  Assessment Summary
                </Typography>
                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid #CBD5E1', bgcolor: '#F8FAFC', mb: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">MSME</Typography>
                      <Typography variant="body2" fontWeight={700}>{msme?.name || plan?.msme_name}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Assessment Date</Typography>
                      <Typography variant="body2" fontWeight={700}>{assessmentDate}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Lead BGE</Typography>
                      <Typography variant="body2" fontWeight={700}>{bge?.name || plan?.bge_name || '—'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Overall Priority</Typography>
                      <Typography variant="body2" fontWeight={800} color={priorityColor(diagnostic.overallPriority).text}>
                        {diagnostic.overallPriority} ({diagnostic.totalGaps} gaps identified)
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>

                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                  Action Roadmap ({priorityActions.length} actions)
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {priorityActions.map((act, i) => (
                    <Box key={i} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="body2" fontWeight={700} color={BRAND.primaryMain}>
                          #{i + 1}. {act.category}
                        </Typography>
                        <Chip label={act.status || 'Pending'} size="small" sx={{ fontSize: 10, height: 20 }} />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
                        {act.action || act.priority_action || '—'}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary"><b>Timeline:</b> {act.timeline || '—'}</Typography>
                        <Typography variant="caption" color="text.secondary"><b>Owner:</b> {act.owner || act.owner_bge || '—'}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Grid>

              {/* Sign-off & Actions Right Column */}
              <Grid item xs={12} md={5}>
                {/* BGE Sign-off Block */}
                <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1.5px solid #CBD5E1', bgcolor: '#FFFFFF', mb: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <FactCheck color="primary" />
                    <Typography variant="subtitle1" fontWeight={800} color={BRAND.primaryMain}>
                      BGE Sign-off
                    </Typography>
                  </Box>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={bgeSigned}
                        onChange={(e) => setBgeSigned(e.target.checked)}
                        disabled={isReadOnly}
                        color="success"
                      />
                    }
                    label={
                      <Typography variant="body2" fontWeight={600} sx={{ fontSize: 13 }}>
                        I confirm this MSME diagnostic assessment and improvement plan was conducted and verified in the field.
                      </Typography>
                    }
                  />

                  <TextField
                    size="small"
                    label="BGE Sign-off Name"
                    value={bgeSignOffName}
                    onChange={(e) => setBgeSignOffName(e.target.value)}
                    disabled={isReadOnly}
                    fullWidth
                    sx={{ mt: 1.5 }}
                  />

                  {plan?.bge_signed_at && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      Signed on: <b>{String(plan.bge_signed_at)}</b>
                    </Typography>
                  )}
                </Paper>

                {/* Head of Assignment Approval Block (Admins / Cohort Admins) */}
                {isAdminOrManager && (
                  <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1.5px solid #CBD5E1', bgcolor: isApproved ? '#F0FDF4' : '#FFFBEB', mb: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Verified color={isApproved ? 'success' : 'warning'} />
                      <Typography variant="subtitle1" fontWeight={800} color={BRAND.primaryMain}>
                        Head of Assignment Approval
                      </Typography>
                    </Box>

                    <TextField
                      size="small"
                      label="Approval / Review Notes"
                      placeholder="Feedback, comments, or endorsement notes..."
                      value={hoaNotes}
                      onChange={(e) => setHoaNotes(e.target.value)}
                      disabled={isApproved}
                      fullWidth
                      multiline
                      rows={2}
                      sx={{ mb: 1.5 }}
                    />

                    <TextField
                      size="small"
                      label="Head of Assignment Sign-off Name"
                      value={hoaSignOffName}
                      onChange={(e) => setHoaSignOffName(e.target.value)}
                      disabled={isApproved}
                      fullWidth
                    />

                    {plan?.hoa_approved_at && (
                      <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 1, fontWeight: 700 }}>
                        Approved on: {String(plan.hoa_approved_at)} by {plan.hoa_sign_off_name || plan.hoa_approved_by_name}
                      </Typography>
                    )}

                    {!isApproved && plan?.id && (
                      <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
                        <Button
                          variant="contained"
                          color="success"
                          fullWidth
                          onClick={handleApprove}
                          disabled={approving}
                          startIcon={approving ? <CircularProgress size={16} /> : <CheckCircle />}
                          sx={{ fontWeight: 700, textTransform: 'none' }}
                        >
                          Approve Plan
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          onClick={handleReject}
                          disabled={approving}
                          sx={{ fontWeight: 700, textTransform: 'none' }}
                        >
                          Return
                        </Button>
                      </Box>
                    )}
                  </Paper>
                )}
              </Grid>
            </Grid>
          </Box>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2.5, justifyContent: 'space-between', bgcolor: '#F8FAFC' }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', color: '#64748B', fontWeight: 600 }}>
          Close
        </Button>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {!isReadOnly && (
            <Button
              variant="outlined"
              onClick={() => handleSave('draft')}
              disabled={saving || submitting}
              startIcon={saving ? <CircularProgress size={16} /> : <Save />}
              sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#CBD5E1', color: BRAND.primaryMain }}
            >
              Save Draft
            </Button>
          )}

          {!isReadOnly && !isApproved && (
            <Button
              variant="contained"
              onClick={handleSubmitForApproval}
              disabled={saving || submitting}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <Send />}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                bgcolor: BRAND.gizRed,
                '&:hover': { bgcolor: BRAND.gizDarkRed },
              }}
            >
              Submit for HOA Approval
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
}
