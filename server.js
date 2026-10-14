const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const CryptoJS = require('crypto-js');

const app = express();
const PORT = process.env.PORT || 8080;
const PASSPHRASE = process.env.PASSPHRASE || '98yNCjeAfWMwk0wI';

const ROOT = __dirname;
const ADMIN_DIR = path.join(ROOT, 'admin');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const CORS_FILE = path.join(ROOT, 'cors-origins.json');
const META_FILE = path.join(ROOT, 'template-meta.json');

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error('JSON read error:', file, error);
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function isPlatform(value) {
  return value === 'win' || value === 'mac';
}

function templatePath(platform) {
  return path.join(TEMPLATES_DIR, platform === 'win' ? 'win-template.html' : 'mac-template.html');
}

ensureDir(TEMPLATES_DIR);

let allowedOrigins = readJson(CORS_FILE, { origins: [] }).origins;
if (!Array.isArray(allowedOrigins)) allowedOrigins = [];

let templateMeta = readJson(META_FILE, {
  win: { description: '', filename: 'win-template.html', updatedAt: null },
  mac: { description: '', filename: 'mac-template.html', updatedAt: null }
});

const templateCache = {
  win: { html: '', cipher: '', description: '', filename: '', updatedAt: null },
  mac: { html: '', cipher: '', description: '', filename: '', updatedAt: null }
};

function refreshTemplateCache(platform, html, meta = {}) {
  const cipher = CryptoJS.AES.encrypt(html, PASSPHRASE).toString();
  templateCache[platform] = {
    html,
    cipher,
    description: meta.description || '',
    filename: meta.filename || (platform === 'win' ? 'win-template.html' : 'mac-template.html'),
    updatedAt: meta.updatedAt || null
  };
  return templateCache[platform];
}

function loadTemplatesAtStartup() {
  for (const platform of ['win', 'mac']) {
    const file = templatePath(platform);
    const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    refreshTemplateCache(platform, html, templateMeta[platform] || {});
  }
}

loadTemplatesAtStartup();

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const valid = file.mimetype === 'text/html' || /\.html?$/i.test(file.originalname);
    if (!valid) return cb(new Error('Only .html files are allowed'));
    cb(null, true);
  }
});

app.get('/data', (req, res) => {
  const platform = String(req.query.platform || '').toLowerCase();
  if (!isPlatform(platform)) {
    return res.status(400).json({ error: "Invalid or missing platform. Use 'win' or 'mac'." });
  }

  const cached = templateCache[platform];
  if (!cached.cipher) return res.status(404).json({ error: 'Template not available' });

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.json({ cipher: cached.cipher });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/approval-nola-team/api/origins', (req, res) => {
  res.json({ origins: allowedOrigins });
});

app.post('/approval-nola-team/api/origins', (req, res) => {
  let origin = String(req.body.origin || '').trim().replace(/\/+$/, '');
  if (!origin) return res.status(400).json({ error: 'Origin is required' });

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only HTTP and HTTPS origins are allowed' });
  }

  if (allowedOrigins.includes(origin)) {
    return res.status(409).json({ error: 'Origin already exists' });
  }

  allowedOrigins.push(origin);
  writeJson(CORS_FILE, { origins: allowedOrigins });
  return res.json({ success: true, origin, origins: allowedOrigins });
});

app.delete('/approval-nola-team/api/origins', (req, res) => {
  const origin = String(req.body.origin || '').trim().replace(/\/+$/, '');
  const next = allowedOrigins.filter(item => item !== origin);
  if (next.length === allowedOrigins.length) {
    return res.status(404).json({ error: 'Origin not found' });
  }
  allowedOrigins = next;
  writeJson(CORS_FILE, { origins: allowedOrigins });
  return res.json({ success: true, origins: allowedOrigins });
});

app.get('/approval-nola-team/api/templates', (req, res) => {
  return res.json({
    win: {
      description: templateCache.win.description,
      filename: templateCache.win.filename,
      updatedAt: templateCache.win.updatedAt
    },
    mac: {
      description: templateCache.mac.description,
      filename: templateCache.mac.filename,
      updatedAt: templateCache.mac.updatedAt
    }
  });
});

app.post('/approval-nola-team/api/templates/:platform', upload.single('file'), (req, res) => {
  const platform = String(req.params.platform || '').toLowerCase();
  if (!isPlatform(platform)) return res.status(400).json({ error: 'platform must be win or mac' });
  if (!req.file) return res.status(400).json({ error: 'HTML file is required' });

  const description = String(req.body.description || '').trim();
  if (!description) return res.status(400).json({ error: 'Description is required' });

  const html = req.file.buffer.toString('utf8');
  if (!html.trim()) return res.status(400).json({ error: 'HTML file is empty' });

  const updatedAt = new Date().toISOString();
  fs.writeFileSync(templatePath(platform), html, 'utf8');

  templateMeta[platform] = {
    description,
    filename: req.file.originalname,
    updatedAt
  };
  writeJson(META_FILE, templateMeta);

  refreshTemplateCache(platform, html, templateMeta[platform]);

  return res.json({
    success: true,
    platform,
    description,
    filename: req.file.originalname,
    updatedAt
  });
});

app.use('/approval-nola-team/assets', express.static(ADMIN_DIR, {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/approval-nola-team', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message || 'Request failed' });
  next();
});

app.get('/', (req, res) => {
  res.type('text').send('platform must be win or mac');
});

app.use((req, res) => {
  res.status(404).send('Cannot GET ' + req.path);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Nola Template Manager v2 started');
  console.log('Port:', PORT);
  console.log('Admin: /approval-nola-team');
});
