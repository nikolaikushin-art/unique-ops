import { useEffect, useState } from 'react';
import { db } from '../lib/localdb';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin } from '../lib/permissions';

interface AuditEntry {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  reauth_success: 'Подтверждение пароля',
  reauth_failed: 'Ошибка подтверждения',
  mfa_enrolled: '2FA включена',
  mfa_unenrolled: '2FA отключена',
  password_changed: 'Пароль изменён',
  user_created: 'Пользователь создан',
  user_deleted: 'Пользователь удалён',
  user_role_changed: 'Роль изменена',
  user_enabled: 'Пользователь включён',
  user_disabled: 'Пользователь отключён',
  user_updated: 'Профиль обновлён',
};

export function AuditLogPanel() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin(profile?.role)) {
      setLoading(false);
      return;
    }
    db
      .from('security_audit_log')
      .select('id, action, details, created_at, profiles:user_id(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setEntries((data as unknown as AuditEntry[]) ?? []);
        setLoading(false);
      });
  }, [profile?.role]);

  if (!isAdmin(profile?.role)) return null;
  if (loading) return <div className="empty-state">Загрузка журнала...</div>;

  return (
    <div className="section-block">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Безопасность</div>
          <div className="section-title">Журнал событий</div>
        </div>
      </div>
      <p className="settings-hint">Последние 50 действий безопасности и управления пользователями (локально).</p>
      {entries.length ? entries.map((e) => (
        <div className="integration-card" key={e.id}>
          <div>
            <div className="integration-name">{ACTION_LABELS[e.action] ?? e.action}</div>
            <div className="integration-desc">
              {e.profiles?.full_name || e.profiles?.email || 'Система'} · {new Date(e.created_at).toLocaleString('ru-RU')}
            </div>
          </div>
          <div className="tag ghost">{e.action}</div>
        </div>
      )) : <div className="empty-state">Записей пока нет.</div>}
    </div>
  );
}
