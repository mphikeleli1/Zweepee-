/**
 * Intent Router — MANDATORY
 * Classifies every inbound user message / request before pricing or matching.
 */

export const INTENT_MODES = {
  A2A_SELL: 'A2A_SELL',
  A2A_BUY: 'A2A_BUY',
  BUY_PLUS_DELIVER: 'BUY_PLUS_DELIVER',
  TRANSPORT_ONLY: 'TRANSPORT_ONLY'
};

export function classifyIntent(messageText, metadata = {}) {
  const text = (messageText || '').toLowerCase().trim();

  if (metadata.explicitIntent) {
    return metadata.explicitIntent;
  }

  // Check for P2P Selling intent
  if (
    text.startsWith('sell') ||
    text.includes('selling my') ||
    text.includes('i want to sell') ||
    text.includes('list item') ||
    text.includes('for sale')
  ) {
    return INTENT_MODES.A2A_SELL;
  }

  // Check for Transport Only intent
  if (
    text.includes('transport only') ||
    text.includes('deliver my parcel') ||
    text.includes('pick up my package') ||
    text.includes('send item to') ||
    text.includes('courier only') ||
    text.includes('already bought') ||
    text.includes('furniture move') ||
    text.includes('bakkie needed')
  ) {
    return INTENT_MODES.TRANSPORT_ONLY;
  }

  // Check for P2P buying vs Store buying
  if (text.includes('used iphone') || text.includes('second hand') || text.includes('pre-owned') || text.includes('from another user')) {
    return INTENT_MODES.A2A_BUY;
  }

  // Default mode for general product/merchant requests (KFC, Steers, Woolies, Checkers, groceries, electronics, etc.)
  return INTENT_MODES.BUY_PLUS_DELIVER;
}
