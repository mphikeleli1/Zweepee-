export const TRANSACTION_STATES = {
  INTENT: 'INTENT',
  MATCHED: 'MATCHED',
  QUOTED: 'QUOTED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  AUTHORISED: 'AUTHORISED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',
  COLLECTING: 'COLLECTING',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED'
};

const VALID_TRANSITIONS = {
  [TRANSACTION_STATES.INTENT]: [TRANSACTION_STATES.MATCHED, TRANSACTION_STATES.FAILED, TRANSACTION_STATES.CANCELLED],
  [TRANSACTION_STATES.MATCHED]: [TRANSACTION_STATES.QUOTED, TRANSACTION_STATES.FAILED, TRANSACTION_STATES.CANCELLED],
  [TRANSACTION_STATES.QUOTED]: [TRANSACTION_STATES.PENDING_APPROVAL, TRANSACTION_STATES.FAILED, TRANSACTION_STATES.CANCELLED],
  [TRANSACTION_STATES.PENDING_APPROVAL]: [TRANSACTION_STATES.AUTHORISED, TRANSACTION_STATES.CANCELLED, TRANSACTION_STATES.FAILED],
  [TRANSACTION_STATES.AUTHORISED]: [TRANSACTION_STATES.PAYMENT_PENDING, TRANSACTION_STATES.CANCELLED, TRANSACTION_STATES.FAILED],
  [TRANSACTION_STATES.PAYMENT_PENDING]: [TRANSACTION_STATES.PAID, TRANSACTION_STATES.FAILED, TRANSACTION_STATES.CANCELLED],
  [TRANSACTION_STATES.PAID]: [TRANSACTION_STATES.COLLECTING, TRANSACTION_STATES.CANCELLED, TRANSACTION_STATES.REFUNDED],
  [TRANSACTION_STATES.COLLECTING]: [TRANSACTION_STATES.IN_TRANSIT, TRANSACTION_STATES.FAILED, TRANSACTION_STATES.CANCELLED, TRANSACTION_STATES.REFUNDED],
  [TRANSACTION_STATES.IN_TRANSIT]: [TRANSACTION_STATES.DELIVERED, TRANSACTION_STATES.DISPUTED, TRANSACTION_STATES.REFUNDED],
  [TRANSACTION_STATES.DELIVERED]: [TRANSACTION_STATES.COMPLETED, TRANSACTION_STATES.DISPUTED, TRANSACTION_STATES.REFUNDED],
  [TRANSACTION_STATES.COMPLETED]: [],
  [TRANSACTION_STATES.FAILED]: [],
  [TRANSACTION_STATES.CANCELLED]: [],
  [TRANSACTION_STATES.REFUNDED]: [],
  [TRANSACTION_STATES.DISPUTED]: [TRANSACTION_STATES.REFUNDED, TRANSACTION_STATES.COMPLETED]
};

export class TransactionStateMachine {
  constructor(transactionData) {
    this.id = transactionData.id;
    this.intentMode = transactionData.intentMode; // 'BUY_PLUS_DELIVER', 'A2A_SELL', 'P2P_SALE', etc.
    this.state = transactionData.state || TRANSACTION_STATES.INTENT;
    this.humanApprovalBuyer = Boolean(transactionData.humanApprovalBuyer);
    this.humanApprovalSeller = Boolean(transactionData.humanApprovalSeller);
    this.history = transactionData.history || [{ state: this.state, timestamp: Date.now() }];
  }

  canTransitionTo(nextState) {
    const allowed = VALID_TRANSITIONS[this.state] || [];
    return allowed.includes(nextState);
  }

  registerBuyerApproval() {
    this.humanApprovalBuyer = true;
  }

  registerSellerApproval() {
    this.humanApprovalSeller = true;
  }

  transitionTo(nextState, context = {}) {
    if (!this.canTransitionTo(nextState)) {
      throw new Error(`Invalid state transition from ${this.state} to ${nextState}`);
    }

    // ENHANCEMENT CLARIFICATION 5: PENDING_APPROVAL -> AUTHORISED Approval Gate Enforcement
    if (this.state === TRANSACTION_STATES.PENDING_APPROVAL && nextState === TRANSACTION_STATES.AUTHORISED) {
      const isP2P = ['A2A_SELL', 'A2A_BUY', 'P2P_SALE'].includes(this.intentMode);

      if (isP2P) {
        // P2P / A2A requires human approval from BOTH buyer AND seller
        if (!this.humanApprovalBuyer || !this.humanApprovalSeller) {
          throw new Error('Approval Gate Block: Both buyer and seller human approvals are required for P2P/A2A deals before AUTHORISED state');
        }
      } else {
        // Store purchase requires human approval from buyer
        if (!this.humanApprovalBuyer) {
          throw new Error('Approval Gate Block: Buyer human approval is required before AUTHORISED state');
        }
      }
    }

    this.state = nextState;
    this.history.push({ state: nextState, timestamp: Date.now(), context });

    return {
      success: true,
      newState: this.state,
      history: this.history
    };
  }
}
