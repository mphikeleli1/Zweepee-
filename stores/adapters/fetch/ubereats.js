export async function fetchUbereats(storeId) {
  if (storeId.includes("ubereats") || storeId.includes("uber")) {
    return [{ id: "ubereats_item", name: "UberEats Express Meal", price: 95.0, category: "Food" }];
  }
  return [];
}
