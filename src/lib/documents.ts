/**
 * PRINTABLE DOCUMENTS — счёт, акт выполненных работ, гарантийный талон, приёмо-передаточный акт, смета.
 * Built as clean A4 HTML and printed through the browser (Print → «Сохранить как PDF»). No server needed.
 */
import { db } from './localdb';
import { getCompany, type CompanyProfile } from './company';
import { bookingLines, bookingTotal, type BookingLine } from './orderFlow';
import { PAYMENT_METHOD_LABELS } from './ledger';
import { invoiceBalance, invoicePaidAmount, linkInvoicesToBookings, type MetricBooking, type MetricInvoice } from './metrics';
import type { Booking, Customer, Inspection, Invoice, Vehicle } from '../types/database';

export type BookingDocKind = 'quote' | 'act' | 'warranty' | 'acceptance';
export type InvoiceDocKind = 'invoice' | 'act';

export const BOOKING_DOC_LABELS: Record<BookingDocKind, string> = {
  quote: 'Смета',
  act: 'Акт выполненных работ',
  warranty: 'Гарантийный талон',
  acceptance: 'Акт приёма автомобиля',
};

/* ------------------------------------------------------------ helpers */

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rub = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
const longDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

const ONES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function triad(n: number, female: boolean): string {
  const out: string[] = [];
  out.push(HUNDREDS[Math.floor(n / 100)]);
  const r = n % 100;
  if (r >= 10 && r < 20) out.push(TEENS[r - 10]);
  else { out.push(TENS[Math.floor(r / 10)]); out.push((female ? ONES_F : ONES)[r % 10]); }
  return out.filter(Boolean).join(' ');
}

function pluralRu(n: number, one: string, few: string, many: string) {
  const m = Math.abs(n) % 100; const d = m % 10;
  if (m > 10 && m < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

/** 12 500,50 → «Двенадцать тысяч пятьсот рублей 50 копеек». */
export function rublesInWords(value: number): string {
  const rubles = Math.floor(Math.abs(value));
  const kop = Math.round((Math.abs(value) - rubles) * 100);
  if (rubles === 0) return `Ноль рублей ${String(kop).padStart(2, '0')} копеек`;
  const parts: string[] = [];
  const mln = Math.floor(rubles / 1_000_000);
  const th = Math.floor((rubles % 1_000_000) / 1000);
  const rest = rubles % 1000;
  if (mln) parts.push(`${triad(mln, false)} ${pluralRu(mln, 'миллион', 'миллиона', 'миллионов')}`);
  if (th) parts.push(`${triad(th, true)} ${pluralRu(th, 'тысяча', 'тысячи', 'тысяч')}`);
  if (rest) parts.push(triad(rest, false));
  const words = parts.join(' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${pluralRu(rubles, 'рубль', 'рубля', 'рублей')} ${String(kop).padStart(2, '0')} ${pluralRu(kop, 'копейка', 'копейки', 'копеек')}`;
}

const CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font: 12.5px/1.45 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 19px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: #444; }
  .muted { color: #666; }
  .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 17px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-weight: 600; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .kv { display: grid; grid-template-columns: 170px 1fr; gap: 3px 12px; }
  .kv div:nth-child(odd) { color: #666; }
  .total { text-align: right; font-size: 15px; font-weight: 700; margin-top: 8px; }
  .sign { display: flex; gap: 40px; margin-top: 46px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; font-size: 11px; color: #444; }
  .box { border: 1px solid #bbb; padding: 8px 10px; border-radius: 4px; }
  .small { font-size: 11px; color: #555; }
  .checks span { display: inline-block; margin-right: 18px; }
`;

function companyBlock(c: CompanyProfile): string {
  const legal = c.legal_name || c.name;
  const ids = [c.inn && `ИНН ${c.inn}`, c.kpp && `КПП ${c.kpp}`, c.ogrn && `ОГРН ${c.ogrn}`].filter(Boolean).join(' · ');
  return `
    <div class="head">
      <div><div class="brand">${esc(c.name)}</div><div class="muted">${esc(legal !== c.name ? legal : '')}</div></div>
      <div class="small" style="text-align:right">${esc(ids)}<br>${esc(c.address)}<br>${esc([c.phone, c.email, c.site].filter(Boolean).join(' · '))}</div>
    </div>`;
}

function bankBlock(c: CompanyProfile): string {
  if (!c.bank_name && !c.account) return '';
  return `
    <h2>Реквизиты для оплаты</h2>
    <div class="box small">
      Получатель: ${esc(c.legal_name || c.name)}${c.inn ? `, ИНН ${esc(c.inn)}` : ''}${c.kpp ? `, КПП ${esc(c.kpp)}` : ''}<br>
      Банк: ${esc(c.bank_name)}${c.bik ? `, БИК ${esc(c.bik)}` : ''}<br>
      Р/с ${esc(c.account)}${c.corr_account ? ` · К/с ${esc(c.corr_account)}` : ''}
    </div>`;
}

function linesTable(lines: BookingLine[]): { html: string; total: number } {
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const rows = lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td class="num">${l.qty}</td><td class="num">${rub(l.price)}</td><td class="num">${rub(l.qty * l.price)}</td></tr>`).join('');
  return {
    total,
    html: `<table><thead><tr><th style="width:30px">№</th><th>Наименование работ / услуг</th><th class="num">Кол-во</th><th class="num">Цена</th><th class="num">Сумма</th></tr></thead><tbody>${rows}</tbody></table>`,
  };
}

function carLine(v?: Vehicle | null): string {
  if (!v) return '—';
  return [`${v.brand} ${v.model}`, v.year, v.color, v.registration_number].filter(Boolean).join(' · ');
}

function customerBlock(cu?: Customer | null, v?: Vehicle | null): string {
  return `<div class="kv">
    <div>Клиент</div><div>${esc(cu?.full_name ?? '—')}</div>
    <div>Телефон</div><div>${esc(cu?.phone ?? '—')}</div>
    <div>Автомобиль</div><div>${esc(carLine(v))}</div>
    ${v?.vin ? `<div>VIN</div><div>${esc(v.vin)}</div>` : ''}
  </div>`;
}

function signBlock(c: CompanyProfile, left = 'Исполнитель', right = 'Заказчик'): string {
  return `<div class="sign"><div>${left}${c.director ? ` · ${esc(c.director)}` : ''}<br>подпись / М.П.</div><div>${right}<br>подпись / расшифровка</div></div>`;
}

function shell(title: string, body: string, c: CompanyProfile): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${companyBlock(c)}${body}</body></html>`;
}

/** Print an HTML document through a hidden iframe (no pop-up blockers; the browser offers «Save as PDF»). */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc || !frame.contentWindow) { frame.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 1500);
  frame.contentWindow.onafterprint = cleanup;
  setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); cleanup(); }, 250);
}

/* ------------------------------------------------------------ data loading */

const BK = '*, customers(*), vehicles(*), services(*)';

async function loadBooking(id: string): Promise<Booking | null> {
  const { data } = await db.from('bookings').select(BK).eq('id', id).maybeSingle();
  return (data as Booking) ?? null;
}

async function loadInspection(b: Booking): Promise<Inspection | null> {
  const byBooking = await db.from('inspections').select('*').eq('booking_id', b.id).order('created_at', { ascending: false }).limit(1);
  const a = (byBooking.data as Inspection[] | null)?.[0];
  if (a) return a;
  if (!b.vehicle_id) return null;
  const byVehicle = await db.from('inspections').select('*').eq('vehicle_id', b.vehicle_id).order('created_at', { ascending: false }).limit(1);
  return (byVehicle.data as Inspection[] | null)?.[0] ?? null;
}

async function loadInvoiceFor(b: Booking): Promise<Invoice | null> {
  const { data: direct } = await db.from('invoices').select('*, customers(*)').eq('booking_id', b.id).maybeSingle();
  if (direct) return direct as Invoice;
  if (b.invoice_id) {
    const { data } = await db.from('invoices').select('*, customers(*)').eq('id', b.invoice_id).maybeSingle();
    if (data) return data as Invoice;
  }
  return null;
}

/** The booking an invoice bills: hard link first, then the legacy name-matching. */
export async function bookingOfInvoice(inv: Invoice): Promise<Booking | null> {
  if (inv.booking_id) return loadBooking(inv.booking_id);
  const { data } = await db.from('bookings').select(BK).eq('customer_id', inv.customer_id);
  const list = (data ?? []) as Booking[];
  const links = linkInvoicesToBookings([inv as unknown as MetricInvoice], list as unknown as MetricBooking[]);
  const bookingId = [...links.keys()][0];
  return bookingId ? list.find((b) => b.id === bookingId) ?? null : null;
}

function addMonths(d: Date, m: number) { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; }

/* ------------------------------------------------------------ documents */

function invoiceHtml(inv: Invoice, b: Booking | null, c: CompanyProfile): string {
  const customer = inv.customers ?? b?.customers;
  const lines: BookingLine[] = b ? bookingLines(b) : [{ name: inv.description || 'Работы', qty: 1, price: Number(inv.amount) }];
  let { html, total } = linesTable(lines);
  // invoice amount is the source of truth; if it differs from the order lines show the invoice total
  const amount = Number(inv.amount);
  if (Math.abs(total - amount) > 0.5) { const t = linesTable([{ name: inv.description || 'Работы', qty: 1, price: amount }]); html = t.html; total = t.total; }
  const paid = invoicePaidAmount(inv);
  const balance = invoiceBalance(inv);
  const pays = (inv.payments ?? []).map((p) => `${longDate(p.at)} — ${rub(p.amount)} (${PAYMENT_METHOD_LABELS[p.method] ?? p.method})`).join('<br>');
  const body = `
    <h1>Счёт № ${esc(inv.invoice_number)} от ${longDate(inv.created_at)}</h1>
    <div class="muted">Срок оплаты: ${longDate(inv.due_date)}</div>
    <h2>Плательщик</h2>${customerBlock(customer, b?.vehicles)}
    <h2>Позиции</h2>${html}
    <div class="total">Итого к оплате: ${rub(total)}</div>
    <div class="small" style="text-align:right">${esc(rublesInWords(total))}</div>
    ${paid > 0 ? `<div class="box small" style="margin-top:10px"><b>Оплачено: ${rub(paid)}</b>${balance > 0 ? ` · остаток к оплате: <b>${rub(balance)}</b>` : ' · счёт оплачен полностью'}${pays ? `<br>${pays}` : ''}</div>` : ''}
    ${bankBlock(c)}
    ${c.invoice_note ? `<p class="small" style="margin-top:12px">${esc(c.invoice_note)}</p>` : ''}
    ${signBlock(c, 'Руководитель', 'Плательщик')}`;
  return shell(`Счёт ${inv.invoice_number}`, body, c);
}

function actHtml(number: string, date: string | Date | null | undefined, b: Booking | null, inv: Invoice | null, c: CompanyProfile): string {
  const lines: BookingLine[] = b ? bookingLines(b) : [{ name: inv?.description || 'Работы', qty: 1, price: Number(inv?.amount ?? 0) }];
  const { html, total } = linesTable(lines);
  const customer = b?.customers ?? inv?.customers;
  const body = `
    <h1>Акт № ${esc(number)} выполненных работ (оказанных услуг)</h1>
    <div class="muted">от ${longDate(date ?? new Date())}</div>
    <h2>Стороны</h2>
    <div class="box small">Исполнитель: ${esc(c.legal_name || c.name)}${c.inn ? `, ИНН ${esc(c.inn)}` : ''}.<br>Заказчик: ${esc(customer?.full_name ?? '—')}.</div>
    <h2>Автомобиль</h2>${customerBlock(customer, b?.vehicles)}
    <h2>Выполненные работы</h2>${html}
    <div class="total">Всего: ${rub(total)}</div>
    <div class="small" style="text-align:right">${esc(rublesInWords(total))}</div>
    <p style="margin-top:14px">Вышеперечисленные работы выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет. Автомобиль принят Заказчиком после выполнения работ.</p>
    ${signBlock(c)}`;
  return shell(`Акт ${number}`, body, c);
}

function quoteHtml(b: Booking, c: CompanyProfile): string {
  const { html, total } = linesTable(bookingLines(b));
  const deposit = Number(b.deposit ?? 0);
  const body = `
    <h1>Смета на работы</h1>
    <div class="muted">от ${longDate(new Date())} · действительна до ${longDate(new Date(Date.now() + 7 * 86400000))}</div>
    <h2>Клиент и автомобиль</h2>${customerBlock(b.customers, b.vehicles)}
    <div class="kv" style="margin-top:6px"><div>Дата работ</div><div>${longDate(b.scheduled_at)}</div><div>Готовность</div><div>${longDate(b.eta_at)}</div></div>
    <h2>Состав работ</h2>${html}
    <div class="total">Итого: ${rub(total)}</div>
    <div class="small" style="text-align:right">${esc(rublesInWords(total))}</div>
    ${deposit > 0 ? `<div class="box small" style="margin-top:10px">Предоплата при записи: <b>${rub(deposit)}</b> · остаток: <b>${rub(Math.max(0, total - deposit))}</b></div>` : ''}
    <p class="small" style="margin-top:12px">Стоимость может измениться, если при осмотре будут выявлены дополнительные работы — они согласуются с Заказчиком отдельно.</p>
    ${signBlock(c, 'Исполнитель', 'Согласовано (Заказчик)')}`;
  return shell('Смета', body, c);
}

function warrantyHtml(b: Booking, c: CompanyProfile): string {
  const done = new Date(b.completed_at ?? b.scheduled_at);
  const svcRows: string[] = [];
  const consider = [{ id: b.service_id, name: b.services?.name, warranty: b.services?.warranty_months, maint: b.services?.maintenance_interval_months }];
  for (const s of consider) {
    if (!s.name) continue;
    const w = Number(s.warranty ?? 0); const m = Number(s.maint ?? 0);
    svcRows.push(`<tr><td>${esc(s.name)}</td><td>${longDate(done)}</td><td>${w ? `${w} мес.` : 'не предусмотрена'}</td><td>${w ? longDate(addMonths(done, w)) : '—'}</td><td>${m ? `каждые ${m} мес. (следующее — ${longDate(addMonths(done, m))})` : '—'}</td></tr>`);
  }
  const body = `
    <h1>Гарантийный талон</h1>
    <div class="muted">выдан ${longDate(new Date())}</div>
    <h2>Владелец и автомобиль</h2>${customerBlock(b.customers, b.vehicles)}
    <h2>Работы и сроки гарантии</h2>
    <table><thead><tr><th>Услуга</th><th>Дата выполнения</th><th>Гарантия</th><th>Действует до</th><th>Плановое обслуживание</th></tr></thead><tbody>${svcRows.join('') || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
    ${(b.extra_items ?? []).length ? `<div class="small">Дополнительно выполнено: ${esc((b.extra_items ?? []).map((x) => x.name).join(', '))}. Сроки гарантии по ним уточняйте в студии.</div>` : ''}
    <h2>Условия гарантии</h2>
    <div class="box small" style="white-space:pre-wrap">${esc(c.warranty_terms)}</div>
    ${signBlock(c, 'Мастер / представитель студии', 'Клиент')}`;
  return shell('Гарантийный талон', body, c);
}

function acceptanceHtml(b: Booking, insp: Inspection | null, c: CompanyProfile): string {
  const v = b.vehicles;
  const sev: Record<string, string> = { minor: 'незначительное', moderate: 'среднее', severe: 'значительное' };
  const damage = (insp?.damage_map ?? []).map((d) => `<tr><td>${esc(d.area)}</td><td>${esc(sev[d.severity] ?? d.severity)}</td><td>${esc(d.notes)}</td></tr>`).join('');
  const cond = [
    ['Кузов', insp?.exterior_condition], ['Царапины / сколы', insp?.scratches], ['ЛКП', insp?.paint_condition],
    ['Салон', insp?.interior_condition], ['Ранее имеющиеся повреждения', insp?.existing_damage], ['Пожелания клиента', insp?.customer_requests ?? insp?.customer_comments],
  ].filter(([, val]) => val).map(([k, val]) => `<div>${esc(k)}</div><div>${esc(val)}</div>`).join('');
  const { html } = linesTable(bookingLines(b));
  const body = `
    <h1>Приёмо-передаточный акт автомобиля</h1>
    <div class="muted">${longDate(b.scheduled_at)} · заказ #${esc(b.id.slice(0, 8))}</div>
    <h2>Клиент и автомобиль</h2>${customerBlock(b.customers, v)}
    <div class="kv" style="margin-top:6px">
      <div>Пробег, км</div><div>${v?.mileage != null ? esc(v.mileage.toLocaleString('ru-RU')) : '________'}</div>
      <div>Код краски</div><div>${esc(v?.paint_code ?? '—')}</div>
      <div>Вещи в автомобиле</div><div>${esc(b.items_left || '________________')}</div>
      <div>Уровень топлива</div><div class="checks"><span>☐ ¼</span><span>☐ ½</span><span>☐ ¾</span><span>☐ полный</span></div>
    </div>
    <h2>Состояние при приёмке</h2>
    ${cond ? `<div class="kv">${cond}</div>` : '<div class="small">Подробный осмотр не проводился — состояние фиксируется совместно и отмечается на схеме ниже.</div>'}
    ${damage ? `<table style="margin-top:8px"><thead><tr><th>Зона</th><th>Степень</th><th>Описание</th></tr></thead><tbody>${damage}</tbody></table>` : ''}
    <h2>Согласованные работы</h2>${html}
    <p class="small" style="margin-top:12px">Клиент подтверждает, что осмотр проведён в его присутствии, отмеченные повреждения существовали до передачи автомобиля в студию, с перечнем работ и стоимостью согласен.</p>
    ${signBlock(c, 'Принял (представитель студии)', 'Сдал (клиент)')}`;
  return shell('Акт приёма автомобиля', body, c);
}

/* ------------------------------------------------------------ public API */

export async function printBookingDocument(kind: BookingDocKind, bookingId: string): Promise<string | null> {
  const b = await loadBooking(bookingId);
  if (!b) return 'Заказ не найден';
  const c = getCompany();
  let html: string;
  if (kind === 'quote') html = quoteHtml(b, c);
  else if (kind === 'warranty') html = warrantyHtml(b, c);
  else if (kind === 'acceptance') html = acceptanceHtml(b, await loadInspection(b), c);
  else {
    const inv = await loadInvoiceFor(b);
    html = actHtml(inv?.invoice_number ?? b.id.slice(0, 8), b.completed_at ?? b.scheduled_at, b, inv, c);
  }
  printHtml(html);
  return null;
}

export async function printInvoiceDocument(kind: InvoiceDocKind, invoiceId: string): Promise<string | null> {
  const { data } = await db.from('invoices').select('*, customers(*)').eq('id', invoiceId).maybeSingle();
  const inv = data as Invoice | null;
  if (!inv) return 'Счёт не найден';
  const c = getCompany();
  const b = await bookingOfInvoice(inv);
  printHtml(kind === 'invoice' ? invoiceHtml(inv, b, c) : actHtml(inv.invoice_number, inv.paid_at ?? inv.created_at, b, inv, c));
  return null;
}

export { bookingTotal };
