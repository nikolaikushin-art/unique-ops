/**
 * Lead domain model — single source of truth for the Leads module.
 * Scoring, SLA, follow-up state, pipeline value and every aggregate used by
 * the list, board, tasks view and the analytics dashboard live here so that
 * numbers can never disagree between screens.
 */
import type { Lead, Staff } from '../types/database';

export const CLOSED_STATUSES = ['converted', 'lost', 'junk'] as const;
export const OPEN_STATUSES = ['new', 'contacted', 'qualified'] as const;
export const LEAD_STAGES = ['new', 'contacted', 'qualified', 'converted', 'lost', 'junk'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Thresholds shared by every screen. */
export const HOT_SCORE = 70;
export const WARM_SCORE = 50;
export const COOL_SCORE = 30;
export const STALE_DAYS = 3;
export const SLA_HOURS = 24;

/** Default stage probabilities used for the weighted forecast. */
export const STAGE_PROBABILITY: Record<string, number> = {
  new: 0.1,
  contacted: 0.25,
  qualified: 0.55,
  converted: 1,
  lost: 0,
  junk: 0,
};

export const LEAD_SERVICE_INTERESTS: { value: string; label: string; benchmark: number }[] = [
  { value: 'ppf', label: 'PPF / оклейка плёнкой', benchmark: 180000 },
  { value: 'coating', label: 'Керамика / защитное покрытие', benchmark: 65000 },
  { value: 'polish', label: 'Полировка', benchmark: 35000 },
  { value: 'detailing', label: 'Комплексный детейлинг', benchmark: 250000 },
  { value: 'interior', label: 'Химчистка / интерьер', benchmark: 15000 },
  { value: 'tint', label: 'Тонировка', benchmark: 12000 },
  { value: 'noise', label: 'Шумоизоляция', benchmark: 45000 },
  { value: 'other', label: 'Другое', benchmark: 0 },
];

export const SERVICE_LABEL: Record<string, string> = Object.fromEntries(LEAD_SERVICE_INTERESTS.map((s) => [s.value, s.label]));

export const STAGE_TINT: Record<string, string> = {
  new: 'var(--c-blue)',
  contacted: 'var(--c-teal)',
  qualified: 'var(--c-purple)',
  converted: 'var(--c-green)',
  lost: 'var(--c-red)',
  junk: 'var(--c-gray)',
};

export const SOURCE_TINT: Record<string, string> = {
  website: 'var(--c-blue)',
  instagram: 'var(--c-pink)',
  whatsapp: 'var(--c-green)',
  phone: 'var(--c-orange)',
  referral: 'var(--c-purple)',
};

/* ------------------------------------------------------------------ *
 *  Small helpers
 * ------------------------------------------------------------------ */

export type FollowState = 'overdue' | 'today' | 'upcoming';

const DAY = 86400000;

export const isOpenLead = (l: Pick<Lead, 'status'>) => !(CLOSED_STATUSES as readonly string[]).includes(l.status);

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY);
}

export function followState(iso: string | null | undefined): FollowState | null {
  const d = daysUntil(iso);
  if (d === null) return null;
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  return 'upcoming';
}

/** Overdue follow-up on a lead that is still being worked. */
export const isOverdueLead = (l: Lead) => isOpenLead(l) && followState(l.next_action_at) === 'overdue';

export const ageDays = (l: Lead, now = Date.now()) => (now - new Date(l.created_at).getTime()) / DAY;
export const ageHours = (l: Lead, now = Date.now()) => (now - new Date(l.created_at).getTime()) / 3600000;
export const idleDays = (l: Lead, now = Date.now()) => (now - new Date(l.updated_at || l.created_at).getTime()) / DAY;

export const isStaleLead = (l: Lead, now = Date.now()) => isOpenLead(l) && idleDays(l, now) >= STALE_DAYS;

/** First response promised within SLA_HOURS — a lead still «Новый» after that is a breach. */
export const isSlaBreach = (l: Lead, now = Date.now()) => l.status === 'new' && ageHours(l, now) > SLA_HOURS;

export const leadFullName = (l: Lead) => [l.full_name, l.last_name].filter(Boolean).join(' ').trim() || l.full_name;

export function initials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '·';
}

export const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export function formatAge(l: Lead, now = Date.now()): string {
  const h = ageHours(l, now);
  if (h < 1) return 'только что';
  if (h < 24) return `${Math.floor(h)} ч`;
  return `${Math.floor(h / 24)} дн`;
}

export function nextActionLabel(l: Lead): string | null {
  if (!l.next_action_at) return null;
  const d = daysUntil(l.next_action_at)!;
  const note = l.next_action_note ?? '';
  const date = new Date(l.next_action_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  if (d < 0) return `Просрочено ${Math.abs(d)} дн · ${note}`.trim().replace(/ ·$/, '');
  if (d === 0) return `Сегодня · ${note}`.trim().replace(/ ·$/, '');
  if (d === 1) return `Завтра · ${note}`.trim().replace(/ ·$/, '');
  return `${date} · ${note}`.trim().replace(/ ·$/, '');
}

/* ------------------------------------------------------------------ *
 *  Value
 * ------------------------------------------------------------------ */

export interface LeadValue { value: number; estimated: boolean }

/** Explicit budget wins; otherwise a service benchmark (service_interest, then tags) marked as estimated. */
export function leadValue(l: Lead): LeadValue | null {
  if (l.status === 'junk') return null;
  if (typeof l.est_value === 'number' && l.est_value > 0) return { value: l.est_value, estimated: false };
  // Benchmarks are only a stand-in for leads still being worked; closed leads show real budgets only.
  if (!isOpenLead(l)) return null;
  const keys = [l.service_interest, ...(l.tags ?? [])].filter(Boolean) as string[];
  for (const k of keys) {
    const hit = LEAD_SERVICE_INTERESTS.find((s) => s.value === k.toLowerCase() && s.benchmark > 0);
    if (hit) return { value: hit.benchmark, estimated: true };
  }
  return null;
}

export const leadValueNum = (l: Lead) => leadValue(l)?.value ?? 0;

export const fmtRub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
export function fmtCompactRub(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',')} млн ₽`;
  if (a >= 1_000) return `${Math.round(n / 1_000)} тыс ₽`;
  return `${Math.round(n)} ₽`;
}

/* ------------------------------------------------------------------ *
 *  Scoring
 * ------------------------------------------------------------------ */

export interface ScoreFactor { label: string; points: number }
export interface LeadScore { score: number; factors: ScoreFactor[] }

const SOURCE_POINTS: Record<string, number> = { referral: 12, phone: 10, whatsapp: 7, website: 5, instagram: 3 };

export function scoreLead(l: Lead, now = Date.now()): LeadScore {
  if (l.status === 'converted') return { score: 100, factors: [{ label: 'Стал клиентом', points: 100 }] };
  if (l.status === 'lost' || l.status === 'junk') return { score: 0, factors: [{ label: l.status === 'lost' ? 'Лид потерян' : 'Спам', points: 0 }] };

  const f: ScoreFactor[] = [];
  const add = (label: string, points: number) => { if (points !== 0) f.push({ label, points }); };

  add('Этап воронки', l.status === 'qualified' ? 55 : l.status === 'contacted' ? 35 : 20);
  add('Канал обращения', SOURCE_POINTS[l.source] ?? 0);
  add('Указан телефон', l.phone ? 5 : 0);
  add('Указан email', l.email ? 3 : 0);
  add('Известно авто', l.car_brand && l.car_model ? 6 : l.car_brand || l.car_model ? 3 : 0);
  add('Понятна услуга', l.service_interest ? 4 : 0);

  const v = leadValue(l);
  if (v) add(v.value >= 100000 ? 'Крупный запрос' : v.value >= 50000 ? 'Средний запрос' : 'Есть бюджет', v.value >= 100000 ? 6 : v.value >= 50000 ? 3 : 1);

  const tags = (l.tags ?? []).map((t) => t.toLowerCase());
  add('Метка «hot»', tags.includes('hot') ? 8 : 0);
  add('VIP-интерес', tags.includes('vip-interest') ? 6 : 0);
  add('Назначен ответственный', l.owner_id ? 3 : 0);

  const idle = idleDays(l, now);
  add('Свежий контакт (≤ 2 дн)', idle <= 2 ? 6 : 0);
  const fs = followState(l.next_action_at);
  add('Запланирован следующий шаг', fs === 'today' || fs === 'upcoming' ? 5 : 0);

  add('Просрочена задача', fs === 'overdue' ? -8 : 0);
  add('Нет движения 3+ дня', idle >= STALE_DAYS ? -10 : 0);
  add('Новый лид без реакции 7+ дней', l.status === 'new' && ageDays(l, now) > 7 ? -12 : 0);

  const raw = f.reduce((s, x) => s + x.points, 0);
  return { score: Math.min(99, Math.max(1, raw)), factors: f };
}

export const computeLeadScore = (l: Lead) => scoreLead(l).score;

export function scoreLabel(score: number): string {
  if (score >= HOT_SCORE) return 'Горячий';
  if (score >= WARM_SCORE) return 'Тёплый';
  if (score >= COOL_SCORE) return 'Прохладный';
  return 'Холодный';
}

export function scoreTone(score: number): 'red' | 'orange' | 'blue' | 'gray' {
  if (score >= HOT_SCORE) return 'red';
  if (score >= WARM_SCORE) return 'orange';
  if (score >= COOL_SCORE) return 'blue';
  return 'gray';
}

export const isHotLead = (l: Lead) => isOpenLead(l) && computeLeadScore(l) >= HOT_SCORE;

/* ------------------------------------------------------------------ *
 *  Duplicates
 * ------------------------------------------------------------------ */

/** Map lead id → other lead ids sharing the same phone or email. */
export function findDuplicates(leads: Lead[]): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const l of leads) {
    const keys = [digits(l.phone).length >= 7 ? `p:${digits(l.phone)}` : '', l.email ? `e:${l.email.trim().toLowerCase()}` : ''].filter(Boolean);
    for (const k of keys) byKey.set(k, [...(byKey.get(k) ?? []), l.id]);
  }
  const out = new Map<string, string[]>();
  for (const ids of byKey.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) out.set(id, [...new Set([...(out.get(id) ?? []), ...ids.filter((x) => x !== id)])]);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  Smart filters (chips above the list)
 * ------------------------------------------------------------------ */

export type SmartFilter = '' | 'hot' | 'stale' | 'sla' | 'noowner' | 'nonext' | 'dups' | 'valuable';

export const SMART_LABELS: Record<Exclude<SmartFilter, ''>, string> = {
  hot: 'Горячие',
  stale: 'Зависшие 3+ дня',
  sla: 'Нет реакции 24ч',
  noowner: 'Без ответственного',
  nonext: 'Без следующего шага',
  dups: 'Дубликаты',
  valuable: 'Крупные 100 тыс+',
};

export function matchesSmart(l: Lead, f: SmartFilter, dups: Map<string, string[]>): boolean {
  switch (f) {
    case 'hot': return isHotLead(l);
    case 'stale': return isStaleLead(l);
    case 'sla': return isSlaBreach(l);
    case 'noowner': return isOpenLead(l) && !l.owner_id;
    case 'nonext': return isOpenLead(l) && !l.next_action_at;
    case 'dups': return dups.has(l.id);
    case 'valuable': return isOpenLead(l) && leadValueNum(l) >= 100000;
    default: return true;
  }
}

/* ------------------------------------------------------------------ *
 *  Aggregates for the dashboard
 * ------------------------------------------------------------------ */

export interface SourceRow { source: string; total: number; open: number; converted: number; lost: number; conv: number; avgScore: number; value: number }
export interface OwnerRow { id: string; name: string; total: number; open: number; converted: number; overdue: number; stale: number; hot: number; value: number }

export interface LeadStats {
  total: number;
  open: number;
  byStatus: Record<string, number>;
  hot: number;
  avgScore: number;
  convRate: number;
  winRate: number | null;
  overdue: number;
  stale: number;
  sla: number;
  noOwner: number;
  noNext: number;
  dups: number;
  pipelineValue: number;
  pipelineUnknown: number;
  forecast: number;
  avgDeal: number;
  valueByStage: Record<string, number>;
  days: { label: string; long: string; created: number; won: number }[];
  createdLast7: number;
  createdPrev7: number;
  sources: SourceRow[];
  owners: OwnerRow[];
  lostReasons: { reason: string; count: number }[];
  aging: number[];
  scoreBuckets: number[];
  heat: number[][];
  funnel: { all: number; contacted: number; qualified: number; converted: number };
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const HEAT_ROWS = WEEKDAYS;
export const HEAT_COLS = ['Ночь', 'Утро', 'День', 'Вечер'];
export const AGING_LABELS = ['до 1 дн', '1–3 дн', '4–7 дн', '8–14 дн', '15+ дн'];

export function normalizeLostReason(r: string | null): string {
  if (!r) return 'Не указана';
  const s = r.trim();
  const known = ['Выбрали другую студию', 'Слишком высокая цена', 'Не отвечает на звонки', 'Отложили решение', 'Передумали'];
  const hit = known.find((k) => s.toLowerCase().startsWith(k.toLowerCase()));
  return hit ?? (s.length > 34 ? `${s.slice(0, 32)}…` : s);
}

export function buildLeadStats(leads: Lead[], staff: Staff[], now = Date.now()): LeadStats {
  const byStatus: Record<string, number> = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0, junk: 0 };
  leads.forEach((l) => { byStatus[l.status] = (byStatus[l.status] ?? 0) + 1; });

  const open = leads.filter(isOpenLead);
  const scores = new Map<string, number>(leads.map((l) => [l.id, computeLeadScore(l)]));
  const hot = open.filter((l) => (scores.get(l.id) ?? 0) >= HOT_SCORE).length;
  const avgScore = open.length ? Math.round(open.reduce((s, l) => s + (scores.get(l.id) ?? 0), 0) / open.length) : 0;
  const nonSpam = leads.length - byStatus.junk;
  const convRate = nonSpam ? Math.round((byStatus.converted / nonSpam) * 100) : 0;
  const decided = byStatus.converted + byStatus.lost;
  const winRate = decided ? Math.round((byStatus.converted / decided) * 100) : null;

  const dupMap = findDuplicates(leads);

  let pipelineValue = 0;
  let pipelineUnknown = 0;
  let forecast = 0;
  const valueByStage: Record<string, number> = { new: 0, contacted: 0, qualified: 0 };
  const wonValues: number[] = [];
  for (const l of leads) {
    const v = leadValue(l);
    if (l.status === 'converted' && v) wonValues.push(v.value);
    if (!isOpenLead(l)) continue;
    if (!v) { pipelineUnknown += 1; continue; }
    pipelineValue += v.value;
    valueByStage[l.status] = (valueByStage[l.status] ?? 0) + v.value;
    forecast += v.value * (STAGE_PROBABILITY[l.status] ?? 0);
  }
  const avgDeal = wonValues.length ? Math.round(wonValues.reduce((a, b) => a + b, 0) / wonValues.length) : 0;

  // 14-day activity
  const days: LeadStats['days'] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    d.setHours(0, 0, 0, 0);
    const end = d.getTime() + DAY;
    const created = leads.filter((l) => { const t = new Date(l.created_at).getTime(); return t >= d.getTime() && t < end; }).length;
    const won = leads.filter((l) => { if (l.status !== 'converted') return false; const t = new Date(l.updated_at || l.created_at).getTime(); return t >= d.getTime() && t < end; }).length;
    days.push({
      label: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
      long: d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }),
      created,
      won,
    });
  }
  const createdLast7 = days.slice(7).reduce((s, d) => s + d.created, 0);
  const createdPrev7 = days.slice(0, 7).reduce((s, d) => s + d.created, 0);

  // Sources
  const sourceKeys = [...new Set(leads.map((l) => l.source))];
  const sources: SourceRow[] = sourceKeys.map((source) => {
    const list = leads.filter((l) => l.source === source);
    const conv = list.filter((l) => l.status === 'converted').length;
    const opn = list.filter(isOpenLead);
    const clean = list.filter((l) => l.status !== 'junk').length;
    return {
      source,
      total: list.length,
      open: opn.length,
      converted: conv,
      lost: list.filter((l) => l.status === 'lost').length,
      conv: clean ? Math.round((conv / clean) * 100) : 0,
      avgScore: opn.length ? Math.round(opn.reduce((s, l) => s + (scores.get(l.id) ?? 0), 0) / opn.length) : 0,
      value: opn.reduce((s, l) => s + leadValueNum(l), 0),
    };
  }).sort((a, b) => b.total - a.total);

  // Owners
  const ownerIds = [...new Set(leads.map((l) => l.owner_id ?? ''))];
  const owners: OwnerRow[] = ownerIds.map((id) => {
    const list = leads.filter((l) => (l.owner_id ?? '') === id);
    const opn = list.filter(isOpenLead);
    return {
      id,
      name: id ? staff.find((s) => s.id === id)?.full_name ?? 'Сотрудник' : 'Не назначен',
      total: list.length,
      open: opn.length,
      converted: list.filter((l) => l.status === 'converted').length,
      overdue: opn.filter((l) => followState(l.next_action_at) === 'overdue').length,
      stale: opn.filter((l) => isStaleLead(l, now)).length,
      hot: opn.filter((l) => (scores.get(l.id) ?? 0) >= HOT_SCORE).length,
      value: opn.reduce((s, l) => s + leadValueNum(l), 0),
    };
  }).sort((a, b) => b.open - a.open || b.total - a.total);

  // Lost reasons
  const lostMap: Record<string, number> = {};
  leads.filter((l) => l.status === 'lost').forEach((l) => { const k = normalizeLostReason(l.lost_reason); lostMap[k] = (lostMap[k] ?? 0) + 1; });
  const lostReasons = Object.entries(lostMap).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

  // Aging of open leads
  const aging = [0, 0, 0, 0, 0];
  open.forEach((l) => {
    const a = ageDays(l, now);
    aging[a < 1 ? 0 : a < 4 ? 1 : a < 8 ? 2 : a < 15 ? 3 : 4] += 1;
  });

  // Score distribution (open)
  const scoreBuckets = [0, 0, 0, 0, 0];
  open.forEach((l) => { scoreBuckets[Math.min(4, Math.floor((scores.get(l.id) ?? 0) / 20))] += 1; });

  // Weekday × daypart of incoming leads
  const heat = HEAT_ROWS.map(() => HEAT_COLS.map(() => 0));
  leads.forEach((l) => {
    const d = new Date(l.created_at);
    const wd = (d.getDay() + 6) % 7;
    const h = d.getHours();
    heat[wd][h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3] += 1;
  });

  const funnel = {
    all: nonSpam,
    contacted: leads.filter((l) => ['contacted', 'qualified', 'converted'].includes(l.status)).length,
    qualified: leads.filter((l) => ['qualified', 'converted'].includes(l.status)).length,
    converted: byStatus.converted,
  };

  return {
    total: leads.length,
    open: open.length,
    byStatus,
    hot,
    avgScore,
    convRate,
    winRate,
    overdue: open.filter((l) => followState(l.next_action_at) === 'overdue').length,
    stale: open.filter((l) => isStaleLead(l, now)).length,
    sla: leads.filter((l) => isSlaBreach(l, now)).length,
    noOwner: open.filter((l) => !l.owner_id).length,
    noNext: open.filter((l) => !l.next_action_at).length,
    dups: dupMap.size,
    pipelineValue,
    pipelineUnknown,
    forecast: Math.round(forecast),
    avgDeal,
    valueByStage,
    days,
    createdLast7,
    createdPrev7,
    sources,
    owners,
    lostReasons,
    aging,
    scoreBuckets,
    heat,
    funnel,
  };
}
