import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin } from '../lib/permissions';
import { FILE_CATEGORIES, openR2File } from '../lib/r2Storage';
import { db } from '../lib/localdb';
import { AssetManager, LIBRARY_ENTITY_ID } from '../components/AssetManager';
import { ATTACHMENT_ENTITIES } from '../lib/attachmentEntities';
import type { FileRecord } from '../types/database';

const DOC_CATEGORIES = FILE_CATEGORIES.library.map((c) => ({ ...c }));

export function DocumentsPage() {
  const { profile } = useAuth();
  const admin = isAdmin(profile?.role);
  const [view, setView] = useState<'library' | 'search' | 'assign'>('library');
  const [assignType, setAssignType] = useState<'staff' | 'vehicle' | 'product' | 'customer' | 'booking' | 'service' | 'invoice' | 'lead'>('staff');
  const [assignId, setAssignId] = useState('');
  const [fileSearch, setFileSearch] = useState('');
  const [allFiles, setAllFiles] = useState<FileRecord[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  useEffect(() => {
    if (view !== 'search') return;
    setLoadingFiles(true);
    let q = db.from('files').select('*').order('created_at', { ascending: false }).limit(100);
    if (fileSearch.trim()) q = q.ilike('file_name', `%${fileSearch.trim()}%`);
    q.then(({ data }) => {
      setAllFiles((data as FileRecord[]) ?? []);
      setLoadingFiles(false);
    });
  }, [view, fileSearch]);

  return (
    <div className="documents-page">
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>Управление документами</div>
          <h1 className="page-title">Центр документов</h1>
          <p className="page-sub">
            Корпоративная библиотека, SOP, брошюры и маркетинговые материалы. Все файлы хранятся локально в браузере.
          </p>
        </div>
      </div>

      <div className="filter-row tab-scroll" style={{ padding: 0, marginBottom: 28 }}>
        <div className={`filter-pill ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}>Библиотека студии</div>
        <div className={`filter-pill ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}>Поиск по файлам</div>
        <div className={`filter-pill ${view === 'assign' ? 'active' : ''}`} onClick={() => setView('assign')}>Привязка к сущностям</div>
      </div>

      {view === 'library' && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <div className="section-eyebrow">R2 · operations/library</div>
              <div className="section-title">Корпоративные документы</div>
            </div>
          </div>
          <p className="page-sub" style={{ marginBottom: 16 }}>
            Загружайте брошюры, каталоги услуг, прайсы, презентации и технические спецификации. Документы можно отправлять клиентам из карточки клиента.
          </p>
          <AssetManager
            entityType="customer"
            entityId={LIBRARY_ENTITY_ID}
            categories={DOC_CATEGORIES}
          />
        </div>
      )}

      {view === 'search' && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <div className="section-eyebrow">Глобальный поиск</div>
              <div className="section-title">Все файлы в системе</div>
            </div>
          </div>
          <input
            className="search-input"
            placeholder="Поиск по имени файла..."
            value={fileSearch}
            onChange={(e) => setFileSearch(e.target.value)}
            style={{ marginBottom: 20, maxWidth: 480 }}
          />
          {loadingFiles && <div className="empty-state">Загрузка...</div>}
          {!loadingFiles && allFiles.map((f) => (
            <div className="integration-card" key={f.id}>
              <div>
                <div className="integration-name">{f.file_name}</div>
                <div className="integration-desc">
                  {f.entity_type} · {f.category || '—'} · {f.file_size ? `${(f.file_size / 1024).toFixed(1)} KB` : '—'} · {new Date(f.created_at).toLocaleString('ru-RU')}
                </div>
              </div>
              <div className="tag ghost" style={{ cursor: 'pointer' }} onClick={() => openR2File(f.r2_key ?? f.bucket_path, f.is_sensitive)}>Просмотр</div>
            </div>
          ))}
          {!loadingFiles && !allFiles.length && <div className="empty-state">Файлы не найдены</div>}
        </div>
      )}

      {view === 'assign' && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <div className="section-eyebrow">Поиск и привязка</div>
              <div className="section-title">Документы по сущностям</div>
            </div>
          </div>
          <p className="page-sub" style={{ marginBottom: 16 }}>
            Просмотр и загрузка файлов, привязанных к записям в системе. Введите UUID сущности или выберите тип и ID из соответствующего раздела.
          </p>
          <div className="asset-manager-toolbar" style={{ marginBottom: 16 }}>
            <select className="field-select" value={assignType} onChange={(e) => { setAssignType(e.target.value as typeof assignType); setAssignId(''); }}>
              {ATTACHMENT_ENTITIES.map((e) => (
                <option key={e.type} value={e.type}>{e.label}</option>
              ))}
            </select>
            <input
              className="field-input"
              placeholder="UUID сущности"
              value={assignId}
              onChange={(e) => setAssignId(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          {assignId && (
            <AssetManager
              entityType={assignType}
              entityId={assignId}
              categories={ATTACHMENT_ENTITIES.find((e) => e.type === assignType)?.categories() ?? []}
              bookingId={assignType === 'booking' ? assignId : null}
            />
          )}
          {!assignId && <div className="empty-state">Введите ID сущности для просмотра привязанных файлов</div>}
        </div>
      )}

      {admin && (
        <div className="integration-card" style={{ marginTop: 24 }}>
          <div>
            <div className="integration-name">Безопасность документов</div>
            <div className="integration-desc">
              HR-документы (паспорт, договор) — префикс secure/, доступ только администраторам через подписанные URL.
              Операционные фото и брошюры — хранятся локально в браузере.
            </div>
          </div>
          <div className="tag green"><span className="dot"></span>R2 + RLS</div>
        </div>
      )}
    </div>
  );
}
