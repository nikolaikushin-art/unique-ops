/** Date-range and period-comparison utilities for dashboard & finance analytics */

export type FinancePeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | '6month' | 'annual';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PeriodComparison {
  current: DateRange;
  previous: DateRange;
  label: string;
  previousLabel: string;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}

export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

export function inRange(iso: string | null | undefined, range: DateRange): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function fmtPct(n: number | null): string {
  if (n === null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

/** Comparison presets for executive dashboard */
/**
 * Month-to-date must be compared with the same number of days of the previous
 * month, not with the whole previous month — otherwise every mid-period
 * comparison looks like a collapse.
 */
function sameElapsed(cmp: PeriodComparison): PeriodComparison {
  const elapsed = cmp.current.end.getTime() - cmp.current.start.getTime();
  const end = Math.min(cmp.previous.end.getTime(), cmp.previous.start.getTime() + elapsed);
  return { ...cmp, previous: { start: cmp.previous.start, end: new Date(end) } };
}

export function getComparisonRanges(kind: 'day' | 'week' | 'month' | 'quarter' | 'year', now = new Date()): PeriodComparison {
  return sameElapsed(rawComparisonRanges(kind, now));
}

function rawComparisonRanges(kind: 'day' | 'week' | 'month' | 'quarter' | 'year', now: Date): PeriodComparison {
  const today = startOfDay(now);

  if (kind === 'day') {
    const yesterday = addDays(today, -1);
    return {
      current: { start: today, end: endOfDay(now) },
      previous: { start: yesterday, end: endOfDay(yesterday) },
      label: 'Сегодня',
      previousLabel: 'Вчера',
    };
  }

  if (kind === 'week') {
    const weekStart = startOfWeek(now);
    const prevWeekStart = addDays(weekStart, -7);
    const prevWeekEnd = endOfDay(addDays(weekStart, -1));
    return {
      current: { start: weekStart, end: endOfDay(now) },
      previous: { start: prevWeekStart, end: prevWeekEnd },
      label: 'Эта неделя',
      previousLabel: 'Прошлая неделя',
    };
  }

  if (kind === 'month') {
    const monthStart = startOfMonth(now);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = endOfDay(addDays(monthStart, -1));
    return {
      current: { start: monthStart, end: endOfDay(now) },
      previous: { start: prevMonthStart, end: prevMonthEnd },
      label: 'Этот месяц',
      previousLabel: 'Прошлый месяц',
    };
  }

  if (kind === 'quarter') {
    const qStart = startOfQuarter(now);
    const prevQStart = new Date(qStart);
    prevQStart.setMonth(prevQStart.getMonth() - 3);
    const prevQEnd = endOfDay(addDays(qStart, -1));
    return {
      current: { start: qStart, end: endOfDay(now) },
      previous: { start: prevQStart, end: prevQEnd },
      label: 'Этот квартал',
      previousLabel: 'Прошлый квартал',
    };
  }

  const yearStart = startOfYear(now);
  const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const prevYearEnd = endOfDay(addDays(yearStart, -1));
  return {
    current: { start: yearStart, end: endOfDay(now) },
    previous: { start: prevYearStart, end: prevYearEnd },
    label: 'Этот год',
    previousLabel: 'Прошлый год',
  };
}

export function getFinancePeriodRange(period: FinancePeriod, now = new Date()): DateRange {
  const end = endOfDay(now);
  switch (period) {
    case 'daily':
      return { start: startOfDay(now), end };
    case 'weekly':
      // calendar week (Mon → today) — same as the Overview / Reports "Неделя"
      return { start: startOfWeek(now), end };
    case 'monthly':
      return { start: startOfMonth(now), end };
    case 'quarterly':
      return { start: startOfQuarter(now), end };
    case '6month': {
      const s = new Date(now);
      s.setMonth(s.getMonth() - 6);
      return { start: startOfDay(s), end };
    }
    case 'annual':
      return { start: startOfYear(now), end };
  }
}

export function getPreviousPeriodRange(range: DateRange): DateRange {
  const ms = range.end.getTime() - range.start.getTime();
  const prevEnd = new Date(range.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - ms);
  return { start: prevStart, end: prevEnd };
}

export function bucketCountForPeriod(period: FinancePeriod): number {
  switch (period) {
    case 'daily': return 24;
    case 'weekly': return 7;
    case 'monthly': return 30;
    case 'quarterly': return 12;
    case '6month': return 6;
    case 'annual': return 12;
  }
}

export const FINANCE_PERIOD_LABELS: Record<FinancePeriod, string> = {
  daily: 'День',
  weekly: 'Неделя',
  monthly: 'Месяц',
  quarterly: 'Квартал',
  '6month': '6 месяцев',
  annual: 'Год',
};

export const COMPARISON_KIND_LABELS: Record<'day' | 'week' | 'month' | 'quarter' | 'year', string> = {
  day: 'День',
  week: 'Неделя',
  month: 'Месяц',
  quarter: 'Квартал',
  year: 'Год',
};

/* ------------------------------------------------------------------ *
 *  Time buckets — shared by Finance, Warehouse and Reports charts.
 *  The granularity follows the length of the range so every period
 *  gets a readable series (hours → days → weeks → months).
 * ------------------------------------------------------------------ */

export type Granularity = 'hour' | 'day' | 'week' | 'month';

export interface Bucket {
  start: Date;
  end: Date;
  /** Short axis label. */
  label: string;
  /** Long tooltip label. */
  long: string;
}

export function pickGranularity(range: DateRange): Granularity {
  const days = (range.end.getTime() - range.start.getTime()) / 86400000;
  if (days <= 1.5) return 'hour';
  if (days <= 45) return 'day';
  if (days <= 200) return 'week';
  return 'month';
}

const trimDot = (s: string) => s.replace(/\./g, '');
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Split a range into contiguous buckets. Buckets that start after `now`
 * are dropped so charts never draw a fake "fall to zero" for the future.
 */
export function buildBuckets(range: DateRange, gran: Granularity = pickGranularity(range), now: Date = new Date()): Bucket[] {
  const out: Bucket[] = [];
  let cursor: Date;
  switch (gran) {
    case 'hour': cursor = new Date(range.start); cursor.setMinutes(0, 0, 0); break;
    case 'day': cursor = startOfDay(range.start); break;
    case 'week': cursor = startOfWeek(range.start); break;
    default: cursor = startOfMonth(range.start);
  }

  const next = (d: Date): Date => {
    const x = new Date(d);
    if (gran === 'hour') x.setHours(x.getHours() + 1);
    else if (gran === 'day') x.setDate(x.getDate() + 1);
    else if (gran === 'week') x.setDate(x.getDate() + 7);
    else x.setMonth(x.getMonth() + 1);
    return x;
  };

  let guard = 0;
  while (cursor.getTime() <= range.end.getTime() && guard++ < 400) {
    const nextCursor = next(cursor);
    const start = new Date(Math.max(cursor.getTime(), range.start.getTime()));
    const end = new Date(Math.min(nextCursor.getTime() - 1, range.end.getTime()));
    if (start.getTime() > now.getTime()) break;
    out.push({ start, end, label: '', long: '' });
    cursor = nextCursor;
  }

  const many = out.length > 8;
  for (const b of out) {
    if (gran === 'hour') {
      b.label = `${b.start.getHours()}:00`;
      b.long = `${b.start.getHours()}:00–${b.start.getHours()}:59`;
    } else if (gran === 'day') {
      b.label = many
        ? String(b.start.getDate())
        : capFirst(trimDot(b.start.toLocaleDateString('ru-RU', { weekday: 'short' })));
      b.long = capFirst(b.start.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
    } else if (gran === 'week') {
      const a = trimDot(b.start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
      const z = trimDot(b.end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
      b.label = a;
      b.long = `${a} – ${z}`;
    } else {
      b.label = capFirst(trimDot(b.start.toLocaleDateString('ru-RU', { month: 'short' })));
      b.long = capFirst(b.start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }));
    }
  }
  return out;
}

/** Sum `value(row)` of every row into the bucket its timestamp falls in. */
export function sumIntoBuckets<T>(
  buckets: Bucket[],
  rows: T[],
  date: (row: T) => string | null | undefined,
  value: (row: T) => number
): number[] {
  const sums = new Array<number>(buckets.length).fill(0);
  for (const row of rows) {
    const iso = date(row);
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) continue;
    for (let i = 0; i < buckets.length; i++) {
      if (t >= buckets[i].start.getTime() && t <= buckets[i].end.getTime()) {
        sums[i] += value(row);
        break;
      }
    }
  }
  return sums;
}
