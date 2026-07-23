import { useState, useEffect } from 'react';
import { useStudyFlow } from '../contexts/StudyFlowContext';
import { buildSchedule, toTime, fmt, toMins, sleepHrs, WDAYS, nowMins, parseMins } from '../lib/schedule.ts';
import { searchSchools } from '../lib/schools';
import { toast } from 'sonner';
import GradeForecast from '../components/GradeForecast';
import ProfileSetup from './ProfileSetup';
import { canvasGetName } from '../lib/canvasApi';

export default function Dashboard() {
  const {
    currentUser, isAdmin, signOut, commitments, setCommitments, assignments, setAssignments,
    schedule, setSchedule, timingHistory, settings, saveSettings, saveAssignment, deleteAssignment,
    addCommitment, removeCommitment, isSyncing, dataLoaded,
  } = useStudyFlow();

  const [showCommitmentForm, setShowCommitmentForm] = useState(false);
  const [cfName, setCfName] = useState('');
  const [cfDays, setCfDays] = useState<string[]>([]);
  const [cfStart, setCfStart] = useState('09:00');
  const [cfEnd, setCfEnd] = useState('10:00');
  const [cfType, setCfType] = useState<'class' | 'activity'>('class');

  const [aName, setAName] = useState('');
  const [aType, setAType] = useState<'hw' | 'study'>('hw');
  const [aDue, setADue] = useState('1');
  const [aHrs, setAHrs] = useState('1');

  const [schoolQuery, setSchoolQuery] = useState('');
  const [schoolSuggestions, setSchoolSuggestions] = useState<any[]>([]);
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);

  const [canvasStatus, setCanvasStatus] = useState('');
  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasName, setCanvasName] = useState('');
  const [canvasNameLoading, setCanvasNameLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [showGradeForecast, setShowGradeForecast] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [modalCallback, setModalCallback] = useState<((val: string | null) => void) | null>(null);
  const [markedBlockIdx, setMarkedBlockIdx] = useState<number | null>(null);

  const [stats, setStats] = useState({ tasks: 0, taskMins: 0, sleepH: 0, freeMins: 0 });

  // Handle school autocomplete
  useEffect(() => {
    if (schoolQuery.length >= 2) {
      const results = searchSchools(schoolQuery);
      setSchoolSuggestions(results);
      setShowSchoolDropdown(true);
    } else {
      setSchoolSuggestions([]);
      setShowSchoolDropdown(false);
    }
  }, [schoolQuery]);

  // Auto-fetch and display the user's Canvas name as soon as both the
  // school URL and API token are filled in — mirrors the standalone Canvas
  // app's behavior, without requiring a full "Connect & import" click first.
  useEffect(() => {
    const url = settings.canvas_url;
    const tok = settings.canvas_token;
    if (!url || !tok) {
      setCanvasName('');
      return;
    }
    let cancelled = false;
    setCanvasNameLoading(true);
    const timer = setTimeout(() => {
      canvasGetName(url, tok).then((name) => {
        if (cancelled) return;
        setCanvasNameLoading(false);
        setCanvasName(name || '');
      });
    }, 700);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [settings.canvas_url, settings.canvas_token]);

  function selectSchool(url: string) {
    saveSettings({ canvas_url: url });
    setSchoolQuery('');
    setShowSchoolDropdown(false);
  }

  async function fetchCanvas() {
    const url = settings.canvas_url.trim();
    const token = settings.canvas_token.trim();
    if (!url || !token) {
      toast.error('Please enter both Canvas URL and API token');
      return;
    }
    setCanvasLoading(true);
    setCanvasStatus('Connecting...');
    try {
      const coursesRes = await fetch('/api/canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasUrl: url, token, path: '/api/v1/courses?enrollment_state=active&per_page=50' }),
      });
      const courses = await coursesRes.json();
      if (!coursesRes.ok || !Array.isArray(courses)) {
        setCanvasStatus('✗ Connection failed');
        toast.error(courses.error || 'Failed to connect to Canvas');
        setCanvasLoading(false);
        return;
      }

      setCanvasStatus(`Found ${courses.length} courses — fetching assignments...`);

      // Already-imported Canvas assignments (by their Canvas ID), so
      // re-running "Connect & import" updates existing rows instead of
      // creating duplicates every time.
      const existingCanvasIds = new Set(
        assignments.filter((a) => a.canvasId).map((a) => String(a.canvasId))
      );

      let imported = 0;
      for (const course of courses) {
        const assignRes = await fetch('/api/canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canvasUrl: url,
            token,
            path: `/api/v1/courses/${course.id}/assignments?include[]=submission&order_by=due_at&per_page=100`,
          }),
        });
        const courseAssignments = await assignRes.json();
        if (!assignRes.ok || !Array.isArray(courseAssignments)) continue;

        for (const ca of courseAssignments) {
          if (!ca.due_at) continue; // skip assignments with no due date, nothing to schedule
          const dueDate = new Date(ca.due_at);
          if (isNaN(dueDate.getTime()) || dueDate.getTime() < Date.now()) continue; // skip past-due
          const submitted = ca.submission?.workflow_state === 'graded' || ca.submission?.workflow_state === 'submitted';
          if (submitted) continue;
          if (existingCanvasIds.has(String(ca.id))) continue;

          const daysFromNow = Math.max(1, Math.ceil((dueDate.getTime() - Date.now()) / 86400000));
          const newAssignment = {
            id: crypto.randomUUID(),
            name: `${ca.name}${course.course_code ? ` (${course.course_code})` : ''}`.slice(0, 200),
            type: 'hw' as const,
            due: daysFromNow,
            totalMins: 45,
            done: false,
            actualMins: null,
            canvasId: String(ca.id),
          };
          await saveAssignment(newAssignment);
          setAssignments((prev) => [...prev, newAssignment]);
          imported++;
        }
      }

      setCanvasStatus(`✓ Connected! Imported ${imported} assignment${imported === 1 ? '' : 's'} from ${courses.length} courses`);
      toast.success(imported > 0 ? `Imported ${imported} assignments from Canvas` : 'Connected — no new upcoming assignments to import');
    } catch (e: any) {
      setCanvasStatus('✗ Error: ' + e.message);
      toast.error('Canvas connection error');
    }
    setCanvasLoading(false);
  }

  async function addAssignment() {
    if (!aName.trim()) {
      toast.error('Please enter assignment name');
      return;
    }
    const a = {
      id: Date.now(),
      name: aName,
      type: aType,
      due: parseInt(aDue),
      totalMins: Math.round(parseFloat(aHrs) * 60),
      done: false,
      actualMins: null,
    };
    setAssignments((prev) => [...prev, a]);
    await saveAssignment(a);
    setAName('');
    setAType('hw');
    setADue('1');
    setAHrs('1');
    toast.success('Assignment added');
  }

  async function removeAssignmentLocal(id: string | number) {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    await deleteAssignment(id);
  }

  async function saveCommitmentLocal() {
    if (!cfName.trim() || !cfDays.length) {
      toast.error('Please fill in all fields');
      return;
    }
    await addCommitment({ name: cfName, days: cfDays, start: cfStart, end: cfEnd, type: cfType });
    setCfName('');
    setCfDays([]);
    setCfStart('09:00');
    setCfEnd('10:00');
    setCfType('class');
    setShowCommitmentForm(false);
    toast.success('Commitment added');
  }

  async function removeCommitmentLocal(id: string | number) {
    await removeCommitment(id);
  }

  function toggleDay(day: string) {
    setCfDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  }

  function generateSchedule(cramTonight: boolean = false) {
    const pending = assignments.filter((a) => !a.done);
    if (!pending.length) {
      toast.error('Add at least one assignment first!');
      return;
    }
    const result = buildSchedule({
      assignments: pending,
      commitments,
      sleepStart: settings.sleep_start,
      sleepEnd: settings.sleep_end,
      maxChunk: settings.max_chunk,
      eveStart: settings.eve_start,
      dinnerTime: settings.dinner_time,
      dinnerDur: settings.dinner_dur,
      showerDur: settings.shower_dur,
      cramTonight,
      history: timingHistory,
    });
    setSchedule(result.schedule);
    setStats(result.stats);
    if (result.unplaced.length) {
      toast.warning(`Not enough time for: ${result.unplaced.map((a) => a.name).join(', ')}`);
    }
  }

  function markDone(idx: number) {
    const b = schedule[idx];
    if (!b || b.done) return;
    setMarkedBlockIdx(idx);
    setModalInput('');
    setShowModal(true);
    setModalCallback(() => async (actual: string | null) => {
      const updatedSchedule = [...schedule];
      updatedSchedule[idx].done = true;
      setSchedule(updatedSchedule);

      if (b.assignId) {
        const allDone = updatedSchedule.filter((s) => s.assignId === b.assignId).every((s) => s.done);
        if (allDone) {
          const a = assignments.find((a) => a.id === b.assignId);
          if (a) {
            a.done = true;
            await saveAssignment(a);
          }
        }
      }

      if (actual) {
        const mins = parseMins(actual);
        if (mins && b.assignId) {
          const a = assignments.find((a) => a.id === b.assignId);
          if (a) {
            a.actualMins = mins;
            await saveAssignment(a);
          }
        }
      }
      setShowModal(false);
      setModalCallback(null);
    });
  }

  if (!dataLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>
        Loading your data...
      </div>
    );
  }

  const dayName = WDAYS[new Date().getDay()];
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="app">
      {/* SIDEBAR */}
      <div className="sb">
        <div className="sb-head">
          <h1>🎒 StudyFlow {isAdmin && '👑'}</h1>
          <p>Your evening, planned for you</p>
        </div>
        <div className="sb-body">
          {/* USER */}
          <div>
            <h2>Account</h2>
            <div className="user-bar">
              <div className="avatar">
                {settings.avatar_url || currentUser?.user_metadata?.avatar_url ? (
                  <img src={settings.avatar_url || currentUser.user_metadata.avatar_url} alt="avatar" />
                ) : (
                  (currentUser?.email?.[0] || 'S').toUpperCase()
                )}
              </div>
              <div className="user-name">{currentUser?.email || 'Student'}</div>
              <span className="sync-dot" style={{ background: isSyncing ? 'var(--amber)' : 'var(--green)' }}></span>
              <button className="btn-signout" onClick={() => setShowProfileSetup(true)} style={{ marginRight: 6 }}>
                🎨 Profile
              </button>
              <button className="btn-signout" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>

          {/* CANVAS */}
          <div>
            <h2>Canvas Integration</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label>Canvas School URL</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={schoolQuery || settings.canvas_url}
                    onChange={(e) => setSchoolQuery(e.target.value)}
                    placeholder="Type school name or URL"
                    onFocus={() => schoolQuery.length >= 2 && setShowSchoolDropdown(true)}
                  />
                  {showSchoolDropdown && schoolSuggestions.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        marginTop: '4px',
                        zIndex: 10,
                        maxHeight: '200px',
                        overflowY: 'auto',
                      }}
                    >
                      {schoolSuggestions.map((s) => (
                        <div
                          key={s.url}
                          onClick={() => selectSchool(s.url)}
                          style={{
                            padding: '8px 10px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border)',
                            fontSize: '12px',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ fontWeight: 500 }}>{s.name}</div>
                          <div style={{ color: 'var(--muted)', fontSize: '11px' }}>{s.url}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label>API Token</label>
                <input
                  type="password"
                  value={settings.canvas_token}
                  onChange={(e) => saveSettings({ canvas_token: e.target.value })}
                  placeholder="Paste your token here"
                />
              </div>
              {canvasNameLoading && (
                <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>
                  Checking Canvas...
                </div>
              )}
              {!canvasNameLoading && canvasName && (
                <div style={{ fontSize: '12px', color: 'var(--accent, #6c5ce7)', textAlign: 'center', fontWeight: 500 }}>
                  👋 Connected as {canvasName}
                </div>
              )}
              <button
                className="btn btn-p btn-sm"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={fetchCanvas}
                disabled={canvasLoading}
              >
                🔗 {canvasLoading ? 'Connecting...' : 'Connect & import'}
              </button>
              {canvasStatus && (
                <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>
                  {canvasStatus}
                </div>
              )}
              {settings.canvas_url && settings.canvas_token && (
                <button
                  className="btn btn-s btn-sm"
                  style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                  onClick={() => setShowGradeForecast(true)}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18, borderRadius: 5,
                    background: 'var(--accent, #6c5ce7)', color: '#fff',
                    fontSize: 9, fontWeight: 700,
                  }}>
                    GP
                  </span>
                  GradePlus
                </button>
              )}
            </div>
          </div>

          {/* SLEEP */}
          <div>
            <h2>Sleep window</h2>
            <div className="sleep-row">
              <div>
                <label>Bedtime</label>
                <input
                  type="time"
                  value={settings.sleep_start}
                  onChange={(e) => saveSettings({ sleep_start: e.target.value })}
                />
              </div>
              <div>
                <label>Wake up</label>
                <input
                  type="time"
                  value={settings.sleep_end}
                  onChange={(e) => saveSettings({ sleep_end: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* PREFS */}
          <div>
            <h2>Preferences</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label>Max study block</label>
                <select
                  value={settings.max_chunk}
                  onChange={(e) => saveSettings({ max_chunk: parseInt(e.target.value) })}
                >
                  <option value="45">45 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                </select>
              </div>
              <div>
                <label>Evening starts at</label>
                <input
                  type="time"
                  value={settings.eve_start}
                  onChange={(e) => saveSettings({ eve_start: e.target.value })}
                />
              </div>
              <div>
                <label>Dinner time</label>
                <input
                  type="time"
                  value={settings.dinner_time}
                  onChange={(e) => saveSettings({ dinner_time: e.target.value })}
                />
              </div>
              <div>
                <label>Dinner duration</label>
                <select
                  value={settings.dinner_dur}
                  onChange={(e) => saveSettings({ dinner_dur: parseInt(e.target.value) })}
                >
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">1 hour</option>
                </select>
              </div>
              <div>
                <label>Shower & wind-down</label>
                <select
                  value={settings.shower_dur}
                  onChange={(e) => saveSettings({ shower_dur: parseInt(e.target.value) })}
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                </select>
              </div>
            </div>
          </div>

          {/* COMMITMENTS */}
          <div>
            <h2>Classes & activities</h2>
            <div className="c-list">
              {commitments.map((c) => (
                <div key={c.id} className="c-item">
                  <div
                    className="c-dot"
                    style={{ background: c.type === 'class' ? '#6c8aff' : '#a78bfa' }}
                  ></div>
                  <div className="c-info">
                    <div className="c-name">{c.name}</div>
                    <div className="c-meta">
                      {c.days.join(', ')} · {fmt(c.start)}–{fmt(c.end)}
                    </div>
                  </div>
                  <button className="btn-x" onClick={() => removeCommitmentLocal(c.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            {showCommitmentForm && (
              <div className="add-form">
                <div>
                  <label>Name</label>
                  <input
                    type="text"
                    value={cfName}
                    onChange={(e) => setCfName(e.target.value)}
                    placeholder="e.g. Chemistry, Soccer"
                  />
                </div>
                <div>
                  <label>Days</label>
                  <div className="days-row">
                    {WDAYS.slice(1).map((d) => (
                      <button
                        key={d}
                        className={`day-btn ${cfDays.includes(d) ? 'on' : ''}`}
                        onClick={() => toggleDay(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="t-row">
                  <input
                    type="time"
                    value={cfStart}
                    onChange={(e) => setCfStart(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={cfEnd}
                    onChange={(e) => setCfEnd(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <select value={cfType} onChange={(e) => setCfType(e.target.value as any)}>
                  <option value="class">Class</option>
                  <option value="activity">Extracurricular</option>
                </select>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-p btn-sm" style={{ flex: 1 }} onClick={saveCommitmentLocal}>
                    Add
                  </button>
                  <button className="btn btn-s btn-sm" onClick={() => setShowCommitmentForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <button
              className="btn btn-s btn-sm"
              style={{ width: '100%', marginTop: '6px', justifyContent: 'center' }}
              onClick={() => setShowCommitmentForm(!showCommitmentForm)}
            >
              + Add commitment
            </button>
          </div>
        </div>
        <div className="sb-foot">
          <button className="btn btn-cram" onClick={() => generateSchedule(true)}>
            ⚡ Cram mode
          </button>
          <p style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', marginTop: '6px' }}>
            Fit everything into tonight
          </p>
        </div>
      </div>

      {/* MAIN */}
      <div className="main">
        <div className="main-head">
          <div>
            <h1>Tonight's plan</h1>
            <p>{dateStr}</p>
          </div>
          <button className="btn btn-gen" onClick={() => generateSchedule(false)}>
            Generate schedule
          </button>
        </div>
        <div className="main-body">
          {stats.tasks > 0 && (
            <div className="stats">
              <div className="stat">
                <div className="v">{stats.tasks}</div>
                <div className="l">pending</div>
              </div>
              <div className="stat">
                <div className="v">{(stats.taskMins / 60).toFixed(1)}h</div>
                <div className="l">study time</div>
              </div>
              <div className="stat">
                <div className="v">{stats.sleepH.toFixed(1)}h</div>
                <div className="l">sleep</div>
              </div>
              <div className="stat">
                <div className="v">{stats.freeMins > 0 ? Math.round(stats.freeMins) + 'min' : '—'}</div>
                <div className="l">free time</div>
              </div>
            </div>
          )}

          <div className="add-box">
            <h2>Add assignment</h2>
            <div className="a-grid">
              <input
                type="text"
                value={aName}
                onChange={(e) => setAName(e.target.value)}
                placeholder="Assignment name"
                onKeyDown={(e) => e.key === 'Enter' && addAssignment()}
              />
              <div className="a-row">
                <select value={aType} onChange={(e) => setAType(e.target.value as any)}>
                  <option value="hw">Homework</option>
                  <option value="study">Study / test prep</option>
                </select>
                <select value={aDue} onChange={(e) => setADue(e.target.value)}>
                  <option value="1">Due tomorrow</option>
                  <option value="2">Due in 2 days</option>
                  <option value="3">Due in 3 days</option>
                  <option value="5">Due in 5 days</option>
                  <option value="7">Due in a week</option>
                </select>
                <select value={aHrs} onChange={(e) => setAHrs(e.target.value)}>
                  <option value="0.5">30 min</option>
                  <option value="1">1 hour</option>
                  <option value="1.5">1.5 hours</option>
                  <option value="2">2 hours</option>
                  <option value="3">3 hours</option>
                  <option value="4">4 hours</option>
                </select>
                <button className="btn btn-p" onClick={addAssignment}>
                  Add
                </button>
              </div>
              <div className="a-list">
                {assignments
                  .filter((a) => !a.done)
                  .map((a) => (
                    <div key={a.id} className="a-item">
                      <span className={`pill ${a.type === 'hw' ? 'p-hw' : 'p-study'}`}>
                        {a.type === 'hw' ? 'HW' : 'Study'}
                      </span>
                      <div className="a-item-info">
                        <div className="a-item-name">{a.name}</div>
                        <div className="a-item-meta">
                          Due in {a.due} day{a.due > 1 ? 's' : ''} · {a.totalMins >= 60 ? (a.totalMins / 60).toFixed(1) + 'h' : a.totalMins + 'min'}
                        </div>
                      </div>
                      <button className="btn-x" onClick={() => removeAssignmentLocal(a.id)}>
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div>
            <h2>Schedule</h2>
            <div className="sched">
              {schedule.length === 0 ? (
                <div className="empty">
                  <div className="ico">📅</div>
                  <p>
                    Add an assignment above, then hit <strong>Generate schedule</strong>
                  </p>
                </div>
              ) : (
                schedule.map((b, i) => {
                  if (b.kind === 'nudge') {
                    return (
                      <div key={i} className="nudge">
                        🌙 {b.name}
                      </div>
                    );
                  }
                  const bClass = {
                    class: 'blk-class',
                    activity: 'blk-activity',
                    sleep: 'blk-sleep',
                    break: 'blk-break',
                    dinner: 'blk-dinner',
                    shower: 'blk-shower',
                    assignment: b.atype === 'study' ? 'blk-study' : 'blk-hw',
                  }[b.kind] || 'blk-hw';
                  const pill = {
                    class: '<span class="pill p-class">Class</span>',
                    activity: '<span class="pill p-activity">Activity</span>',
                    sleep: '<span class="pill p-sleep">Sleep</span>',
                    break: '<span class="pill p-break">Break</span>',
                    dinner: '<span class="pill p-dinner">Dinner</span>',
                    shower: '<span class="pill p-shower">Wind-down</span>',
                  }[b.kind] || (b.atype === 'study' ? '<span class="pill p-study">Study</span>' : '<span class="pill p-hw">Homework</span>');
                  const dur = b.end - b.start;
                  return (
                    <div key={i} className={`blk ${bClass}${b.done ? ' blk-done' : ''}`}>
                      <div className="blk-time">
                        {toTime(b.start)} – {toTime(b.end)}
                      </div>
                      <div className="blk-body">
                        <div className="blk-title">
                          <span dangerouslySetInnerHTML={{ __html: pill }}></span>
                          {b.name}
                        </div>
                        {b.kind === 'assignment' && (
                          <div className="blk-acts">
                            {b.done ? (
                              <span className="done-lbl">✓ Done</span>
                            ) : (
                              <button className="mark-btn" onClick={() => markDone(i)}>
                                ✓ Mark done
                              </button>
                            )}
                            <span className="tag">{dur} min</span>
                            {b.totalDays && b.totalDays > 1 && (
                              <span className="split-tag">Day 1 of {b.totalDays}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL */}
      {showGradeForecast && <GradeForecast onClose={() => setShowGradeForecast(false)} />}
      {showProfileSetup && <ProfileSetup mode="edit" onDone={() => setShowProfileSetup(false)} />}

      {showModal && (
        <div className="overlay">
          <div className="modal">
            <h3>Nice work! ✅</h3>
            <p>How long did that actually take? This helps StudyFlow estimate better next time.</p>
            <input
              type="text"
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              placeholder="e.g. 45 minutes, 1.5 hours"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  modalCallback?.(modalInput);
                  setShowModal(false);
                }
              }}
              autoFocus
            />
            <div className="modal-btns">
              <button className="btn btn-s btn-sm" onClick={() => { setShowModal(false); modalCallback?.(null); }}>
                Skip
              </button>
              <button className="btn btn-p btn-sm" onClick={() => { modalCallback?.(modalInput); }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
