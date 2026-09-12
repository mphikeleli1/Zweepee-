import { calculatePercentageCents, addCents } from './money.js';

export const DEFAULT_PRICING_CONFIG = {
  STORE_GOODS_MARKUP_PERCENT: 0,
  STORE_TRANSPORT_MARGIN_LOW_PERCENT: 10,
  STORE_TRANSPORT_MARGIN_HIGH_PERCENT: 20,
  STORE_CART_THRESHOLD_CENTS: 10000,
  P2P_GOODS_COMMISSION_PERCENT: 5,
  P2P_TRANSPORT_MARGIN_PERCENT: 20,
  TRANSPORT_ONLY_MARGIN_PERCENT: 20,
  JOB_MATCHING_FLAT_FEE_CENTS: 50000, // R500.00 configurable flat rate
  SERVICE_REFERRAL_COMMISSION_PERCENT: 5, // Default 5% affiliate referral commission
  NON_AFFILIATE_SERVICE_FEE_CENTS: 1000, // R10.00 transparent service fee for municipal bills/fines where no provider affiliate rebate exists
  PAYMENT_PROCESSING_FEE_CENTS: 250
};

export async function getPricingConfig(dbOrKv) {
  if (!dbOrKv) return { ...DEFAULT_PRICING_CONFIG };

  try {
    if (typeof dbOrKv.prepare === 'function') {
      const { results } = await dbOrKv.prepare('SELECT key, value FROM pricing_config').all();
      if (results && results.length > 0) {
        const config = { ...DEFAULT_PRICING_CONFIG };
        for (const row of results) {
          config[row.key] = Number(row.value);
        }
        return config;
      }
    }
  } catch (err) {
    // fallback
  }

  return { ...DEFAULT_PRICING_CONFIG };
}

/**
 * Calculates pricing & monetization deterministically for ALL intent modes.
 * Ensures 0% markup on physical store goods, earns affiliate commissions where available,
 * and applies transparent service convenience fees for non-affiliate municipal bill payments (PayAt / 3PE).
 */
export function calculatePricing({
  intentMode,
  goodsSubtotalCents = 0,
  rawTransportQuoteCents = 0,
  hasAffiliateCommissionProgram = true,
  customReferralCommissionPercent = null,
  config = DEFAULT_PRICING_CONFIG
}) {
  const cfg = { ...DEFAULT_PRICING_CONFIG, ...config };

  let goodsMarkupCents = 0;
  let p2pCommissionCents = 0;
  let transportMarginCents = 0;
  let jobMatchingFeeCents = 0;
  let referralCommissionCents = 0;
  let serviceConvenienceFeeCents = 0;

  const mode = (intentMode || '').toUpperCase();

  if (mode === 'BUY_PLUS_DELIVER') {
    // Physical store goods strictly 0% markup
    goodsMarkupCents = calculatePercentageCents(goodsSubtotalCents, cfg.STORE_GOODS_MARKUP_PERCENT);

    if (goodsSubtotalCents < cfg.STORE_CART_THRESHOLD_CENTS) {
      transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.STORE_TRANSPORT_MARGIN_LOW_PERCENT);
    } else {
      transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.STORE_TRANSPORT_MARGIN_HIGH_PERCENT);
    }
  } else if (mode === 'P2P_SALE' || mode === 'A2A_SELL' || mode === 'A2A_BUY') {
    p2pCommissionCents = calculatePercentageCents(goodsSubtotalCents, cfg.P2P_GOODS_COMMISSION_PERCENT);
    transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.P2P_TRANSPORT_MARGIN_PERCENT);
  } else if (mode === 'TRANSPORT_ONLY') {
    transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.TRANSPORT_ONLY_MARGIN_PERCENT);
  } else if (mode === 'JOB_MATCHING') {
    // Flat R500.00 job placement matching fee
    jobMatchingFeeCents = cfg.JOB_MATCHING_FLAT_FEE_CENTS;
  } else if (mode === 'SERVICE_REFERRAL' || mode === 'BILL_PAYMENT') {
    if (hasAffiliateCommissionProgram) {
      // Affiliate Commission earned directly from gateway provider (Flash 3%, Travelpayouts 7%, Amadeus 5%, Airalo 10%, Quicket 5%, Awin 7%)
      const effectiveReferralRate = (customReferralCommissionPercent !== null && customReferralCommissionPercent !== undefined)
        ? Number(customReferralCommissionPercent)
        : cfg.SERVICE_REFERRAL_COMMISSION_PERCENT;

      referralCommissionCents = calculatePercentageCents(goodsSubtotalCents, effectiveReferralRate);
    } else {
      // Transparent convenience fee for municipal bills (PayAt / 3PE rates, traffic fines, SABC) where no provider rebate exists
      serviceConvenienceFeeCents = cfg.NON_AFFILIATE_SERVICE_FEE_CENTS;
    }
  } else {
    if (goodsSubtotalCents < cfg.STORE_CART_THRESHOLD_CENTS) {
      transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.STORE_TRANSPORT_MARGIN_LOW_PERCENT);
    } else {
      transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.STORE_TRANSPORT_MARGIN_HIGH_PERCENT);
    }
  }

  const finalGoodsCents = addCents(goodsSubtotalCents, goodsMarkupCents);
  const finalTransportCents = addCents(rawTransportQuoteCents, transportMarginCents);
  const platformFeeCents = addCents(goodsMarkupCents, p2pCommissionCents, transportMarginCents, jobMatchingFeeCents, referralCommissionCents, serviceConvenienceFeeCents);
  const paymentFeeCents = cfg.PAYMENT_PROCESSING_FEE_CENTS;

  const totalCustomerPaysCents = addCents(finalGoodsCents, finalTransportCents, p2pCommissionCents, jobMatchingFeeCents, serviceConvenienceFeeCents, paymentFeeCents);

  return {
    intentMode: mode,
    goodsSubtotalCents,
    goodsMarkupCents,
    finalGoodsCents,
    rawTransportQuoteCents,
    transportMarginCents,
    finalTransportCents,
    p2pCommissionCents,
    jobMatchingFeeCents,
    referralCommissionCents,
    serviceConvenienceFeeCents,
    platformFeeCents,
    paymentFeeCents,
    totalCustomerPaysCents
  };
}
