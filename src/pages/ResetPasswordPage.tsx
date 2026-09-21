import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/localdb';
import { Field } from '../components/Modal';
import { Logo } from '../components/Logo';

function useAuthDarkTheme() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    return () => {
      const saved = localStorage.getItem('uo-theme');
      document.documentElement.setAttribute('data-theme', saved || 'light');
    };
  }, []);
}

export function ResetPasswordPage() {
  useAuthDarkTheme();
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    db.auth.getSession().then(({ data: { session } }: { data: { session: unknown } }) => {
      if (!session) setError('Ссылка недействительна или устарела. Запросите сброс пароля снова.');
      setSessionReady(true);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionReady) return;
    if (password.length < 8) { setError('Минимум 8 символов'); return; }
    if (password !== confirm) { setError('Пароли не совпадают'); return; }
    setLoading(true);
    const { error: err } = await updatePassword(password);
    if (err) setError(err);
    else navigate('/overview', { replace: true });
    setLoading(false);
  };

  return (
    <div className="auth-page auth-page--dark">
      <div className="auth-box">
        <div className="auth-logo-wrap"><Logo height={56} className="auth-logo" /></div>
        <h1 className="auth-title">Новый пароль</h1>
        <p className="auth-sub">Введите новый пароль для вашего аккаунта</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <Field label="Новый пароль" id="pw" type="password" value={password} onChange={setPassword} />
          <div style={{ marginTop: 16 }}>
            <Field label="Подтвердите пароль" id="pw2" type="password" value={confirm} onChange={setConfirm} />
          </div>
          <div style={{ marginTop: 24 }}>
            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Сохранение...' : 'Сохранить пароль'}
            </button>
          </div>
        </form>
        <Link className="auth-link" to="/login">← Вернуться к входу</Link>
      </div>
    </div>
  );
}
