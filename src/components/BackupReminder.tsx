import { useState } from 'react';
import { backupAgeDays, downloadBackup, hasStudioData } from '../lib/backup';
import { useToast } from '../contexts/ToastContext';

const DISMISS = 'backup-reminder-dismissed';
const LIMIT_DAYS = 7;

/** Data lives only in this browser — remind the owner to keep a copy (replaces the 2FA banner, which cannot work without a server). */
export function BackupReminder() {
  const { toast } = useToast();
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(DISMISS) === '1');
  const [busy, setBusy] = useState(false);
  const age = backupAgeDays();
  if (hidden || !hasStudioData() || (age !== null && age < LIMIT_DAYS)) return null;

  const run = async () => {
    setBusy(true);
    try {
      const r = await downloadBackup(false);
      toast(`Резервная копия сохранена: ${r.filename}`);
      setHidden(true);
    } catch (e) {
      toast('Не удалось создать копию: ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="mfa-setup-banner backup-reminder">
      <div className="mfa-setup-banner-body">
        <div className="mfa-setup-banner-title">Сделайте резервную копию данных</div>
        <p className="mfa-setup-banner-text">
          {age === null ? 'Резервная копия ещё не создавалась.' : `Последняя копия — ${age} дн. назад.`} Данные хранятся только в этом браузере: очистка кэша или смена компьютера удалят их.
        </p>
      </div>
      <div className="mfa-setup-banner-actions">
        <button type="button" className="btn-primary" disabled={busy} onClick={run}>{busy ? 'Сохранение…' : 'Скачать копию'}</button>
        <button type="button" className="btn-secondary" onClick={() => { sessionStorage.setItem(DISMISS, '1'); setHidden(true); }} aria-label="Скрыть">Позже</button>
      </div>
    </div>
  );
}
