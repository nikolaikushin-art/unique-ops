import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { isAdmin } from '../lib/permissions';
import {
  applyFix,
  loadReconData,
  runReconciliation,
  type FixId,
  type ReconCheck,
  type ReconData,
  type ReconGroup,
  type Severity,
} from '../lib/reconciliation';
import { DxCard } from './charts/DxCard';
import { ActivityRings } from './charts/ActivityRings';
import { TINT } from './charts/palette';

const GROUPS: { id: ReconGroup; label: string; hint: string }[] = [
  { id: 'tieout', label: 'Сверка показателей', hint: 'Одно и то же число, полученное двумя способами' },
  { id: 'finance', label: 'Финансы', hint: 'Счета, брони и оплаты' },
  { id: 'operations', label: 'Операции', hint: 'Заказы, автомобили, производство' },
  { id: 'customers', label: 'Клиенты', hint: 'Карточки и история' },
  { id: 'staff', label: 'Команда', hint: 'Загрузка и назначения' },
  { id: 'inventory', label: 'Склад', hint: 'Остатки, цены, сроки' },
];

const TONE: Record<Severity, { color: string; label: string }> = {
  ok: { color: 'var(--c-green)', label: 'Сходится' },
  info: { color: 'var(--c-blue)', label: 'К сведению' },
  warning: { color: 'var(--c-orange)', label: 'Расхождение' },
  critical: { color: 'var(--c-red)', label: 'Ошибка' },
};

const DEFINITIONS: [string, string][] = [
  ['Выручка', 'Полученные деньги. Оплаченный счёт — на дату оплаты. Оплаченная бронь без счёта — на дату выполнения. Если к брони привязан счёт, считается только счёт (без двойного учёта). Частичная оплата не входит.'],
  ['К оплате', 'Сумма всех неоплаченных счетов (ожидают + просрочены).'],
  ['Просрочен', 'Статус «просрочен» или «ожидает оплаты» с датой оплаты раньше сегодняшнего дня.'],
  ['Завершённая работа', 'Бронь в статусе «завершено» или «выдано»; период — по дате завершения (если её нет — по дате записи).'],
  ['Стоимость брони', 'Согласованная стоимость брони; если не задана — цена услуги из каталога.'],
  ['Средний чек', 'Стоимость завершённых работ ÷ их количество.'],
  ['Работа просрочена', 'Не завершена и не отменена, а срок (ETA, иначе время записи) уже прошёл.'],
  ['Ниже минимума', 'Активная позиция склада, где остаток ≤ минимального уровня.'],
  ['Периоды', 'День, неделя (с понедельника), месяц, квартал и год — «с начала периода». Прошлый период берётся той же длины.'],
];

function csvEscape(v: string) { return `"${v.replace(/"/g, '""')}"`; }

export function ReconciliationPanel() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { refresh } = useDataRefresh();
  const canFix = isAdmin(profile?.role);
  const [data, setData] = useState<ReconData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showDefs, setShowDefs] = useState(false);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await loadReconData());
      setRanAt(new Date());
    } catch (err) {
      console.error('ReconciliationPanel: load failed', err);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const checks = useMemo(() => (data ? runReconciliation(data) : []), [data]);
  const counts = useMemo(() => {
    const c = { ok: 0, info: 0, warning: 0, critical: 0 };
    for (const k of checks) c[k.severity] += 1;
    return c;
  }, [checks]);
  const score = checks.length ? Math.round((counts.ok / checks.length) * 100) : 0;

  const fix = async (check: ReconCheck) => {
    if (!data || !check.fixId) return;
    if (!window.confirm(`${check.fixLabel}?\n\nБудут изменены записи в базе (${check.items.length} шт. в списке). Действие можно проверить повторной сверкой.`)) return;
    setBusy(check.id);
    try {
      const n = await applyFix(check.fixId as FixId, data);
      toast(n ? `Исправлено записей: ${n}` : 'Нечего исправлять');
      refresh();
      await load();
    } catch (err) {
      toast('Ошибка: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(null);
    }
  };

  const exportCSV = () => {
    const rows = [['Группа', 'Проверка', 'Статус', 'Ожидалось', 'Фактически', 'Деталь']];
    for (const c of checks) {
      const g = GROUPS.find((x) => x.id === c.group)?.label ?? c.group;
      if (!c.items.length) rows.push([g, c.title, TONE[c.severity].label, c.expected ?? '', c.actual ?? '', '']);
      else for (const it of c.items) rows.push([g, c.title, TONE[c.severity].label, c.expected ?? '', c.actual ?? '', it]);
    }
    const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(csvEscape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reconciliation.csv';
    a.click();
  };

  if (!data) return <div className="dx-card"><div className="empty-state">Идёт сверка данных…</div></div>;

  return (
    <div className="dx" id="reconciliation">
      <div className="dx-grid dx-hero">
        <DxCard
          eyebrow="Сверка данных"
          title="Целостность платформы"
          right={
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="dx-btn is-ghost" onClick={load}>Сверить заново</button>
              <button type="button" className="dx-btn is-ghost" onClick={exportCSV}>Экспорт CSV</button>
            </span>
          }
        >
          <div className="dx-hero-line" style={{ marginTop: 0 }}>
            <span>Проверено правил: <b style={{ color: 'var(--text)' }}>{checks.length}</b>{ranAt && <> · {ranAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</>}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="ch-badge is-green">{counts.ok} сходится</span>
            {counts.critical > 0 && <span className="ch-badge is-red">{counts.critical} ошибок</span>}
            {counts.warning > 0 && <span className="ch-badge is-orange">{counts.warning} расхождений</span>}
            {counts.info > 0 && <span className="ch-badge is-blue">{counts.info} к сведению</span>}
          </div>
          <div className="dx-note">Все экраны считают выручку, «к оплате», просрочки и загрузку по одним правилам (см. «Определения»). Ниже — что в данных этим правилам не соответствует.</div>
          <button type="button" className="dx-link" style={{ marginTop: 8 }} onClick={() => setShowDefs((v) => !v)}>{showDefs ? 'Скрыть определения' : 'Определения метрик'}</button>
          {showDefs && (
            <div className="dx-list" style={{ marginTop: 10 }}>
              {DEFINITIONS.map(([k, v]) => (
                <div className="dx-row" key={k} style={{ alignItems: 'flex-start' }}>
                  <div className="dx-row-main"><div className="dx-row-title" style={{ whiteSpace: 'normal' }}>{k}</div><div className="dx-row-sub" style={{ whiteSpace: 'normal' }}>{v}</div></div>
                </div>
              ))}
            </div>
          )}
        </DxCard>
        <div className="dx-card dx-side">
          <div style={{ width: '100%' }}><div className="dx-eyebrow">Индекс целостности</div></div>
          <ActivityRings
            legend={false}
            rings={[{ id: 'score', label: 'Сходится', value: score / 100, display: `${score}%`, color: score >= 80 ? TINT.green : score >= 50 ? TINT.orange : TINT.red }]}
            center={<><b>{score}%</b><span>сходится</span></>}
          />
        </div>
      </div>

      {GROUPS.map((g) => {
        const list = checks.filter((c) => c.group === g.id);
        if (!list.length) return null;
        return (
          <DxCard key={g.id} eyebrow={g.hint} title={g.label} right={<span className={`ch-badge is-${list.every((c) => c.severity === 'ok') ? 'green' : 'orange'}`}>{list.filter((c) => c.severity === 'ok').length}/{list.length}</span>}>
            <div className="dx-list">
              {list.map((c) => {
                const t = TONE[c.severity];
                const expanded = open === c.id;
                return (
                  <div key={c.id} className="recon-row" style={{ ['--tone' as string]: t.color }}>
                    <div className="dx-row" style={{ cursor: c.items.length ? 'pointer' : 'default' }} onClick={() => c.items.length && setOpen(expanded ? null : c.id)}>
                      <span className="recon-dot" />
                      <div className="dx-row-main" style={{ flex: 1 }}>
                        <div className="dx-row-title" style={{ whiteSpace: 'normal' }}>{c.title}</div>
                        <div className="dx-row-sub" style={{ whiteSpace: 'normal' }}>{c.description}</div>
                        {c.expected !== undefined && (
                          <div className="dx-row-sub" style={{ marginTop: 6 }}>
                            <b style={{ color: 'var(--text)' }}>{c.expected}</b> ↔ <b style={{ color: c.severity === 'ok' ? 'var(--c-green)' : 'var(--tone)' }}>{c.actual}</b>
                          </div>
                        )}
                      </div>
                      <span className="recon-tag">{c.severity === 'ok' ? '✓' : c.items.length || t.label}</span>
                      {c.fixId && canFix && c.severity !== 'ok' && (
                        <button type="button" className="dx-btn" disabled={busy === c.id} onClick={(e) => { e.stopPropagation(); fix(c); }}>{busy === c.id ? '…' : c.fixLabel}</button>
                      )}
                    </div>
                    {expanded && (
                      <ul className="recon-items">
                        {c.items.slice(0, 12).map((it, i) => <li key={i}>{it}</li>)}
                        {c.items.length > 12 && <li className="more">и ещё {c.items.length - 12}…</li>}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </DxCard>
        );
      })}
    </div>
  );
}
