export async function fetchOnecart(storeId) {
  if (storeId.includes("onecart")) {
    return [{ id: "onecart_item", name: "OneCart Express Item", price: 45.0, category: "Grocery" }];
  }
  return [];
}
