export const INTENT_MODES = {
  A2A_SELL: 'A2A_SELL',
  A2A_BUY: 'A2A_BUY',
  BUY_PLUS_DELIVER: 'BUY_PLUS_DELIVER',
  TRANSPORT_ONLY: 'TRANSPORT_ONLY'
};

export function classifyIntent(messageText, metadata = {}) {
  if (metadata.explicitIntent) {
    return metadata.explicitIntent;
  }

  const text = (messageText || '').toLowerCase().trim();

  if (
    text.startsWith('sell') ||
    text.includes('selling my') ||
    text.includes('i want to sell') ||
    text.includes('list item') ||
    text.includes('for sale') ||
    text.includes('selling a ') ||
    text.includes('second hand for sale')
  ) {
    return INTENT_MODES.A2A_SELL;
  }

  if (
    text.includes('transport only') ||
    text.includes('deliver my parcel') ||
    text.includes('pick up my package') ||
    text.includes('send item to') ||
    text.includes('courier only') ||
    text.includes('already bought') ||
    text.includes('furniture move') ||
    text.includes('bakkie needed') ||
    text.includes('bakkie to move') ||
    text.includes('fetch my parcel') ||
    text.includes('move my couch') ||
    text.includes('pickup and drop')
  ) {
    return INTENT_MODES.TRANSPORT_ONLY;
  }

  if (
    text.includes('used iphone') ||
    text.includes('second hand') ||
    text.includes('pre-owned') ||
    text.includes('from another user') ||
    text.includes('buy used')
  ) {
    return INTENT_MODES.A2A_BUY;
  }

  return INTENT_MODES.BUY_PLUS_DELIVER;
}
