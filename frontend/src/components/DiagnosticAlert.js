import React, { useState } from 'react';
import {
  Box, Alert, AlertTitle, Typography, Button, Collapse,
  Paper, CircularProgress, Chip,
} from '@mui/material';
import {
  ContentCopy, Check, ExpandMore, ExpandLess,
  NetworkCheck, Refresh, BuildCircle,
} from '@mui/icons-material';
import axios from 'axios';

/**
 * DiagnosticAlert displays rich, actionable errors and warnings.
 * Designed to make root-cause analysis fast and straightforward for both end-users and developers.
 */
export default function DiagnosticAlert({ errorInfo, onRetry, sx = {} }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState(null);

  if (!errorInfo) return null;

  // Normalize if a simple string was passed
  const info = typeof errorInfo === 'string'
    ? {
        title: 'Operation Failed',
        message: errorInfo,
        severity: 'error',
        remediation: 'Please check your connection and try again.',
        copyableReport: errorInfo,
        targetUrl: 'Unknown',
        status: null,
      }
    : errorInfo;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && info.copyableReport) {
        await navigator.clipboard.writeText(info.copyableReport);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (_) {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = info.copyableReport || info.message;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePingServer = async () => {
    if (!info.targetUrl || info.targetUrl === 'Unknown') return;
    setPinging(true);
    setPingResult(null);
    const start = Date.now();
    try {
      // Ping the target URL or its origin with a fast HEAD/GET
      let pingUrl = info.targetUrl;
      try {
        const parsed = new URL(info.targetUrl, window.location.origin);
        pingUrl = parsed.origin + (parsed.pathname.startsWith('/api') ? '/api/' : '/');
      } catch (_) {}

      const res = await axios.get(pingUrl, {
        timeout: 8000,
        validateStatus: () => true, // accept any HTTP status to verify connectivity
      });
      const latency = Date.now() - start;
      setPingResult({
        success: res.status < 500,
        text: `Server responded: HTTP ${res.status} (${latency}ms)`,
      });
    } catch (err) {
      const latency = Date.now() - start;
      setPingResult({
        success: false,
        text: `Unreachable (${err.code || 'Network Error'}, ${latency}ms)`,
      });
    } finally {
      setPinging(false);
    }
  };

  return (
    <Alert
      severity={info.severity || 'error'}
      sx={{
        mb: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: info.severity === 'warning' ? '#FDE68A' : '#FECACA',
        fontSize: '0.84rem',
        '& .MuiAlert-message': { width: '100%' },
        ...sx,
      }}
    >
      <AlertTitle sx={{ fontWeight: 700, fontSize: '0.92rem', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <span>{info.title || 'Error Encountered'}</span>
      </AlertTitle>

      <Typography variant="body2" sx={{ mb: 1, color: 'text.primary', lineHeight: 1.5, fontSize: '0.82rem' }}>
        {info.message}
      </Typography>

      {/* Actionable How-to-Fix Box */}
      {info.remediation && (
        <Paper
          elevation={0}
          sx={{
            p: 1.25,
            mb: 1.25,
            bgcolor: 'rgba(255, 255, 255, 0.75)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            <BuildCircle sx={{ fontSize: 16, color: '#D97706' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              How to Fix & Troubleshooting
            </Typography>
          </Box>
          <Typography
            variant="body2"
            sx={{
              color: '#451A03',
              fontSize: '0.78rem',
              lineHeight: 1.5,
              whiteSpace: 'pre-line',
            }}
          >
            {info.remediation}
          </Typography>
          {info.adminNote && (
            <Box sx={{ mt: 0.75, pt: 0.75, borderTop: '1px dashed rgba(0,0,0,0.1)' }}>
              <Typography variant="caption" sx={{ color: '#78350F', display: 'block', fontSize: '0.73rem', fontFamily: 'monospace' }}>
                💡 <strong>Admin Note:</strong> {info.adminNote}
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Collapsible Technical Details */}
      <Box sx={{ mb: 1 }}>
        <Button
          size="small"
          variant="text"
          onClick={() => setExpanded(!expanded)}
          endIcon={expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          sx={{
            p: 0,
            minWidth: 0,
            textTransform: 'none',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'text.secondary',
            '&:hover': { color: 'text.primary', bgcolor: 'transparent' },
          }}
        >
          {expanded ? 'Hide Technical Diagnostics' : 'Show Technical Diagnostics'}
        </Button>

        <Collapse in={expanded}>
          <Paper
            elevation={0}
            sx={{
              mt: 1,
              p: 1.25,
              bgcolor: '#1E293B',
              color: '#F8FAFC',
              borderRadius: 1.5,
              fontFamily: 'monospace',
              fontSize: '0.72rem',
              overflowX: 'auto',
            }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 0.5, rowGap: 0.5 }}>
              <Typography variant="caption" sx={{ color: '#94A3B8' }}>Endpoint:</Typography>
              <Typography variant="caption" sx={{ color: '#38BDF8', wordBreak: 'break-all' }}>
                {info.targetUrl || 'N/A'}
              </Typography>

              <Typography variant="caption" sx={{ color: '#94A3B8' }}>Method / Status:</Typography>
              <Typography variant="caption" sx={{ color: info.status ? '#FBBF24' : '#F87171' }}>
                {info.method || 'POST'} {info.status ? `(HTTP ${info.status})` : '(No Response / Network Error)'}
              </Typography>

              <Typography variant="caption" sx={{ color: '#94A3B8' }}>Error Code:</Typography>
              <Typography variant="caption" sx={{ color: '#CBD5E1' }}>
                {info.errorCode || 'N/A'}
              </Typography>

              <Typography variant="caption" sx={{ color: '#94A3B8' }}>Client State:</Typography>
              <Typography variant="caption" sx={{ color: info.isOnline ? '#4ADE80' : '#F87171' }}>
                {info.isOnline ? 'Online' : 'Offline'} {info.connectionType ? `(${info.connectionType})` : ''}
              </Typography>

              <Typography variant="caption" sx={{ color: '#94A3B8' }}>Timestamp:</Typography>
              <Typography variant="caption" sx={{ color: '#CBD5E1' }}>
                {info.timestamp ? new Date(info.timestamp).toLocaleTimeString() : 'Now'}
              </Typography>
            </Box>
          </Paper>
        </Collapse>
      </Box>

      {/* Bottom Button Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5, pt: 0.5, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        {/* Copy Diagnostic Report */}
        <Button
          size="small"
          variant="outlined"
          onClick={handleCopy}
          startIcon={copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
          sx={{
            py: 0.25,
            px: 1,
            textTransform: 'none',
            fontSize: '0.74rem',
            fontWeight: 600,
            borderColor: 'rgba(0,0,0,0.2)',
            color: copied ? 'success.dark' : 'text.primary',
            bgcolor: copied ? '#ECFDF5' : 'transparent',
          }}
        >
          {copied ? 'Report Copied!' : 'Copy Diagnostic Report'}
        </Button>

        {/* Ping Server / Test Connection */}
        <Button
          size="small"
          variant="outlined"
          onClick={handlePingServer}
          disabled={pinging}
          startIcon={pinging ? <CircularProgress size={12} color="inherit" /> : <NetworkCheck fontSize="small" />}
          sx={{
            py: 0.25,
            px: 1,
            textTransform: 'none',
            fontSize: '0.74rem',
            fontWeight: 600,
            borderColor: 'rgba(0,0,0,0.2)',
            color: 'text.secondary',
          }}
        >
          {pinging ? 'Testing...' : 'Test Connection'}
        </Button>

        {/* Retry Button if provided */}
        {onRetry && (
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={onRetry}
            startIcon={<Refresh fontSize="small" />}
            sx={{
              py: 0.25,
              px: 1.25,
              textTransform: 'none',
              fontSize: '0.74rem',
              fontWeight: 700,
            }}
          >
            Retry
          </Button>
        )}

        {/* Ping Result Chip */}
        {pingResult && (
          <Chip
            size="small"
            label={pingResult.text}
            color={pingResult.success ? 'success' : 'error'}
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 22 }}
          />
        )}
      </Box>
    </Alert>
  );
}
