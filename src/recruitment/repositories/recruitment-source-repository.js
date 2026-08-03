import { initialRecruitmentSources } from '../domain/recruitment-source.js';

export function migrateSources(state) {
  const current = state.recruitment?.sources || [];
  const legacy = (state.sources || []).filter(item => item.mode === 'feed' && item.url).map(item => ({
    id: item.id, companyName: item.name, sourceName: item.name, sourceType: 'rss', entryUrl: item.url,
    officialCareerUrl: item.officialCareerUrl || '', termsUrl: item.termsUrl || '', robotsUrl: item.robotsUrl || '',
    adapterType: 'generic_html', requiresJavaScript: false, crawlIntervalHours: Math.max(6, Number(item.minimumIntervalMinutes || 60) / 60),
    enabled: Boolean(item.enabled), approvalStatus: item.approved ? 'approved' : 'pending', notes: '既存RSS設定から移行', humanReviewed: Boolean(item.approved)
  }));
  const merged = [...initialRecruitmentSources(), ...current, ...legacy].reduce((all, source) => {
    if (!all.some(item => item.id === source.id)) all.push(source);
    return all;
  }, []);
  state.recruitment = { sources: merged, postings: state.recruitment?.postings || [], crawlHistory: state.recruitment?.crawlHistory || [] };
  return state.recruitment.sources;
}

export class RecruitmentSourceRepository {
  constructor(state) { this.state = state; migrateSources(state); }
  list() { return this.state.recruitment.sources; }
  get(id) { return this.list().find(source => source.id === id); }
  save(source) { const sources = this.list(); const index = sources.findIndex(item => item.id === source.id); if (index >= 0) sources[index] = source; else sources.push(source); return source; }
}
