import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSecurity } from '../contexts/SecurityContext';
import { useToast } from '../contexts/ToastContext';
import { logSecurityEvent } from '../lib/security';
import { Field } from './Modal';
import { NavIconCheck, NavIconWarning } from './NavIcons';
import type { Factor } from '../lib/localdb';

export function SecurityPanel() {
  const {
    profile,
    needsMfa,
    mfaFactors,
    refreshMfa,
    enrollMfa,
    confirmMfaEnrollment,
    unenrollMfa,
    verifyPassword,
    updatePassword,
  } = useAuth();
  const { elevated, elevatedMinutesLeft, grantElevated, revokeElevated } = useSecurity();
  const { toast } = useToast();

  const [enrolling, setEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reauthPassword, setReauthPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshMfa();
  }, [refreshMfa]);

  const verifiedFactors = mfaFactors.filter((f: Factor) => f.status === 'verified');
  const isAdminWithoutMfa =
    profile?.role === 'super_admin' && verifiedFactors.length === 0;

  const startEnroll = async () => {
    setBusy(true);
    const { data, error } = await enrollMfa();
    setBusy(false);
    if (error || !data) {
      toast(error || 'Не удалось начать настройку 2FA');
      return;
    }
    setEnrollData(data);
    setEnrolling(true);
    setMfaCode('');
  };

  const finishEnroll = async () => {
    if (!enrollData || mfaCode.length < 6) {
      toast('Введите 6-значный код из приложения');
      return;
    }
    setBusy(true);
    const { error } = await confirmMfaEnrollment(enrollData.factorId, mfaCode);
    setBusy(false);
    if (error) {
      toast(error);
      return;
    }
    await logSecurityEvent('mfa_enrolled');
    toast('Двухфакторная аутентификация включена');
    setEnrolling(false);
    setEnrollData(null);
    setMfaCode('');
    refreshMfa();
  };

  const removeFactor = async (factorId: string) => {
    if (!confirm('Отключить двухфакторную аутентификацию?')) return;
    setBusy(true);
    const { error } = await unenrollMfa(factorId);
    setBusy(false);
    if (error) {
      toast(error);
      return;
    }
    await logSecurityEvent('mfa_unenrolled');
    toast('2FA отключена');
    refreshMfa();
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast('Заполните все поля пароля');
      return;
    }
    if (newPassword.length < 8) {
      toast('Новый пароль — минимум 8 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast('Пароли не совпадают');
      return;
    }
    setBusy(true);
    const verify = await verifyPassword(currentPassword);
    if (verify.error) {
      setBusy(false);
      toast(verify.error);
      return;
    }
    const { error } = await updatePassword(newPassword);
    setBusy(false);
    if (error) {
      toast(error);
      return;
    }
    await logSecurityEvent('password_changed');
    toast('Пароль обновлён');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const confirmElevated = async () => {
    if (!reauthPassword) {
      toast('Введите пароль');
      return;
    }
    setBusy(true);
    const { error } = await verifyPassword(reauthPassword);
    setBusy(false);
    if (error) {
      toast(error);
      await logSecurityEvent('reauth_failed', { context: 'security_panel' });
      return;
    }
    grantElevated();
    await logSecurityEvent('reauth_success', { context: 'security_panel' });
    setReauthPassword('');
    toast('Повышенный доступ активен 15 минут');
  };

  return (
    <div className="security-panel">
      <div className="section-head" style={{ marginTop: 8 }}>
        <div>
          <div className="section-eyebrow">Безопасность</div>
          <div className="section-title">Защита аккаунта</div>
        </div>
      </div>

      <div className="settings-options">
        {isAdminWithoutMfa && (
          <div
            className="mfa-suggestion-banner"
            style={{
              background: 'rgba(59,130,246,0.06)',
              border: '1px solid rgba(59,130,246,0.25)',
              padding: '12px 16px',
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13, marginBottom: 4 }}>
              Рекомендуем включить 2FA
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
              Дополнительная защита для аккаунта super_admin. Настройка необязательна — можно включить позже
              через Google Authenticator, 1Password или другое TOTP-приложение.
            </p>
          </div>
        )}

        <div className="settings-option security-option">
          <div>
            <div className="settings-option-label">Двухфакторная аутентификация (2FA)</div>
            <div className="settings-option-desc">
              Google Authenticator, 1Password или другое TOTP-приложение. После настройки потребуется код при входе.
            </div>
            <div className={`security-status ${verifiedFactors.length ? 'on' : needsMfa ? 'warn' : 'off'}`}>
              {verifiedFactors.length ? (
                <>
                  <NavIconCheck size={14} />
                  <span>Включена ({verifiedFactors.length} устройств)</span>
                </>
              ) : needsMfa ? (
                <>
                  <NavIconWarning size={14} />
                  <span>Требуется код при входе</span>
                </>
              ) : (
                <span>Не настроена</span>
              )}
            </div>
          </div>
          <div className="security-actions">
            {!verifiedFactors.length && !enrolling && (
              <button type="button" className="btn-secondary" onClick={startEnroll} disabled={busy}>
                Настроить 2FA
              </button>
            )}
            {verifiedFactors.map((f) => (
              <button key={f.id} type="button" className="btn-secondary danger" onClick={() => removeFactor(f.id)} disabled={busy}>
                Отключить
              </button>
            ))}
          </div>
        </div>

        {enrolling && enrollData && (
          <div className="mfa-enroll-box">
            <div className="settings-option-label">Сканируйте QR-код</div>
            <p className="settings-hint">Откройте приложение аутентификатора и отсканируйте код или введите ключ вручную.</p>
            <div className="mfa-qr-wrap" dangerouslySetInnerHTML={{ __html: enrollData.qrCode }} />
            <div className="mfa-secret">Ключ: <code>{enrollData.secret}</code></div>
            <Field label="Код из приложения" id="mfa-enroll-code" value={mfaCode} onChange={setMfaCode} placeholder="000000" />
            <div className="security-inline-actions">
              <button type="button" className="btn-primary" onClick={finishEnroll} disabled={busy}>
                {busy ? 'Проверка...' : 'Подтвердить 2FA'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setEnrolling(false); setEnrollData(null); }}>
                Отмена
              </button>
            </div>
          </div>
        )}

        <div className="settings-option security-option">
          <div>
            <div className="settings-option-label">Повышенный доступ</div>
            <div className="settings-option-desc">
              Подтверждение пароля для управления пользователями и критичных операций. Действует 15 минут.
            </div>
            <div className={`security-status ${elevated ? 'on' : 'off'}`}>
              {elevated ? (
                <>
                  <NavIconCheck size={14} />
                  <span>Активен · ~{elevatedMinutesLeft} мин</span>
                </>
              ) : (
                <span>Не активен</span>
              )}
            </div>
          </div>
          <div className="security-reauth-row">
            <input
              className="field-input security-reauth-input"
              type="password"
              placeholder="Текущий пароль"
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
            />
            <button type="button" className="btn-secondary" onClick={confirmElevated} disabled={busy}>
              Подтвердить
            </button>
            {elevated && (
              <button type="button" className="btn-secondary danger" onClick={revokeElevated}>
                Сбросить
              </button>
            )}
          </div>
        </div>

        <div className="settings-option security-option stacked">
          <div>
            <div className="settings-option-label">Смена пароля</div>
            <div className="settings-option-desc">Рекомендуется использовать уникальный пароль длиной 12+ символов.</div>
          </div>
          <div className="security-password-fields">
            <Field label="Текущий пароль" id="sec-cur-pass" type="password" value={currentPassword} onChange={setCurrentPassword} />
            <Field label="Новый пароль" id="sec-new-pass" type="password" value={newPassword} onChange={setNewPassword} />
            <Field label="Повторите новый пароль" id="sec-conf-pass" type="password" value={confirmPassword} onChange={setConfirmPassword} />
            <button type="button" className="btn-primary" style={{ marginTop: 8 }} onClick={changePassword} disabled={busy}>
              Обновить пароль
            </button>
          </div>
        </div>
      </div>

      <p className="settings-hint" style={{ marginTop: 16 }}>
        Сессия: {profile?.email} · локальный режим · все действия безопасности логируются локально.
      </p>
    </div>
  );
}
