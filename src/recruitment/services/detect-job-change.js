import { buildPosting, compositeKey, normalizeUrl } from '../domain/job-posting.js';

function findExisting(postings, candidate) {
  if (candidate.externalJobId) {
    const hit = postings.find(item => item.sourceId === candidate.sourceId && item.externalJobId === candidate.externalJobId);
    if (hit) return hit;
  }
  const url = normalizeUrl(candidate.sourceUrl);
  const byUrl = postings.find(item => item.sourceId === candidate.sourceId && normalizeUrl(item.sourceUrl) === url);
  if (byUrl) return byUrl;
  const key = compositeKey(candidate);
  const byComposite = postings.find(item => item.sourceId === candidate.sourceId && compositeKey(item) === key);
  if (byComposite) return byComposite;
  return postings.find(item => item.sourceId === candidate.sourceId && item.contentHash === candidate.contentHash);
}

export function upsertPosting(postings, source, raw) {
  const candidate = buildPosting(source, raw);
  const existing = findExisting(postings, candidate);
  if (!existing) return { posting: candidate, action: 'created', postings: [...postings, candidate] };
  const now = candidate.lastSeenAt;
  const status = existing.status === 'closed' ? 'reopened' : existing.contentHash !== candidate.contentHash ? 'updated' : 'open';
  const history = status === 'updated'
    ? [...(existing.history || []), { capturedAt: now, contentHash: existing.contentHash, snapshot: { ...existing, history: undefined } }].slice(-20)
    : existing.history || [];
  const next = { ...existing, ...candidate, id: existing.id, firstSeenAt: existing.firstSeenAt, lastSeenAt: now, status, history, consecutiveMissing: 0 };
  return { posting: next, action: status, postings: postings.map(item => item.id === existing.id ? next : item) };
}
