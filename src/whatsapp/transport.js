export class WhatsAppTransportAdapter {
  constructor(providerType = 'META_WEBHOOK') {
    this.providerType = providerType;
  }

  async sendMessage(toPhoneNumber, messagePayload) {
    if (typeof messagePayload === 'string') {
      return this.sendTextMessage(toPhoneNumber, messagePayload);
    }
    return this.sendInteractiveMessage(toPhoneNumber, messagePayload);
  }

  async sendTextMessage(toPhoneNumber, text) {
    return {
      success: true,
      to: toPhoneNumber,
      type: 'TEXT',
      body: text,
      timestamp: Date.now()
    };
  }

  async sendInteractiveMessage(toPhoneNumber, interactivePayload) {
    return {
      success: true,
      to: toPhoneNumber,
      type: interactivePayload.type || 'INTERACTIVE',
      payload: interactivePayload,
      timestamp: Date.now()
    };
  }
}
