import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useLocalQuery } from '../hooks/useLocalData';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { canManageServices } from '../lib/permissions';
import { fmt } from '../lib/constants';
import { db } from '../lib/localdb';
import { AssetManager } from '../components/AssetManager';
import { ServiceCostBreakdown } from '../components/dashboard/PageDashboards';
import { ServicesAnalyticsPro } from '../components/services/ServicesAnalyticsPro';
import { NavIconSend } from '../components/NavIcons';
import { PeriodSelector } from '../components/dashboard/PeriodSelector';
import { FILE_CATEGORIES } from '../lib/r2Storage';
import type { FinancePeriod } from '../lib/analytics';
import {
  CATEGORY_IDS,
  DIFFICULTY_LABELS,
  QUOTE_STATUS_LABELS,
  SERVICE_CATEGORIES,
  VEHICLE_TYPES,
  activePackages,
  buildQuoteMailto,
  calcPackagePrice,
  calcServiceCost,
  categoryLabel,
  normalizeServiceCategory,
  exportServicesCSV,
  getVehiclePrice,
  subcategoryLabel,
} from '../lib/services';
import type {
  Booking,
  Customer,
  InventoryItem,
  Service,
  ServiceMaterialRecipe,
  ServicePackage,
  ServiceQuote,
  ServiceQuoteItem,
  Vehicle,
} from '../types/database';

type SvcTab = 'catalog' | 'packages' | 'pricing' | 'calculator' | 'quotes' | 'analytics' | 'documents';

const TABS: { id: SvcTab; label: string }[] = [
  { id: 'catalog', label: 'Каталог' },
  { id: 'packages', label: 'Пакеты' },
  { id: 'pricing', label: 'Прайс' },
  { id: 'calculator', label: 'Калькулятор' },
  { id: 'quotes', label: 'КП / Quotes' },
  { id: 'analytics', label: 'Аналитика' },
  { id: 'documents', label: 'Документы' },
];

export function ServicesPage({ onEdit }: { onEdit: (s: Service | null) => void }) {
  const { data: services, remove, update } = useLocalQuery<Service>('services', '*', { orderBy: 'name', ascending: true });
  const { data: recipes } = useLocalQuery<ServiceMaterialRecipe>('service_material_recipes', '*');
  const { data: inventoryItems } = useLocalQuery<InventoryItem>('inventory_items', 'id, name, unit, unit_cost');
  const { toast } = useToast();
  const { profile } = useAuth();
  const canManage = canManageServices(profile?.role);

  const [tab, setTab] = useState<SvcTab>('catalog');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState<string>('sedan');
  const [period, setPeriod] = useState<FinancePeriod>('quarterly');
  const [labourRate, setLabourRate] = useState('1500');

  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [quotes, setQuotes] = useState<ServiceQuote[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [pkgName, setPkgName] = useState('');
  const [pkgDesc, setPkgDesc] = useState('');
  const [pkgServices, setPkgServices] = useState<string[]>([]);
  const [pkgDiscount, setPkgDiscount] = useState('10');

  const [quoteCustomer, setQuoteCustomer] = useState('');
  const [quoteVehicle, setQuoteVehicle] = useState('');
  const [quoteItems, setQuoteItems] = useState<ServiceQuoteItem[]>([]);
  const [quoteDiscount, setQuoteDiscount] = useState('0');
  const [quoteNotes, setQuoteNotes] = useState('');

  const loadExtra = useCallback(async () => {
    const [pk, qt, bk, cu, ve] = await Promise.all([
      db.from('service_packages').select('*').order('name'),
      db.from('service_quotes').select('*, customers(*), vehicles(*)').order('created_at', { ascending: false }),
      db.from('bookings').select('*, services(price, name)').order('scheduled_at', { ascending: false }).limit(500),
      db.from('customers').select('id, full_name, email').order('full_name'),
      db.from('vehicles').select('id, brand, model, registration_number, customer_id').order('brand'),
    ]);
    setPackages((pk.data as ServicePackage[]) ?? []);
    setQuotes((qt.data as ServiceQuote[]) ?? []);
    setBookings((bk.data as Booking[]) ?? []);
    setCustomers((cu.data as Customer[]) ?? []);
    setVehicles((ve.data as Vehicle[]) ?? []);
  }, []);

  useEffect(() => { loadExtra(); }, [loadExtra]);

  const selected = services.find((s) => s.id === selectedId) ?? services[0] ?? null;

  const recipesByService = useMemo(() => {
    const map = new Map<string, ServiceMaterialRecipe[]>();
    for (const r of recipes) {
      const list = map.get(r.service_id) ?? [];
      list.push(r);
      map.set(r.service_id, list);
    }
    return map;
  }, [recipes]);

  const filtered = services.filter((s) => {
    const q = search.toLowerCase();
    if (q && !`${s.name}${categoryLabel(s.category)}${s.category}${s.subcategory}${s.description}`.toLowerCase().includes(q)) return false;
    if (categoryFilter && normalizeServiceCategory(s.category) !== categoryFilter) return false;
    if (activeFilter === 'active' && !s.is_active) return false;
    if (activeFilter === 'inactive' && s.is_active) return false;
    return true;
  });


  const toggleActive = async (s: Service) => {
    const err = await update(s.id, { is_active: !s.is_active } as Partial<Service>);
    if (err) toast('Ошибка: ' + err);
    else toast(s.is_active ? 'Услуга скрыта' : 'Услуга активна');
  };

  const savePackage = async () => {
    if (!pkgName || !canManage) {
      if (!pkgName) toast('Укажите название пакета');
      return;
    }
    const { error } = await db.from('service_packages').insert({
      name: pkgName,
      description: pkgDesc || null,
      service_ids: pkgServices,
      discount_pct: +pkgDiscount || 0,
    });
    if (error) toast('Ошибка: ' + error.message);
    else { toast('Пакет создан'); setPkgName(''); setPkgDesc(''); setPkgServices([]); loadExtra(); }
  };

  const quoteSubtotal = quoteItems.reduce((s, i) => s + i.price * (i.quantity ?? 1), 0);
  const quoteTotal = Math.max(0, quoteSubtotal - (+quoteDiscount || 0));

  const saveQuote = async () => {
    if (!quoteItems.length || !canManage) {
      if (!quoteItems.length) toast('Добавьте услуги в КП');
      return;
    }
    const { error } = await db.from('service_quotes').insert({
      customer_id: quoteCustomer || null,
      vehicle_id: quoteVehicle || null,
      items: quoteItems,
      subtotal: quoteSubtotal,
      discount: +quoteDiscount || 0,
      total: quoteTotal,
      notes: quoteNotes || null,
      created_by: profile?.id ?? null,
      status: 'draft',
    });
    if (error) toast('Ошибка: ' + error.message);
    else { toast('КП сохранено'); setQuoteItems([]); setQuoteNotes(''); loadExtra(); }
  };

  const sendQuote = async (quote: ServiceQuote) => {
    const email = quote.customers?.email?.trim();
    if (!email) { toast('У клиента не указан email'); return; }
    const v = quote.vehicles;
    const vehicleLabel = v ? `${v.brand} ${v.model} ${v.registration_number ?? ''}` : '';
    window.location.href = buildQuoteMailto(quote, email, vehicleLabel);
    await db.from('service_quotes').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', quote.id);
    toast('Откройте почтовый клиент');
    loadExtra();
  };

  const addQuoteItem = (serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    setQuoteItems((prev) => [...prev, { service_id: svc.id, name: svc.name, price: getVehiclePrice(svc, vehicleType as 'sedan'), quantity: 1 }]);
  };

  const downloadCSV = () => {
    const blob = new Blob(['\uFEFF' + exportServicesCSV(filtered)], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'services.csv';
    a.click();
    toast('Каталог экспортирован');
  };

  return (
    <>
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>Каталог услуг</div>
          <h1 className="page-title">Услуги и прайс</h1>
          <p className="page-sub">Каталог, пакеты, калькулятор маржи, КП и аналитика по броням.</p>
        </div>
        <div className="tag-row">
          {canManage && <div className="tag add" onClick={() => onEdit(null)}>+ Новая услуга</div>}
          <div className="tag ghost" onClick={downloadCSV}>Экспорт CSV</div>
        </div>
      </div>

      <div className="filter-row tab-scroll" style={{ padding: 0, marginBottom: 28 }}>
        {TABS.map((t) => (
          <div key={t.id} className={`filter-pill ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      {tab === 'catalog' && (
        <>
          <div className="table-toolbar">
            <input className="search-input" placeholder="Поиск услуги" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="field-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Все категории</option>
              {CATEGORY_IDS.map((c) => <option key={c} value={c}>{SERVICE_CATEGORIES[c].label}</option>)}
            </select>
            <div className="filter-row" style={{ padding: 0, margin: 0 }}>
              {(['all', 'active', 'inactive'] as const).map((f) => (
                <div key={f} className={`filter-pill ${activeFilter === f ? 'active' : ''}`} onClick={() => setActiveFilter(f)}>
                  {f === 'all' ? 'Все' : f === 'active' ? 'Активные' : 'Неактивные'}
                </div>
              ))}
            </div>
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 28 }}>
            <div className="stat-card"><div className="stat-label">Всего услуг</div><div className="stat-value">{filtered.length}</div></div>
            <div className="stat-card"><div className="stat-label">Активных</div><div className="stat-value">{filtered.filter((s) => s.is_active).length}</div></div>
            <div className="stat-card"><div className="stat-label">Категорий</div><div className="stat-value">{CATEGORY_IDS.length}</div></div>
          </div>
          {filtered.length > 0 && (
            <div className="card-grid">
              {filtered.map((s) => {
                const cost = calcServiceCost(s, recipes, inventoryItems, +labourRate || 1500);
                return (
                  <div
                    className={`service-card${!s.is_active ? ' inactive' : ''}`}
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <div className="service-card-head">
                      <div className="service-card-name">{s.name}</div>
                      {!s.is_active && <span className="module-badge muted">Неактивна</span>}
                    </div>
                    <div className="service-card-pills">
                      <span className="tag green">{fmt(s.base_price ?? s.price)}</span>
                      <span className="tag blue">{s.duration_minutes} мин</span>
                      <span className="tag">{categoryLabel(s.category)}</span>
                    </div>
                    <div className="service-card-meta">
                      {subcategoryLabel(s.category, s.subcategory)}
                      {s.difficulty_level ? ` · ${DIFFICULTY_LABELS[s.difficulty_level] ?? s.difficulty_level}` : ''}
                      <br />
                      Маржа ~{cost.marginPct.toFixed(0)}% · материалы {fmt(cost.materialCost)} · труд {fmt(cost.labourCost)}
                      {(s.required_skills?.length ?? 0) > 0 && <> · Навыки: {s.required_skills!.join(', ')}</>}
                    </div>
                    <div className="service-card-actions">
                      {canManage && <span className="icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(s); }}><Pencil size={13} strokeWidth={1.75} /></span>}
                      {canManage && <span className="icon-btn" onClick={(e) => { e.stopPropagation(); toggleActive(s); }}>{s.is_active ? '◌' : '●'}</span>}
                      {canManage && (
                        <span className="icon-btn danger" onClick={async (e) => {
                          e.stopPropagation();
                          const err = await remove(s.id);
                          if (err) toast('Ошибка: ' + err);
                          else toast('Удалена');
                        }}><Trash2 size={13} strokeWidth={1.75} /></span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!filtered.length && <div className="empty-state">Услуги не найдены</div>}
        </>
      )}

      {tab === 'packages' && (
        <>
          {canManage && (
            <div className="section-block" style={{ marginBottom: 20 }}>
              <div className="section-head"><div className="section-title">Конструктор пакета</div></div>
              <input className="field-input" placeholder="Название пакета" value={pkgName} onChange={(e) => setPkgName(e.target.value)} />
              <input className="field-input" placeholder="Описание" value={pkgDesc} onChange={(e) => setPkgDesc(e.target.value)} />
              <div className="field-row2">
                <input className="field-input" type="number" placeholder="Скидка %" value={pkgDiscount} onChange={(e) => setPkgDiscount(e.target.value)} />
                <div className="tag add" onClick={savePackage}>Сохранить пакет</div>
              </div>
              <div style={{ marginTop: 12, maxHeight: 200, overflow: 'auto' }}>
                {services.filter((s) => s.is_active).map((s) => (
                  <label key={s.id} style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                    <input
                      type="checkbox"
                      checked={pkgServices.includes(s.id)}
                      onChange={(e) => setPkgServices((prev) => e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id))}
                    />{' '}
                    {s.name} — {fmt(s.price)}
                  </label>
                ))}
              </div>
              {pkgServices.length > 0 && (
                <div className="cell-sub" style={{ marginTop: 8 }}>
                  Итого: {fmt(calcPackagePrice(services, pkgServices, +pkgDiscount || 0))}
                </div>
              )}
            </div>
          )}
          {activePackages(packages).map((p) => (
            <div className="integration-card" key={p.id}>
              <div style={{ flex: 1 }}>
                <div className="integration-name">{p.name}</div>
                <div className="integration-desc">
                  {p.service_ids.length} услуг · скидка {p.discount_pct}%
                  {p.valid_until ? ` · до ${p.valid_until}` : ''}
                </div>
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  {fmt(calcPackagePrice(services, p.service_ids, p.discount_pct))}
                </div>
              </div>
            </div>
          ))}
          {!packages.length && <div className="empty-state">Пакетов пока нет</div>}
        </>
      )}

      {tab === 'pricing' && (
        <>
          <div className="filter-row" style={{ padding: 0, marginBottom: 16 }}>
            {VEHICLE_TYPES.map((v) => (
              <div key={v.id} className={`filter-pill ${vehicleType === v.id ? 'active' : ''}`} onClick={() => setVehicleType(v.id)}>{v.label}</div>
            ))}
          </div>
          {services.filter((s) => s.is_active).map((s) => (
            <div className="integration-card" key={s.id}>
              <div style={{ flex: 1 }}>
                <div className="integration-name">{s.name}</div>
                <div className="integration-desc">{categoryLabel(s.category)} · база {fmt(s.base_price ?? s.price)}</div>
              </div>
              <div className="stat-value" style={{ fontSize: 18 }}>{fmt(getVehiclePrice(s, vehicleType as 'sedan'))}</div>
            </div>
          ))}
        </>
      )}

      {tab === 'calculator' && selected && (
        <>
          <select className="field-select" value={selected.id} onChange={(e) => setSelectedId(e.target.value)} style={{ marginBottom: 16, maxWidth: 360 }}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Field label="Ставка труда, ₽/ч" value={labourRate} onChange={setLabourRate} />
          {(() => {
            const cost = calcServiceCost(selected, recipes, inventoryItems, +labourRate || 1500);
            return (
              <ServiceCostBreakdown price={Number(selected.base_price ?? selected.price)} materials={cost.materialCost} labour={cost.labourCost} hours={String(selected.labour_hours ?? (selected.duration_minutes / 60).toFixed(1))} />
            );
          })()}
          {(recipesByService.get(selected.id)?.length ?? 0) > 0 && (
            <div className="section-block" style={{ marginTop: 20 }}>
              <div className="section-title">Рецепт материалов</div>
              {recipesByService.get(selected.id)!.map((r) => {
                const item = inventoryItems.find((i) => i.id === r.item_id);
                return (
                  <div className="cell-sub" key={r.id}>
                    {item?.name ?? '—'} × {r.quantity_per_service} {r.unit} · {fmt((item?.unit_cost ?? 0) * r.quantity_per_service)}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {tab === 'calculator' && !selected && <div className="empty-state">Услуг нет</div>}

      {tab === 'quotes' && (
        <>
          {canManage && (
            <div className="section-block" style={{ marginBottom: 20 }}>
              <div className="section-head"><div className="section-title">Новое КП</div></div>
              <div className="quote-form-fields">
                <select className="field-select" value={quoteCustomer} onChange={(e) => setQuoteCustomer(e.target.value)}>
                  <option value="">Клиент…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
                <select className="field-select" value={quoteVehicle} onChange={(e) => setQuoteVehicle(e.target.value)}>
                  <option value="">Автомобиль…</option>
                  {vehicles.filter((v) => !quoteCustomer || v.customer_id === quoteCustomer).map((v) => (
                    <option key={v.id} value={v.id}>{v.brand} {v.model} {v.registration_number ?? ''}</option>
                  ))}
                </select>
                <select className="field-select" value="" onChange={(e) => { if (e.target.value) addQuoteItem(e.target.value); e.target.value = ''; }}>
                  <option value="">+ Добавить услугу…</option>
                  {services.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>)}
                </select>
                {quoteItems.map((item, idx) => (
                  <div key={idx} className="field-row2">
                    <span>{item.name}</span>
                    <input className="field-input" type="number" value={item.price} onChange={(e) => {
                      const next = [...quoteItems];
                      next[idx] = { ...item, price: +e.target.value };
                      setQuoteItems(next);
                    }} />
                  </div>
                ))}
                <input className="field-input" type="number" placeholder="Скидка ₽" value={quoteDiscount} onChange={(e) => setQuoteDiscount(e.target.value)} />
                <input className="field-input" placeholder="Заметки" value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} />
              </div>
              <div className="cell-sub" style={{ marginTop: 14 }}>Итого: {fmt(quoteTotal)}</div>
              <div className="tag add" onClick={saveQuote}>Сохранить КП</div>
            </div>
          )}
          {quotes.map((q) => (
            <div className="integration-card" key={q.id}>
              <div style={{ flex: 1 }}>
                <div className="integration-name">{q.customers?.full_name ?? 'Без клиента'} · {fmt(q.total)}</div>
                <div className="integration-desc">{QUOTE_STATUS_LABELS[q.status]} · {(q.items as ServiceQuoteItem[])?.length ?? 0} позиций</div>
              </div>
              {canManage && q.status === 'draft' && <div className="tag add tag-with-icon" onClick={() => sendQuote(q)}><NavIconSend size={16} /> Отправить</div>}
            </div>
          ))}
          {!quotes.length && <div className="empty-state">КП пока нет</div>}
        </>
      )}

      {tab === 'analytics' && (
        <>
          <PeriodSelector value={period} onChange={setPeriod} />
          <ServicesAnalyticsPro bookings={bookings} services={services} recipes={recipes} inventoryItems={inventoryItems} period={period} labourRate={+labourRate || 1500} />
        </>
      )}

      {tab === 'documents' && selected && (
        <div className="section-block">
          <select className="field-select" value={selected.id} onChange={(e) => setSelectedId(e.target.value)} style={{ marginBottom: 16, maxWidth: 360 }}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <AssetManager
            entityType="service"
            entityId={selected.id}
            categories={FILE_CATEGORIES.service.map((c) => ({ ...c }))}
            title="Медиа и документы услуги (R2)"
          />
        </div>
      )}
      {tab === 'documents' && !selected && <div className="empty-state">Услуг нет</div>}
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="side-field-label">{label}</div>
      <input className="field-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
