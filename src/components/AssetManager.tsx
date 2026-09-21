import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isAdmin } from '../lib/permissions';
import {
  FILE_CATEGORIES,
  buildR2Key,
  uploadToR2,
  listAssets,
  saveAssetMetadata,
  openR2File,
  deleteR2Object,
  publicR2Url,
  notifyFilesChanged,
  type AssetRecord,
} from '../lib/r2Storage';
import { NavIconFile, NavIconPlay } from './NavIcons';
import { db } from '../lib/localdb';
import type { FileEntityType } from '../types/database';

type CategoryDef = { id: string; label: string; sensitive?: boolean };

/** Accepted MIME types for media uploads (photos + videos + common docs). */
export const ASSET_ACCEPT = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx';

interface AssetManagerProps {
  entityType: FileEntityType;
  entityId: string;
  categories?: CategoryDef[];
  bookingId?: string | null;
  compact?: boolean;
  title?: string;
}

export function AssetManager({
  entityType,
  entityId,
  categories,
  bookingId,
  compact,
  title,
}: AssetManagerProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const admin = isAdmin(profile?.role);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

  const cats: CategoryDef[] = categories ?? (
    ((FILE_CATEGORIES[entityType as keyof typeof FILE_CATEGORIES] ?? []) as unknown as CategoryDef[]).map((c) => ({ ...c }))
  );
  if (!cats.length) cats.push({ id: 'general', label: 'Общие', sensitive: false });

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const data = await listAssets(entityType, entityId);
      setAssets(data);
    } catch (e) {
      toast('Ошибка загрузки файлов: ' + (e as Error).message);
    }
    setLoading(false);
  }, [entityType, entityId, toast]);

  useEffect(() => {
    load();
    if (!category && cats.length) setCategory(cats[0].id);
  }, [load, cats.length]);

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    return !q || a.file_name.toLowerCase().includes(q) || (a.title ?? '').toLowerCase().includes(q);
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length || !category) return;
    const catDef = cats.find((c) => c.id === category);
    const sensitive = catDef?.sensitive ?? false;
    if (sensitive && !admin) {
      toast('Загрузка HR-документов доступна только администраторам');
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const key = buildR2Key(entityType, entityId, category, file.name, sensitive);
        await uploadToR2(file, key);
        await saveAssetMetadata({
          entity_type: entityType,
          entity_id: entityId,
          category,
          r2_key: key,
          bucket_path: key,
          file_name: file.name,
          file_type: file.type || null,
          file_size: file.size,
          is_sensitive: sensitive,
          booking_id: bookingId ?? null,
          title: file.name,
          uploaded_by: profile?.id ?? null,
        });
      }
      toast('Файл сохранён локально');
      await load();
    } catch (err) {
      toast('Ошибка загрузки: ' + (err as Error).message);
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleOpen = async (a: AssetRecord) => {
    const key = a.r2_key || a.bucket_path;
    if (!key) return;
    try {
      await openR2File(key, a.is_sensitive);
    } catch (e) {
      toast('Ошибка открытия: ' + (e as Error).message);
    }
  };

  const handleDelete = async (a: AssetRecord) => {
    if (!admin) { toast('Удаление доступно администраторам'); return; }
    if (!confirm(`Удалить «${a.file_name}»?`)) return;
    const key = a.r2_key || a.bucket_path;
    try {
      if (key) await deleteR2Object(key);
      await db.from('files').delete().eq('id', a.id);
      notifyFilesChanged();
      toast('Файл удалён');
      await load();
    } catch (e) {
      toast('Ошибка удаления: ' + (e as Error).message);
    }
  };

  const isImage = (a: AssetRecord) => (a.file_type ?? '').startsWith('image/');

  /** The car's cover: the starred photo, otherwise the first (oldest) presentable photo. */
  const coverId = (() => {
    if (entityType !== 'vehicle') return null;
    const imgs = assets.filter((a) => isImage(a) && !a.is_sensitive);
    if (!imgs.length) return null;
    const starred = imgs.find((a) => a.is_cover);
    if (starred) return starred.id;
    const oldest = [...imgs].reverse().find((a) => !['damage', 'inspection'].includes(a.category)) ?? imgs[imgs.length - 1];
    return oldest.id;
  })();

  const makeCover = async (a: AssetRecord) => {
    try {
      await db.from('files').update({ is_cover: false }).eq('entity_type', 'vehicle').eq('entity_id', entityId);
      await db.from('files').update({ is_cover: true }).eq('id', a.id);
      notifyFilesChanged();
      toast('Обложка обновлена');
      await load();
    } catch (err) {
      toast('Не удалось сменить обложку: ' + (err as Error).message);
    }
  };
  const isVideo = (a: AssetRecord) => (a.file_type ?? '').startsWith('video/');

  return (
    <div className={`asset-manager ${compact ? 'asset-manager--compact' : ''}`}>
      {title && <div className="side-field-label" style={{ marginBottom: 8 }}>{title}</div>}
      {!compact && (
        <div className="asset-manager-toolbar">
          <select className="field-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.label}{c.sensitive ? ' · защищено' : ''}</option>
            ))}
          </select>
          <input className="search-input" placeholder="Поиск файлов..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <label className={`tag add ${uploading ? 'disabled' : ''}`} style={{ cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? 'Загрузка…' : '+ Загрузить'}
            <input type="file" hidden multiple onChange={handleUpload} accept={ASSET_ACCEPT} disabled={uploading} />
          </label>
        </div>
      )}
      {compact && (
        <div className="asset-manager-toolbar asset-manager-toolbar--compact">
          <select className="field-select" value={category} onChange={(e) => setCategory(e.target.value)} style={{ fontSize: 11 }}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <label className="tag add" style={{ cursor: uploading ? 'wait' : 'pointer', fontSize: 11 }}>
            {uploading ? '…' : '+ Файл'}
            <input type="file" hidden multiple onChange={handleUpload} accept={ASSET_ACCEPT} disabled={uploading} />
          </label>
        </div>
      )}
      {loading ? (
        <div className="empty-state" style={{ padding: compact ? 8 : 16 }}>Загрузка…</div>
      ) : filtered.length ? (
        <div className={`asset-list ${isImage(filtered[0]) || filtered.some(isImage) ? 'asset-list--grid' : ''}`}>
          {filtered.map((a) => {
            const key = a.r2_key || a.bucket_path;
            const thumb = !a.is_sensitive && isImage(a) && key ? publicR2Url(key) : null;
            const catLabel = cats.find((c) => c.id === a.category)?.label ?? a.category;
            return (
              <div key={a.id} className="asset-item">
                {thumb ? (
                  <button type="button" className="asset-thumb" onClick={() => handleOpen(a)}>
                    <img src={thumb} alt="" loading="lazy" />
                    {coverId === a.id && <span className="asset-cover-badge" title="Обложка">★</span>}
                  </button>
                ) : (
                  <button type="button" className="asset-icon" onClick={() => handleOpen(a)}>
                    {isVideo(a) ? <NavIconPlay size={20} /> : <NavIconFile size={20} />}
                  </button>
                )}
                <div className="asset-meta">
                  <div className="asset-name" title={a.file_name}>{a.file_name}</div>
                  <div className="asset-sub">{catLabel} · {new Date(a.created_at).toLocaleDateString('ru-RU')}</div>
                </div>
                <div className="asset-actions">
                  <span className="side-action edit" onClick={() => handleOpen(a)}>Открыть</span>
                  {entityType === 'vehicle' && isImage(a) && !a.is_sensitive && coverId !== a.id && (
                    <span className="side-action edit" onClick={() => makeCover(a)}>★ Обложка</span>
                  )}
                  {admin && <span className="side-action del" onClick={() => handleDelete(a)}><X size={12} strokeWidth={1.75} /></span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state" style={{ padding: compact ? 8 : 16 }}>
          {compact ? 'Нет файлов' : 'Файлов нет. Загрузите документы — они сохраняются локально в браузере.'}
        </div>
      )}
    </div>
  );
}

/** System library entity for central document management */
export const LIBRARY_ENTITY_ID = '00000000-0000-0000-0000-000000000001';
