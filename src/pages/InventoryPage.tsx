import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { SideDrawer } from '../components/SideDrawer';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { Pencil, Trash2 } from 'lucide-react';
import { useLocalQuery } from '../hooks/useLocalData';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { canManageInventory } from '../lib/permissions';
import { db } from '../lib/localdb';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { fmt } from '../lib/constants';
import { AssetManager } from '../components/AssetManager';
import { FILE_CATEGORIES } from '../lib/r2Storage';
import { PeriodSelector } from '../components/dashboard/PeriodSelector';
import { addDays, buildBuckets, getFinancePeriodRange, startOfDay, sumIntoBuckets, type FinancePeriod } from '../lib/analytics';
import {
  ActivityRings,
  AreaChart,
  BarList,
  InsightSummary,
  Insights,
  MetricTile,
  StorageBar,
  TINT,
  colorAt,
  fmtMoneyCompact,
  type BarItem,
} from '../components/charts';
import { diagnoseInventory, type StockCover } from '../lib/diagnostics';
import { useRevealDetail } from '../hooks/useRevealDetail';
import {
  DETAILING_CATEGORIES,
  CATEGORY_IDS,
  categoryLabel,
  subcategoryLabel,
  calcInventoryValue,
  calcMonthlyConsumption,
  calcConsumptionCost,
  calcWastePercent,
  calcPpfRemaining,
  calcChemicalCount,
  getExpiringItems,
  getExpiredItems,
  getLowStock,
  getTopConsumed,
  isExpiringSoon,
  isExpired,
  exportInventoryCSV,
  PO_STATUS_LABELS,
  nextPoStatus,
} from '../lib/inventory';
import type {
  InventoryItem,
  Booking,
  Supplier,
  InventoryReceipt,
  InventoryIssue,
  InventoryWaste,
  ServiceMaterialRecipe,
  Service,
  Staff,
  Vehicle,
  PurchaseOrder,
} from '../types/database';

type InvTab = 'dashboard' | 'stock' | 'products' | 'usage' | 'receiving' | 'issue' | 'suppliers' | 'purchase_orders' | 'recipes' | 'alerts';

const INV_TABS: { id: InvTab; label: string }[] = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'stock', label: 'Остатки' },
  { id: 'products', label: 'Продукты' },
  { id: 'usage', label: 'Списания' },
  { id: 'receiving', label: 'Приёмка' },
  { id: 'issue', label: 'Выдача' },
  { id: 'suppliers', label: 'Поставщики' },
  { id: 'purchase_orders', label: 'Заказы' },
  { id: 'recipes', label: 'Рецепты' },
  { id: 'alerts', label: 'Оповещения' },
];

type UsageRow = {
  id: string;
  quantity_used: number;
  used_at: string;
  item_id: string;
  booking_id: string | null;
  inventory_items?: { name: string; unit: string; unit_cost?: number } | null;
  bookings?: { customers?: { full_name: string } | null; vehicles?: { brand: string; model: string; registration_number: string } | null } | null;
};

type IssueRow = InventoryIssue & {
  inventory_items?: { name: string; unit: string; unit_cost?: number } | null;
  bookings?: { customers?: { full_name: string } | null } | null;
  vehicles?: { brand: string; model: string; registration_number: string } | null;
  staff?: { full_name: string } | null;
};

export function InventoryPage({ onEdit }: { onEdit: (item: InventoryItem | null) => void }) {
  const { data: items, remove } = useLocalQuery<InventoryItem>('inventory_items', '*', { orderBy: 'name', ascending: true });
  const { data: bookings } = useLocalQuery<Booking>('bookings', 'id, customer_id, vehicle_id, customers(full_name), vehicles(brand, model, registration_number)', { orderBy: 'scheduled_at' });
  const { data: suppliers, insert: insertSupplier, update: updateSupplier, remove: removeSupplier } = useLocalQuery<Supplier>('suppliers', '*', { orderBy: 'name', ascending: true });
  const { data: services } = useLocalQuery<Service>('services', 'id, name', { orderBy: 'name', ascending: true });
  const { data: staffList } = useLocalQuery<Staff>('staff', 'id, full_name', { orderBy: 'full_name', ascending: true });
  const { data: vehicles } = useLocalQuery<Vehicle>('vehicles', 'id, brand, model, registration_number', { orderBy: 'brand', ascending: true });
  const { data: recipes, insert: insertRecipe, remove: removeRecipe } = useLocalQuery<ServiceMaterialRecipe>('service_material_recipes', '*');
  const { toast } = useToast();
  const { profile } = useAuth();
  const canManage = canManageInventory(profile?.role);
  const { refresh } = useDataRefresh();

  const [tab, setTab] = useState<InvTab>('dashboard');
  const [period, setPeriod] = useState<FinancePeriod>('monthly');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useRevealDetail(selectedId);
  const [vehicleModal, setVehicleModal] = useState<string | null>(null);

  const [usageHistory, setUsageHistory] = useState<UsageRow[]>([]);
  const [issueHistory, setIssueHistory] = useState<IssueRow[]>([]);
  const [wasteRows, setWasteRows] = useState<InventoryWaste[]>([]);

  const [usageItem, setUsageItem] = useState('');
  const [usageQty, setUsageQty] = useState('1');
  const [usageBooking, setUsageBooking] = useState('');

  const [recvItem, setRecvItem] = useState('');
  const [recvQty, setRecvQty] = useState('1');
  const [recvSupplier, setRecvSupplier] = useState('');
  const [recvBatch, setRecvBatch] = useState('');
  const [recvExpiry, setRecvExpiry] = useState('');
  const [recvInvoice, setRecvInvoice] = useState('');

  const [issueItem, setIssueItem] = useState('');
  const [issueQty, setIssueQty] = useState('1');
  const [issueBooking, setIssueBooking] = useState('');
  const [issueVehicle, setIssueVehicle] = useState('');
  const [issueStaff, setIssueStaff] = useState('');
  const [issueNotes, setIssueNotes] = useState('');

  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [recipeService, setRecipeService] = useState('');
  const [recipeItem, setRecipeItem] = useState('');
  const [recipeQty, setRecipeQty] = useState('1');
  const [recipeUnit, setRecipeUnit] = useState('шт');
  const [recipeNotes, setRecipeNotes] = useState('');

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [poSupplier, setPoSupplier] = useState('');
  const [poTotal, setPoTotal] = useState('');
  const [poStatus, setPoStatus] = useState('draft');

  const loadPurchaseOrders = useCallback(async () => {
    const { data, error } = await db
      .from('purchase_orders')
      .select('*, suppliers(id, name, contact_email, contact_phone)')
      .order('created_at', { ascending: false });
    if (!error && data) setPurchaseOrders(data as PurchaseOrder[]);
  }, []);

  const loadHistory = useCallback(async () => {
    const [usageRes, issueRes, wasteRes] = await Promise.all([
      db
        .from('inventory_usage')
        .select('id, item_id, quantity_used, used_at, booking_id, inventory_items(name, unit, unit_cost), bookings(customers(full_name), vehicles(brand, model, registration_number))')
        .order('used_at', { ascending: false })
        .limit(500),
      db
        .from('inventory_issues')
        .select('*, inventory_items(name, unit, unit_cost), bookings(customers(full_name)), vehicles(brand, model, registration_number), staff(full_name)')
        .order('issued_at', { ascending: false })
        .limit(500),
      db.from('inventory_waste').select('*').order('recorded_at', { ascending: false }).limit(500),
    ]);
    setUsageHistory((usageRes.data as unknown as UsageRow[]) ?? []);
    setIssueHistory((issueRes.data as unknown as IssueRow[]) ?? []);
    setWasteRows((wasteRes.data as InventoryWaste[]) ?? []);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory, items.length]);
  useEffect(() => { loadPurchaseOrders(); }, [loadPurchaseOrders, tab]);

  const activeItems = useMemo(() => items.filter((i) => i.is_active !== false), [items]);
  const lowStock = useMemo(() => getLowStock(activeItems), [activeItems]);
  const expiring = useMemo(() => getExpiringItems(activeItems, 30), [activeItems]);
  const expired = useMemo(() => getExpiredItems(activeItems), [activeItems]);
  const brands = useMemo(() => [...new Set(activeItems.map((i) => i.brand).filter(Boolean))].sort() as string[], [activeItems]);
  const supplierNames = useMemo(() => [...new Set(activeItems.map((i) => i.supplier).filter(Boolean))].sort() as string[], [activeItems]);

  const dashboardMetrics = useMemo(() => {
    const usageData = usageHistory.map((u) => ({
      id: u.id, item_id: u.item_id, quantity_used: u.quantity_used, used_at: u.used_at,
      order_id: null as string | null, booking_id: u.booking_id,
    }));
    const issueData = issueHistory.map((i) => ({
      id: i.id, item_id: i.item_id, quantity: i.quantity, issued_at: i.issued_at,
      booking_id: i.booking_id, vehicle_id: i.vehicle_id, staff_id: i.staff_id, notes: i.notes,
    }));
    return {
      totalValue: calcInventoryValue(activeItems),
      chemicalCount: calcChemicalCount(activeItems),
      ppfRemaining: calcPpfRemaining(activeItems),
      consumption: calcMonthlyConsumption(usageData, issueData, wasteRows, period),
      consumptionCost: calcConsumptionCost(usageData, issueData, wasteRows, activeItems, period),
      wastePct: calcWastePercent(usageData, issueData, wasteRows, period),
      topProducts: getTopConsumed(usageData, issueData, activeItems, period, 5),
    };
  }, [activeItems, usageHistory, issueHistory, wasteRows, period]);

  const filterItems = (list: InventoryItem[]) => list.filter((i) => {
    const q = search.toLowerCase();
    if (q && !`${i.name}${i.supplier}${i.brand}${i.sku}`.toLowerCase().includes(q)) return false;
    if (categoryFilter && i.category !== categoryFilter) return false;
    if (brandFilter && i.brand !== brandFilter) return false;
    if (supplierFilter && i.supplier !== supplierFilter) return false;
    return true;
  });

  const stockItems = useMemo(() => filterItems(activeItems.filter((i) => i.type === 'material')), [activeItems, search, categoryFilter, brandFilter, supplierFilter]);
  const productItems = useMemo(() => filterItems(activeItems.filter((i) => i.type === 'product')), [activeItems, search, categoryFilter, brandFilter, supplierFilter]);
  const displayItems = tab === 'products' ? productItems : stockItems;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const vehicleConsumption = useMemo(() => {
    if (!vehicleModal) return [];
    const rows: { name: string; qty: number; unit: string; cost: number; date: string; source: string }[] = [];
    for (const u of usageHistory.filter((x) => x.bookings?.vehicles || x.booking_id)) {
      const vId = bookings.find((b) => b.id === u.booking_id)?.vehicle_id;
      if (vId !== vehicleModal) continue;
      const cost = Number(u.quantity_used) * Number(u.inventory_items?.unit_cost ?? 0);
      rows.push({ name: u.inventory_items?.name ?? '—', qty: u.quantity_used, unit: u.inventory_items?.unit ?? '', cost, date: u.used_at, source: 'Списание' });
    }
    for (const i of issueHistory.filter((x) => x.vehicle_id === vehicleModal)) {
      const cost = Number(i.quantity) * Number(i.inventory_items?.unit_cost ?? 0);
      rows.push({ name: i.inventory_items?.name ?? '—', qty: i.quantity, unit: i.inventory_items?.unit ?? '', cost, date: i.issued_at, source: 'Выдача' });
    }
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [vehicleModal, usageHistory, issueHistory, bookings]);


  const [showCharts, toggleCharts] = useAnalyticsVisibility('inventory');
  const invAnalytics = useMemo(() => {
    const now = new Date();
    const costOf = new Map(activeItems.map((i) => [i.id, Number(i.unit_cost ?? 0)]));
    const buckets = buildBuckets(getFinancePeriodRange(period));
    const use = sumIntoBuckets(buckets, usageHistory, (u) => u.used_at, (u) => Number(u.quantity_used) * (costOf.get(u.item_id) ?? 0));
    const iss = sumIntoBuckets(buckets, issueHistory, (i) => i.issued_at, (i) => Number(i.quantity) * (costOf.get(i.item_id) ?? 0));
    const wst = sumIntoBuckets(buckets, wasteRows, (w) => w.recorded_at, (w) => Number(w.quantity) * (costOf.get(w.item_id) ?? 0));
    const consumed = use.map((v, i) => v + iss[i]);

    // Coverage: how many days the stock lasts at the 30-day burn rate
    const since30 = addDays(now, -30).getTime();
    const since90 = addDays(now, -90).getTime();
    const qty30 = new Map<string, number>();
    const moved90 = new Set<string>();
    const feed = (id: string, iso: string, qty: number, burn: boolean) => {
      const t = new Date(iso).getTime();
      if (t >= since30 && burn) qty30.set(id, (qty30.get(id) ?? 0) + qty);
      if (t >= since90) moved90.add(id);
    };
    for (const u of usageHistory) feed(u.item_id, u.used_at, Number(u.quantity_used), true);
    for (const i of issueHistory) feed(i.item_id, i.issued_at, Number(i.quantity), true);
    for (const w of wasteRows) feed(w.item_id, w.recorded_at, Number(w.quantity), false);
    const cover: StockCover[] = activeItems.map((item) => {
      const daily = (qty30.get(item.id) ?? 0) / 30;
      return { item, daily, days: daily > 0 ? Number(item.stock_level) / daily : null };
    });
    const hasConsumptionData = usageHistory.length + issueHistory.length > 0;
    const deadStock = hasConsumptionData
      ? activeItems.filter((i) => Number(i.stock_level) > 0 && Number(i.unit_cost ?? 0) > 0 && !moved90.has(i.id))
      : [];

    // ABC (Pareto) by stock value
    const valued = activeItems
      .map((item) => ({ item, value: Number(item.stock_level) * Number(item.unit_cost ?? 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = valued.reduce((s, x) => s + x.value, 0);
    const abc = { A: { n: 0, v: 0 }, B: { n: 0, v: 0 }, C: { n: 0, v: 0 } };
    let acc = 0;
    for (const x of valued) {
      const before = total ? acc / total : 0;
      acc += x.value;
      const cls = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C';
      abc[cls].n += 1;
      abc[cls].v += x.value;
    }
    const topN = Math.max(1, Math.ceil(valued.length * 0.2));
    const abcTopShare = total ? valued.slice(0, topN).reduce((s, x) => s + x.value, 0) / total : 0;

    // Value by category
    const catMap = new Map<string, number>();
    for (const x of valued) {
      const key = categoryLabel(x.item.category);
      catMap.set(key, (catMap.get(key) ?? 0) + x.value);
    }
    const categories = [...catMap.entries()].sort((a, b) => b[1] - a[1]);

    // Expiry horizon
    const today = startOfDay(now).getTime();
    const exp = { expired: 0, d30: 0, d60: 0, d90: 0, later: 0, total: 0 };
    for (const item of activeItems) {
      if (!item.expiry_date) continue;
      exp.total += 1;
      const d = Math.floor((new Date(item.expiry_date).getTime() - today) / 86400000);
      if (d < 0) exp.expired += 1;
      else if (d <= 30) exp.d30 += 1;
      else if (d <= 60) exp.d60 += 1;
      else if (d <= 90) exp.d90 += 1;
      else exp.later += 1;
    }

    const topValue = valued.slice(0, 4);
    return { buckets, consumed, waste: wst, cover, hasConsumptionData, deadStock, abc, abcTopShare, total, categories, exp, topValue };
  }, [activeItems, usageHistory, issueHistory, wasteRows, period]);

  const invInsights = useMemo(
    () => diagnoseInventory({
      active: activeItems,
      lowStock,
      expired,
      expiring,
      wastePct: dashboardMetrics.wastePct,
      cover: invAnalytics.cover,
      deadStock: invAnalytics.deadStock,
      hasConsumptionData: invAnalytics.hasConsumptionData,
      abcTopShare: invAnalytics.abcTopShare,
    }),
    [activeItems, lowStock, expired, expiring, dashboardMetrics.wastePct, invAnalytics]
  );

  const onInvInsightAction = (id: string) => {
    if (id === 'alerts') setTab('alerts');
    else if (id === 'purchase') setTab('purchase_orders');
    else if (id === 'usage') setTab('usage');
  };

  const invRings = useMemo(() => {
    const withExpiry = invAnalytics.exp.total;
    const stocked = activeItems.length ? 1 - lowStock.length / activeItems.length : 1;
    const fresh = withExpiry ? 1 - expiring.length / withExpiry : 1;
    const efficient = 1 - Math.min(100, dashboardMetrics.wastePct) / 100;
    const list = [
      { id: 'stock', label: 'В наличии', hint: 'позиции выше минимума', value: stocked, display: `${Math.round(stocked * 100)}%`, color: TINT.green, unknown: activeItems.length === 0 },
      { id: 'fresh', label: 'Свежесть', hint: 'срок годности в порядке', value: fresh, display: `${Math.round(fresh * 100)}%`, color: TINT.blue, unknown: withExpiry === 0 },
      { id: 'eff', label: 'Без потерь', hint: 'доля расхода без брака', value: efficient, display: `${Math.round(efficient * 100)}%`, color: TINT.orange, unknown: !invAnalytics.hasConsumptionData },
    ];
    const known = list.filter((r) => !r.unknown);
    const score = known.length ? Math.round((known.reduce((s, r) => s + r.value, 0) / known.length) * 100) : null;
    return { list, score };
  }, [activeItems.length, lowStock.length, expiring.length, dashboardMetrics.wastePct, invAnalytics]);

  const coverItems: BarItem[] = useMemo(
    () => invAnalytics.cover
      .filter((c): c is StockCover & { days: number } => c.days !== null && Number(c.item.stock_level) > 0)
      .sort((a, b) => a.days - b.days)
      .slice(0, 6)
      .map((c) => ({
        id: c.item.id,
        label: c.item.name,
        value: Math.min(c.days, 60),
        display: c.days < 1 ? '< 1 дн.' : `${Math.round(c.days)} дн.`,
        color: c.days < 7 ? TINT.red : c.days < 14 ? TINT.orange : TINT.green,
        marker: 14,
        badge: c.days < 7 ? { text: 'срочно', tone: 'red' as const } : c.days < 14 ? { text: 'скоро', tone: 'orange' as const } : undefined,
        sub: `${Number(c.item.stock_level).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${c.item.unit} · расход ≈ ${c.daily.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${c.item.unit}/день`,
        onClick: () => setTab('purchase_orders'),
      })),
    [invAnalytics.cover]
  );

  const fmtQty = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  const categoryCount = new Set(activeItems.map((i) => i.category).filter(Boolean)).size;

  const recordUsage = async () => {
    if (!usageItem || !usageQty) return;
    const { error } = await db.from('inventory_usage').insert({
      item_id: usageItem,
      quantity_used: +usageQty,
      booking_id: usageBooking || null,
    });
    if (error) toast('Ошибка: ' + error.message);
    else { toast('Списание записано'); refresh(); loadHistory(); setUsageItem(''); setUsageQty('1'); }
  };

  const recordReceipt = async () => {
    if (!recvItem || !recvQty) return;
    const row: Partial<InventoryReceipt> = {
      item_id: recvItem,
      quantity: +recvQty,
      supplier_id: recvSupplier || null,
      batch_number: recvBatch || null,
      expiry_date: recvExpiry || null,
      invoice_ref: recvInvoice || null,
      received_by: profile?.id ?? null,
    };
    const { error } = await db.from('inventory_receipts').insert(row);
    if (error) toast('Ошибка: ' + error.message);
    else {
      toast('Приёмка записана');
      refresh(); loadHistory();
      setRecvItem(''); setRecvQty('1'); setRecvBatch(''); setRecvExpiry(''); setRecvInvoice('');
    }
  };

  const recordIssue = async () => {
    if (!issueItem || !issueQty) return;
    const row: Partial<InventoryIssue> = {
      item_id: issueItem,
      quantity: +issueQty,
      booking_id: issueBooking || null,
      vehicle_id: issueVehicle || null,
      staff_id: issueStaff || null,
      notes: issueNotes || null,
    };
    const { error } = await db.from('inventory_issues').insert(row);
    if (error) toast('Ошибка: ' + error.message);
    else {
      toast('Выдача записана');
      refresh(); loadHistory();
      setIssueItem(''); setIssueQty('1'); setIssueNotes('');
    }
  };

  const saveSupplier = async () => {
    if (!supplierName) return;
    const row = { name: supplierName, contact_email: supplierEmail || null, contact_phone: supplierPhone || null, notes: supplierNotes || null };
    const err = editingSupplier
      ? await updateSupplier(editingSupplier.id, row)
      : await insertSupplier(row);
    if (err) toast('Ошибка: ' + err);
    else {
      toast(editingSupplier ? 'Поставщик обновлён' : 'Поставщик добавлен');
      setSupplierName(''); setSupplierEmail(''); setSupplierPhone(''); setSupplierNotes(''); setEditingSupplier(null);
    }
  };

  const createPurchaseOrder = async () => {
    if (!poSupplier || !poTotal) {
      toast('Укажите поставщика и сумму');
      return;
    }
    const row = {
      supplier_id: poSupplier,
      status: poStatus,
      total: +poTotal,
      approved_by: poStatus === 'approved' ? profile?.id ?? null : null,
    };
    const { error } = await db.from('purchase_orders').insert(row);
    if (error) toast('Ошибка: ' + error.message);
    else {
      toast('Заказ поставщику создан');
      setPoSupplier('');
      setPoTotal('');
      setPoStatus('draft');
      loadPurchaseOrders();
    }
  };

  const cyclePoStatus = async (po: PurchaseOrder) => {
    if (!canManage) return;
    const next = nextPoStatus(po.status);
    const updates: Partial<PurchaseOrder> = { status: next };
    if (next === 'approved') updates.approved_by = profile?.id ?? null;
    const { error } = await db.from('purchase_orders').update(updates).eq('id', po.id);
    if (error) toast('Ошибка: ' + error.message);
    else {
      toast(`Статус: ${PO_STATUS_LABELS[next as keyof typeof PO_STATUS_LABELS] ?? next}`);
      loadPurchaseOrders();
    }
  };

  const deletePurchaseOrder = async (id: string) => {
    const { error } = await db.from('purchase_orders').delete().eq('id', id);
    if (error) toast('Ошибка: ' + error.message);
    else {
      toast('Заказ удалён');
      loadPurchaseOrders();
    }
  };

  const poStatusClass = (status: string) => {
    if (status === 'received') return 'done';
    if (status === 'cancelled') return 'planned';
    if (status === 'approved' || status === 'ordered') return 'progress';
    return 'planned';
  };

  const addRecipe = async () => {
    if (!recipeService || !recipeItem) return;
    const err = await insertRecipe({
      service_id: recipeService,
      item_id: recipeItem,
      quantity_per_service: +recipeQty,
      unit: recipeUnit,
      notes: recipeNotes || null,
    } as Partial<ServiceMaterialRecipe>);
    if (err) toast('Ошибка: ' + err);
    else { toast('Рецепт добавлен'); setRecipeItem(''); setRecipeQty('1'); setRecipeNotes(''); }
  };

  const calcLineCost = (qty: number, unitCost?: number) => Number(qty) * Number(unitCost ?? 0);

  const renderFilters = () => (
    <div className="table-toolbar">
      <input className="search-input" placeholder="Поиск позиции, бренда, SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select className="field-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
        <option value="">Все категории</option>
        {CATEGORY_IDS.map((c) => <option key={c} value={c}>{DETAILING_CATEGORIES[c].label}</option>)}
      </select>
      <select className="field-select" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
        <option value="">Все бренды</option>
        {brands.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      <select className="field-select" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
        <option value="">Все поставщики</option>
        {supplierNames.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {canManage && tab === 'stock' && (
        <div className="tag ghost" onClick={() => { exportInventoryCSV(stockItems); toast('CSV экспортирован'); }}>Экспорт CSV</div>
      )}
    </div>
  );

  const renderItemTable = (list: InventoryItem[], showValue = false) => (
    <div className="table-wrap responsive-table-layout">
      <div className="table-main">
        <div className="table-scroll">
          <table className="data-table inventory-table">
            <thead>
              <tr>
                <th>Наименование</th>
                <th>Категория</th>
                <th>Бренд</th>
                <th>Поставщик</th>
                <th>Остаток</th>
                {showValue && <th>Стоимость</th>}
                <th>Срок</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className={selected?.id === i.id ? 'selected' : ''} onClick={() => setSelectedId(i.id)}>
                  <td className="col-client cell-title">{i.name}{i.sku ? <div className="cell-sub">SKU: {i.sku}</div> : null}</td>
                  <td>{categoryLabel(i.category)}{i.subcategory ? ` · ${subcategoryLabel(i.category, i.subcategory)}` : ''}</td>
                  <td>{i.brand || '—'}</td>
                  <td>{i.supplier || '—'}</td>
                  <td className="col-num" style={{ color: Number(i.stock_level) <= Number(i.min_stock_level) ? 'var(--red)' : undefined, fontWeight: Number(i.stock_level) <= Number(i.min_stock_level) ? 600 : undefined }}>
                    {i.stock_level} {i.unit}
                    {Number(i.min_stock_level) > 0 && (
                      <div className="stock-bar" aria-hidden>
                        <span
                          className={Number(i.stock_level) <= Number(i.min_stock_level) ? 'low' : ''}
                          style={{ width: `${Math.max(4, Math.min(100, (Number(i.stock_level) / (Number(i.min_stock_level) * 3)) * 100))}%` }}
                        />
                      </div>
                    )}
                  </td>
                  {showValue && <td className="col-num">{fmt(Number(i.stock_level) * Number(i.unit_cost ?? 0))}</td>}
                  <td style={{ color: isExpired(i) ? 'var(--red)' : isExpiringSoon(i) ? 'var(--amber)' : undefined }}>
                    {i.expiry_date ? new Date(i.expiry_date).toLocaleDateString('ru-RU') : '—'}
                  </td>
                  <td className="col-actions">
                    {canManage ? (
                      <div className="icon-actions">
                        <span className="icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(i); }}><Pencil size={13} strokeWidth={1.75} /></span>
                        <span className="icon-btn danger" onClick={async (e) => {
                          e.stopPropagation();
                          const err = await remove(i.id);
                          if (err) toast('Ошибка: ' + err);
                          else toast('Удалено');
                        }}><Trash2 size={13} strokeWidth={1.75} /></span>
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-data-list">
          {list.map((i) => (
            <div
              key={i.id}
              className={`mobile-data-card ${selected?.id === i.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(i.id)}
            >
              <div className="mobile-data-head">
                <div className="cell-title">{i.name}</div>
                <span className={`status-badge ${Number(i.stock_level) <= Number(i.min_stock_level) ? 'progress' : 'done'}`}>
                  {i.stock_level} {i.unit}
                </span>
              </div>
              <div className="cell-sub">{categoryLabel(i.category)} · {i.brand || '—'} · {i.supplier || '—'}</div>
              <div className="mobile-data-grid">
                {showValue && <div><span className="side-field-label">Стоимость</span><div className="side-field-value">{fmt(Number(i.stock_level) * Number(i.unit_cost ?? 0))}</div></div>}
                <div><span className="side-field-label">Срок</span><div className="side-field-value" style={{ color: isExpired(i) ? 'var(--red)' : isExpiringSoon(i) ? 'var(--amber)' : undefined }}>{i.expiry_date ? new Date(i.expiry_date).toLocaleDateString('ru-RU') : '—'}</div></div>
                <div><span className="side-field-label">Место</span><div className="side-field-value">{i.storage_location || '—'}</div></div>
              </div>
            </div>
          ))}
          {!list.length && <div className="empty-state">Позиций нет</div>}
        </div>
      </div>
      {selected && tab === 'products' && (
        <SideDrawer onClose={() => setSelectedId(null)}>
          <div className="side-panel-head">
            <div className="side-eyebrow">Каталог</div>
            <div className="side-title">{selected.name}</div>
            {selected.brand && <div className="cell-sub">{selected.brand}{selected.sku ? ` · ${selected.sku}` : ''}</div>}
          </div>
          <div className="side-panel-body">
          {selected.description && (
            <div style={{ marginBottom: 12 }}>
              <div className="side-field-label">Описание</div>
              <div className="side-field-value" style={{ fontSize: 13, color: 'var(--muted)' }}>{selected.description}</div>
            </div>
          )}
          <div className="side-grid">
            <div><div className="side-field-label">Категория</div><div className="side-field-value">{categoryLabel(selected.category)}</div></div>
            <div><div className="side-field-label">Остаток</div><div className="side-field-value big">{selected.stock_level} {selected.unit}</div></div>
            <div><div className="side-field-label">Себестоимость</div><div className="side-field-value">{fmt(Number(selected.unit_cost ?? 0))}</div></div>
            <div><div className="side-field-label">Цена продажи</div><div className="side-field-value">{fmt(Number(selected.selling_price ?? 0))}</div></div>
          </div>
          {selected.application_purpose && (
            <div style={{ marginTop: 12 }}>
              <div className="side-field-label">Назначение</div>
              <div className="side-field-value" style={{ fontSize: 13 }}>{selected.application_purpose}</div>
            </div>
          )}
          <div className="side-actions mobile-detail-actions" style={{ marginTop: 12 }}>
            {canManage && <span className="side-action edit" onClick={() => onEdit(selected)}>Редактировать</span>}
          </div>
          <AssetManager
            entityType="product"
            entityId={selected.id}
            categories={FILE_CATEGORIES.product.map((c) => ({ ...c }))}
            compact
            title="Изображения и документы"
          />
          </div>
        </SideDrawer>
      )}
    </div>
  );

  return (
    <>
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>Склад</div>
          <h1 className="page-title">Складской учёт</h1>
          <p className="page-sub">Детейлинг: химия, PPF, полировка, инструменты, приёмка, выдача и рецепты услуг.</p>
        </div>
        <div className="tag-row">
          <AnalyticsToggle
            visible={showCharts}
            onToggle={() => {
              if (tab !== 'dashboard') {
                setTab('dashboard');
                if (!showCharts) toggleCharts();
              } else {
                toggleCharts();
              }
            }}
          />
          {lowStock.length > 0 && <div className="tag red"><span className="dot"></span>{lowStock.length} — низкий остаток</div>}
          {expiring.length > 0 && <div className="tag blue"><span className="dot"></span>{expiring.length} — истекает срок</div>}
          {canManage && <div className="tag add" onClick={() => onEdit(null)}>+ Новая позиция</div>}
        </div>
      </div>

      <div className="filter-row tab-scroll" style={{ padding: 0, marginBottom: 28, gap: 8 }}>
        {INV_TABS.map((t) => (
          <div key={t.id} className={`filter-pill ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div className="dx">
          <div className="dx-toolbar"><PeriodSelector value={period} onChange={setPeriod} /></div>

          {showCharts && (<>
          {/* HERO: stock value by category + health rings */}
          <div className="dx-grid dx-hero">
            <div className="dx-card">
              <div className="dx-card-head">
                <div><div className="dx-eyebrow">Стоимость склада</div></div>
                <span className="ch-badge is-gray">{activeItems.length} активных позиций</span>
              </div>
              <div className="dx-bignum">{dashboardMetrics.totalValue.toLocaleString('ru-RU')}<small>₽</small></div>
              <div className="dx-hero-line">
                <span>Химия: <b style={{ color: 'var(--text)' }}>{dashboardMetrics.chemicalCount}</b> поз.</span>
                <span>· PPF: <b style={{ color: 'var(--text)' }}>{fmtQty(dashboardMetrics.ppfRemaining)}</b></span>
              </div>
              <div className="dx-eyebrow" style={{ marginBottom: 10 }}>Из чего состоит стоимость</div>
              <StorageBar
                height={18}
                emptyText="Стоимость складских позиций не задана"
                segments={invAnalytics.categories.map(([label, value], i) => ({ id: label, label, value, color: colorAt(i), display: fmtMoneyCompact(value) }))}
              />
              {invAnalytics.topValue.length > 0 && (
                <div style={{ marginTop: 26 }}>
                  <div className="dx-eyebrow" style={{ marginBottom: 12 }}>Больше всего денег в остатках</div>
                  <BarList
                    items={invAnalytics.topValue.map((x, i) => ({
                      id: x.item.id,
                      label: x.item.name,
                      value: x.value,
                      display: fmt(Math.round(x.value)),
                      color: colorAt(i),
                      sub: `${fmtQty(Number(x.item.stock_level))} ${x.item.unit} · ${Math.round((x.value / (invAnalytics.total || 1)) * 100)}% склада`,
                    }))}
                  />
                </div>
              )}
            </div>

            <div className="dx-card dx-side">
              <div style={{ width: '100%' }}>
                <div className="dx-eyebrow">Здоровье склада</div>
                <div className="dx-sub" style={{ marginTop: 2 }}>Индекс — среднее известных колец</div>
              </div>
              <ActivityRings rings={invRings.list} center={<><b>{invRings.score ?? '—'}</b><span>индекс</span></>} />
            </div>
          </div>

          </>)}

          <div className="dx-grid dx-4">
            <MetricTile
              label="Расход за период"
              value={fmt(Math.round(dashboardMetrics.consumptionCost))}
              note={`${fmtQty(dashboardMetrics.consumption)} ед. списано и выдано`}
              spark={showCharts ? invAnalytics.consumed : undefined}
              color={TINT.orange}
            />
            <MetricTile
              label="Потери"
              value={`${dashboardMetrics.wastePct.toFixed(1).replace('.', ',')}%`}
              note={dashboardMetrics.wastePct > 5 ? 'выше нормы 5%' : 'в пределах нормы'}
              spark={showCharts ? invAnalytics.waste : undefined}
              color={dashboardMetrics.wastePct > 5 ? TINT.red : TINT.green}
            />
            <MetricTile label="Низкий остаток" value={lowStock.length} note={lowStock.length ? 'нужна закупка' : 'дефицита нет'} color={lowStock.length ? TINT.orange : TINT.green} onClick={() => setTab('alerts')} />
            <MetricTile label="Истекает срок" value={expiring.length} note={expired.length ? `просрочено: ${expired.length}` : 'в ближайшие 30 дней'} color={expired.length ? TINT.red : TINT.blue} onClick={() => setTab('alerts')} />
          </div>

          {showCharts && (<>
          {/* Diagnostics */}
          <div className="dx-card">
            <div className="dx-card-head">
              <div><div className="dx-eyebrow">Диагностика</div><div className="dx-title">Состояние склада</div></div>
              <InsightSummary insights={invInsights} />
            </div>
            <Insights insights={invInsights} onAction={onInvInsightAction} />
          </div>

          {/* Trend + coverage */}
          <div className="dx-grid dx-7-5">
            <div className="dx-card">
              <div className="dx-card-head"><div><div className="dx-eyebrow">Динамика</div><div className="dx-title">Расход и потери, ₽</div></div></div>
              <AreaChart
                ariaLabel="Расход материалов по периоду"
                height={220}
                labels={invAnalytics.buckets.map((b) => b.label)}
                longLabels={invAnalytics.buckets.map((b) => b.long)}
                format={fmt}
                axisFormat={fmtMoneyCompact}
                emptyText="За период не было списаний и выдач"
                series={[
                  { id: 'consumed', label: 'Расход', values: invAnalytics.consumed, color: TINT.orange, area: true },
                  { id: 'waste', label: 'Потери', values: invAnalytics.waste, color: TINT.red },
                ]}
              />
            </div>
            <div className="dx-card">
              <div className="dx-card-head">
                <div><div className="dx-eyebrow">Прогноз</div><div className="dx-title">На сколько дней хватит</div></div>
              </div>
              <BarList
                items={coverItems}
                max={60}
                emptyText={invAnalytics.hasConsumptionData ? 'Нет позиций с расходом за 30 дней' : 'Появится после первых списаний и выдач'}
              />
              {coverItems.length > 0 && <div className="dx-note">Расчёт по среднему расходу за 30 дней. Чёрная отметка — порог 14 дней.</div>}
            </div>
          </div>

          {/* Consumption leaders + expiry + ABC */}
          <div className="dx-grid dx-2">
            <div className="dx-card">
              <div className="dx-card-head"><div><div className="dx-eyebrow">Лидеры</div><div className="dx-title">Топ расхода за период</div></div></div>
              <BarList
                emptyText="Нет данных за период"
                items={dashboardMetrics.topProducts.map(({ item, qty }, i) => ({
                  id: item.id,
                  label: item.name,
                  value: qty,
                  display: `${fmtQty(qty)} ${item.unit}`,
                  color: colorAt(i),
                  sub: categoryLabel(item.category),
                }))}
              />
            </div>

            <div className="dx-card">
              <div className="dx-card-head"><div><div className="dx-eyebrow">Сроки годности</div><div className="dx-title">Горизонт 90 дней</div></div></div>
              <StorageBar
                emptyText="Сроки годности не указаны"
                segments={[
                  { id: 'expired', label: 'Просрочено', value: invAnalytics.exp.expired, color: TINT.red, display: String(invAnalytics.exp.expired) },
                  { id: 'd30', label: 'до 30 дн.', value: invAnalytics.exp.d30, color: TINT.orange, display: String(invAnalytics.exp.d30) },
                  { id: 'd60', label: '31–60 дн.', value: invAnalytics.exp.d60, color: TINT.yellow, display: String(invAnalytics.exp.d60) },
                  { id: 'd90', label: '61–90 дн.', value: invAnalytics.exp.d90, color: TINT.teal, display: String(invAnalytics.exp.d90) },
                  { id: 'later', label: 'дольше 90 дн.', value: invAnalytics.exp.later, color: TINT.green, display: String(invAnalytics.exp.later) },
                ]}
              />

              <div className="dx-eyebrow" style={{ margin: '26px 0 10px' }}>ABC-анализ стоимости</div>
              <StorageBar
                emptyText="Нет стоимости позиций"
                segments={[
                  { id: 'A', label: `A · ${invAnalytics.abc.A.n} поз.`, value: invAnalytics.abc.A.v, color: TINT.blue, display: fmtMoneyCompact(invAnalytics.abc.A.v) },
                  { id: 'B', label: `B · ${invAnalytics.abc.B.n} поз.`, value: invAnalytics.abc.B.v, color: TINT.teal, display: fmtMoneyCompact(invAnalytics.abc.B.v) },
                  { id: 'C', label: `C · ${invAnalytics.abc.C.n} поз.`, value: invAnalytics.abc.C.v, color: TINT.gray, display: fmtMoneyCompact(invAnalytics.abc.C.v) },
                ]}
              />
              <div className="dx-note">A — позиции, которые вместе дают 80% стоимости склада; их контролируем строже всего.</div>
            </div>
          </div>

          </>)}

          <div className="dx-grid dx-4">
            <MetricTile label="Химия" value={dashboardMetrics.chemicalCount} note="позиций" color={TINT.blue} />
            <MetricTile label="PPF" value={fmtQty(dashboardMetrics.ppfRemaining)} note="остаток" color={TINT.teal} />
            <MetricTile label="Стоимость склада" value={fmt(Math.round(dashboardMetrics.totalValue))} note={`${activeItems.length} позиций · ${categoryCount} категорий`} color={TINT.purple} />
            <MetricTile
              label="Заморожено"
              value={fmt(Math.round(invAnalytics.deadStock.reduce((s, i) => s + Number(i.stock_level) * Number(i.unit_cost ?? 0), 0)))}
              note={invAnalytics.hasConsumptionData ? `${invAnalytics.deadStock.length} поз. без движения 90 дн.` : 'нужна история расхода'}
              color={TINT.gray}
            />
          </div>

          <div className="dx-card">
            <div className="dx-card-head">
              <div><div className="dx-eyebrow">Разрез по автомобилю</div><div className="dx-title">Расход по автомобилю</div></div>
              <select className="field-select" value={vehicleModal ?? ''} onChange={(e) => setVehicleModal(e.target.value || null)} style={{ maxWidth: 280 }}>
                <option value="">Выберите автомобиль</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} · {v.registration_number}</option>)}
              </select>
            </div>
            {!vehicleModal && <div className="ch-empty-block">Выберите автомобиль, чтобы увидеть, сколько материалов на него ушло</div>}
            {vehicleModal && vehicleConsumption.length > 0 && (
              <>
                <div className="dx-hero-line" style={{ marginTop: 0 }}>
                  <span>Всего материалов на сумму <b style={{ color: 'var(--text)' }}>{fmt(Math.round(vehicleConsumption.reduce((s, r) => s + r.cost, 0)))}</b></span>
                </div>
                <div className="dx-list">
                  {vehicleConsumption.map((r, idx) => (
                    <div className="dx-row" key={idx}>
                      <div className="dx-row-main">
                        <div className="dx-row-title">{r.name}</div>
                        <div className="dx-row-sub">{fmtQty(r.qty)} {r.unit} · {r.source} · {new Date(r.date).toLocaleString('ru-RU')}</div>
                      </div>
                      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.round(r.cost))}</b>
                    </div>
                  ))}
                </div>
              </>
            )}
            {vehicleModal && !vehicleConsumption.length && <div className="ch-empty-block">Нет расхода по этому авто</div>}
          </div>
        </div>
      )}

      {(tab === 'stock' || tab === 'products') && (
        <>
          {renderFilters()}
          {renderItemTable(displayItems, tab === 'stock')}
        </>
      )}

      {tab === 'usage' && (
        <>
          <div className="integration-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12, marginBottom: 28 }}>
            <div className="side-field-label">Списание материала на заказ</div>
            <div className="filter-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
              <select className="field-select" value={usageItem} onChange={(e) => setUsageItem(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
                <option value="">Материал</option>
                {activeItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.stock_level} {i.unit})</option>)}
              </select>
              <input className="field-input" type="number" value={usageQty} onChange={(e) => setUsageQty(e.target.value)} style={{ width: 80 }} />
              <select className="field-select" value={usageBooking} onChange={(e) => setUsageBooking(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
                <option value="">Заказ (опционально)</option>
                {bookings.slice(0, 30).map((b) => <option key={b.id} value={b.id}>{b.customers?.full_name} · #{b.id.slice(0, 6)}</option>)}
              </select>
              <div className="tag add" onClick={recordUsage}>Списать</div>
            </div>
          </div>
          <div className="section-block">
            <div className="section-head"><div className="section-title">История списаний и выдач</div></div>
            {usageHistory.slice(0, 50).map((u) => (
              <div className="integration-card" key={`u-${u.id}`}>
                <div>
                  <div className="integration-name">{u.inventory_items?.name ?? 'Материал'}</div>
                  <div className="integration-desc">
                    {u.quantity_used} {u.inventory_items?.unit ?? ''} · {fmt(calcLineCost(u.quantity_used, u.inventory_items?.unit_cost))} ·
                    {u.bookings?.customers?.full_name ?? 'Без заказа'}
                    {u.bookings?.vehicles ? ` · ${u.bookings.vehicles.brand} ${u.bookings.vehicles.model}` : ''} ·
                    {new Date(u.used_at).toLocaleString('ru-RU')} · Списание
                  </div>
                </div>
              </div>
            ))}
            {issueHistory.slice(0, 50).map((i) => (
              <div className="integration-card" key={`i-${i.id}`}>
                <div>
                  <div className="integration-name">{i.inventory_items?.name ?? 'Материал'}</div>
                  <div className="integration-desc">
                    {i.quantity} {i.inventory_items?.unit ?? ''} · {fmt(calcLineCost(i.quantity, i.inventory_items?.unit_cost))} ·
                    {i.bookings?.customers?.full_name ?? i.vehicles ? `${i.vehicles?.brand} ${i.vehicles?.model}` : 'Без заказа'} ·
                    {i.staff?.full_name ? ` ${i.staff.full_name} ·` : ''}
                    {new Date(i.issued_at).toLocaleString('ru-RU')} · Выдача
                  </div>
                </div>
              </div>
            ))}
            {!usageHistory.length && !issueHistory.length && <div className="empty-state">История пуста</div>}
          </div>
        </>
      )}

      {tab === 'receiving' && (
        <div className="integration-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
          <div className="side-field-label">Приёмка товара на склад</div>
          <div className="filter-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
            <select className="field-select" value={recvItem} onChange={(e) => setRecvItem(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
              <option value="">Позиция</option>
              {activeItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input className="field-input" type="number" value={recvQty} onChange={(e) => setRecvQty(e.target.value)} style={{ width: 80 }} placeholder="Кол-во" />
            <select className="field-select" value={recvSupplier} onChange={(e) => setRecvSupplier(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
              <option value="">Поставщик</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="filter-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
            <input className="field-input" value={recvBatch} onChange={(e) => setRecvBatch(e.target.value)} placeholder="Партия" style={{ flex: 1 }} />
            <input className="field-input" type="date" value={recvExpiry} onChange={(e) => setRecvExpiry(e.target.value)} style={{ width: 160 }} />
            <input className="field-input" value={recvInvoice} onChange={(e) => setRecvInvoice(e.target.value)} placeholder="Счёт / накладная" style={{ flex: 1 }} />
            <div className="tag add" onClick={recordReceipt}>Принять</div>
          </div>
        </div>
      )}

      {tab === 'issue' && (
        <div className="integration-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
          <div className="side-field-label">Выдача материалов технику / на заказ</div>
          <div className="filter-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
            <select className="field-select" value={issueItem} onChange={(e) => setIssueItem(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
              <option value="">Материал</option>
              {activeItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.stock_level} {i.unit})</option>)}
            </select>
            <input className="field-input" type="number" value={issueQty} onChange={(e) => setIssueQty(e.target.value)} style={{ width: 80 }} />
            <select className="field-select" value={issueStaff} onChange={(e) => setIssueStaff(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
              <option value="">Техник</option>
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div className="filter-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
            <select className="field-select" value={issueBooking} onChange={(e) => setIssueBooking(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
              <option value="">Заказ</option>
              {bookings.slice(0, 30).map((b) => <option key={b.id} value={b.id}>{b.customers?.full_name}</option>)}
            </select>
            <select className="field-select" value={issueVehicle} onChange={(e) => setIssueVehicle(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
              <option value="">Автомобиль</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model}</option>)}
            </select>
            <input className="field-input" value={issueNotes} onChange={(e) => setIssueNotes(e.target.value)} placeholder="Заметки" style={{ flex: 1 }} />
            <div className="tag add" onClick={recordIssue}>Выдать</div>
          </div>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="section-block">
          {canManage && (
            <div className="integration-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginBottom: 20 }}>
              <div className="side-field-label">{editingSupplier ? 'Редактировать поставщика' : 'Новый поставщик'}</div>
              <div className="filter-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
                <input className="field-input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Название" style={{ flex: 1 }} />
                <input className="field-input" value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} placeholder="Email" style={{ flex: 1 }} />
                <input className="field-input" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} placeholder="Телефон" style={{ flex: 1 }} />
                <div className="tag add" onClick={saveSupplier}>{editingSupplier ? 'Сохранить' : 'Добавить'}</div>
                {editingSupplier && <div className="tag ghost" onClick={() => { setEditingSupplier(null); setSupplierName(''); setSupplierEmail(''); setSupplierPhone(''); setSupplierNotes(''); }}>Отмена</div>}
              </div>
              <input className="field-input" value={supplierNotes} onChange={(e) => setSupplierNotes(e.target.value)} placeholder="Заметки" />
            </div>
          )}
          {suppliers.map((s) => (
            <div className="integration-card" key={s.id}>
              <div style={{ flex: 1 }}>
                <div className="integration-name">{s.name}</div>
                <div className="integration-desc">{s.contact_email || '—'} · {s.contact_phone || '—'}{s.notes ? ` · ${s.notes}` : ''}</div>
              </div>
              {canManage && (
                <div className="icon-actions">
                  <span className="icon-btn" onClick={() => { setEditingSupplier(s); setSupplierName(s.name); setSupplierEmail(s.contact_email ?? ''); setSupplierPhone(s.contact_phone ?? ''); setSupplierNotes(s.notes ?? ''); }}><Pencil size={13} strokeWidth={1.75} /></span>
                  <span className="icon-btn danger" onClick={async () => {
                    const err = await removeSupplier(s.id);
                    if (err) toast('Ошибка: ' + err);
                    else toast('Удалён');
                  }}><Trash2 size={13} strokeWidth={1.75} /></span>
                </div>
              )}
            </div>
          ))}
          {!suppliers.length && <div className="empty-state">Поставщики не добавлены</div>}
        </div>
      )}

      {tab === 'purchase_orders' && (
        <div className="section-block">
          {canManage && (
            <div className="integration-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginBottom: 20 }}>
              <div className="side-field-label">Новый заказ поставщику</div>
              <div className="filter-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
                <select className="field-select" value={poSupplier} onChange={(e) => setPoSupplier(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
                  <option value="">Поставщик</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input className="field-input" type="number" value={poTotal} onChange={(e) => setPoTotal(e.target.value)} placeholder="Сумма, ₽" style={{ width: 140 }} />
                <select className="field-select" value={poStatus} onChange={(e) => setPoStatus(e.target.value)} style={{ width: 160 }}>
                  {Object.entries(PO_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <div className="tag add" onClick={createPurchaseOrder}>Создать заказ</div>
              </div>
              {!suppliers.length && (
                <p className="settings-hint" style={{ margin: 0 }}>
                  Сначала добавьте поставщиков на вкладке «Поставщики».
                </p>
              )}
            </div>
          )}

          <div className="section-head"><div className="section-title">Заказы поставщикам ({purchaseOrders.length})</div></div>
          {purchaseOrders.map((po) => (
            <div className="integration-card" key={po.id}>
              <div style={{ flex: 1 }}>
                <div className="integration-name">
                  {po.suppliers?.name ?? 'Поставщик не указан'}
                  <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>
                    #{po.id.slice(0, 8)}
                  </span>
                </div>
                <div className="integration-desc">
                  {fmt(Number(po.total))} · {new Date(po.created_at).toLocaleString('ru-RU')}
                  {po.suppliers?.contact_email ? ` · ${po.suppliers.contact_email}` : ''}
                  {po.suppliers?.contact_phone ? ` · ${po.suppliers.contact_phone}` : ''}
                </div>
              </div>
              <div className={`status-badge ${poStatusClass(po.status)}`} onClick={() => canManage && cyclePoStatus(po)} title={canManage ? 'Нажмите для смены статуса' : undefined}>
                {PO_STATUS_LABELS[po.status as keyof typeof PO_STATUS_LABELS] ?? po.status}
              </div>
              {canManage && (
                <span className="icon-btn danger" onClick={() => deletePurchaseOrder(po.id)}><Trash2 size={13} strokeWidth={1.75} /></span>
              )}
            </div>
          ))}
          {!purchaseOrders.length && <div className="empty-state">Заказы поставщикам не созданы</div>}
        </div>
      )}

      {tab === 'recipes' && (
        <div className="section-block">
          {canManage && (
            <div className="integration-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginBottom: 20 }}>
              <div className="side-field-label">Рецепт материалов для услуги</div>
              <div className="filter-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
                <select className="field-select" value={recipeService} onChange={(e) => setRecipeService(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
                  <option value="">Услуга</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="field-select" value={recipeItem} onChange={(e) => setRecipeItem(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
                  <option value="">Материал</option>
                  {activeItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input className="field-input" type="number" value={recipeQty} onChange={(e) => setRecipeQty(e.target.value)} style={{ width: 80 }} />
                <input className="field-input" value={recipeUnit} onChange={(e) => setRecipeUnit(e.target.value)} style={{ width: 60 }} />
                <div className="tag add" onClick={addRecipe}>Добавить</div>
              </div>
              <input className="field-input" value={recipeNotes} onChange={(e) => setRecipeNotes(e.target.value)} placeholder="Заметки" />
            </div>
          )}
          {recipes.map((r) => {
            const svc = services.find((s) => s.id === r.service_id);
            const item = items.find((i) => i.id === r.item_id);
            return (
              <div className="integration-card" key={r.id}>
                <div style={{ flex: 1 }}>
                  <div className="integration-name">{svc?.name ?? 'Услуга'}</div>
                  <div className="integration-desc">{item?.name ?? '—'} · {r.quantity_per_service} {r.unit}{r.notes ? ` · ${r.notes}` : ''}</div>
                </div>
                {canManage && (
                  <span className="icon-btn danger" onClick={async () => {
                    const err = await removeRecipe(r.id);
                    if (err) toast('Ошибка: ' + err);
                    else toast('Удалено');
                  }}><Trash2 size={13} strokeWidth={1.75} /></span>
                )}
              </div>
            );
          })}
          {!recipes.length && <div className="empty-state">Рецепты не настроены</div>}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="section-block">
          <div className="section-head"><div className="section-title">Низкий остаток ({lowStock.length})</div></div>
          {lowStock.map((i) => (
            <div className="integration-card" key={`ls-${i.id}`}>
              <div>
                <div className="integration-name">{i.name}</div>
                <div className="integration-desc">{i.stock_level} / мин. {i.min_stock_level} {i.unit} · {categoryLabel(i.category)} · {i.supplier || '—'}</div>
              </div>
              <div className="tag red" style={{ cursor: canManage ? 'pointer' : 'default' }} onClick={() => canManage && setTab('purchase_orders')}>Заказать</div>
            </div>
          ))}
          {!lowStock.length && <div className="empty-state">Все позиции в норме</div>}

          <div className="section-head" style={{ marginTop: 32 }}><div className="section-title">Истекает срок ({expiring.length})</div></div>
          {expiring.map((i) => (
            <div className="integration-card" key={`ex-${i.id}`}>
              <div>
                <div className="integration-name">{i.name}</div>
                <div className="integration-desc">Срок: {i.expiry_date ? new Date(i.expiry_date).toLocaleDateString('ru-RU') : '—'} · {i.batch_number ? `Партия ${i.batch_number}` : ''}</div>
              </div>
              <div className="tag blue">Истекает</div>
            </div>
          ))}
          {!expiring.length && <div className="empty-state">Нет позиций с истекающим сроком</div>}

          <div className="section-head" style={{ marginTop: 32 }}><div className="section-title">Просрочено ({expired.length})</div></div>
          {expired.map((i) => (
            <div className="integration-card" key={`exp-${i.id}`}>
              <div>
                <div className="integration-name">{i.name}</div>
                <div className="integration-desc">Просрочено: {i.expiry_date ? new Date(i.expiry_date).toLocaleDateString('ru-RU') : '—'}</div>
              </div>
              <div className="tag red" style={{ cursor: canManage ? 'pointer' : 'default' }} onClick={() => { if (canManage) { setTab('usage'); setUsageItem(i.id); } }}>Списать</div>
            </div>
          ))}
          {!expired.length && <div className="empty-state">Нет просроченных позиций</div>}

          {dashboardMetrics.wastePct > 10 && (
            <>
              <div className="section-head" style={{ marginTop: 32 }}><div className="section-title">Аномальный расход</div></div>
              <div className="integration-card">
                <div>
                  <div className="integration-name">Высокий % потерь</div>
                  <div className="integration-desc">Потери составляют {dashboardMetrics.wastePct.toFixed(1)}% за месяц — проверьте списания и брак</div>
                </div>
                <div className="tag red">Внимание</div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
