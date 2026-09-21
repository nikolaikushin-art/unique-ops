import { db } from './localdb';

const ELEVATED_KEY = 'uo-elevated-until';
const ELEVATED_TTL_MS = 15 * 60 * 1000;

export function setElevatedSession() {
  sessionStorage.setItem(ELEVATED_KEY, String(Date.now() + ELEVATED_TTL_MS));
}

export function clearElevatedSession() {
  sessionStorage.removeItem(ELEVATED_KEY);
}

export function isElevatedSession(): boolean {
  const until = Number(sessionStorage.getItem(ELEVATED_KEY));
  if (!until) return false;
  if (until <= Date.now()) {
    sessionStorage.removeItem(ELEVATED_KEY);
    return false;
  }
  return true;
}

export function elevatedExpiresIn(): number {
  const until = Number(sessionStorage.getItem(ELEVATED_KEY));
  if (!until) return 0;
  return Math.max(0, until - Date.now());
}

export async function logSecurityEvent(action: string, details: Record<string, unknown> = {}) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  await db.from('security_audit_log').insert({
    user_id: user.id,
    action,
    details,
  });
}
