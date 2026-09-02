#!/usr/bin/env node
// Generate static SEO landing pages for top US cities.
// Runs after `vite build` — writes dist/city/<slug>.html files, each
// a real HTML document (indexable by Google) that redirects to the
// main app at that city's coordinates after ~1 second.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const OUT_DIR = path.join(DIST, 'city');

const CITIES = [
  { slug: 'new-york',      name: 'New York',       state: 'NY', lat: 40.7128, lng: -74.0060, blurb: 'The most populous US city. Dense impervious surfaces, coastal flood risk, and Urban Heat Island effect combine for elevated urban stress.' },
  { slug: 'los-angeles',   name: 'Los Angeles',    state: 'CA', lat: 34.0522, lng: -118.2437, blurb: 'Mediterranean climate with acute wildfire risk, chronic drought conditions, and severe water stress from limited precipitation.' },
  { slug: 'chicago',       name: 'Chicago',        state: 'IL', lat: 41.8781, lng: -87.6298, blurb: 'Great Lakes climate with moderate precipitation but significant seasonal heat waves and dense urban core.' },
  { slug: 'houston',       name: 'Houston',        state: 'TX', lat: 29.7604, lng: -95.3698, blurb: 'Hot, humid subtropical climate with high hurricane and flooding exposure. Urban sprawl amplifies heat retention.' },
  { slug: 'phoenix',       name: 'Phoenix',        state: 'AZ', lat: 33.4484, lng: -112.0740, blurb: 'One of the hottest major US cities. Extreme summer temperatures, chronic water scarcity, and desert ecology.' },
  { slug: 'philadelphia',  name: 'Philadelphia',   state: 'PA', lat: 39.9526, lng: -75.1652, blurb: 'Northeastern urban center with humid summers and moderate green infrastructure. Aging heat vulnerability.' },
  { slug: 'san-antonio',   name: 'San Antonio',    state: 'TX', lat: 29.4241, lng: -98.4936, blurb: 'South Texas heat and drought exposure. Rapid growth over semi-arid landscape.' },
  { slug: 'san-diego',     name: 'San Diego',      state: 'CA', lat: 32.7157, lng: -117.1611, blurb: 'Mild coastal climate but chronic drought and wildfire risk in surrounding areas.' },
  { slug: 'dallas',        name: 'Dallas',         state: 'TX', lat: 32.7767, lng: -96.7970, blurb: 'North Texas heat, sprawl, and periodic severe weather. Rising urban temperatures.' },
  { slug: 'austin',        name: 'Austin',         state: 'TX', lat: 30.2672, lng: -97.7431, blurb: 'Fast-growing central Texas city. Semi-arid climate with heat stress and increasing water demand.' },
  { slug: 'san-francisco', name: 'San Francisco',  state: 'CA', lat: 37.7749, lng: -122.4194, blurb: 'Coastal microclimate with modest heat exposure but statewide drought and wildfire smoke impact.' },
  { slug: 'seattle',       name: 'Seattle',        state: 'WA', lat: 47.6062, lng: -122.3321, blurb: 'Pacific Northwest maritime climate with abundant rain but increasing summer heat waves and wildfire smoke.' },
  { slug: 'denver',        name: 'Denver',         state: 'CO', lat: 39.7392, lng: -104.9903, blurb: 'High-altitude semi-arid climate. Water stress from Colorado River basin depletion.' },
  { slug: 'boston',        name: 'Boston',         state: 'MA', lat: 42.3601, lng: -71.0589, blurb: 'Coastal New England city with sea level rise exposure and warming summer temperatures.' },
  { slug: 'atlanta',       name: 'Atlanta',        state: 'GA', lat: 33.7490, lng: -84.3880, blurb: 'Humid subtropical climate with strong Urban Heat Island effect and rising heat wave frequency.' },
  { slug: 'miami',         name: 'Miami',          state: 'FL', lat: 25.7617, lng: -80.1918, blurb: 'Tropical monsoon climate with extreme sea level rise vulnerability, hurricane exposure, and year-round heat.' },
  { slug: 'las-vegas',     name: 'Las Vegas',      state: 'NV', lat: 36.1699, lng: -115.1398, blurb: 'Mojave Desert city with the highest US water stress. Extreme summer heat and chronic drought.' },
  { slug: 'portland',      name: 'Portland',       state: 'OR', lat: 45.5152, lng: -122.6784, blurb: 'Pacific Northwest city facing unprecedented summer heat domes and wildfire smoke impact.' },
  { slug: 'nashville',     name: 'Nashville',      state: 'TN', lat: 36.1627, lng: -86.7816, blurb: 'Middle Tennessee humid subtropical climate with rising storm frequency and heat.' },
  { slug: 'new-orleans',   name: 'New Orleans',    state: 'LA', lat: 29.9511, lng: -90.0715, blurb: 'Gulf Coast city with extreme hurricane, flooding, and sea level rise exposure.' },
];

function html(city) {
  const title = `Climate Risk & Stress Score for ${city.name}, ${city.state} | ClimateIntel`;
  const desc = `Live climate stress analysis for ${city.name}, ${city.state}. See heat, water, ecological, and urban stress scores from satellite data + machine learning. Free tool, no signup.`;
  const appUrl = `https://climateintel-web.onrender.com/?lat=${city.lat}&lng=${city.lng}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta name="keywords" content="${city.name} climate risk, ${city.name} climate change, ${city.name} heat index, ${city.name} drought risk, ${city.name} ${city.state} climate, urban heat island ${city.name}, climate stress ${city.name}" />
  <link rel="canonical" href="https://climateintel-web.onrender.com/city/${city.slug}.html" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="https://climateintel-web.onrender.com/og.png" />
  <meta property="og:url" content="https://climateintel-web.onrender.com/city/${city.slug}.html" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="https://climateintel-web.onrender.com/og.png" />

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Climate Risk & Stress Score for ${city.name}, ${city.state}",
    "description": "${desc}",
    "image": "https://climateintel-web.onrender.com/og.png",
    "publisher": { "@type": "Organization", "name": "ClimateIntel" },
    "mainEntityOfPage": "https://climateintel-web.onrender.com/city/${city.slug}.html",
    "about": {
      "@type": "Place",
      "name": "${city.name}, ${city.state}",
      "geo": { "@type": "GeoCoordinates", "latitude": ${city.lat}, "longitude": ${city.lng} }
    }
  }
  </script>

  <style>
    :root { color-scheme: light; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 0 auto; padding: 40px 24px; line-height: 1.65; color: #1a1a1a; }
    h1 { font-size: 32px; letter-spacing: -0.02em; margin: 0 0 12px; }
    h2 { font-size: 20px; margin-top: 36px; }
    .sub { color: #64748b; margin-bottom: 32px; font-size: 15px; }
    a.cta { display: inline-block; background: #0a0a0a; color: #fff; padding: 12px 22px; text-decoration: none; font-weight: 600; margin: 8px 0 32px; border-radius: 2px; }
    a.cta:hover { background: #333; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 32px; }
    .grid a { padding: 10px 14px; background: #f5f5f5; text-decoration: none; color: #1a1a1a; border-radius: 2px; font-size: 14px; }
    .grid a:hover { background: #e5e5e5; }
    footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e0e0e0; color: #64748b; font-size: 13px; }
  </style>

  <!-- Auto-redirect to live analysis after 1.5s so real users land in the app -->
  <script>setTimeout(() => { window.location.href = ${JSON.stringify(appUrl)}; }, 1500);</script>
  <meta http-equiv="refresh" content="3; url=${appUrl}" />
</head>
<body>
  <h1>Climate Risk &amp; Stress Score for ${city.name}, ${city.state}</h1>
  <div class="sub">Live analysis from satellite data and four independent machine-learning models. Redirecting you to the interactive map in a moment…</div>

  <a class="cta" href="${appUrl}">View Live Analysis for ${city.name} →</a>

  <h2>About ${city.name}'s Climate Risk</h2>
  <p>${city.blurb} ClimateIntel scores four independent stress dimensions for ${city.name}, ${city.state} — heat, water, ecological, and urban — using live MODIS satellite temperature and vegetation data, TerraClimate precipitation and vapor pressure deficit, USGS NLCD landcover, and gridded population density.</p>

  <h2>How the Scores Work</h2>
  <p>Each of the four dimensions is scored on a 0–1 scale by its own XGBoost regressor trained on 5,707 CONUS-wide satellite samples. A Gemini AI layer then reads the raw satellite readings for ${city.name} and generates weighted, location-specific policy recommendations. All analysis is free, no signup required.</p>

  <h2>Related US Cities</h2>
  <div class="grid">
    ${CITIES.filter(c => c.slug !== city.slug).slice(0, 10).map(c => `<a href="/city/${c.slug}.html">${c.name}, ${c.state}</a>`).join('\n    ')}
  </div>

  <footer>
    <a href="/">← ClimateIntel home</a> · Data: MODIS · TerraClimate · USGS NLCD · GPW population · Analysis by 4 XGBoost models + Gemini AI
  </footer>
</body>
</html>
`;
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error(`[cities] dist/ not found — run 'vite build' first.`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const city of CITIES) {
    const file = path.join(OUT_DIR, `${city.slug}.html`);
    fs.writeFileSync(file, html(city));
    console.log(`[cities] wrote ${path.relative(DIST, file)}`);
  }
  console.log(`[cities] generated ${CITIES.length} landing pages`);
}

main();
