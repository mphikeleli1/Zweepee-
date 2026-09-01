import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(bodyParser.json());

// In-Memory Cloudflare KV / R2 Mock Store for Baileys State, Location, Stores & Pools
export const kvStore = new Map();
export const r2Storage = new Map();

// Helper KV functions
export async function getKV(key) {
  return kvStore.get(key) || null;
}

export async function setKV(key, value, ttlMs = 0) {
  kvStore.set(key, value);
  if (ttlMs > 0) {
    setTimeout(() => kvStore.delete(key), ttlMs);
  }
  return true;
}

export async function deleteKV(key) {
  return kvStore.delete(key);
}

// -------------------------------------------------------------
// 1. Baileys Auth State (KV / R2 Persistence)
// -------------------------------------------------------------
export async function useCloudflareAuthState(sessionKey = "baileys_default_session") {
  const kvKey = `baileys_auth:${sessionKey}`;
  let creds = (await getKV(kvKey)) || {
    noiseKey: "mock_noise_key",
    pairingEphemeralKeyPair: "mock_ephemeral_key",
    signedIdentityKey: "mock_identity_key",
    signedPreKey: "mock_pre_key",
    registrationId: Math.floor(Math.random() * 10000),
    me: { id: "27820000000@s.whatsapp.net", name: "mrCHEAPER SA" }
  };

  const keys = {
    get: async (type, ids) => {
      const data = {};
      for (const id of ids) {
        const item = await getKV(`baileys_keys:${sessionKey}:${type}:${id}`);
        if (item) data[id] = item;
      }
      return data;
    },
    set: async (data) => {
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id];
          const key = `baileys_keys:${sessionKey}:${category}:${id}`;
          if (value) {
            await setKV(key, value);
          } else {
            await deleteKV(key);
          }
        }
      }
    }
  };

  const saveCreds = async () => {
    await setKV(kvKey, creds);
    r2Storage.set(`r2_backup:${kvKey}`, JSON.stringify(creds));
  };

  return { state: { creds, keys }, saveCreds };
}

// -------------------------------------------------------------
// 2. Location Engine & Google Places 2 km Store / Mall Discovery
// -------------------------------------------------------------
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export const MOCK_NATIONAL_STORES = [
  {
    id: "store_kfc_sandton",
    name: "KFC Sandton City",
    vertical: "Food",
    mallId: "mall_sandton_city",
    mallName: "Sandton City Mall",
    lat: -26.1076,
    lng: 28.0567,
    adapter: "Ordev"
  },
  {
    id: "store_steers_sandton",
    name: "Steers Sandton City",
    vertical: "Food",
    mallId: "mall_sandton_city",
    mallName: "Sandton City Mall",
    lat: -26.1078,
    lng: 28.0569,
    adapter: "Orderin"
  },
  {
    id: "store_mcd_sandton",
    name: "McDonald's Sandton City",
    vertical: "Food",
    mallId: "mall_sandton_city",
    mallName: "Sandton City Mall",
    lat: -26.1075,
    lng: 28.0565,
    adapter: "Yobee"
  },
  {
    id: "store_clicks_sandton",
    name: "Clicks Pharmacy Sandton City",
    vertical: "Pharmacy",
    mallId: "mall_sandton_city",
    mallName: "Sandton City Mall",
    lat: -26.108,
    lng: 28.057,
    adapter: "Shopify"
  },
  {
    id: "store_vet_sandton",
    name: "Sandton Vet Clinic",
    vertical: "Other",
    mallId: "mall_sandton_city",
    mallName: "Sandton City Mall",
    lat: -26.1082,
    lng: 28.0571,
    adapter: "WooCommerce"
  },
  {
    id: "store_pnp_rosebank",
    name: "Pick n Pay Rosebank",
    vertical: "Grocery",
    mallId: "mall_rosebank",
    mallName: "Rosebank Mall",
    lat: -26.1465,
    lng: 28.0436,
    adapter: "Magento"
  }
];

export async function processUserLocation(userId, latitude, longitude) {
  const userLocKey = `user_location:${userId}`;
  const locationData = { latitude, longitude, timestamp: Date.now() };
  await setKV(userLocKey, locationData);

  const nearbyStores = MOCK_NATIONAL_STORES.filter((store) => {
    const dist = calculateDistanceMeters(latitude, longitude, store.lat, store.lng);
    return dist <= 2000;
  }).map((store) => {
    const dist = calculateDistanceMeters(latitude, longitude, store.lat, store.lng);
    return { ...store, distanceMeters: Math.round(dist) };
  });

  const mallGroups = {};
  for (const store of nearbyStores) {
    if (store.mallId) {
      if (!mallGroups[store.mallId]) {
        mallGroups[store.mallId] = {
          mallId: store.mallId,
          mallName: store.mallName,
          stores: []
        };
      }
      mallGroups[store.mallId].stores.push(store);
    }
  }

  return {
    userId,
    location: locationData,
    storesCount: nearbyStores.length,
    stores: nearbyStores,
    malls: Object.values(mallGroups)
  };
}

// -------------------------------------------------------------
// 3. Multi-Vertical Complex Intent Parser & Open KV Cart (`cart:{userId}`)
// -------------------------------------------------------------
export const VERTICAL_KEYWORDS = {
  Food: ["kfc", "steers", "mcdonalds", "mcd", "burger", "pizza", "food", "restaurant", "bakery", "butchery"],
  Grocery: ["pnp", "pick n pay", "checkers", "woolworths", "spar", "grocery"],
  Pharmacy: ["clicks", "dis-chem", "dischem", "pharmacy", "medicine"],
  Liquor: ["tops", "liquor", "wine", "beer", "bottle store"],
  Parcel: ["parcel", "package", "doc", "document", "courier", "delivery box"],
  Other: ["vet", "veterinary", "pet", "hardware", "florist", "flowers"]
};

export function parseComplexIntent(inputText) {
  const text = inputText.toLowerCase();
  const tokens = text.split(/\+|\band\b|,/g).map((t) => t.trim()).filter(Boolean);

  const parsedItems = [];
  let hasParcel = false;

  for (const token of tokens) {
    let matchedVertical = "Other";
    let matchedStoreName = token;

    if (token.includes("parcel") || token.includes("package") || token.includes("doc")) {
      hasParcel = true;
      matchedVertical = "Parcel";
    } else {
      for (const [vertical, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
        if (keywords.some((kw) => token.includes(kw))) {
          matchedVertical = vertical;
          break;
        }
      }
    }

    parsedItems.push({
      originalToken: token,
      vertical: matchedVertical,
      isParcel: matchedVertical === "Parcel",
      storeNameQuery: matchedStoreName
    });
  }

  return {
    rawInput: inputText,
    parsedCount: parsedItems.length,
    hasParcel,
    items: parsedItems
  };
}

export async function getUserCart(userId) {
  const cartKey = `cart:${userId}`;
  const cartData = await getKV(cartKey);
  return cartData || { userId, items: [], updatedAt: Date.now() };
}

export async function addToCart(userId, item) {
  const cart = await getUserCart(userId);
  const cartItem = {
    itemId: item.itemId || uuidv4(),
    storeId: item.storeId || "unknown_store",
    storeName: item.storeName || "Unknown Store",
    vertical: item.vertical || "Food",
    name: item.name,
    price: item.price || 0,
    quantity: item.quantity || 1,
    isParcel: item.vertical === "Parcel" || item.isParcel === true,
    parcelSize: item.parcelSize || null // 'S', 'M', 'L'
  };

  cart.items.push(cartItem);
  cart.updatedAt = Date.now();
  await setKV(`cart:${userId}`, cart);
  return cart;
}

export async function removeFromCart(userId, itemId) {
  const cart = await getUserCart(userId);
  cart.items = cart.items.filter((i) => i.itemId !== itemId);
  cart.updatedAt = Date.now();
  await setKV(`cart:${userId}`, cart);
  return cart;
}

export async function clearCart(userId) {
  await deleteKV(`cart:${userId}`);
  return { userId, items: [], updatedAt: Date.now() };
}

// -------------------------------------------------------------
// 4. Pooling Engine & Same-Mall Bundling Logic
// -------------------------------------------------------------
export const POOL_WINDOW_MS = 10 * 60 * 1000; // 10 mins

export async function evaluateOrderPooling(userId, orderCart) {
  const items = orderCart.items || [];
  const parcelItems = items.filter((i) => i.isParcel || i.vertical === "Parcel");
  const nonParcelItems = items.filter((i) => !i.isParcel && i.vertical !== "Parcel");

  const decisions = [];

  if (parcelItems.length > 0) {
    for (const parcelItem of parcelItems) {
      decisions.push({
        type: "PARCEL_SOLO",
        itemId: parcelItem.itemId,
        storeId: parcelItem.storeId,
        storeName: parcelItem.storeName,
        parcelSize: parcelItem.parcelSize || "S",
        reason: "Parcel strictly never pools and never bundles with food."
      });
    }
  }

  if (nonParcelItems.length === 0) {
    return { userId, decisions };
  }

  const storeGroups = {};
  for (const item of nonParcelItems) {
    if (!storeGroups[item.storeId]) {
      storeGroups[item.storeId] = [];
    }
    storeGroups[item.storeId].push(item);
  }

  const uniqueStoreIds = Object.keys(storeGroups);

  if (uniqueStoreIds.length === 1) {
    const storeId = uniqueStoreIds[0];
    const storePoolKey = `pool:same_store:${storeId}`;
    let existingPool = (await getKV(storePoolKey)) || {
      poolId: `pool_store_${storeId}_${Date.now()}`,
      storeId,
      orders: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + POOL_WINDOW_MS
    };

    if (existingPool.orders.length < 4) {
      existingPool.orders.push({ userId, items: storeGroups[storeId] });
      await setKV(storePoolKey, existingPool, POOL_WINDOW_MS);

      decisions.push({
        type: "SAME_STORE_POOLED",
        poolId: existingPool.poolId,
        storeId,
        poolCount: existingPool.orders.length,
        maxCapacity: 4,
        expiresInSeconds: Math.round((existingPool.expiresAt - Date.now()) / 1000)
      });
    } else {
      decisions.push({
        type: "SOLO_DELIVERY",
        storeId,
        reason: "Same-store pool reached maximum capacity of 4 orders."
      });
    }
  } else {
    const storesInfo = uniqueStoreIds.map((id) =>
      MOCK_NATIONAL_STORES.find((s) => s.id === id) || { id, mallId: "unknown_mall", mallName: "Unknown Mall" }
    );

    const firstMallId = storesInfo[0].mallId;
    const isSameMall = storesInfo.every((s) => s.mallId === firstMallId && s.mallId !== "unknown_mall");

    if (isSameMall && uniqueStoreIds.length <= 3) {
      const mallPoolKey = `pool:mall_bundle:${firstMallId}`;
      let mallBundle = {
        bundleId: `bundle_mall_${firstMallId}_${Date.now()}`,
        mallId: firstMallId,
        mallName: storesInfo[0].mallName,
        stores: storesInfo,
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + POOL_WINDOW_MS
      };
      await setKV(mallPoolKey, mallBundle, POOL_WINDOW_MS);

      decisions.push({
        type: "MALL_BUNDLE",
        bundleId: mallBundle.bundleId,
        mallId: firstMallId,
        mallName: storesInfo[0].mallName,
        storeCount: storesInfo.length,
        maxStores: 3,
        reason: "Multi-store order in same mall bundled into single rider tour."
      });
    } else {
      for (const storeId of uniqueStoreIds) {
        decisions.push({
          type: "SOLO_DELIVERY",
          storeId,
          reason: "Multi-store order across different locations or exceeds 3-store mall limit."
        });
      }
    }
  }

  return { userId, decisions };
}

// -------------------------------------------------------------
// 5. PayFast Split Pricing Calculation & Driver Payout Engine
// -------------------------------------------------------------
export function calculateDeliveryAndPayouts(orderType, options = {}) {
  let customerDeliveryFee = 0;
  let driverPayout = 0;
  let mrCheaperFee = 8; // R8 base fee

  if (orderType === "SAME_STORE_POOLED") {
    const poolSize = options.poolSize || 2;
    if (poolSize === 2) {
      customerDeliveryFee = 20; // R18-22
      driverPayout = 45; // R42-48 for 2-stop
    } else {
      customerDeliveryFee = 15; // R12-18 for 3-4 orders
      driverPayout = 58; // R52-65 for 3-4 stop pool
    }
  } else if (orderType === "MALL_BUNDLE") {
    mrCheaperFee += 4; // R8 base + R4 mall extra fee
    customerDeliveryFee = 25 + 4; // R25 shared + R4 extra fee = R29
    driverPayout = 58; // R52-65 for mall multi-stop bundle
  } else if (orderType === "PARCEL_SOLO") {
    const size = options.parcelSize || "S";
    let baseParcel = 35;
    if (size === "M") baseParcel = 45;
    if (size === "L") baseParcel = 65;

    mrCheaperFee = 8;
    customerDeliveryFee = baseParcel + mrCheaperFee;
    driverPayout = 33; // R32-35 solo driver payout
  } else {
    customerDeliveryFee = 32; // R29-35
    driverPayout = 33; // R32-35 solo
  }

  return { customerDeliveryFee, driverPayout, mrCheaperFee };
}

export async function generatePayFastSplitLink(userId, orderCart, poolingDecisions) {
  const poolId = `pool_${Date.now()}_${uuidv4().substring(0, 6)}`;
  let foodSubtotal = 0;
  const storeSplits = {};

  for (const item of orderCart.items || []) {
    const itemTotal = (item.price || 0) * (item.quantity || 1);
    foodSubtotal += itemTotal;

    if (!storeSplits[item.storeId]) {
      storeSplits[item.storeId] = {
        storeId: item.storeId,
        storeName: item.storeName,
        subaccount: `sub_store_${item.storeId}`,
        amount: 0
      };
    }
    storeSplits[item.storeId].amount += itemTotal;
  }

  const primaryDecision = poolingDecisions[0] || { type: "SOLO_DELIVERY" };
  const { customerDeliveryFee, driverPayout, mrCheaperFee } = calculateDeliveryAndPayouts(
    primaryDecision.type,
    {
      poolSize: primaryDecision.poolCount || 2,
      storeCount: primaryDecision.storeCount || 2,
      parcelSize: primaryDecision.parcelSize || "S"
    }
  );

  const grandTotal = foodSubtotal + customerDeliveryFee;

  const splitBreakdown = {
    poolId: `MCP-${poolId}`,
    merchant: "mrCHEAPER SA",
    grandTotal,
    foodSubtotal,
    customerDeliveryFee,
    driverPayout,
    mrCheaperFee,
    splits: [
      ...Object.values(storeSplits).map((s) => ({
        recipient: s.storeName,
        subaccountId: s.subaccount,
        amount: s.amount,
        type: "STORE_INCEPTION_SPLIT"
      })),
      {
        recipient: "Driver Fleet Subaccount (Picup/Pingo)",
        subaccountId: "sub_fleet_driver_pool",
        amount: driverPayout,
        type: "DRIVER_PAYOUT"
      },
      {
        recipient: "mrCHEAPER Protocol Fee",
        subaccountId: "sub_mrcheaper_platform",
        amount: mrCheaperFee,
        type: "PLATFORM_FEE"
      }
    ],
    payfastUrl: `https://sandbox.payfast.co.za/eng/process?cmd=_paymethod&receiver=mrcheaper&item_name=Order_MCP-${poolId}&amount=${grandTotal.toFixed(
      2
    )}&m_payment_id=MCP-${poolId}`
  };

  await setKV(`payfast_order:MCP-${poolId}`, splitBreakdown);
  return splitBreakdown;
}

// -------------------------------------------------------------
// 6. Modular Site Adapters, Auto-Ordering & R2 Image Delivery
// -------------------------------------------------------------
export const SITE_ADAPTERS = {
  Ordev: async (storeId) => [
    { id: "kfc_streetwise2", name: "Streetwise 2 with Chips", price: 49.9, img: "https://r2.mrcheaper.co.za/kfc_s2_thumb.jpg" },
    { id: "kfc_zinger", name: "Zinger Burger Meal", price: 74.9, img: "https://r2.mrcheaper.co.za/kfc_z_thumb.jpg" }
  ],
  Orderin: async (storeId) => [
    { id: "steers_wacky", name: "Wacky Wednesday Burger", price: 59.9, img: "https://r2.mrcheaper.co.za/steers_w_thumb.jpg" }
  ],
  Yobee: async (storeId) => [
    { id: "mcd_bigmac", name: "Big Mac Meal", price: 69.9, img: "https://r2.mrcheaper.co.za/mcd_bm_thumb.jpg" }
  ],
  Shopify: async (storeId) => [
    { id: "clicks_panado", name: "Panado 24 Tablets", price: 29.9, img: "https://r2.mrcheaper.co.za/clicks_p_thumb.jpg" }
  ],
  WooCommerce: async (storeId) => [
    { id: "vet_dewormer", name: "Pet Dewormer 10mg", price: 119.0, img: "https://r2.mrcheaper.co.za/vet_d_thumb.jpg" }
  ],
  Magento: async (storeId) => [
    { id: "pnp_milk", name: "Full Cream Milk 2L", price: 34.9, img: "https://r2.mrcheaper.co.za/pnp_m_thumb.jpg" }
  ]
};

export async function scrapeStoreMenu(storeId) {
  const cacheKey = `menu_cache:${storeId}`;
  const cachedMenu = await getKV(cacheKey);
  if (cachedMenu) return cachedMenu;

  const store = MOCK_NATIONAL_STORES.find((s) => s.id === storeId);
  const adapterName = store ? store.adapter : "Ordev";
  const adapterFn = SITE_ADAPTERS[adapterName] || SITE_ADAPTERS.Ordev;

  const rawMenu = await adapterFn(storeId);
  await setKV(cacheKey, rawMenu, 24 * 60 * 60 * 1000); // 24h cache
  return rawMenu;
}

export async function autoPlaceClickAndCollectOrder(poolRef, storeId, items) {
  const pickupTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const proofScreenshotUrl = `https://r2.mrcheaper.co.za/proof/orders/${poolRef}_${storeId}.png`;

  const orderConfirmation = {
    poolRef,
    storeId,
    status: "CONFIRMED_PREPAID",
    pickupRef: `MCP-${poolRef}`,
    estimatedPickupTime: pickupTime,
    screenshotProofUrl: proofScreenshotUrl,
    placedAt: new Date().toISOString()
  };

  r2Storage.set(`order_screenshot:${poolRef}:${storeId}`, proofScreenshotUrl);
  await setKV(`store_order_confirmation:${poolRef}:${storeId}`, orderConfirmation);
  return orderConfirmation;
}

export async function handleImageRequest(itemThumbnailUrl, fullDemand = false) {
  if (!fullDemand) {
    return { type: "THUMBNAIL_LIST", url: itemThumbnailUrl };
  }
  const fullImageUrl = itemThumbnailUrl.replace("_thumb.jpg", "_full_hd.jpg");
  return { type: "FULL_IMAGE_R2", url: fullImageUrl };
}

// -------------------------------------------------------------
// 7. Rider Mandatory Store Photo Proof & Fleet Failover Chain
// -------------------------------------------------------------
export const FLEET_CHAIN = ["Picup", "Pingo", "Droppa", "WumDrop"];

export async function dispatchFleetJob(jobId, requiredStoreIds = []) {
  let assignedProvider = FLEET_CHAIN[0];

  for (let i = 0; i < FLEET_CHAIN.length; i++) {
    const provider = FLEET_CHAIN[i];
    if (provider === "Picup" || provider === "Pingo") {
      assignedProvider = provider;
      break;
    }
  }

  const jobRecord = {
    jobId,
    provider: assignedProvider,
    status: "ACCEPTED",
    acceptTimeoutSeconds: 120,
    requiredStoreIds,
    photoProofByStore: {},
    paidOut: false,
    updatedAt: Date.now()
  };

  await setKV(`fleet_job:${jobId}`, jobRecord);
  return jobRecord;
}

export async function submitRiderStorePhotoProof(jobId, storeId, photoUrl) {
  const job = await getKV(`fleet_job:${jobId}`);
  if (!job) throw new Error("Fleet job not found.");

  job.photoProofByStore[storeId] = photoUrl;
  r2Storage.set(`rider_proof:${jobId}:${storeId}`, photoUrl);

  const missingStores = job.requiredStoreIds.filter((id) => !job.photoProofByStore[id]);

  if (missingStores.length === 0) {
    job.paidOut = true;
    job.status = "PROOF_VERIFIED_PAYOUT_RELEASED";
  } else {
    job.status = `AWAITING_PROOF_${missingStores.length}_MORE_STORES`;
  }

  await setKV(`fleet_job:${jobId}`, job);
  return {
    jobId,
    verifiedStoreId: storeId,
    paidOut: job.paidOut,
    missingStoresCount: missingStores.length,
    status: job.status
  };
}

// -------------------------------------------------------------
// 8. Anti-Troll Filter, Dispute Engine & Fraud Shield
// -------------------------------------------------------------
export const PROFANITY_LIST = ["fuck", "shit", "bitch", "crap", "bastard"];
export const HARD_BLOCK_LIST = ["porn", "gore", "threat", "spam", "crypto"];

export async function checkRateLimitAndFilter(userId, text) {
  const userBlocked = await getKV(`fraud_blocked:${userId}`);
  if (userBlocked) {
    return { blocked: true, reason: "Account temporarily blocked due to security or payment fraud shield." };
  }

  const rateKey = `rate_limit:${userId}`;
  let rateData = (await getKV(rateKey)) || { count: 0, windowStart: Date.now() };

  if (Date.now() - rateData.windowStart > 60000) {
    rateData = { count: 1, windowStart: Date.now() };
  } else {
    rateData.count += 1;
  }

  await setKV(rateKey, rateData, 60000);

  if (rateData.count > 10) {
    return { blocked: true, reason: "Rate limit exceeded. Max 10 messages per minute allowed." };
  }

  const lowerText = (text || "").toLowerCase();

  if (HARD_BLOCK_LIST.some((term) => lowerText.includes(term))) {
    await setKV(`fraud_blocked:${userId}`, { reason: "Violated zero-tolerance safety guardrails.", blockedAt: Date.now() }, 24 * 60 * 60 * 1000);
    return { blocked: true, reason: "Hard security block triggered." };
  }

  if (PROFANITY_LIST.some((term) => lowerText.includes(term))) {
    return {
      deflect: true,
      reply: "Eish! Keep it clean boss, we're just trying to get you cheap food!"
    };
  }

  return { blocked: false, deflect: false };
}

export async function processPaymentFailure(userId, fingerprint) {
  const failKey = `failed_payments:${userId}`;
  let failCount = ((await getKV(failKey)) || 0) + 1;
  await setKV(failKey, failCount, 24 * 60 * 60 * 1000);

  if (failCount >= 3) {
    await setKV(`fraud_blocked:${userId}`, { reason: "Fraud Shield: 3 failed payment attempts within 24h", fingerprint }, 24 * 60 * 60 * 1000);
    return { blocked: true, failCount, message: "Fraud Shield triggered: Account blocked for 24h." };
  }

  return { blocked: false, failCount, remainingAttempts: 3 - failCount };
}

export async function handleDisputeResolution(disputeId, action, details = {}) {
  const disputeKey = `dispute:${disputeId}`;
  let dispute = (await getKV(disputeKey)) || {
    disputeId,
    userId: details.userId || "user_123",
    poolId: details.poolId || "MCP-pool_123",
    status: "OPEN",
    createdAt: Date.now()
  };

  if (action === "REFUND_FEES_ONLY") {
    dispute.status = "RESOLVED_REFUND_FEES_ONLY";
    dispute.refundAmount = details.deliveryFee || 20;
  } else if (action === "REFUND_FOOD_MANUAL") {
    dispute.status = "RESOLVED_REFUND_FOOD_MANUAL";
    dispute.refundAmount = details.foodAmount || 100;
  } else if (action === "BLOCK_USER") {
    dispute.status = "RESOLVED_USER_BLOCKED";
    await setKV(`fraud_blocked:${dispute.userId}`, { reason: "Blocked via Dispute Engine", disputeId }, 24 * 60 * 60 * 1000);
  } else {
    dispute.status = "RESOLVED";
  }

  dispute.resolvedAt = Date.now();
  await setKV(disputeKey, dispute);
  return dispute;
}

// -------------------------------------------------------------
// 9. Referrals, Sentinel Self-Healing & Admin API Endpoints
// -------------------------------------------------------------
export async function getOrCreateReferralCode(userId) {
  const refKey = `user_referral:${userId}`;
  let code = await getKV(refKey);
  if (!code) {
    const last4 = userId.slice(-4) || "9999";
    code = `MCP-${last4}`;
    await setKV(refKey, code);
    await setKV(`referral_owner:${code}`, userId);
  }
  return code;
}

export async function trackReferralSignup(refCode, newUserId) {
  const ownerUserId = await getKV(`referral_owner:${refCode}`);
  if (!ownerUserId) return { success: false, reason: "Invalid referral code" };

  const trackerKey = `referral_invites:${ownerUserId}`;
  let invites = (await getKV(trackerKey)) || [];
  invites.push({ newUserId, timestamp: Date.now(), completedFirstOrder: true });
  await setKV(trackerKey, invites);

  const completedCount = invites.filter((i) => i.completedFirstOrder).length;
  let rewardApplied = false;

  if (completedCount >= 3) {
    rewardApplied = true;
    await setKV(`user_discount:${ownerUserId}`, { amount: 10, reason: "3 successful referrals reward" });
  }

  return { ownerUserId, completedCount, rewardApplied };
}

export async function runSentinelHealthCheck() {
  // Checks Baileys auth state, queues, memory, flushes stuck pools
  const authState = await getKV("baileys_auth:baileys_default_session");
  const authHealthy = !!authState;

  // Flush stuck pools older than 10 mins
  let flushedPoolsCount = 0;
  for (const [key, value] of kvStore.entries()) {
    if (key.startsWith("pool:")) {
      if (value.expiresAt && Date.now() > value.expiresAt) {
        kvStore.delete(key);
        flushedPoolsCount++;
      }
    }
  }

  const status = {
    timestamp: new Date().toISOString(),
    baileysAuthHealthy: authHealthy,
    flushedPoolsCount,
    memoryUsage: process.memoryUsage(),
    sentinelStatus: "HEALTHY_AUTOHALED"
  };

  await setKV("sentinel_last_health", status);
  return status;
}

// Admin Routes
app.get("/admin/pools", async (req, res) => {
  const pools = [];
  for (const [key, val] of kvStore.entries()) {
    if (key.startsWith("pool:")) pools.push({ key, val });
  }
  res.json({ success: true, count: pools.length, pools });
});

app.get("/admin/malls", async (req, res) => {
  const mallBundles = [];
  for (const [key, val] of kvStore.entries()) {
    if (key.startsWith("pool:mall_bundle:")) mallBundles.push({ key, val });
  }
  res.json({ success: true, count: mallBundles.length, mallBundles });
});

app.get("/admin/menu-cache", async (req, res) => {
  const cachedMenus = [];
  for (const [key, val] of kvStore.entries()) {
    if (key.startsWith("menu_cache:")) cachedMenus.push({ key, val });
  }
  res.json({ success: true, count: cachedMenus.length, cachedMenus });
});

app.post("/admin/payfast-webhook", async (req, res) => {
  const { m_payment_id, pf_payment_id, payment_status } = req.body;
  await setKV(`webhook_paid:${m_payment_id}`, { pf_payment_id, payment_status, receivedAt: Date.now() });
  res.json({ success: true, message: "PayFast split webhook processed successfully" });
});

app.get("/admin/fleet-status", async (req, res) => {
  const fleetJobs = [];
  for (const [key, val] of kvStore.entries()) {
    if (key.startsWith("fleet_job:")) fleetJobs.push({ key, val });
  }
  res.json({ success: true, count: fleetJobs.length, fleetJobs });
});

app.post("/admin/disputes/resolve", async (req, res) => {
  const { disputeId, action, details } = req.body;
  const result = await handleDisputeResolution(disputeId, action, details);
  res.json({ success: true, dispute: result });
});

app.get("/admin/sentinel/health", async (req, res) => {
  const health = await runSentinelHealthCheck();
  res.json({ success: true, health });
});

app.get("/", (req, res) => {
  res.send("mrCHEAPER Master Server Active.");
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`mrCHEAPER Server running on port ${PORT}`);
  });
}

export default app;
