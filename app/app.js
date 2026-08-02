import * as pdfjs from '/vendor/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.mjs';
const STORAGE_KEY = 'job-match-v3';
const defaultProfile = { roles: 'プロダクトマネージャー, Webディレクター', industries: 'SaaS, IT', minSalary: 500, maxCommute: 150, employmentTypes: '正社員', excluded: '', skills: 'プロジェクトマネジメント, 要件定義, SQL, UX, アジャイル' };
const defaultWeights = { skill: 25, salary: 20, content: 20, workstyle: 15, growth: 10, stability: 10 };
const weightLabels = { skill: 'スキル適合', salary: '給与', content: '仕事内容', workstyle: '働き方', growth: '成長性', stability: '企業安定性' };
const skillDictionary = ['プロダクトマネジメント','要件定義','SQL','UX','UI','アジャイル','スクラム','Python','JavaScript','TypeScript','React','AWS','GCP','データ分析','マーケティング','営業企画','事業開発','プロジェクト管理','ディレクション','ユーザーリサーチ'];
const demoJobs = [
  { id: 'demo-1', company: 'Blue Harbor株式会社', title: 'プロダクトマネージャー', location: '東京都品川区', station: '品川駅', salaryMin: 650, salaryMax: 900, employment: '正社員', remote: 'ハイブリッド', description: 'SaaSプロダクトのロードマップ策定、顧客課題の整理、要件定義、開発チームとのアジャイルな協働を担当。プロダクトマネジメント経験、SQLやデータ分析の経験を歓迎。転勤なし。', url: 'https://example.com/jobs/blue-harbor', createdAt: '2026-08-02', commuteMinutes: 78 },
  { id: 'demo-2', company: '湘南テック合同会社', title: 'Webディレクター / UXリード', location: '神奈川県藤沢市', station: '藤沢駅', salaryMin: 520, salaryMax: 720, employment: '正社員', remote: 'ハイブリッド', description: 'Webサービスの企画、要件定義、UX改善、制作進行。ユーザーインタビューとデータをもとにプロダクトを改善します。湘南エリア勤務、転勤なし。', url: 'https://example.com/jobs/shonan-tech', createdAt: '2026-08-01', commuteMinutes: 35 },
  { id: 'demo-3', company: 'North Star Labs', title: '事業開発マネージャー', location: '東京都千代田区', station: '東京駅', salaryMin: 700, salaryMax: 1100, employment: '正社員', remote: '出社', description: '新規事業の立ち上げと事業計画、アライアンス、チームマネジメント。高い成長環境。全国転勤の可能性があります。', url: 'https://example.com/jobs/north-star', createdAt: '2026-07-31', commuteMinutes: 92 }
];

function blankState() { return { profile: { ...defaultProfile }, weights: { ...defaultWeights }, jobs: demoJobs.map(job => ({ ...job, state: 'new' })), notifications: { morningEnabled: true, morningHour: 7, instantEnabled: true, threshold: 80, minimumConfidence: 80 }, sources: [] }; }
function validState(value) { return value && typeof value === 'object' && Array.isArray(value.jobs) && value.profile && value.weights; }
function loadLocal() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); return validState(saved) ? { ...blankState(), ...saved } : blankState(); } catch { return blankState(); } }
let state = loadLocal();
let remoteTimer;
function persistLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function save() { persistLocal(); clearTimeout(remoteTimer); remoteTimer = setTimeout(async () => { try { const response = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }); if (!response.ok) throw new Error(); } catch { toast('ローカルに保存しました。サーバー同期は次回再試行します。'); } }, 300); }
async function syncFromServer() { try { const response = await fetch('/api/state'); const remote = await response.json(); if (validState(remote) && (remote.jobs.length || remote.profile)) { state = { ...blankState(), ...remote }; persistLocal(); showProfile(); showWeights(); showNotifications(); showSources(); render(); } } catch { /* local-only fallback */ } }

const toList = value => String(value || '').split(/[,、\n]/).map(item => item.trim()).filter(Boolean);
const normal = value => String(value || '').toLowerCase().replace(/[\s　・/／()（）\-–—]/g, '');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const hasAny = (text, words) => toList(words).some(word => normal(text).includes(normal(word)));
function fingerprint(job) { return `${normal(job.company)}|${normal(job.title)}|${normal(job.location)}`; }

function scoreJob(job) {
  const profile = state.profile; const weights = state.weights; const text = `${job.title} ${job.description} ${job.location} ${job.remote}`;
  const reasons = []; const negative = []; let excluded = false;
  const excludedHit = toList(profile.excluded).some(word => {
    if (word === '転勤') return /転勤(?!なし|無し)/.test(text);
    if (word === '残業') return /残業(?!なし|無し|少な)/.test(text);
    return normal(text).includes(normal(word));
  });
  if (excludedHit) { excluded = true; negative.push('除外キーワードに一致'); }
  if (job.commuteMinutes != null && Number(job.commuteMinutes) > Number(profile.maxCommute)) { excluded = true; negative.push(`通勤${job.commuteMinutes}分で上限${profile.maxCommute}分を超過`); }
  const skills = toList(profile.skills); const matched = skills.filter(skill => normal(text).includes(normal(skill)));
  const skill = Math.min(100, Math.round((matched.length / Math.max(skills.length, 1)) * 100));
  if (matched.length) reasons.push(`スキル一致：${matched.slice(0, 3).join('、')}`); else negative.push('登録スキルとの一致が少ない');
  const salary = Number(job.salaryMax) >= Number(profile.minSalary) ? Math.min(100, Math.round((Number(job.salaryMax) / Math.max(Number(profile.minSalary), 1)) * 70 + 30)) : 20;
  if (salary >= 70) reasons.push(`年収${job.salaryMin || '?'}〜${job.salaryMax || '?'}万円`); else negative.push('希望最低年収を下回る可能性');
  const roles = toList(profile.roles); const content = roles.some(role => normal(text).includes(normal(role))) ? 95 : roles.some(role => normal(text).includes(normal(role).slice(0, 5))) ? 70 : 45;
  if (content >= 70) reasons.push('希望職種との一致度が高い');
  const workstyle = job.remote === 'フルリモート' ? 100 : job.remote === 'ハイブリッド' ? 78 : job.remote === '出社' ? 42 : 55;
  if (workstyle >= 75) reasons.push(`${job.remote}の働き方`);
  const growth = hasAny(text, '成長,新規事業,裁量,アジャイル,プロダクト') ? 82 : 55;
  const stability = hasAny(text, '上場,安定,大手,長期') ? 85 : 60;
  if (job.commuteMinutes == null) negative.push('通勤時間は要確認');
  const total = Math.round((skill * weights.skill + salary * weights.salary + content * weights.content + workstyle * weights.workstyle + growth * weights.growth + stability * weights.stability) / 100);
  const confidence = Math.round(([job.company, job.title, job.location, job.description, job.salaryMax, job.remote].filter(Boolean).length / 6) * 70 + (job.commuteMinutes != null ? 30 : 0));
  return { ...job, total, confidence, excluded, reasons: reasons.slice(0, 4), negative: negative.slice(0, 4) };
}
function recompute() { state.jobs = state.jobs.map(job => ({ ...job, ...scoreJob(job) })); }

function jobCard(job) {
  const status = job.excluded ? '<span class="pill red">対象外</span>' : job.confidence < 80 ? '<span class="pill">要確認</span>' : '<span class="pill green">評価確度 高</span>';
  const map = job.station || job.location ? `<a class="ghost-button" href="https://www.google.com/maps/dir/?api=1&origin=%E8%8C%85%E3%83%B6%E5%B4%8E%E9%A7%85&destination=${encodeURIComponent(job.station || job.location)}&travelmode=transit" target="_blank" rel="noreferrer">経路確認</a>` : '';
  return `<article class="job-card card"><div class="job-main"><div><p class="eyebrow">${esc(job.company)}</p><h3>${esc(job.title)}</h3><p class="job-meta">${esc(job.location)}${job.station ? ` / ${esc(job.station)}` : ''} ・ ${esc(job.employment)} ・ ${esc(job.remote)}</p></div><div class="score-badge"><span>${job.excluded ? '—' : job.total}</span><small>${job.excluded ? '対象外' : 'MATCH'}</small></div></div><div class="pills">${status}<span class="pill">年収 ${job.salaryMin || '?'}〜${job.salaryMax || '?'}万円</span>${job.commuteMinutes != null ? `<span class="pill">茅ヶ崎駅から${job.commuteMinutes}分</span>` : '<span class="pill red">通勤要確認</span>'}</div><div class="reasons">${job.reasons.map(reason => `<div class="reason">${esc(reason)}</div>`).join('')}${job.negative.map(reason => `<div class="reason negative">${esc(reason)}</div>`).join('')}</div><div class="job-actions"><button class="secondary-button" data-state="saved" data-id="${job.id}" type="button">${job.state === 'saved' ? '保存済み' : '保存'}</button><button class="secondary-button" data-state="applied" data-id="${job.id}" type="button">${job.state === 'applied' ? '応募済み' : '応募管理'}</button><button class="secondary-button" data-commute="${job.id}" type="button">${job.commuteMinutes != null ? '通勤を修正' : '通勤を確認'}</button><button class="ghost-button danger-button" data-state="excluded" data-id="${job.id}" type="button">除外</button>${map}${job.url ? `<a class="ghost-button" href="${esc(job.url)}" target="_blank" rel="noreferrer">原文</a>` : ''}</div></article>`;
}
function render() {
  recompute();
  const sort = document.querySelector('#sortJobs')?.value || 'score';
  const jobs = [...state.jobs].sort((a, b) => sort === 'newest' ? String(b.createdAt).localeCompare(String(a.createdAt)) : sort === 'salary' ? Number(b.salaryMax) - Number(a.salaryMax) : b.total - a.total);
  const eligible = jobs.filter(job => !job.excluded);
  document.querySelector('#jobCount').textContent = jobs.length;
  document.querySelector('#recommendedCount').textContent = eligible.filter(job => job.total >= 70).length;
  document.querySelector('#reviewCount').textContent = eligible.filter(job => job.confidence < 80).length;
  document.querySelector('#savedCount').textContent = jobs.filter(job => job.state === 'saved').length;
  document.querySelector('#topScore').textContent = eligible.length ? Math.max(...eligible.map(job => job.total)) : '—';
  document.querySelector('#jobList').innerHTML = jobs.length ? jobs.map(jobCard).join('') : '<div class="card empty">まだ求人がありません。求人を追加して採点してみよう。</div>';
  bindJobActions();
}
function bindJobActions() {
  document.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => { const job = state.jobs.find(item => item.id === button.dataset.id); if (!job) return; job.state = job.state === button.dataset.state ? 'new' : button.dataset.state; save(); render(); toast('求人状態を更新しました'); }));
  document.querySelectorAll('[data-commute]').forEach(button => button.addEventListener('click', () => { const job = state.jobs.find(item => item.id === button.dataset.commute); if (!job) return; const answer = prompt(`茅ヶ崎駅から${job.station || job.location}までの片道時間（分）`, job.commuteMinutes ?? ''); if (answer === null) return; const minutes = Number(answer); if (!Number.isFinite(minutes) || minutes < 0) return toast('0以上の分数を入力してください'); job.commuteMinutes = minutes; save(); render(); toast(minutes > state.profile.maxCommute ? '上限超過として対象外にしました' : '通勤時間を保存しました'); }));
}
function showProfile() { const form = document.querySelector('#profileForm'); Object.entries(state.profile).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; }); }
function showWeights() { const box = document.querySelector('#weightFields'); box.innerHTML = Object.entries(weightLabels).map(([key, label]) => `<label class="weight-row"><span>${label}</span><input type="range" min="0" max="50" step="5" name="${key}" value="${state.weights[key]}"><output>${state.weights[key]}%</output></label>`).join(''); box.querySelectorAll('input').forEach(input => input.addEventListener('input', updateWeightTotal)); updateWeightTotal(); }
function updateWeightTotal() { const total = [...document.querySelectorAll('#weightFields input')].reduce((sum, input) => sum + Number(input.value), 0); document.querySelectorAll('#weightFields output').forEach(output => { const input = output.previousElementSibling; output.value = `${input.value}%`; }); document.querySelector('#weightTotal').textContent = `${total}%`; }
function showNotifications() { document.querySelector('#morningHour').value = state.notifications.morningHour ?? 7; document.querySelector('#notifyThreshold').value = state.notifications.threshold ?? 80; }
function showSources() { const list = document.querySelector('#sourceList'); const sources = state.sources || []; list.innerHTML = sources.length ? sources.map(source => `<div class="reason ${source.approved ? '' : 'negative'}">${esc(source.name)} — ${source.mode === 'manual_only' ? '手動取込' : source.enabled ? '有効' : '無効'}${source.url ? ` <a href="${esc(source.url)}" target="_blank" rel="noreferrer">フィード</a>` : ''}</div>`).join('') : '<div class="muted">承認済みフィードはありません。</div>'; }
function toast(message) { const element = document.querySelector('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2600); }

function stripPersonalData(text) { return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[メールアドレス除外]').replace(/(?:\+81|0)\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g, '[電話番号除外]').replace(/〒?\d{3}[-−]?\d{4}/g, '[郵便番号除外]'); }
async function extractResume(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'pdf') { const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; const pages = []; for (let index = 1; index <= pdf.numPages; index += 1) { const page = await pdf.getPage(index); const content = await page.getTextContent(); pages.push(content.items.map(item => item.str).join(' ')); } return pages.join('\n'); }
  if (extension === 'docx') { const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); return result.value; }
  return file.text();
}
function mergeResumeIntoProfile(text) {
  const found = skillDictionary.filter(skill => normal(text).includes(normal(skill)));
  const existing = toList(state.profile.skills); state.profile.skills = [...new Set([...existing, ...found])].join(', ');
  const role = /プロダクトマネージャー|PdM/.test(text) ? 'プロダクトマネージャー' : /Webディレクター/.test(text) ? 'Webディレクター' : '';
  if (role && !toList(state.profile.roles).includes(role)) state.profile.roles = [...toList(state.profile.roles), role].join(', ');
}
function urlBase64ToUint8Array(value) { const padding = '='.repeat((4 - value.length % 4) % 4); const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(base64), char => char.charCodeAt(0)); }
async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission === 'denied') throw new Error('このブラウザでは通知を利用できません。iPhoneではホーム画面へ追加したPWAから有効化してください。');
  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission(); if (permission !== 'granted') throw new Error('通知が許可されませんでした。');
  const { publicKey } = await (await fetch('/api/push/key')).json();
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription) });
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.tab,.tab-panel').forEach(item => item.classList.remove('active')); button.classList.add('active'); document.querySelector(`#${button.dataset.tab}`).classList.add('active'); }));
document.querySelector('#sortJobs').addEventListener('change', render);
document.querySelector('#jobForm').addEventListener('submit', async event => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); const candidate = { id: `job-${Date.now()}`, company: form.company, title: form.title, location: form.location, station: form.station, salaryMin: Number(form.salaryMin) || 0, salaryMax: Number(form.salaryMax) || Number(form.salaryMin) || 0, employment: form.employment, remote: form.remote, url: form.url, description: form.description, createdAt: new Date().toISOString(), state: 'new' }; const existing = state.jobs.find(job => fingerprint(job) === fingerprint(candidate)); let savedJob; if (existing) { Object.assign(existing, candidate, { id: existing.id, state: existing.state, createdAt: existing.createdAt, updatedAt: new Date().toISOString() }); savedJob = existing; toast('重複求人を更新しました'); } else { state.jobs.unshift(candidate); savedJob = candidate; toast('求人を採点して登録しました'); } recompute(); save(); event.currentTarget.reset(); render(); document.querySelector('[data-tab="jobs"]').click(); const settings = state.notifications; if (settings.instantEnabled && !savedJob.excluded && savedJob.total >= settings.threshold && savedJob.confidence >= settings.minimumConfidence) { try { await fetch('/api/push/job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `${savedJob.total}点の新着求人`, body: `${savedJob.company} / ${savedJob.title}` }) }); } catch { /* the job is still saved even when Push is unavailable */ } } });
document.querySelector('#profileForm').addEventListener('submit', event => { event.preventDefault(); state.profile = Object.fromEntries(new FormData(event.currentTarget)); state.profile.minSalary = Number(state.profile.minSalary) || 0; state.profile.maxCommute = Number(state.profile.maxCommute) || 150; save(); render(); document.querySelector('#profileSaved').textContent = '保存しました'; setTimeout(() => document.querySelector('#profileSaved').textContent = '', 2200); });
document.querySelector('#weightsForm').addEventListener('submit', event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const total = Object.values(values).reduce((sum, value) => sum + Number(value), 0); if (total !== 100) return toast(`合計を100%にしてください（現在${total}%）`); state.weights = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)])); save(); render(); toast('評価の重みを保存しました'); });
document.querySelector('#resumeFile').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; const status = document.querySelector('#fileStatus'); try { status.textContent = `${file.name}を端末内で解析中…`; const raw = await extractResume(file); const sanitized = stripPersonalData(raw).replace(/\s+/g, ' ').trim(); mergeResumeIntoProfile(sanitized); document.querySelector('#resumeText').textContent = sanitized.slice(0, 8000); document.querySelector('#resumePreview').open = true; showProfile(); save(); render(); status.textContent = `${file.name}を端末内で解析しました。抽出内容を確認してプロフィールを保存してください。`; } catch (error) { status.textContent = `解析できませんでした：${error.message}`; } });
document.querySelector('#exportData').addEventListener('click', async () => { const payload = { ...state, exportedAt: new Date().toISOString() }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `job-match-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); });
document.querySelector('#importData').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; try { const imported = JSON.parse(await file.text()); if (!validState(imported)) throw new Error(); state = { ...blankState(), ...imported }; save(); showProfile(); showWeights(); showNotifications(); render(); toast('バックアップを復元しました'); } catch { toast('このJSONはJob Matchのバックアップではありません'); } });
document.querySelector('#morningHour').addEventListener('change', event => { state.notifications.morningHour = Number(event.target.value); save(); });
document.querySelector('#notifyThreshold').addEventListener('change', event => { state.notifications.threshold = Number(event.target.value); save(); });
document.querySelector('#sourceForm').addEventListener('submit', event => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); const source = { id: `feed-${Date.now()}`, name: form.name, mode: 'feed', url: form.url, termsUrl: form.termsUrl, robotsUrl: form.robotsUrl, minimumIntervalMinutes: 60, approved: true, enabled: true, addedAt: new Date().toISOString() }; state.sources = [...(state.sources || []).filter(item => item.url !== source.url), source]; save(); showSources(); event.currentTarget.reset(); toast('承認済みフィードを追加しました'); });
document.querySelector('#collectFeeds').addEventListener('click', async () => { try { const response = await fetch('/api/sources/collect', { method: 'POST' }); if (!response.ok) throw new Error(); const collected = await response.json(); if (validState(collected)) { state = { ...state, ...collected }; persistLocal(); render(); showSources(); } toast('承認済みフィードを確認しました'); } catch { toast('フィード確認に失敗しました。URLとネットワークを確認してください'); } });
document.querySelector('#enablePush').addEventListener('click', async () => { try { await subscribePush(); document.querySelector('#pushStatus').textContent = '通知を有効化しました。'; } catch (error) { document.querySelector('#pushStatus').textContent = error.message; } });
document.querySelector('#testPush').addEventListener('click', async () => { try { const response = await fetch('/api/push/test', { method: 'POST' }); if (!response.ok) throw new Error(); toast('テスト通知を送信しました'); } catch { toast('通知を有効化してから試してください'); } });
document.querySelector('#resetDemo').addEventListener('click', () => { if (confirm('保存済みの求人と設定を初期状態へ戻しますか？')) { state = blankState(); save(); showProfile(); showWeights(); showNotifications(); render(); } });
showProfile(); showWeights(); showNotifications(); showSources(); render(); syncFromServer();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
