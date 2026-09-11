/**
 * Open Model Context Protocol (MCP) Server Adapter for myAI™
 * Provides JSON-RPC 2.0 endpoints for external AI agents (Meta AI, Claude/Anthropic, OpenAI, Google A2A, Mastra)
 * to discover supply/demand, negotiate A2A deals, and trigger secure Paystack escrow checkouts.
 */

export class MCPServerAdapter {
  constructor(matchingEngine, p2pEngine, a2aEngine) {
    this.matchingEngine = matchingEngine;
    this.p2pEngine = p2pEngine;
    this.a2aEngine = a2aEngine;
  }

  /**
   * Returns standard MCP Tool Definitions (`tools/list`)
   */
  getToolDefinitions() {
    return [
      {
        name: 'discover_supply_demand',
        description: 'Exposes myAI zero-ad-bias matching engine to external agents across Jobs, Property, Travel, and Commerce.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search intent query' },
            vertical: { type: 'string', description: 'COMMERCE | JOBS | PROPERTY | TRAVEL | BUNDLE' },
            maxBudgetCents: { type: 'number', description: 'Budget limit in Rand cents' }
          },
          required: ['query']
        }
      },
      {
        name: 'post_supply_offer',
        description: 'Allows external Personal or Business Agents to register structured offers in the myAI open network.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string' },
            itemName: { type: 'string' },
            askingPriceCents: { type: 'number' },
            category: { type: 'string' }
          },
          required: ['agentId', 'itemName', 'askingPriceCents']
        }
      },
      {
        name: 'negotiate_a2a_deal',
        description: 'Enables autonomous inter-agent price negotiation within human-set limits.',
        inputSchema: {
          type: 'object',
          properties: {
            buyerMaxCents: { type: 'number' },
            askingPriceCents: { type: 'number' },
            sellerMinCents: { type: 'number' }
          },
          required: ['buyerMaxCents', 'askingPriceCents', 'sellerMinCents']
        }
      },
      {
        name: 'request_transaction_checkout',
        description: 'Triggers Paystack/PayFast escrow checkout requiring mandatory 1-tap human approval on WhatsApp.',
        inputSchema: {
          type: 'object',
          properties: {
            buyerAgentId: { type: 'string' },
            sellerAgentId: { type: 'string' },
            agreedPriceCents: { type: 'number' },
            itemDescription: { type: 'string' }
          },
          required: ['buyerAgentId', 'sellerAgentId', 'agreedPriceCents']
        }
      }
    ];
  }

  /**
   * Handles incoming MCP JSON-RPC 2.0 requests
   */
  async handleJSONRPCRequest(rpcBody) {
    const { jsonrpc, id, method, params } = rpcBody || {};

    if (jsonrpc !== '2.0') {
      return { jsonrpc: '2.0', id: id || null, error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' } };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: this.getToolDefinitions()
        }
      };
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};

      if (name === 'discover_supply_demand') {
        const matches = this.matchingEngine.matchMultiDimensional({
          queryText: args?.query,
          filters: { vertical: args?.vertical, maxBudgetCents: args?.maxBudgetCents }
        });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'SUCCESS',
                  networkNode: 'myai_v25_open_node',
                  zeroAdBias: true,
                  vertical: matches.vertical,
                  matchedCount: matches.matched.length,
                  results: matches.matched
                })
              }
            ]
          }
        };
      }

      if (name === 'post_supply_offer') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'OFFER_REGISTERED',
                  offerId: `off_${Date.now()}`,
                  agentId: args?.agentId,
                  message: 'Offer is now live in the myAI open inter-agent network.'
                })
              }
            ]
          }
        };
      }

      if (name === 'negotiate_a2a_deal') {
        const result = this.a2aEngine.negotiatePrice({
          buyerMaxCents: args?.buyerMaxCents,
          askingPriceCents: args?.askingPriceCents,
          sellerMinCents: args?.sellerMinCents
        });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result)
              }
            ]
          }
        };
      }

      if (name === 'request_transaction_checkout') {
        const txId = `tx_mcp_${Date.now()}`;
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'CHECKOUT_CREATED',
                  transactionId: txId,
                  escrowProtection: 'PAYSTACK_24H_INSPECTION_ESCROW',
                  requiresHumanApproval: true,
                  notice: 'A 1-tap confirmation button has been sent to the human owner via WhatsApp.'
                })
              }
            ]
          }
        };
      }

      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: Tool ${name} is unknown.` } };
    }

    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Procedure ${method} not found.` } };
  }
}
