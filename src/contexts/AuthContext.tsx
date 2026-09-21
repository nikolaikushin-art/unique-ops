import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
/* Minimal local auth types (no external auth library) */
type User = { id: string; email?: string | null; [key: string]: unknown };
type Session = { access_token?: string; user: User };
type Factor = { id: string; status?: string; friendly_name?: string; factor_type?: string };
import { formatAuthError } from '../lib/authErrors';
import { db } from '../lib/localdb';
import { isStaff } from '../lib/permissions';
import { clearElevatedSession } from '../lib/security';
import { clearConfirmedSessions } from '../lib/consents';
import type { Profile, UserRole } from '../types/database';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  needsMfa: boolean;
  needsVerification: boolean;
  needsPasswordChange: boolean;
  mfaFactors: Factor[];
  signIn: (email: string, password: string) => Promise<{ error: string | null; needsMfa?: boolean; needsVerification?: boolean; needsPasswordChange?: boolean }>;
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  verifyPassword: (password: string) => Promise<{ error: string | null }>;
  verifyAccount: (code: string) => Promise<{ error: string | null; needsPasswordChange?: boolean }>;
  clearMustChangePassword: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshMfa: () => Promise<void>;
  verifyMfa: (code: string) => Promise<{ error: string | null }>;
  enrollMfa: () => Promise<{ data: { factorId: string; qrCode: string; secret: string } | null; error: string | null }>;
  confirmMfaEnrollment: (factorId: string, code: string) => Promise<{ error: string | null }>;
  unenrollMfa: (factorId: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_COLUMNS =
  'id, email, full_name, role, phone, avatar_url, is_active, invited_at, verified_at, must_change_password, created_at, updated_at';

function needsVerificationCheck(p: Profile | null): boolean {
  return !!(p?.invited_at && !p?.verified_at);
}

function needsPasswordChangeCheck(p: Profile | null): boolean {
  return !!p?.must_change_password;
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await db.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single();
  if (error || !data) return null;
  return data as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaFactors, setMfaFactors] = useState<Factor[]>([]);

  const refreshMfa = useCallback(async () => {
    try {
      const { data: aal, error: aalErr } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalErr || !aal) {
        setNeedsMfa(false);
        return;
      }
      setNeedsMfa(aal.currentLevel !== 'aal2' && aal.nextLevel === 'aal2');

      const { data: factors, error: factorErr } = await db.auth.mfa.listFactors();
      if (!factorErr && factors?.totp) {
        setMfaFactors(factors.totp);
      }
    } catch {
      setNeedsMfa(false);
    }
  }, []);

  const applyProfile = useCallback(async (userId: string) => {
    const p = await loadProfile(userId);
    if (p && !p.is_active) {
      await db.auth.signOut();
      setProfile(null);
      return null;
    }
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    db.auth.getSession().then(async ({ data: { session: s } }: { data: { session: Session | null } }) => {
      setSession(s);
      try {
        if (s?.user) await applyProfile(s.user.id);
        if (s) await refreshMfa();
      } finally {
        setLoading(false);
      }
    }).catch(() => setLoading(false));

    // IMPORTANT: never await other db calls inside this callback
    // holds an auth lock while it runs, so awaiting profile/MFA queries here deadlocks
    // signInWithPassword() (login button stuck on "Вход..."). Defer the work instead.
    const { data: { subscription } } = db.auth.onAuthStateChange((_event: string, s: Session | null) => {
      setSession(s);
      setTimeout(async () => {
        try {
          if (s?.user) await applyProfile(s.user.id);
          else setProfile(null);
          if (s) await refreshMfa();
          else {
            setNeedsMfa(false);
            setMfaFactors([]);
          }
        } catch (e) {
          console.error('Auth state sync failed', e);
        }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [applyProfile, refreshMfa]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) return { error: formatAuthError(error) };

    const p = data.user ? await loadProfile(data.user.id) : null;
    if (!p) return { error: 'Профиль не найден. Обратитесь к администратору.' };
    if (!p.is_active) {
      await db.auth.signOut();
      setProfile(null);
      return { error: 'Аккаунт отключён. Обратитесь к администратору.' };
    }
    if (!isStaff(p.role)) {
      await db.auth.signOut();
      setProfile(null);
      return { error: 'Доступ только для сотрудников студии.' };
    }
    setProfile(p);
    clearConfirmedSessions(); // every fresh login shows the terms again
    await refreshMfa();
    const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    const mfaRequired = aal?.currentLevel !== 'aal2' && aal?.nextLevel === 'aal2';
    return {
      error: null,
      needsMfa: mfaRequired,
      needsVerification: needsVerificationCheck(p),
      needsPasswordChange: needsPasswordChangeCheck(p),
    };
  };

  const signUp = async (email: string, password: string, fullName: string, role: UserRole = 'reception') => {
    const { error } = await db.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    clearElevatedSession();
    await db.auth.signOut();
    setSession(null);
    setProfile(null);
    setNeedsMfa(false);
    setMfaFactors([]);
  };

  const resetPassword = async (email: string) => {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await db.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  const verifyPassword = async (password: string) => {
    const email = profile?.email ?? session?.user?.email;
    if (!email) return { error: 'Сессия не найдена' };
    const { error } = await db.auth.signInWithPassword({ email, password });
    return { error: error ? 'Неверный пароль' : null };
  };

  const verifyMfa = async (code: string) => {
    const factor = mfaFactors.find((f) => f.status === 'verified') ?? mfaFactors[0];
    if (!factor) return { error: '2FA не настроена' };

    const { data: challenge, error: challengeErr } = await db.auth.mfa.challenge({ factorId: factor.id });
    if (challengeErr || !challenge) return { error: challengeErr?.message ?? 'Ошибка проверки 2FA' };

    const { error } = await db.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (error) return { error: error.message };
    await refreshMfa();
    return { error: null };
  };

  const enrollMfa = async () => {
    const { data, error } = await db.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Unique Operations',
    });
    if (error || !data?.totp) return { data: null, error: error?.message ?? 'Ошибка настройки 2FA' };
    return {
      data: {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      },
      error: null,
    };
  };

  const confirmMfaEnrollment = async (factorId: string, code: string) => {
    const { data: challenge, error: challengeErr } = await db.auth.mfa.challenge({ factorId });
    if (challengeErr || !challenge) return { error: challengeErr?.message ?? 'Ошибка подтверждения' };

    const { error } = await db.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (error) return { error: error.message };
    await refreshMfa();
    return { error: null };
  };

  const unenrollMfa = async (factorId: string) => {
    const { error } = await db.auth.mfa.unenroll({ factorId });
    if (error) return { error: error.message };
    await refreshMfa();
    return { error: null };
  };

  const verifyAccount = async (code: string) => {
    const { error } = await db.rpc('verify_account_code', { p_code: code.trim() });
    if (error) return { error: error.message, needsPasswordChange: false };
    const p = session?.user?.id ? await applyProfile(session.user.id) : null;
    return { error: null, needsPasswordChange: needsPasswordChangeCheck(p) };
  };

  const clearMustChangePassword = async () => {
    if (!session?.user?.id) return;
    await db.from('profiles').update({ must_change_password: false }).eq('id', session.user.id);
    await applyProfile(session.user.id);
  };

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) await applyProfile(session.user.id);
  }, [session, applyProfile]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        needsMfa,
        needsVerification: needsVerificationCheck(profile),
        needsPasswordChange: needsPasswordChangeCheck(profile),
        mfaFactors,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
        verifyPassword,
        verifyAccount,
        clearMustChangePassword,
        refreshProfile,
        refreshMfa,
        verifyMfa,
        enrollMfa,
        confirmMfaEnrollment,
        unenrollMfa,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
