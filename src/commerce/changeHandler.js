import { AeronologyAdapter } from './aeronologyAdapter.js';

export class FlightChangeHandler {
  constructor(flightIssuer, aeronologyAdapter) {
    this.flightIssuer = flightIssuer;
    this.aeronology = aeronologyAdapter || new AeronologyAdapter();
  }

  async processFlightChangeRequest({ pnr, newDepartureDate, newFlightNumber }) {
    const record = this.flightIssuer.getPnrRecord(pnr);
    if (!record) {
      return { success: false, error: 'PNR not found in mrAI system' };
    }

    const changeRes = await this.aeronology.rebookFlight({ pnr, newDepartureDate, newFlightNumber });
    if (!changeRes.success) {
      return { success: false, error: changeRes.error || 'Aeronology rebooking failed' };
    }

    record.departureTime = `${newDepartureDate}T09:15:00`;
    record.flightNumber = changeRes.newFlightNumber;
    record.status = 'REISSUED_AERONOLOGY_SUCCESS';

    return {
      success: true,
      pnr,
      status: 'DATE_CHANGED_AERONOLOGY_REISSUED',
      newDepartureDate,
      newFlightNumber: changeRes.newFlightNumber,
      userNotificationText: `✈️ *Flight Change Reissued via Aeronology SA!*\n\nYour flight reference *${pnr}* has been rebooked for *${newDepartureDate}* on flight *${changeRes.newFlightNumber}*.`
    };
  }
}
