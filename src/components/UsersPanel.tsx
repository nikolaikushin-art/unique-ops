import { useEffect, useState } from 'react';
import { db } from '../lib/localdb';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin } from '../lib/permissions';
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '../lib/constants';
import { Modal, Field, SelectField } from './Modal';
import { logSecurityEvent } from '../lib/security';

import type { Profile, UserRole } from '../types/database';

const ROLES: UserRole[] = ['super_admin', 'studio_owner', 'reception', 'detailer', 'accountant'];

interface CreatedUserInfo {
  email: string;
  password: string;
  full_name: string;
  verification_code: string;
}

function copyText(text: string, toast: (msg: string) => void) {
  navigator.clipboard.writeText(text).then(
    () => toast('Скопировано'),
    () => toast('Не удалось скопировать'),
  );
}

export function UsersPanel() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdUser, setCreatedUser] = useState<CreatedUserInfo | null>(null);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'reception' as UserRole });
  const [creating, setCreating] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<UserRole | null>(null);

  const load = () => {
    setLoading(true);
    db.from('profiles').select('*').neq('role', 'customer').order('full_name')
      .then(({ data, error }) => {
        if (error) toast('Ошибка загрузки: ' + error.message);
        setUsers((data as Profile[]) ?? []);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isAdmin(profile?.role)) load();
    else setLoading(false);
  }, [profile?.role]);

  if (!isAdmin(profile?.role)) return null;

  const updateUser = async (id: string, patch: Partial<Profile>) => {
    const { error } = await db.from('profiles').update(patch).eq('id', id);
    if (error) toast('Ошибка: ' + error.message);
    else {
      if (patch.role) await logSecurityEvent('user_role_changed', { user_id: id, role: patch.role });
      if (patch.is_active !== undefined) await logSecurityEvent(patch.is_active ? 'user_enabled' : 'user_disabled', { user_id: id });
      if (patch.full_name) await logSecurityEvent('user_updated', { user_id: id });
      toast('Сохранено');
      load();
    }
  };

  const createUser = async () => {
    if (!form.email || !form.full_name) {
      toast('Заполните все поля');
      return;
    }
    setCreating(true);

    const email = form.email.trim();
    const password = '';
    const full_name = form.full_name.trim();

    const { data: rpcData, error: rpcErr } = await db.rpc('admin_create_user', {
      p_email: email,
      p_password: password,
      p_full_name: full_name,
      p_role: form.role,
    });

    if (!rpcErr && rpcData) {
      const result = rpcData as { user_id?: string; verification_code?: string };
      await logSecurityEvent('user_created', { email, role: form.role });
      setShowCreate(false);
      setForm({ email: '', password: '', full_name: '', role: 'reception' });
      setCreatedUser({
        email,
        password,
        full_name,
        verification_code: result.verification_code || '—',
      });
      load();
      setCreating(false);
      return;
    }

    try {
      const { data, error } = await db.functions.invoke('admin-users', {
        body: { action: 'create', email, password, full_name, role: form.role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setShowCreate(false);
      setForm({ email: '', password: '', full_name: '', role: 'reception' });
      setCreatedUser({
        email,
        password,
        full_name,
        verification_code: data?.verification_code || '—',
      });
      load();
    } catch (e) {
      const msg = rpcErr?.message || (e instanceof Error ? e.message : 'Неизвестная ошибка');
      toast('Ошибка создания: ' + msg);
    }
    setCreating(false);
  };

  const resetVerificationCode = async (u: Profile) => {
    if (!confirm(`Сбросить Verification ID для ${u.full_name || u.email}? Пользователю потребуется повторное подтверждение при входе.`)) return;
    setResettingId(u.id);
    const { data, error } = await db.rpc('admin_reset_verification_code', { p_user_id: u.id });
    setResettingId(null);
    if (error) {
      toast('Ошибка: ' + error.message);
      return;
    }
    await logSecurityEvent('verification_code_reset', { user_id: u.id });
    toast('Новый Verification ID: ' + (data as string));
    load();
  };

  const removeUser = async (u: Profile, hard = false) => {
    if (u.id === profile?.id) { toast('Нельзя удалить свой аккаунт'); return; }

    if (hard) {
      if (!confirm(`Полностью удалить ${u.full_name || u.email}? Это действие необратимо.`)) return;
      const { error } = await db.rpc('admin_delete_user', { p_user_id: u.id });
      if (error) {
        try {
          const { data, error: fnErr } = await db.functions.invoke('admin-users', {
            body: { action: 'delete', user_id: u.id },
          });
          if (fnErr || data?.error) throw fnErr || new Error(data?.error);
          toast('Пользователь удалён');
          load();
          return;
        } catch {
          toast('Ошибка удаления: ' + error.message);
          return;
        }
      }
      toast('Пользователь удалён');
      await logSecurityEvent('user_deleted', { user_id: u.id, email: u.email });
      load();
      return;
    }

    if (!confirm(`Отключить доступ для ${u.full_name || u.email}?`)) return;
    await updateUser(u.id, { is_active: false });
    toast('Пользователь отключён');
  };

  if (loading) return <div className="empty-state">Загрузка пользователей...</div>;

  return (
    <div className="section-block">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Управление доступом</div>
          <div className="section-title">Пользователи и права</div>
        </div>
        <div className="tag add" onClick={() => setShowCreate(true)}>+ Добавить пользователя</div>
      </div>

      <div className="invite-info-banner">
        <div className="invite-info-title">Как работает добавление сотрудников</div>
        <p>
          Пользователь может войти сразу с <strong>email</strong> и <strong>паролем</strong> — подтверждение по email-ссылке не требуется.
          При первом входе система запросит <strong>Verification ID</strong> — передайте его сотруднику вместе с учётными данными.
        </p>
        <p className="invite-info-note">
          Email-письмо с приглашением не отправляется автоматически. Передайте данные лично, в мессенджере или по корпоративной почте.
        </p>
      </div>

      <div className="permissions-matrix">
        <div className="section-eyebrow" style={{ marginBottom: 12 }}>Роли и уровни доступа</div>
        <div className="permissions-grid">
          {ROLES.map((r) => (
            <div
              key={r}
              className={`permission-card ${expandedRole === r ? 'expanded' : ''}`}
              onClick={() => setExpandedRole(expandedRole === r ? null : r)}
            >
              <div className="permission-card-title">{ROLE_LABELS[r]}</div>
              <div className="permission-card-desc">{ROLE_DESCRIPTIONS[r]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="users-list">
        {users.map((u) => (
          <div className="user-card" key={u.id}>
            <div className="user-card-head">
              <div className="user-card-name">{u.full_name || '—'}</div>
              <span className={`status-badge ${u.is_active ? 'done' : 'planned'}`}>
                {u.is_active ? 'Активен' : 'Отключён'}
              </span>
            </div>
            <div className="user-card-email">{u.email}</div>
            {u.verification_code && (
              <div className="user-verification-row">
                <div>
                  <div className="field-label">Verification ID</div>
                  <div className="verification-code-display">
                    {u.verification_code}
                    {u.verified_at
                      ? <span className="verification-status verified">Подтверждён</span>
                      : <span className="verification-status pending">Ожидает первого входа</span>}
                  </div>
                </div>
                {u.id !== profile?.id && (
                  <button
                    type="button"
                    className="btn-secondary user-action-btn"
                    disabled={resettingId === u.id}
                    onClick={() => resetVerificationCode(u)}
                  >
                    {resettingId === u.id ? 'Сброс...' : 'Сбросить код верификации'}
                  </button>
                )}
              </div>
            )}
            <div className="user-card-fields">
              <div className="user-field">
                <label className="field-label">Имя</label>
                <input
                  className="field-input"
                  defaultValue={u.full_name || ''}
                  onBlur={(e) => { if (e.target.value !== (u.full_name || '')) updateUser(u.id, { full_name: e.target.value }); }}
                />
              </div>
              <div className="user-field">
                <label className="field-label">Роль / права</label>
                <select
                  className="field-select"
                  value={u.role}
                  onChange={(e) => updateUser(u.id, { role: e.target.value as UserRole })}
                  disabled={u.id === profile?.id}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <div className="user-role-hint">{ROLE_DESCRIPTIONS[u.role]}</div>
              </div>
            </div>
            {u.id !== profile?.id && (
              <div className="user-card-actions">
                <button
                  type="button"
                  className="btn-secondary user-action-btn"
                  onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                >
                  {u.is_active ? 'Отключить' : 'Включить'}
                </button>
                <button
                  type="button"
                  className="btn-secondary user-action-btn danger"
                  onClick={() => removeUser(u, false)}
                >
                  Отключить доступ
                </button>
                <button
                  type="button"
                  className="btn-secondary user-action-btn danger"
                  onClick={() => removeUser(u, true)}
                >
                  Удалить
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!users.length && <div className="empty-state">Пользователи не найдены. Добавьте первого сотрудника.</div>}

      <Modal
        open={showCreate}
        title="Новый пользователь"
        onClose={() => setShowCreate(false)}
        onSave={createUser}
        saveLabel={creating ? 'Создание...' : 'Создать пользователя'}
      >
        <Field label="Email" id="u-email" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="staff@unique.ru" />
        <Field label="Имя и фамилия" id="u-name" value={form.full_name} onChange={(v) => setForm((f) => ({ ...f, full_name: v }))} />
        <SelectField
          label="Роль и права доступа"
          id="u-role"
          value={form.role}
          onChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}
          options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        />
        <div className="role-preview">{ROLE_DESCRIPTIONS[form.role]}</div>
        <p className="invite-form-hint">
          Локальный режим: сотрудник входит только по email, пароль не нужен.
        </p>
      </Modal>

      <Modal
        open={!!createdUser}
        title="Пользователь создан"
        onClose={() => setCreatedUser(null)}
        onSave={() => setCreatedUser(null)}
        saveLabel="Готово"
      >
        {createdUser && (
          <div className="created-user-credentials">
            <p className="created-user-intro">
              Пользователь <strong>{createdUser.full_name}</strong> создан:
            </p>
            <div className="credential-row">
              <div>
                <div className="field-label">Email</div>
                <div className="credential-value">{createdUser.email}</div>
              </div>
              <button type="button" className="btn-secondary copy-btn" onClick={() => copyText(createdUser.email, toast)}>Копировать</button>
            </div>
            <div className="credential-row credential-row--highlight">
              <div>
                <div className="field-label">Verification ID</div>
                <div className="credential-value verification-code-value">{createdUser.verification_code}</div>
              </div>
              <button type="button" className="btn-secondary copy-btn" onClick={() => copyText(createdUser.verification_code, toast)}>Копировать</button>
            </div>
            <p className="created-user-note">
              Пользователь может войти сразу — достаточно email.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
