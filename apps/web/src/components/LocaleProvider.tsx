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
import {
  getStoredLocale,
  setStoredLocale,
  t as tRaw,
  type I18nKey,
  type Locale,
  type TParams,
} from '@/lib/i18n';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: I18nKey, params?: TParams) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('uk');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loc = getStoredLocale();
    setLocaleState(loc);
    setStoredLocale(loc);
    setReady(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setStoredLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: I18nKey, params?: TParams) => tRaw(key, locale, params),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  // Avoid SSR/client key mismatch flashing wrong language for a tick
  if (!ready && typeof window !== 'undefined') {
    // still render children; locale defaults to uk until hydrated
  }

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback when used outside provider (tests / edge)
    return {
      locale: getStoredLocale(),
      setLocale: setStoredLocale,
      t: (key, params) => tRaw(key, undefined, params),
    };
  }
  return ctx;
}
