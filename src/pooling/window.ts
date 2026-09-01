// /src/pooling/window.ts
// 10-minute pooling window, max 4 orders per same-store pool, up to 3 compatible stores mall bundle logic
import { getKV, setKV, POOL_WINDOW_MS, fetchDynamicPlacesNearby } from "../../server.js";

export async function evaluateOrderPooling(userId: string, orderCart: any) {
  const items = orderCart.items || [];
  const parcelItems = items.filter((i: any) => i.isParcel || i.vertical === "Parcel");
  const nonParcelItems = items.filter((i: any) => !i.isParcel && i.vertical !== "Parcel");

  const decisions: any[] = [];

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

  const storeGroups: Record<string, any[]> = {};
  for (const item of nonParcelItems) {
    if (!storeGroups[item.storeId]) {
      storeGroups[item.storeId] = [];
    }
    storeGroups[item.storeId].push(item);
  }

  const uniqueStoreIds = Object.keys(storeGroups);

  if (uniqueStoreIds.length === 1) {
    // Fixed pool key: pool:same_store:${storeId} (NO Date.now in key name so orders share pool)
    const storeId = uniqueStoreIds[0];
    const storePoolKey = `pool:same_store:${storeId}`;
    let existingPool = await getKV(storePoolKey);

    const now = Date.now();
    const orderValue = storeGroups[storeId].reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0);
    const orderWeightKg = storeGroups[storeId].reduce((sum, i) => sum + (i.weightKg || 1) * (i.quantity || 1), 0);

    let canJoin = false;
    if (existingPool && now <= existingPool.expiresAt) {
      const currentOrdersCount = existingPool.orders.length;
      const currentWeight = existingPool.totalWeightKg || 0;
      const currentValue = existingPool.totalValue || 0;

      if (
        currentOrdersCount < 4 &&
        currentWeight + orderWeightKg <= 15 &&
        currentValue + orderValue <= 500
      ) {
        canJoin = true;
      }
    }

    if (canJoin) {
      existingPool.orders.push({ userId, items: storeGroups[storeId] });
      existingPool.totalWeightKg = (existingPool.totalWeightKg || 0) + orderWeightKg;
      existingPool.totalValue = (existingPool.totalValue || 0) + orderValue;
      await setKV(storePoolKey, existingPool, POOL_WINDOW_MS);

      decisions.push({
        type: "SAME_STORE_POOLED",
        poolId: existingPool.poolId,
        storeId,
        poolCount: existingPool.orders.length,
        maxCapacity: 4,
        expiresInSeconds: Math.round((existingPool.expiresAt - now) / 1000)
      });
    } else {
      const newPool = {
        poolId: `pool_${storeId}`,
        storeId,
        orders: [{ userId, items: storeGroups[storeId] }],
        totalWeightKg: orderWeightKg,
        totalValue: orderValue,
        createdAt: now,
        expiresAt: now + POOL_WINDOW_MS
      };
      await setKV(storePoolKey, newPool, POOL_WINDOW_MS);

      decisions.push({
        type: "SAME_STORE_POOLED",
        poolId: newPool.poolId,
        storeId,
        poolCount: 1,
        maxCapacity: 4,
        expiresInSeconds: 600
      });
    }
  } else {
    // Mall bundle fixed key: pool:mall_bundle:${mallId}
    const storesInfo = (await fetchDynamicPlacesNearby(-26.1075, 28.0567)).filter((s: any) => uniqueStoreIds.includes(s.id));
    const firstMallId = storesInfo[0]?.mallId || "sandton_mall";

    const mallPoolKey = `pool:mall_bundle:${firstMallId}`;
    let mallBundle = {
      bundleId: `bundle_${firstMallId}`,
      mallId: firstMallId,
      mallName: storesInfo[0]?.mallName || "Sandton Mall",
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
      mallName: mallBundle.mallName,
      storeCount: storesInfo.length,
      maxStores: 3
    });
  }

  return { userId, decisions };
}
