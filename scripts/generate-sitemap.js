#!/usr/bin/env node
// Regenerate dist/sitemap.xml with every city landing page included.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const BASE = 'https://climateintel-web.onrender.com';

const cityDir = path.join(DIST, 'city');
const cityFiles = fs.existsSync(cityDir)
  ? fs.readdirSync(cityDir).filter(f => f.endsWith('.html'))
  : [];

const urls = [
  { loc: `${BASE}/`,             priority: '1.0', changefreq: 'weekly' },
  ...cityFiles.map(f => ({
    loc: `${BASE}/city/${f}`,
    priority: '0.8',
    changefreq: 'weekly',
  })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml);
console.log(`[sitemap] wrote ${urls.length} URLs`);
