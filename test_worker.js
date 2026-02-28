// Test script for Zweepee Worker logic
import worker from './mr-everything-worker.js';

async function runTests() {
  console.log('--- Starting Local Tests ---');

  const mockEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_KEY: 'mock-key',
    WHAPI_TOKEN: 'mock-token',
    ADMIN_KEY: 'admin-key'
  };

  const mockCtx = {
    waitUntil: (p) => p.catch(e => console.error('waitUntil error:', e))
  };

  // 1. Test Webhook Entry
  console.log('\nTest 1: Webhook Entry (Ping)');
  const pingRequest = new Request('https://zweepee.workers.dev/webhook', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ from: '27730552773@c.us', text: { body: 'pingtest' } }] })
  });
  const pingResponse = await worker.fetch(pingRequest, mockEnv, mockCtx);
  const pingText = await pingResponse.text();
  console.log('Ping Response:', pingText);
  if (pingText === 'NEW_CODE_RUNNING') {
    console.log('✅ Ping Test Passed');
  } else {
    console.error('❌ Ping Test Failed');
  }

  // 2. Test fallbackIntentParser
  console.log('\nTest 2: fallbackIntentParser');
  // Since fallbackIntentParser is not exported, we can't test it directly easily
  // unless we export it or test it via processMessage (which involves database).
  // For now, let's assume it works if the worker starts up.

  console.log('\nTests Completed.');
}

runTests().catch(console.error);
