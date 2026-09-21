import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SecurityProvider } from './contexts/SecurityContext';
import { DataRefreshProvider } from './contexts/DataRefreshContext';
import { ModuleConfigProvider } from './contexts/ModuleConfigContext';
import { ToastProvider } from './contexts/ToastContext';
import App from './App';
import { PageMeta } from './components/PageMeta';
import { ScrollToTop } from './components/ScrollToTop';
import './styles/global.css';
import './styles/premium-system.css';
import './styles/apple-visuals.css';
import './styles/ops-premium.css';
import './styles/dashboards.css';
import './styles/topbar-apple.css';
import { initLocalFiles } from './lib/r2Storage';

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

/* Every fresh visit (new tab / reopened browser) starts at the login screen — demo mode included.
   A plain page reload inside the same tab keeps the session. */
try {
  if (!sessionStorage.getItem('uo:booted')) {
    localStorage.removeItem('uo:auth:session');
    sessionStorage.setItem('uo:booted', '1');
  }
} catch { /* storage unavailable */ }

initLocalFiles().finally(() => {
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PageMeta />
      <ScrollToTop />
      <AuthProvider>
        <SecurityProvider>
          <ModuleConfigProvider>
            <DataRefreshProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </DataRefreshProvider>
          </ModuleConfigProvider>
        </SecurityProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
});
