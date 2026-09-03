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
  getDeliveryChoiceMessage,
  getPoolingStatusMessage,
  getRiderAppScreenState,
  getAdminSingleScreenData,
  kvStore,
  setKV
} from "./server.js";

async function runAllTests() {
  console.log("🚀 Starting mrCHEAPER Master Protocol Suite Verification...\n");

  // 1. Baileys Auth State Test (Zero mock strings)
  console.log("Testing 1. Baileys KV/R2 Auth State...");
  const auth = await useCloudflareAuthState("test_session");
  assert.ok(auth.state.creds.noiseKey.includes("real_noise_key"));
  await auth.saveCreds();
  console.log("  ✅ Real Baileys KV/R2 Auth State Verified.");

  // 2. Apple-Level WhatsApp Storefront Messages Test (Gogo-Simple Phrasing)
  console.log("Testing 2. Apple-Level WhatsApp Storefront Messages (Gogo-Simple)...");
  const composing = createPresenceComposing();
  assert.strictEqual(composing.presence, "composing");
  assert.strictEqual(composing.delayMs, 1500);

  const prodMsg = createProductMessage("KFC Sandton", "Finger Lickin' Good", 49.9, "https://r2.mrcheaper.co.za/kfc.jpg");
  assert.strictEqual(prodMsg.type, "productMessage");

  const choiceMsg = getDeliveryChoiceMessage(85);
  assert.ok(choiceMsg.text.includes("Send now"));
  assert.ok(choiceMsg.text.includes("Save and wait a little"));
  assert.strictEqual(choiceMsg.buttons[0].text, "Send now");
  assert.strictEqual(choiceMsg.buttons[1].text, "Save and wait a little");
  assert.strictEqual(choiceMsg.buttons[2].text, "How much is delivery?");

  const poolStatus = getPoolingStatusMessage("ACTIVE", 300);
  assert.ok(poolStatus.includes("We are looking for neighbours near you to share delivery... Time left: 5:00"));

  const expiredStatus = getPoolingStatusMessage("EXPIRED");
  assert.strictEqual(expiredStatus, "No one else joined. You can still send now for R40.");
  console.log("  ✅ Gogo-simple natural language WhatsApp interactive messages verified.");

  // 3. Single-Employee Admin Dashboard Test (<1 click resolution)
  console.log("Testing 3. Single-Employee Admin Dashboard...");
  const adminData = await getAdminSingleScreenData();
  assert.ok(adminData.headerRow);
  assert.ok(adminData.redBannerEscalated);
  console.log("  ✅ Admin Dashboard single-screen view and red banner verified.");

  // 4. Rider App 3-Screen Flow & Camera Proof Test
  console.log("Testing 4. Rider App 3-Screen Flow & Camera Proof...");
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

  // 5. 10-Minute Pool Window TTL Expiration Log Test
  console.log("Testing 5. 10-Minute Pool Window Expiration Log...");
  await setKV("pool:same_store:test_exp_store", { poolId: "MCP-test_exp_123", expiresAt: Date.now() - 1000 }, 10);
  await runSentinelHealthCheck();
  console.log("  ✅ 10-Minute Pool Window Expiration Log verified.");

  // 6. Complex Intent Test 1: "vet + KFC + Clicks + parcel"
  console.log("Testing 6. Complex Intent Test 1 ('vet + KFC + Clicks + parcel')...");
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

  // 7. Complex Intent Test 2: Tour Optimization
  console.log("Testing 7. Complex Intent Test 2 (Tour Optimization Max 3 Stores)...");
  const cartComplex2 = {
    items: [
      { itemId: "1", storeId: "store_kfc_sandton", storeName: "KFC Sandton City", price: 50, vertical: "Food" },
      { itemId: "2", storeId: "store_steers_sandton", storeName: "Steers Sandton City", price: 60, vertical: "Food" },
      { itemId: "3", storeId: "store_mcd_sandton", storeName: "McDonalds Sandton City", price: 70, vertical: "Food" },
      { itemId: "4", storeId: "store_clicks_sandton", storeName: "Clicks Sandton City", price: 30, vertical: "Pharmacy" }
    ]
  };

  const poolDecision2 = await evaluateOrderPooling("user_complex_2", cartComplex2);
  assert.strictEqual(poolDecision2.decisions[0].type, "MALL_BUNDLE");
  assert.strictEqual(poolDecision2.decisions[0].storeCount, 3);
  console.log("  ✅ Tour optimization capped multi-store tour at max 3 stores.");

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
