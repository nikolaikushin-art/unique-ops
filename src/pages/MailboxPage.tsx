import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useLocalQuery } from '../hooks/useLocalData';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { MailFolders } from '../components/mailbox/MailFolders';
import { MailList } from '../components/mailbox/MailList';
import { MailReadingPane } from '../components/mailbox/MailReadingPane';
import { MailCompose } from '../components/mailbox/MailCompose';
import { MailIcon } from '../components/mailbox/MailIcons';
import { canManageMailbox } from '../lib/permissions';
import { db } from '../lib/localdb';
import {
  DEFAULT_MAILBOX_FILTERS,
  buildEmailTemplates,
  buildForwardBody,
  buildForwardSubject,
  buildReplyBody,
  buildReplySubject,
  archiveMessage,
  deleteMessage,
  filterMailboxMessages,
  loadMailboxFolderCounts,
  loadMailboxMessages,
  loadUnreadMailboxCount,
  markMessageRead,
  markMessageUnread,
  messageSubject,
  toggleMessageImportant,
  type MailFolder,
  type MailboxFilters,
  type MailboxMessage,
  folderLabelRu,
} from '../lib/mailbox';
import type { Customer, EmailMessageType } from '../types/database';

type MobilePane = 'folders' | 'list' | 'reading' | 'compose';
type ComposeMode = 'new' | 'reply' | 'forward' | 'reminder';

export function MailboxPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { profile } = useAuth();
  const canCompose = canManageMailbox(profile?.role);

  const { data: customers } = useLocalQuery<Customer>('customers', '*', { orderBy: 'full_name', ascending: true });

  const [folder, setFolder] = useState<MailFolder>('inbox');
  const [messages, setMessages] = useState<MailboxMessage[]>([]);
  const [folderCounts, setFolderCounts] = useState<Partial<Record<MailFolder, number>>>({});
  const [unreadInbox, setUnreadInbox] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<MailboxFilters>(DEFAULT_MAILBOX_FILTERS);
  const [mobilePane, setMobilePane] = useState<MobilePane>('folders');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>('new');
  const [composeDefaults, setComposeDefaults] = useState({
    customerId: '',
    subject: '',
    body: '',
    type: 'manual' as EmailMessageType,
    draftId: undefined as string | undefined,
  });

  const reloadCounts = useCallback(async () => {
    try {
      const [counts, unread] = await Promise.all([
        loadMailboxFolderCounts(),
        loadUnreadMailboxCount(),
      ]);
      setFolderCounts(counts);
      setUnreadInbox(unread);
    } catch {
      setFolderCounts({});
      setUnreadInbox(0);
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [data] = await Promise.all([loadMailboxMessages(folder), reloadCounts()]);
      setMessages(data);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [folder, reloadCounts]);

  useEffect(() => {
    reload();
    const deepLinkId = searchParams.get('id');
    if (!deepLinkId) {
      setSelectedId(null);
      setMobilePane('folders');
    }
  }, [reload, searchParams]);

  useEffect(() => {
    const idFromQuery = searchParams.get('id');
    if (idFromQuery) {
      setSelectedId(idFromQuery);
      setMobilePane('reading');
      return;
    }
    const state = location.state as { messageId?: string } | null;
    if (state?.messageId) {
      setSelectedId(state.messageId);
      setMobilePane('reading');
      window.history.replaceState({}, '');
    }
  }, [location.state, searchParams]);

  useEffect(() => {
    const channel = db
      .channel('mailbox-communications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communications', filter: 'channel=eq.email' }, () => {
        reload();
      })
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [reload]);

  const filtered = useMemo(() => filterMailboxMessages(messages, filters), [messages, filters]);
  const selected = filtered.find((m) => m.id === selectedId) ?? messages.find((m) => m.id === selectedId) ?? null;
  const updateMessage = (id: string, patch: Partial<MailboxMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const switchFolder = (f: MailFolder) => {
    setFolder(f);
    setMobilePane('list');
    setSelectedId(null);
    setComposeOpen(false);
  };

  const selectMessage = async (msg: MailboxMessage) => {
    setSelectedId(msg.id);
    setMobilePane('reading');
    setComposeOpen(false);
    if (folder === 'inbox' && !msg.read_at && msg.direction === 'inbound' && profile?.id) {
      try {
        await markMessageRead(msg.id, profile.id);
        updateMessage(msg.id, {
          read_at: new Date().toISOString(),
          read_by_profile_id: profile.id,
        });
      } catch { /* non-critical */ }
    }
  };

  const toggleRead = async (msg: MailboxMessage) => {
    try {
      if (msg.read_at) {
        await markMessageUnread(msg.id);
        updateMessage(msg.id, { read_at: null, read_by_profile_id: null });
        toast('Помечено как непрочитанное');
      } else if (profile?.id) {
        await markMessageRead(msg.id, profile.id);
        updateMessage(msg.id, {
          read_at: new Date().toISOString(),
          read_by_profile_id: profile.id,
        });
        toast('Помечено как прочитанное');
      }
    } catch (e) {
      toast('Ошибка: ' + (e as Error).message);
    }
  };

  const toggleStar = async (msg: MailboxMessage) => {
    const next = !msg.is_important;
    try {
      await toggleMessageImportant(msg.id, next);
      updateMessage(msg.id, { is_important: next });
    } catch (e) {
      toast('Ошибка: ' + (e as Error).message);
    }
  };

  const handleArchive = async (msg: MailboxMessage) => {
    try {
      await archiveMessage(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      if (selectedId === msg.id) setSelectedId(null);
      toast('Перемещено в архив');
      reloadCounts();
    } catch (e) {
      toast('Ошибка: ' + (e as Error).message);
    }
  };

  const handleDelete = async (msg: MailboxMessage) => {
    try {
      await deleteMessage(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      if (selectedId === msg.id) setSelectedId(null);
      toast('Перемещено в корзину');
      reloadCounts();
    } catch (e) {
      toast('Ошибка: ' + (e as Error).message);
    }
  };

  const openCompose = (mode: ComposeMode = 'new', msg?: MailboxMessage) => {
    if (mode === 'new') {
      setComposeDefaults({ customerId: '', subject: '', body: '', type: 'manual', draftId: undefined });
    } else if (msg) {
      const customerId = msg.customer_id || '';
      if (mode === 'reply') {
        setComposeDefaults({
          customerId,
          subject: buildReplySubject(messageSubject(msg)),
          body: buildReplyBody(msg),
          type: 'manual',
          draftId: undefined,
        });
      } else if (mode === 'forward') {
        setComposeDefaults({
          customerId: '',
          subject: buildForwardSubject(messageSubject(msg)),
          body: buildForwardBody(msg),
          type: 'manual',
          draftId: undefined,
        });
      } else if (mode === 'reminder' && msg.customers) {
        const tpl = buildEmailTemplates(msg.customers.full_name)[0];
        setComposeDefaults({
          customerId,
          subject: tpl.subject,
          body: tpl.body,
          type: tpl.type,
          draftId: undefined,
        });
      }
    }
    setComposeMode(mode);
    setComposeOpen(true);
    setMobilePane('compose');
  };

  const closeCompose = () => {
    setComposeOpen(false);
    setMobilePane(selected ? 'reading' : 'folders');
  };

  return (
    <div className={`outlook-premium-workspace${mobilePane === 'folders' ? ' outlook-premium-workspace--mobile-folders-only' : ''}`}>
      <div className="outlook-premium-workspace-head">
        <div className="outlook-premium-workspace-title">
          <MailIcon name="envelope" size={22} />
          <div>
            <h1>Почта</h1>
            <p>Unique Detailing · Outlook workspace</p>
          </div>
        </div>
        <button type="button" className="outlook-premium-refresh-btn" onClick={reload}>
          Обновить
        </button>
      </div>

      <div className="outlook-premium-shell outlook-premium-shell--desktop">
        <aside className="outlook-premium-panel outlook-premium-panel--folders">
          <MailFolders
            folder={folder}
            counts={folderCounts}
            unreadInbox={unreadInbox}
            canCompose={canCompose}
            onFolderChange={switchFolder}
            onCompose={() => openCompose('new')}
          />
        </aside>

        <section className="outlook-premium-panel outlook-premium-panel--list">
          <MailList
            folder={folder}
            messages={filtered}
            selectedId={selectedId}
            loading={loading}
            search={filters.search}
            onSearchChange={(search) => setFilters((f) => ({ ...f, search }))}
            onSelect={selectMessage}
            onStar={toggleStar}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        </section>

        <section className="outlook-premium-panel outlook-premium-panel--reading">
          <MailReadingPane
            message={selected}
            canCompose={canCompose}
            onReply={() => selected && openCompose('reply', selected)}
            onReplyAll={() => selected && openCompose('reply', selected)}
            onForward={() => selected && openCompose('forward', selected)}
            onArchive={() => selected && handleArchive(selected)}
            onDelete={() => selected && handleDelete(selected)}
            onToggleRead={() => selected && toggleRead(selected)}
            onToggleStar={() => selected && toggleStar(selected)}
          />
        </section>
      </div>

      <div className="outlook-premium-shell outlook-premium-shell--mobile">
        {mobilePane === 'folders' && (
          <div className="outlook-premium-mobile-folders outlook-premium-mobile-folders--full">
            <MailFolders
              folder={folder}
              counts={folderCounts}
              unreadInbox={unreadInbox}
              canCompose={canCompose}
              onFolderChange={switchFolder}
              onCompose={() => openCompose('new')}
            />
          </div>
        )}

        {mobilePane === 'list' && (
          <div className="outlook-premium-mobile-list">
            <button type="button" className="outlook-premium-back-btn" onClick={() => setMobilePane('folders')}>
              <MailIcon name="back" size={18} />
              {folderLabelRu(folder)}
            </button>
            <MailList
              folder={folder}
              messages={filtered}
              selectedId={selectedId}
              loading={loading}
              search={filters.search}
              onSearchChange={(search) => setFilters((f) => ({ ...f, search }))}
              onSelect={selectMessage}
              onStar={toggleStar}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          </div>
        )}

        {mobilePane === 'reading' && (
          <div className="outlook-premium-mobile-reading">
            <button type="button" className="outlook-premium-back-btn" onClick={() => setMobilePane('list')}>
              <MailIcon name="back" size={18} />
              Назад к списку
            </button>
            <MailReadingPane
              message={selected}
              canCompose={canCompose}
              onReply={() => selected && openCompose('reply', selected)}
              onReplyAll={() => selected && openCompose('reply', selected)}
              onForward={() => selected && openCompose('forward', selected)}
              onArchive={() => selected && handleArchive(selected)}
              onDelete={() => selected && handleDelete(selected)}
              onToggleRead={() => selected && toggleRead(selected)}
              onToggleStar={() => selected && toggleStar(selected)}
            />
          </div>
        )}
      </div>

      {composeOpen && canCompose && (
        <MailCompose
          mode={composeMode}
          customers={customers}
          defaultCustomerId={composeDefaults.customerId}
          defaultSubject={composeDefaults.subject}
          defaultBody={composeDefaults.body}
          defaultType={composeDefaults.type}
          draftId={composeDefaults.draftId}
          onSent={() => { reload(); closeCompose(); }}
          onCancel={closeCompose}
        />
      )}
    </div>
  );
}
