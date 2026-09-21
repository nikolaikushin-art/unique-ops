import { useState, useEffect, useMemo } from 'react';
import { List, LayoutGrid } from 'lucide-react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { CustomersDashboard } from '../components/dashboard/PageDashboards';
import { SideDrawer } from '../components/SideDrawer';
import { useLocalQuery } from '../hooks/useLocalData';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { canManageCustomers, isAdmin } from '../lib/permissions';
import { db } from '../lib/localdb';
import { fmt, fmtDate, vehicleDisplayName, COMM_CHANNEL_LABELS, COMM_DIRECTION_LABELS, JOB_STATUS_LABELS } from '../lib/constants';
import { EMAIL_STATUS_LABELS, EMAIL_TYPE_LABELS, messagePreview, messageSubject } from '../lib/mailbox';
import { EmailComposePanel } from '../components/EmailComposePanel';
import { VehicleMediaHistory } from '../components/VehicleMediaHistory';
import { ClientDocumentsPanel } from '../components/ClientDocumentsPanel';
import { AssetManager } from '../components/AssetManager';
import { FILE_CATEGORIES } from '../lib/r2Storage';
import { ClientMessageModal, type MessageTarget } from '../components/ClientMessageModal';
import type { Booking, Customer, Vehicle, Communication } from '../types/database';
import { useRevealDetail } from '../hooks/useRevealDetail';

type CustomerTab = 'profile' | 'vehicles' | 'communications' | 'documents' | 'history';

const SIDE_TABS: { id: CustomerTab; label: string }[] = [
  { id: 'profile', label: 'Профиль' },
  { id: 'vehicles', label: 'Авто' },
  { id: 'communications', label: 'Коммуникации' },
  { id: 'documents', label: 'Документы' },
  { id: 'history', label: 'История' },
];

const STATUS_COLUMNS: { id: string; label: string }[] = [
  { id: 'vip', label: 'VIP' },
  { id: 'active', label: 'Активен' },
  { id: 'sleeping', label: 'Спящий' },
];

export function CustomersPage({ onEdit }: { onEdit: (c: Customer | null) => void }) {
  const { data: customers, remove } = useLocalQuery<Customer>('customers', '*', { orderBy: 'full_name', ascending: true });
  const { data: vehicles } = useLocalQuery<Vehicle>('vehicles', '*, customers(*)');
  const { data: bookings } = useLocalQuery<Booking>('bookings', '*, services(*)', { orderBy: 'scheduled_at' });
  const { toast } = useToast();
  const { profile } = useAuth();
  const canManage = canManageCustomers(profile?.role);
  const canDelete = isAdmin(profile?.role);
  const [search, setSearch] = useState('');
  const [showStats, toggleStats] = useAnalyticsVisibility('customers');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useRevealDetail(selectedId);
  const [comms, setComms] = useState<Communication[]>([]);
  const [commForm, setCommForm] = useState({ channel: 'phone' as Communication['channel'], direction: 'outbound' as Communication['direction'], content: '' });
  const [sideTab, setSideTab] = useState<CustomerTab>('profile');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedCommId, setExpandedCommId] = useState<string | null>(null);
  const [msgTarget, setMsgTarget] = useState<MessageTarget | null>(null);

  const loadComms = (customerId: string) => {
    db.from('communications').select('*').eq('customer_id', customerId).order('sent_at', { ascending: false }).limit(20)
      .then(({ data }) => setComms((data as Communication[]) ?? []));
  };

  const filtered = useMemo(() => customers.filter((c) => {
    const q = search.toLowerCase();
    if (q && !`${c.full_name}${c.phone}${c.email}`.toLowerCase().includes(q)) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  }), [customers, search, statusFilter]);

  const selected = filtered.find((c) => c.id === selectedId);
  const activeCustomerId = selected?.id ?? null;

  useEffect(() => {
    if (activeCustomerId) {
      loadComms(activeCustomerId);
      setSideTab('profile');
    } else setComms([]);
  }, [activeCustomerId]);

  const addComm = async () => {
    if (!selected || !commForm.content.trim()) return;
    const { error } = await db.from('communications').insert({
      customer_id: selected.id,
      channel: commForm.channel,
      direction: commForm.direction,
      content: commForm.content.trim(),
      created_by: profile?.id ?? null,
    });
    if (error) { toast('Ошибка: ' + error.message); return; }
    toast('Запись добавлена');
    setCommForm((f) => ({ ...f, content: '' }));
    loadComms(selected.id);
  };

  const customerVehicles = useMemo(
    () => (selected ? vehicles.filter((v) => v.customer_id === selected.id) : []),
    [vehicles, selected],
  );
  const customerBookings = useMemo(
    () => (selected ? bookings.filter((b) => b.customer_id === selected.id) : []),
    [bookings, selected],
  );

  const statusBadge = (s: string) => {
    if (s === 'vip') return <span className="status-badge vip">VIP</span>;
    if (s === 'active') return <span className="status-badge done">Активен</span>;
    return <span className="status-badge planned">Спящий</span>;
  };

  const exportCSV = () => {
    const rows = [['Имя', 'Телефон', 'Email', 'Визитов', 'Оборот', 'Статус'],
      ...filtered.map((c) => [c.full_name, c.phone, c.email, c.visit_count, c.lifetime_value, c.status])];
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'clients.csv';
    a.click();
    toast('Файл выгружен');
  };

  return (
    <>
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>CRM · клиентская база</div>
          <h1 className="page-title">Управление клиентами</h1>
          <p className="page-sub">Картотека клиентов: история визитов, автомобили, оборот и статус.</p>
        </div>
        <div className="tag-row">
          <AnalyticsToggle visible={showStats} onToggle={toggleStats} />
          {canManage && <div className="tag add" onClick={() => onEdit(null)}>+ Новый клиент</div>}
        </div>
      </div>

      {showStats && <CustomersDashboard customers={customers} />}

      <div className="table-toolbar">
        <input className="search-input" placeholder="Поиск по имени, телефону или email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="field-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="vip">VIP</option>
          <option value="active">Активен</option>
          <option value="sleeping">Спящий</option>
        </select>
        <div className="tag ghost" onClick={exportCSV}>Экспорт CSV</div>
      </div>
      <div className="seg" style={{ marginTop: 12 }} role="tablist" aria-label="Режим отображения">
        <div className={`seg-btn${view === 'list' ? ' active' : ''}`} role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}><List size={14} strokeWidth={1.75} />Список</div>
        <div className={`seg-btn${view === 'board' ? ' active' : ''}`} role="tab" aria-selected={view === 'board'} onClick={() => setView('board')}><LayoutGrid size={14} strokeWidth={1.75} />Канбан</div>
      </div>
      <br />

      <div className="table-wrap responsive-table-layout customers-layout">
        <div className="table-main">
          {view === 'list' ? (
          <>
          <div className="table-scroll">
          <table className="data-table customers-table">
            <thead><tr><th>Клиент</th><th>Визитов</th><th>Оборот</th><th>Последний визит</th><th>Статус</th></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className={selected?.id === c.id ? 'selected' : ''} onClick={() => setSelectedId(c.id)}>
                  <td className="col-client"><div className="cell-title">{c.full_name}</div><div className="cell-sub">{c.phone}</div></td>
                  <td className="col-num">{c.visit_count}</td>
                  <td className="col-money">{fmt(Number(c.lifetime_value))}</td>
                  <td className="col-date">{fmtDate(c.last_visit_at)}</td>
                  <td className="col-status">{statusBadge(c.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="list-card mobile-data-list customers-mobile-list">
            {filtered.map((c) => (
              <div
                key={c.id}
                className={`list-row customer-mobile-card ${selected?.id === c.id ? 'row-selected' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className={`list-row-icon tone-${c.status === 'vip' ? 'brand' : c.status === 'active' ? 'success' : 'gray'}`}>
                  {c.full_name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="list-row-main">
                  <div className="list-row-title">{c.full_name}</div>
                  <div className="list-row-sub">{c.phone} · {c.visit_count} визитов · {fmt(Number(c.lifetime_value))}</div>
                </div>
                <div className="activity-row-trailing">
                  {statusBadge(c.status)}
                  <span className="list-row-chevron">›</span>
                </div>
              </div>
            ))}
            {!filtered.length && <div className="empty-state">Клиенты не найдены</div>}
          </div>
          </>
          ) : (
          <div className="kanban-board">
            {STATUS_COLUMNS.map((col) => {
              const items = filtered.filter((c) => c.status === col.id);
              return (
                <div className="kanban-col" key={col.id}>
                  <div className="kanban-col-head"><span className="kanban-col-title">{col.label}</span><span className="kanban-count">{items.length}</span></div>
                  <div className="kanban-col-body">
                    {items.map((c) => (
                      <div key={c.id} className={`kanban-card ${selected?.id === c.id ? 'is-active' : ''}`} onClick={() => setSelectedId(c.id)}>
                        <div className="kanban-card-title">{c.full_name}</div>
                        <div className="kanban-card-sub">{c.phone} · {c.visit_count} визитов</div>
                        <div className="kanban-card-sub">{fmt(Number(c.lifetime_value))}</div>
                      </div>
                    ))}
                    {!items.length && <div className="kanban-empty">Пусто</div>}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
        {selected && (
          <SideDrawer className="mobile-detail-panel" onClose={() => setSelectedId(null)}>
            <div className="side-panel-head">
              <div className="side-eyebrow">Клиент</div>
              <div className="side-title">{selected.full_name}</div>

              <div className="filter-row" style={{ padding: 0, margin: '12px 0 0', flexWrap: 'wrap' }}>
                {SIDE_TABS.map((t) => (
                  <div key={t.id} className={`filter-pill ${sideTab === t.id ? 'active' : ''}`} onClick={() => setSideTab(t.id)}>{t.label}</div>
                ))}
              </div>
            </div>

            <div className="side-panel-body">
            {sideTab === 'profile' && (
              <>
                <div className="side-grid">
                  <div><div className="side-field-label">Телефон</div><div className="side-field-value">{selected.phone}</div></div>
                  <div><div className="side-field-label">Email</div><div className="side-field-value" style={{ fontSize: 12.5 }}>{selected.email}</div></div>
                  <div><div className="side-field-label">Визитов</div><div className="side-field-value big">{selected.visit_count}</div></div>
                  <div><div className="side-field-label">Оборот</div><div className="side-field-value big">{fmt(Number(selected.lifetime_value))}</div></div>
                </div>
                {(selected.source || selected.preferred_channel || selected.birthday || selected.referred_by || (selected.tags ?? []).length > 0) && (
                  <div className="side-grid" style={{ marginTop: 8 }}>
                    {selected.source && <div><div className="side-field-label">Источник</div><div className="side-field-value">{selected.source}</div></div>}
                    {selected.preferred_channel && <div><div className="side-field-label">Связь</div><div className="side-field-value">{COMM_CHANNEL_LABELS[selected.preferred_channel] ?? selected.preferred_channel}</div></div>}
                    {selected.birthday && <div><div className="side-field-label">День рождения</div><div className="side-field-value">{fmtDate(selected.birthday)}</div></div>}
                    {selected.referred_by && <div><div className="side-field-label">Рекомендовал</div><div className="side-field-value">{selected.referred_by}</div></div>}
                    {(selected.tags ?? []).length > 0 && <div style={{ gridColumn: '1 / -1' }}><div className="side-field-label">Теги</div><div className="side-field-value">{(selected.tags ?? []).join(' · ')}</div></div>}
                  </div>
                )}
                {canManage && (
                  <div className="tag add" style={{ display: 'inline-flex', cursor: 'pointer', margin: '10px 0' }} onClick={() => setMsgTarget({ customerId: selected.id, template: 'free' })}>Написать в WhatsApp / Telegram</div>
                )}
                {selected.address && <div><div className="side-field-label">Адрес</div><div className="side-field-value">{selected.address}</div></div>}
                {selected.notes && <div style={{ marginTop: 12 }}><div className="side-field-label">Заметки</div><div className="side-field-value" style={{ color: 'var(--muted)', fontSize: 13 }}>{selected.notes}</div></div>}
                <div style={{ marginTop: 12 }}>{statusBadge(selected.status)}</div>
              </>
            )}

            {sideTab === 'vehicles' && (
              <>
                {customerVehicles.length > 0 ? customerVehicles.map((v) => (
                  <div key={v.id} className="integration-card" style={{ marginBottom: 8 }}>
                    <div>
                      <div className="integration-name">{vehicleDisplayName(v)}</div>
                      <div className="integration-desc">{v.registration_number || '—'} · {v.color || '—'}</div>
                    </div>
                  </div>
                )) : <div className="empty-state">Автомобилей нет</div>}
                {customerVehicles.length > 0 && (
                  <VehicleMediaHistory vehicles={customerVehicles} bookings={customerBookings} />
                )}
              </>
            )}

            {sideTab === 'communications' && (
              <>
                {comms.map((c) => {
                  const isEmail = c.channel === 'email';
                  const open = expandedCommId === c.id;
                  return (
                    <div
                      key={c.id}
                      className={`customer-comm-item${isEmail ? ' customer-comm-item--email' : ''}${open ? ' open' : ''}`}
                      onClick={() => isEmail && setExpandedCommId(open ? null : c.id)}
                      style={{ cursor: isEmail ? 'pointer' : 'default' }}
                    >
                      <div style={{ color: 'var(--muted-2)', fontSize: 10, marginBottom: 4, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>{COMM_CHANNEL_LABELS[c.channel]} · {COMM_DIRECTION_LABELS[c.direction]} · {new Date(c.sent_at).toLocaleString('ru-RU')}</span>
                        {isEmail && c.message_type && <span className="mailbox-type-badge">{EMAIL_TYPE_LABELS[c.message_type]}</span>}
                        {isEmail && c.email_status && <span className={`status-badge ${c.email_status === 'sent' ? 'done' : 'planned'}`}>{EMAIL_STATUS_LABELS[c.email_status]}</span>}
                      </div>
                      {isEmail ? (
                        <>
                          <div className="customer-comm-subject">{messageSubject(c)}</div>
                          {c.recipient_email && <div className="cell-sub" style={{ marginBottom: 4 }}>→ {c.recipient_email}</div>}
                          <div style={{ color: 'var(--text)', lineHeight: 1.4, fontSize: 12 }}>{messagePreview(c)}</div>
                          {open && (
                            <pre className="mailbox-body-text" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                              {c.body_text || c.content}
                            </pre>
                          )}
                        </>
                      ) : (
                        <div style={{ color: 'var(--text)', lineHeight: 1.4 }}>{c.content}</div>
                      )}
                    </div>
                  );
                })}
                {!comms.length && <div className="empty-state" style={{ padding: '12px 0' }}>История пуста</div>}
                {canManage && selected.email && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                    <EmailComposePanel customers={[selected]} defaultCustomerId={selected.id} compact onSent={() => loadComms(selected.id)} />
                  </div>
                )}
                {canManage && (
                  <div style={{ marginTop: 12 }}>
                    <div className="side-field-label" style={{ marginBottom: 8 }}>Запись звонка / сообщения</div>
                    <div className="field-row2" style={{ marginBottom: 8 }}>
                      <select className="field-select" value={commForm.channel} onChange={(e) => setCommForm((f) => ({ ...f, channel: e.target.value as Communication['channel'] }))}>
                        {Object.entries(COMM_CHANNEL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      <select className="field-select" value={commForm.direction} onChange={(e) => setCommForm((f) => ({ ...f, direction: e.target.value as Communication['direction'] }))}>
                        {Object.entries(COMM_DIRECTION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </div>
                    <textarea className="field-input" rows={2} placeholder="Текст звонка, сообщения..." value={commForm.content} onChange={(e) => setCommForm((f) => ({ ...f, content: e.target.value }))} style={{ marginBottom: 8, resize: 'vertical' }} />
                    <div className="tag add" style={{ display: 'inline-flex', cursor: 'pointer' }} onClick={addComm}>+ Добавить запись</div>
                  </div>
                )}
              </>
            )}

            {sideTab === 'documents' && (
              <>
                <AssetManager
                  entityType="customer"
                  entityId={selected.id}
                  categories={FILE_CATEGORIES.customer.map((c) => ({ ...c }))}
                  compact
                  title="Документы клиента (R2)"
                />
                <ClientDocumentsPanel customer={selected} onSent={() => loadComms(selected.id)} />
              </>
            )}

            {sideTab === 'history' && (
              <>
                {customerBookings.map((b) => (
                  <div key={b.id} className="integration-card" style={{ marginBottom: 8 }}>
                    <div>
                      <div className="integration-name">{b.services?.name || '—'}</div>
                      <div className="integration-desc">{fmtDate(b.scheduled_at)} · {JOB_STATUS_LABELS[b.status] || b.status}</div>
                    </div>
                  </div>
                ))}
                {!customerBookings.length && <div className="empty-state">История пуста</div>}
              </>
            )}
            </div>

            {canManage && (
              <div className="side-actions mobile-detail-actions">
                <span className="side-action edit" onClick={() => onEdit(selected)}>Редактировать</span>
                {canDelete && (
                  <span className="side-action del" onClick={async () => {
                    const err = await remove(selected.id);
                    if (err) toast('Ошибка: ' + err);
                    else toast('Клиент удалён');
                  }}>Удалить</span>
                )}
              </div>
            )}
          </SideDrawer>
        )}
      </div>
      <ClientMessageModal target={msgTarget} onClose={() => setMsgTarget(null)} />
    </>
  );
}
