export const SOURCE_TYPES = ['rss', 'atom', 'html_list', 'html_detail', 'json_api'];
export const ADAPTER_TYPES = ['generic_html', 'jposting', 'sonar', 'nissan', 'custom'];
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

export const initialRecruitmentSources = () => [
  { id: 'mitsubishi-electric', companyName: '三菱電機', sourceName: '三菱電機 キャリア採用', sourceType: 'html_list', officialCareerUrl: 'https://www.mitsubishielectric.co.jp/saiyo/career/index.html', entryUrl: 'https://progres02.jposting.net/pgmitsubishielectric/u/job.phtml', termsUrl: '', robotsUrl: 'https://progres02.jposting.net/robots.txt', adapterType: 'jposting', requiresJavaScript: false, crawlIntervalHours: 24, enabled: false, approvalStatus: 'pending', notes: '利用規約URLを管理者が確認後に登録すること。' },
  { id: 'ihi', companyName: 'IHI', sourceName: 'IHI キャリア採用', sourceType: 'html_list', officialCareerUrl: 'https://www.ihi.co.jp/recruit/career/', entryUrl: 'https://ihi-recruit.snar.jp/index.aspx', termsUrl: '', robotsUrl: 'https://ihi-recruit.snar.jp/robots.txt', adapterType: 'sonar', requiresJavaScript: 'investigate', crawlIntervalHours: 24, enabled: false, approvalStatus: 'pending', notes: 'JavaScript要否・利用規約URLを管理者が確認後に登録すること。' },
  { id: 'nissan', companyName: '日産自動車', sourceName: '日産自動車 キャリア採用', sourceType: 'html_list', officialCareerUrl: 'https://www.nissanmotor.jobs/japan/MC/', entryUrl: 'https://www.nissanmotor.jobs/japan/MC/', termsUrl: '', robotsUrl: 'https://www.nissanmotor.jobs/robots.txt', adapterType: 'nissan', requiresJavaScript: 'investigate', crawlIntervalHours: 24, enabled: false, approvalStatus: 'pending', notes: 'JavaScript要否・利用規約URLを管理者が確認後に登録すること。' },
  { id: 'isuzu', companyName: 'いすゞ自動車', sourceName: 'いすゞ自動車 キャリア採用', sourceType: 'html_list', officialCareerUrl: 'https://www.isuzu-careers.com/', entryUrl: 'https://js01.jposting.net/isuzu/u/career/job.phtml', termsUrl: '', robotsUrl: 'https://js01.jposting.net/robots.txt', adapterType: 'jposting', requiresJavaScript: false, crawlIntervalHours: 24, enabled: false, approvalStatus: 'pending', notes: '利用規約URLを管理者が確認後に登録すること。' }
];

export function sourceCanCrawl(source, now = Date.now()) {
  if (!source || !source.enabled || source.approvalStatus !== 'approved') return false;
  if (!source.officialCareerUrl || !source.termsUrl || !source.robotsUrl || !source.entryUrl) return false;
  const hours = Math.max(6, Number(source.crawlIntervalHours) || 24);
  return now - (Date.parse(source.lastCrawledAt || 0) || 0) >= hours * 3_600_000;
}
