import type { SVGProps } from "react";

/**
 * مجموعهٔ آیکون‌های GreenDMS — یکدست، خطی (stroke) و مبتنی بر currentColor.
 *
 * همهٔ آیکون‌ها در یک قاب ۲۴×۲۴ با ضخامت قلم یکسان و گوشه‌های گرد طراحی شده‌اند
 * تا در منو، دکمه‌ها و جدول‌ها وزن بصری برابری داشته باشند. هر آیکون صرفاً
 * `className` می‌پذیرد و اندازه با کلاس‌های Tailwind (مثل `size-5`) کنترل می‌شود.
 *
 * نام‌های قدیمی (IconHome/IconUsers/…) حفظ شده‌اند تا importهای موجود نشکنند،
 * اما شکل آن‌ها بازطراحی و معنایی‌تر شده است.
 */
export type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Icon({ className = "size-5", strokeWidth = 1.75, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ============================== ناوبری و UI ============================== */

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.5 20.5-4-4" />
  </Icon>
);

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const IconChevronUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="m18 15-6-6-6 6" />
  </Icon>
);

/** در RTL «بعدی» به سمت چپ است */
export const IconChevronStart = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const IconChevronEnd = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </Icon>
);

export const IconArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5m6 6-6-6 6-6" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
);

export const IconFilter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 5h18l-7 8v6l-4-2v-4z" />
  </Icon>
);

export const IconSort = (p: IconProps) => (
  <Icon {...p}>
    <path d="m8 4 0 16m0 0-3-3m3 3 3-3M16 20V4m0 0-3 3m3-3 3 3" />
  </Icon>
);

export const IconRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 1 0-.7 4.3" />
    <path d="M20 5v6h-6" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
);

export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21V9m0 0 4 4m-4-4-4 4" />
    <path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
  </Icon>
);

export const IconPrint = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 9V3h10v6" />
    <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <path d="M7 14h10v7H7z" />
  </Icon>
);

export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4l10-10a2.8 2.8 0 1 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);

export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />
  </Icon>
);

export const IconEye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const IconEyeOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.9 5.8A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4.1" />
    <path d="M6.4 7.6A16.7 16.7 0 0 0 2.5 12S6 18.5 12 18.5a9.7 9.7 0 0 0 4-.85" />
    <path d="m10 10a2.8 2.8 0 0 0 4 4M3 3l18 18" />
  </Icon>
);

export const IconMoreVertical = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconExternal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);

export const IconCalendar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3.5V6M16 3.5V6" />
  </Icon>
);

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8v.4" />
  </Icon>
);

export const IconAlertTriangle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.6 4.1 2.9 17.4A1.6 1.6 0 0 0 4.3 20h15.4a1.6 1.6 0 0 0 1.4-2.6L13.4 4.1a1.6 1.6 0 0 0-2.8 0" />
    <path d="M12 9.5v4M12 16.8v.2" />
  </Icon>
);

export const IconAlertCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.8v5M12 16v.2" />
  </Icon>
);

export const IconCheckCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.3 12.2 2.6 2.6 4.8-5.4" />
  </Icon>
);

export const IconLoader = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </Icon>
);

/* ============================== تم و حساب ============================== */

export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4" />
  </Icon>
);

export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2" />
  </Icon>
);

export const IconMonitor = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8.5 20.5h7M12 17v3.5" />
  </Icon>
);

export const IconUser = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Icon>
);

export const IconLogout = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 8 6 12l4 4M6 12h10" />
  </Icon>
);

export const IconLogin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
    <path d="m14 8 4 4-4 4M18 12H8" />
  </Icon>
);

export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v2.5" />
  </Icon>
);

export const IconKey = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12.5 8-8M17 6.5l2 2M14.5 9l2 2" />
  </Icon>
);

export const IconBell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </Icon>
);

/* ============================== دامنهٔ کسب‌وکار ============================== */

export const IconHome = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M9.5 20v-6h5v6" />
  </Icon>
);

/** داشبورد — چهار کاشی با ارتفاع متفاوت */
export const IconDashboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="9" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="5.5" rx="2" />
    <rect x="3.5" y="15.5" width="7" height="5" rx="2" />
    <rect x="13.5" y="12" width="7" height="8.5" rx="2" />
  </Icon>
);

export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9.5" cy="8.5" r="3.5" />
    <path d="M3 19.5a6.5 6.5 0 0 1 13 0" />
    <path d="M16.5 5.6a3.5 3.5 0 0 1 0 6.8M17.5 14.4a6.5 6.5 0 0 1 3.5 5.1" />
  </Icon>
);

/** مشتری — شخص با نشان تأیید */
export const IconCustomer = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.5" cy="8" r="3.5" />
    <path d="M4 19.5a6.5 6.5 0 0 1 13 0" />
    <path d="m17 12.5 1.4 1.4 3-3.2" />
  </Icon>
);

/** پرسنل — کارت شناسایی */
export const IconStaff = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="15" rx="2.5" />
    <circle cx="9" cy="11" r="2.3" />
    <path d="M5.8 16.6a3.6 3.6 0 0 1 6.4 0M15 10h3.5M15 13.5h3.5" />
  </Icon>
);

export const IconBox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 3.5 7.2v9.6L12 21l8.5-4.2V7.2z" />
    <path d="M3.5 7.2 12 11.5l8.5-4.3M12 11.5V21" />
  </Icon>
);

export const IconWarehouse = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 20V9.5L12 5l9 4.5V20" />
    <path d="M3 20h18" />
    <path d="M7.5 20v-6.5h9V20M7.5 16.5h9" />
  </Icon>
);

export const IconCart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4h2.2l2.3 10.4h9.8L20 7H6" />
    <circle cx="9" cy="19" r="1.6" />
    <circle cx="17" cy="19" r="1.6" />
  </Icon>
);

/** سفارش — فهرست روی تخته */
export const IconOrder = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4.5H6.5A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H16" />
    <rect x="8" y="2.8" width="8" height="3.4" rx="1.2" />
    <path d="M8.8 11h6.4M8.8 14.6h6.4M8.8 18h4" />
  </Icon>
);

/** صندوق ورودی — درخواست‌های مشتری */
export const IconInbox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 13.5 6 5.2A1.6 1.6 0 0 1 7.5 4h9A1.6 1.6 0 0 1 18 5.2l2.5 8.3" />
    <path d="M3.5 13.5h4l1.2 2.4h6.6l1.2-2.4h4v4.9a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z" />
  </Icon>
);

export const IconReceipt = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 3.5h13v17l-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5z" />
    <path d="M9 8h6M9 11.6h6M9 15.2h3.5" />
  </Icon>
);

export const IconInvoice = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5h8.5L19 8v12.5H6z" />
    <path d="M14 3.5V8h5" />
    <path d="M9.2 12.5h5.6M9.2 16h5.6" />
  </Icon>
);

export const IconReturn = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h11a5 5 0 0 1 0 10H8" />
    <path d="m7.5 5.5-3.6 3.6 3.6 3.6" />
  </Icon>
);

export const IconTransfer = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8.5h13m0 0-3.2-3.2M17 8.5l-3.2 3.2" />
    <path d="M20 15.5H7m0 0 3.2-3.2M7 15.5l3.2 3.2" />
  </Icon>
);

/** انبارگردانی — تخته با تیک */
export const IconClipboardCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4.5H6.5A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H16" />
    <rect x="8" y="2.8" width="8" height="3.4" rx="1.2" />
    <path d="m9.3 13.6 2 2 3.6-4" />
  </Icon>
);

export const IconRoute = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="6" r="2.6" />
    <circle cx="18" cy="18" r="2.6" />
    <path d="M8.6 6H14a3.4 3.4 0 0 1 0 6.8h-4a3.4 3.4 0 0 0 0 5.2h5.4" />
  </Icon>
);

export const IconMap = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 4 6 2.4 5-2v15l-5 2-6-2.4-5 2v-15z" />
    <path d="M9 4v15.6M15 6.4V21" />
  </Icon>
);

export const IconMapPin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11" />
    <circle cx="12" cy="10" r="2.6" />
  </Icon>
);

/** تور — پرچم روی مسیر */
export const IconTour = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 21V4" />
    <path d="M5.5 5h11l-2 3.4 2 3.4h-11" />
  </Icon>
);

/** رهگیری زنده — رادار */
export const IconTracking = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
  </Icon>
);

/** ژئوفنس — محدودهٔ جغرافیایی */
export const IconGeofence = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s6.5-5.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21" />
    <path d="M5.8 13.2h12.4M7.2 16.4h9.6" />
    <circle cx="12" cy="10" r="1.8" />
  </Icon>
);

/** موتور قوانین — ترازو */
export const IconRules = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v16M7 20h10" />
    <path d="M4.5 8.5h15M8 8.5 5 14.5h6zM16 8.5 13 14.5h6z" />
    <circle cx="12" cy="5.2" r="1.2" />
  </Icon>
);

/** تأیید — مهر/نشان تأیید */
export const IconApproval = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3 2.1 1.6 2.6-.2 1 2.5 2.3 1.3-.7 2.6.7 2.6-2.3 1.3-1 2.5-2.6-.2L12 21l-2.1-1.6-2.6.2-1-2.5L4 15.8l.7-2.6L4 10.6l2.3-1.3 1-2.5 2.6.2z" />
    <path d="m9 12.2 2.1 2.1L15.2 10" />
  </Icon>
);

/** استثنا — هشدار در فهرست */
export const IconException = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 21 19H3z" />
    <path d="M12 9.5v4M12 16.3v.2" />
  </Icon>
);

export const IconMoney = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 12h.2M17.8 12h.2" />
  </Icon>
);

/** دریافتنی — ورود پول */
export const IconReceivable = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v9m0 0 3.4-3.4M12 16.5l-3.4-3.4" />
  </Icon>
);

/** پرداختنی — خروج پول */
export const IconPayable = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 16.5v-9m0 0 3.4 3.4M12 7.5 8.6 10.9" />
  </Icon>
);

/** خزانه‌داری — گاوصندوق/بانک */
export const IconTreasury = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 9.5 12 4l8.5 5.5" />
    <path d="M5.5 9.5V19M9.5 9.5V19M14.5 9.5V19M18.5 9.5V19" />
    <path d="M3 19.5h18M3.5 21.5h17" />
  </Icon>
);

/** دفتر کل — دفتر بازشده */
export const IconLedger = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 6.5C10.4 5 8.2 4.3 4 4.3v13.4c4.2 0 6.4.7 8 2.2 1.6-1.5 3.8-2.2 8-2.2V4.3c-4.2 0-6.4.7-8 2.2z" />
    <path d="M12 6.5v13.4" />
  </Icon>
);

export const IconChart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <rect x="7" y="12" width="3" height="5" rx="1" />
    <rect x="12" y="8.5" width="3" height="8.5" rx="1" />
    <rect x="17" y="5.5" width="3" height="11.5" rx="1" />
  </Icon>
);

export const IconPieChart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z" />
    <path d="M14.8 2.6a8.5 8.5 0 0 1 6.6 6.6h-6.6z" />
  </Icon>
);

export const IconTrendUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3.5 16.5 5.5-5.5 3.5 3.5L20.5 7" />
    <path d="M15 7h5.5v5.5" />
  </Icon>
);

export const IconTrendDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3.5 7.5 5.5 5.5 3.5-3.5 8 7.5" />
    <path d="M15 17h5.5v-5.5" />
  </Icon>
);

export const IconTag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7" />
    <circle cx="7.8" cy="7.8" r="1.4" />
  </Icon>
);

export const IconPercent = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 5 5 19" />
    <circle cx="7.5" cy="7.5" r="2.6" />
    <circle cx="16.5" cy="16.5" r="2.6" />
  </Icon>
);

export const IconCog = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="m19.4 14.4-.6-1 .6-1a1.4 1.4 0 0 0-.3-1.8l-1.3-1.3a1.4 1.4 0 0 0-1.8-.3l-1 .6-1-.6-.3-1.2a1.4 1.4 0 0 0-1.4-1H9.7a1.4 1.4 0 0 0-1.4 1l-.3 1.2-1 .6-1-.6a1.4 1.4 0 0 0-1.8.3L2.9 8.6a1.4 1.4 0 0 0-.3 1.8l.6 1-.6 1a1.4 1.4 0 0 0 .3 1.8l1.3 1.3a1.4 1.4 0 0 0 1.8.3l1-.6 1 .6.3 1.2a1.4 1.4 0 0 0 1.4 1h1.6a1.4 1.4 0 0 0 1.4-1l.3-1.2 1-.6 1 .6a1.4 1.4 0 0 0 1.8-.3l1.3-1.3a1.4 1.4 0 0 0 .3-1.8" />
  </Icon>
);

/** تنظیمات — لغزنده‌ها */
export const IconSliders = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2.2" />
    <circle cx="10" cy="17" r="2.2" />
  </Icon>
);

/** نقش‌ها — سپر با تیک */
export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 5 5.8v5.4c0 4.3 2.9 8.1 7 9.3 4.1-1.2 7-5 7-9.3V5.8z" />
    <path d="m9.2 12 2 2 3.6-4" />
  </Icon>
);

/** دستگاه‌ها — موبایل */
export const IconDevice = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 5.5h3M11 18.5h2" />
  </Icon>
);

/** یکپارچه‌سازی — دوشاخه */
export const IconIntegration = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3.5v5M15 3.5v5" />
    <path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0z" />
    <path d="M12 17v3.5" />
  </Icon>
);

export const IconGlobe = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5" />
  </Icon>
);

export const IconTruck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 6.5h11v9h-11z" />
    <path d="M13.5 10h4l3 3v2.5h-7z" />
    <circle cx="7" cy="17.8" r="1.8" />
    <circle cx="17" cy="17.8" r="1.8" />
  </Icon>
);

/** تحویل/حواله — بسته با تیک */
export const IconDelivery = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 3.5 7.2v9.6L12 21l8.5-4.2V7.2z" />
    <path d="m8.8 12.2 2.2 2.2 4.2-4.6" />
  </Icon>
);

/** رسید خرید — بسته با فلش ورود */
export const IconGoodsIn = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 3.5 7.2v9.6L12 21l8.5-4.2V7.2z" />
    <path d="M12 8v6m0-6-2.4 2.4M12 8l2.4 2.4" />
  </Icon>
);

export const IconDatabase = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
    <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
  </Icon>
);

export const IconFile = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5h8.5L19 8v12.5H6z" />
    <path d="M14 3.5V8h5" />
  </Icon>
);

export const IconBarcode = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17" />
    <path d="M8 8.5v7M11 8.5v7M14 8.5v7M17 8.5v7" />
  </Icon>
);

export const IconLayers = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3 8.5 4.6L12 12.2 3.5 7.6z" />
    <path d="m3.5 12.2 8.5 4.6 8.5-4.6M3.5 16.6 12 21.2l8.5-4.6" />
  </Icon>
);

export const IconActivity = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h4l2.5-6.5L14 19l2.5-7H21" />
  </Icon>
);

export const IconTarget = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconSparkles = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3.5 1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7-4.7-1.8 4.7-1.8z" />
    <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5.5 3l.6 1.6 1.6.6-1.6.6L5.5 7.4 4.9 5.8 3.3 5.2l1.6-.6z" />
  </Icon>
);

export const IconGrid = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
  </Icon>
);

export const IconList = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" />
    <circle cx="4.4" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.4" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.4" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
  </Icon>
);

/** نوار کناری — جمع/باز کردن */
export const IconPanel = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M14.5 4v16" />
  </Icon>
);

export const IconSave = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4.5h11L19.5 8v11.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1" />
    <path d="M8 4.5v5h7v-5M8 20.5v-6h8v6" />
  </Icon>
);

export const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.5 3.5 3.8 10.2l6.5 2.6 2.6 6.5z" />
    <path d="m10.3 12.8 4.4-4.4" />
  </Icon>
);

export const IconWallet = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h11a2 2 0 0 1 2 2" />
    <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
    <path d="M16.5 13.5h1.8" />
  </Icon>
);

export const IconPhone = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 3.5h-2A2 2 0 0 0 3.5 5.7C3.9 12.4 11.6 20.1 18.3 20.5a2 2 0 0 0 2.2-2v-2l-4-1.6-1.9 2a13.6 13.6 0 0 1-4.7-4.7l2-1.9z" />
  </Icon>
);

export const IconMail = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m3.8 7 7.1 5.4a2 2 0 0 0 2.2 0L20.2 7" />
  </Icon>
);

export const IconLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13.8a3.8 3.8 0 0 0 5.7.4l2.6-2.6a3.9 3.9 0 0 0-5.5-5.5l-1.5 1.5" />
    <path d="M14 10.2a3.8 3.8 0 0 0-5.7-.4L5.7 12.4a3.9 3.9 0 0 0 5.5 5.5l1.5-1.5" />
  </Icon>
);

export const IconStar = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9z" />
  </Icon>
);

export const IconFlag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 21V4" />
    <path d="M5.5 5h12l-2.5 3.8L17.5 13h-12z" />
  </Icon>
);
