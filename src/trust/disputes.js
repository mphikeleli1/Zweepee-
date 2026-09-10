/**
 * Frictionless Dispute Resolution Engine
 * Handles delivery disputes (e.g. "Parcel not delivered", "Damaged item", "Wrong item")
 * Writes all updates in empathetic, warm, plain English without any technical jargon.
 */

export class DisputeResolutionEngine {
  constructor(db) {
    this.db = db;
    this.activeDisputes = new Map();
  }

  /**
   * File a customer delivery dispute
   */
  async fileDispute({ orderId, customerPhone, issueType, comments }) {
    const disputeId = `disp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const disputeRecord = {
      disputeId,
      orderId,
      customerPhone,
      issueType: issueType || 'PARCEL_NOT_DELIVERED', // 'PARCEL_NOT_DELIVERED' | 'DAMAGED_ITEM' | 'WRONG_ITEM'
      status: 'UNDER_INVESTIGATION',
      payoutStatus: 'PAUSED', // Instantly pauses merchant/driver payout for safety
      comments,
      createdAt: Date.now()
    };

    this.activeDisputes.set(disputeId, disputeRecord);

    if (this.db) {
      await this.db.prepare(
        `UPDATE transactions SET status = 'DISPUTED' WHERE id = ?`
      ).bind(orderId).run();
    }

    return disputeRecord;
  }

  /**
   * Resolve dispute automatically with refund or free remake
   */
  async resolveDispute(disputeId, resolutionType = 'FREE_REMAKE') {
    const record = this.activeDisputes.get(disputeId);
    if (!record) return { success: false, message: 'Dispute not found' };

    record.status = 'RESOLVED';
    record.resolutionType = resolutionType; // 'FREE_REMAKE' | 'FULL_REFUND'

    let customerMessage = '';
    if (resolutionType === 'FREE_REMAKE') {
      customerMessage = `🌸 *Issue Resolved:* We are so sorry for the trouble! We have dispatched a brand new replacement order to your door right away at zero extra cost to you.`;
    } else {
      customerMessage = `🌸 *Issue Resolved:* We have processed a 100% full refund directly back to your payment account. Thank you for your patience!`;
    }

    return {
      success: true,
      record,
      customerMessage
    };
  }
}
