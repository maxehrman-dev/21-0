/* 21-0 UI */
(function () {
'use strict';
let DATA = null, G = null, HEADS = null;
const UI = {tab: 'home', partner: null, give: [], get: [], rview: 'lineup', rosterPos: 'ALL', statKey: null, league: 'standings',
  faFit: 'need', faPos: 'ALL', faYrs: {}, rYrs: {}, faApy: {}, ddOpen: null, cutSel: null, tq: '', found: null, share: ''};
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const money = v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(1) + 'M';
const pct = v => Math.round(v * 100) + '%';
const oc = o => o >= 90 ? 'o90' : o >= 80 ? 'o80' : o >= 68 ? 'o70' : 'o0';
const SAVE_KEY = '21-0-save-v1';
const MODES = {standard: ['Standard', 'Any team, every tool.'], notrades: ['No trades', 'No trades at all. Win with free agency, the draft and your roster.'],
  caphell: ['Cap hell', 'Start $45M deep in dead money, and $20M more in 2027.'], worst: ['Worst to first', 'Only the 8 worst rosters. Take one to 21-0.']};
const modeTag = m => m && m !== 'standard' ? `<span class="tag warn">${MODES[m][0]}</span>` : '';
const RANK_LETTER = r => r <= 4 ? 'A' : r <= 12 ? 'B' : r <= 20 ? 'C' : r <= 26 ? 'D' : 'F';

function persist() { try { localStorage.setItem(SAVE_KEY, E.save()); } catch (e) { /* storage unavailable */ } }
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function toast(m) { document.querySelectorAll('.toast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'toast'; d.setAttribute('role', 'status'); d.textContent = m; document.body.appendChild(d); setTimeout(() => d.classList.add('out'), 3150); setTimeout(() => d.remove(), 3400); }

function badge(t, sm) {
  const tm = (G || DATA).teams[t];
  if (!tm) return `<span class="badge${sm ? ' sm' : ''}" style="background:#2a3550">FA</span>`;
  return `<span class="badge${sm ? ' sm' : ''}" style="background:${tm.c1};border-color:${tm.c2}">${t}</span>`;
}
const tname = t => (G || DATA).teams[t] ? (G || DATA).teams[t].nick : 'Free agent';
function rec(t, s) { const r = E.record(t, s || G.season); return `${r.w}-${r.l}`; }
// Headshot from the team sprite sheet, or initials on team colors
function face(p, size) {
  const h = HEADS && p && HEADS.ix[p.id];
  const cls = `face${size ? ' ' + size : ''}`;
  if (h) {
    const cols = HEADS.cols, rows = HEADS.rows[h[0]], c = h[1] % cols, r = Math.floor(h[1] / cols);
    return `<span class="${cls}" style="background-image:url(img/${h[0]}.webp);background-size:${cols * 100}% ${rows * 100}%;background-position:${c / (cols - 1) * 100}% ${rows > 1 ? r / (rows - 1) * 100 : 0}%" aria-hidden="true"></span>`;
  }
  const ini = p ? p.n.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('') : '?';
  const tm = p && (G || DATA).teams[p.tm];
  return `<span class="${cls} ini" style="--tc:${tm ? tm.c1 : '#2a3550'}" aria-hidden="true">${esc(ini)}</span>`;
}
const injTag = p => p.inj ? ` <span class="tag bad">${p.injW === undefined || p.injW === 99 ? 'Out for season' : 'Out ' + p.injW + ' wk'}</span>` : '';
function formTag(p) { const l = E.formLabel(p); return l ? ` <span class="tag ${E.formOf(p) > 0 ? 'good' : 'bad'}">${l}</span>` : ''; }
const ordinalJ = n => { const r = n % 100, t = n % 10; return n + (r >= 11 && r <= 13 ? 'th' : t === 1 ? 'st' : t === 2 ? 'nd' : t === 3 ? 'rd' : 'th'); };
// Rough pick equivalent for a value, using the same scale as draft picks
function pickEquiv(v) { if (v >= 65) return 'a top-5 pick'; if (v >= 45) return 'a top-12 pick'; if (v >= 26) return 'a 1st-round pick'; if (v >= 15) return 'an early 2nd'; if (v >= 8) return 'a 2nd-round pick'; if (v >= 4) return 'a 3rd-round pick'; if (v >= 1.8) return 'a 4th or 5th'; return 'a late-round pick'; }
const lastName = n => { const w = n.split(' '); return w.length > 1 ? w.slice(1).join(' ') : n; };
function pRow(p, extra) {
  const deal = p.tm === 'FA' ? '' : ` · ${money(p.cap)} thru ${p.end}`;
  return `<div class="prow">${face(p, 'sm')}<div class="pmain"><div class="pn">${pname(p)}</div><div class="psub">${p.pos} · ${Math.floor(p.age)}${deal}${extra ? ' · ' + extra : ''}</div></div><span class="ovrb ${oc(p.ovr)}">${p.ovr}</span></div>`;
}
// One side of a counter, compared with what you offered: what they kept, added, and took out
function diffSide(ids, base) {
  base = base || [];
  const kept = ids.filter(id => base.includes(id)), added = ids.filter(id => !base.includes(id)), gone = base.filter(id => !ids.includes(id));
  return [...kept.map(assetMini), ...added.map(id => `<div class="dnew"><span class="dtag">Added</span>${assetMini(id)}</div>`), ...gone.map(id => `<div class="dgone"><span class="dtag">Removed</span>${assetMini(id)}</div>`)].join('') || '<span class="small muted">Nothing</span>';
}
function assetMini(id) {
  const p = G.players[id];
  if (p) return `<div class="amini">${face(p, 'xs')}<span class="an">${pname(p)}</span><span class="muted small">${p.pos}</span><span class="ovrb sm ${oc(p.ovr)}">${p.ovr}</span></div>`;
  const k = G.picks.find(x => x.id === id);
  return `<div class="amini"><span class="face xs pk" aria-hidden="true">R${k ? k.rd : '?'}</span><span class="an">${k ? esc(E.pickLabel(k)) : 'Pick'}</span><span class="muted small">pick</span></div>`;
}
// Pop-up for results: signings, trades, rejections
function awardsCard(season) {
  const L = (G.awards || {})[season];
  if (!L || !L.length) return '';
  return `<div class="card awards"><div class="cardh"><h3>${season} awards</h3><span class="small muted">From the simulated season</span></div>${L.map(a => { const p = G.players[a.id]; return `<div class="award ${a.tm === G.user ? 'mine' : ''}"><span class="atrophy" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4M12 14v3M8.5 20h7"/></svg></span>${p ? face(p, 'sm') : ''}<div class="pmain"><div class="kicker">${esc(a.award)}</div><div class="pn">${p ? pname(p) : esc(a.n)} <span class="muted small">${a.pos}</span></div><div class="psub">${esc(a.line)}</div></div>${badge(a.tm, 1)}</div>`; }).join('')}</div>`;
}
// Celebration: a short burst of confetti in team colors (skipped for reduced motion)
function confetti() {
  sfx('champ');
  try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) { /* fine */ }
  const cv = document.createElement('canvas'); cv.className = 'confetti'; cv.setAttribute('aria-hidden', 'true');
  const W = cv.width = innerWidth, H = cv.height = innerHeight; document.body.appendChild(cv);
  const ctx = cv.getContext('2d'), tm = G && G.teams[G.user];
  const cols = ['#f3b52f', '#ffd56a', '#eef2f8', tm ? tm.c1 : '#3fc07f', tm ? tm.c2 : '#ef5b51'];
  const P = Array.from({length: 160}, () => ({x: W / 2 + (Math.random() - .5) * W * .4, y: H * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - .5) * .3, c: cols[Math.floor(Math.random() * cols.length)]}));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (const p of P) { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
    if (t - t0 < 2600) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}
const buzz = pattern => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ } };
function popup(kicker, title, body, cls) {
  if (cls === 'win') { buzz(30); sfx('deal'); } else if (cls === 'loss') sfx('bad');
  modal(`<div class="sheeth"><div><div class="kicker">${kicker}</div><h3>${title}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>${body}<div class="row end"><button class="btn go" data-act="closeModal">Got it</button></div>`, true);
  const sh = document.querySelector('.sheet'); if (sh && cls) sh.classList.add(cls);
}
const isPick = id => !G.players[id];
function assetGroup(ids) {
  const pl = ids.filter(id => !isPick(id)), pk = ids.filter(isPick);
  return (pl.map(assetMini).join('') || '') + (pk.length ? `<div class="sublbl">Picks</div>${pk.map(assetMini).join('')}` : '') || '<span class="small muted">Nothing</span>';
}
function tradePopup(partner, give, get, how) {
  popup(how || 'Trade complete', `Deal with the ${esc(G.teams[partner].nick)}`, `<div class="offerb tradedone"><div><div class="lbl">You got</div>${assetGroup(get)}</div><div><div class="lbl">You sent</div>${assetGroup(give)}</div></div>`, 'win');
}
function signPopup(id, apy, yrs) {
  const p = G.players[id];
  popup('Signed with you', `${esc(p.n)} joins the ${esc(G.teams[G.user].nick)}`, `<div class="signhero">${face(p, 'xl')}<div><div class="kicker">${p.pos} · ${Math.floor(p.age)} · ${p.ovr} OVR</div><b class="num">${money(apy)} × ${yrs} yr</b><div class="small muted">${money(apy * yrs)} total</div></div></div>`, 'win');
}
function wavePopup(r, wave) {
  const line = (x, mine) => { const p = G.players[x.id]; return `<div class="prow resrow">${face(p, 'sm')}<div class="pmain"><div class="pn">${esc(p.n)} <span class="muted small">${p.pos} ${p.ovr}</span></div><div class="psub">${mine ? 'Signed with you' : `Signed with the ${esc(G.teams[x.t].nick)}`}: ${money(x.apy)} × ${x.yrs} yr${!mine && x.offered === false ? ' · you met with him' : ''}</div></div>${mine ? '<span class="tag good">Yours</span>' : x.t ? badge(x.t, 1) : ''}</div>`; };
  const dec = G.fa.decisions.length;
  popup(`Wave ${wave} results`, r.you.length ? `${r.you.length} signed with you` : dec ? 'Decision time' : r.lost.length ? 'They went elsewhere' : 'The market moved',
    `${r.you.length ? `<h4 class="sub">Signed with you</h4>${r.you.map(x => line(x, true)).join('')}` : ''}
     ${dec ? `<div class="agent">${dec} player${dec > 1 ? 's' : ''} got a better offer from another team. Match it or let him go on the free agency screen.</div>` : ''}
     ${r.lost.length ? `<h4 class="sub">Your targets who signed elsewhere</h4>${r.lost.map(x => line(x)).join('')}` : ''}
     ${r.notable.length ? `<h4 class="sub">Around the league</h4>${r.notable.slice(0, 8).map(x => line(x)).join('')}` : ''}
     ${!r.you.length && !r.lost.length && !r.notable.length && !dec ? '<p class="muted">No big names moved. Prices dropped about 12%.</p>' : ''}`);
}
function fairTag(f) {
  const [c, l] = f >= 1.12 ? ['good', 'Great for you'] : f >= .96 ? ['good', 'Fair'] : f >= .85 ? ['warn', 'You pay a bit more'] : ['bad', 'You overpay'];
  return `<span class="tag ${c}">${l}</span>`;
}
function seg(id, opts, cur) {
  return `<div class="seg" role="group">${opts.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-act="seg" data-seg="${id}" data-k="${k}" aria-pressed="${k === cur}">${l}</button>`).join('')}</div>`;
}
function modal(html, wide) { clearTimeout(UI.closeT); const had = !!$('#layer .modal:not(.closing)'); $('#layer').innerHTML = `<div class="modal" data-act="closeModal"><div class="sheet${wide ? ' wide' : ''}" data-stop="1" role="dialog" aria-modal="true">${html}</div></div>`; if (had) { const m = $('#layer .modal'); if (m) m.classList.add('still'); } }
const closeModal = () => {
  const m = $('#layer .modal');
  if (!m || reducedMotion()) { $('#layer').innerHTML = ''; return; }
  m.classList.add('closing'); clearTimeout(UI.closeT);
  UI.closeT = setTimeout(() => { const n = $('#layer .modal.closing'); if (n) $('#layer').innerHTML = ''; }, 170);
};
// ---------- motion ----------
function reducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
function countUp(el, from, to, dur, fmt) {
  if (reducedMotion() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  (function step(t) {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
// Cards rise in, bars fill and big numbers count up when you land on a new screen.
function animateEnter() {
  if (reducedMotion()) return;
  const app = $('#app');
  let i = 0;
  for (const el of app.querySelectorAll('.card, .tcard, .hero, .inboxrow, .need')) {
    if (el.parentElement.closest('.card, .tcard')) continue;
    el.style.setProperty('--i', Math.min(i++, 12)); el.classList.add('rise');
  }
  for (const el of app.querySelectorAll('[class$="bar"] > i, .meter > i')) el.classList.add('grow');
  for (const el of app.querySelectorAll('.kpis b')) {
    const m = /^(\d{1,3})(%?)$/.exec(el.textContent.trim());
    if (m && +m[1] > 0) countUp(el, 0, +m[1], 900, v => v + m[2]);
  }
  for (const el of app.querySelectorAll('.count')) el.classList.add('pulse');
}
// After a sim, your games flash by one at a time and the record ticks up. Tap to skip.
function simReel(games, kicker, start, done) {
  const u = G.user;
  const mine = games.filter(g => g.h === u || g.a === u);
  if (!mine.length || reducedMotion()) { done(); return; }
  let w = start.w, l = start.l, i = 0, finished = false;
  const el = document.createElement('div');
  el.className = 'reel'; el.setAttribute('role', 'status');
  el.innerHTML = `<div class="reel-in"><div class="reel-k">${esc(kicker)}</div><div class="reel-rec">${w}-${l}</div><div class="reel-sub">${esc(G.teams[u].name)}</div><div class="reel-grid"></div><div class="reel-skip">Tap to skip</div></div>`;
  document.body.appendChild(el);
  const recEl = el.querySelector('.reel-rec'), sub = el.querySelector('.reel-sub'), grid = el.querySelector('.reel-grid');
  const stepMs = Math.max(110, Math.min(240, 1700 / mine.length));
  const finish = () => {
    if (finished) return; finished = true; clearInterval(tm);
    el.classList.add('out'); setTimeout(() => { el.remove(); done(); }, 260);
  };
  const add = () => {
    const g = mine[i++], home = g.h === u, us = home ? g.hs : g.as, them = home ? g.as : g.hs, opp = home ? g.a : g.h;
    const r = us > them ? 'w' : us < them ? 'l' : 't';
    if (r === 'w') w++; else if (r === 'l') l++;
    sfx(r === 'w' ? 'win' : 'loss');
    const c = document.createElement('div'); c.className = 'rchip ' + r;
    c.innerHTML = `<b>${r.toUpperCase()}</b><span>${us}-${them}</span><em>${home ? 'vs' : 'at'} ${esc(opp)}${g.wk && !g.po ? ` · Wk ${g.wk}` : ''}</em>`;
    grid.appendChild(c);
    recEl.textContent = `${w}-${l}`; recEl.classList.remove('bump'); void recEl.offsetWidth; recEl.classList.add('bump');
    if (l === 0 && w > 0 && start.seasonL === 0) sub.textContent = 'Still perfect'; else sub.textContent = r === 'w' ? `Beat the ${G.teams[opp].nick}` : `Lost to the ${G.teams[opp].nick}`;
    if (i >= mine.length) { clearInterval(tm); setTimeout(finish, 900); }
  };
  const tm = setInterval(add, stepMs);
  el.addEventListener('click', () => { while (i < mine.length) add(); finish(); });
}
// Runs a sim, then plays the reel, then reports injuries and celebrations.
function simWithReel(kicker, sim) {
  const s = G.season, n0 = (G.results[s] || []).length, mark = (G.injLog || []).length;
  const r0 = E.record(G.user, s), start = {w: r0.w, l: r0.l, seasonL: r0.l};
  const po = G.phase === 'playoffs';
  if (po) { const pw = poWins(s); start.w = pw; start.l = 0; }
  sim();
  const games = (G.results[s] || []).slice(n0);
  UI.reel = true; persist(); render();
  simReel(games, kicker, start, () => {
    UI.reel = false;
    if (UI.celebrate) { UI.celebrate = false; setTimeout(() => { confetti(); buzz([40, 60, 40, 60, 120]); }, 100); }
    injuryPopup(mark);
  });
}
function poWins(s) { return (G.results[s] || []).filter(g => g.po && ((g.h === G.user && g.hs > g.as) || (g.a === G.user && g.as > g.hs))).length; }

// ---------- career / résumé storage ----------
// Saved to the viewer's private area in the page's database when available, and always mirrored on this device.
const CAREER_KEY = '21-0-career-v1';
const C = {gmName: '', runs: {}, cloud: 'pending', db: null, uid: null, q: Promise.resolve()};
function loadLocalCareer() { try { const o = JSON.parse(localStorage.getItem(CAREER_KEY) || 'null'); if (o) { C.gmName = o.gmName || ''; C.runs = o.runs || {}; } } catch (e) { /* storage unavailable */ } }
function saveLocalCareer() { try { localStorage.setItem(CAREER_KEY, JSON.stringify({gmName: C.gmName, runs: C.runs})); } catch (e) { /* storage unavailable */ } }
function cloudWrite(path, data) {
  if (!C.db) return;
  C.q = C.q.then(() => C.db.doc(path).set(data)).catch(err => { if (err && (err.code === 'invalid_argument' || err.code === 'revoked' || err.code === 'not_granted')) { C.db = null; C.cloud = 'off'; } });
}
async function connectCareer() {
  const timer = setTimeout(() => { if (C.cloud === 'pending') { C.cloud = 'slow'; if (UI.tab === 'resume') render(); } }, 10000);
  try {
    if (!window.claude || !window.claude.use) throw new Error('no viewer');
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const uid = user ? await user.id() : null;
    if (!db || !uid) throw new Error('no store');
    const base = `data/users/${uid}/profile`;
    const [ps, rs] = await Promise.all([db.doc(base).get(), db.doc(base).collection('runs').get()]);
    C.db = db; C.uid = uid;
    const remote = {};
    rs.docs.forEach(d => { remote[d.id] = JSON.parse(JSON.stringify(d.data())); });
    const pd = ps.exists ? ps.data() : null;
    if (pd && pd.gmName) C.gmName = String(pd.gmName);
    else if (C.gmName) cloudWrite(base, {gmName: C.gmName, updatedAt: Date.now()});
    for (const id in C.runs) if (!remote[id] || (C.runs[id].updatedAt || 0) > (remote[id].updatedAt || 0)) cloudWrite(`${base}/runs/${id}`, C.runs[id]);
    for (const id in remote) if (!C.runs[id] || (remote[id].updatedAt || 0) >= (C.runs[id].updatedAt || 0)) C.runs[id] = remote[id];
    C.cloud = 'on';
    subscribeLeaderboard();
    if (careerList().some(r => r.done)) postLeaderboard();
    saveLocalCareer();
  } catch (e) {
    C.cloud = 'off';
  } finally {
    clearTimeout(timer);
    if (UI.tab === 'resume' || !G) render();
  }
}
function recordRun(final) {
  if (!G || !G.user) return;
  if (!G.startedAt) G.startedAt = Date.now();
  const id = 'run-' + G.startedAt;
  const prev = C.runs[id] || {};
  const seasons = Object.assign({}, prev.seasons || {});
  for (const s of [2026, 2027]) {
    const P = G.playoffs[s];
    if (!P || !P.champ) continue;
    const f = E.userFinish(s), gm = E.goalMet(s);
    seasons[s] = {w: f.w, l: f.l, rw: f.rw, rl: f.rl, label: f.label, champ: P.champ === G.user, perfect: !!f.perfect, po: f.label !== 'Missed playoffs', sb: P.champ === G.user || f.label === 'Lost in the Super Bowl', goal: gm ? gm.goal : '', met: gm ? !!gm.met : null};
  }
  const run = Object.assign({}, prev, {team: G.user, startedAt: G.startedAt, updatedAt: Date.now(), startOvr: G.start ? G.start.ovr : G.startOvr, startRank: G.startRank || prev.startRank || null, seasons, trades: G.trades.length, mode: G.mode || 'standard'});
  if (final) {
    const R = E.rebuildReport();
    Object.assign(run, {done: true, score: R.score, grade: R.grade, style: R.style.name, endOvr: R.now.ovr});
  }
  C.runs[id] = run;
  saveLocalCareer();
  if (final) postLeaderboard();
  if (C.db) cloudWrite(`data/users/${C.uid}/profile/runs/${id}`, run);
}

// ---------- leaderboard ----------
// Each viewer owns one row (leaderboard/<their id>): their GM name and best finished runs. Everyone with access reads it.
function postLeaderboard() {
  if (!C.db || !C.uid) return;
  const done = careerList().filter(r => r.done).sort((a, b) => b.score - a.score);
  if (!done.length) return;
  const T = careerTotals();
  const runs = done.slice(0, 5).map(r => ({team: r.team, score: r.score, grade: r.grade, mode: r.mode || 'standard', s26: r.seasons && r.seasons[2026] ? `${r.seasons[2026].w}-${r.seasons[2026].l}` : '', s27: r.seasons && r.seasons[2027] ? `${r.seasons[2027].w}-${r.seasons[2027].l}` : '', titles: Object.values(r.seasons || {}).filter(x => x.champ).length, perfect: Object.values(r.seasons || {}).some(x => x.perfect)}));
  cloudWrite(`leaderboard/${C.uid}`, {gmName: (C.gmName || '').slice(0, 40), best: done[0].score, titles: T.titles.length, perfect: T.perfect.length, runs, updatedAt: Date.now()});
}
function subscribeLeaderboard() {
  if (!C.db || C.lbUnsub) return;
  try {
    C.lbUnsub = C.db.collection('leaderboard').onSnapshot(snap => {
      C.lb = snap.docs.map(d => Object.assign({id: d.id}, JSON.parse(JSON.stringify(d.data()))));
      if (UI.tab === 'resume') render();
    }, () => { C.lbErr = true; if (UI.tab === 'resume') render(); });
  } catch (e) { C.lbErr = true; }
}
function leaderboardCard() {
  if (!window.claude) return '';
  const rows = (C.lb || []).filter(x => x.runs && x.runs.length).sort((a, b) => (b.titles - a.titles) || (b.best - a.best)).slice(0, 25);
  const head = `<div class="cardh"><h3>Leaderboard</h3><span class="small muted">Ranked by titles, then best rebuild score</span></div>`;
  if (C.cloud !== 'on') return `<div class="card" style="margin-top:14px">${head}<p class="muted">${C.cloud === 'pending' ? 'Loading the leaderboard.' : 'The leaderboard needs you signed in to claude.ai with access to save. Your résumé is still saved on this device.'}</p></div>`;
  return `<div class="card" style="margin-top:14px">${head}${rows.length ? `<div class="tw"><table class="tbl"><thead><tr><th>#</th><th>GM</th><th>Titles</th><th>Best run</th><th>Score</th></tr></thead><tbody>${rows.map((x, i) => { const r = x.runs[0]; return `<tr class="${x.id === C.uid ? 'me' : ''}"><td class="num">${i + 1}</td><td><b>${esc(x.gmName || 'Anonymous GM')}</b>${x.id === C.uid ? ' <span class="tag gold">You</span>' : ''}</td><td class="num">${x.titles || 0}${x.perfect ? ' <span class="tag good">21-0</span>' : ''}</td><td><div class="row nowrap">${DATA.teams[r.team] ? badge(r.team, 1) : ''} ${DATA.teams[r.team] ? esc(DATA.teams[r.team].nick) : ''} <span class="small muted">${esc(r.s26)} · ${esc(r.s27)}</span> ${modeTag(r.mode)}</div></td><td><span class="tag ${gclass(r.grade)}">${esc(r.grade)}</span> <span class="num">${r.score}</span></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Nobody has finished a run yet. Finish both seasons to post yours.</p>'}
    <p class="small muted">Your GM name and best runs show here to anyone you share this game with.</p></div>`;
}

// ---------- help ----------
// Every screen says one line. The rest lives behind the ? button, so the depth is there when you want it.
const HELP = {
  run: ['How a run works', [
    ['Goal', 'Go 21-0: win all 17 regular-season games, then 4 playoff games.'],
    ['1 · First half of 2026', 'Your real roster plays Weeks 1 to 8 on its own. Use the time to study your needs.'],
    ['2 · Week 9 trade deadline', 'Your one chance to trade in 2026. Take an offer from your inbox or build your own deal.'],
    ['3 · 2027 offseason', 'This is where you build the team: re-sign, free agency, the draft, then the final roster.'],
    ['4 · 2027 season', 'One more trade deadline, then one more shot at 21-0.'],
    ['The gold Next button', 'It always does the next step. On a computer, N does the same.']]],
  pre: ['Before the deadline', [
    ['What happens now', 'Weeks 1 to 8 play out with the real roster. No moves until the deadline.'],
    ['Team needs', 'Letter grades rank each position against the league. F and D spots are what to buy at the deadline.'],
    ['Outlook', 'Projected wins and odds come from hundreds of simulated seasons with the current rosters.']]],
  deadline: ['The trade deadline', [
    ['Inbox', 'Teams send offers. Every offer in your inbox is one they would accept.'],
    ['Make a trade', 'Pick a team, then what you want and what you send. The meter shows how they feel before you propose.'],
    ['Call them', 'Optional. Pitch the deal on the phone: they accept, counter or laugh. Lowballs cost patience.'],
    ['Wins', 'Every trade shows what it is worth in wins a season for your team.']]],
  playoffs: ['Playoffs', [['How it works', 'Eight teams per conference, no byes. Win four in a row for the title. No moves during the playoffs.']]],
  progress: ['Progression', [['Ratings changed', 'Young players with upside grew, older players declined, and a big season can lift a rating more than one bad year can sink it.']]],
  resign: ['Re-signing', [
    ['Pay', 'Pay the asking price and he stays.'],
    ['Negotiate', 'Offer less. He can counter or walk, and his patience runs out after a few tries.'],
    ['Do nothing', 'Anyone you do not re-sign leaves for free agency when you move on. Starters are marked.'],
    ['Keep my starters', 'Re-signs every starter you can afford in one tap.']]],
  fa: ['Free agency', [
    ['Sign now', 'Pay his asking price and he signs on the spot.'],
    ['Tap a player', 'Meet him to raise his interest (3 meetings a wave), or offer less and wait for the wave to end.'],
    ['Waves', 'At the end of each wave rival teams bid. He picks the best mix of money, winning, role and loyalty. If a rival beats your offer, you can match.'],
    ['Prices', 'Asking prices drop about 12% each wave, but the best players go fast.']]],
  draft: ['The draft', [
    ['Big board', 'The real 2027 class, 4 rounds. Scouts give a range, and the real rating shows the moment a player is drafted.'],
    ['Trades', 'Teams call to trade up into your pick. You can also trade up yourself.'],
    ['Auto', 'Auto-draft picks the best fit for your needs.']]],
  cutdown: ['Final roster', [
    ['Goal', 'Get to 53 players and under the cap.'],
    ['Suggested cuts', 'Backups with the least value for their pay. Change the list, then release them in one go.'],
    ['Open spots', 'Fill them with minimum-salary free agents, or they fill on their own when the season starts.']]],
};
function helpKey() {
  if (!G) return 'run';
  if (UI.tab === 'trade') return 'deadline';
  if (G.phase === 'offseason') return G.step;
  if (G.phase === 'deadline') return 'deadline';
  if (G.phase === 'playoffs') return 'playoffs';
  if (G.phase === 'preseason' || G.phase === 'season') return 'pre';
  return 'run';
}
function helpSheet(k) {
  k = HELP[k] ? k : 'run';
  const [title, rows] = HELP[k];
  modal(`<div class="sheeth"><div><div class="kicker">How it works</div><h3>${title}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="helplist">${rows.map(([h, t]) => `<div class="helprow"><b>${h}</b><span>${t}</span></div>`).join('')}</div>
    <p class="small muted soundline">Sound effects are ${SND.on ? 'on' : 'off'}. <button class="linkbtn" data-act="sound">Turn ${SND.on ? 'off' : 'on'}</button></p>
    <div class="row helpfoot">${k !== 'run' ? '<button class="btn ghost" data-act="help" data-k="run">How a run works</button>' : ''}<button class="btn go" data-act="closeModal">Got it</button></div>`, true);
}
const helpBtn = k => `<button class="qhelp" data-act="help" data-k="${k}" aria-label="How this works">?</button>`;

// ---------- sound ----------
// Small synthesized sounds, no files. Off with one tap; the choice is remembered on this device.
const SND = {on: true, ctx: null};
try { SND.on = localStorage.getItem('21-0-sound') !== 'off'; } catch (e) { /* storage unavailable */ }
function audio() {
  if (!SND.ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; try { SND.ctx = new A(); } catch (e) { return null; } }
  if (SND.ctx.state === 'suspended') SND.ctx.resume();
  return SND.ctx;
}
function tone(c, f, dur, o = {}) {
  const t = c.currentTime + (o.at || 0), osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.linearRampToValueAtTime(f + o.slide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vol || .05, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  osc.connect(g); g.connect(c.destination); osc.start(t); osc.stop(t + dur + .02);
}
function sfx(name) {
  if (!SND.on) return;
  const c = audio(); if (!c) return;
  const play = {
    tap: () => tone(c, 520, .06, {type: 'triangle', vol: .025}),
    win: () => { tone(c, 660, .09, {type: 'triangle', vol: .04}); tone(c, 880, .12, {type: 'triangle', vol: .04, at: .06}); },
    loss: () => tone(c, 200, .22, {type: 'sawtooth', vol: .025, slide: -70}),
    deal: () => [523, 659, 784, 1047].forEach((f, i) => tone(c, f, .18, {type: 'triangle', vol: .045, at: i * .07})),
    bad: () => { tone(c, 233, .16, {type: 'square', vol: .02}); tone(c, 175, .24, {type: 'square', vol: .02, at: .13}); },
    stamp: () => { tone(c, 110, .14, {type: 'square', vol: .05}); tone(c, 880, .08, {type: 'triangle', vol: .03, at: .02}); },
    tick: () => tone(c, 1400, .025, {type: 'triangle', vol: .012}),
    champ: () => { [523, 659, 784].forEach((f, i) => tone(c, f, .22, {type: 'triangle', vol: .05, at: i * .14})); [1047, 1319, 1568].forEach(f => tone(c, f, .9, {type: 'triangle', vol: .035, at: .45})); },
  }[name];
  if (play) try { play(); } catch (e) { /* audio is optional */ }
}

// ---------- header ----------
function phaseLabel() {
  const p = G.phase;
  if (p === 'preseason' || p === 'season') return `${G.season} · Week ${G.week + 1}`;
  if (p === 'deadline') return `${G.season} · Trade deadline`;
  if (p === 'playoffs') return `${G.season} · Playoffs`;
  if (p === 'seasondone') return `${G.season} · Season over`;
  if (p === 'offseason') return `2027 offseason · ${({progress: 'Progression', resign: 'Re-sign', fa: 'Free agency', draft: 'Draft', cutdown: 'Final roster'})[G.step]}`;
  if (p === 'final') return 'Final results';
  return '';
}
function tradeOpen() { return G && G.mode !== 'notrades' && (G.phase === 'deadline' || G.phase === 'offseason'); }
const offerCount = () => tradeOpen() ? ((G.offers || []).length + (G.step === 'draft' ? E.draftOffers().length : 0)) : 0;

const TAB_ICON = {home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', roster: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.8 14.2c2.8.1 5 2.2 5.7 5.8"/>',
  trade: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>', league: '<path d="M5 20V10M12 20V4M19 20v-7"/>', resume: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4M12 14v3M8.5 20h7"/>'};
function nextAction() {
  if (!G) return null;
  const P = G.phase, S = G.step;
  if (P === 'preseason' || P === 'season') return {label: 'Sim to the trade deadline', act: 'toDeadline', sub: `${G.season} · Week 1`};
  if (P === 'deadline') { const n = offerCount(); return {label: 'Sim rest of season', act: 'simRest', sub: n ? `${n} trade offer${n > 1 ? 's' : ''} waiting` : 'Trade deadline'}; }
  if (P === 'playoffs') { const R = G.playoffs[G.season]; return {label: `Play the ${E.ROUND_NAMES[R.round]}`, act: 'poNext', sub: `${G.season} playoffs`, alt: {label: 'Skip', act: 'poSkip'}}; }
  if (P === 'seasondone') return G.season === 2026 ? {label: 'Start the 2027 offseason', act: 'offseason', sub: '2026 is over'} : {label: 'See final results', act: 'final', sub: '2027 is over'};
  if (P === 'offseason') {
    if (S === 'progress') return {label: 'Next: re-sign players', act: 'toResign', sub: 'Offseason · step 1 of 5'};
    if (S === 'resign') { const n = pendingResign().starters.length; return {label: 'Next: free agency', act: 'toFA', sub: n ? `${n} starter${n > 1 ? 's' : ''} unsigned` : 'Offseason · step 2 of 5'}; }
    if (S === 'fa') {
      if ((G.fa.decisions || []).length) return {label: 'Match or let go', act: 'tabHome', sub: `${G.fa.decisions.length} decision${G.fa.decisions.length > 1 ? 's' : ''} waiting`};
      return G.fa.wave <= 3 ? {label: `End wave ${G.fa.wave}`, act: 'faWave', sub: `Free agency · ${3 - (G.fa.meetings || 0)} meetings left`, alt: {label: 'Draft', act: 'toDraft'}} : {label: 'Next: the draft', act: 'toDraft', sub: 'Free agency is over'};
    }
    if (S === 'draft') { const D = G.draft, slot = D.order[D.at]; if (!slot) return {label: 'Next: final roster', act: 'finishDraft', sub: 'Draft complete'}; return slot.owner === G.user ? {label: `You're on the clock: #${slot.no}`, act: 'tabHome', sub: 'Pick from the big board', alt: {label: 'Auto', act: 'finishDraft'}} : {label: 'Sim to my pick', act: 'toMyPick', sub: `Pick #${slot.no}`, alt: {label: 'Auto', act: 'finishDraft'}}; }
    if (S === 'cutdown') { const bad = E.userReady().length; return bad ? (E.roster(G.user).length < 53 ? {label: 'Fill open spots', act: 'fillRoster', sub: E.userReady()[0]} : {label: 'Review cuts', act: 'tabHome', sub: E.userReady()[0]}) : {label: 'Start the 2027 season', act: 'startS2', sub: 'Roster is legal'}; }
  }
  if (P === 'final') return {label: 'Run it back', act: 'runback', sub: 'Same team, new run', alt: {label: 'Share', act: 'share', k: 'final'}};
  return null;
}
function renderActionBar() {
  const el = $('#abar'); if (!el) return;
  const a = nextAction();
  if (!a) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="abar-txt"><span class="kicker">Next</span><span class="small muted">${esc(a.sub || '')}</span></div>${a.alt ? `<button class="btn" data-act="${a.alt.act}" ${a.alt.k ? `data-k="${a.alt.k}"` : ''}>${esc(a.alt.label)}</button>` : ''}<button class="btn go" data-act="${a.act}">${esc(a.label)}</button>`;
}
function renderBottomNav() {
  renderActionBar();
  const el = $('#bnav'); if (!el) return;
  if (!G) { el.innerHTML = ''; return; }
  const n = offerCount();
  const tab = ([k, l]) => `<button data-tab="${k}" class="${UI.tab === k || (k === 'league' && UI.tab === 'resume') ? 'on' : ''}" aria-current="${UI.tab === k ? 'page' : 'false'}"><svg viewBox="0 0 24 24" aria-hidden="true">${TAB_ICON[k]}</svg><span>${l}</span>${k === 'trade' && n ? `<i class="bcount">${n}</i>` : ''}</button>`;
  const a = nextAction();
  const SHORT = {toDeadline: 'Deadline', simRest: 'Sim rest', poNext: 'Play', offseason: 'Offseason', final: 'Results', toResign: 'Re-sign', toFA: 'Free agency', faWave: 'End wave', toDraft: 'Draft',
    toMyPick: 'My pick', finishDraft: 'Finish', fillRoster: 'Fill roster', startS2: 'Start 2027', runback: 'Run back', tabHome: 'Go'};
  const short = a ? (a.act === 'tabHome' && G.step === 'draft' ? 'Pick' : a.act === 'faWave' ? `Wave ${G.fa.wave}` : SHORT[a.act] || 'Next') : '';
  const center = a ? `<button class="bnext" data-act="${a.act}" aria-label="${esc(a.label)}" title="${esc(a.label)}"><span class="bnext-ring"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg></span><span>${esc(short)}</span></button>` : '<span class="bnext off"></span>';
  el.innerHTML = tab(['home', 'Home']) + tab(['roster', 'Roster']) + center + tab(['trade', 'Trade']) + tab(['league', 'League']);
}
function perfectNow() {
  if (!G || G.phase === 'offseason' || G.phase === 'preseason') return false;
  const f = E.userFinish(G.season);
  return f.w > 0 && f.l === 0;
}
function renderHeader() {
  renderBottomNav();
  try { document.title = G ? `${rec(G.user)} ${G.teams[G.user].nick} · 21-0` : '21-0: Run the Front Office'; } catch (e) { /* title is cosmetic */ }
  if (!G) {
    $('#hdr').innerHTML = `<div class="hbar"><button class="logo" data-tab="home" aria-label="21-0 home">21<span>-</span>0</button><div class="hmeta">Run the Front Office</div>
      <div class="hright"><button class="btn ghost sm" data-tab="${UI.tab === 'resume' ? 'home' : 'resume'}">${UI.tab === 'resume' ? 'Pick a team' : 'Your résumé'}</button></div></div>`;
    return;
  }
  const tr = E.teamRating(G.user), cap = G.cap[G.season], pay = E.payroll(G.user);
  const rank = E.teamList().map(t => E.teamRating(t).ovr).filter(o => o > tr.ovr).length + 1;
  const n = offerCount();
  const tabs = [['home', 'Front office'], ['roster', 'Roster'], ['trade', 'Trade'], ['league', 'League'], ['resume', 'Résumé']];
  $('#hdr').innerHTML = `<div class="hbar">
    <button class="logo" data-tab="home" aria-label="Front office" title="Shortcuts: N for the next step, 1 to 5 for tabs">21<span>-</span>0</button>
    <div class="hteam">${badge(G.user)}<div class="hmeta"><b>${esc(G.teams[G.user].name)}${perfectNow() ? ' <i class="perfect" title="Still unbeaten">Perfect</i>' : ''}</b><span>${esc(phaseLabel())}</span></div></div>
    <div class="hstats">
      <div class="stat"><b class="num">${rec(G.user)}</b><span>${(() => { const k = E.streak(G.user, G.season); return k && G.phase !== 'offseason' ? `<em class="${k.win ? 'good' : 'bad'}">${k.win ? 'W' : 'L'}${k.n}</em> streak` : 'Record'; })()}</span></div>
      <div class="stat"><b class="num ${oc(tr.ovr)}">${tr.ovr}</b><span>OVR · #${rank}</span></div>
      <div class="stat mobcap"><b class="num ${pay > cap ? 'bad' : ''}">${money(cap - pay).replace('.0M', 'M')}</b><span>Cap free</span></div>
    </div>
    <div class="capbox"><div class="caprow"><span>${G.season} cap</span><span class="num"><b>${money(cap - pay)}</b> free</span></div>
      <div class="capbar ${pay > cap ? 'over' : ''}"><i style="width:${Math.min(100, pay / cap * 100)}%"></i></div></div>
  </div>
  <nav class="tabs" aria-label="Sections">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${UI.tab === k ? 'on' : ''}" aria-current="${UI.tab === k ? 'page' : 'false'}">${l}${k === 'trade' && n ? ` <span class="count">${n}</span>` : k === 'trade' && tradeOpen() ? ' <span class="dot" aria-label="open"></span>' : ''}</button>`).join('')}
    <span class="tabtools">${(() => { const a = nextAction(); return a && UI.tab !== 'home' ? `<button class="btn go sm tabnext" data-act="${a.act}" title="Shortcut: N">Next: ${esc(a.label.replace(/^Next: /, ''))}</button>` : ''; })()}<button class="ibtn2" data-act="help" data-k="${helpKey()}" aria-label="How this works" title="How this works">?</button></span></nav>`;
}

// ---------- team picker ----------
function renderPicker() {
  E.newGame(DATA, 'KC', 1);
  const tmp = E.G;
  const rows = Object.keys(DATA.teams).map(t => { const r = E.teamRating(t), qb = r.d.QB[0]; return {t, ovr: r.ovr, qb, cap: tmp.cap[2026] - E.payroll(t), div: DATA.teams[t].div}; });
  rows.forEach(r => { r.rank = rows.filter(x => x.ovr > r.ovr).length + 1; });
  const coached = teamCareer();
  const divs = {};
  rows.forEach(r => (divs[r.div] = divs[r.div] || []).push(r));
  const order = ['AFC East', 'AFC North', 'AFC South', 'AFC West', 'NFC East', 'NFC North', 'NFC South', 'NFC West'];
  const goal = rank => [[4, 'Win it all'], [10, 'Deep run'], [18, 'Playoffs'], [25, 'Winning record'], [32, 'Show progress']].find(g => rank <= g[0])[1];
  $('#app').innerHTML = `
  <section class="hero picker-hero"><div>
    <h1 class="display">Go 21-0.</h1>
    <p class="lead">17-0 in the regular season, then 4 playoff wins. Nobody has done it. You get the 2026 and 2027 seasons to build the team that does. Real rosters, contracts and stats as of Week 1, 2026.</p>
  </div>${hasSave() ? `<button class="btn go lg" data-act="resume">Resume saved game</button>` : ''}</section>
  <div class="modebar card"><div><div class="kicker">Mode</div><p class="small muted">${esc(MODES[UI.mode || 'standard'][1])}</p></div>${seg('mode', Object.entries(MODES).map(([k, v]) => [k, v[0]]), UI.mode || 'standard')}</div>
  <div class="steps">
    <div><span class="kicker">2026</span><p>The first half plays out with the real roster. You get the Week 9 trade deadline, then the sim runs to the end.</p></div>
    <div><span class="kicker">Playoffs</span><p>8 teams per conference, no byes, so 21-0 is possible. Watch round by round or skip ahead.</p></div>
    <div><span class="kicker">2027</span><p>Re-sign, free agency, the real 2027 draft class and a $327M cap. Then one more deadline and one more shot.</p></div>
  </div>
  <div class="mobonly confseg">${seg('pconf', [['AFC', 'AFC'], ['NFC', 'NFC']], UI.pconf || 'AFC')}</div>
  <div class="pickwrap show-${UI.pconf || 'AFC'}">${order.map(d => `<div class="div-${d.slice(0, 3)}"><h2 class="divh">${d}</h2><div class="teams">${(divs[d] || []).sort((a, b) => b.ovr - a.ovr).map(r => { const c = coached[r.t]; return `
    <button class="tcard ${UI.mode === 'worst' && r.rank < 25 ? 'locked' : ''}" data-act="pick" data-t="${r.t}" ${UI.mode === 'worst' && r.rank < 25 ? 'disabled title="Worst to first: bottom 8 rosters only"' : ''}>${badge(r.t)}<div class="tmid"><div class="tn">${esc(DATA.teams[r.t].name)}</div>
    <div class="ts">${r.qb ? 'QB ' + esc(r.qb.n) : ''} · ${money(r.cap)} free</div><div class="ts">Expectation: <b>${goal(r.rank)}</b>${c ? ` · <span class="gold">${c.titles ? c.titles + (c.titles > 1 ? ' titles' : ' title') : 'Coached'}${c.best ? ', best ' + c.best : ''}</span>` : ''}</div></div>
    <div class="to ${oc(r.ovr)}"><b>${r.ovr}</b><span>#${r.rank}</span></div></button>`; }).join('')}</div></div>`).join('')}</div>
  <p class="legal">21-0 is an unofficial fan project. It is not affiliated with, endorsed by or licensed by the National Football League, the NFL Players Association or any team. Team names, player names and player photos belong to their owners. Stats, rosters, snap counts and trades come from <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener">nflverse</a> (CC BY 4.0). Ratings, values and results are simulated estimates.</p>`;
}

// ---------- outlook / expectations ----------
function outlookCard(season, mode) {
  const e = E.setExpectations(season);
  let pr = null;
  if (mode === 'live') { const key = season + '-' + G.week; if (!UI.proj || UI.proj.key !== key) UI.proj = {key, v: E.project(season, 500)[G.user]}; pr = UI.proj.v; }
  const r = E.record(G.user, season);
  const shown = pr || {w: e.wins, po: e.po, div: e.div, sb: e.sb};
  const diff = pr ? Math.round((pr.w - e.wins) * 10) / 10 : 0;
  return `<div class="card outlook"><div class="cardh"><h3>${mode === 'live' ? 'Rest-of-season outlook' : `${season} outlook`}</h3><span class="tag">${e.rank <= 10 ? 'Contender' : e.rank <= 20 ? 'Bubble' : 'Rebuild'} · #${e.rank} roster</span></div>
    <div class="goal"><span class="kicker">Front office expects</span><b>${esc(e.goal)}</b></div>
    ${confMeter()}
    <div class="kpis">
      <div><b class="num">${shown.w.toFixed(1)}</b><span>Projected wins${pr ? ` <em class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff} vs preseason</em>` : ''}</span></div>
      <div><b class="num">${pct(shown.po)}</b><span>Playoffs</span></div>
      <div><b class="num">${pct(shown.div)}</b><span>Division</span></div>
      <div><b class="num">${pct(shown.sb)}</b><span>Super Bowl</span></div>
    </div>
    <p class="small muted">${pr ? `You are ${r.w}-${r.l}. ` : ''}Based on hundreds of simulated seasons with current rosters. 21-0 needs every game.</p></div>`;
}

function confMeter() {
  const c = G.conf == null ? 55 : G.conf, last = (G.confLog || []).slice(-1)[0];
  const col = c >= 55 ? 'var(--good)' : c >= 35 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="conf"><div class="row" style="justify-content:space-between"><span class="kicker" style="color:var(--muted)">Owner confidence</span><b style="color:${col}">${E.confLabel(c)} · ${c}</b></div>
    <div class="gbar"><i style="width:${c}%;background:${col}"></i></div>${last ? `<div class="small muted">${last.d >= 0 ? '+' : ''}${last.d}: ${esc(last.why)}</div>` : ''}</div>`;
}

// ---------- needs ----------
function injuryCard() {
  const d = E.depth(G.user);
  const all = E.roster(G.user).filter(p => p.inj), wouldStart = p => { const L = d[p.pos], last = L[E.STARTERS[p.pos] - 1]; return !last || p.ovr > last.ovr; };
  const hurt = all.filter(wouldStart).sort((a, b) => b.ovr - a.ovr), backups = all.length - hurt.length;
  if (!hurt.length) return '';
  return `<div class="card injcard"><div class="cardh"><h3>Injured starters</h3><span class="tag bad">${hurt.length} out</span></div>${hurt.slice(0, 4).map(p => { const sub = d[p.pos][0]; return `<div class="prow resrow">${face(p, 'sm')}<div class="pmain"><div class="pn">${pname(p)} <span class="muted small">${p.pos} ${p.ovr}</span></div><div class="psub">${p.injW === undefined || p.injW === 99 ? 'Out for the season' : `Back in about ${p.injW} week${p.injW > 1 ? 's' : ''}`}${sub ? ` · ${esc(sub.n)} (${sub.ovr}) starts` : ''}</div></div></div>`; }).join('')}${backups ? `<div class="small muted injmore">Plus ${backups} backup${backups > 1 ? 's' : ''} out.</div>` : ''}</div>`;
}
function injuryPopup(mark) {
  if (G.phase === 'seasondone') return false;
  const L = (G.injLog || []).slice(mark).filter(x => G.players[x.id] && G.players[x.id].tm === G.user && G.players[x.id].inj);
  if (!L.length) return false;
  const d = E.depth(G.user);
  popup('Injury report', `${L.length} of your starters got hurt`, `<p class="small muted">The sim does not stop for injuries, so here is what happened. Backups moved up automatically. You can change the depth chart in the Roster tab.</p>${L.map(x => { const p = G.players[x.id], sub = d[p.pos][0]; return `<div class="prow resrow">${face(p, 'sm')}<div class="pmain"><div class="pn">${esc(p.n)} <span class="muted small">${p.pos} ${p.ovr}</span></div><div class="psub">Hurt in Week ${x.week} · ${x.wk === 99 ? 'out for the season' : `out about ${x.wk} week${x.wk > 1 ? 's' : ''}`}${sub ? ` · ${esc(sub.n)} (${sub.ovr}) took over` : ''}</div></div><span class="tag ${x.wk === 99 ? 'bad' : 'warn'}">${x.wk === 99 ? 'Season' : x.wk + ' wk'}</span></div>`; }).join('')}`, 'loss');
  return true;
}
function needsList(limit) {
  const N = E.teamNeeds();
  return `<div class="needs">${N.slice(0, limit || N.length).map(n => `
    <button class="need" data-act="needPos" data-pos="${n.pos}">
      <span class="ng g${RANK_LETTER(n.rank)}">${RANK_LETTER(n.rank)}</span>
      <span class="nmain"><b>${n.pos}</b><span class="nfaces">${n.starters.map(p => face(p, 'xs')).join('')}</span><span class="small muted">${n.starters.map(p => esc(lastName(p.n))).join(', ') || 'Empty'}</span></span>
      <span class="nright"><span class="tag ${n.level === 'High' ? 'bad' : n.level === 'Medium' ? 'warn' : ''}">${n.level} need</span><span class="small muted num">#${n.rank} of 32</span></span>
    </button>`).join('')}</div>`;
}
function needModal(pos) {
  const T = E.upgradeTargets(pos);
  const L = E.depth(G.user)[pos];
  const tierBlock = (tiers, kind) => tiers.map(t => `<div class="tierh"><b>${t.tier}</b><span class="small muted">${t.note}</span></div>${t.list.map(x => kind === 'fa'
    ? `<div class="trow">${pRow(x.p, `<span class="gold">+${x.gain}</span> · asks ${money(x.price)} · interest ${x.interest}${x.fits ? '' : ' · <span class="bad">over your cap</span>'}`)}<button class="btn sm go" data-act="faOpen" data-id="${x.p.id}" data-k="offer">Offer</button></div>`
    : `<div class="trow">${pRow(x.p, `<span class="gold">+${x.gain}</span> · ${esc(x.why)} · costs about ${pickEquiv(x.cost)}${x.fits ? '' : ' · <span class="warn">send salary back</span>'}`)}<button class="btn sm" data-act="findFor" data-id="${x.p.id}">Price it</button></div>`).join('')}`).join('');
  const fa = T.fa.length ? `<h4 class="sub">Free agents</h4>${tierBlock(T.fa, 'fa')}` : '';
  const tr = tradeOpen() && T.tr.length ? `<h4 class="sub">Trade targets</h4>${tierBlock(T.tr, 'tr')}` : '';
  modal(`<div class="sheeth"><div><div class="kicker">${pos} · your starter is ${T.worst} OVR</div><h3>Upgrade ${pos}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="depthmini">${L.map((p, i) => `<span class="${i < E.STARTERS[pos] ? 'st' : ''}">${face(p, 'xs')} ${esc(lastName(p.n))} <b class="${oc(p.ovr)}">${p.ovr}</b></span>`).join('')}</div>
    ${fa}${tr}${!fa && !tr ? `<p class="muted">${tradeOpen() ? 'Nobody available is a real upgrade here.' : 'Trades open at the deadline and in the offseason. Free agents sign in the 2027 offseason.'}</p>` : ''}
    <div class="row end"><button class="btn" data-act="closeModal">Done</button></div>`, true);
}

// ---------- offers ----------
function offerCard(o, draft) {
  const ev = E.evalTrade(o.from, o.give, o.get);
  return `<div class="offer"><div class="offerh">${badge(o.from, 1)}<div><b>${esc(G.teams[o.from].name)}</b><div class="small muted">${esc(o.msg)}</div></div>${fairTag(ev.fair)}</div>
    <div class="offerb"><div><div class="lbl">You get</div>${assetGroup(o.get)}</div><div><div class="lbl">You send</div>${assetGroup(o.give)}</div></div>
    ${ev.issues.length ? `<div class="small bad">${esc(ev.issues[0])}</div>` : ''}
    <div class="row end"><button class="btn ghost sm" data-act="${draft ? 'declineDraft' : 'decline'}" data-id="${o.id}">Decline</button><button class="btn sm" data-act="counter" data-id="${o.id}" data-draft="${draft ? 1 : ''}">Counter</button><button class="btn sm go" data-act="${draft ? 'acceptDraft' : 'accept'}" data-id="${o.id}" ${ev.issues.length ? 'disabled' : ''}>Accept</button></div></div>`;
}
function inboxTeaser() {
  if (!tradeOpen()) return '';
  const L = G.offers || [];
  return `<button class="mobonly inboxrow" data-act="openInbox"><span class="count">${L.length}</span><span><b>Trade offer${L.length === 1 ? '' : 's'} waiting</b><span class="small muted">${L.slice(0, 3).map(o => esc(G.teams[o.from].nick)).join(', ') || 'Ask around for offers'}</span></span><span class="chev" aria-hidden="true">›</span></button><div class="card deskonly"><div class="cardh"><h3>Trade inbox</h3><span class="tag ${L.length ? 'gold' : ''}">${L.length} offer${L.length === 1 ? '' : 's'}</span></div>
    ${L.slice(0, 3).map(o => `<div class="prow" style="margin-bottom:8px">${badge(o.from, 1)}<div class="pmain"><div class="pn">${esc(G.teams[o.from].nick)}</div><div class="psub">Want ${o.give.map(id => esc(E.assetName(id))).join(', ')}</div></div></div>`).join('') || '<p class="muted">No offers yet.</p>'}
    <div class="row"><button class="btn go" data-act="openInbox">Open inbox</button><button class="btn" data-act="openMake">Make a trade</button></div></div>`;
}
function offersBlock() {
  const L = G.offers || [];
  return `<div class="card"><div class="cardh"><h3>Offers for you</h3><button class="btn ghost sm" data-act="moreOffers">Shop around</button></div>
    ${L.length ? `<div class="offers">${L.map(o => offerCard(o)).join('')}</div>` : '<p class="muted">No offers on the table. Shop around to hear from more teams.</p>'}</div>`;
}

// ---------- home by phase ----------
function renderHome() {
  const p = G.phase;
  if (p === 'preseason' || p === 'season') return homePre();
  if (p === 'deadline') return homeDeadline();
  if (p === 'playoffs') return homePlayoffs();
  if (p === 'seasondone') return homeSeasonDone();
  if (p === 'offseason') return ({progress: homeProgress, resign: homeResign, fa: homeFA, draft: homeDraft, cutdown: homeCutdown})[G.step]();
  if (p === 'final') return homeFinal();
}
function homePre() {
  const first = G.season === 2026;
  return `<section class="hero"><div><div class="kicker">${G.season} season · Week 1 ${modeTag(G.mode)}</div>
    <h2>${first ? 'You play the first half as is' : 'Your 2027 roster is set'}${helpBtn('pre')}</h2>
    <p class="lead">${first ? 'Real opening-day roster. Your first trades open at Week 9.' : 'Your last chance to make a move this season is the Week 9 deadline.'}</p></div>
    <button class="btn go lg" data-act="toDeadline">Sim to the trade deadline</button></section>
  ${injuryCard()}<div class="grid g2">${outlookCard(G.season)}<div class="card"><div class="cardh"><h3>Biggest needs</h3><button class="btn ghost sm" data-act="rview" data-k="needs">All positions</button></div>${needsList(3)}</div></div>`;
}
function homeDeadline() {
  const r = E.record(G.user, G.season);
  const last = userGames(G.season).slice(-9);
  return `<section class="hero"><div><div class="kicker">${G.season} trade deadline · after Week ${G.week}</div>
    <h2>You are ${r.w}-${r.l}. ${r.l === 0 ? 'Still perfect.' : r.w >= 6 ? 'In the hunt.' : 'Buy or sell?'}${helpBtn('deadline')}</h2>
    <p class="lead">Your one trade window this season.</p></div>
    <div class="row"><button class="btn" data-tab="trade">Open trade center</button><button class="btn go lg" data-act="simRest">Sim rest of season</button></div></section>
  <div class="grid g2">${inboxTeaser()}${injuryCard()}${outlookCard(G.season, 'live')}
    <div class="card homeneeds"><div class="cardh"><h3>Biggest needs</h3><button class="btn ghost sm" data-act="rview" data-k="needs">All positions</button></div>${needsList(3)}</div>
  </div>`;
}
function homePlayoffs() {
  const P = G.playoffs[G.season];
  const alive = !Object.prototype.hasOwnProperty.call(P.elim, G.user) || P.champ === G.user;
  const conf = G.teams[G.user].conf, seed = P.seeds[conf].indexOf(G.user) + 1;
  const f = E.userFinish(G.season);
  return `<section class="hero"><div><div class="kicker">${G.season} playoffs · ${conf} #${seed} seed</div>
    <h2>${alive ? `${f.w}-${f.l}. ${4 - P.round} wins from a title.` : esc(f.label) + '.'}${helpBtn('playoffs')}</h2>
    <p class="lead">${alive ? 'Play it one round at a time.' : 'Your season is over. Finish the bracket to see who wins it.'}</p></div>
    <div class="row"><button class="btn" data-act="poSkip">Skip to the end</button><button class="btn go lg" data-act="poNext">Play the ${esc(E.ROUND_NAMES[P.round])}</button></div></section>
  ${injuryCard()}<div class="card">${bracket()}</div>`;
}
function homeSeasonDone() {
  const f = E.userFinish(G.season), P = G.playoffs[G.season], gm = E.goalMet(G.season);
  const two = G.season === 2026;
  return `<section class="hero"><div><div class="kicker">${G.season} final</div>
    <h2>${f.w}-${f.l}. ${esc(f.label)}.</h2>
    ${confMeter()}<p class="lead">${esc(G.teams[P.champ].name)} won the Super Bowl. ${gm ? `Front office goal: ${esc(gm.goal)}. <b class="${gm.met ? 'gold' : 'bad'}">${gm.met ? 'Met' : 'Missed'}</b>.` : ''} ${f.perfect ? 'You did it. 21-0.' : two ? 'The offseason is where you build the 2027 team.' : ''}</p></div>
    <button class="btn go lg" data-act="${two ? 'offseason' : 'final'}">${two ? 'Start the 2027 offseason' : 'See final results'}</button></section>
  ${P.champ === G.user ? `<div class="champbanner"><span class="kicker">Super Bowl champions</span><b>${esc(G.teams[G.user].name)}</b><span class="small muted">${f.perfect ? 'And nobody beat them. 21-0.' : `${f.w}-${f.l}, ${G.season}`}</span></div>` : ''}
  ${awardsCard(G.season)}
  <div class="card" style="margin-top:14px">${bracket()}</div>`;
}
function stepper(i) {
  const L = ['Progression', 'Re-sign', 'Free agency', 'Draft', 'Final roster'];
  return `<ol class="stepper">${L.map((l, j) => `<li class="${j < i ? 'done' : j === i ? 'on' : ''}"><span>${j + 1}</span>${l}</li>`).join('')}</ol>`;
}
function homeProgress() {
  const up = G.prog.filter(x => !x.ret), ret = G.prog.filter(x => x.ret);
  return `${stepper(0)}<section class="hero"><div><h2>A year older${helpBtn('progress')}</h2>
    <p class="lead">Ratings changed. Next, decide who to keep.</p></div>
    <button class="btn go lg" data-act="toResign">Next: re-sign your players</button></section>
  <div class="grid g2"><div class="card"><h3>Your roster changes</h3><div class="plist">
  ${up.slice(0, 24).map(x => { const p = G.players[x.id]; return `<div class="prow">${face(p || {n: x.n, id: x.id}, 'sm')}<div class="pmain"><div class="pn">${p ? pname(p) : esc(x.n)}</div><div class="psub">${x.pos} · ${x.old} → ${x.now} · ${esc(x.why || '')}</div></div><span class="tag ${x.now > x.old ? 'good' : x.now < x.old ? 'bad' : ''}">${x.now > x.old ? '+' : ''}${x.now - x.old}</span></div>`; }).join('')}
  ${ret.map(x => `<div class="prow">${face({n: x.n, id: x.id}, 'sm')}<div class="pmain"><div class="pn">${esc(x.n)}</div><div class="psub">${x.pos}</div></div><span class="tag bad">Retired</span></div>`).join('')}</div></div>
  ${offersBlock()}</div>`;
}
// Unsigned players from the re-sign list: the starters among them, what they would cost, and what losing them costs in wins.
function pendingResign() {
  const d = E.depth(G.user);
  const isStarter = p => { const i = d[p.pos].indexOf(p); return i > -1 && i < E.STARTERS[p.pos]; };
  const list = Object.keys(G.resign || {}).filter(id => G.players[id] && !G.resign[id].done).map(id => G.players[id]);
  const starters = list.filter(isStarter).sort((a, b) => b.ovr - a.ovr);
  const cost = starters.reduce((a, p) => a + E.resignPrice(p, E.yearsFor(p)), 0);
  const wins = starters.length ? -E.winsDelta(G.user, [], starters.map(p => p.id)) : 0;
  let room = E.capSpace(G.user); const fits = starters.filter(p => { const c = E.resignPrice(p, E.yearsFor(p)); if (c <= room) { room -= c; return true; } return false; });
  return {all: list, starters, cost, wins, fits, fitCost: fits.reduce((a, p) => a + E.resignPrice(p, E.yearsFor(p)), 0)};
}
// Release players under contract to free cap room for the players you want to keep
function capRoomSheet() {
  const d = E.depth(G.user), isStarter = p => { const i = d[p.pos].indexOf(p); return i > -1 && i < E.STARTERS[p.pos]; };
  const L = E.roster(G.user).filter(p => p.end >= G.season && p.cap > 1.2).map(p => ({p, c: E.cutCost(p), v: E.playerValue(p)}))
    .filter(x => x.c.save >= .5).sort((a, b) => a.v / a.c.save - b.v / b.c.save).slice(0, 12);
  const R = pendingResign();
  modal(`<div class="sheeth"><div><div class="kicker">Cap space ${money(E.capSpace(G.user))}${R.starters.length ? ` · keeping your unsigned starters costs ${money(R.cost)}` : ''}</div><h3>Make cap room</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <p class="small muted">Release players under contract to free money for re-signing. Cutting someone with years left leaves dead money. Best savings for the least talent first.</p>
    <div class="plist">${L.map(({p, c}) => `<div class="trow">${pRow(p, `${isStarter(p) ? '<b>Starter</b> · ' : ''}saves ${money(c.save)}${c.dead ? ` · ${money(c.dead)} dead` : ''}`)}<button class="btn sm" data-act="cutNow" data-id="${p.id}">Cut</button></div>`).join('') || '<p class="muted">Nobody to cut who would free real money.</p>'}</div>
    <div class="row end"><button class="btn go" data-act="closeModal">Done</button></div>`, true);
}
function leaveResignSheet() {
  const R = pendingResign();
  modal(`<div class="sheeth"><div><div class="kicker">Before free agency</div><h3>${R.starters.length} starter${R.starters.length > 1 ? 's' : ''} will leave</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <p>Their contracts are up. If you move on now, they become free agents and other teams can sign them. That costs you about <b class="bad">${R.wins.toFixed(1)} wins</b> next season.</p>
    <div class="plist">${R.starters.map(p => `<div class="trow">${pRow(p, `Starter · asks ${money(E.resignPrice(p, E.yearsFor(p)))} × ${E.yearsFor(p)} yr`)}</div>`).join('')}</div>
    ${R.fits.length < R.starters.length ? `<p class="small warn">${R.fits.length ? `You can afford ${R.fits.length} of them at their asking price.` : 'None of them fit under your cap at their asking price.'} Negotiate for less, or <button class="linkbtn" data-act="capRoom">make cap room</button>.</p>` : ''}
    <div class="row end">${R.fits.length ? `<button class="btn ghost" data-act="toFA" data-force="1">Let them go</button><button class="btn" data-act="closeModal">Decide one by one</button><button class="btn go" data-act="resignStarters" data-then="toFA">Keep ${R.fits.length < R.starters.length ? R.fits.length : 'my'} starters · ${money(R.fitCost)}</button>` : `<button class="btn" data-act="closeModal">Negotiate</button><button class="btn go" data-act="toFA" data-force="1">Let them go</button>`}</div>`, true);
}
function homeResign() {
  const ids = Object.keys(G.resign).filter(id => G.players[id]);
  const list = ids.map(id => ({p: G.players[id], r: G.resign[id]})).sort((a, b) => b.p.ovr - a.p.ovr);
  const pending = list.filter(x => !x.r.done);
  const d = E.depth(G.user);
  const starter = p => d[p.pos].indexOf(p) > -1 && d[p.pos].indexOf(p) < E.STARTERS[p.pos];
  return `${stepper(1)}<section class="hero"><div><h2>Expiring contracts${helpBtn('resign')}</h2>
    <p class="lead">Keep who you want. Anyone left goes to free agency. You have ${money(E.capSpace(G.user))} free.</p></div>
    <div class="row"><button class="btn ghost" data-act="capRoom">Make cap room</button><button class="btn ${pendingResign().starters.length ? '' : 'go lg'}" data-act="toFA">Next: free agency</button></div></section>
  ${(() => { const R = pendingResign(); return R.starters.length ? `<div class="card resignwarn"><div><b>${R.starters.length} of your starters ${R.starters.length > 1 ? 'are' : 'is'} unsigned.</b><span class="small muted">Anyone you do not re-sign leaves when you move on. Losing them costs about ${R.wins.toFixed(1)} wins.</span></div>${R.fits.length ? `<button class="btn go" data-act="resignStarters">Keep ${R.fits.length < R.starters.length ? R.fits.length : 'my'} starters · ${money(R.fitCost)}</button>` : '<span class="small warn">Over your cap at their asking prices.</span>'}<button class="btn" data-act="capRoom">Make cap room</button></div>` : pending.length ? '' : '<div class="card resignwarn ok"><b>Your starters are signed.</b></div>'; })()}
  <div class="card"><div class="plist">${(UI.rsAll ? list : list.filter(({p, r}) => r.done || starter(p) || p.ovr >= 72)).map(({p, r}) => `<div class="trow ${r.done === 'signed' ? 'sel' : ''}" ${r.done ? '' : `data-act="negOpen" data-id="${p.id}"`}>${pRow(p, `${starter(p) ? '<b>Starter</b> · ' : ''}${r.done ? money(r.ask) + ' × ' + r.yrs + ' yr' : 'wants ' + E.yearsFor(p) + ' yr'}`)}
    ${r.done ? `<span class="tag ${r.done === 'signed' ? 'good' : 'bad'}">${r.done === 'signed' ? 'Re-signed' : 'Let go'}</span>` : `<div class="row nowrap"><span class="chev deskonly-inline" aria-hidden="true">›</span><button class="btn sm go" data-act="resign" data-id="${p.id}">Pay ${money(E.resignPrice(p, E.yearsFor(p)))} × ${E.yearsFor(p)}</button></div>`}</div>`).join('') || '<p class="muted">No expiring contracts.</p>'}${list.some(({p, r}) => !(r.done || starter(p) || p.ovr >= 72)) ? `<button class="btn ghost sm showall" data-act="rsAll">${UI.rsAll ? 'Show fewer' : `Show ${list.filter(({p, r}) => !(r.done || starter(p) || p.ovr >= 72)).length} depth players`}</button>` : ''}</div></div>`;
}
const verdictTag = v => v ? `<span class="tag ${v === 'Steal' ? 'good' : v === 'Bust' ? 'bad' : ''}">${v}</span>` : '';
const myClass = () => (G.draft ? G.draft.order : []).filter(o => o.sel && o.owner === G.user);
function prospectModal(rank) {
  const p = G.draft.pool.find(x => x.rank === rank); if (!p) return;
  const slot = G.draft.order[G.draft.at], onClock = slot && slot.owner === G.user;
  const st = E.depth(G.user)[p.pos][Math.max(0, E.STARTERS[p.pos] - 1)];
  const scale = v => Math.max(0, Math.min(100, (v - 45) / 50 * 100));
  modal(`<div class="pchead">${face({n: p.n, id: 'pros-' + p.rank, tm: G.user}, 'xl')}<div class="pcmid"><div class="kicker">${p.pos} · ${esc(p.sch)} · big board #${p.rank}</div><h3>${esc(p.n)}</h3><span class="tag">${p.round} talent</span></div>
      <div class="pcovr"><b class="${oc(p.hi)}">${p.lo}–${p.hi}</b><span>PROJECTED</span></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="ratingrow">
      <div class="rh"><span class="kicker" style="color:var(--muted)">Height</span><b>${p.ht}</b></div>
      <div class="rh"><span class="kicker" style="color:var(--muted)">Weight</span><b>${p.wt}</b><span class="small muted">lb</span></div>
      <div class="rh"><span class="kicker" style="color:var(--muted)">40-yard</span><b>${p.forty.toFixed(2)}</b><span class="small muted">sec</span></div>
      <div class="rh"><span class="kicker" style="color:var(--muted)">Potential</span><b class="${p.potGrade === 'High' ? 'good' : p.potGrade === 'Medium' ? 'gold' : ''}">${p.potGrade}</b></div>
    </div>
    <h4 class="sub">Scouting report</h4>
    <div class="seeline"><span class="good">✓</span>Strength: ${esc(p.traits[0].toLowerCase())}</div>
    <div class="seeline"><span class="good">✓</span>Strength: ${esc(p.traits[1].toLowerCase())}</div>
    <div class="seeline"><span class="bad">✗</span>Needs work: ${esc(p.weak.toLowerCase())}</div>
    <h4 class="sub">Projected overall</h4>
    <div class="rbar projbar"><i style="left:${scale(p.lo)}%;right:${100 - scale(p.hi)}%"></i>${st ? `<em style="left:${scale(st.ovr)}%" title="Your starter"></em>` : ''}</div>
    <div class="rlab small"><span>45</span><span>${st ? `Your ${p.pos} starter: ${esc(st.n)} ${st.ovr}` : `You have no ${p.pos} starter`}</span><span>95</span></div>
    <p class="small muted">Scouts can be wrong. His real overall shows the moment he is drafted. Some picks land outside the range, mostly early ones where scouts commit to a tight range.</p>
    <div class="row end"><button class="btn" data-act="closeModal">Close</button>${onClock ? `<button class="btn go" data-act="draftP" data-rank="${p.rank}">Draft ${esc(lastName(p.n))}</button>` : ''}</div>`, true);
}
function fillPopup(list, kicker) {
  popup(kicker, `${list.length} minimum-salary signing${list.length > 1 ? 's' : ''}`, `<p class="small muted">Open roster spots went to the best leftover free agents on 1-year, $1.1M deals. Thin positions came first, then your biggest needs.</p>${list.map(x => { const p = G.players[x.id]; return `<div class="prow resrow">${face(p || {n: x.n, id: x.id}, 'sm')}<div class="pmain"><div class="pn">${p ? pname(p) : esc(x.n)}</div><div class="psub">${x.pos} · $1.1M × 1 yr</div></div><span class="ovrb sm ${oc(x.ovr)}">${x.ovr}</span></div>`; }).join('')}`);
}
function revealPopup(sel, no) {
  const p = G.players[sel.id];
  setTimeout(() => { const b = $('.sheet .reveal b'); if (b) countUp(b, sel.lo, sel.ovr, 950, v => { sfx('tick'); return v + ' OVR'; }); }, 60);
  setTimeout(() => sfx('stamp'), 1050);
  popup(`Pick #${no}`, `${esc(sel.n)} is a ${esc(G.teams[G.user].nick)}`, `<div class="signhero">${face(p || {n: sel.n, id: sel.id}, 'xl')}<div><div class="kicker">${sel.pos} · ${esc(sel.sch)}</div>
    <div class="reveal"><span class="small muted">Scouts said ${sel.lo}–${sel.hi}</span><b class="${oc(sel.ovr)}">${sel.ovr} OVR</b></div>${verdictTag(sel.verdict)}
    <div class="small muted" style="margin-top:6px">${sel.verdict === 'Steal' ? 'Better than anyone projected.' : sel.verdict === 'Bust' ? 'Below what the scouts saw. Potential can still bring him along.' : 'Right where the scouts had him.'}</div></div></div>`, sel.verdict === 'Bust' ? 'loss' : 'win');
}
function draftRecap() {
  const mine = myClass(), all = G.draft.order.filter(o => o.sel && o.sel.ovr != null);
  const steals = all.filter(o => o.sel.verdict === 'Steal').sort((a, b) => (b.sel.ovr - b.sel.hi) - (a.sel.ovr - a.sel.hi)).slice(0, 5);
  const row = o => `<div class="prow resrow"><span class="num pickno">#${o.no}</span>${badge(o.owner, 1)}<div class="pmain"><div class="pn">${esc(o.sel.n)} <span class="muted small">${o.sel.pos}</span></div><div class="psub">Scouts ${o.sel.lo}–${o.sel.hi}</div></div><span class="ovrb sm ${oc(o.sel.ovr)}">${o.sel.ovr}</span>${verdictTag(o.sel.verdict)}</div>`;
  const avg = mine.length ? Math.round(mine.reduce((a, o) => a + o.sel.ovr, 0) / mine.length) : 0;
  popup('Draft complete', mine.length ? `Your class averages ${avg} OVR` : 'You had no picks', `${mine.length ? `<h4 class="sub">Your picks</h4>${mine.map(row).join('')}` : ''}${steals.length ? `<h4 class="sub">Steals of the draft</h4>${steals.map(row).join('')}` : ''}`);
}
function homeDraft() {
  G.draft.pool.forEach(p => { if (p.lo == null) E.scoutProspect(p); });
  const D = G.draft, slot = D.order[D.at];
  const onClock = slot && slot.owner === G.user;
  const mine = D.order.filter(o => o.owner === G.user && !o.sel);
  const recent = D.order.slice(Math.max(0, D.at - 10), D.at).reverse();
  const tr = E.teamRating(G.user);
  const offers = onClock && tradeOpen() ? E.draftOffers() : [];
  const ahead = tradeOpen() ? D.order.slice(D.at, D.at + 8).filter(o => o.owner !== G.user && o.pickId) : [];
  return `${stepper(3)}<section class="hero"><div><h2>${slot ? `Pick ${slot.no}: ${onClock ? 'you are on the clock' : esc(tname(slot.owner)) + ' are up'}` : 'Draft complete'}${helpBtn('draft')}</h2>
    <p class="lead">Your picks: ${mine.map(o => '#' + o.no).join(', ') || 'none left'}.</p></div>
    <div class="row">${slot && !onClock ? `<button class="btn" data-act="toMyPick">Sim to my pick</button>` : ''}<button class="btn ${slot ? '' : 'go lg'}" data-act="finishDraft">${slot ? 'Auto-draft the rest' : 'Next: final roster'}</button></div></section>
  ${offers.length ? `<button class="mobonly inboxrow" data-act="draftCalls"><span class="count">${offers.length}</span><span><b>Teams want your pick</b><span class="small muted">${offers.map(o => esc(G.teams[o.from].nick)).join(', ')}</span></span><span class="chev" aria-hidden="true">›</span></button>` : ''}
  <div class="mobonly card mboard">${D.pool.slice(0, 40).map(p => `<div class="mbrow"><span class="num pickno">${p.rank}</span><div class="pmain" data-act="prospect" data-rank="${p.rank}"><div class="pn">${esc(p.n)}</div><div class="psub">${p.pos} · ${esc(p.sch)} · <span class="${p.potGrade === 'High' ? 'good' : p.potGrade === 'Medium' ? 'gold' : ''}">${p.potGrade} potential</span></div></div><span class="projr">${p.lo}–${p.hi}</span>${onClock ? `<button class="btn sm go" data-act="draftP" data-rank="${p.rank}">Draft</button>` : ''}</div>`).join('')}</div>
  ${offers.length ? `<div class="card deskonly" style="margin-bottom:14px"><div class="cardh"><h3>Draft-day calls</h3><span class="small muted">Teams want your pick</span></div><div class="offers">${offers.filter(o => !(UI.declined || []).includes(o.id)).map(o => offerCard(o, true)).join('')}</div></div>` : ''}
  <div class="grid fa-grid">
  <div class="card deskonly"><div class="cardh"><h3>Big board</h3><span class="small muted">Projected OVR is the scouts' range. The real number shows when he is drafted.</span></div><div class="tw"><table class="tbl"><thead><tr><th>Rank</th><th>Player</th><th>Pos</th><th>School</th><th>Projected</th><th>Potential</th><th>Your starter</th><th></th></tr></thead><tbody>
  ${D.pool.slice(0, 40).map(p => { const st = tr.d[p.pos] && tr.d[p.pos][Math.max(0, E.STARTERS[p.pos] - 1)]; const fits = !st || p.hi > st.ovr; return `<tr><td class="num">${p.rank}</td><td><button class="pname" data-act="prospect" data-rank="${p.rank}">${esc(p.n)}</button></td><td>${p.pos}</td><td class="muted">${esc(p.sch)}</td>
  <td class="num"><span class="projr ${fits ? 'gold' : ''}">${p.lo}–${p.hi}</span></td><td><span class="tag ${p.potGrade === 'High' ? 'good' : p.potGrade === 'Medium' ? 'gold' : ''}">${p.potGrade}</span></td><td class="small">${st ? `<span class="${oc(st.ovr)}">${st.ovr}</span> ${esc(lastName(st.n))}` : '<span class="tag bad">Need</span>'}</td>
  <td>${onClock ? `<button class="btn sm go" data-act="draftP" data-rank="${p.rank}">Draft</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>
  <div class="grid"><div class="card"><h3>On the clock next</h3>${ahead.map(o => `<div class="trow"><div class="prow"><span class="num pickno">#${o.no}</span>${badge(o.owner, 1)}<div class="pmain"><div class="pn">${esc(tname(o.owner))}</div></div></div><button class="btn sm" data-act="tradeUp" data-id="${o.pickId}">Trade up</button></div>`).join('') || '<p class="muted small">No picks to trade for right now.</p>'}</div>
  <div class="card"><h3>Latest picks</h3>${recent.map(o => `<div class="prow ${o.owner === G.user ? 'me' : ''}"><span class="num pickno">#${o.no}</span>${badge(o.owner, 1)}<div class="pmain"><div class="pn">${esc(o.sel.n)}</div><div class="psub">${o.sel.pos} · ${esc(o.sel.sch)}${o.sel.lo != null ? ` · scouts ${o.sel.lo}–${o.sel.hi}` : ''}</div></div>${o.sel.ovr != null ? `<span class="ovrb sm ${oc(o.sel.ovr)}">${o.sel.ovr}</span>${verdictTag(o.sel.verdict)}` : ''}</div>`).join('') || '<p class="muted small">On the clock.</p>'}</div>
  ${myClass().length ? `<div class="card"><h3>Your class</h3>${myClass().map(o => `<div class="prow"><span class="num pickno">#${o.no}</span>${face(G.players[o.sel.id] || {n: o.sel.n, id: o.sel.id}, 'sm')}<div class="pmain"><div class="pn">${G.players[o.sel.id] ? pname(G.players[o.sel.id]) : esc(o.sel.n)}</div><div class="psub">${o.sel.pos} · scouts ${o.sel.lo}–${o.sel.hi}</div></div><span class="ovrb sm ${oc(o.sel.ovr)}">${o.sel.ovr}</span>${verdictTag(o.sel.verdict)}</div>`).join('')}</div>` : ''}</div></div>`;
}
function homeCutdown() {
  const issues = E.userReady();
  if (!UI.cutSel) UI.cutSel = E.cutPlan();
  UI.cutSel = UI.cutSel.filter(id => G.players[id] && G.players[id].tm === G.user);
  const ros = E.roster(G.user), cap = G.cap[2027];
  const sel = UI.cutSel.map(id => G.players[id]);
  const save = sel.reduce((s, p) => s + E.cutCost(p).save, 0), dead = sel.reduce((s, p) => s + E.cutCost(p).dead, 0);
  const after = ros.length - sel.length, spaceAfter = cap - E.payroll(G.user) + save;
  const d = E.depth(G.user);
  const starters = new Set(E.POS_ORDER.flatMap(pos => d[pos].slice(0, E.STARTERS[pos]).map(p => p.id)));
  const others = ros.filter(p => !UI.cutSel.includes(p.id)).sort((a, b) => (starters.has(a.id) - starters.has(b.id)) || E.playerValue(a) - E.playerValue(b));
  const row = (p, on) => { const c = E.cutCost(p); return `<label class="trow cut ${on ? 'sel' : ''}"><input type="checkbox" data-cut="${p.id}" ${on ? 'checked' : ''}>${pRow(p, `${starters.has(p.id) ? '<b>Starter</b> · ' : ''}saves ${money(c.save)}${c.dead ? ` · ${money(c.dead)} dead` : ''}`)}</label>`; };
  return `${stepper(4)}<section class="hero"><div><h2>Final roster${helpBtn('cutdown')}</h2>
    <p class="lead">Get to ${E.ROSTER_MAX} players and under the cap. Suggested cuts are ready.</p></div>
    <button class="btn go lg" data-act="startS2" ${issues.length ? 'disabled' : ''}>Start the 2027 season</button></section>
  <div class="cutbar card"><div class="kpis">
    <div><b class="num ${ros.length > 53 ? 'bad' : ''}">${ros.length}</b><span>On roster now</span></div>
    <div><b class="num ${after > 53 ? 'bad' : 'good'}">${after}</b><span>After these cuts</span></div>
    <div><b class="num ${spaceAfter < 0 ? 'bad' : 'good'}">${money(spaceAfter)}</b><span>Cap space after</span></div>
    <div><b class="num">${money(dead)}</b><span>New dead money</span></div></div>
    <div class="row end">${ros.length < 53 ? `<button class="btn" data-act="fillRoster">Fill ${53 - ros.length} open spot${53 - ros.length > 1 ? 's' : ''} at the minimum</button>` : ''}<button class="btn ghost" data-act="cutAuto">Suggest again</button><button class="btn go" data-act="cutApply" ${sel.length ? '' : 'disabled'}>Release ${sel.length} player${sel.length === 1 ? '' : 's'}</button></div>
    ${issues.length ? `<div class="small bad">${issues.map(esc).join(' ')}</div>` : (E.roster(G.user).length < E.ROSTER_MAX ? `<div class="small warn">You have ${E.roster(G.user).length} players. Tap Fill open spots, or the other ${E.ROSTER_MAX - E.roster(G.user).length} spots fill with minimum-salary players when the season starts.</div>` : '<div class="small good">Roster is set at 53. You can start the season.</div>')}</div>
  <div class="grid g2"><div class="card"><h3>Release list</h3><div class="plist">${sel.map(p => row(p, true)).join('') || '<p class="muted">Nobody selected.</p>'}</div></div>
  <div class="card"><h3>Everyone else</h3><div class="plist scroll">${others.map(p => row(p, false)).join('')}</div></div></div>`;
}

// ---------- roster: lineup, depth, needs, stats ----------
const OFF_ROWS = [[['WR', 0], ['OT', 0], ['IOL', 0], ['IOL', 1], ['IOL', 2], ['OT', 1], ['TE', 0], ['WR', 1]], [['WR', 2], ['QB', 0]], [['RB', 0]]];
const DEF_ROWS = [[['S', 0], ['S', 1]], [['CB', 0], ['LB', 0], ['LB', 1], ['CB', 1]], [['CB', 2], ['EDGE', 0], ['DT', 0], ['DT', 1], ['EDGE', 1]]];
function slotChip(d, pos, i, needs) {
  const p = d[pos][i];
  const n = needs.find(x => x.pos === pos);
  const lab = E.STARTERS[pos] > 1 ? pos + (i + 1) : pos;
  if (!p) return `<button class="slot empty" data-act="depthPos" data-pos="${pos}"><span class="slab">${lab}</span><span class="sname">Empty</span></button>`;
  return `<button class="slot ${n && n.level === 'High' ? 'weak' : ''}" data-act="depthPos" data-pos="${pos}" aria-label="${lab}: ${esc(p.n)}, ${p.ovr} overall">${face(p)}<span class="sovr ${oc(p.ovr)}">${p.ovr}</span>${E.formLabel(p) ? `<span class="sform ${E.formOf(p) > 0 ? 'up' : 'down'}" title="${E.formLabel(p)}">${E.formOf(p) > 0 ? '▲' : '▼'}</span>` : ''}<span class="sname">${esc(lastName(p.n))}</span><span class="slab">${lab}</span></button>`;
}
function lineupView() {
  const d = E.depth(G.user), needs = E.teamNeeds(), tr = E.teamRating(G.user);
  const field = (title, rows, sub) => `<div class="card fieldcard"><div class="cardh"><h3>${title}</h3><span class="tag">${sub}</span></div>
    <div class="field">${rows.map(r => `<div class="frow">${r.map(([pos, i]) => slotChip(d, pos, i, needs)).join('')}</div>`).join('')}</div></div>`;
  const order = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P'];
  const mob = `<div class="mobonly card mdepth">${order.map(pos => { const L = d[pos], n = E.STARTERS[pos], nd = needs.find(x => x.pos === pos); return `<button class="mrow" data-act="depthPos" data-pos="${pos}"><span class="dpos">${pos}${nd ? `<i class="g${RANK_LETTER(nd.rank)}">${RANK_LETTER(nd.rank)}</i>` : ''}</span><span class="mfaces">${L.slice(0, n).map(p => `<span class="mp">${face(p, 'sm')}<span><b class="${oc(p.ovr)}">${p.ovr}</b> ${esc(lastName(p.n))}</span></span>`).join('') || '<span class="bad small">Empty</span>'}</span><span class="chev" aria-hidden="true">›</span></button>`; }).join('')}</div>`;
  return `${mob}<div class="deskonly"><p class="hint">Tap a player to change the depth chart at that spot. Red rings mark a high-need position.</p>
    <div class="grid">${field('Offense', OFF_ROWS, `${tr.off} OVR`)}${field('Defense', DEF_ROWS, `${tr.def} OVR`)}</div>
    <div class="card" style="margin-top:14px"><div class="cardh"><h3>Specialists</h3></div><div class="frow left">${slotChip(d, 'K', 0, needs)}${slotChip(d, 'P', 0, needs)}</div></div></div>`;
}
function depthModal(pos) {
  const L = E.depth(G.user)[pos];
  const n = E.STARTERS[pos];
  modal(`<div class="sheeth"><div><div class="kicker">Depth chart</div><h3>${pos}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <p class="small muted">The top ${n} start. Move a player up to start him over a higher-rated one.</p>
    <div class="plist">${L.map((p, i) => `<div class="trow ${i < n ? 'sel' : ''}"><span class="num pickno">${i + 1}</span>${pRow(p, i < n ? '<b>Starter</b>' : 'Backup')}
      <div class="row nowrap"><button class="btn icon sm" data-act="depthMove" data-pos="${pos}" data-id="${p.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(p.n)} up">↑</button><button class="btn icon sm" data-act="depthMove" data-pos="${pos}" data-id="${p.id}" data-d="1" ${i === L.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(p.n)} down">↓</button></div></div>`).join('')}</div>
    <div class="row end"><button class="btn ghost" data-act="depthReset" data-pos="${pos}">Sort by OVR</button><button class="btn" data-act="needPos" data-pos="${pos}">Find an upgrade</button><button class="btn go" data-act="closeModal">Done</button></div>`, true);
}
function statsView() {
  const ros = E.roster(G.user);
  const cut = false;
  const opts = seasonsFor({pos: 'QB', id: ''}).map(x => [x.key, x.label]);
  if (!UI.statKey || !opts.some(o => o[0] === UI.statKey)) UI.statKey = defaultStatKey();
  const shown = GROUPS.filter(g => UI.rosterPos === 'ALL' || g[0] === UI.rosterPos);
  const table = ([gk, label, poss, sch]) => {
    const cols = COLS[sch], rows = [];
    for (const pos of poss) E.depth(G.user)[pos].concat(ros.filter(p => p.pos === pos && p.inj)).forEach((p, i) => {
      const s = (seasonsFor(p).find(x => x.key === UI.statKey) || {}).s || {};
      const starter = i < E.STARTERS[pos] && !p.inj;
      rows.push(`<tr class="${starter ? 'st' : ''}"><td class="muted">${starter ? `<b>${pos}${E.STARTERS[pos] > 1 ? i + 1 : ''}</b>` : pos}</td>
        <td class="pcell"><div class="row nowrap">${face(p, 'xs')}${pname(p)}${injTag(p)}${formTag(p)}</div></td>
        <td class="num">${Math.floor(p.age)}</td><td><span class="ovrb sm ${oc(p.ovr)}">${p.ovr}</span></td><td class="num">${money(p.cap)}</td><td class="num">${p.end}</td>
        <td class="num muted">${Math.round(E.playerValue(p))}</td>${cols.map(([k]) => `<td class="num scol">${fmtStat(s[k])}</td>`).join('')}</tr>`);
    });
    return `<div class="card"><div class="cardh"><h3>${label}</h3><span class="small muted">${rows.length}</span></div><div class="tw"><table class="tbl rtable"><thead><tr><th>Spot</th><th>Player</th><th>Age</th><th>OVR</th><th>Cap</th><th>Thru</th><th>Value</th>
      ${cols.map(([, l], i) => `<th class="num scol${i === 0 ? ' sfirst' : ''}">${l}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`;
  };
  return `<div class="toolbar"><div class="chips">${[['ALL', 'All'], ...GROUPS.map(g => [g[0], g[0] === 'REC' ? 'WR/TE' : g[0] === 'ST' ? 'K/P' : g[0]])].map(([k, l]) => `<button class="chip ${UI.rosterPos === k ? 'on' : ''}" data-act="rpos" data-k="${k}">${l}</button>`).join('')}</div>
    ${dd('statKey', opts.map(([k, l]) => ({v: k, label: l, sub: k[0] === 's' ? 'Simulated season' : 'Real NFL stats'})), UI.statKey)}</div>
    <div class="grid">${shown.map(table).join('')}</div>`;
}
function renderRoster() {
  const ros = E.roster(G.user);
  const views = [['lineup', 'Lineup'], ['needs', 'Needs'], ['stats', 'Stats']];
  const body = UI.rview === 'needs' ? `<div class="card">${needsList()}</div>` : UI.rview === 'stats' ? statsView() : lineupView();
  return `<section class="hero tight"><div><div class="kicker">${esc(G.teams[G.user].name)} · ${ros.length} players</div><h2>Roster</h2></div>${seg('rview', views, UI.rview)}</section>${body}`;
}

// ---------- player card ----------
const winsTxt = d => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} win${Math.abs(d) >= .95 && Math.abs(d) < 1.05 ? '' : 's'}`;
function winsBlock(p) {
  if (!G.teams[G.user] || p.pos === 'P') return '';
  const mine = p.tm === G.user, d = mine ? -E.winsDelta(G.user, [], [p.id]) : E.winsDelta(G.user, [p.id], []);
  const label = Math.abs(d) < .05 ? (mine ? 'Not starting' : 'Would not start') : winsTxt(d);
  return `<div class="rh"><span class="kicker" style="color:var(--muted)">${mine ? 'Worth to you' : 'For your team'}</span><b class="${d >= .05 ? 'good' : ''}">${label}</b><span class="small muted">A season, vs an average team</span></div>`;
}
const WANTS = [['any', 'Either'], ['picks', 'Picks'], ['players', 'Players']];
function wantPicker(act, want) {
  return `<div class="wantrow"><span class="small muted">What you want back</span><div class="seg" role="group">${WANTS.map(([k, l]) => `<button class="${k === want ? 'on' : ''}" data-act="${act}" data-k="${k}" aria-pressed="${k === want}">${l}</button>`).join('')}</div></div>`;
}
function playerCard(id) {
  const p = G.players[id];
  if (!p) return '<p class="muted">This player is no longer in the league.</p>';
  const cols = COLS[SCHEMA[p.pos]];
  const V = E.valueParts(p);
  const tm = G.teams[p.tm];
  const yrsLeft = Math.max(0, p.end - G.season + 1);
  const R = tm ? E.valueRange(p) : null;
  const found = UI.found && UI.found.id === id ? UI.found : null;
  const cf = V.steps.find(x => x.k === 'Status and cost');
  return `<div class="pchead">${face(p, 'xl')}<div class="pcmid"><div class="kicker">${p.pos} · ${tm ? esc(tm.name) : 'Free agent'}</div><h3>${esc(p.n)}</h3>
      <div class="pchips">${p.prod >= 0 ? `<span class="tag ${p.prod >= 75 ? 'good' : p.prod <= 30 ? 'bad' : ''}">Production ${ordinalJ(p.prod)} pct</span>` : '<span class="tag">No NFL stats yet</span>'}<span class="tag ${p.hype >= 70 ? 'gold' : ''}">Hype ${p.hype}</span>${cf ? `<span class="tag">${esc(cf.note.split('.')[0])}</span>` : ''}</div>
      <div class="small muted">Age ${Math.floor(p.age)} · ${p.tm === 'FA' ? `asks ${money(p.ask || E.market(p))}` : `${money(p.cap)} per year through ${p.end} (${yrsLeft} yr left)`}${p.draft ? ` · drafted #${p.draft}` : ''}</div></div>
      <div class="pcovr ${oc(p.ovr)}"><b>${p.ovr}</b><span>OVR</span></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="ratingrow">
      ${(p.hist || []).map((h, i) => `<div class="rh"><span class="kicker" style="color:var(--muted)">${h[0]}${i === 0 ? ' start' : ''}</span><b class="${oc(h[1])}">${h[1]}</b><span class="small muted">${esc(i ? h[2] : 'Week 1')}</span></div>`).join('<span class="rarrow">→</span>')}
      ${winsBlock(p)}<div class="rh"><span class="kicker" style="color:var(--muted)">Track record</span><b class="${oc(p.prior || p.ovr)}">${p.prior || p.ovr}</b><span class="small muted">Last 4 seasons</span></div>
      ${p.age <= 27 ? `<div class="rh"><span class="kicker" style="color:var(--muted)">Potential</span><b class="${(p.pot || p.ovr) - p.ovr >= 8 ? 'good' : (p.pot || p.ovr) - p.ovr >= 4 ? 'gold' : ''}">${(p.pot || p.ovr) - p.ovr >= 8 ? 'High' : (p.pot || p.ovr) - p.ovr >= 4 ? 'Medium' : 'Low'}</b><span class="small muted">${esc(p.potWhy || "Scouts' read")}</span></div>` : ''}
      ${E.formLabel(p) ? `<div class="rh"><span class="kicker" style="color:var(--muted)">This season</span><b class="${E.formOf(p) > 0 ? 'good' : 'bad'}">${E.formLabel(p)}</b><span class="small muted">Shapes next year's rating</span></div>` : ''}
    </div>
    ${p.inj ? `<p class="small bad">Injured: ${p.injW === undefined || p.injW === 99 ? 'out for the season' : `out about ${p.injW} more week${p.injW > 1 ? 's' : ''}`}.</p>` : ''}
    <h4 class="sub">Stats</h4>
    <div class="tw"><table class="tbl"><thead><tr><th>Season</th>${cols.map(([, l]) => `<th class="num">${l}</th>`).join('')}</tr></thead><tbody>
      ${seasonsFor(p).map(x => `<tr><td>${x.label}</td>${cols.map(([k]) => `<td class="num">${x.s ? fmtStat(x.s[k]) : '<span class="muted">–</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${p.draft && p.st25 ? `<p class="small muted">${esc(p.st25)}</p>` : ''}
    <details class="fold"><summary><span>Trade value <b class="num">${Math.round(V.total)}</b> <span class="small muted">≈ ${pickEquiv(V.total)} · why?</span></span></summary>
    ${R ? `<div class="range"><div class="rbar"><i style="left:${Math.min(100, R.lo.v / R.hi.v * 100)}%;right:0"></i><em style="left:${Math.min(100, R.mid / R.hi.v * 100)}%"></em></div>
      <div class="rlab small"><span>${esc(tname(R.lo.t))} ${Math.round(R.lo.v)}</span><span>Most teams ${Math.round(R.mid)}</span><span class="gold">${esc(tname(R.hi.t))} ${Math.round(R.hi.v)}</span></div>
      <p class="small muted">No two teams value him the same. Scouting, GM style, team situation, cap room, need, scarcity and injuries all move the number. Top bidders: ${R.top.map(x => esc(tname(x.t)) + ' ' + Math.round(x.v)).join(', ')}.</p></div>` : ''}
    <div class="vbreak">${['Player', 'Contract'].map(gname => `<div class="vgroup"><div class="lbl">${gname === 'Player' ? 'The player' : 'The contract'}</div>${V.steps.filter(x => (x.g || 'Market') === gname).map(x => `<div class="vrow"><span class="vk">${esc(x.k)}</span><span class="vn small muted">${esc(x.note)}</span>${x.m != null ? `<span class="vm ${x.m > 1.005 ? 'up' : x.m < .995 ? 'down' : ''}">×${x.m.toFixed(2)}</span>` : `<span class="vm base">${x.v.toFixed(1)}</span>`}</div>`).join('')}</div>`).join('')}
      <div class="vtotal"><span>League value</span><b class="num">${V.total.toFixed(1)}</b><span class="small muted">≈ ${pickEquiv(V.total)}</span></div></div></details>
    ${found ? `<h4 class="sub askedh">${p.tm === G.user ? 'Asked around the league' : 'Packages they would take'}</h4>${p.tm === G.user ? wantPicker('shopWant', UI.shopWant || 'any') : ''}${found.list.length ? found.list.map((x, i) => `<div class="offer slim"><div class="offerh">${badge(x.partner, 1)}<div><b>${esc(x.label || G.teams[x.partner].name)}</b></div>${fairTag(x.ev.fair)}</div>
        <div class="offerb"><div><div class="lbl">You get</div>${x.get.map(assetMini).join('')}</div><div><div class="lbl">You send</div>${x.give.map(assetMini).join('')}</div></div>
        <div class="row end"><button class="btn sm" data-act="loadFound" data-i="${i}">Edit in trade center</button><button class="btn sm go" data-act="proposeFound" data-i="${i}" ${x.ev.ok ? '' : 'disabled'}>Make this trade</button></div></div>`).join('') : (p.tm === G.user ? `<div class="nobite"><b>Nobody wants him right now.</b><span class="small muted">${esc(E.whyNoMarket(p.id, UI.shopWant || 'any'))}</span></div>` : '<p class="muted">Nobody found a deal that works. Try again after the next phase.</p>')}` : ''}
    <div class="row end">${tradeOpen() && tm && p.tm === G.user ? `<button class="btn" data-act="blockToggle" data-id="${esc(p.id)}">${E.blockOf().ids.includes(p.id) ? 'On your trade block ✓' : 'Add to trade block'}</button>` : ''}${tradeOpen() && tm ? `<button class="btn go" data-act="findTrades" data-id="${esc(p.id)}">${p.tm === G.user ? 'Ask around' : 'Find trades'}</button>` : ''}<button class="btn" data-act="closeModal">Close</button></div>`;
}
function openPlayer(id) { modal(playerCard(id), true); }

// ---------- trade ----------
function assetRow(id, side, P, tag) {
  const sel = (side === 'give' ? UI.give : UI.get).includes(id);
  const p = G.players[id];
  if (!p) {
    const x = G.picks.find(k => k.id === id); if (!x) return '';
    return `<div class="asset ${sel ? 'on' : ''}" data-act="toggle" data-side="${side}" data-id="${x.id}" role="button" tabindex="0" aria-pressed="${sel}">
      <span class="face sm pk" aria-hidden="true">R${x.rd}</span><div class="an"><div><b>${esc(E.pickLabel(x))}</b></div><div class="small muted">Projected #${E.pickSlot(x)}${tag ? ' · ' + tag : ''}</div></div><span class="aval num" title="Value to the ${esc(tname(P))}">${Math.round(E.pickValue(x, P))}</span></div>`;
  }
  return `<div class="asset ${sel ? 'on' : ''}" data-act="toggle" data-side="${side}" data-id="${p.id}" role="button" tabindex="0" aria-pressed="${sel}">
    ${face(p, 'sm')}<div class="an"><div><b>${esc(p.n)}</b> <span class="muted small">${p.pos} · ${Math.floor(p.age)}</span>${injTag(p)}</div><div class="small muted">${money(p.cap)} thru ${p.end}${tag ? ' · ' + tag : ''}</div></div>
    <span class="ovrb sm ${oc(p.ovr)}">${p.ovr}</span><span class="aval num" title="Value to the ${esc(tname(P))}">${Math.round(E.playerValue(p, P))}</span>${side === 'give' && p.tm === G.user ? `<button class="blk ${E.blockOf().ids.includes(p.id) ? 'on' : ''}" data-act="blockToggle" data-id="${esc(p.id)}" title="${E.blockOf().ids.includes(p.id) ? 'On your trade block. Tap to take him off.' : 'Put him on the trade block to get offers'}">${E.blockOf().ids.includes(p.id) ? 'On block' : 'Block'}</button>` : ''}<button class="ibtn" data-act="player" data-id="${esc(p.id)}" aria-label="Card for ${esc(p.n)}">i</button></div>`;
}
// The phone call: you open with an offer and keep talking until you shake on it, they hang up, or you walk away.
function talkSheet(P, typing) {
  const T = E.talkWith(P), log = T.log.slice(-10), last = T.log[T.log.length - 1];
  const nick = esc(tname(P));
  const deal = (give, get) => `<div class="talkdeal"><div><div class="lbl">You send</div>${assetGroup(give)}</div><div><div class="lbl">You get</div>${assetGroup(get)}</div></div>`;
  const bubble = (m, i) => {
    if (m.me) return m.give ? `<div class="bub me"><div class="bubt">Your offer</div>${deal(m.give, m.get)}</div>` : `<div class="bub me"><div class="bubl">${esc(m.line)}</div></div>`;
    if (typing && i === log.length - 1) return `<div class="bub them">${badge(P, 1)}<div class="typing" aria-label="${nick} are typing"><i></i><i></i><i></i></div></div>`;
    const isLast = i === log.length - 1;
    let extra = '';
    if (isLast && m.kind === 'counter') { UI.counter = {partner: P, list: m.counters}; const base = T.deal || {give: [], get: []}; extra = m.counters.map((x, j) => `<div class="talkcounter"><div class="bubt">${esc(x.label)}</div><div class="talkdeal"><div><div class="lbl">You send</div>${diffSide(x.give, base.give)}</div><div><div class="lbl">You get</div>${diffSide(x.get, base.get)}</div></div><div class="row"><button class="btn go sm" data-act="counterAccept" data-i="${j}">Accept</button><button class="btn sm" data-act="counterEdit" data-i="${j}">Tweak in the builder</button></div></div>`).join(''); }
    return `<div class="bub them ${m.kind}">${badge(P, 1)}<div><div class="bubl">${esc(m.line)}</div>${extra}</div></div>`;
  };
  const pat = Math.max(0, T.patience), over = !last || last.done || pat <= 0;
  // what you can say next
  let say = '';
  if (!typing && !over && last && !last.me) {
    const M = E.TALK_MOVES, chip = (k, label, extra) => `<button class="chip talkchip" data-act="talkMove" data-k="${k}"${extra || ''}>${esc(label)}</button>`;
    if (last.kind === 'yes') say = `<button class="btn go" data-act="talkDeal">Shake on it</button>${T.used.squeeze ? '' : chip('squeeze', M.squeeze)}`;
    else {
      const hasPlayer = T.deal && T.deal.give.some(id => G.players[id]);
      say = [chip('ask', M.ask), `<button class="chip talkchip ${UI.talkPick === 'add' ? 'on' : ''}" data-act="talkPick" data-k="add">${M.add} ▾</button>`, `<button class="chip talkchip ${UI.talkPick === 'more' ? 'on' : ''}" data-act="talkPick" data-k="more">${M.more} ▾</button>`,
        T.used.bluff ? '' : chip('bluff', M.bluff), T.used.fit || !hasPlayer ? '' : chip('fit', M.fit), T.used.final ? '' : chip('final', M.final)].join('');
      if (UI.talkPick) { const L = E.talkAssets(P, UI.talkPick); say += `<div class="talkpick"><div class="bubt">${UI.talkPick === 'add' ? 'Add from your side' : 'Ask for from theirs'}</div>${L.map(x => `<button class="chip" data-act="talkMove" data-k="${UI.talkPick}" data-id="${x.id}">+ ${esc(E.assetName(x.id))}</button>`).join('') || '<span class="small muted">Nothing left to offer.</span>'}</div>`; }
    }
  }
  modal(`<div class="sheeth"><div><div class="kicker">On the phone with the ${nick}</div><h3>${typing ? 'Waiting on their answer' : last && last.kind === 'yes' ? 'They said yes' : over ? 'They hung up' : last && last.kind === 'counter' ? 'They countered' : 'Keep talking'}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="talk">${log.map(bubble).join('')}</div>
    ${say ? `<div class="talksay">${say}</div>` : ''}
    <div class="row talkfoot"><span class="small muted">Patience <span class="pdots">${[0, 1, 2].map(k => `<i class="${k < pat ? 'on' : ''}"></i>`).join('')}</span></span><button class="btn" data-act="closeModal">${over ? 'Done' : 'Hang up'}</button></div>`, true);
  const t = $('.talk'); if (t) t.scrollTop = t.scrollHeight;
  if (!typing && last && !last.me) sfx(last.kind === 'yes' ? 'deal' : last.kind === 'counter' ? 'tap' : last.done || last.kind === 'laugh' ? 'bad' : 'tap');
  if (typing) setTimeout(() => { if ($('.talk .typing')) talkSheet(P, false); }, reducedMotion() ? 0 : 750);
}
function blockLine() {
  const B = E.blockOf();
  if (!B.ids.length) return '';
  return `<div class="blockline2"><span class="small muted">On your trade block</span>${B.ids.map(id => `<span class="bchip">${esc(lastName(G.players[id].n))}<button class="xs" data-act="blockToggle" data-id="${id}" aria-label="Take ${esc(G.players[id].n)} off the block">×</button></span>`).join('')}</div>`;
}
function renderTrade() {
  if (G.mode === 'notrades') return `<section class="hero"><div><div class="kicker">Trade center</div><h2>No trades in this run</h2><p class="lead">You picked the No trades challenge. Build through free agency, the draft and your depth chart.</p></div></section>`;
  if (!tradeOpen()) return `<section class="hero"><div><div class="kicker">Trade center</div><h2>Trades are closed</h2><p class="lead">Trades open at the Week 9 deadline each season and through the whole 2027 offseason, draft included.</p></div></section>`;
  const draftOffers = G.step === 'draft' ? E.draftOffers().filter(o => !(UI.declined || []).includes(o.id)) : [];
  const n = (G.offers || []).length + draftOffers.length;
  if (!UI.tview) UI.tview = n ? 'inbox' : 'make';
  const head = `<section class="hero tight"><div><div class="kicker">Trade center · ${G.phase === 'deadline' ? G.season + ' deadline' : G.step === 'draft' ? 'Draft day' : '2027 offseason'}</div><h2>Trades</h2></div>
    ${seg('tview', [['inbox', `Inbox${n ? ' · ' + n : ''}`], ['make', 'Make a trade']], UI.tview)}</section>`;
  if (UI.tview === 'inbox') {
    const all = [...(G.offers || []).map(o => offerCard(o)), ...draftOffers.map(o => offerCard(o, true))];
    return head + blockLine() + (all.length ? `<div class="offers">${all.join('')}</div><div class="row" style="margin-top:14px"><button class="btn ghost" data-act="moreOffers">Ask around for more offers</button></div>`
      : `<div class="card empty"><h3>No offers right now</h3><p class="muted">Teams send offers at the trade deadline and at each step of the offseason.</p><div class="row"><button class="btn" data-act="moreOffers">Ask around</button><button class="btn go" data-act="seg" data-seg="tview" data-k="make">Make a trade</button></div></div>`);
  }
  const others = E.teamList().filter(t => t !== G.user);
  const S = E.situations();
  const teamOpts = ['AFC', 'NFC'].flatMap(c => [{head: c}, ...others.filter(t => G.teams[t].conf === c).sort((x, y) => G.teams[x].div.localeCompare(G.teams[y].div) || x.localeCompare(y)).map(t => ({v: t, left: badge(t, 1), label: esc(G.teams[t].name), sub: `${rec(t)} · ${S[t].status}`}))]);
  if (!UI.partner || !others.includes(UI.partner)) {
    return head + `<div class="card pickteam"><h3>Who do you want to trade with?</h3><p class="muted">Pick a team. The players they want from you light up.</p>${dd('partner', [{v: '', label: 'Choose a team', sub: '31 teams'}, ...teamOpts], '', 'wide')}</div>`;
  }
  const P = UI.partner;
  const owns = (id, t) => (G.players[id] && G.players[id].tm === t) || G.picks.some(x => x.id === id && x.owner === t);
  UI.give = UI.give.filter(id => owns(id, G.user));
  UI.get = UI.get.filter(id => owns(id, P));
  const want = new Map(E.interestIn(P, 8).map(x => [x.p.id, x]));
  const mine = E.roster(G.user).filter(p => p.ovr >= 60 || want.has(p.id)).sort((a, b) => (want.has(b.id) - want.has(a.id)) || b.ovr - a.ovr);
  const theirs = E.roster(P).filter(p => (p.ovr >= 60 || UI.tpos) && (!UI.tpos || UI.tpos === 'ALL' || p.pos === UI.tpos)).sort((a, b) => b.ovr - a.ovr);
  const picks = t => G.picks.filter(x => x.owner === t).sort((a, b) => a.yr - b.yr || a.rd - b.rd);
  const ev = E.evalTrade(P, UI.give, UI.get);
  const ready = UI.give.length && UI.get.length;
  const mood = !UI.get.length ? 'Pick what you want from them.' : !UI.give.length ? 'Now pick what you send, or tap Ask what they want.' : ev.fleece ? 'They know that deal is too good for you.' : ev.ok ? 'They would take this deal.' : ev.issues.length && ev.ratio >= 1 ? ev.issues[0] : ev.ratio >= .85 ? 'Close. Add a little more.' : 'Not close yet.';
  const row = (id, side) => { const w = side === 'give' && want.get(id); return assetRow(id, side, P, w ? '<span class="gold">They want him</span>' : '').replace('class="asset ', `class="asset ${w ? 'wanted ' : ''}`); };
  return head + `<div class="tradetop">${dd('partner', teamOpts, P, 'wide')}<span class="small muted deskonly-inline">${S[P].status} · ${pct(S[P].po)} playoff odds · ${money(E.capSpace(P))} cap space</span></div>
  <div class="mobonly tmobseg">${seg('tmob', [['give', 'Your team' + (UI.give.length ? ' · ' + UI.give.length : '')], ['get', esc(G.teams[P].nick) + (UI.get.length ? ' · ' + UI.get.length : '')], ['panel', 'Needs']], UI.tmob || 'give')}</div>
  <div class="tradecols m-${UI.tmob || 'give'}">
    <div class="card col-give"><div class="cardh"><h3>Your team</h3><span class="row nowrap">${want.size ? `<span class="tag gold">${want.size} they want</span>` : ''}<span class="small muted">Value to them</span></span></div>${seg('tsGive', [['players', `Players`], ['picks', `Picks · ${picks(G.user).length}`]], UI.tsGive || 'players')}<div class="alist">${(UI.tsGive || 'players') === 'players' ? (UI.tAllGive ? mine : mine.slice(0, 10)).map(p => row(p.id, 'give')).join('') + (mine.length > 10 ? `<button class="btn ghost sm showall" data-act="tAll" data-k="tAllGive">${UI.tAllGive ? 'Show fewer' : `Show all ${mine.length}`}</button>` : '') : picks(G.user).map(x => row(x.id, 'give')).join('') || '<p class="small muted">No picks left.</p>'}</div></div>
    <div class="card col-get"><div class="cardh"><h3>${esc(G.teams[P].name)}</h3><span class="small muted">${UI.tpos && UI.tpos !== 'ALL' ? `<button class="chip on" data-act="tNeedPos" data-k="ALL">${UI.tpos} only ×</button>` : 'OVR · value to them'}</span></div>${seg('tsGet', [['players', 'Players'], ['picks', `Picks · ${picks(P).length}`]], UI.tsGet || 'players')}<div class="alist">${(UI.tsGet || 'players') === 'players' ? ((UI.tAllGet || (UI.tpos && UI.tpos !== 'ALL')) ? theirs : theirs.slice(0, 10)).map(p => row(p.id, 'get')).join('') + (theirs.length > 10 && !(UI.tpos && UI.tpos !== 'ALL') ? `<button class="btn ghost sm showall" data-act="tAll" data-k="tAllGet">${UI.tAllGet ? 'Show fewer' : `Show all ${theirs.length}`}</button>` : '') || `<p class="small muted">They have no ${UI.tpos} worth trading for.</p>` : picks(P).map(x => row(x.id, 'get')).join('') || '<p class="small muted">No picks left.</p>'}</div></div>
    <div class="col-panel">${teamPanel('tNeedPos', UI.tpos)}</div>
  </div>
  <button class="dockpill mobonly" data-act="dealSheet"><span class="dp-count">${UI.give.length} for ${UI.get.length}</span><span class="dp-mood ${ready ? (ev.ok ? 'good' : ev.ratio >= .85 ? 'warn' : 'bad') : ''}">${esc(mood)}</span><span class="dp-go">Review</span></button>
  <div class="dealdock card deskonly-grid"><div class="dock-sides"><div><div class="lbl">You send</div>${UI.give.length ? assetGroup(UI.give) : '<span class="small muted">Nothing yet</span>'}</div><div><div class="lbl">You get</div>${UI.get.length ? assetGroup(UI.get) : '<span class="small muted">Nothing yet</span>'}</div></div>
    <div class="dock-right"><b>${esc(mood)}</b>${ready ? `<span class="small muted">For your team: <b class="${E.winsDelta(G.user, UI.get, UI.give) >= .05 ? 'good' : E.winsDelta(G.user, UI.get, UI.give) <= -.05 ? 'bad' : ''}">${winsTxt(E.winsDelta(G.user, UI.get, UI.give))}</b> a season</span>` : ''}${ready ? `<div class="meter ${ev.ok ? 'yes' : ev.ratio >= .85 ? 'close' : ''}" role="meter" aria-valuemin="0" aria-valuemax="125" aria-valuenow="${Math.round(Math.min(1.25, ev.ratio) * 100)}" aria-label="How they feel"><i style="width:${Math.min(100, ev.ratio * 80)}%"></i></div>` : ''}
      <div class="row nowrap"><button class="btn ghost" data-act="clearTrade">Clear</button><button class="btn" data-act="balance" ${UI.get.length ? '' : 'disabled'}>Ask what they want</button><button class="btn" data-act="callTeam" ${ready ? '' : 'disabled'} title="Pitch it on the phone. They might accept, counter or laugh.">Call them</button><button class="btn go" data-act="propose" ${ready ? '' : 'disabled'}>Propose</button></div></div></div>`;
}

// ---------- league ----------
function renderLeague() {
  const views = [['standings', 'Standings'], ['schedule', 'Schedule'], ['leaders', 'Leaders'], ['awards', 'Awards'], ['moves', 'Moves'], ['resume', 'Résumé']];
  let body;
  if (UI.league === 'resume') return `<div class="mobonly lgseg">${seg('league', views, UI.league)}</div>` + renderResume();
  if (UI.league === 'schedule') body = renderSchedule();
  else if (UI.league === 'leaders') body = renderLeaders();
  else if (UI.league === 'awards') body = `<div class="grid g2">${awardsCard(2026) || '<div class="card"><p class="muted">Awards are handed out when the 2026 season ends.</p></div>'}${awardsCard(2027)}</div>`;
  else if (UI.league === 'moves') body = `<div class="grid g2"><div class="card"><h3>Your trades</h3>${G.trades.length ? G.trades.map(t => `<div class="offer slim"><div class="offerh">${badge(t.partner, 1)}<div><b>${t.season} ${esc(t.when)}</b></div></div><div class="small"><b>Got</b> ${t.got.map(esc).join(', ')}<br><span class="muted"><b>Gave</b> ${t.gave.map(esc).join(', ')}</span></div></div>`).join('') : '<p class="muted">No trades yet.</p>'}</div>
    <div class="card"><h3>League wire</h3><ul class="news">${G.news.map(n => `<li>${esc(n)}</li>`).join('') || '<li class="muted">Quiet so far.</li>'}</ul></div></div>
    <p style="margin-top:20px"><button class="btn danger" data-act="askReset">Start over with a new team</button></p>`;
  else body = G.phase === 'offseason' ? '<p class="muted">2027 has not started. Final 2026 results set the draft order.</p>' : `<div class="grid g2">${divStandings('AFC')}${divStandings('NFC')}</div>`;
  return `<section class="hero tight"><div><div class="kicker">${G.phase === 'offseason' ? 2026 : G.season}</div><h2>League</h2></div><div class="lgseg">${seg('league', views, UI.league)}</div></section>${body}`;
}

// ---------- résumé ----------
function careerList() { return Object.entries(C.runs).map(([id, r]) => Object.assign({id}, r)).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)); }
function teamCareer() {
  const out = {};
  for (const r of careerList()) {
    const o = out[r.team] = out[r.team] || {runs: 0, w: 0, l: 0, titles: 0, best: null, bestScore: -1};
    o.runs++;
    for (const s of Object.values(r.seasons || {})) { o.w += s.w; o.l += s.l; if (s.champ) o.titles++; }
    if (r.done && r.score > o.bestScore) { o.bestScore = r.score; o.best = r.grade; }
  }
  return out;
}
function careerTotals() {
  const runs = careerList();
  const seasons = runs.flatMap(r => Object.entries(r.seasons || {}).map(([yr, s]) => Object.assign({yr: +yr, team: r.team, runId: r.id, startRank: r.startRank}, s)));
  const T = {runs, seasons, w: 0, l: 0, titles: seasons.filter(s => s.champ), perfect: seasons.filter(s => s.perfect), po: seasons.filter(s => s.po).length, sb: seasons.filter(s => s.sb).length,
    done: runs.filter(r => r.done), teams: teamCareer(), goalsMet: seasons.filter(s => s.met).length, goalsSet: seasons.filter(s => s.met !== null && s.met !== undefined).length};
  seasons.forEach(s => { T.w += s.w; T.l += s.l; });
  T.avg = T.done.length ? Math.round(T.done.reduce((s, r) => s + r.score, 0) / T.done.length) : null;
  T.best = T.done.slice().sort((a, b) => b.score - a.score)[0] || null;
  const divs = new Set(Object.keys(T.teams).map(t => DATA.teams[t].div));
  const b2b = runs.some(r => r.seasons && r.seasons[2026] && r.seasons[2027] && r.seasons[2026].champ && r.seasons[2027].champ);
  T.ach = [
    ['First ring', 'Win a Super Bowl', T.titles.length >= 1, `${T.titles.length}/1`],
    ['21-0', 'Go perfect: 17-0 and 4 playoff wins', T.perfect.length >= 1, T.perfect.length ? 'Done' : 'Not yet'],
    ['Back to back', 'Win both seasons in one run', b2b, b2b ? 'Done' : 'Not yet'],
    ['Worst to first', 'Win a title with a bottom-8 roster', T.titles.some(s => s.startRank && s.startRank >= 25), 'Bottom 8 at kickoff'],
    ['Dynasty', 'Win 3 titles in your career', T.titles.length >= 3, `${Math.min(3, T.titles.length)}/3`],
    ['Architect', 'Earn an A- or better rebuild grade', T.done.some(r => r.score >= 84), T.best ? `Best ${T.best.grade}` : 'No finished runs'],
    ['Division tour', 'Run a team in all 8 divisions', divs.size >= 8, `${divs.size}/8`],
    ['Hard mode', 'Win a title in a challenge mode', runs.some(r => r.mode && r.mode !== 'standard' && Object.values(r.seasons || {}).some(x => x.champ)), 'Not yet'],
    ['Every team', 'Run all 32 franchises', Object.keys(T.teams).length >= 32, `${Object.keys(T.teams).length}/32`],
  ];
  return T;
}
function renderResume() {
  const T = careerTotals();
  const name = C.gmName || 'Your name';
  const ini = (C.gmName || 'GM').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const store = C.cloud === 'on' ? 'Saved to your account' : C.cloud === 'pending' ? 'Connecting to your account' : C.cloud === 'slow' ? 'Your account is slow to answer. Showing this device for now.' : 'Saved on this device only';
  const order = ['AFC East', 'AFC North', 'AFC South', 'AFC West', 'NFC East', 'NFC North', 'NFC South', 'NFC West'];
  const winPct = T.w + T.l ? (T.w / (T.w + T.l)).toFixed(3).replace(/^0/, '') : '.000';
  UI.share = [`21-0 GM résumé · ${C.gmName || 'Anonymous GM'}`, `Titles: ${T.titles.length}${T.titles.length ? ' (' + T.titles.map(s => `${s.yr} ${DATA.teams[s.team].nick}`).join(', ') + ')' : ''}`,
    `Perfect seasons: ${T.perfect.length}`, `Career record: ${T.w}-${T.l} (${winPct}) · ${T.po} playoff trips · ${T.sb} Super Bowl appearances`,
    `Teams run: ${Object.keys(T.teams).length} of 32${T.best ? ` · Best rebuild: ${T.best.grade} with the ${DATA.teams[T.best.team].nick}` : ''}`, 'Can you beat it?'].join('\n');
  return `<section class="hero"><div class="gmhead"><span class="gmav" aria-hidden="true">${esc(ini)}</span><div><div class="kicker">General manager</div>
      <div class="row"><label class="namefield"><span class="sr">GM name</span><input id="gmName" maxlength="40" placeholder="Your name" value="${esc(C.gmName)}"></label><button class="btn sm" data-act="saveName">Save name</button></div>
      <p class="small muted">${T.runs.length ? `GM since ${new Date(Math.min(...T.runs.map(r => r.startedAt || Date.now()))).toLocaleDateString()} · ` : ''}${esc(store)}</p></div></div>
    <div class="row"><button class="btn" data-act="copyResume" ${T.runs.length ? '' : 'disabled'}>Copy as text</button><button class="btn go" data-act="share" data-k="resume" ${T.runs.length ? '' : 'disabled'}>Share card</button>${G ? '' : '<button class="btn go" data-tab="home">Pick a team</button>'}</div></section>
  <div class="kpis big card">
    <div><b class="num gold">${T.titles.length}</b><span>Super Bowls</span></div>
    <div><b class="num">${T.perfect.length}</b><span>Perfect seasons</span></div>
    <div><b class="num">${T.w}-${T.l}</b><span>Record · ${winPct}</span></div>
    <div><b class="num">${T.po}</b><span>Playoff trips</span></div>
    <div><b class="num">${T.goalsSet ? T.goalsMet + '/' + T.goalsSet : '–'}</b><span>Goals met</span></div>
    <div><b class="num">${T.avg == null ? '–' : T.avg}</b><span>Avg rebuild score</span></div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>Trophy case</h3>${T.titles.length ? `<div class="rings">${T.titles.map(s => `<div class="ring">${badge(s.team)}<div><b>${s.yr} ${esc(DATA.teams[s.team].name)}</b><div class="small muted">${s.w}-${s.l}${s.perfect ? ' · perfect' : ''}</div></div></div>`).join('')}</div>` : `<p class="muted">No rings yet. ${T.sb ? `You have reached ${T.sb} Super Bowl${T.sb > 1 ? 's' : ''}.` : 'Every title starts at the deadline.'}</p>`}</div>
    <div class="card"><h3>Achievements</h3><div class="ach">${T.ach.map(([n, d, ok, prog]) => `<div class="a ${ok ? 'on' : ''}"><b>${n}</b><span class="small muted">${d}</span><span class="tag ${ok ? 'good' : ''}">${ok ? 'Unlocked' : esc(prog)}</span></div>`).join('')}</div></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="cardh"><h3>Every team</h3><span class="small muted">${Object.keys(T.teams).length} of 32 run</span></div>
    <div class="allteams">${order.map(dv => `<div><div class="kicker muted">${dv}</div>${Object.keys(DATA.teams).filter(t => DATA.teams[t].div === dv).sort().map(t => { const c = T.teams[t]; return `<div class="tline ${c ? 'on' : ''}">${badge(t, 1)}<span>${esc(DATA.teams[t].nick)}</span><span class="small ${c ? '' : 'muted'}">${c ? `${c.w}-${c.l}${c.titles ? ' · <b class="gold">' + c.titles + '×</b>' : ''}${c.best ? ' · ' + c.best : ''}` : 'Not yet'}</span></div>`; }).join('')}</div>`).join('')}</div></div>
  ${leaderboardCard()}
  <div class="card" style="margin-top:14px"><h3>Run history</h3>${T.runs.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Team</th><th>2026</th><th>2027</th><th>OVR</th><th>Grade</th><th>Style</th></tr></thead><tbody>
    ${T.runs.map(r => { const a = (r.seasons || {})[2026], b = (r.seasons || {})[2027]; const cell = s => s ? `<b class="num">${s.w}-${s.l}</b> <span class="small muted">${esc(s.label)}</span>${s.champ ? ' <span class="tag good">Champs</span>' : ''}` : '<span class="muted">In progress</span>'; return `<tr><td><div class="row nowrap">${badge(r.team, 1)} ${esc(DATA.teams[r.team].nick)} ${modeTag(r.mode)}</div></td><td>${cell(a)}</td><td>${cell(b)}</td><td class="num">${r.startOvr || ''}${r.endOvr ? ' → ' + r.endOvr : ''}</td><td>${r.grade ? `<span class="tag ${gclass(r.grade)}">${r.grade}</span>` : ''}</td><td class="small">${esc(r.style || '')}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Finish a season and it shows up here.</p>'}</div>`;
}

function scoreCard(g, label) {
  const mine = g.a === G.user || g.h === G.user;
  const aw = g.as > g.hs;
  return `<div class="score ${mine ? 'mine' : ''}">
    ${label ? `<div class="tag">${esc(label)}</div>` : ''}
    <div class="t ${aw ? '' : 'l'}">${badge(g.a, 1)} ${esc(tname(g.a))}</div><div class="p num ${aw ? '' : 'l'}">${g.as}</div>
    <div class="t ${aw ? 'l' : ''}">${badge(g.h, 1)} ${esc(tname(g.h))}</div><div class="p num ${aw ? 'l' : ''}">${g.hs}${g.ot ? '<span class="small muted"> OT</span>' : ''}</div>
  </div>`;
}

function divStandings(conf) {
  const dv = E.divisions();
  return Object.keys(dv).filter(k => k.startsWith(conf)).sort().map(k => `<div class="card"><h3>${k}</h3><table class="tbl">
    <tr><th>Team</th><th>W-L</th><th>PF</th><th>PA</th><th>OVR</th></tr>
    ${dv[k].map(t => { const r = E.record(t, G.season); return `<tr class="${t === G.user ? 'me' : ''}"><td><div class="row" style="gap:8px">${badge(t, 1)} ${esc(tname(t))}</div></td><td class="num">${r.w}-${r.l}</td><td class="num">${r.pf}</td><td class="num">${r.pa}</td><td class="num ${oc(E.teamRating(t).ovr)}">${E.teamRating(t).ovr}</td></tr>`; }).join('')}
  </table></div>`).join('');
}
function seedList(conf) {
  const s = E.seeds(conf);
  return `<div class="card"><h3>${conf} playoff picture</h3><table class="tbl">${s.map((t, i) => `<tr class="${t === G.user ? 'me' : ''}"><td class="num">${i + 1}</td><td><div class="row" style="gap:8px">${badge(t, 1)} ${esc(tname(t))}</div></td><td class="num">${rec(t)}</td></tr>`).join('')}</table></div>`;
}
function userGames(season) {
  return (G.results[season] || []).filter(g => g.a === G.user || g.h === G.user);
}


function bracket() {
  const P = G.playoffs[G.season];
  const cols = [0, 1, 2, 3].map(i => {
    const games = P.rounds[i] || [];
    return `<div class="col"><div class="kicker">${E.ROUND_NAMES[i]}</div>${games.length ? games.map(g => scoreCard(g, g.conf || '')).join('') : '<div class="small muted">Not played yet</div>'}</div>`;
  });
  return `<div class="bracket">${cols.join('')}</div>`;
}

const BEST_KEY = '21-0-best-v1';
function readBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch (e) { return {}; } }
// Remembers your best rebuild per team on this device. Returns the best before this run.
function recordBest(t, entry) {
  const all = readBest(), prev = all[t] || null;
  if (!prev || entry.score > prev.score || (prev.key === entry.key)) {
    all[t] = entry;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (e) { /* storage unavailable */ }
  }
  return prev && prev.key !== entry.key ? prev : null;
}
const gclass = g => g[0] === 'A' ? 'good' : g[0] === 'B' ? 'gold' : g === '-' ? '' : 'bad';
function gradeColor(g) { return g[0] === 'A' ? 'var(--good)' : g[0] === 'B' ? 'var(--gold)' : g[0] === 'C' ? 'var(--warn)' : g === '-' ? 'var(--muted)' : 'var(--bad)'; }
function deltaPill(a, b, lowerIsBetter, fmt) {
  const d = Math.round((a - b) * 10) / 10;
  if (!d) return '<span class="pill">even</span>';
  const good = lowerIsBetter ? d < 0 : d > 0;
  return `<span class="pill ${good ? 'good' : 'bad'}">${d > 0 ? '+' : ''}${fmt ? fmt(d) : d}</span>`;
}

function homeFinal() {
  const h = G.history, team = G.teams[G.user];
  const f26 = h[2026].finish, f27 = h[2027].finish;
  const perfect = f26.perfect || f27.perfect;
  const grades = E.tradeGrades();
  const R = E.rebuildReport();
  const key = `${G.startedAt || ''}|${R.score}|${f26.w}-${f26.l}|${f27.w}-${f27.l}`;
  const prev = recordBest(G.user, {score: R.score, grade: R.grade, rec: `${f27.w}-${f27.l}`, key});
  const beat = prev && R.score > prev.score;
  const headline = perfect ? 'Perfect. You did what nobody has done.' : R.delta >= 5 ? `You rebuilt the ${team.nick}.` : R.delta >= 0 ? `You retooled the ${team.nick}.` : `You reshaped the ${team.nick}.`;

  UI.share = [
    `21-0 · I rebuilt the ${team.name}`,
    `Week 1 2026: ${R.then.ovr} OVR → end of 2027: ${R.now.ovr} OVR (#${R.rank} in the NFL)`,
    `2026: ${f26.w}-${f26.l}, ${f26.label}`,
    `2027: ${f27.w}-${f27.l}, ${f27.label}`,
    perfect ? 'PERFECT SEASON. 21-0.' : '',
    `Rebuild grade: ${R.grade} (${R.score}/100) · ${R.style.name}`,
    `Report card: ${R.cats.map(c => `${c.label} ${c.g}`).join(' · ')}`,
    'Can you do better?',
  ].filter(Boolean).join('\n');

  const ring = `<div class="gring" style="--p:${R.score};--gc:${gradeColor(R.grade)}"><div><b>${R.grade}</b><span class="num">${R.score}/100</span></div></div>`;
  const tn = (label, a, b, lower, fmt, show) => `<tr><td class="muted">${label}</td><td class="num">${show ? show(b) : b}</td><td class="num"><b>${show ? show(a) : a}</b></td><td>${deltaPill(a, b, lower, fmt)}</td></tr>`;
  const m = v => money(v);

  const lineRows = R.lineup.filter(r => r.pos !== 'P').map(r => {
    const b = r.before, a = r.after;
    const same = b && a && b.id === a.id;
    const diff = a && b ? a.ovr - b.ovr : 0;
    return `<tr class="${same ? '' : 'chg'}"><td><b>${r.slot}</b></td>
      <td>${b ? `${esc(b.n)} <span class="${oc(b.ovr)} num">${b.ovr}</span>` : '<span class="muted">empty</span>'}</td>
      <td>${a ? `${esc(a.n)} <span class="${oc(a.ovr)} num">${a.ovr}</span>` : '<span class="muted">empty</span>'}</td>
      <td>${r.how ? `<span class="pill ${r.how === 'Kept' || r.how === 'Re-signed' ? '' : r.how === 'Fill-in' ? 'bad' : 'gold'}">${r.how}</span>` : ''}</td>
      <td>${a && b ? `<span class="pill ${diff > 0 ? 'good' : diff < 0 ? 'bad' : ''}">${diff > 0 ? '+' : ''}${diff}</span>` : ''}</td></tr>`;
  }).join('');

  const bt = R.bestTrade, sg = R.sign, rk = R.rookies[0];
  const moves = [
    bt ? `<div class="move"><div class="kicker">Best trade · <span class="pill ${gclass(bt.grade)}">${bt.grade}</span></div><div>Got <b>${bt.got.map(esc).join(', ')}</b></div><div class="small muted">for ${bt.gave.map(esc).join(', ')} · ${bt.season} ${esc(bt.when)}, ${esc(tname(bt.partner))}</div></div>`
       : `<div class="move"><div class="kicker">Best trade</div><div class="muted">No trades made.</div></div>`,
    sg ? `<div class="move"><div class="kicker">Best signing</div><div><b>${esc(sg.n)}</b> <span class="small muted">${sg.pos}</span> <span class="${oc(sg.now.ovr)} num">${sg.now.ovr}</span></div><div class="small muted">${sg.yrs} yr at ${money(sg.apy)} per year${sg.from ? ', from the ' + esc(tname(sg.from)) : ''}</div></div>`
       : `<div class="move"><div class="kicker">Best signing</div><div class="muted">No free agents signed.</div></div>`,
    rk ? `<div class="move"><div class="kicker">Best draft pick</div><div><b>${esc(rk.n)}</b> <span class="small muted">${rk.pos}</span> <span class="${oc(rk.ovr)} num">${rk.ovr}</span></div><div class="small muted">Pick #${rk.draft}${R.rookies.length > 1 ? ` · ${R.rookies.length} rookies still on the roster` : ''}</div></div>`
       : `<div class="move"><div class="kicker">Best draft pick</div><div class="muted">No draft picks on the roster.</div></div>`,
  ].join('');

  return `<section style="padding:24px 0 14px"><div class="final">
    <div class="kicker">${esc(team.name)} · Week 1 2026 to the end of 2027</div>
    <div class="fhead">
      <div class="fside"><div class="small muted">You inherited</div><div class="fovr num ${oc(R.then.ovr)}">${R.then.ovr}</div><div class="small muted">Team OVR</div></div>
      <div class="farrow" aria-hidden="true">→</div>
      <div class="fside"><div class="small muted">You built</div><div class="fovr num ${oc(R.now.ovr)}">${R.now.ovr}</div><div class="small muted">#${R.rank} of 32</div></div>
      ${ring}
    </div>
    <h2 style="margin-top:12px">${esc(headline)}</h2>
    <p class="lead" style="margin:6px auto 0">${perfect ? 'Twenty-one games, zero losses.' : `Best record: ${[f26, f27].sort((a, b) => (b.w - b.l) - (a.w - a.l))[0].w}-${[f26, f27].sort((a, b) => (b.w - b.l) - (a.w - a.l))[0].l}.`} GM style: <b style="color:var(--chalk)">${esc(R.style.name)}</b>. ${esc(R.style.line)}</p>
    <div class="row" style="justify-content:center;gap:34px;margin-top:16px">
      <div class="stat"><b class="num">${f26.w}-${f26.l}</b><span>2026 · ${esc(f26.label)}</span></div>
      <div class="stat"><b class="num">${f27.w}-${f27.l}</b><span>2027 · ${esc(f27.label)}</span></div>
    </div>
    ${prev ? `<p class="small" style="margin:14px 0 0;color:${beat ? 'var(--good)' : 'var(--muted)'}">${beat ? `New personal best with the ${esc(team.nick)}. Your old best was ${prev.grade} (${prev.score}).` : `Your best with the ${esc(team.nick)} is still ${prev.grade} (${prev.score}), ${esc(prev.rec)} in 2027.`}</p>` : ''}
    <div class="dare">Can you do better? Run it back with the same Week 1 roster, or take over a worse team.</div>
    <div class="row" style="justify-content:center;margin-top:12px"><button class="btn" data-act="share" data-k="final">Share my rebuild</button><button class="btn go" data-act="runback">Run it back</button><button class="btn" data-act="newgame">Pick a new team</button></div>
  </div></section>

  ${[2026, 2027].map(s => E.goalMet(s)).some(Boolean) ? `<div class="grid g2" style="margin-bottom:14px">${[2026, 2027].map(s => { const g = E.goalMet(s); return g ? `<div class="card goalcard"><div class="kicker">${s} front office goal</div><b>${esc(g.goal)}</b><div class="row"><span class="tag ${g.met ? 'good' : 'bad'}">${g.met ? 'Met' : 'Missed'}</span><span class="small muted">${g.wins} wins vs ${g.proj} projected</span></div></div>` : ''; }).join('')}</div>` : ''}
  <h3 class="sech">Report card</h3>
  <div class="grades">${R.cats.map(c => `<div class="gcard"><div class="row" style="justify-content:space-between;align-items:baseline"><span class="kicker" style="color:var(--muted)">${c.label}</span><span class="small muted">${Math.round(c.w * 100)}%</span></div>
    <div class="gl" style="color:${gradeColor(c.g)}">${c.g}</div>
    <div class="gbar"><i style="width:${c.s == null ? 0 : c.s}%;background:${gradeColor(c.g)}"></i></div>
    <div class="small muted" style="margin-top:8px">${esc(c.why)}</div></div>`).join('')}</div>

  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>Then and now</h3><div class="tw"><table class="tbl"><tr><th></th><th>Week 1, 2026</th><th>End of 2027</th><th>Change</th></tr>
      ${tn('Team OVR', R.now.ovr, R.then.ovr)}
      ${tn('Offense', R.now.off, R.then.off)}
      ${tn('Defense', R.now.def, R.then.def)}
      ${tn('Starter age', R.now.age, R.then.age, true)}
      ${tn('Payroll', R.now.payroll, R.then.payroll, true, m, m)}
      ${tn('Cap space', R.now.space, R.then.space, false, m, m)}
      ${tn('Next-year picks', R.now.picks, R.then.picks)}
    </table></div><p class="small muted">Next-year picks are the rounds 1 to 4 picks you hold for the following draft (2027 at the start, 2028 at the end). You owe ${money(R.now.commit28)} for 2028 against a projected ${money(R.now.proj28)} cap.</p></div>
    <div class="card"><h3>Biggest moves</h3><div class="grid" style="gap:10px">${moves}</div></div>
  </div>

  <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3>Starting lineup, before and after</h3><span class="small muted">${R.lineup.filter(r => r.pos !== 'P' && (r.before && r.before.id) !== (r.after && r.after.id)).length} of ${R.lineup.filter(r => r.pos !== 'P').length} starting spots changed</span></div>
    <div class="tw"><table class="lineup"><tr><th>Spot</th><th>Week 1, 2026</th><th>End of 2027</th><th>How</th><th>OVR</th></tr>${lineRows}</table></div></div>

  <div class="grid g2" style="margin-top:14px"><div class="card"><h3>Every trade, graded</h3>${grades.length ? `<div class="tw"><table class="tbl"><tr><th>Grade</th><th>When</th><th>Got</th><th>Gave</th></tr>${grades.map(t => `<tr><td><span class="pill ${gclass(t.grade)}">${t.grade}</span></td><td class="small">${t.season} ${esc(t.when)}<br>${badge(t.partner, 1)}</td><td class="small">${t.got.map(esc).join('<br>')}</td><td class="small muted">${t.gave.map(esc).join('<br>')}</td></tr>`).join('')}</table></div>` : '<p class="muted">No trades. You rode it out.</p>'}<p class="small muted">Grades compare value received vs. sent at the time of the deal.</p></div>
  <div class="card"><h3>Champions</h3><table class="tbl"><tr><td>2026</td><td><div class="row" style="gap:8px">${badge(h[2026].champ, 1)} ${esc(G.teams[h[2026].champ].name)}</div></td></tr><tr><td>2027</td><td><div class="row" style="gap:8px">${badge(h[2027].champ, 1)} ${esc(G.teams[h[2027].champ].name)}</div></td></tr></table>
    <p class="small muted" style="margin-top:12px">How the grade works: Results 35% (2027 weighs more), roster upgrade 25%, trades 15%, future 15% (age, young core, picks), cap health 10%.</p></div></div>`;
}


// ---------- stats: one set of columns per position ----------
const COLS = {
  QB: [['g', 'G'], ['py', 'Pass yds'], ['ptd', 'Pass TD'], ['int', 'INT'], ['ry', 'Rush yds']],
  RB: [['g', 'G'], ['ry', 'Rush yds'], ['rtd', 'Rush TD'], ['rec', 'Rec'], ['recy', 'Rec yds']],
  REC: [['g', 'G'], ['rec', 'Rec'], ['recy', 'Yds'], ['rectd', 'TD']],
  OL: [['g', 'G']],
  DEF: [['g', 'G'], ['tkl', 'Tkl'], ['sk', 'Sacks'], ['dint', 'INT'], ['pd', 'PD']],
  K: [['g', 'G'], ['fg', 'FG']],
  P: [['g', 'G'], ['punts', 'Punts']],
};
const SCHEMA = {QB: 'QB', RB: 'RB', WR: 'REC', TE: 'REC', OT: 'OL', IOL: 'OL', EDGE: 'DEF', DT: 'DEF', LB: 'DEF', CB: 'DEF', S: 'DEF', K: 'K', P: 'P'};
const GROUPS = [
  ['QB', 'Quarterbacks', ['QB'], 'QB'], ['RB', 'Running backs', ['RB'], 'RB'], ['REC', 'Receivers', ['WR', 'TE'], 'REC'],
  ['OL', 'Offensive line', ['OT', 'IOL'], 'OL'], ['DL', 'Defensive line', ['EDGE', 'DT'], 'DEF'], ['LB', 'Linebackers', ['LB'], 'DEF'],
  ['DB', 'Secondary', ['CB', 'S'], 'DEF'], ['ST', 'Specialists', ['K', 'P'], 'ST'],
];
COLS.ST = [['g', 'G'], ['fg', 'FG'], ['punts', 'Punts']];

// Real stats arrive as text like "17 G, 119 rec, 1,793 yds, 10 TD". Turn that into fields.
function parseReal(str, pos) {
  if (!str) return null;
  const sch = SCHEMA[pos], out = {};
  let hit = false;
  for (const part of String(str).split(', ')) {
    const m = part.match(/^([\d,.]+(?:\/\d+)?)\s+(.+)$/);
    if (!m) continue;
    const raw = m[1], lab = m[2].trim();
    const n = raw.includes('/') ? raw : parseFloat(raw.replace(/,/g, ''));
    const key = {G: 'g', 'pass yds': 'py', 'rush yds': 'ry', 'rec yds': 'recy', yds: 'recy', rec: 'rec', tkl: 'tkl', sk: 'sk', PD: 'pd', FG: 'fg', punts: 'punts',
      TD: sch === 'QB' ? 'ptd' : sch === 'RB' ? 'rtd' : 'rectd', INT: sch === 'QB' ? 'int' : 'dint'}[lab];
    if (key) { out[key] = n; hit = true; }
  }
  return hit ? out : null;
}
function simStats(p, season) {
  const s = (G.stats[season] || {})[p.id];
  if (!s) return null;
  const o = {...s, g: s.gp};
  if (SCHEMA[p.pos] !== 'QB' && SCHEMA[p.pos] !== 'RB') delete o.ry;
  return o;
}
// Every season we have for a player, newest first
function seasonsFor(p) {
  const L = [];
  if ((G.results[2027] || []).length) L.push({key: 's27', label: '2027 sim', sim: true, s: simStats(p, 2027)});
  if ((G.results[2026] || []).length) L.push({key: 's26', label: '2026 sim', sim: true, s: simStats(p, 2026)});
  L.push({key: 'r26', label: '2026 real', s: parseReal(p.st26, p.pos)});
  L.push({key: 'r25', label: '2025 real', s: p.draft ? null : parseReal(p.st25, p.pos)});
  return L;
}
const fmtStat = v => v == null ? '<span class="muted">–</span>' : typeof v === 'number' ? (Math.round(v * 10) / 10).toLocaleString() : esc(v);
// Short one-season summary for tight spots (free agency, re-sign lists)
function statLine(p) {
  if (p.draft && p.rook) return `Rookie · pick #${p.draft} · ${esc(p.st25)}`;
  const row = seasonsFor(p).find(x => x.s && Object.keys(x.s).some(k => k !== 'g' && k !== 'gp' && x.s[k]));
  if (!row) return '';
  const cols = COLS[SCHEMA[p.pos]];
  return `<b>${row.label}</b> ` + cols.filter(([k]) => row.s[k] != null).map(([k, l]) => `${fmtStat(row.s[k])} ${l}`).join(' · ');
}
const pname = p => `<button class="pname" data-act="player" data-id="${esc(p.id)}">${esc(p.n)}</button>`;


function defaultStatKey() {
  if ((G.results[G.season] || []).length && G.phase !== 'offseason') return 's' + String(G.season).slice(2);
  if (G.phase === 'offseason' || G.season === 2027) return 's26';
  return 'r26';
}

function renderSchedule() {
  const s = G.phase === 'offseason' ? 2026 : G.season;
  const played = userGames(s);
  const games = E.seasonGames(s).filter(([w, a, h]) => a === G.user || h === G.user);
  return `
  <div class="card tw"><table class="tbl"><tr><th>Week</th><th>Opponent</th><th>Result</th></tr>
  ${games.map(([w, a, h]) => { const g = played.find(x => x.wk === w && !x.po); const home = h === G.user, opp = home ? a : h;
    let res = '<span class="muted">-</span>';
    if (g) { const my = home ? g.hs : g.as, op = home ? g.as : g.hs; res = `<span class="pill ${my > op ? 'good' : 'bad'}">${my > op ? 'W' : 'L'}</span> <span class="num">${my}-${op}${g.ot ? ' OT' : ''}</span>`; }
    return `<tr><td class="num">${w}</td><td><div class="row" style="gap:8px">${home ? 'vs' : '@'} ${badge(opp, 1)} ${esc(tname(opp))} <span class="muted small">${rec(opp, s)}</span></div></td><td>${res}</td></tr>`; }).join('')}
  ${played.filter(g => g.po).map(g => { const home = g.h === G.user, opp = home ? g.a : g.h, my = home ? g.hs : g.as, op = home ? g.as : g.hs; return `<tr><td>${esc(g.po)}</td><td><div class="row" style="gap:8px">${home ? 'vs' : '@'} ${badge(opp, 1)} ${esc(tname(opp))}</div></td><td><span class="pill ${my > op ? 'good' : 'bad'}">${my > op ? 'W' : 'L'}</span> <span class="num">${my}-${op}</span></td></tr>`; }).join('')}
  </table></div>`;
}
function renderLeaders() {
  const s = G.phase === 'offseason' ? 2026 : G.season;
  const st = G.stats[s] || {};
  const cats = [['py', 'Passing yards'], ['ptd', 'Passing TD'], ['ry', 'Rushing yards'], ['recy', 'Receiving yards'], ['sk', 'Sacks'], ['dint', 'Interceptions']];
  const nameOf = id => G.players[id] ? G.players[id] : null;
  return `
  <div class="grid g3">${cats.map(([k, l]) => { const top = Object.entries(st).filter(([id, v]) => v[k] && nameOf(id)).sort((a, b) => b[1][k] - a[1][k]).slice(0, 8);
    return `<div class="card"><h3>${l}</h3><table class="tbl">${top.map(([id, v]) => { const p = G.players[id]; return `<tr class="${p.tm === G.user ? 'me' : ''}"><td>${badge(p.tm, 1)}</td><td>${esc(p.n)}</td><td class="num" style="text-align:right">${v[k].toLocaleString()}</td></tr>`; }).join('') || '<tr><td class="muted">No games yet.</td></tr>'}</table></div>`; }).join('')}</div>`;
}


// ---------- share cards ----------
// A 1080×1350 card (the 4:5 shape Instagram, X and Threads all show uncropped), drawn from game state.
const SHEETS = {};
function sheetImg(t) {
  if (!SHEETS[t]) SHEETS[t] = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `img/${t}.webp`; });
  return SHEETS[t];
}
async function drawFace(ctx, p, x, y, r, ring) {
  const h = HEADS && HEADS.ix[p.id];
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = (G.teams[p.tm] || {c1: '#22304a'}).c1; ctx.fill(); ctx.clip();
  const im = h ? await sheetImg(h[0]) : null;
  if (im) { const c = h[1] % HEADS.cols, rw = Math.floor(h[1] / HEADS.cols); ctx.drawImage(im, c * 96, rw * 96, 96, 96, x - r, y - r, r * 2, r * 2); }
  else { ctx.fillStyle = '#fff'; ctx.font = `800 ${r * .8}px "Big Shoulders Display", Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.n.split(' ').map(w => w[0]).slice(0, 2).join(''), x, y + 2); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = ring || 'rgba(255,255,255,.25)'; ctx.stroke();
}
function cardBase(ctx, W, H, c1) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1424'); g.addColorStop(1, '#05080f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W * .8, -80, 40, W * .8, -80, 900); rg.addColorStop(0, hexA(c1, .55)); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 2;
  for (let y = 120; y < H; y += 90) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = '#f3b52f'; ctx.font = '900 64px "Big Shoulders Display", Impact, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('21', 64, 112); const w = ctx.measureText('21').width; ctx.fillStyle = '#eef2f8'; ctx.fillText('-', 64 + w, 112); ctx.fillStyle = '#f3b52f'; ctx.fillText('0', 64 + w + ctx.measureText('-').width, 112);
}
function hexA(hex, a) { const n = parseInt(String(hex).replace('#', ''), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
function txt(ctx, s, x, y, font, color, align) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.fillText(s, x, y); }
function fitFont(ctx, s, weight, max, maxW) { let size = max; do { ctx.font = `${weight} ${size}px "Big Shoulders Display", Impact, sans-serif`; size -= 4; } while (ctx.measureText(s).width > maxW && size > 20); return ctx.font; }

async function rebuildCard() {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  try { await document.fonts.load('900 100px "Big Shoulders Display"'); await document.fonts.load('600 30px "Barlow"'); } catch (e) { /* fonts optional */ }
  const team = G.teams[G.user], R = E.cached(E.rebuildReport)(), h = G.history, f26 = h[2026].finish, f27 = h[2027].finish;
  const perfect = f26.perfect || f27.perfect;
  cardBase(ctx, W, H, team.c1);
  txt(ctx, 'I REBUILT THE', 64, 230, '700 34px "Barlow", sans-serif', '#8f9cb4');
  txt(ctx, team.name.toUpperCase(), 64, 330, fitFont(ctx, team.name.toUpperCase(), 900, 112, W - 128), '#eef2f8');
  ctx.fillStyle = team.c1; ctx.fillRect(64, 356, 180, 10); ctx.fillStyle = team.c2; ctx.fillRect(244, 356, 90, 10);
  // then -> now and the grade ring
  txt(ctx, 'INHERITED', 64, 440, '700 26px "Barlow", sans-serif', '#8f9cb4');
  txt(ctx, String(R.then.ovr), 64, 580, '900 170px "Big Shoulders Display", Impact', '#eef2f8');
  txt(ctx, '→', 300, 560, '800 90px "Big Shoulders Display", Impact', '#8f9cb4');
  txt(ctx, 'BUILT', 400, 440, '700 26px "Barlow", sans-serif', '#8f9cb4');
  txt(ctx, String(R.now.ovr), 400, 580, '900 170px "Big Shoulders Display", Impact', R.now.ovr >= 90 ? '#f3b52f' : R.now.ovr >= 80 ? '#3fc07f' : '#eef2f8');
  const cx = 860, cy = 500, rr = 120, col = R.grade[0] === 'A' ? '#3fc07f' : R.grade[0] === 'B' ? '#f3b52f' : R.grade[0] === 'C' ? '#e8a33c' : '#ef5b51';
  ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * R.score / 100); ctx.stroke(); ctx.lineCap = 'butt';
  txt(ctx, R.grade, cx, cy + 34, '900 110px "Big Shoulders Display", Impact', col, 'center');
  txt(ctx, `${R.score}/100`, cx, cy + 74, '600 26px "Barlow", sans-serif', '#8f9cb4', 'center');
  // seasons
  const line = (y, yr, f) => { txt(ctx, yr, 64, y, '800 40px "Big Shoulders Display", Impact', '#8f9cb4'); txt(ctx, `${f.w}-${f.l}`, 170, y, '900 64px "Big Shoulders Display", Impact', '#eef2f8'); txt(ctx, f.label, 340, y - 6, '600 34px "Barlow", sans-serif', f.label === 'Won the Super Bowl' ? '#f3b52f' : '#c9d2e2'); };
  line(700, '2026', f26); line(780, '2027', f27);
  // the core
  txt(ctx, 'THE CORE', 64, 880, '800 34px "Big Shoulders Display", Impact', '#f3b52f');
  const d = E.depth(G.user);
  const starters = E.POS_ORDER.filter(p => p !== 'K' && p !== 'P').flatMap(pos => d[pos].slice(0, E.STARTERS[pos]));
  const core = starters.sort((a, b) => (b.how ? 3 : 0) + b.ovr - ((a.how ? 3 : 0) + a.ovr)).slice(0, 4);
  for (let i = 0; i < core.length; i++) {
    const p = core[i], x = 64 + i * 244 + 70;
    await drawFace(ctx, p, x, 990, 70, p.how ? '#f3b52f' : 'rgba(255,255,255,.25)');
    txt(ctx, lastName(p.n).toUpperCase().slice(0, 14), x, 1102, '800 30px "Big Shoulders Display", Impact', '#eef2f8', 'center');
    txt(ctx, `${p.pos} · ${p.ovr}${p.how ? ' · ' + p.how.toUpperCase() : ''}`, x, 1138, '600 22px "Barlow", sans-serif', p.how ? '#f3b52f' : '#8f9cb4', 'center');
  }
  // footer
  ctx.fillStyle = '#f3b52f'; ctx.fillRect(0, H - 150, W, 150);
  txt(ctx, perfect ? 'PERFECT. 21-0.' : 'CAN YOU DO BETTER?', 64, H - 60, '900 76px "Big Shoulders Display", Impact', '#1b1203');
  txt(ctx, `${C.gmName ? 'GM ' + C.gmName + ' · ' : ''}${R.style.name}`, W - 64, H - 64, '700 28px "Barlow", sans-serif', '#1b1203', 'right');
  const caption = `I rebuilt the ${team.name} in 21-0: ${R.then.ovr} → ${R.now.ovr} OVR, ${f26.w}-${f26.l} then ${f27.w}-${f27.l}${f27.label === 'Won the Super Bowl' || f26.label === 'Won the Super Bowl' ? ' with a ring' : ''}. Rebuild grade ${R.grade}. Can you do better?`;
  return {cv, caption, file: `21-0-${G.user}-rebuild.png`};
}
async function resumeCard() {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  try { await document.fonts.load('900 100px "Big Shoulders Display"'); await document.fonts.load('600 30px "Barlow"'); } catch (e) { /* fonts optional */ }
  const T = careerTotals();
  cardBase(ctx, W, H, '#f3b52f');
  txt(ctx, 'GM RÉSUMÉ', 64, 230, '700 34px "Barlow", sans-serif', '#8f9cb4');
  const nm = (C.gmName || 'Anonymous GM').toUpperCase();
  txt(ctx, nm, 64, 330, fitFont(ctx, nm, 900, 120, W - 128), '#eef2f8');
  txt(ctx, String(T.titles.length), 64, 560, '900 230px "Big Shoulders Display", Impact', '#f3b52f');
  txt(ctx, T.titles.length === 1 ? 'SUPER BOWL' : 'SUPER BOWLS', 64 + ctx.measureText(String(T.titles.length)).width + 30, 540, '800 60px "Big Shoulders Display", Impact', '#eef2f8');
  const pctS = T.w + T.l ? (T.w / (T.w + T.l)).toFixed(3).replace(/^0/, '') : '.000';
  const stats = [[`${T.w}-${T.l}`, 'RECORD'], [pctS, 'WIN PCT'], [String(T.perfect.length), 'PERFECT'], [`${Object.keys(T.teams).length}/32`, 'TEAMS RUN']];
  stats.forEach(([v, l], i) => { const x = 64 + i * 245; txt(ctx, v, x, 700, '900 74px "Big Shoulders Display", Impact', '#eef2f8'); txt(ctx, l, x, 740, '700 22px "Barlow", sans-serif', '#8f9cb4'); });
  txt(ctx, 'RINGS', 64, 840, '800 34px "Big Shoulders Display", Impact', '#f3b52f');
  const rings = T.titles.slice(0, 6);
  if (!rings.length) txt(ctx, T.sb ? `${T.sb} Super Bowl trip${T.sb > 1 ? 's' : ''}. Still chasing the first ring.` : 'Still chasing the first ring.', 64, 900, '600 34px "Barlow", sans-serif', '#c9d2e2');
  rings.forEach((s, i) => {
    const x = 64 + (i % 3) * 320, y = 880 + Math.floor(i / 3) * 110, t = DATA.teams[s.team];
    ctx.fillStyle = t.c1; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, 84, 84, 16) : ctx.rect(x, y, 84, 84); ctx.fill();
    txt(ctx, s.team, x + 42, y + 56, '900 34px "Big Shoulders Display", Impact', '#fff', 'center');
    txt(ctx, String(s.yr), x + 100, y + 38, '800 36px "Big Shoulders Display", Impact', '#eef2f8');
    txt(ctx, `${t.nick} · ${s.w}-${s.l}`.slice(0, 18), x + 100, y + 72, '600 24px "Barlow", sans-serif', '#8f9cb4');
  });
  const unlocked = T.ach.filter(a => a[2]).map(a => a[0]);
  txt(ctx, unlocked.length ? 'UNLOCKED: ' + unlocked.join(' · ').toUpperCase() : `${T.po} PLAYOFF TRIPS`, 64, 1130, fitFont(ctx, unlocked.length ? 'UNLOCKED: ' + unlocked.join(' · ').toUpperCase() : 'X', 800, 36, W - 128), '#c9d2e2');
  ctx.fillStyle = '#f3b52f'; ctx.fillRect(0, H - 150, W, 150);
  txt(ctx, 'CAN YOU BEAT IT?', 64, H - 60, '900 76px "Big Shoulders Display", Impact', '#1b1203');
  const caption = `My 21-0 GM résumé: ${T.titles.length} Super Bowl${T.titles.length === 1 ? '' : 's'}, ${T.w}-${T.l} career, ${Object.keys(T.teams).length} of 32 teams run. Can you beat it?`;
  return {cv, caption, file: '21-0-resume.png'};
}
async function openShare(kind) {
  modal(`<div class="sheeth"><div><div class="kicker">Share</div><h3>Making your card</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div><p class="muted">Drawing it now.</p>`, true);
  let r;
  try { r = kind === 'resume' ? await resumeCard() : await rebuildCard(); } catch (e) { modal(`<div class="sheeth"><h3>Could not draw the card</h3><button class="x" data-act="closeModal" aria-label="Close">×</button></div><p class="muted">Copy the text version instead.</p>`); return; }
  UI.shareCard = r; UI.share = r.caption;
  const url = r.cv.toDataURL('image/png');
  const enc = encodeURIComponent(r.caption);
  modal(`<div class="sheeth"><div><div class="kicker">Share</div><h3>${kind === 'resume' ? 'Your GM résumé' : 'Your rebuild'}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <img class="sharepreview" src="${url}" alt="${esc(r.caption)}">
    <p class="small muted">${esc(r.caption)}</p>
    <div class="row end"><button class="btn" data-act="copy">Copy caption</button><a class="btn" href="https://twitter.com/intent/tweet?text=${enc}" target="_blank" rel="noopener">Post on X</a><a class="btn" href="https://www.threads.net/intent/post?text=${enc}" target="_blank" rel="noopener">Threads</a><button class="btn go" data-act="saveCard" id="saveCardBtn">Save image</button></div>
    <p class="small muted">Save the image, then attach it to your post. Instagram and TikTok take it straight from your photos.</p>`, true);
}
async function saveCard() {
  const r = UI.shareCard; if (!r) return;
  const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
  if (!dl) {
    if (!window.claude) { const a = document.createElement('a'); a.href = r.cv.toDataURL('image/png'); a.download = r.file; document.body.appendChild(a); a.click(); a.remove(); toast('Saved.'); return; }
    toast('Saving is not available here. Long-press or right-click the image to save it.'); return;
  }
  const blob = await new Promise(res => r.cv.toBlob(res, 'image/png'));
  try { await dl.save({filename: r.file, data: blob}); toast('Saved.'); }
  catch (e) { toast(e && e.code === 'declined' ? 'Not saved.' : 'Could not save. Long-press or right-click the image instead.'); }
}

// ---------- your team panel: needs + depth chart ----------
function teamPanel(act, cur) {
  const N = E.teamNeeds(), d = E.depth(G.user), tr = E.teamRating(G.user);
  const order = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K'];
  const grade = pos => { const n = N.find(x => x.pos === pos); return n ? RANK_LETTER(n.rank) : ''; };
  const needs = N.filter(n => n.level !== 'Low');
  return `<div class="card tpanel"><div class="cardh"><h3>${act === 'tNeedPos' ? 'Needs & depth chart' : 'Your team'}</h3><span class="small muted">${tr.ovr} OVR · off ${tr.off} · def ${tr.def}</span></div>
    <div class="lbl">Needs${act ? ' · tap to filter' : ''}</div>
    <div class="needchips2">${needs.length ? needs.map(n => `<button class="nchip ${n.level === 'High' ? 'hi' : ''} ${cur === n.pos ? 'on' : ''}" ${act ? `data-act="${act}" data-k="${n.pos}"` : 'disabled'}><span class="ng sm g${RANK_LETTER(n.rank)}">${RANK_LETTER(n.rank)}</span>${n.pos}</button>`).join('') : '<span class="small muted">No big holes. Upgrade anywhere.</span>'}${act && cur && cur !== 'ALL' ? `<button class="nchip" data-act="${act}" data-k="ALL">Show all</button>` : ''}</div>
    <details class="fold dfold"><summary>Depth chart</summary>
    <div class="dchart">${order.map(pos => { const L = d[pos], n = E.STARTERS[pos]; return `<div class="drow ${cur === pos ? 'on' : ''}"><span class="dpos">${pos}<i class="g${grade(pos)}">${grade(pos)}</i></span><span class="dplayers">${L.slice(0, n).map(p => `<span class="dp">${face(p, 'xs')}<span>${esc(lastName(p.n))}</span><b class="${oc(p.ovr)}">${p.ovr}</b></span>`).join('') || '<span class="dp bad">Empty</span>'}${L[n] ? `<span class="dp bk"><span>${esc(lastName(L[n].n))}</span><b>${L[n].ovr}</b></span>` : ''}</span></div>`; }).join('')}</div></details></div>`;
}

// ---------- custom dropdown ----------
// A button that opens a rich list: icons, a second line and a right-hand detail per option.
function dd(id, opts, cur, cls) {
  const sel = opts.find(o => String(o.v) === String(cur)) || opts[0];
  const open = UI.ddOpen === id;
  return `<div class="dd ${cls || ''} ${open ? 'open' : ''}" data-dd="${id}"><button class="ddbtn" data-act="ddToggle" data-dd="${id}" aria-haspopup="listbox" aria-expanded="${open}">${sel.left || ''}<span class="ddlab"><b>${sel.label}</b>${sel.sub ? `<small>${sel.sub}</small>` : ''}</span><span class="ddchev" aria-hidden="true"></span></button>
    ${open ? `<div class="ddmenu" role="listbox">${opts.map(o => o.head ? `<div class="ddhead">${o.head}</div>` : `<button role="option" aria-selected="${String(o.v) === String(cur)}" class="ddopt ${String(o.v) === String(cur) ? 'on' : ''}" data-act="ddPick" data-dd="${id}" data-v="${esc(o.v)}">${o.left || ''}<span class="ddlab"><b>${o.label}</b>${o.sub ? `<small>${o.sub}</small>` : ''}</span>${o.right || ''}${String(o.v) === String(cur) ? '<span class="ddcheck" aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div>` : ''}</div>`;
}
function ddPick(id, v) {
  if (id === 'partner') { UI.partner = v; UI.get = []; UI.tq = ''; UI.tpos = null; }
  else if (id === 'faPos') UI.faPos = v;
  else if (id === 'statKey') UI.statKey = v;
}

// ---------- free agency: meetings, offers, waves ----------
function interestBar(it) {
  const c = it.score >= 65 ? 'var(--good)' : it.score >= 40 ? 'var(--warn)' : 'var(--bad)';
  return `<span class="ilab">Interest</span><div class="ibar" title="How much he wants to play for you"><i style="width:${it.score}%;background:${c}"></i></div><b class="num" style="color:${c}">${it.score}</b>`;
}
function homeFA() {
  G.fa.met = G.fa.met || {}; G.fa.offers = G.fa.offers || {}; G.fa.decisions = G.fa.decisions || []; G.fa.meetings = G.fa.meetings || 0;
  const F = G.fa, N = E.teamNeeds(), needPos = new Set(N.filter(n => n.level !== 'Low').map(n => n.pos));
  const d = E.depth(G.user);
  let pool = E.faPool();
  const q = (UI.faQ || '').trim().toLowerCase();
  if (q) pool = pool.filter(p => p.n.toLowerCase().includes(q) || (p.fromTeam && (p.fromTeam.toLowerCase() === q || tname(p.fromTeam).toLowerCase().includes(q))));
  else if (UI.faFit === 'need') pool = pool.filter(p => needPos.has(p.pos) && p.ovr > ((d[p.pos][E.STARTERS[p.pos] - 1] || {ovr: 0}).ovr));
  if (UI.faPos !== 'ALL') pool = pool.filter(p => p.pos === UI.faPos);
  const total = pool.length; pool = pool.slice(0, UI.faMore ? 40 : 15);
  const space = E.capSpace(G.user), open = Object.entries(F.offers || {}), openCap = open.reduce((a, [, o]) => a + o.apy, 0);
  const counts = {}; for (const p of E.faPool()) counts[p.pos] = (counts[p.pos] || 0) + 1;
  const posOpts = [{v: 'ALL', label: 'All positions', sub: `${E.faPool().length} free agents`}, ...E.POS_ORDER.map(x => ({v: x, label: x, sub: `${counts[x] || 0} available`, right: needPos.has(x) ? '<span class="tag warn">Need</span>' : ''}))];
  const decisions = (F.decisions || []).map(dc => { const p = G.players[dc.id]; return `<div class="decide">${face(p)}<div class="pmain"><div class="pn">${pname(p)} <span class="muted small">${p.pos} ${p.ovr}</span></div>
      <div class="small">The ${esc(G.teams[dc.t].name)} offered <b>${money(dc.apy)} × ${dc.yrs} yr</b>. Yours: ${money(dc.mine.apy)} × ${dc.mine.yrs} yr.</div>
      <div class="small muted">Match at ${money(dc.match)} per year and he is yours.</div></div>
      <div class="row nowrap"><button class="btn sm ghost" data-act="faPass" data-id="${p.id}">Let him go</button><button class="btn sm go" data-act="faMatch" data-id="${p.id}" ${dc.match > space ? 'disabled title="Not enough cap space"' : ''}>Match ${money(dc.match)}</button></div></div>`; }).join('');
  return `${stepper(2)}<section class="hero"><div><h2>Free agency · wave ${Math.min(F.wave, 3)} of 3${helpBtn('fa')}</h2>
    <p class="lead">Sign at the asking price, or tap a player to meet him or offer less.</p></div>
    <div class="row">${F.wave <= 3 && !F.decisions.length ? `<button class="btn go lg" data-act="faWave">End wave ${F.wave}</button>` : ''}<button class="btn" data-act="toDraft">${F.wave > 3 ? 'Next: the draft' : 'Skip to the draft'}</button></div></section>
  ${decisions ? `<div class="card decisions"><div class="cardh"><h3>Decision time</h3><span class="small muted">Rivals made better offers. Match or walk away before the next wave.</span></div>${decisions}</div>` : ''}
  <div class="toolbar fatool"><button class="btn needsbtn" data-act="needsSheet">Needs</button><label class="search fasearch"><span class="sr">Search free agents</span><input id="faQ" type="search" placeholder="Search by name or old team" value="${esc(UI.faQ || '')}" autocomplete="off"></label>${seg('faFit', [['need', 'Fits my needs'], ['all', 'Everyone']], UI.faFit)}${dd('faPos', posOpts, UI.faPos)}
    <span class="meta">Cap space <b class="num">${money(space)}</b> · Meetings left <b class="num">${3 - F.meetings}/3</b></span></div>
  <div class="grid fa-grid"><div class="card"><div class="plist">${pool.map(p => {
    const it = E.interest(p, G.user), st = d[p.pos][E.STARTERS[p.pos] - 1], up = st ? p.ovr - st.ovr : p.ovr;
    const mine = F.offers[p.id], met = F.met[p.id], s = E.faSuitors(p);
    return `<div class="farow" data-act="faOpen" data-id="${p.id}" data-k="offer">${face(p, 'sm')}<div class="pmain"><div class="pn">${pname(p)}${mine ? ` <span class="tag gold">Offer in · ${money(mine.apy)}</span>` : ''}${met ? ` <span class="tag ${met.boost > 0 ? 'good' : 'bad'}">Met ${met.boost > 0 ? '+' : ''}${met.boost}</span>` : ''}</div>
      <div class="psub">${p.pos} · ${Math.floor(p.age)} · <span class="${up > 0 ? 'gold' : ''}">${!st ? 'Fills an empty spot' : up > 0 ? '+' + up + ' over your starter' : 'depth'}</span></div></div>
      <span class="ovrb ${oc(p.ovr)}">${p.ovr}</span><div class="icell">${interestBar(it)}</div>
      <div class="row nowrap"><span class="chev deskonly-inline" aria-hidden="true">›</span><button class="btn sm go" data-act="faSign" data-id="${p.id}" ${E.faPrice(p) > space ? 'disabled title="Not enough cap space"' : ''}>Sign ${money(E.faPrice(p))}</button></div></div>`; }).join('') || (q ? `<p class="muted">No free agent matches "${esc(UI.faQ)}". He may have signed already.</p>` : '<p class="muted">Nobody left who upgrades a need. Switch to Everyone to see the whole pool.</p>')}${total > 15 ? `<button class="btn ghost sm showall" data-act="faMore">${UI.faMore ? 'Show fewer' : `Show more (${Math.min(40, total)})`}</button>` : ''}</div></div>
  <div class="grid"><div class="deskonly">${teamPanel('faNeedPos', UI.faPos)}</div>${open.length ? `<div class="card"><h3>Your offers</h3>${open.map(([pid, o]) => { const p = G.players[pid]; return `<div class="trow">${pRow(p, `${money(o.apy)} × ${o.yrs} yr`)}<button class="xs" data-act="faCancel" data-id="${pid}" aria-label="Withdraw offer">×</button></div>`; }).join('') .join('')}</div>` : ''}
  <div class="card"><h3>The wire</h3><ul class="news">${F.log.slice(0, 40).map(n => `<li>${esc(n)}</li>`).join('') || '<li class="muted">Nobody has signed yet.</li>'}</ul></div></div></div>`;
}
function stepperRow(id, val, min) {
  return `<div class="stepper2"><button class="btn icon" data-act="apyStep" data-id="${id}" data-d="-0.5" aria-label="Lower">−</button><label><span class="sr">Per year ($M)</span><input id="apy-${id}" type="number" step="0.1" min="${min}" value="${val}"></label><button class="btn icon" data-act="apyStep" data-id="${id}" data-d="0.5" aria-label="Raise">+</button><span class="small muted">$M per year</span></div>`;
}
function playerHead(p, it) {
  const {w} = E.priorities(p);
  const pri = [['Money', w.money], ['Winning', w.win], ['Role', w.role], ['Loyalty', w.loyal]].sort((a, b) => b[1] - a[1]);
  return `<div class="pchead">${face(p, 'xl')}<div class="pcmid"><div class="kicker">${p.pos} · ${Math.floor(p.age)} · ${p.fromTeam ? 'last ' + esc(tname(p.fromTeam)) : esc(tname(p.tm))}</div><h3>${esc(p.n)}</h3><span class="tag">${esc(it.persona)}</span> <span class="small muted">wants ${E.yearsFor(p)} years</span></div>
    <div class="pcovr ${oc(p.ovr)}"><b>${p.ovr}</b><span>OVR</span></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="grid g2 meetgrid"><div><h4 class="sub">What he cares about</h4>${pri.map(([k, v]) => `<div class="prio"><span>${k}</span><div class="ibar"><i style="width:${Math.round(v * 100 / pri[0][1])}%"></i></div><b class="num">${Math.round(v * 100)}%</b></div>`).join('')}</div>
    <div><h4 class="sub">How he sees you <b class="num">${it.score}</b></h4>${it.parts.map(x => `<div class="seeline"><span class="${x.v >= .6 ? 'good' : x.v <= .3 ? 'bad' : 'warn'}">${x.v >= .6 ? '✓' : x.v <= .3 ? '✗' : '•'}</span>${esc(x.note)}</div>`).join('')}
      <p class="small muted">${it.score >= 65 ? 'He wants to be here, so his price is lower.' : it.score >= 40 ? 'He is open to it at full price.' : 'You will have to pay a premium.'} Meet his ask and he signs on the spot.</p></div></div>`;
}
function faModal(id, msg) {
  const p = G.players[id], F = G.fa;
  if (!p) return;
  const it = E.interest(p, G.user), met = F.met[id], mine = F.offers[id];
  const yrs = UI.faYrs[id] || (mine && mine.yrs) || E.yearsFor(p), price = E.faPrice(p, yrs);
  const apy = UI.faApy[id] != null ? UI.faApy[id] : (mine ? mine.apy : price);
  modal(`${playerHead(p, it)}
    <h4 class="sub">Meeting</h4>${met ? `<p class="small"><b class="${met.boost > 0 ? 'good' : 'bad'}">${met.boost > 0 ? '+' : ''}${met.boost} interest.</b> You pitched ${esc(E.PITCHES[met.pitch][0].toLowerCase())}.</p>` : F.meetings >= 3 ? '<p class="small muted">No meetings left this wave.</p>' : `<p class="small muted">Pick one pitch. Match what he cares about most.</p><div class="pitches">${Object.entries(E.PITCHES).map(([k, [l]]) => `<button class="btn" data-act="faPitch" data-id="${id}" data-k="${k}">${l}</button>`).join('')}</div>`}
    <h4 class="sub">Offer</h4>
    <div class="seg yrs" role="group" aria-label="Contract length">${[1, 2, 3, 4, 5].map(y => `<button class="${y === yrs ? 'on' : ''}" data-act="faYrs" data-id="${id}" data-k="${y}"><b>${y} yr${y === E.yearsFor(p) ? ' ★' : ''}</b><small>${money(E.faPrice(p, y))}</small></button>`).join('')}</div>
    ${stepperRow(id, apy, 1)}
    <div class="row"><button class="chip" data-act="faQuick" data-id="${id}" data-k="1">His ask ${money(price)}</button><button class="chip" data-act="faQuick" data-id="${id}" data-k="0.95">−5%</button><button class="chip" data-act="faQuick" data-id="${id}" data-k="0.9">−10%</button><span class="small muted">Total ${money(apy * yrs)} over ${yrs} years</span></div>
    ${msg ? `<div class="agent">${esc(msg)}</div>` : mine ? `<div class="agent">Your offer of ${money(mine.apy)} × ${mine.yrs} yr is on the table. He decides when wave ${F.wave} ends.</div>` : ''}
    <div class="row end"><button class="btn" data-act="closeModal">Close</button><button class="btn go" data-act="faSubmit" data-id="${id}">${apy + .001 >= price ? 'Sign him now' : mine ? 'Update offer' : 'Make offer'}</button></div>`, true);
}

// ---------- re-sign negotiation ----------
function negModal(id, msg) {
  const p = G.players[id]; if (!p) return;
  const yrs = UI.rYrs[id] || E.yearsFor(p);
  const n = E.negStart(id, 're', yrs);
  const it = E.interest(p, G.user);
  const apy = UI.faApy[id] != null ? UI.faApy[id] : Math.round(n.ask * .92 * 10) / 10;
  modal(`${playerHead(p, it)}
    <h4 class="sub">Contract</h4>
    <div class="seg yrs" role="group" aria-label="Contract length">${[1, 2, 3, 4, 5].map(y => `<button class="${y === yrs ? 'on' : ''}" data-act="negYrs" data-id="${id}" data-k="${y}" ${n.walked ? 'disabled' : ''}><b>${y} yr${y === E.yearsFor(p) ? ' ★' : ''}</b><small>${money(E.resignPrice(p, y))}</small></button>`).join('')}</div>
    <div class="row" style="justify-content:space-between"><span>His agent is asking <b>${money(n.ask)}</b> per year</span><span class="patience" aria-label="Patience ${Math.max(0, n.patience)} of 3">${[0, 1, 2].map(i => `<i class="${i < n.patience ? 'on' : ''}"></i>`).join('')} <small class="muted">patience</small></span></div>
    ${n.walked ? '' : stepperRow(id, apy, 1)}
    ${n.log.length ? `<div class="neglog">${n.log.map(l => `<div><span class="muted">You</span> ${money(l.you)} <span class="muted">→ He</span> ${typeof l.him === 'number' ? money(l.him) : esc(l.him)}</div>`).join('')}</div>` : ''}
    ${msg ? `<div class="agent">${esc(msg)}</div>` : ''}
    <div class="row end"><button class="btn ghost" data-act="${n.walked ? 'closeModal' : 'letgo'}" data-id="${id}">${n.walked ? 'Done' : 'Let him go'}</button>${n.walked ? '' : `<button class="btn" data-act="negAsk" data-id="${id}">Pay ${money(n.ask)}</button><button class="btn go" data-act="negSubmit" data-id="${id}">Make offer</button>`}</div>`, true);
}

// ---------- render ----------
const renderCached = () => E.cached(renderInner)();
function renderInner() {
  renderHeader();
  if (!G) { $('#app').innerHTML = ''; if (UI.tab === 'resume') $('#app').innerHTML = renderResume(); else renderPicker(); return; }
  const tabs = {home: renderHome, roster: renderRoster, trade: renderTrade, league: renderLeague, resume: renderResume};
  $('#app').innerHTML = (tabs[UI.tab] || renderHome)();
}
function render() {
  if (!G) {
    renderHeader();
    if (UI.tab === 'resume') $('#app').innerHTML = renderResume(); else renderPicker();
    return;
  }
  renderCached();
  const key = [UI.tab, G.phase, G.step, G.season, UI.league, UI.tview || '', UI.rview].join('|');
  if (key !== UI.lastKey) {
    const stage = [G.phase, G.step, G.season].join('|');
    if (UI.lastStage && stage !== UI.lastStage) window.scrollTo(0, 0);
    UI.lastKey = key; UI.lastStage = stage; animateEnter();
  }
  const hv = $$('#hdr .hstats .num').map(x => x.textContent);
  if (UI.hdrVals && !reducedMotion()) $$('#hdr .hstats .num').forEach((x, i) => { if (UI.hdrVals[i] !== undefined && UI.hdrVals[i] !== hv[i]) x.classList.add('bump'); });
  UI.hdrVals = hv;
  if (UI.celebrate && !UI.reel) { UI.celebrate = false; setTimeout(() => { confetti(); buzz([40, 60, 40, 60, 120]); }, 150); }
}
function go(tab) { UI.tab = tab; UI.found = null; render(); window.scrollTo(0, 0); }

// ---------- actions ----------
function finishRegular() {
  E.simTo(18);
  E.startPlayoffs();
  if (E.inPlayoffs(G.user)) G.phase = 'playoffs';
  else { while (E.simPlayoffRound()); endSeasonIfDone(); }
}
function endSeasonIfDone() {
  const P = G.playoffs[G.season];
  if (P.champ) {
    G.phase = 'seasondone';
    if (G.season === 2027) G.history[2027] = {finish: E.userFinish(2027), champ: P.champ, ovr: E.teamRating(G.user).ovr};
    G.confDone = G.confDone || {};
    if (!G.confDone[G.season]) { G.confDone[G.season] = 1; E.updateConfidence('season'); if (P.champ === G.user) UI.celebrate = true; }
    G.awards = G.awards || {};
    if (!G.awards[G.season]) G.awards[G.season] = E.awards(G.season);
    recordRun(false);
  }
}
function startGame(t) {
  G = E.newGame(DATA, t);
  G.startedAt = Date.now();
  const o = E.teamRating(t).ovr;
  G.startRank = E.teamList().filter(x => E.teamRating(x).ovr > o).length + 1;
  G.mode = UI.mode || 'standard';
  if (G.mode === 'caphell') { E.G.dead[t] = 45; G.news.unshift('Cap hell: you start $45M deep in dead money.'); }
  UI.give = []; UI.get = []; UI.cutSel = null; UI.found = null; UI.proj = null; UI.tab = 'home';
}
function openFound(id, list) { UI.found = {id, list}; openPlayer(id); const h = $('.sheet .askedh'); if (h) h.scrollIntoView({block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth'}); }

document.addEventListener('click', e => {
  if (UI.ddOpen && !e.target.closest('.dd')) { UI.ddOpen = null; if (!e.target.closest('[data-act],[data-tab]')) { render(); return; } }
  const tb = e.target.closest('[data-tab]');
  if (tb && !tb.closest('[data-act]')) { closeModal(); go(tb.dataset.tab); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'closeModal' && e.target.closest('[data-stop]') && !e.target.closest('button')) return;
  if (el.disabled) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (el.classList.contains('go')) sfx('tap');
  switch (a) {
    case 'pick': {
      const t = el.dataset.t;
      modal(`<div class="sheeth"><div><div class="kicker">Take the job</div><h3>Run the ${esc(DATA.teams[t].name)}?</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div><p class="muted">You will play the first half of 2026 with this exact roster, then the sim stops at the trade deadline.</p><div class="row end"><button class="btn" data-act="closeModal">Back</button><button class="btn go" data-act="confirmPick" data-t="${t}">Take the job</button></div>`);
      return;
    }
    case 'confirmPick': { startGame(el.dataset.t); closeModal(); window.scrollTo(0, 0); let seen = false; try { seen = localStorage.getItem('21-0-guide') === '1'; localStorage.setItem('21-0-guide', '1'); } catch (e) { /* storage unavailable */ } persist(); render(); if (!seen) setTimeout(() => helpSheet('run'), 250); return; }
    case 'runback': { const t = G.user; startGame(t); toast(`Back to Week 1 with the ${DATA.teams[t].nick}.`); window.scrollTo(0, 0); break; }
    case 'resume': try { G = E.load(localStorage.getItem(SAVE_KEY)); if (!G.start) G.start = E.snapshotFromData(DATA, G.user); G.offers = G.offers || []; if (!G.startedAt) G.startedAt = Date.now(); if (G.playoffs[2026] && G.playoffs[2026].champ) recordRun(G.phase === 'final'); } catch (err) { toast('Could not load the save.'); return; } UI.tab = 'home'; break;
    case 'closeModal': closeModal(); UI.found = null; return;
    case 'tAll': UI[el.dataset.k] = !UI[el.dataset.k]; break;
    case 'faMore': UI.faMore = !UI.faMore; break;
    case 'rsAll': UI.rsAll = !UI.rsAll; break;
    case 'capRoom': capRoomSheet(); return;
    case 'cutNow': { const p = G.players[id]; if (!p) return; const dead = E.cutPlayer(id); toast(`Released ${p.n}. Cap space is now ${money(E.capSpace(G.user))}${dead ? ` (${money(dead)} dead money)` : ''}.`); persist(); render(); capRoomSheet(); return; }
    case 'blockToggle': {
      const p = G.players[id]; if (!p) return;
      const on = E.toggleBlock(id);
      if (on) {
        const fresh = E.blockOffersFor(id).filter(o => !(G.offers || []).some(x => x.id === o.id));
        G.offers = [...fresh, ...(G.offers || [])];
        toast(fresh.length ? `${fresh.length} team${fresh.length > 1 ? 's' : ''} made offers for ${p.n}. They are in your inbox.` : `${p.n} is on the block. Nobody bit yet: ${E.whyNoMarket(id, 'any')}`);
      } else { G.offers = (G.offers || []).filter(o => !(o.kind === 'block' && o.give.includes(id))); toast(`${p.n} is off the block.`); }
      persist(); if ($('#layer .pchead')) openPlayer(id); render(); return;
    }
    case 'shopWant': { UI.shopWant = el.dataset.k; const fid = UI.found && UI.found.id; if (fid) openFound(fid, E.shopPlayer(fid, UI.shopWant)); return; }
    case 'help': helpSheet(el.dataset.k || helpKey()); return;
    case 'sound': SND.on = !SND.on; try { localStorage.setItem('21-0-sound', SND.on ? 'on' : 'off'); } catch (e) { /* storage unavailable */ } if (SND.on) sfx('tap'); if ($('.helpfoot')) helpSheet(helpKey()); return;
    case 'seg': UI[el.dataset.seg] = el.dataset.k; render(); return;
    case 'rview': UI.rview = el.dataset.k; go('roster'); return;
    case 'rpos': UI.rosterPos = el.dataset.k; render(); return;
    case 'player': e.stopPropagation(); UI.found = null; openPlayer(id); return;
    case 'needPos': needModal(el.dataset.pos); return;
    case 'depthPos': depthModal(el.dataset.pos); return;
    case 'depthMove': {
      const pos = el.dataset.pos, L = E.depth(G.user)[pos].map(p => p.id), i = L.indexOf(id), j = i + (+el.dataset.d);
      if (i < 0 || j < 0 || j >= L.length) return;
      [L[i], L[j]] = [L[j], L[i]]; E.setDepth(pos, L); persist(); depthModal(pos); render(); return;
    }
    case 'depthReset': E.setDepth(el.dataset.pos, []); persist(); depthModal(el.dataset.pos); render(); return;
    case 'toDeadline': UI.tview = null; simWithReel(`${G.season} · Weeks 1-${E.DEADLINE_WEEK - 1}`, () => { E.simTo(E.DEADLINE_WEEK); G.phase = 'deadline'; E.updateConfidence('deadline'); E.refreshOffers(); UI.proj = null; }); return;
    case 'simRest': UI.give = []; UI.get = []; G.offers = []; simWithReel(`${G.season} · Weeks ${E.DEADLINE_WEEK}-18`, () => { finishRegular(); UI.tab = 'home'; }); return;
    case 'poNext': simWithReel(`${G.season} playoffs`, () => { E.simPlayoffRound(); endSeasonIfDone(); }); return;
    case 'poSkip': simWithReel(`${G.season} playoffs`, () => { while (E.simPlayoffRound()); endSeasonIfDone(); }); return;
    case 'offseason': UI.tview = null; E.beginOffseason(); G.phase = 'offseason'; if (G.mode === 'caphell') G.dead[G.user] = Math.max(G.dead[G.user] || 0, 20); else G.dead[G.user] = 0; E.refreshOffers(); break;
    case 'final': G.phase = 'final'; recordRun(true); if ([2026, 2027].some(y => G.history[y] && G.history[y].finish && G.history[y].finish.perfect)) UI.celebrate = true; break;
    case 'toResign': G.step = 'resign'; E.refreshOffers(); break;
    case 'resign': {
      const yrs = E.yearsFor(G.players[id]), price = E.resignPrice(G.players[id], yrs);
      if (price > E.capSpace(G.user) + .001) { toast(`Not enough cap space: you have ${money(E.capSpace(G.user))}. Tap Make cap room to cut someone.`); return; }
      E.resignPlayer(id, true, yrs); toast(`${G.players[id].n} re-signed: ${yrs} yr, ${money(price * yrs)} total.`); break;
    }
    case 'resignStarters': {
      const d = E.depth(G.user); let n = 0, skipped = 0;
      for (const rid of Object.keys(G.resign)) {
        const p = G.players[rid], r = G.resign[rid];
        if (!p || r.done || d[p.pos].indexOf(p) < 0 || d[p.pos].indexOf(p) >= E.STARTERS[p.pos]) continue;
        if (r.ask <= E.capSpace(G.user)) { E.resignPlayer(rid, true); n++; } else skipped++;
      }
      toast(`Re-signed ${n} starter${n === 1 ? '' : 's'}${skipped ? `. ${skipped} did not fit under the cap` : ''}.`);
      if (el.dataset.then === 'toFA') { closeModal(); if (!skipped) { E.finishResign(); E.refreshOffers(); } else toast(`Kept ${n}. ${skipped} starter${skipped > 1 ? 's are' : ' is'} still unsigned: negotiate or let ${skipped > 1 ? 'them' : 'him'} go.`); }
      break;
    }
    case 'letgo': E.resignPlayer(id, false); closeModal(); break;
    case 'toFA': if (!el.dataset.force && pendingResign().starters.length) { leaveResignSheet(); return; } closeModal(); E.finishResign(); E.refreshOffers(); break;
    case 'faSign': {
      const p = G.players[id]; if (!p) return;
      const yrs = E.yearsFor(p), price = E.faPrice(p, yrs), r = E.faOffer(id, price, yrs);
      if (r.signed) { persist(); render(); signPopup(id, price, yrs); return; } toast(r.msg);
      if (r.ok && $('#layer .modal:not(.closing)')) needModal(p.pos);
      break;
    }
    case 'faOpen': faModal(id); return;
    case 'faPitch': { const r = E.faMeet(id, el.dataset.k); persist(); render(); faModal(id, r.msg); return; }
    case 'faYrs': UI.faYrs[id] = +el.dataset.k; UI.faApy[id] = null; faModal(id); return;
    case 'faQuick': { const p = G.players[id], yrs = UI.faYrs[id] || E.yearsFor(p); UI.faApy[id] = Math.round(E.faPrice(p, yrs) * +el.dataset.k * 10) / 10; faModal(id); return; }
    case 'apyStep': { const i = $('#apy-' + id); if (!i) return; i.value = Math.max(1, Math.round((+i.value + +el.dataset.d) * 10) / 10); i.dispatchEvent(new Event('input', {bubbles: true})); return; }
    case 'faSubmit': {
      const p = G.players[id], yrs = UI.faYrs[id] || (G.fa.offers[id] && G.fa.offers[id].yrs) || E.yearsFor(p);
      const v = +($('#apy-' + id) || {}).value; if (!(v > 0)) { toast('Enter a yearly salary.'); return; }
      UI.faApy[id] = v;
      const r = E.faOffer(id, v, yrs); persist(); render();
      if (r.signed) signPopup(id, v, yrs); else faModal(id, r.msg);
      return;
    }
    case 'faCancel': E.faCancel(id); toast('Offer withdrawn.'); break;
    case 'faMatch': case 'faPass': {
      const d = (G.fa.decisions || []).find(x => x.id === id), r = E.faDecide(id, a === 'faMatch'), p = G.players[id];
      persist(); render();
      if (p && p.tm === G.user) signPopup(id, p.cap, p.end - 2026); else if (p && d) popup('Free agency', `${esc(p.n)} signed with the ${esc(G.teams[p.tm].nick)}`, `<div class="signhero">${face(p, 'xl')}<div><div class="kicker">${p.pos} · ${p.ovr} OVR</div><b class="num">${money(p.cap)} × ${p.end - 2026} yr</b><div class="small muted">${a === 'faMatch' ? esc(r.msg) : 'You let him go.'}</div></div></div>`);
      return;
    }
    case 'faWave': {
      const w = G.fa.wave, r = E.faEndWave();
      persist(); render(); wavePopup(r, w); return;
    }
    case 'negOpen': UI.faApy[id] = null; negModal(id); return;
    case 'negYrs': UI.rYrs[id] = +el.dataset.k; UI.faApy[id] = null; negModal(id); return;
    case 'negAsk': case 'negSubmit': {
      const p = G.players[id], yrs = UI.rYrs[id] || E.yearsFor(p), n = E.negStart(id, 're', yrs);
      const v = a === 'negAsk' ? n.ask : +($('#apy-' + id) || {}).value;
      if (!(v > 0)) { toast('Enter a yearly salary.'); return; }
      UI.faApy[id] = v;
      const r = E.negOffer(id, 're', v, yrs); persist(); render();
      if (r.ok) { closeModal(); toast(r.msg); } else negModal(id, r.msg);
      return;
    }
    case 'ddToggle': UI.ddOpen = UI.ddOpen === el.dataset.dd ? null : el.dataset.dd; render(); return;
    case 'ddPick': ddPick(el.dataset.dd, el.dataset.v); UI.ddOpen = null; render(); return;
    case 'toDraft': {
      const d = E.depth(G.user), empty = E.POS_ORDER.filter(pos => d[pos].length < E.STARTERS[pos]);
      if (!el.dataset.force && G.fa && G.fa.wave <= 3 && empty.length) {
        modal(`<div class="sheeth"><div><div class="kicker">Before the draft</div><h3>You have empty starting spots</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
          <p>No starter at <b>${empty.join(', ')}</b>. Free agency is the surest way to fill them; rookies are a gamble. Skip now and the leftovers sign elsewhere.</p>
          <div class="row end"><button class="btn ghost" data-act="toDraft" data-force="1">Skip anyway</button><button class="btn go" data-act="closeModal">Stay in free agency</button></div>`, true);
        return;
      }
      closeModal(); E.finishFA(); E.refreshOffers(); break;
    }
    case 'toMyPick': E.simDraftToUser(); break;
    case 'draftP': {
      const p = G.draft.pool.find(x => x.rank === +el.dataset.rank); if (!p) return;
      const slot = G.draft.order[G.draft.at];
      E.makePick(p); E.simDraftToUser(); persist(); render(); revealPopup(slot.sel, slot.no); return;
    }
    case 'finishDraft': { const live = G.draft.at < G.draft.order.length; E.finishDraft(); UI.cutSel = null; E.refreshOffers(); persist(); render(); if (live || myClass().length) draftRecap(); return; }
    case 'prospect': prospectModal(+el.dataset.rank); return;
    case 'tradeUp': {
      const pk = G.picks.find(x => x.id === id); if (!pk) return;
      UI.partner = pk.owner; UI.get = [id]; UI.give = [];
      const g = E.balanceTrade(UI.partner, [], UI.get);
      if (g) { UI.give = g; toast('Here is what it takes to move up. Review it, then propose.'); } else toast('They will not move that pick for what you have.');
      UI.tview = 'make'; persist(); go('trade'); return;
    }
    case 'cutAuto': UI.cutSel = E.cutPlan(); break;
    case 'cutApply': { const n = UI.cutSel.length; for (const cid of UI.cutSel) E.cutPlayer(cid); UI.cutSel = []; toast(`Released ${n} player${n === 1 ? '' : 's'}.`); break; }
    case 'startS2': { E.startSeason2(); G.offers = []; UI.tab = 'home'; UI.proj = null; persist(); render(); if (G.autoFilled && G.autoFilled.length) fillPopup(G.autoFilled, 'Before kickoff'); return; }
    case 'fillRoster': { const r = E.fillRoster(G.user); persist(); render(); if (r.length) fillPopup(r, 'Roster filled'); else toast('No affordable free agents left. Clear cap space first.'); return; }
    case 'toggle': { const L = UI[el.dataset.side]; const i = L.indexOf(id); i >= 0 ? L.splice(i, 1) : L.push(id); break; }
    case 'clearTrade': UI.give = []; UI.get = []; closeModal(); break;
    case 'faNeedPos': UI.faPos = el.dataset.k; UI.faFit = 'all'; break;
    case 'needsSheet': modal(`<div class="sheeth"><div><div class="kicker">Free agency</div><h3>Needs & depth chart</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>${teamPanel('faNeedPosM', UI.faPos)}<div class="row end"><button class="btn go" data-act="closeModal">Done</button></div>`, true); return;
    case 'faNeedPosM': UI.faPos = el.dataset.k; UI.faFit = 'all'; closeModal(); break;
    case 'tNeedPos': UI.tpos = el.dataset.k === 'ALL' ? null : el.dataset.k; if (UI.tmob === 'panel') UI.tmob = 'get'; break;
    case 'dealSheet': {
      const P = UI.partner, ev = E.evalTrade(P, UI.give, UI.get), ready = UI.give.length && UI.get.length;
      modal(`<div class="sheeth"><div><div class="kicker">Trade with the ${esc(tname(P))}</div><h3>${ready ? (ev.ok ? 'They would take this' : ev.fleece ? 'Too good for you' : ev.ratio >= .85 ? 'Close' : 'Not close yet') : 'Build the deal'}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
        <div class="offerb"><div><div class="lbl">You send</div>${UI.give.length ? assetGroup(UI.give) : '<span class="small muted">Nothing yet</span>'}</div><div><div class="lbl">You get</div>${UI.get.length ? assetGroup(UI.get) : '<span class="small muted">Nothing yet</span>'}</div></div>
        ${ready ? `<div class="meter ${ev.ok ? 'yes' : ev.ratio >= .85 ? 'close' : ''}"><i style="width:${Math.min(100, ev.ratio * 80)}%"></i></div>${fairTag(ev.fair)} <span class="small muted">For your team: <b>${winsTxt(E.winsDelta(G.user, UI.get, UI.give))}</b> a season</span>` : ''}
        ${ev.issues.filter(i => !i.startsWith('Both')).map(i => `<div class="small bad">${esc(i)}</div>`).join('')}
        <div class="row end"><button class="btn ghost" data-act="clearTrade">Clear</button><button class="btn" data-act="balance" ${UI.get.length ? '' : 'disabled'}>Ask what they want</button><button class="btn" data-act="callTeam" ${ready ? '' : 'disabled'}>Call them</button><button class="btn go" data-act="propose" ${ready ? '' : 'disabled'}>Propose</button></div>`, true);
      return;
    }
    case 'draftCalls': { const L = E.draftOffers().filter(o => !(UI.declined || []).includes(o.id)); modal(`<div class="sheeth"><div><div class="kicker">Draft day</div><h3>Teams want your pick</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div><div class="offers">${L.map(o => offerCard(o, true)).join('') || '<p class="muted">No calls right now.</p>'}</div>`, true); return; }
    case 'tabHome': go('home'); return;
    case 'openInbox': UI.tview = 'inbox'; go('trade'); return;
    case 'openMake': UI.tview = 'make'; go('trade'); return;
    case 'counterAccept': { const x = UI.counter.list[+el.dataset.i]; const r = E.doTrade(UI.counter.partner, x.give, x.get); closeModal(); if (r.ok) { UI.give = []; UI.get = []; persist(); render(); tradePopup(UI.counter.partner, x.give, x.get); return; } toast(r.issues[0] || 'It fell apart.'); break; }
    case 'counterEdit': { const x = UI.counter.list[+el.dataset.i]; UI.give = x.give.slice(); UI.get = x.get.slice(); closeModal(); break; }
    case 'pickPartner': UI.partner = el.dataset.t; UI.give = [id]; UI.get = []; UI.tq = ''; { const pkg = E.cached(() => E.buildPackage(UI.partner, id) || E.buildPackage(UI.partner, id, true))(); if (pkg) { UI.get = pkg; toast(`The ${tname(UI.partner)} would give this for ${G.players[id].n}.`); } } break;
    case 'askOffer': { const pid = UI.give[0]; const pkg = E.cached(() => E.buildPackage(UI.partner, pid) || E.buildPackage(UI.partner, pid, true))(); if (pkg) { UI.get = pkg; toast(`Their offer for ${G.players[pid].n}. Review it, then propose.`); } else toast(`The ${tname(UI.partner)} do not have a fit for ${G.players[pid].n}.`); break; }
    case 'balance': { closeModal();
      const g = E.balanceTrade(UI.partner, UI.give, UI.get);
      if (g) { UI.give = g; toast('They added what they want from you. Review it before proposing.'); } else toast('They do not see a deal here. Try asking for less.');
      break;
    }
    case 'propose': { closeModal();
      const r = E.doTrade(UI.partner, UI.give, UI.get);
      if (r.ok) { const g = UI.give.slice(), t = UI.get.slice(); UI.give = []; UI.get = []; persist(); render(); tradePopup(UI.partner, g, t); return; }
      const c = !r.issues.length || r.issues.every(i => i.startsWith('Both')) ? E.counterTrade(UI.partner, UI.give, UI.get) : null;
      if (c) { UI.counter = {partner: UI.partner, list: c}; modal(`<div class="sheeth"><div><div class="kicker">Counteroffer</div><h3>The ${esc(tname(UI.partner))} came back</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
        <p class="muted">Not that deal. But they would do one of these.</p>${c.map((x, i) => { const ev = E.evalTrade(UI.partner, x.give, x.get); return `<div class="offer slim"><div class="offerh"><div><b>${esc(x.label)}</b></div>${fairTag(ev.fair)}</div><div class="offerb"><div><div class="lbl">You get</div>${diffSide(x.get, UI.get)}</div><div><div class="lbl">You send</div>${diffSide(x.give, UI.give)}</div></div><div class="row end"><button class="btn sm" data-act="counterEdit" data-i="${i}">Edit</button><button class="btn sm go" data-act="counterAccept" data-i="${i}">Accept</button></div></div>`; }).join('')}`, true); return; }
      popup('Trade rejected', `The ${esc(tname(UI.partner))} said no`, `<p class="muted">${esc(r.issues[0] || (r.fleece ? 'They know that deal is too good for you.' : 'Not close enough to counter. They value what you offered well below what you asked for.'))}</p>`, 'loss');
      return;
    }
    case 'callTeam': { closeModal();
      const P = UI.partner; UI.talkPick = null;
      E.proposeTrade(P, UI.give.slice(), UI.get.slice());
      talkSheet(P, true); return;
    }
    case 'talkPick': UI.talkPick = UI.talkPick === el.dataset.k ? null : el.dataset.k; talkSheet(UI.partner, false); return;
    case 'talkMove': { UI.talkPick = null; const r = E.talkMove(UI.partner, el.dataset.k, el.dataset.id); if (!r) return; persist(); talkSheet(UI.partner, true); return; }
    case 'talkDeal': {
      const T = E.talkWith(UI.partner), last = T.log[T.log.length - 1];
      if (!last || last.kind !== 'yes') return;
      const r = E.doTrade(UI.partner, last.give, last.get, 'offer'); closeModal();
      if (r.ok) { UI.give = []; UI.get = []; persist(); render(); tradePopup(UI.partner, last.give, last.get); return; }
      toast(r.issues[0] || 'It fell apart at the last second.'); break;
    }
    case 'accept': { const o = (G.offers || []).find(x => x.id === id); const r = E.acceptOffer(id); if (r.ok && o) { persist(); render(); tradePopup(o.from, o.give, o.get, 'Offer accepted'); return; } toast(r.msg); break; }
    case 'decline': G.offers = (G.offers || []).filter(o => o.id !== id); break;
    case 'acceptDraft': { const o = E.draftOffers().find(x => x.id === id); if (!o) return; const r = E.doTrade(o.from, o.give, o.get, 'offer'); closeModal(); if (r.ok) { persist(); render(); tradePopup(o.from, o.give, o.get, 'Traded down'); return; } toast(r.issues[0] || 'That deal fell apart.'); break; }
    case 'declineDraft': UI.declined = (UI.declined || []).concat(id); closeModal(); break;
    case 'counter': {
      const o = el.dataset.draft ? E.draftOffers().find(x => x.id === id) : (G.offers || []).find(x => x.id === id);
      if (!o) return;
      UI.partner = o.from; UI.give = o.give.slice(); UI.get = o.get.slice(); UI.tview = 'make'; closeModal(); go('trade'); toast('Adjust the deal, then propose it.'); return;
    }
    case 'moreOffers': { const before = (G.offers || []).map(o => o.id); const fresh = E.genOffers(4).filter(o => !before.includes(o.id)); G.offers = (G.offers || []).concat(fresh).slice(-6); toast(fresh.length ? `${fresh.length} new offer${fresh.length > 1 ? 's' : ''}.` : 'Nobody new is calling right now.'); break; }
    case 'findTrades': {
      const p = G.players[id]; if (!p) return;
      const list = p.tm === G.user ? E.shopPlayer(id, UI.shopWant || 'any') : E.findPackages(id).map(x => Object.assign(x, {label: x.label + ' · ' + G.teams[x.partner].nick}));
      openFound(id, list); return;
    }
    case 'findFor': { const list = E.findPackages(id).map(x => Object.assign(x, {label: x.label + ' · ' + G.teams[x.partner].nick})); openFound(id, list); return; }
    case 'loadFound': { const x = UI.found.list[+el.dataset.i]; UI.partner = x.partner; UI.give = x.give.slice(); UI.get = x.get.slice(); UI.tview = 'make'; closeModal(); UI.found = null; go('trade'); return; }
    case 'proposeFound': { const x = UI.found.list[+el.dataset.i]; const r = E.doTrade(x.partner, x.give, x.get); closeModal(); UI.found = null; if (r.ok) { persist(); render(); tradePopup(x.partner, x.give, x.get); return; } toast(r.issues[0] || 'They said no.'); break; }
    case 'saveName': {
      const v = ($('#gmName').value || '').trim().slice(0, 40);
      C.gmName = v; saveLocalCareer();
      if (C.db) cloudWrite(`data/users/${C.uid}/profile`, {gmName: v, updatedAt: Date.now()});
      postLeaderboard();
      toast(v ? `Saved. Welcome, GM ${v}.` : 'Name cleared.'); render(); return;
    }
    case 'copy': case 'copyResume': {
      const text = UI.share;
      const fallback = () => { modal(`<div class="sheeth"><h3>Copy this</h3><button class="x" data-act="closeModal" aria-label="Close">×</button></div><p class="small muted">Copy was blocked here. Select the text and copy it.</p><textarea id="shareText" readonly>${esc(text)}</textarea><div class="row end"><button class="btn" data-act="closeModal">Done</button></div>`); const ta = $('#shareText'); if (ta) ta.select(); };
      try { navigator.clipboard.writeText(text).then(() => toast('Copied. Send it and see if they can beat it.'), fallback); } catch (err) { fallback(); }
      return;
    }
    case 'share': openShare(el.dataset.k); return;
    case 'saveCard': saveCard(); return;
    case 'askReset': modal(`<div class="sheeth"><h3>Start over?</h3><button class="x" data-act="closeModal" aria-label="Close">×</button></div><p class="muted">This erases your current game. Your résumé keeps every finished season.</p><div class="row end"><button class="btn" data-act="closeModal">Cancel</button><button class="btn danger" data-act="newgame">Start over</button></div>`); return;
    case 'newgame': try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* storage unavailable */ } G = null; closeModal(); UI.tab = 'home'; render(); window.scrollTo(0, 0); return;
  }
  if (G) persist();
  render();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'partner') { UI.partner = t.value; UI.get = []; UI.tq = ''; render(); }
  else if (t.id === 'faPos') { UI.faPos = t.value; render(); }
  else if (t.id === 'statKey') { UI.statKey = t.value; render(); }
  else if (t.dataset && t.dataset.ryrs) { UI.rYrs[t.dataset.ryrs] = +t.value; render(); }
  else if (t.dataset && t.dataset.yrs) { UI.faYrs[t.dataset.yrs] = +t.value; render(); }
  else if (t.dataset && t.dataset.cut) { const cid = t.dataset.cut; UI.cutSel = t.checked ? UI.cutSel.concat(cid) : UI.cutSel.filter(x => x !== cid); render(); }
});
document.addEventListener('keydown', e => {
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable);
  if (!typing && G && !$('#layer .modal:not(.closing)') && !$('.reel') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key === 'n' || e.key === 'N') { const b = document.querySelector('#bnav .bnext'); if (b) { e.preventDefault(); b.click(); } return; }
    const tabs = {1: 'home', 2: 'roster', 3: 'trade', 4: 'league', 5: 'resume'};
    if (tabs[e.key]) { e.preventDefault(); go(tabs[e.key]); return; }
  }
  if (e.key === 'Escape' && UI.ddOpen) { UI.ddOpen = null; render(); return; }
  if (e.key === 'Escape' && $('#layer').innerHTML) { closeModal(); UI.found = null; }
  if (e.key === 'Enter' && e.target.id === 'tq') { UI.tq = e.target.value; render(); const i = $('#tq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('asset')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'faQ') { UI.faQ = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#faQ'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (err) { /* search inputs may not support it */ } } return; } if (e.target.id && e.target.id.startsWith('apy-')) { const pid = e.target.id.slice(4); UI.faApy[pid] = +e.target.value; const p = G && G.players[pid], b = document.querySelector(`[data-act=faSubmit][data-id="${pid}"]`); if (p && b && G.fa) { const yrs = UI.faYrs[pid] || E.yearsFor(p); b.textContent = +e.target.value + .001 >= E.faPrice(p, yrs) ? 'Sign him now' : G.fa.offers[pid] ? 'Update offer' : 'Make offer'; } } if (e.target.id === 'tq' && !e.target.value && UI.tq) { UI.tq = ''; render(); } });

loadLocalCareer();
Promise.all([fetch('data.json').then(r => r.json()), fetch('heads.json').then(r => r.json()).catch(() => null)])
  .then(([d, h]) => { DATA = d; HEADS = h; render(); connectCareer(); })
  .catch(() => { $('#app').innerHTML = '<p>Could not load the rosters. Reload the page to try again.</p>'; });
})();
