import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSecurity } from '../contexts/SecurityContext';
import { useToast } from '../contexts/ToastContext';
import { logSecurityEvent } from '../lib/security';
import { Modal, Field } from './Modal';

export function ReauthModal({
  open,
  title = 'Подтверждение доступа',
  description = 'Для этой операции требуется повторный ввод пароля. Сессия повышенного доступа действует 15 минут.',
  onClose,
  onSuccess,
}: {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { profile, verifyPassword } = useAuth();
  const { grantElevated } = useSecurity();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!password) {
      toast('Введите пароль');
      return;
    }
    setLoading(true);
    const { error } = await verifyPassword(password);
    setLoading(false);
    if (error) {
      toast(error);
      await logSecurityEvent('reauth_failed', { context: title });
      return;
    }
    grantElevated();
    await logSecurityEvent('reauth_success', { context: title });
    setPassword('');
    toast('Доступ подтверждён на 15 минут');
    onSuccess();
  };

  const handleClose = () => {
    setPassword('');
    onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={handleClose}
      onSave={handleSave}
      saveLabel={loading ? 'Проверка...' : 'Подтвердить'}
    >
      <p className="settings-hint" style={{ marginBottom: 16 }}>{description}</p>
      <p className="settings-hint" style={{ marginBottom: 16 }}>
        Аккаунт: <strong>{profile?.email}</strong>
      </p>
      <Field
        label="Пароль"
        id="reauth-password"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="••••••••"
      />
    </Modal>
  );
}
