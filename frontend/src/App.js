import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import BGEDashboard from './components/BGEDashboard';
import ResetPassword from './components/ResetPassword';

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

  const handleLogout = React.useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setCurrentUser(null);
  }, []);

  const isAdmin = !!(currentUser?.is_staff || currentUser?.is_superuser || currentUser?.role === 'admin');
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
          <Route path="*" element={<Navigate to={(token && (isAdmin || isBGE)) ? '/dashboard' : '/login'} replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
