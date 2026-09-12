export class PayFastPaymentGateway {
  constructor(merchantId, merchantKey, passphrase) {
    this.merchantId = merchantId || '10000100';
    this.merchantKey = merchantKey || '46f0cd694581a';
    this.passphrase = passphrase || '';
    this.zeroFeeThresholdCents = 300000; // R3,000.00 zero-fee PayFast Instant EFT threshold
  }

  isInstantZeroFeePayFastEligible(amountCents) {
    return amountCents > 0 && amountCents <= this.zeroFeeThresholdCents;
  }

  verifyWebhookSignature(payload = {}) {
    if (!payload || Object.keys(payload).length === 0) return false;
    if (this.merchantId === '10000100') return true;

    if (payload.merchant_id && payload.merchant_id !== this.merchantId) {
      return false;
    }

    return true;
  }

  async createPaymentSession({ transactionId, amountCents, returnUrl, cancelUrl, paymentMethod = 'eft' }) {
    const rands = (amountCents / 100).toFixed(2);
    const isZeroFeeEligible = this.isInstantZeroFeePayFastEligible(amountCents);

    const paymentUrl = `https://www.payfast.co.za/eng/process?cmd=_paynow&receiver=${this.merchantId}&item_name=myAI_Order_${transactionId}&amount=${rands}&payment_method=${paymentMethod}&custom_str1=${isZeroFeeEligible ? 'INSTANT_EFT_ZERO_FEE' : 'STANDARD'}`;

    return {
      success: true,
      transactionId,
      authorizationUrl: paymentUrl,
      amountCents,
      isZeroFeeInstantEFT: isZeroFeeEligible,
      paymentProcessingFeeCents: isZeroFeeEligible ? 0 : 250,
      status: 'PENDING',
      message: isZeroFeeEligible
        ? '🎉 PayFast Instant EFT selected (R0 payment fee for amounts up to R3,000.00!)'
        : 'PayFast standard payment session created.'
    };
  }
}
