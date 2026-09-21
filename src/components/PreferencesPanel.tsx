import { useEffect, useState } from 'react';
import { db } from '../lib/localdb';
import { useToast } from '../contexts/ToastContext';

interface Prefs {
  studio_name: string;
  timezone: string;
  currency: string;
  language: string;
}

const DEFAULTS: Prefs = {
  studio_name: 'Unique Detailing',
  timezone: 'Europe/Moscow',
  currency: 'RUB',
  language: 'ru',
};

export function PreferencesPanel() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.from('studio_settings').select('value').eq('key', 'platform_prefs').single()
      .then(({ data }) => {
        if (data?.value) setPrefs({ ...DEFAULTS, ...(data.value as Prefs) });
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await db.from('studio_settings').upsert({
      key: 'platform_prefs',
      value: prefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    setSaving(false);
    if (error) toast('Ошибка: ' + error.message);
    else toast('Настройки сохранены');
  };

  return (
    <div className="section-block">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Платформа</div>
          <div className="section-title">Общие настройки</div>
        </div>
        <div className="tag add" style={{ cursor: saving ? 'wait' : 'pointer' }} onClick={save}>{saving ? 'Сохранение…' : 'Сохранить'}</div>
      </div>
      <div className="settings-form-grid">
        <label className="field">
          <span className="field-label">Название студии</span>
          <input className="field-input" value={prefs.studio_name} onChange={(e) => setPrefs((p) => ({ ...p, studio_name: e.target.value }))} />
        </label>
        <label className="field">
          <span className="field-label">Часовой пояс</span>
          <select className="field-select" value={prefs.timezone} onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}>
            <option value="Europe/Moscow">Москва (UTC+3)</option>
            <option value="Europe/Samara">Самара (UTC+4)</option>
            <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Валюта</span>
          <select className="field-select" value={prefs.currency} onChange={(e) => setPrefs((p) => ({ ...p, currency: e.target.value }))}>
            <option value="RUB">₽ RUB</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Язык интерфейса</span>
          <select className="field-select" value={prefs.language} onChange={(e) => setPrefs((p) => ({ ...p, language: e.target.value }))}>
            <option value="ru">Русский</option>
          </select>
        </label>
      </div>
      <div className="integration-card" style={{ marginTop: 20 }}>
        <div>
          <div className="integration-name">CDN / публичные ассеты</div>
          <div className="integration-desc">Локальные файлы (браузер)</div>
        </div>
        <div className="tag green"><span className="dot"></span>R2</div>
      </div>
    </div>
  );
}
