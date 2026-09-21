import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../lib/constants';
import { canAccessView, isAdmin } from '../lib/permissions';
import { NavIconMoon, NavIconSettings, NavIconSun, NavIconLogout, NavIconChevronUp, NavIconChevronDown } from './NavIcons';

interface UserMenuProps {
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  theme?: string;
  onThemeChange?: (theme: string) => void;
  showThemeToggle?: boolean;
}

export function UserMenu({
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
  theme,
  onThemeChange,
  showThemeToggle = false,
}: UserMenuProps = {}) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [internalOpen, setInternalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, setOpen]);

  const goSettings = () => {
    setOpen(false);
    navigate('/settings');
  };

  const logout = async () => {
    setOpen(false);
    try {
      await signOut();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const showSettings = canAccessView(profile?.role, 'settings');
  const adminUser = isAdmin(profile?.role);

  const goAdmin = () => {
    setOpen(false);
    navigate('/settings?tab=users');
  };

  const toggleTheme = () => {
    if (theme && onThemeChange) {
      onThemeChange(theme === 'dark' ? 'light' : 'dark');
    }
  };

  const initials = (profile?.full_name || profile?.email || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`user-menu-wrap${hideTrigger ? ' user-menu-wrap--headless' : ''}`} ref={ref}>
      {!hideTrigger && (
        <button
          type="button"
          className="user-menu-trigger"
          onClick={() => setOpen(!open)}
          aria-label="Меню аккаунта"
          aria-expanded={open}
        >
          <span className="user-menu-avatar">{initials}</span>
          <span className="user-menu-name">{profile?.full_name?.split(' ')[0] || 'Аккаунт'}</span>
          <span className="user-menu-chevron">{open ? <NavIconChevronUp size={12} /> : <NavIconChevronDown size={12} />}</span>
        </button>
      )}
      {open && (
        <>
          <div
            className="user-menu-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden
            role="presentation"
          />
          <div className="user-menu-dropdown">
            <div className="user-menu-head">
              <div className="user-menu-head-name">{profile?.full_name || 'Сотрудник'}</div>
              <div className="user-menu-head-email">{profile?.email}</div>
              <div className="user-menu-head-role">{ROLE_LABELS[profile?.role ?? 'reception']}</div>
            </div>
            {showThemeToggle && theme && onThemeChange && (
              <button type="button" className="user-menu-item" onClick={toggleTheme}>
                <span className="user-menu-icon">{theme === 'dark' ? <NavIconSun size={16} /> : <NavIconMoon size={16} />}</span>
                {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              </button>
            )}
            {adminUser && (
              <button type="button" className="user-menu-item" onClick={goAdmin}>
                <span className="user-menu-icon"><NavIconSettings size={16} /></span>
                Администрирование
              </button>
            )}
            {showSettings && !adminUser && (
              <button type="button" className="user-menu-item" onClick={goSettings}>
                <span className="user-menu-icon"><NavIconSettings size={16} /></span>
                Настройки
              </button>
            )}
            <button type="button" className="user-menu-item danger" onClick={logout}>
              <span className="user-menu-icon"><NavIconLogout size={16} /></span>
              Выйти из системы
            </button>
          </div>
        </>
      )}
    </div>
  );
}
