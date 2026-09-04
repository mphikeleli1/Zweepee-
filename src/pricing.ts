// /src/pricing.ts
// mrCHEAPER v19 Locked Pricing Engine
export function calculateDeliveryAndPayouts(orderType: string | number = "SAME_STORE_POOLED", options: any = {}) {
  let typeStr = typeof orderType === "string" ? orderType : "SAME_STORE_POOLED";
  let opts = typeof orderType === "object" ? orderType : (typeof options === "object" ? options : {});

  if (typeof orderType === "number") {
    opts = { ...opts, distanceKm: orderType };
    if (typeof options === "number") {
      opts.poolSize = options;
    }
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
    const poolSize = opts.poolSize || 2;
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

  const baseRate = driverPayout;
  const ourCut = serviceFee;
  const customerTotal = deliveryFee + serviceFee;
  const customerPerPerson = deliveryFee;

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
