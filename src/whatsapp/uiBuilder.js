import { centsToRandsFormatted } from '../lib/money.js';

export class WhatsAppUIBuilder {
  /**
   * SCREEN 1: DISCOVER
   */
  renderDiscoverScreen({ stores = [] }) {
    let text = `📍 *Near You*\n\n`;
    const storeButtons = [];

    stores.forEach((store, idx) => {
      text += `${idx + 1}. *${store.name}* (${store.category})\n`;
      if (store.image) text += `🖼️ ${store.image}\n`;
      text += `\n`;
      storeButtons.push({
        type: 'reply',
        reply: { id: `store_${store.id}`, title: store.name }
      });
    });

    return {
      type: 'DISCOVER_SCREEN',
      text,
      buttons: storeButtons
    };
  }

  /**
   * SCREEN 2: PRODUCT / STOREFRONT
   */
  renderProductScreen({ storeName, items = [] }) {
    let text = `🏪 *${storeName} Catalog*\n\n`;
    const itemButtons = [];

    items.forEach((item) => {
      text += `• *${item.name}* - ${centsToRandsFormatted(item.priceCents)}\n`;
      if (item.image) text += `🖼️ Image: ${item.image}\n`;
      text += `\n`;

      itemButtons.push({
        type: 'reply',
        reply: { id: `add_${item.id}`, title: `Add ${item.name}` }
      });
    });

    return {
      type: 'PRODUCT_SCREEN',
      text,
      buttons: itemButtons
    };
  }

  /**
   * SCREEN 3: UNIFIED CART
   */
  renderCartScreen({ items = [], goodsSubtotalCents }) {
    let text = `🛒 *Unified Cart*\n\n`;

    items.forEach((item) => {
      text += `• ${item.qty || 1}x ${item.name} (${centsToRandsFormatted(item.priceCents)})\n`;
    });

    text += `\n*Goods Subtotal:* ${centsToRandsFormatted(goodsSubtotalCents)} (0% Markup)\n`;

    return {
      type: 'CART_SCREEN',
      text,
      buttons: [{ type: 'reply', reply: { id: 'proceed_delivery', title: 'Arrange Delivery' } }]
    };
  }

  /**
   * SCREEN 4: DELIVERY
   */
  renderDeliveryScreen({ vehicleClass, providerName, transportCostCents, etaMinutes }) {
    const text = `🚚 *Courier Selection*\n\n` +
      `• *Vehicle Class:* ${vehicleClass}\n` +
      `• *Courier Provider:* ${providerName}\n` +
      `• *Transport Quote:* ${centsToRandsFormatted(transportCostCents)}\n` +
      `• *Estimated Delivery:* ~${etaMinutes} mins\n`;

    return {
      type: 'DELIVERY_SCREEN',
      text,
      buttons: [{ type: 'reply', reply: { id: 'confirm_transport', title: 'Accept Delivery' } }]
    };
  }

  /**
   * SCREEN 5: FINAL PRICE
   */
  renderFinalPriceScreen({ pricing }) {
    const text = `🧾 *Order Price Breakdown*\n\n` +
      `• *Goods Total:* ${centsToRandsFormatted(pricing.goodsSubtotalCents)}\n` +
      `• *Transport Fee:* ${centsToRandsFormatted(pricing.finalTransportCents)}\n` +
      `• *Payment Processing Fee:* ${centsToRandsFormatted(pricing.paymentFeeCents)}\n` +
      `--------------------------------\n` +
      `💰 *ONE TOTAL:* ${centsToRandsFormatted(pricing.totalCustomerPaysCents)}\n`;

    return {
      type: 'FINAL_PRICE_SCREEN',
      text,
      pricing
    };
  }

  /**
   * SCREEN 6: CONFIRM & PAY
   */
  renderConfirmScreen({ transactionId, totalCustomerPaysCents, isP2P = false }) {
    const text = `✅ *Confirm & Pay*\n\n` +
      `Total Payable: *${centsToRandsFormatted(totalCustomerPaysCents)}*\n\n` +
      (isP2P ? `⚠️ *P2P Deal:* Both buyer and seller must tap Approve below to authorize payment.\n` : `Tap Approve to complete payment.\n`);

    return {
      type: 'CONFIRM_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: `tap_approve_${transactionId}`, title: '👍 APPROVE & PAY' } },
        { type: 'reply', reply: { id: `tap_cancel_${transactionId}`, title: '❌ CANCEL' } }
      ]
    };
  }

  /**
   * SCREEN 7: LIVE ORDER
   */
  renderLiveOrderScreen({ orderId, status, courierName, etaMinutes }) {
    const text = `📦 *Live Order Tracking*\n\n` +
      `Order ID: *${orderId}*\n` +
      `Status: *${status}*\n` +
      `Assigned Courier: *${courierName}*\n` +
      `ETA: *${etaMinutes} mins*\n`;

    return {
      type: 'LIVE_ORDER_SCREEN',
      text
    };
  }

  /**
   * SCREEN 8: DELIVERED
   */
  renderDeliveredScreen({ orderId, deliveryPhotoUrl }) {
    let text = `🎉 *Delivered!*\n\n` +
      `Order ${orderId} has been successfully delivered to your door.\n`;

    if (deliveryPhotoUrl) {
      text += `📷 *Door Photo Proof:* ${deliveryPhotoUrl}\n`;
    }

    text += `\nHow was your service today?`;

    return {
      type: 'DELIVERED_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: `rate_5`, title: '⭐⭐⭐⭐⭐ Excellent' } },
        { type: 'reply', reply: { id: `rate_3`, title: '⭐⭐⭐ Good' } }
      ]
    };
  }
}
