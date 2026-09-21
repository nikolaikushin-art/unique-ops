import { useEffect, useState } from 'react';
import { db, type Row } from '../lib/localdb';
import { ROLE_LABELS } from '../lib/constants';
import type { UserRole } from '../types/database';

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ['Все модули', 'Управление пользователями', 'HR-документы', 'Финансы', 'Аудит', 'Настройки системы'],
  studio_owner: ['Все операции', 'Управление пользователями', 'HR-документы', 'Финансы', 'Настройки'],
  reception: ['Клиенты', 'Заказы', 'Лиды', 'Автомобили', 'Коммуникации', 'Документы (общие)'],
  detailer: ['Заказы', 'Осмотры', 'Автомобили', 'Фото/видео работ'],
  accountant: ['Финансы', 'Счета', 'Клиенты (просмотр)', 'Отчёты'],
};

export function RolesPanel() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    db.from('profiles').select('role').then(({ data }) => {
      const c: Record<string, number> = {};
      (data ?? []).forEach((p: Row) => { c[p.role] = (c[p.role] ?? 0) + 1; });
      setCounts(c);
    });
  }, []);

  return (
    <div className="section-block">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Безопасность</div>
          <div className="section-title">Роли и права доступа</div>
        </div>
      </div>
      <p className="page-sub" style={{ marginBottom: 20 }}>
        Права назначаются через роль пользователя. HR-документы сотрудников и управление пользователями доступны только администраторам.
        Доступ к модулям ограничивается ролью пользователя.
      </p>
      {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
        <div className="integration-card" key={role}>
          <div>
            <div className="integration-name">{ROLE_LABELS[role]}</div>
            <div className="integration-desc">
              {ROLE_PERMISSIONS[role].join(' · ')}
            </div>
          </div>
          <div className="tag ghost">{counts[role] ?? 0} польз.</div>
        </div>
      ))}
      <div className="integration-card" style={{ marginTop: 12 }}>
        <div>
          <div className="integration-name">Чувствительные документы (HR)</div>
          <div className="integration-desc">
            Паспорта, договоры, личные документы хранятся в R2 с префиксом secure/. Доступ только super_admin и studio_owner через подписанные URL.
          </div>
        </div>
        <div className="tag green"><span className="dot"></span>Защищено</div>
      </div>
    </div>
  );
}
