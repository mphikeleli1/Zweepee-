// /src/pricing.ts
// mrCHEAPER v19 Locked Pricing Engine: 0% Menu Markup, R10 Service Fee, R35 Pooled Delivery, Bike Caps & Group Rules
export function calculateDeliveryAndPayouts(orderType: string | number = "SAME_STORE_POOLED", options: any = {}) {
  // If first parameter is passed as distanceKm (number)
  if (typeof orderType === "number") {
    const distanceKm = orderType;
    const poolSize = typeof options === "number" ? options : (options.poolSize || 2);
    const baseRate = 50 + (distanceKm * 2);
    const driverPayout = baseRate;
    const ourCut = baseRate * 0.20;
    const customerTotal = baseRate + ourCut;
    const customerPerPerson = customerTotal / Math.max(1, poolSize);
    return {
      menuMarkupPercent: 0,
      serviceFee: Math.round(ourCut),
      deliveryFee: Math.round(customerPerPerson),
      driverPayout: Math.round(driverPayout),
      baseRate,
      ourCut,
      customerTotal,
      customerPerPerson
    };
  }

  const menuMarkupPercent = 0; // Strictly 0% menu markup
  let serviceFee = 10; // R10 flat service fee
  let deliveryFee = 35; // R35 pooled delivery fee
  let driverPayout = 33;

  const totalValue = options.totalValue || 0;
  const totalWeightKg = options.totalWeightKg || 0;
  const totalBags = options.totalBags || 1;
  const isGroupOrder = options.isGroupOrder || false;

  // v19 Group Order rule: Same pickup and drop within 10 min window = R10 flat service fee total & R35 delivery total for group
  if (isGroupOrder) {
    serviceFee = 10;
    deliveryFee = 35;
    driverPayout = 45;
  } else if (totalValue > 500 || totalWeightKg > 15 || totalBags > 2) {
    // Bike caps overage multiplier (max R500, max 15kg, max 2 bags)
    const multiplier = Math.ceil(Math.max(totalValue / 500, totalWeightKg / 15, totalBags / 2));
    deliveryFee = 35 * multiplier;
    driverPayout = 33 * multiplier;
  } else if (orderType === "SAME_STORE_POOLED") {
    const poolSize = options.poolSize || 2;
    if (poolSize === 2) {
      deliveryFee = 20;
      driverPayout = 45;
    } else {
      deliveryFee = 15;
      driverPayout = 58;
    }
  } else if (orderType === "MALL_BUNDLE") {
    deliveryFee = 29;
    driverPayout = 58;
  } else if (orderType === "PARCEL_SOLO") {
    const size = options.parcelSize || "S";
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
    customerPerPerson
  };
}
