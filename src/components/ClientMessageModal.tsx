import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { db } from '../lib/localdb';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { getCompany } from '../lib/company';
import {
  CHANNEL_LABELS, TEMPLATES, channelLink, logCommunication, renderTemplate,
  type Channel, type TemplateId,
} from '../lib/messaging';
import { linkInvoicesToBookings, type MetricBooking, type MetricInvoice } from '../lib/metrics';
import type { Booking, Communication, Customer, Invoice } from '../types/database';

export interface MessageTarget {
  customerId: string;
  bookingId?: string | null;
  invoiceId?: string | null;
  template?: TemplateId;
  dueDate?: string | null;
}

/** Pick a template, edit the text, send through WhatsApp / Telegram / e-mail — the message is logged in the client's history. */
export function ClientMessageModal({ target, onClose }: { target: MessageTarget | null; onClose: () => void }) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { refresh } = useDataRefresh();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [history, setHistory] = useState<Communication[]>([]);
  const [tpl, setTpl] = useState<TemplateId>('free');
  const [text, setText] = useState('');
  const company = useMemo(() => getCompany(), []);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    (async () => {
      const { data: c } = await db.from('customers').select('*').eq('id', target.customerId).maybeSingle();
      const { data: b } = target.bookingId ? await db.from('bookings').select('*, customers(*), vehicles(*), services(*)').eq('id', target.bookingId).maybeSingle() : { data: null };
      let { data: i } = target.invoiceId ? await db.from('invoices').select('*').eq('id', target.invoiceId).maybeSingle() : { data: null };
      if (!i && b) {
        // the order's invoice: hard link first, then the legacy matching
        const { data: invs } = await db.from('invoices').select('*').eq('customer_id', (b as Booking).customer_id);
        const list = (invs ?? []) as Invoice[];
        const links = linkInvoicesToBookings(list as unknown as MetricInvoice[], [b as unknown as MetricBooking]);
        const invId = links.get((b as Booking).id);
        i = invId ? list.find((x) => x.id === invId) ?? null : null;
      }
      const { data: h } = await db.from('communications').select('*').eq('customer_id', target.customerId).order('sent_at', { ascending: false }).limit(3);
      if (!alive) return;
      setCustomer(c as Customer | null);
      setBooking(b as Booking | null);
      setInvoice(i as Invoice | null);
      setHistory((h as Communication[]) ?? []);
      const first = target.template ?? (i ? 'invoice' : b ? 'status' : 'free');
      setTpl(first);
      if (c) setText(renderTemplate(first, { customer: c as Customer, booking: b as Booking | null, invoice: i as Invoice | null, company, dueDate: target.dueDate }));
    })();
    return () => { alive = false; };
  }, [target, company]);

  if (!target) return null;

  const pick = (id: TemplateId) => {
    setTpl(id);
    if (customer) setText(renderTemplate(id, { customer, booking, invoice, company, dueDate: target.dueDate }));
  };

  const send = async (channel: Channel) => {
    if (!customer) return;
    const link = channelLink(channel, customer, text);
    if (!link) { toast(channel === 'email' ? 'У клиента не указан email' : 'У клиента не указан телефон'); return; }
    if (channel === 'telegram') {
      try { await navigator.clipboard.writeText(text); toast('Текст скопирован — вставьте его в чат Telegram'); } catch { toast('Откройте чат в Telegram и вставьте текст'); }
    }
    window.open(link, '_blank', 'noopener');
    if (channel !== 'phone') {
      const meta = TEMPLATES.find((x) => x.id === tpl) ?? TEMPLATES[TEMPLATES.length - 1];
      await logCommunication({ customer, channel, content: text, template: meta, entityId: target.invoiceId ?? target.bookingId ?? null, createdBy: profile?.id ?? null });
      refresh();
    }
    onClose();
  };

  const preferred = customer?.preferred_channel;

  return createPortal(
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-label="Сообщение клиенту">
        <div className="modal-header">
          <div className="modal-title">Написать клиенту{customer ? ` · ${customer.full_name}` : ''}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть"><X size={16} strokeWidth={1.75} /></button>
        </div>
        <div className="modal-body">
          <label className="field-label" htmlFor="msg-tpl">Шаблон</label>
          <select id="msg-tpl" className="field-select" value={tpl} onChange={(e) => pick(e.target.value as TemplateId)}>
            {TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <label className="field-label" htmlFor="msg-text" style={{ marginTop: 12 }}>Текст (можно править)</label>
          <textarea id="msg-text" className="field-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} style={{ resize: 'vertical' }} />
          {customer && (
            <div className="cell-sub" style={{ marginTop: 8 }}>
              {customer.phone || 'телефон не указан'}{customer.email ? ` · ${customer.email}` : ''}
              {preferred ? ` · предпочитает: ${CHANNEL_LABELS[preferred]}` : ''}
            </div>
          )}
          {history.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="side-field-label">Последние сообщения</div>
              {history.map((h) => (
                <div key={h.id} className="cell-sub" style={{ padding: '3px 0' }}>
                  {new Date(h.sent_at).toLocaleDateString('ru-RU')} · {h.channel} · {(h.body_text || h.content).slice(0, 70)}…
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
          {(['telegram', 'email', 'whatsapp'] as Channel[]).map((ch) => (
            <button key={ch} type="button" className={ch === (preferred ?? 'whatsapp') ? 'btn-primary' : 'btn-secondary'} disabled={!customer || !text.trim()} onClick={() => send(ch)}>
              {CHANNEL_LABELS[ch]}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
