import { useEffect, useRef, useState } from 'react';
import { db, resetLocalData } from '../lib/localdb';
import { useToast } from '../contexts/ToastContext';
import { ARCHITECTURE } from '../lib/architecture';
import { backupAgeDays, countStoredFiles, downloadBackup, lastBackupAt, readBackupFile, restoreBackup, type BackupSummary } from '../lib/backup';

export function StoragePanel() {
  const { toast } = useToast();
  const [fileCount, setFileCount] = useState(0);
  const [usedKb, setUsedKb] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ payload: Parameters<typeof restoreBackup>[0]; summary: BackupSummary } | null>(null);
  const [idbFiles, setIdbFiles] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const last = lastBackupAt();
  const age = backupAgeDays();

  useEffect(() => {
    db.from('files').select('id', { count: 'exact', head: true })
      .then(({ count }) => setFileCount(count ?? 0));
    let bytes = 0;
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('uo:')) bytes += (localStorage.getItem(k) ?? '').length * 2;
    }
    setUsedKb(Math.round(bytes / 1024));
    countStoredFiles().then(setIdbFiles);
  }, []);

  const doBackup = async (withFiles: boolean) => {
    setBusy(true);
    try {
      const r = await downloadBackup(withFiles);
      toast(`Копия сохранена: ${r.filename} (${Math.round(r.bytes / 1024)} КБ${withFiles ? `, файлов: ${r.files}` : ''})`);
    } catch (e) {
      toast('Не удалось создать копию: ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const onPick = async (f: File | undefined) => {
    if (!f) return;
    try { setPending(await readBackupFile(f)); } catch (e) { toast((e as Error).message); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const doRestore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending.payload);
      toast('Данные восстановлены — перезагрузка…');
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast('Не удалось восстановить: ' + (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="section-block">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Инфраструктура</div>
          <div className="section-title">Локальное хранилище</div>
        </div>
      </div>
      <p className="page-sub" style={{ marginBottom: 20 }}>
        {ARCHITECTURE.stack}. Все данные и файлы хранятся только в этом браузере — на устройстве, без облака и серверов.
      </p>
      <div className="stat-grid settings-stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Данные</div>
          <div className="stat-value" style={{ fontSize: 20 }}>localStorage</div>
          <div className="stat-note">{usedKb} КБ занято</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Файлов</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{fileCount}</div>
          <div className="stat-note">IndexedDB</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Режим</div>
          <div className="stat-value" style={{ fontSize: 20 }}>Офлайн</div>
          <div className="stat-note">Сервер не нужен</div>
        </div>
      </div>
      <div className="section-eyebrow" style={{ margin: '4px 0 10px' }}>Резервная копия</div>
      <div className="integration-card" style={{ marginBottom: 12 }}>
        <div>
          <div className="integration-name">Скачать копию данных</div>
          <div className="integration-desc">
            {last ? `Последняя копия: ${last.toLocaleString('ru-RU')} (${age} дн. назад).` : 'Копия ещё не создавалась.'} Один файл со всеми клиентами, заказами, счетами и настройками.
          </div>
        </div>
        <div className="tag-row">
          <div className="tag add" style={{ cursor: 'pointer', opacity: busy ? 0.5 : 1 }} onClick={() => !busy && doBackup(false)}>Данные</div>
          <div className="tag add" style={{ cursor: 'pointer', opacity: busy ? 0.5 : 1 }} onClick={() => !busy && doBackup(true)}>Данные + файлы ({idbFiles})</div>
        </div>
      </div>
      <div className="integration-card" style={{ marginBottom: 24 }}>
        <div>
          <div className="integration-name">Восстановить из копии</div>
          <div className="integration-desc">Заменит все текущие данные данными из файла. Сначала скачайте копию текущих данных.</div>
        </div>
        <div className="tag ghost" style={{ cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>Выбрать файл…</div>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => onPick(e.target.files?.[0])} />
      </div>
      {pending && (
        <div className="integration-card" style={{ marginBottom: 24, borderColor: 'var(--red)' }}>
          <div>
            <div className="integration-name">Восстановить копию от {new Date(pending.summary.exported_at).toLocaleString('ru-RU')}?</div>
            <div className="integration-desc">Клиентов: {pending.summary.customers} · заказов: {pending.summary.bookings} · счетов: {pending.summary.invoices} · файлов: {pending.summary.files}. Текущие данные будут заменены.</div>
          </div>
          <div className="tag-row">
            <div className="tag red" style={{ cursor: 'pointer' }} onClick={doRestore}>Заменить данные</div>
            <div className="tag ghost" style={{ cursor: 'pointer' }} onClick={() => setPending(null)}>Отмена</div>
          </div>
        </div>
      )}
      <div className="integration-card">
        <div>
          <div className="integration-name">Сбросить локальные данные</div>
          <div className="integration-desc">Удалит все изменения и вернёт демо-данные.</div>
        </div>
        <div className="tag red" style={{ cursor: 'pointer' }} onClick={() => {
          if (!confirm('Удалить ВСЕ локальные данные и вернуть демо-данные? Это нельзя отменить — сначала скачайте резервную копию.')) return;
          resetLocalData();
          toast('Данные сброшены');
          window.location.reload();
        }}>Сбросить</div>
      </div>
    </div>
  );
}
