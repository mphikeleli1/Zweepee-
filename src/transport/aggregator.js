/**
 * Transport Aggregator & Vehicle Classifier
 * Couriers only (no runners).
 * Classifies loads and selects CHEAPEST SUITABLE provider after vehicle capability filtering.
 */

export const VEHICLE_CLASSES = {
  BIKE: { code: 'BIKE', maxWeightKg: 10, name: 'Motorcycle' },
  BAKKIE_1TON: { code: 'BAKKIE_1TON', maxWeightKg: 1000, name: 'Bakkie / 1-Ton Truck' },
  TRUCK_2TON: { code: 'TRUCK_2TON', maxWeightKg: 2000, name: '2-Ton Closed Truck' },
  TRUCK_4TON: { code: 'TRUCK_4TON', maxWeightKg: 4000, name: '4-Ton Heavy Truck' },
  TRUCK_8TON: { code: 'TRUCK_8TON', maxWeightKg: 8000, name: '8-Ton Freight Truck' }
};

export function classifyLoadVehicle({ items = [], totalWeightKg = 1 }) {
  let requiredClass = 'BIKE';

  if (totalWeightKg > 4000) {
    return 'TRUCK_8TON';
  } else if (totalWeightKg > 2000) {
    return 'TRUCK_4TON';
  } else if (totalWeightKg > 1000) {
    return 'TRUCK_2TON';
  } else if (totalWeightKg > 10 || items.some(i => ['Furniture', 'Appliances', 'Hardware'].includes(i.category))) {
    return 'BAKKIE_1TON';
  }

  return requiredClass;
}

export class TransportAggregator {
  constructor(providers = []) {
    this.providers = providers.length > 0 ? providers : [
      { id: 'picup', name: 'PicUp', supportedVehicles: ['BIKE', 'BAKKIE_1TON', 'TRUCK_2TON', 'TRUCK_4TON', 'TRUCK_8TON'], baseRateCents: 4000, perKmCents: 1000 },
      { id: 'pingo', name: 'Pingo Express', supportedVehicles: ['BIKE', 'BAKKIE_1TON'], baseRateCents: 3500, perKmCents: 900 },
      { id: 'truckin', name: 'TruckIn Heavy', supportedVehicles: ['TRUCK_2TON', 'TRUCK_4TON', 'TRUCK_8TON'], baseRateCents: 15000, perKmCents: 2500 },
      { id: 'muvr', name: 'Muvr Furniture', supportedVehicles: ['BAKKIE_1TON', 'TRUCK_2TON'], baseRateCents: 8000, perKmCents: 1500 }
    ];
  }

  /**
   * Query all providers concurrently with Promise.allSettled.
   * Filter out unsuitable vehicles, then pick the cheapest suitable quote.
   */
  async getQuotes({ pickupLocation, dropoffLocation, distanceKm = 5, items = [], totalWeightKg = 1 }) {
    const requiredVehicleClass = classifyLoadVehicle({ items, totalWeightKg });

    const quotePromises = this.providers.map(async (provider) => {
      // Check vehicle capability
      if (!provider.supportedVehicles.includes(requiredVehicleClass)) {
        throw new Error(`Provider ${provider.name} does not support vehicle class ${requiredVehicleClass}`);
      }

      // Calculate quote
      const dist = Math.max(1, distanceKm);
      const rawQuoteCents = provider.baseRateCents + (dist * provider.perKmCents);

      return {
        providerId: provider.id,
        providerName: provider.name,
        vehicleClass: requiredVehicleClass,
        rawQuoteCents,
        distanceKm: dist,
        etaMinutes: 15 + Math.round(dist * 3)
      };
    });

    const results = await Promise.allSettled(quotePromises);

    const validQuotes = [];
    for (const res of results) {
      if (res.status === 'fulfilled') {
        validQuotes.push(res.value);
      }
    }

    if (validQuotes.length === 0) {
      throw new Error(`No available courier provider supports required vehicle class ${requiredVehicleClass}`);
    }

    // Sort ascending by raw quote to select cheapest suitable
    validQuotes.sort((a, b) => a.rawQuoteCents - b.rawQuoteCents);

    return {
      requiredVehicleClass,
      cheapestQuote: validQuotes[0],
      allQuotes: validQuotes
    };
  }
}
