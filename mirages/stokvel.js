// mirages/stokvel.js
'use strict';

const mockStokvelApi = require('../mocks/stokvelApi');
const sessionManager = require('../session/manager');
const whatsappClient =require('../whatsapp/client');
const payfastEngine = require('../payfast/engine'); // Import the PayFast engine

/**
 * The Stokvel Mirage.
 * Guides users through creating and joining digital savings clubs.
 */
class StokvelMirage {
  constructor() {
    this.name = 'Stokvel'; // Match the name in the registry
    this.creationFee = 10; // R10 setup fee for a new stokvel
  }

  /**
   * Handles incoming messages for the stokvel mirage.
   */
  async handle(session, message) {
    const currentState = session.mirageState.step || 'START';

    switch (currentState) {
      case 'START':
        await this.start(session);
        break;
      case 'AWAITING_CHOICE':
        await this.handleChoice(session, message);
        break;
      // Create flow
      case 'AWAITING_STOKVEL_NAME':
        await this.handleStokvelName(session, message);
        break;
      case 'AWAITING_STOKVEL_TYPE':
        await this.handleStokvelType(session, message);
        break;
      // Join flow
      case 'AWAITING_INVITE_CODE':
        await this.handleInviteCode(session, message);
        break;
      default:
        await this.start(session);
        break;
    }
  }

  /**
   * Starts the stokvel flow.
   */
  async start(session) {
    await sessionManager.updateSession(session.phone, {
      mirageState: { step: 'AWAITING_CHOICE' },
    });
    const welcomeMessage = "Welcome to the Stokvel Mirage! Do you want to 'create' a new stokvel or 'join' an existing one?";
    await whatsappClient.sendTextMessage(session.phone, welcomeMessage);
  }

  /**
   * Handles the user's initial choice to create or join.
   */
  async handleChoice(session, message) {
    const choice = message.text.body.toLowerCase().trim();
    if (choice.includes('create')) {
      await sessionManager.updateSession(session.phone, {
        mirageState: { step: 'AWAITING_STOKVEL_NAME' },
      });
      await whatsappClient.sendTextMessage(session.phone, "Great! What would you like to name your stokvel?");
    } else if (choice.includes('join')) {
      await sessionManager.updateSession(session.phone, {
        mirageState: { step: 'AWAITING_INVITE_CODE' },
      });
      await whatsappClient.sendTextMessage(session.phone, "Please enter the invite code for the stokvel you want to join.");
    } else {
      await whatsappClient.sendTextMessage(session.phone, "Please choose either 'create' or 'join'.");
    }
  }

  /**
   * Handles the name for a new stokvel.
   */
  async handleStokvelName(session, message) {
    const name = message.text.body.trim();
    await sessionManager.updateSession(session.phone, {
      mirageState: { ...session.mirageState, step: 'AWAITING_STOKVEL_TYPE', name: name },
    });
    await whatsappClient.sendTextMessage(session.phone, `Perfect. What type of stokvel is "${name}"? ('rotation' or 'pooled')`);
  }

  /**
   * Handles the type for a new stokvel and creates it.
   */
  async handleStokvelType(session, message) {
    const type = message.text.body.toLowerCase().trim();
    if (type !== 'rotation' && type !== 'pooled') {
      await whatsappClient.sendTextMessage(session.phone, "That's not a valid type. Please choose 'rotation' or 'pooled'.");
      return;
    }

    const { name } = session.mirageState;
    const stokvel = await mockStokvelApi.createStokvel(session.phone, name, type);

    // --- Integration with PayFast and Revenue Engine ---
    const paymentLink = await payfastEngine.generatePaymentLink(
      session.phone,
      this.creationFee,
      `Setup fee for ${stokvel.name}`,
      this.name
    );

    let successMessage = `Congratulations! Your stokvel, "${stokvel.name}", has been created.\n\n`;
    successMessage += `To activate it, please pay the R${this.creationFee} setup fee using this link: ${paymentLink}\n\n`;
    successMessage += `Once paid, you can invite others to join with this code: *${stokvel.inviteCode}*`;
    await whatsappClient.sendTextMessage(session.phone, successMessage);

    // End the mirage session
    await sessionManager.updateSession(session.phone, {
      currentMirage: null,
      mirageState: {},
    });
  }

  /**
   * Handles the invite code for joining a stokvel.
   */
  async handleInviteCode(session, message) {
    const inviteCode = message.text.body.trim().toUpperCase();
    const stokvel = await mockStokvelApi.findStokvelByCode(inviteCode);

    if (!stokvel) {
      await whatsappClient.sendTextMessage(session.phone, "I couldn't find a stokvel with that code. Please double-check and try again.");
      return;
    }

    await mockStokvelApi.joinStokvel(session.phone, stokvel.id);
    await whatsappClient.sendTextMessage(session.phone, `Welcome! you've successfully joined "${stokvel.name}".`);

    // End the mirage session
    await sessionManager.updateSession(session.phone, {
      currentMirage: null,
      mirageState: {},
    });
  }
}

module.exports = new StokvelMirage();