// mirages/property.js
'use strict';

const sessionManager = require('../session/manager');
const whatsappClient = require('../whatsapp/client');

/**
 * The Property Mirage.
 * A placeholder for users to browse property listings.
 */
class PropertyMirage {
  constructor() {
    this.name = 'Property';
  }

  /**
   * Handles incoming messages for the property mirage.
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
   * Starts the property flow.
   */
  async start(session) {
    const welcomeMessage = "The Property Mirage is coming soon. Here you will be able to browse property listings.";
    await whatsappClient.sendTextMessage(session.phone, welcomeMessage);

    // End the mirage session
    await sessionManager.updateSession(session.phone, {
      currentMirage: null,
      mirageState: {},
    });
  }
}

module.exports = new PropertyMirage();