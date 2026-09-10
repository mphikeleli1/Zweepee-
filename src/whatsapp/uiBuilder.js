import { centsToRandsFormatted } from '../lib/money.js';

export class WhatsAppUIBuilder {
  renderDiscoverScreen({ stores = [] }) {
    let text = `✨ *myAI™ Live Storefront* ✨\n` +
      `───────────────\n\n` +
      `📍 *Nearby Partner Stores*\n\n`;

    const storeButtons = [];

    stores.forEach((store, idx) => {
      text += `${idx + 1}️⃣ *${store.name}* • ${store.category}\n`;
      if (store.image) text += `🖼️ *Preview:* ${store.image}\n`;
      text += `\n`;

      storeButtons.push({
        type: 'reply',
        reply: { id: `store_${store.id}`, title: `🏬 ${store.name}` }
      });
    });

    text += `───────────────\n` +
      `💡 *0% Markup Guarantee:* You pay the exact same price as in-store!`;

    return {
      type: 'DISCOVER_SCREEN',
      text,
      buttons: storeButtons
    };
  }

  renderProductScreen({ storeName, items = [] }) {
    let text = `🏬 *${storeName.toUpperCase()}* — Live Catalog\n` +
      `───────────────\n\n`;

    const itemButtons = [];

    items.forEach((item, idx) => {
      text += `${idx + 1}️⃣ *${item.name}*\n` +
        `   💵 *Price:* ${centsToRandsFormatted(item.priceCents)} *(In-Store Price)*\n`;

      if (item.image) {
        text += `   🖼️ *Photo:* ${item.image}\n`;
      }

      text += `\n`;

      itemButtons.push({
        type: 'reply',
        reply: { id: `add_${item.id}`, title: `➕ Add ${item.name.substring(0, 15)}` }
      });
    });

    text += `───────────────\n` +
      `💬 *Tap any button below to add to your cart!*`;

    return {
      type: 'PRODUCT_SCREEN',
      text,
      buttons: itemButtons.slice(0, 3)
    };
  }

  renderCartScreen({ items = [], goodsSubtotalCents }) {
    let text = `🛒 *Your Unified Shopping Cart*\n` +
      `───────────────\n\n`;

    items.forEach((item, idx) => {
      text += `• *${item.name}*\n` +
        `  Qty: 1 × ${centsToRandsFormatted(item.priceCents)}\n`;
    });

    text += `\n───────────────\n` +
      `🏷️ *Goods Subtotal:* ${centsToRandsFormatted(goodsSubtotalCents)} *(0% Markup)*\n\n` +
      `Ready to arrange fast courier delivery?`;

    return {
      type: 'CART_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: 'proceed_delivery', title: '🚚 Select Courier' } }
      ]
    };
  }

  renderDeliveryScreen({ vehicleClass, providerName, transportCostCents, etaMinutes }) {
    const vehicleIcon = vehicleClass === 'BIKE' ? '🏍️' : '🚛';

    const text = `🚚 *Delivery & Transport Quote*\n` +
      `───────────────\n\n` +
      `${vehicleIcon} *Vehicle Assigned:* ${vehicleClass}\n` +
      `🏢 *Courier Provider:* ${providerName}\n` +
      `💵 *Transport Cost:* ${centsToRandsFormatted(transportCostCents)}\n` +
      `⏱️ *Estimated Delivery:* ~${etaMinutes} mins\n\n` +
      `───────────────\n` +
      `Tap below to lock in your delivery quote!`;

    return {
      type: 'DELIVERY_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: 'confirm_transport', title: '✅ Accept Delivery' } }
      ]
    };
  }

  renderConfirmScreen({ transactionId, totalCustomerPaysCents, isP2P = false }) {
    let text = `🧾 *Final Order Confirmation*\n` +
      `───────────────\n\n` +
      `💳 *Total All-In Payable:* *${centsToRandsFormatted(totalCustomerPaysCents)}*\n\n`;

    if (isP2P) {
      text += `🛡️ *Agent-to-Agent Protection:* Money is safely held in escrow until you inspect and accept the item on delivery.\n\n` +
        `⚠️ Both buyer and seller must tap Approve below to authorize.`;
    } else {
      text += `🔒 *Secure Paystack Checkout:* Instant automated order processing with zero manual hassle.`;
    }

    return {
      type: 'CONFIRM_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: `tap_approve_${transactionId}`, title: '👍 APPROVE & PAY' } },
        { type: 'reply', reply: { id: `tap_cancel_${transactionId}`, title: '❌ CANCEL' } }
      ]
    };
  }

  renderLiveOrderScreen({ orderId, status, courierName, etaMinutes }) {
    const text = `📦 *Live Order Status*\n` +
      `───────────────\n\n` +
      `🆔 *Order Reference:* ${orderId}\n` +
      `🚦 *Current Status:* *${status}*\n` +
      `🚚 *Assigned Courier:* ${courierName}\n` +
      `⏱️ *ETA:* ~${etaMinutes} mins\n\n` +
      `───────────────\n` +
      `Your courier is en route! You will receive a door photo proof upon arrival.`;

    return {
      type: 'LIVE_ORDER_SCREEN',
      text
    };
  }

  renderDeliveredScreen({ orderId, deliveryPhotoUrl }) {
    let text = `🎉 *Order Delivered!*\n` +
      `───────────────\n\n` +
      `Order *${orderId}* has been successfully delivered to your door.\n\n`;

    if (deliveryPhotoUrl) {
      text += `📷 *Door Delivery Photo Proof:* ${deliveryPhotoUrl}\n\n`;
    }

    text += `How was your myAI™ experience today?`;

    return {
      type: 'DELIVERED_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: 'rate_5', title: '⭐⭐⭐⭐⭐ Excellent' } },
        { type: 'reply', reply: { id: 'rate_3', title: '⭐⭐⭐ Good' } }
      ]
    };
  }
}
