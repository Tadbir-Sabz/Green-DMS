/**
 * نقطهٔ ورود واحد کتابخانهٔ اجزای GreenDMS.
 *
 * صفحه‌ها به‌جای importهای پراکنده از مسیرهای مختلف، همهٔ اجزا را از
 * `@/components/ui` می‌گیرند. اجزای قدیمی‌تر (DataTable/Modal/Toast/
 * JalaliDatePicker) مسیر مستقیم خود را هم حفظ کرده‌اند تا importهای موجود نشکنند.
 */
export { Button, IconButton, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export {
  Card,
  CardLink,
  CardHeader,
  CardBody,
  CardFooter,
  SectionTitle,
} from "./Card";
export { Badge, StatusBadge, STATUS_TONE, toneFor, type BadgeTone, type BadgeSize } from "./Badge";
export {
  Field,
  Input,
  SearchInput,
  Textarea,
  Select,
  Checkbox,
  Switch,
  SegmentedControl,
  type ControlSize,
} from "./Form";
export {
  Spinner,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  EmptyState,
  NoResults,
  ErrorState,
  Alert,
  ProgressBar,
  type AlertTone,
} from "./Feedback";
export { PageHeader, Breadcrumbs, Toolbar, type Crumb } from "./PageHeader";
export { StatCard, StatGrid, type StatTone, type TrendDirection } from "./StatCard";
export { Pagination, pageRange } from "./Pagination";
export { Dropdown, Tooltip, Avatar, initials, type MenuItem } from "./Menu";
export { DataTable, type Column, type DataTablePagination } from "./DataTable";
export { Modal, ConfirmDialog, type ModalSize } from "./Modal";
export { ToastProvider, useToast, type ToastApi, type ToastKind } from "./Toast";
export { JalaliDatePicker } from "./JalaliDatePicker";
