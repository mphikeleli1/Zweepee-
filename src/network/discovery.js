export class NetworkDiscovery {
  constructor(registry = []) {
    this.registry = registry;
  }

  registerAgent(agent) {
    this.registry.push(agent);
  }

  calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  discover({ query, category, location, maxDistanceKm = 50 }) {
    const q = (query || '').toLowerCase().trim();

    return this.registry.filter(agent => {
      if (agent.status && agent.status !== 'ACTIVE') return false;

      if (category && agent.category && agent.category.toLowerCase() !== category.toLowerCase()) {
        return false;
      }

      if (location && agent.location && location.lat && location.lng && agent.location.lat && agent.location.lng) {
        const dist = this.calculateDistanceKm(location.lat, location.lng, agent.location.lat, agent.location.lng);
        if (dist > maxDistanceKm) return false;
      }

      if (q) {
        const nameMatch = agent.name.toLowerCase().includes(q);
        const itemMatch = agent.catalog && agent.catalog.some(item =>
          item.name.toLowerCase().includes(q) || (item.category && item.category.toLowerCase().includes(q))
        );
        if (!nameMatch && !itemMatch) return false;
      }

      return true;
    });
  }
}
