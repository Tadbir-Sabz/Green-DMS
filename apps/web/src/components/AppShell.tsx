"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { normalizeFa } from "@/lib/text";
import { isPathActive, labelForPath, navGroups, navItems, type NavItem } from "@/lib/navigation";
import { CommandPalette } from "@/components/CommandPalette";
import { Breadcrumbs, type Crumb } from "@/components/ui/PageHeader";
import { Avatar, Dropdown } from "@/components/ui/Menu";
import { SearchInput } from "@/components/ui/Form";
import {
  IconChevronDown,
  IconClose,
  IconCog,
  IconLogout,
  IconMenu,
  IconPanel,
  IconSearch,
  IconUser,
} from "@/components/icons";

/**
 * پوستهٔ اصلی سامانه — نوار کناری RTL + سربدنهٔ چسبنده + پالت فرمان.
 *
 * تصمیم‌های طراحی:
 *  - نوار کناری «آکاردئونی» است: با ۴۰+ صفحه، باز بودن همهٔ گروه‌ها اسکرول
 *    طولانی و گم‌شدن کاربر می‌آورد. گروه مربوط به مسیر جاری خودکار باز می‌شود.
 *  - در حالت جمع‌شده یک «ریل» فقط-آیکونی از گروه‌ها نمایش داده می‌شود تا با یک
 *    کلیک به آن بخش بپرید؛ آیتم‌ها با CSS پنهان می‌شوند نه حذف از DOM.
 *  - جست‌وجو در دو سطح: فیلتر منو (داخل نوار کناری) و پالت فرمان سراسری
 *    (Ctrl/Cmd+K) که کل صفحه‌ها را با توضیحشان جست‌وجو می‌کند.
 *  - همهٔ رنگ‌ها از توکن‌های معنایی می‌آیند، پس هیچ کلاس `dark:` در این فایل نیست.
 *
 * نکتهٔ ساختاری: نوار کناری فقط «یک بار» رندر می‌شود و با کلاس‌های واکنش‌گرا
 * هم در موبایل off-canvas است و هم در دسکتاپ چسبنده. این کار از تکرار لینک‌ها
 * در DOM جلوگیری می‌کند (هم سبک‌تر است، هم تست منو که یکتایی hrefها را می‌سنجد
 * معتبر می‌ماند).
 */

const NAV_WIDTH = "md:w-72";
const NAV_WIDTH_COLLAPSED = "md:w-[70px]";

/** آیا عنصر هدف تایپ است؟ (تا میان‌بر «/» هنگام نوشتن در فرم فعال نشود) */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hasPermission, logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  // گروه مربوط به مسیر جاری را باز کن (یک‌بار برای هر مسیر)
  useEffect(() => {
    const active = navGroups.find((group) =>
      group.items.some((item) => isPathActive(pathname, item.href)),
    );
    if (!active) return;
    setOpenGroups((prev) => (prev.includes(active.key) ? prev : [...prev, active.key]));
  }, [pathname]);

  // با تغییر مسیر، منوی موبایل و فیلتر بسته/پاک شوند
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // میان‌برهای صفحه‌کلید: Ctrl/Cmd+K برای پالت و «/» برای جست‌وجوی سریع
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // اسکرول بدنه وقتی منوی موبایل یا پالت باز است قفل شود
  useEffect(() => {
    if (!mobileOpen && !paletteOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen, paletteOpen]);

  // مسیر راهنما — فقط وقتی بیش از یک گره دارد رندر می‌شود
  const crumbs = useMemo<Crumb[]>(() => {
    if (!pathname || pathname === "/") return [];
    const trail: Crumb[] = [{ label: "داشبورد", href: "/" }];
    const match = navItems
      .filter((item) => isPathActive(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0];
    if (match && match.href === pathname) {
      trail.push({ label: match.label });
    } else if (match) {
      trail.push({ label: match.label, href: match.href });
      trail.push({ label: labelForPath(pathname) ?? "جزئیات" });
    } else {
      trail.push({ label: labelForPath(pathname) ?? "صفحه" });
    }
    return trail;
  }, [pathname]);

  // همهٔ هوک‌ها پیش از این بازگشت زودهنگام فراخوانی شده‌اند (قانون هوک‌ها)
  if (pathname === "/login") return <>{children}</>;

  // fail-open تا پیش از بارگذاری نشست؛ بعد از آن فیلتر بر اساس مجوز
  const canSee = (item: NavItem): boolean =>
    !user || !item.perm ? true : hasPermission(item.perm);

  const needle = normalizeFa(query);
  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          canSee(item) &&
          (!needle || normalizeFa(`${item.label} ${item.hint ?? ""}`).includes(needle)),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const toggleGroup = (key: string): void => {
    setOpenGroups((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const jumpToGroup = (key: string): void => {
    setCollapsed(false);
    setOpenGroups((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const onLogout = async (): Promise<void> => {
    await logout();
    router.push("/login");
  };

  /* ----------------------------- نوار کناری ----------------------------- */
  const sidebar = (
    <div className="flex h-full flex-col">
      {/* برند — نام محصول فقط همین‌جا و یک‌بار نوشته می‌شود */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-active text-[13px] font-bold text-brand-ink shadow-xs"
        >
          GD
        </span>
        <div className={cn("min-w-0 leading-tight", collapsed && "md:hidden")}>
          <div className="truncate text-sm font-bold text-ink">GreenDMS</div>
          <div className="truncate text-[11px] text-ink-subtle">سامانه فروش و پخش مویرگی</div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="بستن منو"
          className="ms-auto grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink md:hidden"
        >
          <IconClose className="size-4" />
        </button>
      </div>

      {/* ریل جمع‌شده (فقط دسکتاپ) — پرش سریع به هر گروه */}
      {collapsed && (
        <div className="hidden shrink-0 flex-col items-center gap-1 border-b border-line py-3 md:flex">
          {groups.map((group) => {
            const GroupIcon = group.icon;
            const groupActive = group.items.some((item) => isPathActive(pathname, item.href));
            return (
              <button
                key={group.key}
                type="button"
                title={group.title}
                aria-label={group.title}
                onClick={() => jumpToGroup(group.key)}
                className={cn(
                  "grid size-10 place-items-center rounded-xl transition-colors focus-ring",
                  groupActive
                    ? "bg-brand-soft text-brand-soft-ink"
                    : "text-ink-subtle hover:bg-surface-hover hover:text-ink",
                )}
              >
                <GroupIcon className="size-5" />
              </button>
            );
          })}
        </div>
      )}

      {/* فیلتر منو */}
      <div className={cn("shrink-0 px-3 pt-3", collapsed && "md:hidden")}>
        <SearchInput
          value={query}
          onValueChange={setQuery}
          size="sm"
          placeholder="فیلتر منو…"
          aria-label="فیلتر منو"
        />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="منوی اصلی">
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-ink-subtle">
            موردی مطابق «{query}» در منو نیست
          </p>
        ) : null}

        {/* در حالت جمع‌شده، فهرست کامل با CSS پنهان می‌شود (از DOM حذف نمی‌شود) */}
        <div className={cn("space-y-1", collapsed && "md:hidden")}>
          {groups.map((group) => {
            const isOpen = openGroups.includes(group.key) || Boolean(needle);
            const groupActive = group.items.some((item) => isPathActive(pathname, item.href));
            const GroupIcon = group.icon;
            return (
              <section key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={isOpen}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-semibold tracking-wide transition-colors focus-ring",
                    groupActive ? "text-ink-muted" : "text-ink-subtle hover:text-ink-muted",
                  )}
                >
                  <GroupIcon className="size-3.5 shrink-0 opacity-70" />
                  <span className="flex-1 text-start">{group.title}</span>
                  <span className="tnum rounded-md bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle">
                    {group.items.length}
                  </span>
                  <IconChevronDown
                    className={cn("size-3.5 shrink-0 transition-transform duration-200", isOpen && "rotate-180")}
                  />
                </button>

                {/* آیتم‌ها: پنهان با CSS، نه حذف از DOM */}
                <div className={cn("mt-0.5 space-y-0.5", !isOpen && "hidden")}>
                  {group.items.map((item) => {
                    const active = isPathActive(pathname, item.href);
                    const ItemIcon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        aria-current={active ? "page" : undefined}
                        title={item.hint}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors focus-ring",
                          active
                            ? "bg-brand-soft font-semibold text-brand-soft-ink"
                            : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                        )}
                      >
                        <ItemIcon
                          className={cn(
                            "size-4.5 shrink-0 transition-colors",
                            active ? "text-brand" : "text-ink-subtle group-hover:text-ink-muted",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </nav>

      {/* پانوشت: جمع/باز کردن نوار */}
      <div className="hidden shrink-0 border-t border-line p-3 md:block">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "باز کردن نوار کناری" : "جمع کردن نوار کناری"}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-medium text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink focus-ring"
        >
          <IconPanel className={cn("size-4 shrink-0 transition-transform", collapsed && "rotate-180")} />
          <span className={cn("truncate", collapsed && "hidden")}>جمع کردن نوار</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* ------------------------------ سربدنه ------------------------------ */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-surface-glass px-3 backdrop-blur-md sm:gap-3 sm:px-5">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="باز کردن منو"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink md:hidden"
        >
          <IconMenu className="size-5" />
        </button>

        <div className="min-w-0 flex-1">
          {crumbs.length > 1 ? (
            <Breadcrumbs items={crumbs} className="hidden sm:block" />
          ) : null}
          <p className="truncate text-[13px] font-semibold text-ink sm:text-sm">
            {crumbs.length > 0 ? crumbs[crumbs.length - 1].label : "داشبورد"}
          </p>
        </div>

        {/* کلید باز کردن پالت فرمان */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="جست‌وجوی سراسری"
          className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-surface-alt px-3 text-[13px] text-ink-subtle transition-colors hover:border-line-strong hover:text-ink-muted lg:flex lg:w-64"
        >
          <IconSearch className="size-4 shrink-0" />
          <span className="flex-1 text-start">جست‌وجو…</span>
          <kbd className="shrink-0 rounded border border-line bg-surface px-1 py-px font-mono text-[10px]">
            Ctrl K
          </kbd>
        </button>

        <IconButtonMobile onClick={() => setPaletteOpen(true)} label="جست‌وجو">
          <IconSearch className="size-5" />
        </IconButtonMobile>

        <ThemeToggle />

        <Dropdown
          label="منوی کاربر"
          align="end"
          width="w-60"
          trigger={({ open, toggle, ref }) => (
            <button
              ref={ref}
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-haspopup="menu"
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg border px-2 transition-colors focus-ring",
                open
                  ? "border-line-strong bg-surface-alt"
                  : "border-transparent hover:border-line hover:bg-surface-alt",
              )}
            >
              <Avatar name={user?.username} size="sm" />
              <span className="hidden max-w-[130px] truncate text-[13px] font-medium text-ink sm:block">
                {user?.username ?? "کاربر"}
              </span>
              <IconChevronDown
                className={cn("hidden size-3.5 text-ink-subtle transition-transform sm:block", open && "rotate-180")}
              />
            </button>
          )}
          items={[
            {
              key: "account",
              label: "حساب کاربری",
              icon: <IconUser />,
              onSelect: () => router.push("/users"),
            },
            {
              key: "settings",
              label: "تنظیمات سامانه",
              icon: <IconCog />,
              onSelect: () => router.push("/settings"),
            },
            {
              key: "logout",
              label: "خروج از حساب",
              icon: <IconLogout />,
              tone: "danger",
              dividerBefore: true,
              onSelect: () => void onLogout(),
            },
          ]}
        />
      </header>

      {/* ------------------------- بدنهٔ اصلی ------------------------- */}
      <div className="flex items-start">
        {mobileOpen && (
          <div
            aria-hidden
            className="fixed inset-0 z-40 bg-[#05070c]/55 backdrop-blur-[2px] md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside
          className={cn(
            "z-50 border-e border-line bg-surface transition-[transform,width] duration-200 ease-out",
            "fixed inset-y-0 start-0 w-72",
            mobileOpen ? "translate-x-0 shadow-xl" : "translate-x-full",
            "md:sticky md:top-16 md:z-auto md:h-[calc(100vh-64px)] md:translate-x-0 md:shadow-none",
            collapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH,
          )}
        >
          {sidebar}
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/** دکمهٔ آیکونی که فقط در اندازه‌های کوچک‌تر از lg دیده می‌شود */
function IconButtonMobile({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink lg:hidden"
    >
      {children}
    </button>
  );
}

export function AppLoader() {
  return (
    <div className="flex items-center gap-2 p-6 text-[13px] text-ink-muted">
      <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      در حال بارگذاری…
    </div>
  );
}
