import { useState, useEffect, useRef } from 'react';
import { db } from '../lib/localdb';
import { useAuth } from '../contexts/AuthContext';
import { NavIconBell } from './NavIcons';
import type { InternalAlert } from '../types/database';

interface AlertsPanelProps {
  variant?: 'pill' | 'icon';
}

export function AlertsPanel({ variant = 'pill' }: AlertsPanelProps) {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<InternalAlert[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data } = await db
      .from('internal_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    const rows = (data as InternalAlert[]) ?? [];
    setAlerts(rows.filter((a) => !a.target_role || a.target_role === profile?.role || profile?.role === 'super_admin' || profile?.role === 'studio_owner'));
  };

  useEffect(() => { load(); }, [profile?.role]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  const unread = alerts.filter((a) => !a.is_read).length;

  const markRead = async (id: string) => {
    await db.from('internal_alerts').update({ is_read: true }).eq('id', id);
    load();
  };

  const markAllRead = async () => {
    const ids = alerts.filter((a) => !a.is_read).map((a) => a.id);
    if (!ids.length) return;
    await Promise.all(ids.map((id) => db.from('internal_alerts').update({ is_read: true }).eq('id', id)));
    load();
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
    load();
  };

  return (
    <div className={`alerts-wrap alerts-wrap--${variant}`} ref={ref}>
      {variant === 'pill' ? (
        <button type="button" className="alerts-btn topbar-icon-btn" onClick={toggle} title="Оповещения" aria-label={`Оповещения${unread ? `: ${unread} новых` : ''}`} aria-expanded={open}>
          <NavIconBell size={18} />
          {unread > 0 && <span className="alerts-badge">{unread > 99 ? '99+' : unread}</span>}
        </button>
      ) : (
        <button
          type="button"
          className={`mobile-bottom-nav-item mobile-bottom-nav-item--alerts${open ? ' active' : ''}`}
          onClick={toggle}
          aria-label="Оповещения"
          aria-expanded={open}
        >
          <span className="mobile-bottom-nav-icon-hit"><NavIconBell size={22} /></span>
          {unread > 0 && (
            <span className="mobile-bottom-nav-badge">{unread > 99 ? '99+' : unread}</span>
          )}
        </button>
      )}
      {open && (
        <div className={`alerts-menu open${variant === 'icon' ? ' alerts-menu--mobile-floating' : ''}`}>
          <div className="alerts-menu-head">
            <span>Внутренние оповещения</span>
            {unread > 0 && <button className="alerts-mark-all" onClick={markAllRead}>Прочитать все</button>}
          </div>
          {alerts.length ? alerts.map((a) => (
            <div key={a.id} className={`alerts-item ${a.is_read ? 'read' : ''}`} onClick={() => markRead(a.id)}>
              <div className="alerts-item-type">{a.type}</div>
              <div className="alerts-item-title">{a.title}</div>
              <div className="alerts-item-body">{a.body}</div>
            </div>
          )) : <div className="alerts-empty">Нет оповещений</div>}
        </div>
      )}
    </div>
  );
}
