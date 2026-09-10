import { NetworkDiscovery } from './discovery.js';

export class AgentMatchingEngine {
  constructor(discoveryService) {
    this.discovery = discoveryService || new NetworkDiscovery();
    this.outcomeHistory = new Map();
  }

  recordOutcome(matchId, outcome) {
    this.outcomeHistory.set(matchId, outcome);
  }

  getReputationScore(agentId) {
    let successCount = 0;
    let totalCount = 0;

    for (const [id, outcome] of this.outcomeHistory.entries()) {
      if (outcome.agentId === agentId) {
        totalCount++;
        if (outcome.success) successCount++;
      }
    }

    if (totalCount === 0) return 1.0;
    return successCount / totalCount;
  }

  match({ queryText, maxBudgetCents, userLocation, requiredVehicleClass, category }) {
    const candidateAgents = this.discovery.discover({
      query: queryText,
      category,
      location: userLocation,
      maxDistanceKm: 30
    });

    const matchedResults = [];

    for (const agent of candidateAgents) {
      const items = agent.findItems(queryText);

      for (const item of items) {
        if (maxBudgetCents && item.priceCents > maxBudgetCents) {
          continue;
        }

        if (requiredVehicleClass && item.requiredVehicleClass) {
          if (item.requiredVehicleClass !== requiredVehicleClass) {
            continue;
          }
        }

        let distanceKm = 0;
        if (userLocation && agent.location) {
          distanceKm = this.discovery.calculateDistanceKm(
            userLocation.lat, userLocation.lng, agent.location.lat, agent.location.lng
          );
        }

        if (distanceKm > 30) {
          continue;
        }

        const reputation = this.getReputationScore(agent.id);
        const priceScore = maxBudgetCents ? 1 - (item.priceCents / maxBudgetCents) : 0.5;
        const distanceScore = Math.max(0, 1 - (distanceKm / 30));

        const score = (reputation * 0.4) + (priceScore * 0.3) + (distanceScore * 0.3);

        matchedResults.push({
          matchId: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          sellerAgent: agent,
          item,
          priceCents: item.priceCents,
          distanceKm,
          score,
          reputation
        });
      }
    }

    matchedResults.sort((a, b) => b.score - a.score);

    return matchedResults;
  }
}
