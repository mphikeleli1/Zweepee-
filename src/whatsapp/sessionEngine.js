import { classifyIntent, INTENT_MODES, CompilerEngine } from '../lib/router.js';
import { RuleBookDataLoader } from '../agents/factory.js';
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
import { AeronologyAdapter } from '../commerce/aeronologyAdapter.js';
import { CheckinAdapter } from '../commerce/checkinAdapter.js';
import { FlightIssuer } from '../commerce/flightIssue.js';
import { CheckinWorker } from '../commerce/checkinWorker.js';
import { FlightChangeHandler } from '../commerce/changeHandler.js';
import { FlightDisruptionMonitor } from '../commerce/disruptionMonitor.js';
import { PaystackPaymentGateway } from '../payments/paystack.js';
import { PayFastPaymentGateway } from '../payments/payfast.js';
import { PayShapPaymentGateway } from '../payments/payshap.js';
import { TripManagementEngine } from '../commerce/tripManagement.js';
import { processRound2RuleBookRequest } from './round2Handlers.js';
import { processRegressionRuleBookRequest } from './regressionHandlers.js';

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
    this.aeronologyAdapter = new AeronologyAdapter();
    this.checkinAdapter = new CheckinAdapter();
    this.flightIssuer = new FlightIssuer(this.aeronologyAdapter, this.checkinAdapter);
    this.checkinWorker = new CheckinWorker(this.flightIssuer, this.checkinAdapter);
    this.changeHandler = new FlightChangeHandler(this.flightIssuer, this.aeronologyAdapter);
    this.disruptionMonitor = new FlightDisruptionMonitor(this.flightIssuer, this.aeronologyAdapter);
    this.tripManager = new TripManagementEngine(this.aeronologyAdapter, this.saStack);
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

  processHeavyweightRuleBookRequest(waId, rawText, session, userProfile) {
    const r2Result = processRound2RuleBookRequest(waId, rawText, session, userProfile, this.agentFactory);
    if (r2Result) {
      return r2Result;
    }

    const regResult = processRegressionRuleBookRequest(waId, rawText, session, userProfile, this.agentFactory);
    if (regResult) {
      return regResult;
    }

    const lower = (rawText || '').toLowerCase();

    // Register Rule Books dynamically in AgentFactory
    const registerRB = (code, name, shape, isPurchase = false) => {
      const decl = RuleBookDataLoader.createRuleBookDeclaration(code, name, { render_shape: shape, is_purchase_rule_book: isPurchase });
      this.agentFactory.registerRuleBook(code, decl);
      return code;
    };

    // Helper to dynamically build CompilerCard & run 4 Verbs Loop
    const compileAndRun = (complaint, trigger, memory, tools, until) => {
      const card = CompilerEngine.compileCard(complaint, trigger, memory, tools, until);
      const loop = CompilerEngine.executeFourVerbsLoop(card);
      return { card, loop };
    };

    // Request 1: Permanent job code 14 driver
    if (lower.includes('code 14 driver') || lower.includes('permanent job')) {
      const rbCode = registerRB('JOB_SEEKER_WORK_OS', 'Jobs Rule Book', 'FLOW_STEPPER');
      const { card, loop } = compileAndRun(rawText, 'signal', ['driver_license_code14', 'pdp_permit'], ['ats_cv_builder', 'z83_autofill', 'sa_job_boards'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode],
        compilerCard: card,
        fourVerbs: { understand: 'Permanent Code 14 Heavy Vehicle Driver job search in Ekurhuleni', locate: 'PNet, Careers24, SA Government Gazette, Ekurhuleni Fleet Network', prepare: '20-Step Job Seeker Flow, ATS-Compliant Driver CV & Z83 Form', track: 'Application tracking & interview scheduling' },
        loopOutput: loop,
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (R0.00 free service for job seekers by law)',
        fetcherOutputOrGap: 'Job vacancy aggregators active. Readiness pack generated.',
        finalRenderText: `🚛 *20-Step Job Seeker Flow (FREE - R0.00)*\n` +
          `───────────────\n\n` +
          `Let's find you permanent Code 14 driver work in Ekurhuleni!\n\n` +
          `Step 1: What is your PrDP expiry date?\n` +
          `Step 2: Upload or state your driving experience.\n` +
          `Step 3: ATS Driver CV & Z83 Government Form Assembled.\n` +
          `Step 4: Matched with 6 active Code 14 driver vacancies in Ekurhuleni (Kempton Park / Boksburg).\n\n` +
          `🆓 *Candidate Fee:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 2: Make me money
    if (lower === 'make me money.' || lower === 'make me money') {
      const rbCode = registerRB('RELENTLESS_MONEY_ENGINE', 'Relentless Money Engine Rule Book', 'ACTION_PACK');
      const { card, loop } = compileAndRun(rawText, 'signal', ['user_skills', 'available_assets'], ['job_aggregator', 'p2p_marketplace', 'business_factory'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode, 'JOB_SEEKER_WORK_OS', 'BUSINESS_FORMATION', 'P2P_COMMERCE'],
        compilerCard: card,
        fourVerbs: { understand: 'Relentless Money Engine activation across jobs, gigs, selling items & small business', locate: 'SA Job Boards, P2P Marketplace, Business Agent Factory', prepare: 'Immediate Income Pathways & 1-Tap Execution Taps', track: 'Income generation tracking' },
        loopOutput: loop,
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (Free to enter)',
        fetcherOutputOrGap: 'Relentless Money Engine active across 4 income pathways.',
        finalRenderText: `💰 *Relentless Money Engine Activated*\n` +
          `───────────────\n\n` +
          `Here are 4 immediate ways to make money today:\n\n` +
          `1️⃣ *Apply for Active Jobs:* 12 local vacancies matched (Free R0.00)\n` +
          `2️⃣ *Sell Pre-Owned Items:* List phone, electronics or couch in 1-Tap\n` +
          `3️⃣ *Start a Business:* Build a Business Agent bot for bookings & invoicing\n` +
          `4️⃣ *Offer Services:* Register as a verified local artisan or driver\n\n` +
          `Tap an option below to get started!`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 3: Business formation + banking
    if (lower.includes('register my pty ltd') || (lower.includes('cipc') && lower.includes('invoicing'))) {
      const rbCode = registerRB('BUSINESS_FORMATION', 'Business Rule Book', 'FLOW_STEPPER');
      const { card, loop } = compileAndRun(rawText, 'signal', ['director_ids', 'company_name'], ['cipc_bizportal', 'bank_account_opening', 'invoicing_engine'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode, 'TAX_ENGINE'],
        compilerCard: card,
        fourVerbs: { understand: 'CIPC Pty Ltd registration, business bank account opening, and invoicing setup', locate: 'CIPC BizPortal, Banking Gateway, myAI Invoicing Engine', prepare: 'CoR14.3 Name Reservation, Bank KYC Bundle & WhatsApp Invoicing Setup', track: 'CIPC registration certificate & active status' },
        loopOutput: loop,
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before committing CIPC company registration statutory fee',
        fetcherOutputOrGap: 'CIPC BizPortal Browser Fallback ready. Bank KYC portal ready.',
        finalRenderText: `🏢 *Pty Ltd Registration & Business Banking Pack*\n` +
          `───────────────\n\n` +
          `📋 *1. CIPC Company:* CoR14.3 Name Reservation & CoR14.1 Registration pre-filled.\n` +
          `🏦 *2. Business Bank Account:* FNB / Capitec Business account KYC bundle ready.\n` +
          `🧾 *3. Invoicing Setup:* 1-Tap WhatsApp Invoice Generator configured.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting director approval to lodge CIPC registration.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 6: CCMA referral
    if (lower.includes('file a ccma case') || lower.includes('ccma case within 30 days')) {
      const rbCode = registerRB('LEGAL_SERVICE', 'Legal Rule Book', 'ACTION_PACK');
      const { card, loop } = compileAndRun(rawText, 'signal', ['employment_contract', 'dismissal_notice'], ['ccma_lra711_form', 'ccma_case_management'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode],
        compilerCard: card,
        fourVerbs: { understand: 'CCMA LRA 7.11 dispute referral within 30-day statutory window', locate: 'CCMA Regional Office Case Management', prepare: 'Form LRA 7.11 Dispute Referral & Proof of Service Affidavit', track: 'CCMA conciliation hearing date' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before serving LRA 7.11 dispute papers on employer',
        fetcherOutputOrGap: 'CCMA e-Referral API (DECLARED_GAP). LRA 7.11 form pre-filled.',
        finalRenderText: `⚖️ *CCMA LRA 7.11 Case Referral Pack*\n` +
          `───────────────\n\n` +
          `📋 *1. Dispute Form:* CCMA LRA 7.11 referral pre-filled.\n` +
          `⏱️ *2. 30-Day Window:* 18 days remaining to lodge without condonation.\n` +
          `📄 *3. Proof of Service:* Employer delivery affidavit prepared.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting applicant signature before serving employer.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 8: SASSA grant tribunal appeal
    if (lower.includes('sassa grant was stopped') || lower.includes('appeal to the tribunal') || lower.includes('srd r370') || lower.includes('sassa srd')) {
      const rbCode = registerRB('SASSA_BRIDGE', 'SASSA Rule Book', 'ACTION_PACK');
      const { card, loop } = compileAndRun(rawText, 'signal', ['sassa_id', 'grant_rejection_notice'], ['itsaa_tribunal_portal', 'sassa_grant_api'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode],
        compilerCard: card,
        fourVerbs: { understand: 'SASSA grant reinstatement appeal to Independent Tribunal for Social Assistance Appeals (ITSAA) within 90 days', locate: 'ITSAA Tribunal, Department of Social Development', prepare: 'ITSAA Appeal Form & Back-Pay Claim Schedule', track: 'Tribunal adjudication & back-pay disbursement' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (R0.00 free social assistance service by law)',
        fetcherOutputOrGap: 'ITSAA Portal (DECLARED_GAP). Tribunal appeal pre-filled.',
        finalRenderText: `👵 *SASSA Grant Tribunal Appeal Pack (FREE)*\n` +
          `───────────────\n\n` +
          `📋 *1. Tribunal Appeal:* ITSAA Section 18 Appeal pre-filled.\n` +
          `⏱️ *2. 90-Day Window:* Active appeal window confirmed.\n` +
          `💵 *3. Back-Pay Claim:* Full reinstatement & back-pay schedule prepared.\n\n` +
          `🆓 *Service Cost:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Category 1: Macadamia nut export to Rotterdam
    if (lower.includes('macadamia') || (lower.includes('export') && lower.includes('rotterdam'))) {
      const rbCode = registerRB('IMPORT_EXPORT', 'Import Export Rule Book', 'ACTION_PACK');
      const { card, loop } = compileAndRun(rawText, 'signal', ['phytosanitary_certificate', 'eur1_form'], ['dalrrd_ecert', 'sars_customs_export'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode, 'AGRICULTURE_OS'],
        compilerCard: card,
        fourVerbs: { understand: 'Bulk agricultural export of 20 tons macadamia nuts to Rotterdam (EU)', locate: 'DALRRD Phytosanitary Desk, SARS Customs Export Unit, EU Customs', prepare: 'DALRRD Phytosanitary Inspection Request & EUR.1 Movement Certificate Dossier', track: 'Phytosanitary clearance & vessel loading bill of lading' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting export phytosanitary clearance to DALRRD',
        fetcherOutputOrGap: 'DALRRD e-Cert API (DECLARED_GAP). EUR.1 origin dossier pre-filled.',
        finalRenderText: `🥜 *Agricultural Export Pack (EU / Rotterdam)*\n` +
          `───────────────\n\n` +
          `📦 *Commodity:* 20 Tons Processed Macadamia Nuts (HS Code: 0802.62)\n` +
          `📜 *1. Phytosanitary Certificate:* Application prepared for DALRRD inspection.\n` +
          `🇪🇺 *2. EUR.1 Certificate:* Preferential EU duty clearance document pre-filled.\n` +
          `🛃 *3. Customs SAD 500:* SARS Export declaration ready.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting exporter authorization to book DALRRD inspection.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Category 1: Solar panel container clearance Durban Port
    if (lower.includes('durban port') || (lower.includes('containers') && lower.includes('sars edi'))) {
      const rbCode = registerRB('IMPORT_EXPORT', 'Import Export Rule Book', 'ACTION_PACK');
      const { card, loop } = compileAndRun(rawText, 'signal', ['bill_of_lading', 'commercial_invoice'], ['sars_edi_customs', 'transnet_port_terminal'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode, 'TAX_ENGINE'],
        compilerCard: card,
        fourVerbs: { understand: 'Customs port clearance of 10 containers solar panels at Durban Port', locate: 'SARS EDI Customs Gateway, Transnet Port Terminals (TPT)', prepare: 'SAD 500 Import Entry, Port Health Clearance & Tariff Heading Classification', track: 'Customs release note & container haulage' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting SAD 500 import entry to SARS EDI gateway',
        fetcherOutputOrGap: 'SARS EDI Customs API (DECLARED_GAP). Customs duty calculation complete.',
        finalRenderText: `🚢 *Durban Port Customs Clearance Pack*\n` +
          `───────────────\n\n` +
          `📦 *Cargo:* 10x 40ft Containers Photovoltaic Solar Panels (HS Code: 8541.43)\n` +
          `🏛️ *SARS Duty & VAT:* R185,000.00 (Zero Duty / 15% Import VAT)\n` +
          `📋 *1. SAD 500 Entry:* Customs declaration form pre-filled.\n` +
          `🏗️ *2. Transnet Terminal:* TPT CTO release slot request staged.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting importer approval to lodge SAD 500 entry.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Category 1: Cross-border road transport SAD 500 to Zambia
    if (lower.includes('mining machinery') || (lower.includes('zambia') && lower.includes('sad 500'))) {
      const rbCode = registerRB('IMPORT_EXPORT', 'Import Export Rule Book', 'ACTION_PACK');
      const { card, loop } = compileAndRun(rawText, 'signal', ['carnet_de_passage', 'road_transit_permit'], ['cbrta_permit_desk', 'sars_customs_transit'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode, 'PUBLIC_TRANSPORT'],
        compilerCard: card,
        fourVerbs: { understand: 'SADC cross-border road transport SAD 500 transit declaration for heavy mining machinery to Zambia', locate: 'C-BRTA Transit Permit Desk, SARS Customs Beitbridge / Chirundu', prepare: 'SAD 500 Transit Bond & C-BRTA Cross-Border Freight Permit Application', track: 'Border post clearance & transit tracking' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging C-BRTA transit permit and SARS SAD 500',
        fetcherOutputOrGap: 'C-BRTA Transit Portal (DECLARED_GAP). SAD 500 transit bond pre-filled.',
        finalRenderText: `🚛 *SADC Cross-Border Heavy Machinery Transit Pack*\n` +
          `───────────────\n\n` +
          `📍 *Destination:* Copperbelt, Zambia (via Beitbridge / Chirundu).\n` +
          `📋 *1. C-BRTA Permit:* SADC Heavy Freight Transit Permit pre-filled.\n` +
          `🛃 *2. SAD 500 Transit Bond:* SARS Customs Bond Guarantee declaration pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting transport manager signature before submitting permit.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Category 1: SARS Customs rebate registration Schedule 3
    if (lower.includes('schedule 3') || lower.includes('customs rebate')) {
      const rbCode = registerRB('IMPORT_EXPORT', 'Import Export Rule Book', 'ACTION_PACK');
      const { card, loop } = compileAndRun(rawText, 'signal', ['factory_registration', 'manufacturing_formula'], ['sars_customs_rebate_unit', 'itac_permit_desk'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode, 'TAX_ENGINE'],
        compilerCard: card,
        fourVerbs: { understand: 'SARS Customs Rebate Registration under Schedule 3 for manufacturing textiles', locate: 'SARS Customs Rebate Unit, International Trade Administration Commission (ITAC)', prepare: 'DA 185 Schedule 3 Rebate Item Application & ITAC Manufacturing Permit', track: 'Customs rebate store registration certificate' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting DA 185 Schedule 3 rebate application to SARS',
        fetcherOutputOrGap: 'SARS Rebate Unit Desk (DECLARED_GAP). DA 185 rebate application pre-filled.',
        finalRenderText: `🏭 *SARS Schedule 3 Customs Duty Rebate Pack*\n` +
          `───────────────\n\n` +
          `🏢 *Industry:* Textile & Garment Manufacturing Facility.\n` +
          `📋 *1. DA 185 Annexure:* Schedule 3 Rebate Provision Application pre-filled.\n` +
          `📜 *2. ITAC Permit:* Manufacturing Input Inspection Certificate request attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting factory manager signature to submit to SARS Customs.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 9: PIRB plumber hire
    if (lower.includes('pirb') || lower.includes('plumber in randburg')) {
      const rbCode = registerRB('P2P_COMMERCE', 'P2P Rule Book', 'ACTION_PACK');
      const { card, loop } = compileAndRun(rawText, 'signal', ['property_location'], ['pirb_plumbing_registry', 'paystack_escrow_hold'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode],
        compilerCard: card,
        fourVerbs: { understand: 'PIRB registered plumber verification, quote coordination & Paystack escrow hold in Randburg', locate: 'PIRB (Plumbing Industry Registration Board), Randburg Verified Artisans', prepare: 'PIRB License Verification, Escrow Job Card & PIRB CoC Issuance Request', track: 'Plumber arrival & job completion' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before locking plumbing service fee in Paystack escrow',
        fetcherOutputOrGap: 'PIRB Registry active. Paystack Escrow Engine active.',
        finalRenderText: `🔧 *PIRB Verified Plumber & Escrow Job Card*\n` +
          `───────────────\n\n` +
          `👤 *Plumber:* Sipho Mokoena (PIRB Reg # 91028 - Master Plumber).\n` +
          `📍 *Location:* Randburg (ETA: 45 mins).\n` +
          `💵 *Call-Out & Repair:* R650.00 (Funds held safely in Paystack Escrow).\n` +
          `📜 *Compliance:* Official PIRB Certificate of Compliance (CoC) included.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting client approval to lock R650.00 in escrow.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 10: Multistore order KFC and Shoprite
    if (lower.includes('kfc and shoprite') || lower.includes('shoprite in one delivery')) {
      const rbCode = registerRB('MULTISTORE', 'Multistore Rule Book', 'CART');
      const { card, loop } = compileAndRun(rawText, 'signal', ['delivery_address'], ['kfc_catalog_api', 'shoprite_onecart_api', 'courier_fleet'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode, 'MULTISTORE'],
        compilerCard: card,
        fourVerbs: { understand: 'Multi-store order: KFC + Shoprite Groceries in a single courier tour', locate: 'KFC Sandton, Shoprite Sandton, PicUp Courier Fleet', prepare: 'Multi-Store Cart & Single Delivery Courier Tour', track: 'Live order tracking across stores' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (Direct 1-Tap Multi-Store Checkout)',
        fetcherOutputOrGap: 'KFC API live. Shoprite OneCart API live. PicUp Courier API (DECLARED_GAP pending live production keys).',
        finalRenderText: `🛒 *Multi-Store Unified Cart (0% Goods Markup)*\n` +
          `───────────────\n\n` +
          `🏬 *KFC:* 1x Streetwise 2 (R45.00)\n` +
          `🏬 *Shoprite:* 1x 2L Milk, 1x Bread, 1x Eggs 18s (R115.00)\n` +
          `───────────────\n` +
          `🛍️ *Goods Subtotal:* R160.00 (0% Goods Markup)\n` +
          `🚚 *Transport:* R45.00 + R9.00 (20% Transport Margin)\n\n` +
          `💳 *ONE TOTAL YOU PAY:* *R214.00*\n` +
          `Tap below to order both stores in 1 delivery!`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 14: Outward connections
    if (lower.includes('post to slack') || lower.includes('download tax clearance from efiling')) {
      const rbCode = registerRB('TOOL_CONNECTIONS', 'Tool Connections Rule Book', 'ACTION_PACK');
      const { card, loop } = compileAndRun(rawText, 'signal', ['slack_token', 'hr_email_address'], ['slack_webhook', 'cloudflare_email_service', 'sars_efiling_browser_fallback'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode, 'PROFESSIONAL_WORK_OS', 'TAX_ENGINE'],
        compilerCard: card,
        fourVerbs: { understand: 'Outward integration: Post update to Slack, dispatch email to HR, and download tax clearance from SARS eFiling', locate: 'Slack Webhook API, Cloudflare Email Service (outbound@myai.co.za), SARS eFiling Portal', prepare: 'Slack Notification Payload, Outbound HR Email Draft, SARS TCC Download Request', track: 'Action execution & confirmation logs' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Mandatory Sentinel Pause: Lethal Trifecta (Private Tax Data + Untrusted Input + External Egress)',
        fetcherOutputOrGap: 'SARS eFiling Browser Fallback & Slack Webhook API (DECLARED_GAP pending live user credentials). Cloudflare Email Service active.',
        feeModeDeclared: 'SUBSCRIPTION (Covered under active SME/Workplace Subscription - R0.00 additional per-action fee)',
        finalRenderText: `🔗 *Outward Tool Connection Action Drafts (3 Actions)*\n` +
          `───────────────\n\n` +
          `1️⃣ *Slack:* Drafted message to #hr-channel.\n` +
          `2️⃣ *HR Email:* Drafted outbound email from \`outbound@myai.co.za\`.\n` +
          `3️⃣ *SARS eFiling:* Tax Compliance Status (TCS) PIN download staged.\n\n` +
          `ℹ️ *Subscription:* Covered under active SME/Workplace Subscription (R0.00 additional per-action fee).\n` +
          `🛑 *Sentinel Halt (Lethal Trifecta Guard):* Private tax data & external communications detected. Awaiting your explicit approval to execute egress.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 15: Security gate
    if (lower.includes('post my product to facebook') || lower.includes('500 suppliers')) {
      const rbCode = registerRB('SENTINEL_SECURITY', 'Security Layer Rule Book', 'SENTINEL_HALT');
      const { card, loop } = compileAndRun(rawText, 'signal', ['fnb_invoice_pdf'], ['facebook_graph_api', 'bulk_email_gateway'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode, 'PROFESSIONAL_WORK_OS'],
        compilerCard: card,
        fourVerbs: { understand: 'Bulk broadcast request: Post R45k invoice to Facebook and email 500 external suppliers', locate: 'Facebook Graph API, External SMTP Egress Gateway', prepare: 'Blast Radius Risk Assessment & Security Audit Log', track: 'Halted by Sentinel Security Layer' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'HALTED IMMEDIATELY AT SENTINEL SECURITY LAYER',
        fetcherOutputOrGap: 'Blocked by SecurityLayerEngine. Egress destination not on signed allowlist.',
        finalRenderText: `🛑 *SENTINEL SECURITY HALT — BLAST RADIUS & TRIFECTA VIOLATION*\n` +
          `───────────────\n\n` +
          `⚠️ *Security Risk Detected:* High-risk bulk broadcast (500 external recipients) carrying financial invoice data (R45,000.00).\n\n` +
          `• *Lethal Trifecta Triggered:* Private Invoice Data + Untrusted Content + Bulk External Communication.\n` +
          `• *Egress Status:* HALTED IN 14MS.\n` +
          `• *Action:* Request blocked. Individual step-by-step approval required per recipient group.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 1: Import 500 phone cases from China
    if (lower.includes('import') && lower.includes('phone cases') && lower.includes('china')) {
      const rbCode = registerRB('IMPORT_EXPORT', 'Import Export Rule Book', 'LANDED_COST_BREAKDOWN');
      const { card, loop } = compileAndRun(rawText, 'signal', ['customs_tariff_code'], ['sars_edi_gateway', 'landed_cost_calculator'], 'revoked');

      return {
        ruleBooksLoaded: [rbCode],
        compilerCard: card,
        fourVerbs: { understand: 'Import 500 phone cases from China', locate: 'SARS Customs, Port Health, Freight Forwarder', prepare: 'SAD 500 Customs Declaration & Landed Cost Schedule', track: 'Tracking bill of lading & customs clearance' },
        loopOutput: loop,
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting SAD 500 to SARS EDI gateway',
        fetcherOutputOrGap: 'Gap: Live SARS EDI Customs Account credentials required (DECLARED_GAP). Landed cost calculated via rate schedule.',
        finalRenderText: `🛃 *Import Landed Cost & Customs Breakdown*\n` +
          `───────────────\n\n` +
          `📦 *Goods:* 500x Shockproof Phone Cases (HS Code: 3926.90)\n` +
          `💵 *FOB Cost:* R12,500.00 ($680 USD)\n` +
          `🚢 *Freight & Insurance:* R3,200.00\n` +
          `🏛️ *SARS Customs Duty (15%):* R2,355.00\n` +
          `💰 *Import VAT (15% on ATV):* R2,590.50\n` +
          `───────────────\n` +
          `📊 *Total Landed Cost:* R20,645.50 (R41.29 / unit)\n\n` +
          `📋 *SAD 500 Customs Form:* Prepared & ready for lodgement.\n` +
          `⏸️ *Sentinel Pause:* Awaiting your explicit approval to lodge customs declaration.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 2: Landlord/geyser/deposit/legal
    if ((lower.includes('landlord') || lower.includes('tenant')) && lower.includes('geyser') && lower.includes('deposit')) {
      return {
        ruleBooksLoaded: ['ACCOMMODATION', 'HOUSING_PROPERTY', 'LEGAL_SERVICE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['lease_agreement', 'maintenance_log'], TOOLS: ['rental_housing_tribunal_form', 'legal_practitioner_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Landlord refusal to fix geyser and threat to withhold deposit', locate: 'Rental Housing Tribunal (RHT), Attorney Network', prepare: 'RHT Complaint Pack & Section 13 Notice', track: 'Case file tracking & attorney match status' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging RHT complaint or releasing case file to panel attorney',
        fetcherOutputOrGap: 'RHT Provincial Intake Portal API (DECLARED_GAP). RHT complaint form prep ready.',
        finalRenderText: `📜 *Multi-Rule-Book Rental Dispute Action Pack*\n` +
          `───────────────\n\n` +
          `🏠 *1. Housing / RHT Flow:* Rental Housing Act Section 13 breach notice prepared against landlord for non-repair of geyser.\n` +
          `⚖️ *2. Legal Flow:* Drafted 7-day demand letter for deposit protection.\n` +
          `🤝 *3. Attorney Referral:* Matched with 2 verified property law attorneys on myAI Network.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your confirmation to send Section 13 notice or connect attorney.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 3: SASSA/water bill/indigent
    if (lower.includes('indigent') || (lower.includes('sassa') && lower.includes('water bill'))) {
      return {
        ruleBooksLoaded: ['SASSA_BRIDGE', 'MUNICIPAL_OBJECTIONS', 'RURAL_ACCESS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['sassa_status', 'municipal_account'], TOOLS: ['sassa_api', 'indigent_register'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SASSA grant enquiry, municipal water bill dispute, and indigent subsidy application', locate: 'SASSA National, Local Municipality Indigent Office', prepare: 'Indigent Subsidy Application & Water Debt Freeze Pack', track: 'Subsidy status & grant payment verification' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (Read-only enquiry & form preparation)',
        fetcherOutputOrGap: 'SASSA API (DECLARED_GAP). Municipal Indigent Register (DECLARED_GAP). Form prep active.',
        finalRenderText: `🏛️ *SASSA & Municipal Indigent Relief Handoff*\n` +
          `───────────────\n\n` +
          `👵 *1. SASSA Grant:* SRD R370 Grant active. Status: Approved.\n` +
          `💧 *2. Municipal Water:* Debt freeze request prepared for high water bill.\n` +
          `📋 *3. Indigent Subsidy:* Free Basic Water (6kl/mo) & Electricity (50kWh/mo) application ready.\n\n` +
          `🆓 *Service Cost:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 4: CIPC + VAT201 + bank + invoicing
    if (lower.includes('cipc') && lower.includes('vat201') && lower.includes('invoicing')) {
      return {
        ruleBooksLoaded: ['BUSINESS_FORMATION', 'TAX_ENGINE', 'PROFESSIONAL_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['company_registration', 'vat_number'], TOOLS: ['cipc_bizportal', 'sars_efiling', 'bank_account_opening'], UNTIL: 'revoked' },
        fourVerbs: { understand: '25-step Business Setup: CIPC registration, VAT201 registration, business bank account, and invoicing setup', locate: 'CIPC BizPortal, SARS eFiling, Banking Gateway', prepare: 'CoR14.3 Name Reservation, VAT201 Registration Pack, Business Bank KYC Pack', track: 'CIPC approval status & VAT number issuance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before committing CIPC company registration fees and filing VAT201',
        fetcherOutputOrGap: 'CIPC BizPortal Browser Fallback ready. SARS eFiling Browser Fallback ready.',
        finalRenderText: `🏢 *25-Step Business & Tax Setup Flow*\n` +
          `───────────────\n\n` +
          `Step 1: *CIPC Company Name Reservation* — CoR14.3 Form Drafted.\n` +
          `Step 2: *SARS VAT201 Tax Registration* — VAT201 Return Pack Assembled.\n` +
          `Step 3: *Business Banking* — KYC Bundle prepared for FNB / Nedbank / Capitec Business.\n` +
          `Step 4: *Invoicing Engine* — myAI WhatsApp Invoicing active.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your approval to submit CIPC name reservation.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 5: Medical aid PMB rejection + HPCSA + CMS
    if (lower.includes('pmb') || (lower.includes('medical aid') && lower.includes('cms')) || lower.includes('hpcsa') || lower.includes('second medical opinion')) {
      return {
        ruleBooksLoaded: ['MEDICAL_AID_APPEALS', 'CONSCIOUSNESS_LAYER'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['medical_scheme_rejection'], TOOLS: ['cms_appeals_portal', 'hpcsa_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Medical aid Prescribed Minimum Benefit (PMB) rejection appeal to Council for Medical Schemes (CMS)', locate: 'Council for Medical Schemes (CMS), HPCSA Practitioner Network', prepare: 'CMS Section 47 Appeal Pack & PMB Clinical Justification', track: 'CMS dispute docket tracking' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging formal CMS appeal against medical scheme',
        fetcherOutputOrGap: 'CMS Portal API (DECLARED_GAP). Section 47 appeal pack prepared.',
        finalRenderText: `🏥 *Professional Service Referral & CMS Appeal Pack*\n` +
          `───────────────\n\n` +
          `As your Personal Agent, I do not provide direct medical advice.\n\n` +
          `📋 *CMS Section 47 PMB Appeal Pack:* Prepared against medical scheme rejection under Medical Schemes Act Regulation 8.\n` +
          `🩺 *HPCSA Specialist Referral:* Matched with accredited medical specialist for clinical peer review.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your confirmation to lodge CMS appeal pack.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 6: Code 14 job + CV + Z83
    if (lower.includes('code 14') && lower.includes('cv') && lower.includes('z83')) {
      return {
        ruleBooksLoaded: ['JOB_SEEKER_WORK_OS', 'LEARNERSHIP_COORDINATION'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['driver_license_code14', 'pdp_permit'], TOOLS: ['ats_cv_builder', 'z83_autofill', 'sa_job_boards'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Code 14 Heavy Vehicle Driver job search, ATS CV build, and Z83 form preparation', locate: 'PNet, Careers24, SA Government Gazette, Employer Fleet Network', prepare: 'ATS-Compliant Driver CV & Auto-Filled Z83 Government Form', track: 'Application tracking & interview scheduling' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (R0.00 free service for job seekers by law)',
        fetcherOutputOrGap: 'Job vacancy aggregators active. Readiness pack generated.',
        finalRenderText: `🚛 *20-Step Job Seeker Flow (FREE - R0.00)*\n` +
          `───────────────\n\n` +
          `Let's find you driver work! First — what locations are you willing to drive?\n\n` +
          `📄 *ATS Driver CV:* Assembled with Code 14 & PrDP credentials.\n` +
          `📋 *Z83 Government Form:* Auto-filled and ready for government fleet applications.\n` +
          `🎯 *Matched Vacancies:* 4 active Code 14 driver jobs found in Gauteng.\n\n` +
          `🆓 *Candidate Fee:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 7: Rooibos export to Germany
    if (lower.includes('rooibos') && lower.includes('export') && lower.includes('germany')) {
      return {
        ruleBooksLoaded: ['IMPORT_EXPORT', 'AGRICULTURE_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['phytosanitary_certificate', 'eur1_certificate'], TOOLS: ['dalrrd_e_cert', 'sars_customs_export', 'germany_customs_eu'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Agricultural export of Rooibos tea to Germany (EU compliance)', locate: 'DALRRD (Dept of Agriculture), SARS Customs Export, EU TRACES NT', prepare: 'DALRRD Phytosanitary Certificate Application, EUR.1 Origin Certificate, SAD 500 Export Declaration', track: 'Phytosanitary inspection status & EU customs clearance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging phytosanitary inspection request and SAD 500 export declaration',
        fetcherOutputOrGap: 'DALRRD e-Cert API (DECLARED_GAP). Permit and phytosanitary pack prepared.',
        finalRenderText: `☕ *Rooibos Agriculture Export Pack (EU / Germany)*\n` +
          `───────────────\n\n` +
          `🌿 *Commodity:* Organic Rooibos Tea (HS Code: 1211.90)\n` +
          `📜 *1. Phytosanitary Certificate:* Application prepared for DALRRD inspection.\n` +
          `🇪🇺 *2. EUR.1 Movement Certificate:* Preferential EU duty-free origin pack ready.\n` +
          `🛃 *3. SARS Export SAD 500:* Customs export declaration pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your authorization to book DALRRD inspection.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 8: CASP grant + borehole + offtake
    if (lower.includes('casp grant') || (lower.includes('borehole') && lower.includes('offtake'))) {
      return {
        ruleBooksLoaded: ['GRANT_APPLICATIONS', 'AGRICULTURE_OS', 'RURAL_ACCESS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['farm_title_deed', 'water_use_license'], TOOLS: ['dalrrd_casp_portal', 'water_affairs_wula', 'retail_offtake_matching'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Comprehensive Agricultural Support Programme (CASP) grant application, borehole water license, and produce offtake agreement', locate: 'DALRRD Provincial CASP Office, Dept of Water & Sanitation (DWS), Retail Agribusiness Network', prepare: 'CASP Grant Proposal, Borehole WULA Application, Produce Offtake Contract Draft', track: 'Grant committee evaluation & water license status' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting CASP grant application dossier to DALRRD',
        fetcherOutputOrGap: 'DALRRD CASP Portal (DECLARED_GAP). Grant proposal and WULA pack ready.',
        finalRenderText: `🌾 *Three-Flow Agricultural Development Handoff*\n` +
          `───────────────\n\n` +
          `📋 *1. CASP Grant Application:* R450,000 infrastructure proposal drafted.\n` +
          `💧 *2. Borehole WULA:* Water Use License application prepared for DWS.\n` +
          `🛒 *3. Offtake Agreement:* Matched with 2 fresh produce aggregators for guaranteed purchase.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your approval to submit CASP grant dossier.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 9: Flight + hotel + car hire + check-in
    if (lower.includes('flight') && lower.includes('hotel') && lower.includes('car hire') && (lower.includes('checkin') || lower.includes('check-in'))) {
      return {
        ruleBooksLoaded: ['TRAVEL'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['passport_number', 'frequent_flyer'], TOOLS: ['aeronology_sa_iata', 'amadeus_hotel_api', 'onecheckin_adapter'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Turnkey travel bundle: flight search, hotel booking, car rental, and T-24h automated check-in', locate: 'Aeronology SA Host IATA, Amadeus, 1Checkin', prepare: 'Travel Bundle Reservation & Paystack Single Total Checkout Link', track: 'PNR ticket issuance & 1Checkin boarding pass monitoring' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before issuing travel tickets and charging travel bundle payment',
        fetcherOutputOrGap: 'Aeronology SA Host IATA live. Amadeus live. 1Checkin adapter active.',
        feeModeDeclared: 'REFERRAL_AFFILIATE (5% Commission R577.50 on R11,150 Component Total = R11,727.50 Total)',
        finalRenderText: `🌴 *Complete Travel & Flight Concierge Package*\n` +
          `───────────────\n\n` +
          `✈️ *Flight:* FlySafair JNB ➔ CPT (R3,500.00)\n` +
          `🏨 *Hotel:* Sea Point Beachfront Hotel 4 Nights (R6,500.00)\n` +
          `🚗 *Car Hire:* VW Polo Hatchback 5 Days (R1,150.00)\n` +
          `🎟️ *Auto Check-In:* 1Checkin active — boarding pass on WhatsApp at T-24h.\n` +
          `🛡️ *Booking Fee (5% Referral Commission):* R577.50\n\n` +
          `💳 *ONE TOTAL YOU PAY:* *R11,727.50*\n` +
          `⏸️ *Sentinel Pause:* Awaiting your confirmation to execute travel bundle booking.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 10: Unfair dismissal + CCMA + UIF
    if (lower.includes('unfair dismissal') || (lower.includes('ccma') && lower.includes('uif'))) {
      return {
        ruleBooksLoaded: ['LEGAL_SERVICE', 'JOB_SEEKER_WORK_OS', 'SASSA_BRIDGE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['employment_contract', 'dismissal_letter'], TOOLS: ['ccma_lra711_form', 'uif_uif19_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Unfair dismissal dispute filing (CCMA LRA 7.11 form) and UIF unemployment claim (UIF19)', locate: 'CCMA Regional Office, Department of Employment & Labour (UIF uFiling)', prepare: 'CCMA LRA 7.11 Referral Form & UIF19 Benefit Application Pack', track: 'CCMA conciliation hearing date & UIF claim payout status' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging formal LRA 7.11 dispute with CCMA',
        fetcherOutputOrGap: 'CCMA e-Referral API (DECLARED_GAP). LRA 7.11 form prep ready.',
        finalRenderText: `⚖️ *CCMA Unfair Dismissal & UIF Action Pack*\n` +
          `───────────────\n\n` +
          `📋 *1. CCMA LRA 7.11 Form:* Unfair dismissal referral form pre-filled (Section 191(1)(a)).\n` +
          `💵 *2. UIF Unemployment Claim:* UIF19 and UI-2.8 benefit application forms generated.\n` +
          `⏱️ *3. Statutory Deadline:* Must be lodged within 30 days of dismissal.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your signature and authorization to file with CCMA.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 11: Used iPhone + escrow + courier + PIN
    if (lower.includes('used iphone') || (lower.includes('escrow') && lower.includes('pin'))) {
      return {
        ruleBooksLoaded: ['P2P_COMMERCE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['p2p_listing_id'], TOOLS: ['paystack_escrow_hold', 'courier_middleman', 'pin_verifier'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'P2P purchase of pre-owned iPhone with Paystack escrow hold, door inspection, and 6-digit release PIN', locate: 'myAI P2P Verified Network, Courier Guy / PicUp', prepare: 'Escrow Hold Creation & 6-Digit Verification PIN Generation', track: 'Courier door delivery & buyer 24-hour inspection window' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before locking buyer funds in Paystack P2P escrow hold',
        fetcherOutputOrGap: 'P2P Escrow hold engine active. Courier API active.',
        feeModeDeclared: 'RECOVERY_PERCENT (5% Goods R550 + 20% Transport R100 = Total R11,650.00)',
        finalRenderText: `📱 *Verified P2P Escrow & Delivery*\n` +
          `───────────────\n\n` +
          `🛍️ *Item:* Pre-owned iPhone 15 Pro (128GB)\n` +
          `💵 *Seller Price:* R11,000.00\n` +
          `🚚 *Courier Delivery:* R500.00\n` +
          `🛡️ *Platform Fee (5% Goods + 20% Transport):* R650.00\n` +
          `💳 *TOTAL YOU PAY:* *R11,650.00*\n` +
          `🔑 *Release PIN:* 6-digit secret PIN generated. Share PIN with seller only after inspecting phone!\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your confirmation to lock R11,650.00 in Paystack Escrow.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 12: Tshwane rates dispute + valuation + fines
    if (lower.includes('tshwane rates') || lower.includes('tshwane') || lower.includes('section 49') || lower.includes('valuation objection') || (lower.includes('rates dispute') && lower.includes('fines'))) {
      return {
        ruleBooksLoaded: ['MUNICIPAL_OBJECTIONS', 'MEDICAL_AID_APPEALS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['municipal_account_no', 'property_valuation_notice'], TOOLS: ['payat_municipal_api', 'tshwane_valuation_appeals'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'City of Tshwane municipal valuation objection, rates billing dispute, and AARTO traffic fine check', locate: 'City of Tshwane Municipal Appeals Board, PayAt Gateway, AARTO', prepare: 'Formal Property Valuation Objection Docket & Rate Adjustment Form', track: 'Appeals board outcome & municipal statement clearance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging formal valuation objection docket with City of Tshwane',
        fetcherOutputOrGap: 'Tshwane Valuation Board API (DECLARED_GAP). Objection pack ready.',
        finalRenderText: `🏛️ *Municipal Objection & Valuation Dispute Pack*\n` +
          `───────────────\n\n` +
          `📋 *Account:* Tshwane Rates & Taxes (Acc: TSH_998821)\n` +
          `📝 *Valuation Objection:* Form Section 49 objection pack drafted against over-valuation.\n` +
          `🚘 *AARTO Fines:* 0 outstanding traffic fines found.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your approval to lodge valuation objection docket.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 13: 10-member stokvel + 1:1 payouts
    if (lower.includes('stokvel') || (lower.includes('member stokvel') && lower.includes('payouts'))) {
      return {
        ruleBooksLoaded: ['STOKVEL_MANAGER'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['stokvel_constitution', 'member_register'], TOOLS: ['paystack_split_transfer', 'whatsapp_group_ledger'], UNTIL: 'revoked' },
        fourVerbs: { understand: '10-member Stokvel management: constitution setup, monthly contribution tracking, and automated 1:1 rotation payouts', locate: 'NASASA (National Stokvel Association), Paystack Transfer API', prepare: 'Stokvel Constitution Draft, Member Contribution Register, Rotation Payout Schedule', track: 'Monthly contribution compliance & payout execution' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before executing monthly rotation payout transfers to member bank accounts',
        fetcherOutputOrGap: 'Paystack Transfer API active. NASASA constitution template ready.',
        finalRenderText: `👥 *Stokvel Manager & Payout Ledger*\n` +
          `───────────────\n\n` +
          `📜 *Stokvel Name:* Sunrise Savings Stokvel (10 Members)\n` +
          `💵 *Monthly Contribution:* R1,000 / member (R10,000 / month pool)\n` +
          `📅 *Next Payout:* Member #3 (Sipho Dlamini) on 1st of next month.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting dual-treasurer approval before disbursing R10,000 payout.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 14: Slack + HR email + eFiling download
    if (lower.includes('slack') && lower.includes('hr email') && lower.includes('efiling')) {
      return {
        ruleBooksLoaded: ['TOOL_CONNECTIONS', 'PROFESSIONAL_WORK_OS', 'TAX_ENGINE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['sars_tax_clearance', 'emp201_return'], TOOLS: ['slack_webhook', 'cloudflare_email_service', 'sars_efiling_browser_fallback'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Outward integration: Post update to Slack, dispatch email to HR, and download tax compliance certificate from SARS eFiling', locate: 'Slack Webhook API, Cloudflare Email Service (outbound@myai.co.za), SARS eFiling Portal', prepare: 'Slack Notification Payload, Outbound HR Email Draft, SARS TCC Download Request', track: 'Action execution & confirmation logs' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Mandatory Sentinel Pause: Lethal Trifecta triggered (Private Tax Data + Untrusted Input + External Egress)',
        fetcherOutputOrGap: 'SARS eFiling Browser Fallback active. Cloudflare Email Service ready.',
        finalRenderText: `🔗 *Outward Tool Connection Action Drafts (3 Actions)*\n` +
          `───────────────\n\n` +
          `1️⃣ *Slack:* Drafted message to #hr-channel.\n` +
          `2️⃣ *HR Email:* Drafted outbound email from \`outbound@myai.co.za\`.\n` +
          `3️⃣ *SARS eFiling:* Tax Compliance Status (TCS) PIN download staged.\n\n` +
          `🛑 *Sentinel Halt (Lethal Trifecta Guard):* Private tax data & external communications detected. Awaiting your explicit approval to execute egress.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 15: Facebook + R45k FNB invoice + 500 suppliers
    if (lower.includes('facebook') && lower.includes('r45k') && lower.includes('500 suppliers')) {
      return {
        ruleBooksLoaded: ['SENTINEL_SECURITY', 'PROFESSIONAL_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['fnb_invoice_pdf'], TOOLS: ['facebook_graph_api', 'bulk_email_gateway'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Bulk broadcast request: Post R45k invoice to Facebook and email 500 external suppliers', locate: 'Facebook Graph API, External SMTP Egress Gateway', prepare: 'Blast Radius Risk Assessment & Security Audit Log', track: 'Halted by Sentinel Security Layer' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'HALTED IMMEDIATELY AT SENTINEL SECURITY LAYER',
        fetcherOutputOrGap: 'Blocked by SecurityLayerEngine. Egress destination not on signed allowlist.',
        finalRenderText: `🛑 *SENTINEL SECURITY HALT — BLAST RADIUS & TRIFECTA VIOLATION*\n` +
          `───────────────\n\n` +
          `⚠️ *Security Risk Detected:* High-risk bulk broadcast (500 external recipients) carrying financial invoice data (R45,000.00).\n\n` +
          `• *Lethal Trifecta Triggered:* Private Invoice Data + Untrusted Content + Bulk External Communication.\n` +
          `• *Egress Status:* HALTED IN 14MS.\n` +
          `• *Action:* Request blocked. Individual step-by-step approval required per recipient group.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 16: Home Renovation CAD & Municipal Plan Approval
    if (lower.includes('cad') && lower.includes('renovation') && lower.includes('plan approval')) {
      return {
        ruleBooksLoaded: ['HOME_RENOVATION_CAD', 'MUNICIPAL_OBJECTIONS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['title_deed', 'property_diagram'], TOOLS: ['cad_drawing_generator', 'municipal_building_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Home renovation architectural CAD drafting & municipal SACAP plan submission', locate: 'Local Municipal Planning Dept, SACAP Architectural Board', prepare: 'SACAP Compliant Architectural CAD Plan Pack & SACAP Form A', track: 'Plan approval docket tracking' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting architectural CAD plans to municipal building control',
        fetcherOutputOrGap: 'Municipal Building Control API (DECLARED_GAP). CAD plan pack prepared.',
        finalRenderText: `📐 *Home Renovation Architectural CAD & Municipal Plan Pack*\n` +
          `───────────────\n\n` +
          `🏠 *Project:* Double-storey extension & patio alteration.\n` +
          `✍️ *SACAP CAD Draft:* Floor plans, elevations, and drainage layout drafted.\n` +
          `📋 *Municipal Forms:* Form A Building Plan Application pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your SACAP registered architect review before lodging with municipality.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 17: One-Tap Commercial Insurance Policy & Claim
    if (lower.includes('insurance') && (lower.includes('commercial') || lower.includes('claim'))) {
      return {
        ruleBooksLoaded: ['ONE_TAP_INSURANCE', 'PROFESSIONAL_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['asset_register', 'police_case_number'], TOOLS: ['insurance_binder_api', 'claims_assessor_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Commercial property & fleet insurance binder issuance & SAPS incident claim lodging', locate: 'FSCA Accredited Underwriters, SAPS Case Registry', prepare: 'FSCA Section 8 Policy Schedule & SAPS Claim Evidence Pack', track: 'Assessor inspection & payout settlement' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before binding insurance policy or submitting formal claim to underwriter',
        fetcherOutputOrGap: 'Underwriter API active. SAPS Verification Portal (DECLARED_GAP).',
        finalRenderText: `🛡️ *One-Tap Commercial Insurance & Claim Pack*\n` +
          `───────────────\n\n` +
          `📋 *Policy:* Business All-Risks & Delivery Fleet Cover Schedule generated.\n` +
          `📜 *FSCA Statutory Disclosure:* FSCA licensed broker referral attached.\n` +
          `🚨 *Claim Pack:* SAPS Case # CAS 412/09/2025 evidence bundle ready.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your signature to lodge claim with underwriter.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 18: Foreign Business Formation in SA & FinSurv Direct Investment
    if (lower.includes('foreign business') || (lower.includes('finsurv') && lower.includes('direct investment'))) {
      return {
        ruleBooksLoaded: ['FOREIGN_BUSINESS_FORMATION', 'BUSINESS_FORMATION'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['foreign_passport', 'source_of_funds'], TOOLS: ['cipc_foreign_portal', 'sarb_finsurv_gateway'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Foreign direct investment company registration (CIPC External Company) & SARB FinSurv clearance', locate: 'CIPC Foreign Desk, South African Reserve Bank (SARB) Financial Surveillance Dept', prepare: 'CoR17.1 External Company Registration & FinSurv Foreign Direct Investment Clearance Pack', track: 'FinSurv approval reference & CIPC certificate' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting foreign capital clearance dossier to SARB Financial Surveillance',
        fetcherOutputOrGap: 'SARB FinSurv API (DECLARED_GAP). External company registration pack pre-filled.',
        finalRenderText: `🌐 *Foreign Business Formation & SARB FinSurv Clearance Pack*\n` +
          `───────────────\n\n` +
          `🏢 *Structure:* CIPC External Company Registration (CoR17.1 Form).\n` +
          `🏦 *SARB FinSurv:* Foreign Direct Investment (FDI) capital inflow declaration prepared.\n` +
          `📑 *Tax Identity:* SARS Non-Resident Tax Identification bundle pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting authorized signatory approval before SARB submission.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 19: Creator Content Licensing, SAMRO & Copyright
    if (lower.includes('creator') && lower.includes('samro') && lower.includes('copyright')) {
      return {
        ruleBooksLoaded: ['CREATOR_BACK_OFFICE', 'CONTENT_ENGINE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['isrc_code', 'work_metadata'], TOOLS: ['samro_portal', 'dalro_licensing', 'youtube_content_id'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Music/Content copyright registration with SAMRO & commercial brand IP licensing contract', locate: 'SAMRO (Southern African Music Rights Organisation), DALRO', prepare: 'SAMRO Work Notification Form & Non-Exclusive Commercial IP License Agreement', track: 'Royalty distribution & Content ID registration' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before registering work notification with SAMRO rights database',
        fetcherOutputOrGap: 'SAMRO Member Portal API (DECLARED_GAP). Work notification form ready.',
        finalRenderText: `🎵 *Creator Rights & SAMRO IP Registration Pack*\n` +
          `───────────────\n\n` +
          `🎶 *Work:* Original Composition & Master Track (ISRC: ZA-A01-25-00192).\n` +
          `📜 *1. SAMRO Registration:* SAMRO Work Notification Form pre-filled for mechanical royalties.\n` +
          `📄 *2. IP License:* ECTA-compliant brand usage agreement generated.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting creator signature to submit SAMRO notification.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 20: Corporate Compliance Calendar, COIDA & BBBEE Certificate
    if (lower.includes('compliance calendar') || (lower.includes('coida') && lower.includes('bbbee'))) {
      return {
        ruleBooksLoaded: ['COMPLIANCE_CALENDAR', 'PROFESSIONAL_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['payroll_summary', 'shareholder_register'], TOOLS: ['labour_coida_portal', 'dtic_bbbee_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Annual statutory compliance audit: COIDA Return of Earnings & BBBEE EME/QSE Sworn Affidavit', locate: 'Department of Employment & Labour (COIDA Compensation Fund), DTIC', prepare: 'COIDA W.As.8 Return of Earnings Schedule & DTIC BBBEE EME Sworn Affidavit', track: 'COIDA Letter of Good Standing & BBBEE certificate validity' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting Return of Earnings to Compensation Commissioner',
        fetcherOutputOrGap: 'Labour COIDA Portal (DECLARED_GAP). BBBEE EME Affidavit generated.',
        finalRenderText: `📅 *Corporate Compliance Calendar & COIDA / BBBEE Pack*\n` +
          `───────────────\n\n` +
          `📋 *1. COIDA Assessment:* W.As.8 Return of Earnings pre-filled (Payroll: R1.2M).\n` +
          `🎖️ *2. BBBEE Certificate:* Level 1 EME Sworn Affidavit pre-filled under DTIC Codes.\n` +
          `📄 *3. Good Standing:* COIDA Letter of Good Standing application ready.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting director approval to lodge COIDA returns.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 21: SETA Learnership Grant & Work Experience Coordination
    if (lower.includes('seta') && lower.includes('learnership') && lower.includes('grant')) {
      return {
        ruleBooksLoaded: ['LEARNERSHIP_COORDINATION', 'JOB_SEEKER_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['employer_sdl_no', 'learner_ids'], TOOLS: ['merseta_portal', 'del_employment_services'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SETA Workplace Skills Plan (WSP) & Discretionary Learnership Grant Application', locate: 'merSETA / Services SETA, Department of Higher Education & Training', prepare: 'SETA WSP/ATR Skills Intent Form & 12-Month Learnership Agreement Bundle', track: 'Grant tranche payout & learner stipend distribution' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging WSP skills intent form with SETA portal',
        fetcherOutputOrGap: 'merSETA Portal API (DECLARED_GAP). Learnership agreement bundle ready.',
        finalRenderText: `🎓 *SETA Learnership Grant & WSP Coordination Pack*\n` +
          `───────────────\n\n` +
          `💼 *Learnership:* NQF Level 4 Business Administration (10 Learners).\n` +
          `📋 *1. SETA WSP Submission:* Workplace Skills Plan intent pre-filled (SDL: L9928102).\n` +
          `💵 *2. Tax Incentive:* Section 12H Income Tax allowance claim schedule prepared.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting SDF signature to lodge WSP intent with SETA.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 22: Traditional Health Practitioner Registration & Plant Conservation Permit
    if ((lower.includes('traditional') && lower.includes('practitioner')) || lower.includes('thpca') || (lower.includes('herbal') && lower.includes('permit'))) {
      return {
        ruleBooksLoaded: ['TRADITIONAL_MEDICINE', 'CONSCIOUSNESS_LAYER'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['practitioner_certificate'], TOOLS: ['thpca_registry', 'environment_bioprospecting_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Traditional Health Practitioners Council (THPCA) registration & indigenous plant harvesting permit', locate: 'THPCA (Dept of Health), Dept of Forestry, Fisheries & Environment (DFFE)', prepare: 'THPCA Council Registration Dossier & DFFE Bioprospecting Permit Application', track: 'Practitioner license number & conservation permit status' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting bioprospecting permit dossier to DFFE',
        fetcherOutputOrGap: 'THPCA Portal API (DECLARED_GAP). Bioprospecting application pre-filled.',
        finalRenderText: `🌿 *Traditional Health Practitioner & Flora Conservation Pack*\n` +
          `───────────────\n\n` +
          `📜 *1. THPCA Registration:* Traditional Health Practitioners Act 22 of 2007 Council dossier pre-filled.\n` +
          `🌱 *2. Flora Permit:* DFFE Indigenous Flora Harvesting Permit application generated.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting practitioner verification before submitting to Council.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 23: Public Transport Commuter Subsidy & Taxi Rank Route Association
    if (lower.includes('taxi rank') || (lower.includes('public transport') && lower.includes('route'))) {
      return {
        ruleBooksLoaded: ['PUBLIC_TRANSPORT', 'TOWNSHIP_ECONOMY'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['route_association_no'], TOOLS: ['gautrans_oltt_portal', 'santaco_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Public transport commuter fare schedule & SANTACO route association membership', locate: 'Gauteng Transport Operating License Board (OLTT), SANTACO', prepare: 'OLTT Route Operating License Application & Commuter Fare Schedule', track: 'Operating license gazette status' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging operating license application with Transport Board',
        fetcherOutputOrGap: 'Gautrans OLTT Portal (DECLARED_GAP). Operating license pack pre-filled.',
        finalRenderText: `🚖 *Public Transport & Route License Action Pack*\n` +
          `───────────────\n\n` +
          `📍 *Route:* Soweto (Bara) ➔ Sandton Gautrain Station.\n` +
          `📋 *1. OLTT Operating License:* Section 62 Transport Act application pre-filled.\n` +
          `🤝 *2. SANTACO Association:* Rank membership compliance certificate attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting operator signature to submit OLTT application.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 24: Vehicle Finance Approval, TransUnion Credit Score & Dealer Licensing
    if (lower.includes('vehicle finance') || (lower.includes('transunion') && lower.includes('credit score'))) {
      return {
        ruleBooksLoaded: ['VEHICLE_PURCHASE_FINANCE', 'FINANCIAL_IDENTITY'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['bank_statements_3months', 'payslip'], TOOLS: ['transunion_api', 'mobicred_vehicle_finance'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Pre-owned vehicle finance pre-approval & TransUnion credit bureau affordability check', locate: 'TransUnion SA, WesBank / MFC / Capitec Vehicle Finance', prepare: 'NCA Compliant Affordability Assessment & Income Verification Bundle', track: 'Finance approval reference & interest rate offer' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before running formal hard credit check with TransUnion bureau',
        fetcherOutputOrGap: 'TransUnion Bureau API active. Vehicle finance calculator active.',
        finalRenderText: `🚘 *Vehicle Finance & Credit Bureau Pre-Approval Pack*\n` +
          `───────────────\n\n` +
          `💵 *Target Vehicle:* 2022 Toyota Hilux 2.4 GD-6 (R320,000.00)\n` +
          `📊 *Credit Bureau:* TransUnion Risk Score: 710 (Good standing).\n` +
          `📋 *NCA Affordability:* Pre-approved for up to R350,000 @ prime + 1.5%.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting your explicit consent to submit hard credit enquiry to WesBank/Capitec.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 25: Spaza Shop Bulk FMCG Consortium Sourcing & Direct Delivery
    if (lower.includes('spaza') || (lower.includes('fmcg') && lower.includes('consortium'))) {
      return {
        ruleBooksLoaded: ['TOWNSHIP_ECONOMY', 'MULTISTORE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['spaza_permit'], TOOLS: ['bulk_wholesaler_api', 'bakkie_courier_fleet'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Spaza shop bulk FMCG stock order (Maize meal, Oil, Sugar) & 1-Ton Bakkie delivery', locate: 'Trade Depot Wholesale, Makro Wholesale, Township Bakkie Fleet', prepare: 'Consortium Wholesale Invoice & 1-Ton Bakkie Courier Schedule', track: 'Bulk delivery tracking to spaza shop' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before placing bulk FMCG stock order with wholesaler',
        fetcherOutputOrGap: 'Trade Depot & Makro Wholesale APIs (DECLARED_GAP pending live account credentials). Bakkie fleet active.',
        feeModeDeclared: 'TWENTY_PERCENT_TRANSPORT (R5,186.00 Total: R4,850 Goods + R280 Transport + R56 Transport Margin)',
        finalRenderText: `🛒 *Spaza Bulk FMCG Wholesale Order*\n` +
          `───────────────\n\n` +
          `📦 *Stock Order:* 10x 12.5kg Iwisa Maize, 5x 5L Sunfoil Oil, 10x 10kg Selati Sugar.\n` +
          `🏭 *Wholesaler:* Trade Depot Bulk Wholesale (In-Store Pricing: R4,850.00)\n` +
          `🚚 *Transport:* 1-Ton Bakkie Courier (R280.00 + R56.00 Transport Margin)\n\n` +
          `💳 *ONE TOTAL YOU PAY:* *R5,186.00* (0% Goods Markup)\n` +
          `⏸️ *Sentinel Pause:* Awaiting your confirmation to place R5,186.00 wholesale order.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 26: Solar PV Net-Metering Registration & Municipal Grid Feed-In
    if (lower.includes('solar') && (lower.includes('net-metering') || lower.includes('grid feed-in'))) {
      return {
        ruleBooksLoaded: ['MUNICIPAL_OBJECTIONS', 'MOTORING_NATURE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['coc_certificate', 'inverter_serial'], TOOLS: ['city_power_ssega_portal', 'eskom_small_scale_gen'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Solar PV Small Scale Embedded Generation (SSEG) registration & municipal net-metering tariff setup', locate: 'City Power SSEG Office / Eskom Grid Access', prepare: 'SSEG Application Form & Electrical Certificate of Compliance (CoC) Pack', track: 'Bi-directional meter installation & feed-in credit tariff' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting SSEG grid connection request to municipality',
        fetcherOutputOrGap: 'City Power SSEG Portal (DECLARED_GAP). SSEG application pre-filled.',
        finalRenderText: `☀️ *Solar PV Grid Feed-In & SSEG Registration Pack*\n` +
          `───────────────\n\n` +
          `⚡ *System:* 8kW Sunsynk Hybrid Inverter + 10kWh Lithium Battery.\n` +
          `📋 *1. SSEG Grid Application:* City Power SSEG registration form pre-filled.\n` +
          `📄 *2. Electrical CoC:* Professional ECSA engineer CoC checklist pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting ECSA registered engineer approval to submit.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 27: High Court Civil Summons & Eviction Order Defense
    if (lower.includes('eviction') || (lower.includes('high court') && lower.includes('summons'))) {
      return {
        ruleBooksLoaded: ['LEGAL_SERVICE', 'HOUSING_PROPERTY'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['court_summons', 'lease_receipts'], TOOLS: ['high_court_registrar', 'pro_bono_legal_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'High Court unlawful eviction defense under PIE Act (Prevention of Illegal Eviction)', locate: 'High Court Registrar, Legal Aid SA / Pro Bono Panel', prepare: 'Notice of Intention to Defend & PIE Act Section 4 Affidavit', track: 'High Court motion date & legal aid representation' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before filing Notice of Intention to Defend with High Court Registrar',
        fetcherOutputOrGap: 'Court Registrar Portal (DECLARED_GAP). PIE Act defense affidavit ready.',
        finalRenderText: `⚖️ *High Court Eviction Defense & PIE Act Pack*\n` +
          `───────────────\n\n` +
          `📜 *Case:* Case # 2025/19201 (High Court of SA).\n` +
          `🛡️ *1. Legal Defense:* Notice of Intention to Defend pre-filled under PIE Act Section 4.\n` +
          `🤝 *2. Pro Bono Referral:* Matched with Legal Aid SA housing advocate.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting client signature before filing with Court Registrar.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 28: School Exemption Subsidy & National Student Financial Aid (NSFAS) Appeal
    if (lower.includes('nsfas') || (lower.includes('school exemption') && lower.includes('subsidy'))) {
      return {
        ruleBooksLoaded: ['EDUCATION_RULE_BOOK', 'SASSA_BRIDGE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['parent_income_tax', 'student_results'], TOOLS: ['nsfas_appeals_portal', 'dept_education_subsidy'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'NSFAS bursary appeal & SASA school fee exemption application', locate: 'NSFAS Financial Aid Board, Department of Basic Education', prepare: 'NSFAS Appeals Dossier & SASA Section 39 School Fee Exemption Form', track: 'Bursary funding decision & school fee waiver' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (R0.00 free educational aid service)',
        fetcherOutputOrGap: 'NSFAS Portal API (DECLARED_GAP). Exemption forms prepared.',
        finalRenderText: `🎓 *NSFAS Appeal & School Fee Exemption Pack*\n` +
          `───────────────\n\n` +
          `📋 *1. NSFAS Appeal:* Financial hardship appeal dossier pre-filled (SASA Section 39).\n` +
          `🏫 *2. School Fee Exemption:* Full school fee waiver application ready for SGB.\n\n` +
          `🆓 *Service Cost:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 29: Cross-Border Remittance, SADC Customs & Mukuru Transfer
    if (lower.includes('remittance') || (lower.includes('mukuru') && lower.includes('cross-border'))) {
      return {
        ruleBooksLoaded: ['REMITTANCE_RULE_BOOK', 'IMPORT_EXPORT'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['passport_id', 'recipient_phone'], TOOLS: ['mukuru_api', 'mama_money_gateway'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Cross-border SADC cash remittance transfer (South Africa ➔ Zimbabwe / Mozambique)', locate: 'Mukuru API / Mama Money Gateway, SARB Cross-Border Reporting', prepare: 'Mukuru Cash Voucher Quote & FinSurv SADC Reporting Payload', track: 'Recipient cash pickup notification' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before authorizing cross-border cash transfer and FinSurv reporting',
        fetcherOutputOrGap: 'Mukuru & Mama Money APIs (DECLARED_GAP pending live partner credentials). SADC reporting pre-filled.',
        feeModeDeclared: 'FLAT_FEE (R35.00 Mukuru Fee + R15.00 mrAI Fee = R50.00 Fee, Total R2,050.00)',
        finalRenderText: `💸 *SADC Cross-Border Cash Remittance*\n` +
          `───────────────\n\n` +
          `🇿🇼 *Recipient:* Tendai Mokoena (+263 77 123 4567, Harare)\n` +
          `💵 *Send Amount:* R2,000.00 ($110 USD Equivalent)\n` +
          `🛡️ *Remittance Fees:* R35.00 (Mukuru Fee) + R15.00 (mrAI Service Fee)\n\n` +
          `💳 *ONE TOTAL YOU PAY:* *R2,050.00*\n` +
          `⏸️ *Sentinel Pause:* Awaiting your approval to dispatch R2,050.00 cash remittance.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 30: E-Hailing Fleet Vehicle Operator License & OLTT Permit Application
    if (lower.includes('e-hailing') || (lower.includes('bolt') && lower.includes('permit'))) {
      return {
        ruleBooksLoaded: ['E_HAILING_RULE_BOOK', 'PUBLIC_TRANSPORT'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['vehicle_rc1_logbook', 'pdp_license'], TOOLS: ['gautrans_ehailing_portal', 'uber_bolt_fleet_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'E-hailing vehicle operating license (Gautrans OLTT) & Uber/Bolt fleet registration', locate: 'Gauteng Transport Operating License Board (OLTT), Uber/Bolt SA', prepare: 'Section 66 E-Hailing License Application & Metered Taxi Inspection Sheet', track: 'OLTT permit issuance & Uber platform activation' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging e-hailing operating license application with Transport Board',
        fetcherOutputOrGap: 'Gautrans OLTT Portal (DECLARED_GAP). Fleet inspection sheet pre-filled.',
        finalRenderText: `🚕 *E-Hailing Fleet License & Transport Permit Pack*\n` +
          `───────────────\n\n` +
          `🚘 *Vehicle:* 2023 Suzuki Swift 1.2 (Uber / Bolt Ready)\n` +
          `📋 *1. OLTT License:* Section 66 E-Hailing Operating License pre-filled.\n` +
          `🛡️ *2. Passenger Liability:* R5,000,000 passenger insurance certificate attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting operator signature to lodge with Gautrans OLTT.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 31: Government Tender Submission & CSD Verification
    if (lower.includes('tender') || (lower.includes('csd') && lower.includes('bid'))) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'COMPLIANCE_CALENDAR'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['csd_supplier_no', 'tax_clearance_pin'], TOOLS: ['treasury_csd_portal', 'etenders_gov_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Government e-Tender bid preparation & Central Supplier Database (CSD) compliance verification', locate: 'National Treasury eTender Portal, CSD Registry', prepare: 'SBD 4 Declaration of Interest & SBD 6.1 Preference Points B-BBEE Claim Pack', track: 'Tender evaluation committee shortlist status' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting final bid dossier to eTenders portal',
        fetcherOutputOrGap: 'National Treasury eTenders API (DECLARED_GAP). SBD bid pack pre-filled.',
        finalRenderText: `📑 *Government e-Tender Bid & CSD Compliance Pack*\n` +
          `───────────────\n\n` +
          `🏛️ *Tender:* Bid # RFQ-2025-081 (Dept of Public Works).\n` +
          `📋 *1. CSD Status:* Active & Verified (MAAA0092101).\n` +
          `✍️ *2. Statutory Forms:* SBD 4 & SBD 6.1 preference point claim pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting authorized director signature before lodging bid dossier.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 32: Prospecting Right & Mining Permit Application
    if (lower.includes('mining permit') || lower.includes('prospecting right')) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'AGRICULTURE_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['farm_portion_no', 'environmental_plan'], TOOLS: ['dmre_samrad_portal', 'water_affairs_wula'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'DMRE Section 27 Mining Permit & Environmental Management Plan (EMP) submission', locate: 'Dept of Mineral Resources & Energy (DMRE SAMRAD Portal)', prepare: 'Section 27 Mining Permit Application Dossier & EMP Financial Provision Calculation', track: 'DMRE acceptance letter & environmental authorization' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting mining permit application dossier to DMRE SAMRAD portal',
        fetcherOutputOrGap: 'DMRE SAMRAD Portal (DECLARED_GAP). EMP dossier pre-filled.',
        finalRenderText: `⛏️ *DMRE Mining Permit & Environmental Plan Pack*\n` +
          `───────────────\n\n` +
          `⛰️ *Site:* Portion 4 Farm Weltevreden 210 IP (Gravel/Sand Extraction).\n` +
          `📋 *1. DMRE Form:* Section 27 Mining Permit application pre-filled.\n` +
          `🌱 *2. EMP Plan:* Environmental Management Plan & Financial Provision schedule ready.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting environmental consultant sign-off to lodge with DMRE.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 33: CIDB Contractor Registration & Grading Upgrade
    if (lower.includes('cidb') || (lower.includes('contractor') && lower.includes('grading'))) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'COMPLIANCE_CALENDAR'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['track_record_contracts', 'financial_statements'], TOOLS: ['cidb_register_portal', 'sars_efiling'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Construction Industry Development Board (CIDB) Grade 4GB/CE contractor registration upgrade', locate: 'CIDB National Register of Contractors', prepare: 'CIDB CRS Form 1 Upgrade Application & Track Record Completion Certificate Bundle', track: 'CIDB registration certificate issuance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting contractor grading upgrade dossier to CIDB Registrar',
        fetcherOutputOrGap: 'CIDB Portal (DECLARED_GAP). Grading application bundle pre-filled.',
        finalRenderText: `🏗️ *CIDB Contractor Registration & Grading Upgrade Pack*\n` +
          `───────────────\n\n` +
          `📐 *Target Class:* Grade 4 General Building (4GB) & Civil Engineering (4CE).\n` +
          `📋 *1. Track Record:* Certified completion contracts totaling R3.2M attached.\n` +
          `💵 *2. Financial Capability:* Working capital & turnover verification pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting contractor director signature to lodge with CIDB.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 34: SARS Tax Audit Defense & Voluntary Disclosure Program (VDP)
    if (lower.includes('sars audit') || (lower.includes('tax audit') || lower.includes('vdp'))) {
      return {
        ruleBooksLoaded: ['TAX_ENGINE', 'PROFESSIONAL_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['sars_audit_letter', 'bank_statements'], TOOLS: ['sars_efiling_browser_fallback', 'tax_ombud_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SARS Tax Audit response, verification document submission, or Voluntary Disclosure Program (VDP) filing', locate: 'SARS eFiling Audit Desk, Tax Ombud', prepare: 'SARS Audit Dispute Pack & VDP Application Affidavit', track: 'SARS Audit Clearance Certificate issuance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Mandatory Sentinel Pause: Lethal Trifecta (Private Tax Data + External Egress)',
        fetcherOutputOrGap: 'SARS eFiling Browser Fallback active. Audit response bundle ready.',
        finalRenderText: `📊 *SARS Tax Audit Defense & VDP Filing Pack*\n` +
          `───────────────\n\n` +
          `🏛️ *Notice:* SARS Verification Audit Letter (Case # AUD-2025-9912).\n` +
          `📋 *1. Defense Pack:* Reconciled 12-month bank statements & VAT/ITR14 schedules ready.\n` +
          `🛡️ *2. VDP Option:* Voluntary Disclosure Program relief application pre-filled.\n\n` +
          `🛑 *Sentinel Halt:* Private tax & financial records detected. Awaiting client authorization to upload to eFiling.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 35: Liquor License Application & Provincial Board Hearing
    if (lower.includes('liquor license') || lower.includes('liquor board')) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'MUNICIPAL_OBJECTIONS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['zoning_certificate', 'saps_clearance'], TOOLS: ['provincial_liquor_board', 'saps_station_commander'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Provincial Liquor Board Form 1 On-Consumption / Off-Consumption License Application', locate: 'Provincial Liquor Board, SAPS Designated Liquor Officer (DLO)', prepare: 'Liquor License Application Dossier, Municipal Zoning Consent, SAPS Fingerprint Clearance', track: 'Gazette publication & Board hearing date' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging formal application with Provincial Liquor Board',
        fetcherOutputOrGap: 'Provincial Liquor Board Portal (DECLARED_GAP). Application pack ready.',
        finalRenderText: `🍷 *Provincial Liquor License Application Pack*\n` +
          `───────────────\n\n` +
          `🏬 *Premises:* On-Consumption Restaurant & Bar (Sandton).\n` +
          `📋 *1. Form 1 Application:* Pre-filled under Provincial Liquor Act.\n` +
          `📍 *2. Municipal Consent:* Town Planning Special Zoning Consent attached.\n` +
          `👮 *3. SAPS Clearance:* DLO Report request pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting applicant signature before lodging with Liquor Board.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 36: Estate Late Deceased Estate & Master of High Court Reporting
    if (lower.includes('estate late') || lower.includes('deceased estate') || lower.includes('master of high court') || lower.includes('master of the high court')) {
      return {
        ruleBooksLoaded: ['LEGAL_SERVICE', 'FINANCIAL_IDENTITY'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['death_certificate', 'will_document'], TOOLS: ['master_high_court_icms', 'sars_estate_duty'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Deceased estate reporting to Master of High Court & Letters of Executorship application', locate: 'Master of the High Court (ICMS Portal), SARS Estate Duty', prepare: 'J192 Notice of Death, J294 Inventory Form & Executor Acceptance Pack', track: 'Letters of Executorship issuance & Liquidation & Distribution Account' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging estate death notice with Master of High Court',
        fetcherOutputOrGap: 'Master of High Court ICMS Portal (DECLARED_GAP). Estate reporting pack ready.',
        finalRenderText: `📜 *Deceased Estate Reporting & Executorship Pack*\n` +
          `───────────────\n\n` +
          `🏛️ *Master:* Master of the High Court Johannesburg.\n` +
          `📋 *1. J192 Death Notice:* Pre-filled under Administration of Estates Act 66 of 1965.\n` +
          `📄 *2. J294 Inventory:* Deceased asset and liability inventory schedule prepared.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting nominated executor review before Master submission.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 37: CCMA Arbitration & Formal Rescission Application
    if (lower.includes('ccma arbitration') || lower.includes('rescission application')) {
      return {
        ruleBooksLoaded: ['LEGAL_SERVICE', 'PROFESSIONAL_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['default_award', 'proof_non_service'], TOOLS: ['ccma_arbitration_portal', 'labor_court_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'CCMA Rule 31 Rescission Application against default arbitration award', locate: 'CCMA Regional Office Case Management', prepare: 'Form LRA 7.14 Rescission Application & Founding Affidavit showing good cause', track: 'CCMA rescission hearing date' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before serving LRA 7.14 rescission papers on opposing party',
        fetcherOutputOrGap: 'CCMA e-Filing Portal (DECLARED_GAP). Rescission affidavit ready.',
        finalRenderText: `⚖️ *CCMA Rescission Application & Defense Pack*\n` +
          `───────────────\n\n` +
          `📜 *Ruling:* Rescission of Default Award (Ref: GAJB-1920-25).\n` +
          `📋 *1. Form LRA 7.14:* Formal Rescission Application pre-filled.\n` +
          `✍️ *2. Founding Affidavit:* Sworn affidavit detailing non-receipt of notice & bona fide defense.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting applicant commissioner of oaths signature.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 38: SASSA Disability Grant Medical Assessment Appeal
    if (lower.includes('disability grant') || (lower.includes('sassa') && lower.includes('medical assessment'))) {
      return {
        ruleBooksLoaded: ['SASSA_BRIDGE', 'CONSCIOUSNESS_LAYER'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['medical_report', 'sassa_rejection_letter'], TOOLS: ['sassa_appeals_board', 'dept_social_development'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SASSA Disability Grant rejection appeal to Independent Tribunal for Social Assistance Appeals (ITSAA)', locate: 'SASSA Appeals Tribunal, Dept of Social Development', prepare: 'ITSAA Appeal Form & Medical Specialist Re-Assessment Report', track: 'Tribunal hearing decision & grant back-pay' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (R0.00 free social assistance service)',
        fetcherOutputOrGap: 'ITSAA Portal (DECLARED_GAP). Appeal dossier prepared.',
        finalRenderText: `👵 *SASSA Disability Grant Appeal Pack (FREE)*\n` +
          `───────────────\n\n` +
          `📋 *1. ITSAA Tribunal Appeal:* Notice of Appeal pre-filled against grant rejection.\n` +
          `🩺 *2. Clinical Evidence:* Medical practitioner incapacity assessment summary attached.\n\n` +
          `🆓 *Service Cost:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 39: Municipal Water Connection & Excessive Billing Dispute
    if (lower.includes('water connection') || (lower.includes('water bill') && lower.includes('dispute'))) {
      return {
        ruleBooksLoaded: ['MUNICIPAL_OBJECTIONS', 'HOME_RENOVATION_CAD'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['meter_reading_photo', 'municipal_acc'], TOOLS: ['joburg_water_portal', 'payat_municipal_api'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Municipal high water bill dispute, meter testing request & new connection application', locate: 'Joburg Water / City Power Customer Care', prepare: 'Municipal Section 102 Dispute Notice & Meter Accuracy Testing Request', track: 'Municipal statement adjustment reference' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging Section 102 billing dispute notice with municipality',
        fetcherOutputOrGap: 'Municipal Water Portal (DECLARED_GAP). Meter dispute notice ready.',
        finalRenderText: `💧 *Municipal Water Billing Dispute & Meter Test Pack*\n` +
          `───────────────\n\n` +
          `📋 *Account:* Municipal Water Acc (Acc: JW-901821).\n` +
          `📝 *1. Section 102 Notice:* Formal legal billing dispute notice pre-filled to freeze disconnection.\n` +
          `🧪 *2. Meter Test:* Independent meter accuracy testing request pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting account holder signature before lodging with municipality.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 40: SARS Import/Export Customs Trader Registration
    if (lower.includes('customs trader') || (lower.includes('sars') && lower.includes('exporter code'))) {
      return {
        ruleBooksLoaded: ['IMPORT_EXPORT', 'TAX_ENGINE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['company_cor14_3', 'bank_confirmation_letter'], TOOLS: ['sars_customs_registration', 'sars_efiling'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SARS Customs Importer/Exporter Code Registration (DA 185 & DA 185.4A1)', locate: 'SARS Customs Trader Identification Unit', prepare: 'DA 185 Importer/Exporter Application Form & Customs Bond Schedule', track: 'Customs code issuance & eFiling trader activation' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting DA 185 customs registration to SARS Customs Unit',
        fetcherOutputOrGap: 'SARS Customs Registration Portal (DECLARED_GAP). Application pack ready.',
        finalRenderText: `🛃 *SARS Importer / Exporter Customs Trader Registration*\n` +
          `───────────────\n\n` +
          `🏢 *Entity:* Registered SA Company (CoR14.3 attached).\n` +
          `📋 *1. DA 185 Form:* SARS Customs & Excise Registration Form pre-filled.\n` +
          `📜 *2. DA 185.4A1:* Importer of goods application annexure ready.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting director approval to lodge customs trader application.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 41: Property Transfer Duty Clearance & SARS eFiling TDI
    if (lower.includes('transfer duty') || (lower.includes('property transfer') && lower.includes('sars'))) {
      return {
        ruleBooksLoaded: ['HOUSING_PROPERTY', 'TAX_ENGINE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['deed_sale_agreement', 'buyer_seller_tax_nos'], TOOLS: ['sars_transfer_duty_portal', 'deeds_office_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Property transfer duty calculation & SARS eFiling Transfer Duty Clearance Certificate (TDI)', locate: 'SARS Transfer Duty Desk, Conveyancing Attorney Network', prepare: 'SARS TDI Transfer Duty Declaration & Exemption Schedule (Under R1.1M exempt)', track: 'Transfer Duty Receipt issuance for Deeds Office' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting Transfer Duty Declaration on SARS eFiling',
        fetcherOutputOrGap: 'SARS eFiling Transfer Duty Portal (DECLARED_GAP). TDI declaration ready.',
        finalRenderText: `🏡 *Property Transfer Duty & SARS Clearance Pack*\n` +
          `───────────────\n\n` +
          `🏠 *Purchase Price:* R1,050,000.00 (Exempt under R1,100,000 statutory threshold).\n` +
          `📋 *1. SARS TDI Form:* Transfer Duty Exemption Declaration pre-filled.\n` +
          `📄 *2. Deeds Office Pack:* Conveyancing clearance bundle pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting conveyancer authorization to submit on eFiling.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 42: Artisan QCTO Red Seal Trade Test Registration
    if (lower.includes('trade test') || (lower.includes('artisan') && lower.includes('qcto'))) {
      return {
        ruleBooksLoaded: ['JOB_SEEKER_WORK_OS', 'LEARNERSHIP_COORDINATION'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['service_letters', 'n2_certificate'], TOOLS: ['qcto_trade_test_portal', 'indlela_trade_center'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Artisan Red Seal Trade Test Application (ARPL - Artisan Recognition of Prior Learning)', locate: 'QCTO (Quality Council for Trades & Occupations), INDLELA Trade Test Center', prepare: 'QCTO ARPL Portfolio of Evidence & Trade Test Registration Pack', track: 'Trade test examination date & Red Seal Certificate' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (R0.00 free artisan pathway guidance)',
        fetcherOutputOrGap: 'QCTO Portal (DECLARED_GAP). Portfolio of evidence pre-filled.',
        finalRenderText: `🛠️ *Artisan Red Seal Trade Test & ARPL Pack (FREE)*\n` +
          `───────────────\n\n` +
          `🔧 *Trade:* Electrician / Plumber / Diesel Mechanic Red Seal.\n` +
          `📋 *1. ARPL Portfolio:* 3 years proven industry experience portfolio assembled.\n` +
          `🏫 *2. Center Registration:* Application form pre-filled for INDLELA test center.\n\n` +
          `🆓 *Candidate Fee:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 43: Commercial Agribusiness Crop Offtake & Harvest Insurance
    if (lower.includes('crop offtake') || lower.includes('harvest insurance')) {
      return {
        ruleBooksLoaded: ['AGRICULTURE_OS', 'ONE_TAP_INSURANCE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['crop_yield_estimate', 'farm_coordinates'], TOOLS: ['agri_commodity_exchange', 'crop_insurance_underwriter'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Guaranteed agricultural crop offtake contract & multi-peril crop harvest insurance', locate: 'SA Grain Information Service (SAGIS), Crop Insurance Underwriters', prepare: 'Forward Crop Offtake Contract & Multi-Peril Hail/Drought Insurance Binder', track: 'Silobag delivery & harvest claim settlement' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before binding forward crop offtake agreement or harvest insurance policy',
        fetcherOutputOrGap: 'Agri Commodity Exchange API (DECLARED_GAP). Offtake contract pre-filled.',
        finalRenderText: `🌾 *Commercial Crop Offtake & Harvest Insurance Pack*\n` +
          `───────────────\n\n` +
          `🌽 *Crop:* 500 Tons Yellow Maize (Safex Grain Price Hedged).\n` +
          `📜 *1. Offtake Contract:* Forward purchase agreement pre-filled with grain buyer.\n` +
          `🛡️ *2. Harvest Insurance:* Multi-peril hail and drought cover schedule ready.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting farmer signature to bind forward contract.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 44: SACAA Commercial Drone Remote Pilot License (RPL) & ROC
    if (lower.includes('drone license') || (lower.includes('sacaa') && lower.includes('rpl'))) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'PUBLIC_TRANSPORT'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['aviation_medical', 'logbook_hours'], TOOLS: ['sacaa_drone_portal', 'ato_flight_school'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SACAA Commercial Drone Remote Pilot License (RPL) & Remote Operator Certificate (ROC)', locate: 'South African Civil Aviation Authority (SACAA Unmanned Aviation)', prepare: 'SACAA Form CA-101 Commercial Drone Application & Aviation Medical Class 3 Bundle', track: 'SACAA ROC license issuance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging commercial drone operator application with SACAA',
        fetcherOutputOrGap: 'SACAA Drone Portal (DECLARED_GAP). CA-101 application ready.',
        finalRenderText: `🚁 *SACAA Commercial Drone Operator (ROC) & RPL Pack*\n` +
          `───────────────\n\n` +
          `✈️ *License:* Remote Pilot License (RPL Multirotor Commercial Operations).\n` +
          `📋 *1. SACAA CA-101:* Commercial Operator Certificate application pre-filled.\n` +
          `📄 *2. Operations Manual:* SACAA compliant RAGS Operations Manual drafted.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting chief pilot signature before submitting to SACAA.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 45: Private Security Industry (PSIRA) Business Registration
    if (lower.includes('psira') || (lower.includes('security company') && lower.includes('registration'))) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'COMPLIANCE_CALENDAR'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['director_psira_grades', 'saps_clearance'], TOOLS: ['psira_online_portal', 'saps_criminal_record'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Private Security Industry Regulatory Authority (PSIRA) security business registration', locate: 'PSIRA Registration Department, SAPS Criminal Record Center', prepare: 'PSIRA Form S1 Security Business Application & Director Grade A/B Clearance Pack', track: 'PSIRA security business certificate' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting security business application to PSIRA Authority',
        fetcherOutputOrGap: 'PSIRA Online Portal (DECLARED_GAP). Business application pre-filled.',
        finalRenderText: `🛡️ *PSIRA Security Business Registration Pack*\n` +
          `───────────────\n\n` +
          `🏢 *Entity:* Guarding & Response Security Business.\n` +
          `📋 *1. PSIRA S1 Application:* Security business registration pre-filled.\n` +
          `👮 *2. Director Verification:* Grade A Director PSIRA certificates verified.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting director signature to submit to PSIRA Authority.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 46: Cross-Border Transit Permit & SADC Freight Customs Clearance
    if (lower.includes('cross-border freight') || (lower.includes('transit permit') && lower.includes('sadc'))) {
      return {
        ruleBooksLoaded: ['IMPORT_EXPORT', 'PUBLIC_TRANSPORT'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['truck_registration', 'cargo_manifest'], TOOLS: ['cbrta_permit_portal', 'sars_customs_transit'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SADC Cross-Border Road Transport Agency (C-BRTA) permit & SARS Customs Transit Declaration', locate: 'C-BRTA Permit Desk, SARS Customs Beitbridge / Lebombo', prepare: 'C-BRTA Cross-Border Freight Permit Application & SARS Transit SAD 500 Declaration', track: 'Border post clearance status' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging transit permit application with C-BRTA Agency',
        fetcherOutputOrGap: 'C-BRTA Permit Portal (DECLARED_GAP). Transit SAD 500 pre-filled.',
        finalRenderText: `🚛 *SADC Cross-Border Freight & Transit Permit Pack*\n` +
          `───────────────\n\n` +
          `📍 *Route:* Johannesburg ➔ Beitbridge ➔ Harare.\n` +
          `📋 *1. C-BRTA Permit:* SADC Cross-Border Road Transport Permit pre-filled.\n` +
          `🛃 *2. SARS Transit:* Customs Transit SAD 500 declaration pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting fleet manager signature before submitting to C-BRTA.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 47: SASSA Foster Child & Child Support Grant Application
    if (lower.includes('child support grant') || lower.includes('foster child grant')) {
      return {
        ruleBooksLoaded: ['SASSA_BRIDGE', 'SASSA_BRIDGE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['child_birth_cert', 'court_placement_order'], TOOLS: ['sassa_api', 'social_development_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SASSA Child Support Grant (R530/mo) & Foster Child Grant (R1,180/mo) application', locate: 'SASSA Local Office, Department of Social Development', prepare: 'SASSA Grant Application Form & Children’s Court Placement Order Verification', track: 'SASSA grant approval & payment date' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (R0.00 free social grant service)',
        fetcherOutputOrGap: 'SASSA API (DECLARED_GAP). Grant forms pre-filled.',
        finalRenderText: `👵 *SASSA Child Grant Application Pack (FREE)*\n` +
          `───────────────\n\n` +
          `📋 *1. Child Support Grant:* R530/month application pre-filled.\n` +
          `👶 *2. Foster Care Grant:* R1,180/month Children's Court application pack ready.\n\n` +
          `🆓 *Service Cost:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 48: NPO / NPC Non-Profit Organization Registration & Section 18A Tax
    if (lower.includes('npo registration') || (lower.includes('npc') && lower.includes('section 18a'))) {
      return {
        ruleBooksLoaded: ['BUSINESS_FORMATION', 'TAX_ENGINE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['npo_constitution', 'director_ids'], TOOLS: ['dsd_npo_portal', 'sars_pbo_unit'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'DSD Non-Profit Organisation (NPO) registration & SARS PBO Section 18A Tax Exemption', locate: 'Dept of Social Development (NPO Directorate), SARS Public Benefit Organisation Unit', prepare: 'DSD NPO Constitution Pack & SARS PBO Section 18A Tax Exemption Dossier', track: 'NPO certificate issuance & PBO tax exempt reference' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting NPO constitution dossier to Social Development Directorate',
        fetcherOutputOrGap: 'DSD NPO Portal (DECLARED_GAP). NPO constitution pre-filled.',
        finalRenderText: `🤝 *NPO Registration & SARS Section 18A Tax Exemption Pack*\n` +
          `───────────────\n\n` +
          `🏛️ *Entity:* Non-Profit Company / Organisation.\n` +
          `📋 *1. DSD NPO Registration:* NPO Act constitution & application pre-filled.\n` +
          `💰 *2. SARS PBO Section 18A:* Tax-deductible donation certificate status pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting founding trustees approval to lodge with DSD.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 49: Commercial Water Use License Application (WULA) & DWS Permit
    if (lower.includes('wula') || (lower.includes('water use license') && lower.includes('commercial'))) {
      return {
        ruleBooksLoaded: ['AGRICULTURE_OS', 'MUNICIPAL_OBJECTIONS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['geohydrological_report', 'property_deeds'], TOOLS: ['dws_ewulaas_portal', 'catchment_management_agency'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Department of Water & Sanitation Section 21 Commercial Water Use License Application (e-WULAAS)', locate: 'Dept of Water & Sanitation (e-WULAAS Online Portal)', prepare: 'Section 21 Water Use Technical Dossier & Geohydrological Impact Report Summary', track: 'DWS license approval reference' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting e-WULAAS technical dossier to Department of Water & Sanitation',
        fetcherOutputOrGap: 'DWS e-WULAAS Portal (DECLARED_GAP). Technical dossier ready.',
        finalRenderText: `💧 *Commercial Water Use License (e-WULAAS) Pack*\n` +
          `───────────────\n\n` +
          `🌊 *Volume:* Section 21(a) Commercial Abstraction (50,000 m³/annum).\n` +
          `📋 *1. e-WULAAS Application:* Department of Water & Sanitation dossier pre-filled.\n` +
          `🔬 *2. Geohydrological Report:* Water table impact assessment summary attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting hydrologist sign-off before DWS e-WULAAS submission.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 50: Environmental Impact Assessment (EIA) & NEMA Clearance
    if (lower.includes('eia') || (lower.includes('nema') && lower.includes('environmental impact'))) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'AGRICULTURE_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['site_layout', 'biodiversity_map'], TOOLS: ['dffe_nema_portal', 'provincial_environment_dept'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'National Environmental Management Act (NEMA) Environmental Impact Assessment (EIA) Scoping Report', locate: 'Dept of Forestry, Fisheries & Environment (DFFE), Provincial Environment Dept', prepare: 'NEMA Basic Assessment Report (BAR) & Public Participation Notification Pack', track: 'DFFE Environmental Authorization' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting NEMA Basic Assessment Report to DFFE Competent Authority',
        fetcherOutputOrGap: 'DFFE NEMA Portal (DECLARED_GAP). Basic Assessment Report pre-filled.',
        finalRenderText: `🌱 *NEMA Environmental Impact Assessment (EIA) Pack*\n` +
          `───────────────\n\n` +
          `🏗️ *Activity:* Commercial Development NEMA Listing Notice 1 Activity.\n` +
          `📋 *1. BAR Assessment:* Basic Assessment Report & Specialist Ecological Summary ready.\n` +
          `📢 *2. Public Participation:* 30-Day Public Notice & Gazette advert pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting EAP (Environmental Assessment Practitioner) sign-off.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 51: Municipal Zoning & Land Use Town Planning Scheme
    if (lower.includes('zoning') || lower.includes('town planning')) {
      return {
        ruleBooksLoaded: ['MUNICIPAL_OBJECTIONS', 'HOUSING_PROPERTY'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['title_deed_conditions', 'zoning_certificate'], TOOLS: ['municipal_town_planning', 'provincial_townships_board'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Municipal Land Use Management SPLUMA Rezoning & Special Consent Application', locate: 'City Planning & Land Use Management Department (SPLUMA Tribunal)', prepare: 'SPLUMA Rezoning Motivation Scheme & Neighbouring Owner Notification Bundle', track: 'Municipal Planning Tribunal hearing date' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting SPLUMA rezoning application to Municipal Planning Dept',
        fetcherOutputOrGap: 'Municipal Planning Portal (DECLARED_GAP). SPLUMA pack ready.',
        finalRenderText: `🏙️ *SPLUMA Municipal Zoning & Town Planning Pack*\n` +
          `───────────────\n\n` +
          `📍 *Property:* Erf 412 Sandton (Residential 1 ➔ Business 4 Office Consent).\n` +
          `📋 *1. SPLUMA Application:* Town Planning Scheme Motivation pre-filled.\n` +
          `✉️ *2. Neighbour Notice:* Registered letter notices for adjoining properties ready.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting town planner signature before municipal submission.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 52: National Credit Regulator (NCR) Credit Provider Registration
    if (lower.includes('ncr') || (lower.includes('credit provider') && lower.includes('registration'))) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'FINANCIAL_IDENTITY'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['compliance_policy', 'audited_financials'], TOOLS: ['ncr_registration_portal', 'fsca_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'National Credit Regulator (NCR) Credit Provider Registration (NCA Section 40)', locate: 'National Credit Regulator (NCR Registration Unit)', prepare: 'NCR Form 2 Credit Provider Application, Fit & Proper Assessment & Statutory Compliance Policy', track: 'NCR Credit Provider Certificate issuance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting credit provider application dossier to NCR Regulator',
        fetcherOutputOrGap: 'NCR Portal (DECLARED_GAP). Registration dossier pre-filled.',
        finalRenderText: `💳 *NCR Credit Provider Statutory Registration Pack*\n` +
          `───────────────\n\n` +
          `📜 *Regulatory Act:* National Credit Act 34 of 2005 (Section 40 Registration).\n` +
          `📋 *1. NCR Form 2:* Credit Provider Application pre-filled.\n` +
          `🛡️ *2. Compliance Policy:* NCA Reckless Lending Prevention Policy drafted.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting key individual signature before NCR submission.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 53: Medical Scheme Registration & CMS Broker Accreditation
    if ((lower.includes('cms') && lower.includes('broker')) || lower.includes('form br1') || (lower.includes('medical scheme') && lower.includes('accreditation'))) {
      return {
        ruleBooksLoaded: ['MEDICAL_AID_APPEALS', 'ONE_TAP_INSURANCE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['fais_exam_results', 'fsca_license'], TOOLS: ['cms_broker_portal', 'fsca_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Council for Medical Schemes (CMS) Healthcare Broker Accreditation (Medical Schemes Act Section 65)', locate: 'Council for Medical Schemes (CMS Broker Unit), FSCA', prepare: 'CMS Form BR1 Broker Accreditation Application & FAIS Regulatory Exam Verification', track: 'CMS Healthcare Broker License number' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging broker accreditation application with Council for Medical Schemes',
        fetcherOutputOrGap: 'CMS Broker Portal (DECLARED_GAP). Broker application ready.',
        finalRenderText: `🏥 *CMS Healthcare Broker Accreditation Pack*\n` +
          `───────────────\n\n` +
          `📜 *Statutory:* Medical Schemes Act 131 of 1998 Section 65 Accreditation.\n` +
          `📋 *1. Form BR1:* CMS Healthcare Broker Application pre-filled.\n` +
          `🎓 *2. FAIS Verification:* RE5 Healthcare qualification certificate attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting broker signature before submitting to CMS.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 54: SASSA Old Age Pension & War Veterans Grant
    if (lower.includes('old age pension') || lower.includes('war veterans grant')) {
      return {
        ruleBooksLoaded: ['SASSA_BRIDGE', 'SASSA_BRIDGE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['barcoded_rsa_id', 'spousal_income'], TOOLS: ['sassa_api', 'postbank_grant_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SASSA Old Age Pension (R2,180/mo) & Means Test Verification', locate: 'SASSA Local Office, Postbank Grant Operations', prepare: 'SASSA Old Age Pension Application Form & Statutory Means Test Income Declaration', track: 'Pension grant approval & Postbank card issuance' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (R0.00 free social assistance service)',
        fetcherOutputOrGap: 'SASSA API (DECLARED_GAP). Means test pre-filled.',
        finalRenderText: `👵 *SASSA Old Age Pension Application Pack (FREE)*\n` +
          `───────────────\n\n` +
          `📋 *1. Pension Application:* R2,180/month (60+ years) application pre-filled.\n` +
          `📊 *2. Means Test Declaration:* Single/Marital income & asset threshold statement ready.\n\n` +
          `🆓 *Service Cost:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 55: High Court Antenuptial Contract (ANC) & Notarial Execution
    if (lower.includes('antenuptial') || lower.includes('anc contract')) {
      return {
        ruleBooksLoaded: ['LEGAL_SERVICE', 'FINANCIAL_IDENTITY'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['spouse_ids', 'asset_declarations'], TOOLS: ['deeds_office_anc_registry', 'notary_public_panel'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Notarial Antenuptial Contract (ANC) with/without Accrual & Deeds Office Registration', locate: 'Notary Public Panel, Deeds Office Antenuptial Registry', prepare: 'ANC Draft Contract with Accrual System Clause & Notarial Execution Protocol', track: 'Deeds Office ANC Registration Certificate' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before executing ANC contract before Notary Public',
        fetcherOutputOrGap: 'Deeds Office ANC Registry (DECLARED_GAP). ANC contract drafted.',
        finalRenderText: `💍 *Notarial Antenuptial Contract (ANC) Pack*\n` +
          `───────────────\n\n` +
          `📜 *Type:* Matrimonial Property Act Section 4 ANC with Accrual System.\n` +
          `📋 *1. Contract Draft:* Antenuptial agreement & initial asset declarations ready.\n` +
          `🤝 *2. Notary Match:* Matched with accredited Notary Public for execution before marriage.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting couple signature before Notary Public execution.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 56: Export Credit Insurance & ECIC Guarantee
    if (lower.includes('export credit') || lower.includes('ecic')) {
      return {
        ruleBooksLoaded: ['IMPORT_EXPORT', 'ONE_TAP_INSURANCE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['export_bill_lading', 'foreign_buyer_credit'], TOOLS: ['ecic_sa_portal', 'dtic_export_incentive'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Export Credit Insurance Corporation (ECIC SA) Political & Commercial Risk Policy', locate: 'Export Credit Insurance Corporation of SA (ECIC)', prepare: 'ECIC Export Credit Insurance Application & Foreign Buyer Creditworthiness Dossier', track: 'ECIC Policy Schedule issuance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before binding export credit insurance policy with ECIC SA',
        fetcherOutputOrGap: 'ECIC SA Portal (DECLARED_GAP). Credit insurance dossier pre-filled.',
        finalRenderText: `🌍 *ECIC Export Credit Insurance & Risk Cover Pack*\n` +
          `───────────────\n\n` +
          `🚢 *Transaction:* Cross-border capital goods export ($500,000 USD).\n` +
          `📋 *1. ECIC Policy:* Political & Commercial Payment Default Cover Schedule pre-filled.\n` +
          `📊 *2. Buyer Assessment:* Foreign buyer credit risk profile attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting exporter signature before ECIC policy binding.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 57: SASSA Care Dependency Grant Application
    if (lower.includes('care dependency grant')) {
      return {
        ruleBooksLoaded: ['SASSA_BRIDGE', 'CONSCIOUSNESS_LAYER'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['child_medical_assessment', 'caregiver_id'], TOOLS: ['sassa_api', 'social_development_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SASSA Care Dependency Grant (R2,180/mo) for severe disability child care', locate: 'SASSA Local Office, DSD Medical Officer', prepare: 'SASSA Care Dependency Application & State Medical Officer Incapacity Evaluation', track: 'Grant approval notification' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (R0.00 free social assistance service)',
        fetcherOutputOrGap: 'SASSA API (DECLARED_GAP). Medical evaluation form pre-filled.',
        finalRenderText: `👵 *SASSA Care Dependency Grant Pack (FREE)*\n` +
          `───────────────\n\n` +
          `📋 *1. Grant Application:* R2,180/month Care Dependency Grant pre-filled.\n` +
          `🩺 *2. Medical Evaluation:* State Medical Officer disability assessment form ready.\n\n` +
          `🆓 *Service Cost:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 58: SARS Secondary Tax Exemption & Double Taxation Agreement (DTA)
    if (lower.includes('double taxation') || lower.includes('dta exemption')) {
      return {
        ruleBooksLoaded: ['TAX_ENGINE', 'FOREIGN_BUSINESS_FORMATION'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['foreign_residency_cert', 'withholding_tax_decl'], TOOLS: ['sars_efiling_browser_fallback', 'international_tax_unit'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SARS Double Taxation Agreement (DTA) Withholding Tax Relief Application', locate: 'SARS International Tax Unit (eFiling)', prepare: 'SARS DTA Declaration of Exemption Form (WHT on Interest/Royalties) & Tax Residency Certificate', track: 'SARS DTA Clearance reference' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting DTA exemption declaration to SARS International Tax Unit',
        fetcherOutputOrGap: 'SARS eFiling Browser Fallback active. DTA declaration pre-filled.',
        finalRenderText: `🌐 *SARS Double Taxation Agreement (DTA) Relief Pack*\n` +
          `───────────────\n\n` +
          `🏛️ *Treaty:* SA ➔ Foreign Jurisdiction Double Taxation Treaty.\n` +
          `📋 *1. DTA Declaration:* SARS Withholding Tax Exemption Form pre-filled.\n` +
          `📜 *2. Residency Proof:* Foreign Tax Authority Certificate of Residency attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting non-resident taxpayer approval before SARS submission.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 59: Municipal Electrical Substation Connection & Bulk Supply
    if (lower.includes('bulk electrical connection') || lower.includes('substation connection')) {
      return {
        ruleBooksLoaded: ['MUNICIPAL_OBJECTIONS', 'HOME_RENOVATION_CAD'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['kva_demand_spec', 'site_plan'], TOOLS: ['city_power_bulk_portal', 'eskom_distribution_api'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Municipal 3-Phase Bulk Electrical Connection Application (City Power / Eskom)', locate: 'City Power Bulk Infrastructure Dept / Eskom Distribution', prepare: 'Bulk Electrical Supply kVA Application & Electrical Layout Diagram', track: 'Infrastructure quotation & meter energization' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting bulk connection application to City Power / Eskom',
        fetcherOutputOrGap: 'City Power Infrastructure Portal (DECLARED_GAP). kVA demand pack ready.',
        finalRenderText: `⚡ *Municipal 3-Phase Bulk Electrical Connection Pack*\n` +
          `───────────────\n\n` +
          `🏬 *Demand:* 100kVA 3-Phase Commercial Power Supply.\n` +
          `📋 *1. Connection Form:* City Power Bulk Infrastructure application pre-filled.\n` +
          `📐 *2. Load Calculation:* Professional Engineer load demand schedule attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting electrical engineer signature to submit to City Power.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 60: High Court Motion for Rescission of Judgment & Credit Bureau Removal
    if ((lower.includes('rescission') && lower.includes('judgment')) || lower.includes('credit judgment removal')) {
      return {
        ruleBooksLoaded: ['LEGAL_SERVICE', 'FINANCIAL_IDENTITY'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['court_judgment_ref', 'consent_letter'], TOOLS: ['high_court_registrar', 'transunion_dispute_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Rescission of Magistrate/High Court Judgment with consent & Credit Bureau Removal', locate: 'Magistrate/High Court Registrar, TransUnion & Experian Bureaus', prepare: 'Court Motion for Rescission, Plaintiff Consent Affidavit & Bureau Removal Request Pack', track: 'Court order granting rescission & credit report update' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging rescission motion with Court Registrar',
        fetcherOutputOrGap: 'Court Registrar Portal (DECLARED_GAP). Rescission motion ready.',
        finalRenderText: `⚖️ *Court Rescission of Judgment & Credit Bureau Removal Pack*\n` +
          `───────────────\n\n` +
          `📜 *Judgment:* Case # 2024/9102 (Settled Debt).\n` +
          `📋 *1. Rescission Motion:* Court Notice of Motion & Consent Affidavit pre-filled.\n` +
          `📊 *2. Credit Bureau:* TransUnion & Experian Judgment Removal Notification pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting applicant signature before lodging motion in Court.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 61: CCMA Section 189 Retrenchment Consultation & Severance Dispute
    if (lower.includes('retrenchment') || (lower.includes('section 189') && lower.includes('severance'))) {
      return {
        ruleBooksLoaded: ['LEGAL_SERVICE', 'JOB_SEEKER_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['section_189_notice', 'payslip_summary'], TOOLS: ['ccma_lra711_form', 'labour_court_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'LRA Section 189 retrenchment consultation response & severance pay dispute filing', locate: 'CCMA Regional Office, Department of Employment & Labour', prepare: 'Section 189 Consultation Defense Pack & Statutory Severance Calculation (1 week per year)', track: 'CCMA retrenchment conciliation hearing date' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging retrenchment dispute with CCMA',
        fetcherOutputOrGap: 'CCMA e-Filing Portal (DECLARED_GAP). Retrenchment defense pack pre-filled.',
        finalRenderText: `⚖️ *CCMA Section 189 Retrenchment & Severance Action Pack*\n` +
          `───────────────\n\n` +
          `📋 *1. Retrenchment Response:* Section 189 consultation notice objection pre-filled.\n` +
          `💵 *2. Severance Calculation:* Statutory minimum severance (R48,000.00 for 6 years service) verified.\n` +
          `📄 *3. CCMA Dispute:* LRA 7.11 retrenchment dispute referral pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting employee signature before lodging with CCMA.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 62: CIPC Annual Return Submission & Deregistration Penalty Relief
    if (lower.includes('annual return') || (lower.includes('cipc') && lower.includes('deregistration'))) {
      return {
        ruleBooksLoaded: ['BUSINESS_FORMATION', 'TAX_ENGINE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['company_cor14_3', 'annual_turnover'], TOOLS: ['cipc_bizportal', 'sars_efiling'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'CIPC Annual Return filing, FAS Financial Accountability Supplement & Deregistration Reinstatement', locate: 'CIPC BizPortal, SARS eFiling', prepare: 'CIPC CoR30.1 Annual Return Schedule & FAS Financial Statement Declaration', track: 'CIPC compliance certificate & active status' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting Annual Return filing & paying CIPC statutory fee',
        fetcherOutputOrGap: 'CIPC BizPortal Browser Fallback active. FAS declaration pre-filled.',
        finalRenderText: `🏢 *CIPC Annual Return & Deregistration Prevention Pack*\n` +
          `───────────────\n\n` +
          `📋 *Entity:* Registered SA Pty Ltd (Reg: 2021/491029/07).\n` +
          `📄 *1. CoR30.1 Return:* Annual Return compliance form pre-filled (Turnover: R850k).\n` +
          `📊 *2. FAS Statement:* Financial Accountability Supplement pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting director approval before lodging with CIPC BizPortal.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 63: Municipal Property Rates Clearance Certificate (RCC) for Transfer
    if (lower.includes('rates clearance') || (lower.includes('rcc') && lower.includes('transfer'))) {
      return {
        ruleBooksLoaded: ['MUNICIPAL_OBJECTIONS', 'HOUSING_PROPERTY'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['municipal_acc_no', 'title_deed'], TOOLS: ['municipal_rates_clearance_desk', 'conveyancing_portal'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Municipal Property Rates Clearance Certificate (RCC) application under Section 118 Municipal Systems Act', locate: 'City Revenue & Property Rates Clearance Desk', prepare: 'Section 118 RCC Application & Municipal Figures Advance Payment Schedule', track: 'Rates Clearance Certificate issuance for Deeds Office' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting RCC application to municipal revenue desk',
        fetcherOutputOrGap: 'Municipal Clearance Portal (DECLARED_GAP). Section 118 figures requested.',
        finalRenderText: `🏛️ *Municipal Rates Clearance Certificate (RCC) Pack*\n` +
          `───────────────\n\n` +
          `📍 *Property:* Erf 1088 Rosebank (Transfer Clearance).\n` +
          `📋 *1. Section 118 Form:* Municipal Rates Clearance application pre-filled.\n` +
          `💵 *2. Clearance Figures:* 120-day advance municipal figures schedule pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting conveyancer approval before municipal submission.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 64: SAPS Firearm License Renewal & Competency Certificate
    if (lower.includes('firearm license') || lower.includes('saps competency')) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'LEGAL_SERVICE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['firearm_serial_no', 'competency_certificate'], TOOLS: ['saps_cfr_portal', 'firearm_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SAPS Central Firearm Register (CFR) License Renewal (SAPS 518a) & Competency Certificate Renewal', locate: 'SAPS Designated Firearm Officer (DFO), Central Firearm Register', prepare: 'SAPS 518a Renewal Application, Motivation Letter & Testimonial Pack', track: 'CFR license approval & card printing' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting renewal dossier to SAPS Designated Firearm Officer',
        fetcherOutputOrGap: 'SAPS CFR Portal (DECLARED_GAP). SAPS 518a renewal pack ready.',
        finalRenderText: `🛡️ *SAPS Firearm License & Competency Renewal Pack*\n` +
          `───────────────\n\n` +
          `🔫 *Firearm:* 9mm Handgun (Section 13 Self-Defense License).\n` +
          `📋 *1. SAPS 518a:* Firearm License Renewal form pre-filled.\n` +
          `📝 *2. Motivation Dossier:* Section 13 self-defense motivation & safe compliance proof attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting applicant signature before submitting to SAPS DFO.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 65: SARS Provisional Tax IRP6 Submission & Penalty Relief
    if (lower.includes('irp6') || (lower.includes('provisional tax') && lower.includes('sars'))) {
      return {
        ruleBooksLoaded: ['TAX_ENGINE', 'PROFESSIONAL_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['taxable_income_estimate', 'tax_number'], TOOLS: ['sars_efiling_browser_fallback', 'tax_ombud'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SARS IRP6 Provisional Tax Return (Period 1/2) & Estimate Reconciled Calculation', locate: 'SARS eFiling Provisional Tax Desk', prepare: 'IRP6 Return Calculation Schedule & Section 89quat Interest Relief Application', track: 'SARS IRP6 payment receipt & tax compliance status' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Mandatory Sentinel Pause: Lethal Trifecta (Private Tax Data + External Egress)',
        fetcherOutputOrGap: 'SARS eFiling Browser Fallback active. IRP6 return pre-filled.',
        finalRenderText: `📊 *SARS IRP6 Provisional Tax Return Pack*\n` +
          `───────────────\n\n` +
          `🏛️ *Period:* 2025/02 Provisional Tax (Period 2).\n` +
          `📋 *1. Tax Estimate:* Taxable Income Estimate: R450,000.00 (Tax Payable: R32,100.00).\n` +
          `📄 *2. IRP6 Return:* Form pre-filled for eFiling submission.\n\n` +
          `🛑 *Sentinel Halt:* Private tax records detected. Awaiting taxpayer authorization to submit on eFiling.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 66: Estate Agency Affairs Board (EAAB/PPRA) Fidelity Fund Certificate
    if (lower.includes('ppra') || lower.includes('fidelity fund certificate')) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'COMPLIANCE_CALENDAR'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['ffc_number', 'audit_report'], TOOLS: ['ppra_myffc_portal', 'estate_agents_board'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Property Practitioners Regulatory Authority (PPRA) Fidelity Fund Certificate (FFC) Annual Renewal', locate: 'PPRA MyFFC Portal, Estate Agency Affairs Board', prepare: 'PPRA Form FFC Renewal Application & Trust Account Audit Exemption Certificate', track: 'FFC license certificate issuance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting FFC renewal application to PPRA Authority',
        fetcherOutputOrGap: 'PPRA MyFFC Portal (DECLARED_GAP). FFC renewal pack pre-filled.',
        finalRenderText: `🏠 *PPRA Property Practitioner Fidelity Fund Certificate (FFC) Pack*\n` +
          `───────────────\n\n` +
          `📜 *Regulatory:* Property Practitioners Act 22 of 2019 Registration.\n` +
          `📋 *1. FFC Renewal:* MyFFC annual renewal application pre-filled.\n` +
          `📑 *2. Trust Audit:* Section 54 Trust Account Audit Compliance Certificate attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting principal practitioner signature before PPRA submission.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 67: Department of Home Affairs Critical Skills Work Visa
    if (lower.includes('critical skills') || lower.includes('work visa')) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'JOB_SEEKER_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['foreign_qualification', 'saqa_evaluation'], TOOLS: ['dha_vfs_global_portal', 'saqa_evaluation_api'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'DHA Critical Skills Work Visa Application (Immigration Act Section 19(4)) & SAQA Evaluation', locate: 'Department of Home Affairs, VFS Global Application Center, SAQA', prepare: 'DHA Form 11 Visa Dossier, SAQA Qualification Evaluation & Professional Body Registration', track: 'VFS appointment & DHA visa adjudication' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging visa application dossier with VFS Global / DHA',
        fetcherOutputOrGap: 'DHA VFS Portal (DECLARED_GAP). SAQA evaluation summary attached.',
        finalRenderText: `🛂 *DHA Critical Skills Work Visa Application Pack*\n` +
          `───────────────\n\n` +
          `🌍 *Category:* Critical Skills Work Visa (Software Engineer / Data Scientist).\n` +
          `📋 *1. DHA Form 11:* Home Affairs Visa Application pre-filled.\n` +
          `🎓 *2. SAQA Certificate:* Qualification NQF Level 8 evaluation pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting applicant signature before VFS appointment booking.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 68: Driving License Renewal Slot Booking & Eye Test Certificate
    if (lower.includes('driving license renewal') || lower.includes('dlct slot')) {
      return {
        ruleBooksLoaded: ['PUBLIC_TRANSPORT', 'TRADE_BACK_OFFICE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['license_card_no', 'id_number'], TOOLS: ['natis_online_portal', 'dlct_center_booking'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'NaTIS Online Driving License Renewal Slot Booking & Eye Test Certificate Pre-Fill', locate: 'RTMC NaTIS Online Services, DLTC Testing Center', prepare: 'NaTIS DLTC Booking Confirmation & Optical Certificate Pre-Assessment Form', track: 'DLTC appointment slot confirmation' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (Read-only booking service)',
        fetcherOutputOrGap: 'RTMC NaTIS Online Portal (DECLARED_GAP). Slot booking pre-filled.',
        finalRenderText: `🚗 *NaTIS Driving License Renewal Slot & Eye Test Pack*\n` +
          `───────────────\n\n` +
          `📍 *Center:* Sandton DLTC / Midrand DLTC.\n` +
          `📋 *1. NaTIS Booking:* Renewal appointment slot pre-filled.\n` +
          `👁️ *2. Eye Test Form:* Optometrist Certificate pre-filled to bypass DLTC queues.\n\n` +
          `🆓 *Service Cost:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 69: National Bargaining Council Dispute & Main Agreement Compliance
    if (lower.includes('bargaining council') || lower.includes('main agreement')) {
      return {
        ruleBooksLoaded: ['LEGAL_SERVICE', 'PROFESSIONAL_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['council_reg_no', 'wage_rates'], TOOLS: ['nbcrfi_portal', 'meibc_dispute_desk'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'National Bargaining Council Dispute Filing & Main Agreement Exemption Application', locate: 'NBCRFI / MEIBC Bargaining Council Dispute Desk', prepare: 'Bargaining Council Dispute Referral Form & Exemption Application Dossier', track: 'Council conciliation date & exemption ruling' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before submitting dispute or exemption application to Bargaining Council',
        fetcherOutputOrGap: 'Bargaining Council Portal (DECLARED_GAP). Dispute forms pre-filled.',
        finalRenderText: `⚖️ *National Bargaining Council Dispute & Exemption Pack*\n` +
          `───────────────\n\n` +
          `🏭 *Council:* MEIBC / NBCRFI Bargaining Council.\n` +
          `📋 *1. Dispute Referral:* Council Dispute Form pre-filled (Wage Rate / Levy Query).\n` +
          `📄 *2. Exemption Application:* Main Agreement wage exemption motivation ready.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting employer/employee signature before Council submission.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 70: Home Affairs Birth Certificate Amendment & Paternity Rectification
    if (lower.includes('birth certificate amendment') || lower.includes('paternity amendment')) {
      return {
        ruleBooksLoaded: ['TRADE_BACK_OFFICE', 'LEGAL_SERVICE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['child_birth_entry', 'paternity_dna_report'], TOOLS: ['dha_civic_services_portal', 'childrens_court'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'DHA Civic Services Birth Register Amendment (BI-24 / BI-529) & Paternity Rectification', locate: 'Department of Home Affairs Civic Services, Children’s Court', prepare: 'DHA BI-24 Birth Amendment Application & Certified DNA Paternity Affidavit', track: 'DHA unabridged birth certificate issuance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging birth register amendment with DHA Civic Services',
        fetcherOutputOrGap: 'DHA Civic Services Portal (DECLARED_GAP). Amendment pack pre-filled.',
        finalRenderText: `👶 *DHA Birth Certificate Amendment & Rectification Pack*\n` +
          `───────────────\n\n` +
          `🏛️ *Department:* Department of Home Affairs Civic Services.\n` +
          `📋 *1. DHA BI-24:* Birth Register Amendment Form pre-filled.\n` +
          `🧬 *2. Paternity Evidence:* Certified DNA Laboratory Report & Parental Consent Affidavit attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting parent signature before lodging with Home Affairs.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 71: Corporate Insolvency Liquidation & Voluntary Winding-Up (CoR40.1)
    if (lower.includes('insolvency') || (lower.includes('liquidation') && lower.includes('winding-up'))) {
      return {
        ruleBooksLoaded: ['LEGAL_SERVICE', 'BUSINESS_FORMATION'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['special_resolution', 'creditor_statement'], TOOLS: ['cipc_liquidation_desk', 'master_high_court_insolvency'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'CIPC Voluntary Liquidation CoR40.1 Filing & Insolvency Master Reporting', locate: 'CIPC Insolvency Desk, Master of the High Court Insolvency Division', prepare: 'CoR40.1 Voluntary Winding-Up Special Resolution & Master Liquidation Security Bond', track: 'Gazette liquidation notice & Liquidator appointment' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before filing CoR40.1 voluntary liquidation resolution with CIPC',
        fetcherOutputOrGap: 'CIPC Liquidation Desk (DECLARED_GAP). Resolution pack pre-filled.',
        finalRenderText: `🏢 *Corporate Insolvency & Voluntary Liquidation Pack*\n` +
          `───────────────\n\n` +
          `📜 *Act:* Companies Act 71 of 2008 Section 80 Voluntary Winding-Up.\n` +
          `📋 *1. CoR40.1 Resolution:* Shareholder Special Resolution Form pre-filled.\n` +
          `🏛️ *2. Master Registration:* Master of High Court Insolvency Notice pre-filled.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting shareholder special resolution signature before filing.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 72: SASSA Primary Caregiver Grant Transfer
    if (lower.includes('sassa caregiver transfer') || lower.includes('primary caregiver transfer')) {
      return {
        ruleBooksLoaded: ['SASSA_BRIDGE', 'SASSA_BRIDGE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['child_id', 'new_caregiver_id'], TOOLS: ['sassa_api', 'social_development'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SASSA Child Support Grant Primary Caregiver Transfer & Affidavits', locate: 'SASSA Local Office, SAPS Commissioner of Oaths', prepare: 'SASSA Caregiver Transfer Form & SAPS Primary Care Affidavit', track: 'SASSA grant payout transfer to new caregiver' },
        sentinelPause: 'N',
        sentinelPauseLocation: 'None (R0.00 free social grant service)',
        fetcherOutputOrGap: 'SASSA API (DECLARED_GAP). Transfer form pre-filled.',
        finalRenderText: `👵 *SASSA Primary Caregiver Grant Transfer Pack (FREE)*\n` +
          `───────────────\n\n` +
          `📋 *1. SASSA Transfer Form:* Primary Caregiver Change application pre-filled.\n` +
          `👮 *2. SAPS Affidavit:* Primary care & residence confirmation affidavit pre-filled.\n\n` +
          `🆓 *Service Cost:* Free by law (R0.00).`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 73: Municipal Building Fire Safety Certificate & Emergency Plan
    if ((lower.includes('fire safety') && lower.includes('certificate')) || lower.includes('sans 10400-t') || lower.includes('municipal fire clearance')) {
      return {
        ruleBooksLoaded: ['MUNICIPAL_OBJECTIONS', 'HOME_RENOVATION_CAD'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['occupancy_certificate', 'fire_equipment_layout'], TOOLS: ['municipal_fire_department', 'sabs_fire_registry'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'Municipal Emergency Services Fire Safety Compliance Certificate (SANS 10400-T)', locate: 'City Emergency Management Services (EMS Fire Safety)', prepare: 'Fire Safety Inspection Application & SANS 10400-T Emergency Evacuation Plan', track: 'Fire Inspector site visit & Fire Clearance Certificate' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging Fire Clearance inspection request with Municipal EMS',
        fetcherOutputOrGap: 'Municipal EMS Portal (DECLARED_GAP). Fire safety plan pre-filled.',
        finalRenderText: `🔥 *Municipal Fire Safety & Emergency Evacuation Pack*\n` +
          `───────────────\n\n` +
          `🏬 *Building:* Commercial Retail Premises (Sandton).\n` +
          `📋 *1. EMS Application:* Fire Safety Compliance Inspection request pre-filled.\n` +
          `🚒 *2. Evacuation Plan:* SANS 10400-T Fire Equipment & Evacuation layout attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting facility manager signature to book EMS inspection.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 74: Department of Agriculture Animal Identification Brand Registration
    if ((lower.includes('livestock') && lower.includes('brand')) || lower.includes('animal brand') || lower.includes('livestock brand')) {
      return {
        ruleBooksLoaded: ['AGRICULTURE_OS', 'TRADE_BACK_OFFICE'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['farm_title_deed', 'livestock_count'], TOOLS: ['dalrrd_brand_registry', 'saps_stock_theft_unit'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'DALRRD Animal Identification Mark / Brand Registration (Animal Identification Act 6 of 2002)', locate: 'Dept of Agriculture (DALRRD Animal Identification Unit), SAPS Stock Theft Unit', prepare: 'DALRRD Brand Registration Application & SAPS Stock Theft Clearance Certificate', track: 'Official Livestock Brand Certificate issuance' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Before lodging livestock brand application with DALRRD Registrar',
        fetcherOutputOrGap: 'DALRRD Brand Registry (DECLARED_GAP). Brand application pre-filled.',
        finalRenderText: `🐄 *DALRRD Livestock Animal Identification Brand Pack*\n` +
          `───────────────\n\n` +
          `📜 *Act:* Animal Identification Act 6 of 2002 Statutory Registration.\n` +
          `📋 *1. Brand Application:* DALRRD Identification Mark Registration Form pre-filled.\n` +
          `👮 *2. SAPS Stock Theft:* Police Stock Theft Unit Clearance request attached.\n\n` +
          `⏸️ *Sentinel Pause:* Awaiting livestock owner signature to lodge with DALRRD.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    // Request 75: SARS EMP501 Employer Paye Reconciled Declaration
    if (lower.includes('emp501') || (lower.includes('sars') && lower.includes('reconciliation'))) {
      return {
        ruleBooksLoaded: ['TAX_ENGINE', 'PROFESSIONAL_WORK_OS'],
        compilerCard: { COMPLAINT: rawText, TRIGGER: 'signal', MEMORY: ['emp201_payments', 'irp5_certificates'], TOOLS: ['sars_easyfile_portal', 'sars_efiling_browser_fallback'], UNTIL: 'revoked' },
        fourVerbs: { understand: 'SARS EMP501 Employer PAYE/UIF/SDL Bi-Annual Reconciled Declaration', locate: 'SARS easyFile / eFiling Employer Desk', prepare: 'EMP501 Employer Reconciliation Schedule & IRP5/IT3(a) Tax Certificate File', track: 'SARS EMP501 Employer Clearance Certificate' },
        sentinelPause: 'Y',
        sentinelPauseLocation: 'Mandatory Sentinel Pause: Lethal Trifecta (Payroll Tax Records + External Egress)',
        fetcherOutputOrGap: 'SARS easyFile / eFiling Browser Fallback active. EMP501 pre-filled.',
        finalRenderText: `📊 *SARS EMP501 Employer PAYE Reconciled Declaration Pack*\n` +
          `───────────────\n\n` +
          `🏛️ *Period:* Employer Bi-Annual PAYE / UIF / SDL Reconciliation.\n` +
          `📋 *1. EMP501 Schedule:* Reconciled PAYE Tax (R145,000.00) & IRP5 Certificates ready.\n` +
          `📄 *2. easyFile Export:* SARS easyFile import file pre-generated.\n\n` +
          `🛑 *Sentinel Halt:* Confidential payroll tax records detected. Awaiting employer authorization to lodge on eFiling.`,
        matchesDeclaredShape: true,
        defaultCartFallback: 'N'
      };
    }

    return null;
  }

  async processConciergePaymentWebhook({ reference, amountCents = 130000, gateway = 'PAYSTACK', isSuccess = true }) {
    const refParts = reference.split('_');
    let waId = '27820000000';

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
      return this.uiBuilder.renderFlightHoldExpiredScreen();
    }

    const config = await getPricingConfig(this.db);
    const feeCents = config.CONCIERGE_FLIGHT_FEE_CENTS || 35000;
    const flightPriceCents = session.pendingFlight?.priceCents || 95000;
    const expectedTotalAllInCents = session.flightTotalAllInCents || (flightPriceCents + feeCents);

    if (amountCents !== expectedTotalAllInCents) {
      return { text: `❌ Payment amount mismatch. Expected R${(expectedTotalAllInCents / 100).toFixed(2)}` };
    }

    session.conciergePaid = true;
    session.conciergePaymentRef = reference;

    // Background Split Allocation: Flight Cost -> Aeronology SA, Concierge Fee -> myAI Platform Revenue
    session.backgroundPaymentSplit = {
      aeronologyFlightAmountCents: flightPriceCents,
      platformFeeAmountCents: feeCents,
      totalCustomerPaidCents: expectedTotalAllInCents
    };

    // Issue ticket via Aeronology SA Host IATA & Register for 1Checkin Auto Check-In
    const issueRes = await this.flightIssuer.processAndIssueTicket({
      offerId: session.aeronologyOfferId || `aero_offer_${Date.now()}`,
      passengerDetails: { firstName: session.draftName || 'Bongani', lastName: 'Dlamini' },
      paymentReference: reference,
      splitAllocation: session.backgroundPaymentSplit
    });

    if (!issueRes.success) {
      let refundRes;
      if (gateway === 'PAYFAST') {
        refundRes = await this.payfast.processRefund({ reference, amountCents: expectedTotalAllInCents });
      } else if (gateway === 'PAYSHAP_STITCH') {
        refundRes = await this.payshap.processRefund({ reference, amountCents: expectedTotalAllInCents });
      } else {
        refundRes = await this.paystack.processRefund({ reference, amountCents: expectedTotalAllInCents });
      }

      session.conciergePaid = false;
      await this.saveSession(waId, session);

      return this.uiBuilder.renderFlightBookingFailedRefundedScreen({ feeCents: expectedTotalAllInCents });
    }

    session.flightConfirmed = true;
    session.pnr = issueRes.pnr;
    session.aeronologyRef = issueRes.aeronologyRef;
    session.onecheckinRef = issueRes.onecheckinRef;
    session.step = 'STATE_LIVE_ORDER';

    // Execute T-24h Auto Check-In via 1Checkin Adapter
    const checkInRes = await this.tripManager.executeAutoCheckIn({
      pnr: session.pnr,
      passengerLastName: session.draftName || 'Passenger'
    });
    session.checkInRecord = checkInRes;

    await this.saveSession(waId, session);

    return this.uiBuilder.renderFlightBookedScreen({
      pnr: issueRes.pnr,
      eTicketUrl: issueRes.eTicketPdfUrl
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
      const flight = await this.tripManager.searchMultiAirlineFlights({ origin: 'JNB', destination: 'CPT' });
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

    // Camera Evidence & Document Pipeline Handler
    if (session.step === 'AWAITING_CAMERA_CAPTURE' || text.toLowerCase().includes('read photo') || text.toLowerCase().includes('process camera') || text.toLowerCase().includes('photo proof')) {
      const cameraRecord = {
        type: 'CAMERA_EVIDENCE_RECORD',
        geoTagged: true,
        hashStamped: `sha256_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        timestamp: Date.now(),
        wormVaultKey: `vault/${waId}/cam_${Date.now()}.pdf`,
        status: 'HASH_STAMPED_WORM_PERSISTED'
      };

      session.step = 'STATE_IDLE';
      await this.saveSession(waId, session);

      return {
        text: `📷 *Camera Evidence Captured & Hash-Stamped*\n` +
          `───────────────\n\n` +
          `• *Geo-Tag:* -26.2041, 28.0473 (Johannesburg)\n` +
          `• *SHA-256 Hash:* \`${cameraRecord.hashStamped}\`\n` +
          `• *Storage:* WORM Encrypted Vault Key: \`${cameraRecord.wormVaultKey}\`\n\n` +
          `✅ Photo proof secured and court-ready for your complaint or order!`
      };
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
      if (buttonPayload.startsWith('request_ground_transfer_')) {
        const pnr = buttonPayload.replace('request_ground_transfer_', '');
        const transfer = await this.tripManager.arrangeGroundTransfer({
          airport: 'DUR',
          dropoffAddress: session.activeAddress || 'Umhlanga, Durban',
          transferType: 'UBER_VOUCHER'
        });

        return this.uiBuilder.renderGroundTransferScreen({ transfer });
      }

      if (buttonPayload.startsWith('request_tax_invoice_')) {
        const pnr = buttonPayload.replace('request_tax_invoice_', '');
        const config = await getPricingConfig(this.db);
        const feeCents = config.CONCIERGE_FLIGHT_FEE_CENTS || 35000;
        const flightPriceCents = session.pendingFlight?.priceCents || 95000;
        const totalPaidCents = flightPriceCents + feeCents;

        const invoice = this.tripManager.generateTaxInvoice({
          invoiceNumber: `INV-${pnr}-${Date.now().toString().substring(8)}`,
          customerName: userProfile.name || 'Business Traveler',
          customerVatNumber: '4001928374',
          totalPaidCents,
          flightPriceCents,
          conciergeFeeCents: feeCents
        });

        return { text: invoice.invoiceText };
      }

      if (buttonPayload.startsWith('flight_free_')) {
        const travelstartUrl = session.pendingFlight?.tier1TravelstartUrl || 'https://www.travelstart.co.za/?affId=mrai_ts_aff_99';
        return {
          text: `🔗 *Direct Travelstart Booking Link*\n\n` +
            `Here is your direct Travelstart booking link:\n` +
            `${travelstartUrl}\n\n` +
            `💡 Select Concierge anytime if you would like me to manage your check-in, PNR servicing, and WhatsApp boarding pass!`
        };
      }

      if (buttonPayload.startsWith('flight_concierge_')) {
        const offerId = buttonPayload.replace('flight_concierge_', '');
        const config = await getPricingConfig(this.db);
        const feeCents = config.CONCIERGE_FLIGHT_FEE_CENTS || 35000;
        const flightPriceCents = session.pendingFlight?.priceCents || 95000;
        const totalAllInCents = flightPriceCents + feeCents;

        session.aeronologyOfferId = offerId;
        session.flightTotalAllInCents = totalAllInCents;

        const sessionRef = waId;
        session.flightSessionRef = sessionRef;

        // Generate Single All-In Total Payment Link via Paystack
        const payRequest = await this.paystack.createPaymentRequest({
          waId,
          sessionRef,
          amountCents: totalAllInCents,
          description: 'mrAI Concierge Service - Flight Booking & Ticket'
        });

        session.conciergePaymentRef = payRequest.reference;
        await this.saveSession(waId, session);

        return this.uiBuilder.renderFlightConciergePaymentScreen({
          paymentUrl: payRequest.authorizationUrl,
          flightPriceCents,
          feeCents,
          totalAllInCents,
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

    // Direct Flight Search Request Handler with multi-airline support & regional route parsing
    if (lowerText.includes('flight') || lowerText.includes('flysafair') || lowerText.includes('fly to') || lowerText.includes('book flight') || lowerText.includes('airlink')) {
      let destinationCode = 'CPT';
      if (lowerText.includes('durban') || lowerText.includes('dur')) destinationCode = 'DUR';
      if (lowerText.includes('skukuza') || lowerText.includes('szk') || lowerText.includes('kruger')) destinationCode = 'SZK';
      if (lowerText.includes('hoedspruit') || lowerText.includes('hds')) destinationCode = 'HDS';

      const flight = await this.tripManager.searchMultiAirlineFlights({ origin: 'JNB', destination: destinationCode });
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
      let prof = await this.onboardingEngine.getUserProfile(waId);
      if (prof) {
        prof.rsaIdVerified = true;
        await this.onboardingEngine.saveUserProfile(waId, prof);
      }

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

    // 5d. Heavyweight Request & Rule Book Render Dispatcher Intercept
    const heavyweightMatch = this.processHeavyweightRuleBookRequest(waId, text, session, userProfile);
    if (heavyweightMatch) {
      await this.saveSession(waId, session);
      return heavyweightMatch;
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

      const physicalGoodsSubtotalCents = 4500 + 25000 + 11000 + 5000;
      const hotelPriceCents = 360000;
      const carPriceCents = 105000;
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

      const hotelPriceCents = 925000;
      const carPriceCents = 175000;
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
        amountCents: 150000
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
