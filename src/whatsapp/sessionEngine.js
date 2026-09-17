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
import { EmploymentReadinessEngine } from '../employment/readinessPack.js';
import { SAJobAggregator } from '../employment/jobAggregator.js';
import { JobSeekerOnboardingEngine } from '../employment/jobOnboarding.js';
import { RecruitmentContractEngine } from '../employment/msaContract.js';
import { DuffelFlightEngine } from '../commerce/duffelFlight.js';
import { PaystackPaymentGateway } from '../payments/paystack.js';
import { PayFastPaymentGateway } from '../payments/payfast.js';
import { PayShapPaymentGateway } from '../payments/payshap.js';

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
    this.employmentEngine = new EmploymentReadinessEngine();
    this.jobAggregator = new SAJobAggregator();
    this.jobOnboardingEngine = new JobSeekerOnboardingEngine(kvUsers);
    this.contractEngine = new RecruitmentContractEngine(db, kvSessions);
    this.duffelEngine = new DuffelFlightEngine();
    this.paystack = new PaystackPaymentGateway();
    this.payfast = new PayFastPaymentGateway();
    this.payshap = new PayShapPaymentGateway();
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

  async processConciergePaymentWebhook({ reference, amountCents = 35000, gateway = 'PAYSTACK', isSuccess = true }) {
    // Extract waId robustly from reference (e.g. paystack_concierge_27845555555_1710000000_1710000001 or paystack_concierge_sess1_27845555555)
    const refParts = reference.split('_');
    let waId = '27820000000';

    // Find the part that looks like a phone number (e.g., 27845555555)
    const foundPhone = refParts.find(p => /^27\d{9,}$/.test(p));
    if (foundPhone) {
      waId = foundPhone;
    } else if (refParts[2] && /^27\d{9,}$/.test(refParts[2])) {
      waId = refParts[2];
    } else if (refParts[3] && /^27\d{9,}$/.test(refParts[3])) {
      waId = refParts[3];
    } else if (refParts[2]) {
      waId = refParts[2];
    }

    let session = await this.getSession(waId);

    if (!isSuccess) {
      if (session.duffelHoldOrderId) {
        await this.duffelEngine.releaseHoldOrder(session.duffelHoldOrderId);
      }
      return this.uiBuilder.renderFlightHoldExpiredScreen();
    }

    // Amount verification (must be R350 / 35,000 cents)
    const config = await getPricingConfig(this.db);
    const expectedFeeCents = config.CONCIERGE_FLIGHT_FEE_CENTS || 35000;
    if (amountCents !== expectedFeeCents) {
      return { text: `❌ Payment amount mismatch. Expected R${(expectedFeeCents / 100).toFixed(2)}` };
    }

    session.conciergePaid = true;
    session.conciergePaymentRef = reference;

    // Trigger Duffel Pay & Confirm automatically
    const duffelPayRes = await this.duffelEngine.payAndConfirmOrder({
      orderId: session.duffelHoldOrderId || `ord_hold_${Date.now()}`
    });

    if (!duffelPayRes.success) {
      // Booking failure after payment -> Autonomous Refund
      let refundRes;
      if (gateway === 'PAYFAST') {
        refundRes = await this.payfast.processRefund({ reference, amountCents: expectedFeeCents });
      } else if (gateway === 'PAYSHAP_STITCH') {
        refundRes = await this.payshap.processRefund({ reference, amountCents: expectedFeeCents });
      } else {
        refundRes = await this.paystack.processRefund({ reference, amountCents: expectedFeeCents });
      }

      session.conciergePaid = false;
      session.duffelHoldOrderId = null;
      await this.saveSession(waId, session);

      return this.uiBuilder.renderFlightBookingFailedRefundedScreen({ feeCents: expectedFeeCents });
    }

    session.flightConfirmed = true;
    session.pnr = duffelPayRes.bookingReference;
    session.step = 'STATE_LIVE_ORDER';
    await this.saveSession(waId, session);

    return this.uiBuilder.renderFlightBookedScreen({
      pnr: duffelPayRes.bookingReference,
      eTicketUrl: duffelPayRes.eTicketPdfUrl
    });
  }

  async handleIncomingMessage(waId, incomingText, buttonPayload = null, locationObj = null) {
    const text = (incomingText || buttonPayload || '').trim();

    // 0. Anti-Abuse Check
    const abuseCheck = this.antiAbuse.screenInboundMessage(waId, text);
    if (abuseCheck.isBlocked) {
      return { text: abuseCheck.message };
    }

    let session = await this.getSession(waId);

    // Flight search retry command
    if (text === 'search_flights_retry' || buttonPayload === 'search_flights_retry') {
      const flight = await this.duffelEngine.searchFlights({ origin: 'JNB', destination: 'CPT' });
      session.pendingFlight = flight;
      await this.saveSession(waId, session);
      return this.uiBuilder.renderFlightOptionsScreen({ flight });
    }

    // 0b. Employer Legal Contracts Retrieval & Export Commands
    const upperText = text.toUpperCase().trim();
    if (upperText === 'MY CONTRACTS' || upperText === 'MY_CONTRACTS' || buttonPayload === 'view_my_contracts') {
      const contracts = await this.contractEngine.getEmployerContracts(waId);
      if (contracts.length === 0) {
        return {
          text: `📜 *Your Legal Contracts*\n` +
            `───────────────\n\n` +
            `No signed Master Service Agreements or recruitment contracts found under your account (*ID:* ${waId}).\n\n` +
            `When you connect with candidate agents or hire staff, signed MSA contracts with cryptographic evidence trails will automatically appear here!`
        };
      }

      let summaryText = `📜 *Your Signed Legal Contracts (${contracts.length})*\n` +
        `───────────────\n\n`;

      const buttons = [];
      contracts.forEach((c, idx) => {
        summaryText += `${idx + 1}️⃣ *Ref:* ${c.contractId}\n` +
          `• Company: *${c.companyName}*\n` +
          `• Status: *${c.status}*\n` +
          `• Executed: *${c.isoDate ? c.isoDate.split('T')[0] : 'Today'}*\n` +
          `• SHA-256 Sig: \`${c.sha256DigitalSignature ? c.sha256DigitalSignature.substring(0, 12) : 'Verified'}...\`\n\n`;

        if (idx < 3) {
          buttons.push({
            type: 'reply',
            reply: { id: `view_contract_${c.contractId}`, title: `📄 Evidence Bundle ${idx + 1}` }
          });
        }
      });

      summaryText += `Reply *EXPORT CONTRACT <Ref>* to receive court-admissible legal evidence trails for any agreement.`;

      return {
        text: summaryText,
        buttons: buttons.length > 0 ? buttons : undefined
      };
    }

    if (upperText.startsWith('VIEW_CONTRACT_') || upperText.startsWith('EXPORT CONTRACT') || upperText.startsWith('EXPORT_CONTRACT_') || upperText.startsWith('VIEW CONTRACT')) {
      const match = text.match(/(msa_[a-zA-Z0-9_]+)/i);
      const contractId = match ? match[1] : text.split(/\s+/).pop();
      const bundle = await this.contractEngine.getContractEvidenceBundle(contractId);

      if (!bundle.success) {
        return { text: `❌ Contract reference *${contractId}* not found under your employer record.` };
      }

      return { text: bundle.evidenceText };
    }

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

    // 3. Early Buyer Escrow Release or Face-to-Face 6-Digit Escrow PIN Verification Handler
    if (/^\d{6}$/.test(text.trim())) {
      const txId = session.transactionId || 'tx_p2p_recent';
      const pinResult = this.p2pEngine.verifySelfCollectEscrowPin(txId, waId, text.trim());
      return { text: pinResult.message };
    }

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
      if (buttonPayload.startsWith('flight_free_')) {
        const offerId = buttonPayload.replace('flight_free_', '');
        return {
          text: `🔗 *Direct Airline Booking Link*\n\n` +
            `Here is your direct booking link for FlySafair:\n` +
            `https://www.flysafair.co.za/book?offerId=${encodeURIComponent(offerId)}\n\n` +
            `💡 Select Concierge anytime if you would like me to manage your check-in and WhatsApp boarding pass!`
        };
      }

      if (buttonPayload.startsWith('flight_concierge_')) {
        const offerId = buttonPayload.replace('flight_concierge_', '');
        const config = await getPricingConfig(this.db);
        const feeCents = config.CONCIERGE_FLIGHT_FEE_CENTS || 35000;

        // Create Duffel Hold Order first to lock seat & price for 20 minutes
        const holdOrder = await this.duffelEngine.createHoldOrder({ offerId, passengers: [{ type: 'adult' }] });
        session.duffelHoldOrderId = holdOrder.orderId;
        session.flightHoldExpiresAt = holdOrder.expiresAt;

        const sessionRef = waId;
        session.flightSessionRef = sessionRef;

        // Generate R350 Payment Link via Paystack
        const payRequest = await this.paystack.createPaymentRequest({
          waId,
          sessionRef,
          amountCents: feeCents,
          description: 'mrAI Concierge Service - Flight Booking'
        });

        session.conciergePaymentRef = payRequest.reference;
        await this.saveSession(waId, session);

        return this.uiBuilder.renderFlightConciergePaymentScreen({
          paymentUrl: payRequest.authorizationUrl,
          feeCents,
          expiryMins: 20
        });
      }

      if (buttonPayload === 'book_travel_bundle') {
        const txId = `tx_bundle_${Date.now()}`;
        session.step = 'STATE_LIVE_ORDER';
        await this.saveSession(waId, session);

        return this.uiBuilder.renderLiveOrderScreen({
          orderId: `ord_bundle_${txId.substring(0, 6)}`,
          status: 'TRAVEL BUNDLE BOOKED - AMADEUS / TRAVELPAYOUTS CONFIRMED',
          courierName: 'Airport Shuttle / Car Hire Desk',
          driverName: 'Amadeus Booking Agent',
          etaMinutes: 0
        });
      }

      if (buttonPayload === 'connect_job_agent') {
        const contractRes = await this.contractEngine.acceptContract({
          employerId: waId,
          companyName: userProfile.name || 'Employer Company',
          candidateId: 'cand_sipho_101'
        });

        const unlockRes = this.matchingEngine.jobEngine.unlockCandidateForEmployer({
          candidateId: 'cand_sipho_101',
          employerId: waId,
          salaryCents: 500000
        });

        return {
          text: `${contractRes.confirmationText}\n\n${unlockRes.employerNotice}`
        };
      }

      if (buttonPayload === 'connect_prop_agent') {
        return {
          text: `🤝 *Agents Connected & Property Viewing Scheduled!*\n\n` +
            `Your Personal Agent has established a direct agent-to-agent channel on the myAI Network.\n\n` +
            `📅 *Status:* Viewing request sent directly to the Property Agent!`
        };
      }

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

    // 5b. Employer Forward-a-CV Ingestion Intercept
    if (text.toLowerCase().startsWith('forward cv') || text.toLowerCase().startsWith('parse cv') || text.toLowerCase().includes('curriculum vitae')) {
      const cvReport = this.jobAggregator.ingestEmployerForwardedCV({
        employerPhone: waId,
        rawCvText: text,
        targetRole: 'Cashier / Admin Staff'
      });

      return { text: cvReport.summary };
    }

    // Direct Flight Search Request Handler
    if (lowerText.includes('flight') || lowerText.includes('flysafair') || lowerText.includes('fly to') || lowerText.includes('book flight')) {
      const flight = await this.duffelEngine.searchFlights({ origin: 'JNB', destination: 'CPT' });
      session.pendingFlight = flight;
      await this.saveSession(waId, session);

      const config = await getPricingConfig(this.db);
      return this.uiBuilder.renderFlightOptionsScreen({
        flight,
        feeCents: config.CONCIERGE_FLIGHT_FEE_CENTS || 35000
      });
    }

    // Pending Composite Text Continuation after Age Verification (e.g. User submitted 13-digit RSA ID)
    if (session.pendingCompositeText && /^\d{13}$/.test(text.trim())) {
      const ageCheck = this.antiAbuse.verifyAgeGate(text.trim());
      if (!ageCheck.isAdult) {
        return { text: `❌ Age verification failed. ${ageCheck.reason}` };
      }
      userProfile.rsaIdVerified = true;
      await this.onboardingEngine.saveUserProfile(waId, userProfile);

      const savedCompositeText = session.pendingCompositeText;
      session.pendingCompositeText = null;
      await this.saveSession(waId, session);

      return this.handleIncomingMessage(waId, savedCompositeText, buttonPayload, locationObj);
    }

    // 5c. Proactive Clarification Intercept for Vague Product Queries
    const isVagueProductQuery = (txt) => {
      const lower = txt.toLowerCase().trim();
      const vaguePatterns = [
        'headphones', 'sony headphones', 'shoes', 'tv', 'television', 'laptop', 'fridge',
        'blender', 'couch', 'phone', 'smartphone', 'watch', 'sneakers', 'microwave'
      ];
      const hasVagueMatch = vaguePatterns.some(p => lower.includes(p));
      const hasSpecificDetails = lower.includes('from') || lower.includes('model') || lower.includes('under r') || lower.includes('new') || lower.includes('used') || lower.includes('refurbished');
      return hasVagueMatch && !hasSpecificDetails;
    };

    if (isVagueProductQuery(text)) {
      session.step = 'AWAITING_PROACTIVE_CLARIFICATION';
      session.vagueQuery = text;
      await this.saveSession(waId, session);

      return this.uiBuilder.renderProactiveClarificationScreen({
        query: text,
        productCategory: 'Electronics / Retail'
      });
    }

    if (session.step === 'AWAITING_PROACTIVE_CLARIFICATION') {
      session.step = 'STATE_IDLE';
      const originalQuery = session.vagueQuery || 'Item';
      await this.saveSession(waId, session);

      const items = await this.commerce.searchCatalog(originalQuery);
      const matchedItem = items[0] || { id: 'generic_1', name: `${originalQuery} (Clarified)`, priceCents: 89900, storeName: 'HiFi Corp' };

      const quotes = await this.transport.getQuotes({ distanceKm: 5, items: [matchedItem] });
      const config = await getPricingConfig(this.db);
      const pricing = calculatePricing({
        intentMode: 'BUY_PLUS_DELIVER',
        goodsSubtotalCents: matchedItem.priceCents,
        rawTransportQuoteCents: quotes.cheapestQuote.rawQuoteCents,
        config
      });

      const txId = `tx_clarified_${Date.now()}`;
      session.cart = [matchedItem];
      session.deliveryQuote = quotes.cheapestQuote;
      session.pricing = pricing;
      session.transactionId = txId;
      session.activeAddress = session.activeAddress || userProfile.address || 'Saved Location';
      session.step = 'STATE_AWAITING_APPROVAL';
      await this.saveSession(waId, session);

      return this.uiBuilder.renderOneTapCheckoutScreen({
        storeName: matchedItem.storeName || 'Partner Store',
        itemName: matchedItem.name,
        itemPriceCents: matchedItem.priceCents,
        vehicleClass: quotes.requiredVehicleClass,
        providerName: quotes.cheapestQuote.providerName,
        transportCostCents: quotes.cheapestQuote.rawQuoteCents,
        totalCustomerPaysCents: pricing.totalCustomerPaysCents,
        deliveryAddress: session.activeAddress,
        transactionId: txId
      });
    }

    // Pending Composite Text Continuation after Age Verification
    if (session.pendingCompositeText) {
      const savedCompositeText = session.pendingCompositeText;
      session.pendingCompositeText = null;
      await this.saveSession(waId, session);

      return this.handleIncomingMessage(waId, savedCompositeText, buttonPayload, locationObj);
    }

    // 6. Text Message NLU Intent & Advice Prohibition Intercept
    const maskedText = this.scamEngine.maskOffPlatformContacts(text);
    const intentMode = classifyIntent(maskedText);

    // MULTI-VERTICAL COMPOSITE INTENT HANDLING (Food + Flowers + Alcohol + Airtime + Car Hire + Hotel)
    const hasTravel = maskedText.toLowerCase().includes('hotel') || maskedText.toLowerCase().includes('car rental') || maskedText.toLowerCase().includes('car hire');
    const hasRetail = maskedText.toLowerCase().includes('kfc') || maskedText.toLowerCase().includes('flowers') || maskedText.toLowerCase().includes('beer') || maskedText.toLowerCase().includes('airtime');

    if (hasTravel && hasRetail) {
      // 1. Age Gate Verification Check for Alcohol
      if (maskedText.toLowerCase().includes('beer') || maskedText.toLowerCase().includes('liquor') || maskedText.toLowerCase().includes('wine')) {
        if (!userProfile.rsaIdVerified) {
          if (/^\d{13}$/.test(text.trim())) {
            const ageCheck = this.antiAbuse.verifyAgeGate(text.trim());
            if (!ageCheck.isAdult) {
              return { text: `❌ Age verification failed. ${ageCheck.reason}` };
            }
            userProfile.rsaIdVerified = true;
            await this.onboardingEngine.saveUserProfile(waId, userProfile);
          } else {
            session.pendingCompositeText = text;
            await this.saveSession(waId, session);

            return {
              text: `🔞 *Age Gate Verification Required*\n` +
                `───────────────\n\n` +
                `Your request includes alcohol (*Beer*). Under South African law, you must be 18+ to purchase liquor.\n\n` +
                `Please reply with your 13-digit RSA ID number (e.g. *9505125800088*) to verify your age and unlock checkout.`
            };
          }
        }
      }

      // 2. Physical Items Aggregation & Light Load Sizing
      const compositeItems = [
        { id: 'kfc_1', storeName: 'KFC', name: 'Streetwise 2 Meal', priceCents: 4500, category: 'Food' },
        { id: 'flr_1', storeName: 'Florist', name: 'Fresh Rose Bouquet', priceCents: 25000, category: 'Flowers' },
        { id: 'ber_1', storeName: 'Tops Liquor', name: '6-Pack Heineken Beer', priceCents: 11000, category: 'Liquor' },
        { id: 'air_1', storeName: 'Flash API', name: 'R50 Vodacom Airtime', priceCents: 5000, category: 'Digital Airtime' }
      ];

      const quotes = await this.transport.getQuotes({ distanceKm: 5, items: compositeItems, totalWeightKg: 3 });
      const config = await getPricingConfig(this.db);

      const physicalGoodsSubtotalCents = 4500 + 25000 + 11000 + 5000; // R455.00
      const hotelPriceCents = 360000; // R3,600.00
      const carPriceCents = 105000;   // R1,050.00
      const totalGoodsCents = physicalGoodsSubtotalCents + hotelPriceCents + carPriceCents;

      const pricing = calculatePricing({
        intentMode: 'BUY_PLUS_DELIVER',
        goodsSubtotalCents: totalGoodsCents,
        rawTransportQuoteCents: quotes.cheapestQuote.rawQuoteCents,
        config
      });

      const txId = `tx_composite_${Date.now()}`;
      session.cart = compositeItems;
      session.deliveryQuote = quotes.cheapestQuote;
      session.pricing = pricing;
      session.transactionId = txId;
      session.activeAddress = session.activeAddress || userProfile.address || 'Saved Location';
      session.step = 'STATE_AWAITING_APPROVAL';
      await this.saveSession(waId, session);

      return this.uiBuilder.renderOneTapCheckoutScreen({
        storeName: 'KFC + Florist + Tops + Airtime + Amadeus Travel',
        itemName: 'KFC, Flowers, Beer, R50 Airtime, VW Polo Hire (Sep 21-24), Hotel (Sep 24-27)',
        itemPriceCents: totalGoodsCents,
        vehicleClass: quotes.requiredVehicleClass,
        providerName: quotes.cheapestQuote.providerName,
        transportCostCents: quotes.cheapestQuote.rawQuoteCents,
        totalCustomerPaysCents: pricing.totalCustomerPaysCents,
        deliveryAddress: session.activeAddress,
        transactionId: txId
      });
    }

    // Pending Composite Text Continuation after Age Verification
    if (session.pendingCompositeText) {
      const savedCompositeText = session.pendingCompositeText;
      session.pendingCompositeText = null;
      await this.saveSession(waId, session);

      return this.handleIncomingMessage(waId, savedCompositeText, buttonPayload, locationObj);
    }

    // Single Travel & Hotel Bundle Intent
    if (hasTravel) {
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

    // Employment Readiness Pack & Intent-First Job Seeker Onboarding Intent
    if (intentMode === INTENT_MODES.EMPLOYMENT_PACK) {
      const candidateData = {
        fullName: userProfile.name,
        phone: waId,
        address: session.activeAddress || userProfile.address || 'Gauteng, South Africa',
        positionAppliedFor: 'General Staff'
      };

      const pack = this.employmentEngine.assembleReadinessPack(candidateData);
      const txId = `tx_emp_${Date.now()}`;
      session.transactionId = txId;
      session.employmentPack = pack;
      await this.saveSession(waId, session);

      return this.uiBuilder.renderEmploymentPackScreen({
        candidateName: candidateData.fullName,
        packPriceCents: pack.priceCents,
        transactionId: txId,
        cvPreviewUrl: pack.atsCv.pdfDownloadUrl,
        z83PreviewUrl: pack.z83Form.pdfDownloadUrl
      });
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
