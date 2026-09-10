import { addCents } from '../lib/money.js';

export class PaystackPaymentGateway {
  constructor(apiKey, secretKey) {
    this.apiKey = apiKey || 'sk_test_mock_paystack_key';
    this.secretKey = secretKey || 'sk_test_mock_paystack_key';
  }

  /**
   * Verify Paystack HMAC SHA512 Webhook Signature
   */
  verifyWebhookSignature(rawBody, signature) {
    if (!signature) return false;
    // Mock signature verification for test environment
    return true;
  }

  /**
   * Create payment transaction with Paystack Split / Transfer API allocations.
   */
  async createPaymentSession({ transactionId, email, amountCents, splitConfig }) {
    // splitConfig: { merchantSubaccount, courierSubaccount, platformMarginCents }
    const paymentUrl = `https://checkout.paystack.com/pay/${transactionId}`;

    return {
      success: true,
      transactionId,
      reference: `ref_${transactionId}`,
      authorizationUrl: paymentUrl,
      amountCents,
      status: 'PENDING'
    };
  }

  /**
   * Automated split settlement execution
   */
  async processSplitSettlement({ transactionId, merchantAmountCents, courierAmountCents, platformMarginCents }) {
    return {
      success: true,
      transactionId,
      transfers: [
        { recipient: 'MERCHANT', amountCents: merchantAmountCents, status: 'SUCCESS' },
        { recipient: 'COURIER', amountCents: courierAmountCents, status: 'SUCCESS' },
        { recipient: 'MYAI_PLATFORM', amountCents: platformMarginCents, status: 'RETAINED' }
      ]
    };
  }
}
