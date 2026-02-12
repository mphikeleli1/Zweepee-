
async function checkHealth() {
    const url = 'https://zweepee.busanigama.workers.dev/health';
    const adminKey = 'zweepee2025';

    console.log(`Checking health: ${url}`);

    try {
        const response = await fetch(url, {
            headers: { 'x-admin-key': adminKey }
        });

        const data = await response.json();
        console.log('Health Data:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Health Check Failed:', e.message);
    }
}

checkHealth();
