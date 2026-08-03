import { sourceCanCrawl } from '../domain/recruitment-source.js';
import { normalizeUrl } from '../domain/job-posting.js';
import { upsertPosting } from './detect-job-change.js';
import { closeMissingJobs } from './close-missing-jobs.js';

const adapters = {
  rss: () => import('../adapters/rss/rss-source-adapter.js'),
  atom: () => import('../adapters/rss/rss-source-adapter.js'),
  generic_html: () => import('../adapters/html/generic-html-source-adapter.js'),
  jposting: () => import('../adapters/jposting/jposting-adapter.js'),
  sonar: () => import('../adapters/sonar/sonar-adapter.js'),
  nissan: () => import('../adapters/nissan/nissan-adapter.js')
};

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
export async function fetchWithPolicy(url, { fetchImpl = fetch, timeoutMs = 15_000, retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { 'User-Agent': 'JobMatch/1.0 (+compliance-managed recruitment collector)' }, signal: AbortSignal.timeout(timeoutMs) });
      if ([429, 403, 503].includes(response.status)) throw new Error(`HTTP ${response.status}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) { lastError = error; if (attempt + 1 < retries) await sleep(250 * (2 ** attempt)); }
  }
  throw lastError;
}

export async function crawlSource({ source, postings, fetchImpl = fetch, now = Date.now() }) {
  if (!sourceCanCrawl(source, now)) return { postings, skipped: true, reason: 'not-approved-or-not-due' };
  if (source.requiresJavaScript === true) return { postings, skipped: true, reason: 'javascript-renderer-not-configured' };
  const startedAt = new Date(now).toISOString();
  try {
    let robotsStatus = 'not-fetched';
    try { const robots = await fetchWithPolicy(source.robotsUrl, { fetchImpl }); robotsStatus = `HTTP ${robots.status}`; } catch (error) { robotsStatus = `error: ${error.message}`; }
    const module = await (adapters[source.adapterType] || adapters.generic_html)();
    const adapter = module.default;
    const listResponse = await fetchWithPolicy(source.entryUrl, { fetchImpl });
    const listHtml = await listResponse.text();
    const items = adapter.list(source, listHtml);
    let next = postings; const seenUrls = [];
    for (const item of items) {
      try {
        const detailResponse = item.detailHtml != null ? null : await fetchWithPolicy(item.sourceUrl, { fetchImpl });
        const detailHtml = item.detailHtml ?? await detailResponse.text();
        const raw = adapter.detail(source, detailHtml, item);
        if (!raw?.title) continue;
        raw.sourceUrl ||= item.sourceUrl;
        const result = upsertPosting(next, source, raw); next = result.postings; seenUrls.push(normalizeUrl(raw.sourceUrl));
      } catch { /* One malformed detail must not abort the source crawl. */ }
    }
    next = closeMissingJobs(next, source.id, seenUrls, { crawlSucceeded: true });
    source.lastCrawledAt = new Date().toISOString(); source.robotsLastResult = robotsStatus;
    return { postings: next, crawl: { sourceId: source.id, startedAt, status: 'success', found: items.length, robotsStatus } };
  } catch (error) {
    source.lastCrawledAt = new Date().toISOString();
    return { postings, crawl: { sourceId: source.id, startedAt, status: 'error', error: error.message } };
  }
}
