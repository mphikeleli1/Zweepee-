/**
 * Strategic P2P Commerce Features Engine
 * Powers safe, frictionless Peer-to-Peer commerce in South Africa.
 */

export class P2PCommerceEngine {
  constructor(db) {
    this.db = db;
    this.sellerTrustScores = new Map();
  }

  /**
   * Get or initialize seller trust score and badges
   */
  getSellerTrustProfile(sellerId) {
    const profile = this.sellerTrustScores.get(sellerId) || {
      sellerId,
      completedDeals: 0,
      disputeCount: 0,
      trustScore: 100, // Percentage 0-100%
      isVerifiedSeller: false,
      badgeText: '⭐ New Seller'
    };

    if (profile.completedDeals >= 5 && profile.trustScore >= 95) {
      profile.isVerifiedSeller = true;
      profile.badgeText = '🛡️ VERIFIED TRUSTED SELLER (100% Safety Rating)';
    }

    return profile;
  }

  /**
   * Record completed P2P transaction to boost seller trust
   */
  recordCompletedDeal(sellerId) {
    const profile = this.getSellerTrustProfile(sellerId);
    profile.completedDeals += 1;
    profile.trustScore = Math.min(100, Math.round((profile.completedDeals / (profile.completedDeals + profile.disputeCount)) * 100));

    if (profile.completedDeals >= 5 && profile.trustScore >= 95) {
      profile.isVerifiedSeller = true;
      profile.badgeText = '🛡️ VERIFIED TRUSTED SELLER (100% Safety Rating)';
    }

    this.sellerTrustScores.set(sellerId, profile);
    return profile;
  }

  /**
   * Calculate 24-Hour Inspection Window Escrow Hold
   */
  createP2PEscrowHold({ transactionId, buyerId, sellerId, amountCents }) {
    const holdHours = 24;
    const releaseTimestamp = Date.now() + (holdHours * 60 * 60 * 1000);

    return {
      transactionId,
      buyerId,
      sellerId,
      amountCents,
      status: 'ESCROW_HELD',
      releaseTimestamp,
      inspectionWindowHours: holdHours,
      noticeText: `🛡️ *Paystack Escrow Protection Active:* Your payment of R${(amountCents / 100).toFixed(2)} is held safely in escrow. You have a 24-hour inspection window after delivery to inspect the item before money is released to the seller.`
    };
  }
}
