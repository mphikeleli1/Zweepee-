const express = require('express');
const bodyParser = require('body-parser');  // New: Helps read WhatsApp letters

const app = express();
app.use(bodyParser.json());  // New: Turns on the reader

// New: Welcome mat for the front door
app.get('/', (req, res) => {
  res.send('Hello! Webhook mailbox is ready. Visit /webhook for WhatsApp setup.');
});

// Old: WhatsApp unlock check
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('Door unlocked!');  // New: Logs success
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Old: Catch messages (now can read them)
app.post('/webhook', (req, res) => {
  console.log('Message arrived!', req.body);  // New: Shows what WhatsApp sent
  res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Webhook test server running on ${PORT}`));
