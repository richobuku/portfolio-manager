import React, { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem, Alert,
  Snackbar, CircularProgress, Avatar, Divider, TablePagination,
  Card, CardContent, Grid, List, ListItemButton, ListItemIcon,
  ListItemText, AppBar, Toolbar, Tooltip, Checkbox, Badge,
  Tabs, Tab, Drawer,
} from '@mui/material';
import {
  Business, Add, Visibility, Menu as MenuIcon,
  Logout, Assignment, CheckCircle, Edit, PictureAsPdf,
  Group as GroupIcon, Star, Description, Print, Download,
  Delete, HowToReg, School, ChevronRight, People,
  HelpOutline, Close, TrendingUp,
} from '@mui/icons-material';
import axios from 'axios';
import { API_ENDPOINTS, WORK_ORDER_SIGN_URL, WORK_ORDER_PDF_URL, MENTOR_REPORTS } from '../config';
import { BRAND } from '../theme';
import { subscribePush } from '../index';
import VisitReportForm from './VisitReportForm';

const DRAWER_WIDTH = 220;
const ROWS_PER_PAGE = 15;

const VISIT_TYPE_LABELS = {
  initial: 'Initial Assessment',
  followup: 'Follow-up Visit',
  final: 'Final Assessment',
  training: 'Training Support',
  mentoring: 'Mentoring Session',
};

const STATUS_COLORS = {
  draft: 'default',
  submitted: 'primary',
  reviewed: 'success',
};

const EMPTY_GROUP_REPORT = {
  group: '',
  session_number: '',
  visit_date: new Date().toISOString().slice(0, 10),
  msmes_supported: [],
  attendees: [],
  session_overview: '',
  challenges_identified: '',
  interventions_delivered: '',
  outcomes_achieved: '',
  next_steps: '',
  additional_notes: '',
  status: 'draft',
};

const EMPTY_CONTRIBUTION = {
  group_report: '',
  msmes_observed: [],
  notes: '',
  challenges_observed: '',
  interventions_made: '',
  follow_up_needed: '',
};

const STANDARD_CONDITIONS = [
  'The BGE must use only the standardised PRUDEV II tools and templates and submit all reports in the provided formats.',
  'The BGE is fully accountable for the accuracy, completeness, and timely submission of all attendance sheets and field reports.',
  'Under no circumstances may the BGE retain, store, or record MSME CRM login credentials. All account access details must be handed directly and exclusively to the MSME owner.',
  'All MSME data and business information must be handled strictly confidentially.',
  'GOPA AFC retains ownership of all outputs produced under this Work Order.',
  'A 6% withholding tax will be applied in accordance with Ugandan tax laws.',
  'BGE must use their official BGE code in all documentation.',
  'Timely submission of outputs is required to avoid payment delays.',
  'GOPA AFC reserves the right to terminate this Work Order in cases of non-performance, data mishandling, or breach of any condition above.',
];


export default function BGEDashboard({ token, currentUser, onLogout }) {
  const headers = { Authorization: `Bearer ${token}` };
  const bgeName = currentUser?.bge_profile?.name || currentUser?.username || 'BGE';

  const [section, setSection] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('section');
    return ['msmes', 'groups', 'reports', 'workorders', 'training'].includes(requested) ? requested : 'msmes';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const [msmes, setMsmes] = useState([]);
  const [reports, setReports] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupReports, setGroupReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });

  // group-report dialog
  const [groupReportDialog, setGroupReportDialog] = useState(false);
  const [editingGroupReport, setEditingGroupReport] = useState(null);
  const [groupReportForm, setGroupReportForm] = useState(EMPTY_GROUP_REPORT);
  const [groupReportSaving, setGroupReportSaving] = useState(false);
  const [groupReportErrors, setGroupReportErrors] = useState('');

  // Member contribution dialog (non-leader BGEs feeding info into a group report)
  const [contributionDialog, setContributionDialog] = useState(false);
  const [contributionForm, setContributionForm] = useState(EMPTY_CONTRIBUTION);
  const [contributionSaving, setContributionSaving] = useState(false);
  const [contributionErrors, setContributionErrors] = useState('');
  const [contributionEditingId, setContributionEditingId] = useState(null);

  // Contributions loaded inside the team-lead group report dialog
  const [reportContributions, setReportContributions] = useState([]);

  // Per-person MSME attendance for the group report dialog
  const [grpAttendees, setGrpAttendees] = useState([]);   // [{_key, id?, msme, attendee_name, ...}]
  const _grpAttKey = useRef(0);
  const newGrpRow = () => ({
    _key: ++_grpAttKey.current,
    id: null, msme: '', attendee_name: '', attendee_phone: '',
    gender: '', age_group: '', refugee_status: 'H', consent_photo: true, consent_contact: true,
  });

  // Facilitation assignments (for Training tab)
  const [facilitationAssignments, setFacilitationAssignments] = useState([]);
  // Unified session detail dialog (replaces separate attendance + report dialogs for Training tab)
  const [sessionDetailOpen, setSessionDetailOpen] = useState(false);
  const [sessionDetailSession, setSessionDetailSession] = useState(null);
  const [sessionDetailTab, setSessionDetailTab] = useState(0);
  const [helpDialog, setHelpDialog] = useState(false);
  const [helpSection, setHelpSection] = useState(0);

  // Mentor sessions (sessions where this BGE is a mentor, not lead facilitator)
  const [mentorSessions, setMentorSessions] = useState([]);
  const [mentorReports, setMentorReports] = useState({});   // keyed by session id
  const [mentorReportDialog, setMentorReportDialog] = useState(false);
  const [mentorReportSession, setMentorReportSession] = useState(null);
  const [mentorReportSaving, setMentorReportSaving] = useState(false);
  const [mentorReportForm, setMentorReportForm] = useState({});
  const EMPTY_MENTOR_REPORT = {
    training_title: '', training_dates: '', venue: '',
    mentoring_activities: '', msmes_mentored: '',
    key_observations: '', challenges: '', recommendations: '', next_steps: '',
    status: 'draft',
  };

  // Training report state (used both in Training tab detail dialog and standalone)
  const [trainingReportDialog, setTrainingReportDialog] = useState(false);
  const [trainingReportSession, setTrainingReportSession] = useState(null);
  const [trainingReportData, setTrainingReportData] = useState(null);
  const [trainingReportSaving, setTrainingReportSaving] = useState(false);
  const [trainingReportForm, setTrainingReportForm] = useState({});

  const EMPTY_TRAINING_REPORT = {
    training_title: '', training_dates: '', venue: '', district: '',
    time_allocation: '', facilitation_team: '',
    participants_male_youth: 0, participants_female_youth: 0,
    participants_adult_male: 0, participants_adult_female: 0,
    training_purpose: '', session_objectives: '', activities_delivered: '',
    key_lessons: '', growth_support_areas: '', key_findings: '',
    bge_contributions: '', bds_actions: '', recommendations: '',
    next_steps: '', conclusion: '', status: 'draft',
  };

  // Report wizard — combined session + attendance + narrative form opened from training card
  const [reportWizard, setReportWizard] = useState(null);         // assignment object
  const [reportWizardTab, setReportWizardTab] = useState(0);
  const [reportWizardSessionForm, setReportWizardSessionForm] = useState({ date: '', location: '' });
  const [reportWizardAttendees, setReportWizardAttendees] = useState([]);
  const [reportWizardSaving, setReportWizardSaving] = useState(false);
  const _rwKey = useRef(0);
  const newRwRow = () => ({
    _key: ++_rwKey.current,
    attendee_name: '', attendee_phone: '', msme: '',
    gender: '', age_group: '', refugee_status: 'H',
  });

  const rwDemographics = useMemo(() => {
    const filled = reportWizardAttendees.filter(r => r.attendee_name.trim());
    const ADULT = ['35-45', '46-55', '56+'];
    return {
      participants_male_youth:   filled.filter(r => r.gender === 'M' && r.age_group === '18-34').length,
      participants_female_youth: filled.filter(r => r.gender === 'F' && r.age_group === '18-34').length,
      participants_adult_male:   filled.filter(r => r.gender === 'M' && ADULT.includes(r.age_group)).length,
      participants_adult_female: filled.filter(r => r.gender === 'F' && ADULT.includes(r.age_group)).length,
    };
  }, [reportWizardAttendees]);

  // Training sessions (for Work Orders section attendance recording)
  const [sessions, setSessions] = useState([]);
  const [sessionAttDialog, setSessionAttDialog] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionAttendees, setSessionAttendees] = useState([]);
  const [sessionAttLoading, setSessionAttLoading] = useState(false);
  const _sessAttKey = useRef(0);
  const newSessRow = () => ({
    _key: ++_sessAttKey.current,
    id: null, msme: '', attendee_name: '', attendee_phone: '',
    gender: '', age_group: '', refugee_status: 'H', consent_photo: true, consent_contact: true,
  });

  // Work orders
  const [workOrders, setWorkOrders] = useState([]);
  const [workOrderPreview, setWorkOrderPreview] = useState(null);
  const [woReview, setWoReview] = useState(null);       // WO being reviewed in dialog
  const [woSigning, setWoSigning] = useState(null);     // id of WO being signed
  const [woPdfBlob, setWoPdfBlob] = useState(null);     // blob URL for PDF preview

  // Signature upload
  const [sigFile, setSigFile] = useState(null);
  const [sigUploading, setSigUploading] = useState(false);
  const [sigUrl, setSigUrl] = useState(currentUser?.bge_profile?.signature_url || null);
  const sigInputRef = useRef(null);

  const myBgeId = currentUser?.bge_profile?.id;
  const myBgeCode = currentUser?.bge_profile?.bge_code || '';

  // pagination
  const [reportPage, setReportPage] = useState(0);

  // VisitReportForm (new full-screen form)
  const [visitReportOpen, setVisitReportOpen]   = useState(false);
  const [visitReportMsme, setVisitReportMsme]   = useState(null);
  const [visitReportEdit, setVisitReportEdit]   = useState(null);

  // MSME detail dialog
  const [msmeDetailDialog, setMsmeDetailDialog] = useState(false);
  const [selectedMsme, setSelectedMsme] = useState(null);
  const [msmeReports, setMsmeReports] = useState([]);
  const [msmeDetailTab, setMsmeDetailTab] = useState(0);
  const [msmeDetailSnapshots, setMsmeDetailSnapshots] = useState([]);

  // Full MSME list for training attendance (bypasses personal assignment scope)
  const [trainingMsmes, setTrainingMsmes] = useState([]);
  const fetchTrainingMsmes = useCallback(async () => {
    if (trainingMsmes.length > 0) return; // already loaded
    try {
      const res = await axios.get(`${API_ENDPOINTS.MSMES}?training=1`,
        { headers: { Authorization: `Bearer ${token}` } });
      setTrainingMsmes(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch { /* non-critical — falls back to assigned MSMEs */ }
  }, [token, trainingMsmes.length]);

  // Growth update form
  const [growthDialog, setGrowthDialog] = useState(false);
  const [growthMsme, setGrowthMsme] = useState(null);
  const [growthSnapshots, setGrowthSnapshots] = useState([]);
  const [growthSaving, setGrowthSaving] = useState(false);
  const [growthError, setGrowthError] = useState('');

  const DIGITAL_TOOLS_OPTIONS = [
    'Zoho Books',
    'Biashara App',
    'Brevo (Email Marketing)',
    'Message Carrier (SMS)',
    'WhatsApp Business',
    'QuickBooks',
    'Facebook / Instagram Business',
    'Google My Business',
    'MTN / Airtel MoMo Business',
    'Point of Sale (POS) System',
    'Canva (Design & Marketing)',
    'TikTok for Business',
    'Shopify / WooCommerce',
    'Other',
  ];

  const TRAINING_CHANGE_OPTIONS = [
    'Improved record keeping / bookkeeping',
    'Adopted digital accounting tools',
    'Registered business (URSB / TIN)',
    'Opened a business bank account',
    'Joined a SACCO',
    'Improved customer service',
    'Expanded product or service range',
    'Developed a business plan',
    'Improved marketing and promotion',
    'Hired additional staff',
    'Improved pricing strategy',
    'Reduced costs / improved efficiency',
    'Accessed new markets or customers',
    'Improved supply chain management',
    'Improved financial management',
    'Other',
  ];

  const EMPTY_GROWTH = {
    snapshot_date: new Date().toISOString().slice(0, 10),
    source: 'bge_visit',
    annual_turnover: '', total_assets: '',
    employees_ft_male: '', employees_ft_female: '',
    employees_pt_male: '', employees_pt_female: '',
    has_tin: '', tin_number: '',
    has_ursb: '', ursb_reg_number: '',
    has_business_bank: '', bank_name: '',
    has_sacco: '',
    has_mobile_money: '',
    has_momo_pay: '', momo_pay_code: '',
    employees_ft_refugee: '', employees_pt_refugee: '',
    last_month_revenue: '',
    digital_tools: [],
    digital_tools_other: '',
    training_made_changes: '',
    training_changes: [],
    training_changes_other: '',
    notes: '',
    // narrative (only used when source === 'annual' or 'quarterly')
    narrative_business_overview: '',
    narrative_key_achievement: '',
    narrative_challenges: '',
    narrative_support_provided: '',
    narrative_recommendations: '',
    narrative_next_steps: '',
  };
  const [growthForm, setGrowthForm] = useState(EMPTY_GROWTH);

  const openGrowthForm = async (msme) => {
    setGrowthMsme(msme);
    setGrowthForm(EMPTY_GROWTH);
    setGrowthError('');
    setGrowthDialog(true);
    // Load existing snapshots for history display
    try {
      const res = await axios.get(`${API_ENDPOINTS.GROWTH_SNAPSHOTS}?msme=${msme.id}`,
        { headers: { Authorization: `Bearer ${token}` } });
      setGrowthSnapshots(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch (e) { setGrowthSnapshots([]); }
  };

  const saveGrowthSnapshot = async () => {
    if (!growthMsme) return;
    setGrowthSaving(true); setGrowthError('');
    const bgeId = currentUser?.bge_profile?.id;
    const payload = {
      msme: growthMsme.id,
      snapshot_date: growthForm.snapshot_date,
      source: growthForm.source,
      collected_by: bgeId || null,
      annual_turnover:     growthForm.annual_turnover   || null,
      last_month_revenue:  growthForm.last_month_revenue || null,
      total_assets:        growthForm.total_assets      || null,
      employees_ft_male:   growthForm.employees_ft_male   !== '' ? Number(growthForm.employees_ft_male)   : null,
      employees_ft_female: growthForm.employees_ft_female !== '' ? Number(growthForm.employees_ft_female) : null,
      employees_pt_male:   growthForm.employees_pt_male   !== '' ? Number(growthForm.employees_pt_male)   : null,
      employees_pt_female: growthForm.employees_pt_female !== '' ? Number(growthForm.employees_pt_female) : null,
      has_tin:           growthForm.has_tin           === '' ? null : growthForm.has_tin === 'true',
      tin_number:        growthForm.has_tin === 'true' ? (growthForm.tin_number || '') : '',
      has_ursb:          growthForm.has_ursb          === '' ? null : growthForm.has_ursb === 'true',
      ursb_reg_number:   growthForm.has_ursb === 'true' ? (growthForm.ursb_reg_number || '') : '',
      has_business_bank: growthForm.has_business_bank === '' ? null : growthForm.has_business_bank === 'true',
      bank_name:         growthForm.has_business_bank === 'true' ? (growthForm.bank_name || '') : '',
      has_sacco:         growthForm.has_sacco         === '' ? null : growthForm.has_sacco === 'true',
      has_mobile_money:  growthForm.has_mobile_money  === '' ? null : growthForm.has_mobile_money === 'true',
      has_momo_pay:      growthForm.has_momo_pay      === '' ? null : growthForm.has_momo_pay === 'true',
      momo_pay_code:     growthForm.has_momo_pay === 'true' ? (growthForm.momo_pay_code || '') : '',
      employees_ft_refugee: growthForm.employees_ft_refugee !== '' ? Number(growthForm.employees_ft_refugee) : null,
      employees_pt_refugee: growthForm.employees_pt_refugee !== '' ? Number(growthForm.employees_pt_refugee) : null,
      digital_tools:          growthForm.digital_tools,
      digital_tools_other:    growthForm.digital_tools.includes('Other') ? (growthForm.digital_tools_other || '') : '',
      training_made_changes:  growthForm.training_made_changes === '' ? null : growthForm.training_made_changes === 'true',
      training_changes:       growthForm.training_made_changes === 'true' ? growthForm.training_changes : [],
      training_changes_other: (growthForm.training_made_changes === 'true' && growthForm.training_changes.includes('Other'))
                                ? (growthForm.training_changes_other || '') : '',
      notes: growthForm.notes,
    };
    const isReviewType = growthForm.source === 'annual' || growthForm.source === 'quarterly';
    const hasNarrative = isReviewType && [
      growthForm.narrative_business_overview, growthForm.narrative_key_achievement,
      growthForm.narrative_challenges, growthForm.narrative_support_provided,
      growthForm.narrative_recommendations, growthForm.narrative_next_steps,
    ].some(v => v.trim());

    try {
      await axios.post(API_ENDPOINTS.GROWTH_SNAPSHOTS, payload,
        { headers: { Authorization: `Bearer ${token}` } });

      if (hasNarrative) {
        const visitType = growthForm.source === 'annual' ? 'annual_review' : 'quarterly_review';
        const reportPayload = {
          msme:                   growthMsme.id,
          bge:                    bgeId || null,
          visit_type:             visitType,
          visit_date:             growthForm.snapshot_date,
          status:                 'draft',
          business_overview:      growthForm.narrative_business_overview,
          key_achievement:        growthForm.narrative_key_achievement,
          challenges_identified:  growthForm.narrative_challenges,
          support_provided:       growthForm.narrative_support_provided,
          recommendations:        growthForm.narrative_recommendations,
          next_steps:             growthForm.narrative_next_steps,
        };
        await axios.post(API_ENDPOINTS.REPORTS, reportPayload,
          { headers: { Authorization: `Bearer ${token}` } });
        notify('Growth update and narrative report saved as draft.');
      } else {
        notify('Growth update saved.');
      }
      setGrowthDialog(false);
    } catch (e) {
      setGrowthError(e.response?.data ? JSON.stringify(e.response.data) : 'Save failed.');
    } finally { setGrowthSaving(false); }
  };

  // in-app report viewer
  const [viewReport, setViewReport] = useState(null);

  const notify = (msg, severity = 'success') => setSnack({ open: true, msg, severity });

  const fetchMsmes = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    setLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.MSMES, { headers: h });
      setMsmes(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      notify('Failed to load MSMEs', 'error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchReports = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(API_ENDPOINTS.REPORTS, { headers: h });
      setReports(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      notify('Failed to load reports', 'error');
    }
  }, [token]);

  const fetchGroups = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(API_ENDPOINTS.BGE_GROUPS, { headers: h });
      const all = Array.isArray(res.data) ? res.data : res.data.results || [];
      // Backend returns every group the BGE-user can see — for a non-admin
      // BGE user, the list endpoint isn't tenant-scoped (it's open), so
      // narrow to just the groups this BGE belongs to client-side.
      setGroups(all.filter(g => (g.members_detail || []).some(m => m.id === myBgeId)));
    } catch {
      // silent — group view is optional
    }
  }, [token, myBgeId]);

  const fetchGroupReports = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(API_ENDPOINTS.GROUP_REPORTS, { headers: h });
      setGroupReports(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      // silent — endpoint may be unreachable on stale deploys
    }
  }, [token]);

  const fetchWorkOrders = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(API_ENDPOINTS.WORK_ORDERS, { headers: h });
      setWorkOrders(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      // silent
    }
  }, [token]);

  const fetchSessions = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const [sRes, faRes, trRes, mrRes] = await Promise.all([
        axios.get(API_ENDPOINTS.TRAINING_SESSIONS, { headers: h }),
        axios.get(API_ENDPOINTS.FACILITATION_ASSIGNMENTS, { headers: h }).catch(() => ({ data: [] })),
        axios.get(API_ENDPOINTS.TRAINING_REPORTS, { headers: h }).catch(() => ({ data: [] })),
        axios.get(MENTOR_REPORTS, { headers: h }).catch(() => ({ data: [] })),
      ]);
      const sessData = Array.isArray(sRes.data) ? sRes.data : sRes.data.results || [];
      const reportsData = Array.isArray(trRes.data) ? trRes.data : trRes.data.results || [];
      const mentorReportData = Array.isArray(mrRes.data) ? mrRes.data : mrRes.data.results || [];

      const reportBySession = {};
      reportsData.forEach(r => { reportBySession[r.session] = r; });

      const mentorReportBySession = {};
      mentorReportData.forEach(r => { mentorReportBySession[r.session] = r; });

      const allSessions = sessData.map(s => ({
        ...s,
        has_training_report: !!reportBySession[s.id],
        _training_report: reportBySession[s.id] || null,
      }));

      setSessions(allSessions);
      setFacilitationAssignments(Array.isArray(faRes.data) ? faRes.data : faRes.data.results || []);

      // Mentor sessions: sessions where this BGE has a mentor assignment
      const allAssignments = Array.isArray(faRes.data) ? faRes.data : faRes.data.results || [];
      const mentorAssignmentSessionIds = new Set(
        allAssignments.filter(a => a.role === 'mentor' && a.session).map(a => a.session)
      );
      const mentorOnly = allSessions.filter(s => mentorAssignmentSessionIds.has(s.id));
      setMentorSessions(mentorOnly);
      setMentorReports(mentorReportBySession);
    } catch {
      // silent
    }
  }, [token]);

  const pushAttempted = useRef(false);

  useEffect(() => {
    fetchMsmes();
    fetchReports();
    fetchGroups();
    fetchGroupReports();
    fetchWorkOrders();
    fetchSessions();
    // Request push notification permission once per session
    if (!pushAttempted.current) {
      pushAttempted.current = true;
      subscribePush(`Bearer ${token}`);
    }
  }, [fetchMsmes, fetchReports, fetchGroups, fetchGroupReports, fetchWorkOrders, fetchSessions, token]);

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_title: `BGE - ${section}`, page_path: `/bge/${section}` });
    }
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNewReport = (msmeId = '') => {
    const msme = msmes.find(x => x.id === msmeId || x.id === Number(msmeId)) || null;
    setVisitReportMsme(msme);
    setVisitReportEdit(null);
    setVisitReportOpen(true);
  };

  const openEditReport = (report) => {
    const msme = msmes.find(x => x.id === report.msme || x.id === Number(report.msme)) || null;
    setVisitReportMsme(msme);
    setVisitReportEdit(report);
    setVisitReportOpen(true);
  };

  // ── group reports ─────────────────────────────────────────────────────────
  const openNewGroupReport = (groupId = '') => {
    setEditingGroupReport(null);
    setGroupReportForm({ ...EMPTY_GROUP_REPORT, group: groupId });
    setGroupReportErrors('');
    setGrpAttendees([newGrpRow()]);
    setGroupReportDialog(true);
  };

  const openEditGroupReport = async (rep) => {
    setEditingGroupReport(rep);
    setGroupReportForm({
      group: rep.group,
      session_number: rep.session_number || '',
      visit_date: rep.visit_date,
      msmes_supported: rep.msmes_supported || [],
      attendees: rep.attendees || [],
      session_overview: rep.session_overview || '',
      challenges_identified: rep.challenges_identified || '',
      interventions_delivered: rep.interventions_delivered || '',
      outcomes_achieved: rep.outcomes_achieved || '',
      next_steps: rep.next_steps || '',
      additional_notes: rep.additional_notes || '',
      status: rep.status,
    });
    setGroupReportErrors('');
    setReportContributions([]);
    setGrpAttendees([]);
    const h = { Authorization: `Bearer ${token}` };
    // Load member contributions and existing attendance in parallel
    const [contribRes, attRes] = await Promise.allSettled([
      axios.get(`${API_ENDPOINTS.GROUP_REPORT_CONTRIBUTIONS}?group_report=${rep.id}`, { headers: h }),
      axios.get(`${API_ENDPOINTS.GROUP_REPORT_ATTENDANCE}?group_report=${rep.id}`, { headers: h }),
    ]);
    if (contribRes.status === 'fulfilled') {
      const list = Array.isArray(contribRes.value.data) ? contribRes.value.data : (contribRes.value.data.results || []);
      setReportContributions(list.filter(c => Number(c.bge) !== Number(myBgeId)));
    }
    if (attRes.status === 'fulfilled') {
      const list = Array.isArray(attRes.value.data) ? attRes.value.data : (attRes.value.data.results || []);
      setGrpAttendees(list.length ? list.map(r => ({ ...r, _key: r.id })) : [newGrpRow()]);
    } else {
      setGrpAttendees([newGrpRow()]);
    }
    setGroupReportDialog(true);
  };

  const saveGroupReport = async (statusOverride) => {
    if (!groupReportForm.group) { setGroupReportErrors('Please select a group.'); return; }
    if (!groupReportForm.visit_date) { setGroupReportErrors('Please set a visit date.'); return; }
    setGroupReportSaving(true);
    setGroupReportErrors('');
    const payload = {
      ...groupReportForm,
      session_number: groupReportForm.session_number === '' ? null : Number(groupReportForm.session_number),
      ...(statusOverride ? { status: statusOverride } : {}),
    };
    const h = { Authorization: `Bearer ${token}` };
    try {
      let reportId;
      if (editingGroupReport) {
        await axios.patch(`${API_ENDPOINTS.GROUP_REPORTS}${editingGroupReport.id}/`, payload, { headers: h });
        reportId = editingGroupReport.id;
        notify(statusOverride === 'submitted' ? 'Group report submitted' : 'Group report draft saved');
      } else {
        const r = await axios.post(API_ENDPOINTS.GROUP_REPORTS, payload, { headers: h });
        reportId = r.data.id;
        notify(statusOverride === 'submitted' ? 'Group report submitted' : 'Group report draft saved');
      }
      // Save MSME attendance rows (present ones only)
      if (reportId) {
        const present = grpAttendees.filter(a => a.attendee_name || a.msme);
        await Promise.allSettled(present.map(a => {
          const ap = {
            group_report: reportId,
            msme: a.msme || null,
            attendee_name: a.attendee_name,
            attendee_phone: a.attendee_phone,
            gender: a.gender,
            age_group: a.age_group,
            refugee_status: a.refugee_status || 'H',
            consent_photo: a.consent_photo,
            consent_contact: a.consent_contact,
          };
          if (a.id) return axios.patch(`${API_ENDPOINTS.GROUP_REPORT_ATTENDANCE}${a.id}/`, ap, { headers: h });
          return axios.post(API_ENDPOINTS.GROUP_REPORT_ATTENDANCE, ap, { headers: h });
        }));
      }
      setGroupReportDialog(false);
      fetchGroupReports();
    } catch (err) {
      setGroupReportErrors(
        err.response?.data?.detail
        || JSON.stringify(err.response?.data || {})
        || 'Failed to save group report.'
      );
    } finally {
      setGroupReportSaving(false);
    }
  };

  const isTeamLeadOf = (group) => group?.team_lead === myBgeId;

  // ── Training session attendance (BGE side) ───────────────────────────────
  const openSessionDetail = (session, tab = 0) => {
    setSessionDetailSession(session);
    setSessionDetailTab(tab);
    // Pre-load attendance if opening on that tab
    if (tab === 1) {
      openSessionAtt(session);
    }
    // Pre-load report form
    const existing = session._training_report;
    if (existing) {
      const { id, session: _s, bge: _b, created_at, updated_at, submitted_at,
              session_title, session_date, session_location, bge_name, total_participants,
              ...rest } = existing;
      setTrainingReportData(existing);
      setTrainingReportForm({ ...EMPTY_TRAINING_REPORT, ...rest });
    } else {
      // Find the matching facilitation assignment to pre-fill context
      const assignment = facilitationAssignments.find(a => a.session === session.id || a.topic === session.topic);
      setTrainingReportData(null);
      const teamNames = (session.team || []).map(m => m.bge_name).filter(Boolean).join(', ');
      setTrainingReportForm({
        ...EMPTY_TRAINING_REPORT,
        training_title: session.title || '',
        venue: session.location || '',
        training_dates: session.date || '',
        facilitation_team: teamNames,
        session_objectives: assignment?.notes || '',
      });
    }
    setSessionDetailOpen(true);
  };

  const openReportWizard = (assignment) => {
    fetchTrainingMsmes(); // pre-load full MSME list for attendance picker
    // If sessions already exist for this topic, open the session detail dialog instead
    const existingSessions = sessions.filter(s => s.topic === assignment.topic);
    if (existingSessions.length === 1) {
      openSessionDetail(existingSessions[0], 0);
      return;
    }
    // No sessions yet (or multiple) — open combined wizard
    setReportWizardTab(0);
    setReportWizardSessionForm({
      date: new Date().toISOString().slice(0, 10),
      location: '',
    });
    setReportWizardAttendees([newRwRow(), newRwRow(), newRwRow()]);
    setTrainingReportForm({
      ...EMPTY_TRAINING_REPORT,
      training_title: assignment.topic_name || '',
      facilitation_team: currentUser?.bge_profile?.name || '',
      session_objectives: assignment.notes || '',
    });
    setTrainingReportData(null);
    setReportWizard(assignment);
  };

  const saveReportWizard = async (submitNow = false) => {
    if (!reportWizard || !reportWizardSessionForm.date) return;
    setReportWizardSaving(true);
    const h = { Authorization: `Bearer ${token}` };
    try {
      // 1. Find linked work order if any
      const linkedWo = workOrders.find(wo =>
        wo.work_order_type === 'training_facilitation' && (wo.status === 'issued' || wo.status === 'signed')
      );
      // 2. Create the session
      const sessRes = await axios.post(API_ENDPOINTS.TRAINING_SESSIONS, {
        title: trainingReportForm.training_title || reportWizard.topic_name,
        date: reportWizardSessionForm.date,
        location: reportWizardSessionForm.location,
        topic: reportWizard.topic,
        work_order: linkedWo?.id || null,
      }, { headers: h });
      const sessionId = sessRes.data.id;
      // 3. Create the training report
      await axios.post(API_ENDPOINTS.TRAINING_REPORTS, {
        ...trainingReportForm,
        ...rwDemographics,
        session: sessionId,
        venue: reportWizardSessionForm.location || trainingReportForm.venue,
        status: submitNow ? 'submitted' : 'draft',
      }, { headers: h });
      // 4. Create attendance records (only rows with a name)
      const filledRows = reportWizardAttendees.filter(r => r.attendee_name.trim());
      await Promise.all(filledRows.map(r =>
        axios.post(API_ENDPOINTS.ATTENDANCE, {
          session: sessionId,
          msme: r.msme || null,
          attendee_name: r.attendee_name.trim(),
          attendee_phone: r.attendee_phone.trim(),
          gender: r.gender,
          age_group: r.age_group,
          refugee_status: r.refugee_status || 'H',
          present: true,
        }, { headers: h })
      ));
      // 5. Refresh sessions
      const [sRes, trRes] = await Promise.all([
        axios.get(API_ENDPOINTS.TRAINING_SESSIONS, { headers: h }),
        axios.get(API_ENDPOINTS.TRAINING_REPORTS, { headers: h }).catch(() => ({ data: [] })),
      ]);
      const sessData = Array.isArray(sRes.data) ? sRes.data : sRes.data.results || [];
      const reportsData = Array.isArray(trRes.data) ? trRes.data : trRes.data.results || [];
      const reportBySession = {};
      reportsData.forEach(r => { reportBySession[r.session] = r; });
      setSessions(sessData.map(s => ({
        ...s,
        has_training_report: !!reportBySession[s.id],
        _training_report: reportBySession[s.id] || null,
      })));
      setReportWizard(null);
      notify(submitNow ? 'Training report submitted!' : 'Training report saved as draft');
    } catch (err) {
      notify(err.response?.data?.detail || 'Failed to save report', 'error');
    } finally {
      setReportWizardSaving(false);
    }
  };

  const saveTrainingReport = async (submitNow = false) => {
    // Works from both the detail dialog and the standalone dialog
    const targetSession = trainingReportSession || sessionDetailSession;
    if (!targetSession) return;
    setTrainingReportSaving(true);
    const h = { Authorization: `Bearer ${token}` };
    const payload = {
      ...trainingReportForm,
      session: targetSession.id,
      status: submitNow ? 'submitted' : (trainingReportForm.status || 'draft'),
    };
    try {
      if (trainingReportData?.id) {
        await axios.patch(`${API_ENDPOINTS.TRAINING_REPORTS}${trainingReportData.id}/`, payload, { headers: h });
      } else {
        await axios.post(API_ENDPOINTS.TRAINING_REPORTS, payload, { headers: h });
      }
      setTrainingReportDialog(false);
      // refresh sessions then update the session detail state so the summary reflects the new report
      const [sRes, trRes] = await Promise.all([
        axios.get(API_ENDPOINTS.TRAINING_SESSIONS, { headers: h }),
        axios.get(API_ENDPOINTS.TRAINING_REPORTS, { headers: h }).catch(() => ({ data: [] })),
      ]);
      const sessData = Array.isArray(sRes.data) ? sRes.data : sRes.data.results || [];
      const reportsData = Array.isArray(trRes.data) ? trRes.data : trRes.data.results || [];
      const reportBySession = {};
      reportsData.forEach(r => { reportBySession[r.session] = r; });
      setSessions(sessData.map(s => ({ ...s, has_training_report: !!reportBySession[s.id], _training_report: reportBySession[s.id] || null })));
      if (sessionDetailSession) {
        const updated = sessData.find(s => s.id === sessionDetailSession.id);
        if (updated) {
          const rep = reportBySession[updated.id] || null;
          setSessionDetailSession({ ...updated, has_training_report: !!rep, _training_report: rep });
          setTrainingReportData(rep);
        }
      }
    } catch (err) {
      alert('Could not save report: ' + (err.response?.data ? JSON.stringify(err.response.data) : err.message));
    } finally {
      setTrainingReportSaving(false);
    }
  };

  const openMentorReport = (session) => {
    setMentorReportSession(session);
    const existing = mentorReports[session.id];
    if (existing) {
      setMentorReportForm({ ...EMPTY_MENTOR_REPORT, ...existing });
    } else {
      setMentorReportForm({
        ...EMPTY_MENTOR_REPORT,
        training_title: session.title || '',
        training_dates: session.date || '',
        venue: session.location || '',
      });
    }
    setMentorReportDialog(true);
  };

  const saveMentorReport = async (submitNow = false) => {
    if (!mentorReportSession) return;
    setMentorReportSaving(true);
    const h = { Authorization: `Bearer ${token}` };
    const existing = mentorReports[mentorReportSession.id];
    const payload = {
      ...mentorReportForm,
      session: mentorReportSession.id,
      status: submitNow ? 'submitted' : (mentorReportForm.status || 'draft'),
    };
    try {
      if (existing?.id) {
        await axios.patch(`${MENTOR_REPORTS}${existing.id}/`, payload, { headers: h });
      } else {
        await axios.post(MENTOR_REPORTS, payload, { headers: h });
      }
      setMentorReportDialog(false);
      await fetchSessions();
    } catch (err) {
      alert('Could not save mentor report: ' + (err.response?.data ? JSON.stringify(err.response.data) : err.message));
    } finally {
      setMentorReportSaving(false);
    }
  };

  const openSessionAtt = async (session) => {
    fetchTrainingMsmes(); // pre-load full MSME list for attendance picker
    setSelectedSession(session);
    setSessionAttLoading(true);
    setSessionAttDialog(true);
    const h = { Authorization: `Bearer ${token}` };
    try {
      const res = await axios.get(`${API_ENDPOINTS.ATTENDANCE}?session=${session.id}`, { headers: h });
      const records = Array.isArray(res.data) ? res.data : (res.data.results || []);
      setSessionAttendees(records.length ? records.map(r => ({ ...r, _key: r.id })) : [newSessRow()]);
    } catch {
      setSessionAttendees([newSessRow()]);
    } finally {
      setSessionAttLoading(false);
    }
  };

  const saveSessionAtt = async () => {
    setSessionAttLoading(true);
    const h = { Authorization: `Bearer ${token}` };
    try {
      const present = sessionAttendees.filter(a => a.attendee_name || a.msme);
      await Promise.all(present.map(a => {
        const ap = {
          session: selectedSession.id,
          msme: a.msme || null,
          attendee_name: a.attendee_name,
          attendee_phone: a.attendee_phone,
          gender: a.gender,
          age_group: a.age_group,
          refugee_status: a.refugee_status || 'H',
          consent_photo: a.consent_photo,
          consent_contact: a.consent_contact,
          present: true,
        };
        if (a.id) return axios.patch(`${API_ENDPOINTS.ATTENDANCE}${a.id}/`, ap, { headers: h });
        return axios.post(API_ENDPOINTS.ATTENDANCE, ap, { headers: h });
      }));
      notify('Attendance saved');
      setSessionAttDialog(false);
      fetchSessions();
    } catch {
      notify('Failed to save attendance', 'error');
    } finally {
      setSessionAttLoading(false);
    }
  };

  // ── Member contributions ──────────────────────────────────────────────────
  const openContribution = async (groupReport) => {
    setContributionErrors('');
    // If I already have a contribution for this report, load it; otherwise blank
    try {
      const r = await axios.get(
        `${API_ENDPOINTS.GROUP_REPORT_CONTRIBUTIONS}?group_report=${groupReport.id}`,
        { headers }
      );
      const list = Array.isArray(r.data) ? r.data : (r.data.results || []);
      const mine = list.find(c => Number(c.bge) === Number(myBgeId));
      if (mine) {
        setContributionEditingId(mine.id);
        setContributionForm({
          group_report:        groupReport.id,
          msmes_observed:      mine.msmes_observed || [],
          notes:               mine.notes || '',
          challenges_observed: mine.challenges_observed || '',
          interventions_made:  mine.interventions_made || '',
          follow_up_needed:    mine.follow_up_needed || '',
        });
      } else {
        setContributionEditingId(null);
        setContributionForm({ ...EMPTY_CONTRIBUTION, group_report: groupReport.id });
      }
    } catch {
      setContributionEditingId(null);
      setContributionForm({ ...EMPTY_CONTRIBUTION, group_report: groupReport.id });
    }
    setContributionDialog(true);
  };

  const saveContribution = async () => {
    if (!contributionForm.group_report) { setContributionErrors('Missing group_report id'); return; }
    setContributionSaving(true);
    setContributionErrors('');
    try {
      if (contributionEditingId) {
        await axios.patch(
          `${API_ENDPOINTS.GROUP_REPORT_CONTRIBUTIONS}${contributionEditingId}/`,
          contributionForm, { headers }
        );
        notify('Contribution updated');
      } else {
        // POST acts as upsert on the backend (same (report, bge) pair → updates)
        await axios.post(API_ENDPOINTS.GROUP_REPORT_CONTRIBUTIONS, contributionForm, { headers });
        notify('Contribution saved');
      }
      setContributionDialog(false);
      fetchGroupReports();
    } catch (err) {
      setContributionErrors(
        err.response?.data?.detail || JSON.stringify(err.response?.data || {})
        || 'Failed to save contribution.'
      );
    } finally {
      setContributionSaving(false);
    }
  };

  // ── PDF / print helpers ───────────────────────────────────────────────────
  // Open the server-rendered PDF for an MSME visit report. `mode='download'`
  // forces a file download (?dl=1); `mode='view'` opens it inline so the
  // browser's PDF viewer handles its own print/save UI.
  const openMsmeReportPdf = async (reportId, mode = 'view') => {
    try {
      const res = await axios.get(
        `${API_ENDPOINTS.REPORTS}${reportId}/pdf/${mode === 'download' ? '?dl=1' : ''}`,
        { headers, responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `MSMEReport_${reportId}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, '_blank');
      }
      // Defer revoke so the new tab can read the URL
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      notify('Failed to render PDF', 'error');
    }
  };

  const openGroupReportPdf = async (reportId, mode = 'view') => {
    try {
      const res = await axios.get(
        `${API_ENDPOINTS.GROUP_REPORTS}${reportId}/pdf/${mode === 'download' ? '?dl=1' : ''}`,
        { headers, responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `GroupReport_${reportId}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      notify('Failed to render PDF', 'error');
    }
  };

  const openMsmeDetail = async (msme) => {
    setSelectedMsme(msme);
    setMsmeDetailDialog(true);
    setMsmeDetailTab(0);
    setMsmeDetailSnapshots([]);
    try {
      const [rptRes, snapRes] = await Promise.allSettled([
        axios.get(`${API_ENDPOINTS.REPORTS}?msme=${msme.id}`, { headers }),
        axios.get(`${API_ENDPOINTS.GROWTH_SNAPSHOTS}?msme=${msme.id}`, { headers }),
      ]);
      setMsmeReports(rptRes.status === 'fulfilled'
        ? (Array.isArray(rptRes.value.data) ? rptRes.value.data : rptRes.value.data.results || [])
        : []);
      setMsmeDetailSnapshots(snapRes.status === 'fulfilled'
        ? (Array.isArray(snapRes.value.data) ? snapRes.value.data : snapRes.value.data.results || [])
        : []);
    } catch {
      setMsmeReports([]);
    }
  };

  // ── signature upload ──────────────────────────────────────────────────────
  const uploadSignature = async () => {
    if (!sigFile) return;
    setSigUploading(true);
    try {
      const bgeId = currentUser?.bge_profile?.id;
      const fd = new FormData();
      fd.append('signature', sigFile);
      const res = await axios.post(
        `${API_ENDPOINTS.EXPERTS}${bgeId}/upload-signature/`,
        fd,
        { headers: { ...headers, 'Content-Type': 'multipart/form-data' } },
      );
      setSigUrl(res.data.signature_url);
      setSigFile(null);
      notify('Signature uploaded successfully');
    } catch (err) {
      notify(err.response?.data?.error || 'Signature upload failed', 'error');
    } finally {
      setSigUploading(false);
    }
  };

  // ── work order sign + download ────────────────────────────────────────────
  const signWo = async (wo) => {
    if (!window.confirm(`Sign work order ${wo.work_order_number}? This confirms your acceptance and cannot be undone.`)) return;
    setWoSigning(wo.id);
    try {
      const res = await axios.post(WORK_ORDER_SIGN_URL(wo.id), {}, { headers });
      setWorkOrders(prev => prev.map(w => w.id === wo.id ? res.data : w));
      notify(`Work order ${wo.work_order_number} signed successfully`);
    } catch (err) {
      notify(err.response?.data?.detail || 'Failed to sign work order', 'error');
    } finally {
      setWoSigning(null);
    }
  };

  const downloadWoPdf = async (wo) => {
    try {
      const res = await axios.get(WORK_ORDER_PDF_URL(wo.id), { headers, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `WorkOrder_${(wo.work_order_number || wo.id).replace(/\s/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { notify('Failed to download PDF', 'error'); }
  };

  const reviewWo = async (wo) => {
    setWoReview(wo);
    setWoPdfBlob(null);
    try {
      const res = await axios.get(WORK_ORDER_PDF_URL(wo.id), { headers, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setWoPdfBlob(url);
    } catch { notify('Failed to load work order PDF', 'error'); }
  };

  const closeReview = () => {
    if (woPdfBlob) URL.revokeObjectURL(woPdfBlob);
    setWoPdfBlob(null);
    setWoReview(null);
  };

  // ── sidebar ─────────────────────────────────────────────────────────────────
  const navItems = [
    { key: 'msmes',       label: 'My MSMEs',      icon: <Business /> },
    { key: 'groups',      label: 'My Groups',      icon: <GroupIcon /> },
    { key: 'reports',     label: 'My Reports',     icon: <Assignment /> },
    { key: 'workorders',  label: 'Work Orders',    icon: <Description /> },
    { key: 'training', label: 'Training', icon: <School />,
      badge: facilitationAssignments.length + mentorSessions.length || undefined },
  ];

  const SidebarContent = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: BRAND.sidebarBg }}>
      {/* Close button — mobile only */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'flex-end', px: 1, pt: 1 }}>
        <IconButton size="small" onClick={() => setMobileOpen(false)}
          sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
          <Close />
        </IconButton>
      </Box>
      <Box sx={{ px: 2.5, py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: 1, bgcolor: BRAND.programmeGreen,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography sx={{ fontWeight: 900, fontSize: 10, color: '#fff', lineHeight: 1 }}>GIZ</Typography>
          </Box>
          <Box sx={{
            width: 32, height: 32, borderRadius: 1, bgcolor: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography sx={{ fontWeight: 900, fontSize: 7, color: BRAND.primaryMain, lineHeight: 1.1, textAlign: 'center' }}>GOPA{'\n'}AFC</Typography>
          </Box>
        </Box>
        <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 13, mt: 1 }}>PRUDEV II</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>BGE Portal</Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />

      <List sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        px: 1,
        pt: 1,
        WebkitOverflowScrolling: 'touch',
        '&::-webkit-scrollbar': { width: 8 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.25)', borderRadius: 8 },
      }}>
        {navItems.map(({ key, label, icon, badge }) => (
          <ListItemButton
            key={key}
            selected={section === key}
            onClick={() => { startTransition(() => setSection(key)); setMobileOpen(false); }}
            sx={{
              borderRadius: 2, mb: 0.5, color: 'rgba(255,255,255,0.75)',
              '&.Mui-selected': { bgcolor: BRAND.sidebarSelected, color: '#fff' },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
              {badge ? <Badge badgeContent={badge} color="warning">{icon}</Badge> : icon}
            </ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: BRAND.programmeGreen }}>
            {bgeName[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 600 }} noWrap>{bgeName}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>BGE</Typography>
          </Box>
        </Box>
        <Button
          variant="outlined" size="small" startIcon={<HelpOutline />}
          onClick={() => { setHelpSection(0); setHelpDialog(true); setMobileOpen(false); }}
          fullWidth
          sx={{
            color: 'rgba(255,255,255,0.82)',
            borderColor: 'rgba(255,255,255,0.22)',
            mb: 1,
            '&:hover': { borderColor: '#fff', color: '#fff', bgcolor: 'rgba(255,255,255,0.06)' },
            fontSize: 12,
          }}
        >
          Help
        </Button>
        <Button
          variant="outlined" size="small" startIcon={<Logout />} onClick={onLogout} fullWidth
          sx={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.2)',
            '&:hover': { borderColor: '#fff', color: '#fff', bgcolor: 'rgba(255,255,255,0.05)' }, fontSize: 12 }}
        >
          Sign out
        </Button>
      </Box>
    </Box>
  );

  // ── main content ─────────────────────────────────────────────────────────────
  const paged = (arr, page) => arr.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default', overflowX: 'hidden' }}>
      {/* mobile appbar */}
      <AppBar position="fixed" sx={{ display: { md: 'none' }, bgcolor: BRAND.sidebarBg, zIndex: (t) => t.zIndex.drawer + 1, boxShadow: 'none' }}>
        <Toolbar>
          <IconButton color="inherit" onClick={() => setMobileOpen(o => !o)}
            sx={{ mr: 1, p: 1.25, touchAction: 'manipulation' }} aria-label="Open navigation menu">
            <MenuIcon />
          </IconButton>
          <Typography fontWeight={700} fontSize={15} noWrap sx={{ flex: 1 }}>PRUDEV II · BGE Portal</Typography>
          <Tooltip title="Help">
            <IconButton color="inherit" onClick={() => { setHelpSection(0); setHelpDialog(true); }} edge="end">
              <HelpOutline />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* mobile drawer */}
      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
        keepMounted disableScrollLock
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, maxWidth: '86vw', height: '100dvh', boxSizing: 'border-box', border: 'none' } }}>
        <SidebarContent />
      </Drawer>

      {/* desktop sidebar */}
      <Box sx={{ width: DRAWER_WIDTH, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
        <Box sx={{ width: DRAWER_WIDTH, position: 'fixed', top: 0, bottom: 0 }}>
          <SidebarContent />
        </Box>
      </Box>

      {/* main */}
      <Box component="main" sx={{ flex: 1, p: { xs: 2, md: 3 }, mt: { xs: 7, md: 0 }, minWidth: 0, overflowX: 'hidden', pb: { xs: 10, md: 4 } }}>
        {loading && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 4 }} />}

        {/* ── My MSMEs (direct assignments only) ── */}
        {section === 'msmes' && !loading && (() => {
          const directMsmes = msmes.filter(m => m.assigned_bge === myBgeId);
          return (
            <Box>
              {/* Responsive header: stacks vertically on phones so the
                  "New Report" button gets full width and the subtitle has
                  room to breathe instead of being squeezed against the button. */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight={700}>My MSMEs</Typography>
                <Typography variant="body2" color="text.secondary">
                  <Box component="span" sx={{ color: BRAND.primaryMain, fontWeight: 600 }}>
                    {directMsmes.length}
                  </Box>
                  {' '}directly assigned to you · group MSMEs are in{' '}
                  <Box component="span"
                    sx={{ color: '#F9A825', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => startTransition(() => setSection('groups'))}>
                    My Groups
                  </Box>
                </Typography>
              </Box>

              {/* Active work order period banner */}
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const active = workOrders.find(wo =>
                  wo.start_date && wo.end_date &&
                  wo.start_date <= today && wo.end_date >= today
                );
                const upcoming = !active && workOrders.find(wo =>
                  wo.start_date && wo.start_date > today
                );
                const wo = active || upcoming;
                if (!wo) return null;
                return (
                  <Alert
                    severity={active ? 'info' : 'warning'}
                    icon={false}
                    sx={{ mb: 2, borderRadius: 2, '& .MuiAlert-message': { width: '100%' } }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                      <Box>
                        <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
                          {active ? 'Active Assignment Period' : 'Upcoming Assignment'}
                          {' · '}{wo.work_order_number}
                        </Typography>
                        <Typography variant="caption">
                          {wo.work_order_type_display} · {wo.start_date} – {wo.end_date}
                          {' · '}{wo.location}
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ mt: 0.25, fontStyle: 'italic' }}>
                          Your visit reports should fall within this date range.
                        </Typography>
                      </Box>
                      <Chip
                        label={active ? 'Active' : 'Upcoming'}
                        size="small"
                        color={active ? 'info' : 'warning'}
                        variant="filled"
                      />
                    </Box>
                  </Alert>
                );
              })()}

              {directMsmes.length === 0 ? (
                <Paper sx={{ p: { xs: 3, sm: 6 }, textAlign: 'center' }}>
                  <Business sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">No MSMEs directly assigned yet. Contact your programme administrator.</Typography>
                </Paper>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                  {directMsmes.map((m) => {
                    const msmeReportCount = reports.filter(r => r.msme === m.id).length;
                    const lastIndividual = reports.filter(r => r.msme === m.id).sort((a, b) => b.visit_date > a.visit_date ? 1 : -1)[0];
                    // last_support_date from the API already merges individual + group reports
                    const lastSupportDate = m.last_support_date || lastIndividual?.visit_date;
                    const totalSupports = m.total_reports || msmeReportCount;
                    return (
                      <Card key={m.id}
                        sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 }, borderLeft: `4px solid ${BRAND.primaryMain}` }}
                        onClick={() => openMsmeDetail(m)}
                      >
                        <CardContent>
                          {/* Row 1: name + type + action buttons */}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                            <Box sx={{ flex: 1 }}>
                              <Typography fontWeight={700} fontSize={15}>{m.business_name}</Typography>
                              <Typography variant="caption" color="text.secondary">{m.msme_code}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
                              <Chip label={m.business_type || 'MSME'} size="small" variant="outlined" />
                              <Tooltip title="View details & reports">
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); openMsmeDetail(m); }}>
                                  <Visibility fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="New visit report">
                                <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); openNewReport(m.id); }}>
                                  <Add fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Update MSME data">
                                <IconButton size="small" color="success" onClick={(e) => { e.stopPropagation(); openGrowthForm(m); }}>
                                  <TrendingUp fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </Box>

                          {/* Row 2: key fields grid */}
                          <Grid container spacing={1} sx={{ mb: 1 }}>
                            {m.owner_name && (
                              <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary" display="block">Owner</Typography>
                                <Typography variant="body2" fontWeight={500}>{m.owner_name}</Typography>
                              </Grid>
                            )}
                            {m.phone && (
                              <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary" display="block">Phone</Typography>
                                <Typography variant="body2">{m.phone}</Typography>
                              </Grid>
                            )}
                            {(m.city || m.state) && (
                              <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary" display="block">Location</Typography>
                                <Typography variant="body2">{[m.city, m.state].filter(Boolean).join(', ')}</Typography>
                              </Grid>
                            )}
                            {m.sector && (
                              <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary" display="block">Sector</Typography>
                                <Typography variant="body2">{m.sector}</Typography>
                              </Grid>
                            )}
                            {m.assignment_date && (
                              <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary" display="block">Assigned</Typography>
                                <Typography variant="body2">{m.assignment_date}</Typography>
                              </Grid>
                            )}
                            <Grid item xs={6} sm={3}>
                              <Typography variant="caption" color="text.secondary" display="block">Supports</Typography>
                              <Typography variant="body2" fontWeight={600} color={totalSupports > 0 ? 'primary.main' : 'text.secondary'}>
                                {totalSupports} total{lastSupportDate ? ` · last ${lastSupportDate}` : ''}
                              </Typography>
                            </Grid>
                          </Grid>

                          {/* Assignment objectives (truncated) */}
                          {m.assignment_objectives && (
                            <Alert severity="info" icon={false} sx={{ py: 0.5, mt: 0.5 }}>
                              <Typography variant="caption" fontWeight={600} display="block">Assignment objective</Typography>
                              <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap' }}>
                                {m.assignment_objectives.length > 180
                                  ? m.assignment_objectives.slice(0, 180) + '…'
                                  : m.assignment_objectives}
                              </Typography>
                            </Alert>
                          )}

                          {/* Chips row */}
                          <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                            {m.cohort_name && (
                              <Chip label={`Cohort ${m.cohort_name}`} size="small"
                                sx={{ bgcolor: BRAND.programmeGreen + '20', color: BRAND.programmeGreen, fontWeight: 600 }} />
                            )}
                            {m.session_number && (
                              <Chip label={`Session ${m.session_number}`} size="small" variant="outlined" />
                            )}
                          </Box>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              )}
            </Box>
          );
        })()}

        {/* ── My Groups ── */}
        {section === 'groups' && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>My Groups</Typography>
                <Typography variant="body2" color="text.secondary">
                  {groups.length} group{groups.length !== 1 ? 's' : ''} you're a member of
                </Typography>
              </Box>
            </Box>

            {/* Active work order period banner */}
            {(() => {
              const today = new Date().toISOString().slice(0, 10);
              const active = workOrders.find(wo =>
                wo.start_date && wo.end_date &&
                wo.start_date <= today && wo.end_date >= today
              );
              const upcoming = !active && workOrders.find(wo =>
                wo.start_date && wo.start_date > today
              );
              const wo = active || upcoming;
              if (!wo) return null;
              return (
                <Alert
                  severity={active ? 'info' : 'warning'}
                  icon={false}
                  sx={{ mb: 2, borderRadius: 2, '& .MuiAlert-message': { width: '100%' } }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
                        {active ? 'Active Assignment Period' : 'Upcoming Assignment'}
                        {' · '}{wo.work_order_number}
                      </Typography>
                      <Typography variant="caption">
                        {wo.work_order_type_display} · {wo.start_date} – {wo.end_date}
                        {' · '}{wo.location}
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ mt: 0.25, fontStyle: 'italic' }}>
                        Your group reports should fall within this date range.
                      </Typography>
                    </Box>
                    <Chip
                      label={active ? 'Active' : 'Upcoming'}
                      size="small"
                      color={active ? 'info' : 'warning'}
                      variant="filled"
                    />
                  </Box>
                </Alert>
              );
            })()}

            {groups.length === 0 && (
              <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
                You're not currently part of any BGE group.
              </Paper>
            )}

            <Grid container spacing={2}>
              {groups.map(g => {
                const groupMsmes = msmes.filter(m => m.assigned_group === g.id);
                const youAreLead = isTeamLeadOf(g);
                const reports = groupReports.filter(r => r.group === g.id);
                return (
                  <Grid item xs={12} key={g.id}>
                    <Card variant="outlined">
                      <CardContent>
                        {/* Header */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2, flexWrap: 'wrap' }}>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Typography variant="subtitle1" fontWeight={700}>{g.name}</Typography>
                              {youAreLead && (
                                <Chip icon={<Star sx={{ fontSize: 14 }} />} label="You are the team lead" color="warning" size="small" />
                              )}
                            </Box>
                            {g.description && (
                              <Typography variant="caption" color="text.secondary">{g.description}</Typography>
                            )}
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                              Team Lead: <strong>{g.team_lead_name || 'Not assigned'}</strong> · {g.member_count} member{g.member_count !== 1 ? 's' : ''}
                            </Typography>
                          </Box>
                          {youAreLead && (
                            <Button variant="contained" size="small" startIcon={<Add />}
                                    onClick={() => openNewGroupReport(g.id)}>
                              File Group Report
                            </Button>
                          )}
                        </Box>

                        {/* Objectives banner */}
                        {g.objectives && (
                          <Alert severity="info" icon={<Assignment fontSize="small" />} sx={{ mb: 2 }}>
                            <Typography variant="caption" fontWeight={600} display="block">Group objectives</Typography>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{g.objectives}</Typography>
                          </Alert>
                        )}

                        {/* Members */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                          {(g.members_detail || []).map(m => (
                            <Chip
                              key={m.id}
                              label={m.name}
                              size="small"
                              icon={m.id === g.team_lead ? <Star sx={{ fontSize: 14 }} /> : undefined}
                              color={m.id === g.team_lead ? 'warning' : (m.id === myBgeId ? 'primary' : 'default')}
                              variant={m.id === myBgeId ? 'filled' : 'outlined'}
                            />
                          ))}
                        </Box>

                        <Divider sx={{ my: 1.5 }} />

                        {/* Assigned MSMEs — full scrollable list */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <GroupIcon sx={{ fontSize: 16, color: '#F9A825' }} />
                          <Typography variant="caption" fontWeight={600}>
                            Assigned MSMEs ({groupMsmes.length})
                          </Typography>
                        </Box>
                        {groupMsmes.length === 0 ? (
                          <Typography variant="caption" color="text.secondary">No MSMEs assigned to this group yet.</Typography>
                        ) : (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 240, overflow: 'auto' }}>
                            {groupMsmes.map(m => (
                              <Box key={m.id} sx={{
                                display: 'flex', alignItems: 'center', gap: 1,
                                px: 1, py: 0.75, borderRadius: 1, bgcolor: 'background.default',
                              }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography variant="body2" fontWeight={500} noWrap>{m.business_name}</Typography>
                                  <Typography variant="caption" color="text.secondary" noWrap>
                                    {m.msme_code}{m.session_number ? ` · Session ${m.session_number}` : ''}{m.city ? ` · ${m.city}` : ''}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
                                  <Tooltip title="View details">
                                    <IconButton size="small" onClick={() => openMsmeDetail(m)}>
                                      <Visibility fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="New visit report">
                                    <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); openNewReport(m.id); }}>
                                      <Add fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Update MSME data">
                                    <IconButton size="small" color="success" onClick={(e) => { e.stopPropagation(); openGrowthForm(m); }}>
                                      <TrendingUp fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        )}

                        {/* Group reports already filed */}
                        {reports.length > 0 && (
                          <>
                            <Divider sx={{ my: 1.5 }} />
                            <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
                              Group reports ({reports.length})
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {reports.map(r => {
                                const finalized = r.status === 'submitted' || r.status === 'approved';
                                return (
                                <Box key={r.id} sx={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  p: 1, borderRadius: 1,
                                  bgcolor: finalized ? '#f5f5f5' : 'background.default',
                                  opacity: finalized ? 0.8 : 1,
                                }}>
                                  <Box>
                                    <Typography variant="body2" fontWeight={500} color={finalized ? 'text.secondary' : 'inherit'}>
                                      {r.visit_date}{r.session_number ? ` · Session ${r.session_number}` : ''}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {r.msme_count} MSME{r.msme_count !== 1 ? 's' : ''} · by {r.team_lead_name || '—'}
                                    </Typography>
                                    {r.status === 'submitted' && (
                                      <Typography variant="caption" sx={{ display: 'block', color: 'primary.main', fontWeight: 600 }}>
                                        Assignment report submitted — locked
                                      </Typography>
                                    )}
                                    {r.status === 'approved' && (
                                      <Typography variant="caption" sx={{ display: 'block', color: 'success.main', fontWeight: 600 }}>
                                        Assignment completed ✓
                                      </Typography>
                                    )}
                                  </Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Chip
                                      label={r.status === 'approved' ? 'Completed' : r.status}
                                      size="small"
                                      color={r.status === 'approved' ? 'success' : (r.status === 'submitted' ? 'primary' : 'default')}
                                    />
                                    <Tooltip title="View PDF">
                                      <IconButton size="small" onClick={() => openGroupReportPdf(r.id, 'view')}><Visibility fontSize="small" /></IconButton>
                                    </Tooltip>
                                    <Tooltip title="Download PDF">
                                      <IconButton size="small" onClick={() => openGroupReportPdf(r.id, 'download')}><PictureAsPdf fontSize="small" /></IconButton>
                                    </Tooltip>
                                    {youAreLead && !finalized && (
                                      <Tooltip title="Edit report">
                                        <IconButton size="small" onClick={() => openEditGroupReport(r)}><Edit fontSize="small" /></IconButton>
                                      </Tooltip>
                                    )}
                                    {!youAreLead && !finalized && (
                                      <Tooltip title="File my contribution">
                                        <IconButton size="small" color="warning" onClick={() => openContribution(r)}>
                                          <Edit fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </Box>
                                </Box>
                                );
                              })}
                            </Box>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* ── My Reports ── */}
        {section === 'reports' && (
          <Box>
            <Box sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'stretch', sm: 'center' },
              gap: { xs: 1.5, sm: 2 },
              mb: 3,
            }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" fontWeight={700}>My Reports</Typography>
                <Typography variant="body2" color="text.secondary">{reports.length} report{reports.length !== 1 ? 's' : ''} submitted</Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => openNewReport()}
                sx={{ whiteSpace: 'nowrap', flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'auto' } }}
              >
                New Report
              </Button>
            </Box>

            {reports.length === 0 ? (
              <Paper sx={{ p: 6, textAlign: 'center' }}>
                <Assignment sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No reports yet. Start by writing a report for one of your MSMEs.</Typography>
              </Paper>
            ) : (
              <TableContainer component={Paper} sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <Table size="small" sx={{ minWidth: 680 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>MSME</TableCell>
                      <TableCell>Visit Type</TableCell>
                      <TableCell>Visit Date</TableCell>
                      <TableCell>Latest Growth Update</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paged(reports, reportPage).map((r) => {
                      const msmeSnaps = msmes.find(m => m.id === r.msme);
                      const lastSnap = msmeSnaps?.last_growth_snapshot;
                      return (
                      <TableRow key={r.id} hover>
                        <TableCell>
                          <Typography fontSize={13} fontWeight={600}>{r.msme_name || r.msme}</Typography>
                          <Typography fontSize={11} color="text.secondary">{r.msme_code}</Typography>
                        </TableCell>
                        <TableCell>{VISIT_TYPE_LABELS[r.visit_type] || r.visit_type}</TableCell>
                        <TableCell>{r.visit_date}</TableCell>
                        <TableCell>
                          {lastSnap ? (
                            <Box>
                              <Typography fontSize={12} fontWeight={600}>{lastSnap.snapshot_date}</Typography>
                              {lastSnap.annual_turnover && (
                                <Typography fontSize={11} color="text.secondary">
                                  Rev: UGX {Number(lastSnap.annual_turnover).toLocaleString()}
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            <Typography fontSize={11} color="text.disabled">No data</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip label={r.status} size="small" color={STATUS_COLORS[r.status] || 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="View report">
                              <IconButton size="small" color="primary"
                                onClick={() => setViewReport({ ...r, _msme: msmes.find(m => m.id === r.msme), _bgeName: bgeName })}>
                                <Visibility fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {r.status === 'draft' ? (
                              <Tooltip title="Edit draft">
                                <IconButton size="small" onClick={() => openEditReport(r)}><Edit fontSize="small" /></IconButton>
                              </Tooltip>
                            ) : (
                              <Tooltip title="Submitted — read only">
                                <span><IconButton size="small" disabled><Edit fontSize="small" /></IconButton></span>
                              </Tooltip>
                            )}
                            <Tooltip title="Download PDF not available">
                              <span>
                                <IconButton size="small" color="error" disabled>
                                  <PictureAsPdf fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <TablePagination
                  component="div" count={reports.length} page={reportPage}
                  rowsPerPage={ROWS_PER_PAGE} rowsPerPageOptions={[ROWS_PER_PAGE]}
                  onPageChange={(_, p) => setReportPage(p)}
                />
              </TableContainer>
            )}
          </Box>
        )}

        {/* ── Work Orders (read-only — admin issues) ── */}
        {section === 'workorders' && (
          <Box>
            {/* Signature card — compact when a signature is already stored */}
            <Card variant="outlined" sx={{ mb: 3, p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>My Signature</Typography>
                  {sigUrl ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Box sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'inline-block', bgcolor: '#f9f9f9' }}>
                        <img src={sigUrl} alt="My signature" style={{ maxHeight: 48, maxWidth: 180, display: 'block' }} />
                      </Box>
                      <Typography variant="caption" color="success.main" fontWeight={600}>Signature on file ✓</Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Upload a JPEG or PNG of your signature — it will be embedded in your work orders and reports automatically.
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    ref={sigInputRef}
                    style={{ display: 'none' }}
                    onChange={e => setSigFile(e.target.files[0] || null)}
                  />
                  {sigFile ? (
                    <>
                      <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sigFile.name}</Typography>
                      <Button variant="contained" size="small" onClick={uploadSignature} disabled={sigUploading}>
                        {sigUploading ? <CircularProgress size={14} color="inherit" /> : 'Upload'}
                      </Button>
                      <Button size="small" onClick={() => setSigFile(null)}>Cancel</Button>
                    </>
                  ) : (
                    <Button variant={sigUrl ? 'text' : 'outlined'} size="small" onClick={() => sigInputRef.current?.click()}>
                      {sigUrl ? 'Update signature' : 'Choose file…'}
                    </Button>
                  )}
                </Box>
              </Box>
            </Card>

            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>Issued Work Orders</Typography>
              <Typography variant="body2" color="text.secondary">
                {workOrders.length} work order{workOrders.length !== 1 ? 's' : ''} issued to you
                {myBgeCode && (
                  <Box component="span" sx={{ ml: 1, color: BRAND.primaryMain, fontWeight: 600 }}>
                    · BGE code: {myBgeCode}
                  </Box>
                )}
              </Typography>
            </Box>

            {workOrders.length === 0 ? (
              <Paper sx={{ p: 6, textAlign: 'center' }}>
                <Description sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No work orders have been issued to you yet.</Typography>
              </Paper>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {workOrders.map(wo => (
                  <Card variant="outlined" key={wo.id}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                        <Box>
                          <Typography fontWeight={700}>{wo.work_order_number}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {wo.work_order_type_display} · Issued: {wo.issue_date}
                            {wo.start_date && ` · ${wo.start_date}`}
                            {wo.end_date && ` – ${wo.end_date}`}
                          </Typography>
                          {wo.status === 'signed' && wo.bge_signed_date && (
                            <Typography variant="caption" color="success.main" display="block" fontWeight={600}>
                              Signed: {wo.bge_signed_date}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary" display="block">{wo.location}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Chip
                            label={wo.status_display || wo.status}
                            size="small"
                            color={wo.status === 'signed' ? 'success' : 'primary'}
                          />
                          {wo.status === 'issued' && (
                            <Tooltip title={sigUrl ? 'Sign this work order — uses your uploaded signature' : 'Upload your signature first, then sign'}>
                              <span>
                                <Button
                                  variant="contained"
                                  size="small"
                                  color="success"
                                  disabled={woSigning === wo.id || !sigUrl}
                                  startIcon={woSigning === wo.id ? <CircularProgress size={14} color="inherit" /> : <CheckCircle />}
                                  onClick={() => signWo(wo)}
                                >
                                  Sign
                                </Button>
                              </span>
                            </Tooltip>
                          )}
                          <Tooltip title="Review work order PDF">
                            <IconButton size="small" color="info" onClick={() => reviewWo(wo)}>
                              <Visibility fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Download PDF">
                            <IconButton size="small" color={wo.status === 'signed' ? 'success' : 'default'} onClick={() => downloadWoPdf(wo)}>
                              <Download fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Print / Save as PDF">
                            <IconButton size="small" onClick={() => setWorkOrderPreview(wo)}>
                              <Print fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                      {wo.objective && (
                        <Alert severity="info" sx={{ mt: 1.5, py: 0.5 }} icon={false}>
                          <Typography variant="caption" fontWeight={600}>Objective</Typography>
                          <Typography variant="caption" display="block" sx={{ whiteSpace: 'pre-wrap' }}>
                            {wo.objective.length > 200 ? wo.objective.slice(0, 200) + '…' : wo.objective}
                          </Typography>
                        </Alert>
                      )}
                      <Box sx={{ display: 'flex', gap: 2, mt: 1.5, flexWrap: 'wrap' }}>
                        <Typography variant="caption" color="text.secondary">
                          Rate: <strong>UGX {Number(wo.rate_per_day).toLocaleString()}/day</strong>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Max: <strong>{wo.max_days} days</strong>
                        </Typography>
                        {wo.team_leader_name && (
                          <Typography variant="caption" color="text.secondary">
                            Team Leader: <strong>{wo.team_leader_name}</strong>
                          </Typography>
                        )}
                      </Box>

                      {/* Training sessions linked to this work order — click to open Training page */}
                      {(() => {
                        const linked = sessions.filter(s => s.work_order === wo.id);
                        if (!linked.length) return null;
                        return (
                          <>
                            <Divider sx={{ my: 1.5 }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                              <Typography variant="caption" fontWeight={700}>
                                Training sessions ({linked.length})
                              </Typography>
                              <Tooltip title="Go to Training page to record attendance and submit reports">
                                <Button size="small" startIcon={<School />} onClick={() => startTransition(() => setSection('training'))}
                                  sx={{ fontSize: 11 }}>
                                  Open Training
                                </Button>
                              </Tooltip>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {linked.map(s => (
                                <Box key={s.id}
                                  onClick={() => startTransition(() => setSection('training'))}
                                  sx={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    p: 1, borderRadius: 1, bgcolor: 'background.default',
                                    cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' },
                                  }}>
                                  <Box>
                                    <Typography variant="body2" fontWeight={500}>{s.title}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {s.date}{s.location ? ` · ${s.location}` : ''} · {s.attendance_count ?? 0} present
                                    </Typography>
                                  </Box>
                                  <ChevronRight sx={{ color: 'text.disabled', fontSize: 18 }} />
                                </Box>
                              ))}
                            </Box>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* ── Training facilitation section ──────────────────────────────── */}
        {section === 'training' && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>My Training Assignments</Typography>
                <Typography variant="body2" color="text.secondary">
                  <Box component="span" sx={{ color: '#1565C0', fontWeight: 600 }}>
                    {facilitationAssignments.length}
                  </Box>
                  {' '}module{facilitationAssignments.length !== 1 ? 's' : ''} assigned · click a session to open attendance or submit a report
                </Typography>
              </Box>
            </Box>

          {facilitationAssignments.length === 0 && mentorSessions.length === 0 ? (
            <Paper sx={{ p: 6, textAlign: 'center' }}>
              <School sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary" gutterBottom>No training assignments yet.</Typography>
              <Typography variant="caption" color="text.secondary">
                You will appear here as a lead facilitator or mentor once the programme administrator assigns you to a session.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
              {facilitationAssignments.map((a) => {
                const topicSessions = sessions.filter(s => s.topic === a.topic);
                const totalPresent   = topicSessions.reduce((n, s) => n + (s.attendance_count ?? 0), 0);
                const reportsFiled   = topicSessions.filter(s => s.has_training_report).length;
                const totalRegistered = topicSessions.reduce((n, s) => n + (s.businesses_detail?.length ?? 0), 0);
                return (
                  <Card key={a.id} sx={{ '&:hover': { boxShadow: 3 }, borderLeft: '4px solid #1565C0', transition: 'box-shadow 0.2s' }}>
                    <CardContent>
                      {/* Row 1: module chip + topic name + summary chips */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flex: 1, minWidth: 0 }}>
                          <School sx={{ color: '#1565C0', fontSize: 20, flexShrink: 0, mt: 0.25 }} />
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                              <Chip label={`Module ${a.topic_module_number}`} size="small"
                                sx={{ bgcolor: '#1565C0', color: '#fff', fontWeight: 700, fontSize: 11 }} />
                              <Typography fontWeight={700} fontSize={15}>
                                {a.topic_section_number ? `${a.topic_section_number} – ` : ''}{a.topic_name}
                              </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">{a.topic_module_name}</Typography>
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <Button size="small" variant="contained" startIcon={<Edit />}
                            onClick={() => openReportWizard(a)}
                            sx={{ bgcolor: '#1565C0', '&:hover': { bgcolor: '#0d47a1' }, fontSize: 12, whiteSpace: 'nowrap' }}>
                            Write Report
                          </Button>
                          <Chip icon={<HowToReg sx={{ fontSize: '13px !important' }} />}
                            label={`${totalPresent} attended`} size="small" variant="outlined"
                            color={totalPresent > 0 ? 'success' : 'default'} />
                          <Chip icon={<Description sx={{ fontSize: '13px !important' }} />}
                            label={`${reportsFiled}/${topicSessions.length} reports`} size="small" variant="outlined"
                            color={reportsFiled === topicSessions.length && topicSessions.length > 0 ? 'success' : 'warning'} />
                        </Box>
                      </Box>

                      {/* Row 2: key info grid */}
                      <Grid container spacing={1} sx={{ mb: topicSessions.length ? 1.5 : 0.5 }}>
                        <Grid item xs={6} sm={4}>
                          <Typography variant="caption" color="text.secondary" display="block">Assigned</Typography>
                          <Typography variant="body2" fontWeight={500}>{a.assigned_date || '—'}</Typography>
                        </Grid>
                        <Grid item xs={3} sm={4}>
                          <Typography variant="caption" color="text.secondary" display="block">Sessions</Typography>
                          <Typography variant="body2" fontWeight={600} color={topicSessions.length > 0 ? 'primary.main' : 'text.secondary'}>
                            {topicSessions.length}
                          </Typography>
                        </Grid>
                        <Grid item xs={3} sm={4}>
                          <Typography variant="caption" color="text.secondary" display="block">MSMEs</Typography>
                          <Typography variant="body2" fontWeight={600} color={totalRegistered > 0 ? 'primary.main' : 'text.secondary'}>
                            {totalRegistered}
                          </Typography>
                        </Grid>
                        {a.notes && (
                          <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary" display="block">Notes</Typography>
                            <Typography variant="body2">{a.notes}</Typography>
                          </Grid>
                        )}
                      </Grid>

                      {/* Session list */}
                      <Divider sx={{ my: 1 }} />
                      {topicSessions.length === 0 ? (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            No sessions scheduled for this topic yet. Sessions are added by your programme administrator.
                          </Typography>
                        </Box>
                      ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          {topicSessions.map((s) => (
                            <Box key={s.id}
                              onClick={() => openSessionDetail(s, 0)}
                              sx={{
                                display: 'flex', alignItems: 'center', gap: 1.5,
                                px: 1, py: 0.75, borderRadius: 1, cursor: 'pointer',
                                '&:hover': { bgcolor: 'action.hover' },
                                transition: 'background 0.15s',
                              }}
                            >
                              {/* date block */}
                              <Box sx={{
                                minWidth: 38, textAlign: 'center', flexShrink: 0,
                                bgcolor: '#F1F5F9', borderRadius: 1, py: 0.25, px: 0.75,
                              }}>
                                <Typography sx={{ display: 'block', lineHeight: 1.2, fontSize: 10, color: 'text.secondary' }}>
                                  {s.date ? new Date(s.date).toLocaleDateString('en-GB', { month: 'short' }) : '—'}
                                </Typography>
                                <Typography fontWeight={700} sx={{ lineHeight: 1.2, fontSize: 13 }}>
                                  {s.date ? new Date(s.date).getDate() : '—'}
                                </Typography>
                              </Box>

                              {/* session info */}
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" fontWeight={600} noWrap>{s.title}</Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  {s.location || 'Location not set'}
                                  {s.businesses_detail?.length > 0 && ` · ${s.businesses_detail.length} registered`}
                                </Typography>
                              </Box>

                              {/* status chips */}
                              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, alignItems: 'center' }}>
                                <Chip
                                  icon={<HowToReg sx={{ fontSize: '12px !important' }} />}
                                  label={s.attendance_count ?? 0} size="small"
                                  color={s.attendance_count > 0 ? 'success' : 'default'}
                                  variant={s.attendance_count > 0 ? 'filled' : 'outlined'}
                                  sx={{ height: 22, fontSize: 11 }} />
                                <Chip
                                  icon={<Description sx={{ fontSize: '12px !important' }} />}
                                  label={s.has_training_report ? 'Filed' : 'Pending'} size="small"
                                  color={s.has_training_report ? 'success' : 'warning'}
                                  variant={s.has_training_report ? 'filled' : 'outlined'}
                                  sx={{ height: 22, fontSize: 11 }} />
                                <ChevronRight sx={{ color: 'text.disabled', fontSize: 18 }} />
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
          </Box>
        )}

        {/* ── Mentor Training Assignments ──────────────────────────────────── */}
        {section === 'training' && mentorSessions.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>My Mentor Assignments</Typography>
              <Typography variant="body2" color="text.secondary">
                Sessions you are attending as a mentor — file your mentor report after each session.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {mentorSessions.map(s => {
                const mReport = mentorReports[s.id];
                return (
                  <Card key={s.id} sx={{ borderLeft: '4px solid #7B1FA2', '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                          <People sx={{ color: '#7B1FA2', fontSize: 20, mt: 0.25, flexShrink: 0 }} />
                          <Box>
                            <Typography fontWeight={700} fontSize={15}>{s.title}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {s.date} {s.location ? `· ${s.location}` : ''}
                              {(s.team || []).find(m => m.role === 'lead')?.bge_name ? ` · Lead: ${(s.team || []).find(m => m.role === 'lead').bge_name}` : ''}
                            </Typography>
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, alignItems: 'center' }}>
                          <Chip
                            label={mReport ? (mReport.status === 'submitted' ? 'Submitted' : 'Draft') : 'Pending'}
                            size="small"
                            color={mReport?.status === 'submitted' ? 'success' : mReport ? 'warning' : 'default'}
                          />
                          <Button size="small" variant="contained" startIcon={<Edit />}
                            onClick={() => openMentorReport(s)}
                            sx={{ bgcolor: '#7B1FA2', '&:hover': { bgcolor: '#6a1b9a' }, fontSize: 12 }}>
                            {mReport ? 'Edit Report' : 'Write Report'}
                          </Button>
                        </Box>
                      </Box>

                      {/* MSMEs in this session */}
                      {(s.businesses_detail || []).length > 0 && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>MSMEs in this session:</Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {s.businesses_detail.map(m => (
                              <Chip key={m.id} label={m.business_name} size="small" variant="outlined" />
                            ))}
                          </Box>
                        </Box>
                      )}

                      {/* Attendance count */}
                      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                        <Chip icon={<HowToReg sx={{ fontSize: '12px !important' }} />}
                          label={`${s.attendance_count ?? 0} attended`} size="small"
                          color={s.attendance_count > 0 ? 'success' : 'default'} variant="outlined" />
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          </Box>
        )}
      </Box>

      {/* ── Mentor Training Report Dialog ───────────────────────────────────── */}
      {mentorReportDialog && mentorReportSession && (
        <Dialog open onClose={() => setMentorReportDialog(false)} maxWidth="md" fullWidth
          PaperProps={{ sx: { height: { xs: '95dvh', md: '88vh' }, display: 'flex', flexDirection: 'column' } }}>
          <DialogTitle sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
            <Typography fontWeight={700} variant="h6">Mentor Training Report</Typography>
            <Typography variant="caption" color="text.secondary">
              {mentorReportSession.title} · {mentorReportSession.date}
              {(mentorReportSession.team || []).find(m => m.role === 'lead')?.bge_name ? ` · Lead Facilitator: ${(mentorReportSession.team || []).find(m => m.role === 'lead').bge_name}` : ''}
            </Typography>
          </DialogTitle>
          <DialogContent dividers sx={{ flex: 1, overflow: 'auto' }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="Training Title"
                  value={mentorReportForm.training_title}
                  onChange={e => setMentorReportForm(f => ({ ...f, training_title: e.target.value }))} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth size="small" label="Training Dates"
                  value={mentorReportForm.training_dates}
                  onChange={e => setMentorReportForm(f => ({ ...f, training_dates: e.target.value }))} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth size="small" label="Venue"
                  value={mentorReportForm.venue}
                  onChange={e => setMentorReportForm(f => ({ ...f, venue: e.target.value }))} />
              </Grid>

              {/* ── Session context panel (read-only) ── */}
              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f8f9fa', borderRadius: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Session Overview</Typography>
                  <Grid container spacing={1}>
                    {(mentorReportSession.team || []).find(m => m.role === 'lead') && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary" display="block">Lead Facilitator</Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {(mentorReportSession.team || []).find(m => m.role === 'lead')?.bge_name}
                        </Typography>
                      </Grid>
                    )}
                    {(mentorReportSession.team || []).filter(m => m.role === 'mentor').length > 0 && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary" display="block">Other Mentor BGEs</Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                          {(mentorReportSession.team || []).filter(m => m.role === 'mentor').map(m => (
                            <Chip key={m.bge_id} label={m.bge_name} size="small" sx={{ bgcolor: '#EDE7F6', color: '#4527A0', fontWeight: 600 }} />
                          ))}
                        </Box>
                      </Grid>
                    )}
                    {(mentorReportSession.businesses_detail || []).length > 0 && (
                      <Grid item xs={12}>
                        <Typography variant="caption" color="text.secondary" display="block">MSMEs in this session</Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                          {mentorReportSession.businesses_detail.map(m => (
                            <Chip key={m.id} label={`${m.business_name}${m.owner_name ? ` · ${m.owner_name}` : ''}`}
                              size="small" variant="outlined" />
                          ))}
                        </Box>
                      </Grid>
                    )}
                    <Grid item xs={12}>
                      <Alert severity={mentorReportSession.attendance_count > 0 ? 'success' : 'warning'}
                        icon={false} sx={{ py: 0.5, mt: 0.5 }}>
                        <Typography variant="body2">
                          <strong>Attendance Sheet:</strong>{' '}
                          {mentorReportSession.attendance_count > 0
                            ? `${mentorReportSession.attendance_count} attendee${mentorReportSession.attendance_count !== 1 ? 's' : ''} recorded by the lead facilitator. This sheet is attached to your report automatically.`
                            : 'Not yet completed by the lead facilitator.'}
                        </Typography>
                      </Alert>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>

              {/* ── Report fields ── */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="primary" sx={{ mt: 0.5, mb: 0.5 }}>Your Mentoring Activities</Typography>
                <TextField fullWidth size="small" multiline minRows={3}
                  label="What activities did you carry out as a mentor during this session?"
                  value={mentorReportForm.mentoring_activities}
                  onChange={e => setMentorReportForm(f => ({ ...f, mentoring_activities: e.target.value }))} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth size="small" multiline minRows={3}
                  label="Which MSMEs did you specifically support and how?"
                  value={mentorReportForm.msmes_mentored}
                  onChange={e => setMentorReportForm(f => ({ ...f, msmes_mentored: e.target.value }))} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth size="small" multiline minRows={3}
                  label="Key observations on MSME progress and needs"
                  value={mentorReportForm.key_observations}
                  onChange={e => setMentorReportForm(f => ({ ...f, key_observations: e.target.value }))} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" multiline minRows={2}
                  label="Challenges encountered"
                  value={mentorReportForm.challenges}
                  onChange={e => setMentorReportForm(f => ({ ...f, challenges: e.target.value }))} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" multiline minRows={2}
                  label="Recommendations for future sessions"
                  value={mentorReportForm.recommendations}
                  onChange={e => setMentorReportForm(f => ({ ...f, recommendations: e.target.value }))} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth size="small" multiline minRows={2}
                  label="Agreed next steps / follow-up actions"
                  value={mentorReportForm.next_steps}
                  onChange={e => setMentorReportForm(f => ({ ...f, next_steps: e.target.value }))} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 2, py: 1.5 }}>
            <Button onClick={() => setMentorReportDialog(false)}>Cancel</Button>
            <Button variant="outlined" onClick={() => saveMentorReport(false)} disabled={mentorReportSaving}>
              {mentorReportSaving ? <CircularProgress size={16} /> : 'Save Draft'}
            </Button>
            <Button variant="contained" color="success" onClick={() => saveMentorReport(true)} disabled={mentorReportSaving}>
              Submit Report
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ── Training Report Wizard (combined attendance + narrative) ────────── */}
      {reportWizard && (
        <Dialog open onClose={() => setReportWizard(null)} maxWidth="lg" fullWidth
          PaperProps={{ sx: { height: { xs: '95dvh', md: '92vh' }, display: 'flex', flexDirection: 'column' } }}>
          <DialogTitle sx={{ pb: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography fontWeight={700} variant="h6">Training Report</Typography>
            <Typography variant="caption" color="text.secondary">
              {reportWizard.topic_section_number ? `${reportWizard.topic_section_number} – ` : ''}{reportWizard.topic_name}
              {' · '}{reportWizard.topic_module_name}
            </Typography>
            {/* Session date + venue row */}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
              <TextField required size="small" label="Training Date" type="date" InputLabelProps={{ shrink: true }}
                value={reportWizardSessionForm.date}
                onChange={e => setReportWizardSessionForm(f => ({ ...f, date: e.target.value }))}
                sx={{ flex: '1 1 140px' }} />
              <TextField size="small" label="Venue / Location"
                value={reportWizardSessionForm.location}
                onChange={e => setReportWizardSessionForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Gulu District Hall" sx={{ flex: '1 1 220px' }} />
              <TextField size="small" label="District"
                value={trainingReportForm.district || ''}
                onChange={e => setTrainingReportForm(f => ({ ...f, district: e.target.value }))}
                sx={{ flex: '1 1 140px' }} />
              <TextField size="small" label="Facilitation Team"
                value={trainingReportForm.facilitation_team || ''}
                onChange={e => setTrainingReportForm(f => ({ ...f, facilitation_team: e.target.value }))}
                sx={{ flex: '1 1 200px' }} />
            </Box>
            <Tabs value={reportWizardTab} onChange={(_, v) => setReportWizardTab(v)} sx={{ mt: 1 }} variant="scrollable" scrollButtons="auto">
              <Tab label="Attendance Register" icon={<HowToReg fontSize="small" />} iconPosition="start" />
              <Tab label="Training Report" icon={<Description fontSize="small" />} iconPosition="start" />
            </Tabs>
          </DialogTitle>

          <DialogContent dividers sx={{ flex: 1, overflow: 'auto', p: 0 }}>

            {/* ── Tab 0: Attendance Register ─────────────────────────────── */}
            {reportWizardTab === 0 && (
              <Box>
                <Box sx={{ px: 2, py: 1, bgcolor: '#F8FAFC', borderBottom: '1px solid', borderColor: 'divider',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    Add each participant. Rows without a name are ignored on save.
                  </Typography>
                  <Button size="small" startIcon={<Add />} onClick={() => setReportWizardAttendees(prev => [...prev, newRwRow()])}>
                    Add Row
                  </Button>
                </Box>
                <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#F1F5F9' }}>
                      <TableCell sx={{ width: 36, color: 'text.secondary', fontSize: 11 }}>#</TableCell>
                      <TableCell sx={{ minWidth: 160 }}>Name</TableCell>
                      <TableCell sx={{ minWidth: 120 }}>Phone</TableCell>
                      <TableCell sx={{ minWidth: 160 }}>MSME / Business</TableCell>
                      <TableCell sx={{ minWidth: 70 }}>Sex</TableCell>
                      <TableCell sx={{ minWidth: 100 }}>Age Group</TableCell>
                      <TableCell sx={{ minWidth: 90 }}>Status</TableCell>
                      <TableCell sx={{ width: 36 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reportWizardAttendees.map((row, idx) => (
                      <TableRow key={row._key} hover>
                        <TableCell sx={{ color: 'text.secondary', fontSize: 11 }}>{idx + 1}</TableCell>
                        <TableCell>
                          <TextField size="small" variant="standard" placeholder="Full name"
                            value={row.attendee_name}
                            onChange={e => setReportWizardAttendees(p => p.map(r => r._key === row._key ? { ...r, attendee_name: e.target.value } : r))}
                            sx={{ minWidth: 140 }} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" variant="standard" placeholder="Phone"
                            value={row.attendee_phone}
                            onChange={e => setReportWizardAttendees(p => p.map(r => r._key === row._key ? { ...r, attendee_phone: e.target.value } : r))}
                            sx={{ minWidth: 100 }} />
                        </TableCell>
                        <TableCell>
                          <Select size="small" variant="standard" displayEmpty value={row.msme || ''}
                            onChange={e => {
                              const list = trainingMsmes.length ? trainingMsmes : msmes;
                              const m = list.find(x => x.id === e.target.value);
                              setReportWizardAttendees(p => p.map(r => r._key === row._key
                                ? { ...r, msme: e.target.value, attendee_name: r.attendee_name || (m?.owner_name || '') }
                                : r));
                            }}
                            sx={{ minWidth: 140 }}>
                            <MenuItem value=""><em>— walk-in —</em></MenuItem>
                            {(trainingMsmes.length ? trainingMsmes : msmes).map(m => (
                              <MenuItem key={m.id} value={m.id}>{m.business_name}</MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select size="small" variant="standard" displayEmpty value={row.gender || ''}
                            onChange={e => setReportWizardAttendees(p => p.map(r => r._key === row._key ? { ...r, gender: e.target.value } : r))}
                            sx={{ minWidth: 60 }}>
                            <MenuItem value=""><em>—</em></MenuItem>
                            <MenuItem value="M">M</MenuItem>
                            <MenuItem value="F">F</MenuItem>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select size="small" variant="standard" displayEmpty value={row.age_group || ''}
                            onChange={e => setReportWizardAttendees(p => p.map(r => r._key === row._key ? { ...r, age_group: e.target.value } : r))}
                            sx={{ minWidth: 90 }}>
                            <MenuItem value=""><em>—</em></MenuItem>
                            <MenuItem value="18-34">18–34</MenuItem>
                            <MenuItem value="35-45">35–45</MenuItem>
                            <MenuItem value="46-55">46–55</MenuItem>
                            <MenuItem value="56+">56+</MenuItem>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select size="small" variant="standard" displayEmpty value={row.refugee_status || 'H'}
                            onChange={e => setReportWizardAttendees(p => p.map(r => r._key === row._key ? { ...r, refugee_status: e.target.value } : r))}
                            sx={{ minWidth: 80 }}>
                            <MenuItem value="H">Host</MenuItem>
                            <MenuItem value="R">Refugee</MenuItem>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => setReportWizardAttendees(p => p.filter(r => r._key !== row._key))}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </Box>
              </Box>
            )}

            {/* ── Tab 1: Training Report Narrative ───────────────────────── */}
            {reportWizardTab === 1 && (
              <Box sx={{ p: 2.5 }}>
                <TextField fullWidth size="small" label="Training Title" sx={{ mb: 2 }}
                  value={trainingReportForm.training_title || ''}
                  onChange={e => setTrainingReportForm(f => ({ ...f, training_title: e.target.value }))} />

                {/* Participant demographics — auto-computed from attendance register */}
                <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 0.5 }}>Participant Demographics</Typography>
                <Alert severity="info" icon={false} sx={{ mb: 1.5, py: 0.5 }}>
                  <Typography variant="caption">Auto-calculated from the Attendance Register tab. Fill in names + gender + age there to populate these totals.</Typography>
                </Alert>
                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  {[
                    ['participants_male_youth',   'Male Youth (15–35)',   rwDemographics.participants_male_youth],
                    ['participants_female_youth', 'Female Youth (15–35)', rwDemographics.participants_female_youth],
                    ['participants_adult_male',   'Adult Male (36+)',     rwDemographics.participants_adult_male],
                    ['participants_adult_female', 'Adult Female (36+)',   rwDemographics.participants_adult_female],
                  ].map(([key, label, val]) => (
                    <Grid item xs={6} sm={3} key={key}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderColor: val > 0 ? 'primary.main' : 'divider' }}>
                        <Typography variant="h5" fontWeight={700} color={val > 0 ? 'primary.main' : 'text.disabled'}>{val}</Typography>
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                      </Paper>
                    </Grid>
                  ))}
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">
                      Total: <strong>{rwDemographics.participants_male_youth + rwDemographics.participants_female_youth + rwDemographics.participants_adult_male + rwDemographics.participants_adult_female}</strong> participants
                    </Typography>
                  </Grid>
                </Grid>

                {/* Narrative sections */}
                {[
                  ['training_purpose',     'Background & Purpose',          'Why was this training conducted?'],
                  ['session_objectives',   'Session Objectives',             'What were the learning outcomes?'],
                  ['activities_delivered', 'Activities Delivered',           'Describe the activities, exercises and tasks.'],
                  ['key_lessons',          'Key Lessons Learnt',             'What did participants learn?'],
                  ['growth_support_areas', 'Growth Support Areas Observed',  'What support areas were identified?'],
                  ['key_findings',         'Key Findings & Critical Issues', 'Findings and any critical issues raised.'],
                  ['bge_contributions',    'BGE Contributions & Needs',      'BGE contributions and development needs observed.'],
                  ['bds_actions',          'Proposed BDS Actions (3 months)','What BDS actions do you propose?'],
                  ['recommendations',      'Recommendations',                'Recommendations for future sessions.'],
                  ['next_steps',           'Agreed Next Steps',              'What actions were agreed with participants?'],
                  ['conclusion',           'Conclusion',                     'Overall summary of the session.'],
                ].map(([key, label, hint]) => (
                  <TextField key={key} fullWidth multiline minRows={2} size="small"
                    label={label} placeholder={hint} sx={{ mb: 2 }}
                    value={trainingReportForm[key] || ''}
                    onChange={e => setTrainingReportForm(f => ({ ...f, [key]: e.target.value }))} />
                ))}
              </Box>
            )}
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              {reportWizardAttendees.filter(r => r.attendee_name.trim()).length} attendee{reportWizardAttendees.filter(r => r.attendee_name.trim()).length !== 1 ? 's' : ''} entered
            </Typography>
            <Button onClick={() => setReportWizard(null)} disabled={reportWizardSaving}>Cancel</Button>
            <Button variant="outlined" onClick={() => saveReportWizard(false)} disabled={reportWizardSaving || !reportWizardSessionForm.date}>
              {reportWizardSaving ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button variant="contained" color="success" onClick={() => saveReportWizard(true)} disabled={reportWizardSaving || !reportWizardSessionForm.date}>
              {reportWizardSaving ? 'Submitting…' : 'Submit Report'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ── Unified session detail dialog (MSMEs · Attendance · Report) ───── */}
      <Dialog open={sessionDetailOpen} onClose={() => setSessionDetailOpen(false)} maxWidth="lg" fullWidth
        PaperProps={{ sx: { height: { xs: '95dvh', md: '90vh' }, maxHeight: '100dvh', display: 'flex', flexDirection: 'column' } }}>
        <DialogTitle sx={{ pb: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography fontWeight={700} variant="h6" noWrap>{sessionDetailSession?.title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {sessionDetailSession?.date}
            {sessionDetailSession?.location ? ` · ${sessionDetailSession.location}` : ''}
          </Typography>
          <Tabs value={sessionDetailTab} onChange={(_, v) => {
            setSessionDetailTab(v);
            if (v === 1 && sessionDetailSession) openSessionAtt(sessionDetailSession);
          }} sx={{ mt: 1 }} variant="scrollable" scrollButtons="auto">
            <Tab label={`MSMEs (${sessionDetailSession?.businesses_detail?.length ?? 0})`}
              icon={<People fontSize="small" />} iconPosition="start" />
            <Tab label={`Attendance (${sessionDetailSession?.attendance_count ?? 0})`}
              icon={<HowToReg fontSize="small" />} iconPosition="start" />
            <Tab label={sessionDetailSession?.has_training_report ? 'Edit Report' : 'Report'}
              icon={<Description fontSize="small" />} iconPosition="start" />
          </Tabs>
        </DialogTitle>

        <DialogContent dividers sx={{ flex: 1, overflow: 'auto', p: 0 }}>

          {/* ── Tab 0: Registered MSMEs ── */}
          {sessionDetailTab === 0 && (
            <Box sx={{ p: 0 }}>
              {(!sessionDetailSession?.businesses_detail?.length) ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <People sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary" variant="body2">
                    No MSMEs are registered for this session yet.
                  </Typography>
                  <Typography color="text.secondary" variant="caption">
                    MSMEs are added to sessions by the programme administrator.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, width: 36 }}>#</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Business Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Owner</TableCell>
                        <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>Phone</TableCell>
                        <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>Sector</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(sessionDetailSession?.businesses_detail || []).map((m, i) => (
                        <TableRow key={m.id} hover>
                          <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{i + 1}</TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>{m.business_name}</TableCell>
                          <TableCell>{m.owner_name}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{m.phone || '—'}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{m.sector || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Box>
          )}

          {/* ── Tab 1: Attendance ── */}
          {sessionDetailTab === 1 && (
            <Box>
              {sessionAttLoading ? (
                <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
              ) : (
                <>
                  <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ minWidth: 30 }}>#</TableCell>
                        <TableCell sx={{ minWidth: 150 }}>Name</TableCell>
                        <TableCell sx={{ minWidth: 110 }}>Phone</TableCell>
                        <TableCell sx={{ minWidth: 170 }}>MSME / Business</TableCell>
                        <TableCell sx={{ minWidth: 55 }}>Sex</TableCell>
                        <TableCell sx={{ minWidth: 85 }}>Age Group</TableCell>
                        <TableCell sx={{ minWidth: 80 }}>Status</TableCell>
                        <TableCell sx={{ minWidth: 50 }} align="center">Consent</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sessionAttendees.map((att, idx) => (
                        <TableRow key={att._key} hover>
                          <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{idx + 1}</TableCell>
                          <TableCell>
                            <TextField size="small" variant="standard"
                              value={att.attendee_name}
                              onChange={e => setSessionAttendees(rows => rows.map(r => r._key === att._key ? { ...r, attendee_name: e.target.value } : r))}
                              placeholder="Full name" sx={{ minWidth: 130 }} />
                          </TableCell>
                          <TableCell>
                            <TextField size="small" variant="standard"
                              value={att.attendee_phone}
                              onChange={e => setSessionAttendees(rows => rows.map(r => r._key === att._key ? { ...r, attendee_phone: e.target.value } : r))}
                              placeholder="Phone" sx={{ minWidth: 100 }} />
                          </TableCell>
                          <TableCell>
                            <Select size="small" variant="standard" value={att.msme || ''}
                              onChange={e => setSessionAttendees(rows => rows.map(r => r._key === att._key ? { ...r, msme: e.target.value } : r))}
                              displayEmpty sx={{ minWidth: 150 }}>
                              <MenuItem value=""><em>— None —</em></MenuItem>
                              {msmes.map(m => <MenuItem key={m.id} value={m.id}>{m.business_name}</MenuItem>)}
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select size="small" variant="standard" value={att.gender || ''}
                              onChange={e => setSessionAttendees(rows => rows.map(r => r._key === att._key ? { ...r, gender: e.target.value } : r))}
                              displayEmpty sx={{ minWidth: 50 }}>
                              <MenuItem value=""><em>—</em></MenuItem>
                              <MenuItem value="M">M</MenuItem>
                              <MenuItem value="F">F</MenuItem>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select size="small" variant="standard" value={att.age_group || ''}
                              onChange={e => setSessionAttendees(rows => rows.map(r => r._key === att._key ? { ...r, age_group: e.target.value } : r))}
                              displayEmpty sx={{ minWidth: 80 }}>
                              <MenuItem value=""><em>—</em></MenuItem>
                              <MenuItem value="18-34">18–34</MenuItem>
                              <MenuItem value="35-45">35–45</MenuItem>
                              <MenuItem value="46-55">46–55</MenuItem>
                              <MenuItem value="56+">56+</MenuItem>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select size="small" variant="standard" value={att.refugee_status || 'H'}
                              onChange={e => setSessionAttendees(rows => rows.map(r => r._key === att._key ? { ...r, refugee_status: e.target.value } : r))}
                              sx={{ minWidth: 70 }}>
                              <MenuItem value="H">Host</MenuItem>
                              <MenuItem value="R">Refugee</MenuItem>
                              <MenuItem value="I">IDP</MenuItem>
                            </Select>
                          </TableCell>
                          <TableCell align="center">
                            <Checkbox size="small" checked={!!att.consent_photo}
                              onChange={e => setSessionAttendees(rows => rows.map(r => r._key === att._key ? { ...r, consent_photo: e.target.checked } : r))} />
                          </TableCell>
                          <TableCell>
                            <IconButton size="small" color="error"
                              onClick={() => setSessionAttendees(rows => rows.filter(r => r._key !== att._key))}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </Box>{/* /overflowX auto */}
                  <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1 }}>
                    <Button size="small" startIcon={<Add />}
                      onClick={() => setSessionAttendees(rows => [...rows, newSessRow()])}>
                      Add row
                    </Button>
                    <Button size="small" variant="contained"
                      disabled={sessionAttLoading}
                      onClick={async () => {
                        await saveSessionAtt();
                        fetchSessions();
                        setSessionDetailSession(prev => prev ? {
                          ...prev, attendance_count: sessionAttendees.filter(r => r.attendee_name?.trim()).length
                        } : prev);
                      }}>
                      {sessionAttLoading ? 'Saving…' : 'Save attendance'}
                    </Button>
                  </Box>
                </>
              )}
            </Box>
          )}

          {/* ── Tab 2: Training Report gateway ── */}
          {sessionDetailTab === 2 && (
            <Box sx={{ p: 3 }}>
              {sessionDetailSession?.has_training_report ? (
                /* Report already exists — show summary + edit button */
                <Box>
                  <Alert severity="success" sx={{ mb: 2.5 }}>
                    Training report filed for this session.
                    {trainingReportData?.status === 'submitted' && ' Status: Submitted.'}
                  </Alert>
                  <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
                    {[
                      { label: 'Training Title', val: trainingReportData?.training_title },
                      { label: 'Date(s)', val: trainingReportData?.training_dates },
                      { label: 'Venue', val: trainingReportData?.venue },
                      { label: 'District', val: trainingReportData?.district },
                      { label: 'Time Allocation', val: trainingReportData?.time_allocation },
                      { label: 'Total Participants', val: (trainingReportData?.total_participants ?? (
                        (trainingReportData?.participants_male_youth || 0) +
                        (trainingReportData?.participants_female_youth || 0) +
                        (trainingReportData?.participants_adult_male || 0) +
                        (trainingReportData?.participants_adult_female || 0))) || null },
                    ].filter(f => f.val).map(({ label, val }) => (
                      <Grid item xs={6} sm={4} key={label}>
                        <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                        <Typography variant="body2" fontWeight={500}>{val}</Typography>
                      </Grid>
                    ))}
                  </Grid>
                  <Button variant="outlined" startIcon={<Edit />}
                    onClick={() => { setTrainingReportSession(sessionDetailSession); setTrainingReportDialog(true); }}>
                    Edit Report
                  </Button>
                </Box>
              ) : (
                /* No report yet — invite BGE to write one */
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Description sx={{ fontSize: 52, color: 'text.disabled', mb: 1.5 }} />
                  <Typography variant="h6" fontWeight={600} gutterBottom>No report filed yet</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 420, mx: 'auto' }}>
                    Write a training report covering session objectives, participant demographics,
                    key findings, lessons learnt, and recommended next steps.
                  </Typography>
                  <Button variant="contained" size="large" startIcon={<Add />}
                    onClick={() => { setTrainingReportSession(sessionDetailSession); setTrainingReportDialog(true); }}>
                    Write Training Report
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={() => setSessionDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Training report dialog (detailed report) ─────────────────────── */}
      <Dialog open={trainingReportDialog} onClose={() => setTrainingReportDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>
          {trainingReportData ? 'Edit Training Report' : 'Write Training Report'}
          {trainingReportSession && (
            <Typography variant="caption" display="block" color="text.secondary">
              {trainingReportSession.title} · {trainingReportSession.date}
              {trainingReportData?.status === 'submitted' && (
                <Chip label="Submitted" size="small" color="success" sx={{ ml: 1, fontSize: 10 }} />
              )}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}>
          {/* ── Section 1: Header metadata ── */}
          <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 1.5 }}>
            1. Training Details
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Training Title"
                value={trainingReportForm.training_title || ''}
                onChange={e => setTrainingReportForm(f => ({ ...f, training_title: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Date(s)"
                placeholder="e.g. 17–19 Feb 2026"
                value={trainingReportForm.training_dates || ''}
                onChange={e => setTrainingReportForm(f => ({ ...f, training_dates: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField fullWidth size="small" label="Venue / Location"
                value={trainingReportForm.venue || ''}
                onChange={e => setTrainingReportForm(f => ({ ...f, venue: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth size="small" label="District"
                value={trainingReportForm.district || ''}
                onChange={e => setTrainingReportForm(f => ({ ...f, district: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Total Time Allocation"
                placeholder="e.g. 2 hours / 3 days"
                value={trainingReportForm.time_allocation || ''}
                onChange={e => setTrainingReportForm(f => ({ ...f, time_allocation: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField fullWidth size="small" label="Facilitation Team"
                placeholder="Names of co-facilitators, guest trainers"
                value={trainingReportForm.facilitation_team || ''}
                onChange={e => setTrainingReportForm(f => ({ ...f, facilitation_team: e.target.value }))} />
            </Grid>
          </Grid>

          {/* ── Section 2: Participant demographics ── */}
          <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 1.5 }}>
            2. Participant Demographics
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {[
              { key: 'participants_male_youth',   label: 'Male Youth (15–35)' },
              { key: 'participants_female_youth', label: 'Female Youth (15–35)' },
              { key: 'participants_adult_male',   label: 'Adult Male (36+)' },
              { key: 'participants_adult_female', label: 'Adult Female (36+)' },
            ].map(({ key, label }) => (
              <Grid item xs={6} sm={3} key={key}>
                <TextField fullWidth size="small" label={label} type="number"
                  inputProps={{ min: 0 }}
                  value={trainingReportForm[key] ?? 0}
                  onChange={e => setTrainingReportForm(f => ({ ...f, [key]: parseInt(e.target.value) || 0 }))} />
              </Grid>
            ))}
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">
                Total: <strong>{
                  (trainingReportForm.participants_male_youth || 0) +
                  (trainingReportForm.participants_female_youth || 0) +
                  (trainingReportForm.participants_adult_male || 0) +
                  (trainingReportForm.participants_adult_female || 0)
                } participants</strong>
              </Typography>
            </Grid>
          </Grid>

          {/* ── Section 3: Core content ── */}
          <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 1.5 }}>
            3. Session Content
          </Typography>
          {[
            { key: 'training_purpose',    label: 'Training Purpose / Background',
              hint: 'Why was this training conducted? What problem does it address?' },
            { key: 'session_objectives',  label: 'Session Objectives',
              hint: 'What were the objectives of this session?' },
            { key: 'activities_delivered', label: 'Activities / Tasks Delivered',
              hint: 'What activities, exercises, or sessions were run?' },
          ].map(({ key, label, hint }) => (
            <TextField key={key} fullWidth multiline minRows={2} size="small"
              label={label} placeholder={hint} sx={{ mb: 2 }}
              value={trainingReportForm[key] || ''}
              onChange={e => setTrainingReportForm(f => ({ ...f, [key]: e.target.value }))} />
          ))}

          {/* ── Section 4: Findings & lessons ── */}
          <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 1.5 }}>
            4. Findings &amp; Lessons
          </Typography>
          {[
            { key: 'key_lessons',          label: 'Key Lessons Learnt',
              hint: 'What were the main takeaways for participants?' },
            { key: 'growth_support_areas', label: 'Growth Support Areas Observed',
              hint: 'What BDS / growth support needs emerged from the session?' },
            { key: 'key_findings',         label: 'Key Findings / Critical Issues',
              hint: 'Any critical observations, compliance issues, or concerns raised?' },
            { key: 'bge_contributions',    label: 'BGE Contributions & Capacity Notes',
              hint: 'How did BGEs contribute? Any capacity gaps or strengths noted?' },
          ].map(({ key, label, hint }) => (
            <TextField key={key} fullWidth multiline minRows={2} size="small"
              label={label} placeholder={hint} sx={{ mb: 2 }}
              value={trainingReportForm[key] || ''}
              onChange={e => setTrainingReportForm(f => ({ ...f, [key]: e.target.value }))} />
          ))}

          {/* ── Section 5: Recommendations & next steps ── */}
          <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 1.5 }}>
            5. Recommendations &amp; Next Steps
          </Typography>
          {[
            { key: 'bds_actions',      label: 'Proposed BDS Actions (next 3 months)',
              hint: 'What follow-up business development actions do you recommend?' },
            { key: 'recommendations',  label: 'General Recommendations',
              hint: 'Recommendations for future training deployments or programme adjustments' },
            { key: 'next_steps',       label: 'Agreed Next Steps',
              hint: 'Specific actions agreed with participants or the programme team' },
            { key: 'conclusion',       label: 'Conclusion',
              hint: 'Brief summary conclusion for the report' },
          ].map(({ key, label, hint }) => (
            <TextField key={key} fullWidth multiline minRows={2} size="small"
              label={label} placeholder={hint} sx={{ mb: 2 }}
              value={trainingReportForm[key] || ''}
              onChange={e => setTrainingReportForm(f => ({ ...f, [key]: e.target.value }))} />
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button onClick={() => setTrainingReportDialog(false)} disabled={trainingReportSaving}>
            Cancel
          </Button>
          <Button variant="outlined" onClick={() => saveTrainingReport(false)} disabled={trainingReportSaving}>
            {trainingReportSaving ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button variant="contained" color="success" onClick={() => saveTrainingReport(true)} disabled={trainingReportSaving}>
            {trainingReportSaving ? 'Submitting…' : 'Submit Report'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Training session attendance dialog (BGE side) ────────────────── */}
      <Dialog open={sessionAttDialog} onClose={() => setSessionAttDialog(false)} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          Attendance — {selectedSession?.title}
          <Typography variant="caption" display="block" color="text.secondary">
            {selectedSession?.date}{selectedSession?.location ? ` · ${selectedSession.location}` : ''}
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {sessionAttLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <Box>
              <Table size="small" stickyHeader>
                <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                  <TableRow>
                    <TableCell sx={{ minWidth: 30 }}>#</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>Name</TableCell>
                    <TableCell sx={{ minWidth: 110 }}>Phone</TableCell>
                    <TableCell sx={{ minWidth: 170 }}>MSME / Business</TableCell>
                    <TableCell sx={{ minWidth: 55 }}>Sex</TableCell>
                    <TableCell sx={{ minWidth: 85 }}>Age Group</TableCell>
                    <TableCell sx={{ minWidth: 80 }}>Status</TableCell>
                    <TableCell sx={{ minWidth: 50 }} align="center">Consent</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessionAttendees.map((att, idx) => (
                    <TableRow key={att._key} hover>
                      <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{idx + 1}</TableCell>
                      <TableCell>
                        <TextField size="small" placeholder="Full name" variant="standard"
                          value={att.attendee_name || ''}
                          onChange={e => setSessionAttendees(prev => prev.map(r => r._key === att._key ? { ...r, attendee_name: e.target.value } : r))}
                          sx={{ minWidth: 130 }} />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" placeholder="Phone" variant="standard"
                          value={att.attendee_phone || ''}
                          onChange={e => setSessionAttendees(prev => prev.map(r => r._key === att._key ? { ...r, attendee_phone: e.target.value } : r))}
                          sx={{ minWidth: 100 }} />
                      </TableCell>
                      <TableCell>
                        <Select size="small" variant="standard" displayEmpty
                          value={att.msme || ''}
                          onChange={e => {
                            const list = trainingMsmes.length ? trainingMsmes : msmes;
                            const m = list.find(x => x.id === e.target.value);
                            setSessionAttendees(prev => prev.map(r => {
                              if (r._key !== att._key) return r;
                              return { ...r, msme: e.target.value, attendee_name: r.attendee_name || (m?.owner_name || '') };
                            }));
                          }}
                          sx={{ minWidth: 150 }}>
                          <MenuItem value=""><em>— walk-in —</em></MenuItem>
                          {(trainingMsmes.length ? trainingMsmes : msmes).map(m => (
                            <MenuItem key={m.id} value={m.id}>{m.business_name}</MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select size="small" variant="standard" displayEmpty value={att.gender || ''}
                          onChange={e => setSessionAttendees(prev => prev.map(r => r._key === att._key ? { ...r, gender: e.target.value } : r))}
                          sx={{ minWidth: 50 }}>
                          <MenuItem value=""><em>—</em></MenuItem>
                          <MenuItem value="M">M</MenuItem>
                          <MenuItem value="F">F</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select size="small" variant="standard" displayEmpty value={att.age_group || ''}
                          onChange={e => setSessionAttendees(prev => prev.map(r => r._key === att._key ? { ...r, age_group: e.target.value } : r))}
                          sx={{ minWidth: 75 }}>
                          <MenuItem value=""><em>—</em></MenuItem>
                          {['18-34','35-45','46-55','56+'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select size="small" variant="standard" value={att.refugee_status || 'H'}
                          onChange={e => setSessionAttendees(prev => prev.map(r => r._key === att._key ? { ...r, refugee_status: e.target.value } : r))}
                          sx={{ minWidth: 75 }}>
                          <MenuItem value="H">Host</MenuItem>
                          <MenuItem value="R">Refugee</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Photo consent">
                          <Checkbox size="small" checked={!!att.consent_photo}
                            onChange={e => setSessionAttendees(prev => prev.map(r => r._key === att._key ? { ...r, consent_photo: e.target.checked } : r))} />
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error"
                          onClick={() => setSessionAttendees(prev => prev.filter(r => r._key !== att._key))}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {sessionAttendees.length > 0 && (() => {
                const male   = sessionAttendees.filter(a => a.gender === 'M');
                const female = sessionAttendees.filter(a => a.gender === 'F');
                const youth  = sessionAttendees.filter(a => a.age_group === '18-34');
                const adult  = sessionAttendees.filter(a => ['35-45','46-55','56+'].includes(a.age_group));
                const ref    = sessionAttendees.filter(a => a.refugee_status === 'R');
                return (
                  <Box sx={{ m: 2, p: 2, bgcolor: '#F3F6FB', border: '1px solid #c5d5e8', borderRadius: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>Summary</Typography>
                    <Grid container spacing={1}>
                      {[
                        { label: 'Total', value: sessionAttendees.length, color: '#1565C0' },
                        { label: 'Female', value: female.length, color: '#AD1457' },
                        { label: 'Male', value: male.length, color: '#1565C0' },
                        { label: 'Youth F', value: youth.filter(a => a.gender === 'F').length, color: '#AD1457' },
                        { label: 'Youth M', value: youth.filter(a => a.gender === 'M').length, color: '#1565C0' },
                        { label: 'Adult F', value: adult.filter(a => a.gender === 'F').length, color: '#AD1457' },
                        { label: 'Adult M', value: adult.filter(a => a.gender === 'M').length, color: '#1565C0' },
                        { label: 'Refugees', value: ref.length, color: '#E65100' },
                        { label: 'Host Comm.', value: sessionAttendees.filter(a => a.refugee_status === 'H').length, color: '#2E7D32' },
                      ].map(({ label, value, color }) => (
                        <Grid item xs={6} sm={4} md={3} lg={2} key={label}>
                          <Box sx={{ textAlign: 'center', p: 1, bgcolor: '#fff', borderRadius: 1, border: `1px solid ${color}20` }}>
                            <Typography variant="h6" fontWeight={700} sx={{ color }}>{value}</Typography>
                            <Typography variant="caption" color="text.secondary">{label}</Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                );
              })()}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button size="small" startIcon={<Add />} onClick={() => setSessionAttendees(prev => [...prev, newSessRow()])} sx={{ mr: 'auto' }}>
            Add row
          </Button>
          <Button onClick={() => setSessionAttDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveSessionAtt} disabled={sessionAttLoading}>
            {sessionAttLoading ? <CircularProgress size={18} /> : 'Save Attendance'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── MSME detail dialog ── */}
      <Dialog open={msmeDetailDialog} onClose={() => setMsmeDetailDialog(false)} maxWidth="md" fullWidth>
        {selectedMsme && (() => {
          const m = selectedMsme;
          const hasDiag = !!m.diag_imported_at;
          const Field = ({ label, value, xs = 6 }) => value ? (
            <Grid item xs={xs}>
              <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
              <Typography fontSize={13} fontWeight={500}>{value}</Typography>
            </Grid>
          ) : null;
          const BoolBadge = ({ label, value }) => value == null ? null : (
            <Chip size="small" label={label}
              color={value ? 'success' : 'default'} variant={value ? 'filled' : 'outlined'}
              sx={{ mr: 0.5, mb: 0.5, fontSize: 11 }} />
          );
          return (
            <>
              <DialogTitle sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography fontWeight={700} fontSize={17}>{m.business_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{m.msme_code}</Typography>
                    {(m.programme_groups_detail || []).map(g => (
                      <Chip key={g.id} size="small" label={g.name} sx={{ ml: 0.5, fontSize: 10, bgcolor: g.color, color: '#fff' }} />
                    ))}
                  </Box>
                  <Button variant="contained" size="small" startIcon={<Add />}
                    onClick={() => { setMsmeDetailDialog(false); openNewReport(m.id); }}>
                    New Report
                  </Button>
                </Box>
              </DialogTitle>

              <DialogContent dividers sx={{ p: 0 }}>
                <Tabs value={msmeDetailTab} onChange={(_, v) => setMsmeDetailTab(v)}
                  sx={{ borderBottom: '1px solid #E8EDF2', px: 2, minHeight: 40 }}
                  TabIndicatorProps={{ style: { height: 3 } }}>
                  <Tab label="Profile" sx={{ fontSize: 12, minHeight: 40, py: 0 }} />
                  <Tab label={`Reports (${msmeReports.length})`} sx={{ fontSize: 12, minHeight: 40, py: 0 }} />
                  <Tab label={`Growth History (${msmeDetailSnapshots.length})`} sx={{ fontSize: 12, minHeight: 40, py: 0 }} />
                </Tabs>

                {/* ── Tab 0: Profile ── */}
                {msmeDetailTab === 0 && (
                  <>
                    <Box sx={{ p: 2, bgcolor: '#F8F9FA', borderBottom: '1px solid #E8EDF2' }}>
                      <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>Business Profile</Typography>
                      <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                        <Field label="Owner"         value={m.owner_name} />
                        <Field label="Phone"          value={m.phone} />
                        <Field label="Email"          value={m.email || m.business_email} />
                        <Field label="Sector"         value={m.sector} />
                        <Field label="Business Type"  value={m.business_type} />
                        <Field label="Cohort"         value={m.cohort_name} />
                        <Field label="District"       value={m.state || m.diag_district} />
                        <Field label="City / Town"    value={m.city} />
                        <Field label="Assigned BGE"   value={m.assigned_bge_name} />
                        <Field label="Registration #" value={m.registration_number} />
                      </Grid>
                    </Box>

                    {hasDiag && (
                      <Box sx={{ p: 2 }}>
                        <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>
                          Diagnostic Baseline
                        </Typography>
                        <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                          <Field label="Annual Turnover (band)" value={m.diag_annual_turnover} />
                          <Field label="Total Assets (band)"    value={m.diag_total_assets} />
                          <Field label="Years Operating"        value={m.diag_years_operating} />
                          <Field label="Owner Sex"              value={m.diag_owner_sex} />
                          <Field label="Owner Age"              value={m.diag_owner_age} />
                          <Field label="Owner Education"        value={m.diag_owner_education} />
                        </Grid>
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>Workforce at baseline</Typography>
                          <Grid container spacing={1}>
                            {[
                              { label: 'FT Male',   val: m.diag_employees_ft_male },
                              { label: 'FT Female', val: m.diag_employees_ft_female },
                              { label: 'PT Male',   val: m.diag_employees_pt_male },
                              { label: 'PT Female', val: m.diag_employees_pt_female },
                            ].map(({ label, val }) => val != null ? (
                              <Grid item key={label}>
                                <Box sx={{ textAlign: 'center', px: 1.5, py: 0.75, bgcolor: '#E8EDF2', borderRadius: 1 }}>
                                  <Typography fontWeight={700} fontSize={16}>{val}</Typography>
                                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                                </Box>
                              </Grid>
                            ) : null)}
                          </Grid>
                        </Box>
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Compliance & Access at Baseline</Typography>
                          <BoolBadge label="TIN"           value={m.diag_has_tin} />
                          <BoolBadge label="URSB"          value={m.diag_has_unbs} />
                          <BoolBadge label="Business Bank" value={m.diag_has_business_bank} />
                          <BoolBadge label="Mobile Money"  value={m.diag_has_mobile_money} />
                        </Box>
                        {m.diag_is_green_business && (
                          <Box sx={{ mt: 1.5 }}>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Green Categories</Typography>
                            {(m.diag_green_categories || []).map((cat, i) => (
                              <Chip key={i} size="small" label={cat} color="success" variant="outlined" sx={{ mr: 0.5, mb: 0.5, fontSize: 10 }} />
                            ))}
                          </Box>
                        )}
                      </Box>
                    )}
                  </>
                )}

                {/* ── Tab 1: Reports ── */}
                {msmeDetailTab === 1 && (
                  <Box sx={{ p: 2 }}>
                    {msmeReports.length === 0 ? (
                      <Typography color="text.secondary" fontSize={13}>No visit reports yet.</Typography>
                    ) : (
                      msmeReports.map(r => (
                        <Box key={r.id} sx={{ border: '1px solid #E8EDF2', borderRadius: 2, p: 1.5, mb: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                              <Typography fontSize={13} fontWeight={600}>{VISIT_TYPE_LABELS[r.visit_type] || r.visit_type}</Typography>
                              <Typography fontSize={11} color="text.secondary">{r.visit_date}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <Chip label={r.status} size="small" color={STATUS_COLORS[r.status] || 'default'} />
                              {r.status === 'draft' && (
                                <IconButton size="small" onClick={() => { setMsmeDetailDialog(false); openEditReport(r); }}>
                                  <Edit fontSize="small" />
                                </IconButton>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      ))
                    )}
                  </Box>
                )}

                {/* ── Tab 2: Growth History ── */}
                {msmeDetailTab === 2 && (
                  <Box sx={{ p: 2 }}>
                    {msmeDetailSnapshots.length === 0 ? (
                      <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography color="text.secondary" fontSize={13}>No growth updates recorded yet.</Typography>
                        <Button size="small" variant="outlined" color="success" sx={{ mt: 1 }}
                          onClick={() => { setMsmeDetailDialog(false); openGrowthForm(m); }}>
                          Record First Update
                        </Button>
                      </Box>
                    ) : (
                      [...msmeDetailSnapshots].reverse().map((s, i) => {
                        const prev = [...msmeDetailSnapshots].reverse()[i + 1];
                        const revDelta = prev?.annual_turnover && s.annual_turnover
                          ? ((Number(s.annual_turnover) - Number(prev.annual_turnover)) / Number(prev.annual_turnover) * 100).toFixed(1)
                          : null;
                        return (
                          <Box key={s.id} sx={{ border: '1px solid #E8EDF2', borderRadius: 1.5, p: 2, mb: 1.5 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography fontSize={13} fontWeight={700}>{s.snapshot_date}</Typography>
                                {i === 0 && <Chip size="small" label="Latest" color="success" sx={{ fontSize: 10 }} />}
                              </Box>
                              <Chip size="small" label={s.source?.replace('_', ' ')} variant="outlined" sx={{ fontSize: 10 }} />
                            </Box>

                            {/* Financials */}
                            {(s.annual_turnover || s.last_month_revenue || s.total_assets) && (
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="overline" fontSize={9} color="text.secondary">Financials (UGX)</Typography>
                                <Grid container spacing={1} sx={{ mt: 0 }}>
                                  {s.annual_turnover && (
                                    <Grid item xs={6}>
                                      <Typography fontSize={11} color="text.secondary">Annual Revenue</Typography>
                                      <Typography fontSize={13} fontWeight={600}>
                                        {Number(s.annual_turnover).toLocaleString()}
                                        {revDelta !== null && (
                                          <Box component="span" sx={{ ml: 0.5, fontSize: 11, color: Number(revDelta) >= 0 ? 'success.main' : 'error.main' }}>
                                            {Number(revDelta) >= 0 ? '▲' : '▼'}{Math.abs(revDelta)}%
                                          </Box>
                                        )}
                                      </Typography>
                                    </Grid>
                                  )}
                                  {s.last_month_revenue && (
                                    <Grid item xs={6}>
                                      <Typography fontSize={11} color="text.secondary">Last Month</Typography>
                                      <Typography fontSize={13} fontWeight={600}>{Number(s.last_month_revenue).toLocaleString()}</Typography>
                                    </Grid>
                                  )}
                                  {s.total_assets && (
                                    <Grid item xs={6}>
                                      <Typography fontSize={11} color="text.secondary">Total Assets</Typography>
                                      <Typography fontSize={13} fontWeight={600}>{Number(s.total_assets).toLocaleString()}</Typography>
                                    </Grid>
                                  )}
                                </Grid>
                              </Box>
                            )}

                            {/* Workforce */}
                            {(s.employees_ft_male != null || s.employees_ft_female != null) && (
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="overline" fontSize={9} color="text.secondary">Workforce</Typography>
                                <Typography fontSize={12}>
                                  FT: {(s.employees_ft_male || 0) + (s.employees_ft_female || 0)} ({s.employees_ft_female || 0}F)
                                  {(s.employees_pt_male != null || s.employees_pt_female != null) &&
                                    ` · PT: ${(s.employees_pt_male || 0) + (s.employees_pt_female || 0)}`}
                                  {(s.employees_ft_refugee != null || s.employees_pt_refugee != null) &&
                                    ` · ${(s.employees_ft_refugee || 0) + (s.employees_pt_refugee || 0)} refugees`}
                                </Typography>
                              </Box>
                            )}

                            {/* Compliance */}
                            {(s.has_tin != null || s.has_ursb != null || s.has_business_bank != null || s.has_sacco != null || s.has_mobile_money != null) && (
                              <Box sx={{ mb: s.notes ? 1 : 0 }}>
                                <Typography variant="overline" fontSize={9} color="text.secondary">Compliance & Access</Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                                  {s.has_tin != null && <Chip size="small" label={`TIN${s.tin_number ? `: ${s.tin_number}` : ''}`} color={s.has_tin ? 'success' : 'default'} variant={s.has_tin ? 'filled' : 'outlined'} sx={{ fontSize: 10 }} />}
                                  {s.has_ursb != null && <Chip size="small" label={`URSB${s.ursb_reg_number ? `: ${s.ursb_reg_number}` : ''}`} color={s.has_ursb ? 'success' : 'default'} variant={s.has_ursb ? 'filled' : 'outlined'} sx={{ fontSize: 10 }} />}
                                  {s.has_business_bank != null && <Chip size="small" label={s.bank_name || 'Bank Account'} color={s.has_business_bank ? 'success' : 'default'} variant={s.has_business_bank ? 'filled' : 'outlined'} sx={{ fontSize: 10 }} />}
                                  {s.has_sacco != null && <Chip size="small" label="SACCO" color={s.has_sacco ? 'success' : 'default'} variant={s.has_sacco ? 'filled' : 'outlined'} sx={{ fontSize: 10 }} />}
                                  {s.has_mobile_money != null && <Chip size="small" label="Mobile Money" color={s.has_mobile_money ? 'success' : 'default'} variant={s.has_mobile_money ? 'filled' : 'outlined'} sx={{ fontSize: 10 }} />}
                                  {s.has_momo_pay != null && <Chip size="small" label={`MoMo Pay${s.momo_pay_code ? `: ${s.momo_pay_code}` : ''}`} color={s.has_momo_pay ? 'success' : 'default'} variant={s.has_momo_pay ? 'filled' : 'outlined'} sx={{ fontSize: 10 }} />}
                                </Box>
                              </Box>
                            )}

                            {s.notes && (
                              <Typography fontSize={11} color="text.secondary" sx={{ fontStyle: 'italic', mt: 0.5 }}>{s.notes}</Typography>
                            )}
                          </Box>
                        );
                      })
                    )}
                  </Box>
                )}
              </DialogContent>

              <DialogActions>
                <Button variant="outlined" size="small" color="success"
                  onClick={() => { setMsmeDetailDialog(false); openGrowthForm(m); }}>
                  Record Growth Update
                </Button>
                <Button onClick={() => setMsmeDetailDialog(false)}>Close</Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* ── Growth update form ── */}
      <Dialog open={growthDialog} onClose={() => setGrowthDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography fontWeight={700}>Record Growth Update</Typography>
          {growthMsme && <Typography variant="caption" color="text.secondary">{growthMsme.business_name}</Typography>}
        </DialogTitle>
        <DialogContent dividers>
          {growthError && <Alert severity="error" sx={{ mb: 2 }}>{growthError}</Alert>}

          <Grid container spacing={2}>
            {/* Date + Source */}
            <Grid item xs={6}>
              <TextField fullWidth size="small" label="Date" type="date" InputLabelProps={{ shrink: true }}
                value={growthForm.snapshot_date}
                onChange={e => setGrowthForm(f => ({ ...f, snapshot_date: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select value={growthForm.source} label="Type"
                  onChange={e => setGrowthForm(f => ({ ...f, source: e.target.value }))}>
                  <MenuItem value="bge_visit">BGE Visit</MenuItem>
                  <MenuItem value="quarterly">Quarterly Review</MenuItem>
                  <MenuItem value="annual">Annual Review</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Revenue & Assets */}
            <Grid item xs={12}>
              <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>Financials (UGX)</Typography>
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth size="small" label="Annual Revenue / Turnover"
                type="number" inputProps={{ min: 0 }}
                value={growthForm.annual_turnover}
                onChange={e => setGrowthForm(f => ({ ...f, annual_turnover: e.target.value }))}
                helperText="Total sales last 12 months" />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth size="small" label="Last Month's Revenue"
                type="number" inputProps={{ min: 0 }}
                value={growthForm.last_month_revenue}
                onChange={e => setGrowthForm(f => ({ ...f, last_month_revenue: e.target.value }))}
                helperText="Total sales last calendar month" />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth size="small" label="Total Assets"
                type="number" inputProps={{ min: 0 }}
                value={growthForm.total_assets}
                onChange={e => setGrowthForm(f => ({ ...f, total_assets: e.target.value }))}
                helperText="Business investment in assets" />
            </Grid>

            {/* Employees */}
            <Grid item xs={12}>
              <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>Employees</Typography>
            </Grid>
            {[
              { key: 'employees_ft_male',   label: 'FT Male' },
              { key: 'employees_ft_female', label: 'FT Female' },
              { key: 'employees_pt_male',   label: 'PT Male' },
              { key: 'employees_pt_female', label: 'PT Female' },
            ].map(({ key, label }) => (
              <Grid item xs={3} key={key}>
                <TextField fullWidth size="small" label={label} type="number"
                  inputProps={{ min: 0 }}
                  value={growthForm[key]}
                  onChange={e => setGrowthForm(f => ({ ...f, [key]: e.target.value }))} />
              </Grid>
            ))}

            {/* Refugee employees sub-section */}
            <Grid item xs={12}>
              <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>Refugee Staff</Typography>
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth size="small" label="FT Refugees" type="number"
                inputProps={{ min: 0 }}
                helperText="Full-time refugee staff"
                value={growthForm.employees_ft_refugee}
                onChange={e => setGrowthForm(f => ({ ...f, employees_ft_refugee: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth size="small" label="PT Refugees" type="number"
                inputProps={{ min: 0 }}
                helperText="Part-time refugee staff"
                value={growthForm.employees_pt_refugee}
                onChange={e => setGrowthForm(f => ({ ...f, employees_pt_refugee: e.target.value }))} />
            </Grid>

            {/* Compliance */}
            <Grid item xs={12}>
              <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>Compliance & Financial Access</Typography>
            </Grid>

            {/* TIN */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Has TIN (Tax ID)</InputLabel>
                <Select value={growthForm.has_tin} label="Has TIN (Tax ID)"
                  onChange={e => setGrowthForm(f => ({ ...f, has_tin: e.target.value }))}>
                  <MenuItem value="">— Unknown —</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {growthForm.has_tin === 'true' ? (
              <Grid item xs={6}>
                <TextField fullWidth size="small" label="TIN Number"
                  placeholder="e.g. 1234567890"
                  value={growthForm.tin_number}
                  onChange={e => setGrowthForm(f => ({ ...f, tin_number: e.target.value }))} />
              </Grid>
            ) : <Grid item xs={6} />}

            {/* URSB */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Registered with URSB</InputLabel>
                <Select value={growthForm.has_ursb} label="Registered with URSB"
                  onChange={e => setGrowthForm(f => ({ ...f, has_ursb: e.target.value }))}>
                  <MenuItem value="">— Unknown —</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {growthForm.has_ursb === 'true' ? (
              <Grid item xs={6}>
                <TextField fullWidth size="small" label="URSB Registration Number"
                  placeholder="e.g. 80000012345"
                  value={growthForm.ursb_reg_number}
                  onChange={e => setGrowthForm(f => ({ ...f, ursb_reg_number: e.target.value }))} />
              </Grid>
            ) : <Grid item xs={6} />}

            {/* Business Bank Account */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Business Bank Account</InputLabel>
                <Select value={growthForm.has_business_bank} label="Business Bank Account"
                  onChange={e => setGrowthForm(f => ({ ...f, has_business_bank: e.target.value, bank_name: '' }))}>
                  <MenuItem value="">— Unknown —</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {growthForm.has_business_bank === 'true' ? (
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Which Bank?</InputLabel>
                  <Select value={growthForm.bank_name} label="Which Bank?"
                    onChange={e => setGrowthForm(f => ({ ...f, bank_name: e.target.value }))}>
                    <MenuItem value="">— Select bank —</MenuItem>
                    {[
                      'Absa Bank Uganda',
                      'Bank of Africa Uganda',
                      'Bank of Baroda Uganda',
                      'Cairo International Bank',
                      'Centenary Bank',
                      'Citibank Uganda',
                      'DFCU Bank',
                      'Diamond Trust Bank Uganda',
                      'Ecobank Uganda',
                      'Equity Bank Uganda',
                      'Exim Bank Uganda',
                      'Finance Trust Bank',
                      'Guaranty Trust Bank Uganda',
                      'Housing Finance Bank',
                      'I&M Bank Uganda',
                      'KCB Bank Uganda',
                      'NC Bank Uganda',
                      'Opportunity Bank Uganda',
                      'PostBank Uganda',
                      'Pride Microfinance',
                      'Stanbic Bank Uganda',
                      'Standard Chartered Bank Uganda',
                      'Tropical Bank Uganda',
                      'United Bank for Africa Uganda',
                      'Other',
                    ].map(b => <MenuItem key={b} value={b}>{b}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            ) : <Grid item xs={6} />}

            {/* SACCO */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>SACCO Member</InputLabel>
                <Select value={growthForm.has_sacco} label="SACCO Member"
                  onChange={e => setGrowthForm(f => ({ ...f, has_sacco: e.target.value }))}>
                  <MenuItem value="">— Unknown —</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} />

            {/* Mobile Money */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Mobile Money Account</InputLabel>
                <Select value={growthForm.has_mobile_money} label="Mobile Money Account"
                  onChange={e => setGrowthForm(f => ({ ...f, has_mobile_money: e.target.value }))}>
                  <MenuItem value="">— Unknown —</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>MOMO Pay Code</InputLabel>
                <Select value={growthForm.has_momo_pay} label="MOMO Pay Code"
                  onChange={e => setGrowthForm(f => ({ ...f, has_momo_pay: e.target.value }))}>
                  <MenuItem value="">— Unknown —</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {growthForm.has_momo_pay === 'true' && (
              <Grid item xs={12}>
                <TextField fullWidth size="small" label="MOMO Pay Merchant Code"
                  placeholder="e.g. 123456"
                  helperText="MTN / Airtel MOMO Pay merchant code number"
                  value={growthForm.momo_pay_code}
                  onChange={e => setGrowthForm(f => ({ ...f, momo_pay_code: e.target.value }))} />
              </Grid>
            )}

            {/* ── Digital Tools ── */}
            <Grid item xs={12}>
              <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>
                Digital Tools Adopted
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Which digital tools has this business adopted? (select all that apply)
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {DIGITAL_TOOLS_OPTIONS.map(tool => {
                  const checked = growthForm.digital_tools.includes(tool);
                  return (
                    <Chip
                      key={tool}
                      label={tool}
                      size="small"
                      clickable
                      variant={checked ? 'filled' : 'outlined'}
                      color={checked ? 'primary' : 'default'}
                      onClick={() => setGrowthForm(f => ({
                        ...f,
                        digital_tools: checked
                          ? f.digital_tools.filter(t => t !== tool)
                          : [...f.digital_tools, tool],
                        digital_tools_other: tool === 'Other' && checked ? '' : f.digital_tools_other,
                      }))}
                    />
                  );
                })}
              </Box>
            </Grid>
            {growthForm.digital_tools.includes('Other') && (
              <Grid item xs={12}>
                <TextField fullWidth size="small" label="Other digital tool(s) — please specify"
                  value={growthForm.digital_tools_other}
                  onChange={e => setGrowthForm(f => ({ ...f, digital_tools_other: e.target.value }))}
                  placeholder="e.g. Sage, Odoo, custom app…" />
              </Grid>
            )}

            {/* ── Training Impact ── */}
            <Grid item xs={12}>
              <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>
                Training Impact
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Has training made any changes to this business?</InputLabel>
                <Select
                  value={growthForm.training_made_changes}
                  label="Has training made any changes to this business?"
                  onChange={e => setGrowthForm(f => ({
                    ...f,
                    training_made_changes: e.target.value,
                    training_changes: [],
                    training_changes_other: '',
                  }))}>
                  <MenuItem value="">— Not answered —</MenuItem>
                  <MenuItem value="true">Yes — training has made changes</MenuItem>
                  <MenuItem value="false">No — no changes observed yet</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {growthForm.training_made_changes === 'true' && (
              <>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    What changes has the training led to? (select all that apply)
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {TRAINING_CHANGE_OPTIONS.map(change => {
                      const checked = growthForm.training_changes.includes(change);
                      return (
                        <Chip
                          key={change}
                          label={change}
                          size="small"
                          clickable
                          variant={checked ? 'filled' : 'outlined'}
                          color={checked ? 'success' : 'default'}
                          onClick={() => setGrowthForm(f => ({
                            ...f,
                            training_changes: checked
                              ? f.training_changes.filter(c => c !== change)
                              : [...f.training_changes, change],
                            training_changes_other: change === 'Other' && checked ? '' : f.training_changes_other,
                          }))}
                        />
                      );
                    })}
                  </Box>
                </Grid>
                {growthForm.training_changes.includes('Other') && (
                  <Grid item xs={12}>
                    <TextField fullWidth size="small" label="Other training change(s) — please describe"
                      multiline rows={2}
                      value={growthForm.training_changes_other}
                      onChange={e => setGrowthForm(f => ({ ...f, training_changes_other: e.target.value }))}
                      placeholder="Describe the other change(s) the training has made to this business…" />
                  </Grid>
                )}
              </>
            )}

            {/* Notes */}
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Notes / Observations" multiline rows={3}
                value={growthForm.notes}
                onChange={e => setGrowthForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Key observations, what changed since last visit, challenges, etc." />
            </Grid>
          </Grid>

          {/* ── Narrative section (Annual / Quarterly reviews only) ── */}
          {(growthForm.source === 'annual' || growthForm.source === 'quarterly') && (
            <Box sx={{ mt: 3, p: 2, bgcolor: '#F0F4FA', borderRadius: 2, border: '1px solid #C5D3E8' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Description sx={{ fontSize: 16, color: '#1A2F4B' }} />
                <Typography fontWeight={700} fontSize={13} color="#1A2F4B">
                  Review Narrative
                </Typography>
                <Chip label="Creates linked draft report" size="small" variant="outlined"
                  sx={{ ml: 'auto', fontSize: 10, color: 'text.secondary' }} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Add a written narrative to accompany the data update. A draft visit report will be automatically created and can be completed, edited, and submitted separately.
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" multiline rows={3}
                    label="Business Overview — current state of the business"
                    value={growthForm.narrative_business_overview}
                    onChange={e => setGrowthForm(f => ({ ...f, narrative_business_overview: e.target.value }))} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" multiline rows={2}
                    label="Key Achievement / Progress since last review"
                    value={growthForm.narrative_key_achievement}
                    onChange={e => setGrowthForm(f => ({ ...f, narrative_key_achievement: e.target.value }))} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" multiline rows={2}
                    label="Challenges Identified"
                    value={growthForm.narrative_challenges}
                    onChange={e => setGrowthForm(f => ({ ...f, narrative_challenges: e.target.value }))} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small" multiline rows={2}
                    label="Support Provided"
                    value={growthForm.narrative_support_provided}
                    onChange={e => setGrowthForm(f => ({ ...f, narrative_support_provided: e.target.value }))} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small" multiline rows={2}
                    label="Recommendations"
                    value={growthForm.narrative_recommendations}
                    onChange={e => setGrowthForm(f => ({ ...f, narrative_recommendations: e.target.value }))} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" multiline rows={2}
                    label="Next Steps / Agreed Actions"
                    value={growthForm.narrative_next_steps}
                    onChange={e => setGrowthForm(f => ({ ...f, narrative_next_steps: e.target.value }))} />
                </Grid>
              </Grid>
            </Box>
          )}

          {/* ── History ── */}
          {growthSnapshots.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="overline" color="text.secondary" fontWeight={700} fontSize={10}>
                Previous Snapshots ({growthSnapshots.length})
              </Typography>
              {[...growthSnapshots].reverse().map((s, i) => (
                <Box key={s.id} sx={{ border: '1px solid #E8EDF2', borderRadius: 1.5, p: 1.5, mt: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography fontSize={12} fontWeight={600}>{s.snapshot_date}</Typography>
                    <Chip size="small" label={s.source.replace('_', ' ')} variant="outlined" sx={{ fontSize: 10 }} />
                  </Box>
                  <Grid container spacing={1}>
                    {s.annual_turnover    && <Grid item xs={6}><Typography fontSize={11} color="text.secondary">Annual Revenue</Typography><Typography fontSize={12} fontWeight={600}>UGX {Number(s.annual_turnover).toLocaleString()}</Typography></Grid>}
                    {s.last_month_revenue && <Grid item xs={6}><Typography fontSize={11} color="text.secondary">Last Month</Typography><Typography fontSize={12} fontWeight={600}>UGX {Number(s.last_month_revenue).toLocaleString()}</Typography></Grid>}
                    {s.total_assets       && <Grid item xs={6}><Typography fontSize={11} color="text.secondary">Assets</Typography><Typography fontSize={12} fontWeight={600}>UGX {Number(s.total_assets).toLocaleString()}</Typography></Grid>}
                    {(s.employees_ft_male != null || s.employees_ft_female != null) && (
                      <Grid item xs={12}>
                        <Typography fontSize={11} color="text.secondary">
                          Employees: {(s.employees_ft_male||0)+(s.employees_ft_female||0)} FT
                          {(s.employees_pt_male != null || s.employees_pt_female != null)
                            ? ` · ${(s.employees_pt_male||0)+(s.employees_pt_female||0)} PT` : ''}
                          {' '}({s.employees_ft_female||0} female FT)
                          {(s.employees_ft_refugee != null || s.employees_pt_refugee != null)
                            ? ` · ${(s.employees_ft_refugee||0)+(s.employees_pt_refugee||0)} refugees` : ''}
                        </Typography>
                      </Grid>
                    )}
                    {(s.has_tin != null || s.has_ursb != null || s.has_business_bank != null || s.has_sacco != null || s.has_mobile_money != null || s.has_momo_pay != null) && (
                      <Grid item xs={12}>
                        <Typography fontSize={11} color="text.secondary">
                          {[
                            s.has_tin != null && `TIN: ${s.has_tin ? (s.tin_number || 'Yes') : 'No'}`,
                            s.has_ursb != null && `URSB: ${s.has_ursb ? (s.ursb_reg_number || 'Yes') : 'No'}`,
                            s.has_business_bank != null && `Bank: ${s.has_business_bank ? (s.bank_name || 'Yes') : 'No'}`,
                            s.has_sacco != null && `SACCO: ${s.has_sacco ? 'Yes' : 'No'}`,
                            s.has_mobile_money != null && `MoMo: ${s.has_mobile_money ? 'Yes' : 'No'}`,
                            s.has_momo_pay != null && `MoMo Pay: ${s.has_momo_pay ? (s.momo_pay_code || 'Yes') : 'No'}`,
                          ].filter(Boolean).join(' · ')}
                        </Typography>
                      </Grid>
                    )}
                    {s.notes && <Grid item xs={12}><Typography fontSize={11} color="text.secondary" sx={{ fontStyle: 'italic' }}>{s.notes}</Typography></Grid>}
                  </Grid>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGrowthDialog(false)}>Cancel</Button>
          <Button variant="contained" color="success" disabled={growthSaving} onClick={saveGrowthSnapshot}>
            {growthSaving ? 'Saving…' : 'Save Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── New full-screen visit report form ── */}
      <VisitReportForm
        open={visitReportOpen}
        onClose={() => setVisitReportOpen(false)}
        onSaved={() => { fetchMsmes(); fetchReports(); notify('Report saved.'); }}
        msme={visitReportMsme}
        msmes={msmes}
        token={token}
        bgeProfile={currentUser?.bge_profile}
        editingReport={visitReportEdit}
      />

      {/* ── Group Report (team lead only) ────────────────────────────────── */}
      <Dialog open={groupReportDialog} onClose={() => setGroupReportDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingGroupReport ? 'Edit Group Report' : 'New Group Report'}
          <Typography variant="caption" display="block" color="text.secondary">
            Team-lead-only. Document the session for the whole group.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {groupReportErrors && <Alert severity="error" sx={{ mb: 2 }}>{groupReportErrors}</Alert>}

          {/* Group + objectives reminder banner */}
          {(() => {
            const g = groups.find(x => x.id === groupReportForm.group);
            if (!g) return null;
            return (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="caption" fontWeight={600} display="block">
                  {g.name} · objectives
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {g.objectives || '(no objectives recorded)'}
                </Typography>
              </Alert>
            );
          })()}

          {/* ── Member contributions panel (team lead only, editing existing report) ── */}
          {editingGroupReport && reportContributions.length > 0 && (
            <Box sx={{ mb: 3, p: 2, bgcolor: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Member Contributions ({reportContributions.length})
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Review what your members filed, then integrate into the report fields below.
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  size="small"
                  color="warning"
                  onClick={() => {
                    // Merge all contributions into the group report narrative fields
                    const withAttrib = (arr, key) =>
                      arr.filter(c => (c[key] || '').trim()).map(c => `[${c.bge_name}]\n${c[key]}`).join('\n\n---\n\n');

                    setGroupReportForm(f => {
                      const notes       = withAttrib(reportContributions, 'notes');
                      const challenges  = withAttrib(reportContributions, 'challenges_observed');
                      const interventions = withAttrib(reportContributions, 'interventions_made');
                      const followUp    = withAttrib(reportContributions, 'follow_up_needed');

                      const append = (existing, incoming) =>
                        incoming ? (existing ? `${existing}\n\n--- Member contributions ---\n\n${incoming}` : incoming) : existing;

                      // Collect unique MSME ids observed across all contributions
                      const observedIds = [...new Set(
                        reportContributions.flatMap(c => c.msmes_observed || [])
                      )];
                      const mergedMsmes = [...new Set([...(f.msmes_supported || []), ...observedIds])];

                      return {
                        ...f,
                        session_overview:      append(f.session_overview, notes),
                        challenges_identified: append(f.challenges_identified, challenges),
                        interventions_delivered: append(f.interventions_delivered, interventions),
                        next_steps:            append(f.next_steps, followUp),
                        msmes_supported:       mergedMsmes,
                      };
                    });
                    notify('Contributions integrated — review and edit the fields below before saving.');
                  }}
                >
                  Integrate All
                </Button>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {reportContributions.map(c => (
                  <Box key={c.id} sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 1, border: '1px solid #FFE082' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="caption" fontWeight={700}>{c.bge_name} ({c.bge_code})</Typography>
                      <Button
                        size="small" variant="outlined" color="warning"
                        sx={{ minWidth: 0, px: 1.5, py: 0.25, fontSize: 11 }}
                        onClick={() => {
                          setGroupReportForm(f => {
                            const append = (existing, incoming) =>
                              incoming ? (existing ? `${existing}\n\n[${c.bge_name}] ${incoming}` : `[${c.bge_name}] ${incoming}`) : existing;
                            const observedIds = c.msmes_observed || [];
                            const mergedMsmes = [...new Set([...(f.msmes_supported || []), ...observedIds])];
                            return {
                              ...f,
                              session_overview:      append(f.session_overview, c.notes),
                              challenges_identified: append(f.challenges_identified, c.challenges_observed),
                              interventions_delivered: append(f.interventions_delivered, c.interventions_made),
                              next_steps:            append(f.next_steps, c.follow_up_needed),
                              msmes_supported:       mergedMsmes,
                            };
                          });
                          notify(`${c.bge_name}'s contribution integrated`);
                        }}
                      >
                        Integrate
                      </Button>
                    </Box>
                    {c.notes && <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 0.25 }}><strong>Notes:</strong> {c.notes.length > 120 ? c.notes.slice(0, 120) + '…' : c.notes}</Typography>}
                    {c.challenges_observed && <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 0.25 }}><strong>Challenges:</strong> {c.challenges_observed.length > 100 ? c.challenges_observed.slice(0, 100) + '…' : c.challenges_observed}</Typography>}
                    {c.interventions_made && <Typography variant="caption" display="block" color="text.secondary"><strong>Interventions:</strong> {c.interventions_made.length > 100 ? c.interventions_made.slice(0, 100) + '…' : c.interventions_made}</Typography>}
                    {(c.msmes_observed || []).length > 0 && (
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.25 }}>
                        <strong>MSMEs observed:</strong> {c.msmes_observed.length}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" required>
                <InputLabel>Group</InputLabel>
                <Select
                  value={groupReportForm.group}
                  label="Group"
                  // Switching group also clears the MSME multi-select — otherwise
                  // ids from the previous group's MSMEs would silently slip into
                  // the POST even though the dropdown filtered them out.
                  onChange={e => setGroupReportForm({
                    ...groupReportForm,
                    group: e.target.value,
                    msmes_supported: [],
                  })}
                  disabled={!!editingGroupReport}
                >
                  {groups.filter(g => isTeamLeadOf(g)).map(g => (
                    <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth size="small" type="number" label="Session # (optional)"
                value={groupReportForm.session_number}
                onChange={e => setGroupReportForm({ ...groupReportForm, session_number: e.target.value })}
                inputProps={{ min: 1, max: 10 }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth size="small" type="date" label="Visit Date" required
                InputLabelProps={{ shrink: true }}
                value={groupReportForm.visit_date}
                onChange={e => setGroupReportForm({ ...groupReportForm, visit_date: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>MSMEs supported</InputLabel>
                <Select
                  multiple
                  value={groupReportForm.msmes_supported}
                  label="MSMEs supported"
                  onChange={e => setGroupReportForm({ ...groupReportForm, msmes_supported: e.target.value })}
                  renderValue={(ids) => `${ids.length} selected`}
                >
                  {msmes
                    .filter(m => m.assigned_group === groupReportForm.group)
                    .map(m => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.business_name} {m.session_number ? `· S${m.session_number}` : ''}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* ── Attendance ── */}
          {(() => {
            const g = groups.find(x => x.id === groupReportForm.group);
            const members = g?.members_detail || [];
            if (!members.length) return null;
            const toggleAttendee = (bgeId) => {
              const current = groupReportForm.attendees || [];
              setGroupReportForm({
                ...groupReportForm,
                attendees: current.includes(bgeId)
                  ? current.filter(id => id !== bgeId)
                  : [...current, bgeId],
              });
            };
            const allPresent = members.every(m => (groupReportForm.attendees || []).includes(m.id));
            return (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" fontWeight={700}>
                    Attendance · {(groupReportForm.attendees || []).length}/{members.length} present
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => setGroupReportForm({
                      ...groupReportForm,
                      attendees: allPresent ? [] : members.map(m => m.id),
                    })}
                  >
                    {allPresent ? 'Mark none' : 'Mark all present'}
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {members.map(m => {
                    const present = (groupReportForm.attendees || []).includes(m.id);
                    const isLead  = m.id === g.team_lead;
                    return (
                      <Chip
                        key={m.id}
                        label={m.name}
                        onClick={() => toggleAttendee(m.id)}
                        icon={isLead ? <Star sx={{ fontSize: 14 }} /> : (present ? <CheckCircle sx={{ fontSize: 14 }} /> : undefined)}
                        color={present ? (isLead ? 'warning' : 'success') : 'default'}
                        variant={present ? 'filled' : 'outlined'}
                        size="small"
                      />
                    );
                  })}
                </Box>
              </Box>
            );
          })()}

          {/* ── MSME Attendance ── */}
          {(() => {
            const groupMsmes = msmes.filter(m => m.assigned_group === groupReportForm.group);
            const updateRow = (key, field, val) =>
              setGrpAttendees(prev => prev.map(r => r._key === key ? { ...r, [field]: val } : r));
            const male   = grpAttendees.filter(a => a.gender === 'M');
            const female = grpAttendees.filter(a => a.gender === 'F');
            const youth  = grpAttendees.filter(a => a.age_group === '18-34');
            const adult  = grpAttendees.filter(a => ['35-45','46-55','56+'].includes(a.age_group));
            const ref    = grpAttendees.filter(a => a.refugee_status === 'R');
            return (
              <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Box sx={{ px: 2, py: 1, bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" fontWeight={700}>
                    MSME Attendance ({grpAttendees.filter(a => a.attendee_name || a.msme).length} recorded)
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {groupMsmes.length > 0 && grpAttendees.filter(a => a.attendee_name || a.msme).length === 0 && (
                      <Button size="small" onClick={() => {
                        setGrpAttendees(groupMsmes.map(m => ({
                          ...newGrpRow(),
                          msme: m.id,
                          attendee_name: m.owner_name || '',
                          attendee_phone: m.phone || '',
                        })));
                      }}>
                        Pre-fill from group
                      </Button>
                    )}
                    <Button size="small" startIcon={<Add />} onClick={() => setGrpAttendees(prev => [...prev, newGrpRow()])}>
                      Add row
                    </Button>
                  </Box>
                </Box>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#fafafa' }}>
                      <TableRow>
                        <TableCell sx={{ minWidth: 30, fontWeight: 700, fontSize: 11 }}>#</TableCell>
                        <TableCell sx={{ minWidth: 150, fontWeight: 700, fontSize: 11 }}>Name</TableCell>
                        <TableCell sx={{ minWidth: 110, fontWeight: 700, fontSize: 11 }}>Phone</TableCell>
                        <TableCell sx={{ minWidth: 170, fontWeight: 700, fontSize: 11 }}>MSME / Business</TableCell>
                        <TableCell sx={{ minWidth: 55, fontWeight: 700, fontSize: 11 }}>Sex</TableCell>
                        <TableCell sx={{ minWidth: 85, fontWeight: 700, fontSize: 11 }}>Age Group</TableCell>
                        <TableCell sx={{ minWidth: 80, fontWeight: 700, fontSize: 11 }}>Status</TableCell>
                        <TableCell sx={{ minWidth: 50, fontWeight: 700, fontSize: 11 }} align="center">Photo</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {grpAttendees.map((row, idx) => (
                        <TableRow key={row._key} hover>
                          <TableCell sx={{ color: 'text.secondary', fontSize: 11 }}>{idx + 1}</TableCell>
                          <TableCell>
                            <TextField size="small" placeholder="Full name" variant="standard"
                              value={row.attendee_name}
                              onChange={e => updateRow(row._key, 'attendee_name', e.target.value)}
                              sx={{ minWidth: 130 }} />
                          </TableCell>
                          <TableCell>
                            <TextField size="small" placeholder="Phone" variant="standard"
                              value={row.attendee_phone}
                              onChange={e => updateRow(row._key, 'attendee_phone', e.target.value)}
                              sx={{ minWidth: 100 }} />
                          </TableCell>
                          <TableCell>
                            <Select size="small" variant="standard" displayEmpty
                              value={row.msme || ''}
                              onChange={e => {
                                const m = msmes.find(x => x.id === e.target.value);
                                updateRow(row._key, 'msme', e.target.value);
                                if (m && !row.attendee_name) updateRow(row._key, 'attendee_name', m.owner_name || '');
                              }}
                              sx={{ minWidth: 150 }}>
                              <MenuItem value=""><em>— walk-in —</em></MenuItem>
                              {groupMsmes.map(m => (
                                <MenuItem key={m.id} value={m.id}>{m.business_name}</MenuItem>
                              ))}
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select size="small" variant="standard" displayEmpty value={row.gender}
                              onChange={e => updateRow(row._key, 'gender', e.target.value)} sx={{ minWidth: 50 }}>
                              <MenuItem value=""><em>—</em></MenuItem>
                              <MenuItem value="M">M</MenuItem>
                              <MenuItem value="F">F</MenuItem>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select size="small" variant="standard" displayEmpty value={row.age_group}
                              onChange={e => updateRow(row._key, 'age_group', e.target.value)} sx={{ minWidth: 75 }}>
                              <MenuItem value=""><em>—</em></MenuItem>
                              {['18-34','35-45','46-55','56+'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select size="small" variant="standard" value={row.refugee_status}
                              onChange={e => updateRow(row._key, 'refugee_status', e.target.value)} sx={{ minWidth: 75 }}>
                              <MenuItem value="H">Host</MenuItem>
                              <MenuItem value="R">Refugee</MenuItem>
                            </Select>
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Photo consent">
                              <Checkbox size="small" checked={!!row.consent_photo}
                                onChange={e => updateRow(row._key, 'consent_photo', e.target.checked)} />
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <IconButton size="small" color="error"
                              onClick={() => setGrpAttendees(prev => prev.filter(r => r._key !== row._key))}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                {grpAttendees.filter(a => a.attendee_name || a.msme).length > 0 && (
                  <Box sx={{ px: 2, py: 1.5, bgcolor: '#F3F6FB', borderTop: '1px solid', borderColor: 'divider' }}>
                    <Grid container spacing={1}>
                      {[
                        { label: 'Total', value: grpAttendees.length, color: '#1565C0' },
                        { label: 'Female', value: female.length, color: '#AD1457' },
                        { label: 'Male', value: male.length, color: '#1565C0' },
                        { label: 'Youth F', value: youth.filter(a => a.gender === 'F').length, color: '#AD1457' },
                        { label: 'Youth M', value: youth.filter(a => a.gender === 'M').length, color: '#1565C0' },
                        { label: 'Adult F', value: adult.filter(a => a.gender === 'F').length, color: '#AD1457' },
                        { label: 'Adult M', value: adult.filter(a => a.gender === 'M').length, color: '#1565C0' },
                        { label: 'Refugees', value: ref.length, color: '#E65100' },
                        { label: 'Host Comm.', value: grpAttendees.filter(a => a.refugee_status === 'H').length, color: '#2E7D32' },
                      ].map(({ label, value, color }) => (
                        <Grid item xs={4} sm={3} md={2} key={label}>
                          <Box sx={{ textAlign: 'center', p: 0.75, bgcolor: '#fff', borderRadius: 1, border: `1px solid ${color}20` }}>
                            <Typography variant="subtitle2" fontWeight={700} sx={{ color, fontSize: 14 }}>{value}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{label}</Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}
              </Box>
            );
          })()}

          {/* ── Member contributions ── (only when editing an existing report) */}
          {editingGroupReport && (editingGroupReport.contributions_detail || []).length > 0 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#FFF8E1', borderRadius: 1, border: '1px solid #F9A825' }}>
              <Typography variant="caption" fontWeight={700} display="block" sx={{ mb: 1, color: '#8a6d00' }}>
                Member contributions ({editingGroupReport.contributions_detail.length})
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                Notes submitted by your group members. Use these as source material to consolidate the report below.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {editingGroupReport.contributions_detail.map(c => (
                  <Box key={c.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#fff', p: 1, borderRadius: 1 }}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{c.bge_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.has_notes ? 'Notes provided' : 'No notes'} · {c.msmes_observed.length} MSMEs observed
                      </Typography>
                    </Box>
                    <Button size="small"
                      onClick={() => openContribution(editingGroupReport)}>
                      Open
                    </Button>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {[
            { field: 'session_overview',        label: 'Session overview',        hint: 'How the session ran, attendance, format used.' },
            { field: 'challenges_identified',   label: 'Challenges identified',   hint: 'Cross-cutting challenges observed across the cohort.' },
            { field: 'interventions_delivered', label: 'Interventions delivered', hint: 'Group-level coaching, training, or facilitated activities.' },
            { field: 'outcomes_achieved',       label: 'Outcomes achieved',       hint: 'Quantitative + qualitative outcomes from the session.' },
            { field: 'next_steps',              label: 'Next steps',              hint: 'Follow-up plan agreed with the group.' },
            { field: 'additional_notes',        label: 'Additional notes',        hint: 'Anything else worth recording.' },
          ].map(({ field, label, hint }) => (
            <TextField
              key={field}
              fullWidth multiline rows={3} size="small" label={label}
              placeholder={hint}
              value={groupReportForm[field]}
              onChange={e => setGroupReportForm({ ...groupReportForm, [field]: e.target.value })}
              sx={{ mt: 2 }}
              InputLabelProps={{ shrink: true }}
            />
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button onClick={() => setGroupReportDialog(false)}>Cancel</Button>
          <Button variant="outlined" onClick={() => saveGroupReport('draft')} disabled={groupReportSaving}>
            Save Draft
          </Button>
          <Button
            variant="contained" color="success"
            onClick={() => saveGroupReport('submitted')}
            disabled={groupReportSaving}
            startIcon={groupReportSaving ? <CircularProgress size={16} color="inherit" /> : <CheckCircle />}
          >
            Submit Report
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── In-App Report Viewer ─────────────────────────────────────────── */}
      <Dialog open={!!viewReport} onClose={() => setViewReport(null)} maxWidth="md" fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}>
        {viewReport && (() => {
          const vr = viewReport;
          const visitLabels = { initial: 'Initial Assessment', followup: 'Follow-up Visit', final: 'Final Assessment', training: 'Training Support', mentoring: 'Mentoring Session' };
          const statusColors = { draft: 'default', submitted: 'primary', reviewed: 'success' };
          const SECTIONS = [
            { key: 'business_overview',     label: 'Business Overview' },
            { key: 'challenges_identified', label: 'Challenges Identified' },
            { key: 'support_provided',      label: 'Support Provided' },
            { key: 'recommendations',       label: 'Recommendations' },
            { key: 'action_plan',           label: 'Action Plan' },
            { key: 'next_steps',            label: 'Next Steps' },
            { key: 'additional_notes',      label: 'Additional Notes' },
          ];
          return <>
            {/* Branded letterhead — hidden on screen, only shown when the
                user prints the page so the print fallback looks official.
                Uses raw <div> to avoid MUI's @media-print quirks. */}
            <div className="print-letterhead">
              <img className="gopa" src="/gopa-logo.png" alt="GOPA AFC" />
              <div className="wordmark">
                <div className="title">PRUDEV II</div>
                <div className="subtitle">MSME Portfolio Management</div>
              </div>
              <img className="giz" src="/giz-logo.png" alt="German Cooperation · Implemented by GIZ" />
            </div>
            <Box sx={{ bgcolor: BRAND.sidebarBg, px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Visit Report</Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.3 }}>
                  {visitLabels[vr.visit_type] || vr.visit_type}
                </Typography>
              </Box>
              <Chip label={vr.status} size="small" color={statusColors[vr.status] || 'default'} />
            </Box>
            <DialogContent sx={{ p: 0 }}>
              <Box sx={{ display: 'flex', gap: 3, px: 3, py: 1.5, bgcolor: '#F8FAFC', borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap' }}>
                {[
                  ['Business', vr._msme?.business_name || vr.msme_name],
                  ['MSME Code', vr._msme?.msme_code || vr.msme_code],
                  ['BGE Expert', vr._bgeName],
                  ['Visit Date', vr.visit_date],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Typography>
                    <Typography variant="body2" fontWeight={600}>{val}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ px: 3, py: 2 }}>
                {SECTIONS.map(({ key, label }, idx) => (
                  <Box key={key} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: BRAND.sidebarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Typography sx={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{idx + 1}</Typography>
                      </Box>
                      <Typography variant="subtitle2" fontWeight={700} color="primary">{label}</Typography>
                    </Box>
                    <Box sx={{ bgcolor: '#F4F6F9', borderRadius: 1.5, px: 2, py: 1.5, borderLeft: `3px solid ${vr[key] ? '#009B62' : '#E5E7EB'}` }}>
                      {vr[key] ? (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{vr[key]}</Typography>
                      ) : (
                        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>No information recorded.</Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid #E5E7EB', gap: 1 }}>
              <Button onClick={() => openMsmeReportPdf(viewReport.id, 'view')}>
                Open PDF
              </Button>
              <Button startIcon={<PictureAsPdf />} onClick={() => openMsmeReportPdf(viewReport.id, 'download')}>
                Download PDF
              </Button>
              <Button onClick={() => setViewReport(null)}>Close</Button>
            </DialogActions>
          </>;
        })()}
      </Dialog>

      {/* ── Member contribution dialog ── */}
      <Dialog open={contributionDialog} onClose={() => setContributionDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>My Contribution</DialogTitle>
        <DialogContent dividers>
          {contributionErrors && <Alert severity="error" sx={{ mb: 2 }}>{contributionErrors}</Alert>}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Share your field notes with the team lead to help consolidate the group report.
          </Typography>
          <TextField fullWidth multiline minRows={3} label="Notes / Observations" sx={{ mb: 2 }}
            value={contributionForm.notes}
            onChange={e => setContributionForm(f => ({ ...f, notes: e.target.value }))} />
          <TextField fullWidth multiline minRows={2} label="Challenges observed" sx={{ mb: 2 }}
            value={contributionForm.challenges_observed}
            onChange={e => setContributionForm(f => ({ ...f, challenges_observed: e.target.value }))} />
          <TextField fullWidth multiline minRows={2} label="Interventions made" sx={{ mb: 2 }}
            value={contributionForm.interventions_made}
            onChange={e => setContributionForm(f => ({ ...f, interventions_made: e.target.value }))} />
          <TextField fullWidth multiline minRows={2} label="Follow-up needed"
            value={contributionForm.follow_up_needed}
            onChange={e => setContributionForm(f => ({ ...f, follow_up_needed: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContributionDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveContribution} disabled={contributionSaving}>
            {contributionSaving ? <CircularProgress size={18} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Work Order print/preview ── */}
      {workOrderPreview && (
        <Dialog open={Boolean(workOrderPreview)} onClose={() => setWorkOrderPreview(null)} maxWidth="md" fullWidth>
          <DialogTitle>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography fontWeight={700}>{workOrderPreview.work_order_number}</Typography>
              <Button startIcon={<Print />} variant="outlined" onClick={() => window.print()}>Print / Save PDF</Button>
            </Box>
          </DialogTitle>
          <DialogContent dividers>
            <Box sx={{ fontFamily: 'Arial, sans-serif', fontSize: 13, lineHeight: 1.6 }} className="printable-wo">
              <Typography variant="h6" fontWeight={900} align="center" gutterBottom>
                WORK ORDER – Business Growth Expert (BGE)
              </Typography>
              <Typography align="center" variant="subtitle2" color="text.secondary" gutterBottom>
                PRUDEV II Project – {workOrderPreview.work_order_type_display}
              </Typography>
              <Typography variant="body2" align="center" sx={{ mb: 2 }}>
                Pursuant to the Service Contract between GOPA AFC GmbH and{' '}
                <strong>{workOrderPreview.bge_name}</strong>, this Work Order is issued under the PRUDEV II Project framework.
              </Typography>
              <Divider sx={{ mb: 2 }} />

              {/* Header table */}
              <Grid container spacing={1} sx={{ mb: 2 }}>
                {[
                  ['Work Order Number', workOrderPreview.work_order_number],
                  ['Project Name', workOrderPreview.project_name],
                  ['Issue Date', workOrderPreview.issue_date],
                  ['Start Date', workOrderPreview.start_date || '—'],
                  ['Completion Date', workOrderPreview.end_date || '—'],
                  ['Location', workOrderPreview.location],
                  ['Duration', workOrderPreview.duration],
                ].map(([label, val]) => (
                  <React.Fragment key={label}>
                    <Grid item xs={4}>
                      <Typography variant="caption" fontWeight={700}>{label}</Typography>
                    </Grid>
                    <Grid item xs={8}>
                      <Typography variant="caption">{val}</Typography>
                    </Grid>
                  </React.Fragment>
                ))}
              </Grid>
              <Divider sx={{ mb: 2 }} />

              {/* Sections */}
              <Typography fontWeight={700} sx={{ mb: 0.5 }}>1. SCOPE OF SERVICES – Schedule 1</Typography>
              <Typography variant="caption" fontWeight={700}>Objective:</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{workOrderPreview.objective}</Typography>

              <Typography fontWeight={700} sx={{ mb: 0.5 }}>2. KEY TASKS</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{workOrderPreview.key_tasks}</Typography>

              {workOrderPreview.deliverables_json?.length > 0 && (
                <>
                  <Typography fontWeight={700} sx={{ mb: 1 }}>3. DELIVERABLES</Typography>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', mb: 2, fontSize: 12 }}>
                    <Box component="thead">
                      <Box component="tr" sx={{ bgcolor: '#f0f4f8' }}>
                        {['#', 'Deliverable', 'Due Date'].map(h => (
                          <Box component="th" key={h} sx={{ border: '1px solid #ccc', p: 0.75, textAlign: 'left', fontWeight: 700 }}>{h}</Box>
                        ))}
                      </Box>
                    </Box>
                    <Box component="tbody">
                      {workOrderPreview.deliverables_json.map(d => (
                        <Box component="tr" key={d.task_num}>
                          <Box component="td" sx={{ border: '1px solid #ccc', p: 0.75, width: 30 }}>{d.task_num}</Box>
                          <Box component="td" sx={{ border: '1px solid #ccc', p: 0.75 }}>{d.description}</Box>
                          <Box component="td" sx={{ border: '1px solid #ccc', p: 0.75, whiteSpace: 'nowrap' }}>{d.due_date}</Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </>
              )}

              <Typography fontWeight={700} sx={{ mb: 0.5 }}>4. PAYMENT TERMS – Schedule 2</Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Rate: <strong>UGX {Number(workOrderPreview.rate_per_day).toLocaleString()} per day</strong> (maximum of {workOrderPreview.max_days} days)
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Transport: Transport costs will be refunded based on public transport rates upon attendance and submission of valid receipts.
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Payment Terms: Paid upon submission and approval of all deliverables listed above, a duly filled and signed timesheet, and an approved invoice.
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                BGE must use their official BGE code (<strong>{workOrderPreview.bge_code_display || myBgeCode}</strong>) in all documentation.
              </Typography>

              <Typography fontWeight={700} sx={{ mb: 0.5 }}>5. CONDITIONS</Typography>
              {STANDARD_CONDITIONS.map((c, i) => (
                <Typography key={i} variant="body2" sx={{ mb: 0.25 }}>• {c}</Typography>
              ))}

              <Divider sx={{ my: 2 }} />
              <Typography fontWeight={700} sx={{ mb: 1 }}>SIGNATURES</Typography>
              <Grid container spacing={4}>
                <Grid item xs={6}>
                  <Typography variant="caption" fontWeight={700} display="block">On behalf of GOPA AFC GmbH</Typography>
                  <Typography variant="caption" display="block">Name: {workOrderPreview.team_leader_name}</Typography>
                  <Typography variant="caption" display="block">Position: {workOrderPreview.team_leader_position}</Typography>
                  <Typography variant="caption" display="block" sx={{ mt: 3 }}>Signature: ____________________________</Typography>
                  <Typography variant="caption" display="block">Date: ____________________</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" fontWeight={700} display="block">Business Growth Expert (BGE)</Typography>
                  <Typography variant="caption" display="block">Name: {workOrderPreview.bge_name}</Typography>
                  <Typography variant="caption" display="block">BGE Code: {workOrderPreview.bge_code_display || myBgeCode}</Typography>
                  <Typography variant="caption" display="block" sx={{ mt: 3 }}>Signature: ____________________________</Typography>
                  <Typography variant="caption" display="block">
                    Date: {workOrderPreview.bge_signed_date || '____________________'}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setWorkOrderPreview(null)}>Close</Button>
            <Button variant="contained" startIcon={<Print />} onClick={() => window.print()}>Print / Save as PDF</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ── Work Order PDF Review dialog ─────────────────────────────────── */}
      {woReview && (
        <Dialog open onClose={closeReview} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '90vh' } }}>
          <DialogTitle sx={{ pb: 0 }}>
            {woReview.work_order_number}
            <Typography variant="caption" display="block" color="text.secondary">
              {woReview.work_order_type_display} · Issued {woReview.issue_date}
              {woReview.status === 'signed' && ' · Signed ✓'}
            </Typography>
          </DialogTitle>
          <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
            {!woPdfBlob ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                <CircularProgress />
              </Box>
            ) : (
              <iframe
                src={woPdfBlob}
                title="Work Order PDF"
                style={{ flex: 1, border: 'none', width: '100%', height: '100%' }}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeReview}>Close</Button>
            <Button variant="contained" startIcon={<Download />} onClick={() => downloadWoPdf(woReview)}>
              Download PDF
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <Snackbar
        open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack({ ...snack, open: false })}>{snack.msg}</Alert>
      </Snackbar>

      {/* ── Help dialog ──────────────────────────────────────────────────── */}
      {helpDialog && (
        <Dialog open onClose={() => setHelpDialog(false)} maxWidth="sm" fullWidth
          PaperProps={{ sx: { height: { xs: '90dvh', md: '80vh' }, display: 'flex', flexDirection: 'column' } }}>
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 0 }}>
            How to use the BGE Portal
            <IconButton onClick={() => setHelpDialog(false)}><Close /></IconButton>
          </DialogTitle>
          <Box sx={{ px: 3, pb: 0 }}>
            <Tabs value={helpSection} onChange={(_, v) => setHelpSection(v)} variant="scrollable" scrollButtons="auto">
              <Tab label="My MSMEs" />
              <Tab label="My Groups" />
              <Tab label="Work Orders" />
              <Tab label="Training" />
              <Tab label="My Reports" />
            </Tabs>
          </Box>
          <DialogContent sx={{ pt: 2 }}>
            {[
              {
                title: 'My MSMEs',
                steps: [
                  { n: 1, text: 'Your directly assigned MSMEs appear as cards. Each card shows the business name, sector, last support date, and total reports filed.' },
                  { n: 2, text: 'Click any MSME card to open its full profile — including contact details, assignment objectives, group membership, and growth history.' },
                  { n: 3, text: 'Click "New Report" (top-right) to write a visit report. Fill in visit type, date, findings, and recommendations, then save as draft or submit.' },
                  { n: 4, text: 'Submitted reports are reviewed by the programme administrator. Approved reports are final.' },
                ],
              },
              {
                title: 'My Groups',
                steps: [
                  { n: 1, text: 'Groups are clusters of MSMEs supported together in collective sessions.' },
                  { n: 2, text: 'Expand a group card to see all member MSMEs and recent group support reports.' },
                  { n: 3, text: 'Click "New Group Report" to record a group session — add the date, objectives, attending MSMEs, and findings.' },
                  { n: 4, text: 'As team lead you can see contributions from other BGEs in your group.' },
                ],
              },
              {
                title: 'Work Orders',
                steps: [
                  { n: 1, text: 'Work Orders are contracts issued by the programme administrator that define your assignment, rate, and duration.' },
                  { n: 2, text: 'Upload your signature once using the "My Signature" panel — it will be embedded in every signed document.' },
                  { n: 3, text: 'When a work order is issued, use the eye icon to review the full PDF before signing.' },
                  { n: 4, text: 'Click the green "Sign" button to digitally accept the work order. The date is recorded automatically and the signed PDF is stored.' },
                  { n: 5, text: 'You can download or print any work order using the icons on the right of each card.' },
                ],
              },
              {
                title: 'Training',
                steps: [
                  { n: 1, text: 'Your training facilitation assignments are shown as cards — each linked to a specific module and topic.' },
                  { n: 2, text: 'Click "Write Report" on any card to open the Training Report Wizard.' },
                  { n: 3, text: 'In the Attendance Register tab, add each participant\'s name, phone, gender, and age group. Use the MSME picker to link to known businesses, or leave blank for walk-ins.' },
                  { n: 4, text: 'Switch to the Training Report tab to complete the narrative — the participant demographics are automatically totalled from your attendance register.' },
                  { n: 5, text: 'Use "Save Draft" to continue later, or "Submit Report" when the report is complete.' },
                  { n: 6, text: 'If sessions are already scheduled by the administrator, click any session row to view MSMEs, record attendance, or edit the report.' },
                ],
              },
              {
                title: 'My Reports',
                steps: [
                  { n: 1, text: 'All your individual and group support reports are listed here with their status (Draft / Submitted / Approved).' },
                  { n: 2, text: 'Use the date and type filters at the top to narrow down the list.' },
                  { n: 3, text: 'Click any report to view its full content and the programme manager\'s feedback.' },
                  { n: 4, text: 'Draft reports can be edited and resubmitted. Approved reports are locked.' },
                ],
              },
            ][helpSection].steps.map(step => (
              <Box key={step.n} sx={{ display: 'flex', gap: 2, mb: 2.5, alignItems: 'flex-start' }}>
                <Box sx={{
                  minWidth: 28, height: 28, borderRadius: '50%', bgcolor: '#1565C0', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}>
                  {step.n}
                </Box>
                <Typography variant="body2" sx={{ pt: 0.4 }}>{step.text}</Typography>
              </Box>
            ))}
          </DialogContent>
          <DialogActions sx={{ px: 3 }}>
            <Button disabled={helpSection === 0} onClick={() => setHelpSection(s => s - 1)}>← Previous</Button>
            <Box sx={{ flex: 1 }} />
            <Button disabled={helpSection === 4} variant="contained" onClick={() => setHelpSection(s => s + 1)}>Next →</Button>
          </DialogActions>
        </Dialog>
      )}

    </Box>
  );
}
