import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Button, Typography, Alert, CircularProgress,
} from '@mui/material';
import { API_ENDPOINTS } from '../config';

const BRAND = { dark: '#1A2F4B', gizRed: '#C8102E' };

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const uid   = searchParams.get('uid')   || '';

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const redirectTimerRef = useRef(null);
  useEffect(() => () => {
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
  }, []);

  useEffect(() => {
    if (!token || !uid) {
      setError('Invalid verification link.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(API_ENDPOINTS.VERIFY_EMAIL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, uid }),
        });
        const data = await res.json();
        if (res.ok) {
          setSuccess(data.message || 'Email verified successfully. You can now sign in.');
          redirectTimerRef.current = setTimeout(() => navigate('/login'), 2500);
        } else {
          setError(data.message || 'Verification failed. The link may have expired.');
        }
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5' }}>
      <Card sx={{ width: 420, p: 2, boxShadow: 4, borderRadius: 3 }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={700} color={BRAND.dark} gutterBottom>
            Email Verification
          </Typography>

          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress sx={{ color: BRAND.gizRed }} />
            </Box>
          )}

          {!loading && success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
          {!loading && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {!loading && (
            <Button
              fullWidth
              variant="contained"
              sx={{ mt: 1, py: 1.5, bgcolor: BRAND.gizRed, '&:hover': { bgcolor: '#a00d24' }, fontWeight: 700, borderRadius: 2 }}
              onClick={() => navigate('/login')}
            >
              Go to Sign In
            </Button>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
