export async function scrapeShopify(storeId) {
  return [
    { id: "clicks_panado", name: "Panado 24 Tablets", price: 29.9, inStock: true, weightKg: 0.1, category: "Pharmacy", img: "https://r2.mrcheaper.co.za/clicks_panado_thumb.jpg", badge: "Rx" },
    { id: "clicks_vitc", name: "Vitamin C 1000mg Effervescent", price: 89.9, inStock: true, weightKg: 0.2, category: "Wellness", img: "https://r2.mrcheaper.co.za/clicks_vitc_thumb.jpg", badge: "Popular" }
  ];
}
