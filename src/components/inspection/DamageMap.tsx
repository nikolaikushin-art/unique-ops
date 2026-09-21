import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  buildR2Key,
  uploadToR2,
  saveAssetMetadata,
  openR2File,
  publicR2Url,
} from '../../lib/r2Storage';
import { NavIconCamera } from '../NavIcons';
import {
  DAMAGE_AREAS,
  SEVERITY_LABELS,
  type DamageEntry,
  type DamageSeverity,
} from '../../lib/inspection';
import { BODY_TYPE_LABELS, buildCarModel, detectBodyType, type BodyType } from '../../lib/carModel';

interface DamageMapProps {
  entries: DamageEntry[];
  onChange: (entries: DamageEntry[]) => void;
  vehicleId?: string;
  bookingId?: string | null;
  /** used to pick a matching body shape (sedan / coupe / SUV / hatchback) */
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
}

const BODY_TYPES = Object.keys(BODY_TYPE_LABELS) as BodyType[];

export function DamageMap({ entries, onChange, vehicleId, bookingId, vehicleBrand, vehicleModel }: DamageMapProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [severity, setSeverity] = useState<DamageSeverity>('minor');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [hoverArea, setHoverArea] = useState<string | null>(null);
  const [manualBody, setManualBody] = useState<BodyType | null>(null);

  // A manual body-type choice only applies to the vehicle it was made for.
  useEffect(() => { setManualBody(null); }, [vehicleId]);

  const bodyType = manualBody ?? detectBodyType(vehicleBrand, vehicleModel);
  const model = useMemo(() => buildCarModel(bodyType), [bodyType]);
  const entryByArea = useMemo(() => new Map(entries.map((e) => [e.area, e])), [entries]);
  const zoneById = useMemo(() => new Map(model.zones.map((z) => [z.id, z])), [model]);
  const areaLabel = (id: string) => DAMAGE_AREAS.find((a) => a.id === id)?.label ?? id;

  const selectZone = (id: string) => {
    setSelectedArea(id);
    const existing = entries.find((e) => e.area === id);
    if (existing) {
      setSeverity(existing.severity);
      setNotes(existing.notes);
    } else {
      setNotes('');
    }
  };

  const selectedEntry = selectedArea ? entries.find((e) => e.area === selectedArea) : undefined;

  const addEntry = () => {
    if (!selectedArea) return;
    const existing = entries.findIndex((e) => e.area === selectedArea);
    const entry: DamageEntry = {
      area: selectedArea,
      severity,
      notes,
      photo_keys: existing >= 0 ? entries[existing].photo_keys : [],
    };
    if (existing >= 0) {
      const next = [...entries];
      next[existing] = { ...next[existing], severity, notes };
      onChange(next);
    } else {
      onChange([...entries, entry]);
    }
    setNotes('');
  };

  const removeEntry = (area: string) => {
    onChange(entries.filter((e) => e.area !== area));
    if (selectedArea === area) setSelectedArea(null);
  };

  const updatePhotoKeys = (area: string, photoKeys: string[]) => {
    onChange(entries.map((e) => (e.area === area ? { ...e, photo_keys: photoKeys } : e)));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!vehicleId || !selectedArea || !fileList?.length) {
      if (!vehicleId) toast('Сначала выберите автомобиль');
      return;
    }
    setUploading(true);
    const newKeys: string[] = [];
    try {
      for (const file of Array.from(fileList)) {
        const key = buildR2Key('vehicle', vehicleId, 'damage', file.name);
        await uploadToR2(file, key);
        await saveAssetMetadata({
          entity_type: 'vehicle',
          entity_id: vehicleId,
          category: 'damage',
          r2_key: key,
          bucket_path: key,
          file_name: file.name,
          file_type: file.type || null,
          file_size: file.size,
          is_sensitive: false,
          booking_id: bookingId ?? null,
          title: `${DAMAGE_AREAS.find((a) => a.id === selectedArea)?.label ?? selectedArea} · ${file.name}`,
          uploaded_by: profile?.id ?? null,
        });
        newKeys.push(key);
      }
      const existing = entries.find((x) => x.area === selectedArea);
      const mergedKeys = [...(existing?.photo_keys ?? []), ...newKeys];
      if (existing) {
        updatePhotoKeys(selectedArea, mergedKeys);
      } else {
        onChange([...entries, { area: selectedArea, severity, notes, photo_keys: mergedKeys }]);
      }
      toast(`Загружено ${newKeys.length} фото в R2`);
    } catch (err) {
      toast('Ошибка загрузки: ' + (err as Error).message);
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div className="damage-map">
      <div className="damage-map-layout">
        <div className="damage-map-diagram">
          <div className="damage-map-bodytypes" role="group" aria-label="Тип кузова">
            {BODY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-pill ${bodyType === t ? 'active' : ''}`}
                onClick={() => setManualBody(t)}
              >
                {BODY_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="damage-map-axis">Перед</div>
          <svg
            viewBox={`0 0 ${model.width} ${model.height}`}
            className="damage-map-svg"
            role="group"
            aria-label="Схема автомобиля, вид сверху"
          >
            <path d={model.outline} className="car-body" />
            {model.zones.map((z) => {
              const entry = entryByArea.get(z.id);
              const cls = [
                'damage-zone',
                `kind-${z.kind}`,
                entry ? `has-damage sev-${entry.severity}` : '',
                selectedArea === z.id ? 'selected' : '',
              ].filter(Boolean).join(' ');
              return (
                <path
                  key={z.id}
                  d={z.d}
                  className={cls}
                  role="button"
                  tabIndex={0}
                  aria-label={areaLabel(z.id)}
                  aria-pressed={selectedArea === z.id}
                  onClick={() => selectZone(z.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectZone(z.id); }
                  }}
                  onMouseEnter={() => setHoverArea(z.id)}
                  onMouseLeave={() => setHoverArea(null)}
                  onFocus={() => setHoverArea(z.id)}
                  onBlur={() => setHoverArea(null)}
                >
                  <title>{areaLabel(z.id)}</title>
                </path>
              );
            })}
            {model.decor.map((d, i) => (
              <path key={i} d={d.d} className={`car-decor ${d.cls}`} />
            ))}
            {entries.map((e, i) => {
              const z = zoneById.get(e.area);
              if (!z) return null;
              return (
                <g key={e.area} className={`damage-badge sev-${e.severity}`} transform={`translate(${z.cx} ${z.cy})`}>
                  <circle r="9" />
                  <text textAnchor="middle" dominantBaseline="central">{i + 1}</text>
                </g>
              );
            })}
          </svg>
          <div className="damage-map-axis">Зад</div>
          <div className="damage-map-hint">
            {hoverArea ? areaLabel(hoverArea) : selectedArea ? areaLabel(selectedArea) : 'Нажмите на элемент кузова'}
          </div>
          <div className="damage-map-legend">
            {(Object.keys(SEVERITY_LABELS) as DamageSeverity[]).map((sv) => (
              <span key={sv} className="damage-map-legend-item">
                <i className={`dot sev-${sv}`} />{SEVERITY_LABELS[sv]}
              </span>
            ))}
          </div>
        </div>
        <div className="damage-map-form">
          <div className="field-label">Зона: {selectedArea ? areaLabel(selectedArea) : 'Выберите на схеме'}</div>
          <label className="field-label" htmlFor="damage-severity">Серьёзность</label>
          <select
            id="damage-severity"
            className="field-select"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as DamageSeverity)}
          >
            {(Object.keys(SEVERITY_LABELS) as DamageSeverity[]).map((s) => (
              <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
            ))}
          </select>
          <label className="field-label" htmlFor="damage-notes">Примечания</label>
          <textarea
            id="damage-notes"
            className="field-input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Описание повреждения..."
          />
          {vehicleId && selectedArea && (
            <div style={{ marginTop: 8 }}>
              <label className={`tag add tag-with-icon ${uploading ? 'disabled' : ''}`} style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                {uploading ? 'Загрузка…' : <><NavIconCamera size={16} /> Фото повреждения</>}
                <input type="file" hidden multiple accept="image/*,video/*" onChange={handlePhotoUpload} disabled={uploading} />
              </label>
            </div>
          )}
          {!vehicleId && selectedArea && (
            <div className="cell-sub" style={{ marginTop: 8 }}>Выберите автомобиль для загрузки фото</div>
          )}
          {selectedEntry?.photo_keys.length ? (
            <div className="asset-list asset-list--grid" style={{ marginTop: 12 }}>
              {selectedEntry.photo_keys.map((key) => (
                <button key={key} type="button" className="asset-thumb" onClick={() => openR2File(key, false)}>
                  <img src={publicR2Url(key)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" className="btn-primary" disabled={!selectedArea} onClick={addEntry} style={{ marginTop: 8 }}>
            {entries.some((e) => e.area === selectedArea) ? 'Обновить запись' : 'Добавить повреждение'}
          </button>
        </div>
      </div>
      {entries.length > 0 && (
        <div className="damage-map-list">
          {entries.map((e, i) => (
            <div
              key={e.area}
              className={`damage-map-item ${selectedArea === e.area ? 'active' : ''}`}
              onClick={() => selectZone(e.area)}
              style={{ cursor: 'pointer' }}
            >
              <div className="damage-map-item-main">
                <span className={`damage-map-num sev-${e.severity}`}>{i + 1}</span>
                <div>
                  <div className="cell-title">{areaLabel(e.area)}</div>
                  <div className="cell-sub">
                    {SEVERITY_LABELS[e.severity]} · {e.notes || '—'}
                    {e.photo_keys.length > 0 && ` · ${e.photo_keys.length} фото`}
                  </div>
                </div>
              </div>
              <span
                className="side-action del"
                onClick={(ev) => { ev.stopPropagation(); removeEntry(e.area); }}
                role="button"
                aria-label="Удалить"
              ><X size={12} strokeWidth={1.75} /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
