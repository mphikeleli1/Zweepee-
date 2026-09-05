export async function scrapeYobee(storeId) {
  if (storeId.includes("mcd") || storeId.includes("yobee")) {
    return [
      { id: "mcd_bm", name: "Big Mac Meal", price: 69.9, inStock: true, weightKg: 0.6, category: "Burgers", img: "https://r2.mrcheaper.co.za/mcd_bm_thumb.jpg", badge: "Popular" }
    ];
  }
  return [];
}
