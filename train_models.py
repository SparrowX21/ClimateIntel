"""
Train FOUR independent XGBoost stress-index models on CONUS-wide
satellite data, each outputting a [0,1] normalized score.

Models:
  heat   — thermal load stress
  water  — precipitation-deficit / drought stress
  eco    — ecological / vegetation stress
  urban  — built-environment intensity stress

Each label is normalized to [0,1] before training; predictions are clipped
to [0,1] at inference. Final composite score = weighted sum of the 4
outputs (weights from Gemini AI or user sliders).
"""

import os
import ee
import time
import numpy as np
import pandas as pd
import xgboost as xgb
from dotenv import load_dotenv

load_dotenv()

PROJECT_ID = os.getenv('GEE_PROJECT_ID', 'my-unique-project-id-1234567')
BATCH_SIZE = 500
NUM_BATCHES = 20   # → 10000 target samples
SEED = 42

print(f"Initializing Earth Engine (project: {PROJECT_ID})…")
ee.Initialize(project=PROJECT_ID)

# ── CONUS bounding box (contiguous US) ────────────────────────────
conus = ee.Geometry.Rectangle([-125, 25, -66, 49])

# ── Feature bands ─────────────────────────────────────────────────
print("Building feature image stack…")

lst = (ee.ImageCollection('MODIS/061/MOD11A2')
       .filterDate('2022-01-01', '2022-12-31')
       .select('LST_Day_1km').mean()
       .multiply(0.02).subtract(273.15).rename('LST'))

ndvi = (ee.ImageCollection('MODIS/061/MOD13Q1')
        .filterDate('2022-01-01', '2022-12-31')
        .select('NDVI').mean()
        .multiply(0.0001).rename('NDVI'))

# TerraClimate annual — pre-computed, no on-the-fly averaging
tc2022 = (ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
          .filterDate('2022-01-01', '2022-12-31'))
precip = tc2022.select('pr').sum().rename('Precip')
humidity = tc2022.select('vpd').mean().rename('Humidity')

landcover = (ee.Image('USGS/NLCD_RELEASES/2021_REL/NLCD/2021')
             .select('landcover').rename('Landcover'))

# GPW v4.11 population density (people per km²) — 2020, ~1 km resolution
population = (ee.ImageCollection('CIESIN/GPWv411/GPW_Population_Density')
              .first().select('population_density').rename('PopDensity'))

feature_img = lst.addBands([ndvi, precip, humidity, landcover, population])

# ── Sample points across CONUS in batches ─────────────────────────
print(f"Sampling {BATCH_SIZE * NUM_BATCHES} points from CONUS in {NUM_BATCHES} batches…")
t0 = time.time()
all_features = []

for i in range(NUM_BATCHES):
    batch_t = time.time()
    try:
        samples = feature_img.sample(
            region=conus, scale=1000, numPixels=BATCH_SIZE,
            seed=SEED + i, geometries=False, dropNulls=True,
        )
        feats = samples.getInfo()['features']
        all_features.extend(feats)
        print(f"  batch {i+1:2d}/{NUM_BATCHES}: +{len(feats):4d} pts  "
              f"({time.time() - batch_t:5.1f}s)  total={len(all_features)}")
    except Exception as e:
        print(f"  batch {i+1:2d}/{NUM_BATCHES}: FAILED ({e}) — continuing")

print(f"Fetched {len(all_features)} total samples in {time.time() - t0:.1f}s")

df = pd.DataFrame([f['properties'] for f in all_features]).dropna()
print(f"After dropna: {len(df)} rows")

# ── Derive [0,1] labels ───────────────────────────────────────────
# Heat: LST scaled to a plausible envelope (5°C → 0, 45°C → 1)
df['heat_label'] = ((df['LST'] - 5.0) / 40.0).clip(0, 1)

# Water: precipitation deficit (0 mm/yr → 1, 1500 mm/yr → 0)
df['water_label'] = (1.0 - (df['Precip'] / 1500.0)).clip(0, 1)

# Eco: inverse vegetation health (NDVI 0.8 → 0, NDVI 0.0 → 1)
df['eco_label'] = (1.0 - (df['NDVI'] / 0.8)).clip(0, 1)

# Urban: developed intensity from NLCD codes (21 → 0.25, 22 → 0.5, 23 → 0.75, 24 → 1)
urban_map = {21: 0.25, 22: 0.50, 23: 0.75, 24: 1.00}
df['urban_label'] = df['Landcover'].map(urban_map).fillna(0.0)

print("\nLabel distributions:")
print(df[['heat_label', 'water_label', 'eco_label', 'urban_label']].describe())

# ── Train/test split ──────────────────────────────────────────────
rng = np.random.default_rng(SEED)
mask = rng.random(len(df)) < 0.8

XGB_PARAMS = {
    'objective': 'reg:squarederror',
    'max_depth': 6, 'eta': 0.08,
    'subsample': 0.85, 'colsample_bytree': 0.85,
    'seed': SEED,
}


def train(name, feat_cols, label_col, out_path):
    print(f"\n═══ {name.upper()} ═══  features={feat_cols}")
    X = df[feat_cols].copy()
    y = df[label_col]
    X_tr, X_te, y_tr, y_te = X[mask], X[~mask], y[mask], y[~mask]

    dtrain = xgb.DMatrix(X_tr, label=y_tr, feature_names=feat_cols)
    dtest = xgb.DMatrix(X_te, label=y_te, feature_names=feat_cols)

    model = xgb.train(
        XGB_PARAMS, dtrain, num_boost_round=400,
        evals=[(dtest, 'test')], early_stopping_rounds=20, verbose_eval=100,
    )

    pred = np.clip(model.predict(dtest), 0.0, 1.0)
    ss_res = float(np.sum((y_te.values - pred) ** 2))
    ss_tot = float(np.sum((y_te.values - y_te.mean()) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    mae = float(np.mean(np.abs(y_te.values - pred)))
    print(f"{name}: R²={r2:.3f}  MAE={mae:.3f}  n_test={len(y_te)}")

    model.save_model(out_path)
    print(f"Saved {out_path}")
    return r2, mae


# Each label's own primary driver is EXCLUDED from features so the model
# must learn the relationship — no shortcut memorization.
results = {}
results['heat']  = train('heat',  ['NDVI', 'Humidity', 'Precip', 'Landcover'],   'heat_label',  'heat_stress.json')
results['water'] = train('water', ['LST',  'Humidity', 'NDVI',   'Landcover'],   'water_label', 'water_stress.json')
results['eco']   = train('eco',   ['LST',  'Precip',   'Humidity', 'Landcover'], 'eco_label',   'ecological_stress.json')
results['urban'] = train('urban', ['LST',  'NDVI',     'Precip',   'Humidity', 'PopDensity'], 'urban_label', 'urban_stress.json')

print(f"\n{'═' * 60}")
print(f"DONE. Trained on {len(df)} CONUS points.")
for name, (r2, mae) in results.items():
    print(f"  {name:6s}  R²={r2:6.3f}   MAE={mae:.3f}")
print(f"{'═' * 60}")
