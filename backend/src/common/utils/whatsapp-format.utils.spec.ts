import { sanitizeForWhatsApp } from './whatsapp-format.utils';

describe('sanitizeForWhatsApp', () => {
  // ── Bold ──────────────────────────────────────────────────
  it('converts **bold** to *bold*', () => {
    expect(sanitizeForWhatsApp('Llevas **$3,200** esta semana.'))
      .toBe('Llevas *$3,200* esta semana.');
  });

  it('converts ***bold+italic*** to *bold+italic*', () => {
    expect(sanitizeForWhatsApp('***Importante***'))
      .toBe('*Importante*');
  });

  it('leaves already-correct *bold* untouched', () => {
    expect(sanitizeForWhatsApp('Llevas *$3,200* esta semana.'))
      .toBe('Llevas *$3,200* esta semana.');
  });

  it('handles multiple **bold** spans in one line', () => {
    expect(sanitizeForWhatsApp('**Ingresos**: **$5,000** | **Gastos**: **$2,000**'))
      .toBe('*Ingresos*: *$5,000* | *Gastos*: *$2,000*');
  });

  // ── Italic ────────────────────────────────────────────────
  it('converts __italic__ to _italic_', () => {
    expect(sanitizeForWhatsApp('__nota importante__'))
      .toBe('_nota importante_');
  });

  // ── Headings ──────────────────────────────────────────────
  it('converts ## Heading to *Heading*', () => {
    expect(sanitizeForWhatsApp('## Resumen Semanal'))
      .toBe('*Resumen Semanal*');
  });

  it('converts ### Sub-heading to *Sub-heading*', () => {
    expect(sanitizeForWhatsApp('### Gastos por categoría'))
      .toBe('*Gastos por categoría*');
  });

  // ── Links ─────────────────────────────────────────────────
  it('converts [text](url) to text (url)', () => {
    expect(sanitizeForWhatsApp('Paga aquí: [Link de pago](https://pay.stripe.com/abc)'))
      .toBe('Paga aquí: Link de pago (https://pay.stripe.com/abc)');
  });

  // ── Tables ────────────────────────────────────────────────
  it('converts markdown tables to plain text', () => {
    const input = '| Categoría | Monto |\n|---|---|\n| Material | $500 |\n| Comida | $200 |';
    const output = sanitizeForWhatsApp(input);
    expect(output).not.toContain('|');
    expect(output).toContain('Categoría');
    expect(output).toContain('$500');
    expect(output).toContain('Material');
  });

  it('removes table separator rows', () => {
    const input = '| A | B |\n|---|---|\n| 1 | 2 |';
    const output = sanitizeForWhatsApp(input);
    expect(output).not.toMatch(/^[\s\-:|]+$/m);
  });

  // ── Edge cases ────────────────────────────────────────────
  it('returns empty string for empty input', () => {
    expect(sanitizeForWhatsApp('')).toBe('');
  });

  it('handles null/undefined gracefully', () => {
    expect(sanitizeForWhatsApp(null as any)).toBe(null);
    expect(sanitizeForWhatsApp(undefined as any)).toBe(undefined);
  });

  it('does not mangle plain text without markdown', () => {
    const plain = 'Anotado, maestro. $1,200 en efectivo.';
    expect(sanitizeForWhatsApp(plain)).toBe(plain);
  });

  it('cleans up excessive blank lines', () => {
    const input = 'Line 1\n\n\n\n\nLine 2';
    expect(sanitizeForWhatsApp(input)).toBe('Line 1\n\nLine 2');
  });

  // ── Real-world LLM output ─────────────────────────────────
  it('sanitizes a realistic gpt-4o-mini response', () => {
    const llmOutput = `## Resumen del mes

**Ingresos:** $12,500
**Gastos:** $4,200
**Balance:** $8,300

Aquí tienes el desglose:

| Categoría | Total |
|---|---|
| Material | $2,000 |
| Transporte | $1,200 |
| Comida | $1,000 |

Si necesitas más detalle, dime.`;

    const result = sanitizeForWhatsApp(llmOutput);

    expect(result).not.toContain('**');
    expect(result).not.toContain('##');
    expect(result).not.toContain('|');
    expect(result).toContain('*Resumen del mes*');
    expect(result).toContain('*Ingresos:*');
    expect(result).toContain('$12,500');
  });
});
