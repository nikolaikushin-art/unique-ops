import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useModuleConfig } from '../contexts/ModuleConfigContext';
import { useToast } from '../contexts/ToastContext';
import { isAdmin, canAccessView } from '../lib/permissions';
import { APP_MODULES, moduleTitle } from '../lib/modules';
import { NAV_SECTION_ICONS } from './NavSectionIcons';
import type { ViewId } from '../types/database';

export function ModulesPanel() {
  const { profile } = useAuth();
  const { isEnabled, setModuleEnabled, resetModules, disabledModules } = useModuleConfig();
  const { toast } = useToast();
  const navigate = useNavigate();
  const admin = isAdmin(profile?.role);
  const role = profile?.role;

  const groups = [...new Set(APP_MODULES.map((m) => m.group))];

  const toggle = (id: ViewId, mod: (typeof APP_MODULES)[0]) => {
    if (!admin) return;
    if (mod.required) {
      toast('Этот модуль обязателен и не может быть отключён');
      return;
    }
    const next = !isEnabled(id);
    setModuleEnabled(id, next);
    toast(next ? `${moduleTitle(id)} включён` : `${moduleTitle(id)} скрыт из меню`);
  };

  return (
    <div className="section-block">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Конфигурация</div>
          <div className="section-title">Модули системы</div>
        </div>
        {admin && disabledModules.length > 0 && (
          <div className="tag ghost" onClick={() => { resetModules(); toast('Все модули включены'); }}>
            Включить все
          </div>
        )}
      </div>

      <p className="settings-hint">
        {admin
          ? 'Включайте и отключайте модули для меню навигации. Обзор и Настройки всегда доступны.'
          : 'Список модулей, доступных вашей роли. Нажмите на модуль, чтобы открыть его.'}
      </p>

      {groups.map((group) => {
        const mods = APP_MODULES.filter((m) => m.group === group);
        return (
          <div key={group} className="module-group">
            <div className="module-group-label">{group}</div>
            <div className="module-list">
              {mods.map((mod) => {
                const hasRoleAccess = canAccessView(role, mod.id);
                const enabled = isEnabled(mod.id);
                const visible = hasRoleAccess && enabled;
                const Icon = NAV_SECTION_ICONS[mod.id];
                const canToggle = admin && hasRoleAccess && !mod.required;
                return (
                  <div
                    className={`module-row${visible ? ' module-row--tappable' : ''}`}
                    key={mod.id}
                    onClick={visible ? () => navigate(`/${mod.id}`) : undefined}
                    role={visible ? 'button' : undefined}
                    tabIndex={visible ? 0 : undefined}
                    onKeyDown={visible ? (e) => { if (e.key === 'Enter') navigate(`/${mod.id}`); } : undefined}
                  >
                    <span className="module-row-icon">
                      <Icon size={16} strokeWidth={1.75} />
                    </span>
                    <div className="module-row-main">
                      <div className="module-row-title">
                        {moduleTitle(mod.id)}
                        {mod.required && <span className="module-badge">Обязательный</span>}
                        {!hasRoleAccess && <span className="module-badge muted">Нет доступа по роли</span>}
                        {hasRoleAccess && !enabled && <span className="module-badge muted">Скрыт</span>}
                      </div>
                      <div className="module-row-desc">{mod.description}</div>
                    </div>
                    <div className="module-row-actions" onClick={(e) => e.stopPropagation()}>
                      {canToggle && (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          aria-label={`${enabled ? 'Скрыть' : 'Показать'} ${moduleTitle(mod.id)}`}
                          className={`ios-switch${enabled ? ' is-on' : ''}`}
                          onClick={() => toggle(mod.id, mod)}
                        >
                          <span className="ios-switch-thumb" />
                        </button>
                      )}
                      {visible && <ChevronRight size={16} strokeWidth={1.75} className="module-row-chevron" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

