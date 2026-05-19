import { Injectable, Logger } from '@nestjs/common';
import { canonicalizePhoneE164 } from '../../common/utils/phone.utils';

/**
 * AttributionQueue
 *
 * Buffer in-memory por proveedor (phone) que retiene mensajes de "atribución"
 * — frases con las que Chalán explica por qué actuó sobre un hecho aprendido
 * (ej: *"te mando como voz porque me dijiste que prefieres"*) — hasta el
 * último mensaje del turno actual del agente.
 *
 * ## Por qué existe
 *
 * Insight del diálogo cruzado con OpenClaw (Mayo 19, 2026; ver
 * `ubermench-docs/arquitectura/UNIVERSO_NEGOCIO.md` §13.2). Una atribución
 * en posición `buried` (3+ mensajes arriba del último del turno) tiene
 * peso ~0.1 como signal de `no_objection`. Una atribución en posición
 * `final` o `sole` pesa ~0.8-0.9. Garantizar posición final convierte el
 * pipeline downstream de promoción de hechos en algo confiable.
 *
 * ## Cómo se usa
 *
 * 1. Cuando el código decide expresar una atribución, llama
 *    `queue(phone, text)`. La atribución NO se envía inmediatamente.
 * 2. Al final del turno del agente — justo antes de mandar el último
 *    mensaje normal — el handler llama `flush(phone)` para obtener
 *    las atribuciones pendientes y concatenarlas al mensaje final.
 *
 * ## Por qué in-memory (no Redis)
 *
 * Las atribuciones solo viven mientras el turno está siendo procesado.
 * Un crash mid-turn no debería resurrectar atribuciones del siguiente
 * turno — se pierden, se vuelven a generar si siguen siendo relevantes.
 * In-memory es más simple, más rápido, y la pérdida en crash es
 * intencional, no bug.
 *
 * ## Estado actual
 *
 * Hoy no hay productores reales de atribuciones (Sprint 1 no las
 * genera). Esta clase está lista para cuando agreguemos provenance
 * tags + promoción de hechos en Sprint 2. Cero impacto runtime hasta
 * entonces.
 */
@Injectable()
export class AttributionQueue {
  private readonly logger = new Logger(AttributionQueue.name);
  private readonly pending = new Map<string, string[]>();

  /**
   * Encola una atribución para el proveedor. Múltiples atribuciones
   * en un mismo turno se concatenan en orden.
   */
  queue(phone: string, attribution: string): void {
    const key = canonicalizePhoneE164(phone);
    const trimmed = attribution.trim();
    if (!trimmed) return;

    const existing = this.pending.get(key) ?? [];
    existing.push(trimmed);
    this.pending.set(key, existing);
  }

  /**
   * Devuelve y limpia las atribuciones pendientes para el proveedor.
   * Si no hay nada en cola, devuelve null.
   */
  flush(phone: string): string | null {
    const key = canonicalizePhoneE164(phone);
    const attributions = this.pending.get(key);
    if (!attributions || attributions.length === 0) {
      return null;
    }
    this.pending.delete(key);
    return attributions.join('\n\n');
  }

  /**
   * ¿Hay atribuciones pendientes para este proveedor?
   * Útil para que el handler decida concatenar al último mensaje
   * de un turno vs emitirlas en uno propio.
   */
  hasPending(phone: string): boolean {
    const key = canonicalizePhoneE164(phone);
    const attributions = this.pending.get(key);
    return !!(attributions && attributions.length > 0);
  }

  /**
   * Combina un mensaje normal con las atribuciones pendientes, en el
   * orden recomendado: mensaje normal primero, atribución al final.
   * Garantiza que la atribución esté en posición `final` para maximizar
   * la atención del usuario.
   */
  appendTo(phone: string, finalMessage: string): string {
    const attributions = this.flush(phone);
    if (!attributions) return finalMessage;
    return `${finalMessage}\n\n${attributions}`;
  }

  /**
   * Limpia atribuciones pendientes sin emitirlas. Para casos de
   * cancelación de turno o cuando una atribución ya no aplica.
   */
  clear(phone: string): void {
    const key = canonicalizePhoneE164(phone);
    this.pending.delete(key);
  }

  /**
   * Solo para tests. Devuelve el conteo de atribuciones pendientes.
   */
  countPending(phone: string): number {
    const key = canonicalizePhoneE164(phone);
    return this.pending.get(key)?.length ?? 0;
  }
}
