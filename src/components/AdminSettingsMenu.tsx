import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavIconSettings } from './NavIcons';
import { isAdmin } from '../lib/permissions';

interface AdminSettingsMenuProps {
  theme: string;
  onThemeChange: (t: string) => void;
}

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {children}
    </svg>
  );
}

const icons = {
  users: (
    <MenuIcon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </MenuIcon>
  ),
  roles: (
    <MenuIcon>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </MenuIcon>
  ),
  sun: (
    <MenuIcon>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </MenuIcon>
  ),
  moon: (
    <MenuIcon>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </MenuIcon>
  ),
  gear: (
    <MenuIcon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </MenuIcon>
  ),
  notifications: (
    <MenuIcon>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </MenuIcon>
  ),
  storage: (
    <MenuIcon>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </MenuIcon>
  ),
  modules: (
    <MenuIcon>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </MenuIcon>
  ),
  system: (
    <MenuIcon>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </MenuIcon>
  ),
};

export function AdminSettingsMenu({ theme, onThemeChange }: AdminSettingsMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  const toggle = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setOpen((v) => !v);
  };

  const go = (tab: string) => {
    setOpen(false);
    navigate(`/settings?tab=${tab}`);
  };

  const items = [
    { id: 'users', label: 'Пользователи', icon: icons.users },
    { id: 'roles', label: 'Роли и доступ', icon: icons.roles },
    { id: 'theme', label: 'Тема оформления', icon: theme === 'dark' ? icons.sun : icons.moon, action: () => onThemeChange(theme === 'dark' ? 'light' : 'dark') },
    { id: 'preferences', label: 'Системные настройки', icon: icons.gear },
    { id: 'notifications', label: 'Уведомления', icon: icons.notifications },
    { id: 'storage', label: 'Локальное хранилище', icon: icons.storage },
    { id: 'modules', label: 'Модули платформы', icon: icons.modules },
    { id: 'system', label: 'Аудит и система', icon: icons.system },
  ];

  return (
    <div className="admin-settings-wrap" ref={ref}>
      <button
        type="button"
        className="admin-settings-btn topbar-btn"
        onClick={toggle}
        aria-label="Настройки администратора"
        aria-expanded={open}
        title="Настройки администратора"
      >
        <NavIconSettings size={18} />
      </button>
      {open && (
        <div className="admin-settings-dropdown">
          <div className="admin-settings-head">
            <div className="admin-settings-title">Администрирование</div>
            <div className="admin-settings-sub">Управление платформой Unique Operations</div>
          </div>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="admin-settings-item"
              onClick={() => {
                if (item.action) {
                  item.action();
                  if (item.id !== 'theme') setOpen(false);
                } else {
                  go(item.id);
                }
              }}
            >
              <span className="admin-settings-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'theme' && (
                <span className="admin-settings-badge">{theme === 'dark' ? 'Тёмная' : 'Светлая'}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function useIsAdminUser(role: import('../types/database').UserRole | undefined) {
  return isAdmin(role);
}
