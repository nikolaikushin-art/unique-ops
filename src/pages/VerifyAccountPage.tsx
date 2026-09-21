import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Field } from '../components/Modal';
import { Logo } from '../components/Logo';
import { useAuthDarkTheme } from './AuthPages';

export function VerifyAccountPage() {
  const { session, profile, loading: authLoading, needsVerification, verifyAccount } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useAuthDarkTheme();

  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/login', { replace: true });
      return;
    }
    if (!authLoading && session && profile && !needsVerification) {
      navigate(profile.must_change_password ? '/set-password' : '/overview', { replace: true });
    }
  }, [authLoading, session, profile, needsVerification, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Введите Verification ID');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err, needsPasswordChange: needsPwd } = await verifyAccount(code);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    navigate(needsPwd ? '/set-password' : '/overview', { replace: true });
  };

  return (
    <div className="auth-page auth-page--dark">
      <div className="auth-box">
        <div className="auth-logo-wrap">
          <Logo height={56} className="auth-logo" />
        </div>
        <h1 className="auth-title">Подтверждение аккаунта</h1>
        <p className="auth-sub">
          Введите Verification ID, который выдал администратор при создании аккаунта.
          Формат: <strong>UO-XXXX-XXXX</strong>
        </p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <Field
            label="Verification ID"
            id="verify-code"
            value={code}
            onChange={setCode}
            placeholder="UO-ABCD-1234"
          />
          <div style={{ marginTop: 24 }}>
            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Проверка...' : 'Подтвердить'}
            </button>
          </div>
        </form>
        <p className="auth-sub" style={{ marginTop: 24, marginBottom: 0 }}>
          Нет кода? Обратитесь к администратору студии.
        </p>
      </div>
    </div>
  );
}
