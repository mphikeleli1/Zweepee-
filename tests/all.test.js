import test from 'node:test';
import assert from 'node:assert/strict';

import { randsToCents, centsToRandsFormatted, addCents } from '../src/lib/money.js';
import { calculatePricing, DEFAULT_PRICING_CONFIG } from '../src/lib/pricing.js';
import { DoubleEntryLedger } from '../src/lib/ledger.js';
import { TransactionStateMachine, TRANSACTION_STATES } from '../src/lib/stateMachine.js';
import { IdempotencyManager } from '../src/lib/idempotency.js';
import { classifyIntent, INTENT_MODES } from '../src/lib/router.js';
import { TransportAggregator, classifyLoadVehicle } from '../src/transport/aggregator.js';
import { MultiStopRouteOptimizer } from '../src/transport/multistop.js';
import { PersonalAgent } from '../src/agents/personalAgent.js';
import { AgentFactory } from '../src/agents/factory.js';
import { ScamPreventionEngine } from '../src/trust/scamPrevention.js';
import { WhatsAppSessionEngine } from '../src/whatsapp/sessionEngine.js';
import { PaystackPaymentGateway } from '../src/payments/paystack.js';
import { PayFastPaymentGateway } from '../src/payments/payfast.js';
import { SentinelSelfHealingMonitor } from '../src/sentinel/sentinel.js';
import { ExternalAgentInteropAdapter } from '../src/network/interop.js';
import { AgentMatchingEngine } from '../src/network/matching.js';
import { NetworkDiscovery } from '../src/network/discovery.js';
import { CatalogExtractor } from '../src/agents/catalogExtractor.js';
import { UserOnboardingEngine } from '../src/whatsapp/onboarding.js';
import { CommerceAggregator } from '../src/commerce/aggregator.js';
import { DisputeResolutionEngine } from '../src/trust/disputes.js';
import { OneCartAggregatorAdapter } from '../src/commerce/adapters/onecart.js';
import { AntiAbuseGuardEngine } from '../src/trust/antiAbuse.js';
import { P2PCommerceEngine } from '../src/trust/p2pFeatures.js';
import { AICostCurtailmentEngine } from '../src/lib/aiOptimizer.js';
import { A2ACommerceEngine } from '../src/trust/a2aCommerce.js';
import { MCPServerAdapter } from '../src/network/mcpServer.js';
import { SAApiStackManager } from '../src/commerce/saApiStack.js';
import { detectLanguage, translate, SUPPORTED_LANGUAGES } from '../src/lib/i18n.js';

test('1. Pricing Threshold Boundaries (R99.99, R100, R100.01)', () => {
  const rawTransport = 5000;

  const price9999 = calculatePricing({
    intentMode: 'BUY_PLUS_DELIVER',
    goodsSubtotalCents: 9999,
    rawTransportQuoteCents: rawTransport,
    config: DEFAULT_PRICING_CONFIG
  });
  assert.equal(price9999.goodsMarkupCents, 0, 'Store goods markup must be 0%');
  assert.equal(price9999.transportMarginCents, 500, 'R99.99 cart must use 10% transport margin');

  const price10000 = calculatePricing({
    intentMode: 'BUY_PLUS_DELIVER',
    goodsSubtotalCents: 10000,
    rawTransportQuoteCents: rawTransport,
    config: DEFAULT_PRICING_CONFIG
  });
  assert.equal(price10000.goodsMarkupCents, 0, 'Store goods markup must be 0%');
  assert.equal(price10000.transportMarginCents, 1000, 'R100.00 cart must exclusively use 20% transport margin');

  const price10001 = calculatePricing({
    intentMode: 'BUY_PLUS_DELIVER',
    goodsSubtotalCents: 10001,
    rawTransportQuoteCents: rawTransport,
    config: DEFAULT_PRICING_CONFIG
  });
  assert.equal(price10001.transportMarginCents, 1000, 'R100.01 cart must use 20% transport margin');

  const p2pPrice = calculatePricing({
    intentMode: 'P2P_SALE',
    goodsSubtotalCents: 20000,
    rawTransportQuoteCents: 10000,
    config: DEFAULT_PRICING_CONFIG
  });
  assert.equal(p2pPrice.p2pCommissionCents, 1000, 'P2P goods commission must be 5% of R200 = R10 (1000 cents)');
  assert.equal(p2pPrice.transportMarginCents, 2000, 'P2P transport margin must be 20% of R100 = R20 (2000 cents)');
});

test('2. Double-Entry Ledger Balancing & Minor Units Formatting', async () => {
  const ledger = new DoubleEntryLedger();

  assert.equal(randsToCents('R 1,250.50'), 125050);
  assert.equal(centsToRandsFormatted(125050), 'R1,250.50');

  const result = await ledger.recordTransaction({
    transactionId: 'tx_123',
    idempotencyKey: 'idem_ledger_1',
    entries: [
      { account: 'ASSETS:CUSTOMER_PAYMENT', type: 'DEBIT', amountCents: 15000 },
      { account: 'LIABILITIES:MERCHANT_PAYABLE', type: 'CREDIT', amountCents: 10000 },
      { account: 'LIABILITIES:COURIER_PAYABLE', type: 'CREDIT', amountCents: 4000 },
      { account: 'REVENUE:MYAI_MARGIN', type: 'CREDIT', amountCents: 1000 }
    ]
  });

  assert.equal(result.success, true);
  assert.equal(result.totalAmountCents, 15000);

  await assert.rejects(async () => {
    await ledger.recordTransaction({
      transactionId: 'tx_124',
      idempotencyKey: 'idem_ledger_2',
      entries: [
        { account: 'ASSETS:CUSTOMER_PAYMENT', type: 'DEBIT', amountCents: 15000 },
        { account: 'LIABILITIES:MERCHANT_PAYABLE', type: 'CREDIT', amountCents: 10000 }
      ]
    });
  }, /Ledger imbalance/);
});

test('3. State Machine Invalid Transitions & Approval Gate Enforcement', () => {
  const smP2P = new TransactionStateMachine({
    id: 'tx_p2p_1',
    intentMode: 'A2A_SELL',
    state: TRANSACTION_STATES.INTENT
  });

  smP2P.transitionTo(TRANSACTION_STATES.MATCHED);
  smP2P.transitionTo(TRANSACTION_STATES.QUOTED);
  smP2P.transitionTo(TRANSACTION_STATES.PENDING_APPROVAL);

  assert.throws(() => {
    smP2P.transitionTo(TRANSACTION_STATES.AUTHORISED);
  }, /Approval Gate Block/);

  smP2P.registerBuyerApproval();
  assert.throws(() => {
    smP2P.transitionTo(TRANSACTION_STATES.AUTHORISED);
  }, /Approval Gate Block/);

  smP2P.registerSellerApproval();
  const transitionResult = smP2P.transitionTo(TRANSACTION_STATES.AUTHORISED);
  assert.equal(transitionResult.newState, TRANSACTION_STATES.AUTHORISED);

  assert.throws(() => {
    smP2P.transitionTo(TRANSACTION_STATES.COMPLETED);
  }, /Invalid state transition/);
});

test('4. Idempotency Key Replay Protection', async () => {
  const idempotency = new IdempotencyManager();

  const firstCheck = await idempotency.checkAndLock('key_abc_123');
  assert.equal(firstCheck.isDuplicate, false);

  const secondCheck = await idempotency.checkAndLock('key_abc_123');
  assert.equal(secondCheck.isDuplicate, true);

  await idempotency.complete('key_abc_123', { success: true });
  const thirdCheck = await idempotency.checkAndLock('key_abc_123');
  assert.equal(thirdCheck.isDuplicate, true);
  assert.equal(thirdCheck.record.status, 'COMPLETED');
});

test('5. Intent Router Classification', () => {
  assert.equal(classifyIntent('I want to sell my used laptop'), INTENT_MODES.A2A_SELL);
  assert.equal(classifyIntent('Transport only: send package to Sandton'), INTENT_MODES.TRANSPORT_ONLY);
  assert.equal(classifyIntent('Order 2 Streetwise Two from KFC'), INTENT_MODES.BUY_PLUS_DELIVER);
  assert.equal(classifyIntent('Help me run my small business'), INTENT_MODES.BUSINESS_AGENCY_REQUEST);
});

test('6. Transport Vehicle Selection & Capabilities', async () => {
  const bikeVehicle = classifyLoadVehicle({ items: [{ category: 'Food' }], totalWeightKg: 2 });
  assert.equal(bikeVehicle, 'BIKE');

  const furnitureVehicle = classifyLoadVehicle({ items: [{ category: 'Furniture' }], totalWeightKg: 50 });
  assert.equal(furnitureVehicle, 'BAKKIE_1TON');

  const heavyVehicle = classifyLoadVehicle({ items: [], totalWeightKg: 5000 });
  assert.equal(heavyVehicle, 'TRUCK_8TON');

  const transportAggregator = new TransportAggregator();
  const quotes = await transportAggregator.getQuotes({
    distanceKm: 10,
    items: [{ category: 'Furniture' }],
    totalWeightKg: 50
  });

  assert.equal(quotes.requiredVehicleClass, 'BAKKIE_1TON');
  assert.equal(quotes.cheapestQuote.vehicleClass, 'BAKKIE_1TON');
  assert.ok(quotes.cheapestQuote.rawQuoteCents > 0);
});

test('7. Multi-Stop Route Optimization', () => {
  const optimizer = new MultiStopRouteOptimizer();
  const stops = [
    { id: 'kfc', lat: -26.20, lng: 28.04, type: 'PICKUP', name: 'KFC' },
    { id: 'pnp', lat: -26.21, lng: 28.05, type: 'PICKUP', name: 'Pick n Pay' },
    { id: 'customer', lat: -26.22, lng: 28.06, type: 'DROPOFF', name: 'Customer' }
  ];

  const result = optimizer.optimiseRoute(stops);
  assert.equal(result.stops.length, 3);
  assert.equal(result.stops[2].type, 'DROPOFF', 'Customer dropoff must be last stop');
  assert.ok(result.totalDistanceKm > 0);
});

test('8. Agent Factory Draft Cleanup & Validation', async () => {
  const factory = new AgentFactory();

  const draft = factory.createDraft('usr_john', 'John Resto', 'Restaurant');
  assert.equal(draft.status, 'DRAFT');

  const validation = factory.validateConfig(draft);
  assert.equal(validation.valid, false);

  factory.collectData(draft.id, { catalog: [{ name: 'Burger', priceCents: 5000 }] });
  const activeAgent = factory.activate(draft.id);
  assert.equal(activeAgent.status, 'ACTIVE');

  const oldDraft = factory.createDraft('usr_mary', 'Old Store', 'General');
  factory.drafts.get(oldDraft.id).updatedAt = Date.now() - (49 * 60 * 60 * 1000);

  const cleanupResult = await factory.cleanupExpiredDrafts();
  assert.equal(cleanupResult.cleanedCount, 1);
});

test('9. Scam Prevention, IMEI Luhn Check & Contact Masking', () => {
  const scamEngine = new ScamPreventionEngine();

  const unmaskedText = 'Call 0821234567 or pay to account 12345678901 or wa.me/27820000000';
  const maskedText = scamEngine.maskOffPlatformContacts(unmaskedText);

  assert.ok(!maskedText.includes('0821234567'));
  assert.ok(!maskedText.includes('12345678901'));
  assert.ok(maskedText.includes('[CONTACT MASKED BY MYAI]'));
  assert.ok(maskedText.includes('[ACCOUNT MASKED BY MYAI]'));

  assert.equal(scamEngine.isValidIMEI('352099001761481'), true);
  assert.equal(scamEngine.isValidIMEI('123456789012345'), false);
});

test('10. Stateful WhatsApp Session Engine & Payment Webhooks', async () => {
  const sessionEngine = new WhatsAppSessionEngine();

  const onboardingScreen = await sessionEngine.handleIncomingMessage('27820000000', 'hello');
  assert.ok(onboardingScreen.text.includes('Welcome to myAI'));

  const addressScreen = await sessionEngine.handleIncomingMessage('27820000000', 'Sandton');
  assert.ok(addressScreen.text.includes('Location Saved'));

  const nameScreen = await sessionEngine.handleIncomingMessage('27820000000', 'John Doe');
  assert.ok(nameScreen.text.includes('Personal Helper is Active'));

  const paystack = new PaystackPaymentGateway('sk_test_mock_paystack_key');
  const paystackValid = await paystack.verifyWebhookSignature('{"event":"charge.success"}', 'mock_sig');
  assert.equal(paystackValid, true);

  const payfast = new PayFastPaymentGateway('10000100');
  assert.equal(payfast.verifyWebhookSignature({ merchant_id: '10000100' }), true);
});

test('11. Sentinel Self-Healing & Jargon-Free Owner Notification', async () => {
  const sentinel = new SentinelSelfHealingMonitor();
  const report = await sentinel.runHealthCheckAndSelfHeal();

  assert.equal(report.status, 'HEALTHY');
  assert.ok(report.ownerAlertMessage.includes('Everything is running smoothly!'));
  assert.ok(!report.ownerAlertMessage.includes('database'));
  assert.ok(!report.ownerAlertMessage.includes('SQL'));
  assert.ok(!report.ownerAlertMessage.includes('HTTP'));
});

test('12. External Agent Interoperability & Catalog Ingestion Extractor', async () => {
  const discovery = new NetworkDiscovery();
  const matching = new AgentMatchingEngine(discovery);
  const interop = new ExternalAgentInteropAdapter(matching);

  const request = {
    protocol: 'GOOGLE_A2A_V1',
    senderAgentId: 'ext_agent_google_123',
    action: 'DISCOVER_OR_MATCH',
    query: 'Streetwise Two'
  };

  const response = await interop.handleExternalAgentQuery(request);
  assert.equal(response.status, 'SUCCESS');
  assert.equal(response.protocol, 'GOOGLE_A2A_V1');

  const extractor = new CatalogExtractor();
  const rawText = 'Pizza Margherita - R120.00\nBurger Meal - R85.50';
  const catalog = extractor.parseTextToCatalog(rawText);

  assert.equal(catalog.length, 2);
  assert.equal(catalog[0].name, 'Pizza Margherita');
  assert.equal(catalog[0].priceCents, 12000);
  assert.equal(catalog[1].priceCents, 8550);
});

test('13. New User Onboarding Engine', async () => {
  const onboarding = new UserOnboardingEngine();
  const res1 = await onboarding.handleOnboarding('27811111111', 'hi', 'ONBOARDING_START');
  assert.equal(res1.nextStep, 'ONBOARDING_AWAITING_LOCATION');

  const res2 = await onboarding.handleOnboarding('27811111111', 'Rosebank', 'ONBOARDING_AWAITING_LOCATION');
  assert.equal(res2.nextStep, 'ONBOARDING_AWAITING_NAME');
  assert.equal(res2.draftProfile.address, 'Rosebank');

  const res3 = await onboarding.handleOnboarding('27811111111', 'Sipho', 'ONBOARDING_AWAITING_NAME');
  assert.equal(res3.nextStep, 'ONBOARDING_OPTIONAL_PREFS');
  assert.ok(res3.screen.text.includes('Your Privacy Guarantee'));

  const res4 = await onboarding.handleOnboarding('27811111111', 'skip_prefs', 'ONBOARDING_OPTIONAL_PREFS');
  assert.equal(res4.nextStep, 'ONBOARDING_COMPLETED');
});

test('14. GPS Location Pin Capturing & Universal Click & Collect Stores', async () => {
  const sessionEngine = new WhatsAppSessionEngine();

  const gpsPinScreen = await sessionEngine.handleIncomingMessage(
    '27822222222',
    '',
    null,
    { latitude: -26.1076, longitude: 28.0567, address: 'Sandton City, Johannesburg' }
  );

  assert.equal(gpsPinScreen.type, 'LOCATION_PIN_SCREEN');
  assert.ok(gpsPinScreen.text.includes('-26.1076'));

  const commerce = new CommerceAggregator();
  const makroItems = await commerce.searchCatalog('makro');
  assert.ok(makroItems.some(i => i.storeName === 'Makro'));

  const dischemItems = await commerce.searchCatalog('dischem');
  assert.ok(dischemItems.some(i => i.storeName === 'Dis-Chem Pharmacy'));

  const specsaversItems = await commerce.searchCatalog('specsavers');
  assert.ok(specsaversItems.some(i => i.storeName === 'Specsavers'));

  const vetItems = await commerce.searchCatalog('vet');
  assert.ok(vetItems.some(i => i.storeName === 'Vet Clinic & Pet Shop'));
});

test('15. Dispute Resolution Engine & OneCart Aggregator', async () => {
  const disputeEngine = new DisputeResolutionEngine();
  const dispute = await disputeEngine.fileDispute({
    orderId: 'ord_test_99',
    customerPhone: '27820000000',
    issueType: 'PARCEL_NOT_DELIVERED',
    comments: 'Parcel not delivered'
  });

  assert.equal(dispute.status, 'UNDER_INVESTIGATION');
  assert.equal(dispute.payoutStatus, 'PAUSED');

  const resolution = await disputeEngine.resolveDispute(dispute.disputeId, 'FREE_REMAKE');
  assert.equal(resolution.success, true);
  assert.ok(resolution.customerMessage.includes('brand new replacement order'));

  const onecart = new OneCartAggregatorAdapter();
  const items = await onecart.fetchCatalog('woolworths');
  assert.ok(items.length > 0);
});

test('16. Fleet Fault Rider Theft Claim', async () => {
  const disputeEngine = new DisputeResolutionEngine();
  const result = await disputeEngine.claimFleetRiderTheft({
    orderId: 'ord_kfc_441',
    courierProvider: 'Pingo',
    riderId: 'rider_pingo_99'
  });

  assert.equal(result.success, true);
  assert.equal(result.fleetClaimRecord.faultType, 'FLEET_FAULT');
  assert.equal(result.fleetClaimRecord.storePayoutCharged, false, 'Store must NOT be charged');
  assert.ok(result.customerMessage.includes('zero extra cost'));
  assert.ok(result.ownerNotice.includes('Rider rider_pingo_99 on Pingo stole order'));
});

test('17. Anti-Abuse, Profanity & Anti-Gaming Rate Limiting', () => {
  const antiAbuse = new AntiAbuseGuardEngine();

  const profanityCheck = antiAbuse.screenInboundMessage('usr_troll_1', 'You are a poes');
  assert.equal(profanityCheck.isBlocked, true);
  assert.ok(profanityCheck.message.includes('keep our conversation friendly'));

  for (let i = 0; i < 10; i++) {
    antiAbuse.screenInboundMessage('usr_spam_1', 'hello');
  }

  const rateCheck = antiAbuse.screenInboundMessage('usr_spam_1', 'hello 11th time');
  assert.equal(rateCheck.isBlocked, true);
  assert.ok(rateCheck.message.includes('break'));
});

test('18. P2P Strategic Features (Trust Score & 24h Inspection Escrow)', () => {
  const p2pEngine = new P2PCommerceEngine();

  const escrowHold = p2pEngine.createP2PEscrowHold({
    transactionId: 'tx_p2p_99',
    buyerId: 'buyer_1',
    sellerId: 'seller_1',
    amountCents: 350000
  });

  assert.equal(escrowHold.status, 'ESCROW_HELD');
  assert.equal(escrowHold.inspectionWindowHours, 24);
  assert.ok(escrowHold.noticeText.includes('24-hour inspection window'));

  for (let i = 0; i < 5; i++) {
    p2pEngine.recordCompletedDeal('seller_trusted_1');
  }

  const profile = p2pEngine.getSellerTrustProfile('seller_trusted_1');
  assert.equal(profile.isVerifiedSeller, true);
  assert.ok(profile.badgeText.includes('VERIFIED TRUSTED SELLER'));
});

test('19. Apple-Level 1-Tap Instant Checkout', async () => {
  const sessionEngine = new WhatsAppSessionEngine();

  await sessionEngine.handleIncomingMessage('27844444444', 'hi');
  await sessionEngine.handleIncomingMessage('27844444444', 'Sandton');
  await sessionEngine.handleIncomingMessage('27844444444', 'Kagiso');

  const screen = await sessionEngine.handleIncomingMessage('27844444444', 'Get me KFC Streetwise 2');
  assert.equal(screen.type, 'ONE_TAP_CHECKOUT_SCREEN');
  assert.ok(screen.text.includes('Instant Checkout'));
  assert.ok(screen.buttons[0].reply.title.includes('Pay R'));
});

test('20. Dynamic Location Switcher (Work vs Home Address)', async () => {
  const sessionEngine = new WhatsAppSessionEngine();

  await sessionEngine.handleIncomingMessage('27855555555', 'hi');
  await sessionEngine.handleIncomingMessage('27855555555', 'Home: Sandton');
  await sessionEngine.handleIncomingMessage('27855555555', 'Lindiwe');

  const screen1 = await sessionEngine.handleIncomingMessage('27855555555', 'Get me KFC Streetwise 2');
  assert.ok(screen1.text.includes('Home: Sandton'));

  const promptScreen = await sessionEngine.handleIncomingMessage('27855555555', '', 'change_location');
  assert.equal(promptScreen.type, 'LOCATION_PROMPT_SCREEN');

  const screen2 = await sessionEngine.handleIncomingMessage('27855555555', 'Work: Rosebank Office Park');
  assert.equal(screen2.type, 'ONE_TAP_CHECKOUT_SCREEN');
  assert.ok(screen2.text.includes('Work: Rosebank Office Park'));
});

test('21. AI Cost Curtailment Engine (Fast-Path Bypass & KV Semantic Caching)', async () => {
  const aiOptimizer = new AICostCurtailmentEngine();

  assert.equal(aiOptimizer.isFastPathBypass('kfc', null, null), true);
  assert.equal(aiOptimizer.isFastPathBypass('', 'action_food', null), true);
  assert.equal(aiOptimizer.isFastPathBypass('', null, { latitude: -26.2, longitude: 28.0 }), true);

  await aiOptimizer.cacheParsedIntent('Get me KFC Streetwise 2', { intentMode: 'BUY_PLUS_DELIVER' });
  const cached = await aiOptimizer.getCachedIntent('Get me KFC Streetwise 2');
  assert.equal(cached.isCached, true);
  assert.equal(cached.intentData.intentMode, 'BUY_PLUS_DELIVER');
});

test('22. Frictionless Item Swapping (Zinger Burger to Streetwise 2)', async () => {
  const sessionEngine = new WhatsAppSessionEngine();

  await sessionEngine.handleIncomingMessage('27866666666', 'hi');
  await sessionEngine.handleIncomingMessage('27866666666', 'Sandton');
  await sessionEngine.handleIncomingMessage('27866666666', 'Sipho');

  const checkout1 = await sessionEngine.handleIncomingMessage('27866666666', 'Zinger Burger Meal');
  assert.ok(checkout1.text.includes('Zinger Burger Meal'));

  const swapperScreen = await sessionEngine.handleIncomingMessage('27866666666', '', 'swap_item');
  assert.equal(swapperScreen.type, 'ITEM_SWAPPER_SCREEN');

  const checkout2 = await sessionEngine.handleIncomingMessage('27866666666', 'Streetwise Two');
  assert.equal(checkout2.type, 'ONE_TAP_CHECKOUT_SCREEN');
  assert.ok(checkout2.text.includes('Streetwise Two'));
});

test('23. A2A Commerce Autonomous Price Negotiation', () => {
  const a2aEngine = new A2ACommerceEngine();

  const result = a2aEngine.negotiatePrice({
    buyerMaxCents: 330000,
    askingPriceCents: 350000,
    sellerMinCents: 320000
  });

  assert.equal(result.agreed, true);
  assert.equal(result.agreedPriceCents, 325000);
});

test('24. PersonalAgent Multi-BA Ownership & Transport Failover Escalation', async () => {
  const pa = new PersonalAgent({ phoneNumber: '27877777777', name: 'John Doe' });

  const taxiBa = pa.createOrLinkBusinessAgent({ name: "John's Taxi Business", category: 'Transport' });
  const restoBa = pa.createOrLinkBusinessAgent({ name: "John's Restaurant", category: 'Food' });
  const hardwareBa = pa.createOrLinkBusinessAgent({ name: "John's Hardware Store", category: 'Hardware' });

  assert.equal(pa.getOwnedBusinessAgents().length, 3);
  assert.equal(restoBa.ownerUserId, pa.userId);

  const emptyAggregator = new TransportAggregator([]);
  emptyAggregator.providers = [];

  const failoverQuotes = await emptyAggregator.getQuotes({ distanceKm: 5, totalWeightKg: 1 });
  assert.equal(failoverQuotes.cheapestQuote.providerId, 'local_network_failover');
  assert.ok(failoverQuotes.failoverNotice.includes('Sentinel auto-escalation'));
});

test('25. Multi-Dimensional Matching Engine (Jobs, Property, Travel Bundles)', () => {
  const discovery = new NetworkDiscovery();
  const matchingEngine = new AgentMatchingEngine(discovery);

  const jobsMatch = matchingEngine.matchMultiDimensional({
    queryText: '11 cashiers with matric around Midrand salary R5k',
    filters: { vertical: 'JOBS', quantity: 11, maxSalaryCents: 500000, qualification: 'Matric' }
  });
  assert.equal(jobsMatch.vertical, 'JOBS');
  assert.equal(jobsMatch.matched[0].quantityAvailable, 15);
  assert.equal(jobsMatch.matched[0].salaryCents, 500000);

  const propMatch = matchingEngine.matchMultiDimensional({
    queryText: '2 bed flat around jhb CBD end Sep kid friendly',
    filters: { vertical: 'PROPERTY', bedrooms: 2, kidFriendly: true }
  });
  assert.equal(propMatch.vertical, 'PROPERTY');
  assert.equal(propMatch.matched[0].bedrooms, 2);
  assert.equal(propMatch.matched[0].isKidFriendly, true);

  const bundleMatch = matchingEngine.matchMultiDimensional({
    queryText: 'CPT beachfront hotel loan insurance car hire',
    filters: { vertical: 'BUNDLE' }
  });
  assert.equal(bundleMatch.vertical, 'BUNDLE');
  assert.equal(bundleMatch.components.length, 3);
});

test('26. Advice Prohibition Rule & Job Matching Monetization', async () => {
  const sessionEngine = new WhatsAppSessionEngine();

  await sessionEngine.handleIncomingMessage('27888888888', 'hi');
  await sessionEngine.handleIncomingMessage('27888888888', 'Sandton');
  await sessionEngine.handleIncomingMessage('27888888888', 'Mpho');

  const medicalQuery = await sessionEngine.handleIncomingMessage('27888888888', 'Which medicine should I take for fever?');
  assert.ok(medicalQuery.text.includes('Professional Service Referral Conduit'));
  assert.ok(medicalQuery.text.includes('I do *not* provide direct medical, financial, or legal advice'));

  const jobPricing = calculatePricing({
    intentMode: 'JOB_MATCHING',
    goodsSubtotalCents: 0,
    rawTransportQuoteCents: 0
  });

  assert.equal(jobPricing.jobMatchingFeeCents, 50000, 'Job matching fee must be R500.00 flat rate (50,000 cents)');
  assert.equal(jobPricing.platformFeeCents, 50000);
});

test('27. Dynamic Affiliate Referral Commissions & Buyer Early Escrow Release Override', async () => {
  // 1. Dynamic Per-Affiliate Referral Commission
  const defaultRef = calculatePricing({
    intentMode: 'SERVICE_REFERRAL',
    goodsSubtotalCents: 100000 // R1,000
  });
  assert.equal(defaultRef.referralCommissionCents, 5000, 'Default affiliate referral must be 5% = R50 (5000 cents)');

  const customRef15 = calculatePricing({
    intentMode: 'SERVICE_REFERRAL',
    goodsSubtotalCents: 100000,
    customReferralCommissionPercent: 15
  });
  assert.equal(customRef15.referralCommissionCents, 15000, 'Custom 15% affiliate deal must yield R150 (15000 cents)');

  // 2. Buyer Early Escrow Release Override
  const sessionEngine = new WhatsAppSessionEngine();
  await sessionEngine.handleIncomingMessage('buyer_john', 'hi');
  await sessionEngine.handleIncomingMessage('buyer_john', 'Sandton');
  await sessionEngine.handleIncomingMessage('buyer_john', 'John');

  sessionEngine.p2pEngine.createP2PEscrowHold({
    transactionId: 'tx_escrow_101',
    buyerId: 'buyer_john',
    sellerId: 'seller_mary',
    amountCents: 200000
  });

  const unauthorizedRelease = sessionEngine.p2pEngine.buyerReleaseEscrowEarly('tx_escrow_101', 'buyer_fake');
  assert.equal(unauthorizedRelease.success, false);

  const authorizedRelease = sessionEngine.p2pEngine.buyerReleaseEscrowEarly('tx_escrow_101', 'buyer_john');
  assert.equal(authorizedRelease.success, true);
  assert.equal(authorizedRelease.status, 'ESCROW_RELEASED_EARLY_BY_BUYER');

  // Re-create hold for session engine test
  sessionEngine.p2pEngine.createP2PEscrowHold({
    transactionId: 'tx_escrow_102',
    buyerId: 'buyer_john',
    sellerId: 'seller_mary',
    amountCents: 200000
  });

  // Seed session with tx
  const session = await sessionEngine.getSession('buyer_john');
  session.transactionId = 'tx_escrow_102';
  await sessionEngine.saveSession('buyer_john', session);

  const response = await sessionEngine.handleIncomingMessage('buyer_john', 'Release escrow now');
  assert.ok(response.text.includes('Escrow Funds Released'));
});

test('28. Multi-Stop Tour Splitting (>3 Pickups) & Partial Fulfillment Refunds', async () => {
  const optimizer = new MultiStopRouteOptimizer();
  const stops8 = [
    { id: 'kfc', lat: -26.20, lng: 28.04, type: 'PICKUP', name: 'KFC' },
    { id: 'pnp', lat: -26.21, lng: 28.05, type: 'PICKUP', name: 'Pick n Pay' },
    { id: 'makro', lat: -26.22, lng: 28.06, type: 'PICKUP', name: 'Makro' },
    { id: 'spar', lat: -26.23, lng: 28.07, type: 'PICKUP', name: 'Spar' },
    { id: 'steers', lat: -26.24, lng: 28.08, type: 'PICKUP', name: 'Steers' },
    { id: 'rocomamas', lat: -26.25, lng: 28.09, type: 'PICKUP', name: 'Rocomamas' },
    { id: 'pharmacy', lat: -26.26, lng: 28.10, type: 'PICKUP', name: 'Dis-Chem Pharmacy' },
    { id: 'nandos', lat: -26.27, lng: 28.11, type: 'PICKUP', name: 'Nando\'s' },
    { id: 'customer', lat: -26.28, lng: 28.12, type: 'DROPOFF', name: 'Customer' }
  ];

  const result = optimizer.optimiseRoute(stops8);
  assert.equal(result.isMultiTourSplit, true);
  assert.equal(result.tourClusters.length, 3); // 8 pickups split into 3-3-2 = 3 parallel courier tours
  assert.equal(result.tourClusters[0].pickupCount, 3);
  assert.equal(result.tourClusters[1].pickupCount, 3);
  assert.equal(result.tourClusters[2].pickupCount, 2);

  const disputeEngine = new DisputeResolutionEngine();
  const partialRefund = await disputeEngine.processPartialFulfillmentRefund({
    transactionId: 'tx_multi_8',
    failedStoreId: 'pharmacy_1',
    failedStoreName: 'Dis-Chem Pharmacy',
    failedItemCents: 15000 // R150.00
  });

  assert.equal(partialRefund.success, true);
  assert.equal(partialRefund.refundRecord.refundAmountCents, 15000);
  assert.ok(partialRefund.customerMessage.includes('Dis-Chem Pharmacy was out of stock'));
  assert.ok(partialRefund.customerMessage.includes('refund of R150.00'));
});

test('29. Model Context Protocol (MCP) Server Adapter & JSON-RPC 2.0 Interop', async () => {
  const discovery = new NetworkDiscovery();
  const matching = new AgentMatchingEngine(discovery);
  const p2p = new P2PCommerceEngine();
  const a2a = new A2ACommerceEngine();
  const mcp = new MCPServerAdapter(matching, p2p, a2a);

  // 1. Tool listing request (tools/list)
  const toolsResponse = await mcp.handleJSONRPCRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list'
  });

  assert.equal(toolsResponse.jsonrpc, '2.0');
  assert.equal(toolsResponse.id, 1);
  assert.ok(toolsResponse.result.tools.some(t => t.name === 'discover_supply_demand'));
  assert.ok(toolsResponse.result.tools.some(t => t.name === 'post_supply_offer'));
  assert.ok(toolsResponse.result.tools.some(t => t.name === 'negotiate_a2a_deal'));
  assert.ok(toolsResponse.result.tools.some(t => t.name === 'request_transaction_checkout'));

  // 2. Tool execution (tools/call: discover_supply_demand)
  const discoverCall = await mcp.handleJSONRPCRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'discover_supply_demand',
      arguments: { query: '11 cashiers Midrand', vertical: 'JOBS' }
    }
  });

  assert.equal(discoverCall.id, 2);
  const contentObj = JSON.parse(discoverCall.result.content[0].text);
  assert.equal(contentObj.status, 'SUCCESS');
  assert.equal(contentObj.zeroAdBias, true);
  assert.equal(contentObj.vertical, 'JOBS');

  // 3. Tool execution (tools/call: negotiate_a2a_deal)
  const negCall = await mcp.handleJSONRPCRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'negotiate_a2a_deal',
      arguments: { buyerMaxCents: 330000, askingPriceCents: 350000, sellerMinCents: 320000 }
    }
  });

  const negObj = JSON.parse(negCall.result.content[0].text);
  assert.equal(negObj.agreed, true);
  assert.equal(negObj.agreedPriceCents, 325000);
});

test('30. Consultative Business Agent Creation Isolation & Factory Interview', async () => {
  const sessionEngine = new WhatsAppSessionEngine();

  // Retail Burger Order must NEVER receive business bot offers!
  await sessionEngine.handleIncomingMessage('27899999999', 'hi');
  await sessionEngine.handleIncomingMessage('27899999999', 'Sandton');
  await sessionEngine.handleIncomingMessage('27899999999', 'Thabo');

  const burgerResponse = await sessionEngine.handleIncomingMessage('27899999999', 'Order a Zinger Burger Meal');
  assert.ok(!burgerResponse.text.includes('R180.00'));
  assert.ok(!burgerResponse.text.includes('Business AI Employee'));
  assert.ok(burgerResponse.text.includes('Instant Checkout'));

  // Explicit Business Management Intent launches consultative Agent Factory
  const bizPrompt = await sessionEngine.handleIncomingMessage('27899999999', 'Help me run my small business');
  assert.ok(bizPrompt.text.includes('Business AI Employee'));
  assert.ok(bizPrompt.text.includes('R180.00 / month'));

  const bizNamePrompt = await sessionEngine.handleIncomingMessage('27899999999', '', 'start_business_bot');
  assert.ok(bizNamePrompt.text.includes('official name of your business'));

  const bizServicesPrompt = await sessionEngine.handleIncomingMessage('27899999999', 'Thabo Spaza');
  assert.ok(bizServicesPrompt.text.includes('main products or services'));

  const bizActiveConfirmation = await sessionEngine.handleIncomingMessage('27899999999', 'Bread R18, Milk R22, Eggs R35');
  assert.ok(bizActiveConfirmation.text.includes('Business Agent is Live'));
  assert.ok(bizActiveConfirmation.text.includes('Thabo Spaza'));
});

test('31. Full 10-API South African Gateway Stack & PayAt Municipal Rates', async () => {
  const saStack = new SAApiStackManager();

  // 1. Flash Prepaid Electricity
  const flashRes = await saStack.queryFlashPrepaid({ serviceType: 'ELECTRICITY', accountNumber: '04123456789', amountCents: 20000 });
  assert.equal(flashRes.gateway, 'Flash API');
  assert.equal(flashRes.affiliateEarningCents, 600); // 3% rebate

  // 10. PayAt Municipal Rates (Tshwane / Joburg / Ekurhuleni)
  const payAtRes = await saStack.queryPayAtMunicipalBills({
    municipality: 'City of Tshwane',
    billType: 'RATES_AND_TAXES',
    accountOrNoticeNumber: 'TSH_123456',
    amountCents: 150000 // R1,500 municipal rates
  });
  assert.equal(payAtRes.gateway, 'PayAt / 3PE / SwitchPay API');
  assert.equal(payAtRes.isMunicipalRates, true);
  assert.equal(payAtRes.hasAffiliateProgram, false);

  // Pricing Rule check for Non-Affiliate Municipal Bills (Transparent R10.00 Convenience Fee, 0% Store Markup Preserved)
  const billPricing = calculatePricing({
    intentMode: 'BILL_PAYMENT',
    goodsSubtotalCents: 150000,
    hasAffiliateCommissionProgram: false
  });

  assert.equal(billPricing.goodsMarkupCents, 0, 'Physical Store Goods markup must remain strictly 0%');
  assert.equal(billPricing.serviceConvenienceFeeCents, 1000, 'Non-affiliate municipal rates bill payment must apply R10.00 transparent service fee');
  assert.equal(billPricing.platformFeeCents, 1000);

  // 2. Travelpayouts Bus
  const busRes = await saStack.queryTravelpayoutsBus({ origin: 'PTA', destination: 'CPT', departureDate: '2025-10-01' });
  assert.equal(busRes.gateway, 'Travelpayouts API');
  assert.equal(busRes.affiliateEarningCents, 2450);

  // 3. Airalo eSIM
  const esimRes = await saStack.queryAiraloESIM({ countryCode: 'ZA', dataSizeMb: 5000 });
  assert.equal(esimRes.gateway, 'Airalo API');
  assert.equal(esimRes.affiliateEarningCents, 1800);

  // 4. Quicket
  const quicketRes = await saStack.queryQuicketTickets({ eventQuery: 'Cape Town Jazz Fest' });
  assert.equal(quicketRes.gateway, 'Quicket API');
  assert.equal(quicketRes.affiliateEarningCents, 1250);

  // 5. Amadeus
  const amadeusRes = await saStack.queryAmadeusTravel({ origin: 'JNB', destination: 'CPT' });
  assert.equal(amadeusRes.gateway, 'Amadeus API');
  assert.equal(amadeusRes.affiliateEarningCents, 13500);

  // 6. Awin
  const awinRes = await saStack.queryAwinGoods({ searchQuery: 'Samsung TV' });
  assert.equal(awinRes.gateway, 'Awin API');
  assert.equal(awinRes.affiliateEarningCents, 3150);

  // 7. Comparisure
  const compRes = await saStack.queryComparisureFinancials({ serviceType: 'FUNERAL_COVER' });
  assert.equal(compRes.gateway, 'Comparisure / Root API');
  assert.equal(compRes.leadReferralPayoutCents, 7500);

  // 8. Courier Guy / PUDO
  const pudoRes = await saStack.queryCourierGuyPudo({ pickupLocker: 'Rosebank Locker', dropoffAddress: 'Sandton', packageWeightKg: 2 });
  assert.equal(pudoRes.gateway, 'Courier Guy / PUDO API');
  assert.equal(pudoRes.quoteCents, 6000);

  // 9. Stitch
  const stitchRes = await saStack.queryStitchDirectBankPayment({ bankName: 'FNB', amountCents: 50000 });
  assert.equal(stitchRes.gateway, 'Stitch API');
  assert.equal(stitchRes.status, 'STITCH_PAYMENT_INITIATED');
});

test('32. PayFast Instant EFT Zero Fee Waiver Threshold (<= R3,000.00)', async () => {
  const payfast = new PayFastPaymentGateway('10000100');

  // R3,000.00 = 300,000 cents
  assert.equal(payfast.isInstantZeroFeePayFastEligible(300000), true);
  assert.equal(payfast.isInstantZeroFeePayFastEligible(300001), false);

  const zeroFeeSession = await payfast.createPaymentSession({
    transactionId: 'tx_eft_zero',
    amountCents: 150000,
    paymentMethod: 'eft'
  });

  assert.equal(zeroFeeSession.isZeroFeeInstantEFT, true);
  assert.equal(zeroFeeSession.paymentProcessingFeeCents, 0);

  const standardFeeSession = await payfast.createPaymentSession({
    transactionId: 'tx_eft_standard',
    amountCents: 350000,
    paymentMethod: 'eft'
  });

  assert.equal(standardFeeSession.isZeroFeeInstantEFT, false);
  assert.equal(standardFeeSession.paymentProcessingFeeCents, 250);

  // Test Pricing Engine Integration
  const pricingZero = calculatePricing({
    intentMode: 'BUY_PLUS_DELIVER',
    goodsSubtotalCents: 10000, // R100
    rawTransportQuoteCents: 5000, // R50
    isPayFastInstantEFT: true,
    config: DEFAULT_PRICING_CONFIG
  });

  assert.equal(pricingZero.isZeroFeeInstantEFT, true);
  assert.equal(pricingZero.paymentFeeCents, 0, 'PayFast Instant EFT for order under R3000 must waive payment fee');

  const pricingStandard = calculatePricing({
    intentMode: 'BUY_PLUS_DELIVER',
    goodsSubtotalCents: 350000, // R3,500
    rawTransportQuoteCents: 5000,
    isPayFastInstantEFT: true,
    config: DEFAULT_PRICING_CONFIG
  });

  assert.equal(pricingStandard.isZeroFeeInstantEFT, false);
  assert.equal(pricingStandard.paymentFeeCents, 250, 'PayFast Instant EFT for order over R3000 must charge R2.50 standard payment fee');
});

test('33. Universal Multi-Vertical Dispute Resolution Mechanisms', async () => {
  const disputeEngine = new DisputeResolutionEngine();

  // 1. Electricity / Flash Meter Token Dispute
  const elecDispute = await disputeEngine.fileMultiVerticalDispute({
    orderId: 'tx_elec_101',
    customerPhone: '27821111111',
    vertical: 'AIRTIME_DATA_ELECTRICITY',
    issueCode: 'TOKEN_NOT_RECEIVED',
    details: 'Meter token failed to arrive'
  });
  const elecRes = await disputeEngine.autoResolveVerticalDispute(elecDispute.disputeId);
  assert.equal(elecRes.success, true);
  assert.equal(elecRes.record.resolutionAction, 'FLASH_API_REQUERY_AND_RESEND');
  assert.ok(elecRes.customerMessage.includes('Prepaid Electricity Token Refresh'));

  // 2. Travel & Hotel Check-in Dispute
  const hotelDispute = await disputeEngine.fileMultiVerticalDispute({
    orderId: 'tx_hotel_202',
    customerPhone: '27822222222',
    vertical: 'TRAVEL_HOTEL_FLIGHT',
    issueCode: 'CHECKIN_REFUSED',
    details: 'Hotel desk denied checkin'
  });
  const hotelRes = await disputeEngine.autoResolveVerticalDispute(hotelDispute.disputeId);
  assert.equal(hotelRes.success, true);
  assert.equal(hotelRes.record.resolutionAction, 'AMADEUS_ROOM_UPGRADE_OR_RELOCATION');
  assert.ok(hotelRes.customerMessage.includes('Free Executive Suite Upgrade'));

  // 3. Car Rental Deposit Hold Dispute
  const rentalDispute = await disputeEngine.fileMultiVerticalDispute({
    orderId: 'tx_car_303',
    customerPhone: '27823333333',
    vertical: 'CAR_RENTAL',
    issueCode: 'DEPOSIT_HOLD_DISPUTE',
    details: 'Rental deposit hold not released'
  });
  const rentalRes = await disputeEngine.autoResolveVerticalDispute(rentalDispute.disputeId);
  assert.equal(rentalRes.success, true);
  assert.equal(rentalRes.record.resolutionAction, 'DEPOSIT_HOLD_RELEASE_ESCALATION');
  assert.ok(rentalRes.customerMessage.includes('RELEASED'));

  // 4. PUDO Smart Locker PIN Expired Dispute
  const lockerDispute = await disputeEngine.fileMultiVerticalDispute({
    orderId: 'tx_locker_404',
    customerPhone: '27824444444',
    vertical: 'COURIER_LOCKER',
    issueCode: 'LOCKER_PIN_EXPIRED',
    details: 'Locker door PIN expired'
  });
  const lockerRes = await disputeEngine.autoResolveVerticalDispute(lockerDispute.disputeId);
  assert.equal(lockerRes.success, true);
  assert.equal(lockerRes.record.resolutionAction, 'PUDO_PIN_OVERRIDE_TRIGGER');
  assert.ok(lockerRes.customerMessage.includes('881-209'));

  // 5. Instant EFT Duplicate Bank Debit Dispute
  const eftDispute = await disputeEngine.fileMultiVerticalDispute({
    orderId: 'tx_eft_505',
    customerPhone: '27825555555',
    vertical: 'INSTANT_EFT_BANK',
    issueCode: 'DUPLICATE_DEBIT',
    details: 'Double debited on Stitch'
  });
  const eftRes = await disputeEngine.autoResolveVerticalDispute(eftDispute.disputeId);
  assert.equal(eftRes.success, true);
  assert.equal(eftRes.record.resolutionAction, 'STITCH_DUPLICATE_DEBIT_REVERSAL');
  assert.ok(eftRes.customerMessage.includes('100% full refund of R350.00'));

  // 6. Test Session Engine Dispute Intercept
  const sessionEngine = new WhatsAppSessionEngine();
  await sessionEngine.handleIncomingMessage('27826666666', 'hi');
  await sessionEngine.handleIncomingMessage('27826666666', 'Sandton');
  await sessionEngine.handleIncomingMessage('27826666666', 'Lindiwe');

  const disputeResponse = await sessionEngine.handleIncomingMessage('27826666666', 'Meter token failed to generate');
  assert.equal(disputeResponse.type, 'DISPUTE_RESOLUTION_SCREEN');
  assert.ok(disputeResponse.text.includes('Prepaid Electricity Token Refresh'));
});

test('34. Multilingual Language Detection & Localized UI Templates', () => {
  // 1. Language Detection
  assert.equal(detectLanguage('Sawubona, ngicela ukuta ukudla'), SUPPORTED_LANGUAGES.ZU);
  assert.equal(detectLanguage('Molo, unjani namhlanje'), SUPPORTED_LANGUAGES.XH);
  assert.equal(detectLanguage('Goeiedag, ek wil graag kos bestel'), SUPPORTED_LANGUAGES.AF);
  assert.equal(detectLanguage('Dumela, re a leboga'), SUPPORTED_LANGUAGES.NSO);
  assert.equal(detectLanguage('Hello, I would like to order food'), SUPPORTED_LANGUAGES.EN);

  // 2. Localization Translations
  const zuWelcome = translate('welcome', SUPPORTED_LANGUAGES.ZU);
  assert.ok(zuWelcome.includes('Siyakwamukela'));

  const afPayNow = translate('pay_now', SUPPORTED_LANGUAGES.AF, { total: 'R150.00' });
  assert.equal(afPayNow, '💳 Betaal R150.00');

  const xhCheckoutHeader = translate('checkout_title', SUPPORTED_LANGUAGES.XH);
  assert.ok(xhCheckoutHeader.includes('Ukuhlawula Kwangoko'));
});

test('35. Complete 16 SA Revenue API Stack & 7 Courier Provider Aggregation', async () => {
  const saStack = new SAApiStackManager();

  // 11. Blue Label Telecoms
  const bluRes = await saStack.queryBlueLabelVouchers({ voucherType: '1VOUCHER', amountCents: 10000 });
  assert.equal(bluRes.gateway, 'Blue Label Telecoms API');
  assert.equal(bluRes.affiliateEarningCents, 1500);

  // 12. Axxess Fibre Install
  const axxRes = await saStack.queryAxxessFibreInstall({ address: 'Sandton', speedMbps: 100 });
  assert.equal(axxRes.gateway, 'Axxess Fibre API');
  assert.equal(axxRes.leadReferralPayoutCents, 50000);

  // 13. Takealot Fresh Grocery
  const takeRes = await saStack.queryTakealotFreshGrocery({ searchQuery: 'Milk & Bread' });
  assert.equal(takeRes.gateway, 'Takealot Marketplace & Fresh API');
  assert.equal(takeRes.affiliateEarningCents, 2100);

  // 14. PayJustNow / Mobicred BNPL
  const bnplRes = await saStack.queryPayJustNowBNPL({ amountCents: 150000, installments: 3 });
  assert.equal(bnplRes.gateway, 'PayJustNow / Mobicred BNPL API');
  assert.equal(bnplRes.merchantCommissionCents, 7500);

  // 15. Mukuru / Mama Money Remittance
  const mukRes = await saStack.queryMukuruRemittance({ recipientCountry: 'Zimbabwe', amountCents: 50000 });
  assert.equal(mukRes.gateway, 'Mukuru / Mama Money Remittance API');
  assert.equal(mukRes.agentCommissionCents, 1500);

  // 16. PayProp Rent Collection
  const rentRes = await saStack.queryPayPropRentCollection({ rentCents: 1000000, landlordId: 'landlord_99' });
  assert.equal(rentRes.gateway, 'PayProp Rent API');
  assert.equal(rentRes.commissionCents, 20000); // 1.5% of 10k + R50 = R200 (20000 cents)

  // 7 Courier & Logistics Providers (PicUp, WumDrop, Pargo, Droppa, Pingo, TruckIn, Muvr)
  const transport = new TransportAggregator();
  const quotes = await transport.getQuotes({ distanceKm: 10, items: [{ category: 'Food' }] });

  assert.equal(quotes.allQuotes.length, 4); // 4 providers supporting BIKE (picup, wumdrop, pargo, pingo)
  assert.ok(quotes.allQuotes.some(q => q.providerId === 'wumdrop'));
  assert.ok(quotes.allQuotes.some(q => q.providerId === 'pargo'));
  assert.ok(quotes.allQuotes.some(q => q.providerId === 'picup'));
  assert.equal(quotes.cheapestQuote.providerId, 'pargo', 'Pargo smart pickup should be cheapest for BIKE class');
});
