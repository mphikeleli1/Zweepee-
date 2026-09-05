export async function fetchTakealot(storeId) {
  if (storeId.includes("takealot")) {
    return [{ id: "takealot_item", name: "Takealot Daily Deal Item", price: 199.0, category: "General" }];
  }
  return [];
}
