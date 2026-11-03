"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";

/**
 * پالت نمودارها، خوانده‌شده از همان توکن‌های CSS سیستم طراحی.
 *
 * کتابخانهٔ نمودار (recharts) رنگ‌ها را به‌صورت مقدار ثابت می‌گیرد و کلاس
 * Tailwind نمی‌شناسد؛ اگر رنگ‌ها را هاردکد کنیم، نمودار در حالت شب روی زمینهٔ
 * تیره با خطوط روشنِ نامناسب drawn می‌شود. این هوک مقادیر واقعی توکن‌ها را از
 * `getComputedStyle` می‌خواند و با تغییر تم به‌روز می‌شود، پس نمودار همیشه
 * هم‌رنگ بقیهٔ رابط است.
 */
export type ChartTheme = {
  grid: string;
  axis: string;
  surface: string;
  line: string;
  ink: string;
  inkMuted: string;
  inkSubtle: string;
  brand: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
};

/** مقادیر حالت روشن — برای رندر سمت سرور و پیش از خواندن DOM */
const FALLBACK: ChartTheme = {
  grid: "#e3e8ef",
  axis: "#8592a4",
  surface: "#ffffff",
  line: "#e3e8ef",
  ink: "#0f1a2b",
  inkMuted: "#4a5768",
  inkSubtle: "#8592a4",
  brand: "#0e9f6e",
  success: "#12855f",
  warning: "#b5560b",
  danger: "#b42318",
  info: "#175cd3",
};

const TOKEN_MAP: Record<keyof ChartTheme, string> = {
  grid: "--line",
  axis: "--ink-subtle",
  surface: "--surface",
  line: "--line",
  ink: "--ink",
  inkMuted: "--ink-muted",
  inkSubtle: "--ink-subtle",
  brand: "--brand",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  info: "--info",
};

function readTokens(): ChartTheme {
  if (typeof window === "undefined") return FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  const next = { ...FALLBACK };
  for (const [key, variable] of Object.entries(TOKEN_MAP) as [keyof ChartTheme, string][]) {
    const value = styles.getPropertyValue(variable).trim();
    if (value) next[key] = value;
  }
  return next;
}

export function useChartTheme(): ChartTheme {
  const { resolved } = useTheme();
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    setTheme(readTokens());
  }, [resolved]);

  return theme;
}
