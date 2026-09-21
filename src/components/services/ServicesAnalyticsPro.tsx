/**
 * Аналитика услуг — уникальный набор отчётов именно для каталога услуг:
 * ABC-анализ выручки (Парето), меню-инжиниринг «спрос × маржа», маржинальность,
 * структура по категориям, «спящие» услуги и диагностика каталога.
 */
import { useMemo } from 'react';
import {
  AreaChart, BarList, DonutChart, DxCard, InsightSummary, Insights, MetricTile, TINT,
  colorAt, fmtCompact, fmtDelta, fmtMoneyCompact,
} from '../charts';
import { fmt } from '../../lib/constants';
import { getFinancePeriodRange, inRange, pctChange, buildBuckets, sumIntoBuckets, FINANCE_PERIOD_LABELS, type FinancePeriod } from '../../lib/analytics';
import { bookingValue } from '../../lib/metrics';
import { calcServiceCost, categoryLabel, normalizeServiceCategory } from '../../lib/services';
import { plural, sortInsights, type Insight } from '../../lib/diagnostics';
import type { Booking, InventoryItem, Service, ServiceMaterialRecipe } from '../../types/database';

const DONE = ['completed', 'delivered'];
const ins = (tone: Insight['tone'], id: string, title: string, detail: string, metric?: string): Insight => ({ id, tone, title, detail, metric });
const dir = (p: number | null): 'up' | 'down' | 'flat' => (p === null || Math.abs(p) < 0.05 ? 'flat' : p > 0 ? 'up' : 'down');
const pctText = (n: number) => `${Math.round(n)}%`;

interface Row {
  service: Service;
  count: number;
  revenue: number;
  marginPct: number;
  hasRecipe: boolean;
  abc: 'A' | 'B' | 'C';
  share: number;
}

export function ServicesAnalyticsPro({ bookings, services, recipes, inventoryItems, period, labourRate = 1500 }: {
  bookings: Booking[]; services: Service[]; recipes: ServiceMaterialRecipe[]; inventoryItems: InventoryItem[];
  period: FinancePeriod; labourRate?: number;
}) {
  const data = useMemo(() => {
    const range = getFinancePeriodRange(period);
    const len = range.end.getTime() - range.start.getTime();
    const prevRange = { start: new Date(range.start.getTime() - len - 1), end: new Date(range.start.getTime() - 1) };
    const done = bookings.filter((b) => DONE.includes(b.status));
    const cur = done.filter((b) => inRange(b.scheduled_at, range));
    const prev = done.filter((b) => inRange(b.scheduled_at, prevRange));
    const sum = (list: Booking[]) => list.reduce((s, b) => s + bookingValue(b), 0);
    const revenue = sum(cur);
    const prevRevenue = sum(prev);

    // per-service aggregates
    const agg = new Map<string, { count: number; revenue: number }>();
    for (const b of cur) {
      if (!b.service_id) continue;
      const a = agg.get(b.service_id) ?? { count: 0, revenue: 0 };
      a.count += 1; a.revenue += bookingValue(b);
      agg.set(b.service_id, a);
    }

    const active = services.filter((s) => s.is_active !== false);
    const rows: Row[] = active.map((s) => {
      const a = agg.get(s.id) ?? { count: 0, revenue: 0 };
      const c = calcServiceCost(s, recipes, inventoryItems, labourRate);
      return { service: s, count: a.count, revenue: a.revenue, marginPct: c.marginPct, hasRecipe: recipes.some((r) => r.service_id === s.id), abc: 'C', share: 0 };
    });

    // ABC (Pareto) on revenue
    const sold = rows.filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    let cum = 0;
    for (const r of sold) {
      r.share = revenue > 0 ? r.revenue / revenue : 0;
      const before = cum;
      cum += r.share;
      r.abc = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C';
    }

    // Menu engineering: demand × margin
    const withDemand = rows.filter((r) => r.count > 0);
    const avgCount = withDemand.length ? withDemand.reduce((s, r) => s + r.count, 0) / withDemand.length : 0;
    const marginThreshold = 45;
    const quad = { stars: [] as Row[], horses: [] as Row[], puzzles: [] as Row[], dogs: [] as Row[] };
    for (const r of rows) {
      const hiDemand = r.count > 0 && r.count >= avgCount;
      const hiMargin = r.marginPct >= marginThreshold;
      (hiDemand ? (hiMargin ? quad.stars : quad.horses) : (hiMargin ? quad.puzzles : quad.dogs)).push(r);
    }

    // trend
    const buckets = buildBuckets(range);
    const prevBuckets = buildBuckets(prevRange, undefined, prevRange.end);
    const rev = sumIntoBuckets(buckets, cur, (b) => b.scheduled_at, bookingValue);
    const prevRev = sumIntoBuckets(prevBuckets, prev, (b) => b.scheduled_at, bookingValue);
    const cnt = sumIntoBuckets(buckets, cur, (b) => b.scheduled_at, () => 1);

    // categories
    const byCat = new Map<string, number>();
    for (const r of rows) if (r.revenue > 0) byCat.set(normalizeServiceCategory(r.service.category), (byCat.get(normalizeServiceCategory(r.service.category)) ?? 0) + r.revenue);
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

    const withMargin = rows.filter((r) => r.hasRecipe || r.service.price > 0);
    const avgMargin = withMargin.length ? withMargin.reduce((s, r) => s + r.marginPct, 0) / withMargin.length : 0;

    return { rows, sold, quad, buckets, rev, prevRev, cnt, cats, revenue, prevRevenue, count: cur.length, prevCount: prev.length, avgMargin, sleeping: rows.filter((r) => r.count === 0), active };
  }, [bookings, services, recipes, inventoryItems, period, labourRate]);

  const avg = data.count ? Math.round(data.revenue / data.count) : 0;
  const prevAvg = data.prevCount ? Math.round(data.prevRevenue / data.prevCount) : 0;
  const revChange = pctChange(data.revenue, data.prevRevenue);

  const insights = useMemo(() => {
    const out: Insight[] = [];
    const a = data.sold.filter((r) => r.abc === 'A');
    if (a.length && data.sold.length > 3) out.push(ins('info', 'abc', `${a.length} ${plural(a.length, 'услуга даёт', 'услуги дают', 'услуг дают')} 80% выручки`, `Класс A: ${a.slice(0, 3).map((r) => r.service.name).join(', ')}${a.length > 3 ? '…' : ''}. Защищайте загрузку постов под них.`, `${a.length}/${data.active.length}`));
    const lowMargin = data.rows.filter((r) => r.count > 0 && r.marginPct < 25);
    if (lowMargin.length) out.push(ins('warning', 'lowm', `${lowMargin.length} ${plural(lowMargin.length, 'востребованная услуга', 'востребованные услуги', 'востребованных услуг')} с маржой < 25%`, `${lowMargin[0].service.name}${lowMargin.length > 1 ? ' и др.' : ''} — пересмотрите цену или расход материалов.`, pctText(lowMargin[0].marginPct)));
    const noRecipe = data.active.filter((s) => !recipes.some((r) => r.service_id === s.id));
    if (noRecipe.length) out.push(ins('info', 'norecipe', `${noRecipe.length} ${plural(noRecipe.length, 'услуга без рецептуры', 'услуги без рецептуры', 'услуг без рецептуры')}`, 'Без расхода материалов маржа считается только по труду и завышена.', String(noRecipe.length)));
    if (data.sleeping.length) out.push(ins('warning', 'sleep', `${data.sleeping.length} ${plural(data.sleeping.length, '«спящая» услуга', '«спящие» услуги', '«спящих» услуг')} без броней`, `${data.sleeping.slice(0, 2).map((r) => r.service.name).join(', ')}${data.sleeping.length > 2 ? '…' : ''} — за период не заказывали.`, String(data.sleeping.length)));
    if (data.quad.puzzles.length) out.push(ins('info', 'puzzle', `${data.quad.puzzles.length} ${plural(data.quad.puzzles.length, 'услуга-«загадка»', 'услуги-«загадки»', 'услуг-«загадок»')}`, 'Высокая маржа, но мало спроса — продвигайте в КП и рекламе.', String(data.quad.puzzles.length)));
    if (revChange !== null && revChange <= -20) out.push(ins('critical', 'drop', 'Выручка по услугам упала', `Ниже предыдущего периода на ${Math.abs(Math.round(revChange))}%.`, fmtDelta(revChange)));
    return sortInsights(out.length ? out : [ins('positive', 'calm', 'Каталог в хорошей форме', 'Отклонений не найдено.')]);
  }, [data, recipes, revChange]);

  const quadCard = (title: string, hint: string, list: Row[], tone: string) => (
    <div className="svc-quad" style={{ ['--q' as string]: tone }}>
      <div className="svc-quad-head"><b>{title}</b><span>{list.length}</span></div>
      <div className="svc-quad-hint">{hint}</div>
      <div className="svc-quad-list">
        {list.slice(0, 5).map((r) => <div key={r.service.id}><span>{r.service.name}</span><em>{r.count} бр. · {pctText(r.marginPct)}</em></div>)}
        {!list.length && <div className="svc-quad-empty">—</div>}
        {list.length > 5 && <div className="svc-quad-empty">и ещё {list.length - 5}</div>}
      </div>
    </div>
  );

  const abcTone: Record<string, 'green' | 'orange' | 'gray'> = { A: 'green', B: 'orange', C: 'gray' };

  return (
    <div className="dx" style={{ margin: '20px 0' }}>
      <div className="dx-kpis">
        <MetricTile label="Выручка услуг" value={fmt(data.revenue)} delta={fmtDelta(revChange)} deltaTone={dir(revChange)} note={FINANCE_PERIOD_LABELS[period].toLowerCase()} spark={data.rev} color={TINT.blue} />
        <MetricTile label="Выполнено работ" value={data.count} delta={fmtDelta(pctChange(data.count, data.prevCount))} deltaTone={dir(pctChange(data.count, data.prevCount))} note="завершённых броней" spark={data.cnt} color={TINT.green} />
        <MetricTile label="Средний чек" value={fmt(avg)} delta={fmtDelta(pctChange(avg, prevAvg))} deltaTone={dir(pctChange(avg, prevAvg))} note="на одну работу" color={TINT.orange} />
        <MetricTile label="Средняя маржа" value={pctText(data.avgMargin)} note={`каталог · ${data.active.length} активных`} color={data.avgMargin >= 50 ? TINT.green : data.avgMargin >= 25 ? TINT.orange : TINT.red} />
      </div>

      <div className="dx-grid dx-hero" style={{ marginTop: 16 }}>
        <DxCard eyebrow="Динамика" title="Выручка услуг">
          <AreaChart
            ariaLabel="Выручка услуг за период"
            labels={data.buckets.map((b) => b.label)}
            longLabels={data.buckets.map((b) => b.long)}
            format={fmt}
            axisFormat={fmtMoneyCompact}
            series={[
              { id: 'rev', label: 'Выручка', values: data.rev, color: TINT.blue, area: true },
              { id: 'prev', label: 'Прошлый период', values: data.prevRev.length ? data.buckets.map((_, i) => data.prevRev[i] ?? 0) : [], color: TINT.gray, dashed: true },
            ]}
          />
        </DxCard>
        <DxCard eyebrow="Диагностика" title="Что видно в каталоге" right={<InsightSummary insights={insights} />}>
          <Insights insights={insights} limit={4} />
        </DxCard>
      </div>

      <div className="dx-grid" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <DxCard eyebrow="ABC-анализ" title="Кто делает выручку (Парето)">
          <BarList
            emptyText="Данных за период нет"
            items={data.sold.slice(0, 8).map((r) => ({
              id: r.service.id, label: r.service.name, value: r.revenue,
              display: `${Math.round(r.share * 100)}%`, sub: `${fmt(r.revenue)} · ${r.count} бр.`,
              color: r.abc === 'A' ? TINT.green : r.abc === 'B' ? TINT.orange : TINT.gray,
              badge: { text: r.abc, tone: abcTone[r.abc] },
            }))}
          />
        </DxCard>
        <DxCard eyebrow="Маржинальность" title="Прибыльность услуг">
          <BarList
            emptyText="Нет услуг"
            items={[...data.rows].filter((r) => r.service.price > 0).sort((a, b) => b.marginPct - a.marginPct).slice(0, 8).map((r) => ({
              id: r.service.id, label: r.service.name, value: Math.max(0, r.marginPct),
              display: pctText(r.marginPct), sub: r.hasRecipe ? 'материалы + труд' : 'только труд (нет рецептуры)',
              color: r.marginPct >= 50 ? TINT.green : r.marginPct >= 25 ? TINT.orange : TINT.red,
            }))}
          />
        </DxCard>
        <DxCard eyebrow="Структура" title="Выручка по категориям">
          <DonutChart
            centerValue={fmtCompact(data.revenue)} centerLabel="выручка, ₽" emptyText="Данных за период нет"
            segments={data.cats.map(([id, value], i) => ({ id, label: categoryLabel(id), value, color: colorAt(i), display: fmtMoneyCompact(value) }))}
          />
        </DxCard>
      </div>

      <DxCard eyebrow="Меню-инжиниринг" title="Спрос × маржа: что делать с каждой услугой">
        <div className="svc-quads">
          {quadCard('★ Звёзды', 'Популярны и прибыльны — держите качество, не занижайте цену.', data.quad.stars, TINT.green)}
          {quadCard('⚙ Рабочие лошадки', 'Много заказов, но низкая маржа — поднимите цену или снизьте расход.', data.quad.horses, TINT.orange)}
          {quadCard('? Загадки', 'Прибыльны, но редки — продвигайте в КП и пакетах.', data.quad.puzzles, TINT.blue)}
          {quadCard('▽ Аутсайдеры', 'Мало заказов и низкая маржа — пересмотреть или убрать.', data.quad.dogs, TINT.red)}
        </div>
      </DxCard>
    </div>
  );
}
