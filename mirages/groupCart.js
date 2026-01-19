// mirages/groupCart.js
'use strict';

const mockGroupCartApi = require('../mocks/groupCartApi');
const sessionManager = require('../session/manager');
const whatsappClient = require('../whatsapp/client');

/**
 * The Group Cart Mirage.
 * Guides users through creating and managing group shopping carts.
 */
class GroupCartMirage {
  constructor() {
    this.name = 'GroupCart';
  }

  /**
   * Handles incoming messages for the group cart mirage.
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
      case 'AWAITING_CART_NAME':
        await this.handleCartName(session, message);
        break;
      // Join flow
      case 'AWAITING_INVITE_CODE':
        await this.handleInviteCode(session, message);
        break;
      // Add item flow
      case 'AWAITING_ITEM_DETAILS':
        await this.handleItemDetails(session, message);
        break;
      default:
        await this.start(session);
        break;
    }
  }

  /**
   * Starts the group cart flow.
   */
  async start(session) {
    await sessionManager.updateSession(session.phone, {
      mirageState: { step: 'AWAITING_CHOICE' },
    });
    const welcomeMessage = "Welcome to the Group Cart Mirage! Do you want to 'create' a new cart, 'join' an existing one, or 'add' an item to your current cart?";
    await whatsappClient.sendTextMessage(session.phone, welcomeMessage);
  }

  /**
   * Handles the user's initial choice.
   */
  async handleChoice(session, message) {
    const choice = message.text.body.toLowerCase().trim();
    if (choice.includes('create')) {
      await sessionManager.updateSession(session.phone, {
        mirageState: { step: 'AWAITING_CART_NAME' },
      });
      await whatsappClient.sendTextMessage(session.phone, "What would you like to name your group cart?");
    } else if (choice.includes('join')) {
      await sessionManager.updateSession(session.phone, {
        mirageState: { step: 'AWAITING_INVITE_CODE' },
      });
      await whatsappClient.sendTextMessage(session.phone, "Please enter the invite code for the cart you want to join.");
    } else if (choice.includes('add')) {
        const { cartId } = session.mirageState;
        if (!cartId) {
            await whatsappClient.sendTextMessage(session.phone, "You're not in a cart yet. Please 'create' or 'join' one first.");
            return;
        }
      await sessionManager.updateSession(session.phone, {
        mirageState: { ...session.mirageState, step: 'AWAITING_ITEM_DETAILS' },
      });
      await whatsappClient.sendTextMessage(session.phone, "What item would you like to add? Please provide the name and price (e.g., 'Milk R25').");
    } else {
      await whatsappClient.sendTextMessage(session.phone, "Please choose 'create', 'join', or 'add'.");
    }
  }

  /**
   * Handles the name for a new cart and creates it.
   */
  async handleCartName(session, message) {
    const name = message.text.body.trim();
    const cart = await mockGroupCartApi.createCart(session.phone, name, 'group');

    await sessionManager.updateSession(session.phone, {
        mirageState: { ...session.mirageState, cartId: cart.id },
    });

    let successMessage = `Your group cart, "${cart.name}", is ready!\n\n`;
    successMessage += `Invite others with this code: *${cart.inviteCode}*`;
    await whatsappClient.sendTextMessage(session.phone, successMessage);

    // For simplicity, we end the flow here. A real implementation would loop back to other choices.
    await sessionManager.updateSession(session.phone, { currentMirage: null, mirageState: {} });
  }

  /**
   * Handles the invite code for joining a cart.
   */
  async handleInviteCode(session, message) {
    const inviteCode = message.text.body.trim().toUpperCase();
    const cart = await mockGroupCartApi.findCartByCode(inviteCode);

    if (!cart) {
      await whatsappClient.sendTextMessage(session.phone, "I couldn't find a cart with that code. Please try again.");
      return;
    }

    await sessionManager.updateSession(session.phone, {
        mirageState: { ...session.mirageState, cartId: cart.id },
    });

    await whatsappClient.sendTextMessage(session.phone, `You've joined "${cart.name}"! You can now add items.`);

    // End the flow
    await sessionManager.updateSession(session.phone, { currentMirage: null, mirageState: {} });
  }

  /**
   * Handles adding an item to the current cart.
   */
  async handleItemDetails(session, message) {
    const details = message.text.body.match(/(.+) R(\d+)/);
    if (!details) {
      await whatsappClient.sendTextMessage(session.phone, "Please use the format 'Item Name RPrice' (e.g., 'Bread R20').");
      return;
    }

    const itemName = details[1].trim();
    const price = parseInt(details[2], 10);
    const { cartId } = session.mirageState;

    await mockGroupCartApi.addItemToCart(cartId, itemName, price);
    await whatsappClient.sendTextMessage(session.phone, `Added *${itemName}* to the cart.`);

    // End the flow
    await sessionManager.updateSession(session.phone, { currentMirage: null, mirageState: {} });
  }
}

module.exports = new GroupCartMirage();