/** Header pill that hides / shows a page's charts. */
export function AnalyticsToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <div className="tag" role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}>
      {visible ? 'Скрыть аналитику' : 'Аналитика'}
    </div>
  );
}
