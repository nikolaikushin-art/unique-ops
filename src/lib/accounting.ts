/**
 * Accounting engine — pure functions over CRM records (счета + расходы), so the
 * P&L, VAT and ledger figures come from the same data the rest of the CRM uses.
 * Ported from the Renso Group CRM accounting module.
 *
 * - Gross profit is MEASURED from expenses booked as cost of sales, never guessed.
 * - Everything is on an accruals basis (invoice date / expense date).
 * - Invoice amounts in this CRM are gross (VAT included); net and VAT are split
 *   using the selected VAT rate.
 */

export type ExpenseCategory =
  | 'purchases' | 'materials' | 'salaries' | 'premises' | 'professional_fees'
  | 'marketing' | 'travel' | 'software' | 'bank_charges' | 'other';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  purchases: 'Закупки / себестоимость',
  materials: 'Материалы и расходники',
  salaries: 'Зарплаты и персонал',
  premises: 'Аренда помещения',
  professional_fees: 'Услуги специалистов',
  marketing: 'Маркетинг',
  travel: 'Поездки и транспорт',
  software: 'ПО и IT',
  bank_charges: 'Банковские комиссии',
  other: 'Прочее',
};

const COST_OF_SALES: ExpenseCategory[] = ['purchases', 'materials'];
export const isCostOfSales = (c: string) => COST_OF_SALES.includes(c as ExpenseCategory);

export interface Period { from: Date; to: Date; label: string }

export interface AccInvoice {
  id: string;
  invoice_number?: string | null;
  customer_id?: string | null;
  description?: string | null;
  amount: number | string;
  status: string;
  created_at: string;
  paid_at?: string | null;
  payments?: { id?: string; amount: number | string; at: string; method?: string }[] | null;
}

export interface AccExpense {
  id: string;
  date: string;
  description: string;
  category: ExpenseCategory;
  supplier_name?: string | null;
  net: number;
  vat: number;
  reference?: string | null;
  is_paid: boolean;
  paid_at?: string | null;
}

export function financialPeriods(reference = new Date()): Period[] {
  const out: Period[] = [];
  const y = reference.getFullYear();
  const q = Math.floor(reference.getMonth() / 3);
  for (let back = 0; back < 4; back += 1) {
    const qi = q - back;
    const year = y + Math.floor(qi / 4);
    const quarter = ((qi % 4) + 4) % 4;
    out.push({
      from: new Date(year, quarter * 3, 1),
      to: new Date(year, quarter * 3 + 3, 0, 23, 59, 59, 999),
      label: `${quarter + 1} кв. ${year}`,
    });
  }
  out.push({ from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59, 999), label: `${y}` });
  out.push({ from: new Date(y - 1, 0, 1), to: new Date(y - 1, 11, 31, 23, 59, 59, 999), label: `${y - 1}` });
  return out;
}

function within(iso: string | null | undefined, p: Period) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= p.from.getTime() && t <= p.to.getTime();
}

const countsAsSale = (i: AccInvoice) => i.status !== 'draft' && i.status !== 'cancelled';
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Split a gross (VAT-inclusive) amount into net + VAT for a given rate in %. */
export function splitGross(gross: number, ratePct: number) {
  const net = ratePct > 0 ? round2(gross / (1 + ratePct / 100)) : gross;
  return { net, vat: round2(gross - net) };
}

export interface ProfitAndLoss {
  revenue: number; costOfSales: number; grossProfit: number; grossMarginPct: number | null;
  operatingExpenses: number; expensesByCategory: { category: ExpenseCategory; amount: number }[];
  netProfit: number; netMarginPct: number | null; invoiceCount: number; expenseCount: number;
  costsIncomplete: boolean;
}

export function profitAndLoss(invoices: AccInvoice[], expenses: AccExpense[], period: Period, ratePct: number): ProfitAndLoss {
  let revenue = 0; let invoiceCount = 0;
  for (const inv of invoices) {
    if (!countsAsSale(inv) || !within(inv.created_at, period)) continue;
    revenue += splitGross(Number(inv.amount) || 0, ratePct).net;
    invoiceCount += 1;
  }
  const byCat = new Map<ExpenseCategory, number>();
  let costOfSales = 0; let operatingExpenses = 0; let expenseCount = 0;
  for (const e of expenses) {
    if (!within(e.date, period)) continue;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.net);
    if (isCostOfSales(e.category)) costOfSales += e.net; else operatingExpenses += e.net;
    expenseCount += 1;
  }
  const grossProfit = revenue - costOfSales;
  const netProfit = grossProfit - operatingExpenses;
  return {
    revenue, costOfSales, grossProfit,
    grossMarginPct: revenue > 0 && costOfSales > 0 ? round1((grossProfit / revenue) * 100) : null,
    operatingExpenses,
    expensesByCategory: [...byCat.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    netProfit,
    netMarginPct: revenue > 0 ? round1((netProfit / revenue) * 100) : null,
    invoiceCount, expenseCount,
    costsIncomplete: revenue > 0 && costOfSales === 0,
  };
}

export interface VatReturn {
  box1_outputVat: number; box3_totalOutputVat: number; box4_inputVat: number; box5_netDue: number;
  box6_totalSalesExVat: number; box7_totalPurchasesExVat: number; salesCount: number; purchasesCount: number;
}

export function vatReturn(invoices: AccInvoice[], expenses: AccExpense[], period: Period, ratePct: number): VatReturn {
  let outputVat = 0; let salesExVat = 0; let salesCount = 0;
  for (const inv of invoices) {
    if (!countsAsSale(inv) || !within(inv.created_at, period)) continue;
    const s = splitGross(Number(inv.amount) || 0, ratePct);
    outputVat += s.vat; salesExVat += s.net; salesCount += 1;
  }
  let inputVat = 0; let purchasesExVat = 0; let purchasesCount = 0;
  for (const e of expenses) {
    if (!within(e.date, period)) continue;
    inputVat += e.vat; purchasesExVat += e.net; purchasesCount += 1;
  }
  return {
    box1_outputVat: outputVat, box3_totalOutputVat: outputVat, box4_inputVat: inputVat,
    box5_netDue: outputVat - inputVat,
    box6_totalSalesExVat: Math.round(salesExVat), box7_totalPurchasesExVat: Math.round(purchasesExVat),
    salesCount, purchasesCount,
  };
}

export interface LedgerEntry {
  id: string; date: string; reference: string; description: string; account: string;
  debit: number; credit: number; source: 'invoice' | 'expense' | 'receipt' | 'payment';
}

export function generalLedger(
  invoices: AccInvoice[], expenses: AccExpense[], period: Period, ratePct: number,
  customerName: (id?: string | null) => string | undefined,
): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const inv of invoices) {
    if (!countsAsSale(inv)) continue;
    const ref = inv.invoice_number ?? '—';
    const who = customerName(inv.customer_id) ?? 'клиент';
    const gross = Number(inv.amount) || 0;
    const { net, vat } = splitGross(gross, ratePct);
    if (within(inv.created_at, period)) {
      out.push({ id: `${inv.id}-dr`, date: inv.created_at, reference: ref, description: `Счёт клиенту — ${who}`, account: 'Дебиторы', debit: gross, credit: 0, source: 'invoice' });
      out.push({ id: `${inv.id}-cr`, date: inv.created_at, reference: ref, description: 'Продажи', account: 'Продажи', debit: 0, credit: net, source: 'invoice' });
      if (vat > 0) out.push({ id: `${inv.id}-vat`, date: inv.created_at, reference: ref, description: 'НДС с продаж', account: 'Контроль НДС', debit: 0, credit: vat, source: 'invoice' });
    }
    // receipts: every payment in the invoice's ledger on its own date; a legacy invoice just marked paid → one receipt
    const ledger = inv.payments ?? [];
    const receipts: { key: string; at: string; amount: number }[] = ledger.map((p, i) => ({ key: p.id ?? String(i), at: p.at, amount: Number(p.amount) || 0 }));
    if (inv.status === 'paid' && inv.paid_at) {
      const rest = gross - receipts.reduce((s, r) => s + r.amount, 0);
      if (rest > 0.5) receipts.push({ key: 'rest', at: inv.paid_at, amount: rest });
    }
    for (const r of receipts) {
      if (!within(r.at, period)) continue;
      out.push({ id: `${inv.id}-bank-${r.key}`, date: r.at, reference: ref, description: `Поступление — ${who}`, account: 'Банк', debit: r.amount, credit: 0, source: 'receipt' });
      out.push({ id: `${inv.id}-contra-${r.key}`, date: r.at, reference: ref, description: 'Погашение дебиторки', account: 'Дебиторы', debit: 0, credit: r.amount, source: 'receipt' });
    }
  }
  for (const e of expenses) {
    const ref = e.reference ?? '—';
    const who = e.supplier_name ?? undefined;
    if (within(e.date, period)) {
      out.push({ id: `${e.id}-dr`, date: e.date, reference: ref, description: e.description, account: isCostOfSales(e.category) ? 'Себестоимость' : 'Операционные расходы', debit: e.net, credit: 0, source: 'expense' });
      if (e.vat > 0) out.push({ id: `${e.id}-vat`, date: e.date, reference: ref, description: 'НДС к вычету', account: 'Контроль НДС', debit: e.vat, credit: 0, source: 'expense' });
      out.push({ id: `${e.id}-cr`, date: e.date, reference: ref, description: e.description, account: 'Кредиторы', debit: 0, credit: e.net + e.vat, source: 'expense' });
    }
    if (e.is_paid && e.paid_at && within(e.paid_at, period)) {
      out.push({ id: `${e.id}-bank`, date: e.paid_at, reference: ref, description: `Оплата — ${who ?? 'поставщик'}`, account: 'Банк', debit: 0, credit: e.net + e.vat, source: 'payment' });
      out.push({ id: `${e.id}-contra`, date: e.paid_at, reference: ref, description: 'Погашение кредиторки', account: 'Кредиторы', debit: e.net + e.vat, credit: 0, source: 'payment' });
    }
  }
  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function ledgerBalance(entries: LedgerEntry[]) {
  const debit = entries.reduce((s, e) => s + e.debit, 0);
  const credit = entries.reduce((s, e) => s + e.credit, 0);
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
}

export interface AgedBucket { label: string; amount: number; count: number }

export function agedCreditors(expenses: AccExpense[], asOf = new Date()): AgedBucket[] {
  const b: AgedBucket[] = [
    { label: 'Текущие', amount: 0, count: 0 },
    { label: '1–30 дней', amount: 0, count: 0 },
    { label: '31–60 дней', amount: 0, count: 0 },
    { label: '60+ дней', amount: 0, count: 0 },
  ];
  for (const e of expenses) {
    if (e.is_paid) continue;
    const days = Math.floor((asOf.getTime() - new Date(e.date).getTime()) / 86400000);
    const i = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : 3;
    b[i].amount += e.net + e.vat; b[i].count += 1;
  }
  return b;
}
