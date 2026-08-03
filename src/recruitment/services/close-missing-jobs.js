import { normalizeUrl } from '../domain/job-posting.js';

export function closeMissingJobs(postings, sourceId, seenUrls, { crawlSucceeded = true, explicitlyClosedUrls = [] } = {}) {
  if (!crawlSucceeded) return postings;
  const seen = new Set(seenUrls.map(normalizeUrl));
  const explicit = new Set(explicitlyClosedUrls.map(normalizeUrl));
  return postings.map(item => {
    if (item.sourceId !== sourceId || item.status === 'closed') return item;
    const absent = !seen.has(normalizeUrl(item.sourceUrl));
    if (!absent && !explicit.has(normalizeUrl(item.sourceUrl))) return { ...item, consecutiveMissing: 0 };
    const consecutiveMissing = Number(item.consecutiveMissing || 0) + 1;
    const closed = explicit.has(normalizeUrl(item.sourceUrl)) || consecutiveMissing >= 3;
    return { ...item, consecutiveMissing, status: closed ? 'closed' : item.status, closedAt: closed ? new Date().toISOString() : item.closedAt };
  });
}
