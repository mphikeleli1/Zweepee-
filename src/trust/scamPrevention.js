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
   * Strips phone numbers, emails, social handles, bank account numbers, and personal contact info from agent messages.
   */
  maskOffPlatformContacts(text) {
    if (!text) return '';

    // Regex for ZA phone numbers (+27 or 06/07/08/01)
    let masked = text.replace(/(\+?27|0)[1-9][0-9]{8}/g, '[CONTACT MASKED BY MYAI]');

    // Regex for email addresses
    masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL MASKED BY MYAI]');

    // Regex for WhatsApp wa.me or chat links
    masked = masked.replace(/wa\.me\/[0-9]+/g, '[LINK MASKED BY MYAI]');
    masked = masked.replace(/t\.me\/[a-zA-Z0-9_]+/g, '[LINK MASKED BY MYAI]');

    // Regex for SA Bank Account numbers (8-11 digits pattern)
    masked = masked.replace(/\b[0-9]{8,11}\b/g, '[ACCOUNT MASKED BY MYAI]');

    return masked;
  }

  /**
   * Standard Luhn Algorithm validation for IMEI numbers.
   */
  isValidIMEI(imei) {
    if (!imei) return false;
    const cleaned = String(imei).replace(/[^0-9]/g, '');
    if (cleaned.length !== 15) return false;

    let sum = 0;
    for (let i = 0; i < 15; i++) {
      let digit = parseInt(cleaned.charAt(i), 10);
      // Double every second digit starting from position 2 (0-indexed position 1, 3, 5, 7, 9, 11, 13)
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return sum % 10 === 0;
  }

  /**
   * Validates selling item listing for high-risk P2P sales (electronics/smartphones/high value).
   */
  validateListingProtection({ item, photoUrl, serialOrImei, sellerId, isNewSeller }) {
    const errors = [];

    const isHighRisk = item.category === 'Electronics' ||
      item.name.toLowerCase().includes('iphone') ||
      item.name.toLowerCase().includes('samsung') ||
      item.priceCents > 100000;

    if (isHighRisk) {
      if (!photoUrl) {
        errors.push('Photo proof of item is required for high-value P2P listings.');
      }

      if (!serialOrImei) {
        errors.push('Serial Number or IMEI is required for high-value electronics listing to prevent scams.');
      } else {
        const isImei = String(serialOrImei).replace(/[^0-9]/g, '').length === 15;
        if (isImei && !this.isValidIMEI(serialOrImei)) {
          errors.push('Invalid IMEI number provided.');
        }

        if (this.serialBlacklist.has(serialOrImei)) {
          errors.push('This Serial/IMEI has already been flagged or sold on the network.');
        }
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
  verifyDeliveryProof({ deliveryPhotoUrl }) {
    if (!deliveryPhotoUrl) {
      return { verified: false, reason: 'Camera photo proof of package delivery at door/pickup is required.' };
    }
    return { verified: true };
  }
}
