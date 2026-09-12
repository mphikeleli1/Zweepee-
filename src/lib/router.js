export const INTENT_MODES = {
  A2A_SELL: 'A2A_SELL',
  A2A_BUY: 'A2A_BUY',
  BUY_PLUS_DELIVER: 'BUY_PLUS_DELIVER',
  TRANSPORT_ONLY: 'TRANSPORT_ONLY',
  JOB_MATCHING: 'JOB_MATCHING',
  SERVICE_REFERRAL: 'SERVICE_REFERRAL',
  BUSINESS_AGENCY_REQUEST: 'BUSINESS_AGENCY_REQUEST'
};

export function classifyIntent(messageText, metadata = {}) {
  if (metadata.explicitIntent) {
    return metadata.explicitIntent;
  }

  const text = (messageText || '').toLowerCase().trim();

  // EXPLICIT SMALL BUSINESS INTENT: Must be asked for by the user!
  if (
    text.includes('help me run my') ||
    text.includes('manage my small business') ||
    text.includes('manage my business') ||
    text.includes('manage my shop') ||
    text.includes('manage my salon') ||
    text.includes('manage my restaurant') ||
    text.includes('build an agent for my business') ||
    text.includes('create a bot for my business') ||
    text.includes('create an agent for my business') ||
    text.includes('business ai employee')
  ) {
    return INTENT_MODES.BUSINESS_AGENCY_REQUEST;
  }

  // ADVICE PROHIBITION RULE: Intercept direct financial, medical, or legal queries
  if (
    text.includes('doctor') ||
    text.includes('medicine') ||
    text.includes('pills') ||
    text.includes('diagnosis') ||
    text.includes('legal advice') ||
    text.includes('lawyer') ||
    text.includes('sue') ||
    text.includes('invest in') ||
    text.includes('financial advice') ||
    text.includes('loan') ||
    text.includes('insurance') ||
    text.includes('medical aid')
  ) {
    return INTENT_MODES.SERVICE_REFERRAL;
  }

  // Job matching intents
  if (text.includes('hire') || text.includes('recruitment') || text.includes('cashiers') || text.includes('staff')) {
    return INTENT_MODES.JOB_MATCHING;
  }

  // P2P Selling intent
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

  // Transport Only intent
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

  // P2P buying vs Store buying
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
