import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../lib/constants';

import { SecurityPanel } from '../components/SecurityPanel';

export function AccountPanel() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('uo-theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uo-theme', theme);
  }, [theme]);

  const logout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="section-block">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Аккаунт</div>
          <div className="section-title">Мой профиль</div>
        </div>
      </div>

      <div className="account-card">
        <div className="account-avatar">
          {(profile?.full_name || profile?.email || 'U').slice(0, 1).toUpperCase()}
        </div>
        <div className="account-info">
          <div className="account-name">{profile?.full_name || '—'}</div>
          <div className="account-email">{profile?.email}</div>
          <div className="account-role">{ROLE_LABELS[profile?.role ?? 'reception']}</div>
        </div>
      </div>

      <div className="settings-options">
        <div className="settings-option">
          <div>
            <div className="settings-option-label">Тема интерфейса</div>
            <div className="settings-option-desc">Светлая или тёмная тема для рабочей области</div>
          </div>
          <div className="seg">
            <button type="button" className={`seg-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>Светлая</button>
            <button type="button" className={`seg-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>Тёмная</button>
          </div>
        </div>
      </div>

      <div className="account-logout-wrap">
        <button type="button" className="btn-primary account-logout-btn" onClick={logout}>
          Выйти из системы
        </button>
        <p className="settings-hint">Завершить текущую сессию на этом устройстве</p>
      </div>

      <SecurityPanel />
    </div>
  );
}
