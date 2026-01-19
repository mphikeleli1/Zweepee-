// revenue/engine.js
'use strict';

/**
 * The Universal Revenue Engine.
 * A mock implementation for tracking all financial transactions within the Zweepee ecosystem.
 */
class RevenueEngine {
  constructor() {
    this.name = 'UniversalRevenueEngine';
    this.transactions = [];
    this.commissionRate = 0.025; // A flat 2.5% commission for all transactions
  }

  /**
   * Records a financial transaction.
   * @param {string} mirageName - The name of the mirage where the transaction originated.
   * @param {number} amount - The total transaction amount.
   * @param {string} description - A brief description of the transaction.
   * @returns {Promise<object>} The recorded transaction object.
   */
  async recordTransaction(mirageName, amount, description) {
    const commission = this.calculateCommission(amount);
    const transaction = {
      id: `txn_${Date.now()}`,
      mirageName,
      amount,
      commission,
      netAmount: amount - commission,
      description,
      createdAt: new Date().toISOString(),
    };

    console.log('--- REVENUE ENGINE: Recording Transaction ---');
    console.log(JSON.stringify(transaction, null, 2));
    console.log('-------------------------------------------');

    this.transactions.push(transaction);
    return Promise.resolve(transaction);
  }

  /**
   * Calculates the commission for a given amount.
   * @param {number} amount - The transaction amount.
   * @returns {number} The calculated commission.
   */
  calculateCommission(amount) {
    return amount * this.commissionRate;
  }

  /**
   * Retrieves all recorded transactions.
   * @returns {Promise<Array>} A list of all transactions.
   */
  async getTransactions() {
    return Promise.resolve(this.transactions);
  }
}

module.exports = new RevenueEngine();