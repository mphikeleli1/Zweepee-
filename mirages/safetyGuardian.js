// mirages/safetyGuardian.js
'use strict';

const sessionManager = require('../session/manager');
const whatsappClient = require('../whatsapp/client');

/**
 * The Safety Guardian Mirage.
 * A placeholder for the opt-in emergency monitoring service.
 */
class SafetyGuardianMirage {
  constructor() {
    this.name = 'SafetyGuardian';
  }

  /**
   * Handles incoming messages for the safety guardian mirage.
   */
  async handle(session, message) {
    const currentState = session.mirageState.step || 'START';

    switch (currentState) {
      case 'START':
        await this.start(session);
        break;
      default:
        await this.start(session);
        break;
    }
  }

  /**
   * Starts the safety guardian flow.
   */
  async start(session) {
    const welcomeMessage = "The Safety Guardian feature is coming soon. This service will provide opt-in emergency monitoring for your safety.";
    await whatsappClient.sendTextMessage(session.phone, welcomeMessage);

    // End the mirage session
    await sessionManager.updateSession(session.phone, {
      currentMirage: null,
      mirageState: {},
    });
  }
}

module.exports = new SafetyGuardianMirage();