// payfast/engine.js
'use strict';

const revenueEngine = require('../revenue/engine');
const logger = require('../logger');

/**
 * The PayFast Engine.
 * A mock implementation for handling payments via the PayFast gateway.
 */
class PayFastEngine {
  constructor() {
    this.name = 'PayFastEngine';
    this.payfastUrl = 'https://sandbox.payfast.co.za/eng/process';
  }

  /**
   * Generates a payment link for a transaction.
   * @param {string} userPhone - The phone number of the user making the payment.
   * @param {number} amount - The amount to be paid.
   * @param {string} itemName - The name of the item or service being paid for.
   * @param {string} mirageName - The name of the mirage initiating the payment.
   * @returns {Promise<string>} The generated PayFast payment link.
   */
  async generatePaymentLink(userPhone, amount, itemName, mirageName) {
    // First, record the transaction with the revenue engine
    await revenueEngine.recordTransaction(mirageName, amount, `Payment for ${itemName}`);

    // In a real implementation, you would make an API call to PayFast here.
    // For this mock, we'll generate a URL with placeholder data.
    const merchantId = 'DUMMY_MERCHANT_ID';
    const merchantKey = 'DUMMY_MERCHANT_KEY';

    const paymentData = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: 'https://www.example.com/success',
      cancel_url: 'https://www.example.com/cancel',
      notify_url: 'https://www.example.com/notify',
      m_payment_id: `ZWP_${Date.now()}`,
      amount: amount.toFixed(2),
      item_name: itemName,
      // Pre-populate user details if possible
      custom_str1: userPhone,
    };

    const queryString = new URLSearchParams(paymentData).toString();
    const paymentLink = `${this.payfastUrl}?${queryString}`;

    logger.info('--- PAYFAST ENGINE: Generating Link ---', {
      userPhone,
      amount,
      itemName,
      paymentLink,
    });

    return Promise.resolve(paymentLink);
  }
}

module.exports = new PayFastEngine();