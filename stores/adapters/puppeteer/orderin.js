export async function scrapeOrderin(storeId) {
  if (storeId.includes("steers") || storeId.includes("orderin")) {
    return [
      { id: "steers_w", name: "Wacky Wednesday Burger", price: 59.9, inStock: true, weightKg: 0.5, category: "Burgers", img: "https://r2.mrcheaper.co.za/steers_w_thumb.jpg", badge: "Value" }
    ];
  }
  return [];
}
