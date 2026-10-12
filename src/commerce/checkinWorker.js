import { CheckinAdapter } from './checkinAdapter.js';

export class CheckinWorker {
  constructor(flightIssuer, checkinAdapter) {
    this.flightIssuer = flightIssuer;
    this.checkinAdapter = checkinAdapter || new CheckinAdapter();
  }

  async runScheduledCheckinBatch() {
    const activePnrs = Array.from(this.flightIssuer.storedPnrs.values());
    const checkedInCount = [];

    for (const record of activePnrs) {
      if (record.checkinStatus.includes('REGISTERED') || record.checkinStatus === 'PENDING_T_MINUS_24H') {
        const checkinRes = await this.checkinAdapter.getCheckinStatus({
          pnr: record.pnr,
          onecheckinRef: record.onecheckinRef
        });

        if (checkinRes.success) {
          record.checkinStatus = checkinRes.checkinStatus;
          record.allocatedSeat = checkinRes.allocatedSeat;
          record.boardingPassUrl = checkinRes.boardingPassPdfUrl;

          checkedInCount.push({
            pnr: record.pnr,
            onecheckinRef: record.onecheckinRef,
            passengerName: `${record.passengerFirstName} ${record.passengerLastName}`,
            allocatedSeat: checkinRes.allocatedSeat,
            boardingPassPdfUrl: checkinRes.boardingPassPdfUrl,
            whatsAppNotificationText: `🛎️ *Auto Check-In Complete via 1Checkin!*\n\nYour flight *${record.pnr}* is checked in.\nSeat: *${checkinRes.allocatedSeat}*\n\n📄 Download Boarding Pass: ${checkinRes.boardingPassPdfUrl}`
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
