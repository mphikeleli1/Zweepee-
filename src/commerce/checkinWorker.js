import { ConsortiumFlightEngine } from './consortiumFlight.js';

/**
 * checkinWorker.js
 * Cron worker running every 15 minutes.
 * Scans active PNRs departing within T-24 hours, executes direct NDC check-in via Consortium API,
 * and pushes boarding passes & QR codes to WhatsApp.
 */
export class CheckinWorker {
  constructor(flightIssuer, consortiumEngine) {
    this.flightIssuer = flightIssuer;
    this.consortium = consortiumEngine || new ConsortiumFlightEngine();
  }

  async runScheduledCheckinBatch() {
    const activePnrs = Array.from(this.flightIssuer.storedPnrs.values());
    const checkedInCount = [];

    for (const record of activePnrs) {
      if (record.checkinStatus === 'PENDING_T_MINUS_24H') {
        const checkinRes = await this.consortium.executeNDCCheckIn({
          pnr: record.pnr,
          passengerLastName: record.passengerLastName,
          seatPreference: 'WINDOW'
        });

        if (checkinRes.success) {
          record.checkinStatus = 'CHECKED_IN_T_24H';
          record.allocatedSeat = checkinRes.allocatedSeat;
          record.boardingPassPdfUrl = checkinRes.boardingPassPdfUrl;

          checkedInCount.push({
            pnr: record.pnr,
            passengerName: `${record.passengerFirstName} ${record.passengerLastName}`,
            allocatedSeat: checkinRes.allocatedSeat,
            boardingPassPdfUrl: checkinRes.boardingPassPdfUrl,
            whatsAppNotificationText: `🛎️ *Auto Check-In Complete!*\n\nYour flight *${record.flightNumber}* (${record.origin} → ${record.destination}) is checked in.\nSeat: *${checkinRes.allocatedSeat}*\n\n📄 Download Boarding Pass: ${checkinRes.boardingPassPdfUrl}`
          });
        }
      }
    }

    return {
      success: true,
      processedBatchSize: activePnrs.length,
      autoCheckedInList: checkedInCount,
      timestamp: new Date().toISOString()
    };
  }
}
