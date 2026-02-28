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
import fs from 'fs';

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
            const { error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
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
        } else if (req.url === '/driver' || req.url === '/') {
            try {
                let html = fs.readFileSync('./driver_portal.html', 'utf8');
                // 🛡️ SECURITY FIX: Only inject ANON_KEY, never SERVICE_KEY to client
                html = html.replace('YOUR_SUPABASE_URL', process.env.SUPABASE_URL || '');
                html = html.replace('YOUR_SUPABASE_KEY', process.env.SUPABASE_ANON_KEY || '');
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
            } catch (e) {
                res.writeHead(500);
                res.end("Error loading driver portal");
            }
        } else {
            res.writeHead(404);
            res.end();
        }
    }).listen(process.env.PORT || 8080);
    console.log(`Web server running on port ${process.env.PORT || 8080}`);
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
        // Using revamped 'profiles' table from spec Section 5.1
        const { data, error } = await supabase.from('profiles').select('*').eq('phone_number', phone).maybeSingle();
        if (data) return data;
        const { data: newUser, error: insertError } = await supabase.from('profiles').insert([{
            phone_number: phone,
            role: 'passenger'
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

        const prompt = `Analyze: "${messageText}". Context: ${JSON.stringify(memory)}. Respond JSON array of objects: [{ "intent": "string", "confidence": 0-1 }]`;

        // Simplified race for Baileys port
        if (process.env.OPENAI_API_KEY && !isCircuitOpen) {
            try {
                const res = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [{ role: 'system', content: 'You are an intent detector. Always respond with a JSON array.' }, { role: 'user', content: prompt }],
                        response_format: { type: "json_object" }
                    })
                });
                const data = await res.json();
                const content = data.choices?.[0]?.message?.content || '{"intents": []}';
                const parsed = JSON.parse(content);
                return Array.isArray(parsed) ? parsed : (parsed.intents || []);
            } catch (e) {
                if (e.message.includes('429')) {
                    await supabase.from('system_config').upsert({ key: 'openai_circuit_breaker', value: 'open', updated_at: new Date().toISOString() });
                }
            }
        }
        return fastMatch;
    });
}

function getDistance(loc1, loc2) {
    const R = 6371;
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLng = (loc2.lng - loc1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateRouteDistance(stops) {
    let total = 0;
    for (let i = 0; i < stops.length - 1; i++) {
        total += getDistance(stops[i].location, stops[i+1].location);
    }
    return total;
}

// 3.2 Mid-Route Insertion Logic
function findBestInsertion(newPassenger, activeTrip) {
    if (activeTrip.type !== 'shared') return null;
    if (activeTrip.passengers >= (activeTrip.vehicle?.capacity || 4)) return null;

    const currentStops = activeTrip.stops.filter(s => s.status === 'pending');
    let bestInsertion = null;
    let minDetour = Infinity;

    for (let pickupPos = 0; pickupPos <= currentStops.length; pickupPos++) {
        for (let dropoffPos = pickupPos + 1; dropoffPos <= currentStops.length + 1; dropoffPos++) {
            const testRoute = [
                ...currentStops.slice(0, pickupPos),
                { type: 'pickup', location: newPassenger.pickup, passenger: newPassenger },
                ...currentStops.slice(pickupPos, dropoffPos - 1),
                { type: 'dropoff', location: newPassenger.dropoff, passenger: newPassenger },
                ...currentStops.slice(dropoffPos - 1)
            ];

            const newDistance = calculateRouteDistance(testRoute);
            const originalDistance = calculateRouteDistance(currentStops);
            const detour = newDistance - originalDistance;

            // 3.3 Insertion Rules (Detour <= 2km)
            if (detour < minDetour && detour <= 2) {
                minDetour = detour;
                bestInsertion = { pickupPos, dropoffPos, detour, testRoute };
            }
        }
    }
    return bestInsertion;
}

// 3.7 Driver Prioritization
function selectDriver(availableDrivers, pickupLocation, avgTripsToday = 5) {
    const scoredDrivers = availableDrivers.map(driver => {
        let score = 0;
        const distanceKm = getDistance(driver.location, pickupLocation);
        score += Math.max(100 - (distanceKm * 10), 0) * 0.5; // 50% proximity

        const ratingScore = (driver.rating - 4.0) * 25;
        score += ratingScore * 0.3; // 30% rating

        score += (driver.acceptanceRate || 0.9) * 15; // 15% acceptance
        score += (driver.completionRate || 0.95) * 5; // 5% completion
        score += (driver.tripsToday < avgTripsToday) ? 1 : 0; // fairness

        return { driver, score };
    });

    scoredDrivers.sort((a, b) => b.score - a.score);
    return scoredDrivers[0]?.driver;
}

async function cancelTrip(driverId, tripId, reason, db) {
    const validReasons = ['vehicle_breakdown', 'medical', 'unsafe_destination', 'threatening_passenger'];
    if (validReasons.includes(reason)) {
        await db.from('trips').update({ status: 'cancelled' }).eq('id', tripId);
        return { penalty: false };
    }

    // Tiered Penalties (Section 9.3)
    const today = new Date().toISOString().split('T')[0];
    const { count: todayCancels } = await db.from('trips')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', driverId)
        .eq('status', 'cancelled')
        .gte('created_at', today);

    let suspensionHours = 0;
    if (todayCancels >= 2) suspensionHours = 24; // Tier 3
    else if (todayCancels >= 1) suspensionHours = 2;   // Tier 2

    if (suspensionHours > 0) {
        await db.from('profiles').update({ driver_status: 'suspended' }).eq('id', driverId);
        // In a real system, we'd schedule a status reset
    }

    await db.from('trips').update({ status: 'cancelled' }).eq('id', tripId);
    return { penalty: true, suspension: suspensionHours };
}

async function canAssignTrip(driverId, db) {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recentTrips } = await db.from('trips')
        .select('id').eq('driver_id', driverId).gt('completed_at', oneHourAgo);

    if ((recentTrips?.length || 0) >= 3) { // Section 9.1
        return { allowed: false, reason: "Hourly limit reached (Max 3)" };
    }

    const { data: profile } = await db.from('profiles').select('total_trips').eq('id', driverId).single();
    if (profile?.total_trips >= 5) {
        // Anti-hogging: move to back of queue logic would go here
    }

    return { allowed: true };
}

async function verifySelfie(driverId, selfieUrl, db) {
    // Section 9.4 placeholder - would integrate AWS Rekognition/Azure Face API here
    console.log(`[SAFETY] Verifying selfie for driver ${driverId}: ${selfieUrl}`);
    const { data: driver } = await db.from('profiles').select('driver_license_url').eq('id', driverId).single();

    // Mock verification
    const isMatched = true;
    if (!isMatched) {
        await db.from('profiles').update({ driver_status: 'suspended' }).eq('id', driverId);
        return { verified: false, action: 'suspended' };
    }
    return { verified: true };
}

async function validateGPS(driverId, newLocation, timestamp, db) {
    const { data: lastLocation } = await db.from('driver_locations')
        .select('*').eq('driver_id', driverId).order('updated_at', { ascending: false }).limit(1).maybeSingle();

    if (!lastLocation) return { valid: true };

    const distance = getDistance({ lat: lastLocation.lat, lng: lastLocation.lng }, newLocation);
    const timeDiff = (new Date(timestamp) - new Date(lastLocation.updated_at)) / 1000 / 60; // mins
    const speed = (distance / (timeDiff || 1)) * 60; // km/h

    if (speed > 200) { // Section 9.5
        await db.from('profiles').update({ driver_status: 'suspended' }).eq('id', driverId);
        await logSystemAlert({ severity: 'critical', source: 'gps-validation', message: `Impossible speed: ${speed}km/h for driver ${driverId}` });
        return { valid: false, reason: 'impossible_speed' };
    }
    return { valid: true };
}

function calculateFare(type, distanceKm) {
    // Distance Bands for Rides (Sections 1.1 - 1.3)
    if (type === 'shared_sedan') {
        if (distanceKm <= 12) return { fare: 35, platform_fee: 5 };
        if (distanceKm <= 22) return { fare: 50, platform_fee: 5 };
        if (distanceKm <= 35) return { fare: 70, platform_fee: 5 };
        return null; // Reject > 35km
    }

    if (type === 'solo_sedan') {
        if (distanceKm <= 12) return { fare: 89, platform_fee: 10 };
        if (distanceKm <= 22) return { fare: 139, platform_fee: 10 };
        if (distanceKm <= 35) return { fare: 189, platform_fee: 10 };
        return { fare: 189 + (distanceKm - 35) * 10, platform_fee: 10 }; // Fallback for long solo
    }

    if (type === 'moto_ride') {
        if (distanceKm <= 10) return { fare: 25, platform_fee: 3 };
        if (distanceKm <= 20) return { fare: 35, platform_fee: 3 };
        if (distanceKm <= 30) return { fare: 45, platform_fee: 3 };
        return null;
    }

    if (type === 'moto_courier') {
        // R20 base + R5 per km (Section 1.4)
        return { fare: 20 + (distanceKm * 5), platform_fee: 10 };
    }

    if (type === 'food') {
        // Customer pays R20 flat (Section 1.5)
        return { fare: 20, platform_fee: 10 };
    }

    return { fare: 0, platform_fee: 0 };
}

function fallbackIntentParser(text) {
    const t = (text || '').toLowerCase().trim();
    if (['hi', 'hello', 'hey', 'start'].includes(t)) return [{ intent: 'greeting', confidence: 0.9 }];
    if (t.includes('add') || t.includes('checkout') || t.includes('cart')) return [{ intent: 'cart_action', confidence: 1.0 }];
    if (t.includes('moto') && t.includes('courier')) return [{ intent: 'moto_courier', confidence: 1.0 }];
    if (t.includes('moto')) return [{ intent: 'moto_ride', confidence: 1.0 }];
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
    if (!global.healthServerStarted) {
        const sentry = new SentientSentry();
        startHealthServer(sentry, sock);
        global.healthServerStarted = true;
    }

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
    const isAdmin = userPhone === (process.env.ADMIN_PHONE || '');
    const messageText = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.buttonsResponseMessage?.selectedButtonId ||
                        msg.message?.templateButtonReplyMessage?.selectedId ||
                        '';

    if (!messageText) return;

    // 🛡️ HARD SEPARATION: Block admin commands from non-admin numbers
    if (messageText.startsWith('!') && !isAdmin) {
        console.warn(`[SECURITY] Unauthorized admin command attempt from ${userPhone}: ${messageText}`);
        return;
    }

    console.log(`[PIPELINE] from=${userPhone} (Admin=${isAdmin}) text="${messageText}"`);

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

    // 🛡️ User Onboarding Check
    if (!user.full_name && intent !== 'save_name' && intent !== 'greeting') {
        return `👋 Welcome to Mr Everything! I noticed I don't know your name yet. What should I call you? ✨`;
    }

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
        await sendSecureMessage(sock, from, `🍗 *MR EVERYTHING FOOD*\n\n*R20 Flat Delivery* to your door! 🏃‍♂️💨`, {
            type: 'interactive',
            buttons: [
                { id: 'ORDER_KFC', title: 'Order KFC 🍗' },
                { id: 'ORDER_STEERS', title: 'Order Steers 🍔' },
                { id: 'VIEW_RESTAURANTS', title: 'See All 📋' }
            ]
        });
        return null;
    }},
    taxi: { handle: async (user, text, data, memory, db, sock, from) => {
        await sendSecureMessage(sock, from, `🚐 *MR TAXI - NEW MODELS*\n\nChoose your ride style:`, {
            type: 'interactive',
            buttons: [
                { id: 'RIDE_SHARED', title: 'Shared Sedan (R35+) 🚐' },
                { id: 'RIDE_SOLO', title: 'Solo Sedan (R89+) 🚗' },
                { id: 'RIDE_MOTO', title: 'Moto Ride (R25+) 🏍️' }
            ]
        });
        return null;
    }},
    moto_ride: { handle: async (user, text, data, memory, db, sock, from) => {
        return `🏍️ *MOTO RIDE*\n\nFastest way through traffic! Pricing from R25 (0-10km). Tell me your destination:`;
    }},
    moto_courier: { handle: async (user, text, data, memory, db, sock, from) => {
        return `📦 *MOTO COURIER*\n\nR20 base + R5/km. Max 15kg. Instant pickup and proof of delivery! 🇿🇦`;
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
    unknown_input: { handle: async (user, text) => {
        if (!user.full_name) {
            const name = text.trim().substring(0, 50);
            const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
            await db.from('profiles').update({ full_name: name }).eq('id', user.id);
            return `✨ Nice to meet you, *${name}*! I've saved that to my memory.\n\nWhat would you like to do first? 🇿🇦`;
        }
        return `🤔 *MR EVERYTHING IS PUZZLED*\n\nI didn't quite catch that. Try asking for food, shopping, or travel. ✨`;
    }},
    save_name: { handle: async (user, text, data, memory, db) => {
        const name = text.trim().substring(0, 50);
        await db.from('profiles').update({ full_name: name }).eq('id', user.id);
        return `✨ Nice to meet you, *${name}*! I've saved that to my memory.\n\nWhat would you like to do first? 🇿🇦`;
    }},
    admin_panel: { handle: async (user, text, data, memory, db, sock, from) => {
        await sendSecureMessage(sock, from, `🛠️ *MR EVERYTHING ADMIN*\n\nWelcome back, Boss.`, {
            type: 'interactive',
            buttons: [{ id: '!stats', title: 'Business Stats 📊' }, { id: '!diag', title: 'System Diag 🛠️' }]
        });
        return null;
    }},
    RIDE_SHARED: { handle: async () => `🚐 *SHARED SEDAN*\n\nGreat choice! Groups of 3-4 passengers. Pricing:\n• SHORT: R35\n• MEDIUM: R50\n• LONG: R70\n\nWhere are we picking you up? (Send location pin 📍)` },
    RIDE_SOLO: { handle: async () => `🚗 *SOLO SEDAN*\n\nPrivate ride just for you. Pricing:\n• SHORT: R89\n• MEDIUM: R139\n• LONG: R189\n\nPlease send your destination address:` },
    RIDE_MOTO: { handle: async () => `🏍️ *MOTO RIDE*\n\nSkip the traffic! Pricing:\n• SHORT: R25\n• MEDIUM: R35\n• LONG: R45\n\nSend your location to begin. 📍` },
    pricing: { handle: async () => `💰 *MR EVERYTHING PRICING*\n\nOur concierge fee is typically R49 per order. Prices are fetched live from top SA retailers. ✨` },
    track_order: { handle: async () => `📦 *ORDER TRACKING*\n\nI'm checking your recent orders... One moment! 🏃‍♂️💨` },
    complaints: { handle: async () => `🛠️ *SUPPORT*\n\nI'm sorry! I've flagged this for my human team. One of them will reach out to you shortly. 🇿🇦` },
    weather: { handle: async () => `☀️ *SA WEATHER*\n\nChecking conditions for your area... It looks like a great day for a braai! 🇿🇦🔥` },
    load_shedding: { handle: async () => `💡 *LOAD SHEDDING*\n\nStage 2 active. Checking schedules for your area... 🕯️` },
    electricity: { handle: async () => `⚡ *PREPAID POWER*\n\nPlease provide your meter number to generate a token. 💡` },
    airtime: { handle: async () => `📱 *AIRTIME & DATA*\n\nWhich network are you using? (Vodacom, MTN, Cell C, Telkom)` }
};

import { fileURLToPath } from 'url';

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
    startSock().catch(err => console.error("Outer Error:", err));
}

export { calculateFare, findBestInsertion, selectDriver };
