export default function handler(req, res) {
  if (req.method === 'GET') {
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (token === process.env.WA_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Invalid token');
    }
  } else if (req.method === 'POST') {
    console.log(req.body);
    res.status(200).send('OK');
  }
}
