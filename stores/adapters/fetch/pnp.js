export async function fetchPnp(storeId) {
  if (storeId.includes("pnp") || storeId.includes("picknpay")) {
    return [{ id: "pnp_item", name: "Pick n Pay ASAP Fresh Item", price: 39.0, category: "Grocery" }];
  }
  return [];
}
