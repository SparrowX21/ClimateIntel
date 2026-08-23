import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import {
  MapPin, Info, Zap, RefreshCcw, Activity, Sparkles, Brain,
  Sun, Droplets, Leaf, Building2, Layers, ShieldAlert,
  BookOpen, X, Database, Cpu, Search, Pause, Play, BarChart3,
  MessageSquare, Send, LogIn, LogOut, User, Clock, History,
  Share2, GitCompare, Pin, Map as MapIcon
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './App.css';
import { supabase, supabaseEnabled, trackEvent, saveChatMessage, fetchChatHistory } from './supabase';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

function ChangeView({ center, zoom }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom); }, [center, zoom]);
  return null;
}

function MapEvents({ onMapClick, paused }) {
  useMapEvents({
    click(e) {
      if (!paused) onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

// ── Geocoder (OpenStreetMap Nominatim — free, no API key) ────────────────────

async function geocodeLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'ClimateIntel/1.0 (climate-intel-webapp)',
    },
  });
  if (!res.ok) throw new Error('Geocoding request failed');
  const data = await res.json();
  if (!data.length) throw new Error(`Location "${query}" not found. Try a different search term.`);
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

async function geocodeSuggestions(query, limit = 6) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=${limit}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'ClimateIntel/1.0 (climate-intel-webapp)',
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map(d => ({
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    label: d.display_name,
    type: d.type,
    className: d.class,
  }));
}

// ── Map tile layers ─────────────────────────────────────────────────────────

const MAP_STYLES = {
  light:     { name: 'Light',     url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',                    attribution: '&copy; CARTO &copy; OpenStreetMap' },
  streets:   { name: 'Streets',   url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                attribution: '&copy; OpenStreetMap contributors' },
  satellite: { name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX' },
  terrain:   { name: 'Terrain',   url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',                                     attribution: 'Map data: &copy; OpenStreetMap, SRTM | Style: &copy; OpenTopoMap (CC-BY-SA)' },
  dark:      { name: 'Dark',      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                     attribution: '&copy; CARTO &copy; OpenStreetMap' },
};

// ── Documentation Modal ─────────────────────────────────────────────────────

const NLCD_CODES = {
  11:'Open Water', 21:'Dev. Open Space', 22:'Dev. Low Intensity',
  23:'Dev. Medium Intensity', 24:'Dev. High Intensity',
  31:'Barren Land', 41:'Deciduous Forest', 42:'Evergreen Forest',
  43:'Mixed Forest', 52:'Shrub/Scrub', 71:'Herbaceous',
  81:'Hay/Pasture', 82:'Cultivated Crops', 90:'Woody Wetlands', 95:'Emergent Wetlands'
};

function DocsModal({ onClose, activeModel }) {
  const [activeTab, setActiveTab] = useState('guide');
  return (
    <div className="docs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="docs-panel">
        <div className="docs-header">
          <div>
            <div className="docs-title">Knowledge Base</div>
            <div className="docs-subtitle">ClimateIntel · Documentation</div>
          </div>
          <button className="docs-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="docs-tabs">
          {['guide','about','data'].map(tab => (
            <button key={tab} className={`docs-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}>
              {tab === 'guide' ? 'User Guide' : tab === 'about' ? 'About' : 'Data Sources'}
            </button>
          ))}
        </div>

        <div className="docs-body">
          {activeTab === 'guide' && (
            <>
              <div className="docs-callout">
                This tool provides AI-driven, multi-dimensional climate stress analysis for any location worldwide. Click anywhere on the map or search any city/address to begin.
              </div>

              <div className="docs-section-title">How to Use</div>
              {[
                { n:1, title:'Select a Location', desc:'Click any point on the map, or type any city, address, or place name into the search bar and press Enter. The geocoder works worldwide.' },
                { n:2, title:'Wait for Satellite Analysis', desc:'The system fetches Land Surface Temperature (MODIS), NDVI (MODIS), Annual Precipitation (NASA GLDAS), and USGS NLCD Landcover data via Google Earth Engine.' },
                { n:3, title:'Review AI Weighting', desc:'Gemini AI analyzes the satellite metrics and suggests optimal scenario weights for the four stress dimensions. The AI reasoning is shown in the sidebar.' },
                { n:4, title:'Read the Resilience Index', desc:'The score on the right panel (0.00-1.00) represents overall climate stress. See below for how to interpret the score.' },
                { n:5, title:'Act on Recommendations', desc:'The three AI-generated policy recommendations are tailored to the exact environmental conditions at your selected point.' },
                { n:6, title:'Manual Weight Adjustment', desc:'Use the four sliders in the sidebar to manually override the AI weighting if you need to prioritize a specific dimension.' },
              ].map(s => (
                <div className="guide-step" key={s.n}>
                  <div className="guide-step-num">{s.n}</div>
                  <div className="guide-step-content">
                    <div className="guide-step-title">{s.title}</div>
                    <div className="guide-step-desc">{s.desc}</div>
                  </div>
                </div>
              ))}

              <div className="docs-section-title">Score Interpretation</div>
              {[
                { range:'0.00-0.34', label:'Low Stress', color:'#1a5c35', desc:'Minimal climate stress detected. Current conditions are within sustainable thresholds.' },
                { range:'0.35-0.64', label:'Moderate Stress', color:'#8a5a00', desc:'Significant stressors present. Targeted mitigation and monitoring programs are recommended.' },
                { range:'0.65-1.00', label:'High Stress', color:'#b02020', desc:'Severe multi-dimensional stress detected. Immediate policy intervention required.' },
              ].map(s => (
                <div className="score-legend-row" key={s.range} style={{background:'rgba(0,0,0,0.02)', border:`1px solid ${s.color}22`}}>
                  <div className="score-legend-dot" style={{background:s.color, boxShadow:`0 0 6px ${s.color}`}} />
                  <div className="score-legend-range" style={{color:s.color}}>{s.range}</div>
                  <div>
                    <div style={{fontSize:'0.8rem',fontWeight:700,color:'var(--text-primary)',marginBottom:'2px'}}>{s.label}</div>
                    <div className="score-legend-desc">{s.desc}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {activeTab === 'about' && (
            <>
              <div className="docs-section-title">Project Overview</div>
              <p className="docs-para">
                ClimateIntel is a real-time decision-support tool for urban planners, environmental researchers, and government agencies. It combines satellite remote sensing with four independent machine-learning models — one per stress dimension — to deliver location-specific climate vulnerability assessments anywhere in the contiguous US.
              </p>
              <p className="docs-para">
                The dashboard quantifies four independent stress vectors — Heat, Water, Ecological, and Urban Density — each predicted by its own XGBoost regressor trained on thousands of CONUS-wide satellite samples. Their outputs (each normalized to 0–1) are combined by a Gemini-driven adaptive weighting engine into a single Stress Index.
              </p>

              <div className="docs-section-title">The Four ML Models</div>
              {[
                { icon:<Sun size={16}/>, color:'#f87171', title:'Heat Model', desc:'XGBoost regressor. Features: NDVI, VPD, precipitation, landcover. Predicts thermal load (LST scaled 5–45°C → 0–1). Deliberately excludes LST from inputs so the model must infer heat from surrounding environmental context.' },
                { icon:<Droplets size={16}/>, color:'#60a5fa', title:'Water Model', desc:'XGBoost regressor. Features: LST, VPD, NDVI, landcover. Predicts precipitation deficit (0 mm/yr → 1, 1500 mm/yr → 0). Precipitation itself is excluded from inputs — the model learns aridity from surface signals.' },
                { icon:<Leaf size={16}/>, color:'#4ade80', title:'Ecological Model', desc:'XGBoost regressor. Features: LST, precipitation, VPD, landcover. Predicts inverse vegetation health (low NDVI → high stress). NDVI is excluded so the model must infer vegetation state from climate.' },
                { icon:<Building2 size={16}/>, color:'#a78bfa', title:'Urban Model', desc:'XGBoost regressor. Features: LST, NDVI, precipitation, VPD, population density (GPW). Predicts developed-land intensity from NLCD codes 21–24 (0.25 → 1.0), grounded by real population counts.' },
              ].map(d => (
                <div className="data-source-row" key={d.title}>
                  <div style={{color:d.color,flexShrink:0,marginTop:2}}>{d.icon}</div>
                  <div>
                    <div className="data-source-name" style={{color:d.color}}>{d.title}</div>
                    <div className="data-source-desc">{d.desc}</div>
                  </div>
                </div>
              ))}

              <div className="docs-section-title">How the Score Is Built</div>
              <p className="docs-para">
                For any selected point, the backend queries five satellite/climate variables from Google Earth Engine, feeds them into each of the four XGBoost models, and clips every prediction to [0, 1]. The final Stress Index is a weighted sum:
              </p>
              <div className="docs-callout" style={{fontFamily:'var(--mono)', fontSize:'13px'}}>
                score = w<sub>heat</sub>·s<sub>heat</sub> + w<sub>water</sub>·s<sub>water</sub> + w<sub>eco</sub>·s<sub>eco</sub> + w<sub>urban</sub>·s<sub>urban</sub>
              </div>

              <div className="docs-section-title">Adaptive AI Weighting</div>
              <p className="docs-para">
                The weights w<sub>i</sub> are chosen by <strong>Google {activeModel}</strong>, which reviews the raw satellite readings and returns a dimension-specific rationale plus three policy recommendations tailored to the exact conditions at the selected point. You can override any weight manually with the sidebar sliders.
              </p>
              <div className="docs-callout">
                If Gemini is unavailable or rate-limited, a rule-based heuristic engine takes over so the dashboard remains fully functional. The ML models continue to run either way.
              </div>
            </>
          )}

          {activeTab === 'data' && (
            <>
              <div className="docs-section-title">Satellite & Climate Data Sources</div>
              {[
                { icon:<Database size={16}/>, name:'MODIS MOD11A2 v6.1 (LST)', desc:'NASA Terra satellite. 8-day composite Land Surface Temperature at 1 km resolution. Time-averaged over the 2022 calendar year.' },
                { icon:<Database size={16}/>, name:'MODIS MOD13Q1 v6.1 (NDVI)', desc:'16-day composite Normalized Difference Vegetation Index at 250 m resolution. Time-averaged over the 2022 calendar year.' },
                { icon:<Database size={16}/>, name:'TerraClimate (Idaho EPSCoR)', desc:'Monthly climate data at ~4 km. Provides annual precipitation (pr, mm) and vapor pressure deficit (vpd, kPa) — used for water and heat modeling.' },
                { icon:<Database size={16}/>, name:'USGS NLCD 2021', desc:'National Land Cover Database at 30 m. Landcover classification (codes 21–24 = developed) sampled with a mode reducer.' },
                { icon:<Database size={16}/>, name:'CIESIN GPW v4.11', desc:'Gridded Population of the World at ~1 km. Population density (people/km²) feeds the urban stress model.' },
              ].map(d => (
                <div className="data-source-row" key={d.name}>
                  <div className="data-source-icon">{d.icon}</div>
                  <div>
                    <div className="data-source-name">{d.name}</div>
                    <div className="data-source-desc">{d.desc}</div>
                  </div>
                </div>
              ))}

              <div className="docs-section-title">NLCD Landcover Reference</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                {Object.entries(NLCD_CODES).map(([code,name]) => (
                  <div key={code} style={{display:'flex',gap:'8px',alignItems:'center',padding:'6px 8px',background:'rgba(0,0,0,0.02)',border:'1px solid var(--border)',borderRadius:'0'}}>
                    <span style={{fontFamily:'var(--mono)',fontSize:'0.7rem',color:'#6366f1',fontWeight:700,flexShrink:0}}>{code}</span>
                    <span style={{fontSize:'0.7rem',color:'var(--text-secondary)'}}>{name}</span>
                  </div>
                ))}
              </div>

              <div className="docs-section-title">ML & AI Engines</div>
              <div className="data-source-row">
                <div className="data-source-icon"><Cpu size={16}/></div>
                <div>
                  <div className="data-source-name">XGBoost Stress Regressors (×4)</div>
                  <div className="data-source-desc">Four independent gradient-boosted regressors trained on ~10,000 CONUS satellite samples. Each predicts a single stress dimension in [0, 1] using engineered features that exclude that dimension's primary driver.</div>
                </div>
              </div>
              <div className="data-source-row">
                <div className="data-source-icon"><Cpu size={16}/></div>
                <div>
                  <div className="data-source-name">Google Gemini Flash</div>
                  <div className="data-source-desc">Assigns adaptive weights across the four ML outputs and generates location-specific policy recommendations. Responses are cached per location to minimize API usage.</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Usage Counter Panel ─────────────────────────────────────────────────────

function UsagePanel({ usage, onClose }) {
  return (
    <div className="docs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="docs-panel" style={{width: 400}}>
        <div className="docs-header">
          <div>
            <div className="docs-title">Session Usage</div>
            <div className="docs-subtitle">API calls & token savings</div>
          </div>
          <button className="docs-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="docs-body">
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-card-label"><Database size={11}/> Satellite Calls</div>
              <div className="metric-card-value">{usage.metrics_calls}</div>
              <div className="metric-card-sub">Earth Engine API</div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label"><Brain size={11}/> AI Calls</div>
              <div className="metric-card-value">{usage.ai_calls}</div>
              <div className="metric-card-sub">Gemini API</div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label"><Zap size={11}/> Cache Hits</div>
              <div className="metric-card-value">{usage.cache_hits}</div>
              <div className="metric-card-sub">Requests served from cache</div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label"><Sparkles size={11}/> Tokens Saved</div>
              <div className="metric-card-value">~{usage.tokens_saved}</div>
              <div className="metric-card-sub">Via caching</div>
            </div>
          </div>
          <div className="docs-callout" style={{marginTop: 16}}>
            Cached responses expire after 1 hour. Clicking the same location within that window uses zero API tokens.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Chat Panel ──────────────────────────────────────────────────────────────

function ChatPanel({ onClose, apiUrl, context, user, preloadMessages, compareContext }) {
  const opener = compareContext
    ? `Comparing two locations:\n\n**A — ${compareContext.a.location}** · score ${compareContext.a.score.toFixed(2)} · LST ${compareContext.a.metrics.lst}°C · NDVI ${compareContext.a.metrics.ndvi} · Precip ${compareContext.a.metrics.precipitation} mm/yr\n\n**B — ${compareContext.b.location}** · score ${compareContext.b.score.toFixed(2)} · LST ${compareContext.b.metrics.lst}°C · NDVI ${compareContext.b.metrics.ndvi} · Precip ${compareContext.b.metrics.precipitation} mm/yr\n\nAsk me anything about how they differ — e.g. "Which is worse for water stress?" or "Explain the temperature gap."`
    : "Hi! I can answer questions about climate, the satellite data shown here, or the current analysis point. What would you like to know?";
  const [messages, setMessages] = useState(
    preloadMessages && preloadMessages.length
      ? preloadMessages
      : [{ role: 'assistant', text: opener }]
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');
    setSending(true);
    trackEvent('chat');
    const chatContext = compareContext ? { compare: compareContext } : context;
    if (user) saveChatMessage({ userId: user.id, role: 'user', message: text, context: chatContext });
    try {
      const r = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context: chatContext }),
      });
      const d = await r.json();
      const reply = d.reply || d.error || 'No response.';
      setMessages(m => [...m, { role: 'assistant', text: reply }]);
      if (user) saveChatMessage({ userId: user.id, role: 'assistant', message: reply, context });
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', text: 'Network error — check that the backend is running.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="docs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="docs-panel chat-panel">
        <div className="docs-header">
          <div>
            <div className="docs-title">{compareContext ? 'Compare Locations' : 'Ask ClimateIntel AI'}</div>
            <div className="docs-subtitle">{compareContext ? `${compareContext.a.location} vs ${compareContext.b.location}` : 'Powered by Gemini · Ask about your analysis'}</div>
          </div>
          <button className="docs-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="chat-messages" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble chat-${m.role}`}>
              <div className="chat-role">{m.role === 'user' ? 'You' : 'AI'}</div>
              <div className="chat-text">{m.text}</div>
            </div>
          ))}
          {sending && (
            <div className="chat-bubble chat-assistant">
              <div className="chat-role">AI</div>
              <div className="chat-text chat-typing">Thinking…</div>
            </div>
          )}
        </div>
        <form className="chat-input-row" onSubmit={sendMessage}>
          <input
            className="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            maxLength={1000}
            disabled={sending}
          />
          <button type="submit" className="chat-send" disabled={sending || !input.trim()}>
            <Send size={14}/>
          </button>
        </form>
      </div>
    </div>
  );
}

// ── History Panel ───────────────────────────────────────────────────────────

function HistoryPanel({ onClose, chats, loading }) {
  const grouped = React.useMemo(() => {
    const map = new Map();
    for (const c of chats) {
      const d = new Date(c.created_at);
      const key = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return Array.from(map.entries());
  }, [chats]);

  return (
    <div className="docs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="docs-panel" style={{ width: 480, height: 'calc(100vh - 36px)', display: 'flex', flexDirection: 'column' }}>
        <div className="docs-header">
          <div>
            <div className="docs-title">Chat History</div>
            <div className="docs-subtitle">{chats.length} messages · synced across devices</div>
          </div>
          <button className="docs-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="docs-body" style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div className="loading-state"><RefreshCcw className="animate-spin" size={24} /><p>Loading…</p></div>
          ) : chats.length === 0 ? (
            <div className="loading-state">
              <MessageSquare size={28} color="#888" />
              <p>No chats yet.</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Open "Ask AI" and start a conversation — it'll be saved here.</p>
            </div>
          ) : (
            grouped.map(([day, msgs]) => (
              <div key={day} style={{ marginBottom: 20 }}>
                <div className="docs-section-title" style={{ fontSize: 12, marginBottom: 8 }}>
                  <Clock size={11} style={{ marginRight: 6 }} /> {day}
                </div>
                {msgs.map(m => (
                  <div key={m.id} className={`chat-bubble chat-${m.role}`} style={{ marginBottom: 6 }}>
                    <div className="chat-role">{m.role === 'user' ? 'You' : 'AI'} · {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="chat-text">{m.message}</div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────

const App = () => {
  const API_URL = import.meta.env.VITE_API_URL || '';
  const [location, setLocation] = useState('Austin, Texas');
  const [coords, setCoords] = useState([30.2672, -97.7431]);
  const [weights, setWeights] = useState({ heat:0.25, water:0.25, eco:0.25, urban:0.25 });
  const [metrics, setMetrics] = useState({ lst:0, ndvi:0, precipitation:0, landcover:'N/A' });
  const [normMetrics, setNormMetrics] = useState({ heat:0.5, water:0.3, eco:0.2, urban:0.4 });
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReasoning, setAiReasoning] = useState('');
  const [error, setError] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [score, setScore] = useState(0.45);
  const [recommendations, setRecommendations] = useState([]);
  const [showDocs, setShowDocs] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [activeModel, setActiveModel] = useState('Gemini Flash');
  const [hasData, setHasData] = useState(false);
  const [paused, setPaused] = useState(false);
  const [usage, setUsage] = useState({ metrics_calls: 0, ai_calls: 0, cache_hits: 0, tokens_saved: 0 });
  const [session, setSession] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pinned, setPinned] = useState(null);          // {coords, location, metrics, normalized, score}
  const [shareToast, setShareToast] = useState(null);
  const [mapStyle, setMapStyle] = useState(() => localStorage.getItem('ci_map_style') || 'light');
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(-1);
  const suggestTimer = useRef(null);
  const user = session?.user || null;

  useEffect(() => {
    fetch(`${API_URL}/api/model-info`)
      .then(r => r.json())
      .then(d => {
        if (d.model) {
          const name = d.model.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          setActiveModel(name);
        }
      })
      .catch(() => {});
  }, [API_URL]);

  // ── Auth session + visit tracking ──────────────────────────────
  useEffect(() => {
    if (!supabaseEnabled) return;
    trackEvent('visit');
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (_e === 'SIGNED_IN') trackEvent('signup');
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (!supabaseEnabled) return alert('Sign-in is not configured yet.');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    if (!supabaseEnabled) return;
    await supabase.auth.signOut();
    setChatHistory([]);
  };

  const loadHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    const rows = await fetchChatHistory(user.id);
    setChatHistory(rows);
    setHistoryLoading(false);
  };

  // ── Deep-link: ?lat=..&lng=.. jumps straight to a location ──────
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const la = parseFloat(q.get('lat'));
    const ln = parseFloat(q.get('lng'));
    if (Number.isFinite(la) && Number.isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180) {
      setCoords([la, ln]);
      setLocation(`${la.toFixed(4)}, ${ln.toFixed(4)}`);
      fetchMetrics(la, ln);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareLocation = async () => {
    const url = `${window.location.origin}${window.location.pathname}?lat=${coords[0].toFixed(4)}&lng=${coords[1].toFixed(4)}`;
    const title = `ClimateIntel — ${location}`;
    const text = `Climate stress for ${location}: ${score.toFixed(2)} (heat ${(normMetrics.heat*100).toFixed(0)}%, water ${(normMetrics.water*100).toFixed(0)}%, eco ${(normMetrics.eco*100).toFixed(0)}%, urban ${(normMetrics.urban*100).toFixed(0)}%)`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareToast('Link copied to clipboard');
        setTimeout(() => setShareToast(null), 2500);
      }
    } catch (e) {
      // user cancelled share sheet — ignore
    }
  };

  const pinForCompare = () => {
    setPinned({
      coords: [...coords], location, metrics: { ...metrics }, normalized: { ...normMetrics }, score,
    });
    setShareToast(`Pinned "${location}" — click another location, then Compare`);
    setTimeout(() => setShareToast(null), 4000);
  };

  const startCompare = () => {
    if (!pinned) return;
    setShowChat(true);
  };

  const clearPin = () => setPinned(null);

  // ── Search suggestions (debounced) ──────────────────────────────
  const handleLocationInput = (e) => {
    const value = e.target.value;
    setLocation(value);
    setSuggestIdx(-1);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!value.trim() || value.trim().length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      const results = await geocodeSuggestions(value.trim());
      setSuggestions(results);
      setSuggestOpen(results.length > 0);
    }, 250);
  };

  const pickSuggestion = (s) => {
    setSuggestions([]);
    setSuggestOpen(false);
    setSuggestIdx(-1);
    setCoords([s.lat, s.lng]);
    setLocation(s.label.split(',').slice(0, 2).join(','));
    fetchMetrics(s.lat, s.lng);
  };

  const handleSuggestKey = (e) => {
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIdx(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && suggestIdx >= 0) { e.preventDefault(); pickSuggestion(suggestions[suggestIdx]); }
    else if (e.key === 'Escape') { setSuggestOpen(false); }
  };

  // ── Map style persistence ───────────────────────────────────────
  useEffect(() => { localStorage.setItem('ci_map_style', mapStyle); }, [mapStyle]);

  const compareContext = pinned ? {
    a: { location: pinned.location, coords: pinned.coords, metrics: pinned.metrics, normalized: pinned.normalized, score: pinned.score },
    b: { location, coords: [coords[0], coords[1]], metrics, normalized: normMetrics, score },
  } : null;

  const refreshUsage = useCallback(() => {
    fetch(`${API_URL}/api/usage`)
      .then(r => r.json())
      .then(setUsage)
      .catch(() => {});
  }, [API_URL]);

  const handleMapClick = (lat, lng) => {
    if (paused) return;
    setCoords([lat, lng]);
    setLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    fetchMetrics(lat, lng);
  };

  const handleWeightChange = (key, value) => {
    const others = Object.keys(weights).filter(k => k !== key);
    const sumOthers = others.reduce((s, k) => s + weights[k], 0);
    const diff = value - weights[key];
    const nw = { ...weights, [key]: value };
    if (sumOthers > 0) {
      others.forEach(k => { nw[k] = Math.max(0, weights[k] - diff * (weights[k] / sumOthers)); });
    } else {
      others.forEach(k => { nw[k] = Math.max(0, weights[k] - diff / others.length); });
    }
    const total = Object.values(nw).reduce((a, b) => a + b, 0);
    if (total > 0) Object.keys(nw).forEach(k => { nw[k] = nw[k] / total; });
    setWeights(nw);
  };

  const fetchMetrics = async (lat, lng) => {
    setLoading(true);
    setError(null);
    trackEvent('analysis');
    try {
      const r = await fetch(`${API_URL}/api/metrics?lat=${lat}&lng=${lng}`);
      const d = await r.json();
      if (d.error && !d.metrics) throw new Error(d.error);
      setMetrics(d.metrics);
      setNormMetrics(d.normalized);
      setHasData(true);
      fetchAIWeights(d.metrics, { lat, lng });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      refreshUsage();
    }
  };

  const fetchAIWeights = async (m, loc) => {
    setAiLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/ai-weights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics: m, location: loc }),
      });
      const d = await r.json();
      if (d.weights) setWeights(d.weights);
      if (d.recommendations) setRecommendations(d.recommendations);
      setAiReasoning(d.reasoning || '');
    } catch (e) {
      console.error('AI weights error:', e);
    } finally {
      setAiLoading(false);
      refreshUsage();
    }
  };

  useEffect(() => {
    if (!normMetrics) return;
    setScore(parseFloat((
      normMetrics.heat * weights.heat + normMetrics.water * weights.water +
      normMetrics.eco * weights.eco + normMetrics.urban * weights.urban
    ).toFixed(2)));
  }, [weights, normMetrics]);

  const getStatusInfo = (s) => {
    if (s >= 0.65) return { label: 'HIGH STRESS', color: '#b02020', icon: <ShieldAlert size={14}/> };
    if (s >= 0.35) return { label: 'MODERATE STRESS', color: '#8a5a00', icon: <Info size={14}/> };
    return { label: 'LOW STRESS', color: '#1a5c35', icon: <Zap size={14}/> };
  };

  const getIconForType = (type) => {
    const icons = { heat: <Sun size={16}/>, water: <Droplets size={16}/>, eco: <Leaf size={16}/>, urban: <Building2 size={16}/> };
    return icons[type] || <Zap size={16}/>;
  };

  const formatReasoning = (text) => {
    if (!text) return null;
    return text.split('**').map((part, i) =>
      i % 2 === 1
        ? <strong key={i} style={{color:'var(--text-primary)', display:'block', marginTop:'10px', marginBottom:'4px', fontSize:'14px', letterSpacing:'0.04em', fontWeight:'700'}}>{part}</strong>
        : <span key={i}>{part}</span>
    );
  };

  const handleLocationSubmit = async (e) => {
    e.preventDefault();
    if (paused) return;
    setSearchError(null);
    setGeocoding(true);

    try {
      const result = await geocodeLocation(location);
      setCoords([result.lat, result.lng]);
      setLocation(result.displayName.split(',').slice(0, 2).join(','));
      fetchMetrics(result.lat, result.lng);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setGeocoding(false);
    }
  };

  const nlcdLabel = (code) => {
    const map = {
      11:'Open Water',21:'Open Space',22:'Low Density',
      23:'Med. Density',24:'High Density',31:'Barren',
      41:'Deciduous',42:'Evergreen',43:'Mixed Forest',
      52:'Shrub',71:'Herbaceous',81:'Pasture',82:'Crops',
      90:'Wetlands',95:'Emergent Wetland'
    };
    return map[code] || code;
  };

  const status = getStatusInfo(score);

  return (
    <div className="app-container">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
            <div style={{width: '4px', height: '36px', background: 'var(--text-primary)'}}></div>
            <div className="app-title">ClimateIntel</div>
          </div>
          <div className="app-subtitle">Climate Intelligence Platform</div>
          <div className="header-actions">
            <div style={{display: 'flex', gap: '6px'}}>
              <button className="btn-ghost" onClick={() => setShowDocs(true)} style={{flex: 1}}>
                <BookOpen size={13}/> Guide
              </button>
              <button className="btn-ghost" onClick={() => { refreshUsage(); setShowUsage(true); }} style={{flex: 1}}>
                <BarChart3 size={13}/> Usage
              </button>
            </div>
            <div style={{display: 'flex', gap: '6px'}}>
              <button className="btn-ghost" onClick={() => setShowChat(true)} style={{flex: user ? 1 : undefined, width: user ? 'auto' : '100%'}}>
                <MessageSquare size={13}/> Ask AI
              </button>
              {user && (
                <button className="btn-ghost" onClick={() => { loadHistory(); setShowHistory(true); }} style={{flex: 1}} title="Your previous chats">
                  <History size={13}/> History
                </button>
              )}
            </div>
            <div style={{display: 'flex', gap: '6px'}}>
              <button
                className={paused ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setPaused(p => !p)}
                style={{flex: 1}}
                title={paused ? 'Resume session — map clicks and searches re-enabled' : 'Pause session — prevents accidental API calls'}
              >
                {paused ? <><Play size={13}/> Resume</> : <><Pause size={13}/> Break</>}
              </button>
              <button className="btn-primary" onClick={() => !paused && fetchMetrics(coords[0], coords[1])} disabled={paused} style={{flex: 1}}>
                <RefreshCcw size={13} className={loading ? 'animate-spin' : ''}/> Refresh
              </button>
            </div>
            {supabaseEnabled && (
              user ? (
                <button className="btn-ghost" onClick={signOut} title={user.email || 'Sign out'}>
                  <LogOut size={13}/> Sign out ({(user.email || '').split('@')[0].slice(0, 12)})
                </button>
              ) : (
                <button className="btn-ghost" onClick={signInWithGoogle}>
                  <LogIn size={13}/> Sign in with Google
                </button>
              )
            )}
          </div>
        </div>

        {/* Paused Banner */}
        {paused && (
          <div className="paused-banner">
            <Pause size={12}/>
            Session paused — map clicks and searches disabled. Click Resume to continue.
          </div>
        )}

        {/* Location */}
        <div className="sidebar-section" style={{position:'relative'}}>
          <div className="section-label"><MapPin size={10}/> Location Target</div>
          <form className="location-form" onSubmit={handleLocationSubmit} autoComplete="off">
            <input
              className="location-input"
              type="text"
              value={location}
              onChange={handleLocationInput}
              onKeyDown={handleSuggestKey}
              onFocus={() => suggestions.length > 0 && setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              placeholder="Search any city, address, or place..."
              disabled={paused}
            />
            <button type="submit" className="location-btn" title="Search" disabled={paused || geocoding}>
              {geocoding ? <RefreshCcw size={14} className="animate-spin"/> : <Search size={14}/>}
            </button>
          </form>
          {searchError && (
            <div className="search-error">{searchError}</div>
          )}
          {suggestOpen && suggestions.length > 0 && (
            <div className="suggest-list">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={`suggest-item ${i === suggestIdx ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                  onMouseEnter={() => setSuggestIdx(i)}
                >
                  <MapPin size={11} className="suggest-icon"/>
                  <div className="suggest-text">
                    <div className="suggest-primary">{s.label.split(',').slice(0, 2).join(',')}</div>
                    <div className="suggest-secondary">{s.label.split(',').slice(2).join(',').trim() || s.type}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adaptive Weighting */}
        <div className="sidebar-section">
          <div className="weighting-header">
            <div className="section-label" style={{marginBottom:0}}><Cpu size={10}/> Adaptive Weighting</div>
            <div className="ai-badge">
              {aiLoading ? <Sparkles size={10} className="animate-spin"/> : <Brain size={10}/>}
              {aiLoading ? 'AI Optimizing...' : 'Gemini Active'}
            </div>
          </div>

          <div className="weights-grid" style={{marginTop:'0.875rem'}}>
            {[
              { key:'heat', label:'Heat', icon:<Sun size={13}/>, tip:'Land surface temperature impact' },
              { key:'water', label:'Water', icon:<Droplets size={13}/>, tip:'Aridity and precipitation' },
              { key:'eco', label:'Ecological', icon:<Leaf size={13}/>, tip:'Vegetation health pressure' },
              { key:'urban', label:'Urban', icon:<Building2 size={13}/>, tip:'Impervious surface density' },
            ].map(({ key, label, icon: ic, tip }) => (
              <div className="weight-card" key={key} title={tip}>
                <div className="weight-card-header">
                  <div className="weight-card-label">{ic} {label}</div>
                  <div className="weight-pct">{Math.round(weights[key]*100)}%</div>
                </div>
                <input type="range" min="0" max="1" step="0.01"
                  value={weights[key]} onChange={(e) => handleWeightChange(key, parseFloat(e.target.value))}/>
              </div>
            ))}
          </div>

          {aiReasoning && (
            <div className="ai-reasoning-box">
              <div className="ai-reasoning-header"><Brain size={12}/> AI Scientific Reasoning</div>
              <div>{formatReasoning(aiReasoning)}</div>
            </div>
          )}
        </div>

        {/* Satellite Metrics */}
        <div className="sidebar-section">
          <div className="section-label"><Database size={10}/> Satellite Metrics</div>
          <div className="metrics-grid">
            <div className="metric-card" title="Land Surface Temperature via MODIS MOD11A2">
              <div className="metric-card-label"><Sun size={11}/> Surface Temp</div>
              <div className="metric-card-value">{metrics.lst}°C</div>
              <div className="metric-card-sub">MODIS LST</div>
            </div>
            <div className="metric-card" title="Vegetation Index via MODIS MOD13Q1">
              <div className="metric-card-label"><Leaf size={11}/> NDVI</div>
              <div className="metric-card-value">{metrics.ndvi}</div>
              <div className="metric-card-sub">Vegetation Health</div>
            </div>
            <div className="metric-card" title="Annual Precipitation via NASA GLDAS 2.1">
              <div className="metric-card-label"><Droplets size={11}/> Rainfall</div>
              <div className="metric-card-value">{Math.round(metrics.precipitation)}</div>
              <div className="metric-card-sub">mm/year</div>
            </div>
            <div className="metric-card" title="USGS NLCD Landcover Code">
              <div className="metric-card-label"><Layers size={11}/> Landcover</div>
              <div className="metric-card-value" style={{fontSize:'0.875rem'}}>{nlcdLabel(metrics.landcover)}</div>
              <div className="metric-card-sub">NLCD {metrics.landcover}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="ai-status">
            <div className={`status-dot ${aiLoading ? 'loading' : ''} ${paused ? 'paused' : ''}`}/>
            {paused
              ? 'Session paused'
              : aiLoading
              ? `Requesting ${activeModel} optimization...`
              : hasData
              ? `AI Engine (${activeModel}) synchronized`
              : 'Click the map to begin analysis'}
          </div>
          <div className="usage-mini">
            {usage.metrics_calls + usage.ai_calls} calls | {usage.cache_hits} cached
          </div>
        </div>
      </aside>

      {/* ── Map ─────────────────────────────────────────────────── */}
      <main className="map-view">
        <MapContainer center={coords} zoom={13} zoomControl={true} style={{height:'100%',width:'100%'}}>
          <ChangeView center={coords} zoom={13}/>
          <MapEvents onMapClick={handleMapClick} paused={paused}/>
          <TileLayer
            key={mapStyle}
            attribution={MAP_STYLES[mapStyle].attribution}
            url={MAP_STYLES[mapStyle].url}
          />
          {pinned && (pinned.coords[0] !== coords[0] || pinned.coords[1] !== coords[1]) && (
            <Marker position={pinned.coords}>
              <Popup>
                <strong>📍 Pinned: {pinned.location}</strong><br/>
                Score {pinned.score.toFixed(2)} · LST {pinned.metrics.lst}°C · NDVI {pinned.metrics.ndvi}
              </Popup>
            </Marker>
          )}
          <Marker position={coords}>
            <Popup>
              <strong>Analysis Point</strong><br/>
              {Math.abs(coords[0]).toFixed(4)}°{coords[0] >= 0 ? 'N' : 'S'}, {Math.abs(coords[1]).toFixed(4)}°{coords[1] >= 0 ? 'E' : 'W'}
            </Popup>
          </Marker>
        </MapContainer>

        {/* ── Map Style Toggle ──────────────────────────────────── */}
        <div className="map-style-control">
          <button
            className="map-style-btn"
            onClick={() => setStyleMenuOpen(v => !v)}
            title="Change map style"
          >
            <MapIcon size={14}/> {MAP_STYLES[mapStyle].name}
          </button>
          {styleMenuOpen && (
            <div className="map-style-menu">
              {Object.entries(MAP_STYLES).map(([key, s]) => (
                <button
                  key={key}
                  className={`map-style-option ${mapStyle === key ? 'active' : ''}`}
                  onClick={() => { setMapStyle(key); setStyleMenuOpen(false); }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Results Panel ─────────────────────────────────────── */}
        <section className="results-panel">
          {!hasData && !loading ? (
            <div className="loading-state">
              <Activity size={32} color="#444" style={{marginBottom:12}} />
              <p style={{fontSize:'13px',fontWeight:600}}>Ready for Analysis</p>
              <p style={{color:'var(--text-muted)',fontSize:'11px'}}>Select a location on the map or search any place to begin.</p>
            </div>
          ) : loading ? (
            <div className="loading-state">
              <RefreshCcw className="animate-spin" size={28} color="#888"/>
              <p>Fetching satellite data...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <ShieldAlert color="#f43f5e" size={24}/>
              <p>{error}</p>
              <button onClick={() => fetchMetrics(coords[0], coords[1])}>Retry Analysis</button>
            </div>
          ) : (
            <>
              <div className="score-display">
                <div className="score-number"
                  style={{ backgroundImage:`linear-gradient(135deg, ${status.color} 0%, #818cf8 100%)` }}>
                  {score.toFixed(2)}
                </div>
                <div className="score-label">Climate Stress Index</div>
                <div className="status-badge" style={{ color: status.color, borderColor:`${status.color}55` }}>
                  {status.icon}&nbsp;{status.label}
                </div>
              </div>

              <div className="progress-track">
                <div className="progress-fill" style={{ width:`${score*100}%`, background: score>=0.65 ? 'linear-gradient(90deg,#e5484d,#f97316)' : score>=0.35 ? 'linear-gradient(90deg,#f5a623,#eab308)' : 'linear-gradient(90deg,#30a46c,#34d399)' }}/>
              </div>

              <div className="action-row">
                <button className="action-btn" onClick={shareLocation} title="Copy shareable link">
                  <Share2 size={12}/> Share
                </button>
                {!pinned ? (
                  <button className="action-btn" onClick={pinForCompare} title="Pin this location, then click another to compare">
                    <Pin size={12}/> Pin to compare
                  </button>
                ) : pinned.coords[0] === coords[0] && pinned.coords[1] === coords[1] ? (
                  <button className="action-btn pinned" onClick={clearPin} title="Unpin">
                    <Pin size={12}/> Pinned · click to unpin
                  </button>
                ) : (
                  <button className="action-btn compare" onClick={startCompare} title={`Compare with ${pinned.location}`}>
                    <GitCompare size={12}/> Compare with pinned
                  </button>
                )}
              </div>

              {pinned && pinned.coords[0] !== coords[0] && (
                <div className="pinned-banner">
                  📍 Pinned: <strong>{pinned.location}</strong> (score {pinned.score.toFixed(2)})
                  <button className="pinned-clear" onClick={clearPin}><X size={11}/></button>
                </div>
              )}

              <div className="context-line">
                Analyzing <strong>{location}</strong>. Weighting optimized by Gemini AI
                based on real-time satellite environmental thresholds.
              </div>

              {recommendations.length > 0 && (
                <>
                  <div className="recs-header">Policy Recommendations</div>
                  {recommendations.map((rec, i) => (
                    <div key={i} className="rec-card" style={{borderLeftColor: rec.type === 'heat' ? '#f87171' : rec.type === 'water' ? '#60a5fa' : rec.type === 'eco' ? '#4ade80' : '#a78bfa'}}>
                      <div className="rec-icon-wrap" style={{color: rec.type === 'heat' ? '#f87171' : rec.type === 'water' ? '#60a5fa' : rec.type === 'eco' ? '#4ade80' : '#a78bfa'}}>
                        {getIconForType(rec.type)}
                      </div>
                      <div className="rec-body">
                        <div className="rec-title">{rec.title}</div>
                        <div className="rec-desc">{rec.desc}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </section>
      </main>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {showDocs && <DocsModal onClose={() => setShowDocs(false)} activeModel={activeModel} />}
      {showUsage && <UsagePanel usage={usage} onClose={() => setShowUsage(false)} />}
      {showChat && (
        <ChatPanel
          onClose={() => setShowChat(false)}
          apiUrl={API_URL}
          context={{ location: { lat: coords[0], lng: coords[1] }, metrics, score }}
          compareContext={compareContext}
          user={user}
        />
      )}
      {shareToast && (
        <div className="share-toast">{shareToast}</div>
      )}
      {showHistory && (
        <HistoryPanel
          onClose={() => setShowHistory(false)}
          chats={chatHistory}
          loading={historyLoading}
        />
      )}
    </div>
  );
};

export default App;
