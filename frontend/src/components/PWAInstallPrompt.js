import React from 'react';
import { Alert, Button, Snackbar } from '@mui/material';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
}

export default function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = React.useState(null);
  const [showInstall, setShowInstall] = React.useState(false);
  const [showIosHint, setShowIosHint] = React.useState(false);
  const [showUpdate, setShowUpdate] = React.useState(false);

  React.useEffect(() => {
    if (isStandalone()) return undefined;

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
      setShowInstall(true);
    };

    const onAppInstalled = () => {
      setInstallEvent(null);
      setShowInstall(false);
      setShowIosHint(false);
    };

    const onUpdateAvailable = () => setShowUpdate(true);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('pwa-update-available', onUpdateAvailable);

    const iosTimer = window.setTimeout(() => {
      if (isIOS() && !isStandalone() && !window.localStorage.getItem('pwa-ios-hint-dismissed')) {
        setShowIosHint(true);
      }
    }, 2500);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('pwa-update-available', onUpdateAvailable);
      window.clearTimeout(iosTimer);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    setShowInstall(false);
  };

  const dismissIosHint = () => {
    window.localStorage.setItem('pwa-ios-hint-dismissed', '1');
    setShowIosHint(false);
  };

  const applyUpdate = () => {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  return (
    <>
      <Snackbar
        open={showInstall}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ pb: 'max(env(safe-area-inset-bottom), 8px)' }}
      >
        <Alert
          severity="info"
          onClose={() => setShowInstall(false)}
          action={<Button color="inherit" size="small" onClick={install}>Install</Button>}
          sx={{ alignItems: 'center' }}
        >
          Install PRUDEV II on this phone for quick access.
        </Alert>
      </Snackbar>

      <Snackbar
        open={showIosHint}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ pb: 'max(env(safe-area-inset-bottom), 8px)' }}
      >
        <Alert severity="info" onClose={dismissIosHint} sx={{ alignItems: 'center' }}>
          On iPhone, tap Share, then Add to Home Screen.
        </Alert>
      </Snackbar>

      <Snackbar
        open={showUpdate}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ pb: 'max(env(safe-area-inset-bottom), 8px)' }}
      >
        <Alert
          severity="success"
          action={<Button color="inherit" size="small" onClick={applyUpdate}>Refresh</Button>}
          sx={{ alignItems: 'center' }}
        >
          A new version is available.
        </Alert>
      </Snackbar>
    </>
  );
}
