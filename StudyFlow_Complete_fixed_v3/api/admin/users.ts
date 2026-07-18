import { getServiceClient, verifyAdmin } from '../../shared/adminAuth';

export default async function handler(req: any, res: any) {
  if (!(await verifyAdmin(req.headers.authorization))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { data, error } = await getServiceClient()!.auth.admin.listUsers();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ users: data.users });
}
