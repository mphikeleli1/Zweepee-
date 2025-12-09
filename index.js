const express = require('express');
const app = express();

app.use(express.json());

// Home page
app.get('/', (req, res) => {
  res.send('WhatsApp bot is running. Webhook: /webhook');
});

// Webhook verification
app.get('/webhook', (req, res) => {
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('Token received:', token);
  
  if (token === 'zweepee123') {
    console.log('Webhook verified - sending challenge');
    res.send(challenge);
  } else {
    console.log('Wrong token');
    res.sendStatus(403);
  }
});

// Receive messages
app.post('/webhook', (req, res) => {
  console.log('Message received');
  res.send('OK');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server started');
});
