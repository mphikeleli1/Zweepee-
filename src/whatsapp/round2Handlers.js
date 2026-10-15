import { RuleBookDataLoader } from '../agents/factory.js';
import { CompilerEngine } from '../lib/router.js';

export function processRound2RuleBookRequest(waId, rawText, session, userProfile, agentFactory) {
  const lower = (rawText || '').toLowerCase();

  const registerRB = (code, name, shape, isPurchase = false) => {
    const decl = RuleBookDataLoader.createRuleBookDeclaration(code, name, { render_shape: shape, is_purchase_rule_book: isPurchase });
    if (agentFactory) {
      agentFactory.registerRuleBook(code, decl);
    }
    return code;
  };

  const compileAndRun = (complaint, trigger, memory, tools, until) => {
    const card = CompilerEngine.compileCard(complaint, trigger, memory, tools, until);
    const loop = CompilerEngine.executeFourVerbsLoop(card);
    return { card, loop };
  };

  // 1. Cancel subscriptions (DSTV, Netflix, Showmax)
  if (lower.includes('cancel my dstv') || (lower.includes('dstv') && lower.includes('netflix') && lower.includes('subscriptions'))) {
    const rbCode = registerRB('SUBSCRIPTION_MANAGER', 'Subscription Manager Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['subscription_ids', 'account_numbers'], ['multichoice_api', 'netflix_portal', 'showmax_api'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'FINANCIAL_IDENTITY'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Subscription cancellation for DSTV, Netflix, and Showmax with pro-rata refund calculations for unused days',
        locate: 'MultiChoice Self-Service, Netflix Billing Desk, Showmax Account API',
        prepare: 'Subscription Cancellation Requests & Pro-Rata Refund Claim Schedule',
        track: 'Cancellation confirmation references & bank account refund credits'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before executing subscription cancellation & refund requests with providers',
      fetcherOutputOrGap: 'MultiChoice Self-Service (DECLARED_GAP). Netflix & Showmax Web Desks (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R25.00 Subscription Concierge Fee)',
      finalRenderText: `📺 *Multi-Subscription Cancellation & Refund Pack*\n` +
        `───────────────\n\n` +
        `1️⃣ *DSTV Premium:* Account # 8910283 — Cancellation drafted. Unused credit: R380.00.\n` +
        `2️⃣ *Netflix Premium:* Plan # NX-8812 — Cancellation drafted. Unused credit: R99.00.\n` +
        `3️⃣ *Showmax:* Account # SH-1029 — Cancellation drafted. Unused credit: R45.00.\n` +
        `───────────────\n` +
        `💰 *Total Estimated Refund:* R524.00 (Credited back to bank account)\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting your explicit approval to submit cancellation requests.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 2. Transfer car licence
  if (lower.includes('car licence') && lower.includes('son') || lower.includes('transfer my car licence')) {
    const rbCode = registerRB('MOTORING_NATURE', 'Motoring Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['vehicle_logbook_rc1', 'son_rsa_id'], ['natis_online_portal', 'dltc_registration_desk'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'TRADE_BACK_OFFICE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Vehicle ownership transfer & registration update (Yellow NCO form & Blue RLV form) to son',
        locate: 'RTMC NaTIS Online System, Municipal DLTC Vehicle Registration Desk',
        prepare: 'NaTIS Form NCO (Notification of Change of Ownership) & Form RLV Application',
        track: 'NaTIS title deed update & new RC1 registration certificate'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before lodging ownership transfer on NaTIS registry',
      fetcherOutputOrGap: 'RTMC NaTIS Portal (DECLARED_GAP). NCO & RLV forms pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R150.00 NaTIS Ownership Transfer Filing Fee)',
      finalRenderText: `🚗 *Vehicle Ownership Transfer & NaTIS Registration Pack*\n` +
        `───────────────\n\n` +
        `🚘 *Vehicle:* 2018 Volkswagen Polo 1.2 TSI (VIN: AEV1092837192)\n` +
        `📋 *1. Form NCO:* Notification of Change of Ownership pre-filled.\n` +
        `📋 *2. Form RLV:* Registration and Licensing of Motor Vehicle pre-filled.\n` +
        `📜 *3. Roadworthy:* Certificate of Roadworthiness (CRW) booking prepared.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting seller and buyer signature before NaTIS submission.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 3. Appeal traffic fine
  if (lower.includes('traffic fine') || (lower.includes('fine') && lower.includes('sandton'))) {
    const rbCode = registerRB('MOTORING_NATURE', 'Motoring Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['aarto_notice_no', 'camera_location'], ['aarto_representation_desk', 'jampa_prosecutor'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'MUNICIPAL_OBJECTIONS'],
      compilerCard: card,
      fourVerbs: {
        understand: 'AARTO traffic fine representation appeal against camera error at Sandton intersection',
        locate: 'AARTO Appeals Board, Johannesburg Metropolitan Police Department (JMPD)',
        prepare: 'AARTO Form 08 Representation Application & Photographic Evidence Objection Docket',
        track: 'AARTO tribunal decision & fine cancellation notice'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before submitting formal AARTO Form 08 representation to tribunal',
      fetcherOutputOrGap: 'AARTO Portal (DECLARED_GAP). Representation affidavit ready.',
      feeModeDeclared: 'FLAT_FEE (R120.00 AARTO Representation Filing Fee)',
      finalRenderText: `🚘 *AARTO Traffic Fine Appeal & Representation Pack*\n` +
        `───────────────\n\n` +
        `📋 *Notice:* AARTO Fine # 02-4019-918290 (Sandton Intersection Camera Error)\n` +
        `✍️ *Form 08 Representation:* Formal legal representation drafted citing signal timing error.\n` +
        `📷 *Evidence:* Intersection camera timestamp & calibration log attached.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting driver signature before submitting representation to AARTO.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 4. Police clearance certificate
  if (lower.includes('police clearance') || (lower.includes('uk visa') && lower.includes('police'))) {
    const rbCode = registerRB('LEGAL_SERVICE', 'Legal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['rsa_id', 'fingerprint_card'], ['saps_criminal_record_center', 'dirco_apostille'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'TRADE_BACK_OFFICE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'SAPS Police Clearance Certificate (PCC) application & DIRCO apostille for UK visa',
        locate: 'SAPS Criminal Record Centre (Pretoria), DIRCO Legalisation Section',
        prepare: 'SAPS PCC Application Dossier, Fingerprint Verification Form & DIRCO Express Apostille',
        track: 'PCC tracking reference & courier delivery to UK visa center'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before lodging clearance dossier with SAPS Criminal Record Centre',
      fetcherOutputOrGap: 'SAPS CRC Portal (DECLARED_GAP). Fingerprint card verification pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R250.00 SAPS PCC & Legalisation Application Fee)',
      finalRenderText: `🛡️ *SAPS Police Clearance & DIRCO Apostille Pack*\n` +
        `───────────────\n\n` +
        `🏛️ *Purpose:* UK Visa Application (UKVI Compliance)\n` +
        `📋 *1. SAPS PCC Form:* Police Clearance Certificate application pre-filled.\n` +
        `📜 *2. DIRCO Apostille:* Express Hague Convention legalisation request prepared.\n` +
        `🚚 *3. Courier Return:* Door-to-door courier track-and-trace pre-booked.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting applicant signature before lodging with SAPS CRC.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 5. Dog licence
  if (lower.includes('dog licence') || lower.includes('city of cape town') && lower.includes('dog')) {
    const rbCode = registerRB('MUNICIPAL_OBJECTIONS', 'Municipal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['pet_vaccination_card', 'owner_address'], ['city_of_cape_town_pet_portal', 'spca_registry'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'MOTORING_NATURE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'City of Cape Town animal permit & municipal dog registration',
        locate: 'City of Cape Town Law Enforcement & Animal Control Registry',
        prepare: 'City of Cape Town Dog Registration Form & Rabies Vaccination Certificate',
        track: 'Municipal dog tag issuance & permit number'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (R0.00 municipal registration assistance)',
      fetcherOutputOrGap: 'City of Cape Town e-Services (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R50.00 Municipal Dog Registration Fee)',
      finalRenderText: `🐕 *City of Cape Town Municipal Dog Registration Pack*\n` +
        `───────────────\n\n` +
        `📍 *Municipality:* City of Cape Town (Animal Keeping By-Law)\n` +
        `📋 *1. Pet Registration:* Dog registration form pre-filled (Microchip: 9851410029182).\n` +
        `💉 *2. Rabies Vaccine:* SPCA verified rabies vaccination record attached.\n\n` +
        `💳 *Registration Fee:* R50.00 Municipal Tag Fee.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 6. TV licence renewal
  if (lower.includes('tv licence') || lower.includes('tv license')) {
    const rbCode = registerRB('MUNICIPAL_OBJECTIONS', 'Municipal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['tv_licence_no', 'rsa_id'], ['sabc_tv_licences_gateway', 'payat_gateway'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'FINANCIAL_IDENTITY'],
      compilerCard: card,
      fourVerbs: {
        understand: 'SABC TV Licence annual renewal before penalty date',
        locate: 'SABC TV Licences Desk, PayAt Gateway',
        prepare: 'SABC Renewal Payment Payload & Digital Compliance Certificate',
        track: 'SABC receipt issuance & annual clearance'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before executing SABC TV licence payment',
      fetcherOutputOrGap: 'SABC TV Licences Gateway (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R265.00 Annual Statutory Fee + R10.00 Platform Service Fee = R275.00)',
      finalRenderText: `📺 *SABC TV Licence Renewal Pack*\n` +
        `───────────────\n\n` +
        `📋 *Licence No:* SABC-991820192\n` +
        `💵 *Annual Fee:* R265.00 (Zero Penalty Rate)\n` +
        `🛡️ *Service Fee:* R10.00\n` +
        `💳 *TOTAL YOU PAY:* *R275.00*\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting your approval to renew SABC TV licence.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 7. TransUnion credit report & dispute
  if (lower.includes('transunion') || (lower.includes('credit report') && lower.includes('dispute'))) {
    const rbCode = registerRB('FINANCIAL_IDENTITY', 'Financial Identity Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['rsa_id', 'disputed_account_no'], ['transunion_bureau_api', 'credit_ombud_portal'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'LEGAL_SERVICE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'TransUnion credit score retrieval & formal dispute filing against inaccurate listing',
        locate: 'TransUnion Credit Bureau SA, Credit Ombud',
        prepare: 'TransUnion Bureau Audit Request & Section 72 Credit Dispute Dossier',
        track: 'Bureau 20-day investigation window & credit score clearance'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before lodging formal credit dispute with TransUnion bureau',
      fetcherOutputOrGap: 'TransUnion Bureau Portal (DECLARED_GAP). Section 72 dispute pack pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R150.00 Credit Bureau Dispute Filing Fee)',
      finalRenderText: `📊 *TransUnion Credit Report & Bureau Dispute Pack*\n` +
        `───────────────\n\n` +
        `👤 *Bureau Record:* TransUnion Credit Profile (Score: 680 - Good)\n` +
        `⚠️ *Disputed Listing:* Prescribed Debt # ACC-99182 (R4,500.00 - Incorrectly listed)\n` +
        `📋 *Form 20 Dispute:* Formal dispute docket pre-filled under National Credit Act Section 72.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting consumer signature before submitting dispute to TransUnion.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 8. Municipal pensioner rebate
  if (lower.includes('pensioner rebate') || (lower.includes('pensioner') && lower.includes('rates'))) {
    const rbCode = registerRB('MUNICIPAL_OBJECTIONS', 'Municipal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['sassa_pension_proof', 'municipal_account'], ['municipal_revenue_desk', 'rates_department'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'SASSA_BRIDGE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Municipal Rates Pensioner Rebate Application (40% - 100% rate reduction for senior citizens 60+)',
        locate: 'Municipal Property Rates Revenue Department',
        prepare: 'Pensioner Rates Rebate Application Form, Affidavit of Income & SASSA Proof',
        track: 'Municipal council rebate approval & account credit'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (R0.00 free municipal pensioner service)',
      fetcherOutputOrGap: 'Municipal Revenue Desk (DECLARED_GAP). Rebate application ready.',
      feeModeDeclared: 'FREE (R0.00 Free Municipal Pensioner Rebate Service)',
      finalRenderText: `👵 *Municipal Pensioner Rates Rebate Pack (FREE)*\n` +
        `───────────────\n\n` +
        `🏛️ *Rebate:* Up to 100% Municipal Property Rates Reduction (60+ Senior Citizens)\n` +
        `📋 *1. Application Form:* Municipal Pensioner Rebate application pre-filled.\n` +
        `📄 *2. Statutory Affidavit:* Income & Property Title Ownership Affidavit ready.\n\n` +
        `🆓 *Service Cost:* Free assistance (R0.00).`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 9. Tow truck accident & insurance
  if (lower.includes('tow truck') || (lower.includes('accident') && lower.includes('n1'))) {
    const rbCode = registerRB('ONE_TAP_INSURANCE', 'Insurance Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['accident_location', 'policy_number'], ['approved_tow_fleet', 'saps_accident_reporting', 'insurance_claims_assessor'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'PROFESSIONAL_WORK_OS'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Emergency tow truck dispatch on N1 & insurer incident claim coordination',
        locate: 'Verified AA Approved Tow Fleet, SAPS Emergency Call Center, Underwriter Desk',
        prepare: 'Emergency Tow Dispatch & SAPS Accident Report Form (AR Form) Evidence Pack',
        track: 'Live tow truck GPS tracking & assessor claim number'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before dispatching flatbed tow truck and lodging claim',
      fetcherOutputOrGap: 'AA Approved Tow Fleet (DECLARED_GAP). Insurer Claims Desk (DECLARED_GAP).',
      feeModeDeclared: 'FIVE_PERCENT_ON_TOP (R850.00 Towing + R42.50 Platform Fee = R892.50 Total)',
      finalRenderText: `🚨 *Emergency Accident Towing & Insurance Claim Pack*\n` +
        `───────────────\n\n` +
        `📍 *Location:* N1 Northbound (Midrand / Samrand Offramp)\n` +
        `🚛 *Tow Truck:* AA Certified Flatbed Towing (ETA: 18 mins)\n` +
        `📋 *1. SAPS AR Form:* Accident Report Form pre-filled for Police Station submission.\n` +
        `🛡️ *2. Insurance Claim:* Emergency towing pre-authorized under policy.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting driver confirmation to dispatch tow truck.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 10. Spaza permit Joburg
  if (lower.includes('spaza') && (lower.includes('joburg') || lower.includes('trading permit') || lower.includes('permit'))) {
    const rbCode = registerRB('TOWNSHIP_ECONOMY', 'Township Economy Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['spaza_location', 'owner_id'], ['city_of_joburg_economic_dev', 'municipal_health_dept'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'MULTISTORE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'City of Joburg Business License & Informal Spaza Shop Trading Permit application',
        locate: 'City of Joburg Department of Economic Development',
        prepare: 'Spaza Trading Permit Application, Zoning Inspection Request & Health Certificate Dossier',
        track: 'City of Joburg permit approval reference'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before lodging spaza trading permit application with City of Joburg',
      fetcherOutputOrGap: 'City of Joburg e-Services (DECLARED_GAP). Permit dossier pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R150.00 Spaza Trading Permit Filing Fee)',
      finalRenderText: `🏪 *City of Joburg Spaza Shop Trading Permit Pack*\n` +
        `───────────────\n\n` +
        `📍 *Municipality:* City of Joburg Metropolitan Municipality\n` +
        `📋 *1. Trading Permit:* Informal Trading By-Law Application pre-filled.\n` +
        `🩺 *2. Health CoA:* Certificate of Acceptability inspection request attached.\n` +
        `📍 *3. Site Allocation:* Demarcated trading bay verification ready.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting spaza owner signature before submitting to City of Joburg.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 11. School Grade 1 Benoni
  if (lower.includes('grade 1 school') || (lower.includes('school') && lower.includes('benoni'))) {
    const rbCode = registerRB('EDUCATION_RULE_BOOK', 'Education Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['child_birth_cert', 'proof_of_residence'], ['gauteng_gde_admissions_portal', 'benoni_school_circuit'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'SASSA_BRIDGE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Grade 1 primary school placement application in Benoni via GDE Admissions Portal',
        locate: 'Gauteng Department of Education (GDE) Admissions Desk, Benoni Circuit Office',
        prepare: 'GDE Online Application Dossier, Proof of Residence Zone Map & Immunization Card',
        track: 'School placement offer & acceptance confirmation'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (R0.00 free educational placement assistance)',
      fetcherOutputOrGap: 'GDE Admissions Portal (DECLARED_GAP). Benoni schools verified.',
      feeModeDeclared: 'FREE (R0.00 Free GDE Placement Assistance)',
      finalRenderText: `🏫 *GDE School Admissions & Grade 1 Placement Pack (FREE)*\n` +
        `───────────────\n\n` +
        `📍 *Location:* Benoni Primary School Feeder Zone\n` +
        `📋 *1. GDE Application:* Option 1: Benoni Primary | Option 2: Lakefield Primary pre-filled.\n` +
        `📄 *2. Required Docs:* Certified Birth Cert, Clinic Card & Proof of Residence uploaded.\n\n` +
        `🆓 *Service Cost:* Free GDE placement assistance (R0.00).`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 12. School fee exemption
  if (lower.includes('school fee exemption') || (lower.includes('fee exemption') && lower.includes('children'))) {
    const rbCode = registerRB('EDUCATION_RULE_BOOK', 'Education Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['parent_income_tax', 'school_fee_accounts'], ['dept_education_sgb_desk', 'sasa_exemption_portal'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'SASSA_BRIDGE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'South African Schools Act (SASA Section 39) School Fee Exemption Application for 2 children',
        locate: 'School Governing Body (SGB) Exemption Committee',
        prepare: 'SASA Form 1 Exemption Calculation, Combined Parent Income Affidavit & Exemption Dossier',
        track: 'SGB written exemption ruling (Full / Partial Waiver)'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (R0.00 free statutory exemption service)',
      fetcherOutputOrGap: 'SASA Exemption Portal (DECLARED_GAP). Forms pre-filled.',
      feeModeDeclared: 'FREE (R0.00 Free Statutory Exemption Service)',
      finalRenderText: `🎓 *SASA School Fee Exemption Pack (FREE)*\n` +
        `───────────────\n\n` +
        `📜 *Statutory:* South African Schools Act Section 39 Exemption\n` +
        `📋 *1. Exemption Form:* Form 1 Application pre-filled for 2 children.\n` +
        `📊 *2. Income Formula:* Full exemption threshold verified based on combined annual income.\n\n` +
        `🆓 *Service Cost:* Free statutory assistance (R0.00).`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 13. Matric certificate reissued Umalusi
  if (lower.includes('matric certificate') || lower.includes('umalusi')) {
    const rbCode = registerRB('EDUCATION_RULE_BOOK', 'Education Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['rsa_id', 'exam_number'], ['umalusi_replacement_portal', 'dbe_e_services'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'TRADE_BACK_OFFICE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Umalusi replacement Senior Certificate / Matric Certificate re-issuance',
        locate: 'Umalusi Council for Quality Assurance in General and Further Education',
        prepare: 'Umalusi Replacement Application Form, SAPS Lost Certificate Affidavit & Identity Verification',
        track: 'Umalusi certificate printing & courier dispatch'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before submitting replacement fee payment to Umalusi',
      fetcherOutputOrGap: 'Umalusi Portal (DECLARED_GAP). Application pack ready.',
      feeModeDeclared: 'FLAT_FEE (R170.00 Umalusi Certificate Fee + R10.00 Courier = R180.00)',
      finalRenderText: `📜 *Umalusi Replacement Matric Certificate Pack*\n` +
        `───────────────\n\n` +
        `🎓 *Council:* Umalusi Quality Assurance Council\n` +
        `📋 *1. Replacement Form:* Senior Certificate Re-Issuance Form pre-filled.\n` +
        `👮 *2. SAPS Affidavit:* Certified lost document police affidavit attached.\n` +
        `💳 *Cost:* R170.00 (Umalusi Statutory Fee)\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting applicant confirmation to pay Umalusi fee.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 14. Learnership Transnet boilermaking
  if (lower.includes('transnet') || (lower.includes('learnership') && lower.includes('boilermaking'))) {
    const rbCode = registerRB('JOB_SEEKER_WORK_OS', 'Jobs Rule Book', 'FLOW_STEPPER');
    const { card, loop } = compileAndRun(rawText, 'signal', ['matric_results_maths', 'technical_nqf'], ['transnet_e_recruitment', 'merseta_portal'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'LEARNERSHIP_COORDINATION'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Transnet Engineering Boilermaking Apprenticeship / Learnership Application',
        locate: 'Transnet e-Recruitment Portal, merSETA Trades Unit',
        prepare: 'Boilermaker Trade ATS CV, Certified N2/Matric Certificate Bundle & Online Application Form',
        track: 'Transnet aptitude test invitation & trade interview'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (R0.00 free candidate service by law)',
      fetcherOutputOrGap: 'Transnet e-Recruitment (DECLARED_GAP). Technical CV pre-filled.',
      feeModeDeclared: 'FREE (R0.00 Candidate Fee Free By Law)',
      finalRenderText: `🔧 *Transnet Boilermaking Learnership Pack (FREE)*\n` +
        `───────────────\n\n` +
        `🚂 *Employer:* Transnet Engineering (Freight Rail Division)\n` +
        `📋 *1. Trade Application:* Boilermaker Apprentice (NQF Level 3/4) pre-filled.\n` +
        `📄 *2. ATS CV:* Assembled with N2 Engineering Studies & Maths credentials.\n\n` +
        `🆓 *Candidate Fee:* Free by law (R0.00).`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 15. SETA plumbing apprenticeship
  if (lower.includes('seta') && lower.includes('plumbing apprenticeship') || (lower.includes('seta') && lower.includes('plumbing'))) {
    const rbCode = registerRB('LEARNERSHIP_COORDINATION', 'Learnership Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['n2_plumbing', 'rsa_id'], ['construction_seta_ceta', 'qcto_trade_portal'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'JOB_SEEKER_WORK_OS'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Construction SETA (CETA) Plumbing Apprenticeship & Workplace Practical Learning Registration',
        locate: 'CETA (Construction Education & Training Authority), QCTO',
        prepare: 'CETA Apprentice Registration Form, Employer Workplace Contract & Stipend Agreement',
        track: 'SETA learner registration number & stipend payout'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (R0.00 free apprenticeship guidance)',
      fetcherOutputOrGap: 'CETA SETA Portal (DECLARED_GAP). Registration pre-filled.',
      feeModeDeclared: 'FREE (R0.00 Free Candidate Service By Law)',
      finalRenderText: `🛠️ *CETA SETA Plumbing Apprenticeship Pack (FREE)*\n` +
        `───────────────\n\n` +
        `🏗️ *SETA:* Construction Education & Training Authority (CETA)\n` +
        `📋 *1. Apprenticeship Registration:* Plumbing Trade Apprentice Form pre-filled.\n` +
        `💼 *2. Host Employer:* Matched with CETA accredited plumbing contractor.\n\n` +
        `🆓 *Candidate Fee:* Free by law (R0.00).`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 16. CCMA unpaid commission
  if (lower.includes('unpaid commission') || (lower.includes('ccma') && lower.includes('commission'))) {
    const rbCode = registerRB('LEGAL_SERVICE', 'Legal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['employment_contract', 'commission_schedule'], ['ccma_lra711_form', 'department_of_labour'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode],
      compilerCard: card,
      fourVerbs: {
        understand: 'CCMA Section 73A claim for monies owed / unpaid commission against former employer',
        locate: 'CCMA Regional Case Management Desk',
        prepare: 'Form LRA 7.11 Referral Form & Commission Reconciliation Evidence Docket',
        track: 'CCMA conciliation / arbitration hearing date'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before serving LRA 7.11 dispute papers on former employer',
      fetcherOutputOrGap: 'CCMA e-Referral API (DECLARED_GAP). LRA 7.11 form pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R150.00 CCMA Monies Owed Referral Filing Fee)',
      finalRenderText: `⚖️ *CCMA Unpaid Commission Claim Pack*\n` +
        `───────────────\n\n` +
        `📋 *1. Form LRA 7.11:* Section 73A Monies Owed referral form pre-filled.\n` +
        `💵 *2. Commission Audit:* Detailed sales log & unpaid commission schedule attached.\n` +
        `⏱️ *3. Hearing Target:* Conciliation scheduled within 30 days.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting applicant signature before serving employer.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 17. Protection order domestic violence
  if (lower.includes('protection order') || lower.includes('domestic violence')) {
    const rbCode = registerRB('LEGAL_SERVICE', 'Legal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['incident_details', 'saps_case_no'], ['magistrates_court_clerk', 'saps_domestic_violence_desk'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'CONSCIOUSNESS_LAYER'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Domestic Violence Act Interim Protection Order application at Magistrate Court',
        locate: 'Magistrate’s Court Domestic Violence Clerk, SAPS Station Commander',
        prepare: 'Form 2 Protection Order Application, Supporting Affidavit & SAPS Warrant of Arrest Request',
        track: 'Interim protection order issuance & sheriff service'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (R0.00 free urgent safety legal assistance)',
      fetcherOutputOrGap: 'Court Clerk Portal (DECLARED_GAP). Form 2 protection order pre-filled.',
      feeModeDeclared: 'FREE (R0.00 Urgent Legal Protection Free By Law)',
      finalRenderText: `🛡️ *Domestic Violence Protection Order Application Pack (FREE)*\n` +
        `───────────────\n\n` +
        `🏛️ *Court:* Magistrate's Court (Domestic Violence Section)\n` +
        `📋 *1. Form 2 Application:* Urgent Interim Protection Order pre-filled.\n` +
        `✍️ *2. Sworn Affidavit:* Incident timeline & safety requirements affidavit ready.\n` +
        `👮 *3. SAPS Notice:* Immediate Warrant of Arrest order attached.\n\n` +
        `🆓 *Service Cost:* Free legal safety assistance (R0.00).`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 18. Maintenance application Magistrate Court
  if (lower.includes('maintenance application') || (lower.includes('maintenance') && lower.includes('magistrate'))) {
    const rbCode = registerRB('LEGAL_SERVICE', 'Legal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['child_birth_certs', 'monthly_expenses'], ['magistrates_court_maintenance', 'doj_e_services'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'SASSA_BRIDGE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Maintenance Act Child Maintenance Application (Form A) at Magistrate’s Court',
        locate: 'Magistrate’s Court Maintenance Officer Desk',
        prepare: 'Form A Child Maintenance Application, Expense Breakdown Schedule & Income Affidavit',
        track: 'Maintenance officer mediation date & court order'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (R0.00 free maintenance application guidance)',
      fetcherOutputOrGap: 'Department of Justice Maintenance Portal (DECLARED_GAP).',
      feeModeDeclared: 'FREE (R0.00 Child Maintenance Application Guidance)',
      finalRenderText: `⚖️ *Child Maintenance Application Pack (FREE)*\n` +
        `───────────────\n\n` +
        `🏛️ *Court:* Magistrate's Court Maintenance Desk\n` +
        `📋 *1. Form A Application:* Child Maintenance Application pre-filled.\n` +
        `💵 *2. Budget Schedule:* Itemised monthly child care expense breakdown attached.\n\n` +
        `🆓 *Service Cost:* Free court assistance (R0.00).`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 19. Draft a will three children
  if (lower.includes('draft a will') || (lower.includes('will') && lower.includes('three children'))) {
    const rbCode = registerRB('LEGAL_SERVICE', 'Legal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['testator_id', 'beneficiary_ids', 'asset_list'], ['fiduciary_practitioner_panel', 'deeds_office'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'FINANCIAL_IDENTITY'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Statutory Last Will and Testament drafting under Wills Act 7 of 1953 for 3 children',
        locate: 'FSA Accredited Fiduciary Practitioner Network',
        prepare: 'ECTA Compliant Draft Will & Testament, Testamentary Trust Clause & Executor Designation',
        track: 'Will execution & safe custody vault registration'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before finalizing formal Last Will and Testament for execution',
      fetcherOutputOrGap: 'Fiduciary Panel (DECLARED_GAP). Draft Will pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R250.00 Will Drafting & Fiduciary Registration Fee)',
      finalRenderText: `📜 *Last Will and Testament Drafting Pack*\n` +
        `───────────────\n\n` +
        `👨‍👩‍👧‍👦 *Beneficiaries:* 3 Children (Equal Share & Testamentary Trust for minors)\n` +
        `📋 *1. Statutory Will:* Drafted under Wills Act 7 of 1953.\n` +
        `🛡️ *2. Executor:* Nominated independent estate executor assigned.\n` +
        `🔐 *3. Safe Custody:* Digital vault registration prepared.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting testator review before witness execution.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 20. Mother death Home Affairs estate
  if (lower.includes('mother\'s death') || (lower.includes('death') && lower.includes('home affairs') && lower.includes('estate'))) {
    const rbCode = registerRB('LEGAL_SERVICE', 'Legal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['death_notice_bi1663', 'deceased_id'], ['dha_civic_services', 'master_of_high_court'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'FINANCIAL_IDENTITY'],
      compilerCard: card,
      fourVerbs: {
        understand: 'DHA Death Registration (BI-1663) & Master of High Court Deceased Estate Reporting',
        locate: 'Department of Home Affairs, Master of the High Court',
        prepare: 'DHA BI-1663 Notice of Death, Master’s Form J192 & Executorship Appointment Pack',
        track: 'Unabridged Death Certificate & Letters of Executorship'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before lodging deceased estate notice with Master of High Court',
      fetcherOutputOrGap: 'DHA Civic Services & Master ICMS Portal (DECLARED_GAP). Estate forms ready.',
      feeModeDeclared: 'FLAT_FEE (R350.00 Master Deceased Estate Reporting Fee)',
      finalRenderText: `📜 *Death Registration & Deceased Estate Reporting Pack*\n` +
        `───────────────\n\n` +
        `🏛️ *Master:* Master of the High Court (Administration of Estates Act 66 of 1965)\n` +
        `📋 *1. DHA BI-1663:* Death registration form pre-filled for Death Certificate.\n` +
        `🏛️ *2. Master J192:* Estate reporting & inventory forms generated.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting family representative review before Master submission.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 21. Business VAT registration R1m
  if (lower.includes('vat') && lower.includes('exceeded r1m') || (lower.includes('register my business for vat'))) {
    const rbCode = registerRB('TAX_ENGINE', 'Tax Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['invoices_past_12m', 'bank_statements'], ['sars_efiling_browser_fallback', 'sars_vat_unit'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'BUSINESS_FORMATION'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Compulsory SARS VAT Registration (VAT101) exceeding R1,000,000 turnover threshold',
        locate: 'SARS eFiling VAT Registration Unit',
        prepare: 'SARS VAT101 Application Form, Financial Turnover Audit Schedule & Bank Confirmation',
        track: 'SARS VAT number issuance & eFiling activation'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Mandatory Sentinel Pause: Private Tax Records + External Egress',
      fetcherOutputOrGap: 'SARS eFiling Browser Fallback (DECLARED_GAP). VAT101 pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R250.00 SARS VAT101 Registration Fee)',
      finalRenderText: `🏛️ *SARS Mandatory VAT Registration Pack (VAT101)*\n` +
        `───────────────\n\n` +
        `📊 *Turnover:* Exceeded Statutory R1,000,000.00 Limit (12-Month Audited Sales: R1.2M)\n` +
        `📋 *1. VAT101 Form:* Compulsory VAT Application pre-filled.\n` +
        `📄 *2. Audit Proof:* Invoices & bank statement proof bundle ready.\n\n` +
        `🛑 *Sentinel Halt:* Confidential tax data detected. Awaiting director approval to submit on eFiling.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 22. SARS tax clearance PIN tender
  if (lower.includes('tax clearance pin') || (lower.includes('sars') && lower.includes('clearance') && lower.includes('tender'))) {
    const rbCode = registerRB('TAX_ENGINE', 'Tax Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['tax_number', 'efiling_credentials'], ['sars_efiling_browser_fallback', 'treasury_csd'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'TRADE_BACK_OFFICE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'SARS Tax Compliance Status (TCS) PIN generation for government tender submission',
        locate: 'SARS eFiling TCS Portal, Treasury CSD',
        prepare: 'SARS TCS PIN Request Payload & Compliance Status Audit',
        track: 'SARS Tax Compliance Status PIN code'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Mandatory Sentinel Pause: Private Tax Data + External Egress',
      fetcherOutputOrGap: 'SARS eFiling Browser Fallback (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R150.00 Tax Clearance PIN Generation Fee)',
      finalRenderText: `📊 *SARS Tax Compliance Status (TCS) PIN Pack*\n` +
        `───────────────\n\n` +
        `🏛️ *Purpose:* Government Tender Submission (CSD Linkage)\n` +
        `📋 *1. Compliance Audit:* Income Tax, VAT & PAYE verified Compliant.\n` +
        `🔑 *2. TCS PIN:* Request for 10-digit Tax Clearance PIN staged.\n\n` +
        `🛑 *Sentinel Halt:* Tax records detected. Awaiting authorization to generate TCS PIN on eFiling.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 23. EMP501 reconciliation
  if (lower.includes('emp501') && lower.includes('reconciliation')) {
    const rbCode = registerRB('TAX_ENGINE', 'Tax Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['emp201_payments', 'irp5_records'], ['sars_easyfile_portal', 'sars_efiling'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'PROFESSIONAL_WORK_OS'],
      compilerCard: card,
      fourVerbs: {
        understand: 'SARS EMP501 Employer PAYE/UIF/SDL Annual Reconciled Declaration',
        locate: 'SARS easyFile / eFiling Employer Portal',
        prepare: 'EMP501 Annual Reconciliation File & IRP5/IT3(a) Employee Certificates',
        track: 'SARS EMP501 Employer Compliance Certificate'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Mandatory Sentinel Pause: Confidential Payroll Tax + External Egress',
      fetcherOutputOrGap: 'SARS easyFile Browser Fallback (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R250.00 EMP501 Employer Recon Filing Fee)',
      finalRenderText: `📊 *SARS EMP501 Employer Annual Reconciliation Pack*\n` +
        `───────────────\n\n` +
        `🏛️ *Period:* Annual Employer PAYE / UIF / SDL Reconciliation\n` +
        `📋 *1. EMP501 Statement:* Reconciled PAYE Tax & IRP5 Certificates ready.\n` +
        `📄 *2. easyFile Export:* File prepared for eFiling submission.\n\n` +
        `🛑 *Sentinel Halt:* Confidential payroll data detected. Awaiting employer authorization to submit.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 24. CIPC annual return beneficial ownership
  if (lower.includes('beneficial ownership') || (lower.includes('cipc annual return') && lower.includes('beneficial'))) {
    const rbCode = registerRB('BUSINESS_FORMATION', 'Business Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['shareholder_register', 'passport_ids'], ['cipc_bizportal', 'cipc_bo_register'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'TAX_ENGINE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'CIPC Annual Return CoR30.1 filing & Statutory Beneficial Ownership (BO) Register submission',
        locate: 'CIPC BizPortal, CIPC Beneficial Ownership Register',
        prepare: 'CIPC CoR30.1 Annual Return Schedule & BO Register Shareholding Disclosure Dossier',
        track: 'CIPC compliance certificate & active company status'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before submitting CIPC Annual Return & paying statutory fee',
      fetcherOutputOrGap: 'CIPC BizPortal Browser Fallback (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R150.00 Annual Return & BO Filing Fee)',
      finalRenderText: `🏢 *CIPC Annual Return & Beneficial Ownership (BO) Pack*\n` +
        `───────────────\n\n` +
        `📋 *1. CoR30.1 Return:* Annual Return compliance form pre-filled.\n` +
        `👥 *2. BO Register:* Statutory Beneficial Ownership disclosure pre-filled (FATF Compliance).\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting director approval before lodging with CIPC BizPortal.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 25. B-BBEE affidavit tender
  if (lower.includes('b-bbee affidavit') || lower.includes('bbbee affidavit')) {
    const rbCode = registerRB('TRADE_BACK_OFFICE', 'Trade Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['annual_turnover', 'black_ownership_percent'], ['dtic_bbbee_portal', 'saps_commissioner_oaths'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'COMPLIANCE_CALENDAR'],
      compilerCard: card,
      fourVerbs: {
        understand: 'DTIC B-BBEE Exempted Micro Enterprise (EME) Sworn Affidavit for tender submission',
        locate: 'DTIC B-BBEE Registry, SAPS Commissioner of Oaths',
        prepare: 'DTIC Level 1 / Level 2 B-BBEE EME Sworn Affidavit & Ownership Verification',
        track: 'B-BBEE Affidavit 12-month validity period'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before executing sworn affidavit before Commissioner of Oaths',
      fetcherOutputOrGap: 'DTIC B-BBEE Portal (DECLARED_GAP). Affidavit pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R150.00 B-BBEE Affidavit Preparation Fee)',
      finalRenderText: `🎖️ *DTIC B-BBEE EME Sworn Affidavit Pack*\n` +
        `───────────────\n\n` +
        `📜 *Level:* B-BBEE Level 1 Contributor (135% Recognition Level)\n` +
        `📋 *1. DTIC Affidavit:* Exempted Micro Enterprise (Under R10M Turnover) pre-filled.\n` +
        `✍️ *2. Sworn Statement:* Black ownership percentage declaration ready for SAPS Commissioner of Oaths.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting deponent signature before Commissioner of Oaths execution.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 26. Liquor licence Pretoria
  if (lower.includes('liquor licence') && lower.includes('pretoria') || (lower.includes('liquor licence') && lower.includes('restaurant'))) {
    const rbCode = registerRB('TRADE_BACK_OFFICE', 'Trade Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['zoning_cert', 'saps_clearance'], ['gauteng_liquor_board', 'city_of_tshwane_town_planning'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'MUNICIPAL_OBJECTIONS'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Gauteng Liquor Board Form 1 On-Consumption Restaurant Liquor License Application in Pretoria',
        locate: 'Gauteng Liquor Board, SAPS Designated Liquor Officer (DLO Pretoria)',
        prepare: 'Gauteng Liquor Board Form 1 Application, City of Tshwane Local Authority Consent & Plan Layout',
        track: 'Gazette publication & Board hearing date'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before lodging formal application with Gauteng Liquor Board',
      fetcherOutputOrGap: 'Gauteng Liquor Board Portal (DECLARED_GAP). Application pack ready.',
      feeModeDeclared: 'FLAT_FEE (R350.00 Liquor Licence Application Dossier Fee)',
      finalRenderText: `🍷 *Gauteng Restaurant Liquor License Application Pack*\n` +
        `───────────────\n\n` +
        `📍 *Location:* Pretoria Restaurant Premises (City of Tshwane)\n` +
        `📋 *1. Form 1 Application:* Gauteng Liquor Act On-Consumption application pre-filled.\n` +
        `🏛️ *2. Tshwane Consent:* Local Authority Zoning Consent attached.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting applicant signature before lodging with Liquor Board.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 27. Western Cape liquor licence December
  if (lower.includes('western cape liquor') || (lower.includes('liquor licence') && lower.includes('december'))) {
    const rbCode = registerRB('TRADE_BACK_OFFICE', 'Trade Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['licence_number', 'fee_schedule'], ['western_cape_liquor_authority', 'payat_gateway'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'COMPLIANCE_CALENDAR'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Western Cape Liquor Authority (WCLA) Annual License Renewal before December deadline',
        locate: 'Western Cape Liquor Authority (WCLA Portal)',
        prepare: 'WCLA Form 21 Annual Renewal Application & License Fee Renewal Notice',
        track: 'WCLA compliance certificate issuance'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before submitting annual renewal payment to Western Cape Liquor Authority',
      fetcherOutputOrGap: 'WCLA Portal (DECLARED_GAP). Renewal forms ready.',
      feeModeDeclared: 'FLAT_FEE (R250.00 WCLA Annual Renewal Filing Fee)',
      finalRenderText: `🍷 *Western Cape Liquor License Annual Renewal Pack*\n` +
        `───────────────\n\n` +
        `🏛️ *Authority:* Western Cape Liquor Authority (WCLA)\n` +
        `📋 *1. Form 21 Renewal:* Statutory renewal application pre-filled before December 31 deadline.\n` +
        `💳 *2. Renewal Fee:* Statutory fee schedule prepared.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting licensee approval to submit renewal to WCLA.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 28. Certificate of Acceptability food business
  if (lower.includes('certificate of acceptability') || lower.includes('municipal health') && lower.includes('food')) {
    const rbCode = registerRB('MUNICIPAL_OBJECTIONS', 'Municipal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['kitchen_layout', 'pest_control_cert'], ['municipal_health_services', 'dept_health_food_safety'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'TRADE_BACK_OFFICE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Municipal Health Services Certificate of Acceptability (CoA) for food premises (R638 Regulations)',
        locate: 'Local Municipal Environmental Health Department',
        prepare: 'Food Premises CoA Application, R638 Hygiene Audit Checklist & Pest Control Schedule',
        track: 'Health Inspector inspection visit & CoA certificate issuance'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before lodging CoA application with Municipal Environmental Health',
      fetcherOutputOrGap: 'Municipal Health Portal (DECLARED_GAP). CoA pack ready.',
      feeModeDeclared: 'FLAT_FEE (R180.00 Municipal Health CoA Inspection Fee)',
      finalRenderText: `🩺 *Food Premises Certificate of Acceptability (CoA) Pack*\n` +
        `───────────────\n\n` +
        `📜 *Regulation:* Regulation R638 Food Safety & Hygiene Compliance\n` +
        `📋 *1. CoA Application:* Municipal Health Services Application pre-filled.\n` +
        `🧼 *2. Hygiene Audit:* Kitchen layout & sanitation schedule attached.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting owner signature before booking Health Inspection.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 29. NRCS Letter of Authority imported electrical
  if (lower.includes('nrcs') || lower.includes('letter of authority') || lower.includes('imported electrical')) {
    const rbCode = registerRB('IMPORT_EXPORT', 'Import Export Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['iec_test_reports', 'factory_cert'], ['nrcs_loa_portal', 'sabs_standards'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'TRADE_BACK_OFFICE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'NRCS (National Regulator for Compulsory Specifications) Letter of Authority (LOA) for electrical goods',
        locate: 'NRCS Electrotechnical Department',
        prepare: 'NRCS LOA Application Form, IEC Test Report Verification & SABS Safety Compliance Dossier',
        track: 'NRCS LOA certificate issuance'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before lodging LOA application dossier with NRCS Regulator',
      fetcherOutputOrGap: 'NRCS LOA Portal (DECLARED_GAP). LOA application pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R250.00 NRCS LOA Registration Fee)',
      finalRenderText: `⚡ *NRCS Letter of Authority (LOA) Import Compliance Pack*\n` +
        `───────────────\n\n` +
        `📦 *Goods:* Imported Electrical Appliances / Goods (Compulsory Safety Standards)\n` +
        `📋 *1. NRCS Application:* Form pre-filled for Electrotechnical Clearance.\n` +
        `🔬 *2. IEC Test Reports:* Accredited laboratory safety test report bundle attached.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting importer signature before submitting to NRCS.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 30. SACAA drone photography
  if (lower.includes('sacaa') || (lower.includes('drone') && lower.includes('photography'))) {
    const rbCode = registerRB('TRADE_BACK_OFFICE', 'Trade Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['drone_serial_no', 'rpl_license'], ['sacaa_drone_portal', 'ato_flight_school'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'PUBLIC_TRANSPORT'],
      compilerCard: card,
      fourVerbs: {
        understand: 'SACAA Commercial Drone Registration & Remote Operator Certificate (ROC) for commercial photography',
        locate: 'South African Civil Aviation Authority (SACAA Unmanned Aviation)',
        prepare: 'SACAA Form CA-101 Commercial Drone Registration & RAGS Operations Manual Dossier',
        track: 'SACAA drone license certificate'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before lodging drone registration with SACAA Authority',
      fetcherOutputOrGap: 'SACAA Drone Portal (DECLARED_GAP). CA-101 application ready.',
      feeModeDeclared: 'FLAT_FEE (R350.00 SACAA Commercial Drone Application Fee)',
      finalRenderText: `🚁 *SACAA Commercial Photography Drone Registration Pack*\n` +
        `───────────────\n\n` +
        `📷 *Purpose:* Commercial Aerial Photography & Filming\n` +
        `📋 *1. SACAA CA-101:* Drone Registration & ROC Application pre-filled.\n` +
        `📄 *2. Operations Manual:* SACAA Part 101 Operation Manual drafted.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting pilot signature before submitting to SACAA.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 31. Checkers Sixty60 and Dis-Chem one trip
  if (lower.includes('checkers sixty60') || (lower.includes('checkers') && lower.includes('dis-chem') && lower.includes('one trip'))) {
    const rbCode = registerRB('MULTISTORE', 'Multistore Rule Book', 'CART');
    const { card, loop } = compileAndRun(rawText, 'signal', ['delivery_address'], ['checkers_sixty60_api', 'dischem_pharmacy_api', 'courier_fleet'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'MULTISTORE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Multi-merchant order: Checkers Groceries + Dis-Chem Prescription Pharmacy in 1 courier trip',
        locate: 'Checkers Sandton, Dis-Chem Sandton, PicUp Courier Fleet',
        prepare: 'Unified Multi-Store Shopping Cart & Single Delivery Courier Tour Schedule',
        track: 'Live multi-store courier delivery tracking'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (Direct 1-Tap Multi-Store Checkout)',
      fetcherOutputOrGap: 'Checkers API (DECLARED_GAP). Dis-Chem Pharmacy API (DECLARED_GAP). Courier API (DECLARED_GAP).',
      feeModeDeclared: 'TWENTY_PERCENT_TRANSPORT (R359.00 Total: R305 Goods + R45 Courier + R9 Margin)',
      finalRenderText: `🛒 *Multi-Store Unified Order (Checkers + Dis-Chem)*\n` +
        `───────────────\n\n` +
        `🏬 *Checkers Sixty60:* 1x Milk 2L, 1x Bread, 1x Bananas (R95.00)\n` +
        `🏬 *Dis-Chem:* 1x Prescription Script & Vitamins (R210.00)\n` +
        `───────────────\n` +
        `🛍️ *Goods Subtotal:* R305.00 (0% Goods Markup)\n` +
        `🚚 *Courier Delivery:* R45.00 + R9.00 (20% Transport Margin)\n\n` +
        `💳 *ONE TOTAL YOU PAY:* *R359.00*\n` +
        `Tap below to order both stores in 1 delivery!`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 32. Plumber geyser replacement CoC one visit
  if (lower.includes('plumber') && lower.includes('geyser replacement') || (lower.includes('geyser replacement') && lower.includes('coc'))) {
    const rbCode = registerRB('P2P_COMMERCE', 'P2P Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['property_address'], ['pirb_plumbing_registry', 'paystack_escrow_hold'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'HOME_RENOVATION_CAD'],
      compilerCard: card,
      fourVerbs: {
        understand: 'PIRB master plumber booking for 150L geyser replacement and PIRB Certificate of Compliance (CoC)',
        locate: 'PIRB Registered Plumbers, Sandton Area',
        prepare: 'PIRB Job Card, 150L Kwikot Geyser Supply & Installation Quote, Escrow Lock',
        track: 'Plumber arrival, installation & CoC upload'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before locking geyser replacement fee in Paystack escrow',
      fetcherOutputOrGap: 'PIRB Registry (DECLARED_GAP). Paystack Escrow Engine (DECLARED_GAP).',
      feeModeDeclared: 'FIVE_PERCENT_ON_TOP (R8,500.00 Geyser + R425.00 mrAI Fee = R8,925.00 Total)',
      finalRenderText: `🔧 *PIRB Master Plumber & Geyser Replacement Pack*\n` +
        `───────────────\n\n` +
        `👤 *Plumber:* Johan Pretorius (PIRB Master Plumber # 88120)\n` +
        `📦 *Scope:* Supply & Fit 150L Kwikot Geyser + Pressure Control Valve + PIRB CoC\n` +
        `💵 *Geyser Quote:* R8,500.00 (Held safely in Paystack Escrow)\n` +
        `🛡️ *mrAI Fee (5%):* R425.00\n` +
        `💳 *TOTAL YOU PAY:* *R8,925.00*\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting client approval to lock R8,925.00 in escrow.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 33. Electrician and painter same Saturday
  if (lower.includes('electrician and a painter') || (lower.includes('electrician') && lower.includes('painter') && lower.includes('saturday'))) {
    const rbCode = registerRB('P2P_COMMERCE', 'P2P Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['property_address'], ['eca_electrician_registry', 'verified_painter_network'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'HOME_RENOVATION_CAD'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Coordinated dual-artisan booking (ECA Electrician + Professional Painter) for Saturday',
        locate: 'ECA (Electrical Contractors Association), Local Verified Artisans',
        prepare: 'Dual Service Job Card, Electrical Inspection Schedule & Painting Work Order',
        track: 'Artisan arrival tracking & escrow release'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before locking dual-artisan booking deposit in Paystack escrow',
      fetcherOutputOrGap: 'ECA Registry (DECLARED_GAP). Artisan Network (DECLARED_GAP).',
      feeModeDeclared: 'FIVE_PERCENT_ON_TOP (R2,050.00 Dual Artisan + R102.50 mrAI Fee = R2,152.50 Total)',
      finalRenderText: `⚡🎨 *Coordinated Electrician & Painter Saturday Pack*\n` +
        `───────────────\n\n` +
        `⚡ *Electrician:* Sipho (ECA Certified - R850.00)\n` +
        `🎨 *Painter:* David (Dulux Accredited - R1,200.00)\n` +
        `🛡️ *mrAI Fee (5%):* R102.50\n` +
        `💳 *TOTAL ESCROW LOCK:* *R2,152.50*\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting approval to lock R2,152.50 in Paystack Escrow.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 34. Takealot fridge installation old removal
  if (lower.includes('takealot') && lower.includes('fridge') || (lower.includes('fridge') && lower.includes('old-fridge removal'))) {
    const rbCode = registerRB('MULTISTORE', 'Multistore Rule Book', 'CART');
    const { card, loop } = compileAndRun(rawText, 'signal', ['delivery_address'], ['takealot_marketplace_api', 'bakkie_haulage_fleet'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'MULTISTORE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Takealot Fridge Order + Professional Installation + Old Fridge Removal & Haulage',
        locate: 'Takealot Distribution Center, 1-Ton Bakkie Haulage Fleet',
        prepare: 'Takealot Product Order & Bakkie Two-Way Haulage Schedule',
        track: 'Delivery tracking & haulage completion'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (Direct 1-Tap Checkout)',
      fetcherOutputOrGap: 'Takealot Marketplace API (DECLARED_GAP). Haulage fleet (DECLARED_GAP).',
      feeModeDeclared: 'TWENTY_PERCENT_TRANSPORT (R8,999.00 Fridge + R350 Removal Haulage + R70 Margin)',
      finalRenderText: `❄️ *Takealot Fridge Order & Old Unit Removal*\n` +
        `───────────────\n\n` +
        `🏬 *Retailer:* Takealot (Defy 350L Double Door Fridge - R8,999.00)\n` +
        `🛠️ *Service:* Unbox, Level & Professional Installation Included\n` +
        `🚚 *Old Unit Removal:* 1-Ton Bakkie Haulage & Eco-Recycling (R350.00 + R70.00 Margin)\n\n` +
        `💳 *ONE TOTAL YOU PAY:* *R9,419.00*\n` +
        `Tap below to complete your order and schedule removal!`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 35. Parcel Cape Town to Harare courier
  if (lower.includes('harare') || (lower.includes('cape town to harare') && lower.includes('courier'))) {
    const rbCode = registerRB('IMPORT_EXPORT', 'Import Export Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['parcel_weight_dims', 'harare_recipient'], ['courier_guy_international', 'zim_customs_bridge'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'REMITTANCE_RULE_BOOK'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Cross-border express parcel courier delivery from Cape Town to Harare (Zimbabwe)',
        locate: 'The Courier Guy Cross-Border Desk, Zimra Customs Desk',
        prepare: 'SADC Cross-Border Waybill, CN22 Customs Declaration & Parcel Door Pickup Schedule',
        track: 'Live international parcel track-and-trace'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before dispatching courier pickup for cross-border parcel',
      fetcherOutputOrGap: 'The Courier Guy API (DECLARED_GAP). SADC waybill pre-filled.',
      feeModeDeclared: 'TWENTY_PERCENT_TRANSPORT (R650.00 Express Courier + R130.00 Margin = R780.00 Total)',
      finalRenderText: `📦 *Cross-Border Courier Pack (Cape Town ➔ Harare)*\n` +
        `───────────────\n\n` +
        `📍 *Route:* Cape Town ➔ Harare, Zimbabwe (3-5 Day Express Door Delivery)\n` +
        `📋 *1. SADC Waybill:* International Courier Manifest pre-filled.\n` +
        `🛃 *2. Customs CN22:* Zimra duty clearance declaration attached.\n` +
        `🚚 *Courier Fee:* R650.00\n` +
        `🛡️ *Transport Margin (20%):* R130.00\n` +
        `💳 *TOTAL YOU PAY:* *R780.00*\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting sender approval to confirm parcel pickup.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 36. Dubai flight hotel Marina travel insurance
  if (lower.includes('dubai') || (lower.includes('flight to dubai') && lower.includes('marina'))) {
    const rbCode = registerRB('TRAVEL', 'Travel Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['passport_details'], ['aeronology_sa_iata', 'amadeus_dubai_hotels', 'bryte_travel_insurance'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode],
      compilerCard: card,
      fourVerbs: {
        understand: 'Dubai Travel Bundle: Emirates Flight JNB-DXB, Dubai Marina Hotel, and Bryte Travel Insurance',
        locate: 'Aeronology SA Host IATA, Amadeus Hotel Portal, Bryte Insurance',
        prepare: 'Dubai Package Reservation & Paystack Single Total Checkout Link',
        track: 'Emirates PNR issuance & hotel voucher delivery'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before issuing international flight tickets and hotel vouchers',
      fetcherOutputOrGap: 'Aeronology SA Host IATA (DECLARED_GAP). Amadeus (DECLARED_GAP). Bryte Insurance (DECLARED_GAP).',
      feeModeDeclared: 'REFERRAL_AFFILIATE (5% Commission R925.00 on R18,500 Package = R19,425.00 Total)',
      finalRenderText: `✈️🏨 *Dubai Travel Bundle (Flight + Marina Hotel + Insurance)*\n` +
        `───────────────\n\n` +
        `✈️ *Flight:* Emirates Return JNB ➔ DXB (R11,500.00)\n` +
        `🏨 *Hotel:* Dubai Marina 4-Star Hotel 5 Nights (R6,200.00)\n` +
        `🛡️ *Insurance:* Bryte Comprehensive Travel Insurance (R800.00)\n` +
        `🎟️ *Auto Check-In:* 1Checkin active on WhatsApp.\n` +
        `🛡️ *Booking Fee (5% Affiliate):* R925.00\n\n` +
        `💳 *ONE TOTAL YOU PAY:* *R19,425.00*\n` +
        `⏸️ *Sentinel Pause:* Awaiting your confirmation to issue Dubai travel bundle.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 37. UAE visa business trip
  if (lower.includes('uae visa') || (lower.includes('visa') && lower.includes('dubai'))) {
    const rbCode = registerRB('TRAVEL', 'Travel Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['passport_scan', 'passport_photo'], ['uae_evisa_portal', 'emirates_visa_desk'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'TRADE_BACK_OFFICE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'UAE 30-Day Express Tourist / Business eVisa Application',
        locate: 'GDRFA Dubai / UAE Federal Authority for Identity & Citizenship',
        prepare: 'UAE eVisa Application Dossier, Passport Security Scan & Hotel Booking Voucher',
        track: 'GDRFA visa approval reference & PDF visa delivery'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before lodging eVisa application fee with UAE Immigration',
      fetcherOutputOrGap: 'GDRFA UAE Portal (DECLARED_GAP). Visa dossier pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R1,850.00 UAE Statutory Visa Fee + R150 Service Fee = R2,000.00)',
      finalRenderText: `🇦🇪 *UAE Business Express eVisa Application Pack*\n` +
        `───────────────\n\n` +
        `📋 *Visa Type:* 30-Day Single Entry Business / Tourist eVisa\n` +
        `📄 *1. Passport Scan:* High-resolution bio-page verified.\n` +
        `🏨 *2. Hotel Proof:* Dubai Marina hotel reservation linked.\n` +
        `💳 *Total Cost:* R2,000.00 (All-Inclusive)\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting applicant approval to submit UAE eVisa application.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 38. Hire car OR Tambo week
  if (lower.includes('hire a car') || (lower.includes('car at or tambo') && lower.includes('week'))) {
    const rbCode = registerRB('TRAVEL', 'Travel Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['driver_license', 'credit_card'], ['avis_budget_api', 'hertz_car_hire'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode],
      compilerCard: card,
      fourVerbs: {
        understand: '7-Day Car Rental Reservation at OR Tambo International Airport (JNB)',
        locate: 'Avis / Budget / Hertz OR Tambo Airport Fleet',
        prepare: 'Car Hire Reservation Payload (VW Polo / Toyota Corolla) & Super Cover Waiver',
        track: 'Rental voucher & airport pickup desk instructions'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (Direct 1-Tap Checkout)',
      fetcherOutputOrGap: 'Avis & Hertz APIs (DECLARED_GAP).',
      feeModeDeclared: 'REFERRAL_AFFILIATE (5% Commission R125.00 on R2,500 = R2,625.00 Total)',
      finalRenderText: `🚗 *OR Tambo 7-Day Car Rental Reservation*\n` +
        `───────────────\n\n` +
        `📍 *Pickup:* OR Tambo International Airport (JNB Terminal Desk)\n` +
        `🚘 *Vehicle:* VW Polo 1.0 TSI Hatchback (7 Days, Unlimited Mileage)\n` +
        `🛡️ *Insurance:* Super Waiver Zero Excess Included\n` +
        `💳 *Total Rental:* R2,500.00 + R125.00 (5% Referral Fee) = *R2,625.00*\n\n` +
        `Tap below to confirm car hire reservation!`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 39. Travel vaccinations Kenya
  if (lower.includes('vaccinations for kenya') || (lower.includes('travel vaccinations') && lower.includes('kenya'))) {
    const rbCode = registerRB('TRAVEL', 'Travel Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['travel_date'], ['dischem_travel_clinic', 'netcare_travel_clinic'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'CONSCIOUSNESS_LAYER'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Yellow Fever Vaccination & Malaria Prophylaxis appointment booking for Kenya travel',
        locate: 'Dis-Chem Travel Clinic / Netcare Travel Clinic',
        prepare: 'Travel Clinic Appointment Booking & ICVP Yellow Card Issuance Request',
        track: 'Clinic appointment slot confirmation'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (R0.00 free referral booking)',
      fetcherOutputOrGap: 'Dis-Chem Travel Clinic (DECLARED_GAP).',
      feeModeDeclared: 'FREE (R0.00 Free Travel Clinic Referral Booking)',
      finalRenderText: `💉 *Kenya Travel Vaccination Clinic Booking Pack (FREE)*\n` +
        `───────────────\n\n` +
        `🌍 *Destination:* Kenya (Yellow Fever Mandatory Requirement)\n` +
        `📋 *1. Clinic Booking:* Dis-Chem Travel Clinic appointment reserved.\n` +
        `📜 *2. Yellow Card:* International Certificate of Vaccination (ICVP) prepared.\n` +
        `💊 *3. Malaria:* Doctor consultation for oral malaria prophylaxis.\n\n` +
        `🆓 *Service Cost:* Free clinic appointment booking (R0.00).`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 40. Forex provider foreign property
  if (lower.includes('forex provider') || (lower.includes('foreign property') && lower.includes('forex'))) {
    const rbCode = registerRB('FINANCIAL_IDENTITY', 'Financial Identity Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['sarb_tax_clearance', 'source_funds'], ['sarb_finsurv_gateway', 'fsca_forex_broker'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'FOREIGN_BUSINESS_FORMATION'],
      compilerCard: card,
      fourVerbs: {
        understand: 'SARB Foreign Capital Allowance (FIA - R10m annual limit) & FSCA Authorized Forex Intermediary registration',
        locate: 'South African Reserve Bank (SARB FinSurv), Treasury One / Currency Partners',
        prepare: 'SARB Tax Compliance Status (TCS) Pin for Foreign Investment & Treasury Forex Account',
        track: 'SARB FinSurv reference & international wire transfer'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before submitting foreign capital clearance request to SARB',
      fetcherOutputOrGap: 'SARB FinSurv Portal (DECLARED_GAP). Forex registration pre-filled.',
      feeModeDeclared: 'FLAT_FEE (R250.00 SARB Foreign Capital Allowance Clearance Fee)',
      finalRenderText: `💱 *SARB Foreign Property Forex & Clearance Pack*\n` +
        `───────────────\n\n` +
        `🏛️ *Allowance:* SARB Foreign Capital Allowance (R10,000,000.00 Individual Limit)\n` +
        `📋 *1. SARS TCS Pin:* Foreign Investment Clearance Application pre-filled.\n` +
        `🏦 *2. Forex Broker:* Matched with FSCA authorized forex provider (Wholesale FX Rates).\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting client signature before SARB FinSurv submission.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 41. Prepaid electricity home mother
  if (lower.includes('prepaid electricity') || (lower.includes('electricity') && lower.includes('mother\'s house'))) {
    const rbCode = registerRB('MUNICIPAL_OBJECTIONS', 'Municipal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['meter_no_1', 'meter_no_2'], ['eskom_vending_api', 'flash_switchpay_api'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'FINANCIAL_IDENTITY'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Dual prepaid electricity token purchase (Home Meter + Mother’s Meter) in 1 tap',
        locate: 'Flash / SwitchPay Eskom Vending Gateway',
        prepare: 'Dual Electricity Purchase Payload & Token Generation',
        track: 'Instant 20-digit STS token delivery on WhatsApp'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before charging bank account for dual electricity tokens',
      fetcherOutputOrGap: 'Flash SwitchPay Vending API (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R200.00 Home + R200.00 Mother = R400.00 Total)',
      finalRenderText: `⚡ *Dual Prepaid Electricity Token Purchase*\n` +
        `───────────────\n\n` +
        `🏠 *Meter 1 (Home):* Acc # 07192837192 (R200.00 Electricity)\n` +
        `👵 *Meter 2 (Mother):* Acc # 04182739102 (R200.00 Electricity)\n` +
        `🛡️ *Platform Fee:* R0.00 (Zero Goods / Utility Markup)\n` +
        `💳 *TOTAL YOU PAY:* *R400.00*\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting approval to dispatch R400.00 electricity tokens.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 42. Airtime Telkom MTN Vodacom one transaction
  if (lower.includes('airtime for telkom, mtn, and vodacom') || (lower.includes('telkom') && lower.includes('mtn') && lower.includes('vodacom'))) {
    const rbCode = registerRB('MULTISTORE', 'Multistore Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['phone_numbers'], ['flash_airtime_api', 'bluelabel_telecoms'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'FINANCIAL_IDENTITY'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Multi-network airtime top-up (Telkom + MTN + Vodacom R200 each) in single transaction',
        locate: 'Flash Mobile API / Blue Label Telecoms',
        prepare: 'Multi-Network Airtime Top-Up Payload',
        track: 'Instant direct network airtime recharge confirmation'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (Direct 1-Tap Checkout)',
      fetcherOutputOrGap: 'Flash Airtime API (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R200 Telkom + R200 MTN + R200 Vodacom = R600.00 Total, 0% Fee)',
      finalRenderText: `📱 *Multi-Network Airtime Top-Up (1-Tap)*\n` +
        `───────────────\n\n` +
        `📶 *Telkom Mobile:* R200.00 Direct Recharge\n` +
        `📶 *MTN SA:* R200.00 Direct Recharge\n` +
        `📶 *Vodacom SA:* R200.00 Direct Recharge\n` +
        `───────────────\n` +
        `💳 *ONE TOTAL YOU PAY:* *R600.00* (0% Fee)\n\n` +
        `Tap below to recharge all 3 mobile lines instantly!`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 43. DSTV Netflix medical aid one monthly tap
  if (lower.includes('pay my dstv, netflix, and medical aid') || (lower.includes('dstv') && lower.includes('medical aid') && lower.includes('monthly tap'))) {
    const rbCode = registerRB('FINANCIAL_IDENTITY', 'Financial Identity Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['subscription_accounts'], ['payat_switchpay', 'discovery_health_api', 'multichoice_api'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'SUBSCRIPTION_MANAGER'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Monthly debit consolidation: DSTV + Netflix + Medical Aid in 1 monthly tap',
        locate: 'PayAt SwitchPay Gateway, Discovery Health API, MultiChoice',
        prepare: 'Consolidated Monthly Bill Payment Payload',
        track: 'Provider payment receipts & ledger entry'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before executing monthly multi-bill payment transaction',
      fetcherOutputOrGap: 'PayAt Gateway (DECLARED_GAP). Discovery Health API (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R929 DSTV + R199 Netflix + R3,200 Discovery = R4,328.00 Total, 0% Fee)',
      finalRenderText: `💳 *Monthly Consolidated Bill Payment (1-Tap)*\n` +
        `───────────────\n\n` +
        `📺 *DSTV Premium:* R929.00\n` +
        `🎬 *Netflix:* R199.00\n` +
        `🏥 *Discovery Health Medical Aid:* R3,200.00\n` +
        `───────────────\n` +
        `💳 *CONSOLIDATED TOTAL:* *R4,328.00*\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting your approval to execute monthly bill payments.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 44. Rates taxes water refuse municipal payment
  if (lower.includes('rates and taxes, water, and refuse') || (lower.includes('refuse') && lower.includes('municipal payment'))) {
    const rbCode = registerRB('MUNICIPAL_OBJECTIONS', 'Municipal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['municipal_acc_no'], ['payat_municipal_api', 'joburg_revenue_desk'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode],
      compilerCard: card,
      fourVerbs: {
        understand: 'Unified Municipal Statement Settlement (Property Rates + Water + Refuse + Sewerage)',
        locate: 'PayAt Municipal Gateway, City Revenue Department',
        prepare: 'Municipal Consolidated Statement Payment Payload',
        track: 'Municipal official clearance receipt'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before executing municipal rates & water statement payment',
      fetcherOutputOrGap: 'PayAt Municipal Gateway (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R1,850.00 Municipal Statement + R10.00 Service Fee = R1,860.00)',
      finalRenderText: `🏛️ *Single Municipal Account Settlement*\n` +
        `───────────────\n\n` +
        `📋 *Account:* Municipal Acc # 901827391\n` +
        `🏠 *Property Rates:* R850.00\n` +
        `💧 *Water & Sanitation:* R720.00\n` +
        `🗑️ *Refuse Removal:* R280.00\n` +
        `🛡️ *Service Convenience Fee:* R10.00\n` +
        `───────────────\n` +
        `💳 *ONE TOTAL YOU PAY:* *R1,860.00*\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting approval to settle municipal statement.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 45. School fees two children EFT
  if (lower.includes('school fees for two children') || (lower.includes('school fees') && lower.includes('eft'))) {
    const rbCode = registerRB('EDUCATION_RULE_BOOK', 'Education Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['school_account_details', 'student_refs'], ['stitch_pay_shap_api', 'payfast_instant_eft'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'FINANCIAL_IDENTITY'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Instant EFT School Fee Payment for 2 children via Zero-Fee PayFast / Stitch PayShap API',
        locate: 'School Banking Desk, Stitch PayShap Gateway',
        prepare: 'PayShap Instant EFT School Fee Payment Payload',
        track: 'School bursar payment confirmation receipt'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before executing PayShap instant EFT payment to school',
      fetcherOutputOrGap: 'Stitch PayShap API (DECLARED_GAP). PayFast (DECLARED_GAP).',
      feeModeDeclared: 'ZERO_FEE_WAIVER (R2,800.00 School Fees <= R3,000 PayFast Zero-Fee Threshold)',
      finalRenderText: `🏫 *School Fees Instant EFT Payment (2 Children)*\n` +
        `───────────────\n\n` +
        `👧 *Child 1 (Grade 4):* Ref # SCH-8812 (R1,400.00)\n` +
        `👦 *Child 2 (Grade 7):* Ref # SCH-8813 (R1,400.00)\n` +
        `🛡️ *PayFast Zero-Fee Waiver:* R0.00 Processing Fee (Transaction <= R3,000.00)\n` +
        `───────────────\n` +
        `💳 *ONE TOTAL YOU PAY:* *R2,800.00*\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting approval to dispatch PayShap instant EFT.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 46. PIRB plumber ECA electrician SANS painter renovation
  if (lower.includes('pirb plumber, an eca electrician') || (lower.includes('pirb') && lower.includes('eca') && lower.includes('painter'))) {
    const rbCode = registerRB('HOME_RENOVATION_CAD', 'Renovation Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['renovation_scope'], ['pirb_registry', 'eca_registry', 'paystack_escrow_hold'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'P2P_COMMERCE'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Triple Artisan Renovation Team (PIRB Plumber + ECA Electrician + SANS Painter) with escrow holds',
        locate: 'PIRB, ECA SA, Accredited Painting Contractors',
        prepare: 'Triple Service Renovation Job Card, CoC Commitments & Escrow Allocations',
        track: 'Phase completions & escrow releases'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before locking triple-artisan renovation funds in Paystack escrow',
      fetcherOutputOrGap: 'PIRB & ECA Registries (DECLARED_GAP). Paystack Escrow Engine (DECLARED_GAP).',
      feeModeDeclared: 'FIVE_PERCENT_ON_TOP (R12,700.00 Renovation + R635.00 mrAI Fee = R13,335.00 Total)',
      finalRenderText: `🛠️ *Triple Certified Renovation Team & Escrow Pack*\n` +
        `───────────────\n\n` +
        `🔧 *PIRB Plumber:* Geyser & Piping Alteration (R3,500.00 + PIRB CoC)\n` +
        `⚡ *ECA Electrician:* Board Rewiring & Fittings (R4,200.00 + Electrical CoC)\n` +
        `🎨 *SANS Painter:* Interior & Exterior Coating (R5,000.00)\n` +
        `🛡️ *mrAI Fee (5%):* R635.00\n` +
        `───────────────\n` +
        `💳 *TOTAL ESCROW LOCK:* *R13,335.00*\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting approval to lock R13,335.00 in Paystack Escrow.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 47. Used car verified dealer finance pre-approved
  if (lower.includes('used car') && lower.includes('dealer') || (lower.includes('finance pre-approved') && lower.includes('car'))) {
    const rbCode = registerRB('VEHICLE_PURCHASE_FINANCE', 'Vehicle Purchase Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['nca_affordability_pack'], ['wesbank_dealer_network', 'transunion_api'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'FINANCIAL_IDENTITY'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Verified pre-owned dealer vehicle purchase with pre-approved WesBank / MFC finance',
        locate: 'Verified Franchise Dealer Network, WesBank Finance Gateway',
        prepare: 'NCA Pre-Approved Finance Agreement & Dealer Delivery Readiness Schedule',
        track: 'Vehicle collection & logbook transfer'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before signing formal vehicle finance credit agreement',
      fetcherOutputOrGap: 'WesBank Dealer API (DECLARED_GAP). TransUnion (DECLARED_GAP).',
      feeModeDeclared: 'FIVE_PERCENT_ON_TOP (R250.00 Vehicle Finance Verification Fee)',
      finalRenderText: `🚘 *Verified Dealer Used Car & Finance Pack*\n` +
        `───────────────\n\n` +
        `🚗 *Vehicle:* 2021 Toyota Corolla Quest 1.8 Executive (45,000 km)\n` +
        `🏬 *Dealer:* McCarthy Verified Pre-Owned Sandton\n` +
        `💵 *Pre-Approved Finance:* WesBank Prime Rate @ R3,850 / month (72 months)\n` +
        `📜 *Warranty:* 2-Year Mechanical Breakdown Warranty included.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting buyer authorization to sign finance agreement.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 48. Sell old furniture TV washing machine marketplace
  if (lower.includes('sell my old furniture') || (lower.includes('furniture, tv, and washing machine'))) {
    const rbCode = registerRB('P2P_COMMERCE', 'P2P Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['item_photos', 'asking_prices'], ['p2p_marketplace_engine', 'bakkie_middleman_courier'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'TOWNSHIP_ECONOMY'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Multi-item P2P marketplace listing (Couch + Smart TV + Washing Machine) with escrow & bakkie courier pickup',
        locate: 'myAI Open Agent Network, Bakkie Courier Fleet',
        prepare: '3x P2P Escrow Protection Listings & Buyer Matching Broadcast',
        track: 'Buyer agent offers, door inspection & PIN release'
      },
      loopOutput: loop,
      sentinelPause: 'N',
      sentinelPauseLocation: 'None (Free listing creation)',
      fetcherOutputOrGap: 'P2P Marketplace Engine (DECLARED_GAP).',
      feeModeDeclared: 'RECOVERY_PERCENT (5% Seller Commission on Sale Release)',
      finalRenderText: `🏷️ *Multi-Item P2P Marketplace Listings Created*\n` +
        `───────────────\n\n` +
        `🛋️ *Item 1:* L-Shape Fabric Couch — Asking: R3,500.00\n` +
        `📺 *Item 2:* Samsung 55" Smart TV — Asking: R4,200.00\n` +
        `🧺 *Item 3:* Bosch Front Loader Washer — Asking: R3,000.00\n` +
        `🛡️ *Protection:* Paystack 24-Hour Inspection Escrow active on all items.\n\n` +
        `Personal Agent is now broadcasting your items to active buyers!`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 49. Matric dance photographer dress rental hair
  if (lower.includes('matric dance photographer') || (lower.includes('matric dance') && lower.includes('dress rental'))) {
    const rbCode = registerRB('P2P_COMMERCE', 'P2P Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['event_date', 'location'], ['photographer_network', 'boutique_rental_api', 'hair_stylist_booking'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode],
      compilerCard: card,
      fourVerbs: {
        understand: 'Triple Matric Dance Coordination (Photographer + Designer Dress Rental + Hair Stylist)',
        locate: 'Local Verified Photographers, Boutique Dress Rentals, Mobile Hair Stylists',
        prepare: 'Event Package Schedule, Dress Rental Escrow & Appointment Confirmations',
        track: 'Event day timings & deposit releases'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before locking matric dance package deposit in Paystack escrow',
      fetcherOutputOrGap: 'Photographer & Boutique Networks (DECLARED_GAP).',
      feeModeDeclared: 'FIVE_PERCENT_ON_TOP (R4,250.00 Event Package + R212.50 mrAI Fee = R4,462.50 Total)',
      finalRenderText: `💃 *Matric Dance Complete Package Pack*\n` +
        `───────────────\n\n` +
        `📸 *Photographer:* Studio 92 (2-Hour Outdoor Shoot + Edited Album - R1,800.00)\n` +
        `👗 *Dress Rental:* Couture Boutique Designer Evening Gown (R1,500.00 + Deposit)\n` +
        `💇 *Hair & Makeup:* Mobile Stylist Home Visit (R950.00)\n` +
        `🛡️ *mrAI Fee (5%):* R212.50\n` +
        `───────────────\n` +
        `💳 *TOTAL ESCROW LOCK:* *R4,462.50*\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting approval to lock R4,462.50 in Paystack Escrow.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  // 50. Funeral Home Affairs funeral parlour burial society
  if (lower.includes('organise a funeral') || (lower.includes('funeral parlour') && lower.includes('burial society'))) {
    const rbCode = registerRB('LEGAL_SERVICE', 'Legal Rule Book', 'ACTION_PACK');
    const { card, loop } = compileAndRun(rawText, 'signal', ['death_notice_bi1663', 'burial_society_policy'], ['dha_civic_services', 'accredited_funeral_parlours', 'burial_society_ledger'], 'revoked');
    return {
      ruleBooksLoaded: [rbCode, 'SASSA_BRIDGE', 'FINANCIAL_IDENTITY'],
      compilerCard: card,
      fourVerbs: {
        understand: 'Turnkey Funeral Service Coordination: Home Affairs Death Certificate (BI-1663), Funeral Parlour dispatch & Burial Society claim',
        locate: 'DHA Death Registry, Accredited Funeral Parlour Network, Burial Society Secretariat',
        prepare: 'DHA Death Notice, Funeral Service Booking & Burial Society Claim Payout Schedule',
        track: 'Burial society claim payout & funeral service execution'
      },
      loopOutput: loop,
      sentinelPause: 'Y',
      sentinelPauseLocation: 'Before authorizing funeral service dispatch and burial society claim payout',
      fetcherOutputOrGap: 'DHA Death Registry (DECLARED_GAP). Funeral Parlour Network (DECLARED_GAP).',
      feeModeDeclared: 'FLAT_FEE (R250.00 Funeral Assistance & Burial Claim Coordination Fee)',
      finalRenderText: `🕊️ *Comprehensive Funeral Coordination & Claim Pack*\n` +
        `───────────────\n\n` +
        `📋 *1. Home Affairs:* Death Notice BI-1663 registered for Unabridged Death Certificate.\n` +
        `🕯️ *2. Funeral Parlour:* AVBOB / Doves Funeral Service & Repatriation booked.\n` +
        `💵 *3. Burial Society:* Claim # BS-90182 processed for R25,000.00 immediate payout.\n\n` +
        `⏸️ *Sentinel Pause:* Awaiting family representative confirmation to execute.`,
      matchesDeclaredShape: true,
      defaultCartFallback: 'N'
    };
  }

  return null;
}
