import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography,
  InputAdornment, IconButton, Alert, CircularProgress,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { API_ENDPOINTS } from '../config';

const BRAND = { dark: '#1A2F4B', gizRed: '#C8102E' };

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const uid   = searchParams.get('uid')   || '';

  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  // Track the post-success redirect timer so it can be cleared if the user
  // navigates away before it fires (otherwise React warns about state updates
  // on an unmounted component, and the user gets bounced unexpectedly).
  const redirectTimerRef = useRef(null);
  useEffect(() => () => {
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.PASSWORD_RESET_CONFIRM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, uid, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message || 'Password reset successfully.');
        redirectTimerRef.current = setTimeout(() => navigate('/login'), 2500);
      } else {
        setError(data.message || 'Reset failed. The link may have expired.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5' }}>
        <Alert severity="error">Invalid reset link. Please request a new one.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5' }}>
      <Card sx={{ width: 420, p: 2, boxShadow: 4, borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h5" fontWeight={700} color={BRAND.dark} gutterBottom>
            Set New Password
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Choose a strong password for your PRUDEV II account.
          </Typography>

          {error   && <Alert severity="error"   sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

          {!success && (
            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                label="New password"
                type={showPw ? 'text' : 'password'}
                fullWidth
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                sx={{ mb: 2 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPw(p => !p)} edge="end">
                        {showPw ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Confirm new password"
                type="password"
                fullWidth
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                sx={{ mb: 3 }}
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={loading}
                sx={{ py: 1.5, bgcolor: BRAND.gizRed, '&:hover': { bgcolor: '#a00d24' }, fontWeight: 700, borderRadius: 2 }}
              >
                {loading ? <CircularProgress size={22} color="inherit" /> : 'Reset Password'}
              </Button>
              <Button
                fullWidth
                sx={{ mt: 1, color: BRAND.dark }}
                onClick={() => navigate('/login')}
              >
                Back to Sign In
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
