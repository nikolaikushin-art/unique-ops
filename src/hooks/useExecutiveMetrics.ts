import { useState, useEffect, useCallback } from 'react';
import { db, type Row } from '../lib/localdb';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { WORKFLOW_STAGES } from '../lib/constants';
import { vehiclesInWorkshop, groupVehiclesByStage } from '../lib/workflow';
import { unwrapRelation } from '../lib/relations';
import { getLowStock } from '../lib/inventory';
import {
  averageCheck,
  buildRevenueEvents,
  completedIn,
  isInvoiceOverdue,
  isJobActive,
  isJobDelayed,
  revenueIn,
  type MetricBooking,
  type MetricInvoice,
  type RevenueEvent,
} from '../lib/metrics';
import {
  getComparisonRanges,
  inRange,
  pctChange,
  type PeriodComparison,
} from '../lib/analytics';
import type { InventoryItem, Vehicle } from '../types/database';

export interface ComparisonMetric {
  current: number;
  previous: number;
  changePct: number | null;
}

export interface ExecutiveMetrics {
  revenue: ComparisonMetric;
  completedJobs: ComparisonMetric;
  activeJobs: number;
  pendingJobs: number;
  cancelledJobs: number;
  avgJobValue: number;
  newCustomers: ComparisonMetric;
  returningCustomers: number;
  retentionProxy: number;
  workflowCounts: Record<string, number>;
  delayedJobs: number;
  lowStockCount: number;
  overdueInvoices: number;
  pendingApprovals: number;
  revenueSeries: number[];
  stageGroups: ReturnType<typeof groupVehiclesByStage<Vehicle>>;
  comparisons: Record<'day' | 'week' | 'month' | 'quarter' | 'year', {
    revenue: ComparisonMetric;
    completedJobs: ComparisonMetric;
    newCustomers: ComparisonMetric;
  }>;
}

function normalizeBooking(raw: Record<string, unknown>): MetricBooking {
  return {
    id: String(raw.id ?? ''),
    status: String(raw.status ?? ''),
    scheduled_at: String(raw.scheduled_at ?? ''),
    completed_at: raw.completed_at as string | null | undefined,
    eta_at: raw.eta_at as string | null | undefined,
    payment_status: String(raw.payment_status ?? ''),
    customer_id: raw.customer_id as string | null | undefined,
    service_id: raw.service_id as string | null | undefined,
    estimated_value: raw.estimated_value as number | null | undefined,
    services: unwrapRelation(raw.services as { name?: string; price?: number } | { name?: string; price?: number }[] | null),
  };
}

function countNewCustomers(customers: { created_at: string }[], range: { start: Date; end: Date }): number {
  return customers.filter((c) => inRange(c.created_at, range)).length;
}

function buildComparison(
  currentVal: number,
  previousVal: number
): ComparisonMetric {
  return { current: currentVal, previous: previousVal, changePct: pctChange(currentVal, previousVal) };
}

function calcForPeriods<T extends 'day' | 'week' | 'month' | 'quarter' | 'year'>(
  kinds: T[],
  events: RevenueEvent[],
  bookings: MetricBooking[],
  customers: Parameters<typeof countNewCustomers>[0]
) {
  const out = {} as ExecutiveMetrics['comparisons'];
  for (const kind of kinds) {
    const { current, previous } = getComparisonRanges(kind);
    out[kind] = {
      revenue: buildComparison(revenueIn(events, current), revenueIn(events, previous)),
      completedJobs: buildComparison(completedIn(bookings, current).length, completedIn(bookings, previous).length),
      newCustomers: buildComparison(countNewCustomers(customers, current), countNewCustomers(customers, previous)),
    };
  }
  return out;
}

export function useExecutiveMetrics() {
  const { version } = useDataRefresh();
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
    const [bookingsRes, vehiclesRes, invoicesRes, customersRes, inventoryRes, inspectionsRes] = await Promise.all([
      db.from('bookings').select('id, status, scheduled_at, completed_at, eta_at, payment_status, customer_id, service_id, estimated_value, invoice_id, extra_items, discount, services(name, price)'),
      db.from('vehicles').select('id, brand, model, registration_number, pipeline_stage, eta_at, intake_at, customer_id, customers(full_name)'),
      db.from('invoices').select('id, amount, status, created_at, paid_at, due_date, customer_id, description, booking_id, payments'),
      db.from('customers').select('created_at, visit_count'),
      db.from('inventory_items').select('id, stock_level, min_stock_level, is_active'),
      db.from('inspections').select('vehicle_id'),
    ]);

    if (bookingsRes.error || vehiclesRes.error || invoicesRes.error) {
      return;
    }

    const bookings: MetricBooking[] = (bookingsRes.data ?? []).map((b: Row) => normalizeBooking(b as Record<string, unknown>));
    const vehicles = (vehiclesRes.data ?? []) as unknown as Vehicle[];
    const invoices = (invoicesRes.data ?? []) as MetricInvoice[];
    const events = buildRevenueEvents(invoices, bookings);
    const customers = (customersRes.data ?? []) as { created_at: string; visit_count: number }[];
    const inventory = (inventoryRes.data ?? []) as unknown as InventoryItem[];
    const inspVehicles = new Set((inspectionsRes.data ?? []).map((i: Row) => i.vehicle_id));

    const monthCmp = getComparisonRanges('month');
    const revenue = buildComparison(revenueIn(events, monthCmp.current), revenueIn(events, monthCmp.previous));
    const completedJobs = buildComparison(completedIn(bookings, monthCmp.current).length, completedIn(bookings, monthCmp.previous).length);
    const newCustomers = buildComparison(
      countNewCustomers(customers, monthCmp.current),
      countNewCustomers(customers, monthCmp.previous)
    );

    const activeJobs = bookings.filter(isJobActive).length;
    const pendingJobs = bookings.filter((b) => ['new_enquiry', 'confirmed', 'vehicle_received'].includes(b.status)).length;
    const cancelledJobs = bookings.filter((b) => b.status === 'cancelled').length;

    const avgJobValue = averageCheck(completedIn(bookings, monthCmp.current));

    const returningCustomers = customers.filter((c) => c.visit_count > 1).length;
    const totalCustomers = customers.length;
    const retentionProxy = totalCustomers ? Math.round((returningCustomers / totalCustomers) * 100) : 0;

    const stageGroups = groupVehiclesByStage(vehicles);
    const workflowCounts: Record<string, number> = {};
    for (const stage of WORKFLOW_STAGES) workflowCounts[stage] = stageGroups[stage]?.length ?? 0;

    const now = new Date();
    const delayedJobs = bookings.filter((b) => isJobDelayed(b, now)).length;

    const lowStockCount = getLowStock(inventory).length;
    const overdueInvoices = invoices.filter((i) => isInvoiceOverdue(i, now)).length;
    const pendingApprovals = bookings.filter((b) => b.status === 'awaiting_approval').length;

    const series = Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - i));
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      return revenueIn(events, { start: dayStart, end: dayEnd });
    });

    const workshop = vehiclesInWorkshop(vehicles);
    void workshop;
    void inspVehicles;

    setMetrics({
      revenue,
      completedJobs,
      activeJobs,
      pendingJobs,
      cancelledJobs,
      avgJobValue,
      newCustomers,
      returningCustomers,
      retentionProxy,
      workflowCounts,
      delayedJobs,
      lowStockCount,
      overdueInvoices,
      pendingApprovals,
      revenueSeries: series,
      stageGroups,
      comparisons: calcForPeriods(['day', 'week', 'month', 'quarter', 'year'], events, bookings, customers),
    });
    } catch (err) {
      console.error('useExecutiveMetrics: fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch, version]);

  return { metrics, loading, refetch: fetch };
}

export type { PeriodComparison };
