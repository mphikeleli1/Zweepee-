// ═══════════════════════════════════════════════════════════════════════════════
// ZWEEPEE - The Magic WhatsApp Concierge for South Africa
// RELENTLESS AUTONOMOUS SELF-HEALING RULE:
// This system is designed to autonomously monitor, log, and recover from
// all failures without human intervention. Reliability is non-negotiable.
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

      const grokHealth = {
        status: diagnostic.status,
        services: diagnostic.services,
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

    return new Response('Zweepee Magic ✨', { status: 200 });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MESSAGE PROCESSING ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

async function processMessage(body, env, ctx, startTime) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

    // Extract message
    const message = body.messages?.[0];
    if (!message) return;

    const rawFrom = message.from || '';
    const userPhone = rawFrom.replace('@c.us', '');
    if (!userPhone) return;

    // Maintenance Mode Check
    const { data: maintenance } = await supabase.from('system_config').select('value').eq('key', 'maintenance_mode').single();
    if (maintenance?.value === true || maintenance?.value === 'true') {
      await sendUserMessage(userPhone, `🛠️ *ZWEEPEE MAINTENANCE*\n\nI'm taking a quick power nap while Jules performs some magic updates. I'll be back shortly! ✨`, env, { path: 'maintenance', incomingFrom: rawFrom });
      return;
    }

    const messageType = message.type;
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

    const user = await getOrCreateUser(userPhone, supabase);
    const memory = await getUserMemory(user.id, supabase);
    await saveChatMessage(user.id, 'user', messageText, supabase);

    // Admin Commands
    if (messageText.trim() === '!diag') {
      const diagnostic = await runDiagnostics(env);
      await sendUserMessage(userPhone, `🛠️ *SYSTEM DIAGNOSTICS*\n\nSupabase: ${diagnostic.services.supabase}\nWhapi: ${diagnostic.services.whapi}\nGemini: ${diagnostic.services.gemini}\nStatus: ${diagnostic.status === 'healthy' ? '✅' : '❌'}`, env, { path: 'admin_cmd', userId: user.id, incomingFrom: rawFrom });
      return;
    }

    // Detect intent(s)
    const intents = await detectIntents(messageText, memory, env, ctx);

    // Route to handler
    const response = await routeMessage(user, intents, messageText, mediaData, memory, supabase, env, ctx);

    // Send response
    if (response) {
      const path = (intents[0]?.intent === 'help' || !intents.length) ? 'fallback' : 'ai';
      await sendUserMessage(userPhone, response, env, {
        path,
        userId: user.id,
        incomingFrom: rawFrom
      });
      await saveChatMessage(user.id, 'assistant', response, supabase);
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
      if (userPhone) await sendUserMessage(userPhone, `⚠️ Zweepee is having a moment. Jules is notified! ✨`, env, { path: 'error_recovery', incomingFrom: body.messages?.[0]?.from });
    } catch (e) {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ZWEEPEE SENTRY & COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════════════

async function logSystemAlert(alert, env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    await supabase.from('system_alerts').insert([alert]);

    if (alert.severity === 'critical' || alert.severity === 'error') {
      await sendAdminAlert(`Error in ${alert.source}: ${alert.message}`, env);
    }
  } catch (e) {
    console.error('Failed to log alert:', e);
  }
}

async function sendUserMessage(to, text, env, metadata = {}) {
  const cleanTo = to.replace('@c.us', '');
  const path = metadata.path || 'unknown';
  const userId = metadata.userId || 'unknown';
  const incomingFrom = (metadata.incomingFrom || 'unknown').replace('@c.us', '');

  console.log(`[OUTBOUND] [USER] To: ${cleanTo} | From: ${incomingFrom} | UserID: ${userId} | Path: ${path} | Length: ${text.length}`);

  // Hard prevent admin leakage for user messages
  const adminPhone = (env.ADMIN_PHONE || env.WHAPI_PHONE || '').replace('@c.us', '');
  if (adminPhone && cleanTo === adminPhone && cleanTo !== incomingFrom) {
    if (path !== 'admin_cmd' && path !== 'error_recovery' && path !== 'maintenance') {
      console.warn(`⚠️ Potential leakage blocked: Attempted to send user response to admin phone (Target: ${cleanTo}, Source: ${incomingFrom}, Path: ${path})`);
      return null;
    }
  }

  return await sendWhatsAppMessage(cleanTo, text, env);
}

async function sendAdminAlert(text, env) {
  const adminPhone = (env.ADMIN_PHONE || env.WHAPI_PHONE || '').replace('@c.us', '');
  if (!adminPhone) return;

  console.log(`[OUTBOUND] [ADMIN] To: ${adminPhone} | Alert: ${text.substring(0, 50)}...`);
  return await sendWhatsAppMessage(adminPhone, `🚨 *ZWEEPEE ALERT*\n\n${text}`, env);
}

async function runDiagnostics(env) {
  const results = { timestamp: new Date().toISOString(), status: 'checking', services: {} };
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    results.services.supabase = error ? `Error: ${error.message}` : 'Healthy';
  } catch (e) { results.services.supabase = `Fatal: ${e.message}`; }

  try {
    const whapiRes = await fetch('https://gate.whapi.cloud/health', { headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}` } });
    await whapiRes.text(); // Consume body
    results.services.whapi = whapiRes.ok ? 'Healthy' : 'Unreachable';
  } catch (e) { results.services.whapi = `Fatal: ${e.message}`; }

  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
    });
    await geminiRes.text(); // Consume body
    results.services.gemini = geminiRes.ok ? 'Healthy' : 'Quota Exceeded';
  } catch (e) { results.services.gemini = `Fatal: ${e.message}`; }

  const allHealthy = Object.values(results.services).every(v => v.includes('Healthy'));
  results.status = allHealthy ? 'healthy' : 'unhealthy';
  return results;
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
  const prompt = `Analyze this WhatsApp message from a user in South Africa: "${messageText}".
  Available intents: shopping, food, accommodation, flights, car_rental, buses, airtime, electricity, cart_action, greeting, conversational, help.
  Return a JSON array of objects: [{ "intent": "string", "confidence": 0-1, "extracted_data": {} }]`;

  if (env.OPENAI_API_KEY) {
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
      if (response.ok) {
        const data = await response.json();
        const res = JSON.parse(data.choices?.[0]?.message?.content);
        const intents = Array.isArray(res.intents) ? res.intents : (res.intent ? [res] : []);
        if (intents.length) return intents;
      }
    } catch (e) {
      if (ctx) ctx.waitUntil(logSystemAlert({ severity: 'info', source: 'openai', message: `OpenAI fail: ${e.message.substring(0, 50)}` }, env));
    }
  }

  // Gemini Fallback
  if (env.GEMINI_API_KEY) {
    try {
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt + "\nRespond ONLY with valid JSON array." }] }] })
      });
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const intents = JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]');
      if (intents.length) return intents;
    } catch (error) {
      if (ctx) ctx.waitUntil(logSystemAlert({ severity: 'info', source: 'gemini', message: `Gemini fail: ${error.message.substring(0, 50)}` }, env));
    }
  }

  return fallbackIntentParser(messageText);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

async function routeMessage(user, intents, messageText, mediaData, memory, supabase, env, ctx) {
  const intentObj = intents[0] || { intent: 'help' };
  const intent = intentObj.intent;
  const data = intentObj.extracted_data || {};

  if (intent === 'shopping') return await handleShopping(user, messageText, mediaData, data, memory, supabase, env);
  if (intent === 'food') return await handleFood(user, messageText, data, memory, supabase, env);
  if (intent === 'accommodation') return await handleAccommodation(user, messageText, data, memory, supabase, env);
  if (intent === 'flights') return await handleFlights(user, messageText, data, memory, supabase, env);
  if (intent === 'car_rental') return await handleCarRental(user, messageText, data, memory, supabase, env);
  if (intent === 'buses') return await handleBuses(user, messageText, data, memory, supabase, env);
  if (intent === 'airtime') return await handleAirtime(user, messageText, data, memory, supabase, env);
  if (intent === 'electricity') return await handleElectricity(user, messageText, data, memory, supabase, env);
  if (intent === 'cart_action') return await handleCartAction(user, messageText, data, memory, supabase, env, ctx);
  if (intent === 'conversational') return await handleConversational(user, messageText, data, memory, supabase, env);
  if (intent === 'greeting') return `👋 Hi! I'm Zweepee, your South African concierge. How can I help you today? ✨`;

  return generateHelp(user, memory);
}

// MIRAGES (Simplified for stability)
async function handleShopping(user, text, media, data, memory, db, env) { return `🛍️ Searching for ${data.product || text}...`; }
async function handleFood(user, text, data, memory, db, env) { return `🍗 Finding ${data.product || 'food'} near you...`; }
async function handleAccommodation(user, text, data, memory, db, env) { return `🏨 Looking for stays in ${data.location || 'Cape Town'}...`; }
async function handleFlights(user, text, data, memory, db, env) { return `✈️ Searching for flights to ${data.to || 'CPT'}...`; }
async function handleCarRental(user, text, data, memory, db, env) { return `🚗 Renting a car in ${data.location || 'JNB'}...`; }
async function handleBuses(user, text, data, memory, db, env) { return `🚌 Intercity buses to ${data.to || 'CPT'}...`; }
async function handleAirtime(user, text, data, memory, db, env) { return `📱 R${data.quantity || 50} airtime for ${data.product || 'Vodacom'}?`; }
async function handleElectricity(user, text, data, memory, db, env) { return `⚡ Prepaid electricity for R${data.quantity || 100}?`; }
async function handleCartAction(user, text, data, memory, db, env, ctx) { return `🛒 Your cart is currently empty!`; }
async function handleConversational(user, text, data, memory, db, env) {
  // If we get here, it means we want a conversational response but don't have a specific intent.
  // We should try to be helpful.
  return `I'm here to help with shopping, food, travel, and more in SA! What's on your mind? ✨`;
}

function generateHelp(user, memory) {
  return `✨ *ZWEEPEE MAGIC*\n\nI can help you with:\n🛍️ Shopping\n🍗 Food\n🏨 Hotels\n✈️ Flights\n📱 Airtime & ⚡ Electricity\n\nJust tell me what you need! ✨`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER MGMT
// ═══════════════════════════════════════════════════════════════════════════════

async function getOrCreateUser(phone, supabase) {
  const { data } = await supabase.from('users').select('*').eq('phone_number', phone).single();
  if (data) return data;
  const { data: newUser } = await supabase.from('users').insert([{ phone_number: phone, referral_code: Math.random().toString(36).substring(7).toUpperCase() }]).select().single();
  return newUser || { id: phone, phone_number: phone };
}

async function getUserMemory(userId, supabase) {
  const { data } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
  return { last_order: data?.[0] || null };
}

async function saveChatMessage(userId, role, content, supabase) {
  try { await supabase.from('chat_history').insert([{ user_id: userId, role, content: content.substring(0, 1000) }]); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHAPI
// ═══════════════════════════════════════════════════════════════════════════════

async function sendWhatsAppMessage(to, text, env) {
  const res = await fetchWithRetry('https://gate.whapi.cloud/messages/text', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: to.replace('@c.us', ''), body: text })
  });
  if (res) await res.text();
}

async function sendWhatsAppImage(to, url, caption, env) {
  const res = await fetchWithRetry('https://gate.whapi.cloud/messages/image', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: to.replace('@c.us', ''), media: url, caption })
  });
  if (res) await res.text();
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      await res.text();
    } catch (e) { if (i === retries) throw e; }
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
  }
}

function fallbackIntentParser(text) {
  const t = (text || '').toLowerCase().trim();
  if (t === 'hi' || t === 'hello' || t === 'hey' || t === 'start') return [{ intent: 'greeting', confidence: 0.9 }];
  if (t.includes('buy') || t.includes('find') || t.includes('price')) return [{ intent: 'shopping', confidence: 0.8 }];
  if (t.includes('kfc') || t.includes('eat') || t.includes('food')) return [{ intent: 'food', confidence: 0.8 }];
  if (t.includes('hotel') || t.includes('stay') || t.includes('sleep')) return [{ intent: 'accommodation', confidence: 0.8 }];
  if (t.includes('flight') || t.includes('plane') || t.includes('fly')) return [{ intent: 'flights', confidence: 0.8 }];
  if (t.includes('airtime') || t.includes('data') || t.includes('vodacom') || t.includes('mtn')) return [{ intent: 'airtime', confidence: 0.8 }];
  if (t.includes('electricity') || t.includes('power') || t.includes('eskom')) return [{ intent: 'electricity', confidence: 0.8 }];
  if (t.length > 20) return [{ intent: 'conversational', confidence: 0.6 }];
  return [{ intent: 'help', confidence: 0.5 }];
}
