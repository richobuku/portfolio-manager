import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import BGEDashboard from './components/BGEDashboard';
import ResetPassword from './components/ResetPassword';
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
            onClick={() => { localStorage.clear(); window.location.replace('/login'); }}
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

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); }
  catch { return null; }
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState(getStoredUser);

  const handleLogin = (newToken, user) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(user));
    setToken(newToken);
    setCurrentUser(user);
  };

  // Called when the user successfully changes their password in the modal
  const handlePasswordChanged = (newToken) => {
    const updatedUser = { ...currentUser, password_change_required: false };
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setToken(newToken);
    setCurrentUser(updatedUser);
  };

  const passwordChangeRequired = !!(currentUser?.password_change_required);

  const handleLogout = React.useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setCurrentUser(null);
  }, []);

  const isAdmin = !!(currentUser?.is_staff || currentUser?.is_superuser ||
                     currentUser?.role === 'admin' ||
                     currentUser?.role === 'cohort_admin' ||
                     currentUser?.role === 'viewer');
  const isBGE   = !!(currentUser?.role === 'bge');

  // If token exists but user role is unrecognised, clear (in an effect, not the
  // render body — mutating storage during render causes a stale read on the
  // very same render and was previously leaving the app in a half-logged-in state).
  useEffect(() => {
    if (token && currentUser && !isAdmin && !isBGE) {
      handleLogout();
    }
  }, [token, currentUser, isAdmin, isBGE, handleLogout]);

  // Global 401 interceptor — once installed, any request that comes back with
  // an expired/forged token clears local session and bounces the user to /login
  // instead of leaving them on a broken dashboard.
  useEffect(() => {
    const id = axios.interceptors.response.use(
      r => r,
      err => {
        if (err?.response?.status === 401 && localStorage.getItem('token')) {
          handleLogout();
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
            (token && (isAdmin || isBGE))
              ? <Navigate to="/dashboard" replace />
              : <Login onLogin={handleLogin} />
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
            ) : <Navigate to="/login" replace />
          } />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to={(token && (isAdmin || isBGE)) ? '/dashboard' : '/login'} replace />} />
        </Routes>
        <PWAInstallPrompt />
      </Router>
    </ErrorBoundary>
  );
}
