// mirages/accommodation.js
'use strict';

const sessionManager = require('../session/manager');
const whatsappClient = require('../whatsapp/client');

/**
 * The Accommodation Mirage.
 * A placeholder for users to book hotels and other accommodation.
 */
class AccommodationMirage {
  constructor() {
    this.name = 'Accommodation';
  }

  /**
   * Handles incoming messages for the accommodation mirage.
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
   * Starts the accommodation flow.
   */
  async start(session) {
    const welcomeMessage = "The Accommodation Mirage is coming soon. Here you will be able to book hotels and other accommodation.";
    await whatsappClient.sendTextMessage(session.phone, welcomeMessage);

    // End the mirage session
    await sessionManager.updateSession(session.phone, {
      currentMirage: null,
      mirageState: {},
    });
  }
}

module.exports = new AccommodationMirage();