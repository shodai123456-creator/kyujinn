import test from 'node:test';
import assert from 'node:assert/strict';
import { jpostingList, jpostingDetail } from '../src/recruitment/adapters/jposting/jposting-parser.js';
import { upsertPosting } from '../src/recruitment/services/detect-job-change.js';
import { closeMissingJobs } from '../src/recruitment/services/close-missing-jobs.js';
import { crawlSource } from '../src/recruitment/services/crawl-source.js';
import { sonarList } from '../src/recruitment/adapters/sonar/sonar-parser.js';
import { nissanList } from '../src/recruitment/adapters/nissan/nissan-parser.js';

const source = { id: 'source', companyName: 'テスト製造', sourceName: 'テスト', sourceType: 'html_list', entryUrl: 'https://example.test/job.phtml', officialCareerUrl: 'https://example.test/career', termsUrl: 'https://example.test/terms', robotsUrl: 'https://example.test/robots.txt', adapterType: 'jposting', requiresJavaScript: false, crawlIntervalHours: 6, enabled: true, approvalStatus: 'approved', humanReviewed: true };
const listHtml = '<a href="job.phtml?jobid=A1">生産技術</a>';
const detailHtml = '<html><title>生産技術</title><h1>生産技術</h1><p>勤務地：神奈川県</p><p>仕事内容：工程改善</p><p>応募条件：品質管理経験</p></html>';

test('JPOSTINGの一覧・詳細を抽出する', () => {
  const links = jpostingList(listHtml, source.entryUrl);
  assert.equal(links.length, 1);
  const job = jpostingDetail(detailHtml, links[0].url);
  assert.equal(job.title, '生産技術');
  assert.match(job.description, /工程改善/);
  assert.equal(job.externalJobId, 'A1');
});

test('同じ求人は重複せず、変更・再掲載を検出する', () => {
  let postings = upsertPosting([], source, { externalJobId: 'A1', title: '生産技術', locations: ['神奈川'], sourceUrl: 'https://example.test/detail?jobid=A1&utm_source=x', description: '工程改善' }).postings;
  let result = upsertPosting(postings, source, { externalJobId: 'A1', title: '生産技術', locations: ['神奈川'], sourceUrl: 'https://example.test/detail?jobid=A1', description: '工程改善' });
  assert.equal(result.postings.length, 1); assert.equal(result.action, 'open'); postings = result.postings;
  result = upsertPosting(postings, source, { externalJobId: 'A1', title: '生産技術', locations: ['神奈川'], sourceUrl: 'https://example.test/detail?jobid=A1', description: '工程改善・標準化' });
  assert.equal(result.action, 'updated'); assert.equal(result.posting.history.length, 1);
  postings = closeMissingJobs(result.postings, source.id, [], { crawlSucceeded: true });
  postings = closeMissingJobs(postings, source.id, [], { crawlSucceeded: true });
  postings = closeMissingJobs(postings, source.id, [], { crawlSucceeded: true });
  assert.equal(postings[0].status, 'closed');
  result = upsertPosting(postings, source, { externalJobId: 'A1', title: '生産技術', locations: ['神奈川'], sourceUrl: 'https://example.test/detail?jobid=A1', description: '工程改善・標準化' });
  assert.equal(result.action, 'reopened');
});

test('一時失敗では終了にせず、承認前はクロールしない', async () => {
  const existing = upsertPosting([], source, { title: '品質保証', locations: ['神奈川'], sourceUrl: 'https://example.test/a', description: '品質' }).postings;
  assert.equal(closeMissingJobs(existing, source.id, [], { crawlSucceeded: false })[0].status, 'open');
  const pending = { ...source, enabled: false, approvalStatus: 'pending' };
  const result = await crawlSource({ source: pending, postings: existing, fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.equal(result.skipped, true);
});

test('SONARと日産向けアダプターは求人リンクを独立して抽出する', () => {
  const html = '<a href="/job/detail/42">製造職</a>';
  assert.equal(sonarList(html, 'https://sonar.example/').length, 1);
  assert.equal(nissanList(html, 'https://nissan.example/').length, 1);
});

test('クロールはrobots記録と一覧・詳細を処理し、429をリトライする', async () => {
  let listCalls = 0;
  const fetchImpl = async url => {
    if (url.endsWith('robots.txt')) return new Response('User-agent: *', { status: 200 });
    if (url.includes('job.phtml') && !url.includes('jobid=')) { listCalls += 1; if (listCalls === 1) return new Response('', { status: 429 }); return new Response(listHtml, { status: 200 }); }
    return new Response(detailHtml, { status: 200 });
  };
  const result = await crawlSource({ source: { ...source }, postings: [], fetchImpl });
  assert.equal(result.crawl.status, 'success');
  assert.equal(result.postings.length, 1);
  assert.equal(listCalls, 2);
});
