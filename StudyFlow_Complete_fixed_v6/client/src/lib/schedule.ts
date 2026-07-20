import type { Assignment, ScheduleBlock, TimingHistory } from './supabase';

export const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function toMins(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, '0');
}

export function toTime(m: number): string {
  const t = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const mn = t % 60;
  return `${h % 12 || 12}:${pad2(mn)} ${h >= 12 ? 'pm' : 'am'}`;
}

export function fmt(hhmm: string): string {
  return toTime(toMins(hhmm));
}

export function nowMins(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function sleepHrs(s: string, e: string): number {
  let a = toMins(s);
  let b = toMins(e);
  if (b <= a) b += 1440;
  return (b - a) / 60;
}

export function getFreeSlots(
  ws: number,
  we: number,
  fixed: { start: number; end: number }[]
): { start: number; end: number }[] {
  const sorted = fixed
    .filter((f) => f.end > ws && f.start < we)
    .sort((a, b) => a.start - b.start);
  const slots: { start: number; end: number }[] = [];
  let cur = ws;
  for (const f of sorted) {
    if (f.start > cur) slots.push({ start: cur, end: Math.min(f.start, we) });
    cur = Math.max(cur, f.end);
  }
  if (cur < we) slots.push({ start: cur, end: we });
  return slots.filter((s) => s.end - s.start >= 15);
}

export function smartEstimate(a: Assignment, history: TimingHistory): number {
  const key = `${a.type}:${a.name}`;
  const hist = history[key];
  if (hist && hist.length >= 2) return Math.round(hist.reduce((s, v) => s + v, 0) / hist.length);
  return a.totalMins;
}

export function priority(a: Assignment, history: TimingHistory): number {
  return a.due * 10 + (a.type === 'hw' ? 0 : 1) + smartEstimate(a, history) / 1000;
}

export function parseMins(str: string): number | null {
  const s = (str || '').toLowerCase();
  let m = s.match(/(\d+\.?\d*)\s*h/);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = s.match(/(\d+)\s*m/);
  if (m) return parseInt(m[1], 10);
  m = s.match(/^(\d+)$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

export interface BuildScheduleOptions {
  assignments: Assignment[];
  commitments: { name: string; days: string[]; start: string; end: string; type: string }[];
  sleepStart: string;
  sleepEnd: string;
  maxChunk: number;
  eveStart: string;
  dinnerTime: string;
  dinnerDur: number;
  showerDur: number;
  cramTonight: boolean;
  history: TimingHistory;
}

export function buildSchedule(opts: BuildScheduleOptions): {
  schedule: ScheduleBlock[];
  unplaced: Assignment[];
  stats: { tasks: number; taskMins: number; sleepH: number; freeMins: number };
} {
  const {
    assignments, commitments, sleepStart, sleepEnd, maxChunk,
    eveStart, dinnerTime, dinnerDur, showerDur, cramTonight, history,
  } = opts;

  const pending = assignments.filter((a) => !a.done);
  const dayName = WDAYS[new Date().getDay()];
  const CHUNK = maxChunk || 60;
  const winStart = Math.max(nowMins(), toMins(eveStart));
  let winEnd = toMins(sleepStart);
  if (winEnd <= winStart) winEnd += 1440;
  const showerStart = toMins(sleepStart) - showerDur;
  const dinnerStartM = toMins(dinnerTime);

  const todayFixed = [
    ...commitments
      .filter((c) => c.days.includes(dayName))
      .map((c) => ({ name: c.name, type: c.type, start: toMins(c.start), end: toMins(c.end) })),
    { name: 'Dinner', type: 'dinner', start: dinnerStartM, end: dinnerStartM + dinnerDur },
    { name: 'Shower & wind-down', type: 'shower', start: showerStart, end: showerStart + showerDur },
  ].sort((a, b) => a.start - b.start);

  const freeSlots = getFreeSlots(winStart, winEnd, todayFixed);
  const totalFree = freeSlots.reduce((s, sl) => s + sl.end - sl.start, 0);
  const sorted = [...pending].sort((a, b) => priority(a, history) - priority(b, history));

  const chunks: { assignId: string | number; name: string; atype: string; mins: number; totalDays: number; chunkIdx: number }[] = [];
  for (const a of sorted) {
    const est = smartEstimate(a, history);
    const evenings = cramTonight ? 1 : Math.max(1, Math.min(a.due, Math.ceil(est / CHUNK)));
    const tonightMins = cramTonight ? est : Math.ceil(est / evenings);
    let used = 0, ci = 0;
    while (used < tonightMins) {
      const bite = Math.min(CHUNK, tonightMins - used);
      chunks.push({ assignId: a.id, name: a.name, atype: a.type, mins: bite, totalDays: evenings, chunkIdx: ci });
      used += bite; ci++;
    }
  }

  const schedule: ScheduleBlock[] = [];
  for (const f of todayFixed) schedule.push({ kind: f.type, name: f.name, start: f.start, end: f.end, done: false });

  const slotState = freeSlots.map((s) => ({ start: s.start, end: s.end, cursor: s.start }));
  let placed = 0;
  const unplacedIds = new Set<string | number>();

  for (const ch of chunks) {
    let ok = false;
    for (const sl of slotState) {
      if (sl.cursor + ch.mins <= sl.end) {
        schedule.push({
          kind: 'assignment', assignId: ch.assignId, name: ch.name, atype: ch.atype,
          start: sl.cursor, end: sl.cursor + ch.mins, totalDays: ch.totalDays, chunkIdx: ch.chunkIdx, done: false,
        });
        sl.cursor += ch.mins; placed++;
        if (placed % 2 === 0 && sl.cursor + 10 <= sl.end) {
          schedule.push({ kind: 'break', name: 'Break', start: sl.cursor, end: sl.cursor + 10, done: false });
          sl.cursor += 10;
        }
        ok = true; break;
      }
    }
    if (!ok) unplacedIds.add(ch.assignId);
  }

  const sleepStartM = toMins(sleepStart);
  schedule.push({ kind: 'sleep', name: 'Sleep', start: sleepStartM, end: sleepStartM + Math.round(sleepHrs(sleepStart, sleepEnd) * 60), done: false });
  schedule.sort((a, b) => a.start - b.start);

  const unplaced = pending.filter((a) => unplacedIds.has(a.id));
  const taskMins = schedule.filter((s) => s.kind === 'assignment').reduce((t, s) => t + s.end - s.start, 0);
  const breakMins = schedule.filter((s) => s.kind === 'break').reduce((t, s) => t + s.end - s.start, 0);
  const freeMins = Math.max(0, totalFree - taskMins - breakMins);

  return {
    schedule,
    unplaced,
    stats: { tasks: pending.length, taskMins, sleepH: sleepHrs(sleepStart, sleepEnd), freeMins },
  };
}
