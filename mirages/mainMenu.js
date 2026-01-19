// mirages/mainMenu.js
'use strict';

const sessionManager = require('../session/manager');
const whatsappClient = require('../whatsapp/client');

/**
 * The Main Menu Mirage.
 * Displays a list of available mirages to the user.
 */
class MainMenuMirage {
  constructor() {
    this.name = 'MainMenuMirage';
  }

  /**
   * Handles incoming messages for the main menu.
   * For the main menu, we mostly just display the options.
   */
  async handle(session, message) {
    // Lazy-load the registry to prevent circular dependencies
    const { mirageRegistry } = require('./registry');
    const userMessage = message.text.body.toLowerCase().trim();

    // Check if the user's message matches a keyword for a specific mirage
    for (const key in mirageRegistry) {
      const mirageInfo = mirageRegistry[key];
      // Avoid matching the main menu itself
      if (mirageInfo.name === this.name) continue;

      if (mirageInfo.keywords.some(kw => userMessage.includes(kw))) {
        await sessionManager.updateSession(session.phone, { currentMirage: mirageInfo.name });
        // Create a new session object for the handle method to avoid mutation issues
        const updatedSession = await sessionManager.getSession(session.phone);
        await mirageInfo.module.handle(updatedSession, { text: { body: 'START' } }); // Start the selected mirage
        return;
      }
    }

    // If no keyword matches, display the main menu
    await this.displayMenu(session);
  }

  /**
   * Displays the main menu of available mirages.
   */
  async displayMenu(session) {
    // Lazy-load the registry to prevent circular dependencies
    const { mirageRegistry } = require('./registry');
    let menuText = "Welcome to Zweepee! Please choose a service by replying with a keyword:\n\n";

    for (const key in mirageRegistry) {
      const mirage = mirageRegistry[key];
      // Don't show the MainMenu itself in the list
      if (mirage.name === this.name) continue;

      menuText += `*${mirage.name}*: ${mirage.description}\n`;
      menuText += `(e.g., reply with '${mirage.keywords[0]}')\n\n`;
    }

    await whatsappClient.sendTextMessage(session.phone, menuText);
    // The session remains in the main menu, waiting for the user's next message.
    await sessionManager.updateSession(session.phone, { currentMirage: this.name, mirageState: {} });
  }
}

module.exports = new MainMenuMirage();