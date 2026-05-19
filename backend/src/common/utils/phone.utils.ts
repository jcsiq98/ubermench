/**
 * Canonical phone helpers for internal identity.
 *
 * WhatsApp may send Mexican mobile numbers as 521XXXXXXXXXX, while our DB
 * stores the stable E.164 form without the historical mobile "1": +52XXXXXXXXXX.
 */
export function canonicalizePhoneDigits(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');

  if (digits.length === 13 && digits.startsWith('521')) {
    digits = `52${digits.slice(3)}`;
  }

  return digits;
}

export function canonicalizePhoneE164(raw: string): string {
  const digits = canonicalizePhoneDigits(raw);
  return digits ? `+${digits}` : raw;
}

/**
 * Normalize a client phone for CRM / outbound WhatsApp.
 * Uses provider timezone as a hint for bare 10-digit numbers (MX vs US).
 */
export function normalizeContactPhone(
  raw: string,
  timezone = 'America/Mexico_City',
): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const e164 = canonicalizePhoneE164(trimmed);
    return e164.length > 1 ? e164 : null;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  const preferUs =
    timezone.startsWith('America/') &&
    !timezone.startsWith('America/Mexico') &&
    !timezone.startsWith('America/Cancun') &&
    !timezone.startsWith('America/Tijuana') &&
    !timezone.startsWith('America/Hermosillo') &&
    !timezone.startsWith('America/Chihuahua') &&
    !timezone.startsWith('America/Mazatlan');

  if (digits.length === 10) {
    return preferUs ? `+1${digits}` : `+52${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1') && preferUs) {
    return `+${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('52')) {
    return canonicalizePhoneE164(`+${digits}`);
  }

  if (digits.length >= 11) {
    return canonicalizePhoneE164(`+${digits}`);
  }

  return null;
}

export function formatPhoneForDisplay(e164: string): string {
  const digits = canonicalizePhoneDigits(e164);
  if (digits.startsWith('52') && digits.length === 12) {
    return `+52 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return canonicalizePhoneE164(e164);
}

export function phoneLookupVariants(raw: string): string[] {
  const originalDigits = (raw || '').replace(/\D/g, '');
  const canonicalDigits = canonicalizePhoneDigits(raw);
  const variants = new Set<string>();

  if (raw) variants.add(raw);
  if (originalDigits) {
    variants.add(originalDigits);
    variants.add(`+${originalDigits}`);
  }
  if (canonicalDigits) {
    variants.add(canonicalDigits);
    variants.add(`+${canonicalDigits}`);
  }

  if (canonicalDigits.startsWith('52') && canonicalDigits.length === 12) {
    const withMexicanMobilePrefix = `521${canonicalDigits.slice(2)}`;
    variants.add(withMexicanMobilePrefix);
    variants.add(`+${withMexicanMobilePrefix}`);
  }

  return [...variants];
}
