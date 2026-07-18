import { useState, useEffect } from 'react';
import { useStudyFlow } from '../contexts/StudyFlowContext';
import { buildSchedule, toTime, fmt, toMins, sleepHrs, WDAYS, nowMins, parseMins } from '../lib/schedule.ts';
import { searchSchools } from '../lib/schools';
import { toast } from 'sonner';

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

  const [showModal, setShowModal] = useState(false);
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
      const res = await fetch('/api/canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasUrl: url, token, path: '/api/v1/courses' }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setCanvasStatus(`✓ Connected! Found ${data.length} courses`);
        toast.success(`Imported ${data.length} courses from Canvas`);
      } else {
        setCanvasStatus('✗ Connection failed');
        toast.error(data.error || 'Failed to connect to Canvas');
      }
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
                {currentUser?.user_metadata?.avatar_url ? (
                  <img src={currentUser.user_metadata.avatar_url} alt="avatar" />
                ) : (
                  (currentUser?.email?.[0] || 'S').toUpperCase()
                )}
              </div>
              <div className="user-name">{currentUser?.email || 'Student'}</div>
              <span className="sync-dot" style={{ background: isSyncing ? 'var(--amber)' : 'var(--green)' }}></span>
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

      <style>{`
        .login-screen {
          position: fixed;
          inset: 0;
          background: var(--bg);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 500;
          flex-direction: column;
          gap: 0;
        }
        .login-box {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 36px 32px;
          width: 340px;
          max-width: 92vw;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .login-logo {
          font-size: 48px;
          margin-bottom: 4px;
        }
        .login-title {
          font-size: 24px;
          font-weight: 700;
        }
        .login-sub {
          font-size: 13px;
          color: var(--muted);
          margin-top: -8px;
        }
        .login-divider {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--muted);
          font-size: 12px;
        }
        .login-divider::before,
        .login-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border);
        }
        .user-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: var(--card);
          border-radius: 8px;
        }
        .avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
          overflow: hidden;
        }
        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .user-name {
          flex: 1;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .btn-signout {
          background: none;
          border: none;
          color: var(--muted);
          cursor: pointer;
          font-size: 11px;
          font-family: var(--f);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .btn-signout:hover {
          color: var(--red);
        }
        .sync-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 4px;
        }
        .app {
          display: flex;
          height: 100vh;
          overflow: hidden;
        }
        .sb {
          width: 272px;
          min-width: 272px;
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
        }
        .sb-head {
          padding: 16px 14px 12px;
          border-bottom: 1px solid var(--border);
        }
        .sb-head h1 {
          font-size: 18px;
          font-weight: 700;
        }
        .sb-head p {
          color: var(--muted);
          font-size: 11px;
          margin-top: 2px;
        }
        .sb-body {
          flex: 1;
          overflow-y: auto;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .sb-foot {
          padding: 12px 14px;
          border-top: 1px solid var(--border);
        }
        .sleep-row {
          display: flex;
          gap: 8px;
        }
        .sleep-row > div {
          flex: 1;
        }
        .c-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 8px;
        }
        .c-item {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 10px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .c-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-top: 5px;
          flex-shrink: 0;
        }
        .c-info {
          flex: 1;
          min-width: 0;
        }
        .c-name {
          font-weight: 500;
          font-size: 13px;
        }
        .c-meta {
          font-size: 11px;
          color: var(--muted);
          margin-top: 1px;
        }
        .btn-x {
          background: none;
          border: none;
          color: var(--muted);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding: 0;
        }
        .btn-x:hover {
          color: var(--red);
        }
        .add-form {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .days-row {
          display: flex;
          gap: 3px;
          flex-wrap: wrap;
        }
        .day-btn {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 3px 7px;
          font-size: 11px;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s;
          font-family: var(--f);
        }
        .day-btn.on {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
        }
        .t-row {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .t-row span {
          color: var(--muted);
          font-size: 12px;
          flex-shrink: 0;
        }
        .main {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .main-head {
          padding: 16px 22px 12px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-shrink: 0;
        }
        .main-head h1 {
          font-size: 18px;
          font-weight: 700;
        }
        .main-head p {
          color: var(--muted);
          font-size: 12px;
          margin-top: 1px;
        }
        .main-body {
          flex: 1;
          overflow-y: auto;
          padding: 18px 22px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .stats {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .stat {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 14px;
        }
        .stat .v {
          font-size: 18px;
          font-weight: 700;
        }
        .stat .l {
          font-size: 11px;
          color: var(--muted);
        }
        .add-box {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px;
        }
        .a-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }
        .a-row {
          display: flex;
          gap: 8px;
        }
        .a-row > * {
          flex: 1;
        }
        .a-row > input {
          flex: 2;
        }
        .a-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 10px;
        }
        .a-item {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 9px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .a-item-info {
          flex: 1;
          min-width: 0;
        }
        .a-item-name {
          font-weight: 500;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .a-item-meta {
          font-size: 11px;
          color: var(--muted);
          margin-top: 1px;
        }
        .sched {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .blk {
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          border: 1px solid var(--border);
        }
        .blk-class {
          background: #141e36;
          border-color: #1e3460;
        }
        .blk-activity {
          background: #1a1430;
          border-color: #2e1e5a;
        }
        .blk-hw {
          background: var(--card);
        }
        .blk-study {
          background: #0d1e14;
          border-color: #1a3826;
        }
        .blk-sleep {
          background: #0a1818;
          border-color: #143030;
        }
        .blk-break {
          background: #141a10;
          border-color: #243416;
        }
        .blk-dinner {
          background: #1a1200;
          border-color: #3a2800;
        }
        .blk-shower {
          background: #0e1520;
          border-color: #1e2a40;
        }
        .blk-done {
          opacity: 0.4;
        }
        .blk-time {
          font-size: 12px;
          color: var(--muted);
          min-width: 72px;
          padding-top: 2px;
          font-variant-numeric: tabular-nums;
        }
        .blk-body {
          flex: 1;
        }
        .blk-title {
          font-weight: 500;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .pill {
          display: inline-block;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .p-class {
          background: #1e3a6e;
          color: #7eb4ff;
        }
        .p-activity {
          background: #2e1a5e;
          color: #b49aff;
        }
        .p-hw {
          background: #2a2000;
          color: var(--amber);
        }
        .p-study {
          background: #0d2a1a;
          color: var(--green);
        }
        .p-sleep {
          background: #0a2020;
          color: var(--teal);
        }
        .p-break {
          background: #1a2610;
          color: #7acd6a;
        }
        .p-dinner {
          background: #3a2800;
          color: #f59e0b;
        }
        .p-shower {
          background: #1e2a40;
          color: #93c5fd;
        }
        .blk-acts {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .mark-btn {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--muted);
          cursor: pointer;
          font-size: 12px;
          padding: 4px 10px;
          font-family: var(--f);
          transition: all 0.15s;
        }
        .mark-btn:hover {
          background: var(--green);
          border-color: var(--green);
          color: #000;
        }
        .done-lbl {
          background: #0d2a1a;
          border: 1px solid var(--green);
          border-radius: 6px;
          color: var(--green);
          font-size: 12px;
          padding: 4px 10px;
        }
        .tag {
          font-size: 11px;
          color: var(--muted);
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 3px 8px;
        }
        .split-tag {
          font-size: 11px;
          color: var(--purple);
          background: #1a1030;
          border: 1px solid #3a2060;
          border-radius: 5px;
          padding: 3px 8px;
        }
        .nudge {
          background: #0d2a1a;
          border: 1px solid #1a5a30;
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 13px;
          color: var(--teal);
        }
        .empty {
          text-align: center;
          padding: 48px 20px;
          color: var(--muted);
        }
        .empty .ico {
          font-size: 40px;
          margin-bottom: 10px;
        }
        .empty p {
          font-size: 13px;
        }
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
        }
        .modal {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 22px;
          width: 340px;
          max-width: 92vw;
        }
        .modal h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .modal p {
          font-size: 13px;
          color: var(--muted);
          margin-bottom: 14px;
        }
        .modal-btns {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 12px;
        }
        .btn {
          border: none;
          border-radius: 7px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          padding: 7px 14px;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-family: var(--f);
        }
        .btn-p {
          background: var(--accent);
          color: #fff;
        }
        .btn-p:hover {
          filter: brightness(1.15);
        }
        .btn-s {
          background: var(--card);
          border: 1px solid var(--border);
          color: var(--text);
        }
        .btn-s:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .btn-sm {
          padding: 5px 10px;
          font-size: 12px;
        }
        .btn-cram {
          background: #b91c1c;
          color: #fff;
          font-weight: 700;
          width: 100%;
          justify-content: center;
          font-size: 14px;
          padding: 10px;
          border: none;
          border-radius: 7px;
          cursor: pointer;
          font-family: var(--f);
        }
        .btn-cram:hover {
          background: #dc2626;
        }
        .btn-gen {
          background: var(--accent);
          color: #fff;
          font-size: 14px;
          padding: 9px 20px;
        }
        .btn-gen:hover {
          filter: brightness(1.12);
        }
        .btn-google {
          background: #fff;
          color: #222;
          font-weight: 600;
          font-size: 14px;
          padding: 12px 20px;
          border-radius: 8px;
          width: 100%;
          justify-content: center;
          gap: 10px;
          border: none;
          cursor: pointer;
          font-family: var(--f);
        }
        .btn-google:hover {
          background: #f0f0f0;
        }
        input,
        select {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text);
          font-size: 13px;
          padding: 7px 10px;
          outline: none;
          transition: border-color 0.15s;
          width: 100%;
          font-family: var(--f);
        }
        input:focus,
        select:focus {
          border-color: var(--accent);
        }
        input::placeholder {
          color: var(--muted);
        }
        select option {
          background: var(--surface);
        }
        label {
          font-size: 12px;
          color: var(--muted);
          display: block;
          margin-bottom: 4px;
        }
        h2 {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--muted);
          margin-bottom: 10px;
        }
        ::-webkit-scrollbar {
          width: 4px;
        }
        ::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
