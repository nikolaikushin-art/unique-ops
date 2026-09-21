import { useEffect, useMemo, useState } from 'react';
import { List, LayoutGrid } from 'lucide-react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { VehiclesDashboard } from '../components/dashboard/PageDashboards';
import { SideDrawer } from '../components/SideDrawer';
import { useLocalQuery } from '../hooks/useLocalData';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { canManageCustomers, isAdmin } from '../lib/permissions';
import { PIPELINE_STAGES, WORKFLOW_STAGES, fmtDate, vehicleDisplayName, JOB_STATUS_LABELS } from '../lib/constants';
import { WORKFLOW_LABELS, APPROVAL_LABELS } from '../lib/inspection';
import { normalizePipelineStage } from '../lib/workflow';
import { AssetManager } from '../components/AssetManager';
import { FILE_CATEGORIES } from '../lib/r2Storage';
import type { Booking, Inspection, Vehicle } from '../types/database';
import { VehicleThumb, VehicleHero } from '../components/VehicleThumb';
import { useRevealDetail } from '../hooks/useRevealDetail';

type VehicleTab = 'overview' | 'history' | 'media' | 'inspections' | 'maintenance';

const TABS: { id: VehicleTab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'history', label: 'История услуг' },
  { id: 'media', label: 'Медиа' },
  { id: 'inspections', label: 'Осмотры' },
  { id: 'maintenance', label: 'Обслуживание' },
];

export function VehiclesPage({ onEdit }: { onEdit: (v: Vehicle | null) => void }) {
  const { data: vehicles, remove, update } = useLocalQuery<Vehicle>('vehicles', '*, customers(*)');
  const { data: bookings } = useLocalQuery<Booking>('bookings', '*, services(name, price)', { orderBy: 'scheduled_at' });
  const { data: inspections } = useLocalQuery<Inspection>('inspections', '*, staff:inspector_id(full_name)', { orderBy: 'created_at' });
  const { toast } = useToast();
  const { profile } = useAuth();
  const canManage = canManageCustomers(profile?.role);
  const canDelete = isAdmin(profile?.role);
  const [search, setSearch] = useState('');
  const [showStats, toggleStats] = useAnalyticsVisibility('vehicles');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [brandFilter, setBrandFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useRevealDetail(selectedId);
  const [sideTab, setSideTab] = useState<VehicleTab>('overview');

  const brands = useMemo(() => [...new Set(vehicles.map((v) => v.brand).filter(Boolean))].sort(), [vehicles]);
  const customers = useMemo(() => {
    const map = new Map<string, string>();
    vehicles.forEach((v) => { if (v.customers?.full_name) map.set(v.customer_id, v.customers.full_name); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [vehicles]);

  const filtered = vehicles.filter((v) => {
    const q = search.toLowerCase();
    if (q && !`${v.brand}${v.model}${v.registration_number}${v.customers?.full_name}`.toLowerCase().includes(q)) return false;
    if (brandFilter && v.brand !== brandFilter) return false;
    if (customerFilter && v.customer_id !== customerFilter) return false;
    if (stageFilter && normalizePipelineStage(v.pipeline_stage) !== stageFilter) return false;
    return true;
  });

  const selected = filtered.find((v) => v.id === selectedId);
  const vehicleBookings = selected ? bookings.filter((b) => b.vehicle_id === selected.id) : [];
  const vehicleInspections = selected ? inspections.filter((i) => i.vehicle_id === selected.id) : [];

  useEffect(() => {
    if (selected) setSideTab('overview');
  }, [selected?.id]);

  const onSelect = (v: Vehicle) => setSelectedId(v.id);

  const deleteVehicle = async (id: string) => {
    await remove(id);
    if (selectedId === id) setSelectedId(null);
    toast('Автомобиль удалён');
  };

  const exportCSV = () => {
    const rows = [['Марка', 'Модель', 'Номер', 'Цвет', 'Год', 'Клиент', 'Этап', 'ETA'],
      ...filtered.map((v) => [v.brand, v.model, v.registration_number, v.color, v.year, v.customers?.full_name, normalizePipelineStage(v.pipeline_stage), v.eta_at])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vehicles.csv';
    a.click();
    toast('Файл выгружен');
  };

  const stage = selected ? normalizePipelineStage(selected.pipeline_stage) : '';

  const changeStage = async (v: Vehicle, next: string) => {
    if (next === normalizePipelineStage(v.pipeline_stage)) return;
    const err = await update(v.id, { pipeline_stage: next } as Partial<Vehicle>);
    if (err) toast('Ошибка: ' + err);
    else toast(`Этап: ${next}`);
  };

  return (
    <>
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>Автопарк · отслеживание</div>
          <h1 className="page-title">Автомобили в системе</h1>
          <p className="page-sub">Полный жизненный цикл: этап, история работ, осмотры, медиа R2.</p>
        </div>
        <div className="tag-row">
          <AnalyticsToggle visible={showStats} onToggle={toggleStats} />
          {canManage && <div className="tag add" onClick={() => onEdit(null)}>+ Новый автомобиль</div>}
        </div>
      </div>

      {showStats && <VehiclesDashboard vehicles={vehicles} />}

      <div className="table-toolbar">
        <input className="search-input" placeholder="Поиск: номер, марка, клиент" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="field-select" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
          <option value="">Все марки</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="field-select" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
          <option value="">Все клиенты</option>
          {customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className="field-select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">Все этапы</option>
          {WORKFLOW_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="tag ghost" onClick={exportCSV}>Экспорт CSV</div>
      </div>
      <div className="seg" style={{ marginTop: 12 }} role="tablist" aria-label="Режим отображения">
        <div className={`seg-btn${view === 'list' ? ' active' : ''}`} role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}><List size={14} strokeWidth={1.75} />Список</div>
        <div className={`seg-btn${view === 'board' ? ' active' : ''}`} role="tab" aria-selected={view === 'board'} onClick={() => setView('board')}><LayoutGrid size={14} strokeWidth={1.75} />Канбан</div>
      </div>
      <br />

      <div className="table-wrap responsive-table-layout vehicles-layout">
        <div className="table-main">
          {view === 'list' ? (
          <>
          <div className="table-scroll">
          <table className="data-table vehicles-table">
            <thead><tr><th className="col-vehicle">Авто</th><th className="col-num">Год</th><th className="col-client">Клиент</th><th className="col-date">Приёмка</th><th className="col-date">ETA</th><th className="col-status">Этап</th></tr></thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className={selected?.id === v.id ? 'selected' : ''} onClick={() => onSelect(v)}>
                  <td className="col-vehicle"><div className="with-thumb"><VehicleThumb brand={v.brand} vehicleId={v.id} size="md" /><div className="with-thumb-text"><div className="cell-title">{vehicleDisplayName(v)}</div><div className="cell-sub">{v.registration_number} · {v.color}</div></div></div></td>
                  <td className="col-num">{v.year}</td>
                  <td className="col-client">{v.customers?.full_name}</td>
                  <td className="col-date">{fmtDate(v.intake_at)}</td>
                  <td className="col-date">{fmtDate(v.eta_at)}</td>
                  <td className="col-status"><span className="tag blue" style={{ padding: '6px 12px', cursor: 'default' }}><span className="dot"></span>{normalizePipelineStage(v.pipeline_stage)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <div className="empty-state">Автомобили не найдены</div>}
          </div>
          <div className="list-card mobile-data-list">
            {filtered.map((v) => (
              <div key={v.id} className={`list-row ${selected?.id === v.id ? 'row-selected' : ''}`} onClick={() => onSelect(v)}>
                <VehicleThumb brand={v.brand} vehicleId={v.id} size="md" />
                <div className="list-row-main">
                  <div className="list-row-title">{vehicleDisplayName(v)}</div>
                  <div className="list-row-sub">{v.registration_number} · {v.customers?.full_name}</div>
                </div>
                <div className="activity-row-trailing">
                  <span className="tag blue">{normalizePipelineStage(v.pipeline_stage)}</span>
                  <span className="list-row-chevron">›</span>
                </div>
              </div>
            ))}
            {!filtered.length && <div className="empty-state">Автомобили не найдены</div>}
          </div>
          </>
          ) : (
          <div className="kanban-board">
            {WORKFLOW_STAGES.map((stage) => {
              const items = filtered.filter((v) => normalizePipelineStage(v.pipeline_stage) === stage);
              return (
                <div className="kanban-col" key={stage}>
                  <div className="kanban-col-head"><span className="kanban-col-title">{stage}</span><span className="kanban-count">{items.length}</span></div>
                  <div className="kanban-col-body">
                    {items.map((v) => (
                      <div key={v.id} className={`kanban-card ${selected?.id === v.id ? 'is-active' : ''}`} onClick={() => onSelect(v)}>
                        <div className="kanban-card-title">{vehicleDisplayName(v)}</div>
                        <div className="kanban-card-sub">{v.registration_number} · {v.customers?.full_name || 'без клиента'}</div>
                        {v.eta_at && <div className="kanban-card-sub">ETA {fmtDate(v.eta_at)}</div>}
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
              <VehicleHero vehicleId={selected.id} brand={selected.brand} model={selected.model} onChange={canManage ? () => setSideTab('media') : undefined} />
              <div className="side-eyebrow">{selected.registration_number}</div>
              <div className="side-title">{vehicleDisplayName(selected)}</div>

              <div className="filter-row tab-scroll" style={{ padding: 0, margin: '12px 0 0' }}>
                {TABS.map((t) => (
                  <div key={t.id} className={`filter-pill ${sideTab === t.id ? 'active' : ''}`} onClick={() => setSideTab(t.id)}>{t.label}</div>
                ))}
              </div>
            </div>

            <div className="side-panel-body">
            {sideTab === 'overview' && (
              <>
                <div className="side-grid">
                  <div><div className="side-field-label">VIN</div><div className="side-field-value" style={{ fontSize: 11 }}>{selected.vin || '—'}</div></div>
                  <div><div className="side-field-label">Клиент</div><div className="side-field-value">{selected.customers?.full_name}</div></div>
                  <div><div className="side-field-label">Приёмка</div><div className="side-field-value">{fmtDate(selected.intake_at)}</div></div>
                  <div><div className="side-field-label">ETA</div><div className="side-field-value">{fmtDate(selected.eta_at)}</div></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
                  <div className="side-field-label" style={{ marginTop: 0 }}>Этап в цехе</div>
                  {canManage && (
                    <select
                      className="field-select"
                      style={{ minHeight: 32, padding: '4px 10px', fontSize: 12.5 }}
                      value={stage}
                      onChange={(e) => changeStage(selected, e.target.value)}
                    >
                      {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
                <div className="v-timeline">
                  {PIPELINE_STAGES.map((s, i) => {
                    const curIdx = PIPELINE_STAGES.indexOf(stage as typeof PIPELINE_STAGES[number]);
                    const cls = i < curIdx ? 'done' : i === curIdx ? 'current' : '';
                    return (
                      <div
                        className={`v-tl-step ${cls}`}
                        key={s}
                        style={canManage ? { cursor: 'pointer' } : undefined}
                        onClick={canManage ? () => changeStage(selected, s) : undefined}
                        title={canManage ? `Отметить этап: ${s}` : undefined}
                      >
                        <span className="num">{i < curIdx ? '✓' : i + 1}</span>{s}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {sideTab === 'history' && (
              <div>
                <div className="side-field-label">История услуг ({vehicleBookings.length})</div>
                {vehicleBookings.length ? vehicleBookings.map((b) => (
                  <div key={b.id} className="integration-card" style={{ marginBottom: 8 }}>
                    <div>
                      <div className="integration-name">{b.services?.name || '—'}</div>
                      <div className="integration-desc">{fmtDate(b.scheduled_at)} · {JOB_STATUS_LABELS[b.status] || b.status}</div>
                    </div>
                  </div>
                )) : <div className="empty-state">История пуста</div>}
              </div>
            )}

            {sideTab === 'media' && (
              <AssetManager
                entityType="vehicle"
                entityId={selected.id}
                categories={FILE_CATEGORIES.vehicle.map((c) => ({ ...c }))}
                compact
                title="Фото и видео (R2)"
              />
            )}

            {sideTab === 'inspections' && (
              <div>
                <div className="side-field-label">Осмотры ({vehicleInspections.length})</div>
                {vehicleInspections.length ? vehicleInspections.map((insp) => (
                  <div key={insp.id} className="integration-card" style={{ marginBottom: 8 }}>
                    <div>
                      <div className="integration-name">{fmtDate(insp.created_at)}</div>
                      <div className="integration-desc">
                        {(insp.workflow_stage && WORKFLOW_LABELS[insp.workflow_stage]) || insp.workflow_stage || '—'} · {insp.staff?.full_name || '—'}
                        {insp.approval_status ? ` · ${APPROVAL_LABELS[insp.approval_status] ?? insp.approval_status}` : ''}
                      </div>
                    </div>
                  </div>
                )) : <div className="empty-state">Осмотров нет</div>}
              </div>
            )}

            {sideTab === 'maintenance' && (
              <div>
                <div className="side-field-label">Заметки / обслуживание</div>
                <div className="side-field-value" style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
                  {selected.maintenance_notes || 'Заметок нет'}
                </div>
                <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="stat-card"><div className="stat-label">Заказов</div><div className="stat-value">{vehicleBookings.length}</div></div>
                  <div className="stat-card"><div className="stat-label">Осмотров</div><div className="stat-value">{vehicleInspections.length}</div></div>
                </div>
              </div>
            )}
            </div>

            <div className="side-actions mobile-detail-actions">
              {canManage && <span className="side-action edit" onClick={() => onEdit(selected)}>Редактировать</span>}
              {canDelete && <span className="side-action del" onClick={() => deleteVehicle(selected.id)}>Удалить</span>}
            </div>
          </SideDrawer>
        )}
      </div>
    </>
  );
}
