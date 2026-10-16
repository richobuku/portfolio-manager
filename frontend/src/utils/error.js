/**
 * Specific, actionable error handling and diagnostic reporting for PRUDEV II MSME Portfolio System.
 * Extracts detailed status codes, specific root-cause analysis, and step-by-step remediation
 * to help users and developers easily diagnose and fix what is broken.
 */

export function parseDetailedError(err, context = {}) {
  const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
  const isExplicitlyOffline = isBrowser && typeof navigator.onLine === 'boolean' && navigator.onLine === false;
  const isOnline = !isExplicitlyOffline;
  const connectionType = (isBrowser && navigator.connection?.effectiveType) || 'unknown';
  const timestamp = new Date().toISOString();
  const localTime = new Date().toLocaleString();

  const status = err?.response?.status || null;
  const statusText = err?.response?.statusText || '';
  const errorCode = err?.code || (err?.response ? `HTTP_${status}` : 'ERR_NETWORK');
  const targetUrl = context.endpoint || err?.config?.url || 'API Endpoint';
  const method = (context.method || err?.config?.method || 'GET').toUpperCase();
  const rawData = err?.response?.data;

  // Extract message from response if available
  let serverMessage = '';
  if (typeof rawData === 'string') {
    const trimmed = rawData.trim();
    if (trimmed && trimmed.length < 500 && !trimmed.startsWith('<!doctype') && !trimmed.startsWith('<html')) {
      serverMessage = trimmed;
    }
  } else if (rawData && typeof rawData === 'object') {
    serverMessage = rawData.detail || rawData.error || rawData.message || (Array.isArray(rawData.non_field_errors) && rawData.non_field_errors[0]) || '';
  }

  let title = 'Connection Error';
  let message = 'An unexpected error occurred.';
  let severity = 'error';
  let category = 'NETWORK_ERROR';
  let remediation = '';
  let adminNote = '';

  // 1. Device is physically offline (only if no response received)
  if (!status && isExplicitlyOffline) {
    category = 'OFFLINE';
    severity = 'warning';
    title = 'Device is Offline';
    message = 'Your device is not connected to the internet. Cellular data or Wi-Fi is disconnected.';
    remediation = 'Check your Wi-Fi or mobile data connection and try again.';
    adminNote = 'Client network state reported navigator.onLine = false.';
  }
  // 2. HTTP 405 Method Not Allowed (Very common when static server intercepts /api/*)
  else if (status === 405) {
    category = 'METHOD_NOT_ALLOWED';
    title = '[HTTP 405] Method Not Allowed';
    message = `The server rejected ${method} requests to ${targetUrl}. The endpoint is currently serving static web content instead of routing to the backend API.`;
    remediation = 'If you are an administrator, verify that the frontend web server (Nginx/Vercel) has proxy rewrites configured to route `/api/*` to the Django backend rather than index.html.';
    adminNote = 'Nginx / Vercel rewrite issue: POST request hit a static file handler instead of being proxied to Gunicorn/Django.';
  }
  // 3. HTTP 502 Bad Gateway
  else if (status === 502) {
    category = 'BAD_GATEWAY';
    title = '[HTTP 502] Bad Gateway — Backend Down';
    message = 'The reverse proxy (Nginx/Cloudflare) reached the host, but the backend application service (Django/Gunicorn) is not responding or crashed.';
    remediation = 'The application server is restarting or halted. Please wait 60 seconds. If the issue persists, the system administrator needs to check backend service status.';
    adminNote = 'On server, run: `sudo systemctl status portfolio-backend` or check Docker container logs: `docker logs portfolio_backend`.';
  }
  // 4. HTTP 503 Service Unavailable / Server Waking Up (e.g. Render spin-up)
  else if (status === 503) {
    category = 'SERVICE_UNAVAILABLE';
    severity = 'warning';
    title = '[HTTP 503] Service Temporarily Unavailable';
    message = 'The server is temporarily overloaded, performing database maintenance, or waking up from sleep.';
    remediation = 'If hosted on a sleeping tier (Render/Railway), cold start may take 30–50 seconds. Wait a moment and tap Retry.';
    adminNote = 'Check memory/CPU limits or worker queue on the hosting dashboard.';
  }
  // 5. HTTP 504 Gateway Timeout
  else if (status === 504 || errorCode === 'ECONNABORTED' || (err?.message && err.message.toLowerCase().includes('timeout'))) {
    category = 'TIMEOUT';
    severity = 'warning';
    title = '[HTTP 504] Request Timed Out';
    message = 'The request took too long to receive a response from the server (>60s).';
    remediation = 'The server or database is taking unusually long to respond. Tap Retry, or check your internet connection speed.';
    adminNote = 'Check PostgreSQL database locks, heavy query performance, or Gunicorn worker timeout in backend settings.';
  }
  // 6. HTTP 500 Internal Server Error
  else if (status === 500) {
    category = 'SERVER_ERROR';
    title = '[HTTP 500] Internal Server Error';
    message = serverMessage || 'The backend application encountered an unhandled error while processing your request.';
    remediation = 'A bug or database error occurred on the server. Please report this to the technical team with the diagnostic report below.';
    adminNote = 'Inspect Django server traceback: `tail -n 100 /var/log/django.log` or Render application log.';
  }
  // 7. HTTP 401 Unauthorized / Bad Credentials
  else if (status === 401) {
    category = 'AUTH_FAILED';
    title = '[HTTP 401] Authentication Failed';
    message = serverMessage || 'Invalid username, email, or password. Please verify your credentials and try again.';
    remediation = 'Double check your username/email for typos. You can log in using your Email, Username, or BGE Code. Use "Forgot password?" if needed.';
    adminNote = 'Authentication failed against User model or active BGE account table.';
  }
  // 8. HTTP 403 Forbidden
  else if (status === 403) {
    category = 'FORBIDDEN';
    title = '[HTTP 403] Access Forbidden';
    message = serverMessage || 'Your account does not have permission to access this resource or is currently deactivated.';
    remediation = 'Contact your Programme Manager or BDS Administrator to confirm your account status.';
    adminNote = 'User exists but lacks active permissions or is_active is False.';
  }
  // 9. HTTP 404 Not Found
  else if (status === 404) {
    category = 'NOT_FOUND';
    title = '[HTTP 404] Endpoint Not Found';
    message = `The API route ${targetUrl} was not found on the server.`;
    remediation = 'The requested feature URL may have changed or the API base URL is misconfigured.';
    adminNote = 'Check `urls.py` in Django backend or verify `API_BASE_URL` in `src/config.js`.';
  }
  // 10. HTTP 400 Bad Request
  else if (status === 400) {
    category = 'BAD_REQUEST';
    title = '[HTTP 400] Bad Request';
    message = serverMessage || 'The server could not understand the request format.';
    remediation = 'Verify that all required form fields are correctly formatted.';
    adminNote = `Validation error: ${JSON.stringify(rawData || {})}`;
  }
  // 11. No response received (Network error, carrier connection drop, or server restarting)
  else if (!err?.response) {
    category = 'NO_RESPONSE';
    title = 'Connection Failed / Network Error';
    message = `Unable to establish a connection with the server at ${targetUrl}.`;
    remediation = 'Possible reasons:\n1. Temporary cellular network (4G) fluctuation or DNS delay.\n2. Backend deployment or worker restart in progress.\n3. Request timed out before a response was received.\n\n👉 What to do: Tap "Test Connection" to verify server availability, then tap "Retry" or click "Sign In" again.';
    adminNote = 'No HTTP response received by Axios. Inspect browser DevTools Console for CORS error, ERR_CONNECTION_REFUSED, or mobile socket reset.';
  } else {
    title = `[HTTP ${status}] Request Failed`;
    message = serverMessage || `Server responded with error status ${status} (${statusText || 'Error'}).`;
    remediation = 'Please wait a moment and try again. If it continues to fail, copy the diagnostic report below.';
    adminNote = `Unhandled status code ${status}: ${JSON.stringify(rawData || {})}`;
  }

  // Generate plain-text diagnostic report suitable for 1-click clipboard copy
  const copyableReport = [
    `=== PRUDEV II PORTAL DIAGNOSTIC REPORT ===`,
    `Generated: ${timestamp} (${localTime})`,
    `Category: ${category}`,
    `Status: ${status ? `HTTP ${status} (${statusText})` : 'No HTTP Response (Network/CORS Error)'}`,
    `Error Code: ${errorCode}`,
    `Target URL: ${targetUrl}`,
    `HTTP Method: ${method}`,
    `Client State: ${isOnline ? 'Online' : 'Offline'} (Network: ${connectionType})`,
    `User-Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
    `Current Page: ${typeof window !== 'undefined' ? window.location.href : 'unknown'}`,
    context.username ? `Attempted User: ${context.username}` : null,
    serverMessage ? `Server Message: ${serverMessage}` : null,
    adminNote ? `Technical Note: ${adminNote}` : null,
    rawData ? `Raw Response Data: ${typeof rawData === 'string' ? rawData.slice(0, 400) : JSON.stringify(rawData).slice(0, 400)}` : null,
    `==========================================`
  ].filter(Boolean).join('\n');

  return {
    title,
    message,
    severity,
    category,
    status,
    statusText,
    errorCode,
    remediation,
    adminNote,
    serverMessage,
    targetUrl,
    method,
    isOnline,
    connectionType,
    timestamp,
    copyableReport,
  };
}

/**
 * Safely extracts a human-readable error message from an error object (e.g. Axios error).
 * Automatically enriches status codes (e.g. "[HTTP 502 Bad Gateway] ...") so issues can be fixed easily.
 */
export function getErrorMessage(err, fallback = 'An unexpected error occurred.') {
  if (!err) return fallback;

  if (typeof err === 'string') {
    const trimmed = err.trim();
    if (trimmed && trimmed !== '{}' && trimmed !== '[]' && trimmed !== '[object Object]') {
      return trimmed;
    }
    return fallback;
  }

  const detailed = parseDetailedError(err);

  // If we have a specific high-value status code like 502, 503, 504, 405, 500, return the enriched message
  if (detailed.status && detailed.status >= 400) {
    return `${detailed.title}: ${detailed.message}`;
  }

  // If no response received (CORS / network)
  if (!err.response) {
    return `${detailed.title}: ${detailed.message}`;
  }

  // Fallback to detailed.message or fallback
  return detailed.message || fallback;
}

export default getErrorMessage;
