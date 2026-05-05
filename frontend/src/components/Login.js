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

export default function Login({ onLogin }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    try {
      const res = await axios.post(API_ENDPOINTS.LOGIN, credentials);
      if (res.data.token) {
        onLogin(res.data.token, res.data.user);
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Invalid username or password.');
    } finally {
      setLoading(false);
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
      alignItems: 'center',
      justifyContent: 'center',
      background: `linear-gradient(150deg, #243B55 0%, ${BRAND.sidebarBg} 35%, #0F1F2E 70%, #080E17 100%)`,
      p: 2,
    }}>
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <Paper elevation={0} sx={{ borderRadius: 3, overflow: 'hidden', border: `1px solid rgba(255,255,255,0.08)` }}>
          {/* Coloured top bar */}
          <Box sx={{ height: 4, bgcolor: BRAND.gizRed }} />

          <Box sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>Sign in</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Use your programme credentials to continue
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

              {/* Forgot password link */}
              <Box sx={{ textAlign: 'right', mb: 2 }}>
                <Typography
                  variant="caption"
                  color="primary"
                  sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                  onClick={() => { setResetOpen(true); setResetEmail(''); setResetMsg(''); setResetError(''); }}
                >
                  Forgot password?
                </Typography>
              </Box>

              {error && <Alert severity="error" sx={{ mb: 2, py: 0.5 }}>{error}</Alert>}

              <Button
                type="submit" fullWidth variant="contained" size="large"
                disabled={loading}
                sx={{ py: 1.2, bgcolor: BRAND.primaryMain, '&:hover': { bgcolor: BRAND.primaryDark } }}
              >
                {loading ? <CircularProgress size={22} color="inherit" /> : 'Sign In'}
              </Button>
            </Box>
          </Box>

          {/* Logo footer */}
          <Box sx={{ px: 4, pb: 3, pt: 0, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3, mb: 1 }}>
              <Box component="img" src={gizLogo} alt="GIZ" sx={{ height: 24, width: 'auto', opacity: 0.65 }} />
              <Box sx={{ width: 1, height: 20, bgcolor: '#E0E7F0' }} />
              <Box component="img" src={gopaLogo} alt="GOPA AFC" sx={{ height: 20, width: 'auto', opacity: 0.65 }} />
            </Box>
            <Typography variant="caption" color="text.disabled">
              © {new Date().getFullYear()} PRUDEV II Programme · GIZ · GOPA AFC
            </Typography>
          </Box>
        </Paper>
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
