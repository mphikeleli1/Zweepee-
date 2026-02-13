const https = require('https');

const WORKER_URL = 'zweepee.busanigama.workers.dev';
const TEST_USER = '27820000000'; // Simulation phone
const ADMIN_KEY = 'zweepee2025'; // Corrected key

function sendWebhook(message) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            messages: [{
                from: TEST_USER,
                text: { body: message },
                type: 'text',
                timestamp: Math.floor(Date.now() / 1000),
                id: 'MSG_' + Math.random().toString(36).substring(7)
            }]
        });

        const options = {
            hostname: WORKER_URL,
            port: 443,
            path: '/webhook',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve(body));
        });

        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

async function getLogs() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: WORKER_URL,
            port: 443,
            path: '/logs',
            method: 'GET',
            headers: {
                'x-admin-key': ADMIN_KEY
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runFlow() {
    console.log("🚀 Starting Complex Transaction Test...");

    console.log("\n1. [GREETING]");
    await sendWebhook("Hi");
    await sleep(3000);

    console.log("\n2. [ONBOARDING - NAME]");
    await sendWebhook("Jules the Tester");
    await sleep(3000);

    console.log("\n3. [SHOPPING - SEARCH]");
    await sendWebhook("I want to buy an iPhone 15");
    await sleep(5000);

    console.log("\n4. [SHOPPING - ADD TO CART]");
    await sendWebhook("ADD_prod_1");
    await sleep(3000);

    console.log("\n5. [CHECKOUT]");
    await sendWebhook("Checkout");
    await sleep(3000);

    console.log("\n✅ Flow simulation complete. Fetching logs...");
    const logs = await getLogs();

    console.log("\n--- FORENSIC LOGS ---");
    logs.logs.slice(0, 15).forEach(l => {
        console.log(`[${l.created_at}] ${l.event_type} | Intent: ${l.intent}`);
        if (l.event_type === 'OUTBOUND_ATTEMPT') {
             // console.log(`   -> Context: ${JSON.stringify(l.context)}`);
        }
    });

    console.log("\n--- SYSTEM ALERTS ---");
    logs.alerts.slice(0, 5).forEach(a => {
        console.log(`[${a.severity}] ${a.source}: ${a.message}`);
    });
}

runFlow().catch(console.error);
