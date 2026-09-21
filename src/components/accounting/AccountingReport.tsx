/**
 * Бухгалтерский отчёт (Accounting) — ported from Renso Group CRM.
 * Четыре вида: прибыли и убытки, НДС, главная книга, расходы. Всё считается
 * из тех же счетов и расходов CRM и выгружается в CSV.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDownToLine, Calculator, Check, Landmark, Plus, ReceiptRussianRuble, Trash2, TriangleAlert, X } from 'lucide-react';
import { useLocalQuery } from '../../hooks/useLocalData';
import { Segmented } from '../dashboard/PeriodSelector';
import { useToast } from '../../contexts/ToastContext';
import {
  EXPENSE_CATEGORY_LABELS, agedCreditors, financialPeriods, generalLedger, isCostOfSales,
  ledgerBalance, profitAndLoss, vatReturn,
  type AccExpense, type AccInvoice, type ExpenseCategory,
} from '../../lib/accounting';
import '../../styles/accounting.css';

type View = 'pnl' | 'vat' | 'ledger' | 'expenses';
const VIEW_OPTIONS: { id: View; label: string }[] = [
  { id: 'pnl', label: 'ОПиУ' },
  { id: 'vat', label: 'НДС' },
  { id: 'ledger', label: 'Журнал' },
  { id: 'expenses', label: 'Расходы' },
];
const VAT_RATES = [0, 10, 20, 22];

const money = (n: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit' });

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((cell) => {
    const v = String(cell ?? '');
    return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString();

/** One-time demo expenses so the report is never empty on first open. */
const EXP_SEED_FLAG = 'uo:seeded:expenses:v1';
const demoExpenses = () => ([
  ['Плёнка PPF XPEL — 4 рулона', 'purchases', 'XPEL Distribution', 184000, 36800, 'PO-0091', true, -18],
  ['Керамика Gyeon Q² Mohs+ — 10 шт', 'materials', 'Gyeon Russia', 78000, 15600, 'PO-0094', false, -12],
  ['Расходники: микрофибра, пасты', 'materials', 'Detail Supply', 21500, 4300, 'PO-0097', true, -9],
  ['Аренда студии — месяц', 'premises', null, 95000, 19000, null, true, -20],
  ['Зарплаты — месяц', 'salaries', null, 180000, 0, null, true, -6],
  ['Реклама Instagram и Яндекс', 'marketing', null, 48000, 9600, null, true, -15],
  ['Бухгалтерское обслуживание', 'professional_fees', null, 25000, 5000, null, false, -4],
  ['CRM, почта и облачный хостинг', 'software', null, 9800, 1960, null, true, -8],
] as [string, ExpenseCategory, string | null, number, number, string | null, boolean, number][])
  .map(([description, category, supplier_name, net, vat, reference, is_paid, off]) => ({
    description, category, supplier_name, net, vat, reference, is_paid,
    date: day(off), paid_at: is_paid ? day(off + 2) : null,
  }));

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="acc-field"><span>{label}</span>{children}</label>;
}

function Metric({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="acc-card acc-metric">
      <div className="acc-metric-label">{label}</div>
      <div className="acc-underline" />
      <div className={`acc-metric-value${alert ? ' is-alert' : ''}`}>{value}</div>
      {sub && <div className="acc-metric-sub">{sub}</div>}
    </div>
  );
}

function Row({ label, value, strong, accent, indent }: { label: string; value: string; strong?: boolean; accent?: boolean; indent?: boolean }) {
  return (
    <div className={`acc-row${indent ? ' is-indent' : ''}`}>
      <span className={strong ? 'is-strong' : ''}>{label}</span>
      <b className={`${strong ? 'is-strong' : ''}${accent ? ' is-accent' : ''}`}>{value}</b>
    </div>
  );
}

function VatBox({ n, label, value, strong, accent, muted }: { n: number; label: string; value: string; strong?: boolean; accent?: boolean; muted?: boolean }) {
  return (
    <div className={`acc-vatbox${muted ? ' is-muted' : ''}`}>
      <i className={accent ? 'is-accent' : ''}>{n}</i>
      <span className={strong ? 'is-strong' : ''}>{label}</span>
      <b className={`${strong ? 'is-strong' : ''}${accent ? ' is-accent' : ''}`}>{value}</b>
    </div>
  );
}

export function AccountingReport() {
  const { toast } = useToast();
  const periods = useMemo(() => financialPeriods(), []);
  const [periodLabel, setPeriodLabel] = useState(periods[0].label);
  const [view, setView] = useState<View>('pnl');
  const [adding, setAdding] = useState(false);
  const [rate, setRate] = useState<number>(() => {
    try { const raw = localStorage.getItem('uo:acc:vat'); if (raw === null) return 22; const v = Number(raw); return VAT_RATES.includes(v) ? v : 22; } catch { return 22; }
  });
  const setRatePersist = (v: number) => { setRate(v); try { localStorage.setItem('uo:acc:vat', String(v)); } catch { /* ignore */ } };

  const { data: invoices } = useLocalQuery<AccInvoice>('invoices', '*');
  const { data: customers } = useLocalQuery<{ id: string; full_name?: string }>('customers', '*');
  const { data: expenses, insert, update, remove, loading: expLoading } = useLocalQuery<AccExpense>('expenses', '*', { orderBy: 'date' });

  useEffect(() => {
    if (expLoading) return;
    try {
      if (localStorage.getItem(EXP_SEED_FLAG)) return;
      localStorage.setItem(EXP_SEED_FLAG, '1');
    } catch { return; }
    if (expenses.length === 0) (async () => { for (const e of demoExpenses()) await insert(e as Partial<AccExpense>); })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expLoading]);

  const period = periods.find((p) => p.label === periodLabel) ?? periods[0];
  const name = (id?: string | null) => customers.find((c) => c.id === id)?.full_name;

  const pnl = useMemo(() => profitAndLoss(invoices, expenses, period, rate), [invoices, expenses, period, rate]);
  const vat = useMemo(() => vatReturn(invoices, expenses, period, rate), [invoices, expenses, period, rate]);
  const ledger = useMemo(() => generalLedger(invoices, expenses, period, rate, name), [invoices, expenses, period, rate, customers]);
  const balance = useMemo(() => ledgerBalance(ledger), [ledger]);
  const creditors = useMemo(() => agedCreditors(expenses), [expenses]);
  const creditorsTotal = creditors.reduce((s, b) => s + b.amount, 0);
  const slug = period.label.replace(/\s/g, '-');

  const Export = ({ onClick }: { onClick: () => void }) => (
    <button type="button" className="acc-link" onClick={onClick}><ArrowDownToLine size={14} />Экспорт CSV</button>
  );

  return (
    <div className="acc">
      <div className="acc-head">
        <div>
          <h2 className="acc-title">Бухгалтерия</h2>
          <p className="acc-sub">Метод начисления, по актуальным записям CRM — {period.label}.</p>
        </div>
        <div className="acc-head-controls">
          <select className="acc-select" value={rate} onChange={(e) => setRatePersist(Number(e.target.value))} aria-label="Ставка НДС">
            {VAT_RATES.map((r) => <option key={r} value={r}>{r === 0 ? 'Без НДС' : `НДС ${r}%`}</option>)}
          </select>
          <select className="acc-select" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} aria-label="Период">
            {periods.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="acc-tabs"><Segmented options={VIEW_OPTIONS} value={view} onChange={setView} ariaLabel="Вид отчёта" /></div>

      {view === 'pnl' && (
        <div className="acc-stack">
          <div className="acc-grid4">
            <Metric label="Выручка" sub="Без НДС" value={money(pnl.revenue)} />
            <Metric label="Валовая прибыль" sub={pnl.grossMarginPct == null ? 'Маржа недоступна' : `маржа ${pnl.grossMarginPct}%`} value={money(pnl.grossProfit)} />
            <Metric label="Операционные расходы" sub={`записей: ${pnl.expenseCount}`} value={money(pnl.operatingExpenses)} />
            <Metric label="Чистая прибыль" sub={pnl.netMarginPct == null ? '—' : `${pnl.netMarginPct}% от выручки`} value={money(pnl.netProfit)} alert={pnl.netProfit < 0} />
          </div>

          {pnl.costsIncomplete && (
            <div className="acc-card acc-note">
              <TriangleAlert size={16} />
              <p>В периоде есть выручка, но не внесена себестоимость, поэтому валовая маржа показана как недоступная, а не 100%. Добавьте закупки во вкладке «Расходы».</p>
            </div>
          )}

          <div className="acc-card acc-table-card">
            <div className="acc-card-head">
              <h3>Прибыли и убытки — {period.label}</h3>
              <Export onClick={() => downloadCsv(`pnl-${slug}.csv`, [
                ['Статья', 'Сумма'], ['Выручка', pnl.revenue], ['Себестоимость', -pnl.costOfSales], ['Валовая прибыль', pnl.grossProfit],
                ...pnl.expensesByCategory.filter((c) => !isCostOfSales(c.category)).map((c) => [EXPENSE_CATEGORY_LABELS[c.category], -c.amount]),
                ['Чистая прибыль', pnl.netProfit],
              ])} />
            </div>
            <div className="acc-rows">
              <Row label="Выручка" value={money(pnl.revenue)} strong />
              <Row label="Себестоимость" value={`(${money(pnl.costOfSales)})`} />
              <Row label="Валовая прибыль" value={money(pnl.grossProfit)} strong accent />
              {pnl.expensesByCategory.filter((c) => !isCostOfSales(c.category)).map((c) => (
                <Row key={c.category} label={EXPENSE_CATEGORY_LABELS[c.category]} value={`(${money(c.amount)})`} indent />
              ))}
              <Row label="Итого операционные расходы" value={`(${money(pnl.operatingExpenses)})`} />
              <Row label="Чистая прибыль" value={money(pnl.netProfit)} strong accent />
            </div>
          </div>

          <div className="acc-card acc-pad">
            <h3 className="acc-h3">Кредиторская задолженность по срокам</h3>
            <p className="acc-muted">Неоплаченные закупки и накладные расходы — к оплате {money(creditorsTotal)}.</p>
            <div className="acc-aged">
              {creditors.map((b) => (
                <div key={b.label}>
                  <div className="acc-aged-row"><span>{b.label}</span><em>{b.count} · {money(b.amount)}</em></div>
                  <div className="acc-bar"><i style={{ width: `${creditorsTotal ? (b.amount / creditorsTotal) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'vat' && (
        <div className="acc-card acc-table-card">
          <div className="acc-card-head">
            <div>
              <h3>Декларация по НДС — {period.label}</h3>
              <p className="acc-muted">Нумерация строк как в отчёте, ставка {rate === 0 ? 'без НДС' : `${rate}%`} — удобно переносить в декларацию.</p>
            </div>
            <Export onClick={() => downloadCsv(`vat-${slug}.csv`, [
              ['Строка', 'Описание', 'Сумма'],
              [1, 'НДС с продаж', vat.box1_outputVat], [2, 'НДС по приобретениям из-за рубежа', 0],
              [3, 'Всего НДС к начислению', vat.box3_totalOutputVat], [4, 'НДС к вычету по закупкам', vat.box4_inputVat],
              [5, 'НДС к уплате', vat.box5_netDue], [6, 'Продажи без НДС', vat.box6_totalSalesExVat], [7, 'Закупки без НДС', vat.box7_totalPurchasesExVat],
            ])} />
          </div>
          <div className="acc-rows">
            <VatBox n={1} label="НДС с продаж и прочих операций" value={money(vat.box1_outputVat)} />
            <VatBox n={2} label="НДС по приобретениям из-за рубежа" value={money(0)} muted />
            <VatBox n={3} label="Всего НДС к начислению" value={money(vat.box3_totalOutputVat)} strong />
            <VatBox n={4} label="НДС к вычету по закупкам и прочим затратам" value={money(vat.box4_inputVat)} />
            <VatBox n={5} label={vat.box5_netDue >= 0 ? 'НДС к уплате в бюджет' : 'НДС к возмещению из бюджета'} value={money(Math.abs(vat.box5_netDue))} strong accent />
            <VatBox n={6} label="Стоимость продаж без НДС" value={money(vat.box6_totalSalesExVat)} />
            <VatBox n={7} label="Стоимость закупок без НДС" value={money(vat.box7_totalPurchasesExVat)} />
          </div>
          <div className="acc-foot">
            Строка 2 удерживается на нуле: CRM пока не фиксирует зарубежные приобретения, а выдуманная цифра в отчётности хуже очевидного нуля. Основано на {vat.salesCount} счетах и {vat.purchasesCount} записях о закупках. Суммы счетов в CRM считаются с НДС.
          </div>
        </div>
      )}

      {view === 'ledger' && (
        <div className="acc-stack">
          <div className="acc-ledger-bar">
            <span className={`acc-badge ${balance.balanced ? 'is-ok' : 'is-bad'}`}>
              {balance.balanced ? <Check size={14} /> : <X size={14} />}
              {balance.balanced ? 'Журнал сходится' : 'Журнал не сходится'}
            </span>
            <span className="acc-muted">Дт {money(balance.debit)} · Кт {money(balance.credit)}</span>
            <span style={{ flex: 1 }} />
            <Export onClick={() => downloadCsv(`ledger-${slug}.csv`, [
              ['Дата', 'Документ', 'Счёт', 'Описание', 'Дебет', 'Кредит'],
              ...ledger.map((e) => [shortDate(e.date), e.reference, e.account, e.description, e.debit || '', e.credit || '']),
            ])} />
          </div>
          <div className="acc-card acc-scroll">
            <table className="acc-table">
              <thead><tr><th>Дата</th><th>Док.</th><th>Счёт</th><th>Описание</th><th className="r">Дебет</th><th className="r">Кредит</th></tr></thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id} onClick={() => (e.source === 'expense' || e.source === 'payment') && setView('expenses')}>
                    <td className="nw">{shortDate(e.date)}</td>
                    <td className="nw mono">{e.reference}</td>
                    <td className="nw">{e.account}</td>
                    <td className="dim">{e.description}</td>
                    <td className="r">{e.debit ? money(e.debit) : ''}</td>
                    <td className="r">{e.credit ? money(e.credit) : ''}</td>
                  </tr>
                ))}
                {ledger.length === 0 && <tr><td colSpan={6} className="empty">Нет проводок за {period.label}.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'expenses' && (
        <div className="acc-stack">
          <div className="acc-ledger-bar">
            <span className="acc-muted" style={{ flex: 1 }}>записей: {expenses.length} · к оплате {money(creditorsTotal)}</span>
            <button type="button" className="acc-add" onClick={() => setAdding(true)}><Plus size={16} />Добавить расход</button>
          </div>
          <div className="acc-card acc-list">
            {expenses.map((e) => (
              <div key={e.id} className="acc-exp">
                <span className={`acc-exp-ico${e.is_paid ? ' is-paid' : ''}`}><ReceiptRussianRuble size={16} /></span>
                <div className="acc-exp-main">
                  <div className="acc-exp-title">{e.description}</div>
                  <div className="acc-exp-sub">{EXPENSE_CATEGORY_LABELS[e.category]}{e.supplier_name ? ` · ${e.supplier_name}` : ''} · {shortDate(e.date)}</div>
                </div>
                <div className="acc-exp-amt">
                  <b>{money(e.net + e.vat)}</b>
                  {e.vat > 0 && <small>вкл. НДС {money(e.vat)}</small>}
                </div>
                <div className="acc-exp-actions">
                  {e.is_paid ? <span className="acc-paid">Оплачено</span> : (
                    <button type="button" className="acc-pill" onClick={async () => { await update(e.id, { is_paid: true, paid_at: new Date().toISOString() }); toast('Расход отмечен оплаченным'); }}>Оплатить</button>
                  )}
                  <button type="button" className="acc-icon" aria-label="Удалить расход" onClick={async () => { if (window.confirm('Удалить расход?')) await remove(e.id); }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            {expenses.length === 0 && <p className="empty">Расходов нет. Добавьте закупки, чтобы валовая маржа считалась по факту.</p>}
          </div>
        </div>
      )}

      <div className="acc-card acc-connector">
        <span className="acc-exp-ico"><Landmark size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="acc-exp-title">Внешняя бухгалтерская система</div>
          <div className="acc-exp-sub">Готово к подключению 1С / Контур. Пока всё выше выгружается в CSV, чтобы бухгалтер не ждал интеграцию.</div>
        </div>
        <span className="acc-pill is-static">Не подключено</span>
      </div>

      {adding && <ExpenseForm onClose={() => setAdding(false)} onSave={async (row) => { const err = await insert(row); toast(err ? 'Ошибка: ' + err : 'Расход добавлен'); }} />}
    </div>
  );
}

function ExpenseForm({ onClose, onSave }: { onClose: () => void; onSave: (row: Partial<AccExpense>) => Promise<void> }) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('purchases');
  const [supplier, setSupplier] = useState('');
  const [net, setNet] = useState('');
  const [vat, setVat] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const valid = description.trim().length > 0 && Number(net) > 0;

  return (
    <div className="acc-overlay" onClick={onClose}>
      <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="acc-modal-head">
          <Calculator size={16} /><h3>Новый расход</h3>
          <button type="button" className="acc-icon" onClick={onClose} aria-label="Закрыть"><X size={16} /></button>
        </div>
        <div className="acc-modal-body">
          <Field label="Описание"><input className="acc-input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Категория">
            <select className="acc-input" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Поставщик (необязательно)"><input className="acc-input" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
          <div className="acc-two">
            <Field label="Сумма без НДС, ₽"><input className="acc-input" type="number" value={net} onChange={(e) => setNet(e.target.value)} /></Field>
            <Field label="НДС, ₽"><input className="acc-input" type="number" value={vat} onChange={(e) => setVat(e.target.value)} /></Field>
          </div>
          <div className="acc-two">
            <Field label="Дата"><input className="acc-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Документ №"><input className="acc-input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          </div>
        </div>
        <div className="acc-modal-foot">
          <button type="button" className="acc-save" disabled={!valid} onClick={async () => {
            await onSave({
              description: description.trim(), category, supplier_name: supplier.trim() || null,
              net: Number(net) || 0, vat: Number(vat) || 0, reference: reference.trim() || null,
              date: new Date(date).toISOString(), is_paid: false, paid_at: null,
            });
            onClose();
          }}>Сохранить расход</button>
          <button type="button" className="acc-cancel" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
