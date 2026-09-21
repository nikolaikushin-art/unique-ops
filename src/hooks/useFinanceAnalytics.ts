import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../lib/localdb';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import {
  bookingValue,
  buildRevenueEvents,
  completedIn,
  outstandingAmount,
  revenueIn,
  type MetricBooking,
  type MetricInvoice,
} from '../lib/metrics';
import {
  type FinancePeriod,
  type DateRange,
  getFinancePeriodRange,
  getPreviousPeriodRange,
  inRange,
  pctChange,
  pickGranularity,
  buildBuckets,
  startOfDay,
} from '../lib/analytics';

export interface FinanceFilters {
  dateFrom: string;
  dateTo: string;
  serviceId: string;
  employeeId: string;
  customerId: string;
  vehicleId: string;
  productId: string;
}

interface OrderRow {
  total_amount?: number | null;
  labour_cost?: number | null;
  materials_cost?: number | null;
  created_at: string;
  customer_id?: string | null;
  services?: string | null;
  booking_id?: string | null;
}

interface UsageRow {
  item_id: string;
  quantity_used?: number | null;
  used_at: string;
  order_id?: string | null;
}

interface ItemCostRow {
  id: string;
  unit_cost?: number | null;
}

interface RecipeRow {
  service_id: string;
  item_id: string;
  quantity_per_service?: number | null;
}

export interface ServiceBreakdownRow {
  id: string;
  name: string;
  revenue: number;
  count: number;
  profit: number;
  /** Material cost used for the profit figure. */
  cost: number;
  /** `recipe` = real material cost from the service recipe; `estimate` = flat 30% assumption. */
  costSource: 'recipe' | 'estimate';
}

export interface TrendBucket {
  label: string;
  long: string;
  revenue: number;
  expenses: number;
  profit: number;
  prevRevenue: number;
  prevExpenses: number;
}

export interface FinanceMetrics {
  revenue: number;
  expenses: number;
  profit: number;
  grossMargin: number;
  netMargin: number;
  outstanding: number;
  completedJobsValue: number;
  labourCosts: number;
  materialCosts: number;
  productSales: number;
  serviceBreakdown: ServiceBreakdownRow[];
  trendBuckets: TrendBucket[];
  vsPrevious: {
    revenue: number;
    expenses: number;
    profit: number;
    revenueChangePct: number | null;
    profitChangePct: number | null;
    expensesChangePct: number | null;
  };
}

const EMPTY: FinanceMetrics = {
  revenue: 0,
  expenses: 0,
  profit: 0,
  grossMargin: 0,
  netMargin: 0,
  outstanding: 0,
  completedJobsValue: 0,
  labourCosts: 0,
  materialCosts: 0,
  productSales: 0,
  serviceBreakdown: [],
  trendBuckets: [],
  vsPrevious: { revenue: 0, expenses: 0, profit: 0, revenueChangePct: null, profitChangePct: null, expensesChangePct: null },
};

function resolveRange(period: FinancePeriod, filters: FinanceFilters): DateRange {
  if (filters.dateFrom && filters.dateTo) {
    return {
      start: startOfDay(new Date(filters.dateFrom)),
      end: new Date(`${filters.dateTo}T23:59:59.999`),
    };
  }
  return getFinancePeriodRange(period);
}

function matchesFilters(
  row: {
    service_id?: string | null;
    assigned_technician_id?: string | null;
    customer_id?: string | null;
    vehicle_id?: string | null;
  },
  filters: FinanceFilters
): boolean {
  if (filters.serviceId && row.service_id !== filters.serviceId) return false;
  if (filters.employeeId && row.assigned_technician_id !== filters.employeeId) return false;
  if (filters.customerId && row.customer_id !== filters.customerId) return false;
  if (filters.vehicleId && row.vehicle_id !== filters.vehicleId) return false;
  return true;
}

export function useFinanceAnalytics(period: FinancePeriod, filters: FinanceFilters) {
  const { version } = useDataRefresh();
  const [metrics, setMetrics] = useState<FinanceMetrics>(EMPTY);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => resolveRange(period, filters), [period, filters.dateFrom, filters.dateTo]);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
    const prevRange = getPreviousPeriodRange(range);

    const [invoicesRes, bookingsRes, ordersRes, usageRes, itemsRes, recipesRes] = await Promise.all([
      db.from('invoices').select('id, amount, status, created_at, paid_at, due_date, customer_id, description, booking_id, payments'),
      db.from('bookings').select('id, status, payment_status, scheduled_at, completed_at, service_id, assigned_technician_id, customer_id, vehicle_id, estimated_value, invoice_id, extra_items, discount, services(name, price)'),
      db.from('orders').select('total_amount, labour_cost, materials_cost, created_at, customer_id, services, booking_id'),
      db.from('inventory_usage').select('item_id, quantity_used, used_at, order_id'),
      db.from('inventory_items').select('id, unit_cost'),
      db.from('service_material_recipes').select('service_id, item_id, quantity_per_service'),
    ]);

    const invoices = ((invoicesRes.data ?? []) as MetricInvoice[]).filter((i) => !filters.customerId || i.customer_id === filters.customerId);
    const bookings = ((bookingsRes.data ?? []) as (MetricBooking & { assigned_technician_id?: string | null; vehicle_id?: string | null })[]).filter((b) => matchesFilters(b, filters));
    const events = buildRevenueEvents(invoices, bookings);
    const orders = ((ordersRes.data ?? []) as OrderRow[]).filter((o) => !filters.customerId || o.customer_id === filters.customerId);
    const usage = (usageRes.data ?? []) as UsageRow[];
    const itemCosts = new Map(((itemsRes.data ?? []) as ItemCostRow[]).map((i) => [i.id, Number(i.unit_cost ?? 0)]));

    // Real material cost per service = Σ recipe quantity × item unit cost
    const recipeCost = new Map<string, number>();
    for (const r of (recipesRes.data ?? []) as RecipeRow[]) {
      recipeCost.set(r.service_id, (recipeCost.get(r.service_id) ?? 0) + Number(r.quantity_per_service ?? 0) * (itemCosts.get(r.item_id) ?? 0));
    }

    const calcRevenue = (r: DateRange) => revenueIn(events, r);

    const ordersInRange = orders.filter((o) => inRange(o.created_at, range));
    const ordersPrev = orders.filter((o) => inRange(o.created_at, prevRange));

    const labourCosts = ordersInRange.reduce((s, o) => s + Number(o.labour_cost ?? 0), 0);
    const materialCosts = ordersInRange.reduce((s, o) => s + Number(o.materials_cost ?? 0), 0);

    const usageCost = (r: DateRange) => usage
      .filter((u) => inRange(u.used_at, r))
      .filter((u) => !filters.productId || u.item_id === filters.productId)
      .reduce((s, u) => s + Number(u.quantity_used) * (itemCosts.get(u.item_id) ?? 0), 0);

    const useProxy = materialCosts === 0 && labourCosts === 0;
    const expenses = materialCosts + labourCosts + (useProxy ? usageCost(range) : 0);
    const revenue = calcRevenue(range);
    const profit = revenue - expenses;
    const grossMargin = revenue ? ((revenue - materialCosts) / revenue) * 100 : 0;
    const netMargin = revenue ? (profit / revenue) * 100 : 0;

    const outstanding = outstandingAmount(invoices);

    const doneInRange = completedIn(bookings, range);
    const completedJobsValue = doneInRange.reduce((s, b) => s + bookingValue(b), 0);

    // Service breakdown: only finished work, cost from recipes when a recipe exists.
    const svcMap = new Map<string, ServiceBreakdownRow>();
    for (const b of doneInRange) {
      const svc = (Array.isArray(b.services) ? b.services[0] : b.services) as { name?: string; price?: number } | null;
      const key = b.service_id ?? svc?.name ?? 'other';
      const price = bookingValue(b);
      const hasRecipe = b.service_id ? (recipeCost.get(b.service_id) ?? 0) > 0 : false;
      const cost = hasRecipe ? (recipeCost.get(b.service_id as string) ?? 0) : price * 0.7;
      const row = svcMap.get(key) ?? { id: key, name: svc?.name ?? 'Прочее', revenue: 0, count: 0, profit: 0, cost: 0, costSource: 'estimate' as const };
      row.revenue += price;
      row.count += 1;
      row.cost += cost;
      row.profit += price - cost;
      if (hasRecipe) row.costSource = 'recipe';
      svcMap.set(key, row);
    }

    // Trend: granularity follows the range; previous period lined up bucket-by-bucket.
    const gran = pickGranularity(range);
    const buckets = buildBuckets(range, gran);
    const prevBuckets = buildBuckets(prevRange, gran, prevRange.end);
    const bucketExpenses = (r: DateRange, list: typeof orders) =>
      list.filter((o) => inRange(o.created_at, r)).reduce((s, o) => s + Number(o.labour_cost ?? 0) + Number(o.materials_cost ?? 0), 0)
      + (useProxy ? usageCost(r) : 0);

    const trendBuckets: TrendBucket[] = buckets.map((b, i) => {
      const br = { start: b.start, end: b.end };
      const pb = prevBuckets[i];
      const rev = calcRevenue(br);
      const exp = bucketExpenses(br, orders);
      return {
        label: b.label,
        long: b.long,
        revenue: rev,
        expenses: exp,
        profit: rev - exp,
        prevRevenue: pb ? calcRevenue({ start: pb.start, end: pb.end }) : 0,
        prevExpenses: pb ? bucketExpenses({ start: pb.start, end: pb.end }, orders) : 0,
      };
    });

    const prevRevenue = calcRevenue(prevRange);
    const prevExpenses = ordersPrev.reduce((s, o) => s + Number(o.labour_cost ?? 0) + Number(o.materials_cost ?? 0), 0);
    const prevProfit = prevRevenue - prevExpenses;

    setMetrics({
      revenue,
      expenses,
      profit,
      grossMargin,
      netMargin,
      outstanding,
      completedJobsValue,
      labourCosts,
      materialCosts,
      productSales: materialCosts,
      serviceBreakdown: [...svcMap.values()].sort((a, b) => b.revenue - a.revenue),
      trendBuckets,
      vsPrevious: {
        revenue: prevRevenue,
        expenses: prevExpenses,
        profit: prevProfit,
        revenueChangePct: pctChange(revenue, prevRevenue),
        profitChangePct: pctChange(profit, prevProfit),
        expensesChangePct: pctChange(expenses, prevExpenses),
      },
    });
    } catch (err) {
      console.error('useFinanceAnalytics: fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [range, filters, period, version]);

  useEffect(() => { fetch(); }, [fetch]);

  return { metrics, loading, refetch: fetch, range };
}
