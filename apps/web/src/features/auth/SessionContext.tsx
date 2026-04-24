'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { SafeUser } from '@webapp/types';
import { logout as apiLogout, me as apiMe } from '@/lib/api/auth';
import type { ApiCallError } from '@/lib/api/client';
import { getApiBaseUrl } from '@/lib/api/env';

const PUBLIC_PATHS = new Set<string>(['/login', '/register']);

function isPublic(pathname: string | null): boolean {
  if (!pathname) return false;
  if (PUBLIC_PATHS.has(pathname)) return true;
  return false;
}

function isSafeNext(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  return true;
}

type SessionState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'authenticated'; user: SafeUser }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

interface SessionContextValue {
  state: SessionState;
  user: SafeUser | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  loggingOut: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const apiConfigured = !!getApiBaseUrl();

  const [state, setState] = useState<SessionState>(() =>
    apiConfigured ? { status: 'loading' } : { status: 'guest' },
  );
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!apiConfigured) {
        setState({ status: 'guest' });
        return;
      }
      setState((prev) => (prev.status === 'authenticated' ? prev : { status: 'loading' }));
      try {
        const user = await apiMe(signal);
        if (signal?.aborted) return;
        setState({ status: 'authenticated', user });
      } catch (err) {
        if (signal?.aborted) return;
        const e = err as ApiCallError | undefined;
        if (e?.code === 'unauthenticated' || e?.status === 401) {
          setState({ status: 'unauthenticated' });
          return;
        }
        setState({ status: 'error', message: e?.message ?? 'Unable to verify session' });
      }
    },
    [apiConfigured],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (state.status !== 'unauthenticated') return;
    if (isPublic(pathname)) return;
    const nextParam = pathname && pathname !== '/' ? pathname : null;
    const target = nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : '/login';
    router.replace(target);
  }, [state.status, pathname, router]);

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    if (!isPublic(pathname)) return;
    const next = searchParams?.get('next');
    router.replace(isSafeNext(next) ? next : '/');
  }, [state.status, pathname, router, searchParams]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const logout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiLogout();
      setState({ status: 'unauthenticated' });
      router.replace('/login');
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut, router]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      user: state.status === 'authenticated' ? state.user : null,
      refresh,
      logout,
      loggingOut,
    }),
    [state, refresh, logout, loggingOut],
  );

  return (
    <SessionContext.Provider value={value}>
      <SessionGate state={state} pathname={pathname} onRetry={refresh}>
        {children}
      </SessionGate>
    </SessionContext.Provider>
  );
}

function SessionGate({
  state,
  pathname,
  children,
  onRetry,
}: {
  state: SessionState;
  pathname: string | null;
  children: ReactNode;
  onRetry: () => void;
}) {
  if (state.status === 'guest') return <>{children}</>;
  if (isPublic(pathname)) return <>{children}</>;
  if (state.status === 'authenticated') return <>{children}</>;
  if (state.status === 'loading' || state.status === 'unauthenticated') {
    return <FullScreenLoader />;
  }
  return <FullScreenError message={state.message} onRetry={onRetry} />;
}

function FullScreenLoader() {
  return (
    <div role="status" aria-live="polite" style={loaderStyle}>
      <div style={spinnerStyle} aria-hidden />
      <span style={{ color: '#8a8a95', fontSize: '0.875rem' }}>Loading…</span>
    </div>
  );
}

function FullScreenError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" style={errorScreenStyle}>
      <h1 style={{ margin: 0, fontSize: '1.1rem' }}>Could not verify your session</h1>
      <p style={{ margin: 0, color: '#c0c0cb', fontSize: '0.9rem' }}>{message}</p>
      <button type="button" onClick={onRetry} style={retryButtonStyle}>
        Try again
      </button>
    </div>
  );
}

const loaderStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  background: '#0b0b0d',
};

const spinnerStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '2px solid rgba(245,245,245,0.18)',
  borderTopColor: '#f5f5f5',
  animation: 'chat-spin 0.7s linear infinite',
};

const errorScreenStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: '2rem',
  textAlign: 'center',
  color: '#f5f5f5',
  background: '#0b0b0d',
};

const retryButtonStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  background: '#f5f5f5',
  color: '#0b0b0d',
  border: 'none',
  borderRadius: 8,
  padding: '0.55rem 1rem',
  fontSize: '0.875rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
