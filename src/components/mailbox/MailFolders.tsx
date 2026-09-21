import { MailIcon } from './MailIcons';
import { MAIL_FOLDERS, type MailFolder } from '../../lib/mailbox';

interface MailFoldersProps {
  folder: MailFolder;
  counts: Partial<Record<MailFolder, number>>;
  unreadInbox: number;
  canCompose: boolean;
  onFolderChange: (folder: MailFolder) => void;
  onCompose: () => void;
}

export function MailFolders({
  folder,
  counts,
  unreadInbox,
  canCompose,
  onFolderChange,
  onCompose,
}: MailFoldersProps) {
  const inbox = MAIL_FOLDERS.find((f) => f.id === 'inbox')!;
  const primaryGrouped = MAIL_FOLDERS.filter((f) => f.section === 'primary' && f.group);
  const system = MAIL_FOLDERS.filter((f) => f.section === 'system');

  const groupOrder: string[] = [];
  for (const f of primaryGrouped) {
    if (f.group && !groupOrder.includes(f.group)) groupOrder.push(f.group);
  }

  const renderFolder = (f: (typeof MAIL_FOLDERS)[number]) => {
    const count = counts[f.id] ?? 0;
    const badge = f.id === 'inbox' ? (unreadInbox || count) : count;

    return (
      <button
        key={f.id}
        type="button"
        className={`outlook-premium-folder${folder === f.id ? ' active' : ''}`}
        onClick={() => onFolderChange(f.id)}
        title={f.labelEn}
      >
        <span className="outlook-premium-folder-icon">
          <MailIcon name={f.icon} size={18} />
        </span>
        <span className="outlook-premium-folder-label">{f.labelRu}</span>
        {badge > 0 && (
          <span className={`outlook-premium-folder-count${f.id === 'inbox' && unreadInbox > 0 ? ' unread' : ''}`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav className="outlook-premium-folders" aria-label="Папки почты">
      {canCompose && (
        <button type="button" className="outlook-premium-new-btn" onClick={onCompose}>
          <MailIcon name="compose" size={18} />
          <span>Новое сообщение</span>
        </button>
      )}

      <div className="outlook-premium-folder-group">
        {renderFolder(inbox)}
      </div>

      {groupOrder.map((label) => (
        <div className="mail-folder-group" key={label}>
          <div className="mail-folder-group-label">{label}</div>
          <div className="mail-folder-card">
            {primaryGrouped.filter((f) => f.group === label).map(renderFolder)}
          </div>
        </div>
      ))}

      <div className="outlook-premium-folder-divider" />

      <div className="mail-folder-card mail-folder-card--system">
        {system.map(renderFolder)}
      </div>
    </nav>
  );
}
