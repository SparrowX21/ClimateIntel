import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = supabaseEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// ── Persistent visitor id (cookie-free, localStorage only) ───────────────────
function getVisitorId() {
  try {
    let id = localStorage.getItem('ci_visitor_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('ci_visitor_id', id);
    }
    return id;
  } catch {
    return null;
  }
}

// Per-tab session id (regenerated on tab open)
export const sessionId = crypto.randomUUID();

// ── Analytics ────────────────────────────────────────────────────────────────
export async function trackEvent(eventType) {
  if (!supabase) return;
  try {
    await supabase.from('events').insert({
      event_type: eventType,
      visitor_id: getVisitorId(),
    });
  } catch (e) {
    // Silent — analytics failures never break the app
    console.debug('trackEvent failed:', e);
  }
}

// ── Chat persistence ─────────────────────────────────────────────────────────
export async function saveChatMessage({ userId, role, message, context }) {
  if (!supabase || !userId) return;
  try {
    await supabase.from('chats').insert({
      user_id: userId,
      role,
      message,
      context: context || null,
      session_id: sessionId,
    });
  } catch (e) {
    console.debug('saveChatMessage failed:', e);
  }
}

export async function fetchChatHistory(userId, limit = 200) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('chats')
    .select('id, role, message, session_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.debug('fetchChatHistory failed:', error);
    return [];
  }
  return data || [];
}

// ── Aggregate stats (for admin) ──────────────────────────────────────────────
export async function fetchStats() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('event_stats').select('*').single();
  if (error) {
    console.debug('fetchStats failed:', error);
    return null;
  }
  return data;
}
