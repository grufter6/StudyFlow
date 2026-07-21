import { useState } from 'react';
import { useStudyFlow } from '../contexts/StudyFlowContext';
import { sb } from '../lib/supabase';
import { toast } from 'sonner';

const THEMES = [
  { id: 'dusk', label: 'Dusk', swatch: '#7c8fff' },
  { id: 'forest', label: 'Forest', swatch: '#4fd68a' },
  { id: 'sunset', label: 'Sunset', swatch: '#f0b256' },
  { id: 'rose', label: 'Rose', swatch: '#f27ba0' },
];

const FONT_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

export default function ProfileSetup({ onDone, mode = 'onboarding' }: { onDone: () => void; mode?: 'onboarding' | 'edit' }) {
  const { currentUser, settings, saveSettings } = useStudyFlow();
  const [avatarUrl, setAvatarUrl] = useState(settings.avatar_url);
  const [theme, setTheme] = useState(settings.theme || 'dusk');
  const [fontSize, setFontSize] = useState(settings.font_size || 'medium');
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Please choose an image under 3MB.');
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${currentUser.id}/avatar.${ext}`;
    const { error: uploadError } = await sb.storage.from('avatars').upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error('Upload failed: ' + uploadError.message);
      setUploading(false);
      return;
    }
    const { data } = sb.storage.from('avatars').getPublicUrl(path);
    // Cache-bust so the new image shows immediately even with the same filename
    setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`);
    setUploading(false);
  }

  function handleSave() {
    saveSettings({ avatar_url: avatarUrl, theme, font_size: fontSize, profile_setup_done: true });
    onDone();
  }

  return (
    <div className="gp-page">
      <div className="gp-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="gp-badge">🎨</span>
          <span className="gp-title">{mode === 'onboarding' ? 'Set up your profile' : 'Profile & appearance'}</span>
        </div>
        {mode === 'edit' && (
          <button className="btn btn-s btn-sm" onClick={onDone}>← Back to Schedule</button>
        )}
      </div>

      <div className="gp-content" style={{ maxWidth: 460 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
          {mode === 'onboarding'
            ? "Quick setup before you get started — you can change any of this later."
            : 'Update your picture, theme, and text size.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%', overflow: 'hidden',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
          }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : '🙂'}
          </div>
          <label className="btn btn-s btn-sm" style={{ cursor: 'pointer' }}>
            {uploading ? 'Uploading...' : avatarUrl ? 'Change photo' : 'Upload photo'}
            <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
          </label>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12.5, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Theme</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '10px 6px', borderRadius: 10, cursor: 'pointer',
                  background: theme === t.id ? 'var(--surface-2)' : 'transparent',
                  border: theme === t.id ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                }}
              >
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: t.swatch }} />
                <span style={{ fontSize: 11.5, color: 'var(--text)' }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={{ fontSize: 12.5, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Text size</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {FONT_SIZES.map((f) => (
              <button
                key={f.id}
                className={fontSize === f.id ? 'btn btn-p btn-sm' : 'btn btn-s btn-sm'}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setFontSize(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }} onClick={handleSave}>
          {mode === 'onboarding' ? 'Continue →' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
