import { AttributionQueue } from './attribution-queue';

describe('AttributionQueue', () => {
  const PHONE = '+526565884840';

  let queue: AttributionQueue;

  beforeEach(() => {
    queue = new AttributionQueue();
  });

  it('starts empty for any phone', () => {
    expect(queue.hasPending(PHONE)).toBe(false);
    expect(queue.countPending(PHONE)).toBe(0);
    expect(queue.flush(PHONE)).toBeNull();
  });

  it('queues and flushes a single attribution', () => {
    queue.queue(PHONE, 'te mando como voz porque me dijiste que prefieres');
    expect(queue.hasPending(PHONE)).toBe(true);
    expect(queue.countPending(PHONE)).toBe(1);

    const flushed = queue.flush(PHONE);
    expect(flushed).toBe('te mando como voz porque me dijiste que prefieres');
    expect(queue.hasPending(PHONE)).toBe(false);
  });

  it('concatenates multiple attributions in order with blank lines', () => {
    queue.queue(PHONE, 'primera atribución');
    queue.queue(PHONE, 'segunda atribución');
    queue.queue(PHONE, 'tercera');

    const flushed = queue.flush(PHONE);
    expect(flushed).toBe('primera atribución\n\nsegunda atribución\n\ntercera');
    expect(queue.countPending(PHONE)).toBe(0);
  });

  it('ignores empty strings', () => {
    queue.queue(PHONE, '');
    queue.queue(PHONE, '   ');
    expect(queue.hasPending(PHONE)).toBe(false);
  });

  it('trims attributions on queue', () => {
    queue.queue(PHONE, '   espacios extra   ');
    expect(queue.flush(PHONE)).toBe('espacios extra');
  });

  it('appendTo merges attributions at the end of the final message', () => {
    queue.queue(PHONE, 'porque me dijiste que prefieres voz');
    const result = queue.appendTo(PHONE, 'aquí está tu resumen');
    expect(result).toBe(
      'aquí está tu resumen\n\nporque me dijiste que prefieres voz',
    );
    expect(queue.hasPending(PHONE)).toBe(false);
  });

  it('appendTo without pending returns the message unchanged', () => {
    expect(queue.appendTo(PHONE, 'sin atribución')).toBe('sin atribución');
  });

  it('isolates queues per phone (canonicalized)', () => {
    queue.queue('+526565884840', 'para José Carlos');
    queue.queue('+15555550100', 'para otro');

    expect(queue.countPending('+526565884840')).toBe(1);
    expect(queue.countPending('+15555550100')).toBe(1);

    expect(queue.flush('+526565884840')).toBe('para José Carlos');
    expect(queue.countPending('+526565884840')).toBe(0);
    expect(queue.countPending('+15555550100')).toBe(1);
  });

  it('canonicalizes WhatsApp Mexican mobile prefix 521 ↔ 52', () => {
    queue.queue('5216565884840', 'desde formato WhatsApp');
    expect(queue.countPending('+526565884840')).toBe(1);
    expect(queue.flush('+526565884840')).toBe('desde formato WhatsApp');
  });

  it('clear() drops pending without flushing', () => {
    queue.queue(PHONE, 'atribución que ya no aplica');
    queue.clear(PHONE);
    expect(queue.hasPending(PHONE)).toBe(false);
    expect(queue.flush(PHONE)).toBeNull();
  });
});
