
async function testSend() {
    const url = 'https://zweepee.busanigama.workers.dev/test-send';
    const adminKey = 'zweepee2025';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-admin-key': adminKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: '27734857065@s.whatsapp.net',
                text: 'Testing direct send with suffix'
            })
        });

        const data = await response.json();
        console.log('Send Result:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Send Failed:', e.message);
    }
}

testSend();
