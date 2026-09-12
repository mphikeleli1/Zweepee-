import { detectLanguage, translate } from '../lib/i18n.js';

export class UserOnboardingEngine {
  constructor(kvUsers) {
    this.kvUsers = kvUsers;
    this.inMemoryUsers = new Map();
  }

  async getUserProfile(waId) {
    const key = `users:${waId}`;
    if (this.kvUsers) {
      const data = await this.kvUsers.get(key);
      if (data) return JSON.parse(data);
    }
    if (this.inMemoryUsers.has(key)) {
      return this.inMemoryUsers.get(key);
    }
    return null;
  }

  async saveUserProfile(waId, profile) {
    const key = `users:${waId}`;
    const existing = await this.getUserProfile(waId) || {};
    const record = { ...existing, ...profile, updatedAt: Date.now() };
    if (this.kvUsers) {
      await this.kvUsers.put(key, JSON.stringify(record));
    } else {
      this.inMemoryUsers.set(key, record);
    }
    return record;
  }

  async handleOnboarding(waId, text, onboardingStep) {
    const detectedLang = detectLanguage(text);

    if (!onboardingStep || onboardingStep === 'ONBOARDING_START') {
      const welcomeHeader = translate('welcome', detectedLang);
      return {
        nextStep: 'ONBOARDING_AWAITING_LOCATION',
        draftProfile: { preferredLanguage: detectedLang },
        screen: {
          text: `${welcomeHeader}\n\n` +
            `I am your 24/7 personal helper. I can assist you with almost *anything* in South Africa:\n` +
            `• 🍔 Order food & groceries (KFC, Woolies, Pick n Pay, Makro, Dis-Chem, Specsavers) at exact store prices\n` +
            `• 🏷️ Buy or sell used items safely with delivery to your door\n` +
            `• 🚚 Book moving bakkies & trucks\n` +
            `• 💼 Find jobs, hire staff, or discover rental flats & travel deals\n\n` +
            `To get started, where are you located? (Reply with your suburb e.g. *Sandton, Johannesburg* or tap 📎 to send a 📍 Location Pin)`
        }
      };
    }

    if (onboardingStep === 'ONBOARDING_AWAITING_LOCATION') {
      const address = text.trim();
      return {
        nextStep: 'ONBOARDING_AWAITING_NAME',
        draftProfile: { address },
        screen: {
          text: `📍 *Location Saved:* ${address}\n\n` +
            `Awesome! What is your *name* so I can create and activate your personal assistant?`
        }
      };
    }

    if (onboardingStep === 'ONBOARDING_AWAITING_NAME') {
      const name = text.trim();
      return {
        nextStep: 'ONBOARDING_OPTIONAL_PREFS',
        completedProfile: { name },
        screen: {
          text: `🎉 *Your Personal Helper is Active, ${name}!*\n\n` +
            `🔒 *Your Privacy Guarantee:* Your details are 100% private and safe under South African privacy laws. We never ask for bank PINs or private documents!\n\n` +
            `To help me give you a better, more personal service, feel free to tell us a bit about yourself—only what you choose to share!`,
          buttons: [
            { type: 'reply', reply: { id: 'tell_about_yourself', title: '💬 Tell us about yourself' } },
            { type: 'reply', reply: { id: 'skip_prefs', title: '⏱️ Do This Later' } }
          ]
        }
      };
    }

    if (onboardingStep === 'ONBOARDING_OPTIONAL_PREFS') {
      if (text === 'tell_about_yourself' || text === 'prompt_prefs') {
        return {
          nextStep: 'ONBOARDING_AWAITING_PREF_TEXT',
          screen: {
            text: `💬 *Tell Us About Yourself*\n\n` +
              `Feel free to share anything that helps me serve you better—for example:\n` +
              `• 💼 *Your Work / Business:* (helps match relevant job or business opportunities)\n` +
              `• 🎓 *Education / Studies:* (helps match training or study queries)\n` +
              `• 🥗 *Food / Favorite Stores:* (e.g. Halal food, Woolworths shopper)\n\n` +
              `Reply with whatever you'd like to share, or tap *Do This Later* anytime!`,
            buttons: [
              { type: 'reply', reply: { id: 'skip_prefs', title: '⏱️ Do This Later' } }
            ]
          }
        };
      }

      const prefs = text.trim();
      const isSkip = prefs.toLowerCase().includes('skip') || prefs.toLowerCase().includes('later') || text === 'skip_prefs';

      return {
        nextStep: 'ONBOARDING_COMPLETED',
        completedProfile: isSkip ? {} : { preferences: prefs },
        screen: {
          text: `🎉 *You're All Set!*\n\n` +
            `I am ready to help you anytime. What would you like to do today?`,
          buttons: [
            { type: 'reply', reply: { id: 'action_food', title: '🍔 Order Food / Groceries' } },
            { type: 'reply', reply: { id: 'action_sell', title: '🏷️ Buy or Sell Item' } },
            { type: 'reply', reply: { id: 'action_moving', title: '🚚 Moving & Trucks' } }
          ]
        }
      };
    }

    if (onboardingStep === 'ONBOARDING_AWAITING_PREF_TEXT') {
      const prefs = text.trim();
      const isSkip = prefs.toLowerCase().includes('skip') || prefs.toLowerCase().includes('later') || text === 'skip_prefs';

      return {
        nextStep: 'ONBOARDING_COMPLETED',
        completedProfile: isSkip ? {} : { preferences: prefs },
        screen: {
          text: `🎉 *Thanks for sharing! You're All Set!*\n\n` +
            `I am ready to help you anytime. What would you like to do today?`,
          buttons: [
            { type: 'reply', reply: { id: 'action_food', title: '🍔 Order Food / Groceries' } },
            { type: 'reply', reply: { id: 'action_sell', title: '🏷️ Buy or Sell Item' } },
            { type: 'reply', reply: { id: 'action_moving', title: '🚚 Moving & Trucks' } }
          ]
        }
      };
    }

    return { nextStep: 'ONBOARDING_COMPLETED' };
  }
}
