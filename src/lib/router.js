export const INTENT_MODES = {
  A2A_SELL: 'A2A_SELL',
  A2A_BUY: 'A2A_BUY',
  BUY_PLUS_DELIVER: 'BUY_PLUS_DELIVER',
  TRANSPORT_ONLY: 'TRANSPORT_ONLY',
  JOB_MATCHING: 'JOB_MATCHING',
  SERVICE_REFERRAL: 'SERVICE_REFERRAL',
  BUSINESS_AGENCY_REQUEST: 'BUSINESS_AGENCY_REQUEST',
  EMPLOYMENT_PACK: 'EMPLOYMENT_PACK'
};

export const TRIGGER_GRAMMAR = {
  SIGNAL: 'signal',
  CONDITION: 'condition',
  SCHEDULE: 'schedule',
  PLACE: 'place',
  PATTERN: 'pattern',
  SILENCE: 'silence'
};

export const COMPILER_CARD_SCHEMA = Object.freeze({
  COMPLAINT: 'string', // User's own complaint or goal phrasing
  TRIGGER: Object.values(TRIGGER_GRAMMAR),
  MEMORY: 'array', // Declared record types
  TOOLS: 'array', // Declared fetchers, primitives, providers
  UNTIL: ['revoked', 'goal_achieved', 'date_reached', 'condition_false', 'silent_failure']
});

export const SERVICE_REGISTRY_SCHEMA = Object.freeze({
  name: 'string',
  reachable_from: 'array',
  complaint_form: 'string',
  trigger: Object.values(TRIGGER_GRAMMAR),
  fetchers: 'array',
  boundary: 'string',
  price_mode: ['free', 'per_action', 'subscription', 'pass_through', 'percentage'],
  terminal_condition: 'array',
  evidence_required: 'array',
  regulators: 'array',
  escalation: 'array',
  consent_class: 'string',
  retention: 'string',
  audit_surface: 'array',
  currency: 'string',
  language_scope: 'array',
  accessibility: 'array',
  dependencies: 'array',
  version: 'string'
});

export class CompilerEngine {
  static compileCard(complaint, trigger = TRIGGER_GRAMMAR.SIGNAL, memory = [], tools = [], until = 'revoked') {
    if (!complaint || typeof complaint !== 'string') {
      throw new Error('Compiler Card requires a valid string COMPLAINT.');
    }
    const triggerType = Object.values(TRIGGER_GRAMMAR).includes(trigger) ? trigger : TRIGGER_GRAMMAR.SIGNAL;
    return Object.freeze({
      COMPLAINT: complaint,
      TRIGGER: triggerType,
      MEMORY: Array.isArray(memory) ? memory : [memory],
      TOOLS: Array.isArray(tools) ? tools : [tools],
      UNTIL: until
    });
  }

  static executeFourVerbsLoop(card, userRecord = {}) {
    // 1. Understand
    const understanding = {
      complaint: card.COMPLAINT,
      intentMode: classifyIntent(card.COMPLAINT),
      trigger: card.TRIGGER
    };

    // 2. Locate
    const location = {
      destinations: card.TOOLS || [],
      regulators: ['FSCA', 'CIPC', 'SARS', 'DEL', 'HPCSA'].filter(r =>
        card.COMPLAINT.toLowerCase().includes(r.toLowerCase())
      )
    };

    // 3. Prepare
    const preparation = {
      packAssembled: true,
      dataSources: card.MEMORY || [],
      requiresApproval: true
    };

    // 4. Track
    const tracking = {
      status: 'EXECUTED_AND_LOGGED',
      timestamp: Date.now(),
      until: card.UNTIL
    };

    return {
      understanding,
      location,
      preparation,
      tracking
    };
  }
}

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

  // Employment Pack & Z83 Government Form Intent
  if (
    text.includes('cv') ||
    text.includes('resume') ||
    text.includes('z83') ||
    text.includes('employment pack') ||
    text.includes('job pack') ||
    text.includes('government job') ||
    text.includes('apply for job')
  ) {
    return INTENT_MODES.EMPLOYMENT_PACK;
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
