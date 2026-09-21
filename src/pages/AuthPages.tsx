import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Field } from '../components/Modal';
import { Logo } from '../components/Logo';
import { isStaff } from '../lib/permissions';

export function useAuthDarkTheme() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    return () => {
      const saved = localStorage.getItem('uo-theme');
      document.documentElement.setAttribute('data-theme', saved || 'light');
    };
  }, []);
}

export function LoginPage() {
  useAuthDarkTheme();
  const { signIn, session, profile, loading: authLoading, needsVerification, needsPasswordChange } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && session && profile) {
      if (needsVerification) navigate('/verify-account', { replace: true });
      else if (needsPasswordChange) navigate('/set-password', { replace: true });
      else if (isStaff(profile.role)) {
        navigate('/overview', { replace: true });
      }
    }
  }, [authLoading, session, profile, needsVerification, needsPasswordChange, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: err, needsMfa, needsVerification: needsVerify, needsPasswordChange: needsPwd } =
        await signIn(email.trim(), '');
      if (err) {
        setError(err);
        return;
      }
      if (needsVerify) {
        navigate('/verify-account', { replace: true });
        return;
      }
      if (needsPwd) {
        navigate('/set-password', { replace: true });
        return;
      }
      if (needsMfa) {
        navigate('/mfa-challenge', { replace: true });
        return;
      }
      navigate('/overview', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить вход. Попробуйте снова.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page auth-page--dark">
      <div className="auth-box">
        <div className="auth-logo-wrap">
          <Logo height={72} className="auth-logo" />
        </div>
        <p className="auth-sub">Внутренняя операционная система студии · только для сотрудников</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <Field label="Email" id="email" type="email" placeholder="you@mail.ru" value={email} onChange={setEmail} />
          <div style={{ marginTop: 24 }}>
            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </div>
        </form>
        <p className="auth-sub" style={{ marginTop: 24, marginBottom: 0 }}>
          Доступ по приглашению администратора
        </p>
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  useAuthDarkTheme();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error: err } = await resetPassword(email);
    if (err) setError(err);
    else setSuccess(true);
    setLoading(false);
  };

  return (
    <div className="auth-page auth-page--dark">
      <div className="auth-box">
        <div className="auth-logo-wrap">
          <Logo height={56} className="auth-logo" />
        </div>
        <h1 className="auth-title">Сброс пароля</h1>
        <p className="auth-sub">Мы отправим ссылку для восстановления на ваш email</p>
        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">Письмо отправлено. Проверьте почту.</div>}
        <form onSubmit={handleSubmit}>
          <Field label="Email" id="email" type="email" value={email} onChange={setEmail} placeholder="you@mail.ru" />
          <div style={{ marginTop: 24 }}>
            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Отправка...' : 'Отправить ссылку'}
            </button>
          </div>
        </form>
        <Link className="auth-link" to="/login">← Вернуться к входу</Link>
      </div>
    </div>
  );
}
