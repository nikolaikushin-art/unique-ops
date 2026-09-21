import { useRef, useState } from 'react';
import { ImagePlus, Star, X } from 'lucide-react';

export interface StagedPhoto {
  id: string;
  file: File;
  url: string;
}

/**
 * Photo picker for the "New vehicle" form. The first photo in the list is the
 * cover shown everywhere the car appears; any photo can be promoted with the star.
 */
export function VehiclePhotoPicker({
  items,
  onAdd,
  onRemove,
  onMakeCover,
}: {
  items: StagedPhoto[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMakeCover: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const take = (list: FileList | null) => {
    if (!list?.length) return;
    onAdd(Array.from(list).filter((f) => f.type.startsWith('image/')));
  };

  return (
    <div className="vpicker">
      <div className="vpicker-head">
        <span className="side-field-label">Фото автомобиля</span>
        <span className="vpicker-hint">Первое фото станет обложкой</span>
      </div>

      <div
        className={`vpicker-drop ${drag ? 'is-drag' : ''} ${items.length ? 'has-items' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files); }}
      >
        {items.length === 0 ? (
          <button type="button" className="vpicker-empty" onClick={() => inputRef.current?.click()}>
            <span className="vpicker-empty-icon"><ImagePlus size={22} strokeWidth={1.6} /></span>
            <span className="vpicker-empty-title">Добавить фото</span>
            <span className="vpicker-empty-sub">Перетащите сюда или выберите файлы</span>
          </button>
        ) : (
          <div className="vpicker-grid">
            {items.map((it, i) => (
              <div key={it.id} className={`vpicker-item ${i === 0 ? 'is-cover' : ''}`}>
                <img src={it.url} alt="" draggable={false} />
                {i === 0 && <span className="vpicker-badge">Обложка</span>}
                <div className="vpicker-actions">
                  {i !== 0 && (
                    <button type="button" title="Сделать обложкой" aria-label="Сделать обложкой" onClick={() => onMakeCover(it.id)}>
                      <Star size={14} />
                    </button>
                  )}
                  <button type="button" title="Убрать" aria-label="Убрать фото" onClick={() => onRemove(it.id)}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="vpicker-add" onClick={() => inputRef.current?.click()} aria-label="Добавить ещё фото">
              <ImagePlus size={20} strokeWidth={1.6} />
              <span>Ещё</span>
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { take(e.target.files); e.target.value = ''; }}
        />
      </div>
    </div>
  );
}
