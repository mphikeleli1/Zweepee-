export class MultiStopRouteOptimizer {
  /**
   * Optimises multi-stop tour sequences.
   * Automatically enforces max 3 pickups per tour to keep food hot and ETAs fast.
   */
  optimiseRoute(stops = []) {
    if (stops.length <= 2) {
      return {
        stops,
        totalDistanceKm: this.calculateTotalDistance(stops),
        clusters: [stops]
      };
    }

    const pickups = stops.filter(s => s.type === 'PICKUP');
    const dropoffs = stops.filter(s => s.type === 'DROPOFF');

    // Multi-stop tour clustering (max 3 pickups per tour cluster)
    const MAX_PICKUPS_PER_TOUR = 3;
    const tourClusters = [];

    for (let i = 0; i < pickups.length; i += MAX_PICKUPS_PER_TOUR) {
      const pickupCluster = pickups.slice(i, i + MAX_PICKUPS_PER_TOUR);
      const clusterStops = [...pickupCluster, ...dropoffs];
      tourClusters.push({
        clusterIndex: Math.floor(i / MAX_PICKUPS_PER_TOUR) + 1,
        stops: clusterStops,
        pickupCount: pickupCluster.length,
        totalDistanceKm: this.calculateTotalDistance(clusterStops)
      });
    }

    const sortedPickups = [...pickups];
    const orderedStops = [...sortedPickups, ...dropoffs];

    return {
      stops: orderedStops,
      totalDistanceKm: this.calculateTotalDistance(orderedStops),
      isMultiTourSplit: pickups.length > MAX_PICKUPS_PER_TOUR,
      tourClusters
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
