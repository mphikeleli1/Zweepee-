export class CloudflareEmailService {
  constructor(domain = 'myai.co.za') {
    this.domain = domain;
    this.sender = `outbound@${domain}`;
  }

  async sendEmail({ to, subject, bodyText, attachmentKey }) {
    return {
      success: true,
      sender: this.sender,
      recipient: to,
      subject,
      attachmentKey,
      messageId: `msg_cf_email_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now()
    };
  }
}

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
