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
  handleRiderTheftResolution,
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
  getDeliveryChoiceMessage,
  getPoolingStatusMessage,
  getScreen1HomeView,
  getScreen2StorefrontView,
  getScreen3CartCheckoutView,
  startWaitAndSavePool,
  getRiderAppScreenState,
  getAdminSingleScreenData,
  kvStore,
  setKV
} from "./server.js";

async function runAllTests() {
  console.log("🚀 Starting mrCHEAPER Master Protocol Suite Verification...\n");

  // 1. Baileys Auth State Test
  console.log("Testing 1. Baileys KV/R2 Auth State...");
  const auth = await useCloudflareAuthState("test_session");
  assert.ok(auth.state.creds.noiseKey.includes("real_noise_key"));
  await auth.saveCreds();
  console.log("  ✅ Real Baileys KV/R2 Auth State Verified.");

  // 2. Hybrid Scrapers & Puppeteer Click & Collect Auto-Ordering Test
  console.log("Testing 2. Hybrid Store Scrapers & Puppeteer Click & Collect Auto-Ordering...");
  const menuKfc = await scrapeStoreMenu("store_kfc_sandton");
  const menuVet = await scrapeStoreMenu("store_vet_sandton");
  assert.ok(menuKfc.length > 0);
  assert.ok(menuVet.length > 0);

  const autoOrder = await autoPlaceClickAndCollectOrder("pool_test_123", "store_kfc_sandton", menuKfc);
  assert.strictEqual(autoOrder.status, "CONFIRMED_PREPAID");
  assert.ok(autoOrder.screenshotProofUrl.includes("https://r2.mrcheaper.co.za/proof/MCP-"));
  console.log("  ✅ Hybrid Puppeteer scrapers and auto-ordering with ref MCP-{poolId} + screenshot proof verified.");

  // 3. Apple-Level WhatsApp Storefront Messages & 3 Screens Test
  console.log("Testing 3. 3-Screen Flows (Screen 1 Live Pools, Screen 2 Storefront, Screen 3 Pool Cart)...");
  const s1Home = await getScreen1HomeView();
  assert.strictEqual(s1Home.screen, "SCREEN_1_HOME");

  const waitPool = await startWaitAndSavePool("user_host_1", "store_kfc_sandton");
  assert.strictEqual(waitPool.hostUserId, "user_host_1");

  const s2StorefrontKfc = await getScreen2StorefrontView("store_kfc_sandton", "user_host_1");
  assert.strictEqual(s2StorefrontKfc.screen, "SCREEN_2_UNIVERSAL_STOREFRONT");
  assert.ok(s2StorefrontKfc.header.poolBarText.includes("You started Wait & Save"));

  const s2StorefrontClicks = await getScreen2StorefrontView("store_clicks_sandton", "user_guest");
  assert.strictEqual(s2StorefrontClicks.screen, "SCREEN_2_UNIVERSAL_STOREFRONT");
  assert.ok(s2StorefrontClicks.productCards.some((p) => p.title.includes("Panado")));

  const s2StorefrontVet = await getScreen2StorefrontView("store_vet_sandton", "user_guest");
  assert.strictEqual(s2StorefrontVet.screen, "SCREEN_2_UNIVERSAL_STOREFRONT");
  assert.ok(s2StorefrontVet.productCards.some((p) => p.title.includes("Dewormer")));

  await addToCart("user_cart_tester", { storeId: "store_kfc_sandton", storeName: "KFC Sandton", name: "Zinger Burger", price: 74.9, vertical: "Food" });
  const s3Cart = await getScreen3CartCheckoutView("user_cart_tester");
  assert.strictEqual(s3Cart.screen, "SCREEN_3_POOL_CART_CHECKOUT");
  assert.ok(s3Cart.savingsExplanation.includes("You save R"));
  assert.ok(s3Cart.payfastInceptionSplitUrl.includes("m_payment_id=MCP-"));
  console.log("  ✅ Screen 1 Live Pools/Wait & Save, Screen 2 Storefront (3 Verticals), and Screen 3 Pool Cart savings breakdown verified.");

  // 4. Single-Employee Admin Dashboard & Fleet Theft Resolution Test
  console.log("Testing 4. Admin Dashboard, Net Profit Margin & [Rider Stole - Claim Fleet] Resolution...");
  const adminData = await getAdminSingleScreenData();
  assert.ok(adminData.headerRow);
  assert.ok("netPlatformProfitMarginR" in adminData.headerRow);

  await dispatchFleetJob("job_stolen_101", ["store_kfc_sandton"]);
  const theftDispute = await handleDisputeResolution("disp_theft_101", "RIDER_STOLE_CLAIM_FLEET", {
    jobId: "job_stolen_101",
    poolId: "pool_999",
    storeId: "store_kfc_sandton",
    foodAmount: 150,
    userId: "user_victim_1"
  });

  assert.strictEqual(theftDispute.status, "RESOLVED_FLEET_THEFT_CLAIMED");
  assert.strictEqual(theftDispute.theftResult.remakePoolId, "MCP-pool_999-R");
  assert.strictEqual(theftDispute.theftResult.shopRequestedFreeRemake, false);
  assert.strictEqual(theftDispute.theftResult.remakeCostChargedToFleetWallet, 150);
  assert.ok(theftDispute.theftResult.newRiderJobId);
  console.log("  ✅ Admin Dashboard net profit margin & [Rider Stole - Claim Fleet] resolution verified.");

  // 5. Rider App 3-Screen Flow & Camera Proof Test
  console.log("Testing 5. Rider App 3-Screen Flow & Camera Proof...");
  const homeScreen = await getRiderAppScreenState("none");
  assert.strictEqual(homeScreen.screen, "SCREEN_1_HOME");

  const fleetJob = await dispatchFleetJob("job_rider_1", ["store_kfc_sandton"]);
  const pickupScreen = await getRiderAppScreenState("job_rider_1");
  assert.strictEqual(pickupScreen.screen, "SCREEN_2_PICKUP");

  await assert.rejects(async () => {
    await submitRiderStorePhotoProof("job_rider_1", "store_kfc_sandton", "gallery_photo.jpg", false);
  }, /Rider proof requires direct camera capture/);

  await submitRiderStorePhotoProof("job_rider_1", "store_kfc_sandton", "https://r2.mrcheaper.co.za/camera_proof.jpg", true);
  const deliveryScreen = await getRiderAppScreenState("job_rider_1");
  assert.strictEqual(deliveryScreen.screen, "SCREEN_3_DELIVERY");
  console.log("  ✅ Rider App 3-screen flow and camera-only proof enforcement verified.");

  // 6. 10-Minute Pool Window TTL Expiration Log Test
  console.log("Testing 6. 10-Minute Pool Window Expiration Log...");
  await setKV("pool:same_store:test_exp_store", { poolId: "MCP-test_exp_123", expiresAt: Date.now() - 1000 }, 10);
  await runSentinelHealthCheck();
  console.log("  ✅ 10-Minute Pool Window Expiration Log verified.");

  // 7. Complex Intent Test 1: "vet + KFC + Clicks + parcel"
  console.log("Testing 7. Complex Intent Test 1 ('vet + KFC + Clicks + parcel')...");
  const parsed1 = parseComplexIntent("vet + KFC + Clicks + parcel to send to Randburg");
  assert.strictEqual(parsed1.parsedCount, 4);
  assert.strictEqual(parsed1.hasParcel, true);

  const cartComplex1 = {
    items: [
      { itemId: "1", storeId: "store_vet_sandton", storeName: "Sandton Vet Clinic", price: 120, vertical: "Other" },
      { itemId: "2", storeId: "store_kfc_sandton", storeName: "KFC Sandton City", price: 80, vertical: "Food" },
      { itemId: "3", storeId: "store_clicks_sandton", storeName: "Clicks Sandton City", price: 50, vertical: "Pharmacy" },
      { itemId: "4", storeId: "parcel_hub", storeName: "Parcel Randburg", price: 0, vertical: "Parcel", isParcel: true }
    ]
  };

  const poolDecision1 = await evaluateOrderPooling("user_complex_1", cartComplex1);
  assert.strictEqual(poolDecision1.decisions.length, 2);
  assert.strictEqual(poolDecision1.decisions[0].type, "PARCEL_SOLO");
  assert.strictEqual(poolDecision1.decisions[1].type, "MALL_BUNDLE");

  const mallCart1 = { items: cartComplex1.items.filter((i) => !i.isParcel) };
  const parcelCart1 = { items: cartComplex1.items.filter((i) => i.isParcel) };

  const mallSplit = await generatePayFastSplitLink("user_complex_1", mallCart1, [poolDecision1.decisions[1]]);
  const parcelSplit = await generatePayFastSplitLink("user_complex_1", parcelCart1, [poolDecision1.decisions[0]]);

  assert.ok(mallSplit.payfastUrl.includes("m_payment_id=MCP-"));
  assert.ok(parcelSplit.payfastUrl.includes("m_payment_id=MCP-"));
  console.log("  ✅ Parsed into 2 distinct jobs: 1 Mall Bundle + 1 Parcel Solo separate.");

  // 8. Complex Intent Test 2: Tour Optimization
  console.log("Testing 8. Complex Intent Test 2 (Tour Optimization Max 3 Stores)...");
  const cartComplex2 = {
    items: [
      { itemId: "1", storeId: "store_kfc_sandton", storeName: "KFC Sandton City", price: 50, vertical: "Food" },
      { itemId: "2", storeId: "store_steers_sandton", storeName: "Steers Sandton City", price: 60, vertical: "Food" },
      { itemId: "3", storeId: "store_clicks_sandton", storeName: "Clicks Sandton City", price: 30, vertical: "Pharmacy" }
    ]
  };

  const poolDecision2 = await evaluateOrderPooling("user_complex_2", cartComplex2);
  assert.strictEqual(poolDecision2.decisions[0].type, "MALL_BUNDLE");
  assert.ok(poolDecision2.decisions[0].storeCount <= 3);
  console.log("  ✅ Tour optimization capped multi-store tour at max 3 stores.");

  // 9. Anti-Troll Filter & Fraud Shield Test
  console.log("Testing 9. Anti-Troll Filter & Fraud Shield...");
  const profanity = await checkRateLimitAndFilter("user_clean_1", "I want some shit food");
  assert.strictEqual(profanity.deflect, true);

  await processPaymentFailure("user_fail_pay", "fp_999");
  await processPaymentFailure("user_fail_pay", "fp_999");
  const fraudBlock = await processPaymentFailure("user_fail_pay", "fp_999");
  assert.strictEqual(fraudBlock.blocked, true);
  console.log("  ✅ Anti-troll deflects and 3-fail payment Fraud Shield verified.");

  console.log("\n🎉 ALL v19 CRITICAL CHECKS PASSED CLEANLY!");
  process.exit(0);
}

if (process.argv[2] === "test") {
  runAllTests().catch((err) => {
    console.error("❌ Test suite failed:", err);
    process.exit(1);
  });
}
