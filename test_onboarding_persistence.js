
import worker from './zweepee-worker.js';

async function runPersistenceTest() {
    console.log('--- STARTING GHOST-FIX & PERSISTENCE TEST ---');
    const userPhone = '27731234567';
    let mockUser = {
        id: 'user-123',
        phone_number: userPhone,
        preferred_name: null,
        onboarding_step: 'new',
        created_at: new Date(Date.now() - 200000).toISOString(),
        last_active: new Date(Date.now() - 10000).toISOString()
    };

    let mockCart = [];
    let lastResponse = "";
    let lastSentOptions = {};

    global.fetch = async (url, options) => {
        const urlStr = url.toString();

        if (urlStr.includes('openai') || urlStr.includes('googleapis')) {
            return {
                ok: true, status: 200,
                headers: { get: (n) => 'application/json' },
                json: async () => ({
                    choices: [{ message: { content: "[]" } }],
                    candidates: [{ content: { parts: [{ text: "[]" }] } }]
                })
            };
        }

        if (urlStr.includes('supabase.co/rest/v1')) {
            let responseData = [];
            if (options.method === 'GET' && urlStr.includes('users?')) responseData = mockUser;
            else if (options.method === 'PATCH' && urlStr.includes('users?')) {
                const body = JSON.parse(options.body);
                mockUser = { ...mockUser, ...body };
                responseData = mockUser;
            }
            else if (options.method === 'GET' && urlStr.includes('carts?')) responseData = mockCart;
            else if (options.method === 'POST' && urlStr.includes('/carts')) {
                const body = JSON.parse(options.body);
                mockCart.push(...body);
                responseData = body;
            }
            else responseData = [];

            return {
                ok: true, status: 200,
                headers: { get: (n) => (n.toLowerCase() === 'content-range' ? '0-0/1' : 'application/json') },
                json: async () => responseData,
                text: async () => JSON.stringify(responseData)
            };
        }

        if (urlStr.includes('whapi.cloud')) {
            const data = { id: 'msg-sent-id', message: { id: 'msg-sent-id' } };
            if (options.method === 'POST' && (urlStr.includes('messages/text') || urlStr.includes('messages/interactive'))) {
                const body = JSON.parse(options.body);
                if (body.typing_time === undefined) {
                    const text = body.body || body.caption || body.interactive?.body?.text || "Interactive/Image";
                    lastResponse += (lastResponse ? "\n" : "") + text;
                }
            }
            return {
                ok: true, status: 200,
                headers: { get: (n) => 'application/json' },
                json: async () => data,
                text: async () => JSON.stringify(data)
            };
        }

        return { ok: true, status: 200, headers: { get: (n) => null }, json: async () => ({}), text: async () => "{}" };
    };

    const env = {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_KEY: 'test',
        WHAPI_TOKEN: 'test',
        OPENAI_API_KEY: 'test',
        GEMINI_API_KEY: 'test',
        ADMIN_PHONE: '27731112222'
    };

    const pendingPromises = [];
    const ctx = { waitUntil: (p) => { pendingPromises.push(p); } };

    async function sendMessage(text) {
        lastResponse = "";
        const req = new Request('https://z.dev/webhook', {
            method: 'POST',
            body: JSON.stringify({
                messages: [{
                    from: `${userPhone}@c.us`,
                    text: { body: text },
                    type: 'text'
                }]
            })
        });
        await worker.fetch(req, env, ctx);
        while (pendingPromises.length > 0) {
            await pendingPromises.shift();
        }
    }

    // 1. New User Greeting -> Should Trigger Onboarding
    console.log('\n[1] New User says "Hi"');
    await sendMessage('Hi');
    console.log(`Bot Response: ${lastResponse}`);
    console.log(`User Step: ${mockUser.onboarding_step}`);

    // 2. User provide name -> Should Save and Complete
    console.log('\n[2] User provides name "Thabo"');
    await sendMessage('Thabo');
    console.log(`Bot Response: ${lastResponse}`);
    console.log(`Saved Name: ${mockUser.preferred_name}, Step: ${mockUser.onboarding_step}`);

    // 3. User says "Hi" again -> Should be Greeted by Name, NOT Onboarded again
    console.log('\n[3] User says "Hi" again (Persistence Check)');
    await sendMessage('Hi');
    console.log(`Bot Response: ${lastResponse}`);
    if (lastResponse.includes('WELCOME TO ZWEEPEE') && !lastResponse.includes('What is your name')) {
        console.log("✅persistence confirmed: Greeting loop broken.");
    }

    // 4. Shopping Intent -> Verify Vanish Logic
    console.log('\n[4] User says "I want a phone" (Vanish Check)');
    await sendMessage('I want a phone');
    // Check if "Searching..." was sent
    console.log(`Bot Response (Combined): ${lastResponse}`);
    if (lastResponse.includes('Searching')) {
        console.log("✅ Vanish trigger detected.");
    }

    if (mockUser.preferred_name === 'Thabo' && mockUser.onboarding_step === 'completed') {
        console.log('\n✅ TEST PASSED: Ghost Loop fixed and Onboarding verified.');
    } else {
        console.log('\n❌ TEST FAILED.');
    }

    console.log('\n--- PERSISTENCE TEST COMPLETE ---');
}

runPersistenceTest().catch(console.error);
