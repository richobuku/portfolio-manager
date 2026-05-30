const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

export const API_ENDPOINTS = {
  LOGIN:              `${API_BASE_URL}/api/auth/login/`,
  LOGOUT:             `${API_BASE_URL}/api/auth/logout/`,
  GOOGLE_LOGIN:       `${API_BASE_URL}/api/auth/google/`,
  PASSWORD_RESET:         `${API_BASE_URL}/api/auth/password-reset/`,
  PASSWORD_RESET_CONFIRM: `${API_BASE_URL}/api/auth/password-reset/confirm/`,
  MSMES:              `${API_BASE_URL}/api/msmes/`,
  EXPERTS:            `${API_BASE_URL}/api/experts/`,
  COHORTS:            `${API_BASE_URL}/api/cohorts/`,
  BGE_GROUPS:         `${API_BASE_URL}/api/bge-groups/`,
  REPORTS:            `${API_BASE_URL}/api/reports/`,
  GROUP_REPORTS:      `${API_BASE_URL}/api/group-reports/`,
  GROUP_REPORT_CONTRIBUTIONS: `${API_BASE_URL}/api/group-report-contributions/`,
  GROUP_REPORT_ATTENDANCE:    `${API_BASE_URL}/api/group-report-attendance/`,
  WORK_ORDERS:        `${API_BASE_URL}/api/work-orders/`,
  BGE_USERS:          `${API_BASE_URL}/api/bge-users/`,
  SUPPORT_REQUESTS:   `${API_BASE_URL}/api/support-requests/`,
  TRAINING_SESSIONS:  `${API_BASE_URL}/api/training-sessions/`,
  ATTENDANCE:              `${API_BASE_URL}/api/attendance/`,
  ATTENDANCE_SUMMARY:      `${API_BASE_URL}/api/attendance/summary/`,
  TRAINING_TOPICS:    `${API_BASE_URL}/api/training-topics/`,
  MSME_ANALYTICS:     `${API_BASE_URL}/api/msmes/analytics/`,
  EXPERT_LEADERBOARD: `${API_BASE_URL}/api/experts/leaderboard/`,
  UPLOAD_MSMES:       `${API_BASE_URL}/api/msmes/upload/`,
  UPLOAD_MSMES_TEMPLATE: `${API_BASE_URL}/api/msmes/upload-template/`,
  UPLOAD_EXPERTS:     `${API_BASE_URL}/api/experts/upload/`,
  PROGRAMME_GROUPS:   `${API_BASE_URL}/api/programme-groups/`,
  GROWTH_SNAPSHOTS:   `${API_BASE_URL}/api/growth-snapshots/`,
  VISIT_TEMPLATES:            `${API_BASE_URL}/api/visit-templates/`,
  FACILITATION_ASSIGNMENTS:  `${API_BASE_URL}/api/facilitation-assignments/`,
  TRAINING_REPORTS:          `${API_BASE_URL}/api/training-reports/`,
  ANNUAL_REVIEWS:            `${API_BASE_URL}/api/annual-reviews/`,
  BULK_EMAIL:                `${API_BASE_URL}/api/bulk-email/`,
  MENTOR_REPORTS:            `${API_BASE_URL}/api/mentor-reports/`,
  TSHIRT_RECEIPTS:           `${API_BASE_URL}/api/tshirt-receipts/`,
  TSHIRT_ENTRIES:            `${API_BASE_URL}/api/tshirt-entries/`,
};

export const EXPERT_SEND_EMAIL_URL  = (id) => `${API_BASE_URL}/api/experts/${id}/send-email/`;
export const EXPERT_PREVIEW_EMAIL_URL = (id) => `${API_BASE_URL}/api/experts/${id}/preview-email/`;
export const EXPERT_UPLOAD_SIGNATURE_URL  = (id) => `${API_BASE_URL}/api/experts/${id}/upload-signature/`;
export const EXPERT_ROTATE_SIGNATURE_URL  = (id) => `${API_BASE_URL}/api/experts/${id}/rotate-signature/`;
export const EXPERT_CLEAN_SIGNATURE_URL   = (id) => `${API_BASE_URL}/api/experts/${id}/clean-signature/`;
export const WORK_ORDER_ISSUE_URL = (id) => `${API_BASE_URL}/api/work-orders/${id}/issue/`;
export const WORK_ORDER_SIGN_URL  = (id) => `${API_BASE_URL}/api/work-orders/${id}/sign/`;
export const WORK_ORDER_WITHDRAW_URL = (id) => `${API_BASE_URL}/api/work-orders/${id}/withdraw/`;
export const WORK_ORDER_PDF_URL        = (id) => `${API_BASE_URL}/api/work-orders/${id}/pdf/`;
export const TRAINING_REPORT_PDF_URL   = (id) => `${API_BASE_URL}/api/training-reports/${id}/pdf/`;
export const MENTOR_REPORT_PDF_URL     = (id) => `${API_BASE_URL}/api/mentor-reports/${id}/pdf/`;
export const TSHIRT_RECEIPT_PDF_URL    = (id) => `${API_BASE_URL}/api/tshirt-receipts/${id}/pdf/`;
export const TSHIRT_RECEIPT_BULK_SIGN  = (id) => `${API_BASE_URL}/api/tshirt-receipts/${id}/bulk-sign/`;
export const TSHIRT_ENTRY_SIGN_URL     = (id) => `${API_BASE_URL}/api/tshirt-entries/${id}/sign/`;
// legacy alias kept for any existing references
export const MSME_SET_GROUPS_URL = (id) => `${API_BASE_URL}/api/msmes/${id}/set-groups/`;
export const REPORT_REVERT_URL       = (id) => `${API_BASE_URL}/api/reports/${id}/revert/`;
export const GROUP_REPORT_REVERT_URL = (id) => `${API_BASE_URL}/api/group-reports/${id}/revert/`;
export const EXPERT_EMAIL_URL = EXPERT_SEND_EMAIL_URL;
export const BULK_EMAIL = API_ENDPOINTS.BULK_EMAIL;
export const BULK_EMAIL_LOG = `${API_BASE_URL}/api/bulk-email/log/`;
export const BULK_SMS = `${API_BASE_URL}/api/bulk-sms/`;
export const BULK_SMS_LOG = `${API_BASE_URL}/api/bulk-sms/log/`;
export const MENTOR_REPORTS = API_ENDPOINTS.MENTOR_REPORTS;

export default API_BASE_URL;
