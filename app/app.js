const STORAGE_KEY = 'job-match-career-os-v1';
const defaultProfile = {
  roles: '生産技術, 工程改善, 品質保証, 生産準備, 製造技術, 製造業コンサルタント',
  industries: 'メーカー, 自動車・輸送機器, 化学・素材, 電機・機械, 重工業',
  minSalary: 0,
  maxCommute: 150,
  employmentTypes: '正社員',
  excluded: '全国転勤, SES',
  skills: '生産技術, 塗装工程, 工程改善, 品質改善, 品質保証, 不具合解析, QC, 統計, データ分析, 設備改造, 材料仕様, 車両立上げ, 量産移行, サプライヤー調整, 要件定義, Excel VBA, HTML, JavaScript, 標準化, コスト削減',
  careerIntent: '神奈川に住み続けながら、メーカーで生産技術・工程改善の経験を活かし、技術と業務改善の両方に関わる'
};
const blankState = () => ({ version: 4, profile: { ...defaultProfile }, weights: { skill: 30, salary: 15, content: 25, workstyle: 15, growth: 10, stability: 5 }, jobs: [], feedback: [], notifications: { morningEnabled: true, morningHour: 7, instantEnabled: true, threshold: 80, minimumConfidence: 75 }, recruitment: { sources: [], postings: [], crawlHistory: [] } });
const validState = value => value && typeof value === 'object' && Array.isArray(value.jobs) && value.profile;
const list = value => String(value || '').split(/[,、\n]/).map(item => item.trim()).filter(Boolean);
const normal = value => String(value || '').toLowerCase().replace(/[\s　・/／()（）\-–—]/g, '');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fingerprint = job => `${normal(job.company)}|${normal(job.title)}|${normal(job.location)}`;
let state = (() => { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); return validState(saved) ? { ...blankState(), ...saved, profile: { ...defaultProfile, ...saved.profile } } : blankState(); } catch { return blankState(); } })();
let remoteTimer;

function toast(message) { const node = document.querySelector('#toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2400); }
function persistLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function save() { persistLocal(); clearTimeout(remoteTimer); remoteTimer = setTimeout(async () => { try { const response = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }); if (!response.ok) throw new Error(); } catch { /* local-first: retry on the next change */ } }, 350); }
async function syncFromServer() { try { const response = await fetch('/api/state'); if (!response.ok) return; const remote = await response.json(); if (validState(remote) && (remote.jobs.length || remote.profile)) { state = { ...blankState(), ...remote, profile: { ...defaultProfile, ...remote.profile } }; persistLocal(); } } catch {} }

function learnedExclusions() { return state.feedback.filter(item => item.type === 'excluded').map(item => item.reason).filter(Boolean); }
function scoreJob(job) {
  const text = `${job.company} ${job.title} ${job.location} ${job.description}`;
  const desired = [...list(state.profile.roles), ...list(state.profile.skills)];
  const matches = desired.filter(word => normal(text).includes(normal(word)));
  const skill = Math.min(100, 35 + matches.length * 10);
  const salary = !job.salaryMax ? 50 : job.salaryMax >= Number(state.profile.minSalary || 0) ? 100 : Math.max(10, Math.round(job.salaryMax / Math.max(1, Number(state.profile.minSalary)) * 100));
  const manufacturerTerms = ['生産技術', '製造技術', '工程', '品質', '設備', '量産', '工場', 'プロセス', '自動車', '材料'];
  const contentMatches = manufacturerTerms.filter(word => text.includes(word));
  const content = Math.min(100, 45 + contentMatches.length * 9);
  const kanagawa = /神奈川|横浜|厚木|座間|追浜|平塚|藤沢|寒川|茅ヶ崎/.test(text);
  const workstyle = kanagawa ? 92 : job.commuteMinutes != null && job.commuteMinutes <= state.profile.maxCommute ? 75 : 48;
  const growth = /開発|立上|改善|企画|DX|新規|グローバル|マネジメント/.test(text) ? 82 : 60;
  const stability = /上場|大手|メーカー|自動車|重工|電機|化学/.test(text) ? 82 : 60;
  const commuteExceeded = job.commuteMinutes != null && job.commuteMinutes > Number(state.profile.maxCommute || 150);
  const forbidden = [...list(state.profile.excluded), ...learnedExclusions()].filter(word => normal(text).includes(normal(word)));
  const excluded = commuteExceeded || forbidden.length > 0;
  const total = Math.round((skill * 30 + salary * 15 + content * 25 + workstyle * 15 + growth * 10 + stability * 5) / 100);
  const reasons = [];
  if (matches.length) reasons.push(`経験一致: ${matches.slice(0, 4).join('・')}`);
  if (kanagawa) reasons.push('神奈川勤務の可能性が高い');
  if (contentMatches.length) reasons.push(`メーカー職種との一致: ${contentMatches.slice(0, 3).join('・')}`);
  if (job.salaryMax) reasons.push(`想定年収 ${job.salaryMin || '?'}〜${job.salaryMax}万円`);
  const unknowns = [];
  if (job.commuteMinutes == null) unknowns.push('茅ヶ崎駅からの通勤時間');
  if (!job.salaryMax) unknowns.push('想定年収');
  if (!/転勤/.test(text)) unknowns.push('転勤範囲');
  if (!/残業|時間外/.test(text)) unknowns.push('残業時間');
  return { ...job, total, excluded, reasons, unknowns, forbidden };
}
function recompute() { state.jobs = state.jobs.map(scoreJob); }
function nextAction(job) {
  if (job.status === 'interview') return '面接日程と質問事項を確認する';
  if (job.status === 'applied') return '応募先からの連絡期限を確認する';
  if (job.status === 'preparing') return `職務経歴書を「${job.title}」向けに調整する`;
  if (job.status === 'offer') return '条件通知書を他社と比較する';
  return job.unknowns?.length ? `確認する: ${job.unknowns[0]}` : '応募するか判断する';
}
function searchDefinitions() {
  const role = list(state.profile.roles).slice(0, 4).join(' OR ');
  const industry = list(state.profile.industries).slice(0, 3).join(' ');
  const base = `${role} ${industry} 神奈川 正社員`;
  return [
    { name: 'Indeed', url: `https://jp.indeed.com/jobs?q=${encodeURIComponent(base)}&l=${encodeURIComponent('神奈川県')}` },
    { name: '求人ボックス', url: `https://求人ボックス.com/神奈川県の仕事?q=${encodeURIComponent(role)}` },
    { name: '企業採用サイト', url: `https://www.google.com/search?q=${encodeURIComponent(`${base} site:jobs OR site:career 採用`)}` },
    { name: 'JPOSTING', url: `https://www.google.com/search?q=${encodeURIComponent(`${base} site:jposting.net`)}` },
    { name: 'SONAR', url: `https://www.google.com/search?q=${encodeURIComponent(`${base} site:snar.jp`)}` }
  ];
}
function renderSearches() { document.querySelector('#searchQueries').innerHTML = searchDefinitions().map(item => `<a class="search-link" href="${item.url}" target="_blank" rel="noreferrer"><strong>${esc(item.name)}</strong><span>${esc(decodeURIComponent(new URL(item.url).searchParams.get('q') || 'メーカー求人を検索'))}</span></a>`).join(''); }
function jobCard(job) {
  const excluded = job.excluded ? '<span class="pill red">条件外</span>' : '<span class="pill green">候補</span>';
  return `<article class="job-card card"><div class="job-main"><div><p class="eyebrow">${esc(job.company)}</p><h3>${esc(job.title)}</h3><p class="job-meta">${esc(job.location || '勤務地未確認')} ${job.commuteMinutes != null ? `・茅ヶ崎駅から${job.commuteMinutes}分` : ''}</p></div><div class="score-badge"><span>${job.excluded ? '—' : job.total}</span><small>MATCH</small></div></div><div class="pills">${excluded}<span class="pill">${esc(job.status || 'shortlist')}</span>${job.salaryMax ? `<span class="pill">年収 ${job.salaryMin || '?'}〜${job.salaryMax}万円</span>` : ''}</div><div class="evidence"><div><h4>合う理由</h4>${job.reasons.map(item => `<p>✓ ${esc(item)}</p>`).join('') || '<p class="muted">一致する根拠が不足しています</p>'}</div><div><h4>確認事項</h4>${job.unknowns.map(item => `<p>？ ${esc(item)}</p>`).join('') || '<p class="muted">主要項目は確認済み</p>'}</div></div><div class="next-action"><strong>次にやること</strong><span>${esc(nextAction(job))}</span></div><div class="job-actions"><button class="secondary-button" data-compare="${job.id}">${job.compare ? '比較から外す' : '比較する'}</button><select class="select compact" data-status="${job.id}"><option value="shortlist">検討中</option><option value="preparing">応募準備</option><option value="applied">応募済み</option><option value="interview">面接</option><option value="offer">内定</option><option value="rejected">見送り</option></select><button class="ghost-button danger-button" data-exclude="${job.id}">今回は見送る</button>${job.url ? `<a class="ghost-button" href="${esc(job.url)}" target="_blank" rel="noreferrer">求人を開く</a>` : ''}</div></article>`;
}
function renderJobs() { recompute(); const sort = document.querySelector('#sortJobs')?.value || 'score'; const jobs = [...state.jobs].sort((a, b) => sort === 'newest' ? String(b.createdAt).localeCompare(String(a.createdAt)) : sort === 'salary' ? Number(b.salaryMax) - Number(a.salaryMax) : b.total - a.total); document.querySelector('#jobList').innerHTML = jobs.length ? jobs.map(jobCard).join('') : '<div class="card empty">まだ候補がありません。「探す」から求人を追加してください。</div>'; document.querySelectorAll('[data-status]').forEach(select => { select.value = state.jobs.find(job => job.id === select.dataset.status)?.status || 'shortlist'; select.addEventListener('change', () => { const job = state.jobs.find(item => item.id === select.dataset.status); job.status = select.value; save(); render(); }); }); document.querySelectorAll('[data-compare]').forEach(button => button.addEventListener('click', () => { const selected = state.jobs.filter(job => job.compare).length; const job = state.jobs.find(item => item.id === button.dataset.compare); if (!job.compare && selected >= 4) return toast('比較できるのは4件までです'); job.compare = !job.compare; save(); render(); })); document.querySelectorAll('[data-exclude]').forEach(button => button.addEventListener('click', () => { const reason = prompt('見送る理由を入力してください（例：全国転勤、勤務地、仕事内容）'); if (reason === null) return; const job = state.jobs.find(item => item.id === button.dataset.exclude); job.status = 'rejected'; state.feedback.push({ type: 'excluded', jobId: job.id, reason: reason.trim(), createdAt: new Date().toISOString() }); save(); render(); toast('見送り理由を今後の評価に反映します'); })); }
function renderCompare() { const jobs = state.jobs.filter(job => job.compare).slice(0, 4); const fields = [['適合度', job => `${job.total}点`], ['勤務地', job => job.location || '未確認'], ['通勤', job => job.commuteMinutes != null ? `${job.commuteMinutes}分` : '未確認'], ['年収', job => job.salaryMax ? `${job.salaryMin || '?'}〜${job.salaryMax}万円` : '未確認'], ['経験一致', job => job.reasons[0] || '不足'], ['確認事項', job => job.unknowns.join('・') || 'なし'], ['次の行動', nextAction]]; document.querySelector('#compareGrid').innerHTML = jobs.length >= 2 ? `<div class="comparison-table"><div class="comparison-row header"><div>比較軸</div>${jobs.map(job => `<div><strong>${esc(job.company)}</strong><br>${esc(job.title)}</div>`).join('')}</div>${fields.map(([label, get]) => `<div class="comparison-row"><div><strong>${label}</strong></div>${jobs.map(job => `<div>${esc(get(job))}</div>`).join('')}</div>`).join('')}</div>` : '<div class="card empty">候補求人を2件以上「比較する」に追加してください。</div>'; }
function renderPipeline() { const columns = [['shortlist', '検討中'], ['preparing', '応募準備'], ['applied', '応募済み'], ['interview', '面接'], ['offer', '内定']]; document.querySelector('#pipelineBoard').innerHTML = columns.map(([key, label]) => `<section class="pipeline-column"><h3>${label}<span>${state.jobs.filter(job => (job.status || 'shortlist') === key).length}</span></h3>${state.jobs.filter(job => (job.status || 'shortlist') === key).map(job => `<article class="pipeline-card"><strong>${esc(job.company)}</strong><span>${esc(job.title)}</span><small>${esc(nextAction(job))}</small></article>`).join('') || '<p class="muted">なし</p>'}</section>`).join(''); }
function renderProfile() { const form = document.querySelector('#profileForm'); Object.entries(state.profile).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; }); }
function render() { recompute(); renderSearches(); renderJobs(); renderCompare(); renderPipeline(); const active = state.jobs.filter(job => !['rejected'].includes(job.status)); const eligible = active.filter(job => !job.excluded); document.querySelector('#jobCount').textContent = active.length; document.querySelector('#savedCount').textContent = active.filter(job => ['shortlist', 'preparing'].includes(job.status || 'shortlist')).length; document.querySelector('#appliedCount').textContent = active.filter(job => ['applied', 'interview', 'offer'].includes(job.status)).length; document.querySelector('#actionCount').textContent = active.filter(job => job.unknowns?.length || job.status === 'preparing').length; document.querySelector('#topScore').textContent = eligible.length ? Math.max(...eligible.map(job => job.total)) : '—'; const next = active.find(job => job.status === 'interview') || active.find(job => job.status === 'preparing') || eligible.sort((a, b) => b.total - a.total)[0]; document.querySelector('#focusTitle').textContent = next ? `${next.company}の「${next.title}」を進める` : 'まずは今日の検索セットを開こう'; document.querySelector('#focusText').textContent = next ? nextAction(next) : 'メーカー求人を横断検索し、気になる求人を取り込んでください。'; }

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.tab,.tab-panel').forEach(node => node.classList.remove('active')); button.classList.add('active'); document.querySelector(`#${button.dataset.tab}`).classList.add('active'); }));
document.querySelector('#openSearches').addEventListener('click', () => { const searches = searchDefinitions(); searches.forEach((item, index) => setTimeout(() => window.open(item.url, '_blank', 'noopener'), index * 350)); });
document.querySelector('#sortJobs').addEventListener('change', renderJobs);
document.querySelector('#captureForm').addEventListener('submit', event => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); const candidate = scoreJob({ id: crypto.randomUUID(), company: form.company, title: form.title, location: form.location, station: form.station, commuteMinutes: form.commuteMinutes === '' ? null : Number(form.commuteMinutes), salaryMin: Number(form.salaryMin) || 0, salaryMax: Number(form.salaryMax) || 0, description: form.description, url: form.url, status: 'shortlist', compare: false, createdAt: new Date().toISOString() }); const existing = state.jobs.find(job => fingerprint(job) === fingerprint(candidate) || (candidate.url && job.url === candidate.url)); if (existing) Object.assign(existing, candidate, { id: existing.id, createdAt: existing.createdAt, status: existing.status }); else state.jobs.unshift(candidate); save(); event.currentTarget.reset(); render(); document.querySelector('[data-tab="jobs"]').click(); toast(existing ? '既存の求人を更新しました' : '求人を採点して追加しました'); });
document.querySelector('#profileForm').addEventListener('submit', event => { event.preventDefault(); state.profile = { ...state.profile, ...Object.fromEntries(new FormData(event.currentTarget)) }; state.profile.minSalary = Number(state.profile.minSalary) || 0; state.profile.maxCommute = Number(state.profile.maxCommute) || 150; save(); render(); toast('自分の軸を保存して再採点しました'); });
document.querySelector('#exportData').addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `job-match-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); });
document.querySelector('#importData').addEventListener('change', async event => { try { const imported = JSON.parse(await event.target.files[0].text()); if (!validState(imported)) throw new Error(); state = { ...blankState(), ...imported }; save(); renderProfile(); render(); toast('バックアップを復元しました'); } catch { toast('Job Matchのバックアップを選択してください'); } });
document.querySelector('#loginForm').addEventListener('submit', async event => { event.preventDefault(); const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: new FormData(event.currentTarget).get('password') }) }); if (!response.ok) return document.querySelector('#loginStatus').textContent = 'パスワードを確認してください'; await boot(); });
document.querySelector('#logout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); });
function applyShareParams() { const params = new URLSearchParams(location.search); const form = document.querySelector('#captureForm'); if (params.get('url')) form.elements.url.value = params.get('url'); if (params.get('title')) form.elements.title.value = params.get('title'); if (params.get('text')) form.elements.description.value = params.get('text'); if ([...params].length) document.querySelector('[data-tab="search"]').click(); }
async function boot() { try { const auth = await (await fetch('/api/auth/status')).json(); if (auth.required && !auth.authenticated) { document.querySelector('#loginCard').hidden = false; document.querySelector('#appMain').hidden = true; return; } document.querySelector('#logout').hidden = !auth.required; } catch {} document.querySelector('#loginCard').hidden = true; document.querySelector('#appMain').hidden = false; await syncFromServer(); renderProfile(); render(); applyShareParams(); }
boot();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
