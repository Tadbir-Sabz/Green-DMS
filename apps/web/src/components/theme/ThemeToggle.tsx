"use client";

import { useTheme, type ThemePreference } from "./ThemeProvider";
import { Tooltip } from "@/components/ui/Menu";
import { IconMonitor, IconMoon, IconSun } from "@/components/icons";
import { cn } from "@/lib/cn";

/**
 * کلید تم — چرخهٔ روشن ← تاریک ← پیروی از سیستم.
 *
 * آیکونِ حالت فعلی نشان داده می‌شود و راهنمای شناور، حالت بعدی را اعلام
 * می‌کند تا کاربر بداند با کلیک چه می‌شود. چون رنگ‌ها از توکن‌ها می‌آیند،
 * خودِ دکمه در هر دو تم درست دیده می‌شود.
 */
const ORDER: ThemePreference[] = ["light", "dark", "system"];

const LABEL: Record<ThemePreference, string> = {
  light: "روشن",
  dark: "تاریک",
  system: "پیروی از سیستم",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolved, setTheme } = useTheme();

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = resolved === "dark" ? IconMoon : theme === "system" ? IconMonitor : IconSun;

  return (
    <Tooltip content={`تم: ${LABEL[theme]} — کلیک برای ${LABEL[next]}`}>
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={`تغییر تم (فعلی: ${LABEL[theme]})`}
        title={`تم: ${LABEL[theme]}`}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg border border-transparent text-ink-muted",
          "transition-colors hover:border-line hover:bg-surface-alt hover:text-ink focus-ring",
          className,
        )}
      >
        <Icon className="size-4.5" />
      </button>
    </Tooltip>
  );
}
