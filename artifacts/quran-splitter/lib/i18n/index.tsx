// Language context for the app. Provides the active language, a setter (persisted
// to AsyncStorage), an `isRTL` flag for layout direction, and a `t()` translator.
//
// The default language is always Arabic; once the user picks one from the
// language switcher it is remembered. `t()` falls back to Arabic (the base
// dictionary) for any key missing in the active language, then to the key name.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LANGUAGES, translations, type Lang, type TranslationKey } from "./translations";

const STORAGE_KEY = "app.language";
const BASE_LANG: Lang = "ar";

function isSupported(code: string | null | undefined): code is Lang {
  return !!code && LANGUAGES.some((l) => l.code === code);
}

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  isRTL: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  languages: typeof LANGUAGES;
}

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  let out = template;
  for (const key of Object.keys(params)) {
    out = out.split(`{${key}}`).join(String(params[key]));
  }
  return out;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(BASE_LANG);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (active && isSupported(saved)) setLangState(saved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<I18nValue>(() => {
    const meta = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
    const dict = translations[lang];
    const base = translations[BASE_LANG];
    const t = (key: TranslationKey, params?: Record<string, string | number>) =>
      interpolate(dict[key] ?? base[key] ?? key, params);
    return { lang, setLang, isRTL: meta.rtl, t, languages: LANGUAGES };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within a LanguageProvider");
  return ctx;
}

export { LANGUAGES, type Lang, type TranslationKey };
