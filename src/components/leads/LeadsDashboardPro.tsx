/**
 * Leads analytics — CRM-grade dashboard (Zoho / amoCRM style) on the shared chart kit.
 * Every figure comes from `buildLeadStats` so it always matches the list, board and tasks.
 */
import { SourceIcon } from './SourceIcon';
import { useMemo } from 'react';
import {
  AreaChart,
  BarList,
  ColumnChart,
  DonutChart,
  DxCard,
  Funnel,
  Heatmap,
  InsightSummary,
  Insights,
  MetricTile,
  StorageBar,
  TINT,
  colorAt,
  fmtDelta,
} from '../charts';
import { plural, sortInsights, type Insight } from '../../lib/diagnostics';
import {
  AGING_LABELS,
  HEAT_COLS,
  HEAT_ROWS,
  STAGE_PROBABILITY,
  SOURCE_TINT,
  buildLeadStats,
  fmtCompactRub,
  type SmartFilter,
} from '../../lib/leads';
import { LEAD_STATUS_LABELS } from '../../lib/constants';
import type { Lead, Staff } from '../../types/database';

export interface DashPreset {
  status?: string;
  smart?: SmartFilter;
  follow?: 'overdue';
  source?: string;
  owner?: string;
}

const ins = (tone: Insight['tone'], id: string, title: string, detail: string, metric?: string): Insight => ({ id, tone, title, detail, metric });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

interface Props {
  leads: Lead[];
  staff: Staff[];
  sourceLabels: Record<string, string>;
  onApply: (p: DashPreset) => void;
}

export function LeadsDashboardPro({ leads, staff, sourceLabels, onApply }: Props) {
  const s = useMemo(() => buildLeadStats(leads, staff), [leads, staff]);
  const srcName = (k: string) => sourceLabels[k] ?? k;

  const trendPct = s.createdPrev7 ? ((s.createdLast7 - s.createdPrev7) / s.createdPrev7) * 100 : null;
  const f = s.funnel;

  const insights = useMemo(() => {
    const out: Insight[] = [];
    if (s.overdue) out.push(ins('warning', 'overdue', `Просрочено задач по лидам: ${s.overdue}`, 'Назначенный шаг не выполнен в срок — перенесите или выполните.', String(s.overdue)));
    if (s.stale) out.push(ins('warning', 'stale', `${s.stale} ${plural(s.stale, 'лид завис', 'лида зависли', 'лидов зависли')} на 3+ дня`, 'Нет движения по карточке. Запланируйте следующий шаг.', String(s.stale)));
    if (s.noOwner) out.push(ins('warning', 'owner', `Без ответственного: ${s.noOwner}`, 'Лид без владельца почти всегда теряется. Назначьте менеджера.', String(s.noOwner)));
    if (s.hot) out.push(ins('positive', 'hot', `Горячих лидов: ${s.hot}`, 'Высокий скоринг — у этих людей самая высокая вероятность сделки.', String(s.hot)));
    if (trendPct !== null && s.createdPrev7 >= 3 && trendPct <= -30) out.push(ins('warning', 'trend', 'Приток лидов упал', `За 7 дней ${s.createdLast7} против ${s.createdPrev7} неделей ранее. Проверьте рекламу и каналы.`, fmtDelta(trendPct)));
    if (trendPct !== null && s.createdPrev7 >= 3 && trendPct >= 30) out.push(ins('positive', 'trend-up', 'Приток лидов растёт', `За 7 дней ${s.createdLast7} против ${s.createdPrev7} неделей ранее.`, fmtDelta(trendPct)));
    const best = s.sources.filter((x) => x.total >= 3).sort((a, b) => b.conv - a.conv)[0];
    if (best && best.converted > 0) out.push(ins('info', 'best', `Лучший канал: ${srcName(best.source)}`, `Конвертировано ${best.converted} из ${best.total}. Вкладывайтесь в него.`, `${best.conv}%`));
    const dead = s.sources.filter((x) => x.total >= 4 && x.converted === 0)[0];
    if (dead) out.push(ins('info', 'dead', `${srcName(dead.source)}: ${dead.total} лидов, ни одной сделки`, 'Проверьте качество трафика или работу с обращениями этого канала.', '0%'));
    const lostTotal = s.byStatus.lost;
    if (lostTotal >= 2 && s.lostReasons[0] && s.lostReasons[0].count / lostTotal >= 0.4) out.push(ins('info', 'lost', `Главная причина потерь: ${s.lostReasons[0].reason}`, `${s.lostReasons[0].count} из ${lostTotal} потерянных лидов.`, `${pct(s.lostReasons[0].count, lostTotal)}%`));
    if (s.dups) out.push(ins('info', 'dups', `Возможные дубликаты: ${s.dups}`, 'Совпадают телефон или email. Объедините карточки, чтобы не звонить дважды.', String(s.dups)));
    if (s.pipelineUnknown) out.push(ins('info', 'unknown', `У ${s.pipelineUnknown} ${plural(s.pipelineUnknown, 'лида', 'лидов', 'лидов')} нет оценки суммы`, 'Укажите ожидаемый бюджет в карточке — прогноз станет точнее.', String(s.pipelineUnknown)));
    return sortInsights(out.length ? out : [ins('positive', 'calm', 'Воронка лидов в порядке', 'Отклонений не найдено.')]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const attention: { id: string; label: string; count: number; tone: 'red' | 'orange' | 'blue'; go: DashPreset }[] = [
    { id: 'overdue', label: 'Просрочены задачи', count: s.overdue, tone: 'red', go: { follow: 'overdue' } },
    { id: 'stale', label: 'Зависли 3+ дня', count: s.stale, tone: 'orange', go: { smart: 'stale' } },
    { id: 'noowner', label: 'Без ответственного', count: s.noOwner, tone: 'orange', go: { smart: 'noowner' } },
    { id: 'nonext', label: 'Нет след. шага', count: s.noNext, tone: 'blue', go: { smart: 'nonext' } },
    { id: 'dups', label: 'Дубликаты', count: s.dups, tone: 'blue', go: { smart: 'dups' } },
  ];

  const stageValueSegs = (['new', 'contacted', 'qualified'] as const).map((st) => ({
    id: st,
    label: LEAD_STATUS_LABELS[st],
    value: s.valueByStage[st] ?? 0,
    color: st === 'new' ? TINT.blue : st === 'contacted' ? TINT.teal : TINT.purple,
    display: fmtCompactRub(s.valueByStage[st] ?? 0),
  }));

  return (
    <div className="dx ld-dash" style={{ marginBottom: 24 }}>
      {/* ---------- KPI tiles ---------- */}
      <div className="dx-grid dx-4">
        <MetricTile label="Всего лидов" value={s.total.toLocaleString('ru-RU')} delta={trendPct === null ? undefined : fmtDelta(trendPct)} deltaTone={trendPct === null || trendPct === 0 ? 'flat' : trendPct > 0 ? 'up' : 'down'} note={`+${s.createdLast7} за 7 дней`} spark={s.days.map((d) => d.created)} color={TINT.blue} onClick={() => onApply({})} />
        <MetricTile label="В работе" value={s.open} note={`Ср. скоринг ${s.avgScore}`} color={TINT.teal} onClick={() => onApply({ status: '' })} />
        <MetricTile label="Воронка, ₽" value={fmtCompactRub(s.pipelineValue)} note={s.pipelineUnknown ? `${s.pipelineUnknown} без оценки` : 'все лиды оценены'} color={TINT.purple} />
        <MetricTile label="Прогноз сделок" value={fmtCompactRub(s.forecast)} note="взвешено по этапам" color={TINT.green} />
      </div>
      <div className="dx-grid dx-4">
        <MetricTile label="Конверсия" value={`${s.convRate}%`} note={`${s.byStatus.converted} из ${f.all} обращений`} color={TINT.green} onClick={() => onApply({ status: 'converted' })} />
        <MetricTile label="Win rate" value={s.winRate === null ? '—' : `${s.winRate}%`} note="выиграно / (выиграно + потеряно)" color={TINT.green} />
        <MetricTile label="Горячие" value={s.hot} note="скоринг 70+" color={TINT.orange} onClick={() => onApply({ smart: 'hot' })} />
        <MetricTile label="Средняя сделка" value={s.avgDeal ? fmtCompactRub(s.avgDeal) : '—'} note={s.avgDeal ? 'по конвертированным' : 'нет закрытых сделок'} color={TINT.pink} />
      </div>

      {/* ---------- Funnel + attention ---------- */}
      <div className="dx-grid dx-hero">
        <DxCard eyebrow="Воронка" title="От обращения до клиента" right={<span className="ch-badge is-red">{s.byStatus.lost} потеряно{s.byStatus.junk ? ` · ${s.byStatus.junk} спам` : ''}</span>}>
          <Funnel
            emptyText="Лидов пока нет"
            steps={[
              { id: 'all', label: 'Обращения', value: f.all, color: TINT.blue },
              { id: 'contacted', label: `Связались · ${pct(f.contacted, f.all)}%`, value: f.contacted, color: TINT.teal },
              { id: 'qualified', label: `Квалифицированы · ${pct(f.qualified, f.contacted)}% от связавшихся`, value: f.qualified, color: TINT.purple },
              { id: 'converted', label: `Клиенты · ${pct(f.converted, f.qualified)}% от квалифицированных`, value: f.converted, color: TINT.green },
            ]}
          />
          <div className="ld-stage-prob">
            {(['new', 'contacted', 'qualified'] as const).map((st) => (
              <span key={st}>{LEAD_STATUS_LABELS[st]} → сделка: <b>{Math.round(STAGE_PROBABILITY[st] * 100)}%</b></span>
            ))}
          </div>
        </DxCard>
        <DxCard eyebrow="Действия" title="Требует внимания">
          <div className="dx-list">
            {attention.map((a) => (
              <div key={a.id} className="dx-row">
                <div className="dx-row-main">
                  <div className="dx-row-title">{a.label}</div>
                </div>
                <button type="button" className={`ld-count-btn is-${a.count ? a.tone : 'none'}`} disabled={!a.count} onClick={() => onApply(a.go)}>
                  {a.count}
                </button>
              </div>
            ))}
          </div>
        </DxCard>
      </div>

      {/* ---------- Dynamics + channels ---------- */}
      <div className="dx-grid dx-7-5">
        <DxCard eyebrow="Динамика" title="Лиды за 14 дней" right={<span className={`ch-badge ${trendPct !== null && trendPct < 0 ? 'is-red' : 'is-green'}`}>{s.createdLast7} за неделю</span>}>
          <AreaChart
            labels={s.days.map((d) => d.label)}
            longLabels={s.days.map((d) => d.long)}
            height={220}
            emptyText="Данных за период нет"
            format={(n) => `${Math.round(n)}`}
            axisFormat={(n) => (Number.isInteger(n) ? String(n) : '')}
            series={[
              { id: 'created', label: 'Новые лиды', values: s.days.map((d) => d.created), color: TINT.blue, area: true },
              { id: 'won', label: 'Стали клиентами', values: s.days.map((d) => d.won), color: TINT.green },
            ]}
          />
        </DxCard>
        <DxCard eyebrow="Каналы" title="Откуда приходят лиды">
          <DonutChart
            centerValue={String(s.total)}
            centerLabel="лидов"
            emptyText="Нет данных"
            segments={s.sources.map((r, i) => ({ id: r.source, label: srcName(r.source), value: r.total, color: SOURCE_TINT[r.source] ?? colorAt(i), display: `${r.total} · ${r.converted} конв.` }))}
          />
        </DxCard>
      </div>

      {/* ---------- Source + owner tables ---------- */}
      <div className="dx-grid dx-2">
        <DxCard eyebrow="Эффективность" title="Каналы: качество и деньги">
          <div className="ld-table-scroll">
            <table className="ld-mini-table">
              <thead><tr><th>Канал</th><th>Лидов</th><th>Клиенты</th><th>Конв.</th><th>Скоринг</th><th>В воронке</th></tr></thead>
              <tbody>
                {s.sources.map((r) => (
                  <tr key={r.source} className="is-click" onClick={() => onApply({ source: r.source })}>
                    <td><SourceIcon source={r.source} />{srcName(r.source)}</td>
                    <td>{r.total}</td>
                    <td>{r.converted}</td>
                    <td><b>{r.conv}%</b></td>
                    <td>{r.open ? r.avgScore : '—'}</td>
                    <td>{r.value ? fmtCompactRub(r.value) : '—'}</td>
                  </tr>
                ))}
                {!s.sources.length && <tr><td colSpan={6} className="ld-empty-cell">Нет данных</td></tr>}
              </tbody>
            </table>
          </div>
        </DxCard>
        <DxCard eyebrow="Команда" title="Нагрузка и дисциплина менеджеров">
          <div className="ld-table-scroll">
            <table className="ld-mini-table">
              <thead><tr><th>Менеджер</th><th>В работе</th><th>Горячие</th><th>Просрочено</th><th>Клиенты</th><th>В воронке</th></tr></thead>
              <tbody>
                {s.owners.map((o) => (
                  <tr key={o.id || 'none'} className="is-click" onClick={() => (o.id ? onApply({ owner: o.id }) : onApply({ smart: 'noowner' }))}>
                    <td>{o.name}</td>
                    <td>{o.open}</td>
                    <td>{o.hot || '—'}</td>
                    <td className={o.overdue ? 'is-bad' : ''}>{o.overdue || '—'}</td>
                    <td>{o.converted}</td>
                    <td>{o.value ? fmtCompactRub(o.value) : '—'}</td>
                  </tr>
                ))}
                {!s.owners.length && <tr><td colSpan={6} className="ld-empty-cell">Нет данных</td></tr>}
              </tbody>
            </table>
          </div>
        </DxCard>
      </div>

      {/* ---------- Quality / aging / lost ---------- */}
      <div className="dx-grid dx-3">
        <DxCard eyebrow="Качество" title="Скоринг активных лидов">
          <ColumnChart values={s.scoreBuckets} labels={['0–19', '20–39', '40–59', '60–79', '80+']} color={TINT.purple} unit=" лидов" emptyText="Нет активных лидов" />
          <div className="dx-note">Чем правее — тем выше вероятность сделки.</div>
        </DxCard>
        <DxCard eyebrow="Возраст" title="Сколько лиды в работе">
          <ColumnChart values={s.aging} labels={AGING_LABELS} color={TINT.orange} unit=" лидов" emptyText="Нет активных лидов" />
          <div className="dx-note">Старые лиды без движения — кандидаты на закрытие или срочный контакт.</div>
        </DxCard>
        <DxCard eyebrow="Потери" title="Почему теряем лидов">
          <BarList
            emptyText="Потерянных лидов нет"
            items={s.lostReasons.map((r, i) => ({ id: r.reason, label: r.reason, value: r.count, display: String(r.count), color: colorAt(i + 2) }))}
          />
        </DxCard>
      </div>

      {/* ---------- Heatmap + value by stage ---------- */}
      <div className="dx-grid dx-2">
        <DxCard eyebrow="Спрос" title="Когда приходят обращения">
          <Heatmap rows={HEAT_ROWS} cols={HEAT_COLS} values={s.heat} color={TINT.blue} unit="лидов" />
          <div className="dx-note">Ночь 0–6, утро 6–12, день 12–18, вечер 18–24. Планируйте дежурства по тёмным ячейкам.</div>
        </DxCard>
        <DxCard eyebrow="Деньги" title="Сумма в воронке по этапам" right={<span className="ch-badge is-blue">{fmtCompactRub(s.forecast)} прогноз</span>}>
          <StorageBar height={18} emptyText="Нет лидов с оценкой суммы" segments={stageValueSegs} />
          <div className="dx-note">Сумма — бюджет из карточки лида; если не указан, берётся ориентир по услуге. Прогноз = сумма × вероятность этапа.</div>
        </DxCard>
      </div>

      {/* ---------- Diagnostics ---------- */}
      <DxCard eyebrow="Диагностика" title="Что видно в воронке" right={<InsightSummary insights={insights} />}>
        <Insights insights={insights} limit={8} />
      </DxCard>
    </div>
  );
}
