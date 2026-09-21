import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type Row } from '../lib/localdb';
import { vehicleDisplayName } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { useModuleConfig } from '../contexts/ModuleConfigContext';
import { canAccessView } from '../lib/permissions';
import type { ViewId } from '../types/database';

interface SearchResult {
  type: string;
  id: string;
  label: string;
  sub: string;
  route: string;
  view: ViewId;
}

const ROUTE_VIEW: Record<string, ViewId> = {
  '/customers': 'customers',
  '/vehicles': 'vehicles',
  '/staff': 'staff',
  '/leads': 'leads',
  '/jobs': 'jobs',
};

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { isEnabled } = useModuleConfig();
  const role = profile?.role;

  const allowResult = (r: SearchResult) => {
    const view = ROUTE_VIEW[r.route];
    if (!view) return false;
    return canAccessView(role, view) && isEnabled(view);
  };

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const term = q.trim().toLowerCase();
    const timer = setTimeout(async () => {
      const queries: PromiseLike<void>[] = [];
      const found: SearchResult[] = [];

      if (canAccessView(role, 'customers') && isEnabled('customers')) {
        queries.push(
          db.from('customers').select('id, full_name, phone').or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`).limit(5)
            .then(({ data }) => {
              (data ?? []).forEach((c: Row) => found.push({ type: 'Клиент', id: c.id, label: c.full_name, sub: c.phone ?? '', route: '/customers', view: 'customers' }));
            })
        );
      }
      if (canAccessView(role, 'vehicles') && isEnabled('vehicles')) {
        queries.push(
          db.from('vehicles').select('id, brand, model, registration_number, customers(full_name)').or(`brand.ilike.%${term}%,model.ilike.%${term}%,registration_number.ilike.%${term}%`).limit(5)
            .then(({ data }) => {
              (data ?? []).forEach((v: Row) => found.push({ type: 'Авто', id: v.id, label: vehicleDisplayName(v as { brand: string; model: string }), sub: `${v.registration_number ?? ''} · ${(v.customers as { full_name?: string })?.full_name ?? ''}`, route: '/vehicles', view: 'vehicles' }));
            })
        );
      }
      if (canAccessView(role, 'staff') && isEnabled('staff')) {
        queries.push(
          db.from('staff').select('id, full_name, role').ilike('full_name', `%${term}%`).limit(5)
            .then(({ data }) => {
              (data ?? []).forEach((s: Row) => found.push({ type: 'Сотрудник', id: s.id, label: s.full_name, sub: s.role, route: '/staff', view: 'staff' }));
            })
        );
      }
      if (canAccessView(role, 'leads') && isEnabled('leads')) {
        queries.push(
          db.from('leads').select('id, full_name, last_name, phone').or(`full_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%`).limit(5)
            .then(({ data }) => {
              (data ?? []).forEach((l: Row) => found.push({ type: 'Лид', id: l.id, label: [l.full_name, l.last_name].filter(Boolean).join(' '), sub: l.phone ?? '', route: '/leads', view: 'leads' }));
            })
        );
      }
      if (canAccessView(role, 'jobs') && isEnabled('jobs')) {
        queries.push(
          db.from('bookings').select('id, scheduled_at, customers(full_name)').limit(30)
            .then(({ data }) => {
              (data ?? []).filter((b: Row) => {
                const name = (b.customers as { full_name?: string })?.full_name?.toLowerCase() ?? '';
                return name.includes(term) || b.id.startsWith(term);
              }).slice(0, 5).forEach((b: Row) => found.push({
                type: 'Заказ',
                id: b.id,
                label: (b.customers as { full_name?: string })?.full_name ?? 'Заказ',
                sub: `#${b.id.slice(0, 8)} · ${new Date(b.scheduled_at).toLocaleString('ru-RU')}`,
                route: '/jobs',
                view: 'jobs',
              }));
            })
        );
      }

      await Promise.all(queries);
      setResults(found.filter(allowResult).slice(0, 12));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, role, isEnabled]);

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

  return (
    <div className="global-search" ref={ref}>
      <input
        className="search-input global-search-input"
        placeholder="Поиск: клиент, авто, заказ..."
        aria-label="Поиск: клиент, авто, заказ"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && q && results.length > 0 && (
        <div className="global-search-results">
          {results.map((r) => (
            <div key={`${r.type}-${r.id}`} className="global-search-item" role="button" tabIndex={0} onClick={() => { navigate(`${r.route}?highlight=${r.id}`); setOpen(false); setQ(''); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`${r.route}?highlight=${r.id}`); setOpen(false); setQ(''); } }}>
              <span className="global-search-type">{r.type}</span>
              <span className="global-search-label">{r.label}</span>
              <span className="global-search-sub">{r.sub}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
