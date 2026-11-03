"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * مدیریت تم با سه حالت: روشن / تاریک / پیروی از سیستم.
 *
 * نکتهٔ کلیدی: اسکریپت درون‌خطیِ `layout.tsx` پیش از اولین paint کلاس `.dark`
 * را روی <html> می‌گذارد، بنابراین «فلش سفید» هنگام ورود به حالت شب رخ نمی‌دهد.
 * این Provider فقط همان وضعیت را در React همگام نگه می‌دارد و انتخاب کاربر را
 * در localStorage ذخیره می‌کند.
 *
 * چون رنگ‌ها از توکن‌های معنایی globals.css می‌آیند، اعمال تم صرفاً با جابه‌جایی
 * کلاس `dark` انجام می‌شود و نیازی به بازنویسی هیچ utility نیست.
 */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "dms-theme";

type ThemeContextValue = {
  /** انتخاب کاربر */
  theme: ThemePreference;
  /** آنچه واقعاً روی صفحه اعمال شده */
  resolved: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
  toggle: () => {},
});

function readStored(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    return "system";
  }
}

function systemPreference(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** اعمال تم روی سند و بازگرداندن مقدار نهایی */
function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = preference === "system" ? systemPreference() : preference;
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.setAttribute("data-theme", preference);
    root.style.colorScheme = resolved;
  }
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // همگام‌سازی با چیزی که اسکریپت درون‌خطی پیش از paint اعمال کرده است
  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    setResolved(applyTheme(stored));
  }, []);

  // وقتی انتخاب کاربر «system» است، تغییر تم سیستم را زنده دنبال کن
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => setResolved(applyTheme("system"));
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    setResolved(applyTheme(next));
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* حالت خصوصی مرورگر — بی‌خطر نادیده گرفته می‌شود */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
