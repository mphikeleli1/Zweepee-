import { ConsortiumFlightEngine } from './consortiumFlight.js';

/**
 * flightIssue.js
 * Issues tickets via Consortium NDC API upon single total payment confirmation
 * and stores the resulting PNR record in mrAI's system for full servicing ownership.
 */
export class FlightIssuer {
  constructor(consortiumEngine) {
    this.consortium = consortiumEngine || new ConsortiumFlightEngine();
    this.storedPnrs = new Map();
  }

  async processAndIssueTicket({ offerId, passengerDetails = {}, paymentReference = '', splitAllocation = {} }) {
    const issueResult = await this.consortium.issueTicket({ offerId, passengerDetails, paymentReference });

    if (!issueResult.success) {
      return { success: false, error: issueResult.error || 'Ticket issuance failed' };
    }

    const pnrRecord = {
      ...issueResult.pnrRecord,
      issuedAt: issueResult.issuedAt,
      paymentReference,
      splitAllocation: {
        flightCostCents: splitAllocation.flightCostCents || 95000,
        conciergeFeeCents: splitAllocation.conciergeFeeCents || 35000,
        provider: 'CONSORTIUM_BSP_SETTLEMENT'
      },
      isPnrOwnedByMrAI: true
    };

    this.storedPnrs.set(issueResult.pnr, pnrRecord);

    return {
      success: true,
      pnr: issueResult.pnr,
      eTicketNumber: issueResult.eTicketNumber,
      eTicketPdfUrl: issueResult.eTicketPdfUrl,
      status: 'ISSUED_AND_STORED_IN_MRAI_SYSTEM',
      pnrRecord
    };
  }

  getPnrRecord(pnr) {
    return this.storedPnrs.get(pnr) || null;
  }
}
