export async function fetchSixty60(storeId) {
  if (storeId.includes("sixty60") || storeId.includes("checkers")) {
    return [{ id: "sixty60_item", name: "Checkers Sixty60 Special", price: 29.0, category: "Grocery" }];
  }
  return [];
}
