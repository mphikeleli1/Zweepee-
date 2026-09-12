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
    if (!onboardingStep || onboardingStep === 'ONBOARDING_START') {
      return {
        nextStep: 'ONBOARDING_AWAITING_LOCATION',
        screen: {
          text: `🌟 *Welcome to myAI™! Your Open Autonomous Agent Network*\n\n` +
            `I am your 24/7 Personal Agent. I can help you with virtually *anything* across South Africa:\n` +
            `• 🍔 Order food & groceries (KFC, Woolies, PnP, Makro, Dis-Chem, Specsavers, Vets) at 0% markup\n` +
            `• 🏷️ Buy or sell pre-owned goods safely (24h Paystack inspection escrow + courier pickup)\n` +
            `• 🚚 Arrange transport & moving trucks (motorcycles to 8-ton bakkies & trucks)\n` +
            `• 💼 Find jobs, hire staff, or discover rental flats & travel holiday bundles\n\n` +
            `To get started, where are you located? (Reply with your suburb/city e.g. *Sandton, Johannesburg* or tap 📎 to send a 📍 GPS Pin)`
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
            `Awesome! What is your *name* so I can build, personalize, and activate your Personal Agent?`
        }
      };
    }

    if (onboardingStep === 'ONBOARDING_AWAITING_NAME') {
      const name = text.trim();
      return {
        nextStep: 'ONBOARDING_OPTIONAL_PREFS',
        completedProfile: { name },
        screen: {
          text: `🎉 *Your Personal Agent is Active, ${name}!*\n\n` +
            `🔒 *POPIA Privacy Guarantee:* Your personal data is 100% encrypted & protected under South African law. We never collect sensitive financial or invasive info.\n\n` +
            `To give you an even richer, personalized experience, feel free to share any preferences you like (e.g., *Halal food, Woolies shopper, prefer weekend deliveries*)—only what you choose to share!`,
          buttons: [
            { type: 'reply', reply: { id: 'prompt_prefs', title: '🎨 Add Preferences' } },
            { type: 'reply', reply: { id: 'skip_prefs', title: '⏱️ Do This Later' } }
          ]
        }
      };
    }

    if (onboardingStep === 'ONBOARDING_OPTIONAL_PREFS') {
      if (text === 'prompt_prefs') {
        return {
          nextStep: 'ONBOARDING_AWAITING_PREF_TEXT',
          screen: {
            text: `🎨 *Customize Your Personal Agent*\n\n` +
              `Feel free to share anything that helps me serve you better—for example:\n` +
              `• 💼 *Profession / Business:* (helps match relevant jobs or business leads)\n` +
              `• 🎓 *Education / Field:* (helps match academic or training queries)\n` +
              `• 🥗 *Dietary / Shopping:* (e.g. Halal, Vegan, Woolworths shopper)\n\n` +
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
            `I am ready to assist you anytime. How may I help you today?`,
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
          text: `🎉 *Preferences Saved & You're All Set!*\n\n` +
            `I am ready to assist you anytime. How may I help you today?`,
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
