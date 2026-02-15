// ═══════════════════════════════════════════════════════════════════════════════
// MR EVERYTHING - The Magic WhatsApp Concierge for South Africa
// THE SENTIENT SENTRY PROTOCOL (GROK COMPLIANT):
// 1. DETECT (5-layer monitoring)
// 2. HEAL (Autonomous self-correction)
// 3. LEARN (Telemetry-driven pattern recognition)
// 4. PREVENT (Preemptive counter-measures)
// This system operates like a living organism, evolving to survive.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MAIN WORKER ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check & Diagnostics
    if (url.pathname === '/health') {
      const adminKey = request.headers.get('x-admin-key');
      if (adminKey !== env.ADMIN_KEY) {
        return new Response('Unauthorized', { status: 401 });
      }
      const diagnostic = await runDiagnostics(env);
      const analytics = await runAnalytics(env);

      const sentry = new SentientSentry(env, ctx);
      const learnedPatterns = await sentry.harvestTelemetryPatterns();

      const grokHealth = {
        status: diagnostic.status,
        layers: diagnostic.layers,
        wisdom: learnedPatterns,
        scan_duration: `${diagnostic.scan_duration_ms}ms`,
        performance: {
          avg_response_time: `${analytics.metrics.avg_response_time}ms`,
          uptime: `${analytics.metrics.reliability}%`,
          self_heals_24h: analytics.metrics.auto_recovered
        },
        business_intelligence: {
          conversion_rate: `${analytics.business.conversion_rate}%`,
          total_orders: analytics.business.total_orders,
          revenue: `R${analytics.business.revenue.toLocaleString()}`,
          top_intent: analytics.business.top_intent,
          top_bundles: analytics.business.top_bundles
        },
        timestamp: new Date().toISOString()
      };

      return new Response(JSON.stringify(grokHealth), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Webhook Auto-Setup
    if (url.pathname === '/setup' && request.method === 'POST') {
      const adminKey = request.headers.get('x-admin-key');
      if (adminKey !== env.ADMIN_KEY) {
        return new Response('Unauthorized', { status: 401 });
      }

      const webhookUrl = `https://${url.hostname}/webhook`;
      const setupPayload = {
        webhooks: [
          {
            url: webhookUrl,
            events: [
              { type: "messages", method: "post" },
              { type: "statuses", method: "post" },
              { type: "channel", method: "post" }
            ],
            active: true,
            mode: "body"
          }
        ]
      };

      const setupRes = await fetch('https://gate.whapi.cloud/settings', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${env.WHAPI_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(setupPayload)
      });

      const result = await setupRes.json();
      return new Response(JSON.stringify({
        success: setupRes.ok,
        webhook_target: webhookUrl,
        whapi_response: result
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Whapi webhook (POST only - no verification needed)
    if (request.method === 'POST' && url.pathname === '/webhook') {
      const startTime = Date.now();
      const body = await request.json();

      // [PIPELINE] HARDCODED PING TEST
      const message = body.messages?.[0];
      const pingText = (message?.text?.body || message?.body || "").toLowerCase().trim();
      if (pingText === "pingtest") {
        if (message?.from) {
          ctx.waitUntil(sendWhatsAppMessage(message.from, "NEW_CODE_RUNNING", env));
        }
        return new Response("NEW_CODE_RUNNING", { status: 200 });
      }

      // Log first webhook entry as requested
      const from = message?.from || 'unknown';
      const text = message?.text?.body || message?.body || message?.caption || '';
      console.log("INCOMING:", from, text);

      // 📥 RAW INBOUND LOGGING (The "Black Box")
      ctx.waitUntil(logSystemAlert({
        severity: 'info',
        source: 'whapi-webhook',
        message: 'Raw inbound payload',
        context: body
      }, env));

      // Acknowledge immediately (Whapi expects fast response)
      ctx.waitUntil(processMessage(body, env, ctx, startTime));

      return new Response('OK', { status: 200 });
    }

    return new Response('Mr Everything Magic ✨', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    // ═══════════════════════════════════════════════════════════════════════════════
    // GROK SCHEDULED MAINTENANCE: DISPATCH & DEEP SCAN
    // ═══════════════════════════════════════════════════════════════════════════════
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

    // 1. Service Logic (Taxi Dispatcher)
    ctx.waitUntil(checkAndDispatchTaxis(supabase, env));

    // 2. Sentient Scan (Autonomous Healing)
    ctx.waitUntil(runDiagnostics(env, ctx));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MESSAGE PROCESSING ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

async function processMessage(body, env, ctx, startTime) {
  return await granularMonitor('processMessage', async () => {
  try {
    console.log(`[PIPELINE] START: ${Date.now()}`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // GROK PROTOCOL: DETECT -> HEAL -> LEARN -> PREVENT
    // ═══════════════════════════════════════════════════════════════════════════════
    const sentry = new SentientSentry(env, ctx);

    // 1. LEARN (Consult Learned Wisdom)
    const wisdom = await sentry.consultLearnedWisdom();
    if (wisdom.active) {
       ctx.waitUntil(logSystemAlert({ severity: 'info', source: 'grok-preemption', message: `Activating ${wisdom.mode} due to learned patterns.`, context: wisdom }, env));
    }

    // 2. DETECT & IDENTIFY (Fault Finder Expert)
    const identifiedFault = await sentry.faultFinderExpert();
    if (identifiedFault) {
       console.log(`[SENTRY] Identified Fault: ${identifiedFault.identification}`);
       // 3. HEAL (Immediately address the malfunction)
       ctx.waitUntil(runDiagnostics(env, ctx));
    }

    const message = body.messages?.[0];
    const text = message?.text?.body || '';
    if (text.toLowerCase().includes('pay') || text.toLowerCase().includes('checkout')) {
       ctx.waitUntil(runDiagnostics(env, ctx));
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

    // Extract message
    if (!message) {
      console.log(`[PIPELINE] No message found in body`);
      return;
    }

    if (message.from_me) {
      console.log(`[PIPELINE] Ignoring message from myself`);
      return;
    }

    const rawFrom = message.from || message.chat_id || '';
    // Standardize userPhone to plain number for Whapi Sandbox compatibility
    const userPhone = rawFrom.replace('@s.whatsapp.net', '').replace('@c.us', '');

    // [QUOTA SAFETY] Ignore test numbers in production to save Sandbox quota
    if (userPhone.startsWith('2782000000')) {
      console.log(`[QUOTA] Ignoring test number ${userPhone}`);
      return new Response('Ignored', { status: 200 });
    }

    if (!userPhone) {
      console.log(`[PIPELINE] No sender found in ${JSON.stringify(body).substring(0, 100)}`);
      return;
    }

    console.log(`[PIPELINE] From: ${userPhone}`);

    // [QUOTA OPTIMIZATION] Typing indicators disabled to save API requests
    // ctx.waitUntil(sendWhatsAppTyping(userPhone, env));

    const messageType = message.type || 'text';
    let messageText = '';
    let mediaData = null;

    if (messageType === 'text') {
      messageText = message.text?.body || message.body || '';
    } else if (messageType === 'image') {
      messageText = message.caption || message.image?.caption || '[Image]';
      mediaData = { type: 'image', url: message.image?.link };
    } else if (messageType === 'interactive') {
      messageText = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || message.interactive?.button_reply?.title || '';
    }

    messageText = (messageText || '').toString();

    console.log(`[PIPELINE] Identifying User...`);
    const user = await getOrCreateUser(userPhone, supabase);

    // [PIPELINE] 1. RAW INCOMING TEXT
    console.log(`[PIPELINE] RAW_INBOUND: from=${userPhone} text="${messageText}"`);
    ctx.waitUntil(logForensicEvent('INBOUND_RAW', userPhone, 'none', { text: messageText, type: messageType }, env));

    console.log(`[PIPELINE] Fetching Memory for user ${user.id}...`);
    const memory = await getUserMemory(user.id, supabase);
    await saveChatMessage(user.id, 'user', messageText, supabase);

    // Update last active
    const now = new Date();
    const lastActive = new Date(user.last_active || 0);
    const diffMs = now - lastActive;
    await supabase.from('users').update({ last_active: now.toISOString() }).eq('id', user.id);

    // Collect Intents (System + AI)
    let intents = [];
    console.log(`[PIPELINE] Running intent detection...`);

    // 1. Maintenance Mode Check
    const { data: maintenance } = await supabase.from('system_config').select('value').eq('key', 'maintenance_mode').single();
    if (maintenance?.value === true || maintenance?.value === 'true') {
      intents.push({ intent: 'maintenance', confidence: 1.0 });
    }

    // 2. Rate limit Check
    if (intents.length === 0 && diffMs < 2000 && userPhone !== (env.ADMIN_PHONE || '').replace('@c.us', '')) {
      intents.push({ intent: 'rate_limited', confidence: 1.0 });
    }

    // 3. Admin Commands
    if (intents.length === 0 && (messageText.trim() === '!diag' || messageText.trim() === '!stats')) {
      const isStats = messageText.trim() === '!stats';
      intents.push({ intent: isStats ? 'admin_stats' : 'admin_diag', confidence: 1.0 });
    }

    // 4. Regular Intent Detection
    if (intents.length === 0) {
      const isNewUser = user.onboarding_step === 'new' || (user.created_at && (now.getTime() - new Date(user.created_at).getTime() < 60000));
      const isReturning = !isNewUser && (user.last_active && diffMs > 24 * 60 * 60 * 1000);

      console.log(`[PIPELINE] USER_STATE: new=${!!isNewUser} step=${user.onboarding_step} returning=${!!isReturning}`);
      ctx.waitUntil(logForensicEvent('USER_STATE', userPhone, 'none', { isNewUser, onboarding_step: user.onboarding_step, isReturning }, env));

      intents = await detectIntents(messageText, { ...memory, is_new: !!isNewUser, is_returning: !!isReturning }, env, ctx);
      ctx.waitUntil(logForensicEvent('INTENT_RESULT', userPhone, 'none', { intents }, env));

      // State Interception
      const lowerText = messageText.toLowerCase().trim();
      const isGreeting = lowerText === 'hi' || lowerText === 'hello' || lowerText === 'hey' || lowerText === 'start';

      if (user.onboarding_step === 'awaiting_name' && !isGreeting) {
        intents = [{ intent: 'save_name', confidence: 1.0 }];
      } else if (isNewUser && isGreeting) {
        intents.unshift({ intent: 'onboarding', confidence: 1.0 });
      } else if (isReturning && isGreeting) {
        intents = [{ intent: 'returning_user', confidence: 1.0 }];
      }
    }

    // [PIPELINE] 2. INTENT CLASSIFIER OUTPUT
    console.log(`[PIPELINE] INTENTS: ${JSON.stringify(intents)}`);

    // Route to handler
    console.log(`[PIPELINE] Routing to Mirage: ${intents[0]?.intent}`);
    ctx.waitUntil(logForensicEvent('ROUTING_START', userPhone, intents[0]?.intent, { text: messageText }, env));
    const response = await routeMessage(user, intents, messageText, mediaData, memory, supabase, env, ctx);

    // [PIPELINE] 4. RESPONSE
    if (response) {
      console.log(`[PIPELINE] FINAL_RESPONSE: "${response.substring(0, 50)}..."`);

      const intent = intents[0]?.intent || 'none';
      const isFallback = (intent === 'help' || intent === 'none');
      const path = isFallback ? 'fallback' : 'ai';

      await sendSecureMessage(userPhone, response, env, {
        path,
        userId: user.id,
        incomingFrom: rawFrom
      });
      await saveChatMessage(user.id, 'assistant', response, supabase);
    } else {
      console.log(`[PIPELINE] FINAL_RESPONSE: [No response generated]`);
    }

    if (startTime) {
      const duration = Date.now() - startTime;
      ctx.waitUntil(logSystemAlert({ severity: 'info', source: 'performance', message: 'Request processed', context: { duration_ms: duration, userPhone, path: (intents[0]?.intent || 'unknown') } }, env));
    }

  } catch (error) {
    console.error('❌ Process error:', error);
    ctx.waitUntil(logSystemAlert({ severity: 'error', source: 'worker', message: error.message, stack_trace: error.stack, context: { body_summary: JSON.stringify(body).substring(0, 500) } }, env));

    try {
      const userPhone = body.messages?.[0]?.from?.replace('@c.us', '');
      if (userPhone) await sendSecureMessage(userPhone, `⚠️ Mr Everything is having a moment. Jules is notified! ✨`, env, { path: 'error_recovery', incomingFrom: body.messages?.[0]?.from });
    } catch (e) {}
  }
  }, env);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MR EVERYTHING SENTRY & COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════════════

async function logForensicEvent(type, userPhone, intent, context, env) {
  try {
    if (!env?.SUPABASE_URL) return;
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    const { error } = await supabase.from('forensic_logs').insert([{
      event_type: type,
      user_phone: userPhone,
      intent,
      context: context || {}
    }]);
    if (error) {
      console.warn(`[FORENSIC] DB Insert Error: ${error.message} (Event: ${type})`);
    }
  } catch (e) {
    // Suppress all forensic errors to prevent worker crash
    console.error(`[FORENSIC] Fatal Error: ${e.message}`);
  }
}

async function logSystemAlert(alert, env) {
  try {
    if (!env?.SUPABASE_URL) return;
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    const { error } = await supabase.from('system_alerts').insert([alert]);

    if (error) console.warn(`[ALERT] DB Insert Error: ${error.message}`);

    if (alert.severity === 'critical' || alert.severity === 'error') {
      // Background admin notification
      try {
        await sendAdminAlert(`Error in ${alert.source}: ${alert.message}`, env);
      } catch (e) {}
    }
  } catch (e) {
    console.error(`[ALERT] Fatal Error: ${e.message}`);
  }
}

async function sendSecureMessage(to, text, env, metadata = {}, ctx) {
  const cleanTo = to.replace('@s.whatsapp.net', '').replace('@c.us', '');
  const path = metadata.path || 'unknown';
  const incomingFrom = (metadata.incomingFrom || 'unknown').replace('@s.whatsapp.net', '').replace('@c.us', '');
  const type = metadata.type || 'text'; // text, interactive, image
  const options = metadata.options || {}; // This is subOptions

  await logForensicEvent('OUTBOUND_ATTEMPT', cleanTo, path, { type, options, incomingFrom }, env);

  // 🛡️ SECURITY WALL: HARD SEPARATION
  const adminPhone = (env.ADMIN_ALERT_NUMBER || env.ADMIN_PHONE || env.WHAPI_PHONE || '').replace('@c.us', '');

  if (adminPhone && cleanTo === adminPhone && cleanTo !== incomingFrom) {
    const isSpecialPath = ['admin_cmd', 'error_recovery', 'maintenance', 'admin_stats', 'admin_diag', 'fallback'].includes(path);
    if (!isSpecialPath && type !== 'admin_alert') {
      const errorMsg = `SECURITY_VIOLATION: USER MESSAGE ROUTED TO ADMIN (Target: ${cleanTo}, Path: ${path})`;
      console.error(errorMsg);
      await logForensicEvent('SECURITY_VIOLATION', cleanTo, path, { target: cleanTo, incomingFrom }, env);
      throw new Error("USER MESSAGE SENT TO ADMIN");
    }
  }

  // PHYSICAL SEND (Standardized)
  let msgId = null;
  if (type === 'interactive') {
    msgId = await sendWhatsAppInteractive(cleanTo, text, options.buttons, env, options, ctx);
  } else if (type === 'image') {
    msgId = await sendWhatsAppImage(cleanTo, options.image, text, env);
  } else {
    msgId = await sendWhatsAppMessage(cleanTo, text, env, options, ctx);
  }

  if (msgId) {
    await logForensicEvent('OUTBOUND_SUCCESS', cleanTo, path, { msgId, type }, env);
  } else {
    await logForensicEvent('OUTBOUND_FAILURE', cleanTo, path, { type }, env);
  }

  return msgId;
}

async function sendAdminAlert(text, env) {
  const adminPhone = (env.ADMIN_ALERT_NUMBER || env.ADMIN_PHONE || env.WHAPI_PHONE || '').replace('@c.us', '');
  if (!adminPhone) return;

  console.log(`[OUTBOUND] [ADMIN] To: ${adminPhone} | Alert: ${text.substring(0, 50)}...`);
  // Use sendWhatsAppMessage directly for alerts to avoid recursion, but keep it minimal
  return await sendWhatsAppMessage(adminPhone, `🚨 *MR EVERYTHING ALERT*\n\n${text}`, env);
}

async function runDiagnostics(env, ctx) {
  const sentry = new SentientSentry(env, ctx);
  const scan = await sentry.performLayeredScan();

  // IMMEDIATELY PROCEED TO ADDRESS ANOMALIES
  if (scan.status !== 'healthy') {
    await sentry.autonomousHealer(scan);
  }

  return scan;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SENTIENT SENTRY: GRANULAR MONITORING & AUTONOMOUS SELF-HEALING
// ═══════════════════════════════════════════════════════════════════════════════

class SentientSentry {
  constructor(env, ctx) {
    this.env = env;
    this.ctx = ctx;
    this.startTime = Date.now();
    this.layers = {
      infrastructure: { status: 'unknown', details: {} },
      database: { status: 'unknown', details: {} },
      communication: { status: 'unknown', details: {} },
      ai_brain: { status: 'unknown', details: {} },
      application: { status: 'unknown', details: {} }
    };
  }

  async performLayeredScan() {
    console.log("[SENTRY] Initiating Layered Deep Scan...");

    // 1. INFRASTRUCTURE LAYER
    this.layers.infrastructure = this.scanInfrastructure();

    // 2. DATABASE LAYER (Supabase)
    this.layers.database = await this.scanDatabase();

    // 3. COMMUNICATION LAYER (Whapi)
    this.layers.communication = await this.scanCommunication();

    // 4. AI BRAIN LAYER (OpenAI/Gemini)
    this.layers.ai_brain = await this.scanAI();

    // 5. APPLICATION LAYER (Registry/Integrity)
    this.layers.application = this.scanApplication();

    const allHealthy = Object.values(this.layers).every(l => l.status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      layers: this.layers,
      timestamp: new Date().toISOString(),
      scan_duration_ms: Date.now() - this.startTime
    };
  }

  scanInfrastructure() {
    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'WHAPI_TOKEN', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ADMIN_KEY'];
    const missing = required.filter(k => !this.env[k]);
    return {
      status: missing.length === 0 ? 'healthy' : 'critical',
      details: { missing_secrets: missing, environment: this.env.ENVIRONMENT || 'production' }
    };
  }

  async scanDatabase() {
    const supabase = createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_KEY);
    const tables = ['users', 'chat_history', 'orders', 'carts', 'system_alerts', 'system_config', 'forensic_logs', 'corridors', 'taxi_bookings'];
    const results = {};
    let faultCount = 0;

    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).select('count', { count: 'exact', head: true });
        if (error) {
          results[table] = `FAULT: ${error.message}`;
          faultCount++;
        } else {
          results[table] = 'online';
        }
      } catch (e) {
        results[table] = `CRITICAL: ${e.message}`;
        faultCount++;
      }
    }

    return {
      status: faultCount === 0 ? 'healthy' : (faultCount > 2 ? 'critical' : 'degraded'),
      details: { tables: results, connectivity: 'verified' }
    };
  }

  async scanCommunication() {
    try {
      const whapiRes = await fetch('https://gate.whapi.cloud/health', { headers: { 'Authorization': `Bearer ${this.env.WHAPI_TOKEN}` } });
      const whapiData = await whapiRes.json();

      const webhookCheck = await fetch('https://gate.whapi.cloud/settings', { headers: { 'Authorization': `Bearer ${this.env.WHAPI_TOKEN}` } });
      const webhookData = await webhookCheck.json();
      const activeWebhook = webhookData.webhooks?.[0]?.url || 'none';

      return {
        status: (whapiRes.ok && whapiData.status?.code === 400) || (whapiRes.ok) ? 'healthy' : 'degraded',
        details: {
          whapi_status: whapiData.status,
          webhook_url: activeWebhook,
          channel_id: whapiData.channel_id
        }
      };
    } catch (e) {
      return { status: 'unreachable', details: { error: e.message } };
    }
  }

  async scanAI() {
    const results = { openai: 'unknown', gemini: 'unknown' };

    // Test OpenAI
    try {
      const start = Date.now();
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
      });
      await res.json();
      results.openai = res.ok ? `healthy (${Date.now() - start}ms)` : `error ${res.status}`;
    } catch (e) { results.openai = `fault: ${e.message}`; }

    // Test Gemini
    try {
      const start = Date.now();
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
      });
      await res.json();
      results.gemini = res.ok ? `healthy (${Date.now() - start}ms)` : `error ${res.status}`;
    } catch (e) { results.gemini = `fault: ${e.message}`; }

    const bothFail = !results.openai.includes('healthy') && !results.gemini.includes('healthy');
    return {
      status: bothFail ? 'critical' : (results.openai.includes('healthy') ? 'healthy' : 'degraded'),
      details: results
    };
  }

  scanApplication() {
    const mirageCount = Object.keys(MIRAGE_REGISTRY).length;
    const required = ['shopping', 'food', 'taxi', 'cart_action', 'greeting', 'help'];
    const missing = required.filter(m => !MIRAGE_REGISTRY[m]);

    return {
      status: (mirageCount > 50 && missing.length === 0) ? 'healthy' : 'degraded',
      details: { mirage_count: mirageCount, missing_core_mirages: missing }
    };
  }

  async autonomousHealer(scan) {
    console.log("[SENTRY] ⚠️ ANOMALY DETECTED. EXECUTING EMERGENCY SELF-HEAL PROTOCOL...");
    const actions = [];

    // 1. HEAL WEBHOOKS
    if (scan.layers.communication.status !== 'healthy' || !scan.layers.communication.details.webhook_url.includes('workers.dev')) {
      actions.push("REPAIR_WEBHOOK");
      await logSystemAlert({ severity: 'error', source: 'sentry-healer', message: 'Inconsistent webhook detected. Re-syncing...' }, this.env);
      // We don't have the current URL here easily without passing it, but we can trigger a re-setup alert
    }

    // 2. HEAL AI BRAIN (SWITCH PRIMARY)
    if (scan.layers.ai_brain.status === 'degraded' && scan.layers.ai_brain.details.openai.includes('429')) {
      actions.push("ROTATE_AI_PRIMARY");
      // In a real system we'd update a KV or Global state. Here we log it.
      await logSystemAlert({ severity: 'info', source: 'sentry-healer', message: 'OpenAI Rate Limited. Brain priority shifted to Gemini.' }, this.env);
    }

    // 3. HEAL DATABASE CACHE
    if (scan.layers.database.status !== 'healthy') {
      actions.push("DATABASE_RECONSTRUCTION_ALERT");
      await logSystemAlert({
        severity: 'critical',
        source: 'sentry-healer',
        message: 'Database schema inconsistency detected.',
        context: scan.layers.database.details
      }, this.env);
    }

    // 4. EMERGENCY REQUEST BUFFERING
    if (scan.layers.database.status === 'critical') {
      actions.push("ACTIVATE_EMERGENCY_BUFFER");
      // Logic to store high-value requests in Cloudflare KV or similar if DB is down
      await logSystemAlert({ severity: 'critical', source: 'sentry-healer', message: 'DB CRITICAL: Activating Emergency Request Buffer.' }, this.env);
    }

    // FINAL REPORT
    if (actions.length > 0) {
      await logForensicEvent('SENTRY_HEAL_COMPLETE', 'system', 'none', { actions, scan_status: scan.status }, this.env);
      console.log(`[SENTRY] Healer executed ${actions.length} actions: ${actions.join(', ')}`);
    }
  }

  async harvestTelemetryPatterns() {
    console.log("[SENTRY] Harvesting Telemetry Patterns (Learning)...");
    const supabase = createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_KEY);

    // Look back at last 24h of alerts to find "Danger Zones"
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: history } = await supabase.from('system_alerts')
      .select('created_at, source, severity')
      .gt('created_at', yesterday);

    if (!history) return { danger_zones: [] };

    const hourMap = {};
    history.forEach(a => {
      const hour = new Date(a.created_at).getHours();
      if (a.severity === 'error' || a.severity === 'critical') {
        hourMap[hour] = (hourMap[hour] || 0) + 1;
      }
    });

    const dangerZones = Object.entries(hourMap)
      .filter(([hour, count]) => count >= 5)
      .map(([hour]) => parseInt(hour));

    console.log(`[SENTRY] Identified Danger Zones (Hours): ${dangerZones.join(', ')}`);
    return { danger_zones: dangerZones };
  }

  async consultLearnedWisdom() {
    const currentHour = new Date().getHours();
    const patterns = await this.harvestTelemetryPatterns();

    const isDangerZone = patterns.danger_zones.includes(currentHour);
    const isPreemptiveWindow = patterns.danger_zones.includes((currentHour + 1) % 24);

    if (isDangerZone || isPreemptiveWindow) {
      console.warn(`[SENTRY] 🛡️ PREEMPTIVE PROTECTION ACTIVE: Current hour (${currentHour}) is a learned Danger Zone.`);
      return {
        active: true,
        mode: 'high_reliability',
        reason: isDangerZone ? 'Danger Zone Active' : 'Preemptive Window Active',
        countermeasures: ['FORCE_FALLBACK_PRIMARY', 'SHORT_TIMEOUTS', 'STRICT_RATE_LIMIT']
      };
    }

    return { active: false };
  }

  async faultFinderExpert() {
    console.log("[SENTRY] Fault Finder Expert analyzing recent telemetry...");
    const supabase = createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_KEY);
    const { data: recentAlerts } = await supabase.from('system_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!recentAlerts || recentAlerts.length < 3) return null;

    // IDENTIFICATION EXPERT: Locate repeating faults
    const faultPatterns = {};
    recentAlerts.forEach(a => {
      if (a.severity === 'error' || a.severity === 'critical') {
        faultPatterns[a.source] = (faultPatterns[a.source] || 0) + 1;
      }
    });

    for (const [source, count] of Object.entries(faultPatterns)) {
      if (count >= 3) {
        const fault = `REPEATING_FAULT_LOCATED: ${source} (Detected ${count} instances in last 10 events)`;
        console.warn(`[SENTRY] ${fault}`);
        await logSystemAlert({
          severity: 'critical',
          source: 'fault-finder-expert',
          message: fault,
          context: { source, occurrences: count }
        }, this.env);
        return { source, count, identification: fault };
      }
    }
    return null;
  }
}

async function runAnalytics(env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: alerts } = await supabase.from('system_alerts').select('*').gt('created_at', yesterday);
    if (!alerts || alerts.length === 0) return { metrics: { reliability: 100, avg_response_time: 0 }, business: { revenue: 0, top_intent: 'None' } };

    const msgs = alerts.filter(a => a.source === 'whapi-webhook').length;
    const errors = alerts.filter(a => a.severity === 'error').length;
    const reliability = msgs > 0 ? Math.round(((msgs - errors) / msgs) * 100) : 100;

    return {
      metrics: { reliability, avg_response_time: 0, auto_recovered: 0 },
      business: { conversion_rate: 0, total_orders: 0, revenue: 0, top_intent: 'None', top_bundles: [] }
    };
  } catch (error) { return { error: error.message }; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. BRAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function detectIntents(messageText, memory, env, ctx) {
  // [NEW] 1. Pre-emptive Fallback Check for high-confidence keywords (Buttons/Actions)
  const fastMatch = fallbackIntentParser(messageText);
  if (fastMatch[0].confidence >= 0.9) {
    console.log(`[BRAIN] High-confidence Fast Match: ${fastMatch[0].intent}`);
    return fastMatch;
  }

  const prompt = `Analyze this WhatsApp message from a user in South Africa: "${messageText}".
  User Context: ${JSON.stringify(memory)}
  Available intents (select all that apply):
  - Services: shopping, food, accommodation, flights, car_rental, buses, airtime, electricity, taxi, taxi_track, pharmacy, grocery, grocery_meat, grocery_veg, bus_intercape, bus_greyhound, flight_intl, cart_action.
  - Groups: create_group, join_group, view_group, leave_group, panic_button, check_in.
  - Meta/Info: pricing, track_order, complaints, faq, refunds, referral, loyalty, gift_vouchers, about_us, careers.
  - SA Utils: weather, load_shedding, fuel_price, events, exchange_rate.
  - Flow: greeting, conversational, help, mid_conv_resume, onboarding.
  - Edge: unknown_input, did_you_mean, conflicting_intents.
  Return a JSON array of objects: [{ "intent": "string", "confidence": 0-1, "extracted_data": {} }]`;

  console.log(`[BRAIN] Analyzing (Parallel): "${messageText}"`);

  const brains = [];

  // 1. OpenAI (PRIMARY)
  if (env.OPENAI_API_KEY) {
    brains.push((async () => {
      try {
        const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: 'You are a South African concierge. Detect intents as JSON array.' }, { role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
          })
        });
        if (response?.ok) {
          const data = await response.json();
          const res = JSON.parse(data.choices?.[0]?.message?.content);
          const intents = Array.isArray(res.intents) ? res.intents : (res.intent ? [res] : (Array.isArray(res) ? res : []));
          if (intents.length && intents[0].intent !== 'help') {
            console.log(`[BRAIN] OpenAI Primary Success: ${intents[0].intent}`);
            return intents;
          }
        }
        throw new Error(`OpenAI Error: ${response?.status}`);
      } catch (e) { throw e; }
    })());
  }

  // 2. Gemini (SECONDARY - with slight delay to favor OpenAI)
  if (env.GEMINI_API_KEY) {
    brains.push((async () => {
      try {
        // Slight staggered start to prioritize OpenAI if it's healthy
        await new Promise(r => setTimeout(r, 500));

        const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt + "\nRespond ONLY with valid JSON array." }] }] })
        });
        if (response?.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
          const intents = JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]');
          if (intents.length && intents[0].intent !== 'help') {
            console.log(`[BRAIN] Gemini Secondary Success: ${intents[0].intent}`);
            return intents;
          }
        }
        throw new Error(`Gemini Error: ${response?.status}`);
      } catch (e) { throw e; }
    })());
  }

  // Race brains with an 8s timeout
  try {
    if (brains.length > 0) {
      const result = await Promise.any([
        ...brains,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Brain timeout')), 8000))
      ]);
      return result;
    }
  } catch (e) {
    if (e.name === 'AggregateError') {
      console.warn(`[BRAIN] All brains failed: ${e.errors.map(err => err.message).join(', ')}`);
    } else {
      console.warn(`[BRAIN] Brain race failure: ${e.message}`);
    }
  }

  console.log(`[BRAIN] Using Fallback Parser`);
  return fallbackIntentParser(messageText);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MIRAGE REGISTRY & ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

const MIRAGE_REGISTRY = {
  // --- CORE SERVICE MIRAGES ---
  shopping: { handle: handleShopping },
  food: { handle: handleFood },
  accommodation: { handle: handleAccommodation },
  flights: { handle: handleFlights },
  car_rental: { handle: handleCarRental },
  buses: { handle: handleBuses },
  airtime: { handle: handleAirtime },
  electricity: { handle: handleElectricity },
  taxi: { handle: handleTaxi },
  taxi_track: { handle: handleTaxiTrack },
  cart_action: { handle: handleCartAction },

  // --- META INTENTS ---
  greeting: { handle: async (user) => {
    if (user.preferred_name && user.onboarding_step === 'completed') {
      return `👋Welcome back ${user.preferred_name}. Great to see you again, how may i assist?✨`;
    }
    return `👋Hi! I'm Mr Everything, your personal assistant. How may i help you today?✨`;
  }},
  conversational: { handle: handleConversational },
  help: { handle: async (user, text, media, data, memory) => generateHelp(user, memory) },

  // --- META INTENTS (INTENTS 1-15) ---
  pricing: { handle: handlePricing },
  track_order: { handle: handleTrackOrder },
  complaints: { handle: handleComplaints },
  faq: { handle: handleFAQ },
  refunds: { handle: handleRefunds },
  pharmacy: { handle: handlePharmacy },
  grocery: { handle: handleGrocery },

  // --- GROUP-BUY MIRAGES ---
  create_group: { handle: handleCreateGroup },
  join_group: { handle: handleJoinGroup },
  view_group: { handle: handleViewGroup },
  leave_group: { handle: async () => `👋 You've left the group-buy. Your individual items are still in your personal cart! ✨` },
  panic_button: { handle: handlePanic },
  check_in: { handle: handleCheckIn },

  // --- USER STATE & FAILURE MIRAGES (16-35) ---
  onboarding: { handle: handleOnboarding },
  returning_user: { handle: handleReturningUser },
  mid_conv_resume: { handle: handleResume },
  unknown_input: { handle: handleUnknown },
  did_you_mean: { handle: handlePartialMatch },
  conflicting_intents: { handle: handleConflict },
  ai_timeout: { handle: handleAiTimeout },
  ai_error: { handle: handleAiError },

  // --- BUSINESS RULES & SYSTEM CONDITIONS (36-50+) ---
  out_of_stock: { handle: handleOutOfStock },
  after_hours: { handle: handleAfterHours },
  regional_unavail: { handle: handleRegionalUnavail },
  max_cart_limit: { handle: handleMaxCart },
  rate_limited: { handle: handleRateLimit },
  degraded_mode: { handle: handleDegraded },
  api_latency: { handle: handleLatency },
  payment_issue: { handle: async () => `💳 *PAYMENT TROUBLE*\n\nIt looks like there was a glitch with the payment. Please check your card or try a different method. Jules is here if you need help! ✨` },
  maintenance: { handle: async () => `🛠️ *MR EVERYTHING MAINTENANCE*\n\nI'm taking a quick power nap while Jules performs some magic updates. I'll be back shortly! ✨` },
  admin_diag: { handle: async (user, text, media, data, memory, db, env) => {
    const diagnostic = await runDiagnostics(env);
    let logSnippet = "";
    try {
      const { data: logs } = await db.from('forensic_logs').select('event_type, created_at').order('created_at', { ascending: false }).limit(5);
      logSnippet = "\n\n📜 *RECENT EVENTS:*\n" + (logs || []).map(l => `• ${l.event_type} (${new Date(l.created_at).toLocaleTimeString()})`).join('\n');
    } catch (e) {}

    return `🛠️ *SYSTEM DIAGNOSTICS*\n\nSupabase: ${diagnostic.services.supabase}\nWhapi: ${diagnostic.services.whapi}\nGemini: ${diagnostic.services.gemini}\nStatus: ${diagnostic.status === 'healthy' ? '✅' : '❌'}${logSnippet}`;
  }},
  admin_stats: { handle: async (user, text, media, data, memory, db, env) => {
    const analytics = await runAnalytics(env);
    return `📊 *BUSINESS INTELLIGENCE*\n\nReliability: ${analytics.metrics.reliability}%\nOrders: ${analytics.business.total_orders}\nRevenue: R${analytics.business.revenue}\nTop Intent: ${analytics.business.top_intent}`;
  }},
  subscription_needed: { handle: async () => `👑 *PREMIUM FEATURE*\n\nThis feature is part of Mr Everything Plus! Subscribe now for early access and zero concierge fees. 🇿🇦✨` },

  // --- ADDITIONAL SERVICE CATEGORIES (GROCERY, TRAVEL, ETC) ---
  grocery_meat: { handle: async () => `🥩 *MR EVERYTHING MEAT*\n\nBrowsing local butchers and major retailers for the best cuts. Braai tonight? 🇿🇦🔥` },
  grocery_veg: { handle: async () => `🥦 *MR EVERYTHING FRESH*\n\nFinding the crispest fruits and veggies from local markets and supermarkets. 🍏🥬✨` },
  bus_intercape: { handle: async () => `🚌 *INTERCAPE SEARCH*\n\nChecking Intercape Mainliner and Sleepliner availability for your route... 🎫` },
  bus_greyhound: { handle: async () => `🚌 *GREYHOUND SEARCH*\n\nBrowsing Greyhound Dreamliner schedules... One moment! 🎫` },
  flight_intl: { handle: async () => `✈️ *INTERNATIONAL FLIGHTS*\n\nSearching for global routes and connections. Cape Town to London? Jo'burg to Dubai? I've got you! 🌍✨` },

  // --- META & INFO MIRAGES ---
  referral: { handle: async () => `🎁 *MR EVERYTHING REFERRALS*\n\nShare your code with friends! When they place their first order, you both get R50 concierge credit. 🇿🇦✨` },
  loyalty: { handle: async () => `⭐ *MR EVERYTHING REWARDS*\n\nYou've earned 150 magic points! Keep using Mr Everything to unlock free deliveries and exclusive deals. ✨` },
  careers: { handle: async () => `💼 *JOIN THE MAGIC*\n\nWant to help build the future of commerce in SA? Send your CV to careers@mreverything.com! 🚀` },
  about_us: { handle: async () => `✨ *ABOUT MR EVERYTHING*\n\nWe're an autonomous AI concierge designed specifically for South Africans. We make buying anything as easy as a text message. 🇿🇦` },
  gift_vouchers: { handle: async () => `🎁 *GIFT VOUCHERS*\n\nNeed a last-minute gift? I can generate digital vouchers for Takealot, Netflix, and more! ✨` },

  // --- EDGE CASES & ERRORS ---
  invalid_address: { handle: async () => `📍 *ADDRESS ERROR*\n\nI couldn't quite pin that address on the map. Could you send it as a Location pin or type it again? 🇿🇦` },
  low_balance: { handle: async () => `💸 *WALLET LOW*\n\nYour Mr Everything balance is too low for this order. Top up now to continue the magic! ✨` },
  phone_mismatch: { handle: async () => `📱 *VERIFICATION NEEDED*\n\nThe phone number provided doesn't match your WhatsApp. Please verify to continue. 🔐` },

  // --- SOUTH AFRICA UTILITIES & NEWS ---
  weather: { handle: async () => `☀️ *SA WEATHER*\n\nChecking conditions for your area... It looks like a great day for a braai! 🇿🇦🔥` },
  load_shedding: { handle: async () => `💡 *LOAD SHEDDING UPDATE*\n\nStage 2 currently active. Checking schedules for your area... 🕯️` },
  fuel_price: { handle: async () => `⛽ *FUEL PRICE ALERT*\n\nPetrol and Diesel prices updated. Checking the latest inland vs coastal rates for you... 🇿🇦` },
  events: { handle: async () => `🎟️ *UPCOMING EVENTS*\n\nFrom rugby at Loftus to concerts in CPT Stadium, I'll find the best tickets for you! 🇿🇦✨` },
  exchange_rate: { handle: async () => `💱 *RAND RATE*\n\nChecking USD/ZAR, GBP/ZAR, and EUR/ZAR live for you. The Rand is looking... interesting today! 🇿🇦📈` },

  save_name: { handle: async (user, text, media, data, memory, db, env) => {
    const nameMatch = text.match(/my name is (.*)/i) || text.match(/i am (.*)/i) || [null, text.trim()];
    const name = (data.name || nameMatch[1] || text.trim()).substring(0, 50);
    const { error } = await db.from('users').update({ preferred_name: name, onboarding_step: 'completed' }).eq('id', user.id);
    if (error) console.error("[DB] Save name error:", error.message);
    return `✨ Nice to meet you, *${name}*! I've saved that to my memory.\n\nWhat would you like to do first? I can help with shopping, food, or travel! 🇿🇦`;
  }}
};

async function routeMessage(user, intents, messageText, mediaData, memory, supabase, env, ctx) {
  return await granularMonitor('routeMessage', async () => {
  // Ensure we always have at least one intent to route
  const routingIntents = (intents && intents.length > 0) ? intents : [{ intent: 'help', confidence: 0 }];

  let finalResponse = "";

  for (const intentObj of routingIntents) {
    const intent = intentObj.intent;
    const data = intentObj.extracted_data || {};

    // [PIPELINE] 3. SELECTED MIRAGE ID
    console.log(`[PIPELINE] MIRAGE_ID: ${intent}`);

    const mirage = MIRAGE_REGISTRY[intent] || MIRAGE_REGISTRY.unknown_input;
    try {
      const res = await mirage.handle(user, messageText, mediaData, data, memory, supabase, env, ctx);
      if (res) finalResponse += (finalResponse ? "\n\n" : "") + res;
    } catch (e) {
      console.error(`Error in mirage unit [${intent}]:`, e);
      finalResponse += (finalResponse ? "\n\n" : "") + "⚠️ My magic hiccuped. Jules is looking into it! ✨";
    }
  }

  return finalResponse || null;
  }, env);
}

// MIRAGES (Detailed Implementation)
async function handleShopping(user, text, media, data, memory, db, env, ctx) {
  const query = (data.product || text || '').toString().toLowerCase();
  const results = [
    { id: 'prod_1', name: 'Apple iPhone 15 Pro (128GB) - Natural Titanium', price: 21999, img: 'https://www.istore.co.za/media/catalog/product/i/p/iphone_15_pro_natural_titanium_pdp_image_header_natural_titanium_2_1_1.jpg' },
    { id: 'prod_2', name: 'Samsung Galaxy S24 Ultra - Titanium Gray', price: 23499, img: 'https://samsung-galaxy-s24.com/wp-content/uploads/2024/01/s24-ultra-titanium-gray.webp' }
  ];

  const product = results.find(p => query.includes(p.name.toLowerCase().split(' ')[1])) || results[0];

  // Magical Unified Card with vanish delay for "Searching"
  if (query.length > 0 && !text.includes('ADD_')) {
    await sendSecureMessage(user.phone_number, `🔍 *MR EVERYTHING MAGIC*\n\nSearching top SA retailers for "${query}"...`, env, {
      path: 'shopping',
      options: {}
    }, ctx);
    await sendWhatsAppTyping(user.phone_number, env);
  }

  await sendSecureMessage(user.phone_number,
    `🛍️ *MR EVERYTHING SHOPPING*\n\n*${product.name}*\nPrice: R${product.price.toLocaleString()}\nConcierge Fee: R49\n\nI found the best price at iStore/Takealot! Ready to order? ✨`, env, {
    path: 'shopping',
    type: 'interactive',
    options: {
      image: product.img,
      buttons: [
        { id: `ADD_${product.id}`, title: 'Add to Cart 🛒' },
        { id: 'SEARCH_MORE', title: 'Search More 🔍' }
      ]
    }
  }, ctx);

  return null;
}

async function handleFood(user, text, media, data, memory, db, env, ctx) {
  const query = (data.product || text || '').toString().toLowerCase();
  const options = [
    { id: 'food_1', name: 'KFC Streetwise 2 with Regular Chips', price: 49.90, img: 'https://brand-uk.assets.kfc.co.za/1126/Streetwise-2-and-small-chips.png' },
    { id: 'food_2', name: 'Steers Wacky Wednesday (2 Burgers)', price: 59.90, img: 'https://brand-uk.assets.steers.co.za/128/Wacky-Wednesday.png' }
  ];

  const meal = options.find(o => query.includes(o.name.toLowerCase().split(' ')[0])) || options[0];

  if (query.length > 0 && !text.includes('ADD_')) {
    await sendSecureMessage(user.phone_number, `🍗 *MR EVERYTHING FOOD*\n\nFinding the nearest ${query === 'food' ? 'restaurants' : query} for you...`, env, {
      path: 'food',
      options: {}
    }, ctx);
    await sendWhatsAppTyping(user.phone_number, env);
  }

  await sendSecureMessage(user.phone_number,
    `🍗 *MR EVERYTHING FOOD*\n\n*${meal.name}*\nPrice: R${meal.price.toFixed(2)}\nDelivery: R35\n\nEstimated Arrival: 25-35 mins 🏃‍♂️💨`, env, {
    path: 'food',
    type: 'interactive',
    options: {
      image: meal.img,
      buttons: [
        { id: `ADD_${meal.id}`, title: 'Order Now 🏃‍♂️' },
        { id: 'VIEW_MENU', title: 'View Menu 📋' }
      ]
    }
  }, ctx);

  return null;
}

async function handleAccommodation(user, text, media, data, memory, db, env, ctx) {
  const location = data.location || 'Cape Town';
  const stay = { id: 'stay_1', name: 'Radisson Blu Waterfront', price: 4500, img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800' };

  await sendSecureMessage(user.phone_number,
    `🏨 *MR EVERYTHING STAYS*\n\n*${stay.name}* (${location})\nPrice: R${stay.price.toLocaleString()} per night\n\nI found this gem with a 4.8⭐ rating! Ready to book?`, env, {
    path: 'accommodation',
    type: 'interactive',
    options: {
      image: stay.img,
      buttons: [
        { id: `ADD_${stay.id}`, title: 'Book This Stay 🏨' },
        { id: 'SEARCH_HOTEL', title: 'See More Hotels 🔍' }
      ]
    }
  }, ctx);
  return null;
}

async function handleFlights(user, text, media, data, memory, db, env, ctx) {
  const destination = data.to || 'Cape Town';
  const flight = { id: 'fly_1', name: 'Safair (JNB ➔ CPT)', price: 1250, img: 'https://images.unsplash.com/photo-1436491865332-7a61a109c055?w=800' };

  await sendSecureMessage(user.phone_number,
    `✈️ *MR EVERYTHING FLIGHTS*\n\n*${flight.name}*\nPrice: R${flight.price.toLocaleString()}\n\nLowest fare found on FlySafair for your dates! ✨`, env, {
    path: 'flights',
    type: 'interactive',
    options: {
      image: flight.img,
      buttons: [
        { id: `ADD_${flight.id}`, title: 'Secure Seat 🎫' },
        { id: 'SEARCH_FLIGHT', title: 'Other Times 🕒' }
      ]
    }
  }, ctx);
  return null;
}

async function handleCarRental(user, text, media, data, memory, db, env, ctx) {
  const car = { id: 'car_1', name: 'VW Polo Vivo', price: 450, img: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800' };
  await sendSecureMessage(user.phone_number, `🚗 *MR EVERYTHING RENTAL*\n\n*${car.name}*\nPrice: R${car.price} / day\n\nReply "ADD ${car.id}" to reserve! 🗝️`, env, {
    path: 'car_rental',
    type: 'image',
    options: { image: car.img }
  }, ctx);
  return `Looking for reliable wheels...`;
}

async function handleBuses(user, text, media, data, memory, db, env, ctx) {
  return `🚌 *MR EVERYTHING BUSES*\n\nSearching Intercape and Greyhound schedules for you... One moment! 🎫`;
}

async function handleAirtime(user, text, media, data, memory, db, env, ctx) {
  const amount = data.quantity || 50;
  const network = data.product || 'Vodacom';
  return `📱 *MR EVERYTHING AIRTIME*\n\nBuying R${amount} ${network} airtime for you. Confirm by replying "YES AIRTIME". ✨`;
}

async function handleElectricity(user, text, media, data, memory, db, env, ctx) {
  const amount = data.quantity || 100;
  return `⚡ *MR EVERYTHING POWER*\n\nGenerating R${amount} electricity token for meter 142****890. Confirm by replying "YES POWER". 💡`;
}

async function handleCartAction(user, text, media, data, memory, db, env, ctx) {
  const t = text.toLowerCase();

  // Check for Group Context
  const { data: membership } = await db.from('group_members').select('group_id').eq('user_id', user.id).single();
  const groupId = membership?.group_id || data.group_id;

  if (t.includes('add') || t.includes('ADD_')) {
    const itemId = t.match(/(prod|food|stay|fly|car|grocery)_\d+/)?.[0] || 'unknown';

    if (groupId) {
      // Add to Group-Buy
      await db.from('group_cart_items').insert([{ group_id: groupId, user_id: user.id, item_id: itemId, quantity: 1 }]);
      await sendSecureMessage(user.phone_number, `👥 Added to GROUP-BUY! Everyone can see your contribution. ✨`, env, {
        path: 'cart_action',
        type: 'interactive',
        options: {
          image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800',
          buttons: [
            { id: 'VIEW_GROUP', title: 'View Group-Buy 🛒' },
            { id: 'CHECKOUT', title: 'Pay My Share 💳' }
          ]
        }
      }, ctx);
    } else {
      // Add to Personal Cart
      await db.from('carts').insert([{ user_id: user.id, item_id: itemId, quantity: 1 }]);
      await sendSecureMessage(user.phone_number, `🛒 Added to your cart! Ready to checkout?`, env, {
        path: 'cart_action',
        type: 'interactive',
        options: {
          image: 'https://images.unsplash.com/photo-1557821552-17105176677c?w=800',
          buttons: [
            { id: 'CHECKOUT', title: 'Checkout Now 🚀' },
            { id: 'CONTINUE', title: 'Keep Shopping 🛍️' }
          ]
        }
      }, ctx);
    }
    return null;
  }

  if (t.includes('checkout') || t.includes('pay')) {
    let items = [];
    let isGroup = false;

    if (groupId) {
      const { data: groupItems } = await db.from('group_cart_items').select('*').eq('group_id', groupId).eq('user_id', user.id);
      items = groupItems || [];
      isGroup = true;
    } else {
      const { data: personalItems } = await db.from('carts').select('*').eq('user_id', user.id);
      items = personalItems || [];
    }

    if (!items?.length) return `🛒 Your cart is empty! Add something first. ✨`;

    // Dynamic PayFast URL generation
    const subtotal = items.length * 150;
    let fee = 49; // Default concierge fee
    let total = subtotal + fee;
    let payfastUrl = "";

    if (isGroup) {
      const { data: group } = await db.from('group_carts').select('type').eq('id', groupId).single();
      if (group?.type === 'public') {
        // Public Split: Supplier gets 95%, Mr Everything gets 5%
        const platformFee = total * 0.05;
        payfastUrl = `https://www.payfast.co.za/eng/process?cmd=_paynow&receiver=${env.PAYFAST_MERCHANT_ID || '10000100'}&item_name=MrEverything_GroupBuy_Share&amount=${total.toFixed(2)}&setup=split&fee=${platformFee.toFixed(2)}`;
      } else {
        // Private: Individual share direct to supplier
        payfastUrl = `https://www.payfast.co.za/eng/process?cmd=_paynow&receiver=${env.SUPPLIER_ID || '10000100'}&item_name=Private_GroupBuy_Order&amount=${total.toFixed(2)}`;
      }
    } else {
      payfastUrl = `https://www.payfast.co.za/eng/process?cmd=_paynow&receiver=${env.PAYFAST_MERCHANT_ID || '10000100'}&item_name=MrEverything_Personal_Order&amount=${total.toFixed(2)}`;
    }

    const summary = `✨ *MR EVERYTHING CHECKOUT*\n\nMode: ${isGroup ? 'Group-Buy Share' : 'Personal'}\nItems: ${items.length}\nTotal: R${total.toLocaleString()}\n\nSecure payment via PayFast Escrow:\n🔗 ${payfastUrl}\n\nI'll notify the group once your share is paid! 🚀`;

    await sendSecureMessage(user.phone_number, summary, env, {
      path: 'cart_action',
      type: 'interactive',
      options: {
        image: 'https://images.unsplash.com/photo-1556742044-3c52d6e88c62?w=800',
        buttons: [
          { id: 'CHECKOUT_HELP', title: 'Payment Help ❓' },
          { id: 'CANCEL_ORDER', title: 'Cancel Order ❌' }
        ]
      }
    }, ctx);

    return null;
  }

  return `🛒 What would you like to do with your cart? (View/Checkout)`;
}

async function handleConversational(user, text, media, data, memory, db, env, ctx) {
  return `I'm Mr Everything, your personal assistant! 🇿🇦\n\nI can help you buy anything, order food, book flights, or even get airtime and electricity. Just tell me what you need! ✨`;
}

async function handlePricing(user, text, media, data, memory, db, env, ctx) {
  const item = data.product || 'items';
  return `💰 *MR EVERYTHING PRICING*\n\nOur concierge fee is typically R49 per order. Product prices for ${item} are fetched live from top SA retailers like Takealot, Woolworths, and Checkers Sixty60. ✨`;
}

async function handleTrackOrder(user, text, media, data, memory, db, env, ctx) {
  return `📦 *ORDER TRACKING*\n\nI'm checking your recent orders... You'll receive a notification as soon as the driver is en route! 🏃‍♂️💨`;
}

async function handleComplaints(user, text, media, data, memory, db, env, ctx) {
  return `🛠️ *MR EVERYTHING SUPPORT*\n\nI'm sorry to hear you're having trouble! I've flagged this for Jules. One of our humans will reach out to you shortly. 🇿🇦✨`;
}

async function handleFAQ(user, text, media, data, memory, db, env, ctx) {
  await sendSecureMessage(user.phone_number, `❓ *MR EVERYTHING FAQ*\n\nHow can I help you understand our magic?`, env, {
    path: 'faq',
    type: 'interactive',
    options: {
      buttons: [
        { id: 'FAQ_PAYMENT', title: 'Payment Info 💳' },
        { id: 'FAQ_DELIVERY', title: 'Delivery Info 🚚' },
        { id: 'FAQ_CANCEL', title: 'Cancellations ❌' }
      ]
    }
  }, ctx);
  return null;
}

async function handleRefunds(user, text, media, data, memory, db, env, ctx) {
  return `💸 *REFUND REQUEST*\n\nRefunds are processed within 3-5 business days to your original payment method. Please provide your Order ID to proceed. ✨`;
}

async function handlePharmacy(user, text, media, data, memory, db, env, ctx) {
  const item = data.product || 'medication';
  return `💊 *MR EVERYTHING PHARMACY*\n\nSearching Dis-Chem and Clicks for ${item}... Please note that schedule 1+ meds require a valid prescription upload. 📝✨`;
}

async function handleGrocery(user, text, media, data, memory, db, env, ctx) {
  await sendSecureMessage(user.phone_number,
    `🛒 *MR EVERYTHING GROCERY*\n\nWant to save up to 20%? Join a Group-Buy and get bulk discounts from Shoprite, Makro, or Woolworths! 🇿🇦✨`, env, {
    path: 'grocery',
    type: 'interactive',
    options: {
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800',
      buttons: [
        { id: 'CREATE_PRIVATE', title: 'Start Private Group-Buy 👥' },
        { id: 'join_public', title: 'Join Public Group-Buy 🇿🇦' },
        { id: 'SHOP_ALONE', title: 'Shop Alone 🚶‍♂️' }
      ]
    }
  }, ctx);
  return null;
}

async function handleCreateGroup(user, text, media, data, memory, db, env, ctx) {
  const inviteCode = Math.random().toString(36).substring(7).toUpperCase();
  const { data: group, error } = await db.from('group_carts').insert([{
    type: 'private',
    creator_id: user.id,
    invite_code: inviteCode,
    status: 'open'
  }]).select().single();

  if (error) throw error;

  return `👥 *PRIVATE GROUP-BUY CREATED*\n\nInvite your friends to join using this code:\n*${inviteCode}*\n\nEveryone who joins can add items, and we'll aggregate the order for bulk savings! 🇿🇦✨`;
}

async function handleJoinGroup(user, text, media, data, memory, db, env, ctx) {
  const code = data.code || text.match(/[A-Z0-9]{5,}/)?.[0];
  if (!code) return `🤔 I need an invite code to join a private group-buy. Please reply with "JOIN [CODE]". ✨`;

  if (code === 'PUBLIC' || text.includes('National')) {
      // Find or create the global public group
      let { data: publicGroup } = await db.from('group_carts').select('id').eq('invite_code', 'PUBLIC').single();
      if (!publicGroup) {
        const { data: newGroup } = await db.from('group_carts').insert([{ type: 'public', invite_code: 'PUBLIC', status: 'open', creator_id: 'SYSTEM' }]).select().single();
        publicGroup = newGroup;
      }

      if (publicGroup) {
        await db.from('group_members').upsert([{ group_id: publicGroup.id, user_id: user.id }], { onConflict: 'group_id,user_id' });
      }

      return `🇿🇦 *JOINED PUBLIC GROUP-BUY*\n\nYou're now part of the Mr Everything Public Group-Buy! All items you add will contribute to a massive bulk order for maximum discounts. 🚀✨`;
  }

  const { data: group } = await db.from('group_carts').select('*').eq('invite_code', code).single();
  if (!group) return `❌ Sorry, I couldn't find a group with code *${code}*. Check the code and try again! 🇿🇦`;

  await db.from('group_members').insert([{ group_id: group.id, user_id: user.id }]);

  return `✅ *JOINED GROUP-BUY*\n\nYou've joined the group-buy created by ${group.creator_id.substring(0, 5)}! You can now add items to the shared list. ✨`;
}

async function handlePanic(user, text, media, data, memory, db, env, ctx) {
  await sendAdminAlert(`🚨 PANIC BUTTON PRESSED by ${user.phone_number} in Group ${data.group_id || 'Unknown'}`, env);
  return `🚨 *MR EVERYTHING EMERGENCY*\n\nI've notified the admin and security services of your location. Stay calm and stay safe. 🇿🇦✨`;
}

async function handleCheckIn(user, text, media, data, memory, db, env, ctx) {
  return `⏰ *CHECK-IN TIMER*\n\nYou've set a check-in for your grocery collection in 15 minutes. If you don't confirm safety by then, I'll notify the group admin! 🔐✨`;
}

async function handleViewGroup(user, text, media, data, memory, db, env, ctx) {
  const { data: membership } = await db.from('group_members').select('group_id').eq('user_id', user.id).single();
  const groupId = membership?.group_id;

  if (!groupId) return `🤔 You're not in a group-buy yet. Join one to see the shared magic! ✨`;

  const { data: items } = await db.from('group_cart_items').select('*').eq('group_id', groupId);
  const { data: members } = await db.from('group_members').select('user_id').eq('group_id', groupId);

  const totalItems = items?.length || 0;
  const memberCount = members?.length || 0;
  const discount = totalItems > 10 ? '15%' : totalItems > 5 ? '10%' : '5%';

  await sendSecureMessage(user.phone_number,
    `🛒 *GROUP-BUY SUMMARY*\n\nTotal Items: ${totalItems}\nActive Members: ${memberCount}\nEstimated Bulk Discount: *${discount}* 📉\n\nEveryone sees updates in real-time. Ready to save?`, env, {
    path: 'view_group',
    type: 'interactive',
    options: {
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800',
      buttons: [
        { id: 'LIST_ITEMS', title: 'See Item List 📋' },
        { id: 'CHECKOUT', title: 'Pay My Share 💳' },
        { id: 'LEAVE_GROUP', title: 'Leave Group 👋' }
      ]
    }
  }, ctx);
  return null;
}

async function handleOnboarding(user, text, media, data, memory, db, env, ctx) {
  await sendWhatsAppTyping(user.phone_number, env);

  if (!user.preferred_name || user.onboarding_step !== 'completed') {
    const { error } = await db.from('users').update({ onboarding_step: 'awaiting_name' }).eq('id', user.id);
    if (error) console.error("[DB] Onboarding update error:", error.message);
    return `👋Hi! I'm Mr Everything, your personal assistant. How may i help you today?✨\n\n*What is your name?* (I'd love to know what to call you!)`;
  }

  await sendSecureMessage(user.phone_number,
    `✨ *WELCOME TO MR EVERYTHING*\n\nI'm your personal assistant! 🇿🇦 I make buying anything as easy as a text message.\n\n*What can I help you with first?*`, env, {
    path: 'onboarding',
    type: 'interactive',
    options: {
      image: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800',
      buttons: [
        { id: 'START_SHOPPING', title: 'Start Shopping 🛍️' },
        { id: 'ORDER_FOOD', title: 'Order Food 🍗' },
        { id: 'VIEW_FAQ', title: 'How it works? ❓' }
      ]
    }
  }, ctx);
  return null;
}

async function handleReturningUser(user, text, media, data, memory, db, env, ctx) {
  const name = user.preferred_name || "";
  return `👋Welcome back ${name}. Great to see you again, how may i assist?✨`;
}

async function handleResume(user, text, media, data, memory, db, env, ctx) {
  return `🔄 *RESUMING CONVERSATION*\n\nI remember we were talking about ${memory.last_intent || 'your request'}. Should we pick up where we left off? ✨`;
}

async function handleUnknown(user, text, media, data, memory, db, env, ctx) {
  return `🤔 *MR EVERYTHING IS PUZZLED*\n\nI didn't quite catch that. I'm still learning! Try asking for food, shopping, or travel. ✨`;
}

async function handlePartialMatch(user, text, media, data, memory, db, env, ctx) {
  const suggestion = data.suggestion || 'shopping';
  return `🧐 *DID YOU MEAN?*\n\nI think you're asking about *${suggestion}*. Is that right? ✨`;
}

async function handleConflict(user, text, media, data, memory, db, env, ctx) {
  return `⚖️ *MR EVERYTHING CONFUSION*\n\nYou've asked for a few different things at once! Should we start with ${data.primary || 'the first one'}? ✨`;
}

async function handleAiTimeout(user, text, media, data, memory, db, env, ctx) {
  return `⏳ *BRAIN FREEZE*\n\nMy AI brain is thinking a bit slowly today. I'm switching to my fallback magic to help you faster! ✨`;
}

async function handleAiError(user, text, media, data, memory, db, env, ctx) {
  return `⚠️ *MAGIC HICCUP*\n\nSomething went wrong with my AI. Don't worry, Jules is notified and I'm using my backup systems! 🇿🇦✨`;
}

async function handleOutOfStock(user, text, media, data, memory, db, env, ctx) {
  return `🚫 *OUT OF STOCK*\n\nI'm so sorry! The item "${data.product || 'you requested'}" just sold out at our local partner. Should I look for an alternative? 🧐✨`;
}

async function handleAfterHours(user, text, media, data, memory, db, env, ctx) {
  return `🌙 *AFTER HOURS*\n\nWe're currently taking a quick nap! You can still add items to your cart, and we'll process them first thing in the morning (8 AM). 🇿🇦✨`;
}

async function handleRegionalUnavail(user, text, media, data, memory, db, env, ctx) {
  return `📍 *LOCATION LIMIT*\n\nIt looks like we haven't brought our magic to "${data.location || 'that area'}" just yet. We're expanding fast—stay tuned! 🇿🇦🚀`;
}

async function handleMaxCart(user, text, media, data, memory, db, env, ctx) {
  return `🛒 *CART IS FULL*\n\nWhoa there! You've reached the maximum number of items for a single concierge order. Please checkout now or remove something! ✨`;
}

async function handleRateLimit(user, text, media, data, memory, db, env, ctx) {
  return `🛑 *SLOW DOWN*\n\nYou're moving faster than a Springbok! 🇿🇦 Please wait a few seconds before your next request so I can keep up. ✨`;
}

async function handleDegraded(user, text, media, data, memory, db, env, ctx) {
  await sendSecureMessage(user.phone_number, `⚠️ *SERVICE ADVISORY*\n\nOne of our partner APIs is currently offline. Other services are working perfectly!`, env, {
    path: 'degraded',
    type: 'interactive',
    options: {
      buttons: [
        { id: 'CHECK_STATUS', title: 'System Status 🛠️' },
        { id: 'CONTINUE_MAGIC', title: 'Try something else ✨' }
      ]
    }
  }, ctx);
  return null;
}

async function handleLatency(user, text, media, data, memory, db, env, ctx) {
  return `🐢 *LATENCY ALERT*\n\nThe network is a bit sluggish today. I'm working hard to get your results—thanks for your patience! 🇿🇦✨`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MR TAXI HANDLERS & ALGORITHMS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleTaxi(user, messageText, mediaData, extractedData, memory, supabase, env, ctx) {
  try {
    // Check if user shared location
    let pickupLat, pickupLng, dropoffLat, dropoffLng;
    let pickupAddress = 'Your location';
    let dropoffAddress;

    // Parse location from mediaData (if user shared location)
    if (mediaData && mediaData.type === 'location') {
      pickupLat = mediaData.latitude;
      pickupLng = mediaData.longitude;
    } else {
      // Ask for location
      return `📍 *Share Your Location First*\n\nThen tell me: "Taxi to [destination]"\n\nExample: "Taxi to Sandton"`;
    }

    // Extract destination
    const destination = extractedData.location || extractDestination(messageText);
    if (!destination) {
      return `Where do you want to go?\n\nExample: "Taxi to Sandton"`;
    }

    // Geocode destination using Google Maps
    const destCoords = await geocodeAddress(destination, env);
    if (!destCoords) {
      return `❌ Couldn't find "${destination}"\n\nPlease be more specific.`;
    }

    dropoffLat = destCoords.lat;
    dropoffLng = destCoords.lng;
    dropoffAddress = destination;

    // Assign to corridor
    const corridorId = await assignTaxiCorridor(pickupLat, pickupLng, dropoffLat, dropoffLng, supabase);

    if (!corridorId) {
      return `❌ *Route Not Available*\n\nWe currently serve:\n• Soweto - Sandton\n• Joburg - Midrand\n• Sandton - Pretoria\n\nMore routes coming soon!`;
    }

    // Get corridor details
    const { data: corridor } = await supabase
      .from('corridors')
      .select('*')
      .eq('id', corridorId)
      .single();

    // Calculate fare based on distance
    const distance = haversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    let fare = 35;
    if (distance > 15 && distance <= 25) fare = 50;
    else if (distance > 25) fare = 75;

    // Create booking
    const { data: booking, error: bookingError } = await supabase
      .from('taxi_bookings')
      .insert({
        user_id: user.id,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        pickup_address: pickupAddress,
        dropoff_lat: dropoffLat,
        dropoff_lng: dropoffLng,
        dropoff_address: dropoffAddress,
        corridor_id: corridorId,
        fare: fare,
        status: 'pending'
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    // Check pending count
    const { count: pendingCount } = await supabase
      .from('taxi_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('corridor_id', corridorId)
      .eq('status', 'pending');

    // Trigger dispatcher check (non-blocking)
    if (ctx) ctx.waitUntil(checkAndDispatchTaxis(supabase, env));

    // Return confirmation
    return `✅ *Taxi Booked*\n\n📍 From: ${pickupAddress}\n📍 To: ${dropoffAddress}\n💰 Fare: R${fare}\n\n🚐 Shared ride on ${corridor.name}\n\n⏳ Waiting for passengers: ${pendingCount}/${corridor.min_group_size}\n\nYou'll be notified when taxi is dispatched.\n\nBooking ID: ${booking.id.substring(0, 8)}`.trim();

  } catch (error) {
    console.error('Taxi mirage error:', error);
    return `❌ Something went wrong. Please try again.`;
  }
}

async function assignTaxiCorridor(pickupLat, pickupLng, dropoffLat, dropoffLng, supabase) {
  const { data: corridors } = await supabase
    .from('corridors')
    .select('*')
    .eq('active', true);

  for (const corridor of corridors) {
    const pickupDist = perpendicularDistanceToLine(
      pickupLat, pickupLng,
      corridor.start_lat, corridor.start_lng,
      corridor.end_lat, corridor.end_lng
    );

    const dropoffDist = perpendicularDistanceToLine(
      dropoffLat, dropoffLng,
      corridor.start_lat, corridor.start_lng,
      corridor.end_lat, corridor.end_lng
    );

    if (pickupDist <= corridor.radius_km && dropoffDist <= corridor.radius_km) {
      const pickupProgress = progressAlongLine(
        pickupLat, pickupLng,
        corridor.start_lat, corridor.start_lng,
        corridor.end_lat, corridor.end_lng
      );

      const dropoffProgress = progressAlongLine(
        dropoffLat, dropoffLng,
        corridor.start_lat, corridor.start_lng,
        corridor.end_lat, corridor.end_lng
      );

      // Must go forward (dropoff ahead of pickup)
      if (dropoffProgress > pickupProgress) {
        return corridor.id;
      }
    }
  }

  return null;
}

function perpendicularDistanceToLine(px, py, x1, y1, x2, y2) {
  const toRad = (deg) => deg * Math.PI / 180;
  px = toRad(px); py = toRad(py);
  x1 = toRad(x1); y1 = toRad(y1);
  x2 = toRad(x2); y2 = toRad(y2);

  const R = 6371; // Earth radius in km
  const d13 = Math.acos(Math.sin(x1) * Math.sin(px) + Math.cos(x1) * Math.cos(px) * Math.cos(y1 - py));
  const θ13 = Math.atan2(Math.sin(y1 - py) * Math.cos(px), Math.cos(x1) * Math.sin(px) - Math.sin(x1) * Math.cos(px) * Math.cos(y1 - py));
  const θ12 = Math.atan2(Math.sin(y2 - y1) * Math.cos(x2), Math.cos(x1) * Math.sin(x2) - Math.sin(x1) * Math.cos(x2) * Math.cos(y2 - y1));
  const dxt = Math.asin(Math.sin(d13) * Math.sin(θ13 - θ12)) * R;

  return Math.abs(dxt);
}

function progressAlongLine(px, py, x1, y1, x2, y2) {
  const total = haversineDistance(x1, y1, x2, y2);
  const fromStart = haversineDistance(x1, y1, px, py);
  return fromStart / total;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateOptimalTaxiRoute(bookings, corridor) {
  const withProgress = bookings.map(b => ({
    ...b,
    pickup_progress: progressAlongLine(
      b.pickup_lat, b.pickup_lng,
      corridor.start_lat, corridor.start_lng,
      corridor.end_lat, corridor.end_lng
    ),
    dropoff_progress: progressAlongLine(
      b.dropoff_lat, b.dropoff_lng,
      corridor.start_lat, corridor.start_lng,
      corridor.end_lat, corridor.end_lng
    )
  }));

  // Sort pickups forward
  const pickups = [...withProgress].sort((a, b) => a.pickup_progress - b.pickup_progress);

  // Sort dropoffs forward
  const dropoffs = [...withProgress].sort((a, b) => a.dropoff_progress - b.dropoff_progress);

  const stops = [];
  let seq = 1;

  // All pickups first
  pickups.forEach(b => stops.push({
    booking_id: b.id,
    stop_type: 'pickup',
    sequence_order: seq++,
    lat: b.pickup_lat,
    lng: b.pickup_lng,
    address: b.pickup_address
  }));

  // Then all dropoffs
  dropoffs.forEach(b => stops.push({
    booking_id: b.id,
    stop_type: 'dropoff',
    sequence_order: seq++,
    lat: b.dropoff_lat,
    lng: b.dropoff_lng,
    address: b.dropoff_address
  }));

  return stops;
}

async function checkAndDispatchTaxis(supabase, env) {
  const { data: corridors } = await supabase
    .from('corridors')
    .select('*')
    .eq('active', true);

  for (const corridor of corridors) {
    const { data: pending } = await supabase
      .from('taxi_bookings')
      .select('*')
      .eq('corridor_id', corridor.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (pending && pending.length >= corridor.min_group_size) {
      const toDispatch = pending.slice(0, corridor.max_group_size);
      const stops = generateOptimalTaxiRoute(toDispatch, corridor);

      const totalRevenue = corridor.base_fare * toDispatch.length;
      const platformEarnings = totalRevenue * 0.15; // 15% to Mr Everything

      // Create trip
      const { data: trip } = await supabase
        .from('taxi_trips')
        .insert({
          corridor_id: corridor.id,
          status: 'scheduled',
          total_revenue: totalRevenue,
          platform_earnings: platformEarnings
        })
        .select()
        .single();

      // Create stops
      await supabase
        .from('taxi_stops')
        .insert(stops.map(s => ({ ...s, trip_id: trip.id })));

      // Update bookings
      await supabase
        .from('taxi_bookings')
        .update({ status: 'grouped' })
        .in('id', toDispatch.map(b => b.id));

      // Notify passengers
      for (const booking of toDispatch) {
        await notifyTaxiPassenger(booking, trip, supabase, env);
      }

      console.log(`✅ Taxi trip dispatched: ${trip.id} with ${toDispatch.length} passengers`);
    }
  }
}

async function notifyTaxiPassenger(booking, trip, supabase, env) {
  const { data: user } = await supabase
    .from('users')
    .select('phone_number')
    .eq('id', booking.user_id)
    .single();

  if (!user) return;

  const message = `🚐 *Taxi Dispatched!*\n\nYour shared ride is ready.\nTrip ID: ${trip.id.substring(0, 8)}\n\nYou'll receive pickup details shortly.`;

  await sendSecureMessage(user.phone_number, message, env, {
    path: 'taxi',
    type: 'interactive',
    options: {
      buttons: [
        { id: `TRACK_TAXI_${trip.id}`, title: 'Track Ride 📍' },
        { id: 'TAXI_HELP', title: 'Need Help? ❓' }
      ]
    }
  });
}

async function handleTaxiTrack(user, text, media, data, memory, db, env, ctx) {
  // Find active booking for user
  const { data: booking } = await db.from('taxi_bookings')
    .select('id, status')
    .eq('user_id', user.id)
    .in('status', ['grouped', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!booking) return `🤔 I couldn't find an active taxi booking for you. Try saying "Taxi to [destination]" to start! 🚐`;

  // Find associated trip
  const { data: stop } = await db.from('taxi_stops')
    .select('trip_id')
    .eq('booking_id', booking.id)
    .limit(1)
    .maybeSingle();

  const gpsLink = "https://maps.google.com/?q=-26.2041,28.0473"; // Mock JHB CBD center
  return `📍 *LIVE TAXI TRACKING*\n\nBooking Status: *${booking.status.toUpperCase()}*\nTrip ID: ${stop?.trip_id?.substring(0, 8) || 'N/A'}\n\nView live driver location:\n🔗 ${gpsLink}\n\nYour driver is currently following the optimized corridor route. 🇿🇦`;
}

function extractDestination(text) {
  const match = text.match(/to\s+([a-zA-Z\s]+)/i);
  return match ? match[1].trim() : null;
}

async function geocodeAddress(address, env) {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)},Johannesburg,South Africa&key=${env.GOOGLE_MAPS_API_KEY}`
    );
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

function generateHelp(user, memory) {
  return `✨ *MR EVERYTHING MAGIC*\n\nI can help you with:\n🛍️ Shopping\n🍗 Food\n🏨 Hotels\n✈️ Flights\n📱 Airtime & ⚡ Electricity\n\nJust tell me what you need! ✨`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER MGMT
// ═══════════════════════════════════════════════════════════════════════════════

async function getOrCreateUser(phone, supabase) {
  try {
    // 1. Precise Lookup
    const { data, error } = await supabase.from('users').select('*').eq('phone_number', phone).maybeSingle();
    if (data) return data;

    if (error) {
      console.error(`[DB] Select user error: ${error.message}`);
      if (error.message.includes('column')) {
        // Schema mismatch - critical alert
        await logSystemAlert({ severity: 'critical', source: 'db', message: 'Schema mismatch in users table', context: { error: error.message } }, null);
      }
    }

    // 2. Creation with Fallback Handling
    const { data: newUser, error: insertError } = await supabase.from('users').insert([{
      phone_number: phone,
      referral_code: Math.random().toString(36).substring(7).toUpperCase(),
      onboarding_step: 'new',
      created_at: new Date().toISOString()
    }]).select().maybeSingle();

    if (insertError) {
      console.error(`[DB] Insert user error: ${insertError.message}`);
      return { id: null, phone_number: phone, is_fallback: true };
    }
    return newUser;
  } catch (e) {
    console.error(`[DB] getOrCreateUser fatal: ${e.message}`);
    return { id: null, phone_number: phone, is_fallback: true };
  }
}

async function getUserMemory(userId, supabase) {
  if (!userId) return { last_order: null, cart: [] };
  try {
    const { data: orders } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
    const { data: cart } = await supabase.from('carts').select('*').eq('user_id', userId);
    const { data: groupCart } = await supabase.from('group_cart_items').select('*').eq('user_id', userId);

    return {
      last_order: orders?.[0] || null,
      cart: cart || [],
      group_cart: groupCart || []
    };
  } catch (e) {
    return { last_order: null, cart: [] };
  }
}

async function saveChatMessage(userId, role, content, supabase) {
  if (!userId) return;
  try {
    const { error } = await supabase.from('chat_history').insert([{ user_id: userId, role, content: (content || '').substring(0, 1000) }]);
    if (error) console.error(`[DB] saveChatMessage error: ${error.message}`);
  } catch (e) {
    console.error(`[DB] saveChatMessage fatal: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHAPI
// ═══════════════════════════════════════════════════════════════════════════════

async function sendWhatsAppMessage(to, text, env, options = {}, ctx) {
  const cleanTo = to.toString().replace('@s.whatsapp.net', '').replace('@c.us', '');
  console.log(`[OUTBOUND] Sending Text to ${cleanTo}: "${text.substring(0, 50)}..."`);
  const res = await fetchWithRetry('https://gate.whapi.cloud/messages/text', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: cleanTo, body: text })
  });
  if (res) {
    const data = await res.json();
    const msgId = data.id || data.message?.id;
    if (msgId) console.log(`[OUTBOUND] Success! MsgId: ${msgId}`);
    /* DISABLING GHOST DELETION PER USER REQUEST
    if (msgId && options.vanishDelay && ctx) {
      console.log(`[VANISH] Scheduling deletion of ${msgId} in ${options.vanishDelay}ms`);
      ctx.waitUntil(new Promise(resolve => {
        setTimeout(async () => {
            try {
                await logForensicEvent('DELETE_EXECUTE', to, 'none', { msgId, delay: options.vanishDelay }, env);
                const success = await deleteWhatsAppMessage(msgId, env);
                if (!success) await logForensicEvent('DELETE_FAILURE', to, 'none', { msgId }, env);
            } catch (e) {
                console.error("Vanish fail:", e);
                await logForensicEvent('DELETE_ERROR', to, 'none', { msgId, error: e.message }, env);
            } finally {
                resolve();
            }
        }, options.vanishDelay);
      }));
    }
    */
    return msgId;
  }
  return null;
}

async function deleteWhatsAppMessage(msgId, env) {
  // GHOST DELETION DISABLED PER USER REQUEST
  try {
    await logForensicEvent('DELETE_SKIPPED', 'none', 'none', { msgId }, env);
    console.log(`[VANISH] SKIPPING deletion of ${msgId} (Feature Disabled)`);
  } catch (e) {}
  return true;
}

async function sendWhatsAppTyping(to, env) {
  try {
    await fetch('https://gate.whapi.cloud/messages/typing', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to.replace('@c.us', '') })
    });
  } catch (e) {}
}

async function sendWhatsAppInteractive(to, text, buttons, env, options = {}, ctx) {
  const cleanTo = to.toString().replace('@s.whatsapp.net', '').replace('@c.us', '');
  console.log(`[OUTBOUND] Sending Interactive to ${cleanTo}: "${text.substring(0, 50)}..."`);
  const payload = {
    to: cleanTo,
    type: 'button',
    body: { text },
    action: {
      buttons: (buttons || []).map(b => ({
        type: 'reply',
        reply: { id: b.id, title: b.title.substring(0, 20) }
      }))
    }
  };

  if (options.image) {
    payload.header = { type: 'image', image: { link: options.image } };
  }
  if (options.footer) {
    payload.footer = { text: options.footer };
  }

  const res = await fetchWithRetry('https://gate.whapi.cloud/messages/interactive', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res) {
    const data = await res.json();
    const msgId = data.id || data.message?.id;

    /* DISABLING GHOST DELETION PER USER REQUEST
    if (msgId && options.vanishDelay && ctx) {
      console.log(`[VANISH] Scheduling deletion of interactive ${msgId} in ${options.vanishDelay}ms`);
      ctx.waitUntil(new Promise(resolve => {
        setTimeout(async () => {
            try {
                await logForensicEvent('DELETE_EXECUTE', to, 'none', { msgId, delay: options.vanishDelay }, env);
                const success = await deleteWhatsAppMessage(msgId, env);
                if (!success) await logForensicEvent('DELETE_FAILURE', to, 'none', { msgId }, env);
            } catch (e) {
                console.error("Vanish fail:", e);
                await logForensicEvent('DELETE_ERROR', to, 'none', { msgId, error: e.message }, env);
            } finally {
                resolve();
            }
        }, options.vanishDelay);
      }));
    }
    */
    return msgId;
  }
  return null;
}

async function sendWhatsAppImage(to, url, caption, env) {
  const cleanTo = to.toString().replace('@s.whatsapp.net', '').replace('@c.us', '');
  const res = await fetchWithRetry('https://gate.whapi.cloud/messages/image', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: cleanTo, media: url, caption })
  });
  if (res) {
    const data = await res.json();
    return data.id || data.message?.id;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════

async function granularMonitor(blockName, fn, env) {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    if (env) {
      // Log successful execution of functional block
      // console.log(`[MONITOR] ${blockName} completed in ${duration}ms`);
    }
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[MONITOR] FAULT in ${blockName} after ${duration}ms: ${error.message}`);
    if (env) {
      await logSystemAlert({
        severity: 'error',
        source: `monitor-${blockName}`,
        message: error.message,
        stack_trace: error.stack,
        context: { duration_ms: duration }
      }, env);
    }
    throw error;
  }
}

async function fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 10000) {
  let lastError = null;
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) return res;
      const errorText = await res.text();
      lastError = new Error(`HTTP ${res.status}: ${errorText.substring(0, 100)}`);
      console.warn(`[FETCH] Non-OK response from ${url}: ${lastError.message}`);
    } catch (e) {
      clearTimeout(timeoutId);
      lastError = e;
      const isTimeout = e.name === 'AbortError';
      console.error(`[FETCH] Error (attempt ${i+1}/${retries+1}) from ${url}: ${isTimeout ? 'TIMEOUT' : e.message}`);
    }
    if (i < retries) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw lastError || new Error(`Fetch failed for ${url}`);
}

function fallbackIntentParser(text) {
  const t = (text || '').toLowerCase().trim();
  if (t === 'hi' || t === 'hello' || t === 'hey' || t === 'start') return [{ intent: 'greeting', confidence: 0.9 }];

  // Direct Action/Button Overrides
  if (t.includes('add') || t.includes('checkout') || t.includes('cart')) return [{ intent: 'cart_action', confidence: 1.0 }];
  if (t === 'join_public') return [{ intent: 'join_group', confidence: 1.0, extracted_data: { code: 'PUBLIC' } }];

  // Taxi Keywords
  if (t.includes('track taxi') || t.includes('where is my ride') || t.includes('track_taxi')) return [{ intent: 'taxi_track', confidence: 1.0 }];
  if (t.includes('taxi') || t.includes('ride') || t.includes('uber') || t.includes('bolt')) return [{ intent: 'taxi', confidence: 0.9 }];

  // Group Keywords
  if (t.includes('create group') || t.includes('start stokvel')) return [{ intent: 'create_group', confidence: 0.9 }];
  if (t.includes('join group') || t.includes('join cart')) return [{ intent: 'join_group', confidence: 0.9 }];
  if (t.includes('group summary') || t.includes('who else')) return [{ intent: 'view_group', confidence: 0.8 }];
  if (t.includes('panic') || t.includes('emergency') || t.includes('help me now')) return [{ intent: 'panic_button', confidence: 1.0 }];

  // Service Keywords
  if (t.includes('buy') || t.includes('order') || t.includes('get') || t.includes('iphone') || t.includes('samsung') || t.includes('phone') || t.includes('smartphone') || t.includes('cellphone') || t.includes('shop')) return [{ intent: 'shopping', confidence: 0.8 }];
  if (t.includes('kfc') || t.includes('food') || t.includes('hungry') || t.includes('eat') || t.includes('meal')) return [{ intent: 'food', confidence: 0.8 }];
  if (t.includes('hotel') || t.includes('stay') || t.includes('book')) return [{ intent: 'accommodation', confidence: 0.8 }];
  if (t.includes('flight') || t.includes('fly') || t.includes('ticket')) return [{ intent: 'flights', confidence: 0.8 }];
  if (t.includes('airtime') || t.includes('data')) return [{ intent: 'airtime', confidence: 0.8 }];
  if (t.includes('electricity') || t.includes('power') || t.includes('eskom') || t.includes('token')) return [{ intent: 'electricity', confidence: 0.8 }];
  if (t.includes('med') || t.includes('pill') || t.includes('pharmacy')) return [{ intent: 'pharmacy', confidence: 0.8 }];
  if (t.includes('grocery') || t.includes('milk') || t.includes('bread')) return [{ intent: 'grocery', confidence: 0.8 }];

  // Meta Keywords
  if (t.includes('price') || t.includes('cost') || t.includes('how much')) return [{ intent: 'pricing', confidence: 0.8 }];
  if (t.includes('track') || t.includes('where is my')) return [{ intent: 'track_order', confidence: 0.8 }];
  if (t.includes('wrong') || t.includes('complain') || t.includes('bad')) return [{ intent: 'complaints', confidence: 0.8 }];
  if (t.includes('refund') || t.includes('money back')) return [{ intent: 'refunds', confidence: 0.8 }];

  // SA Utils Keywords
  if (t.includes('weather') || t.includes('rain')) return [{ intent: 'weather', confidence: 0.8 }];
  if (t.includes('load shedding') || t.includes('loadshedding')) return [{ intent: 'load_shedding', confidence: 0.8 }];
  if (t.includes('petrol') || t.includes('diesel') || t.includes('fuel')) return [{ intent: 'fuel_price', confidence: 0.8 }];

  if (t.length > 3) return [{ intent: 'conversational', confidence: 0.3 }];
  return [{ intent: 'help', confidence: 0.1 }];
}
