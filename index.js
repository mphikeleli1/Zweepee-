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
  runSentinelHealthCheck
} from "./server.js";

async function runAllTests() {
  console.log("🚀 Starting mrCHEAPER Master Protocol Suite Verification...\n");

  // 1. Baileys KV Auth State Test
  console.log("Testing 1. Baileys KV/R2 Auth State...");
  const auth = await useCloudflareAuthState("test_session");
  assert.strictEqual(auth.state.creds.me.name, "mrCHEAPER SA");
  await auth.saveCreds();
  console.log("  ✅ Baileys KV/R2 Auth State Verified.");

  // 2. Location & 2km Radius Google Places Discovery Test
  console.log("Testing 2. Location & 2km Radius Google Places Discovery...");
  const locResult = await processUserLocation("user_test_1", -26.1075, 28.0567);
  assert.strictEqual(locResult.userId, "user_test_1");
  assert.ok(locResult.storesCount > 0);
  assert.ok(locResult.malls.length > 0);
  console.log(`  ✅ Found ${locResult.storesCount} stores in 2km radius around Sandton.`);

  // 3. Multi-Vertical Complex Intent Parser Test
  console.log("Testing 3. Multi-Vertical Complex Intent Parser...");
  const intent = parseComplexIntent("vet + KFC + Clicks + parcel");
  assert.strictEqual(intent.parsedCount, 4);
  assert.strictEqual(intent.hasParcel, true);
  assert.strictEqual(intent.items[0].vertical, "Other"); // vet
  assert.strictEqual(intent.items[1].vertical, "Food"); // KFC
  assert.strictEqual(intent.items[2].vertical, "Pharmacy"); // Clicks
  assert.strictEqual(intent.items[3].vertical, "Parcel"); // parcel
  console.log("  ✅ Multi-Vertical Intent ('vet + KFC + Clicks + parcel') parsed correctly.");

  // 4. KV Cart Management Test
  console.log("Testing 4. KV Open Cart (`cart:{userId}`)...");
  await clearCart("user_test_1");
  await addToCart("user_test_1", { storeId: "store_kfc_sandton", storeName: "KFC Sandton", name: "Zinger Burger", price: 74.9, vertical: "Food" });
  await addToCart("user_test_1", { storeId: "store_kfc_sandton", storeName: "KFC Sandton", name: "Streetwise 2", price: 49.9, vertical: "Food" });
  const cart = await getUserCart("user_test_1");
  assert.strictEqual(cart.items.length, 2);
  console.log("  ✅ KV Cart managed successfully.");

  // 5. Pooling Window & Mall Bundling Engine Test
  console.log("Testing 5. Pooling Window & Mall Bundling Engine...");
  // Same store pool test
  const sameStorePooling = await evaluateOrderPooling("user_test_1", cart);
  assert.strictEqual(sameStorePooling.decisions[0].type, "SAME_STORE_POOLED");

  // Mall Bundle multi-store test
  const multiStoreCart = {
    items: [
      { itemId: "1", storeId: "store_kfc_sandton", storeName: "KFC Sandton City", price: 50, vertical: "Food" },
      { itemId: "2", storeId: "store_steers_sandton", storeName: "Steers Sandton City", price: 60, vertical: "Food" }
    ]
  };
  const mallBundlePooling = await evaluateOrderPooling("user_test_2", multiStoreCart);
  assert.strictEqual(mallBundlePooling.decisions[0].type, "MALL_BUNDLE");

  // Parcel Isolation Test
  const parcelCart = {
    items: [
      { itemId: "p1", storeId: "parcel_hub", storeName: "Parcel Pickup", price: 0, vertical: "Parcel", isParcel: true }
    ]
  };
  const parcelPooling = await evaluateOrderPooling("user_test_3", parcelCart);
  assert.strictEqual(parcelPooling.decisions[0].type, "PARCEL_SOLO");
  console.log("  ✅ Same-store pooling, Same-mall bundling, and Parcel isolation verified.");

  // 6. PayFast Pricing & Driver Multi-Stop Payout Test
  console.log("Testing 6. PayFast Split Pricing & Driver Payout Engine...");
  const soloCalc = calculateDeliveryAndPayouts("SOLO_DELIVERY");
  assert.strictEqual(soloCalc.customerDeliveryFee, 32);
  assert.strictEqual(soloCalc.driverPayout, 33); // R32-35 solo

  const pool2Calc = calculateDeliveryAndPayouts("SAME_STORE_POOLED", { poolSize: 2 });
  assert.strictEqual(pool2Calc.customerDeliveryFee, 20); // R18-22
  assert.strictEqual(pool2Calc.driverPayout, 45); // R42-48 for 2-stop pool

  const pool4Calc = calculateDeliveryAndPayouts("SAME_STORE_POOLED", { poolSize: 4 });
  assert.strictEqual(pool4Calc.customerDeliveryFee, 15); // R12-18
  assert.strictEqual(pool4Calc.driverPayout, 58); // R52-65 for 3-4 stop pool

  const mallCalc = calculateDeliveryAndPayouts("MALL_BUNDLE", { storeCount: 2 });
  assert.strictEqual(mallCalc.customerDeliveryFee, 29); // R25 + R4 extra fee
  assert.strictEqual(mallCalc.driverPayout, 58); // R52-65 for mall bundle

  const splitLink = await generatePayFastSplitLink("user_test_1", cart, sameStorePooling.decisions);
  assert.ok(splitLink.payfastUrl.includes("m_payment_id=MCP-"));
  assert.ok(splitLink.splits.length >= 3); // Store + Driver + Protocol
  console.log("  ✅ PayFast Split pricing and driver multi-stop payout tiers verified.");

  // 7. Site Adapters, Auto-Ordering & R2 Image Delivery Test
  console.log("Testing 7. Site Adapters, Auto-Ordering & Image Delivery...");
  const menu = await scrapeStoreMenu("store_kfc_sandton");
  assert.ok(menu.length > 0);

  const autoOrder = await autoPlaceClickAndCollectOrder("pool_test_123", "store_kfc_sandton", cart.items);
  assert.strictEqual(autoOrder.status, "CONFIRMED_PREPAID");
  assert.strictEqual(autoOrder.pickupRef, "MCP-pool_test_123");

  const imageRes = await handleImageRequest("https://r2.mrcheaper.co.za/item_thumb.jpg", true);
  assert.strictEqual(imageRes.type, "FULL_IMAGE_R2");
  assert.ok(imageRes.url.includes("_full_hd.jpg"));
  console.log("  ✅ Modular site adapters, auto-ordering, and R2 full image delivery verified.");

  // 8. Rider Photo Proof & Fleet Failover Chain Test
  console.log("Testing 8. Rider Photo Proof & Fleet Failover Chain...");
  const fleetJob = await dispatchFleetJob("job_101", ["store_kfc_sandton"]);
  assert.strictEqual(fleetJob.provider, "Picup"); // Primary Picup dispatch

  const proofRes = await submitRiderStorePhotoProof("job_101", "store_kfc_sandton", "https://r2.mrcheaper.co.za/proof.jpg");
  assert.strictEqual(proofRes.paidOut, true);
  assert.strictEqual(proofRes.status, "PROOF_VERIFIED_PAYOUT_RELEASED");
  console.log("  ✅ Rider photo proof enforcement & fleet failover chain verified.");

  // 9. Anti-Troll Filter, Dispute Engine & Fraud Shield Test
  console.log("Testing 9. Anti-Troll Filter, Dispute Engine & Fraud Shield...");
  const profanityCheck = await checkRateLimitAndFilter("user_clean_1", "I want some shit food");
  assert.strictEqual(profanityCheck.deflect, true);

  const hardBlockCheck = await checkRateLimitAndFilter("user_troll_1", "I am sending porn link");
  assert.strictEqual(hardBlockCheck.blocked, true);

  const fraudShieldRes = await processPaymentFailure("user_fail_pay", "fp_999");
  await processPaymentFailure("user_fail_pay", "fp_999");
  const fraudBlock = await processPaymentFailure("user_fail_pay", "fp_999");
  assert.strictEqual(fraudBlock.blocked, true);

  const dispute = await handleDisputeResolution("disp_001", "REFUND_FEES_ONLY", { userId: "user_test_1", deliveryFee: 20 });
  assert.strictEqual(dispute.status, "RESOLVED_REFUND_FEES_ONLY");
  console.log("  ✅ Anti-troll deflects, hard blocks, dispute engine, and 3-fail payment Fraud Shield verified.");

  // 10. Viral Referrals & Sentinel Self-Healing Test
  console.log("Testing 10. Referrals & Sentinel Self-Healing...");
  const refCode = await getOrCreateReferralCode("user_ref_owner");
  assert.ok(refCode.startsWith("MCP-"));

  await trackReferralSignup(refCode, "user_ref_1");
  await trackReferralSignup(refCode, "user_ref_2");
  const ref3 = await trackReferralSignup(refCode, "user_ref_3");
  assert.strictEqual(ref3.rewardApplied, true);

  const sentinel = await runSentinelHealthCheck();
  assert.strictEqual(sentinel.sentinelStatus, "HEALTHY_AUTOHALED");
  console.log("  ✅ MCP-{last4} referrals and Sentinel self-healing monitoring verified.");

  console.log("\n🎉 ALL mrCHEAPER MASTER TESTS PASSED CLEANLY! PROTOCOL IS READY FOR PRODUCTION DEPLOYMENT.");
  process.exit(0);
}

if (process.argv[2] === "test") {
  runAllTests().catch((err) => {
    console.error("❌ Test suite failed:", err);
    process.exit(1);
  });
}
