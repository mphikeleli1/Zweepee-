
import worker from './zweepee-worker.js';

async function runPersistenceTest() {
    console.log('--- STARTING ONBOARDING & PERSISTENCE TEST ---');
    const userPhone = '27731234567';
    let mockUser = {
        id: 'user-123',
        phone_number: userPhone,
        preferred_name: null,
        onboarding_step: null,
        created_at: new Date(Date.now() - 200000).toISOString(),
        last_active: new Date(Date.now() - 10000).toISOString()
    };

    let mockCart = [];
    let lastResponse = "";

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
            const data = { id: 'msg-123', message: { id: 'msg-123' } };
            if (options.method === 'POST' && urlStr.includes('messages')) {
                const body = JSON.parse(options.body);
                if (body.typing_time === undefined) {
                    let text = "Interactive/Image";
                    if (body.body) text = body.body;
                    else if (body.caption) text = body.caption;
                    else if (body.interactive?.body?.text) text = body.interactive.body.text;
                    else if (body.image?.caption) text = body.image.caption;

                    if (typeof text !== 'string') text = JSON.stringify(text);
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

    async function sendMessage(text, ageLastActive = true) {
        lastResponse = "";
        if (ageLastActive) {
            mockUser.last_active = new Date(Date.now() - 5000).toISOString();
        }
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

    // 1. New User Greeting
    console.log('\n[1] New User says "Hi"');
    await sendMessage('Hi');
    console.log(`Bot Response: ${lastResponse}`);

    // 2. User provides name
    console.log('\n[2] User provides name "Thabo"');
    await sendMessage('Thabo');
    console.log(`Bot Response: ${lastResponse}`);

    // 3. User adds iPhone to cart
    console.log('\n[3] User adds iPhone to cart');
    await sendMessage('ADD_prod_1');
    console.log(`Bot Response: ${lastResponse}`);
    console.log(`Cart Size: ${mockCart.length}`);

    // 4. Returning User
    console.log('\n[4] User returns later');
    mockUser.last_active = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    await sendMessage('Hello', false);
    console.log(`Bot Response: ${lastResponse}`);

    // 5. Checkout
    console.log('\n[5] User checks out');
    await sendMessage('Checkout');
    console.log(`Bot Response: ${lastResponse}`);

    if (mockUser.preferred_name === 'Thabo' && mockCart.length > 0 && lastResponse.includes('Items: 1')) {
        console.log('\n✅ TEST PASSED: Onboarding and Persistence confirmed.');
    } else {
        console.log('\n❌ TEST FAILED.');
        console.log('Mock User:', JSON.stringify(mockUser, null, 2));
    }

    console.log('\n--- PERSISTENCE TEST COMPLETE ---');
}

runPersistenceTest().catch(console.error);
