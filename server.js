const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// CORS – erlaubt alle Origins (dein Dashboard kann von überall zugreifen)
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'KG400 Market Intel Proxy', version: '1.0' });
});

// ── GENERISCHER RSS/URL PROXY ──────────────────────────────────────────────
// GET /proxy?url=https://...
app.get('/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  // Whitelist erlaubter Domains (Sicherheit)
  const allowed = [
    'freelancermap.de',
    'gulp.de',
    'ted.europa.eu',
    'google.de',
    'google.com',
    'bund.de',
  ];
  const isAllowed = allowed.some(d => url.includes(d));
  if (!isAllowed) return res.status(403).json({ error: 'Domain not whitelisted' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketIntelBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/json, */*',
      },
      timeout: 10000,
    });

    const contentType = response.headers.get('content-type') || 'text/plain';
    const text = await response.text();

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Proxy-Status', 'ok');
    res.send(text);
  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(502).json({ error: 'Upstream fetch failed', detail: e.message });
  }
});

// ── FREELANCERMAP RSS ──────────────────────────────────────────────────────
app.get('/feeds/freelancermap', async (req, res) => {
  const { query = 'TGA', region } = req.query;

  // Mehrere Feed-URLs probieren
  const feedUrls = [
    `https://www.freelancermap.de/feeds/projekte/int-international.xml?query=${encodeURIComponent(query)}`,
    `https://www.freelancermap.de/feeds/projekte/engineering-technik.xml?query=${encodeURIComponent(query)}`,
    `https://www.freelancermap.de/feeds/projekte/int-international.xml`,
  ];

  for (const url of feedUrls) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      });
      const xml = await r.text();
      // Prüfen ob echtes XML zurückkommt
      if (xml.includes('<rss') || xml.includes('<feed') || xml.includes('<item')) {
        console.log('freelancermap feed OK:', url);
        res.setHeader('Content-Type', 'application/rss+xml');
        return res.send(xml);
      }
    } catch (e) {
      console.warn('freelancermap feed failed:', url, e.message);
    }
  }
  res.status(502).json({ error: 'Kein freelancermap Feed erreichbar' });
});

// ── GULP RSS ───────────────────────────────────────────────────────────────
app.get('/feeds/gulp', async (req, res) => {
  const { query = 'TGA' } = req.query;
  const url = `https://www.gulp.de/gulp2/g/projekte?view=rss&query=${encodeURIComponent(query)}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = await r.text();
    res.setHeader('Content-Type', 'application/rss+xml');
    res.send(xml);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── TED EUROPA API ─────────────────────────────────────────────────────────
app.get('/feeds/ted', async (req, res) => {
  const { query = 'TGA' } = req.query;
  const url = `https://ted.europa.eu/api/v2.0/notices/search?q=${encodeURIComponent(query)}&scope=3&limit=15&language=DE&fields=title,organisation,publicationDate,tedId,contractType`;
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const json = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.send(json);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── ANTHROPIC API PROXY ────────────────────────────────────────────────────
app.post('/claude', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('Claude proxy error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── GOOGLE ALERT PROXY ─────────────────────────────────────────────────────
app.get('/feeds/alert', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.includes('google')) return res.status(400).json({ error: 'Invalid alert URL' });
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = await r.text();
    res.setHeader('Content-Type', 'application/rss+xml');
    res.send(xml);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ KG400 Market Intel Proxy läuft auf Port ${PORT}`);
});
