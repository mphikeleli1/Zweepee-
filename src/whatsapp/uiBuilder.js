import { centsToRandsFormatted } from '../lib/money.js';
import { translate } from '../lib/i18n.js';

export class WhatsAppUIBuilder {
  /**
   * PROACTIVE INTELLIGENT SOURCING CLARIFICATION SCREEN
   */
  renderProactiveClarificationScreen({ query, productCategory = 'Product' }) {
    return {
      type: 'PROACTIVE_CLARIFICATION_SCREEN',
      text: `🔍 *myAI™ Intelligent Sourcing Clarification*\n` +
        `───────────────\n\n` +
        `Looking for *${query}*!\n\n` +
        `To source your exact item with 0% store price markup, please specify:\n` +
        `• *Preferred Store:* (e.g. Takealot, Makro, HiFi Corp, Dischem)\n` +
        `• *Condition:* New or Pre-owned?\n` +
        `• *Budget:* (e.g. Under R1,500)\n\n` +
        `Or tap a quick option below:`,
      buttons: [
        { type: 'reply', reply: { id: 'clarify_new_budget', title: '🎧 New under R1,500' } },
        { type: 'reply', reply: { id: 'clarify_premium_new', title: '🎧 Premium Brand' } },
        { type: 'reply', reply: { id: 'clarify_any_deal', title: '🏷️ Best Value Deal' } }
      ]
    };
  }

  renderEmploymentPackScreen({ candidateName, packPriceCents = 0, transactionId, cvPreviewUrl, z83PreviewUrl }) {
    const text = `💼 *myAI™ Employment Readiness Pack (FREE)* 💼\n` +
      `───────────────\n\n` +
      `👤 *Candidate:* ${candidateName || 'Job Seeker'}\n\n` +
      `*Included Free Bundle (R0.00):*\n` +
      `• 📄 ATS Professional CV (Text & PDF)\n` +
      `• 📋 Official Z83 Government Form (Auto-Filled)\n` +
      `• ✉️ Tailored Cover Letter\n` +
      `• 💡 SA Interview Preparation Guide\n` +
      `• 🚀 Auto-Broadcast to Verified SA Employers\n\n` +
      `🖼️ *CV PDF:* ${cvPreviewUrl || 'https://cdn.myai.co.za/cv/preview.pdf'}\n` +
      `🖼️ *Z83 PDF:* ${z83PreviewUrl || 'https://cdn.myai.co.za/z83/preview.pdf'}\n\n` +
      `───────────────\n` +
      `🎁 *TOTAL:* *FREE (R0.00)*\n` +
      `Tap below to unlock your complete pack instantly!`;

    return {
      type: 'EMPLOYMENT_PACK_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: `tap_approve_${transactionId}`, title: '📄 Unlock Free Readiness Pack' } },
        { type: 'reply', reply: { id: `tap_cancel_${transactionId}`, title: '❌ Cancel' } }
      ]
    };
  }

  /**
   * JOBS / RECRUITMENT MATCH SCREEN
   */
  renderJobsMatchScreen({ jobTitle, location, quantity, salaryCents, agentName }) {
    let tierNotice = 'R500.00 Flat Placement Fee';
    if (salaryCents > 2500000) {
      tierNotice = '12% Senior Placement Commission';
    } else if (salaryCents >= 800000) {
      tierNotice = '8% Mid-Tier Placement Commission';
    }

    return {
      type: 'JOBS_MATCH_SCREEN',
      text: `👔 *Candidate Match*\n` +
        `───────────────\n\n` +
        `💼 *Role:* ${jobTitle}\n` +
        `📍 *Location:* ${location}\n` +
        `👥 *Candidates Matched:* ${quantity}\n` +
        `💵 *Salary:* ${centsToRandsFormatted(salaryCents)}/month\n` +
        `🛡️ *Employer Fee:* ${tierNotice} *(Free for Candidates)*\n` +
        `🏢 *Agent:* ${agentName}\n\n` +
        `───────────────\n` +
        `Tap below to unlock candidate details and schedule an interview!`,
      buttons: [
        { type: 'reply', reply: { id: 'connect_job_agent', title: '🔓 Unlock Candidate & Interview' } }
      ]
    };
  }

  /**
   * PROPERTY / RENTALS MATCH SCREEN
   */
  renderPropertyMatchScreen({ title, location, rentCents, bedrooms, availableFrom, agentName, photoUrl }) {
    let text = `🏡 *Property Rental Match*\n` +
      `───────────────\n\n` +
      `🏠 *Property:* ${title}\n` +
      `📍 *Location:* ${location}\n` +
      `🛏️ *Bedrooms:* ${bedrooms}\n` +
      `💵 *Rent:* ${centsToRandsFormatted(rentCents)}/month\n` +
      `📅 *Available:* ${availableFrom}\n` +
      `🏢 *Agent:* ${agentName}\n`;

    if (photoUrl) {
      text += `🖼️ *Photo Preview:* ${photoUrl}\n`;
    }

    text += `\n───────────────\n` +
      `Tap below to request a viewing or lock deposit in Paystack escrow!`;

    return {
      type: 'PROPERTY_MATCH_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: 'connect_prop_agent', title: '🤝 Connect Agent' } }
      ]
    };
  }

  /**
   * TRAVEL & HOTEL BUNDLE MATCH SCREEN WITH FULL VISUAL HOTEL PREVIEWS
   */
  renderTravelBundleScreen({ title, components = [], totalBundleCents, hotelImageUrl, hotelRating = '⭐⭐⭐⭐⭐', hotelAddress = 'Cape Town Beachfront' }) {
    let text = `🌴 *Travel & Hotel Package*\n` +
      `───────────────\n\n` +
      `🏨 *Hotel:* ${title}\n` +
      `⭐ *Rating:* ${hotelRating}\n` +
      `📍 *Location:* ${hotelAddress}\n`;

    if (hotelImageUrl) {
      text += `🖼️ *Photo Preview:* ${hotelImageUrl}\n`;
    }

    text += `\n*Package Inclusions:*\n`;

    components.forEach((c, idx) => {
      text += `${idx + 1}️⃣ *${c.name}* — ${centsToRandsFormatted(c.priceCents)}\n`;
      if (c.image) {
        text += `   🖼️ *Preview:* ${c.image}\n`;
      }
    });

    text += `\n───────────────\n` +
      `💳 *PACKAGE TOTAL:* *${centsToRandsFormatted(totalBundleCents)}*\n` +
      `💡 *1-Tap Instant Booking (0% Markup)*`;

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
  renderOneTapCheckoutScreen({ storeName, itemName, itemPriceCents, vehicleClass, providerName, transportCostCents, totalCustomerPaysCents, deliveryAddress, transactionId, lang = 'en' }) {
    const vehicleIcon = vehicleClass === 'BIKE' ? '🏍️' : '🚛';
    const header = translate('checkout_title', lang);
    const payTitle = translate('pay_now', lang, { total: centsToRandsFormatted(totalCustomerPaysCents) });

    const text = `${header}\n` +
      `───────────────\n\n` +
      `🏬 *Store:* ${storeName}\n` +
      `🛍️ *Item:* *${itemName}* (${centsToRandsFormatted(itemPriceCents)})\n` +
      `${vehicleIcon} *Courier:* ${providerName} (${centsToRandsFormatted(transportCostCents)})\n` +
      `📍 *Deliver To:* *${deliveryAddress || 'Saved GPS Pin'}*\n\n` +
      `───────────────\n` +
      `💳 *TOTAL:* *${centsToRandsFormatted(totalCustomerPaysCents)}*\n` +
      `🏷️ *0% Store Price Markup Guarantee*`;

    return {
      type: 'ONE_TAP_CHECKOUT_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: `tap_approve_${transactionId}`, title: payTitle } },
        { type: 'reply', reply: { id: 'swap_item', title: '🔄 Change Item / Menu' } },
        { type: 'reply', reply: { id: 'change_location', title: '📍 Change Address' } }
      ]
    };
  }

  /**
   * Item Swapper Menu Screen
   */
  renderItemSwapperScreen({ storeName, items = [] }) {
    let text = `🏬 *${storeName.toUpperCase()}* — Select Item\n` +
      `───────────────\n\n`;

    const itemButtons = [];

    items.forEach((item, idx) => {
      text += `${idx + 1}️⃣ *${item.name}*\n` +
        `   💵 *In-Store Price:* ${centsToRandsFormatted(item.priceCents)}\n`;

      if (item.image) {
        text += `   🖼️ *Preview:* ${item.image}\n`;
      }

      text += `\n`;

      itemButtons.push({
        type: 'reply',
        reply: { id: `add_${item.id}`, title: `🔄 Select ${item.name.substring(0, 15)}` }
      });
    });

    text += `───────────────\n` +
      `💬 *Tap below to swap item instantly:*`;

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
      text: `📍 *Delivery Address*\n` +
        `───────────────\n\n` +
        `Reply with your new delivery address (e.g. *Work: Rosebank*), or tap attachment and send a 📍 *GPS Pin*!`
    };
  }

  /**
   * GPS Location Pin Confirmation Display
   */
  renderLocationPinCaptured({ lat, lng, addressName }) {
    return {
      type: 'LOCATION_PIN_SCREEN',
      text: `📍 *GPS Location Pin Saved*\n` +
        `───────────────\n\n` +
        `Latitude: *${lat.toFixed(4)}*\n` +
        `Longitude: *${lng.toFixed(4)}*\n` +
        `Address: *${addressName || 'Saved GPS Pin'}*\n\n` +
        `✅ Your courier will deliver directly to this exact GPS location!`
    };
  }

  /**
   * SCREEN 1: DISCOVER STORES & MERCHANTS
   */
  renderDiscoverScreen({ stores = [] }) {
    let text = `✨ *myAI™ Storefront* ✨\n` +
      `───────────────\n\n` +
      `📍 *Nearby Stores (0% Price Markup)*\n\n`;

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
      `💡 *0% Markup:* You pay exact in-store prices across all merchants!`;

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
    let text = `🏬 *${storeName.toUpperCase()}* — Catalog\n` +
      `───────────────\n\n`;

    const itemButtons = [];

    items.forEach((item, idx) => {
      text += `${idx + 1}️⃣ *${item.name}*\n` +
        `   💵 *In-Store Price:* ${centsToRandsFormatted(item.priceCents)}\n`;

      if (item.image) {
        text += `   🖼️ *Preview:* ${item.image}\n`;
      }

      text += `\n`;

      itemButtons.push({
        type: 'reply',
        reply: { id: `add_${item.id}`, title: `➕ Add ${item.name.substring(0, 15)}` }
      });
    });

    text += `───────────────\n` +
      `💬 *Tap any item below to order:*`;

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
    let text = `🛒 *Your Shopping Cart*\n` +
      `───────────────\n\n`;

    items.forEach((item) => {
      text += `• *${item.name}* — ${centsToRandsFormatted(item.priceCents)}\n`;
    });

    text += `\n───────────────\n` +
      `🏷️ *Subtotal:* ${centsToRandsFormatted(goodsSubtotalCents)} *(0% Markup)*\n\n` +
      `Ready to arrange courier delivery?`;

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

    const text = `🚚 *Delivery Quote*\n` +
      `───────────────\n\n` +
      `${vehicleIcon} *Vehicle:* ${vehicleClass}\n` +
      `🏢 *Courier:* ${providerName}\n` +
      `💵 *Delivery Cost:* ${centsToRandsFormatted(transportCostCents)}\n` +
      `⏱️ *ETA:* ~${etaMinutes} mins\n\n` +
      `───────────────\n` +
      `Tap below to accept delivery quote:`;

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
    let text = `🧾 *Order Confirmation*\n` +
      `───────────────\n\n` +
      `💳 *Total Payable:* *${centsToRandsFormatted(totalCustomerPaysCents)}*\n\n`;

    if (isP2P) {
      text += `👤 *Seller:* ${sellerBadge}\n` +
        `🛡️ *Paystack Escrow:* Funds held safely in escrow.\n` +
        `🔍 *In-Person Verification:* Inspect item before sharing 6-Digit Escrow PIN.\n\n` +
        `⚠️ Both buyer and seller must tap Approve to authorize.`;
    } else {
      text += `🔒 *Paystack Checkout:* Instant 0% markup order processing.`;
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
      `🆔 *Ref:* ${orderId}\n` +
      `🚦 *Status:* *${status}*\n` +
      `🛵 *Driver:* *${driverName}* (${courierName})\n` +
      `⏱️ *ETA:* *${etaMinutes} mins away*\n\n` +
      `───────────────\n` +
      `You will receive a photo proof upon door delivery.`;

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
      `Order *${orderId}* delivered successfully.\n\n`;

    if (deliveryPhotoUrl) {
      text += `📷 *Door Photo Proof:* ${deliveryPhotoUrl}\n\n`;
    }

    text += `How was your experience today?`;

    return {
      type: 'DELIVERED_SCREEN',
      text,
      buttons: [
        { type: 'reply', reply: { id: 'rate_5', title: '⭐⭐⭐⭐⭐ Excellent' } },
        { type: 'reply', reply: { id: 'rate_3', title: '⭐⭐⭐ Good' } }
      ]
    };
  }

  /**
   * MULTI-VERTICAL DISPUTE OPTIONS SCREEN
   */
  renderDisputeOptionsScreen({ disputeId, vertical, issueTitle }) {
    return {
      type: 'DISPUTE_OPTIONS_SCREEN',
      text: `🤝 *Dispute Support*\n` +
        `───────────────\n\n` +
        `🆔 *Ref:* ${disputeId}\n` +
        `🏷️ *Category:* ${vertical}\n` +
        `⚠️ *Issue:* ${issueTitle}\n\n` +
        `🔒 Payment to supplier has been *PAUSED* for your protection.\n\n` +
        `Select how you would like to resolve this:`,
      buttons: [
        { type: 'reply', reply: { id: `autoresolve_${disputeId}`, title: '⚡ Auto-Resolve Now' } },
        { type: 'reply', reply: { id: `refund_${disputeId}`, title: '💵 100% Full Refund' } }
      ]
    };
  }

  /**
   * MULTI-VERTICAL DISPUTE RESOLUTION SCREEN
   */
  renderDisputeResolutionScreen({ disputeId, resolutionMessage }) {
    return {
      type: 'DISPUTE_RESOLUTION_SCREEN',
      text: `🌸 *Dispute Resolved*\n` +
        `───────────────\n\n` +
        `🆔 *Ref:* ${disputeId}\n\n` +
        `${resolutionMessage}\n\n` +
        `───────────────\n` +
        `Is there anything else I can help you with today?`
    };
  }
}
