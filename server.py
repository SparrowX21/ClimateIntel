import ee
import os
import json
import time
import threading
from collections import OrderedDict
from flask import Flask, request, jsonify
from flask_cors import CORS
import datetime
import xgboost as xgb
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app, origins=[
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    os.getenv('FRONTEND_ORIGIN', 'http://localhost:3000'),
])

# ── Gemini AI ────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
target_model = 'models/gemini-1.5-flash'
model = None

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    available_models = []
    try:
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                available_models.append(m.name)
    except Exception as e:
        print(f"Failed to list models: {e}")

    flash_pref = [
        'models/gemini-2.5-flash',
        'models/gemini-2.0-flash',
        'models/gemini-1.5-flash',
    ]
    target_model = next((m for m in flash_pref if m in available_models), None)
    if not target_model:
        target_model = available_models[0] if available_models else 'models/gemini-1.5-flash'

    model = genai.GenerativeModel(target_model)
    print(f"Selected Gemini Model: {target_model}")
else:
    print("Warning: GEMINI_API_KEY not found — AI weights will use heuristic fallback.")

# ── Caches & Counters ────────────────────────────────────────────────────────

MAX_CACHE_ENTRIES = int(os.getenv('MAX_CACHE_ENTRIES', '500'))
CACHE_TTL_SECONDS = int(os.getenv('CACHE_TTL', '3600'))


class LRUCache:
    def __init__(self, maxsize):
        self._data = OrderedDict()
        self._lock = threading.Lock()
        self.maxsize = maxsize

    def get_valid(self, key):
        with self._lock:
            entry = self._data.get(key)
            if not entry:
                return None
            if (time.time() - entry.get('_ts', 0)) >= CACHE_TTL_SECONDS:
                self._data.pop(key, None)
                return None
            self._data.move_to_end(key)
            return entry

    def put(self, key, value):
        with self._lock:
            self._data[key] = {**value, '_ts': time.time()}
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)


weights_cache = LRUCache(MAX_CACHE_ENTRIES)
metrics_cache = LRUCache(MAX_CACHE_ENTRIES)

_counter_lock = threading.Lock()
usage_counter = {
    'metrics_calls': 0,
    'ai_calls': 0,
    'cache_hits': 0,
    'tokens_saved': 0,
    'started_at': datetime.datetime.utcnow().isoformat(),
}


def _inc_counter(key, amount=1):
    with _counter_lock:
        usage_counter[key] += amount

# ── Earth Engine ─────────────────────────────────────────────────────────────

PROJECT_ID = os.getenv('GEE_PROJECT_ID', 'my-unique-project-id-1234567')
ee_initialized = False

try:
    ee.Initialize(project=PROJECT_ID)
    ee_initialized = True
    print(f"Earth Engine initialized with project: {PROJECT_ID}")
except Exception as e:
    print(f"EE init failed: {e}. Satellite data will use fallback values.")

# ── XGBoost Models ───────────────────────────────────────────────────────────

WATER_MODEL_PATH = os.getenv('WATER_MODEL_PATH', 'water_stress.json')
ECO_MODEL_PATH = os.getenv('ECO_MODEL_PATH', 'ecological_stress.json')

def load_xgb_model(path):
    if os.path.exists(path):
        m = xgb.Booster()
        m.load_model(path)
        return m
    return None

water_model = load_xgb_model(WATER_MODEL_PATH)
eco_model = load_xgb_model(ECO_MODEL_PATH)

# ── Helpers ──────────────────────────────────────────────────────────────────

def cache_key_for_coords(lat, lng, precision=2):
    return f"{round(lat, precision)}_{round(lng, precision)}"

NLCD_NAMES = {
    11: 'Open Water', 21: 'Dev. Open Space', 22: 'Dev. Low Intensity',
    23: 'Dev. Medium Intensity', 24: 'Dev. High Intensity', 31: 'Barren Land',
    41: 'Deciduous Forest', 42: 'Evergreen Forest', 43: 'Mixed Forest',
    52: 'Shrub/Scrub', 71: 'Herbaceous', 81: 'Hay/Pasture',
    82: 'Cultivated Crops', 90: 'Woody Wetlands', 95: 'Emergent Wetlands',
}

# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/api/model-info')
def model_info():
    display_name = target_model.split('/')[-1] if target_model else 'unknown'
    return jsonify({'model': display_name})


@app.route('/api/usage')
def get_usage():
    return jsonify(usage_counter)


@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    lat_raw = request.args.get('lat')
    lng_raw = request.args.get('lng')

    if lat_raw is None or lng_raw is None:
        return jsonify({'error': 'lat and lng query parameters are required'}), 400

    try:
        lat = float(lat_raw)
        lng = float(lng_raw)
    except ValueError:
        return jsonify({'error': 'lat and lng must be valid numbers'}), 400

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return jsonify({'error': 'lat must be -90..90, lng must be -180..180'}), 400

    _inc_counter('metrics_calls')

    ck = cache_key_for_coords(lat, lng)
    cached = metrics_cache.get_valid(ck)
    if cached:
        _inc_counter('cache_hits')
        result = {k: v for k, v in cached.items() if k != '_ts'}
        return jsonify(result)

    if not ee_initialized:
        fallback = _fallback_metrics(lat, lng)
        return jsonify(fallback)

    try:
        point = ee.Geometry.Point([lng, lat])

        lst_collection = ee.ImageCollection('MODIS/006/MOD11A2') \
            .filterDate('2018-01-01', '2023-12-31') \
            .select('LST_Day_1km')
        lst_mean = lst_collection.mean().reduceRegion(
            reducer=ee.Reducer.mean(), geometry=point, scale=1000
        ).get('LST_Day_1km')
        lst_val = ee.Number(lst_mean).multiply(0.02).subtract(273.15).getInfo() if lst_mean else 25.0

        ndvi_collection = ee.ImageCollection('MODIS/006/MOD13Q1') \
            .filterDate('2018-01-01', '2023-12-31') \
            .select('NDVI')
        ndvi_mean = ndvi_collection.mean().reduceRegion(
            reducer=ee.Reducer.mean(), geometry=point, scale=250
        ).get('NDVI')
        ndvi_val = ee.Number(ndvi_mean).multiply(0.0001).getInfo() if ndvi_mean else 0.4

        gldas = ee.ImageCollection('NASA/GLDAS/V021/NOAH/G025/T3H') \
            .filterDate('2018-01-01', '2021-12-31')
        prec_rate_obj = gldas.select('Rainf_tavg').mean().reduceRegion(
            reducer=ee.Reducer.mean(), geometry=point, scale=27830
        ).get('Rainf_tavg')
        precip_rate = ee.Number(prec_rate_obj).getInfo() if prec_rate_obj else 0.0
        annual_precip = precip_rate * (365.25 * 24 * 3600)

        nlcd_2021 = ee.Image('USGS/NLCD_RELEASES/2021_REL/NLCD/2021').select('landcover')
        landcover_val = nlcd_2021.reduceRegion(
            reducer=ee.Reducer.mode(), geometry=point, scale=30
        ).get('landcover')
        lc_numeric = ee.Number(landcover_val).getInfo() if landcover_val else 11

        humidity_val = 45.0
        developed_mask_val = 1 if lc_numeric in [21, 22, 23, 24] else 0

        if water_model:
            dmat = xgb.DMatrix([[lst_val, humidity_val, lc_numeric]],
                               feature_names=['LST_Celsius', 'Relative_Humidity', 'landcover'])
            raw_water_stress = float(water_model.predict(dmat)[0])
        else:
            raw_water_stress = (800 - annual_precip) if annual_precip else 300.0

        if eco_model:
            dmat = xgb.DMatrix([[lst_val, ndvi_val, developed_mask_val, raw_water_stress]],
                               feature_names=['LST_Celsius', 'Normalized_NDVI', 'Developed_Land_Mask', 'Conceptual_Water_Stress_Index'])
            raw_eco_stress = float(eco_model.predict(dmat)[0])
        else:
            raw_eco_stress = lst_val + (1 - ndvi_val) + developed_mask_val + (raw_water_stress / 500)

        raw_urban_stress = (lst_val / 40) + (1 - ndvi_val) + (developed_mask_val * 2)

        norm_heat = max(0, min(1, (lst_val - 20) / 25))
        norm_water = max(0, min(1, (raw_water_stress + 500) / 1500))
        norm_eco = max(0, min(1, (raw_eco_stress - 25) / 20))
        norm_urban = max(0, min(1, (raw_urban_stress - 0.5) / 3))

        result = {
            'location': {'lat': lat, 'lng': lng},
            'metrics': {
                'lst': round(lst_val, 2),
                'ndvi': round(ndvi_val, 3),
                'precipitation': round(annual_precip, 2),
                'landcover': lc_numeric,
            },
            'normalized': {
                'heat': round(norm_heat, 3),
                'water': round(norm_water, 3),
                'eco': round(norm_eco, 3),
                'urban': round(norm_urban, 3),
            },
        }

        metrics_cache.put(ck, result)
        return jsonify(result)

    except Exception as e:
        print(f"Metrics endpoint error: {e}")
        return jsonify(_fallback_metrics(lat, lng))


def _fallback_metrics(lat, lng):
    return {
        'location': {'lat': lat, 'lng': lng},
        'metrics': {'lst': 25.0, 'ndvi': 0.4, 'precipitation': 800.0, 'landcover': 21},
        'normalized': {'heat': 0.5, 'water': 0.3, 'eco': 0.2, 'urban': 0.4},
        'warning': 'Using demo data — Earth Engine unavailable',
    }


@app.route('/api/ai-weights', methods=['POST'])
def suggest_weights():
    data = request.get_json(silent=True)
    if not data or 'metrics' not in data or 'location' not in data:
        return jsonify({'error': 'Request body must include metrics and location'}), 400

    metrics = data['metrics']
    loc = data['location']
    _inc_counter('ai_calls')

    ck = cache_key_for_coords(loc['lat'], loc['lng'], precision=1)
    cached = weights_cache.get_valid(ck)
    if cached:
        _inc_counter('cache_hits')
        _inc_counter('tokens_saved', 800)
        result = {k: v for k, v in cached.items() if k != '_ts'}
        return jsonify(result)

    if model:
        try:
            lc_label = NLCD_NAMES.get(int(metrics.get('landcover', 0)), str(metrics.get('landcover', '')))

            prompt = (
                f"Climate scientist: analyze satellite data at ({loc['lat']:.4f}, {loc['lng']:.4f}).\n"
                f"LST: {metrics['lst']}°C | NDVI: {metrics['ndvi']} | Precip: {metrics['precipitation']:.0f}mm/yr | NLCD: {metrics.get('landcover','')} ({lc_label})\n\n"
                f"Return JSON only:\n"
                f'{{"weights":{{"heat":N,"water":N,"eco":N,"urban":N}},'
                f'"recommendations":[{{"title":"...","desc":"...","type":"heat|water|eco|urban"}},...(3 items)],'
                f'"reasoning":"**Heat Stress Analysis:** ... **Water Stress Analysis:** ... '
                f'**Ecological Stress Analysis:** ... **Urban Density Analysis:** ... **Weight Rationale:** ..."}}'
            )

            response = model.generate_content(prompt)
            text = response.text.strip()
            if '```json' in text:
                text = text.split('```json')[1].split('```')[0].strip()
            elif '```' in text:
                text = text.split('```')[1].strip()

            result = json.loads(text)
            result = _validate_ai_result(result, metrics)
            weights_cache.put(ck, result)
            return jsonify(result)

        except Exception as e:
            print(f"Gemini API error: {e}")

    result = _heuristic_weights(metrics)
    weights_cache.put(ck, result)
    return jsonify(result)


def _validate_ai_result(result, metrics):
    w = result.get('weights')
    if not w or not all(k in w for k in ('heat', 'water', 'eco', 'urban')):
        return _heuristic_weights(metrics)
    try:
        w = {k: float(w[k]) for k in ('heat', 'water', 'eco', 'urban')}
    except (ValueError, TypeError):
        return _heuristic_weights(metrics)
    total = sum(w.values())
    if total <= 0:
        return _heuristic_weights(metrics)
    w = {k: v / total for k, v in w.items()}
    result['weights'] = w
    recs = result.get('recommendations', [])
    if not isinstance(recs, list):
        result['recommendations'] = []
    result.setdefault('reasoning', '')
    return result


def _heuristic_weights(metrics):
    lst = metrics.get('lst', 28)
    precip = metrics.get('precipitation', 800)
    ndvi = metrics.get('ndvi', 0.3)
    lc = metrics.get('landcover', 21)

    is_hot = lst > 35
    is_arid = precip < 450
    is_urban = lc in [23, 24]
    is_suburban = lc == 22

    if is_hot:
        h, w, e, u = 0.45, 0.15, 0.15, 0.25
        recs = [
            {"title": "Emergency Cool Zones", "desc": f"LST at {lst}°C — establish 24/7 cooling centers within 500m of vulnerable populations.", "type": "heat"},
            {"title": "Reflective Pavement Program", "desc": "Mandate albedo coatings (reflectance >= 0.5) on arterial roads to reduce ambient temps 1-3°C.", "type": "urban"},
            {"title": "Urban Tree Canopy Expansion", "desc": f"NDVI {ndvi} indicates low cover. Target 30% canopy within 1km via native species.", "type": "eco"},
        ]
    elif is_arid:
        h, w, e, u = 0.15, 0.50, 0.20, 0.15
        recs = [
            {"title": "Stormwater Harvesting", "desc": f"At {precip:.0f}mm/yr, deploy rainwater capture targeting 80% runoff retention.", "type": "water"},
            {"title": "Xeriscaping Mandate", "desc": "Replace irrigated lawns with drought-tolerant native species. Cuts water use 50-75%.", "type": "water"},
            {"title": "Aquifer Recharge Zones", "desc": "Designate protected recharge areas near floodplains.", "type": "eco"},
        ]
    elif is_urban:
        h, w, e, u = 0.20, 0.15, 0.10, 0.55
        recs = [
            {"title": "Permeable Pavement Mandate", "desc": f"NLCD {lc} confirms high impervious cover. Require permeable paving for new lots.", "type": "urban"},
            {"title": "Green Roof Policy", "desc": "Incentivize green roofs on commercial buildings > 500m².", "type": "eco"},
            {"title": "Urban Biodiversity Corridors", "desc": "Establish 10m vegetated corridors along secondary roads.", "type": "urban"},
        ]
    elif is_suburban:
        h, w, e, u = 0.25, 0.20, 0.25, 0.30
        recs = [
            {"title": "Mixed-Use Zoning", "desc": f"NLCD {lc} — promote walkable mixed-use to reduce vehicle emissions.", "type": "urban"},
            {"title": "Green Space Integration", "desc": f"NDVI {ndvi} — require 20% green space in new developments.", "type": "eco"},
            {"title": "Stormwater Management", "desc": f"At {precip:.0f}mm/yr, implement rain gardens and bioswales.", "type": "water"},
        ]
    else:
        h, w, e, u = 0.25, 0.25, 0.25, 0.25
        recs = [
            {"title": "Environmental Monitoring", "desc": f"Stable conditions (LST: {lst}°C, NDVI: {ndvi}). Deploy IoT sensors for early stress detection.", "type": "eco"},
            {"title": "Preventative Green Infrastructure", "desc": "Maintain and expand existing green cover.", "type": "eco"},
            {"title": "Land Use Planning Review", "desc": f"NLCD {lc} — ensure zoning prevents high-intensity encroachment.", "type": "urban"},
        ]

    reasoning = _build_reasoning(lst, precip, ndvi, lc, h, w, e, u)

    return {
        'weights': {'heat': h, 'water': w, 'eco': e, 'urban': u},
        'recommendations': recs,
        'reasoning': reasoning,
    }


def _build_reasoning(lst, precip, ndvi, lc, h, w, e, u):
    dominant = max(zip([h, w, e, u], ['Heat', 'Water', 'Ecological', 'Urban']), key=lambda x: x[0])
    return (
        f"**Heat Stress Analysis:** LST of {lst}°C is {'critically elevated' if lst > 35 else 'within moderate range'}. "
        f"{'Significant UHI risk in built areas.' if lst > 30 else 'No acute thermal burden detected.'} "
        f"**Water Stress Analysis:** {precip:.0f}mm/yr precipitation is {'below sustainability thresholds' if precip < 450 else 'adequate for current land use'}. "
        f"**Ecological Stress Analysis:** NDVI of {ndvi} indicates {'sparse vegetation' if ndvi < 0.2 else 'moderate vegetation health' if ndvi < 0.4 else 'healthy vegetation'}. "
        f"**Urban Density Analysis:** NLCD {lc} — {'high-density development with significant impervious surfaces' if lc in [23,24] else 'moderate development' if lc in [21,22] else 'natural/semi-natural landscape'}. "
        f"**Weight Rationale:** {dominant[1]} stress is dominant at {int(dominant[0]*100)}% based on satellite observations."
    )


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()
    context = data.get('context') or {}

    if not message:
        return jsonify({'error': 'message is required'}), 400
    if len(message) > 1000:
        return jsonify({'error': 'message must be under 1000 characters'}), 400

    _inc_counter('ai_calls')

    if not model:
        return jsonify({
            'reply': "Chat is unavailable — the Gemini API key isn't configured on the server."
        })

    try:
        loc = context.get('location') or {}
        m = context.get('metrics') or {}
        score = context.get('score')
        lc_raw = m.get('landcover')
        try:
            lc_label = NLCD_NAMES.get(int(lc_raw), '') if lc_raw not in (None, '', 'N/A') else ''
        except (ValueError, TypeError):
            lc_label = ''

        ctx_line = ''
        if loc.get('lat') is not None and m:
            ctx_line = (
                f"Current analysis point: ({loc.get('lat'):.3f}, {loc.get('lng'):.3f}). "
                f"LST {m.get('lst','?')}°C, NDVI {m.get('ndvi','?')}, "
                f"Precip {m.get('precipitation','?')}mm/yr, NLCD {m.get('landcover','?')} ({lc_label}). "
                f"Stress index: {score if score is not None else '?'}.\n\n"
            )

        prompt = (
            f"You are ClimateIntel's climate science assistant. Answer concisely (2-4 sentences) "
            f"in plain language. Only discuss climate, weather, urban planning, ecology, or the "
            f"platform's data sources. Politely decline off-topic questions.\n\n"
            f"{ctx_line}"
            f"User: {message}"
        )

        response = model.generate_content(prompt)
        reply = (response.text or '').strip()
        if not reply:
            reply = "Sorry — the model returned an empty response. Try rephrasing."
        return jsonify({'reply': reply})

    except Exception as e:
        print(f"Chat endpoint error: {e}")
        return jsonify({'reply': "The AI service is temporarily unavailable. Please try again."}), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=port, debug=debug)
