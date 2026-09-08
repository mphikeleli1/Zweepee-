export function getVehicleType(productNameOrVertical = "", weightKg = 1) {
  const name = productNameOrVertical.toLowerCase();

  const bakkieKeywords = [
    "couch", "sofa", "fridge", "refrigerator", "bed", "mattress",
    "washing machine", "table", "chair", "tv stand", "appliance",
    "furniture", "building material", "cement", "lawnmower", "hardware"
  ];

  if (weightKg > 20 || bakkieKeywords.some(kw => name.includes(kw))) {
    return {
      type: "BAKKIE",
      maxPoolCount: 1, // Bakkie items strictly do not pool or pool max 1
      isBulky: true,
      maxRadiusMeters: 20000 // Extended 20 km search radius
    };
  }

  return {
    type: "BIKE",
    maxPoolCount: 4,
    isBulky: false,
    maxRadiusMeters: 2000 // Standard 2 km search radius
  };
}
