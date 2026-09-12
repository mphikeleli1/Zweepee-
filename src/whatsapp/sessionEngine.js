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
import { A2ACommerceEngine } from '../trust/a2aCommerce.js';
import { P2PCommerceEngine } from '../trust/p2pFeatures.js';
import { AgentFactory } from '../agents/factory.js';
import { AgentMatchingEngine } from '../network/matching.js';
import { NetworkDiscovery } from '../network/discovery.js';
import { SAApiStackManager } from '../commerce/saApiStack.js';
import { detectLanguage, translate } from '../lib/i18n.js';

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
    this.a2aEngine = new A2ACommerceEngine();
    this.p2pEngine = new P2PCommerceEngine(db);
    this.agentFactory = new AgentFactory(db);
    this.discovery = new NetworkDiscovery();
    this.matchingEngine = new AgentMatchingEngine(this.discovery);
    this.saStack = new SAApiStackManager();
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
    const text = (incomingText || buttonPayload || '').trim();

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

      let userProfile = await this.onboardingEngine.getUserProfile(waId);
      if (!userProfile && session.onboardingStep === 'ONBOARDING_AWAITING_LOCATION') {
        session.draftAddress = session.gpsLocation.address;
        session.onboardingStep = 'ONBOARDING_AWAITING_NAME';
        await this.saveSession(waId, session);

        return {
          text: `📍 *Location Saved:* ${session.gpsLocation.address}\n\n` +
            `Awesome! What is your *name* so I can build, personalize, and activate your Personal Agent?`
        };
      }

      await this.saveSession(waId, session);

      return this.uiBuilder.renderLocationPinCaptured({
        lat: locationObj.latitude,
        lng: locationObj.longitude,
        addressName: session.gpsLocation.address
      });
    }

    // 2. Multi-Vertical Dispute Handler
    const lowerText = text.toLowerCase();
    if (lowerText.includes('dispute') || lowerText.includes('meter token failed') || lowerText.includes('hotel denied checkin') || lowerText.includes('rental deposit hold') || lowerText.includes('locker pin expired') || lowerText.includes('ticket barcode invalid') || lowerText.includes('esim not working') || lowerText.includes('double debited') || lowerText.includes('parcel not delivered')) {
      let vertical = 'FLEET_FAULT_DELIVERY';
      let issueCode = 'DELIVERY_FAILURE';

      if (lowerText.includes('meter') || lowerText.includes('electricity') || lowerText.includes('token')) {
        vertical = 'AIRTIME_DATA_ELECTRICITY';
        issueCode = 'TOKEN_NOT_RECEIVED';
      } else if (lowerText.includes('hotel') || lowerText.includes('checkin') || lowerText.includes('flight')) {
        vertical = 'TRAVEL_HOTEL_FLIGHT';
        issueCode = 'CHECKIN_REFUSED';
      } else if (lowerText.includes('deposit') || lowerText.includes('rental')) {
        vertical = 'CAR_RENTAL';
        issueCode = 'DEPOSIT_HOLD_DISPUTE';
      } else if (lowerText.includes('ticket') || lowerText.includes('barcode') || lowerText.includes('quicket')) {
        vertical = 'EVENT_TICKETS';
        issueCode = 'INVALID_BARCODE';
      } else if (lowerText.includes('esim') || lowerText.includes('airalo')) {
        vertical = 'ESIM_DATA';
        issueCode = 'PROFILE_ACTIVATION_FAILED';
      } else if (lowerText.includes('locker') || lowerText.includes('pudo') || lowerText.includes('pin expired')) {
        vertical = 'COURIER_LOCKER';
        issueCode = 'LOCKER_PIN_EXPIRED';
      } else if (lowerText.includes('double debited') || lowerText.includes('duplicate payment') || lowerText.includes('stitch')) {
        vertical = 'INSTANT_EFT_BANK';
        issueCode = 'DUPLICATE_DEBIT';
      } else if (lowerText.includes('rates') || lowerText.includes('tshwane') || lowerText.includes('joburg')) {
        vertical = 'MUNICIPAL_RATES';
        issueCode = 'PAYMENT_CLEARANCE_QUERY';
      }

      const dispute = await this.disputeEngine.fileMultiVerticalDispute({
        orderId: session.transactionId || 'tx_recent_order',
        customerPhone: waId,
        vertical,
        issueCode,
        details: text
      });

      const autoRes = await this.disputeEngine.autoResolveVerticalDispute(dispute.disputeId);

      return this.uiBuilder.renderDisputeResolutionScreen({
        disputeId: dispute.disputeId,
        resolutionMessage: autoRes.customerMessage
      });
    }

    // 3. Early Buyer Escrow Release Handler
    if (text.toLowerCase().includes('release escrow') || text.toLowerCase().includes('release funds') || text.toLowerCase().includes('approve goods')) {
      const txId = session.transactionId || 'tx_p2p_recent';
      const releaseResult = this.p2pEngine.buyerReleaseEscrowEarly(txId, waId);
      return { text: releaseResult.message };
    }

    // 3b. Multilingual Preference Detection
    const detectedLang = detectLanguage(text);
    if (detectedLang && detectedLang !== 'en') {
      session.preferredLanguage = detectedLang;
    }

    // 4. New User Onboarding Check
    let userProfile = await this.onboardingEngine.getUserProfile(waId);
    if (!userProfile) {
      if (!session.onboardingStep) {
        session.onboardingStep = 'ONBOARDING_START';
      }

      const onboardingResult = await this.onboardingEngine.handleOnboarding(waId, text, session.onboardingStep);
      session.onboardingStep = onboardingResult.nextStep;

      if (onboardingResult.draftProfile) {
        if (onboardingResult.draftProfile.address) session.draftAddress = onboardingResult.draftProfile.address;
        if (onboardingResult.draftProfile.name) session.draftName = onboardingResult.draftProfile.name;
      }

      if (onboardingResult.completedProfile) {
        userProfile = await this.onboardingEngine.saveUserProfile(waId, {
          name: onboardingResult.completedProfile.name || session.draftName || 'User',
          address: onboardingResult.completedProfile.address || session.draftAddress || 'Default Address',
          preferences: onboardingResult.completedProfile.preferences || null
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

    // P2P Listing Details Step Handler
    if (session.step === 'AWAITING_P2P_LISTING_DETAILS') {
      session.step = 'STATE_IDLE';
      await this.saveSession(waId, session);

      const parts = text.split(',');
      const itemName = parts[0]?.trim() || 'Pre-owned Item';
      const priceRandStr = parts[1]?.replace(/[^0-9.]/g, '') || '1000';
      const priceCents = Math.round(parseFloat(priceRandStr) * 100) || 100000;

      const protection = this.scamEngine.validateListingProtection({
        sellerId: waId,
        item: { name: itemName, priceCents, category: 'General' }
      });

      return {
        text: `🏷️ *Listing Created & Published on myAI Open Network!*\n` +
          `───────────────\n\n` +
          `🛍️ *Item:* ${itemName}\n` +
          `💵 *Asking Price:* R${(priceCents / 100).toFixed(2)}\n` +
          `🛡️ *Safety Protection:* ${protection.escrowHoldNotice}\n\n` +
          `Your Personal Agent is now matching your listing with active buyer agents across South Africa!`
      };
    }

    // 5. Interactive Button Tap Handlers
    if (buttonPayload) {
      if (buttonPayload === 'start_business_bot') {
        const draft = this.agentFactory.createDraft(waId, `${userProfile.name}'s Business`, 'General');
        session.businessAgentDraftId = draft.id;
        session.businessStep = 'AWAITING_BIZ_NAME';
        await this.saveSession(waId, session);

        return {
          text: `🏢 *Create Your Business AI Agent*\n\n` +
            `What is the official name of your business/shop? (e.g. *Sipho's Spaza & Groceries*)`
        };
      }

      if (buttonPayload.startsWith('release_escrow_')) {
        const txId = buttonPayload.replace('release_escrow_', '');
        const releaseResult = this.p2pEngine.buyerReleaseEscrowEarly(txId, waId);
        return { text: releaseResult.message };
      }

      if (buttonPayload.startsWith('accept_counter_')) {
        const txId = buttonPayload.replace('accept_counter_', '');
        session.step = 'STATE_LIVE_ORDER';
        await this.saveSession(waId, session);

        return this.uiBuilder.renderLiveOrderScreen({
          orderId: `ord_${txId.substring(0, 6)}`,
          status: 'A2A DEAL ACCEPTED - COURIER DISPATCHED',
          courierName: 'PicUp Courier',
          driverName: 'Sipho',
          etaMinutes: 20
        });
      }

      if (buttonPayload.startsWith('decline_counter_')) {
        session.step = 'STATE_IDLE';
        await this.saveSession(waId, session);
        return { text: '❌ A2A counter offer declined. Let me know if you would like to search for other items!' };
      }

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
        session.step = 'AWAITING_P2P_LISTING_DETAILS';
        await this.saveSession(waId, session);
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

    // Business Agent Conversational Interview Steps
    if (session.businessStep === 'AWAITING_BIZ_NAME') {
      const bizName = text;
      session.businessName = bizName;
      session.businessStep = 'AWAITING_BIZ_SERVICES';
      await this.saveSession(waId, session);

      return {
        text: `💼 *${bizName}*\n\nWhat main products or services do you offer? (e.g. *Haircuts R150, Braids R350* or *Plumbing Repairs R450/hr*)`
      };
    }

    if (session.businessStep === 'AWAITING_BIZ_SERVICES') {
      const servicesText = text;
      const draftId = session.businessAgentDraftId;

      this.agentFactory.collectData(draftId, {
        catalog: [{ name: servicesText, priceCents: 18000 }]
      });

      const activeAgent = this.agentFactory.activate(draftId);
      session.businessStep = null;
      await this.saveSession(waId, session);

      return {
        text: `🎉 *Your Business Agent is Live on myAI Network!*\n\n` +
          `• *Business Name:* ${session.businessName}\n` +
          `• *Agent ID:* ${activeAgent.id}\n` +
          `• *Monetization:* R180.00/month Subscription (Invoicing, Bookkeeping & Customer Booking Included)\n\n` +
          `Your Business Agent is now discoverable by thousands of Personal Agents looking for services across South Africa! 🚀`
      };
    }

    // 6. Text Message NLU Intent & Advice Prohibition Intercept
    const maskedText = this.scamEngine.maskOffPlatformContacts(text);
    const intentMode = classifyIntent(maskedText);

    // MULTI-VERTICAL INTENT HANDLING: Travel, Hotel, Jobs, Property, Municipal Rates

    // Travel & Hotel Bundle Intent
    if (maskedText.toLowerCase().includes('hotel') || maskedText.toLowerCase().includes('car hire') || maskedText.toLowerCase().includes('flight') || maskedText.toLowerCase().includes('cpt')) {
      const hotelRes = await this.saStack.queryAmadeusTravel({ origin: 'JNB', destination: 'CPT' });
      const busRes = await this.saStack.queryTravelpayoutsBus({ origin: 'JNB', destination: 'CPT', departureDate: '2025-09-10' });

      const hotelPriceCents = 925000; // R9,250.00
      const carPriceCents = 175000;   // R1,750.00
      const bundleTotalCents = hotelPriceCents + carPriceCents;

      return this.uiBuilder.renderTravelBundleScreen({
        title: 'Sea Point Beachfront Hotel & Polo Car Hire',
        hotelImageUrl: 'https://cdn.myai.co.za/hotels/sea-point-cpt.jpg',
        hotelRating: '⭐⭐⭐⭐⭐',
        hotelAddress: 'Beach Road, Sea Point, Cape Town',
        totalBundleCents,
        components: [
          { name: 'Sea Point Beachfront Hotel (5 Nights, Sep 10-15)', priceCents: hotelPriceCents, image: 'https://cdn.myai.co.za/hotels/sea-point-cpt.jpg' },
          { name: 'VW Polo Hatchback Car Hire (5 Days, CPT Airport pickup)', priceCents: carPriceCents, image: 'https://cdn.myai.co.za/cars/polo.jpg' }
        ]
      });
    }

    // Municipal Bills & Rates Intent
    if (maskedText.toLowerCase().includes('tshwane') || maskedText.toLowerCase().includes('joburg') || maskedText.toLowerCase().includes('rates') || maskedText.toLowerCase().includes('fine') || maskedText.toLowerCase().includes('bill')) {
      const payAtRes = await this.saStack.queryPayAtMunicipalBills({
        municipality: 'City of Tshwane',
        billType: 'RATES_AND_TAXES',
        accountOrNoticeNumber: 'TSH_998821',
        amountCents: 150000 // R1,500
      });

      const config = await getPricingConfig(this.db);
      const pricing = calculatePricing({
        intentMode: 'BILL_PAYMENT',
        goodsSubtotalCents: 150000,
        hasAffiliateCommissionProgram: false,
        config
      });

      const txId = `tx_bill_${Date.now()}`;
      session.pricing = pricing;
      session.transactionId = txId;
      session.step = 'STATE_AWAITING_APPROVAL';
      await this.saveSession(waId, session);

      return {
        text: `🏛️ *Municipal Bill Payment (${payAtRes.municipality})*\n` +
          `───────────────\n\n` +
          `📋 *Account:* ${payAtRes.accountOrNoticeNumber}\n` +
          `💵 *Rates Amount:* R1,500.00 (Exact Municipal Bill)\n` +
          `🛡️ *Service Convenience Fee:* R10.00\n` +
          `💳 *Payment Fee:* R2.50\n` +
          `───────────────\n` +
          `🏷️ *ONE TOTAL:* R1,512.50\n\n` +
          `Tap Approve below to settle your municipal rates instantly!`,
        buttons: [
          { type: 'reply', reply: { id: `tap_approve_${txId}`, title: '💳 Pay R1,512.50 Now' } },
          { type: 'reply', reply: { id: `tap_cancel_${txId}`, title: '❌ Cancel' } }
        ]
      };
    }

    // Job / Hiring Intent
    if (intentMode === INTENT_MODES.JOB_MATCHING) {
      const match = this.matchingEngine.matchMultiDimensional({
        queryText: maskedText,
        filters: { vertical: 'JOBS', quantity: 11, maxSalaryCents: 500000, qualification: 'Matric' }
      });

      return this.uiBuilder.renderJobsMatchScreen({
        jobTitle: 'Cashier / Retail Staff (Matric)',
        location: 'Midrand, Gauteng',
        quantity: 11,
        salaryCents: 500000,
        agentName: 'Midrand Staffing BA'
      });
    }

    // EXPLICIT BUSINESS AGENT CREATION REQUEST:
    if (intentMode === INTENT_MODES.BUSINESS_AGENCY_REQUEST) {
      return {
        text: `💼 *myAI™ Business AI Employee*\n` +
          `───────────────\n\n` +
          `I can build a dedicated *Business Agent* customized specifically for your business!\n\n` +
          `*Your Business AI Employee includes:*\n` +
          `• 📊 Basic Bookkeeping & Cash Flow summaries\n` +
          `• 🧾 Instant PDF Invoice & Quote Generation on WhatsApp\n` +
          `• 📋 Employer Records & CCMA-compliant employment contracts\n` +
          `• 🛒 24/7 Customer Query & Booking Management\n\n` +
          `*Subscription:* R180.00 / month (configurable)\n\n` +
          `Would you like me to assemble your Business Agent now?`,
        buttons: [
          { type: 'reply', reply: { id: 'start_business_bot', title: '🚀 Build My Business Bot' } },
          { type: 'reply', reply: { id: 'tap_cancel_biz', title: '❌ Not Right Now' } }
        ]
      };
    }

    // ADVICE PROHIBITION RULE INTERCEPT:
    if (intentMode === INTENT_MODES.SERVICE_REFERRAL) {
      return {
        text: `🏥 *Professional Service Referral Conduit*\n` +
          `───────────────\n\n` +
          `As your myAI™ Personal Agent, I do *not* provide direct medical, financial, or legal advice.\n\n` +
          `Instead, I can connect you directly with licensed, verified healthcare providers, registered financial advisors, or legal experts for a consultation!`
      };
    }

    if (intentMode === INTENT_MODES.A2A_SELL) {
      session.step = 'AWAITING_P2P_LISTING_DETAILS';
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

    // Default: Search catalog
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
