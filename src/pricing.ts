// /src/pricing.ts
// mrCHEAPER v19 Locked Pricing Engine
export function calculateDeliveryAndPayouts(orderType: string | number = "SAME_STORE_POOLED", options: any = {}) {
  let typeStr = typeof orderType === "string" ? orderType : "SAME_STORE_POOLED";
  let opts = typeof orderType === "object" ? orderType : (typeof options === "object" ? options : {});

  let distanceKm = 5;
  let poolSize = 2;

  if (typeof orderType === "number") {
    distanceKm = orderType;
    if (typeof options === "number") {
      poolSize = options;
    }
  } else if (opts.distanceKm) {
    distanceKm = opts.distanceKm;
  }

  if (opts.poolSize) {
    poolSize = opts.poolSize;
  }

  const menuMarkupPercent = 0; // Strictly 0% menu markup
  let serviceFee = 10; // R10 flat service fee
  let deliveryFee = 35; // R35 pooled delivery fee
  let driverPayout = 33;

  const totalValue = opts.totalValue || 0;
  const totalWeightKg = opts.totalWeightKg || 0;
  const totalBags = opts.totalBags || 1;
  const isGroupOrder = opts.isGroupOrder || false;

  if (isGroupOrder) {
    serviceFee = 10;
    deliveryFee = 35;
    driverPayout = 45;
  } else if (totalValue > 500 || totalWeightKg > 15 || totalBags > 2) {
    const multiplier = Math.ceil(Math.max(totalValue / 500, totalWeightKg / 15, totalBags / 2));
    deliveryFee = 35 * multiplier;
    driverPayout = 33 * multiplier;
  } else if (typeStr === "SAME_STORE_POOLED") {
    if (poolSize === 2) {
      deliveryFee = 20;
      driverPayout = 45;
    } else {
      deliveryFee = 15;
      driverPayout = 58;
    }
  } else if (typeStr === "MALL_BUNDLE") {
    serviceFee = 12;
    deliveryFee = 29;
    driverPayout = 58;
  } else if (typeStr === "PARCEL_SOLO") {
    const size = opts.parcelSize || "S";
    let baseParcel = 35;
    if (size === "M") baseParcel = 45;
    if (size === "L") baseParcel = 65;
    serviceFee = 8;
    deliveryFee = baseParcel + serviceFee;
    driverPayout = 33;
  }

  // Calculate distance-adjusted baseRate and 20% margin
  const baseRate = 50 + (distanceKm * 2);
  const ourCut = baseRate * 0.20;
  const customerTotal = baseRate + ourCut;
  const customerPerPerson = customerTotal / Math.max(1, poolSize);

  return {
    menuMarkupPercent,
    serviceFee,
    deliveryFee,
    driverPayout,
    baseRate,
    ourCut,
    customerTotal,
    customerPerPerson,
    breakdown: { baseRate, ourCut, customerTotal }
  };
}
