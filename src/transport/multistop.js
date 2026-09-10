export class MultiStopRouteOptimizer {
  optimiseRoute(stops = []) {
    if (stops.length <= 2) {
      return {
        stops,
        totalDistanceKm: this.calculateTotalDistance(stops)
      };
    }

    const pickups = stops.filter(s => s.type === 'PICKUP');
    const dropoffs = stops.filter(s => s.type === 'DROPOFF');

    const sortedPickups = [...pickups];
    const orderedStops = [...sortedPickups, ...dropoffs];

    return {
      stops: orderedStops,
      totalDistanceKm: this.calculateTotalDistance(orderedStops)
    };
  }

  calculateTotalDistance(stops = []) {
    let dist = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      dist += this.haversineKm(stops[i], stops[i + 1]);
    }
    return Math.round(dist * 10) / 10;
  }

  haversineKm(p1, p2) {
    if (!p1 || !p2 || p1.lat === undefined || p2.lat === undefined) return 0;
    const R = 6371;
    const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
    const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
