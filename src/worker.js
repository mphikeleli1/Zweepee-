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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Route: GET / (Health Check)
    if (path === '/' || path === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'myAI v25 Network Node' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Route: WhatsApp Webhook GET Verification
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

    // Route: WhatsApp Webhook POST Message Processing
    if (path === '/api/v25/webhook/whatsapp' && method === 'POST') {
      try {
        const body = await request.json();
        const whatsappTransport = new WhatsAppTransportAdapter();
        const uiBuilder = new WhatsAppUIBuilder();
        const commerce = new CommerceAggregator();
        const transport = new TransportAggregator();

        const messageText = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || 'hello';
        const sender = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || '27820000000';

        // 1. Personal Agent Memory & Greeting
        const pa = new PersonalAgent({ phoneNumber: sender, name: 'User' });
        const greeting = pa.getGreeting();

        // 2. Intent Classification
        const intentMode = classifyIntent(messageText);

        // 3. Catalog & Transport Calculation
        const items = await commerce.searchCatalog(messageText);
        const transportQuotes = await transport.getQuotes({ distanceKm: 5, items });

        // 4. Configurable Pricing Calculation
        const pricingConfig = await getPricingConfig(env?.DB);
        const pricing = calculatePricing({
          intentMode,
          goodsSubtotalCents: items[0]?.priceCents || 5000,
          rawTransportQuoteCents: transportQuotes.cheapestQuote.rawQuoteCents,
          config: pricingConfig
        });

        // Render WhatsApp UI Screen 5 & 6
        const screen = uiBuilder.renderConfirmScreen({
          transactionId: `tx_${Date.now()}`,
          totalCustomerPaysCents: pricing.totalCustomerPaysCents,
          isP2P: intentMode.startsWith('A2A')
        });

        return new Response(JSON.stringify({ success: true, greeting, intentMode, pricing, screen }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    // Route: Paystack Webhook
    if (path === '/api/v25/webhook/paystack' && method === 'POST') {
      const paystack = new PaystackPaymentGateway();
      const rawBody = await request.text();
      const sig = request.headers.get('x-paystack-signature');

      if (!paystack.verifyWebhookSignature(rawBody, sig)) {
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

    // Route: PayFast Webhook
    if (path === '/api/v25/webhook/payfast' && method === 'POST') {
      return new Response(JSON.stringify({ status: 'success' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Route: PicUp Webhook
    if (path === '/api/v25/webhook/picup' && method === 'POST') {
      return new Response(JSON.stringify({ status: 'success' }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Not Found', { status: 404 });
  },

  // Cron Trigger for 48h Draft Cleanup
  async scheduled(event, env, ctx) {
    const factory = new AgentFactory(env?.DB);
    const result = await factory.cleanupExpiredDrafts();
    console.log(`Cron cleanup complete: Removed ${result.cleanedCount} expired agent drafts.`);
  }
};
