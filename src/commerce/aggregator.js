import { CommerceAdapterInterface } from './adapters/interface.js';

export class MockStoreAdapter extends CommerceAdapterInterface {
  constructor(storeId, storeName) {
    super({ storeId, storeName });
    this.storeId = storeId;
    this.storeName = storeName;
  }

  async fetchCatalog() {
    return [
      { id: `${this.storeId}_1`, storeId: this.storeId, storeName: this.storeName, name: 'Streetwise Two', category: 'Food', priceCents: 4500, image: 'https://cdn.myai.co.za/kfc-sw2.jpg', requiredVehicleClass: 'BIKE' },
      { id: `${this.storeId}_2`, storeId: this.storeId, storeName: this.storeName, name: 'Zinger Burger Meal', category: 'Food', priceCents: 7500, image: 'https://cdn.myai.co.za/kfc-zinger.jpg', requiredVehicleClass: 'BIKE' },
      { id: `${this.storeId}_3`, storeId: this.storeId, storeName: this.storeName, name: '2L Milk', category: 'Groceries', priceCents: 3200, image: 'https://cdn.myai.co.za/pnp-milk.jpg', requiredVehicleClass: 'BIKE' },
      { id: `${this.storeId}_4`, storeId: this.storeId, storeName: this.storeName, name: 'L-Shape Couch', category: 'Furniture', priceCents: 450000, image: 'https://cdn.myai.co.za/couch.jpg', requiredVehicleClass: 'BAKKIE_1TON' }
    ];
  }

  async placeOrder(orderData) {
    return {
      orderId: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      storeId: this.storeId,
      status: 'CONFIRMED',
      items: orderData.items,
      subtotalCents: orderData.subtotalCents
    };
  }

  async getStatus(orderId) {
    return { orderId, status: 'PREPARING' };
  }
}

export class CommerceAggregator {
  constructor() {
    this.adapters = new Map();
    // Pre-populate standard merchants (KFC, Steers, Pick n Pay, Woolies, Checkers, Dischem)
    this.registerAdapter('kfc', new MockStoreAdapter('kfc', 'KFC'));
    this.registerAdapter('steers', new MockStoreAdapter('steers', 'Steers'));
    this.registerAdapter('pnp', new MockStoreAdapter('pnp', 'Pick n Pay'));
    this.registerAdapter('woolworths', new MockStoreAdapter('woolworths', 'Woolworths'));
    this.registerAdapter('checkers', new MockStoreAdapter('checkers', 'Checkers'));
  }

  registerAdapter(storeId, adapter) {
    this.adapters.set(storeId, adapter);
  }

  async searchCatalog(query) {
    const results = [];
    const q = (query || '').toLowerCase();

    for (const [storeId, adapter] of this.adapters.entries()) {
      const catalog = await adapter.fetchCatalog();
      for (const item of catalog) {
        if (!q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || adapter.storeName.toLowerCase().includes(q)) {
          results.push(item);
        }
      }
    }

    return results;
  }
}
