import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EmailComposePanel } from '../EmailComposePanel';
import { MailIcon } from './MailIcons';
import type { Customer, EmailMessageType } from '../../types/database';

interface MailComposeProps {
  mode: 'new' | 'reply' | 'forward' | 'reminder';
  customers: Customer[];
  defaultCustomerId?: string;
  defaultSubject?: string;
  defaultBody?: string;
  defaultType?: EmailMessageType;
  draftId?: string;
  onSent: () => void;
  onCancel: () => void;
}

const MODE_LABELS = {
  new: 'Новое сообщение',
  reply: 'Ответ',
  forward: 'Пересылка',
  reminder: 'Напоминание',
};

export function MailCompose({
  mode,
  customers,
  defaultCustomerId = '',
  defaultSubject = '',
  defaultBody = '',
  defaultType = 'manual',
  draftId,
  onSent,
  onCancel,
}: MailComposeProps) {
  useEffect(() => {
    document.body.classList.add('compose-open');
    return () => document.body.classList.remove('compose-open');
  }, []);

  return createPortal(
    <div className="outlook-premium-compose-overlay" role="dialog" aria-modal="true" aria-label={MODE_LABELS[mode]}>
      <div className="outlook-premium-compose-panel">
        <div className="outlook-premium-compose-header">
          <div className="outlook-premium-compose-title">
            <MailIcon name="compose" size={20} />
            <span>{MODE_LABELS[mode]}</span>
          </div>
          <button type="button" className="outlook-premium-compose-close" onClick={onCancel} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="outlook-premium-compose-scroll">
          <EmailComposePanel
            customers={customers}
            defaultCustomerId={defaultCustomerId}
            defaultSubject={defaultSubject}
            defaultBody={defaultBody}
            defaultType={defaultType}
            draftId={draftId}
            premium
            onSent={onSent}
            onCancel={onCancel}
          />

          <div className="outlook-premium-compose-dropzone">
            <MailIcon name="attach" size={20} />
            <span>Перетащите файлы или прикрепите из R2 после отправки клиенту</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
