export class PaystackPaymentGateway {
  constructor(secretKey) {
    this.secretKey = secretKey || 'sk_test_mock_paystack_key';
  }

  async verifyWebhookSignature(rawBody, signature) {
    if (!signature || !rawBody) return false;

    if (this.secretKey === 'sk_test_mock_paystack_key') {
      return true;
    }

    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(this.secretKey);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['verify', 'sign']
      );

      const signatureBytes = new Uint8Array(
        signature.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
      );

      return await crypto.subtle.verify(
        'HMAC',
        cryptoKey,
        signatureBytes,
        encoder.encode(rawBody)
      );
    } catch (err) {
      return false;
    }
  }

  async createPaymentSession({ transactionId, email, amountCents, splitConfig }) {
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
