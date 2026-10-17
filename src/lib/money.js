export function randsToCents(rands) {
  if (rands === null || rands === undefined) return 0;
  if (typeof rands === 'number') {
    if (isNaN(rands) || !isFinite(rands)) return 0;
    return Math.round(rands * 100);
  }
  if (typeof rands === 'string') {
    const cleaned = rands.replace(/R\s?/gi, '').replace(/,/g, '').trim();
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed) || !isFinite(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  return 0;
}

export function centsToRandsFormatted(cents) {
  const integerCents = Math.round(cents || 0);
  const randsVal = (integerCents / 100).toFixed(2);
  const parts = randsVal.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `R${parts.join('.')}`;
}

export function calculatePercentageCents(amountCents, percent) {
  if (!amountCents || amountCents <= 0 || !percent || percent <= 0) return 0;
  return Math.round((Math.round(amountCents) * Number(percent)) / 100);
}

export function addCents(...amounts) {
  return amounts.reduce((acc, val) => acc + (Math.round(val || 0)), 0);
}

export function subtractCents(a, b) {
  return Math.round(a || 0) - Math.round(b || 0);
}
