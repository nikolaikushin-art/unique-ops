/** Placeholder shown when a module's analytics are switched off (the default). */
export function AnalyticsHidden({ onShow }: { onShow: () => void }) {
  return (
    <div className="dx-card" style={{ textAlign: 'center', padding: '44px 24px' }}>
      <div className="dx-title">Аналитика скрыта</div>
      <div className="dx-sub" style={{ margin: '6px 0 18px' }}>Показатели, графики и диагностика открываются по кнопке.</div>
      <button type="button" className="dx-btn" onClick={onShow}>Показать аналитику</button>
    </div>
  );
}
