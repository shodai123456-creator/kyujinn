import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const appRoot = join(projectRoot, 'app');
const statePath = join(projectRoot, 'data', 'state.json');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8' };

const blankState = () => ({
  version: 1,
  profile: null,
  weights: null,
  jobs: [],
  sources: [
    { id: 'manual', name: '手動取込', mode: 'manual_only', approved: true, enabled: true, termsUrl: '', robotsUrl: '', minimumIntervalMinutes: 0 },
    { id: 'rss-template', name: 'RSS / Atom（審査後に有効化）', mode: 'feed', approved: false, enabled: false, termsUrl: '', robotsUrl: '', minimumIntervalMinutes: 60 }
  ],
  notifications: { morningEnabled: true, morningHour: 7, instantEnabled: true, threshold: 80, minimumConfidence: 80 },
  subscriptions: [],
  notificationLog: [],
  meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastMorningDate: null, vapid: null }
});

async function readState() {
  if (!existsSync(statePath)) return blankState();
  try { return { ...blankState(), ...JSON.parse(await readFile(statePath, 'utf8')) }; } catch { return blankState(); }
}
async function persist(state) {
  await mkdir(join(projectRoot, 'data'), { recursive: true });
  state.meta = { ...state.meta, updatedAt: new Date().toISOString() };
  const temporary = `${statePath}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), 'utf8');
  await rename(temporary, statePath);
}
async function ensureVapid(state) {
  if (!state.meta.vapid?.publicKey || !state.meta.vapid?.privateKey) {
    state.meta.vapid = webpush.generateVAPIDKeys();
    await persist(state);
  }
  webpush.setVapidDetails('mailto:job-match@localhost', state.meta.vapid.publicKey, state.meta.vapid.privateKey);
  return state.meta.vapid.publicKey;
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
async function bodyJson(req) {
  const parts = []; for await (const part of req) parts.push(part);
  const raw = Buffer.concat(parts).toString('utf8');
  if (raw.length > 2_000_000) throw new Error('Payload too large');
  return raw ? JSON.parse(raw) : {};
}
function stateForClient(state) {
  const { subscriptions, ...safe } = state;
  return safe;
}
async function sendPush(state, payload, predicate = () => true) {
  await ensureVapid(state);
  const kept = [];
  for (const subscription of state.subscriptions || []) {
    if (!predicate(subscription)) { kept.push(subscription); continue; }
    try { await webpush.sendNotification(subscription, JSON.stringify(payload)); kept.push(subscription); }
    catch (error) { if (error.statusCode !== 404 && error.statusCode !== 410) kept.push(subscription); }
  }
  state.subscriptions = kept;
  state.notificationLog = [...(state.notificationLog || []), { id: crypto.randomUUID(), type: payload.type, jobId: payload.jobId || null, createdAt: new Date().toISOString() }].slice(-300);
  await persist(state);
}
async function maybeSendMorning() {
  const state = await readState();
  const settings = state.notifications || {};
  const now = new Date();
  const today = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const hour = Number(new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false }).format(now));
  if (!settings.morningEnabled || hour !== Number(settings.morningHour) || state.meta.lastMorningDate === today) return;
  const jobs = (state.jobs || []).filter(job => !job.excluded).sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 3);
  if (jobs.length) await sendPush(state, { type: 'morning', title: 'Job Match: 今日のおすすめ', body: jobs.map(job => `${job.total}点 ${job.title}`).join('\n'), url: '/' });
  state.meta.lastMorningDate = today;
  await persist(state);
}
function decodeEntities(value) { return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); }
function tagValue(xml, tag) { const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml); return match ? decodeEntities(match[1].replace(/<[^>]+>/g, '').trim()) : ''; }
function feedItems(xml) { const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || []; return blocks.map(block => ({ title: tagValue(block, 'title'), url: tagValue(block, 'link') || (/<link[^>]+href=["']([^"']+)/i.exec(block)?.[1] || ''), description: tagValue(block, 'description') || tagValue(block, 'summary') || tagValue(block, 'content') })); }
async function collectApprovedFeeds() {
  const state = await readState(); let changed = false;
  for (const source of state.sources || []) {
    if (source.mode !== 'feed' || !source.approved || !source.enabled || !source.url || !source.termsUrl || !source.robotsUrl) continue;
    let feedUrl;
    try { feedUrl = new URL(source.url); } catch { continue; }
    if (feedUrl.protocol !== 'https:' || /^localhost$/i.test(feedUrl.hostname) || /^127\./.test(feedUrl.hostname) || /^\[?::1\]?$/.test(feedUrl.hostname)) continue;
    const lastCollected = Date.parse(source.lastCollectedAt || 0) || 0;
    const minimumInterval = Math.max(60, Number(source.minimumIntervalMinutes) || 60) * 60_000;
    if (Date.now() - lastCollected < minimumInterval) continue;
    let response;
    try { response = await fetch(feedUrl, { headers: { 'User-Agent': 'JobMatch/1.0 (+manual compliance-managed feed collector)' }, signal: AbortSignal.timeout(15_000) }); }
    catch { source.lastCollectedAt = new Date().toISOString(); changed = true; continue; }
    source.lastCollectedAt = new Date().toISOString(); changed = true;
    if (!response.ok) continue;
    const items = feedItems(await response.text());
    for (const item of items) {
      if (!item.title || !item.url) continue;
      const key = normalKey(`${source.id}|${item.url}`);
      if (state.jobs.some(job => job.sourceKey === key || job.url === item.url)) continue;
      state.jobs.push({ id: crypto.randomUUID(), sourceKey: key, company: source.name, title: item.title, location: '要確認', station: '', salaryMin: 0, salaryMax: 0, employment: '不明', remote: '不明', url: item.url, description: item.description, createdAt: new Date().toISOString(), state: 'new', importedFrom: source.id, confidence: 30, total: 0 });
      changed = true;
    }
  }
  if (changed) await persist(state);
}
function normalKey(value) { return String(value).toLowerCase().replace(/\s+/g, ''); }
setInterval(() => { maybeSendMorning().catch(() => {}); }, 60_000).unref();
setInterval(() => { collectApprovedFeeds().catch(() => {}); }, 60 * 60 * 1000).unref();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const { pathname } = url;
    if (pathname === '/api/state' && req.method === 'GET') return json(res, 200, stateForClient(await readState()));
    if (pathname === '/api/state' && req.method === 'PUT') {
      const incoming = await bodyJson(req);
      const current = await readState();
      const next = { ...current, profile: incoming.profile || null, weights: incoming.weights || null, jobs: Array.isArray(incoming.jobs) ? incoming.jobs.slice(0, 2000) : current.jobs, notifications: incoming.notifications || current.notifications, sources: Array.isArray(incoming.sources) ? incoming.sources : current.sources };
      await persist(next); return json(res, 200, stateForClient(next));
    }
    if (pathname === '/api/export' && req.method === 'GET') return json(res, 200, stateForClient(await readState()));
    if (pathname === '/api/push/key' && req.method === 'GET') { const state = await readState(); return json(res, 200, { publicKey: await ensureVapid(state) }); }
    if (pathname === '/api/push/subscribe' && req.method === 'POST') {
      const subscription = await bodyJson(req);
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return json(res, 400, { error: 'Invalid subscription' });
      const state = await readState();
      state.subscriptions = [...(state.subscriptions || []).filter(item => item.endpoint !== subscription.endpoint), subscription];
      await persist(state); return json(res, 201, { ok: true });
    }
    if (pathname === '/api/push/test' && req.method === 'POST') { const state = await readState(); await sendPush(state, { type: 'test', title: 'Job Match', body: '通知の設定が完了しました。', url: '/' }); return json(res, 200, { ok: true }); }
    if (pathname === '/api/push/job' && req.method === 'POST') { const payload = await bodyJson(req); const state = await readState(); await sendPush(state, { type: 'job', title: payload.title || '高得点の新着求人', body: payload.body || '', url: '/' }); return json(res, 200, { ok: true }); }
    if (pathname === '/api/sources/collect' && req.method === 'POST') { await collectApprovedFeeds(); return json(res, 200, stateForClient(await readState())); }

    const vendorMap = { '/vendor/pdf.mjs': join(projectRoot, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'), '/vendor/pdf.worker.mjs': join(projectRoot, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'), '/vendor/mammoth.js': join(projectRoot, 'node_modules', 'mammoth', 'mammoth.browser.min.js') };
    const filePath = vendorMap[pathname] || normalize(join(appRoot, pathname === '/' ? 'index.html' : pathname));
    if (!(filePath.startsWith(appRoot) || Object.values(vendorMap).includes(filePath))) return res.writeHead(403).end('Forbidden');
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream', 'Cache-Control': pathname.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache' });
    res.end(content);
  } catch (error) { json(res, error instanceof SyntaxError ? 400 : 500, { error: error.message || 'Server error' }); }
});
server.listen(port, host, () => console.log(`Job Match: http://${host}:${port}`));
