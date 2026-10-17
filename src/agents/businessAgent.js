export class BusinessAgent {
  constructor(config = {}) {
    this.id = config.id || `ba_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.ownerUserId = config.ownerUserId;
    this.name = config.name || 'Business Agent';
    this.category = config.category || 'General';
    this.status = config.status || 'DRAFT';
    this.location = config.location || { lat: -26.2041, lng: 28.0473, address: 'Johannesburg' };
    this.catalog = config.catalog || [];
    this.policies = config.policies || {
      fulfillmentTypes: ['DELIVERY'],
      negotiationRules: { allowNegotiation: false, minMarginPercent: 0 },
      hours: '08:00 - 20:00'
    };
    this.paymentInfo = config.paymentInfo || { paystackSubaccountId: null };
  }

  isOnline() {
    return this.status === 'ACTIVE';
  }

  findItems(query) {
    if (!query) return this.catalog;
    const q = query.toLowerCase();
    return this.catalog.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.category && item.category.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q))
    );
  }

  toJSON() {
    return {
      id: this.id,
      ownerUserId: this.ownerUserId,
      name: this.name,
      category: this.category,
      status: this.status,
      location: this.location,
      catalog: this.catalog,
      policies: this.policies,
      paymentInfo: this.paymentInfo
    };
  }
}
