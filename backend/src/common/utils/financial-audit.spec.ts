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
