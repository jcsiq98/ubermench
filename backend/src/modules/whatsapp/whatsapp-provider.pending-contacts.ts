/** Redis pending states for Sprint 1 — contacts & delegated send. */

export const PENDING_CONTACT_PHONE_PREFIX = 'wa_pending_contact_phone:';
export const PENDING_CONTACT_DISAMBIGUATION_PREFIX = 'wa_pending_contact_disambig:';
export const PENDING_DELEGATED_SEND_PREFIX = 'wa_pending_delegated_send:';
export const PENDING_CONTACT_FLOW_TTL = 600; // 10 minutes

export interface PaymentLinkFlowPayload {
  action?: 'payment_link' | 'reactivation' | 'collection_reminder';
  providerProfileId: string;
  amount?: number;
  description?: string;
  clientName?: string;
  sendToClient: boolean;
  paymentLinkId?: string;
  stripePaymentUrl?: string;
  messageHint?: string;
}

export interface PendingContactPhoneState {
  kind: 'contact_phone';
  payload: PaymentLinkFlowPayload;
  clientName: string;
  contactId?: string;
}

export interface PendingContactDisambiguationState {
  kind: 'contact_disambiguation';
  payload: PaymentLinkFlowPayload;
  clientName: string;
  candidateIds: string[];
}

export interface PendingDelegatedSendState {
  kind: 'delegated_send';
  action: 'payment_link' | 'reactivation' | 'collection_reminder';
  providerProfileId: string;
  businessLoopEventId?: string;
  paymentLinkId?: string;
  contactId: string;
  clientPhone: string;
  clientName: string;
  providerDisplayName: string;
  message: string;
  amount?: number;
  description?: string;
  stripePaymentUrl?: string;
}

const AFFIRMATIVE = new Set([
  'si',
  'sí',
  'sip',
  'dale',
  'va',
  'ok',
  'okay',
  'listo',
  'mándalo',
  'mandalo',
  'envíalo',
  'envialo',
  'envía',
  'envia',
  'adelante',
  'confirmo',
  'confirmado',
  'yes',
]);

const NEGATIVE = new Set([
  'no',
  'nop',
  'nope',
  'nel',
  'mejor no',
  'cancela',
  'cancelar',
  'olvídalo',
  'olvidalo',
  'no mandes',
  'no le mandes',
]);

export function isAffirmativeReply(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (AFFIRMATIVE.has(normalized)) return true;
  return /^(si|sí|dale|va|ok)\b/.test(normalized);
}

export function isNegativeReply(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (NEGATIVE.has(normalized)) return true;
  return /^no\b/.test(normalized) || normalized.includes('mejor no');
}

export function extractPhoneFromText(text: string): string | null {
  const match = text.match(/(\+?\d[\d\s\-().]{8,}\d)/);
  return match ? match[1].trim() : null;
}

export function parseDisambiguationChoice(
  text: string,
  maxOptions: number,
): number | null {
  const trimmed = text.trim().toLowerCase();
  const digit = trimmed.match(/^(\d{1,2})\b/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n >= 1 && n <= maxOptions) return n - 1;
  }
  if (trimmed.includes('primera') || trimmed.includes('primer')) return 0;
  if (trimmed.includes('segunda') || trimmed.includes('segundo')) return 1;
  return null;
}

export function buildDelegatedClientMessage(opts: {
  clientName: string;
  providerDisplayName: string;
  amount: number;
  description?: string;
  url: string;
}): string {
  const amountFormatted = opts.amount.toLocaleString('es-MX');
  let msg =
    `Hola ${opts.clientName}, soy el Chalán de ${opts.providerDisplayName}. ` +
    `Te paso el link de pago por *$${amountFormatted}*`;
  if (opts.description) {
    msg += ` (${opts.description})`;
  }
  msg += `.\n\n💳 Paga aquí: ${opts.url}\n\nPuedes pagar con tarjeta.`;
  return msg;
}

export function buildReactivationClientMessage(opts: {
  clientName: string;
  providerDisplayName: string;
  description?: string;
}): string {
  const reason = opts.description?.trim()
    ? ` por ${opts.description.trim()}`
    : '';
  return (
    `Hola ${opts.clientName}, soy el Chalán de ${opts.providerDisplayName}. ` +
    `Hace rato que no vemos lo de tu servicio${reason}. ` +
    '¿Quieres que mi maestro te agende una vuelta esta semana?'
  );
}

export function buildCollectionReminderMessage(opts: {
  clientName: string;
  providerDisplayName: string;
  amount: number;
  description?: string;
  url: string;
}): string {
  const amountFormatted = opts.amount.toLocaleString('es-MX');
  let msg =
    `Hola ${opts.clientName}, soy el Chalán de ${opts.providerDisplayName}. ` +
    `Te recuerdo el pago pendiente de *$${amountFormatted}*`;
  if (opts.description) {
    msg += ` por ${opts.description}`;
  }
  msg += `.\n\n💳 Aquí está el link: ${opts.url}`;
  return msg;
}
