const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Proxy verification route
app.get('/verify', (req, res) => {
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (token === process.env.WA_VERIFY_TOKEN) {
    res.setHeader("Content-Type", "text/plain");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Keep your existing /webhook POST handler for events
app.post('/webhook', (req, res) => {
  console.log('Incoming webhook body:', req.body);
  res.status(200).send('OK');
});

module.exports = app;
