export class JobPostingRepository {
  constructor(state) { state.recruitment ||= { sources: [], postings: [], crawlHistory: [] }; this.state = state; }
  list() { return this.state.recruitment.postings || []; }
  replace(postings) { this.state.recruitment.postings = postings; return postings; }
}
