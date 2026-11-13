import type { TransferManifest, TransferOwnerType, TransferPreviewItem } from './attachment-transfer.rules';

/** پاسخهای قراردادی مرکز انتقال ضمائم — هیچ URL/کلید استوریج/اعتبارنامهای برنمیگردد. */

export interface TransferOwnerTypeOption {
  owner_type: TransferOwnerType;
  label_fa: string;
  module_path: string;
  backend_supported: true;
  ui_module: 'product_media' | 'operational_entity' | 'backend_only';
  note_fa: string;
}

export interface TransferOwnerRecord {
  owner_type: TransferOwnerType;
  owner_id: string;
  reference: string;
  title_fa: string;
  label_fa: string;
  module_path: string;
  attachment_count: number;
}

export interface TransferSelection {
  owner_type: TransferOwnerType;
  owner_id: string;
}

export interface TransferRejectedFile {
  owner_type: TransferOwnerType;
  owner_id: string;
  attachment_id: string;
  file_name: string;
  reason_code: string;
  message_fa: string;
}

export interface TransferManifestView extends TransferManifest {
  checksums: {
    manifest_sha256: string;
    package_sha256: string;
    total_bytes: number;
    file_count: number;
  };
}

/** نتیجهٔ «پیشنمایش صدور»، قبل از تحویل بستهٔ ZIP. */
export interface TransferExportPreview {
  operation_id: string;
  operation_type: 'export';
  phase: 'preview';
  execution_status: 'completed';
  created_at: string;
  expires_at: string;
  entity_types: TransferOwnerType[];
  selections: TransferSelection[];
  file_count: number;
  total_bytes: number;
  estimated_package_size_bytes: number;
  rejected_count: number;
  rejected_files: TransferRejectedFile[];
  manifest: TransferManifestView | null;
  downloads_available: boolean;
  note_fa: string;
}

export interface TransferApprovalStatus {
  status: 'blocked';
  reason_code: 'approval_policy_missing';
  message_fa: string;
  operation: string;
  mechanism: string;
  fingerprint_supported: boolean;
  required_dependency_fa: string;
  initiator_user_id: string;
  approver_user_id: null;
  approved_at: null;
  approved_package_sha256: null;
  approved_mapping_sha256: null;
  approved_preview_sha256: null;
  current_package_sha256: string;
  current_mapping_sha256: string;
  current_preview_sha256: string;
  approval_invalidated: boolean;
  self_approval_forbidden: true;
}

export interface TransferImportPreview {
  operation_id: string;
  operation_type: 'import';
  phase: 'preview' | 'approval';
  execution_status: 'blocked';
  status: 'approval_blocked';
  created_at: string;
  expires_at: string;
  version: number;
  entity_types: TransferOwnerType[];
  file_count: number;
  total_bytes: number;
  package_sha256: string;
  manifest_sha256: string;
  mapping_sha256: string;
  preview_sha256: string;
  items: TransferPreviewItem[];
  counts: {
    accepted: number;
    rejected: number;
    duplicate: number;
    unresolved: number;
  };
  manifest: TransferManifestView;
  approval: TransferApprovalStatus;
  execution: {
    allowed: false;
    reason_code: 'approval_policy_missing';
    message_fa: string;
  };
  note_fa: string;
}

export interface TransferAuditEvent {
  event_id: string;
  action: string;
  phase: 'preview' | 'approval' | 'execution' | 'download' | 'failure' | 'cancellation';
  status: string;
  at: string;
  actor_user_id: string | null;
  actor_label: string | null;
  safe_failure: { code: string; message_fa: string } | null;
}

export interface TransferHistoryItem {
  operation_id: string;
  operation_type: 'export' | 'import';
  phase: string;
  execution_status: string;
  initiator_user_id: string | null;
  initiator_label: string;
  approver_user_id: null;
  approver_label: string;
  package_schema: string | null;
  package_sha256: string | null;
  manifest_sha256: string | null;
  total_bytes: number;
  estimated_package_size_bytes: number;
  entity_types: TransferOwnerType[];
  file_count: number;
  accepted_count: number;
  rejected_count: number;
  duplicate_count: number;
  unresolved_count: number;
  created_at: string;
  completed_at: string | null;
  safe_failure: { code: string; message_fa: string } | null;
  events: TransferAuditEvent[];
}

export interface TransferOperationDetail extends TransferHistoryItem {
  manifest: TransferManifestView | null;
  note_fa: string;
}

export interface TransferActor {
  companyId: string;
  userId: string;
}

export interface TransferRequestMeta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}
