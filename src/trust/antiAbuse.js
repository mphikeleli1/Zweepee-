/**
 * Anti-Abuse, Anti-Trolling & Anti-Gaming Guard Engine
 * Handles profanity, spam flooding, trolling, and system gaming.
 */

export class AntiAbuseGuardEngine {
  constructor() {
    this.userMessageHistory = new Map(); // waId -> Array of timestamps
    this.userCooldowns = new Map(); // waId -> timestamp until cooldown ends
    this.userListingCounts = new Map(); // waId -> count of listings today

    this.profanityList = [
      'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'poes', 'voetsek', 'piss',
      'cunt', 'dick', 'cock', 'ho', 'slut', 'naai', 'fkn'
    ];
  }

  /**
   * Check if user is currently in a spam cooldown period
   */
  isCoolingDown(waId) {
    const cooldownUntil = this.userCooldowns.get(waId);
    if (cooldownUntil && Date.now() < cooldownUntil) {
      const remainingMins = Math.ceil((cooldownUntil - Date.now()) / 60000);
      return {
        isBlocked: true,
        message: `Whoops! You're sending messages a bit too fast. Please take a quick ${remainingMins}-minute break and I'll be ready to help you again!`
      };
    }
    return { isBlocked: false };
  }

  /**
   * Screen inbound message for profanity, trolling, or spam flooding
   */
  screenInboundMessage(waId, text) {
    const now = Date.now();

    // 1. Check existing cooldown
    const cooldownCheck = this.isCoolingDown(waId);
    if (cooldownCheck.isBlocked) return cooldownCheck;

    // 2. Rate Limiting / Velocity Check (Max 10 messages per 30 seconds)
    const history = this.userMessageHistory.get(waId) || [];
    const recentHistory = history.filter(ts => (now - ts) < 30000);
    recentHistory.push(now);
    this.userMessageHistory.set(waId, recentHistory);

    if (recentHistory.length > 10) {
      const cooldownEnd = now + (5 * 60 * 1000); // 5 minute cooldown
      this.userCooldowns.set(waId, cooldownEnd);
      return {
        isBlocked: true,
        message: `Whoops! You're sending messages a bit too fast. Please take a quick 5-minute break and I'll be ready to help you again!`
      };
    }

    // 3. Profanity & Bad Language Check
    const lowerText = (text || '').toLowerCase();
    const containsProfanity = this.profanityList.some(badWord => {
      const regex = new RegExp(`\\b${badWord}\\b`, 'i');
      return regex.test(lowerText);
    });

    if (containsProfanity) {
      return {
        isBlocked: true,
        message: `I'm here to help you buy, sell, or arrange deliveries! Let's keep our conversation friendly. What can I help you order today?`
      };
    }

    return { isBlocked: false };
  }

  /**
   * Anti-Gaming Check for Listing Spam
   */
  /**
   * RSA ID Age Gate Verification (Extracts DOB from 13-digit RSA ID Number)
   */
  verifyAgeGate(rsaIdNumber) {
    const cleaned = String(rsaIdNumber || '').replace(/[^0-9]/g, '');
    if (cleaned.length !== 13) {
      return { isAdult: false, age: 0, reason: 'Please provide a valid 13-digit RSA Identity Number for liquor/age-restricted orders.' };
    }

    const yearPrefix = parseInt(cleaned.substring(0, 2), 10);
    const month = parseInt(cleaned.substring(2, 4), 10);
    const day = parseInt(cleaned.substring(4, 6), 10);

    const currentYear = new Date().getFullYear();
    const currentYearShort = currentYear % 100;

    // Century determination (00-25 -> 2000s, 26-99 -> 1900s)
    const birthYear = yearPrefix <= currentYearShort ? (2000 + yearPrefix) : (1900 + yearPrefix);
    const birthDate = new Date(birthYear, month - 1, day);

    let age = currentYear - birthYear;
    const now = new Date();
    if (now.getMonth() < (month - 1) || (now.getMonth() === (month - 1) && now.getDate() < day)) {
      age--;
    }

    const isAdult = age >= 18;

    return {
      isAdult,
      age,
      reason: isAdult ? 'Verified: Age >= 18 years old.' : `Age verification failed: Customer is ${age} years old (must be 18+ for alcohol).`
    };
  }

  validateListingVelocity(waId) {
    const count = (this.userListingCounts.get(waId) || 0) + 1;
    this.userListingCounts.set(waId, count);

    if (count > 5) {
      return {
        allowed: false,
        message: `You've created several listings today! To prevent spam, please complete your current listings before creating more.`
      };
    }

    return { allowed: true };
  }
}
