import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { ViewId } from '../types/database';
import {
  loadDisabledModules,
  saveDisabledModules,
  loadDisabledModulesFromDb,
  saveDisabledModulesToDb,
  isModuleEnabled,
} from '../lib/modules';
import { useAuth } from './AuthContext';

interface ModuleConfigValue {
  disabledModules: ViewId[];
  isEnabled: (id: ViewId) => boolean;
  setModuleEnabled: (id: ViewId, enabled: boolean) => void;
  resetModules: () => void;
  synced: boolean;
}

const ModuleConfigContext = createContext<ModuleConfigValue | null>(null);

export function ModuleConfigProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const [disabledModules, setDisabledModules] = useState<ViewId[]>(() => loadDisabledModules());
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!session) return;
    // studio_settings is source of truth; localStorage is offline cache
    loadDisabledModulesFromDb().then((fromDb) => {
      if (fromDb) {
        setDisabledModules(fromDb);
        saveDisabledModules(fromDb);
      }
      setSynced(true);
    });
  }, [session?.user?.id]);

  useEffect(() => {
    saveDisabledModules(disabledModules);
    if (synced && session) {
      saveDisabledModulesToDb(disabledModules, profile?.id);
    }
  }, [disabledModules, synced, session, profile?.id]);

  const isEnabled = useCallback(
    (id: ViewId) => isModuleEnabled(id, disabledModules),
    [disabledModules]
  );

  const setModuleEnabled = useCallback((id: ViewId, enabled: boolean) => {
    setDisabledModules((prev) => {
      if (enabled) return prev.filter((x) => x !== id);
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  }, []);

  const resetModules = useCallback(() => setDisabledModules([]), []);

  return (
    <ModuleConfigContext.Provider value={{ disabledModules, isEnabled, setModuleEnabled, resetModules, synced }}>
      {children}
    </ModuleConfigContext.Provider>
  );
}

export function useModuleConfig() {
  const ctx = useContext(ModuleConfigContext);
  if (!ctx) throw new Error('useModuleConfig must be used within ModuleConfigProvider');
  return ctx;
}
