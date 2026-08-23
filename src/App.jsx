import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import {
  MapPin, Info, Zap, RefreshCcw, Activity, Sparkles, Brain,
  Sun, Droplets, Leaf, Building2, Layers, ShieldAlert,
  BookOpen, X, Database, Cpu, Search, Pause, Play, BarChart3,
  MessageSquare, Send
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './App.css';

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
                ClimateIntel is a real-time, AI-augmented decision-support tool designed for urban planners, environmental policy researchers, and government agencies. It provides location-specific multi-dimensional climate vulnerability assessments by integrating satellite remote sensing data with machine learning inference.
              </p>
              <p className="docs-para">
                The dashboard quantifies four primary stress vectors: thermal load (Heat), water availability (Water), ecological health (Ecological), and built-environment pressure (Urban Density). These are synthesized into a single Stress Index by a Gemini-powered adaptive weighting engine.
              </p>

              <div className="docs-section-title">The Four Stress Dimensions</div>
              {[
                { icon:<Sun size={16}/>, color:'#f87171', title:'Heat Stress', desc:'Derived from MODIS Land Surface Temperature (LST). Captures the thermal burden on populations and infrastructure, especially amplified by Urban Heat Island (UHI) effects.' },
                { icon:<Droplets size={16}/>, color:'#60a5fa', title:'Water Stress', desc:'Calculated from NASA GLDAS precipitation rates. Indicates the risk of water scarcity, drought conditions, and strain on municipal water supply.' },
                { icon:<Leaf size={16}/>, color:'#4ade80', title:'Ecological Stress', desc:'Indexed by MODIS NDVI (Normalized Difference Vegetation Index). Monitors vegetation health, biomass coverage, and biodiversity support capacity.' },
                { icon:<Building2 size={16}/>, color:'#a78bfa', title:'Urban Density Stress', desc:'Derived from USGS NLCD Landcover classification codes (21-24). Quantifies pressure from impervious surfaces and displacement of natural land.' },
              ].map(d => (
                <div className="data-source-row" key={d.title}>
                  <div style={{color:d.color,flexShrink:0,marginTop:2}}>{d.icon}</div>
                  <div>
                    <div className="data-source-name" style={{color:d.color}}>{d.title}</div>
                    <div className="data-source-desc">{d.desc}</div>
                  </div>
                </div>
              ))}

              <div className="docs-section-title">Adaptive AI Weighting</div>
              <p className="docs-para">
                The platform uses <strong>Google {activeModel}</strong> to analyze satellite metrics and compute optimal adaptive weights for location-specific policy guidance.
              </p>
              <div className="docs-callout">
                If Gemini rate limits are reached, a <strong>Smart Heuristic Fallback</strong> engine activates using rule-based logic — ensuring the dashboard is always functional.
              </div>
            </>
          )}

          {activeTab === 'data' && (
            <>
              <div className="docs-section-title">Satellite Data Sources</div>
              {[
                { icon:<Database size={16}/>, name:'MODIS MOD11A2 (LST)', desc:'NASA Terra/Aqua satellite. 8-day composite Land Surface Temperature at 1km resolution.' },
                { icon:<Database size={16}/>, name:'MODIS MOD13Q1 (NDVI)', desc:'16-day composite Normalized Difference Vegetation Index at 250m resolution.' },
                { icon:<Database size={16}/>, name:'NASA GLDAS 2.1', desc:'Global Land Data Assimilation System. Provides precipitation rate data for water stress scoring.' },
                { icon:<Database size={16}/>, name:'USGS NLCD 2021', desc:'National Land Cover Database. 30m resolution landcover classification (codes 21-24 = urban).' },
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

              <div className="docs-section-title">AI Engine</div>
              <div className="data-source-row">
                <div className="data-source-icon"><Cpu size={16}/></div>
                <div>
                  <div className="data-source-name">Google Gemini Flash</div>
                  <div className="data-source-desc">Flash model for weight optimization and policy recommendations. Responses are cached per location to minimize API usage.</div>
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

function ChatPanel({ onClose, apiUrl, context }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I can answer questions about climate, the satellite data shown here, or the current analysis point. What would you like to know?" }
  ]);
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
    try {
      const r = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context }),
      });
      const d = await r.json();
      setMessages(m => [...m, { role: 'assistant', text: d.reply || d.error || 'No response.' }]);
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
            <div className="docs-title">Ask ClimateIntel AI</div>
            <div className="docs-subtitle">Powered by Gemini · Ask about your analysis</div>
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
            <button className="btn-ghost" onClick={() => setShowChat(true)}>
              <MessageSquare size={13}/> Ask AI
            </button>
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
        <div className="sidebar-section">
          <div className="section-label"><MapPin size={10}/> Location Target</div>
          <form className="location-form" onSubmit={handleLocationSubmit}>
            <input
              className="location-input"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
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
            attribution='&copy; CARTO &copy; OpenStreetMap'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <Marker position={coords}>
            <Popup>
              <strong>Analysis Point</strong><br/>
              {Math.abs(coords[0]).toFixed(4)}°{coords[0] >= 0 ? 'N' : 'S'}, {Math.abs(coords[1]).toFixed(4)}°{coords[1] >= 0 ? 'E' : 'W'}
            </Popup>
          </Marker>
        </MapContainer>

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
        />
      )}
    </div>
  );
};

export default App;
