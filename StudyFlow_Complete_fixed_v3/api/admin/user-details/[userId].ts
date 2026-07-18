import { getServiceClient, verifyAdmin } from '../../../shared/adminAuth';

export default async function handler(req: any, res: any) {
  if (!(await verifyAdmin(req.headers.authorization))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const sbAdmin = getServiceClient()!;
  const { userId } = req.query;

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
}
