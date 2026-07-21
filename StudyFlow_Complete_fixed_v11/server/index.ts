import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { getServiceClient, verifyAdmin } from "../shared/adminAuth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json());

  // ── Canvas LMS proxy ───────────────────────────────────────────────────
  // Canvas API tokens can't be used directly from the browser (CORS), so
  // this proxies the request server-side instead.
  app.post('/api/canvas', async (req, res) => {
    const { canvasUrl, token, path: canvasPath } = req.body || {};
    if (!canvasUrl || !token || !canvasPath) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    const base = `https://${String(canvasUrl).replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
    try {
      const canvasRes = await fetch(`${base}${canvasPath}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await canvasRes.json();
      res.status(canvasRes.status).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin routes (service-role, gated behind verifyAdmin) ──────────────
  app.get('/api/admin/users', async (req, res) => {
    if (!(await verifyAdmin(req.headers.authorization))) return res.status(403).json({ error: 'Forbidden' });
    const { data, error } = await getServiceClient()!.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ users: data.users });
  });

  app.get('/api/admin/user-details/:userId', async (req, res) => {
    if (!(await verifyAdmin(req.headers.authorization))) return res.status(403).json({ error: 'Forbidden' });
    const sbAdmin = getServiceClient()!;
    const { userId } = req.params;
    const [settings, assignments, commitments, history] = await Promise.all([
      sbAdmin.from('user_settings').select('*').eq('user_id', userId).single(),
      sbAdmin.from('assignments').select('*').eq('user_id', userId),
      sbAdmin.from('commitments').select('*').eq('user_id', userId),
      sbAdmin.from('timing_history').select('*').eq('user_id', userId),
    ]);
    res.json({
      settings: settings.data,
      assignments: assignments.data,
      commitments: commitments.data,
      history: history.data,
    });
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    // Don't serve index.html for API routes or static assets
    if (_req.path.startsWith("/.netlify") || _req.path.startsWith("/api")) {
      return res.status(404).send("Not found");
    }
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
