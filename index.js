const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('WhatsApp bot is running. Webhook: /webhook');
});

app.get('/webhook', (req, res) => {
  console.log('=== META WEBHOOK TEST ===');
  console.log('Full URL:', req.url);
  console.log('Query params:', req.query);
  console.log('Token received:', req.query['hub.verify_token']);
  console.log('Expected token: zweepee123');
  
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (token === 'zweepee123') {
    console.log('✅ TOKEN MATCH - Sending challenge:', challenge);
    res.send(challenge);
  } else {
    console.log('❌ TOKEN MISMATCH');
    res.sendStatus(403);
  }
});

app.post('/webhook', (req, res) => {
  console.log('Message received');
  res.send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server started');
});
