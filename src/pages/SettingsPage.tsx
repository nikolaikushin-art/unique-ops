import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronRight,
  ChevronLeft,
  Search,
  UserRound,
  Users,
  KeyRound,
  LayoutGrid,
  SlidersHorizontal,
  Bell,
  Database,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin } from '../lib/permissions';
import { isLocalDbReady } from '../lib/localdb';
import { AccountPanel } from '../components/AccountPanel';
import { NavIconSettings } from '../components/NavIcons';
import { SettingsProfileBar } from '../components/SettingsProfileBar';
import { ElevatedGate } from '../components/ElevatedGate';
import { UsersPanel } from '../components/UsersPanel';
import { ModulesPanel } from '../components/ModulesPanel';
import { AuditLogPanel } from '../components/AuditLogPanel';
import { RolesPanel } from '../components/RolesPanel';
import { PreferencesPanel } from '../components/PreferencesPanel';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { StoragePanel } from '../components/StoragePanel';
import { CompanyPanel } from '../components/CompanyPanel';
import { ConsentsPanel } from '../components/ConsentsPanel';
import { resetAppScroll } from '../components/ScrollToTop';

type SettingsTab = 'account' | 'users' | 'roles' | 'preferences' | 'notifications' | 'storage' | 'modules' | 'system';

const TAB_IDS: SettingsTab[] = ['account', 'users', 'roles', 'preferences', 'notifications', 'storage', 'modules', 'system'];

/** Row icon colour — same idea as iOS Settings: every row gets a distinct,
 *  consistently-coloured rounded glyph rather than a single brand tint. */
type RowColor = 'blue' | 'purple' | 'teal' | 'indigo' | 'gray' | 'red' | 'green' | 'orange';

interface SettingsRow {
  id: SettingsTab;
  label: string;
  sub: string;
  icon: LucideIcon;
  color: RowColor;
  adminOnly?: boolean;
}

interface SettingsGroup {
  title: string;
  items: SettingsRow[];
}

export function SettingsPage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const admin = isAdmin(profile?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as SettingsTab | null;
  const [tab, setTab] = useState<SettingsTab | null>(tabParam && TAB_IDS.includes(tabParam) ? tabParam : null);
  const [query, setQuery] = useState('');

  const selectTab = (id: SettingsTab | null) => {
    setTab(id);
    if (id) setSearchParams({ tab: id }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  useEffect(() => {
    if (tabParam && TAB_IDS.includes(tabParam)) setTab(tabParam);
    else if (!tabParam) setTab(null);
  }, [tabParam]);

  useEffect(() => {
    if (!admin && tab && tab !== 'account' && tab !== 'modules') {
      const adminTabs: SettingsTab[] = ['users', 'roles', 'preferences', 'notifications', 'storage', 'system'];
      if (adminTabs.includes(tab)) selectTab(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, tab]);

  const detailRef = useRef<HTMLDivElement>(null);
  const detailBodyRef = useRef<HTMLDivElement>(null);

  // Whenever a section is opened, start its content from the top. On phones the
  // list and the detail are separate screens sharing one page scroll, so the page
  // itself is reset too; on desktop only the detail column is, so the list keeps
  // its position.
  useLayoutEffect(() => {
    if (!tab) return;
    // Scroll to top before the browser paints the newly-selected section — doing
    // this in a plain effect (after paint) let the old tab's scroll position
    // flash for a frame, so the panel briefly showed the previous section's
    // content (e.g. "Управление доступом") cut off before jumping to the top.
    detailBodyRef.current?.scrollTo({ top: 0 });
    if (window.matchMedia('(max-width: 899px)').matches) resetAppScroll();
  }, [tab]);

  // The detail column is sized to exactly the room under the top bar, so the page
  // never has to scroll and the column can't slide underneath the bar. (It used to
  // be capped at "viewport minus bar" while the page added its own top/bottom
  // padding on top — the page scrolled by the difference and dragged the whole
  // section up under the header.) Re-measured on resize and whenever the bar or
  // the scroll area changes size.
  useEffect(() => {
    const measure = () => {
      const el = detailRef.current;
      if (!el) return;
      const bar = document.querySelector<HTMLElement>('.topbar');
      const barBottom = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
      // ≥1024px the page content scrolls inside its own container below the bar;
      // below that the whole window scrolls under a sticky bar.
      const insideScroller = window.matchMedia('(min-width: 1024px)').matches;
      const scroller = document.querySelector<HTMLElement>('.content');
      const cs = scroller ? getComputedStyle(scroller) : null;
      const padTop = cs ? parseFloat(cs.paddingTop) || 0 : 0;
      const padBottom = cs ? parseFloat(cs.paddingBottom) || 0 : 0;
      // Room left for the column once it is stuck: inside the scroller it pins at the
      // scroller's own top padding; in window-scroll mode it pins just under the bar.
      const room = insideScroller && scroller
        ? Math.floor(scroller.clientHeight - padTop - padBottom) - 1
        : Math.floor(window.innerHeight - (barBottom + 16) - padBottom) - 1;
      el.style.setProperty('--settings-stick-top', `${insideScroller ? 16 : barBottom + 16}px`);
      el.style.setProperty('--settings-stick-h', `${Math.max(320, room)}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    const barEl = document.querySelector('.topbar');
    const contentEl = document.querySelector('.content');
    if (ro) {
      if (barEl) ro.observe(barEl);
      if (contentEl) ro.observe(contentEl);
    }
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [tab]);

  const groups: SettingsGroup[] = [
    {
      title: 'Организация',
      items: [
        { id: 'account', label: 'Мой аккаунт', sub: 'Профиль, тема, безопасность', icon: UserRound, color: 'indigo' },
        { id: 'users', label: 'Пользователи', sub: 'Команда и доступ', icon: Users, color: 'blue', adminOnly: true },
        { id: 'roles', label: 'Роли и доступ', sub: 'Что доступно каждой роли', icon: KeyRound, color: 'purple', adminOnly: true },
        { id: 'modules', label: 'Модули', sub: 'Показать или скрыть разделы навигации', icon: LayoutGrid, color: 'teal' },
      ],
    },
    {
      title: 'Платформа',
      items: [
        { id: 'preferences', label: 'Система', sub: 'Студия, часовой пояс, валюта, язык', icon: SlidersHorizontal, color: 'gray', adminOnly: true },
        { id: 'notifications', label: 'Уведомления', sub: 'Email, остатки, напоминания, лиды', icon: Bell, color: 'red', adminOnly: true },
      ],
    },
    {
      title: 'Инфраструктура',
      items: [
        { id: 'storage', label: 'Локальное хранилище', sub: 'данные и файлы в браузере', icon: Database, color: 'green', adminOnly: true },
      ],
    },
    {
      title: 'Безопасность',
      items: [
        { id: 'system', label: 'Аудит и система', sub: 'Журнал событий, статус платформы', icon: ScrollText, color: 'orange' },
      ],
    },
  ];

  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || admin) }))
        .filter((g) => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [admin],
  );

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return visibleGroups;
    const q = query.trim().toLowerCase();
    return visibleGroups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [visibleGroups, query]);

  const activeItem = useMemo(
    () => groups.flatMap((g) => g.items).find((i) => i.id === tab) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab],
  );

  const drawerContent = (
    <>
      {tab === 'account' && (<><AccountPanel /><ConsentsPanel /></>)}

      {tab === 'users' && admin && (
        <ElevatedGate
          title="Доступ к управлению пользователями"
          description="Создание, изменение ролей и удаление пользователей требуют повторного ввода пароля."
        >
          <UsersPanel />
        </ElevatedGate>
      )}

      {tab === 'roles' && admin && <RolesPanel />}
      {tab === 'preferences' && admin && (<><PreferencesPanel /><CompanyPanel /></>)}
      {tab === 'notifications' && admin && <NotificationsPanel />}
      {tab === 'storage' && admin && <StoragePanel />}
      {tab === 'modules' && <ModulesPanel />}

      {tab === 'system' && (
        <>
          <div className="section-block" style={{ marginBottom: 32 }}>
            <div className="section-head">
              <div>
                <div className="section-eyebrow">Инфраструктура</div>
                <div className="section-title">Статус платформы</div>
              </div>
            </div>
            <div className="stat-grid settings-stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              <div className="stat-card">
                <div className="stat-label">База данных</div>
                <div className="stat-value" style={{ fontSize: 22 }}>{isLocalDbReady ? 'Локально' : 'Офлайн'}</div>
                <div className="stat-note">Данные в браузере</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Аутентификация</div>
                <div className="stat-value" style={{ fontSize: 22 }}>Активна</div>
                <div className="stat-note">Вход по email, без пароля</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Хранилище</div>
                <div className="stat-value" style={{ fontSize: 22 }}>Локально</div>
                <div className="stat-note">Файлы в IndexedDB</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Регион</div>
                <div className="stat-value" style={{ fontSize: 22 }}>Браузер</div>
                <div className="stat-note">без сервера</div>
              </div>
            </div>
          </div>
          {admin && <AuditLogPanel />}
        </>
      )}
    </>
  );

  const ActiveIcon = activeItem?.icon;

  return (
    <div className="settings-split">
      <div className={`settings-list-pane${tab ? ' has-detail' : ''}`}>
        <div className="settings-shell">
          <div className="header-row">
            <div>
              <div className="eyebrow"><span className="dot"></span><NavIconSettings size={14} /> Настройки</div>
              <h1 className="page-title">Настройки платформы</h1>
              <p className="page-sub">
                Управление аккаунтом, пользователями, ролями, хранилищем и параметрами системы.
                {admin && ' Полный доступ администратора.'}
              </p>
            </div>
          </div>

          <SettingsProfileBar />

          <div className="settings-search-wrap">
            <Search size={16} />
            <input
              className="settings-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по настройкам"
            />
          </div>

          {filteredGroups.length ? (
            filteredGroups.map((group) => (
              <div key={group.title} className="settings-list-group">
                <div className="settings-list-label">{group.title}</div>
                <div className="settings-list-card">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`settings-row${tab === item.id ? ' settings-row-active' : ''}`}
                        onClick={() => selectTab(item.id)}
                      >
                        <div className={`settings-row-icon c-${item.color}`}>
                          <Icon size={17} strokeWidth={2} />
                        </div>
                        <div className="settings-row-main">
                          <div className="settings-row-title">{item.label}</div>
                          <div className="settings-row-sub">{item.sub}</div>
                        </div>
                        <ChevronRight size={16} className="settings-row-chevron" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="settings-empty">Ничего не найдено по запросу «{query}»</div>
          )}

          <button
            type="button"
            className="settings-signout"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            Выйти из системы
          </button>
        </div>
      </div>

      <div ref={detailRef} className={`settings-detail-pane${tab ? ' open' : ''}`}>
        {tab ? (
          <>
            <div className="settings-detail-head">
              <button type="button" className="settings-detail-back" onClick={() => selectTab(null)}>
                <ChevronLeft size={18} strokeWidth={2.5} />
                <span>Настройки</span>
              </button>
            </div>
            <div className="settings-detail-title-row">
              {ActiveIcon && (
                <div className={`settings-row-icon c-${activeItem?.color ?? 'gray'}`} style={{ width: 40, height: 40, borderRadius: 12 }}>
                  <ActiveIcon size={20} strokeWidth={2} />
                </div>
              )}
              <h2 className="settings-detail-title">{activeItem?.label}</h2>
            </div>
            <div ref={detailBodyRef} className="settings-detail-body">{drawerContent}</div>
          </>
        ) : (
          <div className="settings-detail-empty">
            <SlidersHorizontal size={28} strokeWidth={1.5} />
            <p>Выберите раздел слева</p>
          </div>
        )}
      </div>
    </div>
  );
}
