
import worker from './zweepee-worker.js';

async function runSupabaseDownTest() {
    console.log('--- Testing Supabase Total Blackout ---');

    global.fetch = async (url) => {
        if (url.toString().includes('supabase')) {
            return { ok: false, status: 503, statusText: "Service Unavailable", text: async () => "Down" };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'mock_id' }),
            text: async () => "OK"
        };
    };

    const mockEnv = {
        SUPABASE_URL: 'https://broken.supabase.co',
        SUPABASE_SERVICE_KEY: 'broken',
        WHAPI_TOKEN: 'mock'
    };
    const mockCtx = { waitUntil: (p) => p.catch(e => console.log("[CTX] Background error:", e.message)) };

    const req = new Request('https://z.dev/webhook', {
        method: 'POST',
        body: JSON.stringify({ messages: [{ from: '27730000002@c.us', text: { body: 'hello' } }] })
    });

    try {
        const res = await worker.fetch(req, mockEnv, mockCtx);
        console.log(`Worker Status: ${res.status}`);
    } catch (e) {
        console.error("Worker Crashed:", e);
    }
}
runSupabaseDownTest().catch(console.error);
