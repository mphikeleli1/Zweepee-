/**
 * External Agent Interoperability Protocol Adapter
 * Connects myAI agents with Google A2A, Meta Agent Ecosystem, and Open Agent Protocols.
 */

export class ExternalAgentInteropAdapter {
  constructor(matchingEngine) {
    this.matchingEngine = matchingEngine;
  }

  /**
   * Universal External Agent Protocol Message Dispatcher
   */
  async handleExternalAgentQuery(externalRequest) {
    const { protocol, senderAgentId, action, query, maxBudgetCents, userLocation } = externalRequest;

    if (action === 'DISCOVER_OR_MATCH') {
      const matches = this.matchingEngine.match({
        queryText: query,
        maxBudgetCents,
        userLocation
      });

      return {
        protocol: protocol || 'OPEN_AGENT_PROTOCOL_V1',
        senderAgentId,
        myaiAgentId: 'myai_network_node',
        status: 'SUCCESS',
        zeroAdBias: true,
        matches: matches.map(m => ({
          sellerAgentId: m.sellerAgent.id,
          sellerName: m.sellerAgent.name,
          itemName: m.item.name,
          priceCents: m.priceCents,
          reputationScore: m.reputation
        }))
      };
    }

    if (action === 'PROPOSE_DEAL') {
      return {
        protocol: protocol || 'OPEN_AGENT_PROTOCOL_V1',
        senderAgentId,
        status: 'DEAL_PROPOSED',
        requiresHumanApprovalGate: true,
        approvalNotice: 'Proposal received. Human tap approval required on WhatsApp before authorization.'
      };
    }

    return { status: 'UNSUPPORTED_ACTION' };
  }
}
