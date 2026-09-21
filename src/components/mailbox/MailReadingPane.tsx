import { useEffect, useState } from 'react';
import { MailIcon } from './MailIcons';
import {
  EMAIL_TYPE_LABELS,
  fmtMsgDate,
  messageSubject,
  recipientLabel,
  senderLabel,
  type MailboxMessage,
} from '../../lib/mailbox';
import { listAssets, openR2File, type AssetRecord } from '../../lib/r2Storage';

interface MailReadingPaneProps {
  message: MailboxMessage | null;
  canCompose: boolean;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleRead: () => void;
  onToggleStar: () => void;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: Parameters<typeof MailIcon>[0]['name'];
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="outlook-premium-toolbar-btn" onClick={onClick} disabled={disabled} title={label}>
      <MailIcon name={icon} size={16} />
      <span>{label}</span>
    </button>
  );
}

export function MailReadingPane({
  message,
  canCompose,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onDelete,
  onToggleRead,
  onToggleStar,
}: MailReadingPaneProps) {
  const [attachments, setAttachments] = useState<AssetRecord[]>([]);

  useEffect(() => {
    if (!message?.customer_id) {
      setAttachments([]);
      return;
    }

    const loads: Promise<AssetRecord[]>[] = [
      listAssets('customer', message.customer_id).catch(() => []),
    ];
    if (message.entity_id && message.message_type === 'invoice') {
      loads.push(listAssets('invoice', message.entity_id).catch(() => []));
    }
    Promise.all(loads).then((groups) => setAttachments(groups.flat().slice(0, 12)));
  }, [message?.id, message?.customer_id, message?.entity_id, message?.message_type]);

  if (!message) {
    return (
      <div className="outlook-premium-reading outlook-premium-reading--empty">
        <MailIcon name="envelope" size={48} className="outlook-premium-empty-icon" />
        <div className="outlook-premium-empty-title">Выберите переписку</div>
        <div className="outlook-premium-empty-sub">Select a conversation</div>
      </div>
    );
  }

  const fromTo = message.direction === 'inbound'
    ? { label: 'От', value: senderLabel(message) }
    : { label: 'Кому', value: recipientLabel(message) };

  const fullBody = message.body_text || message.content;
  const logoUrl = import.meta.env.VITE_LOGO_URL ||
    '/assets/unique-detailing-logo.png';
  const displayHtml = message.body_html
    ? message.body_html.replace(/cid:unique-logo/gi, logoUrl)
    : null;

  return (
    <div className="outlook-premium-reading">
      <div className="outlook-premium-reading-toolbar">
        {canCompose && (
          <>
            <ToolbarButton icon="reply" label="Ответить" onClick={onReply} />
            <ToolbarButton icon="replyAll" label="Ответить всем" onClick={onReplyAll} />
            <ToolbarButton icon="forward" label="Переслать" onClick={onForward} />
          </>
        )}
        <ToolbarButton icon="archive" label="Архив" onClick={onArchive} />
        <ToolbarButton icon="delete" label="Удалить" onClick={onDelete} />
        <ToolbarButton icon="markRead" label={message.read_at ? 'Непрочитанное' : 'Прочитано'} onClick={onToggleRead} />
        <ToolbarButton icon="print" label="Печать" onClick={() => window.print()} />
        <button type="button" className="outlook-premium-toolbar-btn outlook-premium-star-btn" onClick={onToggleStar} title="Важное">
          <MailIcon name={message.is_important ? 'starFilled' : 'star'} size={16} />
        </button>
      </div>

      <div className="outlook-premium-reading-body">
        <div className="outlook-premium-reading-main">
          <header className="outlook-premium-reading-header">
            <h2 className="outlook-premium-reading-subject">{messageSubject(message)}</h2>
            <div className="outlook-premium-reading-meta">
              <span><strong>{fromTo.label}:</strong> {fromTo.value}</span>
              {message.direction === 'outbound' && (
                <span><strong>От:</strong> {senderLabel(message)}</span>
              )}
              <span><strong>Дата:</strong> {fmtMsgDate(message.sent_at)}</span>
              {message.message_type && (
                <span className="outlook-premium-reading-type">{EMAIL_TYPE_LABELS[message.message_type]}</span>
              )}
            </div>
          </header>

          <div className="outlook-premium-reading-content">
            {displayHtml ? (
              <div className="mailbox-body-html" dangerouslySetInnerHTML={{ __html: displayHtml }} />
            ) : (
              <pre className="mailbox-body-text">{fullBody}</pre>
            )}
            {message.error_message && <div className="mailbox-error">{message.error_message}</div>}
          </div>

          {attachments.length > 0 && (
            <div className="outlook-premium-attachments">
              <div className="outlook-premium-section-title">Вложения</div>
              <div className="outlook-premium-attachment-list">
                {attachments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="outlook-premium-attachment-item"
                    onClick={() => openR2File(a.r2_key || a.bucket_path, a.is_sensitive)}
                  >
                    <MailIcon name="attach" size={14} />
                    <span>{a.file_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
