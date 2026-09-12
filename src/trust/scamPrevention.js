export class ScamPreventionEngine {
  constructor() {
    this.serialBlacklist = new Set();
  }

  maskOffPlatformContacts(text) {
    if (!text) return '';

    let masked = text.replace(/(\+?27|0)[1-9][0-9]{8}/g, '[CONTACT MASKED BY MYAI]');
    masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL MASKED BY MYAI]');
    masked = masked.replace(/wa\.me\/[0-9]+/g, '[LINK MASKED BY MYAI]');
    masked = masked.replace(/t\.me\/[a-zA-Z0-9_]+/g, '[LINK MASKED BY MYAI]');
    masked = masked.replace(/\b[0-9]{8,11}\b/g, '[ACCOUNT MASKED BY MYAI]');

    return masked;
  }

  isValidIMEI(imei) {
    if (!imei) return false;
    const cleaned = String(imei).replace(/[^0-9]/g, '');
    if (cleaned.length !== 15) return false;

    let sum = 0;
    for (let i = 0; i < 15; i++) {
      let digit = parseInt(cleaned.charAt(i), 10);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return sum % 10 === 0;
  }

  validateListingProtection({ item = {}, photoUrl, serialOrImei, sellerId, isNewSeller } = {}) {
    const errors = [];

    const itemName = (item.name || '').toLowerCase();
    const itemCategory = item.category || 'General';
    const priceCents = item.priceCents || 0;

    const isHighRisk = itemCategory === 'Electronics' ||
      itemName.includes('iphone') ||
      itemName.includes('samsung') ||
      priceCents > 100000;

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

    const escrowHoldDays = requiresEscrowHold ? 3 : 0;
    const escrowHoldNotice = requiresEscrowHold
      ? `3-Day Escrow Security Hold Active for seller ${sellerId || 'P2P'}`
      : 'Standard Instant P2P Escrow';

    return {
      approved: errors.length === 0,
      errors,
      requiresEscrowHold,
      escrowHoldDays,
      escrowHoldNotice
    };
  }

  registerSoldSerial(serialOrImei) {
    if (serialOrImei) {
      this.serialBlacklist.add(serialOrImei);
    }
  }

  verifyDeliveryProof({ deliveryPhotoUrl }) {
    if (!deliveryPhotoUrl) {
      return { verified: false, reason: 'Camera photo proof of package delivery at door/pickup is required.' };
    }
    return { verified: true };
  }
}
