export default function handler(req, res) {
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (req.method === 'GET' && token === 'zweepee2025') {
    return res.status(200).send(challenge);
  }

  if (req.method === 'POST') {
    console.log('Incoming webhook body:', req.body);
    return res.status(200).send('OK');
  }

  res.status(404).send('Not found');
}
