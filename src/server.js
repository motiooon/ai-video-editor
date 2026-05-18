import http from 'http';
import { execFile } from 'child_process';
import { createReadStream, existsSync } from 'fs';
import { stat, readFile } from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');

const ASSET_MIME = {
  '.js':    'application/javascript',
  '.mjs':   'application/javascript',
  '.css':   'text/css',
  '.html':  'text/html; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.png':   'image/png',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
};

const PORT = 3131;
// id → { filename, filePath, proxyPath, maxGapSeconds, timeline, resolve, reject }
const reviews = new Map();

let server = null;

const MIME = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.webm': 'video/webm', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.aiff': 'audio/aiff', '.flac': 'audio/flac',
};

export function startServer() {
  if (server) return;
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const [, , id, action] = url.pathname.split('/');

    // Static assets from the React build
    if (req.method === 'GET' && (url.pathname.startsWith('/assets/') || url.pathname === '/favicon.ico')) {
      return serveAsset(url.pathname, res);
    }

    if (req.method === 'GET'  && action === 'data')    return handleData(id, res);
    if (req.method === 'GET'  && action === 'video')   return handleVideo(id, req, res);
    if (req.method === 'POST' && action === 'approve') return handleApprove(id, req, res);
    if (req.method === 'GET'  && id)                   return handlePage(id, res);
    res.writeHead(404); res.end('Not found');
  });
  server.listen(PORT);
}

function handleData(id, res) {
  const review = reviews.get(id);
  if (!review) { res.writeHead(404); return res.end('{}'); }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    filename: review.filename,
    timeline: review.timeline,
    maxGapSeconds: review.maxGapSeconds,
  }));
}

async function handleVideo(id, req, res) {
  const review = reviews.get(id);
  if (!review) { res.writeHead(404); return res.end(); }

  const filePath = review.proxyPath;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';

  let fileSize;
  try { ({ size: fileSize } = await stat(filePath)); }
  catch { res.writeHead(404); return res.end(); }

  const rangeHeader = req.headers.range;
  if (!rangeHeader) {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
    });
    createReadStream(filePath).pipe(res);
    return;
  }

  const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
  const chunkSize = end - start + 1;

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': contentType,
  });
  createReadStream(filePath, { start, end }).pipe(res);
}

function handleApprove(id, req, res) {
  const review = reviews.get(id);
  if (!review) { res.writeHead(404); return res.end('{}'); }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const { timeline } = JSON.parse(body);
      reviews.delete(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      review.resolve(timeline);
    } catch (e) {
      res.writeHead(400); res.end('Bad request');
      review.reject(e);
    }
  });
}

async function serveAsset(urlPath, res) {
  const filePath = path.join(CLIENT_DIST, urlPath);
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': ASSET_MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

async function handlePage(id, res) {
  if (!reviews.has(id)) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end('<h1 style="font-family:sans-serif;padding:2rem">Review not found or already completed.</h1>');
  }

  const indexPath = path.join(CLIENT_DIST, 'index.html');
  if (!existsSync(indexPath)) {
    res.writeHead(503, { 'Content-Type': 'text/html' });
    return res.end('<h1 style="font-family:sans-serif;padding:2rem">Client not built.<br><code style="font-size:14px">npm run build:client</code></h1>');
  }

  const html = await readFile(indexPath, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// UI is now the React app in src/client/
// Build:   npm run build:client
// Dev:     npm run dev:client   (Vite on :5173, proxies /review → :3131)
function _stub_() {
  return `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    height: 100%;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0f0f0f;
    color: #e8e8e8;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .page-header {
    flex-shrink: 0;
    padding: 20px 32px 16px;
    border-bottom: 1px solid #1e1e1e;
    display: flex;
    align-items: flex-start;
    gap: 24px;
    flex-wrap: wrap;
  }

  .panels {
    flex: 1;
    display: flex;
    overflow: hidden;
    /* leave room for fixed footer */
    padding-bottom: 52px;
  }

  h1 { font-size: 18px; font-weight: 600; color: #fff; }
  .filename { font-size: 12px; color: #555; margin-top: 3px; word-break: break-all; }

  .legend {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #777;
    margin-top: 8px;
    align-items: center;
  }
  .legend-item { display: flex; align-items: center; gap: 5px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .dot-filler      { background: #e55; }
  .dot-duplicate   { background: #e96b14; }
  .dot-false-start { background: #f59e0b; }
  .dot-redundant   { background: #a855f7; }
  .dot-ai-clarity  { background: #a855f7; }
  .dot-user        { background: #666; }

  /* ── Divider ── */
  .divider {
    flex-shrink: 0;
    width: 6px;
    cursor: col-resize;
    background: transparent;
    position: relative;
    z-index: 10;
  }
  .divider::after {
    content: '';
    position: absolute;
    top: 0; bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 1px;
    background: #252525;
    transition: width 0.15s, background 0.15s;
  }
  .divider:hover::after,
  .divider.is-dragging::after {
    width: 3px;
    background: #3b82f6;
  }

  /* ── Transcript panel ── */
  .transcript-panel {
    flex: 0 0 50%;
    min-width: 20%;
    max-width: 80%;
    padding: 32px 40px 40px;
    overflow-y: auto;
  }

  .transcript {
    font-size: 19px;
    line-height: 2.4;
    letter-spacing: 0.01em;
    color: #d0d0d0;
    max-width: 680px;
  }

  /* ── Word spans ── */
  .word {
    display: inline;
    cursor: pointer;
    padding: 1px 2px;
    border-radius: 3px;
    transition: background 0.1s;
    position: relative;
  }
  .word:hover { background: rgba(255,255,255,0.07); }

  .word[data-removed="true"] {
    text-decoration: line-through;
    text-decoration-thickness: 2px;
    opacity: 0.45;
  }
  .word[data-removed="true"][data-reason="filler"]       { color: #e55;    text-decoration-color: #e55; }
  .word[data-removed="true"][data-reason="duplicate"]    { color: #e96b14; text-decoration-color: #e96b14; }
  .word[data-removed="true"][data-reason="false-start"]  { color: #f59e0b; text-decoration-color: #f59e0b; }
  .word[data-removed="true"][data-reason="redundant"]    { color: #a855f7; text-decoration-color: #a855f7; }
  .word[data-removed="true"][data-reason="too-short"]    { color: #666;    text-decoration-color: #666; }
  .word[data-removed="true"][data-reason="user"]         { color: #666;    text-decoration-color: #666; }
  .word[data-removed="true"][data-reason="ai-clarity"]   { color: #a855f7; text-decoration-color: #a855f7; }
  .word[data-removed="true"]:hover { opacity: 0.65; }
  .word.playing-word { background: rgba(250,204,21,0.18); border-radius: 3px; }

  /* ── Gap blocks ── */
  .gap-block {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 4px;
    height: 20px;
    font-size: 10px;
    font-weight: 600;
    vertical-align: middle;
    margin: 0 2px;
    border: 1px solid transparent;
    transition: opacity 0.12s, filter 0.12s;
    position: relative;
    user-select: none;
    overflow: hidden;
    flex-shrink: 0;
  }

  .gap-block .gap-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    padding: 0 4px;
    pointer-events: none;
  }

  /* Kept gap — green */
  .gap-block[data-removed="false"] {
    background: rgba(34, 197, 94, 0.12);
    border-color: rgba(34, 197, 94, 0.3);
    color: #4ade80;
  }
  .gap-block[data-removed="false"]:hover {
    filter: brightness(1.4);
  }

  /* Removed gap — red, dimmed */
  .gap-block[data-removed="true"] {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.2);
    color: #f87171;
    opacity: 0.45;
  }
  .gap-block[data-removed="true"]:hover { opacity: 0.75; }

  /* Hidden when an adjacent word is removed */
  .gap-block[data-hidden="true"] { display: none; }

  /* Scrub cursor highlight */
  .scrub-highlight { background: rgba(250,204,21,0.12) !important; }

  /* ── Shared tooltip ── */
  .word .tip, .gap-block .tip {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: #1e1e1e;
    color: #bbb;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;
    border: 1px solid #2e2e2e;
    text-decoration: none;
  }
  .word:hover .tip, .gap-block:hover .tip { display: block; }

  /* ── Video panel ── */
  .video-panel {
    flex: 1;
    min-width: 20%;
    display: flex;
    flex-direction: column;
    padding: 24px 20px;
    gap: 14px;
    background: #0a0a0a;
    overflow: hidden;
  }

  .video-wrap {
    position: relative;
    width: 100%;
    background: #000;
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .video-wrap video {
    width: 100%;
    display: block;
    object-fit: contain;
    background: #000;
  }

  .seg-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 3px;
    background: rgba(255,255,255,0.1);
  }
  .seg-bar-fill {
    height: 100%;
    background: #facc15;
    width: 0%;
    transition: width 0.1s linear;
  }

  .video-controls { display: flex; gap: 8px; align-items: center; }

  #btn-preview {
    flex: 1; padding: 9px 0;
    background: #facc15; color: #000;
    border: none; border-radius: 8px;
    font-size: 13px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s;
  }
  #btn-preview:hover { opacity: 0.85; }
  #btn-preview:disabled { background: #3a3a1a; color: #666; cursor: not-allowed; opacity: 1; }

  #btn-stop {
    padding: 9px 14px;
    background: #222; color: #aaa;
    border: 1px solid #333; border-radius: 8px;
    font-size: 13px; cursor: pointer;
    display: none;
  }
  #btn-stop:hover { background: #2a2a2a; }

  .preview-info { font-size: 12px; color: #555; line-height: 1.6; }

  .seg-map {
    height: 24px; background: #111;
    border-radius: 6px; position: relative;
    overflow: hidden; flex-shrink: 0;
  }
  .seg-map-seg {
    position: absolute; top: 4px; height: 16px;
    background: #22c55e; border-radius: 2px; opacity: 0.7;
  }
  .seg-map-cursor {
    position: absolute; top: 0; bottom: 0;
    width: 2px; background: #facc15; display: none;
  }

  /* ── Footer ── */
  footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #111; border-top: 1px solid #1e1e1e;
    padding: 12px 32px;
    display: flex; align-items: center;
    justify-content: space-between; gap: 16px; z-index: 100;
  }
  .stats { font-size: 13px; color: #555; }
  .stats strong { color: #999; }
  .footer-actions { display: flex; gap: 10px; align-items: center; }

  #btn-approve {
    padding: 9px 24px; background: #22c55e; color: #000;
    border: none; border-radius: 8px;
    font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.15s;
  }
  #btn-approve:hover { opacity: 0.85; }
  #btn-approve:disabled { background: #1a4a2a; color: #444; cursor: not-allowed; opacity: 1; }
  #export-status { font-size: 13px; color: #666; }
</style>
</head>
<body>

<header class="page-header">
  <div>
    <h1>Review Transcript</h1>
    <div class="filename" id="filename">Loading…</div>
    <div class="legend">
      <span class="legend-item"><span class="dot dot-filler"></span> Filler</span>
      <span class="legend-item"><span class="dot dot-duplicate"></span> Duplicate</span>
      <span class="legend-item"><span class="dot dot-false-start"></span> False start</span>
      <span class="legend-item"><span class="dot dot-redundant"></span> Redundant</span>
      <span class="legend-item"><span class="dot dot-user"></span> Removed by you</span>
      <span style="color:#4ade80;margin-left:6px;font-size:11px">▐ 0.4s ▌</span><span style="color:#555"> = kept silence</span>
      <span style="color:#f87171;font-size:11px">✂ 1.2s</span><span style="color:#555"> = cut silence</span>
      <span style="color:#444;margin-left:4px">· Click anything to toggle</span>
    </div>
  </div>
</header>

<div class="panels">
  <div class="transcript-panel" id="transcript-panel">
    <div class="transcript" id="transcript">Loading…</div>
  </div>

  <div class="divider" id="divider"></div>

  <div class="video-panel">
    <div class="video-wrap">
      <video id="video" preload="auto" playsinline></video>
      <div class="seg-bar"><div class="seg-bar-fill" id="seg-bar-fill"></div></div>
    </div>
    <div class="video-controls">
      <button id="btn-preview" onclick="startPreview()">▶ Preview edited clip</button>
      <button id="btn-stop" onclick="stopPreview()">■ Stop</button>
    </div>
    <div class="preview-info" id="preview-info">Preview plays only kept content, skipping cuts.</div>
    <div class="seg-map" id="seg-map">
      <div class="seg-map-cursor" id="seg-map-cursor"></div>
    </div>
  </div>
</div>

<footer>
  <div class="stats" id="stats"></div>
  <div class="footer-actions">
    <span id="export-status"></span>
    <button id="btn-approve" onclick="approve()">Approve &amp; Export</button>
  </div>
</footer>

<script>
const REVIEW_ID = ${JSON.stringify(id)};
const video = document.getElementById('video');
let timeline = []; // { type: 'word'|'gap', ... }
let maxGapSeconds = 0.3;

// ── Playback state ──
let previewSegs = [];
let currentSeg = 0;
let previewing = false;
let totalDuration = 0;

// ── Load ──
async function load() {
  const res = await fetch('/review/' + REVIEW_ID + '/data');
  const data = await res.json();
  document.getElementById('filename').textContent = data.filename;
  timeline = data.timeline;
  maxGapSeconds = data.maxGapSeconds ?? 0.3;
  video.src = '/review/' + REVIEW_ID + '/video';
  render();
  updateSegmentMap();
}

// ── Render ──
function render() {
  const container = document.getElementById('transcript');
  container.innerHTML = '';

  timeline.forEach((item, i) => {
    if (item.type === 'word') {
      container.appendChild(makeWordSpan(item, i));
      // Space after word (unless next item is a visible gap block)
      const next = timeline[i + 1];
      if (!next || next.type !== 'gap') {
        container.appendChild(document.createTextNode(' '));
      }
    } else if (item.type === 'gap') {
      container.appendChild(makeGapBlock(item, i));
      container.appendChild(document.createTextNode(' '));
    }
  });

  updateStats();
}

// px per second for gap width — clamped to [6, 140]
function gapWidth(duration) {
  return Math.min(140, Math.max(6, Math.round(duration * 55)));
}

function makeWordSpan(item, i) {
  const span = document.createElement('span');
  span.className = 'word';
  span.dataset.index = i;
  span.dataset.removed = item.removed;
  span.dataset.reason = item.reason ?? '';
  span.textContent = item.word;
  const tip = document.createElement('span');
  tip.className = 'tip';
  tip.textContent = wordTip(item);
  span.appendChild(tip);
  span.addEventListener('click', () => toggleItem(i));
  span.addEventListener('mouseenter', () => scrubTo(item.start));
  span.addEventListener('mouseleave', clearScrubHighlight);
  return span;
}

function makeGapBlock(item, i) {
  const el = document.createElement('span');
  el.className = 'gap-block';
  el.dataset.index = i;
  el.dataset.removed = item.removed;
  el.dataset.hidden = isGapHidden(i) ? 'true' : 'false';

  const w = gapWidth(item.duration);
  el.style.width = w + 'px';
  el.style.minWidth = w + 'px';

  const label = document.createElement('span');
  label.className = 'gap-label';
  // Only show text if wide enough
  label.textContent = w >= 28 ? item.duration + 's' : '';
  el.appendChild(label);

  const tip = document.createElement('span');
  tip.className = 'tip';
  tip.textContent = (item.removed ? 'Cut ' : 'Kept ') + item.duration + 's silence — click to ' + (item.removed ? 'keep' : 'cut');
  el.appendChild(tip);

  el.addEventListener('click', () => toggleItem(i));
  el.addEventListener('mouseenter', () => scrubTo(item.start));
  el.addEventListener('mouseleave', clearScrubHighlight);
  return el;
}

function isGapHidden(i) {
  // A gap is hidden when either adjacent word is removed
  const prevWord = findAdjacentWord(i, -1);
  const nextWord = findAdjacentWord(i, +1);
  return (prevWord && prevWord.removed) || (nextWord && nextWord.removed);
}

function findAdjacentWord(gapIdx, dir) {
  let j = gapIdx + dir;
  while (j >= 0 && j < timeline.length) {
    if (timeline[j].type === 'word') return timeline[j];
    j += dir;
  }
  return null;
}

function wordTip(w) {
  if (!w.removed) return 'Click to remove';
  const map = {
    filler:        'Filler — click to restore',
    duplicate:     'Duplicate — click to restore',
    'false-start': 'False start — click to restore',
    redundant:     'Redundant — click to restore',
    'too-short':   'Too short — click to restore',
    'ai-clarity':  'Claude suggestion — click to restore',
    user:          'Removed by you — click to restore',
  };
  return map[w.reason] ?? 'Removed — click to restore';
}

// ── Toggle ──
function toggleItem(i) {
  const item = timeline[i];
  if (item.type === 'word') {
    timeline[i] = item.removed
      ? { ...item, removed: false, reason: null }
      : { ...item, removed: true, reason: 'user' };
    const span = document.querySelector('.word[data-index="' + i + '"]');
    span.dataset.removed = timeline[i].removed;
    span.dataset.reason = timeline[i].reason ?? '';
    span.querySelector('.tip').textContent = wordTip(timeline[i]);
    // Update visibility of adjacent gap blocks
    updateAdjacentGaps(i);
  } else if (item.type === 'gap') {
    timeline[i] = { ...item, removed: !item.removed };
    const el = document.querySelector('.gap-block[data-index="' + i + '"]');
    const updated = timeline[i];
    el.dataset.removed = updated.removed;
    const w = gapWidth(updated.duration);
    el.querySelector('.gap-label').textContent = w >= 28 ? updated.duration + 's' : '';
    el.querySelector('.tip').textContent =
      (updated.removed ? 'Cut ' : 'Kept ') + updated.duration + 's silence — click to ' + (updated.removed ? 'keep' : 'cut');
  }

  updateStats();
  updateSegmentMap();
  if (previewing) stopPreview();
}

function updateAdjacentGaps(wordIdx) {
  // Find gap items immediately before and after this word and update their visibility
  for (let d = -1; d <= 1; d += 2) {
    let j = wordIdx + d;
    while (j >= 0 && j < timeline.length) {
      if (timeline[j].type === 'gap') {
        const el = document.querySelector('.gap-block[data-index="' + j + '"]');
        if (el) el.dataset.hidden = isGapHidden(j) ? 'true' : 'false';
        break;
      }
      if (timeline[j].type === 'word') break;
      j += d;
    }
  }
}

// ── Build segments from timeline (mirrors server-side logic) ──
function buildSegments() {
  const segs = [];
  let seg = null;
  for (const item of timeline) {
    if (item.type === 'word') {
      if (item.removed) {
        if (seg) { segs.push(seg); seg = null; }
      } else {
        if (!seg) seg = { start: item.start, end: item.end };
        else      seg.end = item.end;
      }
    } else if (item.type === 'gap') {
      if (item.removed) {
        if (seg) {
          seg.end = Math.min(item.start + maxGapSeconds, item.end);
          segs.push(seg); seg = null;
        }
      } else if (seg) {
        seg.end = item.end;
      }
    }
  }
  if (seg) segs.push(seg);
  return segs;
}

// ── Stats ──
function updateStats() {
  const words = timeline.filter(i => i.type === 'word');
  const gaps  = timeline.filter(i => i.type === 'gap');
  const removedWords = words.filter(w => w.removed).length;
  const removedGaps  = gaps.filter(g => g.removed).length;
  const segs = buildSegments();
  const keptSecs = segs.reduce((a, s) => a + (s.end - s.start), 0);
  document.getElementById('stats').innerHTML =
    '<strong>' + (words.length - removedWords) + '</strong> words kept &nbsp;·&nbsp; ' +
    '<strong>' + removedWords + '</strong> removed &nbsp;·&nbsp; ' +
    '<strong>' + removedGaps + '</strong> silences cut &nbsp;·&nbsp; ' +
    '<strong>' + keptSecs.toFixed(1) + 's</strong> output';
}

// ── Segment mini-map ──
function updateSegmentMap() {
  const map = document.getElementById('seg-map');
  [...map.querySelectorAll('.seg-map-seg')].forEach(el => el.remove());

  const wordItems = timeline.filter(i => i.type === 'word');
  totalDuration = wordItems.length ? wordItems[wordItems.length - 1].end : 1;

  buildSegments().forEach(s => {
    const el = document.createElement('div');
    el.className = 'seg-map-seg';
    el.style.left  = (s.start / totalDuration * 100) + '%';
    el.style.width = Math.max(0.3, (s.end - s.start) / totalDuration * 100) + '%';
    map.appendChild(el);
  });
}

// ── Preview playback ──
function startPreview() {
  previewSegs = buildSegments();
  if (!previewSegs.length) return;
  const wordItems = timeline.filter(i => i.type === 'word');
  totalDuration = wordItems.length ? wordItems[wordItems.length - 1].end : 1;

  previewing = true;
  currentSeg = 0;
  document.getElementById('btn-preview').style.display = 'none';
  document.getElementById('btn-stop').style.display = 'block';
  document.getElementById('preview-info').textContent =
    'Playing segment 1 of ' + previewSegs.length + '…';

  video.currentTime = previewSegs[0].start;
  video.play();
}

function stopPreview() {
  previewing = false;
  video.pause();
  clearPlayingHighlight();
  document.getElementById('btn-preview').style.display = '';
  document.getElementById('btn-stop').style.display = 'none';
  document.getElementById('seg-bar-fill').style.width = '0%';
  document.getElementById('seg-map-cursor').style.display = 'none';
  document.getElementById('preview-info').textContent = 'Preview plays only kept content, skipping cuts.';
}

video.addEventListener('timeupdate', () => {
  if (!previewing || !previewSegs.length) return;
  const seg = previewSegs[currentSeg];
  const t = video.currentTime;

  const segProgress = Math.min(1, (t - seg.start) / (seg.end - seg.start));
  const fill = (seg.start + segProgress * (seg.end - seg.start)) / totalDuration;
  document.getElementById('seg-bar-fill').style.width = (fill * 100) + '%';

  const cursor = document.getElementById('seg-map-cursor');
  cursor.style.display = 'block';
  cursor.style.left = (t / totalDuration * 100) + '%';

  highlightWordAt(t);

  if (t >= seg.end - 0.05) {
    currentSeg++;
    if (currentSeg >= previewSegs.length) {
      stopPreview();
      document.getElementById('preview-info').textContent = '✓ Preview complete.';
      return;
    }
    video.currentTime = previewSegs[currentSeg].start;
    document.getElementById('preview-info').textContent =
      'Playing segment ' + (currentSeg + 1) + ' of ' + previewSegs.length + '…';
  }
});

video.addEventListener('pause', () => { if (previewing) stopPreview(); });

// ── Cursor scrub ──
let scrubEl = null;
function scrubTo(t) {
  if (previewing) return;
  video.currentTime = t;
}
function clearScrubHighlight() {}

// ── Word highlight ──
let lastHighlightIdx = -1;
function highlightWordAt(t) {
  const idx = timeline.findIndex(
    (item, i) => item.type === 'word' && !item.removed && t >= item.start && t <= item.end
  );
  if (idx === lastHighlightIdx) return;
  clearPlayingHighlight();
  lastHighlightIdx = idx;
  if (idx < 0) return;
  const span = document.querySelector('.word[data-index="' + idx + '"]');
  if (span) { span.classList.add('playing-word'); span.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}
function clearPlayingHighlight() {
  document.querySelectorAll('.word.playing-word').forEach(el => el.classList.remove('playing-word'));
  lastHighlightIdx = -1;
}

// ── Approve ──
async function approve() {
  const btn = document.getElementById('btn-approve');
  const status = document.getElementById('export-status');
  stopPreview();
  btn.disabled = true;
  status.textContent = 'Exporting…';
  try {
    const res = await fetch('/review/' + REVIEW_ID + '/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeline }),
    });
    if (!res.ok) throw new Error('Server error');
    status.textContent = '✓ Export started — you can close this tab.';
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
    btn.disabled = false;
  }
}

// ── Resizable split pane ──
(function () {
  const divider       = document.getElementById('divider');
  const leftPanel     = document.getElementById('transcript-panel');
  const panels        = divider.parentElement;

  let dragging = false;
  let startX   = 0;
  let startPct = 50;

  divider.addEventListener('mousedown', (e) => {
    dragging = true;
    startX   = e.clientX;
    startPct = (leftPanel.offsetWidth / panels.offsetWidth) * 100;
    divider.classList.add('is-dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta   = e.clientX - startX;
    const pct     = startPct + (delta / panels.offsetWidth) * 100;
    const clamped = Math.min(80, Math.max(20, pct));
    leftPanel.style.flex = '0 0 ' + clamped + '%';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('is-dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });
})();

load();
</script>
</body>
</html>`;
}

/**
 * Opens the browser review UI and returns a Promise that resolves
 * with the user-approved annotated word list.
 *
 * @param {string} filename  - display name (basename)
 * @param {string} filePath  - absolute path to the original media file
 * @param {object[]} annotatedWords
 * @param {number} maxGapSeconds
 */
export function createReview(filename, filePath, proxyPath, timeline, maxGapSeconds, onReady) {
  startServer();
  const id = crypto.randomUUID();
  const url = `http://localhost:${PORT}/review/${id}`;
  return new Promise((resolve, reject) => {
    reviews.set(id, { filename, filePath, proxyPath, timeline, maxGapSeconds, resolve, reject });
    const opener = process.platform === 'win32' ? 'start'
      : process.platform === 'darwin' ? 'open' : 'xdg-open';
    execFile(opener, [url], () => {});
    onReady?.(url);
  });
}
