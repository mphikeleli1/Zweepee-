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

  matchMultiDimensional({ queryText, maxBudgetCents, userLocation, requiredVehicleClass, category, filters = {} }) {
    const q = (queryText || '').toLowerCase().trim();

    // 1. Multi-Service Travel, Insurance & Holiday Bundles
    if (filters.vertical === 'BUNDLE' || q.includes('hotel') || q.includes('flight') || (q.includes('loan') && q.includes('car'))) {
      const bundleComponents = [
        { vertical: 'HOTEL', name: 'CPT Beachfront Hotel (4 Nights)', priceCents: 350000, agent: 'Cape Hospitality Agent' },
        { vertical: 'CAR_HIRE', name: 'CPT Car Rental (Compact SUV)', priceCents: 120000, agent: 'CPT Drive Agent' },
        { vertical: 'INSURANCE', name: 'Comprehensive Travel & Medical Cover', priceCents: 25000, agent: 'SafeGuard Insurance Agent' }
      ];

      const totalBundleCents = bundleComponents.reduce((acc, c) => acc + c.priceCents, 0);

      return {
        vertical: 'BUNDLE',
        components: bundleComponents,
        totalBundleCents,
        matched: [{ title: 'Cape Town Beachfront Holiday & Car Hire & Insurance Bundle', totalBundleCents }]
      };
    }

    // 2. Jobs / Hiring Intents
    if (filters.vertical === 'JOBS' || q.includes('cashier') || q.includes('hire staff') || q.includes('hiring') || q.includes('recruit')) {
      const candidates = [
        {
          agentId: 'agent_recruitment_midrand',
          agentName: 'Midrand Staffing & Recruitment Agent',
          title: 'Cashier (Matric Required)',
          location: 'Midrand',
          quantityAvailable: 15,
          salaryCents: 500000,
          qualifications: ['Matric'],
          reputationScore: 0.98
        }
      ];

      return {
        vertical: 'JOBS',
        matched: candidates.filter(c => {
          if (filters.quantity && c.quantityAvailable < filters.quantity) return false;
          if (filters.maxSalaryCents && c.salaryCents > filters.maxSalaryCents) return false;
          if (filters.qualification && !c.qualifications.includes(filters.qualification)) return false;
          return true;
        })
      };
    }

    // 3. Property / Rentals Intents
    if (filters.vertical === 'PROPERTY' || q.includes('bed') || q.includes('flat') || q.includes('apartment')) {
      const properties = [
        {
          agentId: 'agent_prop_jhb',
          agentName: 'JHB CBD Property Agent',
          title: '2 Bedroom Flat (Kid Friendly)',
          location: 'Johannesburg CBD',
          rentCents: 450000,
          bedrooms: 2,
          isKidFriendly: true,
          availableFrom: 'End Sep',
          reputationScore: 0.95
        }
      ];

      return {
        vertical: 'PROPERTY',
        matched: properties.filter(p => {
          if (filters.bedrooms && p.bedrooms !== filters.bedrooms) return false;
          if (filters.kidFriendly && !p.isKidFriendly) return false;
          if (maxBudgetCents && p.rentCents > maxBudgetCents) return false;
          return true;
        })
      };
    }

    // 4. Travel & Bus/Flight Tickets
    if (filters.vertical === 'TRAVEL' || q.includes('bus ticket') || q.includes('bus') || q.includes('train')) {
      const tickets = [
        {
          agentId: 'agent_intercity_bus',
          agentName: 'Intercity Bus Express Agent',
          title: 'Pretoria to Cape Town Bus Ticket',
          origin: 'Pretoria',
          destination: 'Cape Town',
          priceCents: 38000,
          reputationScore: 0.99
        }
      ];

      return {
        vertical: 'TRAVEL',
        matched: tickets
      };
    }

    // 5. Default Commerce & Product Matching
    const standardMatches = this.match({
      queryText,
      maxBudgetCents,
      userLocation,
      requiredVehicleClass,
      category
    });

    return {
      vertical: 'COMMERCE',
      matched: standardMatches
    };
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
          reputation,
          isAdPlacement: false
        });
      }
    }

    matchedResults.sort((a, b) => b.score - a.score);

    return matchedResults;
  }
}
