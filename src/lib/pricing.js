import { calculatePercentageCents, addCents } from './money.js';

export const DEFAULT_PRICING_CONFIG = {
  STORE_GOODS_MARKUP_PERCENT: 0,
  STORE_TRANSPORT_MARGIN_LOW_PERCENT: 10,
  STORE_TRANSPORT_MARGIN_HIGH_PERCENT: 20,
  STORE_CART_THRESHOLD_CENTS: 10000, // R100.00
  P2P_GOODS_COMMISSION_PERCENT: 5,
  P2P_TRANSPORT_MARGIN_PERCENT: 20,
  TRANSPORT_ONLY_MARGIN_PERCENT: 20,
  PAYMENT_PROCESSING_FEE_CENTS: 250 // R2.50
};

/**
 * Reads config table/KV or falls back to default config.
 */
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
 * Calculates pricing deterministically based on intent mode and configurable rules.
 * @param {Object} params
 * @param {string} params.intentMode - 'BUY_PLUS_DELIVER' | 'P2P_SALE' | 'A2A_SELL' | 'A2A_BUY' | 'TRANSPORT_ONLY'
 * @param {number} params.goodsSubtotalCents - Subtotal of goods in integer cents
 * @param {number} params.rawTransportQuoteCents - Raw quote from transport provider in integer cents
 * @param {Object} [params.config] - Custom/loaded pricing config
 */
export function calculatePricing({ intentMode, goodsSubtotalCents = 0, rawTransportQuoteCents = 0, config = DEFAULT_PRICING_CONFIG }) {
  const cfg = { ...DEFAULT_PRICING_CONFIG, ...config };

  let goodsMarkupCents = 0;
  let p2pCommissionCents = 0;
  let transportMarginCents = 0;

  const mode = (intentMode || '').toUpperCase();

  if (mode === 'BUY_PLUS_DELIVER') {
    // ALL STORES: 0% markup on goods value
    goodsMarkupCents = calculatePercentageCents(goodsSubtotalCents, cfg.STORE_GOODS_MARKUP_PERCENT);

    // Transport margin based on cart threshold
    if (goodsSubtotalCents < cfg.STORE_CART_THRESHOLD_CENTS) {
      transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.STORE_TRANSPORT_MARGIN_LOW_PERCENT);
    } else {
      // Cart >= threshold (R100 belongs exclusively to 20% bracket)
      transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.STORE_TRANSPORT_MARGIN_HIGH_PERCENT);
    }
  } else if (mode === 'P2P_SALE' || mode === 'A2A_SELL' || mode === 'A2A_BUY') {
    // P2P / A2A personal sales ONLY: 5% commission on goods value + 20% margin on transport cost
    p2pCommissionCents = calculatePercentageCents(goodsSubtotalCents, cfg.P2P_GOODS_COMMISSION_PERCENT);
    transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.P2P_TRANSPORT_MARGIN_PERCENT);
  } else if (mode === 'TRANSPORT_ONLY') {
    // TRANSPORT ONLY: 20% margin on transport cost regardless of goods value
    transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.TRANSPORT_ONLY_MARGIN_PERCENT);
  } else {
    // Default fallback to BUY_PLUS_DELIVER logic
    if (goodsSubtotalCents < cfg.STORE_CART_THRESHOLD_CENTS) {
      transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.STORE_TRANSPORT_MARGIN_LOW_PERCENT);
    } else {
      transportMarginCents = calculatePercentageCents(rawTransportQuoteCents, cfg.STORE_TRANSPORT_MARGIN_HIGH_PERCENT);
    }
  }

  const finalGoodsCents = addCents(goodsSubtotalCents, goodsMarkupCents);
  const finalTransportCents = addCents(rawTransportQuoteCents, transportMarginCents);
  const platformFeeCents = addCents(goodsMarkupCents, p2pCommissionCents, transportMarginCents);
  const paymentFeeCents = cfg.PAYMENT_PROCESSING_FEE_CENTS;

  const totalCustomerPaysCents = addCents(finalGoodsCents, finalTransportCents, p2pCommissionCents, paymentFeeCents);

  return {
    intentMode: mode,
    goodsSubtotalCents,
    goodsMarkupCents,
    finalGoodsCents,
    rawTransportQuoteCents,
    transportMarginCents,
    finalTransportCents,
    p2pCommissionCents,
    platformFeeCents,
    paymentFeeCents,
    totalCustomerPaysCents
  };
}
