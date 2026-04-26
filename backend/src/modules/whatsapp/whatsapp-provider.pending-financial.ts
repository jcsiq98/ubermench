import type { FinancialKind } from '../../common/utils/financial-audit';

// ──────────────────────────────────────────────
// Pending financial clarification helpers (Cap. 47 — M1)
// ──────────────────────────────────────────────
//
// Cap. 44 closed two LLM failure modes: (a) fake confirmations, and
// (b) invented financial figures — both with a post-LLM firewall that
// only fires when the user message itself contains a financial verb.
//
// The Vero bug pattern slips past that firewall:
//
//   turno 1 user:   "lavandería 200"          ← no verb
//   turno 1 chalán: "¿es un gasto o un ingreso?"
//   turno 2 user:   "gasto"                    ← still no verb
//   turno 2 chalán: "✅ Gasto registrado $200 lavandería"
//   DB:             (no record)
//
// The firewall does not retry because `userMessageHasFinancialVerb('gasto')`
// is false — `gasto` (noun) is not in the verb list, only `gasto en` is.
// The fake confirmation gets sent verbatim and the integrity endpoint
// (Cap. 45 / M0) reports an orphaned `financial_confirmation_sent`.
//
// M1 closes this with a deterministic state machine that bypasses the
// LLM on the resolution turn:
//
//   1. Post-firewall hook (turno 1) detects an outgoing clarification
//      question with a known shape AND only plants pending state if the
//      user message carries enough deterministic data to complete the
//      transaction once the missing field arrives.
//   2. Pre-AI hook (turno 2) reads pending and matches the answer
//      against a small closed taxonomy. On match: call existing
//      `handleRegistrarGasto` / `handleRegistrarIngreso` directly with
//      the original `sourceTextHash`, skip the LLM. On non-match:
//      discard pending and let the LLM handle the turn fresh.
//
// Scope cap (M1): single missing field, restricted to `type` and `amount`.
// `description`-only pending is deferred until data justifies adding it.
//
// AB-02 note: this file is pure helpers. No global tool change, no
// system prompt change, no Prisma schema change. The mitigations all
// land in the handler in subsequent commits.

export const PENDING_FIN_PREFIX = 'wa_pending_financial:';
export const PENDING_FIN_TTL = 600; // 10 minutes — same shape as wa_pending_timezone

/**
 * Which field the assistant just asked for. M1 deliberately omits
 * `description` — those cases stay on the LLM-only path until we have
 * data showing it's worth adding.
 */
export type MissingFinancialField = 'type' | 'amount';

export interface PendingFinancialState {
  amount?: number;
  description?: string;
  missing: MissingFinancialField;
  /**
   * Optional hint inferred from the original user text (e.g. user said
   * "compré X" → expense). For `missing: 'amount'` it is required by
   * `shouldPlantPending`; for `missing: 'type'` it is a bonus that we
   * do not act on (the user's explicit answer always wins).
   */
  possibleType?: FinancialKind;
  /**
   * Hash of the original ambiguous user message (Cap. 45 / M0). When
   * the resolution turn writes to the DB, the same hash is reused so
   * `WRITE_ATTEMPTED → WRITE_COMMITTED → CONFIRMATION_SENT` join
   * cleanly with the original turn in the integrity endpoint.
   */
  sourceTextHash: string;
  originalUserText: string;
  createdAt: number;
}

// ─── 1. Detector: clarification question shape ─────────────────────

const HAS_QUESTION_MARK = /[¿?]/;

const TYPE_QUESTION_PATTERNS: RegExp[] = [
  // "gasto o ingreso", "cobro o gasto" — distinctive disjunction shape.
  /\b(gasto|cobro|pago|ingreso)\s+o\s+(un\s+|una\s+)?(gasto|cobro|pago|ingreso)\b/i,
  // "¿es un gasto?" / "¿fue gasto?" — copular question, requires ¿ to
  // avoid matching declarative sentences like "es un gasto".
  /¿\s*(es|fue|era|son)\s+(un\s+|una\s+)?(gasto|ingreso|cobro|pago)\b/i,
];

const AMOUNT_QUESTION_PATTERNS: RegExp[] = [
  /¿\s*(de\s+)?cu[áa]nto\b/i,
  /\bcu[áa]nto\s+(fue|es|era|son|cobr|gast|pag|recib|deposit)/i,
  /\bcu[áa]l\s+(fue|es|era)\s+(el\s+)?monto\b/i,
];

/**
 * Returns the missing field implied by the assistant's outgoing text,
 * or `null` if it does not look like a financial clarification question.
 *
 * We require an actual question mark (¿ or ?) to fire. Without it,
 * declarative sentences like "tu gasto o ingreso de la semana" would
 * trip the type-pattern as a false positive.
 */
export function looksLikeFinancialClarificationQuestion(
  text: string,
): { kind: MissingFinancialField } | null {
  if (!text) return null;
  if (!HAS_QUESTION_MARK.test(text)) return null;
  if (TYPE_QUESTION_PATTERNS.some((p) => p.test(text))) {
    return { kind: 'type' };
  }
  if (AMOUNT_QUESTION_PATTERNS.some((p) => p.test(text))) {
    return { kind: 'amount' };
  }
  return null;
}

// ─── 2. Extractor: amount + description from the user message ──────

/**
 * Money matchers, tried in priority order. The first match wins so
 * "$1,200" beats the bare-number fallback. Each match captures the
 * raw numeric span; `parseAmount` does the locale-aware normalization.
 */
const MONEY_REGEXES: Array<{ re: RegExp; factor?: number }> = [
  // "$200", "$1,200.50"
  { re: /\$\s*(\d+(?:[.,]\d+)*)/ },
  // "200 pesos", "1,200 mxn", "50 usd"
  { re: /(\d+(?:[.,]\d+)*)\s*(?:pesos?|mxn|usd)\b/i },
  // "3 mil" → 3000. Multiplier is applied by `extractMoneyAndDesc`.
  { re: /(\d+)\s*mil\b/i, factor: 1000 },
  // Bare amount: ≥2 digits OR comma-thousands form. ≥2 digits avoids
  // capturing noise like "1 cosa" or "el 5 de mayo".
  { re: /(?:^|\s)((?:\d{1,3}(?:,\d{3})+|\d{2,})(?:\.\d+)?)(?:\s|$)/ },
];

/**
 * Mexican-locale-aware numeric parsing. Comma is thousands separator
 * by default ("1,200" = 1200) unless the right segment is ≤2 digits in
 * which case it's treated as a decimal comma. Mixed "1,200.50" treats
 * the last separator as decimal. Single dot follows JS native (decimal).
 *
 * Rejects NaN, infinite, and ≤0 amounts so callers don't have to.
 */
function parseAmount(raw: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim();
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  let normalized: string;
  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastDot > lastComma) {
      // "1,200.50" — dot is decimal, commas are thousands.
      normalized = cleaned.replace(/,/g, '');
    } else {
      // "1.200,50" — comma is decimal, dots are thousands.
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    const right = parts[parts.length - 1];
    if (right.length === 3 && parts.length >= 2) {
      // "1,200" / "1,200,000" — thousands.
      normalized = cleaned.replace(/,/g, '');
    } else {
      // "1,20" / "1,2" — decimal comma.
      normalized = cleaned.replace(',', '.');
    }
  } else {
    normalized = cleaned;
  }

  const num = parseFloat(normalized);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
}

/**
 * Build a clean description from the leftover text after the amount
 * span is stripped. Filler removal is conservative (Spanish articles,
 * prepositions, copular forms) so the output stays close to what the
 * user typed.
 */
function cleanDescription(raw: string): string | undefined {
  const cleaned = raw
    .replace(/[.,;:!?¿¡]/g, ' ')
    .replace(/\$/g, ' ')
    .replace(
      /\b(de|en|por|para|con|el|la|los|las|un|una|unos|unas|y|fue|son|es|era)\b/giu,
      ' ',
    )
    .replace(/\bpesos?\b|\bmxn\b|\busd\b|\bmil\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Extracts the (single) money amount and a description from a user
 * message. Both fields are independent: `extractMoneyAndDesc('lavandería')`
 * returns `{ description: 'lavandería' }` with no amount.
 */
export function extractMoneyAndDesc(text: string): {
  amount?: number;
  description?: string;
} {
  if (!text) return {};
  const trimmed = text.trim();
  if (!trimmed) return {};

  let amount: number | undefined;
  let amountSpan: { start: number; end: number } | null = null;

  for (const { re, factor = 1 } of MONEY_REGEXES) {
    const m = re.exec(trimmed);
    if (!m || m.index === undefined) continue;
    const captured = m[1];
    const parsed = parseAmount(captured);
    if (parsed === undefined) continue;
    amount = parsed * factor;
    amountSpan = { start: m.index, end: m.index + m[0].length };
    break;
  }

  let description: string | undefined;
  if (amountSpan) {
    const before = trimmed.slice(0, amountSpan.start);
    const after = trimmed.slice(amountSpan.end);
    description = cleanDescription(`${before} ${after}`);
  } else {
    description = cleanDescription(trimmed);
  }

  return {
    ...(amount !== undefined ? { amount } : {}),
    ...(description ? { description } : {}),
  };
}

// ─── 3. Inference: possibleType from the user's verbs ──────────────

// `\b` in JavaScript is ASCII-only even under the /u flag — it would
// fail at the right boundary of words ending in accented vowels
// (`pagué`, `compré`, `recibí`, `me cobró`). We use Unicode property
// lookarounds instead so accented letters are treated as letters.
const EXPENSE_VERB =
  /(?<!\p{L})(?:gast[eéo]|pagu[eé]|compr[eéo]|me\s+cobraron|me\s+cobr[oó])(?!\p{L})/iu;
const INCOME_VERB =
  /(?<!\p{L})(?:cobr[eéoó]|me\s+pagaron|me\s+pag[oó]|me\s+depositaron|me\s+deposit[oó]|me\s+dieron|recib[ií])(?!\p{L})/iu;

/**
 * Maps a free-text user message to `'expense'` / `'income'` based on
 * the verb the user used. Order matters: expense alternatives are
 * tested first because "me cobraron" (someone charged me → expense)
 * must not be parsed as the bare "cobr-" form (income).
 *
 * Returns `undefined` when the text has no financial verb (e.g. the
 * Vero shape "lavandería 200").
 */
export function inferPossibleType(
  userText: string,
): FinancialKind | undefined {
  if (!userText) return undefined;
  if (EXPENSE_VERB.test(userText)) return 'expense';
  if (INCOME_VERB.test(userText)) return 'income';
  return undefined;
}

// ─── 4. Plant decision ─────────────────────────────────────────────

export type PlantDecision =
  | {
      plant: true;
      state: Omit<PendingFinancialState, 'sourceTextHash' | 'createdAt'>;
    }
  | { plant: false; reason: PlantSkipReason };

export type PlantSkipReason =
  | 'missing_type_needs_amount'
  | 'missing_type_needs_description'
  | 'missing_amount_needs_description'
  | 'missing_amount_needs_possible_type'
  | 'unknown_question_kind';

/**
 * Decides whether the assistant's clarification question can be paired
 * with enough deterministic data from the user message to plant pending.
 * If we cannot guarantee a deterministic resolution on the next turn,
 * we do NOT plant — the LLM keeps owning the conversation.
 *
 * Per the M1 spec:
 *   - missing=type    → requires amount + description
 *   - missing=amount  → requires description + possibleType
 *
 * The caller still has to attach `sourceTextHash` and `createdAt` from
 * the live turn before persisting the state to Redis.
 */
export function shouldPlantPending(
  questionKind: MissingFinancialField,
  userText: string,
): PlantDecision {
  const { amount, description } = extractMoneyAndDesc(userText);
  const possibleType = inferPossibleType(userText);

  if (questionKind === 'type') {
    if (amount === undefined) {
      return { plant: false, reason: 'missing_type_needs_amount' };
    }
    if (!description) {
      return { plant: false, reason: 'missing_type_needs_description' };
    }
    return {
      plant: true,
      state: {
        amount,
        description,
        missing: 'type',
        ...(possibleType ? { possibleType } : {}),
        originalUserText: userText,
      },
    };
  }

  if (questionKind === 'amount') {
    if (!description) {
      return { plant: false, reason: 'missing_amount_needs_description' };
    }
    if (!possibleType) {
      return { plant: false, reason: 'missing_amount_needs_possible_type' };
    }
    return {
      plant: true,
      state: {
        description,
        missing: 'amount',
        possibleType,
        originalUserText: userText,
      },
    };
  }

  return { plant: false, reason: 'unknown_question_kind' };
}

// ─── 5. Resolver: classify the user's reply ────────────────────────

/**
 * Hard cap on reply length. Real answers are short ("gasto", "$200").
 * Anything longer is almost certainly a new intent or a tangential
 * comment — discard rather than risk hijacking a different command.
 */
const REPLY_LENGTH_CAP = 30;

const OTHER_INTENT_DATE =
  /\b(mañana|hoy|ayer|antier|pasado\s+mañana|lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)\b/iu;
const OTHER_INTENT_VERB =
  /\b(ag[ée]ndame|agendar|agenda|recu[ée]rdame|recordar|cancela|cancelar|borra|borrar|elimina|eliminar|mu[ée]vela|mover|c[áa]mbiala|cambiar|reagenda|p[áa]sala|crea|crear|configura|configurar|quita|quitar|edita|editar|corrige|corregir|modifica|modificar)\b/iu;
const OTHER_INTENT_TIME = /\b\d{1,2}:\d{2}\b/;
const OTHER_INTENT_PHONE = /\b\d{10,}\b/;

/**
 * Strong "this is a different intent, drop pending" signal. Any of:
 * date keywords (citas/recordatorios), schedule/management verbs,
 * a `HH:MM` time, or a long digit run that looks like a phone number.
 */
function looksLikeOtherIntent(text: string): boolean {
  return (
    OTHER_INTENT_DATE.test(text) ||
    OTHER_INTENT_VERB.test(text) ||
    OTHER_INTENT_TIME.test(text) ||
    OTHER_INTENT_PHONE.test(text)
  );
}

const EXPENSE_ANSWER =
  /^(es\s+|fue\s+|un\s+|una\s+)*(gast[eéo]|pagu[eé]|compr[eéo]|me\s+cobraron|me\s+cobr[oó])\s*$/iu;
const INCOME_ANSWER =
  /^(es\s+|fue\s+|un\s+)*(ingreso|cobr[eéoó]|me\s+pagaron|me\s+pag[oó]|me\s+depositaron|me\s+deposit[oó]|me\s+dieron|recib[ií])\s*$/iu;

function stripPunctuation(text: string): string {
  return text.replace(/[¿?!.,;:¡]/g, ' ').replace(/\s+/g, ' ').trim();
}

export type ResolutionResult =
  | { kind: 'expense' }
  | { kind: 'income' }
  | { kind: 'amount'; amount: number }
  | { kind: 'unrelated' };

/**
 * Classifies the user's reply against a planted pending state.
 *
 * Acceptance is deliberately strict: when in doubt the resolver
 * returns `unrelated`. The handler then discards pending and lets
 * the LLM handle the turn fresh — preserving user agency. False
 * negatives (we ask for clarification when we shouldn't) are mildly
 * annoying; false positives (we record an expense from "agéndame
 * mañana") would be catastrophic.
 */
export function classifyPendingResolution(
  reply: string,
  pending: Pick<PendingFinancialState, 'missing'>,
): ResolutionResult {
  if (!reply) return { kind: 'unrelated' };
  const trimmed = reply.trim();
  if (!trimmed) return { kind: 'unrelated' };
  if (trimmed.length > REPLY_LENGTH_CAP) return { kind: 'unrelated' };
  if (looksLikeOtherIntent(trimmed)) return { kind: 'unrelated' };

  if (pending.missing === 'type') {
    const norm = stripPunctuation(trimmed);
    if (EXPENSE_ANSWER.test(norm)) return { kind: 'expense' };
    if (INCOME_ANSWER.test(norm)) return { kind: 'income' };
    return { kind: 'unrelated' };
  }

  if (pending.missing === 'amount') {
    const { amount } = extractMoneyAndDesc(trimmed);
    if (amount !== undefined) return { kind: 'amount', amount };
    return { kind: 'unrelated' };
  }

  return { kind: 'unrelated' };
}
