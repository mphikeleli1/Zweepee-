
async function runSetup() {
    const url = 'https://zweepee.busanigama.workers.dev/setup';
    const adminKey = 'zweepee2025';

    console.log(`Running setup: ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'x-admin-key': adminKey }
        });

        const data = await response.json();
        console.log('Setup Result:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Setup Failed:', e.message);
    }
}

runSetup();
