
async function getLogs() {
    const url = 'https://zweepee.busanigama.workers.dev/logs';
    const adminKey = 'zweepee2025';

    try {
        const response = await fetch(url, {
            headers: { 'x-admin-key': adminKey }
        });

        const data = await response.json();
        console.log('Full Response:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Failed to get logs:', e.message);
    }
}

getLogs();
