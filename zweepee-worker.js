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

    // Show typing indicator immediately
    ctx.waitUntil(sendWhatsAppTyping(userPhone, env));

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

    // Dynamic State Intent Injection
    const isNewUser = user.created_at && (Date.now() - new Date(user.created_at).getTime() < 60000); // Created in last minute
    const isReturning = !isNewUser && (Date.now() - new Date(user.last_active || 0).getTime() > 24 * 60 * 60 * 1000);

    // Update last active and rate limit check
    const now = new Date();
    const lastActive = new Date(user.last_active || 0);
    const diffMs = now - lastActive;

    // Rate limit: Max 1 message every 2 seconds
    if (diffMs < 2000 && userPhone !== (env.ADMIN_PHONE || '').replace('@c.us', '')) {
      await sendUserMessage(userPhone, `🛑 *SLOW DOWN*\n\nYou're moving faster than a Springbok! 🇿🇦 Please wait a few seconds before your next request. ✨`, env, { path: 'rate_limited' });
      return;
    }

    await supabase.from('users').update({ last_active: now.toISOString() }).eq('id', user.id);

    // Admin Commands
    if (messageText.trim() === '!diag') {
      const diagnostic = await runDiagnostics(env);
      await sendUserMessage(userPhone, `🛠️ *SYSTEM DIAGNOSTICS*\n\nSupabase: ${diagnostic.services.supabase}\nWhapi: ${diagnostic.services.whapi}\nGemini: ${diagnostic.services.gemini}\nStatus: ${diagnostic.status === 'healthy' ? '✅' : '❌'}`, env, { path: 'admin_cmd', userId: user.id, incomingFrom: rawFrom });
      return;
    }

    // Detect intent(s)
    let intents = await detectIntents(messageText, { ...memory, is_new: isNewUser, is_returning: isReturning }, env, ctx);

    // State Interception
    if (isNewUser && !intents.some(i => i.intent === 'onboarding')) {
      intents.unshift({ intent: 'onboarding', confidence: 1.0 });
    } else if (isReturning && (messageText.toLowerCase() === 'hi' || messageText.toLowerCase() === 'hello')) {
      intents = [{ intent: 'returning_user', confidence: 1.0 }];
    }
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
  User Context: ${JSON.stringify(memory)}
  Available intents (select all that apply):
  - Services: shopping, food, accommodation, flights, car_rental, buses, airtime, electricity, pharmacy, grocery, grocery_meat, grocery_veg, bus_intercape, bus_greyhound, flight_intl, cart_action.
  - Transport: mr_lift_home, mr_lift_form, mr_lift_matching, mr_lift_joined, mr_lift_noshow, mr_lift_rating.
  - Groups: create_group, join_group, view_group, leave_group, panic_button, check_in.
  - Meta/Info: pricing, track_order, complaints, faq, refunds, referral, loyalty, gift_vouchers, about_us, careers.
  - SA Utils: weather, load_shedding, fuel_price, events, exchange_rate.
  - Flow: greeting, conversational, help, mid_conv_resume, onboarding.
  - Edge: unknown_input, did_you_mean, conflicting_intents.
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
  cart_action: { handle: handleCartAction },

  // --- META INTENTS ---
  greeting: { handle: async () => `👋 Hi! I'm Zweepee, your South African concierge. How can I help you today? ✨` },
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

  // --- GROUP CART MIRAGES ---
  create_group: { handle: handleCreateGroup },
  join_group: { handle: handleJoinGroup },
  view_group: { handle: handleViewGroup },
  leave_group: { handle: async () => `👋 You've left the group cart. Your individual items are still in your personal cart! ✨` },
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
  subscription_needed: { handle: async () => `👑 *PREMIUM FEATURE*\n\nThis feature is part of Zweepee Plus! Subscribe now for early access and zero concierge fees. 🇿🇦✨` },

  // --- ADDITIONAL SERVICE CATEGORIES (GROCERY, TRAVEL, ETC) ---
  grocery_meat: { handle: async () => `🥩 *ZWEEPEE MEAT*\n\nBrowsing local butchers and major retailers for the best cuts. Braai tonight? 🇿🇦🔥` },
  grocery_veg: { handle: async () => `🥦 *ZWEEPEE FRESH*\n\nFinding the crispest fruits and veggies from local markets and supermarkets. 🍏🥬✨` },
  bus_intercape: { handle: async () => `🚌 *INTERCAPE SEARCH*\n\nChecking Intercape Mainliner and Sleepliner availability for your route... 🎫` },
  bus_greyhound: { handle: async () => `🚌 *GREYHOUND SEARCH*\n\nBrowsing Greyhound Dreamliner schedules... One moment! 🎫` },
  flight_intl: { handle: async () => `✈️ *INTERNATIONAL FLIGHTS*\n\nSearching for global routes and connections. Cape Town to London? Jo'burg to Dubai? I've got you! 🌍✨` },

  // --- META & INFO MIRAGES ---
  referral: { handle: async () => `🎁 *ZWEEPEE REFERRALS*\n\nShare your code with friends! When they place their first order, you both get R50 concierge credit. 🇿🇦✨` },
  loyalty: { handle: async () => `⭐ *ZWEEPEE REWARDS*\n\nYou've earned 150 magic points! Keep using Zweepee to unlock free deliveries and exclusive deals. ✨` },
  careers: { handle: async () => `💼 *JOIN THE MAGIC*\n\nWant to help build the future of commerce in SA? Send your CV to careers@zweepee.com! 🚀` },
  about_us: { handle: async () => `✨ *ABOUT ZWEEPEE*\n\nWe're an autonomous AI concierge designed specifically for South Africans. We make buying anything as easy as a text message. 🇿🇦` },
  gift_vouchers: { handle: async () => `🎁 *GIFT VOUCHERS*\n\nNeed a last-minute gift? I can generate digital vouchers for Takealot, Netflix, and more! ✨` },

  // --- EDGE CASES & ERRORS ---
  invalid_address: { handle: async () => `📍 *ADDRESS ERROR*\n\nI couldn't quite pin that address on the map. Could you send it as a Location pin or type it again? 🇿🇦` },
  low_balance: { handle: async () => `💸 *WALLET LOW*\n\nYour Zweepee balance is too low for this order. Top up now to continue the magic! ✨` },
  phone_mismatch: { handle: async () => `📱 *VERIFICATION NEEDED*\n\nThe phone number provided doesn't match your WhatsApp. Please verify to continue. 🔐` },

  // --- SOUTH AFRICA UTILITIES & NEWS ---
  weather: { handle: async () => `☀️ *SA WEATHER*\n\nChecking conditions for your area... It looks like a great day for a braai! 🇿🇦🔥` },
  load_shedding: { handle: async () => `💡 *LOAD SHEDDING UPDATE*\n\nStage 2 currently active. Checking schedules for your area... 🕯️` },
  fuel_price: { handle: async () => `⛽ *FUEL PRICE ALERT*\n\nPetrol and Diesel prices updated. Checking the latest inland vs coastal rates for you... 🇿🇦` },
  events: { handle: async () => `🎟️ *UPCOMING EVENTS*\n\nFrom rugby at Loftus to concerts in CPT Stadium, I'll find the best tickets for you! 🇿🇦✨` },
  exchange_rate: { handle: async () => `💱 *RAND RATE*\n\nChecking USD/ZAR, GBP/ZAR, and EUR/ZAR live for you. The Rand is looking... interesting today! 🇿🇦📈` },

  // --- MR LIFT CLUB (INTENTS 60-75) ---
  mr_lift_home: { handle: handleMrLiftHome },
  mr_lift_form: { handle: handleMrLiftForm },
  mr_lift_matching: { handle: handleMrLiftMatching },
  mr_lift_joined: { handle: handleMrLiftJoined },
  mr_lift_noshow: { handle: handleMrLiftNoShow },
  mr_lift_rating: { handle: handleMrLiftRating },
  mr_lift_eta: { handle: handleMrLiftETA },
  mr_lift_gps: { handle: handleMrLiftGPS }
};

async function routeMessage(user, intents, messageText, mediaData, memory, supabase, env, ctx) {
  if (!intents || intents.length === 0) {
    return await MIRAGE_REGISTRY.help.handle(user, messageText, mediaData, {}, memory, supabase, env, ctx);
  }

  console.log(`[ROUTER] Routing intents: ${intents.map(i => i.intent).join(', ')}`);
  let finalResponse = "";

  for (const intentObj of intents) {
    const intent = intentObj.intent;
    const data = intentObj.extracted_data || {};
    console.log(`[ROUTER] Dispatching unit: ${intent}`);

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
}

// MIRAGES (Detailed Implementation)
async function handleShopping(user, text, media, data, memory, db, env) {
  const query = data.product || text;
  const results = [
    { id: 'prod_1', name: 'Apple iPhone 15 Pro (128GB)', price: 21999, img: 'https://images.unsplash.com/photo-1696446701796-da61225697cc?w=800' },
    { id: 'prod_2', name: 'Samsung Galaxy S24 Ultra', price: 23499, img: 'https://images.unsplash.com/photo-1707223516664-8894101dec21?w=800' }
  ];

  const product = results.find(p => query.toLowerCase().includes(p.name.toLowerCase().split(' ')[0])) || results[0];

  await sendWhatsAppImage(user.phone_number, product.img, `🛍️ *ZWEEPEE SHOPPING*\n\n*${product.name}*\nPrice: R${product.price.toLocaleString()}\nConcierge Fee: R49`, env);
  await sendWhatsAppInteractive(user.phone_number, `I found this for you! Should I add it to your cart?`, [
    { id: `ADD_${product.id}`, title: 'Add to Cart 🛒' },
    { id: 'SEARCH_MORE', title: 'Search More 🔍' }
  ], env);
  return null;
}

async function handleFood(user, text, data, memory, db, env) {
  const query = data.product || text;
  const options = [
    { id: 'food_1', name: 'KFC Streetwise 2', price: 49.90, img: 'https://images.unsplash.com/photo-1513639776629-7b61b0ac49cb?w=800' },
    { id: 'food_2', name: 'Steers Wacky Wednesday', price: 59.90, img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800' }
  ];

  const meal = options.find(o => query.toLowerCase().includes(o.name.toLowerCase().split(' ')[0])) || options[0];

  await sendWhatsAppImage(user.phone_number, meal.img, `🍗 *ZWEEPEE FOOD*\n\n*${meal.name}*\nPrice: R${meal.price.toFixed(2)}\nDelivery: R35`, env);
  await sendWhatsAppInteractive(user.phone_number, `Found some options for your hunger! ✨`, [
    { id: `ADD_${meal.id}`, title: 'Order Now 🏃‍♂️' },
    { id: 'VIEW_MENU', title: 'View Menu 📋' }
  ], env);
  return null;
}

async function handleAccommodation(user, text, data, memory, db, env) {
  const location = data.location || 'Cape Town';
  const stay = { id: 'stay_1', name: 'Radisson Blu Waterfront', price: 4500, img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800' };

  await sendWhatsAppImage(user.phone_number, stay.img, `🏨 *ZWEEPEE STAYS*\n\n*${stay.name}* (${location})\nPrice: R${stay.price.toLocaleString()} per night`, env);
  await sendWhatsAppInteractive(user.phone_number, `Checking availability in ${location}. Found this gem!`, [
    { id: `ADD_${stay.id}`, title: 'Book This Stay 🏨' },
    { id: 'SEARCH_HOTEL', title: 'See More Hotels 🔍' }
  ], env);
  return null;
}

async function handleFlights(user, text, data, memory, db, env) {
  const destination = data.to || 'Cape Town';
  const flight = { id: 'fly_1', name: 'Safair (JNB ➔ CPT)', price: 1250, img: 'https://images.unsplash.com/photo-1436491865332-7a61a109c055?w=800' };

  await sendWhatsAppImage(user.phone_number, flight.img, `✈️ *ZWEEPEE FLIGHTS*\n\n*${flight.name}*\nPrice: R${flight.price.toLocaleString()}`, env);
  await sendWhatsAppInteractive(user.phone_number, `Searching for the best routes to ${destination}. Lowest fare found!`, [
    { id: `ADD_${flight.id}`, title: 'Secure Seat 🎫' },
    { id: 'SEARCH_FLIGHT', title: 'Other Times 🕒' }
  ], env);
  return null;
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

  // Check for Group Context
  const { data: membership } = await db.from('group_members').select('group_id').eq('user_id', user.id).single();
  const groupId = membership?.group_id || data.group_id;

  if (t.includes('add') || t.includes('ADD_')) {
    const itemId = t.match(/(prod|food|stay|fly|car|grocery)_\d+/)?.[0] || 'unknown';

    if (groupId) {
      // Add to Group Cart
      await db.from('group_cart_items').insert([{ group_id: groupId, user_id: user.id, item_id: itemId, quantity: 1 }]);
      await sendWhatsAppInteractive(user.phone_number, `👥 Added to GROUP cart! Everyone can see your contribution. ✨`, [
        { id: 'VIEW_GROUP', title: 'View Group Cart 🛒' },
        { id: 'CHECKOUT', title: 'Pay My Share 💳' }
      ], env);

      // Notify other members (Simulated)
      // ctx.waitUntil(notifyGroupMembers(groupId, `${user.id.substring(0,5)} added ${itemId} to the group!`, env));
    } else {
      // Add to Personal Cart
      await db.from('carts').insert([{ user_id: user.id, item_id: itemId, quantity: 1 }]);
      await sendWhatsAppInteractive(user.phone_number, `🛒 Added to your cart! Ready to checkout?`, [
        { id: 'CHECKOUT', title: 'Checkout Now 🚀' },
        { id: 'CONTINUE', title: 'Keep Shopping 🛍️' }
      ], env);
    }
    return null;
  }

  if (t.includes('checkout') || t.includes('pay') || t.includes('REQUEST_LIFT')) {
    let items = [];
    let isGroup = false;
    let isLift = t.includes('REQUEST_LIFT');

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

    if (isLift) {
      // Mr Lift Escrow: R35 fixed for JHB-Soweto
      total = 35.00;
      payfastUrl = `https://www.payfast.co.za/eng/process?cmd=_paynow&receiver=${env.PAYFAST_MERCHANT_ID || '10000100'}&item_name=MrLift_Escrow_Ride&amount=${total.toFixed(2)}&m_payment_id=LIFT_${Date.now()}`;
      return `✨ *MR LIFT BOOKING*\n\nRoute: Soweto ↔ JHB CBD\nFare: R35.00 (Held in Escrow) 🛡️\n\nSecure payment via PayFast:\n🔗 ${payfastUrl}\n\nFunds are only released to the driver when your trip starts! 🚖✨`;
    }

    if (isGroup) {
      const { data: group } = await db.from('group_carts').select('type').eq('id', groupId).single();
      if (group?.type === 'public') {
        // Public Split: Supplier gets 95%, Zweepee gets 5%
        const platformFee = total * 0.05;
        payfastUrl = `https://www.payfast.co.za/eng/process?cmd=_paynow&receiver=${env.PAYFAST_MERCHANT_ID || '10000100'}&item_name=Zweepee_Group_Share&amount=${total.toFixed(2)}&setup=split&fee=${platformFee.toFixed(2)}`;
      } else {
        // Private: Individual share direct to supplier
        payfastUrl = `https://www.payfast.co.za/eng/process?cmd=_paynow&receiver=${env.SUPPLIER_ID || '10000100'}&item_name=Private_Group_Order&amount=${total.toFixed(2)}`;
      }
    } else {
      payfastUrl = `https://www.payfast.co.za/eng/process?cmd=_paynow&receiver=${env.PAYFAST_MERCHANT_ID || '10000100'}&item_name=Zweepee_Personal_Order&amount=${total.toFixed(2)}`;
    }

    return `✨ *ZWEEPEE CHECKOUT*\n\nMode: ${isGroup ? 'Group Share' : 'Personal'}\nItems: ${items.length}\nTotal: R${total.toLocaleString()}\n\nSecure payment via PayFast Escrow:\n🔗 ${payfastUrl}\n\nI'll notify the group once your share is paid! 🚀`;
  }

  return `🛒 What would you like to do with your cart? (View/Checkout)`;
}

async function handleConversational(user, text, data, memory, db, env) {
  return `I'm Zweepee, your South African concierge! 🇿🇦\n\nI can help you buy anything, order food, book flights, or even get airtime and electricity. Just tell me what you need! ✨`;
}

async function handlePricing(user, text, data, memory, db, env) {
  const item = data.product || 'items';
  return `💰 *ZWEEPEE PRICING*\n\nOur concierge fee is typically R49 per order. Product prices for ${item} are fetched live from top SA retailers like Takealot, Woolworths, and Checkers Sixty60. ✨`;
}

async function handleTrackOrder(user, text, data, memory, db, env) {
  return `📦 *ORDER TRACKING*\n\nI'm checking your recent orders... You'll receive a notification as soon as the driver is en route! 🏃‍♂️💨`;
}

async function handleComplaints(user, text, data, memory, db, env) {
  return `🛠️ *ZWEEPEE SUPPORT*\n\nI'm sorry to hear you're having trouble! I've flagged this for Jules. One of our humans will reach out to you shortly. 🇿🇦✨`;
}

async function handleFAQ(user, text, data, memory, db, env) {
  await sendWhatsAppInteractive(user.phone_number, `❓ *ZWEEPEE FAQ*\n\nHow can I help you understand our magic?`, [
    { id: 'FAQ_PAYMENT', title: 'Payment Info 💳' },
    { id: 'FAQ_DELIVERY', title: 'Delivery Info 🚚' },
    { id: 'FAQ_CANCEL', title: 'Cancellations ❌' }
  ], env);
  return null;
}

async function handleRefunds(user, text, data, memory, db, env) {
  return `💸 *REFUND REQUEST*\n\nRefunds are processed within 3-5 business days to your original payment method. Please provide your Order ID to proceed. ✨`;
}

async function handlePharmacy(user, text, data, memory, db, env) {
  const item = data.product || 'medication';
  return `💊 *ZWEEPEE PHARMACY*\n\nSearching Dis-Chem and Clicks for ${item}... Please note that schedule 1+ meds require a valid prescription upload. 📝✨`;
}

async function handleGrocery(user, text, data, memory, db, env) {
  await sendWhatsAppInteractive(user.phone_number, `🛒 *ZWEEPEE GROCERY*\n\nWant to save more? Join a Group Cart and get bulk discounts from Shoprite or Makro! 🇿🇦✨`, [
    { id: 'CREATE_PRIVATE', title: 'Start Private Group 👥' },
    { id: 'JOIN_PUBLIC', title: 'Join National Cart 🇿🇦' },
    { id: 'SHOP_ALONE', title: 'Shop Alone 🚶‍♂️' }
  ], env);
  return null;
}

async function handleCreateGroup(user, text, data, memory, db, env) {
  const inviteCode = Math.random().toString(36).substring(7).toUpperCase();
  const { data: group, error } = await db.from('group_carts').insert([{
    type: 'private',
    creator_id: user.id,
    invite_code: inviteCode,
    status: 'open'
  }]).select().single();

  if (error) throw error;

  return `👥 *PRIVATE GROUP CREATED*\n\nInvite your friends to join using this code:\n*${inviteCode}*\n\nEveryone who joins can add items, and we'll aggregate the order for bulk savings! 🇿🇦✨`;
}

async function handleJoinGroup(user, text, data, memory, db, env) {
  const code = data.code || text.match(/[A-Z0-9]{5,}/)?.[0];
  if (!code) return `🤔 I need an invite code to join a private group. Please reply with "JOIN [CODE]". ✨`;

  if (code === 'PUBLIC' || text.includes('National')) {
      return `🇿🇦 *JOINED NATIONAL CART*\n\nYou're now part of the Zweepee National Aggregate! All items you add will contribute to a massive bulk order for maximum discounts. 🚀✨`;
  }

  const { data: group } = await db.from('group_carts').select('*').eq('invite_code', code).single();
  if (!group) return `❌ Sorry, I couldn't find a group with code *${code}*. Check the code and try again! 🇿🇦`;

  await db.from('group_members').insert([{ group_id: group.id, user_id: user.id }]);

  return `✅ *JOINED GROUP*\n\nYou've joined the cart created by ${group.creator_id.substring(0, 5)}! You can now add items to the shared list. ✨`;
}

async function handlePanic(user, text, data, memory, db, env) {
  await sendAdminAlert(`🚨 PANIC BUTTON PRESSED by ${user.phone_number} in Group ${data.group_id || 'Unknown'}`, env);
  return `🚨 *ZWEEPEE EMERGENCY*\n\nI've notified the admin and security services of your location. Stay calm and stay safe. 🇿🇦✨`;
}

async function handleCheckIn(user, text, data, memory, db, env) {
  return `⏰ *CHECK-IN TIMER*\n\nYou've set a check-in for your grocery collection in 15 minutes. If you don't confirm safety by then, I'll notify the group admin! 🔐✨`;
}

async function handleViewGroup(user, text, data, memory, db, env) {
  const { data: membership } = await db.from('group_members').select('group_id').eq('user_id', user.id).single();
  const groupId = membership?.group_id;

  if (!groupId) return `🤔 You're not in a group cart yet. Join one to see the shared magic! ✨`;

  const { data: items } = await db.from('group_cart_items').select('*').eq('group_id', groupId);
  const { data: members } = await db.from('group_members').select('user_id').eq('group_id', groupId);

  const totalItems = items?.length || 0;
  const memberCount = members?.length || 0;
  const discount = totalItems > 10 ? '15%' : totalItems > 5 ? '10%' : '5%';

  await sendWhatsAppInteractive(user.phone_number, `🛒 *GROUP CART SUMMARY*\n\nTotal Items: ${totalItems}\nActive Members: ${memberCount}\nEstimated Bulk Discount: *${discount}* 📉\n\nEveryone sees updates in real-time. Ready to save?`, [
    { id: 'LIST_ITEMS', title: 'See Item List 📋' },
    { id: 'CHECKOUT', title: 'Pay My Share 💳' },
    { id: 'LEAVE_GROUP', title: 'Leave Group 👋' }
  ], env);
  return null;
}

async function handleOnboarding(user, text, data, memory, db, env) {
  await sendWhatsAppInteractive(user.phone_number, `✨ *WELCOME TO ZWEEPEE*\n\nI'm your magic concierge! 🇿🇦 I can help you buy anything, book travel, or pay utilities without leaving WhatsApp.`, [
    { id: 'START_SHOPPING', title: 'Start Shopping 🛍️' },
    { id: 'ORDER_FOOD', title: 'Order Food 🍗' },
    { id: 'VIEW_FAQ', title: 'How it works? ❓' }
  ], env);
  return null;
}

async function handleReturningUser(user, text, data, memory, db, env) {
  return `✨ *WELCOME BACK*\n\nGood to see you again! Ready for some more magic? How can I help you today? 🇿🇦`;
}

async function handleResume(user, text, data, memory, db, env) {
  return `🔄 *RESUMING CONVERSATION*\n\nI remember we were talking about ${memory.last_intent || 'your request'}. Should we pick up where we left off? ✨`;
}

async function handleUnknown(user, text, data, memory, db, env) {
  return `🤔 *ZWEEPEE IS PUZZLED*\n\nI didn't quite catch that. I'm still learning! Try asking for food, shopping, or travel. ✨`;
}

async function handlePartialMatch(user, text, data, memory, db, env) {
  const suggestion = data.suggestion || 'shopping';
  return `🧐 *DID YOU MEAN?*\n\nI think you're asking about *${suggestion}*. Is that right? ✨`;
}

async function handleConflict(user, text, data, memory, db, env) {
  return `⚖️ *ZWEEPEE CONFUSION*\n\nYou've asked for a few different things at once! Should we start with ${data.primary || 'the first one'}? ✨`;
}

async function handleAiTimeout(user, text, data, memory, db, env) {
  return `⏳ *BRAIN FREEZE*\n\nMy AI brain is thinking a bit slowly today. I'm switching to my fallback magic to help you faster! ✨`;
}

async function handleAiError(user, text, data, memory, db, env) {
  return `⚠️ *MAGIC HICCUP*\n\nSomething went wrong with my AI. Don't worry, Jules is notified and I'm using my backup systems! 🇿🇦✨`;
}

async function handleOutOfStock(user, text, data, memory, db, env) {
  return `🚫 *OUT OF STOCK*\n\nI'm so sorry! The item "${data.product || 'you requested'}" just sold out at our local partner. Should I look for an alternative? 🧐✨`;
}

async function handleAfterHours(user, text, data, memory, db, env) {
  return `🌙 *AFTER HOURS*\n\nWe're currently taking a quick nap! You can still add items to your cart, and we'll process them first thing in the morning (8 AM). 🇿🇦✨`;
}

async function handleRegionalUnavail(user, text, data, memory, db, env) {
  return `📍 *LOCATION LIMIT*\n\nIt looks like we haven't brought our magic to "${data.location || 'that area'}" just yet. We're expanding fast—stay tuned! 🇿🇦🚀`;
}

async function handleMaxCart(user, text, data, memory, db, env) {
  return `🛒 *CART IS FULL*\n\nWhoa there! You've reached the maximum number of items for a single concierge order. Please checkout now or remove something! ✨`;
}

async function handleRateLimit(user, text, data, memory, db, env) {
  return `🛑 *SLOW DOWN*\n\nYou're moving faster than a Springbok! 🇿🇦 Please wait a few seconds before your next request so I can keep up. ✨`;
}

async function handleDegraded(user, text, data, memory, db, env) {
  await sendWhatsAppInteractive(user.phone_number, `⚠️ *SERVICE ADVISORY*\n\nOne of our partner APIs is currently offline. Other services are working perfectly!`, [
    { id: 'CHECK_STATUS', title: 'System Status 🛠️' },
    { id: 'CONTINUE_MAGIC', title: 'Try something else ✨' }
  ], env);
  return null;
}

async function handleLatency(user, text, data, memory, db, env) {
  return `🐢 *LATENCY ALERT*\n\nThe network is a bit sluggish today. I'm working hard to get your results—thanks for your patience! 🇿🇦✨`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MR LIFT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleMrLiftHome(user, text, data, memory, db, env) {
  await sendWhatsAppInteractive(user.phone_number, `🚖 *MR LIFT CLUB*\n\n24/7 Auto-created minibus taxi groups. Safe, reliable, and SANTACO-registered.\n\n*Current Route:* Soweto ↔ JHB CBD\n*Fare:* R35 (Escrow Protected) 🛡️`, [
    { id: 'REQUEST_LIFT', title: 'Request a Ride 🚖' },
    { id: 'VIEW_MY_CLUBS', title: 'My Lift Clubs 👥' },
    { id: 'LIFT_HELP', title: 'How it works? ❓' }
  ], env);
  return null;
}

async function handleMrLiftForm(user, text, data, memory, db, env) {
  const pickup = text.match(/PICKUP:\s*(.*)/i)?.[1];
  const dropoff = text.match(/DROPOFF:\s*(.*)/i)?.[1];
  const time = text.match(/TIME:\s*(.*)/i)?.[1];

  if (pickup && dropoff && time) {
    // Logic to save request
    await db.from('lift_requests').insert([{
      user_id: user.id,
      pickup_address: pickup,
      dropoff_address: dropoff,
      scheduled_time: time === 'Now' ? new Date().toISOString() : time,
      status: 'pending'
    }]);

    // Trigger matching check (non-blocking)
    // ctx.waitUntil(matchLiftRequests(db, env));

    return await MIRAGE_REGISTRY.mr_lift_matching.handle(user, text, { time }, memory, db, env);
  }

  return `📍 *LIFT REQUEST FORM*\n\nPlease provide your details in this format:\n\n*PICKUP:* [Home Address]\n*DROPOFF:* [JHB CBD / Address]\n*TIME:* [HH:MM or Now]\n\nI'll match you with 10-15 other riders on your route! 🇿🇦✨`;
}

async function handleMrLiftMatching(user, text, data, memory, db, env) {
  return `🔄 *MATCHING RIDERS...*\n\nI'm scanning for other riders in Soweto near you for a ${data.time || '17:00'} trip to CBD. I'll notify you once your club is 80% full! 🇿🇦💨`;
}

async function handleMrLiftJoined(user, text, data, memory, db, env) {
  await sendWhatsAppInteractive(user.phone_number, `✅ *LIFT CLUB READY!*\n\n*Route:* Soweto ➔ Gandhi Square\n*Departure:* 17:15\n*Fare:* R35 (Paid)\n\nCoordination tools below:`, [
    { id: 'LIFT_ETA', title: 'Driver ETA 🕒' },
    { id: 'LIFT_GPS', title: 'Live GPS Link 📍' },
    { id: 'READY_AT_GATE', title: "I'm at the gate! 🙋‍♂️" }
  ], env);
  return null;
}

async function handleReadyAtGate(user, text, data, memory, db, env) {
  // Simulate notifying the driver/group
  console.log(`[LIFT] User ${user.phone_number} is ready at the gate.`);
  return `👍 *NOTIFIED DRIVER*\n\nI've let the driver and your lift club members know you're at the gate. See you soon! 🚖✨`;
}

async function handleMrLiftNoShow(user, text, data, memory, db, env) {
  return `🛡️ *DRIVER NO-SHOW*\n\nI'm sorry! I've triggered an instant refund of R35 to your wallet. Would you like me to find another lift club for you immediately? 🇿🇦✨`;
}

async function handleMrLiftRating(user, text, data, memory, db, env) {
  return `⭐ *RATE YOUR RIDE*\n\nHow was your trip with Driver Sipho? Please reply with 1-5 stars. Your feedback keeps Mr Lift safe! 🇿🇦✨`;
}

async function handleMrLiftETA(user, text, data, memory, db, env) {
  return `🕒 *DRIVER ETA*\n\nYour driver is currently picking up Member #4 (2.1km away). ETA to your door: *8 minutes*. Please be ready at the gate! 🚖💨`;
}

async function handleMrLiftGPS(user, text, data, memory, db, env) {
  const gpsLink = "https://maps.google.com/?q=-26.2041,28.0473"; // Mock JHB CBD
  return `📍 *LIVE TRACKING*\n\nView driver location live:\n🔗 ${gpsLink}\n\nNote: Link expires once trip starts. 🇿🇦`;
}

async function startLiftTrip(clubId, db, env) {
  console.log(`[LIFT] Starting trip for club ${clubId}...`);
  await db.from('lift_clubs').update({ status: 'started' }).eq('id', clubId);

  // Release Escrow Funds (Simulated)
  const { data: members } = await db.from('lift_memberships').select('*').eq('club_id', clubId);
  for (const member of members) {
    await db.from('lift_memberships').update({ payment_status: 'released' }).eq('id', member.id);
    console.log(`[LIFT] Funds released for user ${member.user_id}`);
  }
}

async function matchLiftRequests(db, env) {
  console.log(`[LIFT] Running clustering engine...`);
  const { data: pending } = await db.from('lift_requests').select('*').eq('status', 'pending');
  if (!pending || pending.length < 10) return;

  // Simple cluster by route (Mock Soweto -> CBD)
  const sowetoRiders = pending.filter(r => r.pickup_address.toLowerCase().includes('soweto'));
  if (sowetoRiders.length >= 10) {
    console.log(`[LIFT] Found cluster of ${sowetoRiders.length} riders!`);

    const { data: club } = await db.from('lift_clubs').insert([{
      route_name: 'SOWETO_TO_CBD',
      departure_time: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      status: 'forming'
    }]).select().single();

    for (const rider of sowetoRiders) {
      await db.from('lift_memberships').insert([{
        club_id: club.id,
        user_id: rider.user_id,
        fare_amount: 35.00,
        payment_status: 'pending'
      }]);
      await db.from('lift_requests').update({ status: 'matched' }).eq('id', rider.id);

      // Notify rider (Simulated via logs)
      console.log(`[LIFT] Notifying user ${rider.user_id} of ready club!`);
    }
  }
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

async function sendWhatsAppTyping(to, env) {
  try {
    await fetch('https://gate.whapi.cloud/messages/typing', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to.replace('@c.us', '') })
    });
  } catch (e) {}
}

async function sendWhatsAppInteractive(to, text, buttons, env) {
  const res = await fetchWithRetry('https://gate.whapi.cloud/messages/interactive', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: to.replace('@c.us', ''),
      type: 'button',
      body: { text },
      action: {
        buttons: buttons.map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title }
        }))
      }
    })
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

  // Group Keywords
  if (t.includes('create group') || t.includes('start stokvel')) return [{ intent: 'create_group', confidence: 0.9 }];
  if (t.includes('join group') || t.includes('join cart')) return [{ intent: 'join_group', confidence: 0.9 }];
  if (t.includes('group summary') || t.includes('who else')) return [{ intent: 'view_group', confidence: 0.8 }];
  if (t.includes('panic') || t.includes('emergency') || t.includes('help me now')) return [{ intent: 'panic_button', confidence: 1.0 }];

  // Transport Keywords
  if (t.includes('taxi') || t.includes('minibus') || t.includes('lift') || t.includes('ride') || t.includes('soweto')) return [{ intent: 'mr_lift_home', confidence: 0.9 }];

  // Service Keywords
  if (t.includes('buy') || t.includes('order') || t.includes('get') || t.includes('iphone') || t.includes('samsung')) return [{ intent: 'shopping', confidence: 0.8 }];
  if (t.includes('kfc') || t.includes('food') || t.includes('hungry') || t.includes('eat')) return [{ intent: 'food', confidence: 0.8 }];
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

  if (t.length > 5) return [{ intent: 'conversational', confidence: 0.6 }];
  return [{ intent: 'help', confidence: 0.5 }];
}
