export interface DashboardAlert {
  id: string;
  type: 'overdue_job' | 'low_stock' | 'overdue_invoice' | 'pending_approval' | 'system';
  title: string;
  body: string;
  severity: 'warn' | 'critical';
}

interface DashboardAlertsProps {
  alerts: DashboardAlert[];
  onNavigate?: (path: string) => void;
}

const NAV_MAP: Record<DashboardAlert['type'], string> = {
  overdue_job: '/jobs',
  low_stock: '/inventory',
  overdue_invoice: '/finance',
  pending_approval: '/pipeline',
  system: '/overview',
};

const TYPE_LABELS: Record<DashboardAlert['type'], string> = {
  overdue_job: 'просрочка',
  low_stock: 'склад',
  overdue_invoice: 'счёт',
  pending_approval: 'контроль качества',
  system: 'система',
};

export function DashboardAlerts({ alerts, onNavigate }: DashboardAlertsProps) {
  if (!alerts.length) {
    return (
      <div className="dashboard-widget alerts-widget">
        <div className="section-eyebrow">Оповещения</div>
        <div className="section-title">Панель оповещений</div>
        <div className="alerts-empty-inline">Критических оповещений нет</div>
      </div>
    );
  }

  return (
    <div className="dashboard-widget alerts-widget">
      <div className="widget-head">
        <div>
          <div className="section-eyebrow">Оповещения</div>
          <div className="section-title">Требуют внимания · {alerts.length}</div>
        </div>
      </div>
      <div className="dashboard-alerts-list">
        {alerts.map((a) => (
          <div
            key={a.id}
            className={`dashboard-alert ${a.severity}`}
            onClick={() => onNavigate?.(NAV_MAP[a.type])}
          >
            <div className="dashboard-alert-type">{TYPE_LABELS[a.type]}</div>
            <div className="dashboard-alert-title">{a.title}</div>
            <div className="dashboard-alert-body">{a.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
