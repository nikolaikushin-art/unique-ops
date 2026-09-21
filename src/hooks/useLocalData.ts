import { useState, useEffect, useCallback } from 'react';
import { db, type Row } from '../lib/localdb';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { WORKFLOW_STAGES } from '../lib/constants';
import { vehiclesInWorkshop, normalizePipelineStage } from '../lib/workflow';
import { endOfDay, getComparisonRanges, startOfDay } from '../lib/analytics';
import {
  buildRevenueEvents,
  isInvoiceOverdue,
  isJobActive,
  outstandingAmount,
  revenueIn,
  type MetricBooking,
  type MetricInvoice,
} from '../lib/metrics';

export function useLocalQuery<T>(
  table: string,
  select = '*',
  options?: { orderBy?: string; ascending?: boolean; filter?: Record<string, unknown> }
) {
  const { version } = useDataRefresh();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = db.from(table).select(select);
    if (options?.filter) {
      for (const [key, val] of Object.entries(options.filter)) {
        query = query.eq(key, val);
      }
    }
    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options?.ascending ?? false });
    }
    const { data: rows, error: err } = await query;
    if (err) setError(err.message);
    else {
      setData((rows as T[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }, [table, select, options?.orderBy, options?.ascending, JSON.stringify(options?.filter)]);

  useEffect(() => { fetch(); }, [fetch, version]);

  const insert = async (row: Partial<T>) => {
    const { error: err } = await db.from(table).insert(row as Record<string, unknown>);
    if (!err) await fetch();
    return err?.message ?? null;
  };

  const update = async (id: string, row: Partial<T>) => {
    const { error: err } = await db.from(table).update(row as Record<string, unknown>).eq('id', id);
    if (!err) await fetch();
    return err?.message ?? null;
  };

  const remove = async (id: string) => {
    const { error: err } = await db.from(table).delete().eq('id', id);
    if (!err) await fetch();
    return err?.message ?? null;
  };

  return { data, loading, error, refetch: fetch, insert, update, remove };
}

export function useDashboardStats() {
  const { version } = useDataRefresh();
  const [stats, setStats] = useState({
    activeBookings: 0,
    inProgress: 0,
    planned: 0,
    awaitingApproval: 0,
    completedToday: 0,
    carsInProd: 0,
    awaitingInspection: 0,
    paidRevenue: 0,
    owedAmount: 0,
    overdueCount: 0,
    revenueSeries: [0, 0, 0, 0, 0, 0, 0],
  });
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const [bookings, vehicles, invoices, inspections] = await Promise.all([
        db.from('bookings').select('id, status, scheduled_at, completed_at, eta_at, payment_status, customer_id, estimated_value, invoice_id, extra_items, discount, services(name, price)'),
        db.from('vehicles').select('id, pipeline_stage'),
        db.from('invoices').select('id, amount, status, created_at, paid_at, due_date, customer_id, description, booking_id, payments'),
        db.from('inspections').select('vehicle_id'),
      ]);

      if (bookings.error || vehicles.error || invoices.error || inspections.error) {
        return;
      }

      const b: Row[] = bookings.data ?? [];
      const v = (vehicles.data ?? []) as { id: string; pipeline_stage: string }[];
      const inv: Row[] = invoices.data ?? [];
      const inspVehicles = new Set((inspections.data ?? []).map((i: Row) => i.vehicle_id));
      const todayStr = new Date().toISOString().slice(0, 10);
      // Canonical definitions (lib/metrics.ts): month-to-date cash revenue, same as Finance / Reports / Overview
      const events = buildRevenueEvents(inv as MetricInvoice[], b as unknown as MetricBooking[]);
      const paid = revenueIn(events, getComparisonRanges('month').current);
      const owed = outstandingAmount(inv as MetricInvoice[]);

      const now = new Date();
      const series = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(now);
        day.setDate(day.getDate() - (6 - i));
        return revenueIn(events, { start: startOfDay(day), end: endOfDay(day) });
      });

      const workshop = vehiclesInWorkshop(v);

      setStats({
        activeBookings: b.filter((x) => isJobActive(x as unknown as MetricBooking)).length,
        inProgress: b.filter((x) => x.status === 'in_progress').length,
        planned: b.filter((x) => ['new_enquiry', 'confirmed', 'vehicle_received'].includes(x.status)).length,
        awaitingApproval: b.filter((x) => x.status === 'awaiting_approval').length,
        completedToday: b.filter((x) => ['completed', 'delivered'].includes(x.status) && (x.completed_at?.startsWith(todayStr) || x.scheduled_at?.startsWith(todayStr))).length,
        carsInProd: workshop.length,
        awaitingInspection: v.filter((veh) => !inspVehicles.has(veh.id) && WORKFLOW_STAGES.indexOf(normalizePipelineStage(veh.pipeline_stage) as typeof WORKFLOW_STAGES[number]) <= 1).length,
        paidRevenue: paid,
        owedAmount: owed,
        overdueCount: inv.filter((i) => isInvoiceOverdue(i as MetricInvoice, now)).length,
        revenueSeries: series,
      });
    } catch (err) {
      // Network/config failure (bad env vars, offline, CORS, etc). Swallow it
      // so the dashboard falls back to zeroed stats instead of spinning on
      // "Загрузка данных..." forever.
      console.error('useDashboardStats: fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch, version]);

  return { stats, loading, refetch: fetch };
}
