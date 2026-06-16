import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import BGEDashboard from './components/BGEDashboard';
import ResetPassword from './components/ResetPassword';
import VerifyEmail from './components/VerifyEmail';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { CHANGE_PASSWORD_URL } from './config';

// ── Forced password change modal ─────────────────────────────────────────────
function PasswordChangeModal({ token, onSuccess }) {
  const [current, setCurrent] = React.useState('');
  const [next, setNext]       = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [err, setErr]         = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (next.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (next !== confirm) { setErr('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await axios.post(CHANGE_PASSWORD_URL,
        { current_password: current, new_password: next },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSuccess(res.data.token);
    } catch (e) {
      setErr(e.response?.data?.detail || 'Failed to change password. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:10, padding:'32px 36px', width:380,
        maxWidth:'95vw', boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}>
        <div style={{ background:'#1A2F4B', borderRadius:6, padding:'12px 16px', marginBottom:20 }}>
          <div style={{ color:'#fff', fontWeight:800, fontSize:18 }}>PRUDEV II</div>
          <div style={{ color:'rgba(255,255,255,0.7)', fontSize:12 }}>Security — Password Update Required</div>
        </div>
        <h3 style={{ margin:'0 0 6px', color:'#1A2F4B', fontSize:16 }}>Set a new password</h3>
        <p style={{ margin:'0 0 20px', color:'#555', fontSize:13, lineHeight:1.5 }}>
          Your account requires a password change before you can continue.
          Choose a strong password of at least 8 characters.
        </p>
        {err && <div style={{ background:'#FFEBEE', color:'#C62828', padding:'8px 12px',
          borderRadius:4, marginBottom:12, fontSize:13 }}>{err}</div>}
        <form onSubmit={submit}>
          {[
            { label:'Current password', val:current, set:setCurrent },
            { label:'New password (min. 8 chars)', val:next, set:setNext },
            { label:'Confirm new password', val:confirm, set:setConfirm },
          ].map(({ label, val, set }) => (
            <div key={label} style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:12, color:'#555', marginBottom:4, fontWeight:600 }}>{label}</label>
              <input type="password" value={val} onChange={e => set(e.target.value)}
                required style={{ width:'100%', padding:'9px 12px', border:'1px solid #ccc',
                  borderRadius:5, fontSize:14, boxSizing:'border-box' }} />
            </div>
          ))}
          <button type="submit" disabled={loading}
            style={{ width:'100%', background:'#C8102E', color:'#fff', border:'none',
              borderRadius:6, padding:'11px 0', fontSize:15, fontWeight:700,
              cursor: loading ? 'not-allowed' : 'pointer', marginTop:4 }}>
            {loading ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Pending account approval screen ──────────────────────────────────────────
function PendingApproval({ currentUser, onLogout }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f6fa', fontFamily: 'system-ui, sans-serif', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: '36px 32px', maxWidth: 440,
        width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <h2 style={{ margin: '0 0 8px', color: '#1A2F4B' }}>Account Pending Approval</h2>
        <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 4px' }}>
          Your account ({currentUser?.email || currentUser?.username}) signed in successfully,
          but an administrator needs to approve access before you can view programme data.
        </p>
        <p style={{ color: '#777', fontSize: 13, lineHeight: 1.6, margin: '12px 0 20px' }}>
          You'll be able to sign in normally once your account has been approved. Please check
          back later or contact your programme administrator.
        </p>
        <button
          onClick={() => onLogout()}
          style={{ background: '#C8102E', color: '#fff', border: 'none', borderRadius: 6,
            padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#fff2f2', minHeight: '100vh' }}>
          <h2 style={{ color: '#900' }}>⚠ Render Error — {error.message}</h2>
          <pre style={{ fontSize: 12, background: '#fff', padding: 16, border: '1px solid #fcc', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
            {error.stack}
          </pre>
          <button
            onClick={() => { sessionStorage.clear(); localStorage.clear(); window.location.replace('/login'); }}
            style={{ marginTop: 16, padding: '8px 20px', cursor: 'pointer', fontSize: 14 }}
          >
            Clear session → Login
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Session storage ───────────────────────────────────────────────────────────
// sessionStorage is cleared automatically when the browser tab / window is
// closed, which gives us "log out on browser close" for free.
// The server also enforces token expiry (default 8 hours via SESSION_LIFETIME_SECONDS).
const S = sessionStorage;

function isSessionExpired() {
  const exp = parseInt(S.getItem('session_expires_at') || '0', 10);
  return exp > 0 && Math.floor(Date.now() / 1000) > exp;
}

function getStoredToken() {
  if (isSessionExpired()) { S.clear(); return null; }
  return S.getItem('token');
}

function getStoredUser() {
  if (isSessionExpired()) { S.clear(); return null; }
  try { return JSON.parse(S.getItem('user') || 'null'); }
  catch { return null; }
}

export default function App() {
  const [token, setToken]             = useState(getStoredToken);
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const [sessionExpired, setSessionExpired] = useState(false);

  const handleLogin = (newToken, user, sessionExpiresAt) => {
    S.setItem('token', newToken);
    S.setItem('user', JSON.stringify(user));
    if (sessionExpiresAt) S.setItem('session_expires_at', String(sessionExpiresAt));
    setToken(newToken);
    setCurrentUser(user);
    setSessionExpired(false);
  };

  // Called when the user successfully changes their password in the modal
  const handlePasswordChanged = (newToken) => {
    const updatedUser = { ...currentUser, password_change_required: false };
    const exp = S.getItem('session_expires_at');
    S.setItem('token', newToken);
    S.setItem('user', JSON.stringify(updatedUser));
    if (exp) S.setItem('session_expires_at', exp);
    setToken(newToken);
    setCurrentUser(updatedUser);
  };

  const passwordChangeRequired = !!(currentUser?.password_change_required);

  const handleLogout = React.useCallback((expired = false) => {
    S.clear();
    setToken(null);
    setCurrentUser(null);
    if (expired) setSessionExpired(true);
  }, []);

  // Auto-expire timer: fires exactly when the session token becomes invalid
  useEffect(() => {
    const exp = parseInt(S.getItem('session_expires_at') || '0', 10);
    if (!exp || !token) return;
    const msUntilExpiry = exp * 1000 - Date.now();
    if (msUntilExpiry <= 0) { handleLogout(true); return; }
    const t = setTimeout(() => handleLogout(true), msUntilExpiry);
    return () => clearTimeout(t);
  }, [token, handleLogout]);

  const isAdmin = !!(currentUser?.is_staff || currentUser?.is_superuser ||
                     currentUser?.role === 'admin' ||
                     currentUser?.role === 'cohort_admin' ||
                     currentUser?.role === 'viewer');
  const isBGE   = !!(currentUser?.role === 'bge');
  const isPending = currentUser?.role === 'pending';

  // If token exists but user role is unrecognised, clear (in an effect, not the
  // render body — mutating storage during render causes a stale read on the
  // very same render and was previously leaving the app in a half-logged-in state).
  useEffect(() => {
    if (token && currentUser && !isAdmin && !isBGE && !isPending) {
      handleLogout();
    }
  }, [token, currentUser, isAdmin, isBGE, isPending, handleLogout]);

  // Global 401 interceptor — expired/revoked token → clear session + login
  useEffect(() => {
    const id = axios.interceptors.response.use(
      r => r,
      err => {
        if (err?.response?.status === 401 && S.getItem('token')) {
          handleLogout(true);
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [handleLogout]);

  return (
    <ErrorBoundary>
      {/* Force password change modal — blocks the entire app until resolved */}
      {token && currentUser && passwordChangeRequired && (
        <PasswordChangeModal token={token} onSuccess={handlePasswordChanged} />
      )}
      <Router>
        <Routes>
          <Route path="/login" element={
            (token && (isAdmin || isBGE || isPending))
              ? <Navigate to="/dashboard" replace />
              : <Login onLogin={handleLogin} sessionExpired={sessionExpired} />
          } />
          <Route path="/dashboard" element={
            !token ? <Navigate to="/login" replace /> :
            isAdmin ? (
              <ErrorBoundary>
                <Dashboard token={token} currentUser={currentUser} onLogout={handleLogout} />
              </ErrorBoundary>
            ) : isBGE ? (
              <ErrorBoundary>
                <BGEDashboard token={token} currentUser={currentUser} onLogout={handleLogout} />
              </ErrorBoundary>
            ) : isPending ? (
              <PendingApproval currentUser={currentUser} onLogout={handleLogout} />
            ) : <Navigate to="/login" replace />
          } />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="*" element={<Navigate to={(token && (isAdmin || isBGE || isPending)) ? '/dashboard' : '/login'} replace />} />
        </Routes>
        <PWAInstallPrompt />
      </Router>
    </ErrorBoundary>
  );
}
