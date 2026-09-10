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

test('1. Pricing Threshold Boundaries (R99.99, R100, R100.01)', () => {
  const rawTransport = 5000; // R50.00 transport quote

  // Case A: Cart = R99.99 (9999 cents) -> < R100 threshold -> 10% transport margin (500 cents)
  const price9999 = calculatePricing({
    intentMode: 'BUY_PLUS_DELIVER',
    goodsSubtotalCents: 9999,
    rawTransportQuoteCents: rawTransport,
    config: DEFAULT_PRICING_CONFIG
  });
  assert.equal(price9999.goodsMarkupCents, 0, 'Store goods markup must be 0%');
  assert.equal(price9999.transportMarginCents, 500, 'R99.99 cart must use 10% transport margin');

  // Case B: Cart = R100.00 (10000 cents) -> >= R100 threshold -> 20% transport margin (1000 cents)
  const price10000 = calculatePricing({
    intentMode: 'BUY_PLUS_DELIVER',
    goodsSubtotalCents: 10000,
    rawTransportQuoteCents: rawTransport,
    config: DEFAULT_PRICING_CONFIG
  });
  assert.equal(price10000.goodsMarkupCents, 0, 'Store goods markup must be 0%');
  assert.equal(price10000.transportMarginCents, 1000, 'R100.00 cart must exclusively use 20% transport margin');

  // Case C: Cart = R100.01 (10001 cents) -> >= R100 threshold -> 20% transport margin (1000 cents)
  const price10001 = calculatePricing({
    intentMode: 'BUY_PLUS_DELIVER',
    goodsSubtotalCents: 10001,
    rawTransportQuoteCents: rawTransport,
    config: DEFAULT_PRICING_CONFIG
  });
  assert.equal(price10001.transportMarginCents, 1000, 'R100.01 cart must use 20% transport margin');

  // Case D: P2P Sale -> 5% goods commission + 20% transport margin
  const p2pPrice = calculatePricing({
    intentMode: 'P2P_SALE',
    goodsSubtotalCents: 20000, // R200.00
    rawTransportQuoteCents: 10000, // R100.00
    config: DEFAULT_PRICING_CONFIG
  });
  assert.equal(p2pPrice.p2pCommissionCents, 1000, 'P2P goods commission must be 5% of R200 = R10 (1000 cents)');
  assert.equal(p2pPrice.transportMarginCents, 2000, 'P2P transport margin must be 20% of R100 = R20 (2000 cents)');
});

test('2. Double-Entry Ledger Balancing', async () => {
  const ledger = new DoubleEntryLedger();

  // Balanced transaction
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

  // Unbalanced transaction should throw error
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

  // Valid flow up to PENDING_APPROVAL
  smP2P.transitionTo(TRANSACTION_STATES.MATCHED);
  smP2P.transitionTo(TRANSACTION_STATES.QUOTED);
  smP2P.transitionTo(TRANSACTION_STATES.PENDING_APPROVAL);

  // Attempting PENDING_APPROVAL -> AUTHORISED without approvals must fail
  assert.throws(() => {
    smP2P.transitionTo(TRANSACTION_STATES.AUTHORISED);
  }, /Approval Gate Block/);

  // Register buyer approval only -> still fails for P2P
  smP2P.registerBuyerApproval();
  assert.throws(() => {
    smP2P.transitionTo(TRANSACTION_STATES.AUTHORISED);
  }, /Approval Gate Block/);

  // Register seller approval -> now succeeds!
  smP2P.registerSellerApproval();
  const transitionResult = smP2P.transitionTo(TRANSACTION_STATES.AUTHORISED);
  assert.equal(transitionResult.newState, TRANSACTION_STATES.AUTHORISED);

  // Invalid state jump from AUTHORISED directly to COMPLETED must fail
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
  // Food items -> BIKE
  const bikeVehicle = classifyLoadVehicle({ items: [{ category: 'Food' }], totalWeightKg: 2 });
  assert.equal(bikeVehicle, 'BIKE');

  // Furniture item -> BAKKIE_1TON
  const furnitureVehicle = classifyLoadVehicle({ items: [{ category: 'Furniture' }], totalWeightKg: 50 });
  assert.equal(furnitureVehicle, 'BAKKIE_1TON');

  // Heavy freight 5000kg -> TRUCK_8TON
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

  // Validation should fail on empty catalog
  const validation = factory.validateConfig(draft);
  assert.equal(validation.valid, false);

  // Populate catalog and validate again
  factory.collectData(draft.id, { catalog: [{ name: 'Burger', priceCents: 5000 }] });
  const activeAgent = factory.activate(draft.id);
  assert.equal(activeAgent.status, 'ACTIVE');

  // Create old draft and test 48h cleanup
  const oldDraft = factory.createDraft('usr_mary', 'Old Store', 'General');
  factory.drafts.get(oldDraft.id).updatedAt = Date.now() - (49 * 60 * 60 * 1000); // 49 hours old

  const cleanupResult = await factory.cleanupExpiredDrafts();
  assert.equal(cleanupResult.cleanedCount, 1);
});

test('9. Scam Prevention & Contact Masking', () => {
  const scamEngine = new ScamPreventionEngine();

  const unmaskedText = 'Call me on 0821234567 or email test@gmail.com to buy off platform!';
  const maskedText = scamEngine.maskOffPlatformContacts(unmaskedText);

  assert.ok(!maskedText.includes('0821234567'));
  assert.ok(!maskedText.includes('test@gmail.com'));
  assert.ok(maskedText.includes('[CONTACT MASKED BY MYAI]'));

  // Listing protection
  const listingCheck = scamEngine.validateListingProtection({
    item: { name: 'iPhone 15', category: 'Electronics', priceCents: 150000 },
    photoUrl: 'https://cdn.myai.co.za/iphone.jpg',
    serialOrImei: 'IMEI1234567890',
    sellerId: 'usr_seller_1',
    isNewSeller: true
  });

  assert.equal(listingCheck.approved, true);
  assert.equal(listingCheck.requiresEscrowHold, true);
});
