import { BusinessAgent } from './businessAgent.js';

export class PersonalAgent {
  constructor({ id, userId, phoneNumber, name, location = null, memory = {} }) {
    this.id = id || `pa_${phoneNumber.replace(/[^0-9]/g, '')}`;
    this.userId = userId || `usr_${phoneNumber.replace(/[^0-9]/g, '')}`;
    this.phoneNumber = phoneNumber;
    this.name = name || 'User';
    this.location = location || { lat: -26.2041, lng: 28.0473, address: 'Johannesburg' };
    this.businessAgents = new Map(); // Personal Agent owns/controls multiple Business Agents
    this.memory = {
      addresses: memory.addresses || [],
      gpsLocations: memory.gpsLocations || [],
      favoriteStores: memory.favoriteStores || [],
      orderHistory: memory.orderHistory || [],
      preferences: memory.preferences || {},
      trustedCounterparties: memory.trustedCounterparties || []
    };
  }

  /**
   * Section 3: ONE PERSON = ONE PERSONAL AGENT
   * Single Personal Agent owns and controls multiple Business Agents
   * Example: John -> Personal Agent -> Taxi BA, Restaurant BA, Hardware BA
   */
  createOrLinkBusinessAgent(config = {}) {
    const ba = new BusinessAgent({
      ownerUserId: this.userId,
      ...config
    });
    this.businessAgents.set(ba.id, ba);
    return ba;
  }

  getOwnedBusinessAgents() {
    return Array.from(this.businessAgents.values());
  }

  setGpsLocation(lat, lng, addressName = '') {
    this.location = {
      lat,
      lng,
      address: addressName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    };
    this.memory.gpsLocations.push(this.location);
    if (addressName && !this.memory.addresses.includes(addressName)) {
      this.memory.addresses.push(addressName);
    }
  }

  getGreeting() {
    const hasHistory = this.memory.orderHistory && this.memory.orderHistory.length > 0;
    if (hasHistory) {
      const lastOrder = this.memory.orderHistory[this.memory.orderHistory.length - 1];
      return {
        isReturning: true,
        message: `Welcome back ${this.name} 👋 Same order as last time (${lastOrder.summary})?`,
        lastOrder
      };
    }
    return {
      isReturning: false,
      message: `Hello ${this.name}! What would you like to order or send today?`
    };
  }

  learnFromTransaction(transaction) {
    if (!transaction) return;

    const record = {
      id: transaction.id,
      summary: transaction.summary || transaction.intentMode,
      store: transaction.storeName,
      items: transaction.items || [],
      totalCents: transaction.totalAmountCents,
      timestamp: Date.now()
    };

    this.memory.orderHistory.push(record);

    if (transaction.deliveryAddress && !this.memory.addresses.includes(transaction.deliveryAddress)) {
      this.memory.addresses.push(transaction.deliveryAddress);
    }

    if (transaction.storeName && !this.memory.favoriteStores.includes(transaction.storeName)) {
      this.memory.favoriteStores.push(transaction.storeName);
    }
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      phoneNumber: this.phoneNumber,
      name: this.name,
      location: this.location,
      businessAgentsCount: this.businessAgents.size,
      memory: this.memory
    };
  }
}
