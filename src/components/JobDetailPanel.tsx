import { SideDrawer } from './SideDrawer';
import { useEffect, useState } from 'react';
import { db } from '../lib/localdb';
import { useToast } from '../contexts/ToastContext';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { useAuth } from '../contexts/AuthContext';
import { canManageBookings } from '../lib/permissions';
import { JOB_STATUS_LABELS, fmtDate, fmtTime, vehicleDisplayName, PAYMENT_STATUS_LABELS } from '../lib/constants';
import { nextJobStatus, STATUS_TO_KANBAN } from '../lib/workflow';
import { AssetManager } from './AssetManager';
import { FILE_CATEGORIES } from '../lib/r2Storage';
import { bookingLines, bookingTotal, createOrderAndInvoice } from '../lib/orderFlow';
import { BOOKING_DOC_LABELS, printBookingDocument, type BookingDocKind } from '../lib/documents';
import { ClientMessageModal, type MessageTarget } from './ClientMessageModal';
import { fmt } from '../lib/constants';
import type { Booking, JobChecklist } from '../types/database';

interface JobDetailPanelProps {
  job: Booking;
  onClose: () => void;
  onEdit: (b: Booking) => void;
}

export function JobDetailPanel({ job, onClose, onEdit }: JobDetailPanelProps) {
  const { toast } = useToast();
  const { refresh } = useDataRefresh();
  const { profile } = useAuth();
  const canAdvance = canManageBookings(profile?.role);
  const [checklist, setChecklist] = useState<JobChecklist[]>([]);
  const [notes, setNotes] = useState(job.notes ?? '');
  const [myStaffId, setMyStaffId] = useState<string | null>(null);
  const [msgTarget, setMsgTarget] = useState<MessageTarget | null>(null);
  const [busyDoc, setBusyDoc] = useState(false);

  useEffect(() => {
    db.from('job_checklists').select('*').eq('booking_id', job.id).order('sort_order')
      .then(({ data }) => setChecklist((data as JobChecklist[]) ?? []));
    setNotes(job.notes ?? '');
    if (profile?.id) {
      db.from('staff').select('id').eq('profile_id', profile.id).maybeSingle()
        .then(({ data }) => setMyStaffId(data?.id ?? null));
    }
  }, [job.id, job.notes, profile?.id]);

  const toggleCheck = async (item: JobChecklist) => {
    await db.from('job_checklists').update({
      is_completed: !item.is_completed,
      completed_at: !item.is_completed ? new Date().toISOString() : null,
      completed_by: !item.is_completed ? myStaffId : null,
    }).eq('id', item.id);
    const { data } = await db.from('job_checklists').select('*').eq('booking_id', job.id).order('sort_order');
    setChecklist((data as JobChecklist[]) ?? []);
  };

  const saveNotes = async () => {
    await db.from('bookings').update({ notes }).eq('id', job.id);
    toast('Заметки сохранены');
    refresh();
  };

  const advanceStatus = async () => {
    const next = nextJobStatus(job.status);
    const updates: Record<string, unknown> = { status: next };
    if (['completed', 'delivered'].includes(next)) updates.completed_at = new Date().toISOString();
    await db.from('bookings').update(updates).eq('id', job.id);
    if (job.vehicle_id && STATUS_TO_KANBAN[next]) {
      await db.from('vehicles').update({ pipeline_stage: STATUS_TO_KANBAN[next] }).eq('id', job.vehicle_id);
    }
    toast(`Статус: ${JOB_STATUS_LABELS[next]}`);
    refresh();
  };

  const printDoc = async (kind: BookingDocKind) => {
    if (busyDoc) return;
    setBusyDoc(true);
    const err = await printBookingDocument(kind, job.id);
    if (err) toast(err);
    setBusyDoc(false);
  };

  const makeInvoice = async () => {
    const r = await createOrderAndInvoice(job.id);
    if (r.error) { toast('Ошибка: ' + r.error); return; }
    toast(r.created.invoice ? 'Заказ и счёт созданы — оплата принимается в разделе «Финансы»' : 'Счёт уже создан');
    refresh();
  };

  const eta = job.eta_at || job.vehicles?.eta_at;
  const lines = bookingLines(job);
  const total = bookingTotal(job);
  const checklistDone = checklist.filter((c) => c.is_completed).length;
  const checklistPct = checklist.length ? Math.round((checklistDone / checklist.length) * 100) : 0;

  return (
    <SideDrawer className="job-detail-panel" onClose={onClose}>
      <div className="side-eyebrow">Заказ · #{job.id.slice(0, 8)}</div>
      <div className="side-title">{job.vehicles ? vehicleDisplayName(job.vehicles) : '—'}</div>
      <div className="side-grid">
        <div><div className="side-field-label">Клиент</div><div className="side-field-value">{job.customers?.full_name}</div></div>
        <div><div className="side-field-label">Техник</div><div className="side-field-value">{job.staff?.full_name || '—'}</div></div>
        <div><div className="side-field-label">Начало</div><div className="side-field-value">{fmtTime(job.scheduled_at)} · {fmtDate(job.scheduled_at)}</div></div>
        <div><div className="side-field-label">ETA</div><div className="side-field-value">{fmtDate(eta)}</div></div>
      </div>
      <div style={{ margin: '12px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canAdvance ? (
        <span className={`status-badge progress`} onClick={advanceStatus} style={{ cursor: 'pointer' }}>
          {JOB_STATUS_LABELS[job.status]} →
        </span>
        ) : (
        <span className="status-badge progress">{JOB_STATUS_LABELS[job.status]}</span>
        )}
        <span className="status-badge planned">{PAYMENT_STATUS_LABELS[job.payment_status] ?? job.payment_status}</span>
      </div>

      <div className="side-field-label" style={{ marginTop: 8 }}>Состав заказа</div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, padding: '3px 0' }}>
          <span>{l.name}{l.qty > 1 ? ` × ${l.qty}` : ''}</span><span>{fmt(l.price * l.qty)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6 }}>
        <span>Итого</span><span>{fmt(total)}</span>
      </div>
      {Number(job.deposit ?? 0) > 0 && <div className="cell-sub">Предоплата получена: {fmt(Number(job.deposit))}</div>}
      {job.items_left && <div className="cell-sub">Вещи / ключи: {job.items_left}</div>}

      <div className="side-field-label" style={{ marginTop: 16 }}>Документы и связь</div>
      <div className="tag-row" style={{ marginTop: 6 }}>
        {(Object.keys(BOOKING_DOC_LABELS) as BookingDocKind[]).map((k) => (
          <div key={k} className="tag add" style={{ cursor: 'pointer', opacity: busyDoc ? 0.5 : 1 }} onClick={() => printDoc(k)}>{BOOKING_DOC_LABELS[k]}</div>
        ))}
        <div className="tag add" style={{ cursor: 'pointer' }} onClick={() => setMsgTarget({ customerId: job.customer_id, bookingId: job.id, template: ['completed', 'delivered'].includes(job.status) ? 'ready' : 'status' })}>Написать клиенту</div>
        {canAdvance && ['completed', 'delivered'].includes(job.status) && !job.invoice_id && (
          <div className="tag add tag--emphasis" style={{ cursor: 'pointer' }} onClick={makeInvoice}>Создать заказ и счёт</div>
        )}
      </div>
      {job.materials_written_off && <div className="cell-sub" style={{ marginTop: 6 }}>Материалы списаны со склада · себестоимость {fmt(Number(job.materials_cost ?? 0))}</div>}

      <div className="side-field-label" style={{ marginTop: 16 }}>Чек-лист · {checklistPct}%</div>
      <div className="bar-track" style={{ marginBottom: 12 }}><div className="bar-fill" style={{ width: `${checklistPct}%` }} /></div>
      {checklist.map((c) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 12.5, cursor: 'pointer' }} onClick={() => toggleCheck(c)}>
          <span style={{ color: c.is_completed ? 'var(--green)' : 'var(--muted-2)' }}>{c.is_completed ? '✓' : '○'}</span>
          <span style={{ textDecoration: c.is_completed ? 'line-through' : 'none', color: c.is_completed ? 'var(--muted)' : 'var(--text)' }}>{c.item}</span>
        </div>
      ))}

      <div className="side-field-label" style={{ marginTop: 16 }}>Фото до / после (R2)</div>
      <AssetManager
        entityType="booking"
        entityId={job.id}
        bookingId={job.id}
        categories={FILE_CATEGORIES.booking.map((c) => ({ ...c }))}
        compact
      />

      <div className="side-field-label" style={{ marginTop: 16 }}>Заметки</div>
      <textarea className="field-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
      <div className="side-actions mobile-detail-actions" style={{ marginTop: 12 }}>
        <span className="side-action edit" onClick={saveNotes}>Сохранить</span>
        <span className="side-action edit" onClick={() => onEdit(job)}>Редактировать</span>
        <span className="side-action del" onClick={onClose}>Закрыть</span>
      </div>
      <ClientMessageModal target={msgTarget} onClose={() => setMsgTarget(null)} />
    </SideDrawer>
  );
}
