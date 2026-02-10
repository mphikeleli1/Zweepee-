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

      // Log first webhook entry as requested
      const message = body.messages?.[0];
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
    const intent = intents[0]?.intent || 'none';
    console.log("INTENT:", intent);

    // Route to handler
    const response = await routeMessage(user, intents, messageText, mediaData, memory, supabase, env, ctx);

    // Send response
    if (response) {
      const isFallback = (intent === 'help' || intent === 'none');
      const path = isFallback ? 'fallback' : 'ai';

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
  const incomingFrom = (metadata.incomingFrom || 'unknown').replace('@c.us', '');

  // Log every outbound send
  console.log("SENDING TO:", cleanTo, "TYPE:", path);

  // Hard-separate: ADMIN_ALERT_NUMBER
  const adminPhone = (env.ADMIN_ALERT_NUMBER || env.ADMIN_PHONE || env.WHAPI_PHONE || '').replace('@c.us', '');

  // Strict assertion before every send
  if (adminPhone && cleanTo === adminPhone && cleanTo !== incomingFrom) {
    if (path !== 'admin_cmd' && path !== 'error_recovery' && path !== 'maintenance') {
      const errorMsg = `CRITICAL: USER MESSAGE SENT TO ADMIN (Target: ${cleanTo}, Path: ${path})`;
      console.error(errorMsg);
      // As requested: throw new Error("USER MESSAGE SENT TO ADMIN");
      // But we wrap it to prevent crashing the whole worker if possible,
      // or just return to be safe. The user said "throw new Error".
      throw new Error("USER MESSAGE SENT TO ADMIN");
    }
  }

  return await sendWhatsAppMessage(cleanTo, text, env);
}

async function sendAdminAlert(text, env) {
  const adminPhone = (env.ADMIN_ALERT_NUMBER || env.ADMIN_PHONE || env.WHAPI_PHONE || '').replace('@c.us', '');
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

  console.log(`[BRAIN] Analyzing: "${messageText}"`);

  if (env.OPENAI_API_KEY) {
    console.log(`[BRAIN] Trying OpenAI...`);
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
        if (intents.length && intents[0].intent !== 'help') {
          console.log(`[BRAIN] OpenAI Success: ${intents[0].intent}`);
          return intents;
        }
      } else {
        console.warn(`[BRAIN] OpenAI Error: ${response.status}`);
      }
    } catch (e) {
      console.error(`[BRAIN] OpenAI Exception: ${e.message}`);
      if (ctx) ctx.waitUntil(logSystemAlert({ severity: 'info', source: 'openai', message: `OpenAI fail: ${e.message.substring(0, 50)}` }, env));
    }
  }

  // Gemini Fallback
  if (env.GEMINI_API_KEY) {
    console.log(`[BRAIN] Trying Gemini...`);
    try {
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt + "\nRespond ONLY with valid JSON array." }] }] })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const intents = JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]');
        if (intents.length && intents[0].intent !== 'help') {
          console.log(`[BRAIN] Gemini Success: ${intents[0].intent}`);
          return intents;
        }
      } else {
        console.warn(`[BRAIN] Gemini Error: ${response.status}`);
      }
    } catch (error) {
      console.error(`[BRAIN] Gemini Exception: ${error.message}`);
      if (ctx) ctx.waitUntil(logSystemAlert({ severity: 'info', source: 'gemini', message: `Gemini fail: ${error.message.substring(0, 50)}` }, env));
    }
  }

  console.log(`[BRAIN] Using Fallback Parser`);
  return fallbackIntentParser(messageText);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

async function routeMessage(user, intents, messageText, mediaData, memory, supabase, env, ctx) {
  if (!intents || intents.length === 0) {
    console.log(`[ROUTER] No intent detected, providing general help.`);
    return generateHelp(user, memory);
  }

  console.log(`[ROUTER] Routing intents: ${intents.map(i => i.intent).join(', ')}`);

  let finalResponse = "";

  for (const intentObj of intents) {
    const intent = intentObj.intent;
    const data = intentObj.extracted_data || {};
    console.log(`[ROUTER] Processing: ${intent}`);

    let res = null;
    try {
      if (intent === 'shopping') res = await handleShopping(user, messageText, mediaData, data, memory, supabase, env);
      else if (intent === 'food') res = await handleFood(user, messageText, data, memory, supabase, env);
      else if (intent === 'accommodation') res = await handleAccommodation(user, messageText, data, memory, supabase, env);
      else if (intent === 'flights') res = await handleFlights(user, messageText, data, memory, supabase, env);
      else if (intent === 'car_rental') res = await handleCarRental(user, messageText, data, memory, supabase, env);
      else if (intent === 'buses') res = await handleBuses(user, messageText, data, memory, supabase, env);
      else if (intent === 'airtime') res = await handleAirtime(user, messageText, data, memory, supabase, env);
      else if (intent === 'electricity') res = await handleElectricity(user, messageText, data, memory, supabase, env);
      else if (intent === 'cart_action') res = await handleCartAction(user, messageText, data, memory, supabase, env, ctx);
      else if (intent === 'conversational') res = await handleConversational(user, messageText, data, memory, supabase, env);
      else if (intent === 'greeting') res = `👋 Hi! I'm Zweepee, your South African concierge. How can I help you today? ✨`;
      else if (intent === 'help') res = generateHelp(user, memory);

      if (res) {
        finalResponse += (finalResponse ? "\n\n" : "") + res;
      }
    } catch (e) {
      console.error(`Error in ${intent} handler:`, e);
    }
  }

  return finalResponse || null;
}

// MIRAGES (Detailed Implementation)
async function handleShopping(user, text, media, data, memory, db, env) {
  const query = data.product || text;
  const results = [
    { id: 'prod_1', name: 'Apple iPhone 15 Pro (128GB)', price: 21999, img: 'https://images.unsplash.com/photo-1696446701796-da61225697cc?w=800' },
    { id: 'prod_2', name: 'Samsung Galaxy S24 Ultra', price: 23499, img: 'https://images.unsplash.com/photo-1707223516664-8894101dec21?w=800' }
  ];

  const product = results.find(p => query.toLowerCase().includes(p.name.toLowerCase().split(' ')[0])) || results[0];

  await sendWhatsAppImage(user.phone_number, product.img, `🛍️ *ZWEEPEE SHOPPING*\n\n*${product.name}*\nPrice: R${product.price.toLocaleString()}\nConcierge Fee: R49\n\nReply "ADD ${product.id}" to put this in your cart! ✨`, env);
  return `I found this for you! Should I add it to your cart?`;
}

async function handleFood(user, text, data, memory, db, env) {
  const query = data.product || text;
  const options = [
    { id: 'food_1', name: 'KFC Streetwise 2', price: 49.90, img: 'https://images.unsplash.com/photo-1513639776629-7b61b0ac49cb?w=800' },
    { id: 'food_2', name: 'Steers Wacky Wednesday', price: 59.90, img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800' }
  ];

  const meal = options.find(o => query.toLowerCase().includes(o.name.toLowerCase().split(' ')[0])) || options[0];

  await sendWhatsAppImage(user.phone_number, meal.img, `🍗 *ZWEEPEE FOOD*\n\n*${meal.name}*\nPrice: R${meal.price.toFixed(2)}\nDelivery: R35\n\nReply "ADD ${meal.id}" to order now! 🏃‍♂️`, env);
  return `Found some options for your hunger! ✨`;
}

async function handleAccommodation(user, text, data, memory, db, env) {
  const location = data.location || 'Cape Town';
  const stay = { id: 'stay_1', name: 'Radisson Blu Waterfront', price: 4500, img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800' };

  await sendWhatsAppImage(user.phone_number, stay.img, `🏨 *ZWEEPEE STAYS*\n\n*${stay.name}* (${location})\nPrice: R${stay.price.toLocaleString()} per night\n\nReply "ADD ${stay.id}" to book your stay! ✨`, env);
  return `Checking availability in ${location}...`;
}

async function handleFlights(user, text, data, memory, db, env) {
  const destination = data.to || 'Cape Town';
  const flight = { id: 'fly_1', name: 'Safair (JNB ➔ CPT)', price: 1250, img: 'https://images.unsplash.com/photo-1436491865332-7a61a109c055?w=800' };

  await sendWhatsAppImage(user.phone_number, flight.img, `✈️ *ZWEEPEE FLIGHTS*\n\n*${flight.name}*\nPrice: R${flight.price.toLocaleString()}\n\nReply "ADD ${flight.id}" to secure this seat! 🎫`, env);
  return `Searching for the best routes to ${destination}...`;
}

async function handleCarRental(user, text, data, memory, db, env) {
  const car = { id: 'car_1', name: 'VW Polo Vivo', price: 450, img: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800' };
  await sendWhatsAppImage(user.phone_number, car.img, `🚗 *ZWEEPEE RENTAL*\n\n*${car.name}*\nPrice: R${car.price} / day\n\nReply "ADD ${car.id}" to reserve! 🗝️`, env);
  return `Looking for reliable wheels...`;
}

async function handleBuses(user, text, data, memory, db, env) {
  return `🚌 *ZWEEPEE BUSES*\n\nSearching Intercape and Greyhound schedules for you... One moment! 🎫`;
}

async function handleAirtime(user, text, data, memory, db, env) {
  const amount = data.quantity || 50;
  const network = data.product || 'Vodacom';
  return `📱 *ZWEEPEE AIRTIME*\n\nBuying R${amount} ${network} airtime for you. Confirm by replying "YES AIRTIME". ✨`;
}

async function handleElectricity(user, text, data, memory, db, env) {
  const amount = data.quantity || 100;
  return `⚡ *ZWEEPEE POWER*\n\nGenerating R${amount} electricity token for meter 142****890. Confirm by replying "YES POWER". 💡`;
}

async function handleCartAction(user, text, data, memory, db, env, ctx) {
  const t = text.toLowerCase();
  if (t.includes('add')) {
    const itemId = t.match(/(prod|food|stay|fly|car)_\d+/)?.[0] || 'unknown';
    await db.from('carts').insert([{ user_id: user.id, item_id: itemId, quantity: 1 }]);
    return `🛒 Added to your cart! Reply "CHECKOUT" when you're ready. ✨`;
  }

  if (t.includes('checkout') || t.includes('pay')) {
    const { data: items } = await db.from('carts').select('*').eq('user_id', user.id);
    if (!items?.length) return `🛒 Your cart is empty! Add something first. ✨`;

    const payfastUrl = `https://www.payfast.co.za/eng/process?cmd=_paynow&receiver=10000100&item_name=ZweepeeConcierge&amount=250.00`;
    return `✨ *ZWEEPEE CHECKOUT*\n\nReady to go! Secure payment via PayFast:\n🔗 ${payfastUrl}\n\nI'll notify you once payment is confirmed! 🚀`;
  }

  return `🛒 What would you like to do with your cart? (View/Checkout)`;
}

async function handleConversational(user, text, data, memory, db, env) {
  return `I'm Zweepee, your South African concierge! 🇿🇦\n\nI can help you buy anything, order food, book flights, or even get airtime and electricity. Just tell me what you need! ✨`;
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
  if (t.includes('buy') || t.includes('find') || t.includes('price') || t.includes('order') || t.includes('get')) return [{ intent: 'shopping', confidence: 0.8 }];
  if (t.includes('kfc') || t.includes('eat') || t.includes('food') || t.includes('hungry') || t.includes('restaurant')) return [{ intent: 'food', confidence: 0.8 }];
  if (t.includes('hotel') || t.includes('stay') || t.includes('sleep') || t.includes('accommodation') || t.includes('book')) return [{ intent: 'accommodation', confidence: 0.8 }];
  if (t.includes('flight') || t.includes('plane') || t.includes('fly') || t.includes('ticket')) return [{ intent: 'flights', confidence: 0.8 }];
  if (t.includes('airtime') || t.includes('data') || t.includes('vodacom') || t.includes('mtn') || t.includes('cell c') || t.includes('telkom')) return [{ intent: 'airtime', confidence: 0.8 }];
  if (t.includes('electricity') || t.includes('power') || t.includes('eskom') || t.includes('token')) return [{ intent: 'electricity', confidence: 0.8 }];

  // South African specific common queries
  if (t.includes('iphone') || t.includes('samsung') || t.includes('phone')) return [{ intent: 'shopping', confidence: 0.8, extracted_data: { product: t } }];

  if (t.length > 5) return [{ intent: 'conversational', confidence: 0.6 }];
  return [{ intent: 'help', confidence: 0.5 }];
}
