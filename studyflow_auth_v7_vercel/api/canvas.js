export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { canvasUrl, token, path } = req.body || {};

  if (!canvasUrl || !token || !path) {
    res.status(400).json({ error: 'Missing parameters' });
    return;
  }

  const base = `https://${canvasUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  const url  = `${base}${path}`;

  try {
    const canvasRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await canvasRes.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(canvasRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
