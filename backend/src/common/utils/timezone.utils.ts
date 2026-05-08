const DEFAULT_TZ = 'America/Mexico_City';

/**
 * Convert a UTC Date to a "wall-clock" Date in the given IANA timezone.
 * The returned Date's getHours/getDate/etc. reflect local time.
 */
export function toLocalTime(utcDate: Date, tz: string = DEFAULT_TZ): Date {
  const str = utcDate.toLocaleString('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return new Date(str);
}

/**
 * Convert wall-clock time in a given timezone to a proper UTC Date.
 * Uses Intl to resolve the correct UTC offset (handles DST automatically).
 */
export function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  tz: string = DEFAULT_TZ,
): Date {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const localStr = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  });

  // Create a rough UTC estimate, then use Intl to find the actual offset
  const roughUtc = new Date(`${localStr}Z`);
  const parts = formatter.formatToParts(roughUtc);
  const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || '+00:00';

  // Parse offset like "GMT-06:00" or "GMT+05:30"
  const offsetMatch = tzPart.match(/GMT([+-])(\d{2}):(\d{2})/);
  let offsetMinutes = 0;
  if (offsetMatch) {
    const sign = offsetMatch[1] === '+' ? 1 : -1;
    offsetMinutes = sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3]));
  }

  // Wall clock = UTC + offset → UTC = Wall clock - offset
  const utcMs = new Date(`${localStr}Z`).getTime() - offsetMinutes * 60_000;

  // Verify: the offset at the actual UTC time might differ (DST edge).
  // Re-check with the computed UTC time.
  const verifyParts = formatter.formatToParts(new Date(utcMs));
  const verifyTz = verifyParts.find((p) => p.type === 'timeZoneName')?.value || '+00:00';
  const verifyMatch = verifyTz.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (verifyMatch) {
    const vSign = verifyMatch[1] === '+' ? 1 : -1;
    const vOffset = vSign * (parseInt(verifyMatch[2]) * 60 + parseInt(verifyMatch[3]));
    if (vOffset !== offsetMinutes) {
      return new Date(new Date(`${localStr}Z`).getTime() - vOffset * 60_000);
    }
  }

  return new Date(utcMs);
}

/**
 * Get UTC start and end of "today" in the given timezone.
 */
export function getLocalDayRange(
  tz: string = DEFAULT_TZ,
  date?: Date,
): { start: Date; end: Date } {
  const local = toLocalTime(date || new Date(), tz);
  const y = local.getFullYear();
  const m = local.getMonth();
  const d = local.getDate();

  const start = wallClockToUtc(y, m, d, 0, 0, tz);
  const end = wallClockToUtc(y, m, d, 23, 59, tz);
  end.setUTCSeconds(59, 999);

  return { start, end };
}

/**
 * Get UTC start and end of "tomorrow" in the given timezone.
 */
export function getTomorrowRange(tz: string = DEFAULT_TZ): { start: Date; end: Date } {
  const tomorrow = new Date(Date.now() + 86_400_000);
  return getLocalDayRange(tz, tomorrow);
}

/**
 * Format a UTC Date as a localized date string in the given timezone.
 */
export function formatDate(
  date: Date,
  tz: string = DEFAULT_TZ,
  options?: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
    ...options,
  });
}

/**
 * Format a UTC Date as a localized time string in the given timezone.
 */
export function formatTime(
  date: Date,
  tz: string = DEFAULT_TZ,
): string {
  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  });
}

/**
 * Get the current hour (0-23) in the given timezone. Used by cron jobs
 * to check "is it 7am for this provider?"
 */
export function getLocalHour(tz: string = DEFAULT_TZ): number {
  return toLocalTime(new Date(), tz).getHours();
}

/**
 * Get the current day of the month in the given timezone.
 */
export function getLocalDayOfMonth(tz: string = DEFAULT_TZ): number {
  return toLocalTime(new Date(), tz).getDate();
}

/**
 * Get the ISO date string (YYYY-MM-DD) for "today" in the given timezone.
 */
export function getLocalISODate(tz: string = DEFAULT_TZ): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

/**
 * Get the current day-of-week (0=Sun..6=Sat) in the given timezone.
 */
export function getLocalDayOfWeek(tz: string = DEFAULT_TZ): number {
  return toLocalTime(new Date(), tz).getDay();
}

/**
 * Get the next occurrence of a named day of the week, relative to "now" in the given timezone.
 */
export function getNextDayOfWeek(dayName: string, tz: string = DEFAULT_TZ): Date {
  const days: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2,
    'miércoles': 3, miercoles: 3,
    jueves: 4, viernes: 5,
    'sábado': 6, sabado: 6,
  };

  const targetDay = days[dayName.split(' ')[0]];
  if (targetDay === undefined) return toLocalTime(new Date(), tz);

  const now = toLocalTime(new Date(), tz);
  const currentDay = now.getDay();
  let daysAhead = targetDay - currentDay;
  if (daysAhead <= 0) daysAhead += 7;

  const result = new Date(now);
  result.setDate(result.getDate() + daysAhead);
  return result;
}

/**
 * Parse wall-clock date+time in a timezone and return UTC Date.
 * Shared logic for appointments and reminders.
 */
export function parseScheduledDate(
  dateStr?: string,
  timeStr?: string,
  tz: string = DEFAULT_TZ,
): Date | null {
  if (!dateStr && !timeStr) return null;

  const now = toLocalTime(new Date(), tz);

  const combinedText = `${dateStr || ''} ${timeStr || ''}`.trim();
  const parsedTime = parseWallClockTime(timeStr || combinedText, Boolean(timeStr));
  const hours = parsedTime?.hours ?? 9;
  const minutes = parsedTime?.minutes ?? 0;

  if (!dateStr && timeStr) {
    const date = new Date(now);
    date.setHours(hours, minutes, 0, 0);
    if (date <= now) {
      date.setDate(date.getDate() + 1);
    }
    return wallClockToUtc(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, tz);
  }

  try {
    let localDate: Date;
    const lower = (dateStr || '').toLowerCase().trim();

    const spanishDate = parseSpanishMonthDate(lower, now);

    if (spanishDate) {
      localDate = spanishDate;
    } else if (lower.includes('pasado mañana') || lower.includes('pasado manana')) {
      localDate = new Date(now);
      localDate.setDate(localDate.getDate() + 2);
    } else if (lower === 'hoy' || lower === 'today' || /\bhoy\b/.test(lower)) {
      localDate = new Date(now);
    } else if (lower === 'mañana' || lower === 'manana' || lower === 'tomorrow' || /\b(mañana|manana|tomorrow)\b/.test(lower)) {
      localDate = new Date(now);
      localDate.setDate(localDate.getDate() + 1);
    } else if (/^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/.test(lower)) {
      localDate = getNextDayOfWeek(lower, tz);
    } else {
      const isoMatch = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        const [, y, m, d] = isoMatch.map(Number);
        localDate = new Date(y, m - 1, d);
      } else {
        localDate = new Date(dateStr!);
        if (isNaN(localDate.getTime())) return null;
      }
    }

    return wallClockToUtc(
      localDate.getFullYear(), localDate.getMonth(), localDate.getDate(),
      hours, minutes, tz,
    );
  } catch {
    return null;
  }
}

function parseWallClockTime(
  raw?: string,
  allowBareNumber: boolean = false,
): { hours: number; minutes: number } | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const hasExplicitTimeSignal =
    /\ba\s+la?s?\s+\d{1,2}\b/.test(lower)
    || /\d{1,2}:\d{2}/.test(lower)
    || /\d{1,2}\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/.test(lower);
  if (!hasExplicitTimeSignal && !(allowBareNumber && /^\s*\d{1,2}\s*$/.test(lower))) {
    return null;
  }

  const match = lower.match(
    /(?:a\s+la?s?\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?/,
  );
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const suffix = match[3]?.replace(/\s|\./g, '');

  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;

  if (suffix === 'pm' && hours < 12) {
    hours += 12;
  } else if (suffix === 'am' && hours === 12) {
    hours = 0;
  } else if (!suffix && hours >= 1 && hours <= 7 && /\ba\s+la?s?\s+\d{1,2}\b/.test(lower)) {
    // In Mexican scheduling speech, "a la 1/2/3..." usually means afternoon
    // unless AM is explicit. This matches the tool prompt examples.
    hours += 12;
  }

  return { hours, minutes };
}

function parseSpanishMonthDate(raw: string, now: Date): Date | null {
  const months: Record<string, number> = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    setiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11,
  };

  const match = raw.match(
    /(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)?\s*(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?/,
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = months[match[2]];
  const year = match[3] ? Number(match[3]) : now.getFullYear();

  if (!month && month !== 0) return null;
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;

  return new Date(year, month, day);
}

/**
 * Get the start-of-week (Monday 00:00) in UTC, for a given timezone.
 */
export function getWeekStartUtc(tz: string = DEFAULT_TZ): Date {
  const now = toLocalTime(new Date(), tz);
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
  now.setDate(now.getDate() - diff);
  return wallClockToUtc(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, tz);
}

/**
 * Get the start of the current month (1st, 00:00) in UTC, for a given timezone.
 */
export function getMonthStartUtc(tz: string = DEFAULT_TZ): Date {
  const now = toLocalTime(new Date(), tz);
  return wallClockToUtc(now.getFullYear(), now.getMonth(), 1, 0, 0, tz);
}

/**
 * Get a human-readable timezone label (e.g. "Ciudad de México", "Miami/Nueva York").
 */
export function getTimezoneLabel(tz: string): string {
  const labels: Record<string, string> = {
    'America/Mexico_City': 'Ciudad de México',
    'America/New_York': 'Este (Miami/Nueva York)',
    'America/Chicago': 'Centro (Chicago/Houston)',
    'America/Denver': 'Montaña (Denver)',
    'America/Los_Angeles': 'Pacífico (Los Ángeles)',
    'America/Tijuana': 'Tijuana',
    'America/Chihuahua': 'Chihuahua',
    'America/Mazatlan': 'Mazatlán',
    'America/Cancun': 'Cancún',
    'America/Hermosillo': 'Hermosillo',
    'America/Monterrey': 'Monterrey',
    'America/Bogota': 'Bogotá',
    'America/Lima': 'Lima',
    'America/Santiago': 'Santiago',
    'America/Buenos_Aires': 'Buenos Aires',
    'America/Sao_Paulo': 'São Paulo',
    'Europe/Madrid': 'Madrid',
    'Europe/London': 'Londres',
  };
  return labels[tz] || tz.replace(/_/g, ' ').split('/').pop() || tz;
}

/**
 * Validate an IANA timezone string.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Map common city/region names to IANA timezone strings.
 * Used by the LLM tool to resolve user input.
 */
export function resolveTimezone(input: string): string | null {
  const normalized = input.toLowerCase().trim();
  const map: Record<string, string> = {
    'cdmx': 'America/Mexico_City',
    'ciudad de mexico': 'America/Mexico_City',
    'ciudad de méxico': 'America/Mexico_City',
    'mexico city': 'America/Mexico_City',
    'monterrey': 'America/Monterrey',
    'guadalajara': 'America/Mexico_City',
    'chihuahua': 'America/Chihuahua',
    'tijuana': 'America/Tijuana',
    'cancun': 'America/Cancun',
    'cancún': 'America/Cancun',
    'hermosillo': 'America/Hermosillo',
    'mazatlan': 'America/Mazatlan',
    'mazatlán': 'America/Mazatlan',
    'miami': 'America/New_York',
    'new york': 'America/New_York',
    'nueva york': 'America/New_York',
    'los angeles': 'America/Los_Angeles',
    'los ángeles': 'America/Los_Angeles',
    'chicago': 'America/Chicago',
    'houston': 'America/Chicago',
    'denver': 'America/Denver',
    'bogota': 'America/Bogota',
    'bogotá': 'America/Bogota',
    'lima': 'America/Lima',
    'santiago': 'America/Santiago',
    'buenos aires': 'America/Buenos_Aires',
    'sao paulo': 'America/Sao_Paulo',
    'madrid': 'Europe/Madrid',
    'london': 'Europe/London',
    'londres': 'Europe/London',
    'amsterdam': 'Europe/Amsterdam',
    'ámsterdam': 'Europe/Amsterdam',
    'holanda': 'Europe/Amsterdam',
    'paises bajos': 'Europe/Amsterdam',
    'países bajos': 'Europe/Amsterdam',
    'netherlands': 'Europe/Amsterdam',
    'nl': 'Europe/Amsterdam',
    'eastern': 'America/New_York',
    'est': 'America/New_York',
    'central': 'America/Chicago',
    'cst': 'America/Chicago',
    'mountain': 'America/Denver',
    'mst': 'America/Denver',
    'pacific': 'America/Los_Angeles',
    'pst': 'America/Los_Angeles',
  };

  if (map[normalized]) return map[normalized];

  // Try as IANA directly
  if (isValidTimezone(input)) return input;

  return null;
}

export const DEFAULT_TIMEZONE = DEFAULT_TZ;

// ─── Cap. 46 — Timezone Confidence System helpers ───────────────────

/**
 * +52 covers Mexico exclusively (no other country code starts with
 * those digits). Tolerates whitespace, parens and the Mexican mobile
 * prefix `1` (so both `+52` and `+521` start with digits 52).
 */
export function isMexicanPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').startsWith('52');
}

const SKIP_TIMEZONE_KEYWORDS: ReadonlyArray<string> = [
  'luego', 'despues', 'después', 'mas tarde', 'más tarde',
  'saltar', 'skip', 'no se', 'no sé', 'no lo se', 'no lo sé',
  'paso', 'pasa', 'omitir', 'olvidalo', 'olvídalo', 'ninguna',
];

/**
 * Detect whether a user reply to the timezone question is a "leave it
 * for later" signal, so we don't keep retrying.
 *
 * Matches whole words (or whole phrase + trailing space) on accent-
 * normalized lowercase text. Plain "no" is NOT in the keyword set on
 * purpose — it would swallow legitimate replies that start with "no".
 */
export function isTimezoneSkipPhrase(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:!?"'`()¿¡]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  return SKIP_TIMEZONE_KEYWORDS.some((kw) => {
    const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normalized === kwNorm || normalized.startsWith(kwNorm + ' ');
  });
}
