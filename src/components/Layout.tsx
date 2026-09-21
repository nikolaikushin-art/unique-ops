import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PanelLeft, ChevronDown, ClipboardList } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useModuleConfig } from '../contexts/ModuleConfigContext';
import { canAccessView, canManageCustomers, canManageBookings, isAdmin } from '../lib/permissions';
import { VIEW_TITLES, ROLE_LABELS } from '../lib/constants';
import { Logo } from './Logo';
import { GlobalSearch } from './GlobalSearch';
import { MailboxTopbarButton } from './MailboxTopbarButton';
import { AlertsPanel } from './AlertsPanel';
import { UserMenu } from './UserMenu';
import { AdminSettingsMenu } from './AdminSettingsMenu';
import { BackupReminder } from './BackupReminder';
import { BackupStatusPill } from './BackupStatusPill';
import { MobileBottomNav } from './MobileBottomNav';
import { resetAppScroll } from './ScrollToTop';
import { NavIconMoon, NavIconSettings, NavIconSun, NavIconLogout } from './NavIcons';
import { NAV_SECTION_ICONS } from './NavSectionIcons';
import type { ViewId } from '../types/database';

const MOBILE_DRAWER_MQ = '(max-width: 1023px)';
const DESKTOP_NAV_MQ = '(min-width: 1024px)';
const RAIL_KEY = 'uo.sidebar.rail';
const GROUPS_KEY = 'uo.sidebar.groups';

/** 'jobs' and 'bookings' are two views of the exact same records
 *  (see OperationsPage). When a role can see both, collapse them into
 *  one nav row instead of two near-identical entries. */
function mergeOpsNavItems(items: ViewId[]): (ViewId | 'jobs+bookings')[] {
  if (items.includes('jobs') && items.includes('bookings')) {
    const merged: (ViewId | 'jobs+bookings')[] = [];
    let inserted = false;
    for (const v of items) {
      if (v === 'jobs' || v === 'bookings') {
        if (!inserted) { merged.push('jobs+bookings'); inserted = true; }
      } else {
        merged.push(v);
      }
    }
    return merged;
  }
  return items;
}

const NAV_GROUPS: { label: string; items: ViewId[] }[] = [
  { label: 'Операции', items: ['overview', 'jobs', 'bookings', 'pipeline', 'inspection'] },
  { label: 'Клиенты и авто', items: ['vehicles', 'customers', 'leads'] },
  { label: 'Команда', items: ['staff', 'services'] },
  { label: 'Управление', items: ['finance', 'mailbox', 'inventory', 'documents', 'reports'] },
  { label: 'Система', items: ['settings'] },
];

interface LayoutProps {
  children: React.ReactNode;
  onQuickAction?: (type: string) => void;
}

export function Layout({ children, onQuickAction }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const { isEnabled } = useModuleConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('uo-theme') || 'light');
  const [qaOpen, setQaOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** Desktop rail: expanded (labels) vs. collapsed to an icon-only strip —
   *  the sidebar stays reachable instead of disappearing, iOS/macOS-rail style. */
  const [railOpen, setRailOpen] = useState(
    () => typeof window === 'undefined' || localStorage.getItem(RAIL_KEY) !== 'collapsed',
  );
  const [isMobileDrawer, setIsMobileDrawer] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_DRAWER_MQ).matches,
  );
  const [isDesktopNav, setIsDesktopNav] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_NAV_MQ).matches,
  );

  const currentView = (location.pathname.slice(1) || 'overview') as ViewId;
  const mobileSidebarInert = isMobileDrawer && !sidebarOpen;
  /** Labels only make sense when the rail has room: always on mobile (it's a
   *  full-width drawer there), tied to railOpen on desktop. */
  const showNavLabels = isMobileDrawer || railOpen;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(GROUPS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    const activeGroup = NAV_GROUPS.find((g) => g.items.includes(currentView))?.label;
    return activeGroup ? { [activeGroup]: true } : {};
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uo-theme', theme);
    const themeColor = theme === 'dark' ? '#0a0a0b' : '#f4f4f6';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  }, [theme]);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
    return () => document.body.classList.remove('sidebar-open');
  }, [sidebarOpen]);

  useEffect(() => {
    if (isMobileDrawer) {
      document.body.classList.add('mobile-bottom-nav-active');
    } else {
      document.body.classList.remove('mobile-bottom-nav-active');
    }
    return () => document.body.classList.remove('mobile-bottom-nav-active');
  }, [isMobileDrawer]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_DRAWER_MQ);
    const sync = () => setIsMobileDrawer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_NAV_MQ);
    const sync = () => setIsDesktopNav(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** Accordion: opening a group closes every other one, iOS Settings-style. */
  const toggleGroup = useCallback((label: string) => {
    setOpenGroups((prev) => {
      const next = prev[label] ? {} : { [label]: true };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  /** Keep the active page's group expanded when navigation changes from
   *  elsewhere (quick actions, global search) — an accordion should never
   *  hide the page you're actually on. */
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((g) => g.items.includes(currentView))?.label;
    if (!activeGroup) return;
    setOpenGroups((prev) => (prev[activeGroup] ? prev : { [activeGroup]: true }));
  }, [currentView]);

  const toggleRail = useCallback(() => {
    setRailOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(RAIL_KEY, next ? 'open' : 'collapsed');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!qaOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.qa-wrap')) setQaOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', close);
    };
  }, [qaOpen]);

  const goto = (view: ViewId) => {
    // Only reset scroll / re-navigate when actually changing pages. Clicking
    // the sidebar (accordion groups, the already-active item, the logo while
    // already on Overview, etc.) was unconditionally snapping every open
    // list/detail panel back to the top even when the route never changed —
    // this is what caused the "pressing the left panel scrolls everything up"
    // complaint.
    if (view !== currentView) {
      resetAppScroll();
      navigate('/' + view);
    }
    setSidebarOpen(false);
    setUserMenuOpen(false);
  };

  const role = profile?.role;

  const canSeeView = (view: ViewId) => canAccessView(role, view) && isEnabled(view);

  const footerInitials = (profile?.full_name || profile?.email || 'U')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className={`app-shell app-layout${sidebarOpen ? ' sidebar-drawer-open' : ''}${!railOpen && isDesktopNav ? ' sidebar-collapsed' : ''}`}
    >
      <div
        className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden={!sidebarOpen}
        role="presentation"
      />

      <aside
        className={`sidebar${sidebarOpen ? ' open' : ''}${!showNavLabels ? ' sidebar--rail' : ''}`}
        aria-hidden={mobileSidebarInert || undefined}
        {...(mobileSidebarInert ? { inert: true as const } : {})}
      >
        <div className="sidebar-scroll">
          <div className="sidebar-head">
            <button
              type="button"
              className="brand brand-link"
              onClick={() => goto('overview')}
              title="На главную"
              aria-label="Unique Detailing — на главную"
            >
              {showNavLabels ? (
                <Logo height={30} className="sidebar-logo" />
              ) : (
                <img src="/assets/unique-mark.png" alt="" className="sidebar-mark" width={34} height={34} />
              )}
            </button>
            {!isMobileDrawer && (
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={toggleRail}
                title={railOpen ? 'Свернуть навигацию' : 'Развернуть навигацию'}
                aria-label={railOpen ? 'Свернуть навигацию' : 'Развернуть навигацию'}
                aria-pressed={!railOpen}
              >
                <PanelLeft size={16} strokeWidth={1.75} />
              </button>
            )}
          </div>

          <nav aria-label="Основная навигация" className="nav-groups">
            {NAV_GROUPS.map((group) => {
              const visible = group.items.filter((v) => canSeeView(v));
              if (!visible.length) return null;
              const isOpen = openGroups[group.label] === true;
              return (
                <div className="nav-group" key={group.label}>
                  {showNavLabels ? (
                    <button
                      type="button"
                      className="nav-label"
                      onClick={() => toggleGroup(group.label)}
                      aria-expanded={isOpen}
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        size={13}
                        strokeWidth={2}
                        className={`nav-label-chevron${isOpen ? '' : ' is-collapsed'}`}
                      />
                    </button>
                  ) : null}
                  <div className={`nav-group-items${isOpen || !showNavLabels ? ' is-open' : ''}`}>
                    <div className="nav-group-items-inner">
                      {mergeOpsNavItems(visible).map((view) => {
                        const Icon = view === 'jobs+bookings' ? ClipboardList : NAV_SECTION_ICONS[view];
                        const active = view === 'jobs+bookings'
                          ? currentView === 'jobs' || currentView === 'bookings'
                          : currentView === view;
                        const label = view === 'jobs+bookings' ? 'Заказы и бронирования' : VIEW_TITLES[view as ViewId];
                        const target = view === 'jobs+bookings' ? 'bookings' : view;
                        return (
                          <div
                            key={view}
                            className={`nav-item${active ? ' active' : ''}`}
                            onClick={() => goto(target as ViewId)}
                            title={!showNavLabels ? label : undefined}
                          >
                            <span className="nav-item-icon">
                              <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
                            </span>
                            {showNavLabels ? <span className="nav-item-label">{label}</span> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-footer-theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? <NavIconSun size={15} /> : <NavIconMoon size={15} />}
            {showNavLabels ? <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span> : null}
          </button>
          <div className="sidebar-footer-user">
            <span className="sidebar-footer-avatar">{footerInitials}</span>
            {showNavLabels ? (
              <>
                <div className="sidebar-footer-id">
                  <div className="sidebar-footer-name">{profile?.full_name || profile?.email || 'Сотрудник'}</div>
                  <div className="sidebar-footer-role">{ROLE_LABELS[role ?? 'reception']}</div>
                </div>
                <button
                  type="button"
                  className="sidebar-footer-logout"
                  onClick={async () => {
                    await signOut();
                    navigate('/login', { replace: true });
                  }}
                  title="Выйти из системы"
                  aria-label="Выйти из системы"
                >
                  <NavIconLogout size={15} />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </aside>

      <main className={`main main-area${currentView === 'mailbox' ? ' mailbox-body main--mailbox' : ''}${isMobileDrawer ? ' has-mobile-bottom-nav' : ''}`}>
        <div
          className={`topbar${currentView === 'mailbox' ? ' topbar--mailbox' : ''}${isMobileDrawer ? ' topbar--mobile-minimal' : ''}`}
        >
          {!isMobileDrawer && !railOpen && (
            <button
              type="button"
              className="topbar-nav-toggle"
              onClick={toggleRail}
              title="Развернуть навигацию"
              aria-label="Развернуть навигацию"
            >
              <PanelLeft size={18} strokeWidth={1.75} />
            </button>
          )}

          {isMobileDrawer && (
            <button
              type="button"
              className="topbar-mobile-logo topbar-mobile-logo-btn"
              onClick={() => goto('overview')}
              title="На главную"
              aria-label="Unique Detailing — на главную"
            >
              <Logo height={28} className="topbar-logo-mark" />
            </button>
          )}

          <div className={`topbar-tools-row${isMobileDrawer ? ' topbar-tools-row--search-only' : ''}`}>
            <GlobalSearch />
          </div>

          {!isMobileDrawer && (
            <div className="topbar-right">
              <div className="topbar-extras">
                <MailboxTopbarButton onOpenMailbox={() => goto('mailbox')} />
                <AlertsPanel />
                {canSeeView('settings') && currentView !== 'settings' && !isAdmin(role) && (
                  <button type="button" className="topbar-settings-btn topbar-btn" onClick={() => goto('settings')} title="Настройки">
                    <NavIconSettings size={18} />
                  </button>
                )}
                <BackupStatusPill />
                {isAdmin(role) && (
                  <AdminSettingsMenu theme={theme} onThemeChange={setTheme} />
                )}
              </div>
              {onQuickAction && (
                <div className="qa-wrap">
                  <div className="pill qa" onClick={(e) => { e.stopPropagation(); setQaOpen((v) => !v); }} title="Быстрое действие" aria-label="Быстрое действие">
                    <span className="qa-icon" aria-hidden>+</span>
                    <span className="qa-label">Быстрое действие</span>
                  </div>
                  <div className={`qa-menu ${qaOpen ? 'open' : ''}`}>
                    {([
                      ['customer', 'Новый клиент', () => canManageCustomers(role)],
                      ['vehicle', 'Новый автомобиль', () => canAccessView(role, 'vehicles')],
                      ['booking', 'Новый заказ', () => canManageBookings(role)],
                      ['service', 'Новая услуга', () => isAdmin(role)],
                    ] as const)
                      .filter(([, , check]) => check())
                      .map(([t, label]) => (
                        <div key={t} className="qa-menu-item" onClick={() => { onQuickAction(t); setQaOpen(false); }}>
                          + {label}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <UserMenu theme={theme} onThemeChange={setTheme} />
            </div>
          )}
        </div>

        <div className={`content${currentView === 'mailbox' ? ' content--mailbox-workspace' : ''}`}>
          <BackupReminder />
          {currentView === 'mailbox' ? children : <div className="app-page">{children}</div>}
        </div>
      </main>

      {isMobileDrawer && (
        <>
          <MobileBottomNav
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onOpenMailbox={() => goto('mailbox')}
            onQuickAction={onQuickAction}
            onProfileOpen={() => setUserMenuOpen((v) => !v)}
            profileOpen={userMenuOpen}
          />
          <UserMenu
            hideTrigger
            open={userMenuOpen}
            onOpenChange={setUserMenuOpen}
            theme={theme}
            onThemeChange={setTheme}
            showThemeToggle
          />
        </>
      )}
    </div>
  );
}
