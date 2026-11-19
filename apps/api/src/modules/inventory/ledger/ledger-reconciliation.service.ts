import { Injectable } from '@nestjs/common';
import { LEDGER_DOMAIN } from './stock-movement';
import {
  classifyLedgerKey,
  sortFindings,
  summarizeFindings,
  type ReconciliationFinding,
  type ReconciliationSummary,
} from './ledger-reconciliation.domain';
import { LedgerReconciliationRepository } from './ledger-reconciliation.repository';

/** پاسخ API (snake_case، هم‌راستا با سایر پاسخ‌های انبار). */
export interface LedgerReconciliationFindingView {
  company_id: string;
  domain: typeof LEDGER_DOMAIN;
  warehouse_id: string;
  product_id: string;
  batch_id: string | null;
  metric: ReconciliationFinding['metric'];
  reference_source: ReconciliationFinding['referenceSource'];
  ledger_qty: number;
  recorded_balance: number;
  difference: number;
  classification: ReconciliationFinding['classification'];
  severity: ReconciliationFinding['severity'];
  explanation: string;
}

export interface LedgerReconciliationReport {
  company_id: string;
  domain: typeof LEDGER_DOMAIN;
  mode: 'read_only';
  generated_at: string;
  warehouse_id: string | null;
  checked_keys: number;
  finding_count: number;
  summary: ReconciliationSummary;
  findings: LedgerReconciliationFindingView[];
}

const toView = (f: ReconciliationFinding): LedgerReconciliationFindingView => ({
  company_id: f.companyId,
  domain: f.domain,
  warehouse_id: f.warehouseId,
  product_id: f.productId,
  batch_id: f.batchId,
  metric: f.metric,
  reference_source: f.referenceSource,
  ledger_qty: f.ledgerQty,
  recorded_balance: f.recordedBalance,
  difference: f.difference,
  classification: f.classification,
  severity: f.severity,
  explanation: f.explanation,
});

/**
 * گزارش تطبیق فقط‌خواندنی. هیچ نوشتنی انجام نمی‌دهد و هیچ مانده‌ای را اصلاح نمی‌کند؛
 * اصلاح مغایرت‌ها تصمیم عملیاتی/حسابداری است و از این سرویس انجام نمی‌شود.
 */
@Injectable()
export class LedgerReconciliationService {
  constructor(private readonly repo: LedgerReconciliationRepository) {}

  async reconcile(
    companyId: string,
    options: { warehouseId?: string | null } = {},
    now: Date = new Date(),
  ): Promise<LedgerReconciliationReport> {
    const warehouseId = options.warehouseId ?? null;
    const keys = await this.repo.collectKeys(companyId, warehouseId);
    const findings = sortFindings(keys.flatMap((k) => classifyLedgerKey(k)));
    return {
      company_id: companyId,
      domain: LEDGER_DOMAIN,
      mode: 'read_only',
      generated_at: now.toISOString(),
      warehouse_id: warehouseId,
      checked_keys: keys.length,
      finding_count: findings.length,
      summary: summarizeFindings(findings),
      findings: findings.map(toView),
    };
  }
}
