import { classifyIntent, INTENT_MODES } from '../lib/router.js';
import { calculatePricing, getPricingConfig } from '../lib/pricing.js';
import { CommerceAggregator } from '../commerce/aggregator.js';
import { TransportAggregator } from '../transport/aggregator.js';
import { WhatsAppUIBuilder } from './uiBuilder.js';
import { ScamPreventionEngine } from '../trust/scamPrevention.js';
import { UserOnboardingEngine } from './onboarding.js';
import { DisputeResolutionEngine } from '../trust/disputes.js';
import { AntiAbuseGuardEngine } from '../trust/antiAbuse.js';
import { AICostCurtailmentEngine } from '../lib/aiOptimizer.js';

export class WhatsAppSessionEngine {
  constructor(kvSessions, kvUsers, kvCatalog, db) {
    this.kvSessions = kvSessions;
    this.kvUsers = kvUsers;
    this.kvCatalog = kvCatalog;
    this.db = db;
    this.commerce = new CommerceAggregator();
    this.transport = new TransportAggregator();
    this.uiBuilder = new WhatsAppUIBuilder();
    this.scamEngine = new ScamPreventionEngine();
    this.onboardingEngine = new UserOnboardingEngine(kvUsers);
    this.disputeEngine = new DisputeResolutionEngine(db);
    this.antiAbuse = new AntiAbuseGuardEngine();
    this.aiOptimizer = new AICostCurtailmentEngine(kvCatalog);
    this.inMemorySessions = new Map();
  }

  async getSession(waId) {
    const key = `session:${waId}`;
    if (this.kvSessions) {
      const data = await this.kvSessions.get(key);
      if (data) return JSON.parse(data);
    }
    if (this.inMemorySessions.has(key)) {
      return this.inMemorySessions.get(key);
    }
    return {
      waId,
      step: 'STATE_IDLE',
      cart: [],
      selectedStore: null,
      deliveryQuote: null,
      transaction: null
    };
  }

  async saveSession(waId, session) {
    const key = `session:${waId}`;
    if (this.kvSessions) {
      await this.kvSessions.put(key, JSON.stringify(session), { expirationTtl: 86400 });
    } else {
      this.inMemorySessions.set(key, session);
    }
  }

  async handleIncomingMessage(waId, incomingText, buttonPayload = null, locationObj = null) {
    const text = (incomingText || '').trim();

    // 0. Anti-Abuse Check
    const abuseCheck = this.antiAbuse.screenInboundMessage(waId, text);
    if (abuseCheck.isBlocked) {
      return { text: abuseCheck.message };
    }

    let session = await this.getSession(waId);

    // 1. GPS Location Pin Handler
    if (locationObj && locationObj.latitude && locationObj.longitude) {
      session.gpsLocation = {
        lat: locationObj.latitude,
        lng: locationObj.longitude,
        address: locationObj.address || locationObj.name || `${locationObj.latitude.toFixed(4)}, ${locationObj.longitude.toFixed(4)}`
      };
      session.activeAddress = session.gpsLocation.address;
      await this.saveSession(waId, session);

      return this.uiBuilder.renderLocationPinCaptured({
        lat: locationObj.latitude,
        lng: locationObj.longitude,
        addressName: session.gpsLocation.address
      });
    }

    // 2. Dispute Handler
    if (text.toLowerCase().includes('parcel not delivered') || text.toLowerCase().includes('not delivered') || text.toLowerCase().includes('wrong item') || text.toLowerCase().includes('dispute')) {
      const dispute = await this.disputeEngine.fileDispute({
        orderId: session.transactionId || 'ord_recent',
        customerPhone: waId,
        issueType: 'PARCEL_NOT_DELIVERED',
        comments: text
      });

      const resolution = await this.disputeEngine.resolveDispute(dispute.disputeId, 'FREE_REMAKE');

      return {
        text: `🤝 *Dispute Support Center*\n` +
          `───────────────\n\n` +
          `We have registered your report (*Reference:* ${dispute.disputeId}). Payment to the courier has been *PAUSED* immediately for your protection.\n\n` +
          `${resolution.customerMessage}`
      };
    }

    // 3. New User Onboarding Check
    let userProfile = await this.onboardingEngine.getUserProfile(waId);
    if (!userProfile) {
      if (!session.onboardingStep) {
        session.onboardingStep = 'ONBOARDING_START';
      }

      const onboardingResult = await this.onboardingEngine.handleOnboarding(waId, text, session.onboardingStep);
      session.onboardingStep = onboardingResult.nextStep;

      if (onboardingResult.draftProfile) {
        session.draftName = onboardingResult.draftProfile.name;
      }

      if (onboardingResult.completedProfile) {
        userProfile = await this.onboardingEngine.saveUserProfile(waId, {
          name: session.draftName || 'User',
          address: onboardingResult.completedProfile.address
        });
        session.onboardingStep = 'ONBOARDING_COMPLETED';
        session.activeAddress = userProfile.address;
      }

      await this.saveSession(waId, session);
      return onboardingResult.screen;
    }

    // Dynamic Address Switcher Step
    if (session.step === 'AWAITING_NEW_ADDRESS') {
      session.activeAddress = text;
      session.step = 'STATE_AWAITING_APPROVAL';
      await this.saveSession(waId, session);

      const explicitItem = session.cart[0] || (await this.commerce.searchCatalog('kfc'))[0];
      const quotes = await this.transport.getQuotes({ distanceKm: 5, items: [explicitItem] });
      const config = await getPricingConfig(this.db);
      const pricing = calculatePricing({
        intentMode: 'BUY_PLUS_DELIVER',
        goodsSubtotalCents: explicitItem.priceCents,
        rawTransportQuoteCents: quotes.cheapestQuote.rawQuoteCents,
        config
      });

      return this.uiBuilder.renderOneTapCheckoutScreen({
        storeName: explicitItem.storeName || 'Partner Store',
        itemName: explicitItem.name,
        itemPriceCents: explicitItem.priceCents,
        vehicleClass: quotes.requiredVehicleClass,
        providerName: quotes.cheapestQuote.providerName,
        transportCostCents: quotes.cheapestQuote.rawQuoteCents,
        totalCustomerPaysCents: pricing.totalCustomerPaysCents,
        deliveryAddress: session.activeAddress,
        transactionId: session.transactionId
      });
    }

    // 4. Interactive Button Tap Handlers
    if (buttonPayload) {
      if (buttonPayload === 'swap_item') {
        const storeName = session.cart[0]?.storeName || 'KFC';
        const items = await this.commerce.searchCatalog(storeName);
        return this.uiBuilder.renderItemSwapperScreen({ storeName, items });
      }

      if (buttonPayload === 'change_location') {
        session.step = 'AWAITING_NEW_ADDRESS';
        await this.saveSession(waId, session);
        return this.uiBuilder.renderLocationPromptScreen();
      }

      if (buttonPayload.startsWith('dispute_')) {
        const orderId = buttonPayload.replace('dispute_', '');
        const dispute = await this.disputeEngine.fileDispute({ orderId, customerPhone: waId, issueType: 'PARCEL_NOT_DELIVERED' });
        const resolution = await this.disputeEngine.resolveDispute(dispute.disputeId, 'FREE_REMAKE');

        return {
          text: `🤝 *Dispute Support Center*\n` +
            `───────────────\n\n` +
            `We have registered your report (*Reference:* ${dispute.disputeId}). Payment to the driver has been *PAUSED* immediately for your protection.\n\n` +
            `${resolution.customerMessage}`
        };
      }

      if (buttonPayload === 'action_food') {
        const items = await this.commerce.searchCatalog('kfc');
        return this.uiBuilder.renderProductScreen({ storeName: 'KFC', items });
      }

      if (buttonPayload === 'action_groceries') {
        const items = await this.commerce.searchCatalog('pnp');
        return this.uiBuilder.renderProductScreen({ storeName: 'Pick n Pay', items });
      }

      if (buttonPayload === 'action_moving') {
        return { text: `🚚 *Moving & Furniture Delivery*\n\nTell me what item you need to move or pick up (e.g. *Move an L-Shape couch from Sandton to Randburg*).` };
      }

      if (buttonPayload === 'action_sell') {
        return { text: `🏷️ *Sell an Item*\n\nReply with what you are selling, your price, and category (e.g. *iPhone 15, R12000, Electronics*).` };
      }

      if (buttonPayload.startsWith('tap_approve_')) {
        const txId = buttonPayload.replace('tap_approve_', '');
        session.step = 'STATE_LIVE_ORDER';
        await this.saveSession(waId, session);

        return this.uiBuilder.renderLiveOrderScreen({
          orderId: `ord_${txId.substring(0, 6)}`,
          status: 'CONFIRMED - COURIER DISPATCHED',
          courierName: session.deliveryQuote?.providerName || 'PicUp Courier',
          driverName: 'Sipho',
          etaMinutes: 3
        });
      }

      if (buttonPayload.startsWith('tap_cancel_')) {
        session.step = 'STATE_IDLE';
        session.cart = [];
        await this.saveSession(waId, session);
        return { text: '❌ Order cancelled. What else can I help you with today?' };
      }

      if (buttonPayload.startsWith('add_')) {
        const itemId = buttonPayload.replace('add_', '');
        const items = await this.commerce.searchCatalog('');
        const item = items.find(i => i.id === itemId);
        if (item) {
          // Fast-Path: Swap or set single item in cart and refresh checkout instantly!
          session.cart = [item];

          const quotes = await this.transport.getQuotes({ distanceKm: 5, items: [item] });
          const config = await getPricingConfig(this.db);
          const pricing = calculatePricing({
            intentMode: 'BUY_PLUS_DELIVER',
            goodsSubtotalCents: item.priceCents,
            rawTransportQuoteCents: quotes.cheapestQuote.rawQuoteCents,
            config
          });

          const txId = `tx_fast_${Date.now()}`;
          session.deliveryQuote = quotes.cheapestQuote;
          session.pricing = pricing;
          session.transactionId = txId;
          session.activeAddress = session.activeAddress || userProfile.address || 'Saved Location';
          session.step = 'STATE_AWAITING_APPROVAL';
          await this.saveSession(waId, session);

          return this.uiBuilder.renderOneTapCheckoutScreen({
            storeName: item.storeName || 'Partner Store',
            itemName: item.name,
            itemPriceCents: item.priceCents,
            vehicleClass: quotes.requiredVehicleClass,
            providerName: quotes.cheapestQuote.providerName,
            transportCostCents: quotes.cheapestQuote.rawQuoteCents,
            totalCustomerPaysCents: pricing.totalCustomerPaysCents,
            deliveryAddress: session.activeAddress,
            transactionId: txId
          });
        }
      }
    }

    // 5. Text Message NLU Intent & Frictionless Swapping
    const maskedText = this.scamEngine.maskOffPlatformContacts(text);
    const intentMode = classifyIntent(maskedText);

    if (intentMode === INTENT_MODES.A2A_SELL) {
      session.step = 'STATE_IDLE';
      await this.saveSession(waId, session);

      const velocityCheck = this.antiAbuse.validateListingVelocity(waId);
      if (!velocityCheck.allowed) {
        return { text: velocityCheck.message };
      }

      return {
        text: `🏷️ *Create Listing*\n\n` +
          `What item are you selling? Please reply with:\n` +
          `Item Name, Price in Rand, and Category (e.g. *iPhone 15, R12000, Electronics*).`
      };
    }

    // APPLE-LEVEL 1-TAP CHECKOUT FAST-PATH & FRICTIONLESS SWAPPING:
    const items = await this.commerce.searchCatalog(maskedText);
    if (items.length > 0) {
      const explicitItem = items.find(i => maskedText.toLowerCase().includes(i.name.toLowerCase().substring(0, 4))) || items[0];

      const quotes = await this.transport.getQuotes({ distanceKm: 5, items: [explicitItem] });
      const config = await getPricingConfig(this.db);

      const pricing = calculatePricing({
        intentMode: 'BUY_PLUS_DELIVER',
        goodsSubtotalCents: explicitItem.priceCents,
        rawTransportQuoteCents: quotes.cheapestQuote.rawQuoteCents,
        config
      });

      const txId = `tx_fast_${Date.now()}`;
      session.cart = [explicitItem];
      session.deliveryQuote = quotes.cheapestQuote;
      session.pricing = pricing;
      session.transactionId = txId;
      session.activeAddress = session.activeAddress || userProfile.address || 'Saved Location';
      session.step = 'STATE_AWAITING_APPROVAL';
      await this.saveSession(waId, session);

      return this.uiBuilder.renderOneTapCheckoutScreen({
        storeName: explicitItem.storeName || 'Partner Store',
        itemName: explicitItem.name,
        itemPriceCents: explicitItem.priceCents,
        vehicleClass: quotes.requiredVehicleClass,
        providerName: quotes.cheapestQuote.providerName,
        transportCostCents: quotes.cheapestQuote.rawQuoteCents,
        totalCustomerPaysCents: pricing.totalCustomerPaysCents,
        deliveryAddress: session.activeAddress,
        transactionId: txId
      });
    }

    return {
      text: `Hello ${userProfile.name}! 👋 How can I help you today? You can order from Makro, Dischem, Specsavers, Vets, Game, KFC, or send me a GPS location pin!`
    };
  }
}
