export async function fetchWoolies(storeId) {
  if (storeId.includes("woolies") || storeId.includes("woolworths")) {
    return [{ id: "woolies_item", name: "Woolworths Dash Organic Item", price: 65.0, category: "Grocery" }];
  }
  return [];
}
