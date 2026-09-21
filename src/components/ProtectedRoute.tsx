import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ConsentScreen } from './ConsentGate';
import { isConfirmedThisSession } from '../lib/consents';
import { useAuth } from '../contexts/AuthContext';
import { useModuleConfig } from '../contexts/ModuleConfigContext';
import { canAccessView, isStaff } from '../lib/permissions';
import type { UserRole, ViewId } from '../types/database';

export function ProtectedRoute({
  children,
  roles,
  view,
}: {
  children: React.ReactNode;
  roles?: UserRole[];
  view?: ViewId;
}) {
  const { session, profile, loading, needsMfa, needsVerification, needsPasswordChange } = useAuth();
  const [consented, setConsented] = useState(false);

  if (loading) return <div className="loading-screen">Загрузка...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (needsVerification) return <Navigate to="/verify-account" replace />;
  if (needsPasswordChange) return <Navigate to="/set-password" replace />;
  if (needsMfa) return <Navigate to="/mfa-challenge" replace />;
  if (!profile) return <div className="loading-screen">Загрузка профиля...</div>;

  if (!profile.is_active) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <h1 className="auth-title">Аккаунт отключён</h1>
          <p className="auth-sub">Ваш доступ к системе был отключён администратором. Обратитесь к руководству студии.</p>
          <a className="auth-link" href="/login">← Вернуться к входу</a>
        </div>
      </div>
    );
  }

  if (!isStaff(profile.role)) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <h1 className="auth-title">Доступ запрещён</h1>
          <p className="auth-sub">Unique Operations — внутренняя система для сотрудников студии.</p>
          <a className="auth-link" href="/login">← Вернуться к входу</a>
        </div>
      </div>
    );
  }

  // Terms & consents: a full page right after login, before anything of the app is shown.
  if (!consented && !isConfirmedThisSession(profile.id)) {
    return <ConsentScreen onDone={() => setConsented(true)} />;
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to="/overview" replace />;
  }

  if (view && !canAccessView(profile.role, view)) {
    return <Navigate to="/overview" replace />;
  }

  return <>{children}</>;
}

export function ViewRoute({ view, children }: { view: ViewId; children: React.ReactNode }) {
  const { isEnabled } = useModuleConfig();
  if (!isEnabled(view)) return <Navigate to="/overview" replace />;
  return <ProtectedRoute view={view}>{children}</ProtectedRoute>;
}
