import { MailIcon } from './MailIcons';
import {
  EMAIL_TYPE_LABELS,
  folderLabelRu,
  fmtListDate,
  getInitials,
  groupMessagesByDate,
  messagePreview,
  messageSubject,
  partyLabel,
  vehicleLabel,
  type MailFolder,
  type MailboxMessage,
} from '../../lib/mailbox';

interface MailListProps {
  folder: MailFolder;
  messages: MailboxMessage[];
  selectedId: string | null;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (msg: MailboxMessage) => void;
  onStar: (msg: MailboxMessage) => void;
  onArchive: (msg: MailboxMessage) => void;
  onDelete: (msg: MailboxMessage) => void;
}

function SkeletonList({ count = 8 }: { count?: number }) {
  return (
    <div className="outlook-premium-skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="outlook-premium-skeleton-row">
          <div className="outlook-premium-skeleton-avatar" />
          <div className="outlook-premium-skeleton-lines">
            <div className="outlook-premium-skeleton-line outlook-premium-skeleton-line--wide" />
            <div className="outlook-premium-skeleton-line" />
            <div className="outlook-premium-skeleton-line outlook-premium-skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListRow({
  msg,
  folder,
  active,
  onSelect,
  onStar,
  onArchive,
  onDelete,
}: {
  msg: MailboxMessage;
  folder: MailFolder;
  active: boolean;
  onSelect: (msg: MailboxMessage) => void;
  onStar: (msg: MailboxMessage) => void;
  onArchive: (msg: MailboxMessage) => void;
  onDelete: (msg: MailboxMessage) => void;
}) {
  const unread = !msg.read_at && msg.direction === 'inbound' && !msg.is_draft;
  const party = partyLabel(msg, folder);
  const email = msg.customers?.email || msg.sender_email || msg.recipient_email || '';
  const vehicle = vehicleLabel(msg.vehicle);
  const hasAttach = (msg.attachment_keys?.length ?? 0) > 0 || msg.message_type === 'invoice' || msg.message_type === 'document';

  return (
    <div
      className={`outlook-premium-list-row${active ? ' active' : ''}${unread ? ' unread' : ''}${msg.is_important ? ' starred' : ''}`}
    >
      <button type="button" className="outlook-premium-list-main" onClick={() => onSelect(msg)}>
        <div className="outlook-premium-list-avatar" aria-hidden>
          {getInitials(party)}
        </div>
        <div className="outlook-premium-list-content">
          <div className="outlook-premium-list-top">
            <span className="outlook-premium-list-party">{party}</span>
            <span className="outlook-premium-list-date">{fmtListDate(msg.sent_at)}</span>
          </div>
          {email && <div className="outlook-premium-list-email">{email}</div>}
          <div className="outlook-premium-list-subject">{messageSubject(msg)}</div>
          <div className="outlook-premium-list-preview">{messagePreview(msg)}</div>
          <div className="outlook-premium-list-meta">
            {vehicle && (
              <span className="outlook-premium-list-vehicle">
                <MailIcon name="car" size={12} />
                {vehicle}
              </span>
            )}
            {msg.message_type && (
              <span className="outlook-premium-list-badge">{EMAIL_TYPE_LABELS[msg.message_type]}</span>
            )}
          </div>
        </div>
        <div className="outlook-premium-list-indicators">
          {unread && <span className="outlook-premium-unread-dot" aria-label="Непрочитано" />}
          {msg.is_important && <span className="outlook-premium-priority-dot" aria-label="Важное" />}
          {hasAttach && <MailIcon name="attach" size={14} className="outlook-premium-attach-icon" />}
        </div>
      </button>
      <div className="outlook-premium-list-actions">
        <button type="button" className="outlook-premium-icon-btn" title="Важное" onClick={() => onStar(msg)}>
          <MailIcon name={msg.is_important ? 'starFilled' : 'star'} size={16} />
        </button>
        <button type="button" className="outlook-premium-icon-btn" title="В архив" onClick={() => onArchive(msg)}>
          <MailIcon name="archive" size={16} />
        </button>
        <button type="button" className="outlook-premium-icon-btn danger" title="Удалить" onClick={() => onDelete(msg)}>
          <MailIcon name="delete" size={16} />
        </button>
      </div>
    </div>
  );
}

export function MailList({
  folder,
  messages,
  selectedId,
  loading,
  search,
  onSearchChange,
  onSelect,
  onStar,
  onArchive,
  onDelete,
}: MailListProps) {
  const grouped = groupMessagesByDate(messages);
  const folderLabel = folderLabelRu(folder);

  return (
    <div className="outlook-premium-list-pane">
      <div className="outlook-premium-list-search">
        <MailIcon name="search" size={16} className="outlook-premium-search-icon" />
        <input
          className="outlook-premium-search-input"
          placeholder="Поиск по теме, клиенту, email…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Поиск писем"
        />
      </div>

      <div className="outlook-premium-list-scroll">
        {loading ? (
          <SkeletonList />
        ) : !messages.length ? (
          <div className="outlook-premium-empty">
            <MailIcon name="envelope" size={40} className="outlook-premium-empty-icon" />
            <div className="outlook-premium-empty-title">Писем нет</div>
            <div className="outlook-premium-empty-sub">{folderLabel} — пусто</div>
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.group} className="outlook-premium-date-group">
              <div className="outlook-premium-date-label">{g.label}</div>
              {g.messages.map((msg) => (
                <ListRow
                  key={msg.id}
                  msg={msg}
                  folder={folder}
                  active={selectedId === msg.id}
                  onSelect={onSelect}
                  onStar={onStar}
                  onArchive={onArchive}
                  onDelete={onDelete}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
