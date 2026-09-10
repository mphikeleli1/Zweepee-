import { CommerceAdapterInterface } from './interface.js';

export class UniversalClickCollectAdapter extends CommerceAdapterInterface {
  constructor(storeName = 'Universal Store', category = 'Retail') {
    super({ storeName, category });
    this.storeId = storeName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    this.storeName = storeName;
    this.category = category;
  }

  /**
   * Universal dynamic catalog generator for ANY store accepting Click & Collect
   * (Makro, Walmart, Dischem, Game, Specsavers, Builders, Vets, Boutiques).
   */
  async fetchCatalog(query = '') {
    const q = query.toLowerCase().trim();

    // Custom dynamic catalog generation based on query
    if (q.includes('makro') || q.includes('tv') || q.includes('bulk')) {
      return [
        { id: `${this.storeId}_1`, storeId: 'makro', storeName: 'Makro', name: 'LG 65" 4K Smart TV', category: 'Electronics', priceCents: 899900, image: 'https://cdn.myai.co.za/makro-tv.jpg', requiredVehicleClass: 'BAKKIE_1TON' },
        { id: `${this.storeId}_2`, storeId: 'makro', storeName: 'Makro', name: 'Bulk Toilet Paper 48 Pack', category: 'Groceries', priceCents: 24900, image: 'https://cdn.myai.co.za/makro-bulk.jpg', requiredVehicleClass: 'BIKE' }
      ];
    }

    if (q.includes('dischem') || q.includes('medicine') || q.includes('pharmacy') || q.includes('vitamins')) {
      return [
        { id: `${this.storeId}_3`, storeId: 'dischem', storeName: 'Dis-Chem Pharmacy', name: 'Vitamin C 1000mg', category: 'Pharmacy', priceCents: 14500, image: 'https://cdn.myai.co.za/dischem-vitc.jpg', requiredVehicleClass: 'BIKE' },
        { id: `${this.storeId}_4`, storeId: 'dischem', storeName: 'Dis-Chem Pharmacy', name: 'Panadol Extra 24s', category: 'Pharmacy', priceCents: 6500, image: 'https://cdn.myai.co.za/dischem-panadol.jpg', requiredVehicleClass: 'BIKE' }
      ];
    }

    if (q.includes('specsavers') || q.includes('glasses') || q.includes('contact lens')) {
      return [
        { id: `${this.storeId}_5`, storeId: 'specsavers', storeName: 'Specsavers', name: 'Acuvue Contact Lenses 30 Pack', category: 'Optical', priceCents: 42000, image: 'https://cdn.myai.co.za/specsavers-lenses.jpg', requiredVehicleClass: 'BIKE' },
        { id: `${this.storeId}_6`, storeId: 'specsavers', storeName: 'Specsavers', name: 'Designer Anti-Glare Frames', category: 'Optical', priceCents: 125000, image: 'https://cdn.myai.co.za/specsavers-frames.jpg', requiredVehicleClass: 'BIKE' }
      ];
    }

    if (q.includes('vet') || q.includes('dog food') || q.includes('cat food') || q.includes('pet')) {
      return [
        { id: `${this.storeId}_7`, storeId: 'vet', storeName: 'Vet Clinic & Pet Shop', name: 'Royal Canin Adult Dog Food 15kg', category: 'Veterinary', priceCents: 115000, image: 'https://cdn.myai.co.za/vet-dogfood.jpg', requiredVehicleClass: 'BAKKIE_1TON' },
        { id: `${this.storeId}_8`, storeId: 'vet', storeName: 'Vet Clinic & Pet Shop', name: 'Bravecto Flea & Tick Treatment', category: 'Veterinary', priceCents: 48000, image: 'https://cdn.myai.co.za/vet-bravecto.jpg', requiredVehicleClass: 'BIKE' }
      ];
    }

    if (q.includes('game') || q.includes('builder') || q.includes('appliances')) {
      return [
        { id: `${this.storeId}_9`, storeId: 'game', storeName: 'Game Stores', name: 'Defy Double Door Refrigerator', category: 'Appliances', priceCents: 699900, image: 'https://cdn.myai.co.za/game-fridge.jpg', requiredVehicleClass: 'BAKKIE_1TON' }
      ];
    }

    // Generic fallback for ANY custom shop name requested by user
    const storeDisplayName = query ? query.charAt(0).toUpperCase() + query.slice(1) : 'Click & Collect Store';
    return [
      {
        id: `${this.storeId}_custom`,
        storeId: this.storeId,
        storeName: storeDisplayName,
        name: `${storeDisplayName} Click & Collect Item`,
        category: 'General',
        priceCents: 15000,
        image: 'https://cdn.myai.co.za/generic-store.jpg',
        requiredVehicleClass: 'BIKE'
      }
    ];
  }

  async placeOrder(orderData) {
    return {
      orderId: `cnc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      storeName: this.storeName,
      fulfillmentMode: 'CLICK_AND_COLLECT',
      status: 'READY_FOR_COURIER_PICKUP',
      items: orderData.items,
      subtotalCents: orderData.subtotalCents
    };
  }

  async getStatus(orderId) {
    return { orderId, status: 'READY_FOR_COURIER_PICKUP' };
  }
}
