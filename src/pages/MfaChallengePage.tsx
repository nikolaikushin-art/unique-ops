import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Field } from '../components/Modal';
import { Logo } from '../components/Logo';
import { useAuthDarkTheme } from './AuthPages';

export function MfaChallengePage() {
  const { needsMfa, mfaFactors, verifyMfa, refreshMfa, session, profile, loading: authLoading } = useAuth();
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
    if (!authLoading && session && profile && !needsMfa) {
      navigate('/overview', { replace: true });
    }
  }, [authLoading, session, profile, needsMfa, navigate]);

  useEffect(() => {
    refreshMfa();
  }, [refreshMfa]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) {
      setError('Введите 6-значный код');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await verifyMfa(code);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    navigate('/overview', { replace: true });
  };

  const factor = mfaFactors.find((f) => f.status === 'verified') ?? mfaFactors[0];

  return (
    <div className="auth-page auth-page--dark">
      <div className="auth-box">
        <div className="auth-logo-wrap">
          <Logo height={56} className="auth-logo" />
        </div>
        <h1 className="auth-title">Двухфакторная проверка</h1>
        <p className="auth-sub">
          Введите код из приложения аутентификатора
          {factor?.friendly_name ? ` (${factor.friendly_name})` : ''}.
        </p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <Field
            label="Код 2FA"
            id="mfa-code"
            value={code}
            onChange={setCode}
            placeholder="000000"
          />
          <div style={{ marginTop: 24 }}>
            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Проверка...' : 'Подтвердить вход'}
            </button>
          </div>
        </form>
        <p className="auth-sub" style={{ marginTop: 24, marginBottom: 0 }}>
          Защита аккаунта · MFA
        </p>
      </div>
    </div>
  );
}
