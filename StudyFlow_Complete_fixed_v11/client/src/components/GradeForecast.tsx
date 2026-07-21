import { useEffect, useState } from 'react';
import { useStudyFlow } from '../contexts/StudyFlowContext';
import { canvasFetch, canvasGetName } from '../lib/canvasApi';

interface Course {
  id: number;
  name: string;
  course_code?: string;
}

interface CanvasAssignment {
  id: number;
  name: string;
  points_possible: number | null;
  due_at: string | null;
  submission?: { score?: number | null };
}

export default function GradeForecast({ onClose }: { onClose: () => void }) {
  const { settings } = useStudyFlow();
  const canvasUrl = settings.canvas_url;
  const token = settings.canvas_token;

  const [courses, setCourses] = useState<Course[]>([]);
  const [userName, setUserName] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<CanvasAssignment[]>([]);
  const [whatIf, setWhatIf] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canvasUrl || !token) {
      setError('Connect Canvas in Settings first (school URL + API token).');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    canvasGetName(canvasUrl, token).then((name) => { if (name) setUserName(name); });
    canvasFetch(canvasUrl, token, '/api/v1/courses?enrollment_state=active&per_page=50')
      .then((data) => {
        if (Array.isArray(data)) setCourses(data);
        else throw new Error('Unexpected response from Canvas.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [canvasUrl, token]);

  function openCourse(course: Course) {
    setSelectedCourse(course);
    setWhatIf({});
    setAssignments([]);
    setLoading(true);
    setError('');
    canvasFetch(
      canvasUrl,
      token,
      `/api/v1/courses/${course.id}/assignments?include[]=submission&order_by=due_at&per_page=100`
    )
      .then((data) => {
        if (Array.isArray(data)) setAssignments(data);
        else throw new Error('Unexpected response from Canvas.');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function whatIfScore(a: CanvasAssignment): number | null {
    const override = whatIf[`${a.id}`];
    if (override !== undefined && override !== '') return parseFloat(override);
    return a.submission?.score ?? null;
  }

  function computeGrade(): number | null {
    let earned = 0;
    let possible = 0;
    for (const a of assignments) {
      const score = whatIfScore(a);
      if (score === null || a.points_possible === null) continue;
      earned += score;
      possible += a.points_possible;
    }
    if (possible === 0) return null;
    return (earned / possible) * 100;
  }

  const grade = selectedCourse ? computeGrade() : null;
  const hasOverrides = Object.values(whatIf).some((v) => v !== '');

  return (
    <div className="gp-page">
      <div className="gp-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="gp-badge">GP</span>
          <span className="gp-title">GradePlus{userName ? ` — ${userName}` : ''}</span>
        </div>
        <button className="btn btn-s btn-sm" onClick={onClose}>← Back to Schedule</button>
      </div>

      <div className="gp-content">
        {selectedCourse ? (
          <>
            <button
              className="btn btn-s btn-sm"
              style={{ marginBottom: 12 }}
              onClick={() => { setSelectedCourse(null); setAssignments([]); setError(''); }}
            >
              ← Back to courses
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ margin: 0 }}>{selectedCourse.name}</h3>
              {grade != null && (
                <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent, #6c5ce7)' }}>
                  {grade.toFixed(1)}%
                </span>
              )}
            </div>
            {hasOverrides && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 0 }}>
                Showing what-if grade with your edits
              </p>
            )}

            {loading && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading assignments...</p>}
            {error && <p style={{ fontSize: 13, color: '#e05555' }}>{error}</p>}

            {!loading && !error && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 8 }}>
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 4px', borderBottom: '1px solid var(--border, #333)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {a.due_at ? new Date(a.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date'}
                        {' · out of '}{a.points_possible ?? '—'}
                      </div>
                    </div>
                    <input
                      style={{ width: 64, textAlign: 'right', padding: '4px 6px', fontSize: 13 }}
                      placeholder={a.submission?.score != null ? `${a.submission.score}` : '—'}
                      value={whatIf[`${a.id}`] ?? ''}
                      onChange={(e) => setWhatIf((prev) => ({ ...prev, [`${a.id}`]: e.target.value }))}
                    />
                  </div>
                ))}
                {assignments.length > 0 && (
                  <button
                    className="btn btn-s btn-sm"
                    style={{ marginTop: 12, alignSelf: 'flex-start' }}
                    onClick={() => setWhatIf({})}
                  >
                    Reset what-if edits
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {courses.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0, marginBottom: 12 }}>
                Pick a class to see your grade and try what-if scores.
              </p>
            )}
            {loading && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading courses...</p>}
            {error && <p style={{ fontSize: 13, color: '#e05555' }}>{error}</p>}
            {!loading && !error && courses.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>No active courses found on Canvas.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {courses.map((c) => (
                <button
                  key={c.id}
                  className="btn btn-s btn-sm"
                  style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
                  onClick={() => openCourse(c)}
                >
                  <span>{c.name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>{c.course_code || ''}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
