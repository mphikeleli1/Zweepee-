/**
 * Lightweight South African Multilingual Localization Engine (i18n)
 * Supports South Africa's official languages: English (en), isiZulu (zu), isiXhosa (xh), Afrikaans (af), Sepedi (nso), Setswana (tn).
 */

export const SUPPORTED_LANGUAGES = {
  EN: 'en',
  ZU: 'zu',
  XH: 'xh',
  AF: 'af',
  NSO: 'nso',
  TN: 'tn'
};

const LANGUAGE_GREETINGS = [
  { lang: SUPPORTED_LANGUAGES.ZU, keywords: ['sawubona', 'sanibonani', 'yebo', 'siyabonga', 'ngiyabonga'] },
  { lang: SUPPORTED_LANGUAGES.XH, keywords: ['molo', 'molweni', 'enkosi', 'ndiyabulela'] },
  { lang: SUPPORTED_LANGUAGES.AF, keywords: ['goeiedag', 'hallo', 'dankie', 'asseblief', 'waaris'] },
  { lang: SUPPORTED_LANGUAGES.NSO, keywords: ['dumela', 'dumelang', 'ke a leboga', 're a leboga'] },
  { lang: SUPPORTED_LANGUAGES.TN, keywords: ['dumela rra', 'dumela mma', 'ke itumetse'] }
];

export function detectLanguage(text = '') {
  const lower = text.toLowerCase().trim();

  for (const entry of LANGUAGE_GREETINGS) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return entry.lang;
    }
  }

  return SUPPORTED_LANGUAGES.EN;
}

const TRANSLATIONS = {
  [SUPPORTED_LANGUAGES.EN]: {
    welcome: '🌟 Welcome to myAI™!',
    greeting: 'Hello {name}! 👋 How can I help you today?',
    checkout_title: '✨ myAI™ Instant Checkout ✨',
    pay_now: '💳 Pay {total}',
    location_saved: '📍 Location Saved: {address}',
    privacy_guarantee: '🔒 Your details are 100% private and safe under South African privacy laws.'
  },
  [SUPPORTED_LANGUAGES.ZU]: {
    welcome: '🌟 Siyakwamukela ku-myAI™!',
    greeting: 'Sawubona {name}! 👋 Ngingakusiza ngani namhlanje?',
    checkout_title: '✨ myAI™ Ngokushesha Isitaladi Sasekhaya ✨',
    pay_now: '💳 Bhala i-Pay {total}',
    location_saved: '📍 Indawo Igciniwe: {address}',
    privacy_guarantee: '🔒 Imininingwane yakho iphephile engxenyeni yomthetho waseNingizimu Afrika.'
  },
  [SUPPORTED_LANGUAGES.XH]: {
    welcome: '🌟 Wamkelekile ku-myAI™!',
    greeting: 'Molo {name}! 👋 Ngingakunceda ngantoni namhlanje?',
    checkout_title: '✨ myAI™ Ukuhlawula Kwangoko ✨',
    pay_now: '💳 Bhalisa i-Pay {total}',
    location_saved: '📍 Indawo Igciniwe: {address}',
    privacy_guarantee: '🔒 Inkcukacha zakho zikhuselekile phantsi kwemithetho yoMzantsi Afrika.'
  },
  [SUPPORTED_LANGUAGES.AF]: {
    welcome: '🌟 Welkom by myAI™!',
    greeting: 'Hallo {name}! 👋 Waarmee kan ek jou vandag help?',
    checkout_title: '✨ myAI™ Kits Betaalpunt ✨',
    pay_now: '💳 Betaal {total}',
    location_saved: '📍 Ligging Opgeslaan: {address}',
    privacy_guarantee: '🔒 Jou besonderhede is 100% privaat en veilig onder Suid-Afrikaanse wetgewing.'
  },
  [SUPPORTED_LANGUAGES.NSO]: {
    welcome: '🌟 Re a go amogela go myAI™!',
    greeting: 'Dumela {name}! 👋 Nka go thuša ka eng lehono?',
    checkout_title: '✨ myAI™ Tefelo ya Kapejana ✨',
    pay_now: '💳 Lefta {total}',
    location_saved: '📍 Lepokisi le bolokilwe: {address}',
    privacy_guarantee: '🔒 Dinomoro tša gago di bolokegile ka tlase ga melao ya Afrika Borwa.'
  },
  [SUPPORTED_LANGUAGES.TN]: {
    welcome: '🌟 Re a go amogela mo myAI™!',
    greeting: 'Dumela {name}! 👋 Nka go thusa ka eng gompieno?',
    checkout_title: '✨ myAI™ Tuelo ya Kapejana ✨',
    pay_now: '💳 Duela {total}',
    location_saved: '📍 Lelokelelo le bolokilwe: {address}',
    privacy_guarantee: '🔒 Ditatofatso tsa gago di bolokegile ka fa tlase ga melao ya Aferika Borwa.'
  }
};

export function translate(key, lang = SUPPORTED_LANGUAGES.EN, params = {}) {
  const dictionary = TRANSLATIONS[lang] || TRANSLATIONS[SUPPORTED_LANGUAGES.EN];
  let text = dictionary[key] || TRANSLATIONS[SUPPORTED_LANGUAGES.EN][key] || key;

  for (const [pKey, pVal] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${pKey}\\}`, 'g'), pVal);
  }

  return text;
}
