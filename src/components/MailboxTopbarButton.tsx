import { useState, useEffect, useRef, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccessView } from '../lib/permissions';
import { useModuleConfig } from '../contexts/ModuleConfigContext';
import { MailIcon } from './mailbox/MailIcons';
import {
  loadRecentMailboxPreview,
  loadUnreadMailboxCount,
  messagePreview,
  messageSubject,
  senderLabel,
  type MailboxMessage,
} from '../lib/mailbox';

function fmtShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

interface MailboxTopbarButtonProps {
  onOpenMailbox?: () => void;
  variant?: 'topbar' | 'bottom-nav';
}

export function MailboxTopbarButton({ onOpenMailbox, variant = 'topbar' }: MailboxTopbarButtonProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { isEnabled } = useModuleConfig();
  const role = profile?.role;
  const canSee = canAccessView(role, 'mailbox') && isEnabled('mailbox');

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [preview, setPreview] = useState<MailboxMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!canSee) return;
    try {
      const [count, recent] = await Promise.all([
        loadUnreadMailboxCount(),
        loadRecentMailboxPreview(5),
      ]);
      setUnread(count);
      setPreview(recent);
    } catch {
      setUnread(0);
      setPreview([]);
    }
  }, [canSee]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('click', handler), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', handler);
    };
  }, [open]);

  if (!canSee) return null;

  const isOnMailbox = location.pathname === '/mailbox' || location.pathname.startsWith('/mailbox/');
  const isBottomNav = variant === 'bottom-nav';

  const openMailbox = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setOpen(false);
    if (onOpenMailbox) {
      onOpenMailbox();
    } else {
      navigate('/mailbox');
    }
  };

  const toggle = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    // Desktop: on mailbox route, icon opens full workspace (no preview needed)
    if (isOnMailbox && !isBottomNav) {
      openMailbox(e);
      return;
    }
    setOpen(true);
    setLoading(true);
    refresh().finally(() => setLoading(false));
  };

  const openMessage = (e: ReactMouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    setOpen(false);
    navigate(`/mailbox?id=${encodeURIComponent(id)}`);
  };

  const menu = open && (
    <div className={`outlook-mail-topbar-menu open${isBottomNav ? ' outlook-mail-topbar-menu--mobile-floating' : ''}`}>
      <div className="outlook-mail-topbar-head">
        <span>Почта</span>
        {unread > 0 && <span className="outlook-mail-topbar-unread">{unread} непрочит.</span>}
      </div>
      {loading ? (
        <div className="outlook-mail-topbar-empty">Загрузка…</div>
      ) : preview.length ? (
        preview.map((msg) => (
          <button
            key={msg.id}
            type="button"
            className={`outlook-mail-topbar-item${!msg.read_at && msg.direction === 'inbound' ? ' unread' : ''}`}
            onClick={(e) => openMessage(e, msg.id)}
          >
            <div className="outlook-mail-topbar-item-top">
              <span className="outlook-mail-topbar-item-party">
                {msg.direction === 'inbound' ? senderLabel(msg) : msg.customers?.full_name || msg.recipient_email || '—'}
              </span>
              <span className="outlook-mail-topbar-item-date">{fmtShort(msg.sent_at)}</span>
            </div>
            <div className="outlook-mail-topbar-item-subject">{messageSubject(msg)}</div>
            <div className="outlook-mail-topbar-item-preview">{messagePreview(msg)}</div>
          </button>
        ))
      ) : (
        <div className="outlook-mail-topbar-empty">Нет писем</div>
      )}
      <button type="button" className="outlook-mail-topbar-open" onClick={openMailbox}>
        Открыть почту →
      </button>
    </div>
  );

  if (isBottomNav) {
    return (
      <div className="outlook-mail-topbar-wrap outlook-mail-topbar-wrap--bottom-nav" ref={ref}>
        <button
          type="button"
          className={`mobile-bottom-nav-item mobile-bottom-nav-item--mail${open ? ' active' : ''}${isOnMailbox ? ' active' : ''}`}
          onClick={toggle}
          aria-label="Почта"
          aria-expanded={open}
        >
          <span className="mobile-bottom-nav-icon-hit">
            <MailIcon name="envelope" size={22} />
          </span>
          {unread > 0 && (
            <span className="mobile-bottom-nav-badge">{unread > 99 ? '99+' : unread}</span>
          )}
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div className="outlook-mail-topbar-wrap" ref={ref}>
      <button
        type="button"
        className="topbar-settings-btn topbar-mail-btn outlook-mail-topbar-btn"
        onClick={toggle}
        title="Почта"
        aria-label="Почта"
        aria-expanded={open}
      >
        <MailIcon name="envelope" size={20} className="outlook-mail-topbar-svg" />
        {unread > 0 && (
          <span className="outlook-mail-topbar-badge">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>
      {menu}
    </div>
  );
}
