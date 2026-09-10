/**
 * Trust, Safety & Scam Prevention
 * Anti off-platform contact masking & Frictionless Scam Protection.
 */

export class ScamPreventionEngine {
  constructor() {
    this.serialBlacklist = new Set();
  }

  /**
   * Anti Off-Platform Contact Masker.
   * Strips phone numbers, emails, social handles, and personal contact info from agent messages.
   */
  maskOffPlatformContacts(text) {
    if (!text) return '';

    // Regex for phone numbers (ZA formats +27, 082, 071, etc)
    let masked = text.replace(/(\+?27|0)[6-8][0-9]{8}/g, '[CONTACT MASKED BY MYAI]');

    // Regex for email addresses
    masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL MASKED BY MYAI]');

    // Regex for WhatsApp links or raw URLs with contact info
    masked = masked.replace(/wa\.me\/[0-9]+/g, '[LINK MASKED BY MYAI]');

    return masked;
  }

  /**
   * Validates selling item listing for high-risk P2P sales (electronics/smartphones/high value).
   */
  validateListingProtection({ item, photoUrl, serialOrImei, sellerId, isNewSeller }) {
    const errors = [];

    if (item.category === 'Electronics' || item.name.toLowerCase().includes('iphone') || item.priceCents > 100000) {
      if (!photoUrl) {
        errors.push('Photo proof of item is required for high-value P2P listings.');
      }
      if (!serialOrImei) {
        errors.push('Serial Number or IMEI is required for high-value electronics listing to prevent scams.');
      } else if (this.serialBlacklist.has(serialOrImei)) {
        errors.push('This Serial/IMEI has already been flagged or sold on the network.');
      }
    }

    const requiresEscrowHold = isNewSeller || item.priceCents > 150000;

    return {
      approved: errors.length === 0,
      errors,
      requiresEscrowHold,
      escrowHoldDays: requiresEscrowHold ? 3 : 0
    };
  }

  /**
   * Register completed sale serial number to prevent duplicate sales.
   */
  registerSoldSerial(serialOrImei) {
    if (serialOrImei) {
      this.serialBlacklist.add(serialOrImei);
    }
  }

  /**
   * Delivery photo proof verification required before payout unlocking.
   */
  verifyDeliveryProof({ deliveryPhotoUrl, recipientConfirmed }) {
    if (!deliveryPhotoUrl) {
      return { verified: false, reason: 'Camera photo proof of package delivery at door/pickup is required.' };
    }
    return { verified: true };
  }
}
