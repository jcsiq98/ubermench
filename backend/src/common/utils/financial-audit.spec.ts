import { Logger } from '@nestjs/common';
import {
  sourceTextHash,
  emitFinancialEvent,
  buildFinancialMetadata,
  FINANCIAL_EVENT,
} from './financial-audit';

describe('financial-audit (Cap. 45 — M0)', () => {
  describe('sourceTextHash', () => {
    it('produces a stable 12-char hex hash for the same input', () => {
      const a = sourceTextHash('gasté 500 en material');
      const b = sourceTextHash('gasté 500 en material');
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{12}$/);
    });

    it('is invariant to surrounding whitespace and case', () => {
      const a = sourceTextHash('  Gasté   500   en MATERIAL  ');
      const b = sourceTextHash('gasté 500 en material');
      expect(a).toBe(b);
    });

    it('returns different hashes for different content', () => {
      expect(sourceTextHash('gasté 500')).not.toBe(sourceTextHash('gasté 600'));
    });

    it('returns empty string for empty/null input', () => {
      expect(sourceTextHash('')).toBe('');
      expect(sourceTextHash(null)).toBe('');
      expect(sourceTextHash(undefined)).toBe('');
      expect(sourceTextHash('   ')).toBe('');
    });
  });

  describe('emitFinancialEvent', () => {
    it('logs structured JSON with the event payload', () => {
      const logger = new Logger('test');
      const spy = jest.spyOn(logger, 'log').mockImplementation();
      emitFinancialEvent(logger, {
        event: FINANCIAL_EVENT.WRITE_COMMITTED,
        kind: 'expense',
        providerId: 'p1',
        amount: 500,
        recordId: 'e1',
        sourceTextHash: 'abc123',
      });
      expect(spy).toHaveBeenCalledTimes(1);
      const arg = spy.mock.calls[0][0] as string;
      const parsed = JSON.parse(arg) as {
        event: string;
        kind: string;
        recordId: string;
        sourceTextHash: string;
      };
      expect(parsed.event).toBe('financial_write_committed');
      expect(parsed.kind).toBe('expense');
      expect(parsed.recordId).toBe('e1');
      expect(parsed.sourceTextHash).toBe('abc123');
    });
  });

  describe('buildFinancialMetadata', () => {
    it('namespaces the audit data under `audit` and only includes set fields', () => {
      const meta = buildFinancialMetadata({
        event: FINANCIAL_EVENT.CONFIRMATION_SENT,
        kind: 'income',
        providerId: 'p1',
        amount: 1200,
        recordId: 'i1',
        sourceTextHash: 'hash123',
      });
      expect(meta).toEqual({
        audit: {
          event: 'financial_confirmation_sent',
          kind: 'income',
          recordId: 'i1',
          amount: 1200,
          sourceTextHash: 'hash123',
        },
      });
    });

    it('omits optional fields when not provided', () => {
      const meta = buildFinancialMetadata({
        event: FINANCIAL_EVENT.WRITE_FAILED,
        kind: 'expense',
        reason: 'db down',
      });
      const audit = (meta as { audit: Record<string, unknown> }).audit;
      expect(audit.event).toBe('financial_write_failed');
      expect(audit.reason).toBe('db down');
      expect(audit).not.toHaveProperty('recordId');
      expect(audit).not.toHaveProperty('amount');
      expect(audit).not.toHaveProperty('sourceTextHash');
    });
  });
});

describe('financial-audit (Cap. 47 — M1 pending lifecycle events)', () => {
  describe('FINANCIAL_EVENT — new event types', () => {
    it('exposes the three pending lifecycle event names', () => {
      expect(FINANCIAL_EVENT.PENDING_PLANTED).toBe('financial_pending_planted');
      expect(FINANCIAL_EVENT.PENDING_RESOLVED).toBe(
        'financial_pending_resolved',
      );
      expect(FINANCIAL_EVENT.PENDING_DISCARDED).toBe(
        'financial_pending_discarded',
      );
    });
  });

  describe('emitFinancialEvent — pending events', () => {
    it('serializes PENDING_PLANTED with pendingMissing and no kind', () => {
      const logger = new Logger('test');
      const spy = jest.spyOn(logger, 'log').mockImplementation();
      emitFinancialEvent(logger, {
        event: FINANCIAL_EVENT.PENDING_PLANTED,
        providerPhone: '+5215555550000',
        sourceTextHash: 'h1',
        pendingMissing: 'type',
      });
      expect(spy).toHaveBeenCalledTimes(1);
      const arg = spy.mock.calls[0][0] as string;
      const parsed = JSON.parse(arg) as Record<string, unknown>;
      expect(parsed.event).toBe('financial_pending_planted');
      expect(parsed.providerPhone).toBe('+5215555550000');
      expect(parsed.sourceTextHash).toBe('h1');
      expect(parsed.pendingMissing).toBe('type');
      expect(parsed.kind).toBeUndefined();
    });

    it('serializes PENDING_RESOLVED with kind, pendingMissing, and resolutionMs', () => {
      const logger = new Logger('test');
      const spy = jest.spyOn(logger, 'log').mockImplementation();
      emitFinancialEvent(logger, {
        event: FINANCIAL_EVENT.PENDING_RESOLVED,
        providerPhone: '+5215555550000',
        kind: 'expense',
        sourceTextHash: 'h1',
        pendingMissing: 'type',
        resolutionMs: 4321,
      });
      const arg = spy.mock.calls[0][0] as string;
      const parsed = JSON.parse(arg) as Record<string, unknown>;
      expect(parsed.event).toBe('financial_pending_resolved');
      expect(parsed.kind).toBe('expense');
      expect(parsed.resolutionMs).toBe(4321);
      expect(parsed.pendingMissing).toBe('type');
    });

    it('serializes PENDING_DISCARDED with reason and pendingMissing', () => {
      const logger = new Logger('test');
      const spy = jest.spyOn(logger, 'log').mockImplementation();
      emitFinancialEvent(logger, {
        event: FINANCIAL_EVENT.PENDING_DISCARDED,
        providerPhone: '+5215555550000',
        sourceTextHash: 'h1',
        pendingMissing: 'amount',
        reason: 'unrelated_reply',
      });
      const arg = spy.mock.calls[0][0] as string;
      const parsed = JSON.parse(arg) as Record<string, unknown>;
      expect(parsed.event).toBe('financial_pending_discarded');
      expect(parsed.reason).toBe('unrelated_reply');
      expect(parsed.pendingMissing).toBe('amount');
    });
  });

  describe('buildFinancialMetadata — new optional fields', () => {
    it('includes pendingMissing and resolutionMs when provided', () => {
      const meta = buildFinancialMetadata({
        event: FINANCIAL_EVENT.PENDING_RESOLVED,
        kind: 'income',
        sourceTextHash: 'hash123',
        pendingMissing: 'type',
        resolutionMs: 7000,
      });
      expect(meta).toEqual({
        audit: {
          event: 'financial_pending_resolved',
          kind: 'income',
          sourceTextHash: 'hash123',
          pendingMissing: 'type',
          resolutionMs: 7000,
        },
      });
    });

    it('omits kind when payload omits it (M1 plant-time case)', () => {
      const meta = buildFinancialMetadata({
        event: FINANCIAL_EVENT.PENDING_PLANTED,
        sourceTextHash: 'hash123',
        pendingMissing: 'type',
      });
      const audit = (meta as { audit: Record<string, unknown> }).audit;
      expect(audit).not.toHaveProperty('kind');
      expect(audit.pendingMissing).toBe('type');
    });
  });
});
