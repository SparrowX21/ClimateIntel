import ee
import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import datetime
import xgboost as xgb
import google.generativeai as genai
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize Gemini AI
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    available_models = []
    try:
        print("Available Gemini Models:")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                available_models.append(m.name)
                print(f" - {m.name}")
    except Exception as e:
        print(f"Failed to list models: {e}")
    
    # Prioritize Gemini 2.5 Flash
    flash_pref = ['models/gemini-2.5-flash', 'models/gemini-2.0-flash-exp', 'models/gemini-2.0-flash', 'models/gemini-1.5-flash']
    target_model = next((m for m in flash_pref if m in available_models), 'models/gemini-2.5-flash')
    
    if target_model not in available_models:
        # Final fallback to any available model
        target_model = available_models[0] if available_models else 'models/gemini-1.5-flash'
    
    model = genai.GenerativeModel(target_model)
    print(f"Selected Gemini Model: {target_model}")
else:
    print("Warning: GEMINI_API_KEY not found in environment.")

# Simple In-Memory Cache for AI Weights
weights_cache = {}  # Clear cache to force regeneration with new system

# Initialize Earth Engine
PROJECT_ID = 'my-unique-project-id-1234567'

# Model paths (Expected if user exports them from notebook)
WATER_MODEL_PATH = 'water_stress.json'
ECO_MODEL_PATH = 'ecological_stress.json'

def load_xgb_model(path):
    if os.path.exists(path):
        m = xgb.Booster()
        m.load_model(path)
        return m
    return None

water_model = load_xgb_model(WATER_MODEL_PATH)
eco_model = load_xgb_model(ECO_MODEL_PATH)

try:
    ee.Initialize(project=PROJECT_ID)
    print(f"Earth Engine initialized with project: {PROJECT_ID}")
except Exception as e:
    print(f"EE Initialization failed: {e}. Attempting default...")
    try:
        ee.Initialize()
    except:
        print("EE Initialization completely failed. Please run 'earthengine authenticate' locally.")

@app.route('/api/model-info')
def model_info():
    """Returns the name of the active Gemini model for UI clarity."""
    try:
        # Extract model name (e.g., gemini-2.0-flash-exp) from path
        display_name = target_model.split('/')[-1] if 'target_model' in globals() else "Unknown"
        return jsonify({'model': display_name})
    except Exception:
        return jsonify({'model': "Gemini 1.5 Flash (Fallback)"})

@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    try:
        lat = float(request.args.get('lat'))
        lng = float(request.args.get('lng'))
        
        point = ee.Geometry.Point([lng, lat])
        
        # 1. Fetch LST (Land Surface Temperature)
        lst_collection = ee.ImageCollection('MODIS/006/MOD11A2') \
            .filterDate('2018-01-01', '2023-12-31') \
            .select('LST_Day_1km')
        
        lst_mean = lst_collection.mean().reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=point,
            scale=1000
        ).get('LST_Day_1km')
        
        lst_val = ee.Number(lst_mean).multiply(0.02).subtract(273.15).getInfo() if lst_mean else 25.0
        
        # 2. Fetch NDVI (Vegetation Index)
        ndvi_collection = ee.ImageCollection('MODIS/006/MOD13Q1') \
            .filterDate('2018-01-01', '2023-12-31') \
            .select('NDVI')
        
        ndvi_mean = ndvi_collection.mean().reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=point,
            scale=250
        ).get('NDVI')
        
        ndvi_val = ee.Number(ndvi_mean).multiply(0.0001).getInfo() if ndvi_mean else 0.4
        
        # 3. Fetch Precipitation (GLDAS)
        gldas = ee.ImageCollection('NASA/GLDAS/V021/NOAH/G025/T3H') \
            .filterDate('2018-01-01', '2021-12-31')
        
        prec_rate_obj = gldas.select('Rainf_tavg').mean().reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=point,
            scale=27830
        ).get('Rainf_tavg')
        
        precip_rate = ee.Number(prec_rate_obj).getInfo() if prec_rate_obj else 0.0
        annual_precip = precip_rate * (365.25 * 24 * 3600)
        
        # 4. Fetch Urban Density (NLCD Landcover)
        nlcd_2021 = ee.Image('USGS/NLCD_RELEASES/2021_REL/NLCD/2021').select('landcover')
        landcover_val = nlcd_2021.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=point,
            scale=30
        ).get('landcover')
        
        lc_numeric = ee.Number(landcover_val).getInfo() if landcover_val else 11 # Default Open Water
        
        # --- ML Inference & Indexing ---
        humidity_val = 45.0 
        developed_mask_val = 1 if lc_numeric in [21, 22, 23, 24] else 0
        
        # 1. WATER STRESS
        if water_model:
            dmat = xgb.DMatrix([[lst_val, humidity_val, lc_numeric]], 
                                feature_names=['LST_Celsius', 'Relative_Humidity', 'landcover'])
            raw_water_stress = water_model.predict(dmat)[0]
        else:
            raw_water_stress = (800 - annual_precip) if annual_precip else 300.0
        
        # 2. ECOLOGICAL STRESS
        if eco_model:
            dmat = xgb.DMatrix([[lst_val, ndvi_val, developed_mask_val, raw_water_stress]], 
                                feature_names=['LST_Celsius', 'Normalized_NDVI', 'Developed_Land_Mask', 'Conceptual_Water_Stress_Index'])
            raw_eco_stress = eco_model.predict(dmat)[0]
        else:
            raw_eco_stress = lst_val + (1 - ndvi_val) + developed_mask_val + (raw_water_stress / 500)

        # 3. URBAN DENSITY STRESS (Conceptual Index from Notebook)
        # Higher LST + Low NDVI + Developed Mask = High Urban Stress
        raw_urban_stress = (lst_val / 40) + (1 - ndvi_val) + (developed_mask_val * 2)

        # Normalization (0-1)
        norm_heat = max(0, min(1, (lst_val - 20) / (45 - 20)))
        norm_water = max(0, min(1, (raw_water_stress + 500) / 1500))
        norm_eco = max(0, min(1, (raw_eco_stress - 25) / (45 - 25)))
        norm_urban = max(0, min(1, (raw_urban_stress - 0.5) / (3.5 - 0.5)))
        
        return jsonify({
            'location': {'lat': lat, 'lng': lng},
            'metrics': {
                'lst': round(lst_val, 2),
                'ndvi': round(ndvi_val, 3),
                'precipitation': round(annual_precip, 2),
                'landcover': lc_numeric
            },
            'normalized': {
                'heat': round(norm_heat, 3),
                'water': round(norm_water, 3),
                'eco': round(norm_eco, 3),
                'urban': round(norm_urban, 3)
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai-weights', methods=['POST'])
def suggest_weights():
    try:
        data = request.json
        metrics = data.get('metrics')
        loc = data.get('location')
        
        # 1. Check Cache first - more granular caching
        cache_key = f"{round(loc['lat'], 2)}_{round(loc['lng'], 2)}_{metrics['lst']:.1f}_{metrics['ndvi']:.2f}_{metrics['precipitation']:.0f}_{metrics['landcover']}"
        if cache_key in weights_cache:
            return jsonify(weights_cache[cache_key])
        
        nlcd_names = {
            11:'Open Water', 21:'Dev. Open Space', 22:'Dev. Low Intensity',
            23:'Dev. Medium Intensity', 24:'Dev. High Intensity', 31:'Barren Land',
            41:'Deciduous Forest', 42:'Evergreen Forest', 43:'Mixed Forest',
            52:'Shrub/Scrub', 71:'Herbaceous', 81:'Hay/Pasture',
            82:'Cultivated Crops', 90:'Woody Wetlands', 95:'Emergent Wetlands'
        }
        lc_label = nlcd_names.get(int(metrics['landcover']), str(metrics['landcover']))
        
        prompt = f"""
        You are a climate scientist analyzing real satellite data for a policy planning application.
        
        Location: ({loc['lat']:.4f}, {loc['lng']:.4f})
        
        Satellite Metrics:
        - Land Surface Temperature (MODIS LST): {metrics['lst']}°C
        - Vegetation Index (MODIS NDVI): {metrics['ndvi']} (scale: -1 to 1, healthy vegetation > 0.5)
        - Annual Precipitation (NASA GLDAS): {metrics['precipitation']:.1f} mm/year
        - USGS NLCD Landcover Code: {metrics['landcover']} ({lc_label})
        
        Tasks:
        1. Analyze the unique environmental conditions at this specific location and assign 4 climate stress weights (heat, water, eco, urban) that sum to exactly 1.0.
        
        2. Provide 3 specific, targeted policy recommendations with concrete technical details tailored to the identified environmental conditions.
        
        3. Write detailed scientific reasoning for each stress dimension using these EXACT bold headers:
           **Heat Stress Analysis:** (2-3 sentences explaining LST value, UHI risk, thermal burden implications)
           **Water Stress Analysis:** (2-3 sentences explaining precipitation adequacy, aridity risk, supply pressure)
           **Ecological Stress Analysis:** (2-3 sentences explaining NDVI meaning, biodiversity implications, habitat quality)
           **Urban Density Analysis:** (2-3 sentences explaining landcover code meaning, impervious surface effects, sprawl risk)
           **Weight Rationale:** (1-2 sentences summarizing why these specific weights were chosen given the unique environmental data)
        
        CRITICAL: Each location has unique environmental conditions. Your weights must reflect the specific stressors present at THIS location. Different locations should have different weight distributions based on their actual climate data.
        
        Output ONLY valid JSON:
        {{
          "weights": {{"heat": 0.3, "water": 0.2, "eco": 0.2, "urban": 0.3}},
          "recommendations": [
            {{"title": "Title", "desc": "Detailed technical description with specific metrics and actions.", "type": "heat"}},
            {{"title": "Title", "desc": "...", "type": "water"}},
            {{"title": "Title", "desc": "...", "type": "urban"}}
          ],
          "reasoning": "**Heat Stress Analysis:** ... **Water Stress Analysis:** ... **Ecological Stress Analysis:** ... **Urban Density Analysis:** ... **Weight Rationale:** ..."
        }}
        """
        
        response = model.generate_content(prompt)
        text = response.text.strip()
        if '```json' in text:
            text = text.split('```json')[1].split('```')[0].strip()
        elif '```' in text:
            text = text.split('```')[1].strip()
            
        result = json.loads(text)
        
        # Save to cache
        weights_cache[cache_key] = result
        return jsonify(result)
            
    except Exception as e:
        import traceback
        print(f"Gemini API error (Full Traceback):")
        traceback.print_exc()
        
        # Continue to fallback system
        metrics = request.json.get('metrics', {})
        lst = metrics.get('lst', 28)
        precip = metrics.get('precipitation', 800)
        ndvi = metrics.get('ndvi', 0.3)
        lc = metrics.get('landcover', 21)
        
        h, w, e, u = 0.25, 0.25, 0.25, 0.25
        recs = []

        # Determine dominant stressor and reasoning
        is_hot = lst > 35
        is_arid = precip < 450
        is_urban = lc in [23, 24]  # Only medium/high density urban
        is_suburban = lc == 22  # Low intensity development
        is_degraded = ndvi < 0.2

        # Weights
        if is_hot:
            h, w, e, u = 0.45, 0.15, 0.15, 0.25
            recs = [
                {"title": "Emergency Cool Zones", "desc": f"With LST at {lst}°C, establish high-capacity cooling centers with 24/7 access within 500m walking distance of vulnerable populations. Target ≥ 1 center per 5,000 residents in dense zones.", "type": "heat"},
                {"title": "Reflective Pavement Program", "desc": "Mandate albedo-boosting coatings (reflectance ≥ 0.5) on arterial roads and parking structures. Reduces ambient air temperature by 1–3°C in UHI cores.", "type": "urban"},
                {"title": "Urban Tree Canopy Expansion", "desc": f"NDVI at {ndvi} indicates low vegetation cover. Target 30% tree canopy within 1km radius via fast-growing native species. Each mature tree reduces local temp by ~0.5°C.", "type": "eco"},
            ]
            reason = (
                f"**Heat Stress Analysis:** The Land Surface Temperature of {lst}°C is critically elevated, significantly exceeding the human thermal comfort threshold of ~29°C. "
                f"This level of heat exposure increases mortality risk, reduces outdoor productivity, and amplifies energy demand for cooling infrastructure. "
                f"**Water Stress Analysis:** Annual precipitation of {precip:.0f}mm provides {'moderate' if precip > 600 else 'limited'} water availability; however, high evapotranspiration rates at this temperature erode effective soil moisture and increase irrigation demand. "
                f"**Ecological Stress Analysis:** NDVI of {ndvi} indicates {'sparse' if ndvi < 0.3 else 'moderate'} vegetation cover. Heat-stressed vegetation loses photosynthetic efficiency, reducing carbon sequestration and stormwater retention capacity. "
                f"**Urban Density Analysis:** Landcover class {lc} places this area {'in a high-density developed zone' if lc in [23,24] else 'in a low-intensity developed zone'}. Impervious surfaces amplify thermal absorption and contribute to surface runoff during heavy precipitation events. "
                f"**Weight Rationale:** Heat is assigned the dominant weight (45%) because the extreme LST is the primary driver of immediate climate risk at this location."
            )
        elif is_arid:
            h, w, e, u = 0.15, 0.50, 0.20, 0.15
            recs = [
                {"title": "Stormwater Harvesting", "desc": f"At {precip:.0f}mm/year, deploy distributed rainwater capture systems targeting ≥ 80% runoff retention in new developments. Mandate 2,500L+ cisterns for commercial buildings.", "type": "water"},
                {"title": "Xeriscaping Mandate", "desc": "Replace irrigated lawns with drought-tolerant native species across all municipal properties. Reduces landscape water usage by 50–75% and improves soil organic content.", "type": "water"},
                {"title": "Aquifer Recharge Zones", "desc": "Designate protected aquifer recharge areas near floodplains. Avoid impermeable surface expansion within 500m of mapped recharge zones.", "type": "eco"},
            ]
            reason = (
                f"**Heat Stress Analysis:** LST of {lst}°C is {'elevated' if lst > 30 else 'within normal range'} for this region. Arid conditions intensify heat exposure due to reduced evaporative cooling from sparse vegetation and dry soils. "
                f"**Water Stress Analysis:** Annual precipitation of {precip:.0f}mm is below the 450mm sustainability threshold, indicating severe aridity. This level of water stress constrains agriculture, limits groundwater recharge, and places pressure on municipal supply systems. "
                f"**Ecological Stress Analysis:** NDVI of {ndvi} reflects {'stressed, drought-adapted vegetation' if ndvi < 0.35 else 'moderate vegetation density'} under water-limited conditions. Extended aridity degrades soil structure and risks desertification. "
                f"**Urban Density Analysis:** Landcover class {lc} indicates a {'developed' if lc >= 21 else 'natural'} landscape. Urban areas in arid climates face acute water insecurity as impervious surfaces prevent natural groundwater infiltration. "
                f"**Weight Rationale:** Water is weighted at 50% due to the critically low precipitation, which is the dominant barrier to climate resilience at this location."
            )
        elif is_urban:
            h, w, e, u = 0.20, 0.15, 0.10, 0.55
            recs = [
                {"title": "Permeable Pavement Mandate", "desc": f"NLCD code {lc} confirms high impervious surface cover. Require permeable paving for all new parking lots and low-traffic roads. Reduces peak stormwater runoff by 40–70%.", "type": "urban"},
                {"title": "Green Roof Policy", "desc": "Incentivize green roof installation on commercial buildings > 500m². Each 100m² of green roof sequesters 1–2 tonnes CO₂/year and reduces rooftop temperature by 15–20°C.", "type": "eco"},
                {"title": "Urban Biodiversity Corridors", "desc": "Establish 10m-wide vegetated corridors along secondary roads to connect green spaces. Increases NDVI, supports pollinators, and reduces urban heat accumulation.", "type": "urban"},
            ]
            reason = (
                f"**Heat Stress Analysis:** LST of {lst}°C in a high-density developed area reflects significant Urban Heat Island (UHI) effect. Impervious surfaces absorb solar radiation and re-emit it as longwave heat, elevating ambient temperatures 2–5°C above surrounding rural areas. "
                f"**Water Stress Analysis:** Precipitation of {precip:.0f}mm/year is {'adequate' if precip > 600 else 'marginal'}, but dense impervious coverage drastically increases peak stormwater runoff volumes, requiring expanded grey infrastructure to prevent flooding. "
                f"**Ecological Stress Analysis:** NDVI of {ndvi} in a developed zone indicates {'minimal green space coverage' if ndvi < 0.3 else 'some retained green infrastructure'}. Biodiversity is constrained by habitat fragmentation and soil sealing. "
                f"**Urban Density Analysis:** NLCD code {lc} classifies this as {'medium' if lc == 23 else 'high'}-intensity development, characterized by extensive concrete, asphalt, and rooftop coverage. Sprawl expansion compounds stormwater management costs and heating loads. "
                f"**Weight Rationale:** Urban density receives the highest weight (55%) because the built environment is the primary stressor driving heat, hydrology, and ecological stress at this location."
            )
        elif is_suburban:
            h, w, e, u = 0.25, 0.20, 0.25, 0.30
            recs = [
                {"title": "Mixed-Use Development Zoning", "desc": f"NLCD code {lc} indicates low-intensity development. Promote walkable mixed-use neighborhoods to reduce vehicle emissions and heat generation.", "type": "urban"},
                {"title": "Green Space Integration", "desc": f"NDVI of {ndvi} shows moderate vegetation. Require 20% green space allocation in new developments to maintain ecological balance.", "type": "eco"},
                {"title": "Stormwater Management", "desc": f"Annual precipitation of {precip:.0f}mm requires decentralized retention systems. Implement rain gardens and bioswales in suburban areas.", "type": "water"},
            ]
            reason = (
                f"**Heat Stress Analysis:** LST of {lst}°C in suburban development shows moderate heat stress with less intense UHI effect than dense urban cores. "
                f"**Water Stress Analysis:** Precipitation of {precip:.0f}mm/year provides {'adequate' if precip > 600 else 'moderate'} water supply, but increased impervious surfaces from suburban sprawl affect local hydrology. "
                f"**Ecological Stress Analysis:** NDVI of {ndvi} indicates {'moderate vegetation health' if ndvi > 0.3 else 'stressed vegetation'} in transitioning suburban landscape. "
                f"**Urban Density Analysis:** NLCD code {lc} represents low-intensity suburban development with moderate impervious surface coverage. Less dense than urban cores but still contributes to sprawl pressure. "
                f"**Weight Rationale:** Suburban development shows balanced stressors with moderate urban pressure (30%), with ecological and water factors also significant."
            )
        else:
            recs = [
                {"title": "Baseline Environmental Monitoring", "desc": f"Conditions are relatively stable (LST: {lst}°C, NDVI: {ndvi}, Precip: {precip:.0f}mm). Deploy IoT sensor networks to detect early stress signals and maintain monthly satellite metric reviews.", "type": "eco"},
                {"title": "Preventative Green Infrastructure", "desc": f"NDVI of {ndvi} shows {'healthy' if ndvi > 0.4 else 'moderate'} vegetation. Maintain and expand existing green cover to buffer against future climate variability.", "type": "eco"},
                {"title": "Land Use Planning Review", "desc": f"Landcover class {lc} indicates {'natural' if lc >= 40 else 'semi-developed'} land use. Ensure zoning policies prevent encroachment of high-intensity development into ecologically sensitive areas.", "type": "urban"},
            ]
            reason = (
                f"**Heat Stress Analysis:** LST of {lst}°C is within the moderate range. No acute UHI effect detected, though continued monitoring is advised as urban expansion can rapidly elevate baseline temperatures. "
                f"**Water Stress Analysis:** Annual precipitation of {precip:.0f}mm is {'adequate' if precip > 600 else 'moderately sufficient'} for current vegetation and land use. Seasonal variability should be tracked via the NASA GLDAS precipitation anomaly index. "
                f"**Ecological Stress Analysis:** NDVI of {ndvi} indicates {'healthy, productive vegetation' if ndvi > 0.4 else 'moderate vegetation density'}. Maintaining current green coverage is critical for carbon sequestration and stormwater buffering. "
                f"**Urban Density Analysis:** Landcover class {lc} reflects a {'natural or semi-natural' if lc >= 40 else 'lightly developed'} landscape with low impervious surface pressure. Protective land use zoning should be maintained proactively. "
                f"**Weight Rationale:** Equal weighting (25% each) is applied as no dominant stressor has reached critical thresholds. Continued data collection will refine future weight adjustments."
            )
        
        return jsonify({
            'weights': {'heat': h, 'water': w, 'eco': e, 'urban': u},
            'recommendations': recs,
            'reasoning': reason
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
