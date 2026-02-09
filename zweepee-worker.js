// ═══════════════════════════════════════════════════════════════════════════════
// ZWEEPEE - The Magic WhatsApp Concierge for South Africa
// Single-file Cloudflare Worker - Production Ready
// Stack: Cloudflare Workers + Supabase + Whapi + Gemini
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

    // 🧠 GROK-SPEC JSON STRUCTURE
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

    // Whapi webhook (POST only - no verification needed)
    if (request.method === 'POST' && url.pathname === '/webhook') {
      const startTime = Date.now();
      const body = await request.json();

      // 📥 RAW INBOUND LOGGING (The "Black Box")
      // This proves if Whapi is even reaching our worker
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
    // 🛠️ Initialize Supabase first for early checks
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

    // 🚧 Maintenance Mode Check
    const { data: maintenance } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'maintenance_mode')
      .single();

    if (maintenance?.value === true || maintenance?.value === 'true') {
      const userPhone = body.messages?.[0]?.from?.replace('@c.us', '');
      if (userPhone) {
        await sendWhatsAppMessage(userPhone, `🛠️ *ZWEEPEE MAINTENANCE*\n\nI'm taking a quick power nap while Jules performs some magic updates. I'll be back shortly! ✨`, env);
      }
      return;
    }

    // Extract message from Whapi webhook format
    const message = body.messages?.[0];
    if (!message) return;

    const userPhone = message.from.replace('@c.us', ''); // Whapi format: 27730552773@c.us
    const messageType = message.type;

    let messageText = '';
    let mediaData = null;

    if (messageType === 'text') {
      messageText = message.body;
    } else if (messageType === 'image') {
      messageText = message.caption || '[Image]';
      mediaData = { type: 'image', url: message.image?.link };
    } else if (messageType === 'interactive') {
      messageText = message.interactive?.button_reply?.id ||
                   message.interactive?.list_reply?.id || '';
    }

    // Initialize Supabase (Already initialized for maintenance check above)

    // Get or create user with full context
    const user = await getOrCreateUser(userPhone, supabase);

    // Get user memory (preferences, history, last cart)
    const memory = await getUserMemory(user.id, supabase);

    // Save incoming message to chat history
    await saveChatMessage(user.id, 'user', messageText, supabase);

    // 🛠️ Admin Diagnostic Command
    if (messageText.trim() === '!diag') {
      const diagnostic = await runDiagnostics(env);
      const diagMsg = `🛠️ *SYSTEM DIAGNOSTICS*\n\n` +
                      `Supabase: ${diagnostic.services.supabase}\n` +
                      `Whapi: ${diagnostic.services.whapi}\n` +
                      `Gemini: ${diagnostic.services.gemini}\n\n` +
                      `Status: ${diagnostic.status === 'healthy' ? '✅' : '❌'}`;
      await sendWhatsAppMessage(userPhone, diagMsg, env);
      return;
    }

    if (messageText.trim() === '!stats') {
      const analytics = await runAnalytics(env);
      const statsMsg = `📊 *ZWEEPEE INTELLIGENCE REPORT*\n\n` +
                       `⚡ *PERFORMANCE*\n` +
                       `• Response Time: ${analytics.metrics.avg_response_time}ms avg\n` +
                       `• Reliability: ${analytics.metrics.reliability}%\n` +
                       `• Self-Heals: ${analytics.metrics.auto_recovered} (auto-fixed)\n\n` +
                       `💰 *BUSINESS METRICS*\n` +
                       `• Conversion: ${analytics.business.conversion_rate}%\n` +
                       `• Total Orders: ${analytics.business.total_orders}\n` +
                       `• Revenue: R${analytics.business.revenue.toLocaleString()}\n\n` +
                       `🔥 *TOP REQUESTS*\n` +
                       `• ${analytics.business.top_intent.charAt(0).toUpperCase() + analytics.business.top_intent.slice(1)}\n\n` +
                       `🎁 *POPULAR BUNDLES*\n` +
                       (analytics.business.top_bundles.length > 0
                         ? analytics.business.top_bundles.map(b => `• ${b}`).join('\n')
                         : '• None yet') + `\n\n` +
                       `_Last updated: Just now_`;
      await sendWhatsAppMessage(userPhone, statsMsg, env);
      return;
    }

    // Detect intent(s) with Gemini - can return multiple intents
    const intents = await detectIntents(messageText, memory, env);

    // 🧠 LOG INTENT (Journey Forensics)
    ctx.waitUntil(logSystemAlert({
      severity: 'info',
      source: 'brain',
      message: 'Intent parsed',
      context: { intents, messageText, userPhone }
    }, env));

    // Route to appropriate handler
    const response = await routeMessage(user, intents, messageText, mediaData, memory, supabase, env, ctx);

    // Send response via Whapi
    if (response) {
      const duration = startTime ? (Date.now() - startTime) : null;
      await sendWhatsAppMessage(userPhone, response, env);

      // 📊 LOG PERFORMANCE (Journey Forensics)
      if (duration) {
        ctx.waitUntil(logSystemAlert({
          severity: 'info',
          source: 'performance',
          message: 'Request processed',
          context: { duration_ms: duration, userPhone }
        }, env));
      }

      // Save bot response to chat history
      await saveChatMessage(user.id, 'assistant', response, supabase);
    }

  } catch (error) {
    console.error('❌ Process error:', error);

    // 🚨 Log to Zweepee Sentry
    ctx.waitUntil(logSystemAlert({
      severity: 'error',
      source: 'worker',
      message: error.message,
      stack_trace: error.stack,
      context: { body }
    }, env));

    try {
      const userPhone = body.messages?.[0]?.from?.replace('@c.us', '');
      if (userPhone) {
        await sendWhatsAppMessage(userPhone, `⚠️ Zweepee Magic is having a moment. I've logged this for Jules to fix!`, env);
      }
    } catch (sendError) {
      console.error('Fallback send error:', sendError);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ZWEEPEE SENTRY - Real-time Monitoring
// ═══════════════════════════════════════════════════════════════════════════════

async function logSystemAlert(alert, env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    await supabase.from('system_alerts').insert([alert]);

    // Critical alerts also go to Admin WhatsApp
    if (alert.severity === 'critical' || alert.severity === 'error') {
      const adminPhone = env.ADMIN_PHONE || env.WHAPI_PHONE;
      await sendWhatsAppMessage(adminPhone, `🚨 *ZWEEPEE SENTRY ALERT*\n\nSource: ${alert.source}\nError: ${alert.message}`, env);
    }
  } catch (e) {
    console.error('Failed to log alert:', e);
  }
}

async function runDiagnostics(env) {
  const results = {
    timestamp: new Date().toISOString(),
    status: 'checking',
    services: {}
  };

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // 1. Check Supabase
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    results.services.supabase = error ? `Error: ${error.message}` : 'Healthy';
  } catch (e) {
    results.services.supabase = `Fatal: ${e.message}`;
  }

  // 2. Check Whapi
  try {
    const whapiRes = await fetch('https://gate.whapi.cloud/health', {
      headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}` }
    });
    const whapiData = await whapiRes.json();
    const maskedToken = env.WHAPI_TOKEN ? `${env.WHAPI_TOKEN.substring(0, 5)}...` : 'Missing';
    results.services.whapi = whapiRes.ok ? 'Healthy' : `${whapiData.error || 'Unauthorized'} (Token: ${maskedToken})`;
  } catch (e) {
    results.services.whapi = `Fatal: ${e.message}`;
  }

  // 3. Check Gemini
  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
    });
    results.services.gemini = geminiRes.ok ? 'Healthy' : 'Invalid API Key or Quota Exceeded (Limit 0)';
  } catch (e) {
    results.services.gemini = `Fatal: ${e.message}`;
  }

  // 4. Check OpenAI
  try {
    if (env.OPENAI_API_KEY) {
      const openaiRes = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` }
      });
      results.services.openai = openaiRes.ok ? 'Healthy' : `Error ${openaiRes.status}`;
    } else {
      results.services.openai = 'Missing Key';
    }
  } catch (e) {
    results.services.openai = `Fatal: ${e.message}`;
  }

  const allHealthy = Object.values(results.services).every(v => v.includes('Healthy'));
  results.status = allHealthy ? 'healthy' : 'unhealthy';

  return results;
}

async function runAnalytics(env) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch last 24h for current metrics
    const { data: alerts } = await supabase
      .from('system_alerts')
      .select('*')
      .gt('created_at', yesterday);

    if (!alerts || alerts.length === 0) {
      return {
        metrics: { total_messages: 0, avg_response_time: 0, errors: 0, auto_recovered: 0, reliability: 100 },
        business: { conversion_rate: 0, top_intent: 'None', bundle_rate: 0, revenue: 0, total_orders: 0, top_bundles: [] }
      };
    }

    // 1. Performance Metrics
    const msgs = alerts.filter(a => a.source === 'whapi-webhook').length;
    const perfLogs = alerts.filter(a => a.source === 'performance').map(a => a.context?.duration_ms || 0);
    const avgResp = perfLogs.length > 0 ? Math.round(perfLogs.reduce((a, b) => a + b, 0) / perfLogs.length) : 0;
    const errors = alerts.filter(a => a.severity === 'error' || a.severity === 'critical').length;
    const healed = alerts.filter(a => a.source === 'worker' && a.message?.includes('moment')).length;
    const reliability = msgs > 0 ? Math.max(0, Math.min(100, Math.round(((msgs - errors) / msgs) * 10000) / 100)) : 100;

    // 2. Business Intelligence
    const intentLogs = alerts.filter(a => a.source === 'brain').map(a => a.context?.intents || []);
    const flattenedIntents = intentLogs.flat();
    const intentCounts = flattenedIntents.reduce((acc, i) => {
      acc[i.intent] = (acc[i.intent] || 0) + 1;
      return acc;
    }, {});

    const topIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

    // Checkout analysis
    const checkoutLogs = alerts.filter(a => a.source === 'payment-system');
    const revenue = checkoutLogs.reduce((sum, a) => sum + (a.context?.total || 0), 0);
    const orderCount = checkoutLogs.length;

    // Bundle Analysis
    const bundles = checkoutLogs
      .filter(a => a.context?.items?.length > 1)
      .map(a => a.context.items.map(i => i.mirage).sort().join(' + '));

    const bundleCounts = bundles.reduce((acc, b) => {
      acc[b] = (acc[b] || 0) + 1;
      return acc;
    }, {});

    const topBundles = Object.entries(bundleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([bundle, count]) => bundle);

    const cartUpdates = alerts.filter(a => a.source === 'cart-system').length;
    const conversion = cartUpdates > 0 ? Math.round((orderCount / cartUpdates) * 100) : 0;
    const bundleRate = msgs > 0 ? Math.round((bundles.length / msgs) * 100) : 0;

    return {
      metrics: {
        total_messages: msgs,
        avg_response_time: avgResp,
        errors,
        auto_recovered: healed,
        reliability
      },
      business: {
        conversion_rate: conversion,
        total_orders: orderCount,
        revenue: Math.round(revenue),
        top_intent: topIntent,
        bundle_rate: bundleRate,
        top_bundles: topBundles
      }
    };

  } catch (error) {
    console.error('Analytics error:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. GEMINI MULTI-INTENT PARSER (The Brain)
// ═══════════════════════════════════════════════════════════════════════════════

async function detectIntents(messageText, memory, env) {
  // 1. Try OpenAI First (New Brain)
  if (env.OPENAI_API_KEY) {
    try {
      console.log('🧠 Activating OpenAI Brain...');
      return await detectIntentsOpenAI(messageText, memory, env);
    } catch (e) {
      console.error('⚠️ OpenAI Brain glitched:', e.message);
      // 🔧 Log Self-Heal
      logSystemAlert({
        severity: 'info',
        source: 'worker',
        message: 'OpenAI moment - auto-recovered via Gemini'
      }, env);
    }
  }

  // 2. Try Gemini (Old Brain)
  try {
    console.log('🧠 Activating Gemini Brain...');
    const historyContext = memory?.recent_searches?.slice(0, 3).join(', ') || 'none';
    const lastOrder = memory?.last_order?.items?.map(i => i.name).join(', ') || 'none';

    const prompt = `Analyze this WhatsApp message and detect ALL intents. A user can request multiple things in one message.

Message: "${messageText}"

User context:
- Recent searches: ${historyContext}
- Last order: ${lastOrder}

Available intents:
- shopping (products, retail)
- food (KFC, McDonald's, fast food delivery)
- accommodation (hotels, Airbnb, guesthouses)
- flights (air travel)
- car_rental (rent a car)
- buses (intercity buses)
- airtime (mobile airtime/data)
- electricity (prepaid electricity)
- cart_action (view cart, checkout, add, remove)
- conversational (show cheaper, compare, repeat order, same as last time)
- greeting (hi, hello, hey)
- help (what can you do, help me)

Return ONLY valid JSON array.

\`\`\`json
[
  {
    "intent": "intent_name",
    "confidence": 0.0-1.0,
    "extracted_data": {
      "product": "extracted product name",
      "location": "extracted location",
      "date": "extracted date",
      "quantity": number,
      "budget": number,
      "any_other_relevant_data": "value"
    }
  }
]

Rules:
- Return array even if single intent
- Confidence >0.7 for clear intent
- Extract all relevant data (product names, locations, dates, quantities)
- "KFC, flowers, hotel" = 3 intents: [food, shopping, accommodation]
- "Same as last time" = conversational intent with context
- Empty message or unclear = [{"intent": "help", "confidence": 0.5}]
\`\`\``;

    const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800
        }
      })
    });

    if (!response.ok) throw new Error('Gemini API unreachable');

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\[[\s\S]*\]/);
    let intents = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : null;

    if (!intents) throw new Error('Invalid Gemini response');
    if (!Array.isArray(intents)) intents = [intents];

    return intents;

  } catch (error) {
    console.error('⚠️ Gemini Brain failing, activating Fallback Brain:', error.message);
    // 🔧 Log Self-Heal
    logSystemAlert({
      severity: 'info',
      source: 'worker',
      message: 'AI failure moment - auto-recovered via Fallback'
    }, env);
    // SELF-HEALING: Use keyword-based fallback if all AI models are down
    return fallbackIntentParser(messageText);
  }
}

async function detectIntentsOpenAI(messageText, memory, env) {
  const historyContext = memory?.recent_searches?.slice(0, 3).join(', ') || 'none';
  const lastOrder = memory?.last_order?.items?.map(i => i.name).join(', ') || 'none';

  const systemPrompt = `You are the brain of Zweepee, a South African WhatsApp concierge.
Detect ALL intents in the user message. Return a JSON object with an "intents" key containing an array.
Intents: shopping, food, accommodation, flights, car_rental, buses, airtime, electricity, cart_action, conversational, greeting, help.
Example: {"intents": [{"intent": "food", "confidence": 0.9, "extracted_data": {"product": "KFC"}}]}`;

  const userPrompt = `Message: "${messageText}"\nContext: Searches: ${historyContext}, Last order: ${lastOrder}`;

  const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  // JSON Mode guarantees valid JSON!
  const result = JSON.parse(content);
  return Array.isArray(result.intents) ? result.intents : [result];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MESSAGE ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

async function routeMessage(user, intents, messageText, mediaData, memory, supabase, env, ctx) {
  // Ensure we have at least one intent
  if (!intents || intents.length === 0) {
    intents = [{ intent: 'help', confidence: 0.1 }];
  }

  // Handle multiple intents (multi-product request)
  if (intents.length > 1) {
    return await handleMultiIntent(user, intents, memory, supabase, env, ctx);
  }

  const primaryIntent = intents[0];
  const intent = primaryIntent?.intent || 'help';
  const data = primaryIntent.extracted_data || {};

  // 📸 LOG MIRAGE (Journey Forensics)
  if (!['greeting', 'help', 'conversational', 'cart_action'].includes(intent)) {
    ctx.waitUntil(logSystemAlert({
      severity: 'info',
      source: 'mirage-router',
      message: 'Mirage triggered',
      context: { intent, data, userPhone: user.phone_number }
    }, env));
  }

  // Route to appropriate Mirage
  switch (intent) {
    case 'shopping':
      return await handleShopping(user, messageText, mediaData, data, memory, supabase, env);

    case 'food':
      return await handleFood(user, messageText, data, memory, supabase, env);

    case 'accommodation':
      return await handleAccommodation(user, messageText, data, memory, supabase, env);

    case 'flights':
      return await handleFlights(user, messageText, data, memory, supabase, env);

    case 'car_rental':
      return await handleCarRental(user, messageText, data, memory, supabase, env);

    case 'buses':
      return await handleBuses(user, messageText, data, memory, supabase, env);

    case 'airtime':
      return await handleAirtime(user, messageText, data, memory, supabase, env);

    case 'electricity':
      return await handleElectricity(user, messageText, data, memory, supabase, env);

    case 'cart_action':
      return await handleCartAction(user, messageText, data, memory, supabase, env, ctx);

    case 'conversational':
      return await handleConversational(user, messageText, data, memory, supabase, env);

    case 'greeting':
      return generateGreeting(user, memory);

    case 'help':
    default:
      return generateHelp(user, memory);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. MULTI-INTENT HANDLER (The Killer Feature)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleMultiIntent(user, intents, memory, supabase, env, ctx) {
  // User said: "KFC, flowers, hotel Cape Town"
  // We execute all Mirages in parallel, then show unified cart

  const results = await Promise.allSettled(
    intents.map(async (intent) => {
      const intentType = intent.intent;
      const data = intent.extracted_data || {};

      switch (intentType) {
        case 'food':
          return await getFoodQuickQuote(user, data, memory, env);
        case 'shopping':
          return await getShoppingQuickQuote(user, data, memory, env);
        case 'accommodation':
          return await getAccommodationQuickQuote(user, data, memory, env);
        case 'flights':
          return await getFlightsQuickQuote(user, data, memory, env);
        case 'car_rental':
          return await getCarRentalQuickQuote(user, data, memory, env);
        default:
          return null;
      }
    })
  );

  const items = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  if (items.length === 0) {
    return `I couldn't find what you're looking for. Try being more specific!`;
  }

  // Add all items to unified cart
  await addItemsToCart(user.id, items, supabase, env, ctx);

  // Generate unified cart preview
  return generateUnifiedCart(items, user, memory);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SHOPPING MIRAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleShopping(user, messageText, mediaData, extractedData, memory, supabase, env) {
  // Check for repeat order
  if (messageText.toLowerCase().includes('usual') || messageText.toLowerCase().includes('same as last')) {
    const lastOrder = memory?.last_order;
    if (lastOrder?.items?.some(i => i.mirage === 'shopping')) {
      const lastItem = lastOrder.items.find(i => i.mirage === 'shopping');
      return `🔄 *${lastItem.name}*\n\nLast time: R${lastItem.price} (${lastItem.retailer})\n\n[Order Again] or search for something else`;
    }
  }

  const query = extractedData.product || messageText.toLowerCase()
    .replace(/^(find|search|show|i need|want|buy|get)\s+/i, '')
    .trim();

  if (!query || query.length < 3) {
    return `🛍️ What are you looking for?\n\nTry: "iPhone" or "Nike shoes" or send a photo 📸`;
  }

  // Simulate product search (TODO: Real API integration)
  const products = await searchProducts(query, env);

  if (!products || products.length === 0) {
    return `🔍 No results for "${query}"\n\nTry:\n• Different spelling\n• Brand name\n• Send a photo 📸`;
  }

  // Send images for top 2 products
  for (const p of products.slice(0, 2)) {
    let caption = `🛍️ *${p.name}*\n`;
    caption += `${p.retailer} - R${p.price.toLocaleString()}\n`;
    caption += `📦 ${p.delivery}`;

    await sendWhatsAppImage(user.phone_number, p.image_url, caption, env);
  }

  return `Reply 1-2 to add to cart! 🛒`;
}

async function searchProducts(query, env) {
  const q = query.toLowerCase();

  // Specific mock for Dis-Chem / Pills
  if (q.includes('pill') || q.includes('headache') || q.includes('dischem') || q.includes('panado')) {
    return [
      {
        id: `prod_pill_1`,
        name: `Panado Tablets 24s`,
        mirage: 'shopping',
        retailer: 'Dis-Chem',
        price: 42,
        rating: 4.8,
        delivery: '1-2 hours',
        has_affiliate: true,
        concierge_fee: 5,
        image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500',
        url: 'https://dischem.co.za'
      }
    ];
  }

  // Mock product data - TODO: Replace with real Takealot/Makro API or scraping
  return [
    {
      id: `prod_${Date.now()}_1`,
      name: `${query} - Premium`,
      mirage: 'shopping',
      retailer: 'Takealot',
      price: 1299,
      original_price: 1499,
      rating: 4.5,
      reviews: 128,
      delivery: '2-3 days',
      has_affiliate: true,
      concierge_fee: 0,
      image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500',
      url: `https://takealot.com/search?q=${encodeURIComponent(query)}`
    }
  ];
}


async function getShoppingQuickQuote(user, data, memory, env) {
  const products = await searchProducts(data.product || 'gift', env);
  const item = products[0];

  if (item.image_url) {
    await sendWhatsAppImage(user.phone_number, item.image_url, `🛍️ *${item.name}*\n${item.retailer} - R${item.price}`, env);
  }

  return {
    id: item.id,
    mirage: 'shopping',
    name: item.name,
    retailer: item.retailer,
    price: item.price,
    concierge_fee: item.concierge_fee || 0,
    display: `🛍️ ${item.name}\n   ${item.retailer} - R${item.price}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FOOD MIRAGE (KFC, McDonald's, etc)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleFood(user, messageText, extractedData, memory, supabase, env) {
  const query = extractedData.product || messageText;

  // Check for repeat order
  if (messageText.toLowerCase().includes('usual')) {
    const lastFood = memory?.last_order?.items?.find(i => i.mirage === 'food');
    if (lastFood) {
      return `🍗 *Your usual?*\n\n${lastFood.name}\n${lastFood.restaurant} - R${lastFood.price}\nDelivered in ~${lastFood.delivery_time}\n\n[Yes] [Change Order]`;
    }
  }

  // Mock food options - TODO: Integrate with UberEats/Mr D API
  const foodOptions = await searchFood(query, memory?.last_delivery_address, env);

  if (!foodOptions || foodOptions.length === 0) {
    return `🍔 What would you like to eat?\n\nPopular:\n• KFC\n• McDonald's\n• Nando's\n• Pizza`;
  }

  // Send images for food options
  for (const f of foodOptions.slice(0, 2)) {
    let caption = `🍗 *${f.name}*\n`;
    caption += `${f.restaurant} - R${f.price}\n`;
    caption += `⏱️ ${f.delivery_time}`;

    await sendWhatsAppImage(user.phone_number, f.image_url, caption, env);
  }

  return `Reply 1-2 to order! 😋`;
}

async function searchFood(query, lastAddress, env) {
  const q = query.toLowerCase();
  const restaurant = q.includes('kfc') ? 'KFC' :
                     q.includes('mcd') ? 'McDonald\'s' : 'KFC';

  // Simulated menu database
  const menus = {
    'KFC': [
      { name: 'Streetwise 2', price: 45, image: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=500' },
      { name: '21-Piece Bucket', price: 189, image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500' },
      { name: 'Zinger Burger', price: 55, image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500' }
    ],
    'McDonald\'s': [
      { name: 'Big Mac Meal', price: 75, image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500' },
      { name: 'Quarter Pounder', price: 65, image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500' }
    ]
  };

  const options = menus[restaurant] || menus['KFC'];

  // Find specific item or default to the first one
  let matches = options.filter(item => q.includes(item.name.toLowerCase()));
  if (matches.length === 0) matches = [options[0]];

  return matches.map((item, i) => ({
    id: `food_${Date.now()}_${i}`,
    mirage: 'food',
    name: item.name,
    restaurant: restaurant,
    price: item.price,
    delivery_time: '35-45 min',
    delivery_address: lastAddress || 'Your location',
    concierge_fee: 10,
    image_url: item.image
  }));
}

async function getFoodQuickQuote(user, data, memory, env) {
  const food = await searchFood(data.product || 'KFC', memory?.last_delivery_address, env);
  const item = food[0];

  if (item.image_url) {
    await sendWhatsAppImage(user.phone_number, item.image_url, `🍗 *${item.name}*\n${item.restaurant} - R${item.price}`, env);
  }

  return {
    id: item.id,
    mirage: 'food',
    name: item.name,
    restaurant: item.restaurant,
    price: item.price,
    concierge_fee: item.concierge_fee,
    display: `🍗 ${item.name}\n   ${item.restaurant} - R${item.price}\n   ⏱️ ${item.delivery_time}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ACCOMMODATION MIRAGE (Hotels, Airbnb)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAccommodation(user, messageText, extractedData, memory, supabase, env) {
  const location = extractedData.location || 'Cape Town';
  const date = extractedData.date || 'tomorrow';
  const budget = extractedData.budget;

  // Mock accommodation search - TODO: Booking.com/Airbnb API
  let options = await searchAccommodation(location, date, env);

  // Apply budget filter if provided
  if (budget) {
    options = options.filter(h => h.price <= budget);
    if (options.length === 0) {
      return `🏨 I couldn't find anything in ${location} for under R${budget}. Would you like to see the closest options?`;
    }
  }

  // Send images for the top 2 options
  for (const h of options.slice(0, 2)) {
    let caption = `🏨 *${h.name}*\n`;
    caption += `R${h.price}/night ${'⭐'.repeat(Math.round(h.rating))} ${h.rating}\n`;
    caption += `via ${h.platform}\n`;
    if (h.features) caption += `${h.features.slice(0, 2).join(' • ')}`;

    await sendWhatsAppImage(user.phone_number, h.image_url, caption, env);
  }

  return `Reply 1-2 to book or ask for more details! ✨`;
}

async function searchAccommodation(location, date, env) {
  // Mock data - TODO: Real affiliate API
  return [
    {
      id: `hotel_${Date.now()}_1`,
      mirage: 'accommodation',
      name: 'Protea Hotel Sea Point',
      platform: 'Booking.com',
      price: 890,
      rating: 4.6,
      features: ['Ocean view', 'Free WiFi', 'Breakfast'],
      location: location,
      has_affiliate: true,
      concierge_fee: 0,
      image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500',
      url: `https://booking.com/search?location=${location}`
    },
    {
      id: `hotel_${Date.now()}_2`,
      mirage: 'accommodation',
      name: 'Airbnb Studio Apartment',
      platform: 'Airbnb',
      price: 650,
      rating: 4.9,
      features: ['Private balcony', 'Kitchen'],
      location: location,
      has_affiliate: true,
      concierge_fee: 0,
      image_url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=500',
      url: `https://airbnb.com/s/${location}`
    }
  ];
}

async function getAccommodationQuickQuote(user, data, memory, env) {
  const hotels = await searchAccommodation(data.location || 'Cape Town', data.date || 'tomorrow', env);
  const hotel = hotels[0];

  if (hotel.image_url) {
    await sendWhatsAppImage(user.phone_number, hotel.image_url, `🏨 *${hotel.name}*\n${hotel.platform} - R${hotel.price}/night`, env);
  }

  return {
    id: hotel.id,
    mirage: 'accommodation',
    name: hotel.name,
    platform: hotel.platform,
    price: hotel.price,
    concierge_fee: hotel.concierge_fee,
    display: `🏨 ${hotel.name}\n   ${hotel.platform} - R${hotel.price}/night\n   ⭐ ${hotel.rating}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. FLIGHTS MIRAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleFlights(user, messageText, extractedData, memory, supabase, env) {
  const from = extractedData.from || 'JNB';
  const to = extractedData.to || 'CPT';
  const date = extractedData.date || 'tomorrow';

  const flights = await searchFlights(from, to, date, env);

  let response = `✈️ *${from} → ${to} • ${date}*\n\n`;
  flights.slice(0, 3).forEach((f, i) => {
    response += `${i + 1}. ${f.airline} - R${f.price}\n`;
    response += `   ${f.departure} → ${f.arrival}\n`;
    response += `   ${f.duration} • ${f.stops}\n\n`;
  });

  response += `Reply 1-3 to book via ${flights[0]?.platform || 'TravelStart'}`;
  return response;
}

async function searchFlights(from, to, date, env) {
  // Mock data - TODO: TravelStart/FlySafair API
  return [
    {
      id: `flight_${Date.now()}_1`,
      mirage: 'flights',
      airline: 'FlySafair',
      from: from,
      to: to,
      price: 899,
      departure: '06:00',
      arrival: '08:15',
      duration: '2h 15m',
      stops: 'Direct',
      platform: 'TravelStart',
      has_affiliate: true,
      concierge_fee: 0,
      image_url: 'https://images.unsplash.com/photo-1436491865332-7a61a109c05d?w=500'
    }
  ];
}

async function getFlightsQuickQuote(user, data, memory, env) {
  const flights = await searchFlights(data.from || 'JNB', data.to || 'CPT', data.date || 'tomorrow', env);
  const flight = flights[0];

  if (flight.image_url) {
    await sendWhatsAppImage(user.phone_number, flight.image_url, `✈️ *${flight.airline} Flight*\n${flight.from} → ${flight.to} - R${flight.price}`, env);
  }

  return {
    id: flight.id,
    mirage: 'flights',
    name: `${flight.airline} ${flight.from}-${flight.to}`,
    platform: flight.platform,
    price: flight.price,
    concierge_fee: flight.concierge_fee,
    display: `✈️ ${flight.airline} ${flight.from}→${flight.to}\n   R${flight.price} • ${flight.departure}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. CAR RENTAL MIRAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCarRental(user, messageText, extractedData, memory, supabase, env) {
  const location = extractedData.location || 'Johannesburg';
  const date = extractedData.date || 'tomorrow';

  const cars = await searchCarRentals(location, date, env);

  let response = `🚗 *Car Rental • ${location} • ${date}*\n\n`;
  cars.slice(0, 3).forEach((c, i) => {
    response += `${i + 1}. ${c.name}\n`;
    response += `   R${c.price}/day via ${c.platform}\n`;
    response += `   ${c.features.join(' • ')}\n\n`;
  });

  response += `Reply 1-3 to book`;
  return response;
}

async function searchCarRentals(location, date, env) {
  // Mock data - TODO: Europcar/Around About Cars API
  return [
    {
      id: `car_${Date.now()}_1`,
      mirage: 'car_rental',
      name: 'VW Polo',
      platform: 'Europcar',
      price: 450,
      features: ['Automatic', 'GPS', 'Insurance'],
      location: location,
      has_affiliate: true,
      concierge_fee: 0,
      image_url: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=500'
    }
  ];
}

async function getCarRentalQuickQuote(user, data, memory, env) {
  const cars = await searchCarRentals(data.location || 'Johannesburg', data.date || 'tomorrow', env);
  const car = cars[0];

  if (car.image_url) {
    await sendWhatsAppImage(user.phone_number, car.image_url, `🚗 *${car.name}*\n${car.platform} - R${car.price}/day`, env);
  }

  return {
    id: car.id,
    mirage: 'car_rental',
    name: car.name,
    platform: car.platform,
    price: car.price,
    concierge_fee: car.concierge_fee,
    display: `🚗 ${car.name}\n   ${car.platform} - R${car.price}/day`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. BUSES MIRAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleBuses(user, messageText, extractedData, memory, supabase, env) {
  const from = extractedData.from || 'Johannesburg';
  const to = extractedData.to || 'Cape Town';
  const date = extractedData.date || 'tomorrow';

  const buses = await searchBuses(from, to, date, env);

  let response = `🚌 *${from} → ${to} • ${date}*\n\n`;
  buses.forEach((b, i) => {
    response += `${i + 1}. ${b.operator} - R${b.price}\n`;
    response += `   ${b.departure} → ${b.arrival} (${b.duration})\n\n`;
  });

  response += `Reply 1 to book`;
  return response;
}

async function searchBuses(from, to, date, env) {
  // Direct links - most bus companies don't have APIs
  return [
    {
      id: `bus_${Date.now()}_1`,
      mirage: 'buses',
      operator: 'Intercape',
      from: from,
      to: to,
      price: 450,
      departure: '08:00',
      arrival: '20:00',
      duration: '12h',
      url: `https://intercape.co.za/book?from=${from}&to=${to}`,
      concierge_fee: 15
    }
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. UTILITIES MIRAGES (Airtime & Electricity)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAirtime(user, messageText, extractedData, memory, supabase, env) {
  const amount = extractedData.quantity || 50;
  const network = extractedData.product || memory?.preferred_network || 'Vodacom';

  // Check for repeat
  if (messageText.toLowerCase().includes('usual')) {
    const lastAirtime = memory?.last_airtime_purchase;
    if (lastAirtime) {
      return `📱 *Your usual airtime?*\n\nR${lastAirtime.amount} ${lastAirtime.network}\n\n[Yes] [Change Amount]`;
    }
  }

  return `📱 *Airtime*\n\n` +
    `Network: ${network}\n` +
    `Amount: R${amount}\n\n` +
    `Total: R${amount}\n\n` +
    `[Buy Now] [Change Network]`;
}

async function handleElectricity(user, messageText, extractedData, memory, supabase, env) {
  const amount = extractedData.quantity || 100;
  const meter = memory?.electricity_meter || 'Not saved';

  return `⚡ *Prepaid Electricity*\n\n` +
    `Meter: ${meter}\n` +
    `Amount: R${amount}\n\n` +
    `Total: R${amount}\n\n` +
    `[Buy Now] [Save Meter Number]`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13. UNIFIED CART SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCartAction(user, messageText, extractedData, memory, supabase, env, ctx) {
  if (messageText.toLowerCase().includes('checkout') || messageText.toLowerCase().includes('pay')) {
    return await checkoutCart(user, supabase, env, ctx);
  }

  if (messageText.toLowerCase().includes('clear') || messageText.toLowerCase().includes('empty')) {
    await clearCart(user.id, supabase);
    return `🛒 Cart cleared!`;
  }

  return await viewCart(user, supabase);
}

async function addItemsToCart(userId, items, supabase, env, ctx) {
  try {
    const { data: cart } = await supabase
      .from('carts')
      .select('items')
      .eq('user_id', userId)
      .single();

    const existingItems = cart?.items || [];
    const newItems = [...existingItems, ...items];

    await supabase.from('carts').upsert([{
      user_id: userId,
      items: newItems,
      updated_at: new Date().toISOString()
    }], { onConflict: 'user_id' });

    // 🛒 LOG CART (Journey Forensics)
    if (ctx) {
      ctx.waitUntil(logSystemAlert({
        severity: 'info',
        source: 'cart-system',
        message: 'Cart updated',
        context: {
          userId,
          itemsAdded: items.map(i => ({ name: i.name || i.display, mirage: i.mirage })),
          totalItems: newItems.length
        }
      }, env));
    }

  } catch (error) {
    console.error('Add to cart error:', error);
  }
}

async function viewCart(user, supabase) {
  const { data: cart } = await supabase
    .from('carts')
    .select('items')
    .eq('user_id', user.id)
    .single();

  if (!cart?.items || cart.items.length === 0) {
    return `🛒 *Your cart is empty*\n\nStart shopping! 🔍`;
  }

  let response = `🛒 *Your Cart* (${cart.items.length} items)\n\n`;
  let total = 0;
  let fees = 0;

  cart.items.forEach((item, i) => {
    response += `${i + 1}. ${item.display || item.name}\n`;
    total += item.price;
    fees += item.concierge_fee || 0;
  });

  response += `\n───────────────\n`;
  response += `Subtotal: R${total}\n`;
  if (fees > 0) response += `Concierge Fee: R${fees}\n`;
  response += `*Total: R${total + fees}*\n\n`;
  response += `[Pay Now] [Clear Cart]`;

  return response;
}

function generateUnifiedCart(items, user, memory) {
  let response = `✨ *Ready to checkout*\n\n`;
  let total = 0;
  let fees = 0;

  items.forEach((item) => {
    response += `${item.display}\n`;
    total += item.price;
    fees += item.concierge_fee || 0;
  });

  response += `\n───────────────\n`;
  response += `Subtotal: R${total}\n`;
  if (fees > 0) response += `Concierge Fee: R${fees}\n`;
  response += `*Total: R${total + fees}*\n\n`;

  // Proactive suggestion
  const hasFood = items.some(i => i.mirage === 'food');
  const hasHotel = items.some(i => i.mirage === 'accommodation');
  const hasCar = items.some(i => i.mirage === 'car_rental');

  if (hasHotel && !hasCar) {
    response += `💡 Need a car rental?\n\n`;
  }

  response += `[Pay R${total + fees} Now] [Add More]`;

  return response;
}

async function checkoutCart(user, supabase, env, ctx) {
  const { data: cart } = await supabase
    .from('carts')
    .select('items')
    .eq('user_id', user.id)
    .single();

  if (!cart?.items || cart.items.length === 0) {
    return `Cart is empty! Start shopping 🔍`;
  }

  const items = cart.items;
  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const fees = items.reduce((sum, i) => sum + (i.concierge_fee || 0), 0);
  const total = subtotal + fees;

  // Generate PayFast payment link with split configuration
  const paymentUrl = await generatePayFastLink(user, items, total, env);

  // 💳 LOG PAYMENT INITIATED (Journey Forensics)
  if (ctx) {
    ctx.waitUntil(logSystemAlert({
      severity: 'info',
      source: 'payment-system',
      message: 'Checkout initiated',
      context: {
        userId: user.id,
        total,
        items: items.map(i => ({ name: i.name || i.display, mirage: i.mirage }))
      }
    }, env));
  }

  let response = `💳 *Secure Checkout*\n\n`;

  // Group by mirage/retailer
  const grouped = groupItemsByProvider(items);
  Object.keys(grouped).forEach(provider => {
    response += `*${provider}*\n`;
    grouped[provider].forEach(item => {
      response += `• ${item.name || item.display}\n`;
    });
    response += `\n`;
  });

  response += `───────────────\n`;
  response += `Items: R${subtotal}\n`;
  if (fees > 0) response += `Concierge Fee: R${fees}\n`;
  response += `*Total: R${total}*\n\n`;
  response += `🔒 Pay securely via PayFast:\n${paymentUrl}\n\n`;
  response += `✨ *Zero Friction Concierge Service*\n`;
  response += `✅ Instant confirmation\n`;
  response += `📦 Track everything right here in chat`;

  return response;
}

function groupItemsByProvider(items) {
  const grouped = {};
  items.forEach(item => {
    const provider = item.retailer || item.restaurant || item.platform || 'Other';
    if (!grouped[provider]) grouped[provider] = [];
    grouped[provider].push(item);
  });
  return grouped;
}

async function generatePayFastLink(user, items, total, env) {
  // TODO: Implement real PayFast API with split payments
  // For now, return mock link
  const orderId = `ZWP_${Date.now()}_${user.id.substring(0, 8)}`;
  return `https://payfast.co.za/pay/${orderId}`;
}

async function clearCart(userId, supabase) {
  await supabase
    .from('carts')
    .update({ items: [] })
    .eq('user_id', userId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 14. CONVERSATIONAL HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

async function handleConversational(user, messageText, extractedData, memory, supabase, env) {
  const text = messageText.toLowerCase();

  if (text.includes('cheaper') || text.includes('budget')) {
    return `💰 Looking for better prices...\n\nWhat are you shopping for?`;
  }

  if (text.includes('compare')) {
    return `⚖️ I can compare prices across all stores.\n\nWhat product?`;
  }

  if (text.includes('same') || text.includes('usual') || text.includes('repeat')) {
    const lastOrder = memory?.last_order;
    if (lastOrder) {
      return `🔄 *Repeat last order?*\n\nTotal: R${lastOrder.total}\n\n[Yes] [View Details]`;
    }
    return `No previous orders found. What would you like?`;
  }

  return generateHelp(user, memory);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 15. GREETINGS & HELP
// ═══════════════════════════════════════════════════════════════════════════════

function generateGreeting(user, memory) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  let response = `${greeting}! 👋\n\n`;

  if (memory?.last_order) {
    response += `Want to repeat your last order?\n\n`;
  }

  response += `I can help with:\n`;
  response += `🛍️ Shopping\n`;
  response += `🍗 Food delivery\n`;
  response += `🏨 Hotels & Airbnb\n`;
  response += `✈️ Flights & car rentals\n`;
  response += `📱 Airtime & electricity\n\n`;
  response += `Try: "KFC, flowers, hotel" in one message!`;

  return response;
}

function generateHelp(user, memory) {
  return `✨ *Zweepee - Your AI Magic Concierge*\n\n` +
    `I bring the world to your chat. No apps, no redirects, just magic.\n\n` +
    `I can help with:\n\n` +
    `🛍️ *Shopping*\n"Find iPhone" or send photo\n\n` +
    `🍗 *Food Delivery*\n"KFC bucket" or "Pizza"\n\n` +
    `🏨 *Accommodation*\n"Hotel Cape Town tomorrow"\n\n` +
    `✈️ *Travel*\n"Flights to Durban" or "Rent a car"\n\n` +
    `📱 *Utilities*\n"R50 airtime" or "R100 electricity"\n\n` +
    `💡 *Pro tip:* Combine requests!\n"KFC, flowers, hotel Cape Town" = one cart, one payment\n\n` +
    `What do you need?`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 16. USER MANAGEMENT & MEMORY
// ═══════════════════════════════════════════════════════════════════════════════

async function getOrCreateUser(phoneNumber, supabase) {
  try {
    // Check database
    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (existing) return existing;
    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Supabase fetch error:', fetchError);
    }

    // Create new user
    const referralCode = crypto.randomUUID().substring(0, 8).toUpperCase();

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        phone_number: phoneNumber,
        referral_code: referralCode,
        preferences: {
          ux_mode: 'balanced',
          language: 'en'
        }
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      throw new Error(insertError.message);
    }

    return newUser;

  } catch (error) {
    console.error('User creation error:', error);
    // Return minimal user object on error
    return {
      id: phoneNumber, // Fallback to phone number as ID if DB fails
      phone_number: phoneNumber,
      preferences: { ux_mode: 'balanced' }
    };
  }
}

async function getUserMemory(userId, supabase) {
  try {
    // Get recent orders
    const { data: orders } = await supabase
      .from('orders')
      .select('items, total_amount, created_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5);

    // Get preferences
    const { data: user } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single();

    // Get recent searches from sessions
    const { data: sessions } = await supabase
      .from('sessions')
      .select('state')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(5);

    const recentSearches = sessions?.map(s => s.state?.query).filter(Boolean) || [];

    return {
      last_order: orders?.[0] || null,
      recent_orders: orders || [],
      recent_searches: recentSearches,
      preferences: user?.preferences || { ux_mode: 'balanced' },
      last_delivery_address: orders?.[0]?.delivery_address || null,
      preferred_network: user?.preferences?.preferred_network || null,
      electricity_meter: user?.preferences?.electricity_meter || null
    };

  } catch (error) {
    console.error('Memory fetch error:', error);
    return {
      preferences: { ux_mode: 'balanced' }
    };
  }
}

async function saveChatMessage(userId, role, content, supabase) {
  try {
    await supabase.from('chat_history').insert([{
      user_id: userId,
      role: role,
      content: content,
      timestamp: new Date().toISOString()
    }]);
  } catch (error) {
    console.error('Chat save error:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 17. WHAPI INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

async function sendWhatsAppMessage(to, text, env) {
  try {
    const cleanPhone = to.replace('@c.us', '');

    const response = await fetchWithRetry('https://gate.whapi.cloud/messages/text', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WHAPI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        typing_time: 0,
        to: cleanPhone,
        body: text
      })
    });

    if (!response.ok) {
      console.error('Whapi send error:', await response.text());
    } else {
      console.log('✅ Sent to', cleanPhone);
    }

  } catch (error) {
    console.error('❌ Send error:', error);
  }
}

async function sendWhatsAppImage(to, imageUrl, caption, env) {
  try {
    const cleanPhone = to.replace('@c.us', '');

    const response = await fetchWithRetry('https://gate.whapi.cloud/messages/image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WHAPI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: cleanPhone,
        media: imageUrl,
        caption: caption
      })
    });

    if (!response.ok) {
      console.error('Whapi image send error:', await response.text());
    }
  } catch (error) {
    console.error('❌ Image send error:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 18. SELF-HEALING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
  try {
    const response = await fetch(url, options);
    if (!response.ok && retries > 0 && response.status >= 500) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying fetch to ${url}... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

function fallbackIntentParser(messageText) {
  const text = messageText.toLowerCase();
  const intents = [];

  const patterns = {
    shopping: ['buy', 'search', 'find', 'iphone', 'nike', 'dischem', 'pill', 'panado'],
    food: ['eat', 'hungry', 'kfc', 'mcdonald', 'burger', 'pizza', 'streetwise'],
    accommodation: ['hotel', 'airbnb', 'stay', 'cpt', 'cape town', 'durban', 'dbn'],
    flights: ['flight', 'fly', 'plane', 'travel'],
    car_rental: ['car', 'rent', 'polo'],
    airtime: ['airtime', 'data', 'vodacom', 'mtn'],
    electricity: ['electricity', 'meter', 'power'],
    cart_action: ['cart', 'checkout', 'pay', 'clear']
  };

  for (const [intent, keywords] of Object.entries(patterns)) {
    if (keywords.some(k => text.includes(k))) {
      intents.push({
        intent,
        confidence: 0.8,
        extracted_data: { product: messageText } // Best effort
      });
    }
  }

  return intents.length > 0 ? intents : [{ intent: 'help', confidence: 0.5 }];
}

// ═══════════════════════════════════════════════════════════════════════════════
// END OF ZWEEPEE WORKER
// ═══════════════════════════════════════════════════════════════════════════════
