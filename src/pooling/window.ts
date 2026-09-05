// /src/pooling/window.ts
import { getVehicleType } from "../../stores/vehicle.js";

export function checkVehiclePoolingLimit(items: any[] = []) {
  for (const item of items) {
    const vType = getVehicleType(item.name || item.vertical || "", item.weightKg || 1);
    if (vType.type === "BAKKIE" || vType.isBulky) {
      return { allowPooling: false, maxCapacity: 1, reason: "Bulky/Bakkie item restricted to 1 per pool" };
    }
  }
  return { allowPooling: true, maxCapacity: 4, reason: "Standard bike pooling up to 4 orders" };
}
