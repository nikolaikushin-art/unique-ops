import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Field } from '../components/Modal';
import { Logo } from '../components/Logo';
import { useAuthDarkTheme } from './AuthPages';

export function SetPasswordPage() {
  const {
    session,
    profile,
    loading: authLoading,
    needsVerification,
    needsPasswordChange,
    updatePassword,
    clearMustChangePassword,
  } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useAuthDarkTheme();

  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/login', { replace: true });
      return;
    }
    if (!authLoading && session && needsVerification) {
      navigate('/verify-account', { replace: true });
      return;
    }
    if (!authLoading && session && profile && !needsPasswordChange) {
      navigate('/overview', { replace: true });
    }
  }, [authLoading, session, profile, needsVerification, needsPasswordChange, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов');
      return;
    }
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await updatePassword(password);
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    await clearMustChangePassword();
    setLoading(false);
    navigate('/overview', { replace: true });
  };

  return (
    <div className="auth-page auth-page--dark">
      <div className="auth-box">
        <div className="auth-logo-wrap">
          <Logo height={56} className="auth-logo" />
        </div>
        <h1 className="auth-title">Новый пароль</h1>
        <p className="auth-sub">
          Установите личный пароль для входа в систему. Временный пароль от администратора больше не понадобится.
        </p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <Field
            label="Новый пароль"
            id="new-password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Минимум 8 символов"
          />
          <div style={{ marginTop: 16 }}>
            <Field
              label="Повторите пароль"
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              placeholder="••••••••"
            />
          </div>
          <div style={{ marginTop: 24 }}>
            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Сохранение...' : 'Сохранить пароль'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
