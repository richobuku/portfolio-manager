import React, { useState } from 'react';
import {
  Box, TextField, Button, Typography, Alert, CircularProgress,
  Paper, IconButton, InputAdornment, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import axios from 'axios';
import { API_ENDPOINTS } from '../config';
import { BRAND } from '../theme';

const gizLogo = '/giz-logo.png';
const gopaLogo = '/gopa-logo.png';

export default function Login({ onLogin, sessionExpired }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailUnverified, setEmailUnverified] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendInfo, setResendInfo] = useState('');

  // Forgot password dialog
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');

  const handleChange = (e) =>
    setCredentials({ ...credentials, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setEmailUnverified(false);
    setResendInfo('');
    try {
      const res = await axios.post(API_ENDPOINTS.LOGIN, credentials);
      if (res.data.token) {
        onLogin(res.data.token, res.data.user, res.data.session_expires_at);
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Invalid username or password.');
      setEmailUnverified(!!err.response?.data?.email_unverified);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    setResendInfo('');
    try {
      const res = await axios.post(API_ENDPOINTS.RESEND_VERIFICATION, { email: credentials.username });
      setResendInfo(res.data.message || 'If that email belongs to an unverified account, a new verification link has been sent.');
    } catch {
      setResendInfo('Something went wrong. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleResetRequest = async () => {
    if (!resetEmail.trim()) { setResetError('Please enter your email address.'); return; }
    setResetLoading(true);
    setResetError('');
    setResetMsg('');
    try {
      const res = await axios.post(API_ENDPOINTS.PASSWORD_RESET, { email: resetEmail });
      setResetMsg(res.data.message || 'Reset link sent. Check your email.');
    } catch {
      setResetError('Something went wrong. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      background: `linear-gradient(150deg, #243B55 0%, ${BRAND.sidebarBg} 35%, #0F1F2E 70%, #080E17 100%)`,
    }}>
      {/* Left panel — branding only, no logos */}
      <Box sx={{
        flex: 1, display: { xs: 'none', md: 'flex' },
        flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
        px: 8, color: '#fff',
      }}>
        <Typography variant="h3" fontWeight={800} sx={{ mb: 1, lineHeight: 1.15 }}>
          PRUDEV II
        </Typography>
        <Typography variant="h5" sx={{ opacity: 0.85, fontWeight: 400, mb: 2 }}>
          MSME Portfolio Management
        </Typography>
        <Box sx={{ width: 50, height: 4, bgcolor: BRAND.gizRed, borderRadius: 2, mb: 3 }} />
        <Typography variant="body1" sx={{ opacity: 0.65, maxWidth: 380, lineHeight: 1.7 }}>
          Supporting the growth of Micro, Small and Medium Enterprises across Uganda through targeted business development services.
        </Typography>
      </Box>

      {/* Right panel — login form */}
      <Box sx={{
        width: { xs: '100%', md: 440 },
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: '#FFFFFF', p: 3,
        borderLeft: `4px solid ${BRAND.gizRed}`,
      }}>
        <Box sx={{ width: '100%', maxWidth: 380 }}>
          {/* Mobile title (shown only on small screens) */}
          <Box sx={{ display: { md: 'none' }, textAlign: 'center', mb: 4 }}>
            <Typography variant="h5" fontWeight={800} color="primary">PRUDEV II</Typography>
            <Typography variant="caption" color="text.secondary">MSME Portfolio System</Typography>
          </Box>

          <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #E0E7F0' }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>Sign in</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Use your programme credentials to sign in
            </Typography>

            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth size="small" label="Username" name="username"
                value={credentials.username} onChange={handleChange}
                disabled={loading} autoComplete="username"
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth size="small" label="Password" name="password"
                type={showPassword ? 'text' : 'password'}
                value={credentials.password} onChange={handleChange}
                disabled={loading}
                sx={{ mb: 1 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              {/* Forgot password */}
              <Box sx={{ textAlign: 'right', mb: 2 }}>
                <Typography
                  variant="caption" color="primary"
                  sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                  onClick={() => { setResetOpen(true); setResetEmail(''); setResetMsg(''); setResetError(''); }}
                >
                  Forgot password?
                </Typography>
              </Box>

              {sessionExpired && (
                <Alert severity="warning" sx={{ mb: 2, py: 0.5 }}>
                  Your session has expired. Please log in again.
                </Alert>
              )}
              {error && <Alert severity="error" sx={{ mb: 2, py: 0.5 }}>{error}</Alert>}
              {emailUnverified && (
                <Box sx={{ mb: 2 }}>
                  {resendInfo ? (
                    <Alert severity="success" sx={{ py: 0.5 }}>{resendInfo}</Alert>
                  ) : (
                    <Button
                      size="small" onClick={handleResendVerification} disabled={resendLoading}
                      sx={{ textTransform: 'none' }}
                    >
                      {resendLoading ? <CircularProgress size={16} color="inherit" /> : 'Resend verification email'}
                    </Button>
                  )}
                </Box>
              )}
              <Button
                type="submit" fullWidth variant="contained" size="large"
                disabled={loading}
                sx={{ py: 1.2, bgcolor: BRAND.primaryMain, '&:hover': { bgcolor: BRAND.primaryDark } }}
              >
                {loading ? <CircularProgress size={22} color="inherit" /> : 'Sign In'}
              </Button>
            </Box>
          </Paper>

          {/* Logos footer */}
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3, mb: 1.5 }}>
              <Box component="img" src={gizLogo} alt="German Cooperation · Implemented by GIZ" sx={{ height: 38, width: 'auto', display: 'block', opacity: 0.9 }} />
              <Box sx={{ width: 1, height: 28, bgcolor: '#E0E7F0' }} />
              <Box component="img" src={gopaLogo} alt="GOPA AFC" sx={{ height: 22, width: 'auto', display: 'block', opacity: 0.9 }} />
            </Box>
            <Typography variant="caption" color="text.disabled">
              © {new Date().getFullYear()} PRUDEV II Programme · GIZ · GOPA AFC
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Forgot password dialog */}
      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Reset Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the email address linked to your account and we'll send you a reset link.
          </Typography>
          <TextField
            fullWidth size="small" label="Email address" type="email"
            value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
            disabled={resetLoading || !!resetMsg}
            autoFocus
          />
          {resetError && <Alert severity="error" sx={{ mt: 2, py: 0.5 }}>{resetError}</Alert>}
          {resetMsg && <Alert severity="success" sx={{ mt: 2, py: 0.5 }}>{resetMsg}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          {!resetMsg && (
            <Button
              variant="contained" onClick={handleResetRequest}
              disabled={resetLoading}
              sx={{ bgcolor: BRAND.primaryMain, '&:hover': { bgcolor: BRAND.primaryDark } }}
            >
              {resetLoading ? <CircularProgress size={18} color="inherit" /> : 'Send Reset Link'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
