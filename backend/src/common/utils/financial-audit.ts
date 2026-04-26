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
  // ── Cap. 47 / M1 — pending clarification lifecycle events ──
  // Logger-only by design. Not persisted in ConversationLog.metadata
  // (Cap. 45 reserved that channel for CONFIRMATION_SENT, which is
  // the only event needed to verify the structural promise "if Chalán
  // confirmed, it exists in the DB"). These three are observability
  // of the pending state machine flow — useful for grep/Railway, not
  // for the integrity endpoint.
  PENDING_PLANTED: 'financial_pending_planted',
  PENDING_RESOLVED: 'financial_pending_resolved',
  PENDING_DISCARDED: 'financial_pending_discarded',
} as const;

export type FinancialEvent =
  (typeof FINANCIAL_EVENT)[keyof typeof FINANCIAL_EVENT];

export type FinancialKind = 'expense' | 'income';

export interface FinancialAuditPayload {
  event: FinancialEvent;
  providerId?: string;
  providerPhone?: string;
  /**
   * Optional in M1: pending lifecycle events at plant or discard time
   * may not yet know the kind (when `pendingMissing === 'type'`, the
   * whole point is that we don't know expense vs. income yet). All
   * pre-Cap.47 call sites pass kind explicitly, so this widening is
   * backward compatible.
   */
  kind?: FinancialKind;
  amount?: number;
  recordId?: string;
  sourceTextHash?: string;
  reason?: string;
  // ── Cap. 47 / M1 fields ────────────────────────────────────
  /** Which field the pending entry was waiting for. */
  pendingMissing?: 'type' | 'amount';
  /**
   * Wall-clock milliseconds elapsed between plant and the lifecycle
   * event (resolved/discarded). Useful to spot pendings that never
   * resolve within a reasonable window — high values signal the
   * detector fired on a turn the user didn't intend as a question.
   */
  resolutionMs?: number;
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
      ...(payload.kind ? { kind: payload.kind } : {}),
      ...(payload.recordId ? { recordId: payload.recordId } : {}),
      ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
      ...(payload.sourceTextHash
        ? { sourceTextHash: payload.sourceTextHash }
        : {}),
      ...(payload.reason ? { reason: payload.reason } : {}),
      ...(payload.pendingMissing
        ? { pendingMissing: payload.pendingMissing }
        : {}),
      ...(payload.resolutionMs !== undefined
        ? { resolutionMs: payload.resolutionMs }
        : {}),
    },
  };
}
