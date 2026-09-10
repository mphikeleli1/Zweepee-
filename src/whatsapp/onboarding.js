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
    const record = { ...profile, updatedAt: Date.now() };
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
        nextStep: 'ONBOARDING_AWAITING_NAME',
        screen: {
          text: `🌟 *Welcome to myAI™!*\n\n` +
            `I'm your personal autonomous digital agent on WhatsApp. I can order food, buy groceries, move furniture, or sell items for you with zero markup!\n\n` +
            `To get started, what is your *name*?`
        }
      };
    }

    if (onboardingStep === 'ONBOARDING_AWAITING_NAME') {
      const name = text.trim();
      return {
        nextStep: 'ONBOARDING_AWAITING_ADDRESS',
        draftProfile: { name },
        screen: {
          text: `Nice to meet you, *${name}*! 👋\n\n` +
            `Where should your orders or deliveries be sent by default? (Please reply with your delivery suburb or address, e.g. *Sandton, Johannesburg*).`
        }
      };
    }

    if (onboardingStep === 'ONBOARDING_AWAITING_ADDRESS') {
      const address = text.trim();
      return {
        nextStep: 'ONBOARDING_COMPLETED',
        completedProfile: { address },
        screen: {
          text: `🎉 *You're All Set!*\n\n` +
            `Your myAI™ Personal Agent is active and ready to assist you anytime.\n\n` +
            `What would you like to do today?`,
          buttons: [
            { type: 'reply', reply: { id: 'action_food', title: '🍔 Order Food' } },
            { type: 'reply', reply: { id: 'action_groceries', title: '🛒 Groceries' } },
            { type: 'reply', reply: { id: 'action_moving', title: '🚚 Moving & Delivery' } },
            { type: 'reply', reply: { id: 'action_sell', title: '🏷️ Sell an Item' } }
          ]
        }
      };
    }

    return { nextStep: 'ONBOARDING_COMPLETED' };
  }
}
