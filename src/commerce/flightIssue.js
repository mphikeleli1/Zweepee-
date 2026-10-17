import { AeronologyAdapter } from './aeronologyAdapter.js';
import { CheckinAdapter } from './checkinAdapter.js';

export class FlightIssuer {
  constructor(aeronologyAdapter, checkinAdapter) {
    this.aeronology = aeronologyAdapter || new AeronologyAdapter();
    this.checkin = checkinAdapter || new CheckinAdapter();
    this.storedPnrs = new Map();
  }

  async processAndIssueTicket({ offerId, passengerDetails = {}, paymentReference = '', splitAllocation = {} }) {
    const issueResult = await this.aeronology.issueTicket({ offerId, passengerDetails, paymentReference });

    if (!issueResult.success) {
      return { success: false, error: issueResult.error || 'Aeronology ticket issuance failed' };
    }

    const checkinReg = await this.checkin.registerPassengerForAutoCheckin({
      pnr: issueResult.pnr,
      passengerLastName: passengerDetails.lastName || 'Dlamini'
    });

    const pnrRecord = {
      pnr: issueResult.pnr,
      eTicketPdfUrl: issueResult.eTicketPdfUrl,
      aeronologyRef: issueResult.aeronologyRef,
      onecheckinRef: checkinReg.onecheckinRef,
      checkinStatus: checkinReg.status,
      boardingPassUrl: null,
      passengerLastName: passengerDetails.lastName || 'Dlamini',
      passengerFirstName: passengerDetails.firstName || 'Bongani',
      issuedAt: issueResult.issuedAt,
      paymentReference,
      splitAllocation: {
        flightCostCents: splitAllocation.flightCostCents || 95000,
        conciergeFeeCents: splitAllocation.conciergeFeeCents || 35000,
        provider: 'AERONOLOGY_SA_HOST_IATA'
      }
    };

    this.storedPnrs.set(issueResult.pnr, pnrRecord);

    return {
      success: true,
      pnr: issueResult.pnr,
      eTicketNumber: issueResult.eTicketNumber,
      eTicketPdfUrl: issueResult.eTicketPdfUrl,
      aeronologyRef: issueResult.aeronologyRef,
      onecheckinRef: checkinReg.onecheckinRef,
      status: 'ISSUED_AERONOLOGY_STORED_MRAI',
      pnrRecord
    };
  }

  getPnrRecord(pnr) {
    return this.storedPnrs.get(pnr) || null;
  }
}
