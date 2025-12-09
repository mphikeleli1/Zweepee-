const express = require('express');
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('WhatsApp bot running');
});

app.get('/webhook', (req, res) => {
  console.log('Meta test:', req.query);
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (token === 'zweepee123') {
    console.log('Token match');
    res.send(challenge);
  } else {
    console.log('Token wrong:', token);
    res.sendStatus(403);
  }
});

app.post('/webhook', (req, res) => {
  console.log('Message:', req.body);
  res.send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server on port', PORT);
});
