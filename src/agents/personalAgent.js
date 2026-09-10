export class PersonalAgent {
  constructor({ id, userId, phoneNumber, name, memory = {} }) {
    this.id = id || `pa_${phoneNumber.replace(/[^0-9]/g, '')}`;
    this.userId = userId || `usr_${phoneNumber.replace(/[^0-9]/g, '')}`;
    this.phoneNumber = phoneNumber;
    this.name = name || 'User';
    this.memory = {
      addresses: memory.addresses || [],
      favoriteStores: memory.favoriteStores || [],
      orderHistory: memory.orderHistory || [],
      preferences: memory.preferences || {},
      trustedCounterparties: memory.trustedCounterparties || []
    };
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
      memory: this.memory
    };
  }
}
