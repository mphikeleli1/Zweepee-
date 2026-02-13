
import worker from './mr-everything-worker.js';

// Save original fetch
const originalFetch = global.fetch;

async function runFallbackTest() {
    console.log('--- Testing Brain Fallback ---');

    // Mock fetch to simulate AI failure
    global.fetch = async (url) => {
        if (url.toString().includes('openai') || url.toString().includes('googleapis')) {
            console.log(`[MOCK] Failing AI call to: ${url}`);
            throw new Error("AI_CONNECTION_ERROR");
        }
        // Mock Supabase/Whapi success for the rest
        return {
            ok: true,
            status: 200,
            json: async () => ({ data: [], error: null, id: 'mock_msg_id' }),
            text: async () => "OK"
        };
    };

    const mockEnv = {
        SUPABASE_URL: 'https://mock.supabase.co',
        SUPABASE_SERVICE_KEY: 'mock-key',
        OPENAI_API_KEY: 'sk-test',
        GEMINI_API_KEY: 'test-key',
        WHAPI_TOKEN: 'mock-token'
    };

    const mockCtx = {
        waitUntil: (p) => p.catch(e => {})
    };

    const req = new Request('https://zweepee.dev/webhook', {
        method: 'POST',
        body: JSON.stringify({
            messages: [{ from: '27730000001@c.us', text: { body: 'I want a phone' } }]
        })
    });

    try {
        const res = await worker.fetch(req, mockEnv, mockCtx);
        console.log(`Worker Response: ${res.status}`);
        if (res.status === 202 || res.status === 200) {
            console.log("✅ System survived AI total blackout and stayed responsive.");
        }
    } catch (e) {
        console.error("❌ System crashed during AI failure:", e);
    }

    // Restore fetch
    global.fetch = originalFetch;
}

runFallbackTest().catch(console.error);
