export default function handler(req, res) {
  if (req.method === 'GET') return res.send('Verification failed');
  if (req.method === 'POST') return res.status(200).send('OK');
}
