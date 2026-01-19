// mirages/carRental.js
'use strict';

const sessionManager = require('../session/manager');
const whatsappClient = require('../whatsapp/client');

/**
 * The Car Rental Mirage.
 * A placeholder for users to rent vehicles.
 */
class CarRentalMirage {
  constructor() {
    this.name = 'CarRental';
  }

  /**
   * Handles incoming messages for the car rental mirage.
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
   * Starts the car rental flow.
   */
  async start(session) {
    const welcomeMessage = "The Car Rental Mirage is coming soon. Here you will be able to rent vehicles.";
    await whatsappClient.sendTextMessage(session.phone, welcomeMessage);

    // End the mirage session
    await sessionManager.updateSession(session.phone, {
      currentMirage: null,
      mirageState: {},
    });
  }
}

module.exports = new CarRentalMirage();