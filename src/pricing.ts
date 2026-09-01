// /src/pricing.ts
// mrCHEAPER v19 Locked Pricing Engine: 0% Menu Markup, R10 Service Fee, R35 Pooled Delivery, Bike Caps & Group Rules
export function calculateDeliveryAndPayouts(orderType: string, options: any = {}) {
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
  }

  return { menuMarkupPercent, serviceFee, deliveryFee, driverPayout };
}
