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
  BGE_USERS:          `${API_BASE_URL}/api/bge-users/`,
  SUPPORT_REQUESTS:   `${API_BASE_URL}/api/support-requests/`,
  TRAINING_SESSIONS:  `${API_BASE_URL}/api/training-sessions/`,
  ATTENDANCE:         `${API_BASE_URL}/api/attendance/`,
  TRAINING_TOPICS:    `${API_BASE_URL}/api/training-topics/`,
  MSME_ANALYTICS:     `${API_BASE_URL}/api/msmes/analytics/`,
  EXPERT_LEADERBOARD: `${API_BASE_URL}/api/experts/leaderboard/`,
  UPLOAD_MSMES:       `${API_BASE_URL}/api/msmes/upload/`,
  UPLOAD_EXPERTS:     `${API_BASE_URL}/api/experts/upload/`,
};

export const EXPERT_SEND_EMAIL_URL  = (id) => `${API_BASE_URL}/api/experts/${id}/send-email/`;
export const EXPERT_PREVIEW_EMAIL_URL = (id) => `${API_BASE_URL}/api/experts/${id}/preview-email/`;
// legacy alias kept for any existing references
export const EXPERT_EMAIL_URL = EXPERT_SEND_EMAIL_URL;

export default API_BASE_URL;
