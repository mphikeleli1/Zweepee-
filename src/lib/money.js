/**
 * Integer minor units (cents) monetary arithmetic helpers.
 * Never use floats for money calculations!
 */

/**
 * Convert rand decimal string/number to integer cents.
 * e.g., 99.99 -> 9999, 100 -> 10000
 */
export function randsToCents(rands) {
  if (typeof rands === 'number') {
    return Math.round(rands * 100);
  }
  if (typeof rands === 'string') {
    const parsed = parseFloat(rands.replace(/[^0-9.-]+/g, ''));
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  return 0;
}

/**
 * Convert integer cents to formatted Rand string.
 * e.g., 9999 -> "R99.99", 10000 -> "R100.00"
 */
export function centsToRandsFormatted(cents) {
  const integerCents = Math.round(cents || 0);
  const rands = (integerCents / 100).toFixed(2);
  return `R${rands}`;
}

/**
 * Calculate percentage of cents rounded to integer cents.
 * e.g. 10% of 5000 cents (R50) = 500 cents (R5)
 */
export function calculatePercentageCents(amountCents, percent) {
  if (!amountCents || amountCents <= 0) return 0;
  return Math.round((amountCents * percent) / 100);
}

/**
 * Add integer cents safely.
 */
export function addCents(...amounts) {
  return amounts.reduce((acc, val) => acc + (Math.round(val) || 0), 0);
}

/**
 * Subtract integer cents safely.
 */
export function subtractCents(a, b) {
  return Math.round(a || 0) - Math.round(b || 0);
}
