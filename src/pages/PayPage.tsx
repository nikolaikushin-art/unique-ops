import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { fmt, INVOICE_STATUS_LABELS, PAYMENT_RECORD_STATUS_LABELS } from '../lib/constants';
import {
  confirmDemoPayment,
  createInvoicePayment,
  fetchPaymentInfo,
  type PaymentInfo,
} from '../lib/payments';

function usePayDarkTheme() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    return () => {
      const saved = localStorage.getItem('uo-theme');
      document.documentElement.setAttribute('data-theme', saved || 'light');
    };
  }, []);
}

export function PayPage() {
  usePayDarkTheme();
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [searchParams] = useSearchParams();
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(searchParams.get('status') === 'success');

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError('');
    const data = await fetchPaymentInfo(invoiceId);
    if (!data) {
      setError('Счёт не найден или недоступен');
      setInfo(null);
    } else {
      setInfo(data);
      if (data.status === 'paid') setSuccess(true);
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const handlePay = async () => {
    if (!invoiceId || !info?.is_payable || paying) return;
    setPaying(true);
    setError('');
    try {
      const result = await createInvoicePayment(invoiceId);
      if (!result.ok) {
        setError(result.error || 'Ошибка создания платежа');
        return;
      }
      if (result.demo && result.confirmation_url?.includes('/pay/')) {
        // Stay on page in demo mode — user can simulate
        await load();
        return;
      }
      if (result.confirmation_url) {
        window.location.href = result.confirmation_url;
        return;
      }
      setError('URL оплаты не получен');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  const handleDemoPay = async () => {
    if (!invoiceId || paying) return;
    setPaying(true);
    setError('');
    const result = await confirmDemoPayment(invoiceId);
    if (!result.ok) {
      setError(result.error || 'Ошибка демо-оплаты');
      setPaying(false);
      return;
    }
    setSuccess(true);
    await load();
    setPaying(false);
  };

  const statusClass = info?.status === 'paid' ? 'done' : info?.status === 'overdue' ? 'progress' : 'planned';

  return (
    <div className="auth-page auth-page--dark">
      <div className="auth-box" style={{ maxWidth: 520 }}>
        <div className="auth-logo-wrap">
          <Logo height={64} className="auth-logo" />
        </div>
        <p className="auth-sub">Оплата счёта · Unique Detailing</p>

        {loading && <div className="empty-state">Загрузка…</div>}

        {!loading && error && !info && (
          <div className="auth-error">{error}</div>
        )}

        {!loading && info && (
          <>
            {error && <div className="auth-error">{error}</div>}

            {success || info.status === 'paid' ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
                <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Оплачено</h2>
                <p style={{ color: 'var(--muted)', margin: 0 }}>
                  Счёт № {info.invoice_number} · {fmt(info.amount)}
                </p>
              </div>
            ) : (
              <>
                <div className="section-block" style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div className="cell-title">Счёт № {info.invoice_number}</div>
                      <div className="cell-sub">{info.customer_name}</div>
                      {info.description && <div className="cell-sub" style={{ marginTop: 6 }}>{info.description}</div>}
                    </div>
                    <div className={`status-badge ${statusClass}`} style={{ flexShrink: 0 }}>
                      {INVOICE_STATUS_LABELS[info.status] ?? info.status}
                    </div>
                  </div>
                  <div style={{ marginTop: 20, fontSize: 28, fontWeight: 700 }}>{fmt(info.amount)}</div>
                  {info.due_date && (
                    <div className="cell-sub" style={{ marginTop: 8 }}>
                      Срок оплаты: {new Date(info.due_date).toLocaleDateString('ru-RU')}
                    </div>
                  )}
                  {info.latest_payment && (
                    <div className="cell-sub" style={{ marginTop: 8 }}>
                      Платёж: {PAYMENT_RECORD_STATUS_LABELS[info.latest_payment.status] ?? info.latest_payment.status}
                    </div>
                  )}
                </div>

                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
                  Способ оплаты: {info.provider_label}
                </p>

                {info.demo_mode ? (
                  <>
                    <div className="pay-notice-box">
                      <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
                      <div className="pay-notice-title">
                        Платёжная система подключается
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                        Настройка позже — онлайн-оплата недоступна в локальном режиме.
                      </div>
                    </div>
                    {info.is_payable && (
                      <button
                        className="btn-primary btn-full"
                        type="button"
                        disabled={paying}
                        onClick={handleDemoPay}
                      >
                        {paying ? 'Обработка…' : 'Демо: симулировать оплату'}
                      </button>
                    )}
                  </>
                ) : info.is_payable ? (
                  <button
                    className="btn-primary btn-full"
                    type="button"
                    disabled={paying}
                    onClick={handlePay}
                  >
                    {paying ? 'Перенаправление…' : 'ОПЛАТИТЬ СЕЙЧАС'}
                  </button>
                ) : (
                  <div className="empty-state">Оплата недоступна для этого счёта</div>
                )}
              </>
            )}
          </>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
          Вопросы? <a href="mailto:info@uniquedetailing.ru" style={{ color: 'var(--accent)' }}>info@uniquedetailing.ru</a>
        </p>
        <p style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
          <Link to="/login" style={{ color: 'var(--muted)' }}>Вход для сотрудников</Link>
        </p>
      </div>
    </div>
  );
}
