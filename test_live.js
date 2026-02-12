
async function testLive() {
    const url = 'https://zweepee.busanigama.workers.dev/webhook';
    console.log(`Testing live URL: ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{
                    from: '27734857065',
                    text: { body: 'Hello' },
                    type: 'text'
                }]
            })
        });

        const text = await response.text();
        console.log(`Live Response: ${text}`);
    } catch (e) {
        console.error('❌ Live Test Failed:', e.message);
    }
}

testLive();
