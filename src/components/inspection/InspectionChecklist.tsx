import type { ChecklistData, ChecklistFieldDef } from '../../lib/inspection';

interface InspectionChecklistProps {
  fields: ChecklistFieldDef[];
  data: ChecklistData;
  onChange: (data: ChecklistData) => void;
}

export function InspectionChecklist({ fields, data, onChange }: InspectionChecklistProps) {
  const set = (key: string, patch: Partial<ChecklistData[string]>) => {
    onChange({ ...data, [key]: { ...data[key], ...patch } });
  };

  return (
    <div className="inspection-checklist">
      {fields.map((f) => {
        const val = data[f.key] ?? {};
        if (f.type === 'notes') {
          return (
            <div key={f.key} className="inspection-check-row inspection-check-row--full">
              <label className="field-label" htmlFor={`chk-${f.key}`}>{f.label}</label>
              <textarea
                id={`chk-${f.key}`}
                className="field-input"
                rows={2}
                value={val.notes ?? ''}
                onChange={(e) => set(f.key, { notes: e.target.value })}
              />
            </div>
          );
        }
        if (f.type === 'checkbox') {
          return (
            <label key={f.key} className="inspection-check-row inspection-check-touch">
              <input
                type="checkbox"
                className="check-native"
                checked={!!val.checked}
                onChange={(e) => set(f.key, { checked: e.target.checked })}
              />
              <span className="check-circle" aria-hidden="true"></span>
              <span>{f.label}</span>
            </label>
          );
        }
        if (f.type === 'rating') {
          return (
            <div key={f.key} className="inspection-check-row">
              <span className="field-label">{f.label}</span>
              <div className="rating-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`rating-btn ${val.rating === n ? 'active' : ''}`}
                    onClick={() => set(f.key, { rating: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div key={f.key} className="inspection-check-row">
            <label className="field-label" htmlFor={`sel-${f.key}`}>{f.label}</label>
            <select
              id={`sel-${f.key}`}
              className="field-select"
              value={val.condition ?? ''}
              onChange={(e) => set(f.key, { condition: e.target.value })}
            >
              <option value="">—</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
