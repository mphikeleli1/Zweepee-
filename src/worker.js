import { classifyIntent } from './lib/router.js';
import { calculatePricing, getPricingConfig } from './lib/pricing.js';
import { DoubleEntryLedger } from './lib/ledger.js';
import { TransactionStateMachine, TRANSACTION_STATES } from './lib/stateMachine.js';
import { IdempotencyManager } from './lib/idempotency.js';
import { PersonalAgent } from './agents/personalAgent.js';
import { AgentFactory } from './agents/factory.js';
import { CommerceAggregator } from './commerce/aggregator.js';
import { TransportAggregator } from './transport/aggregator.js';
import { PaystackPaymentGateway } from './payments/paystack.js';
import { PayFastPaymentGateway } from './payments/payfast.js';
import { ScamPreventionEngine } from './trust/scamPrevention.js';
import { WhatsAppTransportAdapter } from './whatsapp/transport.js';
import { WhatsAppUIBuilder } from './whatsapp/uiBuilder.js';
import { WhatsAppSessionEngine } from './whatsapp/sessionEngine.js';
import { SentinelSelfHealingMonitor } from './sentinel/sentinel.js';
import { ExternalAgentInteropAdapter } from './network/interop.js';
import { AgentMatchingEngine } from './network/matching.js';
import { NetworkDiscovery } from './network/discovery.js';
import { MCPServerAdapter } from './network/mcpServer.js';
import { P2PCommerceEngine } from './trust/p2pFeatures.js';
import { A2ACommerceEngine } from './trust/a2aCommerce.js';
import { RecruitmentContractEngine } from './employment/msaContract.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === '/' || path === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'myAI v25 Network Node' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Route: Employer Contracts & Legal Evidence Bundles API
    if (path === '/api/v25/employer/contracts' && method === 'GET') {
      try {
        const employerId = url.searchParams.get('employerId') || '27820000000';
        const contractId = url.searchParams.get('contractId');
        const contractEngine = new RecruitmentContractEngine(env?.DB, env?.SESSIONS_KV);

        if (contractId) {
          const bundle = await contractEngine.getContractEvidenceBundle(contractId);
          return new Response(JSON.stringify(bundle), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const contracts = await contractEngine.getEmployerContracts(employerId);
        return new Response(JSON.stringify({ success: true, employerId, count: contracts.length, contracts }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    // Route: Model Context Protocol (MCP) JSON-RPC 2.0 Endpoint
    if ((path === '/api/v25/mcp/rpc' || path === '/api/v25/mcp/tools') && method === 'POST') {
      try {
        const body = await request.json();
        const discovery = new NetworkDiscovery();
        const matching = new AgentMatchingEngine(discovery);
        const p2p = new P2PCommerceEngine(env?.DB);
        const a2a = new A2ACommerceEngine();
        const mcpServer = new MCPServerAdapter(matching, p2p, a2a);

        const rpcResponse = await mcpServer.handleJSONRPCRequest(body);
        return new Response(JSON.stringify(rpcResponse), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: err.message } }), { status: 500 });
      }
    }

    // Route: External Agent Interoperability Protocol (Google A2A / Meta / Open Protocols)
    if (path === '/api/v25/a2a/interop' && method === 'POST') {
      try {
        const body = await request.json();
        const discovery = new NetworkDiscovery();
        const matching = new AgentMatchingEngine(discovery);
        const interop = new ExternalAgentInteropAdapter(matching);

        const response = await interop.handleExternalAgentQuery(body);
        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    if (path === '/api/v25/sentinel/health' && method === 'GET') {
      const sentinel = new SentinelSelfHealingMonitor(env?.DB, env?.SESSIONS_KV, env?.CATALOG_CACHE_KV);
      const report = await sentinel.runHealthCheckAndSelfHeal();
      return new Response(JSON.stringify(report), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (path === '/api/v25/webhook/whatsapp' && method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      const verifyToken = env?.VERIFY_TOKEN || 'myai_verify_token_2025';

      if (mode === 'subscribe' && token === verifyToken) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    if (path === '/api/v25/webhook/whatsapp' && method === 'POST') {
      try {
        const body = await request.json();
        const sessionEngine = new WhatsAppSessionEngine(env?.SESSIONS_KV, env?.USERS_KV, env?.CATALOG_CACHE_KV, env?.DB);
        const transportAdapter = new WhatsAppTransportAdapter('META_WEBHOOK');

        const messageText = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || '';
        const buttonPayload = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive?.button_reply?.id || null;
        const locationObj = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.location || null;
        const sender = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || '27820000000';

        const screenResponse = await sessionEngine.handleIncomingMessage(sender, messageText, buttonPayload, locationObj);

        // Dispatch outbound WhatsApp response via Transport Abstraction
        const outboundDispatch = await transportAdapter.sendMessage(sender, screenResponse);

        return new Response(JSON.stringify({ success: true, screenResponse, outboundDispatch }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    if (path === '/api/v25/webhook/paystack' && method === 'POST') {
      const paystack = new PaystackPaymentGateway(env?.PAYSTACK_SECRET_KEY);
      const rawBody = await request.text();
      const sig = request.headers.get('x-paystack-signature');

      if (!await paystack.verifyWebhookSignature(rawBody, sig)) {
        return new Response('Invalid signature', { status: 400 });
      }

      let payload = {};
      try { payload = JSON.parse(rawBody); } catch (_) {}

      const eventType = payload?.event || 'charge.success';
      const eventId = payload?.data?.id || sig || Date.now();

      const idempotency = new IdempotencyManager(env?.SESSIONS_KV);
      const lock = await idempotency.checkAndLock(`paystack_${eventId}`);
      if (lock.isDuplicate) {
        return new Response('Duplicate event ignored', { status: 200 });
      }

      if (eventType === 'charge.success') {
        const txId = payload?.data?.reference || `tx_paystack_${Date.now()}`;
        const amountCents = payload?.data?.amount || 0;
        const ledger = new DoubleEntryLedger(env?.DB);

        await ledger.recordTransaction({
          transactionId: txId,
          idempotencyKey: `idem_paystack_${eventId}`,
          entries: [
            { account: 'ASSETS:PAYSTACK_CLEARING', type: 'DEBIT', amountCents: amountCents || 10000 },
            { account: 'LIABILITIES:MERCHANT_PAYABLE', type: 'CREDIT', amountCents: Math.round((amountCents || 10000) * 0.7) },
            { account: 'REVENUE:MYAI_MARGIN', type: 'CREDIT', amountCents: Math.round((amountCents || 10000) * 0.3) }
          ],
          description: 'Paystack Charge Success Payment Webhook Settlement'
        });

        // Check if reference is a R350 flight concierge fee
        if (txId.includes('concierge')) {
          const sessionEngine = new WhatsAppSessionEngine(env?.SESSIONS_KV, env?.USERS_KV, env?.CATALOG_CACHE_KV, env?.DB);
          const flightScreen = await sessionEngine.processConciergePaymentWebhook({
            reference: txId,
            amountCents: amountCents || 35000,
            gateway: 'PAYSTACK',
            isSuccess: true
          });

          await idempotency.complete(`paystack_${eventId}`, { processed: true, flightScreen });
          return new Response(JSON.stringify({ status: 'success', eventProcessed: eventType, flightScreen }), { headers: { 'Content-Type': 'application/json' } });
        }
      }

      await idempotency.complete(`paystack_${eventId}`, { processed: true });
      return new Response(JSON.stringify({ status: 'success', eventProcessed: eventType }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (path === '/api/v25/webhook/payfast' && method === 'POST') {
      const rawText = await request.text();
      const params = Object.fromEntries(new URLSearchParams(rawText));
      const payfast = new PayFastPaymentGateway(env?.PAYFAST_MERCHANT_ID || '10000100');

      if (!payfast.verifyWebhookSignature(params)) {
        return new Response('Invalid PayFast Signature', { status: 400 });
      }

      const txId = params.m_payment_id || `tx_pf_${Date.now()}`;
      const amountCents = Math.round(parseFloat(params.amount_gross || '0') * 100);
      const ledger = new DoubleEntryLedger(env?.DB);

      await ledger.recordTransaction({
        transactionId: txId,
        idempotencyKey: `idem_payfast_${txId}`,
        entries: [
          { account: 'ASSETS:PAYFAST_CLEARING', type: 'DEBIT', amountCents: amountCents || 10000 },
          { account: 'REVENUE:MYAI_MARGIN', type: 'CREDIT', amountCents: amountCents || 10000 }
        ],
        description: 'PayFast Instant EFT Webhook Settlement'
      });

      if (txId.includes('concierge')) {
        const sessionEngine = new WhatsAppSessionEngine(env?.SESSIONS_KV, env?.USERS_KV, env?.CATALOG_CACHE_KV, env?.DB);
        const flightScreen = await sessionEngine.processConciergePaymentWebhook({
          reference: txId,
          amountCents: amountCents || 35000,
          gateway: 'PAYFAST',
          isSuccess: true
        });

        return new Response(JSON.stringify({ status: 'success', transactionId: txId, flightScreen }), { headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ status: 'success', transactionId: txId }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (path === '/api/v25/webhook/picup' && method === 'POST') {
      const body = await request.json();
      const waybillNo = body?.waybill_number || `picup_${Date.now()}`;
      const status = body?.status || 'COLLECTED';

      return new Response(JSON.stringify({ status: 'success', waybillNo, deliveryStatus: status }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    const factory = new AgentFactory(env?.DB);
    const draftResult = await factory.cleanupExpiredDrafts();

    const sentinel = new SentinelSelfHealingMonitor(env?.DB, env?.SESSIONS_KV, env?.CATALOG_CACHE_KV);
    const healthReport = await sentinel.runHealthCheckAndSelfHeal();

    console.log(`Sentinel Scheduled Job: Cleaned ${draftResult.cleanedCount} drafts. Report: ${healthReport.ownerAlertMessage}`);
  }
};
