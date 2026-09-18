import { ConsortiumFlightEngine } from './consortiumFlight.js';

/**
 * changeHandler.js
 * Servicing module for processing flight date, route, or passenger changes via NDC OrderChange.
 */
export class FlightChangeHandler {
  constructor(flightIssuer, consortiumEngine) {
    this.flightIssuer = flightIssuer;
    this.consortium = consortiumEngine || new ConsortiumFlightEngine();
  }

  async processFlightChangeRequest({ pnr, newDepartureDate, newFlightNumber }) {
    const record = this.flightIssuer.getPnrRecord(pnr);
    if (!record) {
      return { success: false, error: 'PNR not found in mrAI system' };
    }

    const changeRes = await this.consortium.changeBooking({ pnr, newDepartureDate, newFlightNumber });
    if (!changeRes.success) {
      return { success: false, error: changeRes.error || 'NDC OrderChange failed' };
    }

    record.departureTime = `${newDepartureDate}T09:15:00`;
    record.flightNumber = changeRes.newFlightNumber;
    record.status = 'REISSUED_SERV_SUCCESS';

    return {
      success: true,
      pnr,
      status: 'DATE_CHANGED_TICKET_REISSUED',
      newDepartureDate,
      newFlightNumber: changeRes.newFlightNumber,
      userNotificationText: `✈️ *Flight Change Reissued!*\n\nYour flight reference *${pnr}* has been reissued for *${newDepartureDate}* on flight *${changeRes.newFlightNumber}*.`
    };
  }
}
