import { db } from './localdb';
import type { FileEntityType } from '../types/database';

export const FILE_CATEGORIES = {
  staff: [
    { id: 'passport', label: 'Паспорт', sensitive: true },
    { id: 'id_document', label: 'Удостоверение', sensitive: true },
    { id: 'contract', label: 'Трудовой договор', sensitive: true },
    { id: 'certification', label: 'Сертификат', sensitive: false },
    { id: 'training', label: 'Обучение', sensitive: false },
    { id: 'license', label: 'Лицензия', sensitive: false },
    { id: 'invoice', label: 'Счета / оплата', sensitive: true },
    { id: 'payment', label: 'Платёжные документы', sensitive: true },
    { id: 'performance', label: 'Оценка / KPI', sensitive: true },
    { id: 'personal', label: 'Личный документ', sensitive: true },
  ],
  vehicle: [
    { id: 'cover', label: 'Фото автомобиля', sensitive: false },
    { id: 'before_photo', label: 'Фото до', sensitive: false },
    { id: 'after_photo', label: 'Фото после', sensitive: false },
    { id: 'before_video', label: 'Видео до', sensitive: false },
    { id: 'after_video', label: 'Видео после', sensitive: false },
    { id: 'inspection', label: 'Осмотр', sensitive: false },
    { id: 'damage', label: 'Повреждения', sensitive: false },
    { id: 'video', label: 'Видео', sensitive: false },
    { id: 'completed_work', label: 'Выполненные работы', sensitive: false },
  ],
  customer: [
    { id: 'brochure', label: 'Брошюра', sensitive: false },
    { id: 'catalogue', label: 'Каталог услуг', sensitive: false },
    { id: 'pricing', label: 'Прайс', sensitive: false },
    { id: 'presentation', label: 'Презентация', sensitive: false },
    { id: 'marketing', label: 'Маркетинг', sensitive: false },
  ],
  product: [
    { id: 'product_image', label: 'Фото продукта', sensitive: false },
    { id: 'sds', label: 'Паспорт безопасности (SDS)', sensitive: false },
    { id: 'certificate', label: 'Сертификат', sensitive: false },
    { id: 'invoice', label: 'Счёт поставщика', sensitive: true },
    { id: 'brochure', label: 'Брошюра', sensitive: false },
    { id: 'safety', label: 'Безопасность (SDS)', sensitive: false },
    { id: 'technical', label: 'Тех. документация', sensitive: false },
  ],
  service: [
    { id: 'brochure', label: 'Брошюра услуги', sensitive: false },
    { id: 'before_after', label: 'До / после', sensitive: false },
    { id: 'process', label: 'Процесс работы', sensitive: false },
    { id: 'pricing', label: 'Прайс-лист', sensitive: false },
    { id: 'certificate', label: 'Сертификат', sensitive: false },
    { id: 'technical', label: 'Тех. описание', sensitive: false },
  ],
  library: [
    { id: 'sop', label: 'SOP', sensitive: false },
    { id: 'training', label: 'Обучение', sensitive: false },
    { id: 'safety', label: 'Безопасность', sensitive: false },
    { id: 'brochure', label: 'Брошюры', sensitive: false },
    { id: 'catalogue', label: 'Каталоги', sensitive: false },
    { id: 'supplier', label: 'Поставщики', sensitive: false },
  ],
  booking: [
    { id: 'contract', label: 'Договор / согласие', sensitive: false },
    { id: 'estimate', label: 'Смета / оценка', sensitive: false },
    { id: 'payment', label: 'Платёжные документы', sensitive: true },
    { id: 'before_photo', label: 'Фото до', sensitive: false },
    { id: 'after_photo', label: 'Фото после', sensitive: false },
    { id: 'inspection', label: 'Осмотр', sensitive: false },
    { id: 'handover', label: 'Документы выдачи', sensitive: false },
    { id: 'general', label: 'Прочие', sensitive: false },
  ],
  invoice: [
    { id: 'invoice_pdf', label: 'Счёт / PDF', sensitive: false },
    { id: 'payment_proof', label: 'Подтверждение оплаты', sensitive: true },
    { id: 'act', label: 'Акт выполненных работ', sensitive: false },
    { id: 'contract', label: 'Договор', sensitive: false },
    { id: 'general', label: 'Прочие', sensitive: false },
  ],
  lead: [
    { id: 'inquiry', label: 'Запрос клиента', sensitive: false },
    { id: 'quote', label: 'Коммерческое предложение', sensitive: false },
    { id: 'photo', label: 'Фото автомобиля', sensitive: false },
    { id: 'correspondence', label: 'Переписка', sensitive: false },
    { id: 'general', label: 'Прочие', sensitive: false },
  ],
} as const;

export function buildR2Key(
  entityType: FileEntityType,
  entityId: string,
  category: string,
  fileName: string,
  sensitive = false
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const prefix = sensitive ? 'secure' : 'operations';
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}/${entityType}/${entityId}/${category}/${date}_${Date.now()}_${safeName}`;
}

/* ------------------------------------------------------------------
 * FILE STORAGE PROVIDER — same exported names as before (initLocalFiles,
 * uploadToR2, presignR2Download, deleteR2Object, publicR2Url, openR2File)
 * so all 17 call sites across the app keep working unchanged. What runs
 * behind them now depends on VITE_STORAGE_PROVIDER:
 *   - unset / 'local'  → browser IndexedDB (original demo behaviour)
 *   - 'yandex'         → real Yandex Object Storage via presigned URLs
 *                         (see src/lib/storage/yandexFileStorage.ts and
 *                         functions/storage-presign)
 * ------------------------------------------------------------------ */
import * as localProvider from './storage/localFileStorage';
import * as yandexProvider from './storage/yandexFileStorage';

const provider = import.meta.env.VITE_STORAGE_PROVIDER === 'yandex' ? yandexProvider : localProvider;

/** Call once before the app renders (local provider preloads its blob-URL cache; a no-op on the real backend). */
export async function initLocalFiles() {
  return provider.init();
}

export async function presignR2Download(key: string) {
  return provider.presignDownload(key);
}

export async function deleteR2Object(key: string) {
  return provider.deleteObject(key);
}

export async function uploadToR2(
  file: File,
  key: string
): Promise<{ key: string; publicUrl: string | null }> {
  return provider.upload(file, key);
}

export function publicR2Url(key: string): string {
  return provider.publicUrl(key);
}

export async function openR2File(r2Key: string, isSensitive: boolean) {
  return provider.openFile(r2Key, isSensitive);
}

export interface AssetRecord {
  id: string;
  entity_type: FileEntityType;
  entity_id: string;
  category: string;
  r2_key: string | null;
  bucket_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  is_sensitive: boolean;
  booking_id: string | null;
  title: string | null;
  created_at: string;
  is_cover?: boolean | null;
}

/** Tell listeners (e.g. vehicle cover thumbnails) that the file list changed. */
export function notifyFilesChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('uo:files-changed'));
}

export async function saveAssetMetadata(row: Omit<AssetRecord, 'id' | 'created_at'> & { uploaded_by?: string | null }) {
  const { data, error } = await db.from('files').insert({
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    category: row.category,
    r2_key: row.r2_key,
    bucket_path: row.r2_key || row.bucket_path,
    file_name: row.file_name,
    file_type: row.file_type,
    file_size: row.file_size,
    storage_provider: 'local',
    is_sensitive: row.is_sensitive,
    booking_id: row.booking_id,
    title: row.title,
    is_cover: row.is_cover ?? false,
    uploaded_by: row.uploaded_by ?? null,
  }).select('id').single();
  if (error) throw new Error(error.message);
  notifyFilesChanged();
  return data.id as string;
}

export async function listAssets(entityType: FileEntityType, entityId: string, category?: string) {
  let q = db.from('files').select('*').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: false });
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AssetRecord[];
}
