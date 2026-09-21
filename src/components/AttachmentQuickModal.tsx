import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { AssetManager } from './AssetManager';
import { useAuth } from '../contexts/AuthContext';
import { getAccessibleAttachmentEntities, type AttachmentEntityConfig } from '../lib/attachmentEntities';
import { db } from '../lib/localdb';
import type { FileEntityType } from '../types/database';

interface AttachmentQuickModalProps {
  open: boolean;
  onClose: () => void;
}

export function AttachmentQuickModal({ open, onClose }: AttachmentQuickModalProps) {
  const { profile } = useAuth();
  const entities = getAccessibleAttachmentEntities(profile?.role);
  const [entityType, setEntityType] = useState<FileEntityType>('booking');
  const [entityId, setEntityId] = useState('');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const config = entities.find((e) => e.type === entityType) ?? entities[0];

  useEffect(() => {
    if (!open) return;
    if (entities.length && !entities.some((e) => e.type === entityType)) {
      setEntityType(entities[0].type);
      setEntityId('');
    }
  }, [open, entities, entityType]);

  const loadOptions = useCallback(async (cfg: AttachmentEntityConfig, q: string) => {
    setLoading(true);
    try {
      let query = db.from(cfg.table).select(cfg.select).order(cfg.orderBy, { ascending: false }).limit(80);
      if (q.trim()) {
        if (cfg.type === 'customer' || cfg.type === 'staff' || cfg.type === 'service') {
          query = query.ilike('full_name', `%${q.trim()}%`);
        } else if (cfg.type === 'vehicle') {
          query = query.or(`brand.ilike.%${q.trim()}%,model.ilike.%${q.trim()}%,registration_number.ilike.%${q.trim()}%`);
        } else if (cfg.type === 'lead') {
          query = query.or(`full_name.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%,car_brand.ilike.%${q.trim()}%`);
        } else if (cfg.type === 'product') {
          query = query.ilike('name', `%${q.trim()}%`);
        } else if (cfg.type === 'invoice') {
          query = query.ilike('invoice_number', `%${q.trim()}%`);
        }
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      setOptions(
        rows.map((row) => ({
          id: String(row.id),
          label: cfg.formatLabel(row),
        })),
      );
    } catch {
      setOptions([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open || !config) return;
    loadOptions(config, search);
  }, [open, config, search, loadOptions]);

  const handleTypeChange = (type: FileEntityType) => {
    setEntityType(type);
    setEntityId('');
    setSearch('');
  };

  if (!entities.length) return null;

  return (
    <Modal open={open} title="Прикрепить документ" onClose={onClose} onSave={onClose} saveLabel="Готово">
      <p className="page-sub" style={{ marginBottom: 16 }}>
        Выберите сущность и загрузите файлы (хранятся локально в браузере). Документы привязываются к записи в системе.
      </p>
      <div className="field-row2">
        <div>
          <label className="field-label" htmlFor="attach-type">Тип</label>
          <select
            id="attach-type"
            className="field-select"
            value={entityType}
            onChange={(e) => handleTypeChange(e.target.value as FileEntityType)}
          >
            {entities.map((e) => (
              <option key={e.type} value={e.type}>{e.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="attach-search">Поиск</label>
          <input
            id="attach-search"
            className="field-input"
            placeholder="Найти запись..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="field-label" htmlFor="attach-entity">Запись</label>
        <select
          id="attach-entity"
          className="field-select"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
        >
          <option value="">{loading ? 'Загрузка…' : '— выберите —'}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>
      {entityId && config ? (
        <div className="modal-asset-section" style={{ marginTop: 16 }}>
          <AssetManager
            entityType={config.type}
            entityId={entityId}
            categories={config.categories()}
            bookingId={config.bookingId?.(entityId) ?? null}
            compact
            title="Файлы (R2)"
          />
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '16px 0', fontSize: 12 }}>
          Выберите запись, чтобы загрузить документы
        </div>
      )}
    </Modal>
  );
}
