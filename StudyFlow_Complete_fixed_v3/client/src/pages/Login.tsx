import { useState } from 'react';
import { ADMIN_EMAIL } from '../lib/supabase';
import { useStudyFlow } from '../contexts/StudyFlowContext';

export default function Login() {
  const { signInGoogle, signInEmail } = useStudyFlow();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  async function handleGoogle() {
    setError('');
    setLoading(true);
    await signInGoogle();
    setLoading(false);
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInEmail(email, password);
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
    }
    setLoading(false);
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div>
          <div className="login-logo">🎒</div>
          <div className="login-title">StudyFlow</div>
          <div className="login-sub">Your evening, planned for you</div>
        </div>

        {!showEmailForm ? (
          <>
            <button
              className="btn btn-google"
              onClick={handleGoogle}
              disabled={loading}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              {loading ? 'Redirecting...' : 'Continue with Google'}
            </button>

            <div className="login-divider">or</div>

            <button
              className="btn btn-s"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setShowEmailForm(true)}
            >
              🔑 Sign in with email
            </button>
          </>
        ) : (
          <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={ADMIN_EMAIL}
                required
                autoFocus
              />
            </div>
            <div>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <div style={{ fontSize: '12px', color: 'var(--red)', textAlign: 'center' }}>
                ❌ {error}
              </div>
            )}
            <button className="btn btn-p" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn btn-s btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => { setShowEmailForm(false); setError(''); }}
            >
              ← Back
            </button>
          </form>
        )}

        {error && !showEmailForm && (
          <div className="login-status" style={{ color: 'var(--red)' }}>❌ {error}</div>
        )}
      </div>
    </div>
  );
}
