"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import en from "./en.json";
import fr from "./fr.json";

export type Language = "en" | "fr";

type TranslationValue = string | Record<string, unknown>;
type Translations = Record<string, TranslationValue | Record<string, TranslationValue>>;

const translations: Record<Language, Translations> = {
  en: en as Translations,
  fr: fr as Translations,
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "soma-language";

function getNestedValue(obj: Translations, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  let result = template;

  for (const [key, value] of Object.entries(params)) {
    // Handle simple interpolation {key}
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));

    // Handle plural forms {count, plural, one {card} other {cards}}
    const pluralRegex = new RegExp(`\\{${key},\\s*plural,\\s*one\\s*\\{([^}]+)\\}\\s*other\\s*\\{([^}]+)\\}\\}`, "g");
    result = result.replace(pluralRegex, (_, one, other) => {
      return Number(value) === 1 ? one : other;
    });
  }

  return result;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [isHydrated, setIsHydrated] = useState(false);

  // Load saved language preference on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (saved && (saved === "en" || saved === "fr")) {
      setLanguageState(saved);
    }
    setIsHydrated(true);
  }, []);

  // Save language preference when it changes
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    // Update html lang attribute
    document.documentElement.lang = lang;
  }, []);

  // Translation function
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(translations[language], key);

    if (value === undefined) {
      // Fallback to English if key not found in current language
      const fallback = getNestedValue(translations.en, key);
      if (fallback === undefined) {
        console.warn(`Translation key not found: ${key}`);
        return key;
      }
      return params ? interpolate(fallback, params) : fallback;
    }

    return params ? interpolate(value, params) : value;
  }, [language]);

  // Update HTML lang attribute on initial load
  useEffect(() => {
    if (isHydrated) {
      document.documentElement.lang = language;
    }
  }, [language, isHydrated]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return context;
}

export function useLanguage() {
  const { language, setLanguage } = useTranslation();
  return { language, setLanguage };
}
