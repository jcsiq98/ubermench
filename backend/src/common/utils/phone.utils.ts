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
