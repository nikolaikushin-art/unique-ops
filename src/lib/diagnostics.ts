/**
 * Diagnostics engine — turns raw dashboard numbers into plain-language findings.
 * Pure functions: no I/O, so they are cheap to re-run on every render.
 */
import type { FinanceMetrics } from '../hooks/useFinanceAnalytics';
import type { InventoryItem, Invoice } from '../types/database';
import { fmtCompact, fmtDelta } from '../components/charts/format';
import { overdueInvoiceList } from './metrics';

export type InsightTone = 'critical' | 'warning' | 'info' | 'positive';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  /** Short figure shown on the right, e.g. "−66,7%". */
  metric?: string;
  /** Id resolved by the page into a real action. */
  actionId?: string;
  actionLabel?: string;
}

const TONE_ORDER: Record<InsightTone, number> = { critical: 0, warning: 1, info: 2, positive: 3 };

export function sortInsights(list: Insight[]): Insight[] {
  return [...list].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/* ------------------------------------------------------------------ *
 *  Finance
 * ------------------------------------------------------------------ */

export interface FinanceDiagInput {
  metrics: FinanceMetrics;
  invoices: Invoice[];
  pendingBookings: number;
  ordersCount: number;
}

export function overdueInvoices(invoices: Invoice[], now = new Date()): Invoice[] {
  return overdueInvoiceList(invoices, now);
}

export function diagnoseFinance({ metrics: m, invoices, pendingBookings, ordersCount }: FinanceDiagInput): Insight[] {
  const out: Insight[] = [];
  const unpaid = invoices.filter((i) => i.status !== 'paid');
  const overdue = overdueInvoices(invoices);
  const overdueSum = overdue.reduce((s, i) => s + Number(i.amount), 0);

  // 1. Missing cost data → margin is not trustworthy
  if (m.revenue > 0 && m.expenses === 0) {
    out.push({
      id: 'no-costs',
      tone: 'warning',
      title: 'Расходы не учтены — маржа завышена',
      detail: pendingBookings > 0
        ? `Маржа 100% — это отсутствие данных, а не результат. Оформите ${pendingBookings} ${plural(pendingBookings, 'завершённую бронь', 'завершённые брони', 'завершённых броней')} как заказы: труд и материалы попадут в P&L.`
        : 'Маржа 100% — это отсутствие данных, а не результат. Добавьте труд и материалы в заказы, чтобы увидеть реальную прибыль.',
      metric: '100%',
      actionId: 'orders',
      actionLabel: pendingBookings > 0 ? 'К броням' : 'К заказам',
    });
  }

  // 2. Revenue dynamics
  const ch = m.vsPrevious.revenueChangePct;
  if (ch !== null && m.vsPrevious.revenue > 0) {
    if (ch <= -30) {
      out.push({ id: 'rev-drop', tone: 'critical', title: 'Выручка резко просела', detail: `Относительно предыдущего периода такой же длины: ${rub(m.vsPrevious.revenue)} → ${rub(m.revenue)}. Проверьте неоплаченные работы и загрузку постов.`, metric: fmtDelta(ch) });
    } else if (ch <= -10) {
      out.push({ id: 'rev-dip', tone: 'warning', title: 'Выручка ниже предыдущего периода', detail: `Было ${rub(m.vsPrevious.revenue)}, стало ${rub(m.revenue)}.`, metric: fmtDelta(ch) });
    } else if (ch >= 10) {
      out.push({ id: 'rev-up', tone: 'positive', title: 'Выручка растёт', detail: `Плюс ${rub(m.revenue - m.vsPrevious.revenue)} к предыдущему периоду такой же длины.`, metric: fmtDelta(ch) });
    }
  } else if (ch === null && m.revenue > 0) {
    out.push({ id: 'rev-new', tone: 'positive', title: 'Новый уровень выручки', detail: 'В предыдущем периоде оплат не было — сравнение пока не с чем строить.', metric: fmtCompact(m.revenue) + ' ₽' });
  }

  // 3. Receivables
  if (overdue.length > 0) {
    out.push({
      id: 'overdue',
      tone: 'critical',
      title: `Просрочено ${overdue.length} ${plural(overdue.length, 'счёт', 'счёта', 'счетов')}`,
      detail: `Сумма ${rub(overdueSum)}. Отправьте напоминание клиентам или предложите оплату онлайн.`,
      metric: `${fmtCompact(overdueSum)} ₽`,
      actionId: 'invoices',
      actionLabel: 'К счетам',
    });
  } else if (m.outstanding > 0) {
    const ratio = m.revenue > 0 ? m.outstanding / m.revenue : 1;
    out.push({
      id: 'receivable',
      tone: ratio > 1 ? 'warning' : 'info',
      title: 'Есть деньги в дебиторке',
      detail: `${unpaid.length} ${plural(unpaid.length, 'неоплаченный счёт', 'неоплаченных счёта', 'неоплаченных счетов')} на ${rub(m.outstanding)}${m.revenue > 0 ? ` — это ${Math.round(ratio * 100)}% от выручки периода` : ''}.`,
      metric: `${fmtCompact(m.outstanding)} ₽`,
      actionId: 'invoices',
      actionLabel: 'К счетам',
    });
  }

  // 4. Completed work that is not paid yet
  const unbilled = m.completedJobsValue - m.revenue;
  if (m.completedJobsValue > 0 && unbilled > m.completedJobsValue * 0.25) {
    out.push({
      id: 'unbilled',
      tone: 'warning',
      title: 'Работы выполнены, но не оплачены',
      detail: `Завершено на ${rub(m.completedJobsValue)}, получено ${rub(m.revenue)}. Разница ${rub(unbilled)} ещё не превратилась в деньги.`,
      metric: `${fmtCompact(unbilled)} ₽`,
    });
  }

  // 5. Completed bookings not turned into orders
  if (pendingBookings > 0 && !(m.revenue > 0 && m.expenses === 0)) {
    out.push({
      id: 'pending-orders',
      tone: 'info',
      title: `${pendingBookings} ${plural(pendingBookings, 'бронь ждёт', 'брони ждут', 'броней ждут')} оформления заказа`,
      detail: `Без заказа завершённая работа не попадает в расходы и P&L (заказов сейчас: ${ordersCount}).`,
      actionId: 'orders',
      actionLabel: 'Оформить',
    });
  }

  // 6. Revenue concentration
  const svc = m.serviceBreakdown;
  const svcTotal = svc.reduce((s, x) => s + x.revenue, 0);
  if (svc.length >= 2 && svcTotal > 0) {
    const top = svc[0];
    const share = top.revenue / svcTotal;
    if (share >= 0.5) {
      out.push({ id: 'concentration', tone: 'info', title: `Половина выручки — одна услуга`, detail: `«${top.name}» даёт ${Math.round(share * 100)}% выручки периода. Это сильная позиция, но и зависимость.`, metric: `${Math.round(share * 100)}%` });
    }
  }

  // 7. Service margin (only when based on real recipe cost)
  const real = svc.filter((s) => s.costSource === 'recipe' && s.revenue > 0);
  if (real.length) {
    const best = [...real].sort((a, b) => b.profit / b.revenue - a.profit / a.revenue)[0];
    const worst = [...real].sort((a, b) => a.profit / a.revenue - b.profit / b.revenue)[0];
    const bm = Math.round((best.profit / best.revenue) * 100);
    const wm = Math.round((worst.profit / worst.revenue) * 100);
    if (worst.id !== best.id && wm < 25) {
      out.push({ id: 'low-margin', tone: 'warning', title: `Низкая маржа: ${worst.name}`, detail: `По рецептуре материалов маржа ${wm}%. Проверьте цену услуги или расход материалов.`, metric: `${wm}%` });
    }
    out.push({ id: 'best-margin', tone: 'positive', title: `Самая рентабельная: ${best.name}`, detail: `Маржа по рецептуре ${bm}% — ${rub(best.profit)} прибыли за период.`, metric: `${bm}%` });
  }

  // 8. Real profit picture
  if (m.revenue > 0 && m.expenses > 0) {
    if (m.profit < 0) out.push({ id: 'loss', tone: 'critical', title: 'Период убыточен', detail: `Расходы ${rub(m.expenses)} превышают выручку ${rub(m.revenue)}.`, metric: `−${fmtCompact(Math.abs(m.profit))} ₽` });
    else if (m.netMargin < 15) out.push({ id: 'thin-margin', tone: 'warning', title: 'Тонкая чистая маржа', detail: `Чистая маржа ${m.netMargin.toFixed(1).replace('.', ',')}% — небольшой запас прочности.`, metric: `${m.netMargin.toFixed(0)}%` });
    else if (m.netMargin >= 35) out.push({ id: 'healthy-margin', tone: 'positive', title: 'Здоровая маржа', detail: `Чистая маржа ${m.netMargin.toFixed(1).replace('.', ',')}% при расходах ${rub(m.expenses)}.`, metric: `${m.netMargin.toFixed(0)}%` });
  }

  if (!out.length) {
    out.push({ id: 'calm', tone: 'positive', title: 'Финансовая картина спокойная', detail: 'Аномалий за выбранный период не найдено.' });
  }
  return sortInsights(out);
}

/* ------------------------------------------------------------------ *
 *  Warehouse
 * ------------------------------------------------------------------ */

export interface StockCover {
  item: InventoryItem;
  /** average daily consumption over the last 30 days (units/day) */
  daily: number;
  /** days until stock-out at that rate; null when there is no consumption */
  days: number | null;
}

export interface InventoryDiagInput {
  active: InventoryItem[];
  lowStock: InventoryItem[];
  expired: InventoryItem[];
  expiring: InventoryItem[];
  wastePct: number;
  cover: StockCover[];
  deadStock: InventoryItem[];
  hasConsumptionData: boolean;
  abcTopShare: number;
}

export function diagnoseInventory(i: InventoryDiagInput): Insight[] {
  const out: Insight[] = [];
  const names = (list: { name: string }[], n = 3) => list.slice(0, n).map((x) => x.name).join(', ') + (list.length > n ? ` и ещё ${list.length - n}` : '');
  const value = (list: InventoryItem[]) => list.reduce((s, x) => s + Number(x.stock_level) * Number(x.unit_cost ?? 0), 0);

  if (i.expired.length) {
    out.push({ id: 'expired', tone: 'critical', title: `Просрочено: ${i.expired.length} ${plural(i.expired.length, 'позиция', 'позиции', 'позиций')}`, detail: `${names(i.expired)}. Стоимость остатка ${rub(value(i.expired))} — спишите, чтобы не использовать в работе.`, metric: `${fmtCompact(value(i.expired))} ₽`, actionId: 'alerts', actionLabel: 'К оповещениям' });
  }

  const empty = i.lowStock.filter((x) => Number(x.stock_level) <= 0);
  if (empty.length) {
    out.push({ id: 'stockout', tone: 'critical', title: `Закончилось: ${empty.length} ${plural(empty.length, 'позиция', 'позиции', 'позиций')}`, detail: `${names(empty)}. Работы, где нужны эти материалы, могут встать.`, actionId: 'purchase', actionLabel: 'Заказать' });
  }

  const lowRest = i.lowStock.filter((x) => Number(x.stock_level) > 0);
  if (lowRest.length) {
    out.push({ id: 'low', tone: 'warning', title: `Ниже минимума: ${lowRest.length} ${plural(lowRest.length, 'позиция', 'позиции', 'позиций')}`, detail: `${names(lowRest)}.`, metric: String(lowRest.length), actionId: 'purchase', actionLabel: 'Заказать' });
  }

  const soon = i.cover.filter((c) => c.days !== null && c.days <= 14 && Number(c.item.stock_level) > 0 && !i.lowStock.some((l) => l.id === c.item.id));
  if (soon.length) {
    const first = soon[0];
    out.push({ id: 'cover', tone: 'warning', title: 'Закончится в ближайшие 2 недели', detail: `${names(soon.map((c) => c.item))}. Быстрее всего — «${first.item.name}»: хватит примерно на ${Math.max(1, Math.round(first.days ?? 0))} дн. при текущем расходе.`, metric: `${Math.max(1, Math.round(first.days ?? 0))} дн.`, actionId: 'purchase', actionLabel: 'Заказать' });
  }

  const soonExp = i.expiring.filter((x) => !i.expired.some((e) => e.id === x.id));
  if (soonExp.length) {
    out.push({ id: 'expiring', tone: 'warning', title: `Срок истекает в 30 дней: ${soonExp.length}`, detail: `${names(soonExp)}. Используйте в первую очередь (FEFO).`, actionId: 'alerts', actionLabel: 'Посмотреть' });
  }

  if (i.wastePct > 10) {
    out.push({ id: 'waste-high', tone: 'critical', title: 'Высокие потери материалов', detail: `Списания и брак — ${i.wastePct.toFixed(1).replace('.', ',')}% от расхода. Норма для детейлинга — до 5%.`, metric: `${i.wastePct.toFixed(1).replace('.', ',')}%`, actionId: 'usage', actionLabel: 'К списаниям' });
  } else if (i.wastePct > 5) {
    out.push({ id: 'waste-mid', tone: 'warning', title: 'Потери выше нормы', detail: `Потери ${i.wastePct.toFixed(1).replace('.', ',')}% — норма до 5%.`, metric: `${i.wastePct.toFixed(1).replace('.', ',')}%` });
  }

  if (i.deadStock.length) {
    const v = value(i.deadStock);
    if (v > 0) out.push({ id: 'dead', tone: 'info', title: 'Замороженный капитал', detail: `${i.deadStock.length} ${plural(i.deadStock.length, 'позиция', 'позиции', 'позиций')} без движения 90 дней: ${names(i.deadStock)}. Здесь лежит ${rub(v)}.`, metric: `${fmtCompact(v)} ₽` });
  }

  if (i.abcTopShare >= 0.8 && i.active.length >= 5) {
    out.push({ id: 'abc', tone: 'info', title: 'Стоимость склада сконцентрирована', detail: `Первая пятая часть позиций держит ${Math.round(i.abcTopShare * 100)}% стоимости — держите их на строгом контроле.`, metric: `${Math.round(i.abcTopShare * 100)}%` });
  }

  if (!i.hasConsumptionData && i.active.length) {
    out.push({ id: 'no-usage', tone: 'info', title: 'Нет данных о расходе', detail: 'Фиксируйте списания и выдачу — тогда появится прогноз «на сколько дней хватит» по каждой позиции.', actionId: 'usage', actionLabel: 'К списаниям' });
  }

  if (!out.length) out.push({ id: 'calm', tone: 'positive', title: 'Склад в порядке', detail: 'Нет дефицита, просрочки и аномальных потерь.' });
  return sortInsights(out);
}

/* ------------------------------------------------------------------ *
 *  Reports
 * ------------------------------------------------------------------ */

export interface ReportsDiagInput {
  periodLabel: string;
  revenue: number;
  revenueChangePct: number | null;
  completed: number;
  paid: number;
  bookings: number;
  topService?: { name: string; share: number };
  repeatRate: number;
  totalCustomers: number;
  avgTurnaroundDays: number;
  techs: { name: string; workload: number }[];
}

export function diagnoseReports(r: ReportsDiagInput): Insight[] {
  const out: Insight[] = [];

  if (r.revenueChangePct !== null && r.revenueChangePct <= -20) {
    out.push({ id: 'rev-drop', tone: 'critical', title: `Выручка: ${r.periodLabel.toLowerCase()} слабее предыдущего`, detail: `Изменение ${fmtDelta(r.revenueChangePct)} к предыдущему периоду.`, metric: fmtDelta(r.revenueChangePct) });
  } else if (r.revenueChangePct !== null && r.revenueChangePct >= 10) {
    out.push({ id: 'rev-up', tone: 'positive', title: 'Выручка растёт', detail: `Изменение ${fmtDelta(r.revenueChangePct)} к предыдущему периоду.`, metric: fmtDelta(r.revenueChangePct) });
  }

  if (r.completed > 0 && r.paid < r.completed) {
    const gap = r.completed - r.paid;
    out.push({ id: 'unpaid', tone: 'warning', title: `${gap} ${plural(gap, 'выполненная работа не оплачена', 'выполненные работы не оплачены', 'выполненных работ не оплачено')}`, detail: `Из ${r.completed} завершённых оплачено ${r.paid}. Проверьте статусы оплаты в бронированиях.`, metric: `${Math.round((r.paid / r.completed) * 100)}%` });
  }

  if (r.bookings > 0 && r.completed / r.bookings < 0.5 && r.bookings >= 4) {
    out.push({ id: 'low-conv', tone: 'info', title: 'Меньше половины броней доведено до конца', detail: `Завершено ${r.completed} из ${r.bookings}. Часть работ ещё в процессе либо отменена.`, metric: `${Math.round((r.completed / r.bookings) * 100)}%` });
  }

  if (r.topService && r.topService.share >= 0.5) {
    out.push({ id: 'top-service', tone: 'info', title: `Опора студии — ${r.topService.name}`, detail: `${Math.round(r.topService.share * 100)}% выручки по услугам приходится на одну позицию.`, metric: `${Math.round(r.topService.share * 100)}%` });
  }

  if (r.totalCustomers >= 5) {
    if (r.repeatRate >= 0.4) out.push({ id: 'loyal', tone: 'positive', title: 'Сильная база постоянных клиентов', detail: `${Math.round(r.repeatRate * 100)}% клиентов возвращались повторно.`, metric: `${Math.round(r.repeatRate * 100)}%` });
    else if (r.repeatRate < 0.2) out.push({ id: 'retention', tone: 'info', title: 'Мало повторных визитов', detail: `Только ${Math.round(r.repeatRate * 100)}% клиентов вернулись. Напоминания об уходе и сервисные пакеты помогут.`, metric: `${Math.round(r.repeatRate * 100)}%` });
  }

  const overloaded = r.techs.filter((t) => t.workload >= 90);
  if (overloaded.length) out.push({ id: 'overload', tone: 'warning', title: 'Есть перегруженные техники', detail: `${overloaded.map((t) => t.name).join(', ')} — загрузка от 90%. Риск сроков и качества.`, metric: `${Math.max(...overloaded.map((t) => t.workload))}%` });
  const idle = r.techs.filter((t) => t.workload <= 20);
  if (idle.length && r.techs.length > 1) out.push({ id: 'idle', tone: 'info', title: 'Свободные мощности', detail: `${idle.map((t) => t.name).join(', ')} — загрузка до 20%. Можно принять больше броней.` });

  if (r.avgTurnaroundDays > 0 && r.avgTurnaroundDays <= 1.5) {
    out.push({ id: 'fast', tone: 'positive', title: 'Быстрый цикл работ', detail: `Средний срок выполнения ${String(r.avgTurnaroundDays).replace('.', ',')} дн.`, metric: `${String(r.avgTurnaroundDays).replace('.', ',')} дн.` });
  }

  if (!out.length) out.push({ id: 'calm', tone: 'positive', title: 'Показатели в норме', detail: 'Отклонений за выбранный период не найдено.' });
  return sortInsights(out);
}
