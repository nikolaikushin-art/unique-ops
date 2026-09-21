import { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/localdb';
import { useDataRefresh } from '../../contexts/DataRefreshContext';
import { AFTERCARE_LABELS, buildAftercare } from '../../lib/aftercare';
import { ClientMessageModal, type MessageTarget } from '../ClientMessageModal';
import type { Booking, Customer, Invoice } from '../../types/database';

/** «Сегодня связаться» — a working list (not analytics): every row has a one-tap «Написать». */
export function AftercareCard({ onlyInvoices = false }: { onlyInvoices?: boolean }) {
  const { version } = useDataRefresh();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [target, setTarget] = useState<MessageTarget | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, b, i] = await Promise.all([
        db.from('customers').select('*'),
        db.from('bookings').select('*, vehicles(*), services(*)'),
        db.from('invoices').select('*, customers(*)'),
      ]);
      if (!alive) return;
      setCustomers((c.data as Customer[]) ?? []);
      setBookings((b.data as Booking[]) ?? []);
      setInvoices((i.data as Invoice[]) ?? []);
    })();
    return () => { alive = false; };
  }, [version]);

  const items = useMemo(() => {
    const all = buildAftercare(customers, bookings, invoices);
    return onlyInvoices ? all.filter((x) => x.kind === 'invoice') : all;
  }, [customers, bookings, invoices, onlyInvoices]);
  const shown = showAll ? items : items.slice(0, 6);

  return (
    <div className="section-block">
      <div className="section-head">
        <div><div className="section-eyebrow">Клиенты</div><div className="section-title">Сегодня связаться</div></div>
        {items.length > 0 && <span className="ch-badge is-gray">{items.length}</span>}
      </div>
      {shown.length === 0 && <div className="empty-state" style={{ padding: '12px 0' }}>Сегодня связываться ни с кем не нужно.</div>}
      {shown.map((it) => (
        <div className="uo-row" key={it.id}>
          <div className="uo-row-main">
            <div className="uo-row-title">{it.title}</div>
            <div className="uo-row-sub">{AFTERCARE_LABELS[it.kind]} · {it.sub}</div>
          </div>
          <div className="uo-row-trail">
            <button type="button" className="uo-pill uo-pill--info" onClick={() => setTarget({ customerId: it.customerId, bookingId: it.bookingId, invoiceId: it.invoiceId, template: it.template, dueDate: it.due })}>
              Написать
            </button>
          </div>
        </div>
      ))}
      {items.length > 6 && (
        <div className="link-btn" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Свернуть' : `Показать все (${items.length})`}</div>
      )}
      <ClientMessageModal target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
