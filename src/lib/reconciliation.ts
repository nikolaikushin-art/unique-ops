/**
 * Platform reconciliation: cross-module tie-outs and data-integrity checks.
 * Pure `runReconciliation` + explicit, admin-triggered `applyFix` actions.
 */
import { db } from './localdb';
import { WORKFLOW_STAGES } from './constants';
import { endOfDay, getComparisonRanges, startOfDay } from './analytics';
import {
  bookingValue,
  buildRevenueEvents,
  completedIn,
  doneAt,
  isDoneStatus,
  invoicePaidAmount,
  isInvoiceOverdue,
  isJobActive,
  linkInvoicesToBookings,
  outstandingAmount,
  revenueIn,
  serviceName,
  type MetricBooking,
  type MetricInvoice,
} from './metrics';
import { LEGACY_STAGE_MAP, STATUS_TO_KANBAN, normalizePipelineStage, vehiclesInWorkshop } from './workflow';

export type Severity = 'ok' | 'info' | 'warning' | 'critical';
export type ReconGroup = 'tieout' | 'finance' | 'operations' | 'customers' | 'staff' | 'inventory';
export type FixId = 'sync-booking-paid' | 'mark-overdue' | 'sync-vehicle-stage' | 'recalc-customers';

export interface ReconCheck {
  id: string;
  group: ReconGroup;
  title: string;
  description: string;
  severity: Severity;
  items: string[];
  /** Tie-out checks show both sides. */
  expected?: string;
  actual?: string;
  fixId?: FixId;
  fixLabel?: string;
}

export interface ReconBooking extends MetricBooking {
  vehicle_id?: string | null;
  assigned_technician_id?: string | null;
  created_at?: string;
}
export interface ReconInvoice extends MetricInvoice { invoice_number?: string }
export interface ReconCustomer { id: string; full_name: string; visit_count?: number | null; lifetime_value?: number | null; last_visit_at?: string | null; status?: string; created_at: string }
export interface ReconVehicle { id: string; customer_id?: string | null; brand: string; model: string; pipeline_stage: string; registration_number?: string | null }
export interface ReconStaff { id: string; full_name: string; workload_pct: number; is_active?: boolean }
export interface ReconItem { id: string; name: string; stock_level: number; min_stock_level: number; unit_cost?: number | null; is_active?: boolean; supplier?: string | null; expiry_date?: string | null }

export interface ReconData {
  customers: ReconCustomer[];
  vehicles: ReconVehicle[];
  bookings: ReconBooking[];
  invoices: ReconInvoice[];
  staff: ReconStaff[];
  inventory: ReconItem[];
  suppliers: { name: string }[];
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');

function sev(count: number, level: Exclude<Severity, 'ok'>): Severity {
  return count > 0 ? level : 'ok';
}

/** Which vehicle stage a vehicle should be in, from its most advanced active booking. */
function expectedStage(vehicleId: string, bookings: ReconBooking[]): { stage: string; booking: ReconBooking } | null {
  const active = bookings.filter((b) => b.vehicle_id === vehicleId && isJobActive(b));
  if (!active.length) return null;
  const order = ['new_enquiry', 'confirmed', 'vehicle_received', 'inspection', 'awaiting_approval', 'in_progress', 'quality_check'];
  active.sort((a, b) => order.indexOf(b.status) - order.indexOf(a.status));
  const stage = STATUS_TO_KANBAN[active[0].status];
  return stage ? { stage, booking: active[0] } : null;
}

export function runReconciliation(d: ReconData, now = new Date()): ReconCheck[] {
  const checks: ReconCheck[] = [];
  const cust = new Map(d.customers.map((c) => [c.id, c.full_name]));
  const veh = new Map(d.vehicles.map((v) => [v.id, `${v.brand} ${v.model}`]));
  const links = linkInvoicesToBookings(d.invoices, d.bookings);
  const invById = new Map(d.invoices.map((i) => [i.id ?? '', i]));
  const bookById = new Map(d.bookings.map((b) => [b.id ?? '', b]));
  const events = buildRevenueEvents(d.invoices, d.bookings);
  const month = getComparisonRanges('month', now).current;
  const bLabel = (b: ReconBooking) => `${cust.get(b.customer_id ?? '') ?? 'Без клиента'} · ${serviceName(b) || 'без услуги'} · ${dt(b.scheduled_at)}`;
  const iLabel = (i: ReconInvoice) => `${i.invoice_number ?? 'Счёт'} · ${cust.get(i.customer_id ?? '') ?? 'Без клиента'} · ${rub(Number(i.amount))}`;

  /* ---------- Tie-outs: the same number reached two different ways ---------- */
  {
    const headline = revenueIn(events, month);
    let daily = 0;
    for (let day = new Date(month.start); day <= month.end; day.setDate(day.getDate() + 1)) {
      daily += revenueIn(events, { start: startOfDay(day), end: endOfDay(day) });
    }
    checks.push({
      id: 'tie-revenue', group: 'tieout', title: 'Выручка за месяц = сумма по дням',
      description: 'Единое определение выручки (получено денег): итог периода должен совпадать с суммой дневных значений на графиках.',
      severity: Math.round(headline) === Math.round(daily) ? 'ok' : 'critical', items: [], expected: rub(headline), actual: rub(daily),
    });
  }
  {
    const byStatus = d.invoices.reduce((s, i) => s + Number(i.amount), 0);
    const parts = d.invoices.reduce((s, i) => s + invoicePaidAmount(i), 0) + outstandingAmount(d.invoices);
    checks.push({
      id: 'tie-invoices', group: 'tieout', title: 'Счета: оплачено + к оплате = всего выставлено',
      description: '«К оплате» на Обзоре и в Финансах — это все неоплаченные счета.',
      severity: Math.round(byStatus) === Math.round(parts) ? 'ok' : 'critical', items: [], expected: rub(byStatus), actual: rub(parts),
    });
  }
  {
    const done = completedIn(d.bookings, month);
    const withService = done.filter((b) => serviceName(b)).length;
    checks.push({
      id: 'tie-completed', group: 'tieout', title: 'Завершённые работы: все имеют услугу',
      description: 'Число завершённых за месяц работ должно совпадать с суммой по услугам в отчётах.',
      severity: withService === done.length ? 'ok' : 'warning',
      items: done.filter((b) => !serviceName(b)).map(bLabel), expected: String(done.length), actual: String(withService),
    });
  }
  {
    const inShop = vehiclesInWorkshop(d.vehicles).length;
    const arrived = new Set(d.bookings.filter((b) => isJobActive(b) && b.vehicle_id && !['new_enquiry', 'confirmed'].includes(b.status)).map((b) => b.vehicle_id));
    const withJob = arrived.size;
    const notArrived = vehiclesInWorkshop(d.vehicles).filter((v) => !arrived.has(v.id)).map((v) => `${v.brand} ${v.model}: в цехе по этапу «${normalizePipelineStage(v.pipeline_stage)}», но автомобиль ещё не принят по заказу`);
    checks.push({
      id: 'tie-workshop', group: 'tieout', title: 'Авто в цехе = автомобили с активным заказом',
      description: 'Производство (Kanban) и заказы должны показывать одни и те же автомобили.',
      severity: inShop === withJob ? 'ok' : 'warning', items: notArrived, expected: String(withJob), actual: String(inShop),
    });
  }
  {
    const active = d.bookings.filter(isJobActive);
    const assigned = active.filter((b) => b.assigned_technician_id).length;
    checks.push({
      id: 'tie-assigned', group: 'tieout', title: 'Активные заказы: у каждого есть техник',
      description: 'Сумма заказов по техникам должна равняться числу активных заказов.',
      severity: assigned === active.length ? 'ok' : 'warning',
      items: active.filter((b) => !b.assigned_technician_id).map(bLabel), expected: String(active.length), actual: String(assigned),
    });
  }

  /* ---------- Finance ---------- */
  {
    const items: string[] = [];
    for (const [bid, iid] of links) {
      const b = bookById.get(bid)!; const i = invById.get(iid)!;
      if (i.status === 'paid' && b.payment_status !== 'paid') items.push(`${iLabel(i)} оплачен, а бронь «${b.payment_status ?? '—'}»`);
    }
    checks.push({ id: 'paid-invoice-booking', group: 'finance', title: 'Счёт оплачен, бронь — нет', description: 'Оплаченный счёт должен отражаться в статусе оплаты брони.', severity: sev(items.length, 'warning'), items, fixId: items.length ? 'sync-booking-paid' : undefined, fixLabel: 'Отметить брони оплаченными' });
  }
  {
    const items: string[] = [];
    for (const [bid, iid] of links) {
      const b = bookById.get(bid)!; const i = invById.get(iid)!;
      if (b.payment_status === 'paid' && i.status !== 'paid') items.push(`${bLabel(b)}: бронь оплачена, а ${iLabel(i)} — «${i.status}»`);
    }
    checks.push({ id: 'paid-booking-invoice', group: 'finance', title: 'Бронь оплачена, счёт — нет', description: 'Деньги отмечены на брони, но счёт не закрыт. В выручку такие деньги не попадают, пока счёт не оплачен — решите вручную, какой статус верный.', severity: sev(items.length, 'critical'), items });
  }
  {
    const items: string[] = [];
    for (const [bid, iid] of links) {
      const b = bookById.get(bid)!; const i = invById.get(iid)!;
      if (Math.round(Number(i.amount)) !== Math.round(bookingValue(b))) items.push(`${iLabel(i)} ≠ стоимость брони ${rub(bookingValue(b))}`);
    }
    checks.push({ id: 'amount-mismatch', group: 'finance', title: 'Сумма счёта не равна стоимости брони', description: 'Счёт и бронь связаны по клиенту и услуге, но суммы расходятся (скидка, доплата или ошибка ввода).', severity: sev(items.length, 'warning'), items });
  }
  {
    const linked = new Set(links.values());
    const items = d.invoices.filter((i) => i.id && !linked.has(i.id)).map((i) => `${iLabel(i)} — ${i.description ?? 'без описания'}`);
    checks.push({ id: 'invoice-no-booking', group: 'finance', title: 'Счета без связанной брони', description: 'Нет брони того же клиента и услуги. Возможно, это разовый счёт — или описание не совпало с названием услуги.', severity: sev(items.length, 'info'), items });
  }
  {
    const items = d.invoices.filter((i) => new Date(i.created_at).getTime() > now.getTime()).map((i) => `${iLabel(i)} · создан ${dt(i.created_at)}`);
    checks.push({ id: 'invoice-future', group: 'finance', title: 'Счета с датой создания в будущем', description: 'Дата счёта позже сегодняшней — такие счета искажают динамику и просрочку.', severity: sev(items.length, 'warning'), items });
  }
  {
    const items = d.invoices.filter((i) => i.status === 'paid' && !i.paid_at).map(iLabel);
    const bad = d.invoices.filter((i) => i.status === 'paid' && i.paid_at && new Date(i.paid_at) < new Date(i.created_at)).map((i) => `${iLabel(i)} · оплата раньше создания`);
    checks.push({ id: 'paid-date', group: 'finance', title: 'Оплаченные счета: проблемы с датой оплаты', description: 'Выручка считается по дате оплаты. Если её нет, берётся дата создания счёта.', severity: sev(items.length + bad.length, 'warning'), items: [...items, ...bad] });
  }
  {
    const items = d.invoices.filter((i) => i.status === 'pending' && isInvoiceOverdue(i, now)).map((i) => `${iLabel(i)} · срок ${dt(i.due_date)}`);
    checks.push({ id: 'overdue-status', group: 'finance', title: 'Срок истёк, а статус «ожидает оплаты»', description: 'Просрочка учитывается в метриках по дате, но статус в списке счетов остаётся прежним.', severity: sev(items.length, 'warning'), items, fixId: items.length ? 'mark-overdue' : undefined, fixLabel: 'Пометить просроченными' });
  }

  /* ---------- Operations ---------- */
  {
    const items: string[] = [];
    for (const b of d.bookings) {
      if (!cust.has(b.customer_id ?? '')) items.push(`Бронь ${dt(b.scheduled_at)}: клиент не найден`);
      if (b.vehicle_id && !veh.has(b.vehicle_id)) items.push(`${bLabel(b)}: автомобиль не найден`);
      if (!serviceName(b)) items.push(`${bLabel(b)}: услуга не найдена`);
    }
    for (const v of d.vehicles) if (v.customer_id && !cust.has(v.customer_id)) items.push(`${v.brand} ${v.model}: владелец не найден`);
    for (const i of d.invoices) if (i.customer_id && !cust.has(i.customer_id)) items.push(`${iLabel(i)}: клиент не найден`);
    checks.push({ id: 'orphans', group: 'operations', title: 'Ссылки на несуществующие записи', description: 'Брони, авто и счета должны ссылаться на существующих клиентов, авто и услуги.', severity: sev(items.length, 'critical'), items });
  }
  {
    const valid = new Set<string>([...WORKFLOW_STAGES, ...Object.keys(LEGACY_STAGE_MAP)]);
    const items = d.vehicles.filter((v) => !valid.has(v.pipeline_stage)).map((v) => `${v.brand} ${v.model}: этап «${v.pipeline_stage}»`);
    checks.push({ id: 'stage-invalid', group: 'operations', title: 'Этап авто не из списка этапов производства', description: 'В поле этапа записан не этап Kanban. Отображение исправлено автоматически, но лучше привести данные к единому виду.', severity: sev(items.length, 'info'), items, fixId: items.length ? 'sync-vehicle-stage' : undefined, fixLabel: 'Привести этапы' });
  }
  {
    const items: string[] = [];
    for (const v of d.vehicles) {
      const exp = expectedStage(v.id, d.bookings);
      if (exp && normalizePipelineStage(v.pipeline_stage) !== exp.stage) items.push(`${v.brand} ${v.model}: этап «${normalizePipelineStage(v.pipeline_stage)}», а заказ «${exp.stage}»`);
    }
    checks.push({ id: 'stage-drift', group: 'operations', title: 'Этап авто расходится со статусом заказа', description: 'Производство и заказы должны показывать одно и то же состояние автомобиля.', severity: sev(items.length, 'warning'), items, fixId: items.length ? 'sync-vehicle-stage' : undefined, fixLabel: 'Синхронизировать этапы' });
  }
  {
    const items = d.vehicles.filter((v) => !['Завершено', 'Готов к выдаче'].includes(normalizePipelineStage(v.pipeline_stage)) && !d.bookings.some((b) => b.vehicle_id === v.id && isJobActive(b))).map((v) => `${v.brand} ${v.model} в цехе, но активного заказа нет`);
    checks.push({ id: 'shop-no-job', group: 'operations', title: 'Авто в цехе без активного заказа', description: 'Автомобиль числится в производстве, но нет заказа, который его ведёт.', severity: sev(items.length, 'warning'), items });
  }
  {
    const items = d.bookings.filter((b) => isDoneStatus(b.status) && !b.completed_at).map((b) => `${bLabel(b)} · нет даты завершения`);
    const bad = d.bookings.filter((b) => b.completed_at && new Date(b.completed_at) < new Date(b.scheduled_at)).map((b) => `${bLabel(b)} · завершено раньше начала`);
    checks.push({ id: 'completed-dates', group: 'operations', title: 'Завершённые работы: проблемы с датами', description: 'Отчёты по периодам используют дату завершения; без неё берётся дата записи.', severity: sev(items.length + bad.length, 'warning'), items: [...items, ...bad] });
  }
  {
    const items = d.bookings.filter((b) => isDoneStatus(b.status) && b.payment_status !== 'paid' && !links.has(b.id ?? '')).map((b) => `${bLabel(b)} · оплата «${b.payment_status ?? '—'}»`);
    checks.push({ id: 'done-unpaid', group: 'operations', title: 'Выполнено, но не оплачено и без счёта', description: 'Работа сдана, а ни счёта, ни оплаты нет — деньги не отслеживаются.', severity: sev(items.length, 'warning'), items });
  }

  /* ---------- Customers ---------- */
  {
    const items: string[] = [];
    const now2 = now;
    for (const c of d.customers) {
      const done = d.bookings.filter((b) => b.customer_id === c.id && isDoneStatus(b.status));
      const cInv = d.invoices.filter((i) => i.customer_id === c.id);
      const cLinks = buildRevenueEvents(cInv, d.bookings.filter((b) => b.customer_id === c.id)).reduce((s, e) => s + e.amount, 0);
      if ((c.visit_count ?? 0) < done.length) items.push(`${c.full_name}: визитов ${c.visit_count ?? 0}, завершённых работ ${done.length}`);
      if (Number(c.lifetime_value ?? 0) + 0.5 < cLinks) items.push(`${c.full_name}: LTV ${rub(Number(c.lifetime_value ?? 0))}, оплачено ${rub(cLinks)}`);
      const last = done.map((b) => new Date(doneAt(b)).getTime()).sort((a, b) => b - a)[0];
      if (last && (!c.last_visit_at || new Date(c.last_visit_at).getTime() + 86400000 < last) && last <= now2.getTime()) items.push(`${c.full_name}: последний визит ${dt(c.last_visit_at)}, а работа была ${dt(new Date(last).toISOString())}`);
    }
    checks.push({ id: 'customer-stats', group: 'customers', title: 'Карточки клиентов отстают от фактических данных', description: 'Визиты, LTV и дата последнего визита в карточке меньше, чем следует из броней и оплат. (Большее значение допустимо — это может быть история до системы.)', severity: sev(items.length, 'warning'), items, fixId: items.length ? 'recalc-customers' : undefined, fixLabel: 'Подтянуть до фактических' });
  }
  {
    const items = d.customers.filter((c) => c.status === 'sleeping' && c.last_visit_at && now.getTime() - new Date(c.last_visit_at).getTime() < 60 * 86400000).map((c) => `${c.full_name}: «спящий», но визит был ${dt(c.last_visit_at)}`);
    checks.push({ id: 'customer-status', group: 'customers', title: 'Статус клиента не соответствует активности', description: 'Клиент со статусом «спящий», но недавно был в студии.', severity: sev(items.length, 'info'), items });
  }

  /* ---------- Staff ---------- */
  {
    const items: string[] = [];
    for (const s of d.staff) {
      const active = d.bookings.filter((b) => b.assigned_technician_id === s.id && isJobActive(b)).length;
      if (s.workload_pct > 0 && active === 0) items.push(`${s.full_name}: загрузка ${s.workload_pct}%, активных заказов нет`);
      if (s.workload_pct === 0 && active > 0) items.push(`${s.full_name}: загрузка 0%, но заказов ${active}`);
      if (s.is_active === false && active > 0) items.push(`${s.full_name}: неактивен, но за ним ${active} активных заказов`);
    }
    checks.push({ id: 'staff-load', group: 'staff', title: 'Загрузка сотрудников не совпадает с заказами', description: 'Процент загрузки хранится отдельно от заказов. Расхождение значит, что график и карточка команды показывают разное.', severity: sev(items.length, 'warning'), items });
  }

  /* ---------- Inventory ---------- */
  {
    const items = d.inventory.filter((i) => Number(i.stock_level) < 0).map((i) => `${i.name}: остаток ${i.stock_level}`);
    checks.push({ id: 'stock-negative', group: 'inventory', title: 'Отрицательные остатки', description: 'Списано больше, чем числилось на складе.', severity: sev(items.length, 'critical'), items });
  }
  {
    const items = d.inventory.filter((i) => i.is_active !== false && !(Number(i.unit_cost) > 0)).map((i) => `${i.name}: нет закупочной цены`);
    checks.push({ id: 'stock-cost', group: 'inventory', title: 'Позиции без закупочной цены', description: 'Без цены не считаются стоимость склада, расход и себестоимость услуг.', severity: sev(items.length, 'warning'), items });
  }
  {
    const names = new Set(d.suppliers.map((s) => s.name.trim().toLowerCase()));
    const items = d.inventory.filter((i) => i.supplier && !names.has(i.supplier.trim().toLowerCase())).map((i) => `${i.name}: поставщик «${i.supplier}» не найден в справочнике`);
    checks.push({ id: 'stock-supplier', group: 'inventory', title: 'Поставщик позиции не в справочнике', description: 'Название поставщика в карточке позиции не совпадает ни с одним поставщиком.', severity: sev(items.length, 'info'), items });
  }
  {
    const items = d.inventory.filter((i) => i.expiry_date && new Date(i.expiry_date) < now && Number(i.stock_level) > 0).map((i) => `${i.name}: срок истёк ${dt(i.expiry_date)}, остаток ${i.stock_level}`);
    checks.push({ id: 'stock-expired', group: 'inventory', title: 'Просроченные материалы на складе', description: 'Остаток с истёкшим сроком годности нужно списать.', severity: sev(items.length, 'critical'), items });
  }
  return checks;
}

/* ------------------------------ fixes ------------------------------ */

/** Applies one safe, explicit correction. Returns the number of records changed. */
export async function applyFix(fixId: FixId, d: ReconData, now = new Date()): Promise<number> {
  let changed = 0;
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

  if (fixId === 'sync-booking-paid') {
    const links = linkInvoicesToBookings(d.invoices, d.bookings);
    const invById = new Map(d.invoices.map((i) => [i.id ?? '', i]));
    for (const [bid, iid] of links) {
      const b = d.bookings.find((x) => x.id === bid);
      if (invById.get(iid)?.status === 'paid' && b && b.payment_status !== 'paid') {
        const { error } = await db.from('bookings').update({ payment_status: 'paid' }).eq('id', bid);
        fail(error); changed++;
      }
    }
  }

  if (fixId === 'mark-overdue') {
    for (const i of d.invoices) {
      if (i.status === 'pending' && isInvoiceOverdue(i, now) && i.id) {
        const { error } = await db.from('invoices').update({ status: 'overdue' }).eq('id', i.id);
        fail(error); changed++;
      }
    }
  }

  if (fixId === 'sync-vehicle-stage') {
    const valid = new Set<string>([...WORKFLOW_STAGES, ...Object.keys(LEGACY_STAGE_MAP)]);
    for (const v of d.vehicles) {
      // 1) follow the active order; 2) otherwise just normalise an invalid stage value
      const target = expectedStage(v.id, d.bookings)?.stage ?? (valid.has(v.pipeline_stage) ? null : normalizePipelineStage(v.pipeline_stage));
      if (target && v.pipeline_stage !== target) {
        const { error } = await db.from('vehicles').update({ pipeline_stage: target }).eq('id', v.id);
        fail(error); changed++;
      }
    }
  }

  if (fixId === 'recalc-customers') {
    for (const c of d.customers) {
      const mine = d.bookings.filter((b) => b.customer_id === c.id);
      const done = mine.filter((b) => isDoneStatus(b.status));
      const paid = buildRevenueEvents(d.invoices.filter((i) => i.customer_id === c.id), mine).reduce((s, e) => s + e.amount, 0);
      const last = done.map((b) => new Date(doneAt(b)).getTime()).filter((t) => t <= now.getTime()).sort((a, b) => b - a)[0];
      const patch: Record<string, unknown> = {};
      if ((c.visit_count ?? 0) < done.length) patch.visit_count = done.length;
      if (Number(c.lifetime_value ?? 0) < paid) patch.lifetime_value = paid;
      if (last && (!c.last_visit_at || new Date(c.last_visit_at).getTime() + 86400000 < last)) patch.last_visit_at = new Date(last).toISOString();
      if (Object.keys(patch).length) {
        const { error } = await db.from('customers').update(patch).eq('id', c.id);
        fail(error); changed++;
      }
    }
  }
  return changed;
}

export async function loadReconData(): Promise<ReconData> {
  const [c, v, b, i, s, inv, sup] = await Promise.all([
    db.from('customers').select('id, full_name, visit_count, lifetime_value, last_visit_at, status, created_at'),
    db.from('vehicles').select('id, customer_id, brand, model, pipeline_stage, registration_number'),
    db.from('bookings').select('id, status, scheduled_at, completed_at, eta_at, created_at, payment_status, customer_id, vehicle_id, service_id, assigned_technician_id, estimated_value, invoice_id, extra_items, discount, services(name, price)'),
    db.from('invoices').select('id, invoice_number, amount, status, created_at, paid_at, due_date, customer_id, description, booking_id, payments'),
    db.from('staff').select('id, full_name, workload_pct, is_active'),
    db.from('inventory_items').select('id, name, stock_level, min_stock_level, unit_cost, is_active, supplier, expiry_date'),
    db.from('suppliers').select('name'),
  ]);
  return {
    customers: (c.data ?? []) as ReconCustomer[],
    vehicles: (v.data ?? []) as ReconVehicle[],
    bookings: (b.data ?? []) as ReconBooking[],
    invoices: (i.data ?? []) as ReconInvoice[],
    staff: (s.data ?? []) as ReconStaff[],
    inventory: (inv.data ?? []) as ReconItem[],
    suppliers: (sup.data ?? []) as { name: string }[],
  };
}

