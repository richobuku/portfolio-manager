import React, { useState } from 'react';
import {
  Box, TextField, Button, Typography, Alert, CircularProgress,
  Paper, IconButton, InputAdornment,
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


  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      background: `linear-gradient(150deg, #243B55 0%, ${BRAND.sidebarBg} 35%, #0F1F2E 70%, #080E17 100%)`,
    }}>
      {/* Left panel — branding */}
      <Box sx={{
        flex: 1, display: { xs: 'none', md: 'flex' },
        flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
        px: 8, color: '#fff',
      }}>
        {/* Logos — directly on dark background, no white boxes needed */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 6 }}>
          <Box>
            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.45)', fontSize: 9, mb: 0.75, fontStyle: 'italic', letterSpacing: 0.3 }}>
              Implemented by
            </Typography>
            <Box component="img" src={gizLogo} alt="GIZ German Cooperation" sx={{ height: 44, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
          </Box>
          <Box sx={{ width: 1, height: 50, bgcolor: 'rgba(255,255,255,0.2)' }} />
          <Box component="img" src={gopaLogo} alt="GOPA AFC" sx={{ height: 38, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
        </Box>

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
          {/* Mobile logos */}
          <Box sx={{ display: { md: 'none' }, textAlign: 'center', mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mb: 2 }}>
              <Box component="img" src={gizLogo} alt="GIZ" sx={{ height: 32, width: 'auto', opacity: 0.85 }} />
              <Box sx={{ width: 1, height: 28, bgcolor: '#E0E7F0' }} />
              <Box component="img" src={gopaLogo} alt="GOPA AFC" sx={{ height: 28, width: 'auto', opacity: 0.85 }} />
            </Box>
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
                sx={{ mb: 2 }}
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
              {error && <Alert severity="error" sx={{ mb: 2, py: 0.5 }}>{error}</Alert>}
              <Button
                type="submit" fullWidth variant="contained" size="large"
                disabled={loading}
                sx={{ py: 1.2, bgcolor: BRAND.primaryMain, '&:hover': { bgcolor: BRAND.primaryDark } }}
              >
                {loading ? <CircularProgress size={22} color="inherit" /> : 'Sign In'}
              </Button>
            </Box>
          </Paper>

          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3, mb: 1.5 }}>
              <Box component="img" src={gizLogo} alt="GIZ" sx={{ height: 24, width: 'auto', display: 'block', opacity: 0.75 }} />
              <Box sx={{ width: 1, height: 20, bgcolor: '#E0E7F0' }} />
              <Box component="img" src={gopaLogo} alt="GOPA AFC" sx={{ height: 20, width: 'auto', display: 'block', opacity: 0.75 }} />
            </Box>
            <Typography variant="caption" color="text.disabled">
              © {new Date().getFullYear()} PRUDEV II Programme · GIZ · GOPA AFC
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
