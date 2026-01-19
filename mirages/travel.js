// mirages/travel.js
'use strict';

const sessionManager = require('../session/manager');
const whatsappClient = require('../whatsapp/client');

/**
 * The Travel Mirage.
 * A placeholder for users to book flights and other travel arrangements.
 */
class TravelMirage {
  constructor() {
    this.name = 'Travel';
  }

  /**
   * Handles incoming messages for the travel mirage.
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
   * Starts the travel flow.
   */
  async start(session) {
    const welcomeMessage = "The Travel Mirage is coming soon. Here you will be able to book flights and other travel arrangements.";
    await whatsappClient.sendTextMessage(session.phone, welcomeMessage);

    // End the mirage session
    await sessionManager.updateSession(session.phone, {
      currentMirage: null,
      mirageState: {},
    });
  }
}

module.exports = new TravelMirage();