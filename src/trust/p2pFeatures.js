/**
 * Strategic P2P Commerce Features Engine
 * Powers safe, frictionless Peer-to-Peer commerce in South Africa.
 */

export class P2PCommerceEngine {
  constructor(db) {
    this.db = db;
    this.sellerTrustScores = new Map();
    this.escrowHolds = new Map();
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
   * Calculate 24-Hour Inspection Window Escrow Hold & 6-Digit Escrow Unlock PIN
   */
  createP2PEscrowHold({ transactionId, buyerId, sellerId, amountCents }) {
    const holdHours = 24;
    const releaseTimestamp = Date.now() + (holdHours * 60 * 60 * 1000);
    const escrowPin = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit PIN

    const hold = {
      transactionId,
      buyerId,
      sellerId,
      amountCents,
      escrowPin,
      status: 'ESCROW_HELD',
      releaseTimestamp,
      inspectionWindowHours: holdHours,
      noticeText: `🛡️ *Paystack Escrow Protection Active:* Your payment of R${(amountCents / 100).toFixed(2)} is held safely in escrow. Your secret 6-digit Escrow Unlock PIN is *${escrowPin}*. Hand this PIN to the seller face-to-face only when satisfied with the item!`
    };

    this.escrowHolds.set(transactionId, hold);
    return hold;
  }

  /**
   * Validates 6-Digit Escrow Release PIN entered by Seller face-to-face
   */
  verifySelfCollectEscrowPin(transactionId, sellerId, enteredPin) {
    const hold = this.escrowHolds.get(transactionId);
    if (!hold) {
      return { success: false, message: 'Escrow transaction record not found.' };
    }

    if (hold.status !== 'ESCROW_HELD') {
      return { success: false, message: 'Escrow funds have already been released or cancelled.' };
    }

    if (hold.escrowPin !== String(enteredPin).trim()) {
      return { success: false, message: '❌ Invalid Escrow Release PIN. Please double check the 6-digit PIN given by the buyer.' };
    }

    hold.status = 'ESCROW_RELEASED_VIA_PIN';
    hold.releasedAt = Date.now();
    this.recordCompletedDeal(hold.sellerId);

    return {
      success: true,
      transactionId,
      status: hold.status,
      message: `🎉 *Escrow Release PIN Verified!* R${(hold.amountCents / 100).toFixed(2)} has been instantly transferred from Paystack Escrow to seller account (${sellerId}). Deal complete!`
    };
  }

  /**
   * Allows buyer to override the 24-hour inspection hold immediately if satisfied with goods.
   */
  buyerReleaseEscrowEarly(transactionId, buyerId) {
    const hold = this.escrowHolds.get(transactionId);
    if (!hold) {
      return {
        success: false,
        message: 'Escrow transaction record not found.'
      };
    }

    if (hold.buyerId !== buyerId) {
      return {
        success: false,
        message: 'Unauthorized: Only the buyer can release escrow funds early.'
      };
    }

    hold.status = 'ESCROW_RELEASED_EARLY_BY_BUYER';
    hold.releasedAt = Date.now();
    this.recordCompletedDeal(hold.sellerId);

    return {
      success: true,
      transactionId,
      status: hold.status,
      message: `🎉 *Escrow Funds Released!* You have approved early release of R${(hold.amountCents / 100).toFixed(2)} to seller (${hold.sellerId}). Thank you for confirming!`
    };
  }
}
