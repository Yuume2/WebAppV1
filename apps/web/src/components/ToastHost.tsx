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
import type { ApiCallError } from '@/lib/api/client';

type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  push: (tone: ToastTone, message: string) => void;
  pushError: (error: unknown, prefix?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `t-${Date.now()}-${counter}`;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastHost');
  }
  return ctx;
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId();
    setToasts((prev) => [...prev, { id, tone, message }]);
  }, []);

  const pushError = useCallback(
    (error: unknown, prefix?: string) => {
      const e = error as ApiCallError | undefined;
      const code = e?.code ?? 'error';
      const msg = e?.message ?? 'Unknown error';
      const full = prefix ? `${prefix}: ${code} — ${msg}` : `${code} — ${msg}`;
      push('error', full);
    },
    [push],
  );

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => dismiss(t.id), AUTO_DISMISS_MS),
    );
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [toasts, dismiss]);

  const value = useMemo<ToastContextValue>(
    () => ({ push, pushError, dismiss }),
    [push, pushError, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" style={viewportStyle}>
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{ ...toastStyle, ...toneStyles[t.tone] }}
            onClick={() => dismiss(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const viewportStyle: React.CSSProperties = {
  position: 'fixed',
  top: '1rem',
  right: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  maxWidth: 420,
  zIndex: 70,
};

const toastStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: 8,
  fontSize: '0.875rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  cursor: 'pointer',
  color: '#f5f5f5',
};

const toneStyles: Record<ToastTone, React.CSSProperties> = {
  success: {
    background: '#13321d',
    border: '1px solid #2a6a43',
    color: '#c9f4d6',
  },
  error: {
    background: '#3a1d1d',
    border: '1px solid #6b2a2a',
    color: '#ffd3d3',
  },
  info: {
    background: '#1b1b23',
    border: '1px solid #2a2a30',
    color: '#e8e8ef',
  },
};
