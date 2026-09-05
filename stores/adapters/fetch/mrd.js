export async function fetchMrd(storeId) {
  if (storeId.includes("mrd") || storeId.includes("mrdelivery")) {
    return [{ id: "mrd_item", name: "Mr D Food Combo", price: 89.0, category: "Food" }];
  }
  return [];
}
