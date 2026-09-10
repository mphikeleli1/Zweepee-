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
