import { useEffect, useState } from 'react';
import { db } from '../lib/localdb';
import { useToast } from '../contexts/ToastContext';

interface NotificationPrefs {
  email_invoices: boolean;
  email_documents: boolean;
  low_stock_alerts: boolean;
  booking_reminders: boolean;
  lead_notifications: boolean;
}

const DEFAULTS: NotificationPrefs = {
  email_invoices: true,
  email_documents: true,
  low_stock_alerts: true,
  booking_reminders: true,
  lead_notifications: true,
};

export function NotificationsPanel() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.from('studio_settings').select('value').eq('key', 'notification_prefs').single()
      .then(({ data }) => {
        if (data?.value) setPrefs({ ...DEFAULTS, ...(data.value as NotificationPrefs) });
      });
  }, []);

  const toggle = (key: keyof NotificationPrefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const save = async () => {
    setSaving(true);
    const { error } = await db.from('studio_settings').upsert({
      key: 'notification_prefs',
      value: prefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    setSaving(false);
    if (error) toast('Ошибка: ' + error.message);
    else toast('Настройки уведомлений сохранены');
  };

  const items: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
    { key: 'email_invoices', label: 'Email-счета', desc: 'Отправка счетов клиентам по email' },
    { key: 'email_documents', label: 'Email-документы', desc: 'Отправка брошюр и каталогов клиентам' },
    { key: 'low_stock_alerts', label: 'Низкий остаток', desc: 'Оповещения при достижении минимального остатка' },
    { key: 'booking_reminders', label: 'Напоминания о заказах', desc: 'Уведомления о предстоящих бронированиях' },
    { key: 'lead_notifications', label: 'Новые лиды', desc: 'Оповещение при поступлении нового лида' },
  ];

  return (
    <div className="section-block">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Коммуникации</div>
          <div className="section-title">Настройки уведомлений</div>
        </div>
        <div className="tag add" style={{ cursor: saving ? 'wait' : 'pointer' }} onClick={save}>{saving ? 'Сохранение…' : 'Сохранить'}</div>
      </div>
      {items.map((item) => (
        <div className="integration-card" key={item.key} onClick={() => toggle(item.key)} style={{ cursor: 'pointer' }}>
          <div>
            <div className="integration-name">{item.label}</div>
            <div className="integration-desc">{item.desc}</div>
          </div>
          <div className={`tag ${prefs[item.key] ? 'green' : ''}`}>
            <span className="dot" style={!prefs[item.key] ? { background: 'var(--muted-2)' } : undefined}></span>
            {prefs[item.key] ? 'Вкл' : 'Выкл'}
          </div>
        </div>
      ))}
    </div>
  );
}
