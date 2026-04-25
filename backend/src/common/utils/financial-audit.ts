import { createHash } from 'crypto';
import { Logger } from '@nestjs/common';

// ──────────────────────────────────────────────
// Financial audit utility (Cap. 45 — M0)
// ──────────────────────────────────────────────
//
// Three independent events that, cross-referenced, prove the structural
// invariant "if Chalán confirmed it, it exists in the DB":
//
//   1. financial_write_attempted   — emitted before expense/income.create()
//   2. financial_write_committed   — emitted after the create resolves OK
//   3. financial_confirmation_sent — emitted when "✅ registrado" is sent
//
// They share a `sourceTextHash` so any consumer (Railway logs, the
// /api/internal/financial-integrity endpoint, future audits) can join
// the three events back into a single causal chain.
//
// The metric that detects the bug is:
//
//   count(financial_confirmation_sent)
//     − count(financial_write_committed with same sourceTextHash)
//
// If > 0 → orphaned confirmations → the user was lied to.

export const FINANCIAL_EVENT = {
  WRITE_ATTEMPTED: 'financial_write_attempted',
  WRITE_COMMITTED: 'financial_write_committed',
  WRITE_FAILED: 'financial_write_failed',
  CONFIRMATION_SENT: 'financial_confirmation_sent',
} as const;

export type FinancialEvent =
  (typeof FINANCIAL_EVENT)[keyof typeof FINANCIAL_EVENT];

export type FinancialKind = 'expense' | 'income';

export interface FinancialAuditPayload {
  event: FinancialEvent;
  providerId?: string;
  providerPhone?: string;
  kind: FinancialKind;
  amount?: number;
  recordId?: string;
  sourceTextHash?: string;
  reason?: string;
}

/**
 * Stable short hash of the user message that triggered the operation.
 * Normalized (lowercase + collapsed whitespace + trimmed) so that
 * cosmetic variations don't fragment the join key. 12 hex chars
 * (~48 bits) is plenty for joining within a single provider's window.
 */
export function sourceTextHash(text: string | null | undefined): string {
  const normalized = (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return createHash('sha1').update(normalized).digest('hex').slice(0, 12);
}

/**
 * Emit a single audit event as structured JSON to the Nest logger.
 * Going through the logger ensures the event reaches Railway log
 * aggregation for free, without needing a queue or worker.
 *
 * The same payload is meant to be persisted into ConversationLog.metadata
 * by the caller (since that's where it can be queried by the integrity
 * endpoint without scraping logs).
 */
export function emitFinancialEvent(
  logger: Logger,
  payload: FinancialAuditPayload,
): void {
  logger.log(JSON.stringify(payload));
}

/**
 * Build the metadata object to attach to ConversationLog so the
 * /internal/financial-integrity endpoint can join attempts ↔ commits ↔
 * confirmations by sourceTextHash without scanning Railway logs.
 *
 * Kept minimal on purpose: anything more elaborate belongs in a
 * dedicated FinancialWriteLog table (deferred per the v1 plan).
 */
export function buildFinancialMetadata(
  payload: FinancialAuditPayload,
): Record<string, unknown> {
  return {
    audit: {
      event: payload.event,
      kind: payload.kind,
      ...(payload.recordId ? { recordId: payload.recordId } : {}),
      ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
      ...(payload.sourceTextHash
        ? { sourceTextHash: payload.sourceTextHash }
        : {}),
      ...(payload.reason ? { reason: payload.reason } : {}),
    },
  };
}
