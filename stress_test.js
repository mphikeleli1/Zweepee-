
async function runStress() {
  const WORKER_URL = 'https://zweepee.busanigama.workers.dev/webhook';
  console.log('--- STARTING STRESS & SECURITY TEST ---');

  // 1. Concurrent Users (20 sessions)
  console.log('\n[1] Testing Concurrent Sessions (20 requests)...');
  const sessionPromises = Array.from({ length: 20 }).map((_, i) => {
    return fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          from: `2773000${i.toString().padStart(4, '0')}@c.us`,
          text: { body: `Stress test message ${i}` }
        }]
      })
    });
  });
  const results = await Promise.all(sessionPromises);
  const successCount = results.filter(r => r.ok).length;
  console.log(`Finished: ${successCount}/20 requests successful (HTTP 200/202).`);

  // 2. Malformed Payloads
  console.log('\n[2] Testing Malformed Payloads...');
  const malformed = [
    { name: 'Non-JSON', body: 'not json at all' },
    { name: 'Empty JSON', body: '{}' },
    { name: 'Missing From', body: JSON.stringify({ messages: [{ text: { body: 'hello' } }] }) },
    { name: 'Missing Body', body: JSON.stringify({ messages: [{ from: '123' }] }) }
  ];

  for (const test of malformed) {
    try {
        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: test.body
        });
        console.log(`Test: ${test.name} -> Status: ${res.status}`);
    } catch (e) {
        console.log(`Test: ${test.name} -> Error: ${e.message}`);
    }
  }

  // 3. Security Wall Check
  console.log('\n[3] Testing Security Wall (Admin Bypass Attempt)...');
  const bypassRes = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{
        from: '27730552773@c.us',
        text: { body: '!stats' } // Admin command
      }]
    })
  });
  console.log(`Status for unauthorized admin-command attempt: ${bypassRes.status}`);

  console.log('\n--- STRESS TEST COMPLETE ---');
}

runStress().catch(console.error);
