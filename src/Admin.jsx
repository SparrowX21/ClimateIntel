import React, { useEffect, useState } from 'react';
import { BarChart3, Users, Zap, MessageSquare, MapPin, Eye } from 'lucide-react';
import { fetchStats, supabaseEnabled } from './supabase';
import './App.css';

const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || '';

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = async () => {
    setLoading(true);
    const s = await fetchStats();
    setStats(s);
    setRefreshedAt(new Date());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Access control ──────────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const providedKey = params.get('key') || '';
  if (ADMIN_KEY && providedKey !== ADMIN_KEY) {
    return (
      <div style={{ padding: 60, fontFamily: 'system-ui' }}>
        <h2>403 — Unauthorized</h2>
        <p>This page requires an admin key. Add <code>?key=YOUR_KEY</code> to the URL.</p>
      </div>
    );
  }

  if (!supabaseEnabled) {
    return (
      <div style={{ padding: 60, fontFamily: 'system-ui' }}>
        <h2>Analytics not configured</h2>
        <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in the build environment.</p>
      </div>
    );
  }

  const tiles = stats ? [
    { label: 'Total visits',    value: stats.total_visits,    icon: <Eye size={16}/>,     sub: `${stats.visits_24h} in last 24h` },
    { label: 'Unique visitors', value: stats.unique_visitors, icon: <Users size={16}/>,   sub: 'browser-scoped ids' },
    { label: 'Signed-up users', value: stats.total_users,     icon: <Users size={16}/>,   sub: 'Google OAuth accounts' },
    { label: 'Analyses run',    value: stats.total_analyses,  icon: <MapPin size={16}/>,  sub: `${stats.analyses_24h} in last 24h` },
    { label: 'AI chats sent',   value: stats.total_chats,     icon: <MessageSquare size={16}/>, sub: `${stats.chats_24h} in last 24h` },
  ] : [];

  return (
    <div style={{ minHeight: '100vh', padding: '40px 32px', background: 'var(--bg-page)', fontFamily: 'var(--sans)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <BarChart3 size={22}/>
          <h1 style={{ fontFamily: 'var(--condensed)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
            ClimateIntel · Analytics
          </h1>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 28 }}>
          {loading
            ? 'Loading…'
            : refreshedAt && `Updated ${refreshedAt.toLocaleTimeString()}`}
          {' · '}
          <button
            onClick={load}
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}
          >
            refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {tiles.map(t => (
            <div key={t.label} className="metric-card" style={{ padding: 18 }}>
              <div className="metric-card-label">{t.icon} {t.label}</div>
              <div className="metric-card-value" style={{ fontSize: 32, marginTop: 6 }}>{t.value ?? '—'}</div>
              <div className="metric-card-sub" style={{ marginTop: 6 }}>{t.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, fontSize: 12, color: 'var(--text-muted)' }}>
          Data source: <code>public.event_stats</code> view · read-only aggregate, no PII.
        </div>
      </div>
    </div>
  );
}
