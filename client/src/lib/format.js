/**
 * Shared formatting.
 *
 * The locale is pinned to en-GB rather than left to the browser: this is an
 * English-language project, and a French or Korean laptop would otherwise
 * render half the interface in its own language during the demo.
 */
const LOCALE = 'en-GB';

const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_FORMAT_SHORT = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});

/** 'YYYY-MM-DD' -> '01 Sep 2026'. Parsed as UTC so the day never shifts. */
export function formatDate(isoDate) {
  if (!isoDate) return '—';
  return DATE_FORMAT.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

/** 'YYYY-MM-DD' -> '01 Sep', for dense chart axes. */
export function formatDateShort(isoDate) {
  if (!isoDate) return '';
  return DATE_FORMAT_SHORT.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

/** Numbers, with an em dash for nothing rather than a bare "null". */
export function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Kilograms, with the unit attached only when there is a number to attach. */
export function formatKg(value, decimals = 1) {
  if (value === null || value === undefined) return '—';
  return `${formatNumber(value, decimals)} kg`;
}

/**
 * Strength index, always rounded DOWN. Rounding up could show 410 next to a
 * Silver II badge when Silver I begins at 410, which reads as a bug.
 */
export function formatIndex(value) {
  if (value === null || value === undefined) return '\u2014';
  return Math.floor(value).toLocaleString(LOCALE);
}
