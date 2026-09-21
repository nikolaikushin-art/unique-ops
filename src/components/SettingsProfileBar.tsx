import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../lib/constants';

export function SettingsProfileBar() {
  const { profile } = useAuth();
  const role = profile?.role;
  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  const displayName = profile?.full_name || profile?.email || '';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  return (
    <div className="settings-profile-card">
      <div className="settings-profile-avatar" aria-hidden>{initials}</div>
      <div className="settings-profile-user">
        <div className="settings-profile-name">{displayName}</div>
        <div className="settings-profile-role">{ROLE_LABELS[role ?? 'reception']}</div>
      </div>
      <div className="settings-profile-meta">
        <div className="settings-profile-shift">Смена · {today}</div>
        <div className="settings-profile-session">Активная сессия</div>
      </div>
    </div>
  );
}
