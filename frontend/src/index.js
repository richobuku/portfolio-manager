import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme, { BRAND } from './theme';
import API_BASE_URL from './config';

// ── Service Worker & Push Notifications ───────────────────────────────────────
if (window.location.search.includes('reset_cache=1') || window.location.hash.includes('reset_cache')) {
  if ('caches' in window) {
    caches.keys().then((names) => {
      Promise.all(names.map((name) => caches.delete(name))).then(() => {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            Promise.all(registrations.map((r) => r.unregister())).then(() => {
              window.location.href = window.location.pathname;
            });
          });
        } else {
          window.location.href = window.location.pathname;
        }
      });
    });
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        registration.update().catch(() => {});
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' });
              window.dispatchEvent(new Event('pwa-update-available'));
            }
          });
        });
      })
      .catch(() => {});
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FORCE_RELOAD') {
      window.location.reload();
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.dispatchEvent(new Event('pwa-controller-changed'));
  });
}

/**
 * Request push notification permission and subscribe the user.
 * Called from BGEDashboard after login.
 */
export async function subscribePush(authToken) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const sw = await navigator.serviceWorker.ready;

    // Fetch VAPID public key
    const res = await fetch(`${API_BASE_URL}/api/push/vapid-key/`);
    const { publicKey } = await res.json();

    // Subscribe
    const subscription = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const sub = subscription.toJSON();
    await fetch(`${API_BASE_URL}/api/push/subscribe/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken,
      },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      }),
    });
  } catch (_err) {
    // Push subscription failed silently — non-critical
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
// ─────────────────────────────────────────────────────────────────────────────

// Ensure browser / PWA title bar theme-color matches Warm Bronze-Charcoal
const metaThemeColor = document.querySelector('meta[name="theme-color"]');
if (metaThemeColor) {
  metaThemeColor.setAttribute('content', BRAND.primaryMain);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>
);
