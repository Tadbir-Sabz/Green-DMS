"use client";

import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { IconAlertCircle, IconCheck, IconChevronDown, IconClose, IconSearch } from "@/components/icons";

/**
 * اجزای فرم — یک زبان بصری واحد برای همهٔ ورودی‌ها.
 *
 * `Field` برچسب، راهنما و پیام خطا را با id خودکار به ورودی گره می‌زند
 * (دسترس‌پذیری واقعی: `getByLabelText` کار می‌کند)، و Input/Textarea/Select
 * فقط ظاهر یکدست می‌دهند. این جایگزین الگوی پراکندهٔ
 * «input با کلاس‌های خام + label دستی» در صفحات CRUD است.
 */

const CONTROL =
  "w-full rounded-lg border bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 " +
  "placeholder:text-ink-subtle focus-ring disabled:cursor-not-allowed disabled:opacity-60";

const CONTROL_SIZES = {
  sm: "h-8.5 px-2.5 text-[13px]",
  md: "h-10 px-3 text-sm",
  lg: "h-11.5 px-3.5 text-[15px]",
} as const;

export type ControlSize = keyof typeof CONTROL_SIZES;

function stateClass(invalid?: boolean) {
  return invalid
    ? "border-danger focus-visible:outline-danger"
    : "border-line hover:border-line-strong";
}

/* ------------------------------- Field -------------------------------- */

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
  align = "block",
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
  align?: "block" | "inline";
}) {
  return (
    <div className={cn(align === "inline" ? "flex items-center gap-3" : "space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className={cn(
            "text-[13px] font-medium text-ink-muted",
            align === "inline" && "shrink-0",
          )}
        >
          {label}
          {required && (
            <span aria-hidden className="ms-0.5 text-danger">
              *
            </span>
          )}
        </label>
      )}
      <div className={cn(align === "inline" && "flex-1")}>
        {children}
        {error ? (
          <p className="mt-1.5 flex items-start gap-1 text-xs text-danger-ink">
            <IconAlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : hint ? (
          <p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------- Input -------------------------------- */

// توجه: خودِ <input> یک صفت `size: number` دارد که با اندازهٔ طراحی ما
// تداخل می‌کند، پس از نوع پایه حذف می‌شود.
type InputProps = Omit<ComponentPropsWithoutRef<"input">, "size"> & {
  size?: ControlSize;
  invalid?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", invalid, leading, trailing, className, ...rest },
  ref,
) {
  if (leading || trailing) {
    return (
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute inset-y-0 start-0 grid w-9 place-items-center text-ink-subtle [&>svg]:size-4">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            CONTROL,
            CONTROL_SIZES[size],
            stateClass(invalid),
            leading ? "ps-9" : undefined,
            trailing ? "pe-9" : undefined,
            "tnum",
            className,
          )}
          aria-invalid={invalid || undefined}
          {...rest}
        />
        {trailing && (
          <span className="absolute inset-y-0 end-0 grid w-9 place-items-center text-ink-subtle [&>svg]:size-4">
            {trailing}
          </span>
        )}
      </div>
    );
  }
  return (
    <input
      ref={ref}
      className={cn(CONTROL, CONTROL_SIZES[size], stateClass(invalid), "tnum", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

/** ورودی جست‌وجو با آیکون و دکمهٔ پاک‌کردن */
export function SearchInput({
  value,
  onValueChange,
  placeholder = "جست‌وجو…",
  className,
  size = "md",
  ...rest
}: Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "size"> & {
  value: string;
  onValueChange: (value: string) => void;
  size?: ControlSize;
}) {
  return (
    <div className={cn("relative", className)}>
      <Input
        type="search"
        role="searchbox"
        value={value}
        size={size}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn("ps-9", value && "pe-9")}
        {...rest}
      />
      <span className="pointer-events-none absolute inset-y-0 start-0 grid w-9 place-items-center text-ink-subtle">
        <IconSearch className="size-4" />
      </span>
      {value && (
        <button
          type="button"
          onClick={() => onValueChange("")}
          aria-label="پاک کردن جست‌وجو"
          className="absolute inset-y-0 end-0 grid w-9 place-items-center rounded-e-lg text-ink-subtle transition-colors hover:text-ink focus-ring"
        >
          <IconClose className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* ----------------------------- Textarea -------------------------------- */

type TextareaProps = ComponentPropsWithoutRef<"textarea"> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "px-3 py-2.5 text-sm leading-relaxed", stateClass(invalid), className)}
      {...rest}
    />
  );
});

/* ------------------------------ Select --------------------------------- */

// مثل Input: صفت `size: number` خودِ <select> حذف می‌شود تا اندازهٔ طراحی جای آن بنشیند
type SelectProps = Omit<ComponentPropsWithoutRef<"select">, "size"> & {
  size?: ControlSize;
  invalid?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "md", invalid, options, placeholder, className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL,
          CONTROL_SIZES[size],
          stateClass(invalid),
          "appearance-none pe-9 cursor-pointer",
          className,
        )}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <IconChevronDown className="pointer-events-none absolute inset-y-0 end-0 my-auto size-4 text-ink-subtle" />
    </div>
  );
});

/* ----------------------------- Checkbox -------------------------------- */

export function Checkbox({
  label,
  description,
  className,
  ...rest
}: ComponentPropsWithoutRef<"input"> & { label?: ReactNode; description?: ReactNode }) {
  const autoId = useId();
  const inputId = rest.id ?? autoId;
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      {/* ورودی تمام قاب را پر می‌کند و تیک به‌صورت لایهٔ بالایی نمایان می‌شود */}
      <span className="relative mt-px inline-grid size-4.5 shrink-0 place-items-center">
        <input
          id={inputId}
          type="checkbox"
          className={cn(
            "peer size-full cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface",
            "transition-colors duration-150 checked:border-brand checked:bg-brand focus-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          {...rest}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center text-brand-ink opacity-0 transition-opacity duration-150 peer-checked:opacity-100"
        >
          <IconCheck className="size-3" strokeWidth={3} />
        </span>
      </span>
      {label && (
        <label
          htmlFor={inputId}
          className="cursor-pointer text-[13px] leading-snug text-ink select-none"
        >
          {label}
          {description && (
            <span className="mt-0.5 block text-xs text-ink-subtle">{description}</span>
          )}
        </label>
      )}
    </div>
  );
}

/* ------------------------------ Switch --------------------------------- */

export function Switch({
  label,
  checked,
  onChange,
  disabled,
  className,
}: {
  label?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-brand" : "bg-line-strong",
        )}
      >
        {/* موقعیت با inset منطقی (start/end) تعیین می‌شود تا در RTL درست بچرخد:
            خاموش = سمت راست (start)، روشن = سمت چپ (end) */}
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-4.5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all duration-200",
            checked ? "end-0.5" : "start-0.5",
          )}
        />
      </button>
      {label && (
        <label htmlFor={id} className="cursor-pointer text-[13px] text-ink select-none">
          {label}
        </label>
      )}
    </div>
  );
}

/* --------------------------- SegmentedControl --------------------------- */

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-line bg-surface-alt p-1",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg font-medium transition-all duration-150 focus-ring [&>svg]:size-4",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8.5 px-3 text-[13px]",
              active
                ? "bg-surface text-ink shadow-xs"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
