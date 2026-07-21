import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://prevbislidnkafpepvsa.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZXZiaXNsaWRua2FmcGVwdnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNTk5NjksImV4cCI6MjA5OTczNTk2OX0.03ry2QHOUbW5plSSC1qTRFpODASS20W9UnthBovIw7o';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Types ────────────────────────────────────────────────────────────────────
export interface Commitment {
  id: string | number;
  name: string;
  days: string[];
  start: string;
  end: string;
  type: 'class' | 'activity';
}

export interface Assignment {
  id: string | number;
  name: string;
  type: 'hw' | 'study';
  due: number;
  totalMins: number;
  done: boolean;
  actualMins: number | null;
  canvasId?: string | null;
}

export interface UserSettings {
  user_id: string;
  sleep_start: string;
  sleep_end: string;
  eve_start: string;
  max_chunk: number;
  dinner_time: string;
  dinner_dur: number;
  shower_dur: number;
  canvas_url: string;
  canvas_token: string;
  avatar_url: string;
  theme: string;
  font_size: string;
  profile_setup_done: boolean;
  updated_at?: string;
}

export interface ScheduleBlock {
  kind: string;
  name: string;
  start: number;
  end: number;
  done: boolean;
  assignId?: string | number;
  atype?: string;
  totalDays?: number;
  chunkIdx?: number;
}

export type TimingHistory = Record<string, number[]>;

// ── Admin email ──────────────────────────────────────────────────────────────
export const ADMIN_EMAIL = 'studyflow2012@gmail.com';
