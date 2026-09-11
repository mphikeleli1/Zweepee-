import { centsToRandsFormatted } from '../lib/money.js';

export class WhatsAppUIBuilder {
  /**
   * JOBS / RECRUITMENT MATCH SCREEN
   */
  renderJobsMatchScreen({ jobTitle, location, quantity, salaryCents, agentName }) {
    return {
      type: 'JOBS_MATCH_SCREEN',
      text: `👔 *Recruitment Matching Result*\n` +
        `───────────────\n\n` +
        `💼 *Role:* ${jobTitle}\n` +
        `📍 *Location:* ${location}\n` +
        `👥 *Quantity Available:* ${quantity} Candidates\n` +
        `💵 *Salary Offered:* ${centsToRandsFormatted(salaryCents)}/month\n` +
        `🏢 *Matched Agent:* ${agentName}\n\n` +
        `───────────────\n` +
        `Tap below to connect agents and initiate candidate interview scheduling!`,
      buttons: [
        { type: 'reply', reply: { id: 'connect_job_agent', title: '🤝 Connect Agents' } }
      ]
    };
  }

  /**
   * PROPERTY / RENTALS MATCH SCREEN
   */
  renderPropertyMatchScreen({ title, location, rentCents, bedrooms, availableFrom, agentName }) {
    return {
      type: 'PROPERTY_MATCH_SCREEN',
      text: `🏡 *Property Rental Matching Result*\n` +
        `───────────────\n\n` +
        `🏠 *Property:* ${title}\n` +
        `📍 *Location:* ${location}\n` +
        `🛏️ *Bedrooms:* ${bedrooms}\n` +
        `💵 *Monthly Rent:* ${centsToRandsFormatted(rentCents)}\n` +
        `📅 *Move-in Date:* ${availableFrom}\n` +
        `🏢 *Listing Agent:* ${agentName}\n\n` +
        `───────────────\n` +
        `Tap below to request a viewing or lock in Paystack lease deposit escrow!`,
      buttons: [
        { type: 'reply', reply: { id: 'connect_prop_agent', title: '🤝 Connect Agent' } }
      ]
    };
  }

  /**
   * TRAVEL & INSURANCE BUNDLE MATCH SCREEN
   */
  renderTravelBundleScreen({ title, components = [], totalBundleCents }) {
    let text = `✈️ *Travel & Holiday Bundle Result*\n` +
      `───────────────\n\n` +
      `🌴 *Bundle Title:* ${title}\n\n` +
      `*Included Service Components:*\n`;

    components.forEach((c, idx) => {
      text += `${idx + 1}️⃣ *${c.name}* — ${centsToRandsFormatted(c.priceCents)}\n`;
    });

    text += `\n───────────────\n` +
      `💳 *PACKAGE TOTAL:* *${centsToRandsFormatted(totalBundleCents)}*\n` +
      `💡 *Single Instant 1-Tap Booking!*`;

    return {
      type: 'BUNDLE_MATCH_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: 'book_travel_bundle', title: `💳 Book Bundle (${centsToRandsFormatted(totalBundleCents)})` } }
      ]
    };
  }

  /**
   * APPLE-LEVEL 1-TAP INSTANT CHECKOUT SCREEN WITH LOCATION & ITEM SWAPPER
   */
  renderOneTapCheckoutScreen({ storeName, itemName, itemPriceCents, vehicleClass, providerName, transportCostCents, totalCustomerPaysCents, deliveryAddress, transactionId }) {
    const vehicleIcon = vehicleClass === 'BIKE' ? '🏍️' : '🚛';

    const text = `✨ *myAI™ Instant Checkout* ✨\n` +
      `───────────────\n\n` +
      `🏬 *Merchant:* ${storeName}\n` +
      `🛍️ *Item Selected:* *${itemName}* (${centsToRandsFormatted(itemPriceCents)})\n` +
      `${vehicleIcon} *Courier:* ${providerName} (${centsToRandsFormatted(transportCostCents)})\n` +
      `📍 *Deliver To:* *${deliveryAddress || 'Saved GPS Location'}*\n\n` +
      `───────────────\n` +
      `💳 *ONE TOTAL:* *${centsToRandsFormatted(totalCustomerPaysCents)}*\n` +
      `🏷️ *0% Store Price Markup Guarantee*`;

    return {
      type: 'ONE_TAP_CHECKOUT_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: `tap_approve_${transactionId}`, title: `💳 Pay ${centsToRandsFormatted(totalCustomerPaysCents)}` } },
        { type: 'reply', reply: { id: 'swap_item', title: '🔄 Swap Item / Menu' } },
        { type: 'reply', reply: { id: 'change_location', title: '📍 Change Address' } }
      ]
    };
  }

  /**
   * Item Swapper Menu Screen
   */
  renderItemSwapperScreen({ storeName, items = [] }) {
    let text = `🏬 *${storeName.toUpperCase()}* — Select Replacement Item\n` +
      `───────────────\n\n`;

    const itemButtons = [];

    items.forEach((item, idx) => {
      text += `${idx + 1}️⃣ *${item.name}*\n` +
        `   💵 *Price:* ${centsToRandsFormatted(item.priceCents)} *(In-Store Price)*\n`;

      if (item.image) {
        text += `   🖼️ *Photo Preview:* ${item.image}\n`;
      }

      text += `\n`;

      itemButtons.push({
        type: 'reply',
        reply: { id: `add_${item.id}`, title: `🔄 Select ${item.name.substring(0, 15)}` }
      });
    });

    text += `───────────────\n` +
      `💬 *Tap below to swap your item instantly!*`;

    return {
      type: 'ITEM_SWAPPER_SCREEN',
      text,
      buttons: itemButtons.slice(0, 3)
    };
  }

  /**
   * Location Switcher Prompt Screen
   */
  renderLocationPromptScreen() {
    return {
      type: 'LOCATION_PROMPT_SCREEN',
      text: `📍 *Where should we deliver this order?*\n` +
        `───────────────\n\n` +
        `Please reply with your new delivery suburb/address (e.g. *Work: Rosebank*), or tap the attachment icon and send a 📍 *GPS Location Pin*!`
    };
  }

  /**
   * GPS Location Pin Confirmation Display
   */
  renderLocationPinCaptured({ lat, lng, addressName }) {
    return {
      type: 'LOCATION_PIN_SCREEN',
      text: `📍 *GPS Delivery Pin Captured!*\n` +
        `───────────────\n\n` +
        `Latitude: *${lat.toFixed(4)}*\n` +
        `Longitude: *${lng.toFixed(4)}*\n` +
        `Address: *${addressName || 'Saved GPS Pin'}*\n\n` +
        `✅ Your myAI™ courier will deliver directly to this exact GPS location!`
    };
  }

  /**
   * SCREEN 1: DISCOVER STORES & MERCHANTS
   */
  renderDiscoverScreen({ stores = [] }) {
    let text = `✨ *myAI™ Live Storefront* ✨\n` +
      `───────────────\n\n` +
      `📍 *Nearby Partner Stores & Universal Click & Collect*\n\n`;

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
      `💡 *0% Markup Guarantee:* You pay the exact same price as in-store across Makro, Dischem, Specsavers, Vets, and any local shop!`;

    return {
      type: 'DISCOVER_SCREEN',
      text,
      buttons: storeButtons
    };
  }

  /**
   * SCREEN 2: ELITE STOREFRONT / PRODUCT CATALOG
   */
  renderProductScreen({ storeName, items = [] }) {
    let text = `🏬 *${storeName.toUpperCase()}* — Live Catalog\n` +
      `───────────────\n\n`;

    const itemButtons = [];

    items.forEach((item, idx) => {
      text += `${idx + 1}️⃣ *${item.name}*\n` +
        `   💵 *Price:* ${centsToRandsFormatted(item.priceCents)} *(In-Store Price)*\n`;

      if (item.image) {
        text += `   🖼️ *Photo Preview:* ${item.image}\n`;
      }

      text += `\n`;

      itemButtons.push({
        type: 'reply',
        reply: { id: `add_${item.id}`, title: `➕ Add ${item.name.substring(0, 15)}` }
      });
    });

    text += `───────────────\n` +
      `💬 *Tap any button below to order instantly!*`;

    return {
      type: 'PRODUCT_SCREEN',
      text,
      buttons: itemButtons.slice(0, 3)
    };
  }

  /**
   * SCREEN 3: UNIFIED CART
   */
  renderCartScreen({ items = [], goodsSubtotalCents }) {
    let text = `🛒 *Your Unified Shopping Cart*\n` +
      `───────────────\n\n`;

    items.forEach((item) => {
      text += `• *${item.name}*\n` +
        `  Qty: 1 × ${centsToRandsFormatted(item.priceCents)}\n`;
    });

    text += `\n───────────────\n` +
      `🏷️ *Goods Subtotal:* ${centsToRandsFormatted(goodsSubtotalCents)} *(0% Markup)*\n\n` +
      `Ready to arrange fast courier delivery to your GPS location?`;

    return {
      type: 'CART_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: 'proceed_delivery', title: '🚚 Select Courier' } }
      ]
    };
  }

  /**
   * SCREEN 4: COURIER DELIVERY SELECTION
   */
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

  /**
   * SCREEN 5 & 6: CONFIRM & PAY
   */
  renderConfirmScreen({ transactionId, totalCustomerPaysCents, isP2P = false, sellerBadge = '🛡️ VERIFIED TRUSTED SELLER' }) {
    let text = `🧾 *Final Order Confirmation*\n` +
      `───────────────\n\n` +
      `💳 *Total All-In Payable:* *${centsToRandsFormatted(totalCustomerPaysCents)}*\n\n`;

    if (isP2P) {
      text += `👤 *Seller Rating:* ${sellerBadge}\n\n` +
        `🛡️ *Paystack 24-Hour Escrow Protection:* Money is safely held in escrow. You get a 24-hour inspection window after delivery before money is released to the seller.\n\n` +
        `⚠️ Both buyer and seller must tap Approve below to authorize.`;
    } else {
      text += `🔒 *Secure Paystack Checkout:* Instant automated Click & Collect order processing with zero manual hassle.`;
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

  /**
   * SCREEN 7: LIVE ORDER TRACKING
   */
  renderLiveOrderScreen({ orderId, status, courierName, driverName = 'Sipho', etaMinutes = 3 }) {
    const text = `📦 *Live Order Tracking*\n` +
      `───────────────\n\n` +
      `🆔 *Order Reference:* ${orderId}\n` +
      `🚦 *Current Status:* *${status}*\n` +
      `🛵 *Your Courier Driver:* *${driverName}* (${courierName})\n\n` +
      `📍 *LIVE DRIVER UPDATE:* Your driver ${driverName} is *${etaMinutes} mins away* from your door!\n\n` +
      `───────────────\n` +
      `You will receive a door photo proof upon arrival. Need help with this order? Reply *Help* or *Problem*.`;

    return {
      type: 'LIVE_ORDER_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: `dispute_${orderId}`, title: '⚠️ Report Issue' } }
      ]
    };
  }

  /**
   * SCREEN 8: DELIVERED & RATING
   */
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
