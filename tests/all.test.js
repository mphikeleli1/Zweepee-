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

  const nameScreen = await sessionEngine.handleIncomingMessage('27820000000', 'John Doe');
  assert.ok(nameScreen.text.includes('Nice to meet you'));

  const addressScreen = await sessionEngine.handleIncomingMessage('27820000000', 'Sandton');
  assert.ok(addressScreen.text.includes('You\'re All Set'));

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
  assert.equal(res1.nextStep, 'ONBOARDING_AWAITING_NAME');

  const res2 = await onboarding.handleOnboarding('27811111111', 'Sipho', 'ONBOARDING_AWAITING_NAME');
  assert.equal(res2.nextStep, 'ONBOARDING_AWAITING_ADDRESS');
  assert.equal(res2.draftProfile.name, 'Sipho');

  const res3 = await onboarding.handleOnboarding('27811111111', 'Rosebank', 'ONBOARDING_AWAITING_ADDRESS');
  assert.equal(res3.nextStep, 'ONBOARDING_COMPLETED');
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
  await sessionEngine.handleIncomingMessage('27844444444', 'Kagiso');
  await sessionEngine.handleIncomingMessage('27844444444', 'Sandton');

  const screen = await sessionEngine.handleIncomingMessage('27844444444', 'Get me KFC Streetwise 2');
  assert.equal(screen.type, 'ONE_TAP_CHECKOUT_SCREEN');
  assert.ok(screen.text.includes('Instant Checkout'));
  assert.ok(screen.buttons[0].reply.title.includes('Pay R'));
});

test('20. Dynamic Location Switcher (Work vs Home Address)', async () => {
  const sessionEngine = new WhatsAppSessionEngine();

  await sessionEngine.handleIncomingMessage('27855555555', 'hi');
  await sessionEngine.handleIncomingMessage('27855555555', 'Lindiwe');
  await sessionEngine.handleIncomingMessage('27855555555', 'Home: Sandton');

  // Request order -> Initially assigned Home: Sandton
  const screen1 = await sessionEngine.handleIncomingMessage('27855555555', 'Get me KFC Streetwise 2');
  assert.ok(screen1.text.includes('Home: Sandton'));

  // User taps [ Change Address / Work ]
  const promptScreen = await sessionEngine.handleIncomingMessage('27855555555', '', 'change_location');
  assert.equal(promptScreen.type, 'LOCATION_PROMPT_SCREEN');

  // User types new Work address
  const screen2 = await sessionEngine.handleIncomingMessage('27855555555', 'Work: Rosebank Office Park');
  assert.equal(screen2.type, 'ONE_TAP_CHECKOUT_SCREEN');
  assert.ok(screen2.text.includes('Work: Rosebank Office Park'));
});
