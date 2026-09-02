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
  PARTICIPANT_TRAINING_REPORTS: `${API_BASE_URL}/api/participant-training-reports/`,
  TSHIRT_RECEIPTS:           `${API_BASE_URL}/api/tshirt-receipts/`,
  TSHIRT_ENTRIES:            `${API_BASE_URL}/api/tshirt-entries/`,
  WORK_ORDER_SUBMISSIONS:    `${API_BASE_URL}/api/work-order-submissions/`,
  WORK_ORDER_PAYMENTS:       `${API_BASE_URL}/api/work-order-payments/`,
  WORK_ORDER_ATTACHMENTS:    `${API_BASE_URL}/api/work-order-attachments/`,
  PLANNED_VISITS:            `${API_BASE_URL}/api/planned-visits/`,
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
export const WORK_ORDER_SUBMISSION_TIMESHEET_URL = (id) => `${API_BASE_URL}/api/work-order-submissions/${id}/download-timesheet/`;
export const WORK_ORDER_SUBMISSION_INVOICE_URL   = (id) => `${API_BASE_URL}/api/work-order-submissions/${id}/download-invoice/`;
export const WORK_ORDER_PAYMENT_NOTIFY_URL  = (id) => `${API_BASE_URL}/api/work-order-payments/${id}/notify/`;
export const WORK_ORDER_PAYMENT_CONFIRM_URL = (id) => `${API_BASE_URL}/api/work-order-payments/${id}/confirm/`;
// legacy alias kept for any existing references
export const MSME_SET_GROUPS_URL = (id) => `${API_BASE_URL}/api/msmes/${id}/set-groups/`;
export const REPORT_REVERT_URL              = (id) => `${API_BASE_URL}/api/reports/${id}/revert/`;
export const WORK_ORDER_ATTACHMENT_DOWNLOAD_URL = (id) => `${API_BASE_URL}/api/work-order-attachments/${id}/download/`;
export const REPORTS_BGE_SUMMARY_URL = (params) => `${API_BASE_URL}/api/reports/bge-summary/?${params}`;
export const REPORTS_QUARTERLY_PDF_URL = (params) => `${API_BASE_URL}/api/reports/quarterly-pdf/?${params}`;
export const REPORTS_ACTIVITY_PDF_URL   = (params) => `${API_BASE_URL}/api/reports/activity-pdf/?${params}`;
export const REPORTS_ACTIVITY_EXCEL_URL = (params) => `${API_BASE_URL}/api/reports/activity-excel/?${params}`;
export const GROUP_REPORT_REVERT_URL        = (id) => `${API_BASE_URL}/api/group-reports/${id}/revert/`;
export const TRAINING_REPORT_REVERT_URL     = (id) => `${API_BASE_URL}/api/training-reports/${id}/revert/`;
export const MENTOR_REPORT_REVERT_URL       = (id) => `${API_BASE_URL}/api/mentor-reports/${id}/revert/`;
export const PARTICIPANT_TRAINING_REPORT_PDF_URL    = (id) => `${API_BASE_URL}/api/participant-training-reports/${id}/pdf/`;
export const PARTICIPANT_TRAINING_REPORT_REVERT_URL = (id) => `${API_BASE_URL}/api/participant-training-reports/${id}/revert/`;
export const PARTICIPANT_TRAINING_REPORTS = `${API_BASE_URL}/api/participant-training-reports/`;
export const EXPERT_EMAIL_URL = EXPERT_SEND_EMAIL_URL;
export const CHANGE_PASSWORD_URL = `${API_BASE_URL}/api/auth/change-password/`;
export const BULK_EMAIL = API_ENDPOINTS.BULK_EMAIL;
export const BULK_EMAIL_LOG = `${API_BASE_URL}/api/bulk-email/log/`;
export const BULK_SMS = `${API_BASE_URL}/api/bulk-sms/`;
export const BULK_SMS_LOG = `${API_BASE_URL}/api/bulk-sms/log/`;
export const BULK_SMS_BALANCE = `${API_BASE_URL}/api/bulk-sms/balance/`;
export const SCHEDULED_MESSAGES = `${API_BASE_URL}/api/scheduled-messages/`;
export const SCHEDULED_MESSAGES_PROCESS = `${API_BASE_URL}/api/scheduled-messages/process/`;
export const SCHEDULED_MESSAGE_CANCEL = (id) => `${API_BASE_URL}/api/scheduled-messages/${id}/cancel/`;
export const MENTOR_REPORTS = API_ENDPOINTS.MENTOR_REPORTS;
export const SMART_ASSIGN_URL        = `${API_BASE_URL}/api/msmes/smart-assign/`;
export const SMART_ASSIGN_EXPORT_URL = `${API_BASE_URL}/api/msmes/smart-assign/export/`;

// Payment Tracking & Confirmation Endpoints
export const WORK_ORDER_SUBMIT_PAYMENT_URL = (id) => `${API_BASE_URL}/api/work-orders/${id}/submit-for-payment/`;
export const WORK_ORDER_CONFIRM_PAYMENT_URL = (id) => `${API_BASE_URL}/api/work-orders/${id}/confirm-payment/`;
export const WORK_ORDERS_CONFIRMED_PAYMENTS_URL = `${API_BASE_URL}/api/work-orders/confirmed-payments/`;
export const REPORTS_SUBMIT_PAYMENT_URL = `${API_BASE_URL}/api/reports/submit-for-payment/`;
export const REPORT_CONFIRM_PAYMENT_URL = (id) => `${API_BASE_URL}/api/reports/${id}/confirm-payment/`;
export const GROUP_REPORTS_SUBMIT_PAYMENT_URL = `${API_BASE_URL}/api/group-reports/submit-for-payment/`;
export const GROUP_REPORT_CONFIRM_PAYMENT_URL = (id) => `${API_BASE_URL}/api/group-reports/${id}/confirm-payment/`;

// Planned Visits & Calendar Planner Endpoints
export const PLANNED_VISIT_MARK_MISSED_URL    = (id) => `${API_BASE_URL}/api/planned-visits/${id}/mark-missed/`;
export const PLANNED_VISIT_MARK_COMPLETED_URL = (id) => `${API_BASE_URL}/api/planned-visits/${id}/mark-completed/`;
export const PLANNED_VISIT_RESCHEDULE_URL     = (id) => `${API_BASE_URL}/api/planned-visits/${id}/reschedule/`;
export const PLANNED_VISIT_ICS_URL            = (id) => `${API_BASE_URL}/api/planned-visits/${id}/ics/`;
export const PLANNED_VISITS_EXPORT_ICS_URL    = (params = '') => `${API_BASE_URL}/api/planned-visits/export-ics/${params ? `?${params}` : ''}`;
export const PLANNED_VISITS_SUMMARY_URL       = (params = '') => `${API_BASE_URL}/api/planned-visits/summary/${params ? `?${params}` : ''}`;

// Google Calendar OAuth & Sync Endpoints
export const GOOGLE_CALENDAR_CONNECT_URL    = `${API_BASE_URL}/api/auth/google-calendar/connect/`;
export const GOOGLE_CALENDAR_STATUS_URL     = `${API_BASE_URL}/api/auth/google-calendar/status/`;
export const GOOGLE_CALENDAR_DISCONNECT_URL = `${API_BASE_URL}/api/auth/google-calendar/disconnect/`;
export const GOOGLE_CALENDAR_SYNC_NOW_URL   = `${API_BASE_URL}/api/auth/google-calendar/sync-now/`;

export default API_BASE_URL;

