import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { sendCustomerNotification, type NotificationType } from '../lib/notifications';
import { buildEmailTemplates, saveDraft } from '../lib/mailbox';
import { NavIconSend } from './NavIcons';
import type { Customer, EmailMessageType } from '../types/database';

interface EmailComposePanelProps {
  customers: Customer[];
  defaultCustomerId?: string;
  defaultSubject?: string;
  defaultBody?: string;
  defaultType?: EmailMessageType;
  compact?: boolean;
  premium?: boolean;
  draftId?: string;
  onSent?: () => void;
  onCancel?: () => void;
}

export function EmailComposePanel({
  customers,
  defaultCustomerId = '',
  defaultSubject = '',
  defaultBody = '',
  defaultType = 'manual',
  compact = false,
  premium = false,
  draftId,
  onSent,
  onCancel,
}: EmailComposePanelProps) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [messageType, setMessageType] = useState<EmailMessageType>(defaultType);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);

  useEffect(() => {
    setCustomerId(defaultCustomerId);
    setSubject(defaultSubject);
    setBody(defaultBody);
    setMessageType(defaultType);
  }, [defaultCustomerId, defaultSubject, defaultBody, defaultType, draftId]);

  const selected = customers.find((c) => c.id === customerId);
  const templates = buildEmailTemplates(selected?.full_name);

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
    setMessageType(tpl.type);
  };

  const send = async () => {
    if (!customerId) {
      toast('Выберите клиента');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast('Укажите тему и текст письма');
      return;
    }
    if (!selected?.email?.trim()) {
      toast('У клиента не указан email');
      return;
    }

    setSending(true);
    const notifyType: NotificationType =
      messageType === 'document' ? 'document'
        : messageType === 'reminder_payment' ? 'reminder_payment'
          : messageType === 'reminder_visit' ? 'reminder_visit'
            : messageType === 'thanks' ? 'thanks'
              : 'manual';
    const result = await sendCustomerNotification({
      customer_id: customerId,
      type: notifyType,
      subject: subject.trim(),
      body: body.trim(),
      channel: 'email',
      message_type: messageType,
      openMailClient: true,
    });
    setSending(false);

    if (!result.ok) {
      if (result.fallback) toast(result.message || 'Email-провайдер не настроен');
      else toast('Ошибка: ' + (result.error || 'Не удалось отправить'));
      return;
    }

    toast(result.message || 'Письмо отправлено');
    setSubject('');
    setBody('');
    setMessageType('manual');
    onSent?.();
  };

  const saveAsDraft = async () => {
    if (!customerId) {
      toast('Выберите клиента');
      return;
    }
    if (!subject.trim() && !body.trim()) {
      toast('Укажите тему или текст');
      return;
    }
    setSavingDraft(true);
    try {
      await saveDraft({
        customerId,
        subject: subject.trim() || 'Без темы',
        body: body.trim(),
        messageType,
        draftId,
      });
      toast('Черновик сохранён');
      onSent?.();
    } catch (e) {
      toast('Ошибка: ' + (e as Error).message);
    } finally {
      setSavingDraft(false);
    }
  };

  const customerSelect = (
    <select
      className={premium ? 'outlook-premium-compose-input outlook-premium-compose-select' : 'field-select'}
      value={customerId}
      onChange={(e) => setCustomerId(e.target.value)}
      aria-label="Клиент"
    >
      <option value="">Выберите клиента</option>
      {customers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.full_name}{c.email ? ` · ${c.email}` : ' · нет email'}
        </option>
      ))}
    </select>
  );

  return (
    <div className={`email-compose outlook-mail-compose${compact ? ' email-compose--compact' : ''}${premium ? ' email-compose--premium' : ''}`}>
      {!compact && !premium && <div className="side-field-label">Новое письмо</div>}

      {premium ? (
        <div className="outlook-premium-compose-fields">
          <div className="outlook-premium-compose-row">
            <label htmlFor="compose-to">Кому</label>
            <div className="outlook-premium-compose-field">
              <select
                id="compose-to"
                className="outlook-premium-compose-input outlook-premium-compose-select"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                aria-label="Клиент"
              >
                <option value="">Выберите клиента</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}{c.email ? ` · ${c.email}` : ' · нет email'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!showCcBcc ? (
            <button
              type="button"
              className="outlook-premium-compose-cc-toggle"
              onClick={() => setShowCcBcc(true)}
            >
              + Копия / Скрытая
            </button>
          ) : (
            <>
              <div className="outlook-premium-compose-row">
                <label htmlFor="compose-cc">Копия</label>
                <input
                  id="compose-cc"
                  className="outlook-premium-compose-input"
                  placeholder="CC (опционально)"
                  disabled
                  title="Скоро"
                />
              </div>
              <div className="outlook-premium-compose-row">
                <label htmlFor="compose-bcc">Скрытая</label>
                <input
                  id="compose-bcc"
                  className="outlook-premium-compose-input"
                  placeholder="BCC (опционально)"
                  disabled
                  title="Скоро"
                />
              </div>
            </>
          )}
        </div>
      ) : (
        customerSelect
      )}

      <select
        className={premium ? 'outlook-premium-compose-input outlook-premium-compose-select' : 'field-select'}
        value=""
        onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); e.target.value = ''; }}
        aria-label="Шаблон"
      >
        <option value="">Шаблон письма…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
      <input
        id="compose-subject"
        className={premium ? 'outlook-premium-compose-input' : 'field-input'}
        placeholder="Тема письма"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        aria-label="Тема письма"
      />
      <textarea
        id="compose-body"
        className={premium ? 'outlook-premium-compose-input outlook-premium-compose-textarea' : 'field-input'}
        rows={compact ? 4 : premium ? 6 : 8}
        placeholder="Текст письма…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Текст письма"
      />
      <div className="outlook-mail-compose-actions">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Отмена
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={savingDraft || !customerId}
          onClick={saveAsDraft}
        >
          {savingDraft ? 'Сохранение…' : 'В черновик'}
        </button>
        <button
          type="button"
          className="btn-secondary email-compose-send tag-with-icon"
          disabled={sending || !customerId}
          onClick={send}
        >
          {sending ? 'Отправка…' : <><NavIconSend size={16} /> Отправить</>}
        </button>
      </div>
    </div>
  );
}
