/**
 * Page-level dashboards (Bookings, Jobs, Inspection, Leads, Pipeline, Services,
 * Staff, Customers, Vehicles). Each one is built for its own data — different
 * charts, different diagnostics — on top of the shared chart kit.
 */
import { useMemo } from 'react';
import {
  ActivityRings,
  BarList,
  ColumnChart,
  DonutChart,
  DxCard,
  Funnel,
  InsightSummary,
  Insights,
  MetricTile,
  StorageBar,
  TINT,
  colorAt,
  fmtCompact,
  fmtMoneyCompact,
  type BarItem,
} from '../charts';
import { plural, sortInsights, type Insight } from '../../lib/diagnostics';
import { BOOKING_STATUS_CYCLE, BOOKING_STATUS_LABELS, JOB_STATUS_LABELS, fmt } from '../../lib/constants';
import type { BookingAnalytics } from '../../lib/bookings';
import { isJobDelayed } from '../../lib/metrics';
import { normalizePipelineStage } from '../../lib/workflow';
import type { Booking, Customer, Staff, StaffTraining, Vehicle } from '../../types/database';

const STATUS_COLORS: Record<string, string> = {
  new_enquiry: TINT.gray,
  confirmed: TINT.teal,
  vehicle_received: TINT.blue,
  inspection: TINT.purple,
  awaiting_approval: TINT.yellow,
  in_progress: TINT.orange,
  quality_check: TINT.pink,
  completed: TINT.green,
  delivered: TINT.green,
  cancelled: TINT.red,
};

const pct = (n: number, d: number) => (d > 0 ? n / d : 0);
const ins = (tone: Insight['tone'], id: string, title: string, detail: string, metric?: string): Insight => ({ id, tone, title, detail, metric });
const num = (n: number) => n.toLocaleString('ru-RU');

function healthy(list: Insight[], calm: string): Insight[] {
  return sortInsights(list.length ? list : [ins('positive', 'calm', calm, 'Отклонений не найдено.')]);
}

function statusSegments(counts: Record<string, number>) {
  const order = [...new Set([...BOOKING_STATUS_CYCLE, 'cancelled'])];
  return order
    .filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => ({ id: s, label: BOOKING_STATUS_LABELS[s] ?? JOB_STATUS_LABELS[s] ?? s, value: counts[s], color: STATUS_COLORS[s] ?? TINT.gray, display: String(counts[s]) }));
}

function countBy<T>(list: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of list) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return out;
}

const isDone = (s: string) => s === 'completed' || s === 'delivered';

/* ============================== BOOKINGS ============================== */

export function BookingsDashboard({ bookings, analytics }: { bookings: Booking[]; analytics: BookingAnalytics }) {
  const d = useMemo(() => {
    const counts = countBy(bookings, (b) => b.status);
    const live = bookings.filter((b) => b.status !== 'cancelled');
    const done = bookings.filter((b) => isDone(b.status));
    const paid = done.filter((b) => b.payment_status === 'paid').length;
    const hours = Array.from({ length: 13 }, (_, i) => i + 8);
    const byHour = hours.map(() => 0);
    for (const b of bookings) {
      const h = new Date(b.scheduled_at).getHours();
      if (!Number.isNaN(h)) byHour[Math.min(20, Math.max(8, h)) - 8] += 1;
    }
    return { counts, live: live.length, done: done.length, paid, hours, byHour };
  }, [bookings]);

  const total = analytics.total;
  const completion = pct(d.done, d.live);
  const noCancel = total ? 1 - pct(analytics.cancelled, total) : 1;
  const paidShare = pct(d.paid, d.done);

  const insights = useMemo(() => {
    const out: Insight[] = [];
    const cancelRate = pct(analytics.cancelled, total);
    if (total >= 5 && cancelRate >= 0.2) out.push(ins('warning', 'cancel', 'Много отмен', `Отменено ${analytics.cancelled} из ${total} броней. Стоит уточнить причины и ввести подтверждение записи.`, `${Math.round(cancelRate * 100)}%`));
    const overloaded = analytics.technicianUtilisation.filter((t) => t.pct >= 90);
    if (overloaded.length) out.push(ins('warning', 'load', 'Техники на пределе', `${overloaded.map((t) => t.name).join(', ')} — загрузка от 90% недели.`, `${Math.max(...overloaded.map((t) => t.pct))}%`));
    const unpaid = d.done - d.paid;
    if (unpaid > 0) out.push(ins('warning', 'unpaid', `${unpaid} ${plural(unpaid, 'завершённая работа', 'завершённые работы', 'завершённых работ')} без оплаты`, 'Работа выполнена, но статус оплаты не «оплачено».', `${unpaid}`));
    const waiting = d.counts['awaiting_approval'] ?? 0;
    if (waiting > 0) out.push(ins('info', 'approval', `Ждут одобрения клиента: ${waiting}`, 'Пока клиент не согласовал работы, заказ не двигается.', String(waiting)));
    const peak = Math.max(...d.byHour);
    if (total >= 6 && peak / total >= 0.3) {
      const h = d.hours[d.byHour.indexOf(peak)];
      out.push(ins('info', 'peak', `Пик в ${h}:00`, `${Math.round((peak / total) * 100)}% записей приходится на один час. Перенос части броней разгрузит цех.`, `${h}:00`));
    }
    if (d.done > 0 && analytics.avgTurnaroundHours !== null && analytics.avgTurnaroundHours <= 24) out.push(ins('positive', 'fast', 'Быстрый оборот', `В среднем ${String(analytics.avgTurnaroundHours).replace('.', ',')} ч от записи до готовности.`, `${String(analytics.avgTurnaroundHours).replace('.', ',')} ч`));
    return healthy(out, 'Записи в порядке');
  }, [analytics, d, total]);

  const util: BarItem[] = analytics.technicianUtilisation.slice(0, 6).map((t) => ({
    id: t.name,
    label: t.name,
    value: t.pct,
    display: `${t.pct}%`,
    color: t.pct >= 90 ? TINT.red : t.pct >= 60 ? TINT.blue : TINT.teal,
    sub: `${Math.round(t.minutes / 60)} ч записано`,
    marker: 90,
  }));

  return (
    <div className="dx" style={{ marginBottom: 28 }}>
      <div className="dx-grid dx-hero">
        <DxCard eyebrow="Записи" title="Оборот и статусы">
          <div className="dx-bignum">{num(analytics.revenue)}<small>₽</small></div>
          <div className="dx-hero-line"><span>Сумма по всем броням в выборке · {total} шт.</span></div>
          <StorageBar height={16} emptyText="Нет броней" segments={statusSegments(d.counts)} />
        </DxCard>
        <div className="dx-card dx-side">
          <div style={{ width: '100%' }}><div className="dx-eyebrow">Качество записи</div></div>
          <ActivityRings
            rings={[
              { id: 'done', label: 'Завершено', hint: 'от активных броней', value: completion, display: `${Math.round(completion * 100)}%`, color: TINT.green, unknown: d.live === 0 },
              { id: 'keep', label: 'Без отмен', hint: 'броней не отменено', value: noCancel, display: `${Math.round(noCancel * 100)}%`, color: TINT.blue, unknown: total === 0 },
              { id: 'paid', label: 'Оплачено', hint: 'из завершённых', value: paidShare, display: `${Math.round(paidShare * 100)}%`, color: TINT.orange, unknown: d.done === 0 },
            ]}
            center={<><b>{total}</b><span>броней</span></>}
          />
        </div>
      </div>

      <div className="dx-grid dx-4">
        <MetricTile label="Завершено" value={analytics.completed} note={`${Math.round(pct(analytics.completed, total) * 100)}% от всех`} color={TINT.green} />
        <MetricTile label="Отменено" value={analytics.cancelled} note={total ? `${Math.round(pct(analytics.cancelled, total) * 100)}% отмен` : '—'} color={analytics.cancelled ? TINT.red : TINT.gray} />
        <MetricTile label="Средний оборот" value={analytics.avgTurnaroundHours != null ? `${String(analytics.avgTurnaroundHours).replace('.', ',')} ч` : '—'} note="запись → готово" color={TINT.teal} />
        <MetricTile label="Активные" value={d.live - d.done} note="в процессе" color={TINT.orange} />
      </div>

      <DxCard eyebrow="Диагностика" title="Что видно в записях" right={<InsightSummary insights={insights} />}>
        <Insights insights={insights} />
      </DxCard>

      <div className="dx-grid dx-2">
        <DxCard eyebrow="Команда" title="Загрузка техников">
          <BarList items={util} max={100} emptyText="Нет назначенных техников" />
          {util.length > 0 && <div className="dx-note">Расчёт на рабочую неделю. Чёрная отметка — порог 90%.</div>}
        </DxCard>
        <DxCard eyebrow="Спрос" title="Популярные услуги">
          <DonutChart
            centerValue={String(analytics.popularServices.reduce((s, x) => s + x.count, 0))}
            centerLabel="броней"
            emptyText="Нет данных"
            segments={analytics.popularServices.map((s, i) => ({ id: s.name, label: s.name, value: s.count, color: colorAt(i), display: `${s.count} шт.` }))}
          />
        </DxCard>
      </div>

      <DxCard eyebrow="Ритм студии" title="Когда приходят клиенты">
        <ColumnChart values={d.byHour} labels={d.hours.map((h) => String(h))} color={TINT.blue} unit=" бр." emptyText="Нет броней" />
        <div className="dx-note">Часы начала записи, все брони в выборке.</div>
      </DxCard>
    </div>
  );
}

/* ================================ JOBS ================================ */

export function JobsDashboard({ jobs }: { jobs: Booking[] }) {
  const d = useMemo(() => {
    const now = Date.now();
    const counts = countBy(jobs, (j) => j.status);
    const live = jobs.filter((j) => !isDone(j.status) && j.status !== 'cancelled');
    const done = jobs.filter((j) => isDone(j.status));
    const delayed = live.filter((j) => isJobDelayed(j, new Date(now)));
    const unassigned = live.filter((j) => !j.assigned_technician_id);
    const unpaid = done.filter((j) => j.payment_status !== 'paid');
    return { counts, live, done, delayed, unassigned, unpaid };
  }, [jobs]);

  const total = jobs.length;
  const inWork = d.counts['in_progress'] ?? 0;
  const control = (d.counts['quality_check'] ?? 0) + (d.counts['awaiting_approval'] ?? 0);
  const ready = pct(d.done.length, total);
  const onTime = d.live.length ? 1 - pct(d.delayed.length, d.live.length) : 1;
  const paid = d.done.length ? 1 - pct(d.unpaid.length, d.done.length) : 1;

  const insights = useMemo(() => {
    const out: Insight[] = [];
    if (d.delayed.length) out.push(ins('critical', 'late', `${d.delayed.length} ${plural(d.delayed.length, 'заказ просрочен', 'заказа просрочены', 'заказов просрочено')} по ETA`, d.delayed.slice(0, 3).map((j) => j.customers?.full_name ?? '—').join(', ') + '. Сообщите клиентам о новом сроке.', String(d.delayed.length)));
    if (d.unassigned.length) out.push(ins('warning', 'unassigned', `Без техника: ${d.unassigned.length}`, 'Назначьте исполнителя, иначе заказ не попадёт в график.', String(d.unassigned.length)));
    if (d.unpaid.length) out.push(ins('warning', 'unpaid', `Готово, но не оплачено: ${d.unpaid.length}`, 'Выдача без оплаты — риск дебиторки.', String(d.unpaid.length)));
    if ((d.counts['awaiting_approval'] ?? 0) > 0) out.push(ins('info', 'approval', `Ждут одобрения: ${d.counts['awaiting_approval']}`, 'Позвоните клиентам, чтобы согласовать работы.'));
    return healthy(out, 'Заказы идут по плану');
  }, [d]);

  return (
    <div className="dx" style={{ marginBottom: 28 }}>
      <div className="dx-grid dx-hero">
        <DxCard eyebrow="Поток" title="Где сейчас заказы" right={<span className="ch-badge is-gray">{total} всего</span>}>
          <StorageBar height={16} emptyText="Заказов нет" segments={statusSegments(d.counts)} />
        </DxCard>
        <div className="dx-card dx-side">
          <div style={{ width: '100%' }}><div className="dx-eyebrow">Исполнение</div></div>
          <ActivityRings
            rings={[
              { id: 'ready', label: 'Готово', hint: 'от всех заказов', value: ready, display: `${Math.round(ready * 100)}%`, color: TINT.green, unknown: total === 0 },
              { id: 'time', label: 'В срок', hint: 'без просрочки ETA', value: onTime, display: `${Math.round(onTime * 100)}%`, color: TINT.blue, unknown: d.live.length === 0 },
              { id: 'paid', label: 'Оплачено', hint: 'из выполненных', value: paid, display: `${Math.round(paid * 100)}%`, color: TINT.orange, unknown: d.done.length === 0 },
            ]}
            center={<><b>{d.live.length}</b><span>в работе</span></>}
          />
        </div>
      </div>
      <div className="dx-grid dx-4">
        <MetricTile label="Всего" value={total} color={TINT.gray} />
        <MetricTile label="В работе" value={inWork} note="сейчас на постах" color={TINT.orange} />
        <MetricTile label="Контроль" value={control} note="QC и одобрение" color={TINT.purple} />
        <MetricTile label="Завершено" value={d.done.length} note={`${Math.round(ready * 100)}% от всех`} color={TINT.green} />
      </div>
      <DxCard eyebrow="Диагностика" title="Что требует внимания" right={<InsightSummary insights={insights} />}>
        <Insights insights={insights} />
      </DxCard>
    </div>
  );
}

/* ============================= INSPECTION ============================= */

export interface InspectionStats {
  total: number;
  completed: number;
  approved: number;
  pendingApprovals: number;
  avgHours: number;
  conversionRate: number;
  recommendedTotal: number;
  commonIssues: { area: string; count: number }[];
}

export function InspectionDashboard({ stats, waitingVehicles }: { stats: InspectionStats; waitingVehicles: number }) {
  const s = stats;
  const completion = pct(s.completed, s.total);
  const insights = useMemo(() => {
    const out: Insight[] = [];
    if (s.pendingApprovals > 0) out.push(ins('warning', 'pending', `Ждут одобрения: ${s.pendingApprovals}`, `Рекомендации на ${fmt(s.recommendedTotal)} лежат без ответа клиента.`, String(s.pendingApprovals)));
    if (waitingVehicles > 0) out.push(ins('info', 'waiting', `Авто без осмотра: ${waitingVehicles}`, 'Машины в цехе, по которым ещё нет осмотра.', String(waitingVehicles)));
    if (s.total >= 5 && s.conversionRate < 40) out.push(ins('info', 'conv', 'Низкая конверсия осмотров', `Одобрено ${s.approved} из ${s.total}. Покажите клиенту фото повреждений и стоимость каждой рекомендации.`, `${s.conversionRate}%`));
    if (s.total >= 5 && s.conversionRate >= 60) out.push(ins('positive', 'good', 'Осмотры хорошо конвертируются', `Одобрено ${s.approved} из ${s.total}.`, `${s.conversionRate}%`));
    if (s.commonIssues[0]) out.push(ins('info', 'zone', `Чаще всего страдает: ${s.commonIssues[0].area}`, `Найдено ${s.commonIssues[0].count} раз. Подготовьте готовое предложение по этой зоне.`, String(s.commonIssues[0].count)));
    return healthy(out, 'Осмотры в порядке');
  }, [s, waitingVehicles]);

  return (
    <div className="dx" style={{ margin: '20px 0 28px' }}>
      <div className="dx-grid dx-hero">
        <DxCard eyebrow="Воронка" title="От осмотра до согласия клиента">
          <Funnel
            emptyText="Осмотров за период нет"
            steps={[
              { id: 'all', label: 'Проведено осмотров', value: s.total, color: TINT.blue },
              { id: 'done', label: 'Завершено', value: s.completed, color: TINT.teal },
              { id: 'ok', label: 'Клиент одобрил', value: s.approved, color: TINT.green },
            ]}
          />
        </DxCard>
        <div className="dx-card dx-side">
          <div style={{ width: '100%' }}><div className="dx-eyebrow">Результативность</div></div>
          <ActivityRings
            rings={[
              { id: 'conv', label: 'Конверсия', hint: 'осмотр → одобрение', value: s.conversionRate / 100, display: `${s.conversionRate}%`, color: TINT.green, unknown: s.total === 0 },
              { id: 'comp', label: 'Завершено', hint: 'осмотров', value: completion, display: `${Math.round(completion * 100)}%`, color: TINT.blue, unknown: s.total === 0 },
            ]}
            center={<><b>{s.total}</b><span>осмотров</span></>}
          />
        </div>
      </div>
      <div className="dx-grid dx-4">
        <MetricTile label="Ожидают одобрения" value={s.pendingApprovals} color={s.pendingApprovals ? TINT.orange : TINT.green} />
        <MetricTile label="Сумма рекомендаций" value={fmt(s.recommendedTotal)} note="потенциал допродаж" color={TINT.purple} />
        <MetricTile label="Средняя длительность" value={s.total ? `${s.avgHours.toFixed(1).replace('.', ',')} ч` : '—'} color={TINT.teal} />
        <MetricTile label="Ждут осмотра" value={waitingVehicles} note="авто без осмотра" color={waitingVehicles ? TINT.orange : TINT.gray} />
      </div>
      <div className="dx-grid dx-2">
        <DxCard eyebrow="Повреждения" title="Частые зоны">
          <BarList
            emptyText="Повреждения не отмечены"
            items={s.commonIssues.map((i, idx) => ({ id: i.area, label: i.area, value: i.count, display: `${i.count}`, color: colorAt(idx) }))}
          />
        </DxCard>
        <DxCard eyebrow="Диагностика" title="Что видно" right={<InsightSummary insights={insights} />}>
          <Insights insights={insights} limit={4} />
        </DxCard>
      </div>
    </div>
  );
}

/* ================================ LEADS ================================ */

export interface ScoredLead {
  status: string;
  source: string;
  created_at: string;
  score: number;
}

export function LeadsDashboard({ leads, sourceLabels }: { leads: ScoredLead[]; sourceLabels: Record<string, string> }) {
  const d = useMemo(() => {
    const total = leads.length;
    const contacted = leads.filter((l) => ['contacted', 'qualified', 'converted'].includes(l.status)).length;
    const qualified = leads.filter((l) => ['qualified', 'converted'].includes(l.status)).length;
    const converted = leads.filter((l) => l.status === 'converted').length;
    const lost = leads.filter((l) => l.status === 'lost').length;
    const junk = leads.filter((l) => l.status === 'junk').length;
    const active = leads.filter((l) => !['converted', 'lost', 'junk'].includes(l.status));
    const buckets = [0, 0, 0, 0, 0];
    for (const l of active) buckets[Math.min(4, Math.floor(l.score / 20))] += 1;
    const stale = leads.filter((l) => l.status === 'new' && Date.now() - new Date(l.created_at).getTime() > 2 * 86400000);
    const hot = active.filter((l) => l.score >= 70);
    const bySource = Object.entries(countBy(leads, (l) => l.source)).sort((a, b) => b[1] - a[1]);
    const convBySource = Object.fromEntries(bySource.map(([s]) => [s, leads.filter((l) => l.source === s && l.status === 'converted').length]));
    return { total, contacted, qualified, converted, lost, junk, active, buckets, stale, hot, bySource, convBySource };
  }, [leads]);

  const insights = useMemo(() => {
    const out: Insight[] = [];
    if (d.stale.length) out.push(ins('warning', 'stale', `${d.stale.length} ${plural(d.stale.length, 'лид ждёт', 'лида ждут', 'лидов ждут')} ответа больше 2 дней`, 'Быстрая реакция — главный фактор конверсии. Свяжитесь в первую очередь.', String(d.stale.length)));
    if (d.hot.length) out.push(ins('positive', 'hot', `Горячих лидов: ${d.hot.length}`, 'Скоринг от 70 — у этих людей высокая вероятность сделки.', String(d.hot.length)));
    if (d.total >= 6 && d.lost / d.total >= 0.3) out.push(ins('info', 'lost', 'Высокая доля потерянных', `Потеряно ${d.lost} из ${d.total}. Зафиксируйте причины отказов.`, `${Math.round((d.lost / d.total) * 100)}%`));
    const best = d.bySource.map(([s, n]) => ({ s, n, c: d.convBySource[s] })).filter((x) => x.n >= 3).sort((a, b) => b.c / b.n - a.c / a.n)[0];
    if (best && best.c > 0) out.push(ins('info', 'best', `Лучший канал: ${sourceLabels[best.s] ?? best.s}`, `Конвертировано ${best.c} из ${best.n} лидов этого источника.`, `${Math.round((best.c / best.n) * 100)}%`));
    return healthy(out, 'Воронка лидов в порядке');
  }, [d, sourceLabels]);

  const conv = d.total ? Math.round((d.converted / d.total) * 100) : 0;

  return (
    <div className="dx" style={{ marginBottom: 28 }}>
      <div className="dx-grid dx-hero">
        <DxCard eyebrow="Воронка" title="От обращения до клиента" right={<span className="ch-badge is-red">{d.lost} потеряно{d.junk > 0 ? ` · ${d.junk} спам` : ''}</span>}>
          <Funnel
            emptyText="Лидов пока нет"
            steps={[
              { id: 'all', label: 'Обращения', value: d.total, color: TINT.blue },
              { id: 'contacted', label: 'Связались', value: d.contacted, color: TINT.teal },
              { id: 'qualified', label: 'Квалифицированы', value: d.qualified, color: TINT.purple },
              { id: 'converted', label: 'Стали клиентами', value: d.converted, color: TINT.green },
            ]}
          />
        </DxCard>
        <div className="dx-card dx-side">
          <div style={{ width: '100%' }}><div className="dx-eyebrow">Конверсия</div></div>
          <ActivityRings
            rings={[{ id: 'conv', label: 'Обращение → клиент', hint: `${d.converted} из ${d.total}`, value: conv / 100, display: `${conv}%`, color: TINT.green, unknown: d.total === 0 }]}
            center={<><b>{conv}%</b><span>конверсия</span></>}
          />
        </div>
      </div>
      <div className="dx-grid dx-2">
        <DxCard eyebrow="Каналы" title="Откуда приходят лиды">
          <DonutChart
            centerValue={String(d.total)}
            centerLabel="лидов"
            emptyText="Нет данных"
            segments={d.bySource.map(([s, n], i) => ({ id: s, label: sourceLabels[s] ?? s, value: n, color: colorAt(i), display: `${n} · ${d.convBySource[s]} конв.` }))}
          />
        </DxCard>
        <DxCard eyebrow="Качество" title="Скоринг активных лидов">
          <ColumnChart values={d.buckets} labels={['0–19', '20–39', '40–59', '60–79', '80+']} color={TINT.purple} unit=" лидов" emptyText="Нет активных лидов" />
          <div className="dx-note">Чем правее — тем выше вероятность сделки.</div>
        </DxCard>
      </div>
      <DxCard eyebrow="Диагностика" title="Что видно в воронке" right={<InsightSummary insights={insights} />}>
        <Insights insights={insights} />
      </DxCard>
    </div>
  );
}

/* ============================== PIPELINE ============================== */

export function PipelineDashboard({ stages, counts, vehicles }: { stages: readonly string[]; counts: Record<string, number>; vehicles: Vehicle[] }) {
  const colors = [TINT.gray, TINT.teal, TINT.yellow, TINT.orange, TINT.purple, TINT.blue, TINT.green];
  const now = Date.now();
  const delayed = vehicles.filter((v) => v.eta_at && new Date(v.eta_at).getTime() < now && !['Готов к выдаче', 'Завершено'].includes(normalizePipelineStage(v.pipeline_stage)));
  const wip = stages.filter((s) => s !== 'Завершено').reduce((n, s) => n + (counts[s] ?? 0), 0);
  const busiest = [...stages].filter((s) => s !== 'Завершено').sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))[0];

  const insights = useMemo(() => {
    const out: Insight[] = [];
    if (delayed.length) out.push(ins('critical', 'late', `${delayed.length} ${plural(delayed.length, 'авто просрочено', 'авто просрочено', 'авто просрочено')} по ETA`, delayed.slice(0, 3).map((v) => `${v.brand} ${v.model}`).join(', ') + '.', String(delayed.length)));
    if (busiest && wip >= 4 && (counts[busiest] ?? 0) / wip >= 0.5) out.push(ins('warning', 'bottleneck', `Затор на этапе «${busiest}»`, `${counts[busiest]} из ${wip} автомобилей в цехе стоят на одном этапе.`, String(counts[busiest])));
    if ((counts['Готов к выдаче'] ?? 0) > 0) out.push(ins('positive', 'ready', `Готовы к выдаче: ${counts['Готов к выдаче']}`, 'Свяжитесь с клиентами — освободите место на стоянке.', String(counts['Готов к выдаче'])));
    return healthy(out, 'Поток цеха без заторов');
  }, [delayed, busiest, wip, counts]);

  return (
    <div className="dx" style={{ marginBottom: 24 }}>
      <div className="dx-grid dx-hero">
        <DxCard eyebrow="Цех" title="Распределение по этапам" right={<span className="ch-badge is-blue">{wip} в работе</span>}>
          <StorageBar height={18} emptyText="В цехе пока нет автомобилей" segments={stages.map((s, i) => ({ id: s, label: s, value: counts[s] ?? 0, color: colors[i % colors.length], display: String(counts[s] ?? 0) }))} />
        </DxCard>
        <DxCard eyebrow="Диагностика" title="Поток" right={<InsightSummary insights={insights} />}>
          <Insights insights={insights} limit={3} />
        </DxCard>
      </div>
    </div>
  );
}

/* ============================== SERVICES ============================== */

export function ServicesAnalyticsDashboard({ totalBookings, revenue, popular }: { totalBookings: number; revenue: number; popular: { name: string; count: number; revenue: number }[] }) {
  const avg = totalBookings ? Math.round(revenue / totalBookings) : 0;
  const top = popular[0];
  const share = top && revenue > 0 ? top.revenue / revenue : 0;
  const insights = useMemo(() => {
    const out: Insight[] = [];
    if (top && share >= 0.5 && popular.length > 1) out.push(ins('info', 'top', `${top.name} — половина выручки`, `${Math.round(share * 100)}% дохода по услугам за период.`, `${Math.round(share * 100)}%`));
    const byCheck = [...popular].filter((p) => p.count > 0).sort((a, b) => b.revenue / b.count - a.revenue / a.count)[0];
    if (byCheck && popular.length > 1) out.push(ins('positive', 'check', `Самый высокий чек: ${byCheck.name}`, `Около ${fmt(Math.round(byCheck.revenue / byCheck.count))} за работу.`, fmtMoneyCompact(byCheck.revenue / byCheck.count)));
    return healthy(out, 'Структура услуг сбалансирована');
  }, [popular, top, share]);

  return (
    <div className="dx" style={{ margin: '20px 0' }}>
      <div className="dx-grid dx-hero">
        <DxCard eyebrow="Выручка по услугам" title="Структура за период">
          <div className="dx-bignum">{num(revenue)}<small>₽</small></div>
          <div className="dx-hero-line"><span>{totalBookings} завершённых броней · средний чек {fmt(avg)}</span></div>
          <DonutChart
            centerValue={fmtCompact(revenue)}
            centerLabel="выручка, ₽"
            emptyText="Данных за период нет"
            segments={popular.map((p, i) => ({ id: p.name, label: p.name, value: p.revenue, color: colorAt(i), display: fmtMoneyCompact(p.revenue) }))}
          />
        </DxCard>
        <DxCard eyebrow="Диагностика" title="Что видно" right={<InsightSummary insights={insights} />}>
          <Insights insights={insights} limit={3} />
        </DxCard>
      </div>
      <DxCard eyebrow="Спрос" title="Популярные услуги">
        <BarList
          emptyText="Данных за период нет"
          items={popular.map((p, i) => ({ id: p.name, label: p.name, value: p.count, display: `${p.count} бр.`, color: colorAt(i), sub: `выручка ${fmt(p.revenue)}` }))}
        />
      </DxCard>
    </div>
  );
}

export function ServiceCostBreakdown({ price, materials, labour, hours }: { price: number; materials: number; labour: number; hours: string }) {
  const margin = price - materials - labour;
  const marginPct = price > 0 ? margin / price : 0;
  const color = marginPct >= 0.5 ? TINT.green : marginPct >= 0.25 ? TINT.orange : TINT.red;
  return (
    <div className="dx-grid dx-hero" style={{ marginTop: 20 }}>
      <DxCard eyebrow="Экономика услуги" title="Из чего складывается цена">
        <div className="dx-bignum">{num(Math.round(price))}<small>₽</small></div>
        <div className="dx-hero-line"><span>Цена · труд {hours} ч</span></div>
        <StorageBar
          height={18}
          segments={[
            { id: 'mat', label: 'Материалы', value: materials, color: TINT.purple, display: fmt(Math.round(materials)) },
            { id: 'lab', label: 'Труд', value: labour, color: TINT.orange, display: fmt(Math.round(labour)) },
            { id: 'mar', label: 'Маржа', value: Math.max(margin, 0), color, display: fmt(Math.round(margin)) },
          ]}
        />
        {margin < 0 && <div className="dx-note" style={{ color: 'var(--c-red)' }}>Услуга убыточна: себестоимость выше цены на {fmt(Math.round(-margin))}.</div>}
      </DxCard>
      <div className="dx-card dx-side">
        <div style={{ width: '100%' }}><div className="dx-eyebrow">Маржинальность</div></div>
        <ActivityRings
          rings={[{ id: 'm', label: 'Маржа', hint: marginPct >= 0.5 ? 'отлично' : marginPct >= 0.25 ? 'приемлемо' : 'мало', value: Math.max(0, marginPct), display: `${Math.round(marginPct * 100)}%`, color, unknown: price <= 0 }]}
          center={<><b>{Math.round(marginPct * 100)}%</b><span>маржа</span></>}
        />
      </div>
    </div>
  );
}

/* ================================ STAFF ================================ */

export function StaffDashboard({
  staff,
  jobCounts,
  training,
  openShifts,
}: {
  staff: Staff[];
  jobCounts: Record<string, { active: number; completed: number }>;
  training: StaffTraining[];
  openShifts: number;
}) {
  const active = staff.filter((s) => s.is_active && s.employment_status !== 'terminated');
  const available = active.filter((s) => (s.availability_status ?? 'available') === 'available');
  const avgLoad = active.length ? Math.round(active.reduce((s, m) => s + m.workload_pct, 0) / active.length) : 0;
  const now = Date.now();
  const in30 = now + 30 * 86400000;
  const withExpiry = training.filter((t) => t.expires_at);
  const expiring = withExpiry.filter((t) => { const e = new Date(t.expires_at!).getTime(); return e > now && e <= in30; });
  const expired = withExpiry.filter((t) => new Date(t.expires_at!).getTime() <= now);
  const jobsDone = Object.values(jobCounts).reduce((s, c) => s + c.completed, 0);
  const jobsActive = Object.values(jobCounts).reduce((s, c) => s + c.active, 0);
  const certOk = withExpiry.length ? 1 - (expiring.length + expired.length) / withExpiry.length : 1;

  const insights = useMemo(() => {
    const out: Insight[] = [];
    const hot = active.filter((s) => s.workload_pct >= 90);
    if (hot.length) out.push(ins('warning', 'hot', 'Перегрузка команды', `${hot.map((s) => s.full_name).join(', ')} — загрузка от 90%.`, `${Math.max(...hot.map((s) => s.workload_pct))}%`));
    const idle = active.filter((s) => s.workload_pct <= 20);
    if (idle.length && active.length > 1) out.push(ins('info', 'idle', 'Свободные мощности', `${idle.map((s) => s.full_name).join(', ')} — загрузка до 20%.`));
    if (expired.length) out.push(ins('critical', 'expired', `Сертификатов просрочено: ${expired.length}`, 'Сотрудники с просроченными допусками не должны вести соответствующие работы.', String(expired.length)));
    if (expiring.length) out.push(ins('warning', 'exp', `Истекает через 30 дней: ${expiring.length}`, 'Запланируйте обучение заранее.', String(expiring.length)));
    if (active.length && available.length === 0) out.push(ins('warning', 'none', 'Никто не свободен', 'Все сотрудники заняты — новые брони уйдут в очередь.'));
    return healthy(out, 'Команда в хорошей форме');
  }, [active, available.length, expired.length, expiring.length]);

  const load: BarItem[] = [...active]
    .sort((a, b) => b.workload_pct - a.workload_pct)
    .slice(0, 8)
    .map((s) => ({
      id: s.id,
      label: s.full_name,
      value: s.workload_pct,
      display: `${s.workload_pct}%`,
      color: s.workload_pct >= 90 ? TINT.red : s.workload_pct >= 60 ? TINT.blue : TINT.teal,
      sub: `${jobCounts[s.id]?.completed ?? 0} завершено · ${jobCounts[s.id]?.active ?? 0} в работе`,
      marker: 90,
    }));

  return (
    <div className="dx" style={{ marginBottom: 28 }}>
      <div className="dx-grid dx-hero">
        <DxCard eyebrow="Команда" title="Загрузка сотрудников" right={<span className="ch-badge is-gray">{active.length} активных</span>}>
          <BarList items={load} max={100} emptyText="Нет сотрудников" />
        </DxCard>
        <div className="dx-card dx-side">
          <div style={{ width: '100%' }}><div className="dx-eyebrow">Состояние команды</div></div>
          <ActivityRings
            rings={[
              { id: 'load', label: 'Загрузка', hint: 'средняя по команде', value: avgLoad / 100, display: `${avgLoad}%`, color: TINT.blue, unknown: active.length === 0 },
              { id: 'free', label: 'Свободны', hint: 'доступны сейчас', value: pct(available.length, active.length), display: `${available.length}/${active.length}`, color: TINT.green, unknown: active.length === 0 },
              { id: 'cert', label: 'Допуски', hint: 'сертификаты в порядке', value: certOk, display: `${Math.round(certOk * 100)}%`, color: TINT.orange, unknown: withExpiry.length === 0 },
            ]}
            center={<><b>{active.length}</b><span>в штате</span></>}
          />
        </div>
      </div>
      <div className="dx-grid dx-4">
        <MetricTile label="Всего сотрудников" value={staff.length} note={`${active.length} активных`} color={TINT.blue} />
        <MetricTile label="Доступны сейчас" value={available.length} note={`средняя загрузка ${avgLoad}%`} color={TINT.green} />
        <MetricTile label="Завершено работ" value={jobsDone} note={`${jobsActive} в работе`} color={TINT.teal} />
        <MetricTile label="Обучение истекает" value={expiring.length} note={`${openShifts} в смене`} color={expiring.length ? TINT.orange : TINT.gray} />
      </div>
      <DxCard eyebrow="Диагностика" title="Что видно в команде" right={<InsightSummary insights={insights} />}>
        <Insights insights={insights} />
      </DxCard>
    </div>
  );
}

/* ============================== CUSTOMERS ============================== */

const CUSTOMER_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Активные', color: TINT.blue },
  vip: { label: 'VIP', color: TINT.purple },
  sleeping: { label: 'Спящие', color: TINT.gray },
};

export function CustomersDashboard({ customers }: { customers: Customer[] }) {
  const d = useMemo(() => {
    const total = customers.length;
    const ltv = customers.reduce((s, c) => s + Number(c.lifetime_value ?? 0), 0);
    const repeat = customers.filter((c) => (c.visit_count ?? 0) > 1).length;
    const byStatus = countBy(customers, (c) => c.status);
    const top = [...customers].sort((a, b) => Number(b.lifetime_value ?? 0) - Number(a.lifetime_value ?? 0)).slice(0, 5);
    const topShare = ltv > 0 ? top.slice(0, 3).reduce((s, c) => s + Number(c.lifetime_value ?? 0), 0) / ltv : 0;
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 1));
    const newByMonth = months.map((m) => customers.filter((c) => { const t = new Date(c.created_at); return t.getFullYear() === m.getFullYear() && t.getMonth() === m.getMonth(); }).length);
    const dormant = customers.filter((c) => c.last_visit_at && now.getTime() - new Date(c.last_visit_at).getTime() > 90 * 86400000 && c.status !== 'sleeping');
    return { total, ltv, repeat, byStatus, top, topShare, months, newByMonth, dormant };
  }, [customers]);

  const repeatRate = pct(d.repeat, d.total);
  const insights = useMemo(() => {
    const out: Insight[] = [];
    if (d.dormant.length) out.push(ins('warning', 'dormant', `${d.dormant.length} ${plural(d.dormant.length, 'клиент', 'клиента', 'клиентов')} не были больше 90 дней`, `${d.dormant.slice(0, 3).map((c) => c.full_name).join(', ')}. Напомните об уходе за авто.`, String(d.dormant.length)));
    if (d.total >= 5 && d.topShare >= 0.6) out.push(ins('info', 'top3', 'Оборот держится на нескольких клиентах', `Топ-3 клиента приносят ${Math.round(d.topShare * 100)}% суммарного LTV.`, `${Math.round(d.topShare * 100)}%`));
    if (d.total >= 5 && repeatRate >= 0.4) out.push(ins('positive', 'loyal', 'Сильная лояльность', `${Math.round(repeatRate * 100)}% клиентов возвращаются.`, `${Math.round(repeatRate * 100)}%`));
    if (d.total >= 5 && repeatRate < 0.2) out.push(ins('info', 'ret', 'Мало повторных визитов', `Только ${Math.round(repeatRate * 100)}% клиентов вернулись повторно.`, `${Math.round(repeatRate * 100)}%`));
    return healthy(out, 'Клиентская база в порядке');
  }, [d, repeatRate]);

  return (
    <div className="dx" style={{ marginBottom: 28 }}>
      <div className="dx-grid dx-hero">
        <DxCard eyebrow="Ценность базы" title="Суммарный LTV">
          <div className="dx-bignum">{num(Math.round(d.ltv))}<small>₽</small></div>
          <div className="dx-hero-line"><span>{d.total} клиентов · средний LTV {fmt(d.total ? Math.round(d.ltv / d.total) : 0)}</span></div>
          <div className="dx-eyebrow" style={{ marginBottom: 12 }}>Новые клиенты по месяцам</div>
          <ColumnChart values={d.newByMonth} labels={d.months.map((m) => m.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', ''))} color={TINT.purple} height={120} emptyText="Нет новых клиентов за полгода" />
        </DxCard>
        <div className="dx-card dx-side">
          <div style={{ width: '100%' }}><div className="dx-eyebrow">Лояльность</div></div>
          <ActivityRings
            rings={[{ id: 'rep', label: 'Вернулись', hint: `${d.repeat} из ${d.total}`, value: repeatRate, display: `${Math.round(repeatRate * 100)}%`, color: TINT.purple, unknown: d.total === 0 }]}
            center={<><b>{Math.round(repeatRate * 100)}%</b><span>повторные</span></>}
          />
        </div>
      </div>
      <div className="dx-grid dx-2">
        <DxCard eyebrow="Сегменты" title="Кто в базе">
          <DonutChart
            centerValue={String(d.total)}
            centerLabel="клиентов"
            emptyText="Клиентов нет"
            segments={Object.entries(d.byStatus).map(([s, n]) => ({ id: s, label: CUSTOMER_STATUS[s]?.label ?? s, value: n, color: CUSTOMER_STATUS[s]?.color ?? TINT.gray, display: `${n}` }))}
          />
        </DxCard>
        <DxCard eyebrow="Лидеры" title="Топ клиентов по LTV">
          <BarList
            emptyText="Нет данных"
            items={d.top.map((c, i) => ({ id: c.id, label: c.full_name, value: Number(c.lifetime_value ?? 0), display: fmt(Number(c.lifetime_value ?? 0)), color: colorAt(i), sub: `${c.visit_count ?? 0} визитов` }))}
          />
        </DxCard>
      </div>
      <DxCard eyebrow="Диагностика" title="Что видно в базе" right={<InsightSummary insights={insights} />}>
        <Insights insights={insights} />
      </DxCard>
    </div>
  );
}

/* ============================== VEHICLES ============================== */

export function VehiclesDashboard({ vehicles }: { vehicles: Vehicle[] }) {
  const d = useMemo(() => {
    const brands = Object.entries(countBy(vehicles, (v) => v.brand || '—')).sort((a, b) => b[1] - a[1]);
    const stages = countBy(vehicles, (v) => normalizePipelineStage(v.pipeline_stage) || '—');
    const noPlate = vehicles.filter((v) => !v.registration_number).length;
    const noVin = vehicles.filter((v) => !v.vin).length;
    const inShop = vehicles.filter((v) => !['Завершено', ''].includes(normalizePipelineStage(v.pipeline_stage) ?? '')).length;
    const years = vehicles.map((v) => v.year).filter((y): y is number => !!y);
    const avgAge = years.length ? Math.round(new Date().getFullYear() - years.reduce((s, y) => s + y, 0) / years.length) : null;
    return { brands, stages, noPlate, noVin, inShop, avgAge };
  }, [vehicles]);

  const insights = useMemo(() => {
    const out: Insight[] = [];
    if (d.noPlate) out.push(ins('warning', 'plate', `Без госномера: ${d.noPlate}`, 'Без номера сложно искать машину и оформлять документы.', String(d.noPlate)));
    if (d.noVin) out.push(ins('info', 'vin', `Без VIN: ${d.noVin}`, 'VIN нужен для истории обслуживания и гарантийных документов.', String(d.noVin)));
    if (d.brands[0] && vehicles.length >= 5 && d.brands[0][1] / vehicles.length >= 0.4) out.push(ins('info', 'brand', `Основа парка — ${d.brands[0][0]}`, `${Math.round((d.brands[0][1] / vehicles.length) * 100)}% автомобилей. Под эту марку можно собрать специальные пакеты.`, `${Math.round((d.brands[0][1] / vehicles.length) * 100)}%`));
    return healthy(out, 'Карточки автомобилей заполнены');
  }, [d, vehicles.length]);

  const top = d.brands.slice(0, 5);
  const other = d.brands.slice(5).reduce((s, [, n]) => s + n, 0);

  return (
    <div className="dx" style={{ marginBottom: 28 }}>
      <div className="dx-grid dx-2">
        <DxCard eyebrow="Автопарк" title="Марки" right={<span className="ch-badge is-gray">{vehicles.length} авто</span>}>
          <DonutChart
            centerValue={String(vehicles.length)}
            centerLabel="автомобилей"
            emptyText="Автомобилей нет"
            segments={[...top.map(([b, n], i) => ({ id: b, label: b, value: n, color: colorAt(i), display: `${n}` })), ...(other ? [{ id: 'other', label: 'Другие', value: other, color: TINT.gray, display: `${other}` }] : [])]}
          />
        </DxCard>
        <DxCard eyebrow="Диагностика" title="Полнота карточек" right={<InsightSummary insights={insights} />}>
          <Insights insights={insights} limit={3} />
        </DxCard>
      </div>
      <div className="dx-grid dx-4">
        <MetricTile label="В системе" value={vehicles.length} color={TINT.blue} />
        <MetricTile label="В цехе" value={d.inShop} note="не на этапе «Завершено»" color={TINT.orange} />
        <MetricTile label="Средний возраст" value={d.avgAge !== null ? `${d.avgAge} л.` : '—'} color={TINT.teal} />
        <MetricTile label="Без VIN / номера" value={`${d.noVin} / ${d.noPlate}`} color={d.noVin + d.noPlate ? TINT.yellow : TINT.green} />
      </div>
    </div>
  );
}
