import { useNavigate } from 'react-router-dom';
import { Avatar } from '../ui/Avatar';
import { ActivityRings } from '../charts/ActivityRings';
import { TINT } from '../charts/palette';

interface RecentCustomer {
  id: string;
  name: string;
  sub: string;
}

interface CustomerSnapshotProps {
  newCustomers: number;
  returningCustomers: number;
  retentionProxy: number;
  totalCustomers?: number;
  recent?: RecentCustomer[];
  showRings?: boolean;
}

export function CustomerSnapshot({ newCustomers, returningCustomers, retentionProxy, totalCustomers, recent = [], showRings = true }: CustomerSnapshotProps) {
  const navigate = useNavigate();
  return (
    <div className="dashboard-widget customer-widget">
      <div className="widget-head">
        <div>
          <div className="section-eyebrow">Клиенты</div>
          <div className="section-title">Клиентская база</div>
        </div>
        <div className="link-btn" onClick={() => navigate('/customers')}>Все клиенты →</div>
      </div>
      <div className="widget-stats three">
        <div className="widget-stat">
          <div className="widget-stat-label">Новые</div>
          <div className="widget-stat-value">{newCustomers}</div>
          <div className="widget-stat-note">за месяц</div>
        </div>
        <div className="widget-stat">
          <div className="widget-stat-label">Вернулись</div>
          <div className="widget-stat-value">{returningCustomers}</div>
          <div className="widget-stat-note">с 2+ визитами</div>
        </div>
        <div className="widget-stat">
          <div className="widget-stat-label">Удержание</div>
          <div className="widget-stat-value">{retentionProxy}%</div>
          {totalCustomers !== undefined && <div className="widget-stat-note">всего {totalCustomers}</div>}
        </div>
      </div>

      {showRings && (
      <div style={{ margin: '4px 0 18px' }}>
        <ActivityRings
          size={112}
          stroke={12}
          rings={[{ id: 'retention', label: 'Удержание', hint: `${returningCustomers} из ${totalCustomers ?? '—'} вернулись`, value: retentionProxy / 100, display: `${retentionProxy}%`, color: TINT.purple, unknown: !totalCustomers }]}
          center={<><b style={{ fontSize: 20 }}>{retentionProxy}%</b><span>удержание</span></>}
        />
      </div>
      )}

      {recent.length > 0 && (
        <div className="uo-mini-list">
          <div className="uo-mini-list-title">Недавно добавлены</div>
          {recent.map((c) => (
            <button type="button" key={c.id} className="uo-mini-row" onClick={() => navigate('/customers')}>
              <Avatar name={c.name} size={34} />
              <span className="uo-mini-main">
                <span className="uo-mini-name">{c.name}</span>
                <span className="uo-mini-sub">{c.sub}</span>
              </span>
              <span className="uo-mini-chevron">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
