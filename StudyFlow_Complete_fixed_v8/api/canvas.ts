export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { canvasUrl, token, path } = req.body || {};
  if (!canvasUrl || !token || !path) {
    res.status(400).json({ error: 'Missing parameters' });
    return;
  }

  const base = `https://${String(canvasUrl).replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

  try {
    const canvasRes = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await canvasRes.json();
    res.status(canvasRes.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
