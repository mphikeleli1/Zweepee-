import { AeronologyAdapter } from './aeronologyAdapter.js';

export class ConsortiumFlightEngine {
  constructor(options = {}) {
    this.aeronology = new AeronologyAdapter(options);
  }

  async searchFlights(params) {
    return this.aeronology.searchFlights(params);
  }

  async issueTicket(params) {
    return this.aeronology.issueTicket(params);
  }

  async retrieveOrder(params) {
    return { success: true, pnr: params.pnr, status: 'CONFIRMED' };
  }

  async changeBooking(params) {
    return this.aeronology.rebookFlight(params);
  }

  async executeNDCCheckIn(params) {
    return { success: true, pnr: params.pnr, status: 'CHECKED_IN' };
  }
}
