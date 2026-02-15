// ═══════════════════════════════════════════════════════════════════════════════
// MR EVERYTHING - Baileys-Powered Autonomous WhatsApp Concierge
// ═══════════════════════════════════════════════════════════════════════════════

import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import http from 'http';

dotenv.config();

const logger = pino({ level: 'info' });

// ═══════════════════════════════════════════════════════════════════════════════
// SENTIENT SENTRY (NODE PORT)
// ═══════════════════════════════════════════════════════════════════════════════

class SentientSentry {
    constructor() {
        this.startTime = Date.now();
    }

    async performScan(sock) {
        const results = {
            infrastructure: this.checkInfra(),
            database: await this.checkDB(),
            ai: await this.checkAI(),
            whatsapp: sock?.user ? 'healthy' : 'disconnected'
        };

        const healthy = Object.values(results).every(v => v === 'healthy' || (v && v.status === 'healthy'));
        return { status: healthy ? 'healthy' : 'degraded', layers: results, timestamp: new Date().toISOString() };
    }

    checkInfra() {
        const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'OPENAI_API_KEY'];
        const missing = required.filter(k => !process.env[k]);
        return missing.length === 0 ? 'healthy' : `missing: ${missing.join(',')}`;
    }

    async checkDB() {
        try {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
            const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
            return error ? 'degraded' : 'healthy';
        } catch (e) { return 'offline'; }
    }

    async checkAI() {
        try {
            const res = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` } });
            return res.ok ? 'healthy' : 'degraded';
        } catch (e) { return 'unreachable'; }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH SERVER (MINIMAL)
// ═══════════════════════════════════════════════════════════════════════════════

function startHealthServer(sentry, sock) {
    http.createServer(async (req, res) => {
        if (req.url === '/health') {
            const scan = await sentry.performScan(sock);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(scan));
        } else {
            res.writeHead(404);
            res.end();
        }
    }).listen(process.env.PORT || 8080);
    console.log(`Health server running on port ${process.env.PORT || 8080}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS & FORENSICS (PORTED)
// ═══════════════════════════════════════════════════════════════════════════════

async function logForensicEvent(type, userPhone, intent, context) {
    try {
        if (!process.env.SUPABASE_URL) return;
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { error } = await supabase.from('forensic_logs').insert([{
            event_type: type,
            user_phone: userPhone,
            intent,
            context: context || {}
        }]);
        if (error) console.warn(`[FORENSIC] DB Insert Error: ${error.message}`);
    } catch (e) {
        console.error(`[FORENSIC] Fatal Error: ${e.message}`);
    }
}

async function logSystemAlert(alert) {
    try {
        if (!process.env.SUPABASE_URL) return;
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { error } = await supabase.from('system_alerts').insert([alert]);
        if (error) console.warn(`[ALERT] DB Insert Error: ${error.message}`);
    } catch (e) {
        console.error(`[ALERT] Fatal Error: ${e.message}`);
    }
}

async function granularMonitor(blockName, fn) {
    const start = Date.now();
    try {
        const result = await fn();
        return result;
    } catch (error) {
        const duration = Date.now() - start;
        console.error(`[MONITOR] FAULT in ${blockName} after ${duration}ms: ${error.message}`);
        await logSystemAlert({
            severity: 'error',
            source: `monitor-${blockName}`,
            message: error.message,
            stack_trace: error.stack,
            context: { duration_ms: duration }
        });
        throw error;
    }
}

async function fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 10000) {
    return await granularMonitor(`fetch:${new URL(url).hostname}`, async () => {
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
            } catch (e) {
                clearTimeout(timeoutId);
                lastError = e;
            }
            if (i < retries) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
        throw lastError || new Error(`Fetch failed for ${url}`);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BRAIN & USER MGMT (PORTED)
// ═══════════════════════════════════════════════════════════════════════════════

async function getOrCreateUser(phone) {
    return await granularMonitor('getOrCreateUser', async () => {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { data, error } = await supabase.from('users').select('*').eq('phone_number', phone).maybeSingle();
        if (data) return data;
        const { data: newUser, error: insertError } = await supabase.from('users').insert([{
            phone_number: phone,
            referral_code: Math.random().toString(36).substring(7).toUpperCase(),
            onboarding_step: 'new'
        }]).select().maybeSingle();
        return newUser || { phone_number: phone, id: null };
    });
}

async function getUserMemory(userId) {
    if (!userId) return { last_order: null, cart: [] };
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data: cart } = await supabase.from('carts').select('*').eq('user_id', userId);
    return { cart: cart || [] };
}

async function saveChatMessage(userId, role, content) {
    if (!userId) return;
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await supabase.from('chat_history').insert([{ user_id: userId, role, content: content.substring(0, 1000) }]);
}

async function detectIntents(messageText, memory) {
    return await granularMonitor('detectIntents', async () => {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { data: config } = await supabase.from('system_config').select('value, updated_at').eq('key', 'openai_circuit_breaker').maybeSingle();
        const isCircuitOpen = config?.value === 'open' && (new Date() - new Date(config.updated_at)) < 30 * 60 * 1000;

        const fastMatch = fallbackIntentParser(messageText);
        if (fastMatch[0].confidence >= 0.9) return fastMatch;

        const prompt = `Analyze: "${messageText}". Context: ${JSON.stringify(memory)}. Respond JSON array: [{ "intent": "string", "confidence": 0-1 }]`;

        // Simplified race for Baileys port
        if (process.env.OPENAI_API_KEY && !isCircuitOpen) {
            try {
                const res = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] })
                });
                const data = await res.json();
                return JSON.parse(data.choices?.[0]?.message?.content || '[]');
            } catch (e) {
                if (e.message.includes('429')) {
                    await supabase.from('system_config').upsert({ key: 'openai_circuit_breaker', value: 'open', updated_at: new Date().toISOString() });
                }
            }
        }
        return fastMatch;
    });
}

function fallbackIntentParser(text) {
    const t = (text || '').toLowerCase().trim();
    if (['hi', 'hello', 'hey', 'start'].includes(t)) return [{ intent: 'greeting', confidence: 0.9 }];
    if (t.includes('add') || t.includes('checkout') || t.includes('cart')) return [{ intent: 'cart_action', confidence: 1.0 }];
    if (t.includes('taxi') || t.includes('ride')) return [{ intent: 'taxi', confidence: 0.9 }];
    return [{ intent: 'help', confidence: 0.1 }];
}

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: true,
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if(qr) {
            qrcode.generate(qr, { small: true });
        }
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if(shouldReconnect) {
                startSock();
            }
        } else if(connection === 'open') {
            console.log('opened connection');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Initial Health Scan & Server
    const sentry = new SentientSentry();
    startHealthServer(sentry, sock);

    // Daily Magic Digest (Node Version)
    setInterval(async () => {
        const now = new Date();
        if (now.getHours() === 8 && now.getMinutes() === 0) {
            console.log("[CRON] Running Daily Digest...");
            const adminPhone = process.env.ADMIN_PHONE || '';
            if (adminPhone) {
                const scan = await sentry.performScan(sock);
                await sendSecureMessage(sock, adminPhone + '@s.whatsapp.net', `🌅 *DAILY DIGEST*\n\nStatus: ${scan.status.toUpperCase()}\nWhatsApp: ${scan.layers.whatsapp}\n\nHave a magical day! ✨`);
            }
        }
    }, 60000);

    sock.ev.on('messages.upsert', async (m) => {
        if(m.type === 'notify') {
            for(const msg of m.messages) {
                if(!msg.key.fromMe) {
                    await processIncomingMessage(sock, msg);
                }
            }
        }
    });

    return sock;
}

async function processIncomingMessage(sock, msg) {
    const from = msg.key.remoteJid;
    const userPhone = from.replace('@s.whatsapp.net', '').replace('@c.us', '');
    const messageText = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        '';

    if (!messageText) return;
    console.log(`[PIPELINE] from=${userPhone} text="${messageText}"`);

    try {
        const user = await getOrCreateUser(userPhone);
        const memory = await getUserMemory(user.id);
        await saveChatMessage(user.id, 'user', messageText);

        const intents = await detectIntents(messageText, memory);
        console.log(`[PIPELINE] intents=${JSON.stringify(intents)}`);

        const response = await routeMessage(user, intents, messageText, sock, from);
        if (response) {
            await sendSecureMessage(sock, from, response);
            await saveChatMessage(user.id, 'assistant', response);
        }
    } catch (error) {
        console.error('Pipeline Error:', error);
    }
}

async function sendSecureMessage(sock, to, text, options = {}) {
    console.log(`[OUTBOUND] to=${to} type=${options.type || 'text'} text="${text?.substring(0, 50)}..."`);

    if (options.type === 'interactive' && options.buttons) {
        // Baileys interactive buttons (using Template Message or Buttons Message)
        // Note: Button messages are deprecated in some WA versions, but still work in Baileys for many accounts
        const buttons = options.buttons.map(b => ({
            buttonId: b.id,
            buttonText: { displayText: b.title },
            type: 1
        }));
        const buttonMessage = {
            text: text,
            footer: options.footer || 'Mr Everything Concierge',
            buttons: buttons,
            headerType: 1
        };
        return await sock.sendMessage(to, buttonMessage);
    } else if (options.type === 'image' && options.image) {
        return await sock.sendMessage(to, { image: { url: options.image }, caption: text });
    } else {
        return await sock.sendMessage(to, { text: text || '' });
    }
}

async function routeMessage(user, intents, messageText, sock, from) {
    const intent = intents[0]?.intent || 'help';
    const data = intents[0]?.extracted_data || {};
    const mirage = MIRAGE_REGISTRY[intent] || MIRAGE_REGISTRY.unknown_input;
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const memory = await getUserMemory(user.id);

    try {
        return await mirage.handle(user, messageText, data, memory, supabase, sock, from);
    } catch (e) {
        console.error(`Mirage Error [${intent}]:`, e);
        return "⚠️ My magic hiccuped. I'm looking into it! ✨";
    }
}

const MIRAGE_REGISTRY = {
    shopping: { handle: async (user, text, data, memory, db, sock, from) => {
        const query = (data.product || text || '').toLowerCase();
        await sendSecureMessage(sock, from, `🛍️ *MR EVERYTHING SHOPPING*\n\nSearching top SA retailers for "${query}"...`);
        await sendSecureMessage(sock, from, `I found the best price for you! Ready to order?`, {
            type: 'interactive',
            image: 'https://images.unsplash.com/photo-1557821552-17105176677c?w=800',
            buttons: [{ id: 'ADD_CART', title: 'Add to Cart 🛒' }, { id: 'HELP', title: 'Need Help? ❓' }]
        });
        return null;
    }},
    food: { handle: async (user, text, data, memory, db, sock, from) => {
        await sendSecureMessage(sock, from, `🍗 *MR EVERYTHING FOOD*\n\nFinding the nearest restaurants for you... 🏃‍♂️💨`, {
            type: 'interactive',
            buttons: [{ id: 'ORDER_KFC', title: 'Order KFC 🍗' }, { id: 'ORDER_STEERS', title: 'Order Steers 🍔' }]
        });
        return null;
    }},
    taxi: { handle: async (user, text, data, memory, db, sock, from) => {
        return `🚐 *MR TAXI*\n\nWhere would you like to go? (Shared rides from R35). Example: "Taxi to Sandton"`;
    }},
    cart_action: { handle: async (user, text, data, memory, db, sock, from) => {
        if (text.toLowerCase().includes('checkout')) {
            return `💳 *MR EVERYTHING CHECKOUT*\n\nYour total is R49.00\n\nPay securely via PayFast:\n🔗 https://www.payfast.co.za/eng/process?cmd=_paynow&receiver=10000100&amount=49.00`;
        }
        return `🛒 *YOUR CART*\n\nType "CHECKOUT" to proceed to payment. ✨`;
    }},
    greeting: { handle: async (user) => {
        if (user.preferred_name) return `👋Welcome back ${user.preferred_name}. Great to see you again! How may i assist?✨`;
        return `👋Hi! I'm Mr Everything, your personal assistant. How may i help you today?✨`;
    }},
    help: { handle: async () => `✨ *MR EVERYTHING MAGIC*\n\nI can help with:\n🛍️ Shopping\n🍗 Food\n🏨 Hotels\n✈️ Flights\n📱 Airtime & ⚡ Electricity\n\nJust tell me what you need! ✨` },
    unknown_input: { handle: async () => `🤔 *MR EVERYTHING IS PUZZLED*\n\nI didn't quite catch that. Try asking for food, shopping, or travel. ✨` },
    save_name: { handle: async (user, text, data, memory, db) => {
        const name = text.trim().substring(0, 50);
        await db.from('users').update({ preferred_name: name, onboarding_step: 'completed' }).eq('id', user.id);
        return `✨ Nice to meet you, *${name}*! I've saved that to my memory.\n\nWhat would you like to do first? 🇿🇦`;
    }},
    admin_panel: { handle: async (user, text, data, memory, db, sock, from) => {
        await sendSecureMessage(sock, from, `🛠️ *MR EVERYTHING ADMIN*\n\nWelcome back, Boss.`, {
            type: 'interactive',
            buttons: [{ id: '!stats', title: 'Business Stats 📊' }, { id: '!diag', title: 'System Diag 🛠️' }]
        });
        return null;
    }},
    pricing: { handle: async () => `💰 *MR EVERYTHING PRICING*\n\nOur concierge fee is typically R49 per order. Prices are fetched live from top SA retailers. ✨` },
    track_order: { handle: async () => `📦 *ORDER TRACKING*\n\nI'm checking your recent orders... One moment! 🏃‍♂️💨` },
    complaints: { handle: async () => `🛠️ *SUPPORT*\n\nI'm sorry! I've flagged this for my human team. One of them will reach out to you shortly. 🇿🇦` },
    weather: { handle: async () => `☀️ *SA WEATHER*\n\nChecking conditions for your area... It looks like a great day for a braai! 🇿🇦🔥` },
    load_shedding: { handle: async () => `💡 *LOAD SHEDDING*\n\nStage 2 active. Checking schedules for your area... 🕯️` },
    electricity: { handle: async () => `⚡ *PREPAID POWER*\n\nPlease provide your meter number to generate a token. 💡` },
    airtime: { handle: async () => `📱 *AIRTIME & DATA*\n\nWhich network are you using? (Vodacom, MTN, Cell C, Telkom)` }
};

startSock().catch(err => console.error("Outer Error:", err));
