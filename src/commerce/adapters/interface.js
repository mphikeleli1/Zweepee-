/**
 * Standardized Commerce Adapter Interface
 */

export class CommerceAdapterInterface {
  constructor(merchantConfig = {}) {
    this.merchantConfig = merchantConfig;
  }

  async fetchCatalog() {
    throw new Error("fetchCatalog() must be implemented by store adapter");
  }

  async placeOrder(orderData) {
    throw new Error("placeOrder() must be implemented by store adapter");
  }

  async getStatus(orderId) {
    throw new Error("getStatus() must be implemented by store adapter");
  }
}
