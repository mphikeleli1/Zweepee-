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

    // Detect intent(s) - pass ctx for background logging
    const intents = await detectIntents(messageText, memory, env, ctx);

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
    await whapiRes.text(); // Read to avoid stalled warning

    // Also check settings to see webhook URL
    const settingsRes = await fetch('https://gate.whapi.cloud/settings', {
      headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}` }
    });
    const settingsData = await settingsRes.json();

    results.services.whapi = whapiRes.ok ? 'Healthy' : 'Unreachable';
    results.services.whapi_webhook = settingsData.webhooks?.[0]?.url || 'Not Configured';
    results.services.whapi_settings = settingsRes.ok ? 'Accessed' : `Error: ${settingsData.error || 'Unknown'}`;
  } catch (e) {
    results.services.whapi = `Fatal: ${e.message}`;
  }

  // 3. Check Inbound Logs (Black Box)
  try {
    const { count, error } = await supabase
      .from('system_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'whapi-webhook');
    results.services.inbound_logs = error ? `Error: ${error.message}` : `${count} messages logged`;
  } catch (e) {
    results.services.inbound_logs = `Fatal: ${e.message}`;
  }

  // 4. Check Gemini
  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
    });
    await geminiRes.text(); // Read to avoid stalled warning
    results.services.gemini = geminiRes.ok ? 'Healthy' : 'Invalid API Key or Quota Exceeded (Limit 0)';
  } catch (e) {
    results.services.gemini = `Fatal: ${e.message}`;
  }

  // 5. Check OpenAI
  try {
    if (env.OPENAI_API_KEY) {
      const openaiRes = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` }
      });
      await openaiRes.text(); // Read to avoid stalled warning
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
// 3. MULTI-BRAIN INTENT PARSER
// ═══════════════════════════════════════════════════════════════════════════════

async function detectIntents(messageText, memory, env, ctx) {
  // 1. Try OpenAI First (Primary Brain)
  if (env.OPENAI_API_KEY) {
    try {
      console.log('🧠 Activating OpenAI Brain...');
      return await detectIntentsOpenAI(messageText, memory, env);
    } catch (e) {
      console.error('⚠️ OpenAI Brain glitched:', e.message);
      if (ctx) {
        ctx.waitUntil(logSystemAlert({
          severity: 'info',
          source: 'worker',
          message: `OpenAI moment: ${e.message.substring(0, 100)}`
        }, env));
      }
    }
  }

  // 2. Try Gemini (Secondary Brain)
  try {
    console.log('🧠 Activating Gemini Brain...');
    const historyContext = memory?.recent_searches?.slice(0, 3).join(', ') || 'none';
    const lastOrder = memory?.last_order?.items?.map(i => i.name).join(', ') || 'none';

    const prompt = `Analyze this WhatsApp message and detect ALL intents.
Message: "${messageText}"
User context: Searches: ${historyContext}, Last order: ${lastOrder}

Available intents: shopping, food, accommodation, flights, car_rental, buses, airtime, electricity, cart_action, conversational, greeting, help.

Return ONLY valid JSON array:
[{"intent": "intent_name", "confidence": 0.9, "extracted_data": {"product": "...", "location": "..."}}]`;

    const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
      })
    });

    if (!response.ok) {
      await response.text(); // Clear stalled response
      throw new Error('Gemini API unreachable');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\[[\s\S]*\]/);
    let intents = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : null;

    if (!intents) throw new Error('Invalid Gemini response');
    if (!Array.isArray(intents)) intents = [intents];

    return intents;

  } catch (error) {
    console.error('⚠️ Gemini Brain failing, activating Fallback Brain:', error.message);
    if (ctx) {
      ctx.waitUntil(logSystemAlert({
        severity: 'info',
        source: 'worker',
        message: 'AI failure - using Fallback Parser'
      }, env));
    }
    return fallbackIntentParser(messageText);
  }
}

async function detectIntentsOpenAI(messageText, memory, env) {
  const historyContext = memory?.recent_searches?.slice(0, 3).join(', ') || 'none';
  const lastOrder = memory?.last_order?.items?.map(i => i.name).join(', ') || 'none';

  const systemPrompt = `You are the brain of Zweepee, a South African WhatsApp concierge.
Detect ALL intents in the user message. Return a JSON object with an "intents" key containing an array.
Intents: shopping, food, accommodation, flights, car_rental, buses, airtime, electricity, cart_action, conversational, greeting, help.`;

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
  const result = JSON.parse(content);
  return Array.isArray(result.intents) ? result.intents : [result];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MESSAGE ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

async function routeMessage(user, intents, messageText, mediaData, memory, supabase, env, ctx) {
  if (!intents || intents.length === 0) {
    intents = [{ intent: 'help', confidence: 0.1 }];
  }

  if (intents.length > 1) {
    return await handleMultiIntent(user, intents, memory, supabase, env, ctx);
  }

  const primaryIntent = intents[0];
  const intent = primaryIntent?.intent || 'help';
  const data = primaryIntent.extracted_data || {};

  if (!['greeting', 'help', 'conversational', 'cart_action'].includes(intent)) {
    ctx.waitUntil(logSystemAlert({
      severity: 'info',
      source: 'mirage-router',
      message: 'Mirage triggered',
      context: { intent, data, userPhone: user.phone_number }
    }, env));
  }

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
// 5. MULTI-INTENT HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

async function handleMultiIntent(user, intents, memory, supabase, env, ctx) {
  const results = await Promise.allSettled(
    intents.map(async (intent) => {
      const intentType = intent.intent;
      const data = intent.extracted_data || {};

      switch (intentType) {
        case 'food': return await getFoodQuickQuote(user, data, memory, env);
        case 'shopping': return await getShoppingQuickQuote(user, data, memory, env);
        case 'accommodation': return await getAccommodationQuickQuote(user, data, memory, env);
        case 'flights': return await getFlightsQuickQuote(user, data, memory, env);
        case 'car_rental': return await getCarRentalQuickQuote(user, data, memory, env);
        default: return null;
      }
    })
  );

  const items = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  if (items.length === 0) {
    return `I couldn't find what you're looking for. Try being more specific!`;
  }

  await addItemsToCart(user.id, items, supabase, env, ctx);
  return generateUnifiedCart(items, user, memory);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SHOPPING MIRAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleShopping(user, messageText, mediaData, extractedData, memory, supabase, env) {
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

  const products = await searchProducts(query, env);

  if (!products || products.length === 0) {
    return `🔍 No results for "${query}"\n\nTry:\n• Different spelling\n• Brand name\n• Send a photo 📸`;
  }

  for (const p of products.slice(0, 2)) {
    let caption = `🛍️ *${p.name}*\n${p.retailer} - R${p.price.toLocaleString()}\n📦 ${p.delivery}`;
    await sendWhatsAppImage(user.phone_number, p.image_url, caption, env);
  }

  return `Reply 1-2 to add to cart! 🛒`;
}

async function searchProducts(query, env) {
  const q = query.toLowerCase();
  if (q.includes('pill') || q.includes('headache') || q.includes('dischem') || q.includes('panado')) {
    return [{
      id: `prod_pill_1`,
      name: `Panado Tablets 24s`,
      mirage: 'shopping',
      retailer: 'Dis-Chem',
      price: 42,
      delivery: '1-2 hours',
      image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500'
    }];
  }

  return [{
    id: `prod_${Date.now()}_1`,
    name: `${query} - Premium`,
    mirage: 'shopping',
    retailer: 'Takealot',
    price: 1299,
    delivery: '2-3 days',
    image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500'
  }];
}

async function getShoppingQuickQuote(user, data, memory, env) {
  const products = await searchProducts(data.product || 'gift', env);
  const item = products[0];
  if (item.image_url) await sendWhatsAppImage(user.phone_number, item.image_url, `🛍️ *${item.name}*\n${item.retailer} - R${item.price}`, env);
  return {
    id: item.id, mirage: 'shopping', name: item.name, retailer: item.retailer,
    price: item.price, concierge_fee: 5, display: `🛍️ ${item.name}\n   ${item.retailer} - R${item.price}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FOOD MIRAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleFood(user, messageText, extractedData, memory, supabase, env) {
  const query = extractedData.product || messageText;
  if (messageText.toLowerCase().includes('usual')) {
    const lastFood = memory?.last_order?.items?.find(i => i.mirage === 'food');
    if (lastFood) return `🍗 *Your usual?*\n\n${lastFood.name}\n${lastFood.restaurant} - R${lastFood.price}\nDelivered in ~${lastFood.delivery_time}\n\n[Yes] [Change Order]`;
  }

  const foodOptions = await searchFood(query, memory?.last_delivery_address, env);
  if (!foodOptions || foodOptions.length === 0) return `🍔 What would you like to eat?\n\nPopular:\n• KFC\n• McDonald's\n• Nando's`;

  for (const f of foodOptions.slice(0, 2)) {
    let caption = `🍗 *${f.name}*\n${f.restaurant} - R${f.price}\n⏱️ ${f.delivery_time}`;
    await sendWhatsAppImage(user.phone_number, f.image_url, caption, env);
  }
  return `Reply 1-2 to order! 😋`;
}

async function searchFood(query, lastAddress, env) {
  const q = query.toLowerCase();
  const restaurant = q.includes('kfc') ? 'KFC' : q.includes('mcd') ? 'McDonald\'s' : 'KFC';
  const options = [
    { name: 'Streetwise 2', price: 45, image: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=500' },
    { name: 'Zinger Burger', price: 55, image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500' }
  ];
  return options.map((item, i) => ({
    id: `food_${Date.now()}_${i}`, mirage: 'food', name: item.name, restaurant: restaurant,
    price: item.price, delivery_time: '35-45 min', concierge_fee: 10, image_url: item.image
  }));
}

async function getFoodQuickQuote(user, data, memory, env) {
  const food = await searchFood(data.product || 'KFC', memory?.last_delivery_address, env);
  const item = food[0];
  if (item.image_url) await sendWhatsAppImage(user.phone_number, item.image_url, `🍗 *${item.name}*\n${item.restaurant} - R${item.price}`, env);
  return {
    id: item.id, mirage: 'food', name: item.name, restaurant: item.restaurant,
    price: item.price, concierge_fee: 10, display: `🍗 ${item.name}\n   ${item.restaurant} - R${item.price}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ACCOMMODATION MIRAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAccommodation(user, messageText, extractedData, memory, supabase, env) {
  const location = extractedData.location || 'Cape Town';
  const date = extractedData.date || 'tomorrow';
  let options = await searchAccommodation(location, date, env);
  if (extractedData.budget) options = options.filter(h => h.price <= extractedData.budget);
  if (options.length === 0) return `🏨 No options found for your budget in ${location}.`;

  for (const h of options.slice(0, 2)) {
    let caption = `🏨 *${h.name}*\nR${h.price}/night ${'⭐'.repeat(Math.round(h.rating))}\nvia ${h.platform}`;
    await sendWhatsAppImage(user.phone_number, h.image_url, caption, env);
  }
  return `Reply 1-2 to book! ✨`;
}

async function searchAccommodation(location, date, env) {
  return [
    {
      id: `hotel_1`, mirage: 'accommodation', name: 'Protea Hotel Sea Point', platform: 'Booking.com',
      price: 890, rating: 4.6, image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500'
    }
  ];
}

async function getAccommodationQuickQuote(user, data, memory, env) {
  const hotels = await searchAccommodation(data.location || 'Cape Town', data.date || 'tomorrow', env);
  const hotel = hotels[0];
  if (hotel.image_url) await sendWhatsAppImage(user.phone_number, hotel.image_url, `🏨 *${hotel.name}*\n${hotel.platform} - R${hotel.price}/night`, env);
  return {
    id: hotel.id, mirage: 'accommodation', name: hotel.name, price: hotel.price,
    concierge_fee: 0, display: `🏨 ${hotel.name}\n   R${hotel.price}/night`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. FLIGHTS MIRAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleFlights(user, messageText, extractedData, memory, supabase, env) {
  const from = extractedData.from || 'JNB', to = extractedData.to || 'CPT';
  const flights = await searchFlights(from, to, extractedData.date || 'tomorrow', env);
  let resp = `✈️ *${from} → ${to}*\n\n`;
  flights.slice(0, 3).forEach((f, i) => resp += `${i + 1}. ${f.airline} - R${f.price}\n   ${f.departure} → ${f.arrival}\n\n`);
  return resp + `Reply 1-3 to book!`;
}

async function searchFlights(from, to, date, env) {
  return [{
    id: `flight_1`, mirage: 'flights', airline: 'FlySafair', from, to, price: 899,
    departure: '06:00', arrival: '08:15', platform: 'TravelStart', image_url: 'https://images.unsplash.com/photo-1436491865332-7a61a109c05d?w=500'
  }];
}

async function getFlightsQuickQuote(user, data, memory, env) {
  const flights = await searchFlights(data.from || 'JNB', data.to || 'CPT', data.date || 'tomorrow', env);
  const flight = flights[0];
  return {
    id: flight.id, mirage: 'flights', name: `${flight.airline} ${flight.from}-${flight.to}`,
    price: flight.price, concierge_fee: 0, display: `✈️ ${flight.airline} R${flight.price}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. CAR RENTAL MIRAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCarRental(user, messageText, extractedData, memory, supabase, env) {
  const cars = await searchCarRentals(extractedData.location || 'JNB', extractedData.date || 'tomorrow', env);
  let resp = `🚗 *Car Rental*\n\n`;
  cars.slice(0, 3).forEach((c, i) => resp += `${i + 1}. ${c.name} - R${c.price}/day\n   via ${c.platform}\n\n`);
  return resp + `Reply 1-3 to book!`;
}

async function searchCarRentals(location, date, env) {
  return [{
    id: `car_1`, mirage: 'car_rental', name: 'VW Polo', platform: 'Europcar', price: 450,
    image_url: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=500'
  }];
}

async function getCarRentalQuickQuote(user, data, memory, env) {
  const cars = await searchCarRentals(data.location || 'JNB', data.date || 'tomorrow', env);
  const car = cars[0];
  return {
    id: car.id, mirage: 'car_rental', name: car.name, price: car.price,
    concierge_fee: 0, display: `🚗 ${car.name} R${car.price}/day`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. BUSES MIRAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleBuses(user, messageText, extractedData, memory, supabase, env) {
  const buses = await searchBuses(extractedData.from || 'JNB', extractedData.to || 'CPT', extractedData.date || 'tomorrow', env);
  let resp = `🚌 *Buses*\n\n`;
  buses.forEach((b, i) => resp += `${i + 1}. ${b.operator} - R${b.price}\n   ${b.departure} → ${b.arrival}\n\n`);
  return resp + `Reply 1 to book!`;
}

async function searchBuses(from, to, date, env) {
  return [{ id: `bus_1`, mirage: 'buses', operator: 'Intercape', from, to, price: 450, departure: '08:00', arrival: '20:00' }];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAirtime(user, messageText, extractedData, memory, supabase, env) {
  const amount = extractedData.quantity || 50;
  const network = extractedData.product || memory?.preferred_network || 'Vodacom';
  return `📱 *Airtime*\n\nNetwork: ${network}\nAmount: R${amount}\n\n[Buy Now]`;
}

async function handleElectricity(user, messageText, extractedData, memory, supabase, env) {
  const amount = extractedData.quantity || 100;
  return `⚡ *Prepaid Electricity*\n\nMeter: ${memory?.electricity_meter || 'Not saved'}\nAmount: R${amount}\n\n[Buy Now]`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13. CART SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCartAction(user, messageText, extractedData, memory, supabase, env, ctx) {
  if (messageText.toLowerCase().includes('pay')) return await checkoutCart(user, supabase, env, ctx);
  if (messageText.toLowerCase().includes('clear')) { await clearCart(user.id, supabase); return `🛒 Cart cleared!`; }
  return await viewCart(user, supabase);
}

async function addItemsToCart(userId, items, supabase, env, ctx) {
  try {
    const { data: cart } = await supabase.from('carts').select('items').eq('user_id', userId).single();
    const newItems = [...(cart?.items || []), ...items];
    await supabase.from('carts').upsert([{ user_id: userId, items: newItems, updated_at: new Date().toISOString() }], { onConflict: 'user_id' });
  } catch (e) { console.error('Cart error:', e); }
}

async function viewCart(user, supabase) {
  const { data: cart } = await supabase.from('carts').select('items').eq('user_id', user.id).single();
  if (!cart?.items?.length) return `🛒 *Your cart is empty*`;
  let resp = `🛒 *Your Cart*\n\n`, total = 0;
  cart.items.forEach((item, i) => { resp += `${i + 1}. ${item.display}\n`; total += item.price + (item.concierge_fee || 0); });
  return resp + `\n*Total: R${total}*\n\n[Pay Now]`;
}

function generateUnifiedCart(items, user, memory) {
  let resp = `✨ *Ready to checkout*\n\n`, total = 0;
  items.forEach(item => { resp += `${item.display}\n`; total += item.price + (item.concierge_fee || 0); });
  return resp + `\n*Total: R${total}*\n\n[Pay R${total} Now]`;
}

async function checkoutCart(user, supabase, env, ctx) {
  const { data: cart } = await supabase.from('carts').select('items').eq('user_id', user.id).single();
  if (!cart?.items?.length) return `Cart is empty!`;
  const total = cart.items.reduce((sum, i) => sum + i.price + (i.concierge_fee || 0), 0);
  const paymentUrl = `https://payfast.co.za/pay/ZWP_${Date.now()}`;
  return `💳 *Secure Checkout*\n\nTotal: R${total}\n\nPay via PayFast:\n${paymentUrl}`;
}

async function clearCart(userId, supabase) { await supabase.from('carts').update({ items: [] }).eq('user_id', userId); }

// ═══════════════════════════════════════════════════════════════════════════════
// 14. CONVERSATIONAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handleConversational(user, messageText, extractedData, memory, supabase, env) {
  if (messageText.toLowerCase().includes('usual')) {
    const last = memory?.last_order;
    if (last) return `🔄 *Repeat last order?*\n\nTotal: R${last.total_amount}\n\n[Yes]`;
  }
  return generateHelp(user, memory);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 15. GREETINGS & HELP
// ═══════════════════════════════════════════════════════════════════════════════

function generateGreeting(user, memory) {
  return `Hi! 👋 I'm Zweepee, your AI concierge.\n\nI can help with:\n🛍️ Shopping\n🍗 Food\n🏨 Hotels\n✈️ Flights\n📱 Airtime\n\nWhat do you need?`;
}

function generateHelp(user, memory) {
  return `✨ *Zweepee Help*\n\nTry:\n"Find iPhone"\n"KFC bucket"\n"Hotel Cape Town"\n"R50 airtime"\n\nYou can even combine them!\n"KFC and flowers"`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 16. USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function getOrCreateUser(phoneNumber, supabase) {
  const { data: existing } = await supabase.from('users').select('*').eq('phone_number', phoneNumber).single();
  if (existing) return existing;
  const { data: newUser } = await supabase.from('users').insert([{ phone_number: phoneNumber, referral_code: Math.random().toString(36).substring(7).toUpperCase() }]).select().single();
  return newUser || { id: phoneNumber, phone_number: phoneNumber };
}

async function getUserMemory(userId, supabase) {
  const { data: orders } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
  return { last_order: orders?.[0] || null };
}

async function saveChatMessage(userId, role, content, supabase) {
  try { await supabase.from('chat_history').insert([{ user_id: userId, role, content }]); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// 17. WHAPI
// ═══════════════════════════════════════════════════════════════════════════════

async function sendWhatsAppMessage(to, text, env) {
  const res = await fetchWithRetry('https://gate.whapi.cloud/messages/text', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: to.replace('@c.us', ''), body: text })
  });
  if (res) await res.text(); // Clear stalled response
}

async function sendWhatsAppImage(to, imageUrl, caption, env) {
  const res = await fetchWithRetry('https://gate.whapi.cloud/messages/image', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.WHAPI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: to.replace('@c.us', ''), media: imageUrl, caption: caption })
  });
  if (res) await res.text(); // Clear stalled response
}

// ═══════════════════════════════════════════════════════════════════════════════
// 18. UTILS
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      // If not OK, read body to avoid stalling next retry
      await res.text();
    } catch (e) { if (i === retries) throw e; }
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
  }
}

function fallbackIntentParser(text) {
  const t = text.toLowerCase();
  const intents = [];
  if (t.includes('buy') || t.includes('find')) intents.push({ intent: 'shopping', confidence: 0.8 });
  if (t.includes('kfc') || t.includes('eat')) intents.push({ intent: 'food', confidence: 0.8 });
  if (t.includes('hotel')) intents.push({ intent: 'accommodation', confidence: 0.8 });
  if (t.includes('flight')) intents.push({ intent: 'flights', confidence: 0.8 });
  if (t.includes('pay') || t.includes('cart')) intents.push({ intent: 'cart_action', confidence: 0.8 });
  return intents.length ? intents : [{ intent: 'help', confidence: 0.5 }];
}
