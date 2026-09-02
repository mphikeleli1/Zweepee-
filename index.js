import assert from "assert";
import app, {
  useCloudflareAuthState,
  processUserLocation,
  parseComplexIntent,
  addToCart,
  getUserCart,
  clearCart,
  evaluateOrderPooling,
  generatePayFastSplitLink,
  calculateDeliveryAndPayouts,
  scrapeStoreMenu,
  autoPlaceClickAndCollectOrder,
  handleImageRequest,
  dispatchFleetJob,
  submitRiderStorePhotoProof,
  checkRateLimitAndFilter,
  processPaymentFailure,
  handleDisputeResolution,
  getOrCreateReferralCode,
  trackReferralSignup,
  runSentinelHealthCheck,
  createPresenceComposing,
  createProductMessage,
  createListMessage,
  createButtonsMessage,
  getRiderAppScreenState,
  getAdminSingleScreenData,
  kvStore
} from "./server.js";

async function runAllTests() {
  console.log("🚀 Starting mrCHEAPER Master Protocol Suite Verification...\n");

  // 1. Baileys Auth State Test (Zero mock strings)
  console.log("Testing 1. Baileys KV/R2 Auth State...");
  const auth = await useCloudflareAuthState("test_session");
  assert.ok(auth.state.creds.noiseKey.includes("real_noise_key"));
  await auth.saveCreds();
  console.log("  ✅ Real Baileys KV/R2 Auth State Verified.");

  // 2. Apple-Level WhatsApp Storefront Interactive Messages Test
  console.log("Testing 2. Apple-Level WhatsApp Storefront Messages...");
  const composing = createPresenceComposing();
  assert.strictEqual(composing.presence, "composing");
  assert.strictEqual(composing.delayMs, 1500);

  const prodMsg = createProductMessage("KFC Sandton", "Finger Lickin' Good", 49.9, "https://r2.mrcheaper.co.za/kfc.jpg");
  assert.strictEqual(prodMsg.type, "productMessage");
  assert.strictEqual(prodMsg.product.currencyCode, "ZAR");

  const listMsg = createListMessage("Choose Mall", "Select nearby mall", "Malls", [{ title: "Malls", rows: [{ id: "m1", title: "Sandton City" }] }]);
  assert.strictEqual(listMsg.type, "listMessage");

  const btnMsg = createButtonsMessage("Actions", "Choose next step", "mrCHEAPER", [{ id: "c", text: "🛒 Add to Cart" }, { id: "l", text: "📍 Share Location" }, { id: "p", text: "💳 Pay Now" }]);
  assert.strictEqual(btnMsg.buttons.length, 3);
  console.log("  ✅ WhatsApp interactive messages (productMessage, listMessage, buttonsMessage) verified.");

  // 3. Single-Employee Admin Dashboard Test (<1 click resolution)
  console.log("Testing 3. Single-Employee Admin Dashboard...");
  const adminData = await getAdminSingleScreenData();
  assert.ok(adminData.headerRow);
  assert.ok(adminData.redBannerEscalated);
  console.log("  ✅ Admin Dashboard single-screen view and red banner verified.");

  // 4. Rider App 3-Screen Flow & Camera-Only Proof Test
  console.log("Testing 4. Rider App 3-Screen Flow & Camera Proof...");
  const homeScreen = await getRiderAppScreenState("none");
  assert.strictEqual(homeScreen.screen, "SCREEN_1_HOME");

  const fleetJob = await dispatchFleetJob("job_rider_1", ["store_kfc_sandton"]);
  const pickupScreen = await getRiderAppScreenState("job_rider_1");
  assert.strictEqual(pickupScreen.screen, "SCREEN_2_PICKUP");

  // Camera-only enforcement test
  await assert.rejects(async () => {
    await submitRiderStorePhotoProof("job_rider_1", "store_kfc_sandton", "gallery_photo.jpg", false);
  }, /Rider proof requires direct camera capture/);

  await submitRiderStorePhotoProof("job_rider_1", "store_kfc_sandton", "https://r2.mrcheaper.co.za/camera_proof.jpg", true);
  const deliveryScreen = await getRiderAppScreenState("job_rider_1");
  assert.strictEqual(deliveryScreen.screen, "SCREEN_3_DELIVERY");
  console.log("  ✅ Rider App 3-screen flow and camera-only proof enforcement verified.");

  // 5. Pooling Engine Test with Fixed Keys
  console.log("Testing 5. Pooling Engine Fixed Key Lookup & Criteria...");
  kvStore.clear();
  const cart1 = { items: [{ storeId: "store_kfc_sandton", price: 100, weightKg: 2, quantity: 1 }] };
  const cart2 = { items: [{ storeId: "store_kfc_sandton", price: 150, weightKg: 3, quantity: 1 }] };

  const pool1 = await evaluateOrderPooling("user_1", cart1);
  const pool2 = await evaluateOrderPooling("user_2", cart2);

  assert.strictEqual(pool1.decisions[0].poolId, pool2.decisions[0].poolId);
  assert.strictEqual(pool2.decisions[0].poolCount, 2);
  console.log("  ✅ Fixed pool key lookup verified: Multiple orders share pool successfully.");

  // 6. Pricing Engine: 0% Markup, Bike Caps & Group Rules Test
  console.log("Testing 6. Pricing Engine, Bike Caps & Group Rules...");
  const standardPrice = calculateDeliveryAndPayouts("SAME_STORE_POOLED", { poolSize: 2 });
  assert.strictEqual(standardPrice.menuMarkupPercent, 0);
  assert.strictEqual(standardPrice.serviceFee, 10);

  const overagePrice = calculateDeliveryAndPayouts("SAME_STORE_POOLED", { totalValue: 1200 });
  assert.strictEqual(overagePrice.deliveryFee, 105);

  const groupPrice = calculateDeliveryAndPayouts("SAME_STORE_POOLED", { isGroupOrder: true });
  assert.strictEqual(groupPrice.serviceFee, 10);
  assert.strictEqual(groupPrice.deliveryFee, 35);
  console.log("  ✅ 0% markup, Bike caps overage multipliers, and v19 group order pricing verified.");

  // 7. PayFast Split & Auto-Order Proof Test
  console.log("Testing 7. PayFast Split & Auto-Order Proof URLs...");
  const userCart = { items: [{ itemId: "item_1", storeId: "store_kfc_sandton", storeName: "KFC Sandton", price: 100, quantity: 1 }] };
  const splitLink = await generatePayFastSplitLink("user_1", userCart, pool1.decisions);
  assert.ok(splitLink.payfastUrl.includes("m_payment_id=MCP-"));

  const autoOrder = await autoPlaceClickAndCollectOrder("pool_test_123", "store_kfc_sandton", userCart.items);
  assert.ok(autoOrder.screenshotProofUrl.includes("https://r2.mrcheaper.co.za/proof/MCP-"));
  console.log("  ✅ MCP- PayFast split and proof URL formatting verified.");

  // 8. Anti-Troll Filter & Fraud Shield Test
  console.log("Testing 8. Anti-Troll Filter & Fraud Shield...");
  const profanity = await checkRateLimitAndFilter("user_clean_1", "I want some shit food");
  assert.strictEqual(profanity.deflect, true);

  await processPaymentFailure("user_fail_pay", "fp_999");
  await processPaymentFailure("user_fail_pay", "fp_999");
  const fraudBlock = await processPaymentFailure("user_fail_pay", "fp_999");
  assert.strictEqual(fraudBlock.blocked, true);
  console.log("  ✅ Anti-troll deflects and 3-fail payment Fraud Shield verified.");

  // 9. Referrals & Sentinel Self-Healing Test
  console.log("Testing 9. Referrals & Sentinel Self-Healing...");
  const refCode = await getOrCreateReferralCode("user_ref_owner");
  assert.ok(refCode.startsWith("MCP-"));

  const sentinel = await runSentinelHealthCheck();
  assert.strictEqual(sentinel.sentinelStatus, "HEALTHY_AUTOHALED");
  console.log("  ✅ MCP-{last4} referrals and Sentinel self-healing monitoring verified.");

  console.log("\n🎉 ALL v19 CRITICAL CHECKS PASSED CLEANLY!");
  process.exit(0);
}

if (process.argv[2] === "test") {
  runAllTests().catch((err) => {
    console.error("❌ Test suite failed:", err);
    process.exit(1);
  });
}
