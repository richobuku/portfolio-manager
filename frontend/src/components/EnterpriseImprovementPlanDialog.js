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
  Add, Delete, Assignment,
  TrendingUp, FactCheck, ArrowForward, ArrowBack, Verified,
  AutoAwesome, ArrowUpward, ArrowDownward,
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

// ── 3 Core Diagnostic Pillars & Questions ──────────────────────────────────
export const TBIP_CATEGORIES = [
  {
    id: 'finance',
    name: 'Financial Management',
    icon: '💰',
    description: 'Approval processes, banking discipline, vouchers, 12-month projections, and cash controls.',
    questions: [
      {
        id: 'fin_1',
        text: 'Does the business have financial management guidelines (approval process, cash movement)?',
        helpText: 'Defined approval thresholds, expenditure authorizations, and cash security guidelines.',
      },
      {
        id: 'fin_2',
        text: 'Does the business bank all their income/revenue before spending it?',
        helpText: 'Discipline of depositing 100% of sales collections into the bank account prior to expenditures.',
      },
      {
        id: 'fin_3',
        text: 'Are there accounting processes defined, including purchase orders, LPOs, and payment requests?',
        helpText: 'Standardized documentation for procurement, local purchase orders (LPOs), and payment vouchers.',
      },
      {
        id: 'fin_4',
        text: 'Does the business have financial projections / financial model for their business for the next 12 months?',
        helpText: '12-month revenue forecasts, operational budgets, cashflow models, or financial plan.',
      },
      {
        id: 'fin_5',
        text: 'Is there a designated person to handle business cash/finances?',
        helpText: 'Assigned bookkeeper, finance officer, or dedicated personnel managing daily accounts.',
      },
    ],
  },
  {
    id: 'hr',
    name: 'Human Resources (HR)',
    icon: '👥',
    description: 'Written employment contracts, clear TORs, organogram, staff training, HR policies, and KPIs.',
    questions: [
      {
        id: 'hr_1',
        text: 'Does the business have contracts for employees?',
        helpText: 'Formal written employment contracts or engagement letters signed by both parties on company file.',
      },
      {
        id: 'hr_6',
        text: 'Are the contracts performance-based?',
        helpText: 'Employment contracts tied to clear performance deliverables, milestones, or measurable targets.',
      },
      {
        id: 'hr_2',
        text: 'Are the TOR / roles clear and written down?',
        helpText: 'Clear Terms of Reference (TOR) or job descriptions outlining responsibilities for every role.',
      },
      {
        id: 'hr_3',
        text: 'Is there an organogram?',
        helpText: 'Documented organizational hierarchy / reporting structure showing lines of authority.',
      },
      {
        id: 'hr_4',
        text: 'Is the staff trained?',
        helpText: 'Structured on-the-job training, technical capacity building, or skills development programs.',
      },
      {
        id: 'hr_5',
        text: 'Is there an HR policy in place?',
        helpText: 'Documented human resources policies governing workplace rules, leave, code of conduct, and disciplinary actions.',
      },
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing & Sales',
    icon: '📈',
    description: 'Customer database, data utilization, Value Proposition Canvas, partner lists, and dedicated sales.',
    questions: [
      {
        id: 'mkt_1',
        text: 'Does the business maintain a customer database?',
        helpText: 'Structured directory of buyers/clients with contact details, locations, and purchase history.',
      },
      {
        id: 'mkt_2',
        text: 'Does the business utilise their database?',
        helpText: 'Actively using customer data for follow-ups, re-orders, promotional outreach, and client retention.',
      },
      {
        id: 'mkt_3',
        text: 'Is there a clear Value Proposition Canvas / statement (does the business understand exactly who their customers are)?',
        helpText: 'Defined customer personas, customer pains/gains, and a compelling value proposition statement.',
      },
      {
        id: 'mkt_4',
        text: 'Does the business maintain a partner database?',
        helpText: 'Structured directory of institutional buyers, bulk off-takers, suppliers, and strategic ecosystem partners.',
      },
      {
        id: 'mkt_5',
        text: 'Is there a dedicated sales team with clear targets?',
        helpText: 'Specific individuals responsible for selling, business development, with clear revenue goals.',
      },
    ],
  },
];

// ── Preset Help Needed Catalog grouped by Category ────────────────────────
export const HELP_NEEDED_CATALOG = {
  'Financial Management': [
    'Financial Management Guidelines & Approval Thresholds',
    '100% Revenue Banking Discipline & Cash Control',
    'Accounting Processes (Purchase Orders, LPOs & Vouchers)',
    '12-Month Financial Projections & Cash Flow Model',
    'Designated Bookkeeper / Finance Personnel Setup',
  ],
  'Human Resources (HR)': [
    'Written Employment Contracts for Staff',
    'Performance-Based Contracts & KPI Target Setting',
    'Clear Terms of Reference (TOR) & Job Descriptions',
    'Organizational Structure & Organogram Design',
    'Staff Technical & Operational Capacity Training',
    'Documented HR Policy Manual & Workplace Rules',
  ],
  'Marketing & Sales': [
    'Customer Database Setup & Profiling',
    'Customer Database Utilization & CRM Follow-ups',
    'Value Proposition Canvas & Customer Segmentation',
    'Strategic Partner & Bulk Off-taker Directory',
    'Dedicated Sales Team Structure & Target Setting',
  ],
};

// Map each question ID to its corresponding help topic for the 1-click Auto-Detect
export const QUESTION_HELP_MAP = {
  fin_1: 'Financial Management Guidelines & Approval Thresholds',
  fin_2: '100% Revenue Banking Discipline & Cash Control',
  fin_3: 'Accounting Processes (Purchase Orders, LPOs & Vouchers)',
  fin_4: '12-Month Financial Projections & Cash Flow Model',
  fin_5: 'Designated Bookkeeper / Finance Personnel Setup',
  hr_1: 'Written Employment Contracts for Staff',
  hr_2: 'Clear Terms of Reference (TOR) & Job Descriptions',
  hr_3: 'Organizational Structure & Organogram Design',
  hr_4: 'Staff Technical & Operational Capacity Training',
  hr_5: 'Documented HR Policy Manual & Workplace Rules',
  hr_6: 'Performance-Based Contracts & KPI Target Setting',
  mkt_1: 'Customer Database Setup & Profiling',
  mkt_2: 'Customer Database Utilization & CRM Follow-ups',
  mkt_3: 'Value Proposition Canvas & Customer Segmentation',
  mkt_4: 'Strategic Partner & Bulk Off-taker Directory',
  mkt_5: 'Dedicated Sales Team Structure & Target Setting',
};

// ── Diagnostic Scoring Function with 3-tier Weighting ──────────────────────
export function computeLocalDiagnostic(answers) {
  const categories = {};
  let totalApplicable = 0;
  let totalAvailable = 0;
  let totalNeedsImp = 0;
  let totalNotAvail = 0;
  let totalScorePts = 0;
  let totalMaxPts = 0;

  TBIP_CATEGORIES.forEach((cat) => {
    let applicable = 0;
    let available = 0;
    let needsImp = 0;
    let notAvail = 0;
    let catScorePts = 0;

    cat.questions.forEach((q) => {
      const a = answers[q.id];
      if (a) {
        applicable++;
        if (a === 'Available and complete' || a === 'Yes') {
          available++;
          catScorePts += 2;
        } else if (a === 'Needs improvement') {
          needsImp++;
          catScorePts += 1;
        } else if (a === 'Not available' || a === 'No') {
          notAvail++;
        }
      }
    });

    const catMaxPts = applicable * 2;
    let status = 'Not Assessed';
    let scorePct = 0;
    let gapPct = 0;

    if (applicable > 0) {
      scorePct = Math.round((catScorePts / catMaxPts) * 100);
      gapPct = 100 - scorePct;
      if (scorePct >= 80) status = 'Satisfactory';
      else if (scorePct >= 50) status = 'Needs Improvement';
      else status = 'Critical Gap';
    }

    totalApplicable += applicable;
    totalAvailable += available;
    totalNeedsImp += needsImp;
    totalNotAvail += notAvail;
    totalScorePts += catScorePts;
    totalMaxPts += catMaxPts;

    categories[cat.name] = {
      total: cat.questions.length,
      applicable,
      available,
      needsImprovement: needsImp,
      notAvailable: notAvail,
      gaps: notAvail + needsImp,
      criticalGaps: notAvail,
      status,
      scorePct,
      gapPct,
      ratio: `${notAvail} missing · ${needsImp} needs imp`,
    };
  });

  const totalGaps = totalNotAvail + totalNeedsImp;
  const overallScorePct = totalMaxPts > 0 ? Math.round((totalScorePts / totalMaxPts) * 100) : 0;

  let overallPriority = 'Low';
  if (totalApplicable > 0) {
    if (overallScorePct < 50 || totalNotAvail >= 3) overallPriority = 'High';
    else if (overallScorePct < 75 || totalNotAvail >= 1 || totalNeedsImp >= 3) overallPriority = 'Medium';
    else overallPriority = 'Low';
  }

  return {
    categories,
    totalGaps,
    totalApplicable,
    totalAvailable,
    totalNeedsImp,
    totalNotAvail,
    overallScorePct,
    overallPriority,
  };
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
  const [helpNeededAreas, setHelpNeededAreas] = useState(() => plan?.help_needed_areas || []);
  const [helpNeededDescription, setHelpNeededDescription] = useState(() => plan?.help_needed_description || '');

  // Priority Actions State with ranking, BGE days, and means of verification
  const [priorityActions, setPriorityActions] = useState(() => {
    if (plan?.priority_actions && plan.priority_actions.length > 0) {
      return plan.priority_actions.map((act, i) => ({
        ...act,
        ranking: act.ranking || i + 1,
        priority_level: act.priority_level || 'High',
        bge_support_days: act.bge_support_days != null ? act.bge_support_days : 2,
        means_of_verification: act.means_of_verification || '',
      }));
    }
    return [
      {
        id: 1,
        ranking: 1,
        priority_level: 'High',
        action: '',
        category: 'Financial Management',
        bge_support_days: 2,
        means_of_verification: '',
        owner: bge?.name || '',
        timeline: 'Within 30 days',
        outcome: '',
        status: 'Pending',
      },
      {
        id: 2,
        ranking: 2,
        priority_level: 'Medium',
        action: '',
        category: 'Human Resources (HR)',
        bge_support_days: 2,
        means_of_verification: '',
        owner: bge?.name || '',
        timeline: 'Within 60 days',
        outcome: '',
        status: 'Pending',
      },
      {
        id: 3,
        ranking: 3,
        priority_level: 'Medium',
        action: '',
        category: 'Marketing & Sales',
        bge_support_days: 2,
        means_of_verification: '',
        owner: bge?.name || '',
        timeline: 'Within 90 days',
        outcome: '',
        status: 'Pending',
      },
    ];
  });

  const [bgeSigned, setBgeSigned] = useState(() => plan?.bge_signed || false);
  const [bgeSignOffName, setBgeSignOffName] = useState(() => plan?.bge_sign_off_name || bge?.name || currentUser?.name || '');
  const [hoaNotes, setHoaNotes] = useState(() => plan?.hoa_notes || '');
  const [hoaSignOffName, setHoaSignOffName] = useState(() => plan?.hoa_sign_off_name || currentUser?.name || '');

  // Live Diagnostic Metrics
  const diagnostic = useMemo(() => computeLocalDiagnostic(answers), [answers]);

  // Total BGE Support Days
  const totalBgeSupportDays = useMemo(() => {
    return priorityActions.reduce((sum, act) => {
      const d = parseInt(act.bge_support_days, 10);
      return sum + (isNaN(d) ? 0 : d);
    }, 0);
  }, [priorityActions]);

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
      setHelpNeededAreas(plan.help_needed_areas || []);
      setHelpNeededDescription(plan.help_needed_description || '');
      setPriorityActions(
        plan.priority_actions?.length > 0
          ? plan.priority_actions.map((act, i) => ({
              ...act,
              ranking: act.ranking || i + 1,
              priority_level: act.priority_level || 'High',
              bge_support_days: act.bge_support_days != null ? act.bge_support_days : 2,
              means_of_verification: act.means_of_verification || '',
            }))
          : [
              { id: 1, ranking: 1, priority_level: 'High', action: '', category: 'Financial Management', bge_support_days: 2, means_of_verification: '', owner: bge?.name || '', timeline: 'Within 30 days', outcome: '', status: 'Pending' },
              { id: 2, ranking: 2, priority_level: 'Medium', action: '', category: 'Human Resources (HR)', bge_support_days: 2, means_of_verification: '', owner: bge?.name || '', timeline: 'Within 60 days', outcome: '', status: 'Pending' },
              { id: 3, ranking: 3, priority_level: 'Medium', action: '', category: 'Marketing & Sales', bge_support_days: 2, means_of_verification: '', owner: bge?.name || '', timeline: 'Within 90 days', outcome: '', status: 'Pending' },
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
      setHelpNeededAreas([]);
      setHelpNeededDescription('');
      setPriorityActions([
        { id: 1, ranking: 1, priority_level: 'High', action: '', category: 'Financial Management', bge_support_days: 2, means_of_verification: '', owner: bge?.name || '', timeline: 'Within 30 days', outcome: '', status: 'Pending' },
        { id: 2, ranking: 2, priority_level: 'Medium', action: '', category: 'Human Resources (HR)', bge_support_days: 2, means_of_verification: '', owner: bge?.name || '', timeline: 'Within 60 days', outcome: '', status: 'Pending' },
        { id: 3, ranking: 3, priority_level: 'Medium', action: '', category: 'Marketing & Sales', bge_support_days: 2, means_of_verification: '', owner: bge?.name || '', timeline: 'Within 90 days', outcome: '', status: 'Pending' },
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

  // Toggle help area tag
  const handleToggleHelpArea = (topic) => {
    if (isReadOnly) return;
    setHelpNeededAreas((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  // 1-Click Auto-Detect Help Areas from Gaps
  const handleAutoDetectHelpAreas = () => {
    if (isReadOnly) return;
    const detected = new Set(helpNeededAreas);
    let addedCount = 0;
    TBIP_CATEGORIES.forEach((cat) => {
      cat.questions.forEach((q) => {
        const a = answers[q.id];
        if (a === 'Not available' || a === 'Needs improvement' || a === 'No') {
          const topic = QUESTION_HELP_MAP[q.id];
          if (topic && !detected.has(topic)) {
            detected.add(topic);
            addedCount++;
          }
        }
      });
    });
    setHelpNeededAreas(Array.from(detected));
    if (addedCount > 0) {
      notify?.(`Auto-selected ${addedCount} help areas based on diagnostic gaps.`, 'success');
    } else {
      notify?.('All identified diagnostic gaps are already in your help list.', 'info');
    }
  };

  // Action handlers
  const handleAddAction = () => {
    if (isReadOnly) return;
    setPriorityActions((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        ranking: prev.length + 1,
        priority_level: 'High',
        action: '',
        category: 'Financial Management',
        bge_support_days: 2,
        means_of_verification: '',
        owner: bge?.name || '',
        timeline: 'Within 30 days',
        outcome: '',
        status: 'Pending',
      },
    ]);
  };

  const handleRemoveAction = (idx) => {
    if (isReadOnly) return;
    setPriorityActions((prev) =>
      prev.filter((_, i) => i !== idx).map((act, i) => ({ ...act, ranking: i + 1 }))
    );
  };

  const handleMoveAction = (idx, direction) => {
    if (isReadOnly) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= priorityActions.length) return;
    setPriorityActions((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy.map((act, i) => ({ ...act, ranking: i + 1 }));
    });
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
    help_needed_areas: helpNeededAreas,
    help_needed_description: helpNeededDescription,
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
      link.setAttribute('download', `TBIP_${msme?.business_name || msme?.name || 'MSME'}_${assessmentDate}.pdf`);
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
      link.setAttribute('download', `TBIP_${msme?.business_name || msme?.name || 'MSME'}_${assessmentDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      notify?.('Failed to download Excel workbook.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const currentCategory = TBIP_CATEGORIES[activeCatIdx] || TBIP_CATEGORIES[0];
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

  const totalQuestionsCount = useMemo(
    () => TBIP_CATEGORIES.reduce((acc, c) => acc + c.questions.length, 0),
    []
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      disableScrollLock
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          minHeight: '85vh',
          bgcolor: '#FAFBFD',
        },
      }}
    >
      {/* Brand Top Header Accent */}
      <Box sx={{ height: 4, background: `linear-gradient(90deg, ${BRAND.gopaGold} 0%, ${BRAND.gopaGold} 50%, ${BRAND.gizRed} 50%, ${BRAND.gizRed} 100%)` }} />

      <DialogTitle sx={{ p: 2.5, pb: 1.5, bgcolor: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}>
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
              MSME Diagnostic Assessment & Technical Business Improvement Plan (TBIP) · <b>{msme?.business_name || msme?.name || plan?.msme_name}</b> ({msme?.msme_code || plan?.msme_code || '—'})
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {plan?.id && (
              <>
                <Tooltip title="Download official PRUDEV II branded PDF">
                  <Button size="small" variant="outlined" startIcon={<Download />} onClick={handleDownloadPdf} disabled={downloading} sx={{ fontSize: 12, textTransform: 'none', fontWeight: 700 }}>
                    PDF
                  </Button>
                </Tooltip>
                <Tooltip title="Download Excel template workbook">
                  <Button size="small" variant="outlined" startIcon={<Download />} onClick={handleDownloadExcel} disabled={downloading} sx={{ fontSize: 12, textTransform: 'none', fontWeight: 700 }}>
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
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', fontSize: 11 }}>
                CAPACITY READINESS
              </Typography>
              <Typography variant="subtitle1" fontWeight={800} color={diagnostic.overallScorePct >= 75 ? '#009B62' : diagnostic.overallScorePct >= 50 ? '#D97706' : '#C8102E'}>
                {diagnostic.overallScorePct}%
                <Typography component="span" sx={{ ml: 0.8, fontSize: 12, fontWeight: 600, color: '#64748B' }}>
                  ({diagnostic.totalNotAvail} missing · {diagnostic.totalNeedsImp} needs imp)
                </Typography>
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', fontSize: 11 }}>
                TOTAL BGE SUPPORT DAYS
              </Typography>
              <Typography variant="subtitle2" fontWeight={800} color={BRAND.primaryMain}>
                ⏱️ {totalBgeSupportDays} Coaching Days
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', fontSize: 11 }}>
                LEAD BGE
              </Typography>
              <Typography variant="subtitle2" fontWeight={700} color={BRAND.primaryMain}>
                {bge?.name || plan?.bge_name || '—'}
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', fontSize: 11 }}>
                ASSESSMENT DATE
              </Typography>
              <Typography variant="subtitle2" fontWeight={700} color={BRAND.primaryMain}>
                {assessmentDate}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={`${helpNeededAreas.length} Help Areas Tagged`}
              size="small"
              sx={{ fontWeight: 700, bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}
            />
            <Chip
              label={`${priorityActions.length} Priority Actions`}
              size="small"
              sx={{ fontWeight: 700, bgcolor: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}
            />
          </Box>
        </Box>

        {/* Navigation Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            mt: 1.5,
            '& .MuiTab-root': {
              fontWeight: 700,
              textTransform: 'none',
              fontSize: 13.5,
              minHeight: 44,
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
          <Tab icon={<TrendingUp fontSize="small" />} iconPosition="start" label="2. Snapshot & Capacity Needs" />
          <Tab icon={<Assignment fontSize="small" />} iconPosition="start" label="3. Priority Actions Roadmap" />
          <Tab icon={<Verified fontSize="small" />} iconPosition="start" label="4. Review & Sign-off" />
        </Tabs>
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 2, md: 3 }, pt: { xs: 2, md: 2.5 } }}>
        {/* ── TAB 0: DIAGNOSTIC QUESTIONS (3 CORE PILLARS) ── */}
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
                    bgcolor: '#FFFFFF',
                    position: { md: 'sticky' },
                    top: 10,
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, px: 0.5 }}>
                    <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>
                      Operational Pillars (3)
                    </Typography>
                    <Typography variant="caption" fontWeight={700} color={BRAND.primaryMain}>
                      {Object.keys(answers).length} / {totalQuestionsCount} Answered
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {TBIP_CATEGORIES.map((cat, idx) => {
                      const cdata = diagnostic.categories[cat.name] || {};
                      const isSelected = activeCatIdx === idx;
                      const catAnsweredCount = cat.questions.filter((q) => answers[q.id] !== undefined).length;
                      const isComplete = catAnsweredCount === cat.questions.length;
                      const hasCritical = (cdata.notAvailable || 0) > 0;
                      const hasNeedsImp = (cdata.needsImprovement || 0) > 0;

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
                                  fontSize: 13,
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
                                  {catAnsweredCount}/{cat.questions.length} answered {isComplete && '✓'}
                                </Typography>
                              </Box>
                            </Box>

                            <Chip
                              label={
                                hasCritical
                                  ? `${cdata.notAvailable} Missing`
                                  : hasNeedsImp
                                  ? `${cdata.needsImprovement} Needs Imp.`
                                  : isComplete
                                  ? '100% OK'
                                  : 'Pending'
                              }
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: 10,
                                fontWeight: 800,
                                bgcolor: hasCritical ? '#FEE2E2' : hasNeedsImp ? '#FEF3C7' : isComplete ? '#ECFDF5' : '#F1F5F9',
                                color: hasCritical ? '#991B1B' : hasNeedsImp ? '#92400E' : isComplete ? '#065F46' : '#64748B',
                                border: '1px solid',
                                borderColor: hasCritical ? '#F87171' : hasNeedsImp ? '#FBBF24' : isComplete ? '#A7F3D0' : '#E2E8F0',
                              }}
                            />
                          </Box>
                        </Paper>
                      );
                    })}
                  </Box>

                  {/* Summary progress bar */}
                  <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #E2E8F0' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>Overall Readiness</Typography>
                      <Typography variant="caption" fontWeight={800} color={BRAND.primaryMain}>{diagnostic.overallScorePct}%</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={diagnostic.overallScorePct}
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        bgcolor: '#E2E8F0',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: diagnostic.overallScorePct >= 75 ? '#009B62' : diagnostic.overallScorePct >= 50 ? '#D97706' : '#C8102E',
                        },
                      }}
                    />
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
                        PILLAR {activeCatIdx + 1} OF {TBIP_CATEGORIES.length}
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
                    {currentCategory.description}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#64748B', fontWeight: 600 }}>
                    Select: <b>Available and complete</b> (Full Strength), <b>Needs improvement</b> (Partial / In progress), or <b>Not available</b> (Gap).
                  </Typography>
                </Paper>

                {/* Questions List */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {currentCategory.questions.map((q, qIdx) => {
                    const currentAns = answers[q.id];
                    const isAvailable = currentAns === 'Available and complete' || currentAns === 'Yes';
                    const isNeedsImp = currentAns === 'Needs improvement';
                    const isNotAvail = currentAns === 'Not available' || currentAns === 'No';

                    return (
                      <Paper
                        key={q.id}
                        elevation={0}
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          border: '1.5px solid',
                          borderColor: isNotAvail ? '#FCA5A5' : isNeedsImp ? '#FCD34D' : isAvailable ? '#A7F3D0' : '#E2E8F0',
                          bgcolor: isNotAvail ? '#FFF5F5' : isNeedsImp ? '#FFFBEB' : isAvailable ? '#F0FDF4' : '#FFFFFF',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Grid container spacing={1.5} alignItems="center">
                          <Grid item xs={12} lg={6.5}>
                            <Box sx={{ display: 'flex', gap: 1.2, alignItems: 'flex-start' }}>
                              <Typography sx={{ fontWeight: 800, fontSize: 13, color: '#64748B', minWidth: 24, pt: 0.1 }}>
                                #{qIdx + 1}
                              </Typography>
                              <Box>
                                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B', lineHeight: 1.4 }}>
                                  {q.text}
                                </Typography>
                                {q.helpText && (
                                  <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.4, fontSize: 11.5, lineHeight: 1.3 }}>
                                    {q.helpText}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </Grid>
                          <Grid item xs={12} lg={5.5}>
                            <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', lg: 'flex-end' } }}>
                              {/* 1. Available and complete */}
                              <Button
                                size="small"
                                variant={isAvailable ? 'contained' : 'outlined'}
                                onClick={() => handleAnswerChange(q.id, 'Available and complete')}
                                disabled={isReadOnly}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: 11,
                                  px: 1.2,
                                  py: 0.6,
                                  borderRadius: 1.5,
                                  bgcolor: isAvailable ? '#009B62' : 'transparent',
                                  color: isAvailable ? '#fff' : '#009B62',
                                  borderColor: '#009B62',
                                  textTransform: 'none',
                                  '&:hover': { bgcolor: isAvailable ? '#007A4D' : '#ECFDF5' },
                                }}
                                startIcon={<CheckCircle fontSize="small" />}
                              >
                                Available & Complete
                              </Button>

                              {/* 2. Needs improvement */}
                              <Button
                                size="small"
                                variant={isNeedsImp ? 'contained' : 'outlined'}
                                onClick={() => handleAnswerChange(q.id, 'Needs improvement')}
                                disabled={isReadOnly}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: 11,
                                  px: 1.2,
                                  py: 0.6,
                                  borderRadius: 1.5,
                                  bgcolor: isNeedsImp ? '#D97706' : 'transparent',
                                  color: isNeedsImp ? '#fff' : '#D97706',
                                  borderColor: '#D97706',
                                  textTransform: 'none',
                                  '&:hover': { bgcolor: isNeedsImp ? '#B45309' : '#FFFBEB' },
                                }}
                                startIcon={<FactCheck fontSize="small" />}
                              >
                                Needs Improvement
                              </Button>

                              {/* 3. Not available */}
                              <Button
                                size="small"
                                variant={isNotAvail ? 'contained' : 'outlined'}
                                onClick={() => handleAnswerChange(q.id, 'Not available')}
                                disabled={isReadOnly}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: 11,
                                  px: 1.2,
                                  py: 0.6,
                                  borderRadius: 1.5,
                                  bgcolor: isNotAvail ? BRAND.gizRed : 'transparent',
                                  color: isNotAvail ? '#fff' : BRAND.gizRed,
                                  borderColor: BRAND.gizRed,
                                  textTransform: 'none',
                                  '&:hover': { bgcolor: isNotAvail ? BRAND.gizDarkRed : '#FFF1F2' },
                                }}
                                startIcon={<Close fontSize="small" />}
                              >
                                Not Available
                              </Button>
                            </Box>
                          </Grid>
                        </Grid>
                      </Paper>
                    );
                  })}
                </Box>

                {/* Stepper Footer */}
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
                      sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        bgcolor: BRAND.gopaGold,
                        color: '#262523',
                        '&:hover': { bgcolor: BRAND.gopaGoldHover },
                      }}
                    >
                      Proceed to Snapshot & Capacity Needs
                    </Button>
                  )}
                </Box>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* ── TAB 1: DIAGNOSTIC SNAPSHOT & HELP NEEDED ── */}
        {activeTab === 1 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2 }}>
              <b>Diagnostic Snapshot & Capacity Scores</b> are automatically computed from your answers.
              Below, select the <b>Targeted Areas Where the MSME Needs BDS Help & Coaching</b> to establish a focused roadmap.
            </Alert>

            {/* Diagnostic Snapshot Table */}
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #CBD5E1', borderRadius: 2, mb: 3 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#1A365D' }}>
                  <TableRow>
                    <TableCell sx={{ color: '#fff', fontWeight: 700, py: 1.2 }}>Operational Pillar</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700, py: 1.2, width: 140 }} align="center">Status</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700, py: 1.2, width: 150 }} align="center">Score / Readiness</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700, py: 1.2, width: 180 }} align="center">Gaps Breakdown</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700, py: 1.2 }}>BGE Diagnostic Note</TableCell>
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
                            label={cdata.status || 'Not Assessed'}
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
                          <Typography variant="body2" fontWeight={800} color={cdata.scorePct >= 80 ? '#009B62' : cdata.scorePct >= 50 ? '#D97706' : '#C8102E'}>
                            {cdata.scorePct || 0}%
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={cdata.scorePct || 0}
                            sx={{
                              height: 5,
                              borderRadius: 3,
                              mt: 0.5,
                              bgcolor: '#E2E8F0',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: isCritical ? '#C8102E' : isNeedsImp ? '#D97706' : '#009B62',
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            {cdata.ratio || `${cdata.notAvailable || 0} missing · ${cdata.needsImprovement || 0} needs imp`}
                          </Typography>
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
                    <TableCell sx={{ fontWeight: 800, fontSize: 13.5 }}>
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
                      <Typography variant="subtitle2" fontWeight={900} color={diagnostic.overallScorePct >= 75 ? '#009B62' : diagnostic.overallScorePct >= 50 ? '#D97706' : '#C8102E'}>
                        {diagnostic.overallScorePct}% Overall
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="caption" fontWeight={800} color={diagnostic.totalGaps > 0 ? '#C8102E' : '#009B62'}>
                        {diagnostic.totalNotAvail} missing · {diagnostic.totalNeedsImp} needs imp
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        Overall priority calculated across all 16 weighted operational diagnostic criteria.
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            {/* ── TARGETED AREAS WHERE MSME NEEDS HELP SECTION ── */}
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                border: '1.5px solid #CBD5E1',
                bgcolor: '#FFFFFF',
                mb: 3,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 1.5 }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={800} color={BRAND.primaryMain} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    🎯 Targeted Areas Where MSME Needs BDS Help & Coaching
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Select the specific operational topics requiring technical assistance. Click any tag to toggle, or auto-detect from gaps.
                  </Typography>
                </Box>
                {!isReadOnly && (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<AutoAwesome />}
                    onClick={handleAutoDetectHelpAreas}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: 12,
                      bgcolor: '#1D4ED8',
                      '&:hover': { bgcolor: '#1E40AF' },
                    }}
                  >
                    Auto-Detect from Gaps
                  </Button>
                )}
              </Box>

              <Grid container spacing={2}>
                {Object.entries(HELP_NEEDED_CATALOG).map(([categoryName, topics]) => (
                  <Grid item xs={12} md={4} key={categoryName}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        height: '100%',
                      }}
                    >
                      <Typography variant="caption" fontWeight={800} color={BRAND.primaryMain} sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {categoryName}
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
                        {topics.map((topic) => {
                          const isSelected = helpNeededAreas.includes(topic);
                          return (
                            <Box
                              key={topic}
                              onClick={() => handleToggleHelpArea(topic)}
                              sx={{
                                p: 0.8,
                                px: 1.2,
                                borderRadius: 1.5,
                                cursor: isReadOnly ? 'default' : 'pointer',
                                border: '1px solid',
                                borderColor: isSelected ? '#10B981' : '#E2E8F0',
                                bgcolor: isSelected ? '#ECFDF5' : '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s ease',
                                '&:hover': {
                                  borderColor: isSelected ? '#10B981' : '#94A3B8',
                                  bgcolor: isSelected ? '#ECFDF5' : '#F1F5F9',
                                },
                              }}
                            >
                              <Typography variant="body2" fontSize={12} fontWeight={isSelected ? 700 : 500} color={isSelected ? '#065F46' : '#334155'}>
                                {topic}
                              </Typography>
                              <Chip
                                label={isSelected ? 'Selected' : '+ Add'}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: 9.5,
                                  fontWeight: 800,
                                  bgcolor: isSelected ? '#009B62' : '#F1F5F9',
                                  color: isSelected ? '#fff' : '#64748B',
                                }}
                              />
                            </Box>
                          );
                        })}
                      </Box>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              {/* Specific Technical Assistance Notes */}
              <Box sx={{ mt: 2.5 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={2.5}
                  size="small"
                  label="Specific BDS Needs & Problem Statement"
                  placeholder="Describe the exact tools, processes, or coaching the MSME requires (e.g., 'MSME needs assistance setting up a daily cashbook, introducing formal employment contracts for 5 staff, and designing a value proposition statement for institutional buyers')."
                  value={helpNeededDescription}
                  onChange={(e) => setHelpNeededDescription(e.target.value)}
                  disabled={isReadOnly}
                  sx={{ bgcolor: '#FFFFFF', '& .MuiInputBase-root': { fontSize: 13 } }}
                />
              </Box>
            </Paper>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              <Button onClick={() => setActiveTab(0)} startIcon={<ArrowBack />} sx={{ textTransform: 'none' }}>
                Back to Questions
              </Button>
              <Button
                variant="contained"
                onClick={() => setActiveTab(2)}
                endIcon={<ArrowForward />}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  bgcolor: BRAND.gopaGold,
                  color: '#262523',
                  '&:hover': { bgcolor: BRAND.gopaGoldHover },
                }}
              >
                Proceed to Priority Actions (TBIP)
              </Button>
            </Box>
          </Box>
        )}

        {/* ── TAB 2: PRIORITY ACTIONS ROADMAP (TBIP) ── */}
        {activeTab === 2 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={800} color={BRAND.primaryMain}>
                  Priority Actions — Technical Business Improvement Plan
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Define <b>3 to 5 ranked priority actions</b> with allocated <b>BGE Support Days</b> and concrete <b>Means of Verification</b>.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip
                  label={`Total BGE Coaching: ${totalBgeSupportDays} Days`}
                  size="small"
                  sx={{ bgcolor: '#EFF6FF', color: '#1E40AF', fontWeight: 800, border: '1px solid #BFDBFE' }}
                />
                {!isReadOnly && priorityActions.length < 5 && (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<Add />}
                    onClick={handleAddAction}
                    sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, bgcolor: BRAND.primaryMain }}
                  >
                    Add Priority Action
                  </Button>
                )}
              </Box>
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
                  {/* Action Header Card */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Chip
                        label={`Rank #${act.ranking || idx + 1}`}
                        size="small"
                        sx={{ bgcolor: '#1A365D', color: '#fff', fontWeight: 800, fontSize: 12 }}
                      />

                      {/* Priority Level Select */}
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <Select
                          value={act.priority_level || 'High'}
                          onChange={(e) => handleActionChange(idx, 'priority_level', e.target.value)}
                          disabled={isReadOnly}
                          sx={{
                            fontSize: 12,
                            fontWeight: 800,
                            height: 30,
                            bgcolor: priorityColor(act.priority_level || 'High').bg,
                            color: priorityColor(act.priority_level || 'High').text,
                          }}
                        >
                          <MenuItem value="High" sx={{ fontSize: 12, fontWeight: 700 }}>High Priority</MenuItem>
                          <MenuItem value="Medium" sx={{ fontSize: 12, fontWeight: 700 }}>Medium Priority</MenuItem>
                          <MenuItem value="Low" sx={{ fontSize: 12, fontWeight: 700 }}>Low Priority</MenuItem>
                        </Select>
                      </FormControl>

                      {/* Category Select */}
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <Select
                          value={act.category || 'Financial Management'}
                          onChange={(e) => handleActionChange(idx, 'category', e.target.value)}
                          disabled={isReadOnly}
                          sx={{ fontSize: 12.5, fontWeight: 700, height: 30 }}
                        >
                          {TBIP_CATEGORIES.map((cat) => (
                            <MenuItem key={cat.id} value={cat.name} sx={{ fontSize: 12.5 }}>
                              {cat.icon} {cat.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      {/* BGE Support Days Indicator */}
                      <Chip
                        label={`⏱️ ${act.bge_support_days || 1} BGE Support Days`}
                        size="small"
                        sx={{ fontWeight: 700, fontSize: 11, bgcolor: '#F1F5F9', color: '#334155' }}
                      />
                    </Box>

                    {/* Reorder and Delete controls */}
                    {!isReadOnly && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Tooltip title="Move Action Up (Higher Priority)">
                          <span>
                            <IconButton size="small" disabled={idx === 0} onClick={() => handleMoveAction(idx, 'up')}>
                              <ArrowUpward fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Move Action Down (Lower Priority)">
                          <span>
                            <IconButton size="small" disabled={idx === priorityActions.length - 1} onClick={() => handleMoveAction(idx, 'down')}>
                              <ArrowDownward fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        {priorityActions.length > 1 && (
                          <Tooltip title="Remove Action">
                            <IconButton size="small" color="error" onClick={() => handleRemoveAction(idx)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    )}
                  </Box>

                  <Grid container spacing={2}>
                    {/* Priority Action Description */}
                    <Grid item xs={12}>
                      <TextField
                        size="small"
                        label="Priority Action Description *"
                        placeholder="e.g. Set up a cash management guideline, install an Excel cash book, and coach the manager on daily bank reconciliation."
                        value={act.action || act.priority_action || ''}
                        onChange={(e) => handleActionChange(idx, 'action', e.target.value)}
                        disabled={isReadOnly}
                        fullWidth
                        multiline
                        rows={2}
                        required
                        sx={{ '& .MuiInputBase-root': { fontSize: 13 } }}
                      />
                    </Grid>

                    {/* Means of Verification */}
                    <Grid item xs={12} md={6}>
                      <TextField
                        size="small"
                        label="Means of Verification *"
                        placeholder="e.g. Signed cash voucher receipts, stamped bank deposit slips, and reconciled cash spreadsheet on file."
                        value={act.means_of_verification || ''}
                        onChange={(e) => handleActionChange(idx, 'means_of_verification', e.target.value)}
                        disabled={isReadOnly}
                        fullWidth
                        multiline
                        rows={2}
                        helperText="Concrete evidence / documentation verifying action completion"
                        sx={{ '& .MuiInputBase-root': { fontSize: 13 } }}
                      />
                    </Grid>

                    {/* Expected Outcome */}
                    <Grid item xs={12} md={6}>
                      <TextField
                        size="small"
                        label="Expected Outcome & Milestone"
                        placeholder="e.g. 100% of sales banked before expense disbursement with transparent cash visibility."
                        value={act.outcome || act.expected_outcome || ''}
                        onChange={(e) => handleActionChange(idx, 'outcome', e.target.value)}
                        disabled={isReadOnly}
                        fullWidth
                        multiline
                        rows={2}
                        helperText="Key operational outcome or milestone for the MSME"
                        sx={{ '& .MuiInputBase-root': { fontSize: 13 } }}
                      />
                    </Grid>

                    {/* BGE Support Days */}
                    <Grid item xs={12} sm={3}>
                      <TextField
                        size="small"
                        type="number"
                        label="BGE Support Days *"
                        value={act.bge_support_days != null ? act.bge_support_days : 2}
                        onChange={(e) => handleActionChange(idx, 'bge_support_days', parseInt(e.target.value, 10) || 1)}
                        disabled={isReadOnly}
                        fullWidth
                        inputProps={{ min: 1, max: 30 }}
                        helperText="Days BGE supports MSME"
                      />
                    </Grid>

                    {/* Timeline */}
                    <Grid item xs={12} sm={3}>
                      <TextField
                        size="small"
                        label="Timeline"
                        placeholder="e.g. Within 30 days"
                        value={act.timeline || ''}
                        onChange={(e) => handleActionChange(idx, 'timeline', e.target.value)}
                        disabled={isReadOnly}
                        fullWidth
                      />
                    </Grid>

                    {/* Owner */}
                    <Grid item xs={12} sm={3}>
                      <TextField
                        size="small"
                        label="Owner / Lead"
                        value={act.owner || act.owner_bge || ''}
                        onChange={(e) => handleActionChange(idx, 'owner', e.target.value)}
                        disabled={isReadOnly}
                        fullWidth
                      />
                    </Grid>

                    {/* Status */}
                    <Grid item xs={12} sm={3}>
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
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  bgcolor: BRAND.gopaGold,
                  color: '#262523',
                  '&:hover': { bgcolor: BRAND.gopaGoldHover },
                }}
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
                  Diagnostic Assessment & Capacity Summary
                </Typography>

                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid #CBD5E1', bgcolor: '#F8FAFC', mb: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">MSME</Typography>
                      <Typography variant="body2" fontWeight={700}>{msme?.business_name || msme?.name || plan?.msme_name}</Typography>
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
                      <Typography variant="caption" color="text.secondary">Overall Priority & Score</Typography>
                      <Typography variant="body2" fontWeight={800} color={priorityColor(diagnostic.overallPriority).text}>
                        {diagnostic.overallPriority} ({diagnostic.overallScorePct}% readiness · {diagnostic.totalGaps} gaps)
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Help Needed Summary */}
                {helpNeededAreas.length > 0 && (
                  <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid #CBD5E1', bgcolor: '#FFFFFF', mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight={800} color={BRAND.primaryMain} sx={{ mb: 1 }}>
                      Targeted Areas Where MSME Needs Help ({helpNeededAreas.length})
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mb: 1 }}>
                      {helpNeededAreas.map((area, idx) => (
                        <Chip
                          key={idx}
                          label={area}
                          size="small"
                          sx={{ fontSize: 11, fontWeight: 700, bgcolor: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }}
                        />
                      ))}
                    </Box>
                    {helpNeededDescription && (
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5, fontStyle: 'italic', mt: 0.5 }}>
                        "{helpNeededDescription}"
                      </Typography>
                    )}
                  </Paper>
                )}

                {/* Priority Actions Roadmap Summary */}
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                  Action Roadmap ({priorityActions.length} actions · {totalBgeSupportDays} Total BGE Coaching Days)
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {priorityActions.map((act, i) => (
                    <Box key={i} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip label={`Rank #${act.ranking || i + 1}`} size="small" sx={{ fontSize: 10.5, height: 20, bgcolor: '#1A365D', color: '#fff', fontWeight: 800 }} />
                          <Typography variant="body2" fontWeight={700} color={BRAND.primaryMain}>
                            {act.category}
                          </Typography>
                          <Chip
                            label={act.priority_level || 'High'}
                            size="small"
                            sx={{
                              fontSize: 10,
                              height: 18,
                              bgcolor: priorityColor(act.priority_level || 'High').bg,
                              color: priorityColor(act.priority_level || 'High').text,
                              fontWeight: 800,
                            }}
                          />
                        </Box>
                        <Chip label={act.status || 'Pending'} size="small" sx={{ fontSize: 10, height: 20 }} />
                      </Box>
                      <Typography variant="body2" color="text.primary" sx={{ fontSize: 13, fontWeight: 600 }}>
                        {act.action || act.priority_action || '—'}
                      </Typography>
                      {act.means_of_verification && (
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#475569' }}>
                          <b>Verification:</b> {act.means_of_verification}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                        <Typography variant="caption" color="text.secondary"><b>BGE Coaching:</b> {act.bge_support_days || 1} Days</Typography>
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
