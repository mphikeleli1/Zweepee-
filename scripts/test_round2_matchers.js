import { WhatsAppSessionEngine } from '../src/whatsapp/sessionEngine.js';

const engine = new WhatsAppSessionEngine();

const round2Phrases = [
  'Cancel my DSTV, Netflix, and Showmax subscriptions and get refunds for unused days.',
  "Transfer my car licence to my son's name and update the registration.",
  'Appeal my traffic fine for a camera error at a Sandton intersection.',
  'Get my police clearance certificate for a UK visa application.',
  'Register a dog licence with the City of Cape Town.',
  'Renew my TV licence before penalty.',
  'Get my credit report from TransUnion and dispute a wrong listing.',
  'Apply for a municipal pensioner rebate on rates.',
  'Hire a tow truck after an accident on the N1 and coordinate the insurance claim.',
  'Register as a spaza with the City of Joburg and get a trading permit.',

  'Book my daughter into a Grade 1 school in Benoni with space.',
  'Apply for a school fee exemption for two children.',
  'Get my matric certificate reissued by Umalusi.',
  'Apply for a learnership at Transnet for boilermaking.',
  'Register with a SETA for a plumbing apprenticeship.',

  'File a CCMA case against my former employer for unpaid commission.',
  'Get a protection order against my ex-partner under the Domestic Violence Act.',
  "Prepare a maintenance application at the Magistrate's Court.",
  'Draft a will leaving everything to my three children.',
  "Register my mother's death with Home Affairs and start the estate.",

  'Register my business for VAT because my turnover exceeded R1m.',
  'Get a SARS tax clearance PIN for a tender.',
  'Submit my EMP501 reconciliation for the tax year.',
  'File my CIPC annual return and beneficial ownership.',
  'Get a B-BBEE affidavit for a tender submission.',

  'Apply for a liquor licence for a new restaurant in Pretoria.',
  'Renew my Western Cape liquor licence before December.',
  'Get my Certificate of Acceptability from municipal health for a food business.',
  'Apply for an NRCS Letter of Authority for imported electrical goods.',
  'Register a drone for commercial photography with SACAA.',

  'Order groceries from Checkers Sixty60 and a prescription from Dis-Chem in one trip.',
  'Book a plumber and a geyser replacement with CoC in one visit.',
  'Book an electrician and a painter for the same Saturday.',
  'Order a fridge from Takealot with installation and old-fridge removal.',
  'Send a parcel from Cape Town to Harare via courier.',

  'Book a flight to Dubai, a hotel in Marina, and travel insurance.',
  'Get a UAE visa for a business trip.',
  'Hire a car at OR Tambo for a week.',
  'Get travel vaccinations for Kenya.',
  'Register with a forex provider for a foreign property purchase.',

  'Buy prepaid electricity for my home and my mother\'s house.',
  'Buy R200 airtime for Telkom, MTN, and Vodacom in one transaction.',
  'Pay my DSTV, Netflix, and medical aid in one monthly tap.',
  'Pay my Rates and Taxes, water, and refuse in a single municipal payment.',
  'Pay my school fees for two children via EFT.',

  'Hire a PIRB plumber, an ECA electrician, and a SANS-approved painter for a renovation.',
  'Buy a used car from a verified dealer with finance pre-approved.',
  'Sell my old furniture, TV, and washing machine on the marketplace.',
  'Book a matric dance photographer, a dress rental, and a hair appointment.',
  'Organise a funeral with Home Affairs, the funeral parlour, and the burial society.'
];

async function checkMatches() {
  let matched = 0;
  round2Phrases.forEach((phrase, idx) => {
    const res = engine.processHeavyweightRuleBookRequest('27829990000', phrase, {}, { name: 'Test User' });
    if (res) {
      matched++;
      console.log(`[MATCH ${idx + 1}] ${res.ruleBooksLoaded.join(', ')}`);
    } else {
      console.log(`[MISS ${idx + 1}] ${phrase}`);
    }
  });
  console.log(`Matched: ${matched} / 50`);
}

checkMatches();
