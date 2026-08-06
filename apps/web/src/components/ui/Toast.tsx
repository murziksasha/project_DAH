'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ToastKind = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  detail?: string;
}

interface ToastApi {
  push: (message: string, kind?: ToastKind, detail?: string) => void;
  success: (message: string) => void;
  error: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, kind: ToastKind = 'info', detail?: string) => {
    const id = ++seq;
    setItems((prev) => [...prev, { id, message, kind, detail }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (m) => push(m, 'success'),
      error: (m, d) => push(m, 'error', d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="toast-stack"
        aria-live="polite"
        style={{
          position: 'fixed',
          right: 12,
          bottom: 12,
          zIndex: 100,
          display: 'grid',
          gap: 8,
          maxWidth: 'min(360px, calc(100vw - 24px))',
        }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="card"
            role="status"
            style={{
              boxShadow: 'var(--shadow)',
              borderLeft:
                t.kind === 'error'
                  ? '4px solid var(--danger)'
                  : t.kind === 'success'
                    ? '4px solid var(--success)'
                    : '4px solid var(--primary)',
              padding: '0.75rem 1rem',
              fontSize: '0.9rem',
            }}
          >
            <div>{t.message}</div>
            {t.detail && (
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: 4 }}>
                {t.detail}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      push: () => undefined,
      success: () => undefined,
      error: () => undefined,
    };
  }
  return ctx;
}
