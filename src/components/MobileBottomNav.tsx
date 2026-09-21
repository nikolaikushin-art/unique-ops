import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useModuleConfig } from '../contexts/ModuleConfigContext';
import {
  canAccessView,
  canManageCustomers,
  canManageBookings,
  isAdmin,
} from '../lib/permissions';
import { MailIcon } from './mailbox/MailIcons';
import { MailboxTopbarButton } from './MailboxTopbarButton';
import { NavIconMenu, NavIconPlus } from './NavIcons';
import { AlertsPanel } from './AlertsPanel';

interface MobileBottomNavProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenMailbox: () => void;
  onQuickAction?: (type: string) => void;
  onProfileOpen: () => void;
  profileOpen: boolean;
}

export function MobileBottomNav({
  sidebarOpen,
  onToggleSidebar,
  onOpenMailbox,
  onQuickAction,
  onProfileOpen,
  profileOpen,
}: MobileBottomNavProps) {
  const { profile } = useAuth();
  const { isEnabled } = useModuleConfig();
  const [qaOpen, setQaOpen] = useState(false);

  const role = profile?.role;
  const canSeeMailbox = canAccessView(role, 'mailbox') && isEnabled('mailbox');

  useEffect(() => {
    if (!qaOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.mobile-bottom-nav-qa') && !t.closest('.mobile-bottom-nav-item--qa')) {
        setQaOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [qaOpen]);

  const initials = (profile?.full_name || profile?.email || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const qaItems = ([
    ['customer', 'Новый клиент', () => canManageCustomers(role)],
    ['vehicle', 'Новый автомобиль', () => canAccessView(role, 'vehicles')],
    ['booking', 'Новый заказ', () => canManageBookings(role)],
    ['service', 'Новая услуга', () => isAdmin(role)],
  ] as const).filter(([, , check]) => check());

  const qaEnabled = Boolean(onQuickAction && qaItems.length > 0);

  return (
    <nav className="mobile-bottom-nav" aria-label="Мобильная навигация">
      <div className="mobile-bottom-nav-inner">
        <button
          type="button"
          className={`mobile-bottom-nav-item${sidebarOpen ? ' active' : ''}`}
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={sidebarOpen}
        >
          <span className="mobile-bottom-nav-icon-hit"><NavIconMenu size={22} /></span>
        </button>

        <div className="mobile-bottom-nav-qa">
          <button
            type="button"
            className={`mobile-bottom-nav-item mobile-bottom-nav-item--qa${qaOpen ? ' active' : ''}${!qaEnabled ? ' mobile-bottom-nav-item--disabled' : ''}`}
            onClick={() => qaEnabled && setQaOpen((v) => !v)}
            aria-label="Быстрое действие"
            aria-expanded={qaOpen}
            aria-disabled={!qaEnabled}
            disabled={!qaEnabled}
          >
            <span className="mobile-bottom-nav-icon-hit"><NavIconPlus size={22} /></span>
          </button>
          {qaOpen && qaEnabled && (
            <div className="qa-menu qa-menu--mobile-floating open">
              {qaItems.map(([t, label]) => (
                <div
                  key={t}
                  className="qa-menu-item"
                  onClick={() => {
                    onQuickAction?.(t);
                    setQaOpen(false);
                  }}
                >
                  + {label}
                </div>
              ))}
            </div>
          )}
        </div>

        {canSeeMailbox ? (
          <MailboxTopbarButton variant="bottom-nav" onOpenMailbox={onOpenMailbox} />
        ) : (
          <button
            type="button"
            className="mobile-bottom-nav-item mobile-bottom-nav-item--mail mobile-bottom-nav-item--disabled"
            aria-label="Почта"
            aria-disabled
            disabled
          >
            <span className="mobile-bottom-nav-icon-hit">
              <MailIcon name="envelope" size={22} />
            </span>
          </button>
        )}

        <AlertsPanel variant="icon" />

        <button
          type="button"
          className={`mobile-bottom-nav-item mobile-bottom-nav-item--profile${profileOpen ? ' active' : ''}`}
          onClick={onProfileOpen}
          aria-label="Профиль"
          aria-expanded={profileOpen}
        >
          <span className="mobile-bottom-nav-icon-hit">
            <span className="mobile-bottom-nav-avatar">{initials}</span>
          </span>
        </button>
      </div>
    </nav>
  );
}
