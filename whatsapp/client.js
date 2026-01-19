// whatsapp/client.js
'use strict';

const config = require('../config');
const logger = require('../logger');

/**
 * MOCK IMPLEMENTATION
 * Logs the message payload to the console instead of sending it to Meta.
 * @param {object} payload - The JSON payload for the message.
 * @returns {Promise<object>} A mock response.
 */
async function sendMessage(payload) {
  logger.info('--- MOCK WHATSAPP CLIENT: Sending Message ---', { payload });
  // Return a mock response that looks like the real API
  return Promise.resolve({
    messaging_product: 'whatsapp',
    contacts: [{ input: payload.to, wa_id: payload.to }],
    messages: [{ id: `wamid.mock_${Date.now()}` }],
  });
}

/**
 * Sends a simple text message to a user.
 * @param {string} to - The recipient's phone number.
 * @param {string} text - The message text.
 * @returns {Promise<object>} The API response.
 */
async function sendTextMessage(to, text) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      body: text,
    },
  };
  return sendMessage(payload);
}

/**
 * Sends an interactive message to launch a WhatsApp Flow.
 * @param {string} to - The recipient's phone number.
 * @param {string} buttonText - The text for the button that launches the flow.
 * @param {string} flowId - The ID of the WhatsApp Flow to be launched.
 * @param {object} flowData - The initial data to be passed to the Flow's first screen.
 * @returns {Promise<object>} The API response.
 */
async function sendFlowMessage(to, buttonText, flowId, flowData = {}) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: {
        type: 'text',
        text: 'Welcome to Zweepee',
      },
      body: {
        text: 'Please click the button below to start.',
      },
      footer: {
        text: 'Powered by Zweepee Mirages',
      },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: `FLOW_TOKEN_${to}_${Date.now()}`,
          flow_id: flowId,
          flow_cta: buttonText,
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'START_SCREEN',
            data: flowData,
          },
        },
      },
    },
  };
  return sendMessage(payload);
}

module.exports = {
  sendTextMessage,
  sendFlowMessage,
};