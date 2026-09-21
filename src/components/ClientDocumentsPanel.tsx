import { useEffect, useState } from 'react';
import { db } from '../lib/localdb';
import { useToast } from '../contexts/ToastContext';
import { listAssets, openR2File, type AssetRecord } from '../lib/r2Storage';
import { LIBRARY_ENTITY_ID } from './AssetManager';
import { sendCustomerNotification } from '../lib/notifications';
import { NavIconSend } from './NavIcons';
import type { Customer } from '../types/database';

interface ClientDocumentsPanelProps {
  customer: Customer;
  onSent?: () => void;
}

export function ClientDocumentsPanel({ customer, onSent }: ClientDocumentsPanelProps) {
  const { toast } = useToast();
  const [library, setLibrary] = useState<AssetRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    listAssets('customer', LIBRARY_ENTITY_ID).then(setLibrary).catch(() => setLibrary([]));
  }, []);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const sendToClient = async () => {
    if (!selected.size) { toast('Выберите документы'); return; }
    if (!customer.email) { toast('У клиента нет email'); return; }
    setSending(true);
    const docs = library.filter((d) => selected.has(d.id));
    const body = `Здравствуйте, ${customer.full_name}!\n\nНаправляем материалы Unique Detailing:\n${docs.map((d) => `• ${d.file_name}`).join('\n')}\n\nС уважением,\nUnique Detailing`;

    const subject = 'Unique Detailing — материалы';
    const result = await sendCustomerNotification({
      customer_id: customer.id,
      type: 'document',
      subject,
      body,
      channel: 'email',
      openMailClient: true,
    });

    for (const doc of docs) {
      await db.from('files').update({
        sent_at: new Date().toISOString(),
        sent_to_email: customer.email,
      }).eq('id', doc.id);
    }

    setSending(false);

    if (result.ok) {
      toast(result.message || 'Документы отправлены');
      setSelected(new Set());
      onSent?.();
      return;
    }

    if (result.fallback) {
      const mailto = `mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailto, '_blank');
      toast('Email-провайдер не настроен — открыт почтовый клиент');
      setSelected(new Set());
      onSent?.();
      return;
    }

    toast('Ошибка: ' + (result.error || 'Не удалось отправить'));
  };

  if (!library.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="side-field-label">Библиотека · отправка клиенту</div>
      {library.slice(0, 8).map((doc) => (
        <label key={doc.id} className="doc-send-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggle(doc.id)} />
          <span style={{ flex: 1 }} onClick={(e) => { e.preventDefault(); openR2File(doc.r2_key || doc.bucket_path, doc.is_sensitive); }}>{doc.file_name}</span>
        </label>
      ))}
      {selected.size > 0 && customer.email && (
        <div className="tag add tag-with-icon" style={{ cursor: sending ? 'wait' : 'pointer', marginTop: 8 }} onClick={sendToClient}>
          {sending ? 'Отправка…' : <><NavIconSend size={16} /> Отправить ({selected.size}) на {customer.email}</>}
        </div>
      )}
      {!customer.email && selected.size > 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Добавьте email клиента для отправки</div>
      )}
    </div>
  );
}
