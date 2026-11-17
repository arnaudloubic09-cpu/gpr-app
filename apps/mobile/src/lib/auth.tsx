import type { AuthTokens, MeResponse } from '@gpr/core';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import {
  api,
  clearTokens,
  hasSession,
  publicPost,
  saveTokens,
  setSessionExpiredHandler,
} from './api';
import { unregisterPush } from './push';
import { storage } from './storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  me: MeResponse | null;
  requestCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  reloadMe(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);

  const reloadMe = useCallback(async () => {
    setMe(await api<MeResponse>('/me'));
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush();
    const refreshToken = await storage.get('gpr.refresh');
    if (refreshToken) {
      await publicPost('/auth/logout', { refreshToken }).catch(() => undefined);
    }
    await clearTokens();
    setMe(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setMe(null);
      setStatus('signedOut');
    });
    (async () => {
      if (!(await hasSession())) return setStatus('signedOut');
      try {
        await reloadMe();
        setStatus('signedIn');
      } catch {
        setStatus('signedOut');
      }
    })();
  }, [reloadMe]);

  const value: AuthContextValue = {
    status,
    me,
    reloadMe,
    signOut,
    async requestCode(email) {
      await publicPost('/auth/otp/request', { email, audience: 'MOBILE' });
    },
    async verifyCode(email, code) {
      const tokens = await publicPost<AuthTokens>('/auth/otp/verify', {
        email,
        code,
        audience: 'MOBILE',
      });
      await saveTokens(tokens);
      await reloadMe();
      setStatus('signedIn');
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
