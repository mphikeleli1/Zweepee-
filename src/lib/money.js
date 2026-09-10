/**
 * Integer minor units (cents) monetary arithmetic helpers.
 * Never use floats for money calculations!
 */

/**
 * Convert Rand decimal string/number or formatted string ("R 1,250.50") to integer cents.
 * e.g., 99.99 -> 9999, "R 1,250.50" -> 125050
 */
export function randsToCents(rands) {
  if (rands === null || rands === undefined) return 0;

  if (typeof rands === 'number') {
    if (isNaN(rands) || !isFinite(rands)) return 0;
    return Math.round(rands * 100);
  }

  if (typeof rands === 'string') {
    // Clean thousands separators and currency symbols
    const cleaned = rands.replace(/R\s?/gi, '').replace(/,/g, '').trim();
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed) || !isFinite(parsed)) return 0;
    return Math.round(parsed * 100);
  }

  return 0;
}

/**
 * Convert integer cents to formatted Rand string deterministically.
 * e.g., 9999 -> "R99.99", 125050 -> "R1,250.50"
 */
export function centsToRandsFormatted(cents) {
  const integerCents = Math.round(cents || 0);
  const randsVal = (integerCents / 100).toFixed(2);
  const parts = randsVal.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `R${parts.join('.')}`;
}

/**
 * Calculate percentage of cents rounded to integer cents safely.
 */
export function calculatePercentageCents(amountCents, percent) {
  if (!amountCents || amountCents <= 0 || !percent || percent <= 0) return 0;
  return Math.round((Math.round(amountCents) * Number(percent)) / 100);
}

/**
 * Add integer cents safely.
 */
export function addCents(...amounts) {
  return amounts.reduce((acc, val) => acc + (Math.round(val || 0)), 0);
}

/**
 * Subtract integer cents safely.
 */
export function subtractCents(a, b) {
  return Math.round(a || 0) - Math.round(b || 0);
}
