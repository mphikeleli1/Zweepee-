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

        const messageText = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || '';
        const buttonPayload = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive?.button_reply?.id || null;
        const sender = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || '27820000000';

        const screenResponse = await sessionEngine.handleIncomingMessage(sender, messageText, buttonPayload);

        return new Response(JSON.stringify({ success: true, screenResponse }), {
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

      const idempotency = new IdempotencyManager(env?.SESSIONS_KV);
      const lock = await idempotency.checkAndLock(`paystack_${sig || Date.now()}`);
      if (lock.isDuplicate) {
        return new Response('Duplicate event ignored', { status: 200 });
      }

      await idempotency.complete(`paystack_${sig || Date.now()}`, { processed: true });
      return new Response(JSON.stringify({ status: 'success' }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (path === '/api/v25/webhook/payfast' && method === 'POST') {
      return new Response(JSON.stringify({ status: 'success' }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (path === '/api/v25/webhook/picup' && method === 'POST') {
      return new Response(JSON.stringify({ status: 'success' }), { headers: { 'Content-Type': 'application/json' } });
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
