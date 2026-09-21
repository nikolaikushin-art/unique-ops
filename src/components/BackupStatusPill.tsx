import { useNavigate } from 'react-router-dom';
import { backupAgeDays, hasStudioData } from '../lib/backup';

/** Real status instead of the old fake «Все системы в норме»: when the data was last backed up. Click → backup settings. */
export function BackupStatusPill() {
  const navigate = useNavigate();
  if (!hasStudioData()) return null;
  const age = backupAgeDays();
  const tone = age === null ? 'var(--red)' : age >= 7 ? 'var(--orange, #d98a1f)' : 'var(--green)';
  const label = age === null ? 'Копия не создана' : age === 0 ? 'Копия: сегодня' : `Копия: ${age} дн. назад`;
  return (
    <div className="pill" style={{ cursor: 'pointer' }} onClick={() => navigate('/settings?tab=storage')} title="Резервная копия данных — нажмите, чтобы открыть">
      <span className="dot" style={{ background: tone }}></span>{label}
    </div>
  );
}
