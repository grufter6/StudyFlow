import { useState, useEffect } from 'react';
import { sb } from '../lib/supabase';
import { useStudyFlow } from '../contexts/StudyFlowContext';
import { toast } from 'sonner';

export default function Admin() {
  const { signOut } = useStudyFlow();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<any>(null);

  useEffect(() => {
    loadAllUsers();
  }, []);

  async function authHeader(): Promise<Record<string, string>> {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadAllUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { headers: await authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setUsers(data.users || []);
    } catch (e: any) {
      toast.error('Failed to load users: ' + e.message);
    }
    setLoading(false);
  }

  async function loadUserDetails(userId: string) {
    try {
      const res = await fetch(`/api/admin/user-details/${userId}`, { headers: await authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setUserDetails(data);
    } catch (e: any) {
      toast.error('Failed to load user details: ' + e.message);
    }
  }

  function handleUserSelect(userId: string) {
    setSelectedUser(userId);
    loadUserDetails(userId);
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Users List */}
      <div style={{ width: '300px', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '16px' }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ marginBottom: '12px' }}>👑 Admin Panel</h2>
          <button
            className="btn btn-s btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={signOut}
          >
            Sign out
          </button>
        </div>

        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Users ({users.length})</h3>
        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: '12px' }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {users.map((u) => (
              <div
                key={u.id}
                onClick={() => handleUserSelect(u.id)}
                style={{
                  padding: '10px',
                  background: selectedUser === u.id ? 'var(--accent)' : 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (selectedUser !== u.id) {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedUser !== u.id) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }
                }}
              >
                <div style={{ fontWeight: 500, color: selectedUser === u.id ? '#fff' : 'var(--text)' }}>
                  {u.user_metadata?.full_name || u.email?.split('@')[0] || u.id.slice(0, 8)}
                </div>
                <div style={{ fontSize: '11px', color: selectedUser === u.id ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }}>
                  {u.email}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Details */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {selectedUser && userDetails ? (
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>
              {users.find((u) => u.id === selectedUser)?.email}
            </h1>

            {/* Settings */}
            {userDetails.settings && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', textTransform: 'none', letterSpacing: 'normal', color: 'var(--text)' }}>
                  ⚙️ Settings
                </h2>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', fontSize: '12px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Sleep:</strong> {userDetails.settings.sleep_start} - {userDetails.settings.sleep_end}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Evening starts:</strong> {userDetails.settings.eve_start}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Max chunk:</strong> {userDetails.settings.max_chunk} min
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Dinner:</strong> {userDetails.settings.dinner_time} ({userDetails.settings.dinner_dur} min)
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Shower:</strong> {userDetails.settings.shower_dur} min
                  </div>
                  {userDetails.settings.canvas_url && (
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Canvas URL:</strong> {userDetails.settings.canvas_url}
                    </div>
                  )}
                  {userDetails.settings.canvas_token && (
                    <div>
                      <strong>Canvas Token:</strong> ••••••••
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Assignments */}
            {userDetails.assignments && userDetails.assignments.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', textTransform: 'none', letterSpacing: 'normal', color: 'var(--text)' }}>
                  📝 Assignments ({userDetails.assignments.length})
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {userDetails.assignments.map((a: any) => (
                    <div
                      key={a.id}
                      style={{
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                        {a.name} {a.done && '✓'}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: '11px' }}>
                        Type: {a.type} | Due: {a.due} days | Est: {a.total_mins} min
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Commitments */}
            {userDetails.commitments && userDetails.commitments.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', textTransform: 'none', letterSpacing: 'normal', color: 'var(--text)' }}>
                  🎓 Classes & Activities ({userDetails.commitments.length})
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {userDetails.commitments.map((c: any) => (
                    <div
                      key={c.id}
                      style={{
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                        {c.name}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: '11px' }}>
                        {c.days.join(', ')} · {c.start_time} - {c.end_time} ({c.type})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timing History */}
            {userDetails.history && userDetails.history.length > 0 && (
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', textTransform: 'none', letterSpacing: 'normal', color: 'var(--text)' }}>
                  ⏱️ Timing History ({userDetails.history.length})
                </h2>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', fontSize: '12px' }}>
                  {userDetails.history.map((h: any) => (
                    <div key={h.id} style={{ marginBottom: '6px', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
                      <strong>{h.assignment_key}:</strong> {h.actual_mins} min
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--muted)', textAlign: 'center', paddingTop: '48px' }}>
            Select a user to view details
          </div>
        )}
      </div>
    </div>
  );
}
