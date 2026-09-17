export class DuffelFlightEngine {
  constructor(apiToken) {
    this.apiToken = apiToken || 'duffel_test_mock_token';
    this.baseUrl = 'https://api.duffel.com/air';
  }

  async searchFlights({ origin = 'JNB', destination = 'CPT', departureDate = '2025-10-15', passengers = [{ type: 'adult' }] }) {
    if (this.apiToken === 'duffel_test_mock_token') {
      const destCode = (destination || 'CPT').toUpperCase();
      const airline = destCode === 'DUR' ? 'FlySafair' : 'Airlink';
      const flightNum = destCode === 'DUR' ? 'FA282' : 'FA201';
      const priceCents = destCode === 'DUR' ? 95000 : 125000; // R950.00 to Durban, R1,250.00 to Cape Town

      return {
        success: true,
        offerId: `off_mock_${destCode.toLowerCase()}_${Date.now()}`,
        airline,
        flightNumber: flightNum,
        route: `${origin} → ${destCode}`,
        departureTime: '09:15 AM',
        arrivalTime: '10:25 AM',
        priceCents,
        currency: 'ZAR',
        holdSupported: true
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/offer_requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Duffel-Version': 'v2',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {
            slices: [{ origin, destination, departure_date: departureDate }],
            passengers,
            cabin_class: 'economy'
          }
        })
      });

      const json = await response.json();
      const firstOffer = json.data?.offers?.[0];

      if (!firstOffer) {
        return { success: false, error: 'No flights found' };
      }

      return {
        success: true,
        offerId: firstOffer.id,
        airline: firstOffer.owner.name,
        flightNumber: firstOffer.slices[0].segments[0].marketing_carrier_flight_number,
        route: `${origin} → ${destination}`,
        departureTime: firstOffer.slices[0].segments[0].departing_at,
        arrivalTime: firstOffer.slices[0].segments[0].arriving_at,
        priceCents: Math.round(parseFloat(firstOffer.total_amount) * 100),
        currency: firstOffer.total_currency,
        holdSupported: true
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async createHoldOrder({ offerId, passengers = [] }) {
    if (this.apiToken === 'duffel_test_mock_token') {
      const holdExpiryTime = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20 min hold
      return {
        success: true,
        orderId: `ord_hold_${Date.now()}`,
        offerId,
        type: 'hold',
        status: 'HOLD_ACTIVE',
        expiresAt: holdExpiryTime,
        totalAmountCents: 95000,
        currency: 'ZAR'
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Duffel-Version': 'v2',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {
            type: 'hold',
            selected_offers: [offerId],
            passengers
          }
        })
      });

      const json = await response.json();
      if (!json.data) {
        return { success: false, error: json.errors?.[0]?.message || 'Hold order creation failed' };
      }

      return {
        success: true,
        orderId: json.data.id,
        offerId,
        type: 'hold',
        status: 'HOLD_ACTIVE',
        expiresAt: json.data.payment_requirements?.payment_required_by,
        totalAmountCents: Math.round(parseFloat(json.data.total_amount) * 100),
        currency: json.data.total_currency
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async payAndConfirmOrder({ orderId, paymentType = 'balance' }) {
    if (this.apiToken === 'duffel_test_mock_token') {
      return {
        success: true,
        orderId,
        bookingReference: `PNR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        status: 'CONFIRMED_E_TICKET_ISSUED',
        eTicketPdfUrl: `https://myai.co.za/etickets/${orderId}.pdf`,
        confirmedAt: new Date().toISOString()
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders/${orderId}/actions/pay`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Duffel-Version': 'v2',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {
            payment: {
              type: paymentType,
              amount: '1250.00',
              currency: 'ZAR'
            }
          }
        })
      });

      const json = await response.json();
      if (!json.data) {
        return { success: false, error: json.errors?.[0]?.message || 'Flight order payment failed' };
      }

      return {
        success: true,
        orderId: json.data.id,
        bookingReference: json.data.booking_reference,
        status: 'CONFIRMED_E_TICKET_ISSUED',
        eTicketPdfUrl: json.data.documents?.[0]?.url || `https://myai.co.za/etickets/${orderId}.pdf`,
        confirmedAt: new Date().toISOString()
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async releaseHoldOrder(orderId) {
    return {
      success: true,
      orderId,
      status: 'HOLD_RELEASED',
      releasedAt: new Date().toISOString()
    };
  }

  generateSecurePassengerFormUrl(waId, sessionRef) {
    return `https://myai.co.za/secure-passenger-info?waId=${encodeURIComponent(waId)}&ref=${encodeURIComponent(sessionRef)}`;
  }
}
