import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ADMIN_EMAIL, type Assignment, type Commitment, type ScheduleBlock, type TimingHistory, type UserSettings, sb } from '../lib/supabase';

interface StudyFlowContextType {
  // Auth
  currentUser: any;
  isAdmin: boolean;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  authLoading: boolean;

  // Data
  commitments: Commitment[];
  setCommitments: React.Dispatch<React.SetStateAction<Commitment[]>>;
  assignments: Assignment[];
  setAssignments: React.Dispatch<React.SetStateAction<Assignment[]>>;
  schedule: ScheduleBlock[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleBlock[]>>;
  timingHistory: TimingHistory;
  setTimingHistory: React.Dispatch<React.SetStateAction<TimingHistory>>;
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;

  // Sync
  isSyncing: boolean;
  saveSettings: (partial?: Partial<UserSettings>) => void;
  saveAssignment: (a: Assignment) => Promise<void>;
  deleteAssignment: (id: string | number) => Promise<void>;
  addCommitment: (c: Omit<Commitment, 'id'>) => Promise<void>;
  removeCommitment: (id: string | number) => Promise<void>;
  dataLoaded: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  user_id: '',
  sleep_start: '22:30',
  sleep_end: '07:00',
  eve_start: '15:00',
  max_chunk: 60,
  dinner_time: '18:00',
  dinner_dur: 30,
  shower_dur: 30,
  canvas_url: '',
  canvas_token: '',
};

const StudyFlowContext = createContext<StudyFlowContextType | null>(null);

export function StudyFlowProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [timingHistory, setTimingHistory] = useState<TimingHistory>({});
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSettingsRef = useRef<UserSettings | null>(null);

  const isAdmin = currentUser?.email === ADMIN_EMAIL;

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function signInGoogle() {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) toast.error(error.message);
  }

  async function signInEmail(email: string, password: string) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    // Flush pending settings save before signing out so nothing is lost
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (pendingSettingsRef.current) {
      await doSaveSettings(pendingSettingsRef.current);
      pendingSettingsRef.current = null;
    }
    await sb.auth.signOut();
  }

  // ── Load data ─────────────────────────────────────────────────────────────
  async function loadUserData(uid: string) {
    setIsSyncing(true);
    try {
      // Settings (includes canvas_url + canvas_token)
      const { data: sets } = await sb
        .from('user_settings')
        .select('*')
        .eq('user_id', uid)
        .single();
      if (sets) {
        setSettings({
          user_id: uid,
          sleep_start: sets.sleep_start ?? '22:30',
          sleep_end: sets.sleep_end ?? '07:00',
          eve_start: sets.eve_start ?? '15:00',
          max_chunk: sets.max_chunk ?? 60,
          dinner_time: sets.dinner_time ?? '18:00',
          dinner_dur: sets.dinner_dur ?? 30,
          shower_dur: sets.shower_dur ?? 30,
          canvas_url: sets.canvas_url ?? '',
          canvas_token: sets.canvas_token ?? '',
        });
      } else {
        setSettings({ ...DEFAULT_SETTINGS, user_id: uid });
      }

      // Commitments
      const { data: comms } = await sb
        .from('commitments')
        .select('*')
        .eq('user_id', uid);
      const mapped: Commitment[] = (comms || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        days: c.days,
        start: c.start_time,
        end: c.end_time,
        type: c.type,
      }));
      setCommitments(
        mapped.length
          ? mapped
          : [{ id: 'default-school', name: 'School', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '08:00', end: '15:00', type: 'class' }]
      );

      // Assignments
      const { data: asgns } = await sb
        .from('assignments')
        .select('*')
        .eq('user_id', uid)
        .eq('done', false);
      setAssignments(
        (asgns || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          due: a.due,
          totalMins: a.total_mins,
          done: a.done,
          actualMins: a.actual_mins,
          canvasId: a.canvas_id,
        }))
      );

      // Timing history
      const { data: hist } = await sb
        .from('timing_history')
        .select('*')
        .eq('user_id', uid);
      const h: TimingHistory = {};
      for (const row of hist || []) {
        if (!h[row.assignment_key]) h[row.assignment_key] = [];
        h[row.assignment_key].push(row.actual_mins);
      }
      setTimingHistory(h);
    } catch (e) {
      console.error('Load error:', e);
    }
    setIsSyncing(false);
    setDataLoaded(true);
  }

  // ── Auth state change ─────────────────────────────────────────────────────
  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser(session.user);
        loadUserData(session.user.id);
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setCurrentUser(session.user);
        if (event === 'SIGNED_IN') {
          await loadUserData(session.user.id);
        }
      } else {
        setCurrentUser(null);
        setDataLoaded(false);
        setCommitments([]);
        setAssignments([]);
        setSchedule([]);
        setTimingHistory({});
        setSettings(DEFAULT_SETTINGS);
      }
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Save settings ─────────────────────────────────────────────────────────
  async function doSaveSettings(s: UserSettings) {
    if (!s.user_id) return;
    setIsSyncing(true);
    await sb.from('user_settings').upsert(
      {
        user_id: s.user_id,
        sleep_start: s.sleep_start,
        sleep_end: s.sleep_end,
        eve_start: s.eve_start,
        max_chunk: s.max_chunk,
        dinner_time: s.dinner_time,
        dinner_dur: s.dinner_dur,
        shower_dur: s.shower_dur,
        canvas_url: s.canvas_url,
        canvas_token: s.canvas_token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    setIsSyncing(false);
  }

  function saveSettings(partial?: Partial<UserSettings>) {
    setSettings((prev) => {
      const next = partial ? { ...prev, ...partial } : prev;
      pendingSettingsRef.current = next;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        doSaveSettings(next);
        pendingSettingsRef.current = null;
      }, 800);
      return next;
    });
  }

  // ── Assignments ───────────────────────────────────────────────────────────
  async function saveAssignment(a: Assignment) {
    if (!currentUser) return;
    setIsSyncing(true);
    await sb.from('assignments').upsert(
      {
        id: typeof a.id === 'number' ? undefined : a.id,
        user_id: currentUser.id,
        name: a.name,
        type: a.type,
        due: a.due,
        total_mins: a.totalMins,
        done: a.done,
        actual_mins: a.actualMins,
        canvas_id: a.canvasId || null,
      },
      { onConflict: 'id' }
    );
    setIsSyncing(false);
  }

  async function deleteAssignment(id: string | number) {
    if (!currentUser) return;
    await sb.from('assignments').delete().eq('id', id).eq('user_id', currentUser.id);
  }

  // ── Commitments ───────────────────────────────────────────────────────────
  async function addCommitment(c: Omit<Commitment, 'id'>) {
    if (!currentUser) {
      const newC: Commitment = { ...c, id: Date.now() };
      setCommitments((prev) => [...prev, newC]);
      return;
    }
    setIsSyncing(true);
    const { data } = await sb
      .from('commitments')
      .insert({
        user_id: currentUser.id,
        name: c.name,
        days: c.days,
        start_time: c.start,
        end_time: c.end,
        type: c.type,
      })
      .select()
      .single();
    setIsSyncing(false);
    if (data) {
      setCommitments((prev) => [...prev, { ...c, id: data.id }]);
    }
  }

  async function removeCommitment(id: string | number) {
    setCommitments((prev) => prev.filter((c) => c.id !== id));
    if (currentUser && typeof id === 'string') {
      await sb.from('commitments').delete().eq('id', id).eq('user_id', currentUser.id);
    }
  }

  return (
    <StudyFlowContext.Provider
      value={{
        currentUser,
        isAdmin,
        signInGoogle,
        signInEmail,
        signOut,
        authLoading,
        commitments,
        setCommitments,
        assignments,
        setAssignments,
        schedule,
        setSchedule,
        timingHistory,
        setTimingHistory,
        settings,
        setSettings,
        isSyncing,
        saveSettings,
        saveAssignment,
        deleteAssignment,
        addCommitment,
        removeCommitment,
        dataLoaded,
      }}
    >
      {children}
    </StudyFlowContext.Provider>
  );
}

export function useStudyFlow() {
  const ctx = useContext(StudyFlowContext);
  if (!ctx) throw new Error('useStudyFlow must be used within StudyFlowProvider');
  return ctx;
}
