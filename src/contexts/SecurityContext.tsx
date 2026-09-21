import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { elevatedExpiresIn, isElevatedSession, setElevatedSession, clearElevatedSession } from '../lib/security';

interface SecurityContextValue {
  elevated: boolean;
  elevatedMinutesLeft: number;
  refreshElevated: () => void;
  grantElevated: () => void;
  revokeElevated: () => void;
}

const SecurityContext = createContext<SecurityContextValue | null>(null);

export function SecurityProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [elevated, setElevated] = useState(isElevatedSession);
  const [elevatedMinutesLeft, setElevatedMinutesLeft] = useState(0);

  const refreshElevated = useCallback(() => {
    setElevated(isElevatedSession());
    setElevatedMinutesLeft(Math.ceil(elevatedExpiresIn() / 60000));
  }, []);

  useEffect(() => {
    if (!session) {
      clearElevatedSession();
      setElevated(false);
      setElevatedMinutesLeft(0);
      return;
    }
    refreshElevated();
    const id = window.setInterval(refreshElevated, 30000);
    return () => window.clearInterval(id);
  }, [session, refreshElevated]);

  const grantElevated = useCallback(() => {
    setElevatedSession();
    refreshElevated();
  }, [refreshElevated]);

  const revokeElevated = useCallback(() => {
    clearElevatedSession();
    refreshElevated();
  }, [refreshElevated]);

  return (
    <SecurityContext.Provider value={{ elevated, elevatedMinutesLeft, refreshElevated, grantElevated, revokeElevated }}>
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used within SecurityProvider');
  return ctx;
}
