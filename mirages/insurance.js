// mirages/insurance.js
'use strict';

const sessionManager = require('../session/manager');
const whatsappClient = require('../whatsapp/client');

/**
 * The Insurance Mirage.
 * A placeholder for users to browse and purchase insurance products.
 */
class InsuranceMirage {
  constructor() {
    this.name = 'Insurance';
  }

  /**
   * Handles incoming messages for the insurance mirage.
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
   * Starts the insurance flow.
   */
  async start(session) {
    const welcomeMessage = "The Insurance Mirage is coming soon. Here you will be able to browse and purchase insurance products.";
    await whatsappClient.sendTextMessage(session.phone, welcomeMessage);

    // End the mirage session
    await sessionManager.updateSession(session.phone, {
      currentMirage: null,
      mirageState: {},
    });
  }
}

module.exports = new InsuranceMirage();