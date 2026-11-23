/* 21-0 UI */
(function () {
'use strict';
let DATA = null, G = null, HEADS = null;
const UI = {tab: 'home', partner: null, give: [], get: [], rview: 'lineup', rosterPos: 'ALL', statKey: null, league: 'standings',
  faFit: 'all', faPos: 'ALL', faYrs: {}, rYrs: {}, faApy: {}, ddOpen: null, cutSel: null, tq: '', found: null, share: ''};
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const money = v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(1) + 'M';
const pct = v => Math.round(v * 100) + '%';
const oc = o => o >= 90 ? 'o90' : o >= 80 ? 'o80' : o >= 68 ? 'o70' : 'o0';
const SAVE_KEY = '21-0-save-v1';
const MODES = {standard: ['Standard', 'Any team.'], worst: ['Worst to first', 'Only the 8 worst rosters. Take one to 21-0.']};
const modeTag = m => m && m !== 'standard' ? `<span class="tag warn">${MODES[m][0]}</span>` : '';
const RANK_LETTER = r => r <= 4 ? 'A' : r <= 12 ? 'B' : r <= 20 ? 'C' : r <= 26 ? 'D' : 'F';

function persist() { try { localStorage.setItem(SAVE_KEY, E.save()); localStorage.setItem(SAVE_KEY + '-ver', String(Date.now())); } catch (e) { /* storage unavailable */ } cloudSave(); }
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
// Rookies show the scouts' range until training camp is over, at final cuts
const inCamp = p => p && p.camp && p.proj;
const ovrBadge = (p, cls) => inCamp(p) ? `<span class="ovrb proj ${cls || ''}" title="Scouts' range. The real rating shows after training camp.">${p.proj[0]}–${p.proj[1]}</span>` : `<span class="ovrb ${cls || ''} ${oc(p.ovr)}">${p.ovr}</span>`;
const ovrNum = p => inCamp(p) ? `${p.proj[0]}–${p.proj[1]}` : p.ovr;
// The answer to anything you propose: big, colored and animated, so a counter or a no can't be missed
const VB_ICON = {yes: '<path d="M5 12.5l4.5 4.5L19 7"/>', counter: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>', no: '<path d="M6 6l12 12M18 6L6 18"/>', warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'};
function vban(kind, title, sub) {
  return `<div class="vban ${kind}" role="status" aria-live="assertive"><span class="vbico" aria-hidden="true"><svg viewBox="0 0 24 24">${VB_ICON[kind] || VB_ICON.info}</svg></span><div><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div></div>`;
}
const cPatch = p => p && p.tm === G.user && E.isCaptain(p.id) ? '<span class="cpatch" title="Captain">C</span>' : '';
function pRow(p, extra) {
  const deal = p.tm === 'FA' ? '' : ` · ${money(p.cap)} thru ${p.end}`;
  return `<div class="prow">${face(p, 'sm')}<div class="pmain"><div class="pn">${pname(p)}${cPatch(p)}</div><div class="psub">${p.pos} · ${Math.floor(p.age)}${deal}${extra ? ' · ' + extra : ''}</div></div>${ovrBadge(p)}</div>`;
}
// One side of a counter, compared with what you offered: what they kept, added, and took out
function diffSide(ids, base) {
  base = base || [];
  const kept = ids.filter(id => base.includes(id)), added = ids.filter(id => !base.includes(id)), gone = base.filter(id => !ids.includes(id));
  return [...kept.map(assetMini), ...added.map(id => `<div class="dnew"><span class="dtag">Added</span>${assetMini(id)}</div>`), ...gone.map(id => `<div class="dgone"><span class="dtag">Removed</span>${assetMini(id)}</div>`)].join('') || '<span class="small muted">Nothing</span>';
}
function assetMini(id) {
  const p = G.players[id];
  if (p) return `<div class="amini">${face(p, 'xs')}<span class="an">${pname(p)}</span><span class="muted small">${p.pos}</span>${ovrBadge(p, "sm")}</div>`;
  const k = G.picks.find(x => x.id === id);
  return `<div class="amini"><span class="face xs pk" aria-hidden="true">R${k ? k.rd : '?'}</span><span class="an">${k ? esc(E.pickLabel(k)) : 'Pick'}</span></div>`;
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
  UI.sheetStack = []; UI.pushSheet = null;
  if (cls === 'win') { buzz(30); sfx('deal'); } else if (cls === 'loss') sfx('bad');
  modal(`<div class="sheeth"><div><div class="kicker">${kicker}</div><h3>${title}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>${body}<div class="row end"><button class="btn go" data-act="closeModal">Got it</button></div>`, true);
  const sh = document.querySelector('.sheet'); if (sh && cls) sh.classList.add(cls);
}
const isPick = id => !G.players[id];
function assetGroup(ids) {
  const pl = ids.filter(id => !isPick(id)), pk = ids.filter(isPick);
  return [...pl, ...pk].map(assetMini).join('') || '<span class="small muted">Nothing</span>';
}
// Assets with an x on each one; mk(id) gives the button's data attributes, or '' for no x
function assetGroupX(ids, mk) {
  if (!ids.length) return '<span class="small muted">Nothing</span>';
  return ids.map(id => { const a = mk(id); return a ? `<div class="xitem">${assetMini(id)}<button class="xs" ${a} aria-label="Take ${esc(E.assetName(id))} out">×</button></div>` : assetMini(id); }).join('');
}
function tradePopup(partner, give, get, how) {
  popup(how || 'Trade complete', `Deal with the ${esc(G.teams[partner].nick)}`, `<div class="offerb tradedone"><div><div class="lbl">You got</div>${assetGroup(get)}</div><div><div class="lbl">You sent</div>${assetGroup(give)}</div></div>`, 'win');
}
function signPopup(id, apy, yrs) {
  const p = G.players[id];
  popup('Signed with you', `${esc(p.n)} joins the ${esc(G.teams[G.user].nick)}`, `<div class="signhero">${face(p, 'xl')}<div><div class="kicker">${p.pos} · ${Math.floor(p.age)} · ${p.ovr} OVR</div><b class="num">${money(apy)} × ${yrs} yr</b><div class="small muted">${money(apy * yrs)} total</div></div></div>`, 'win');
}
function wavePopup(r, wave) {
  const line = (x, mine) => { const p = G.players[x.id]; return `<div class="prow resrow">${face(p, 'sm')}<div class="pmain"><div class="pn">${esc(p.n)} <span class="muted small">${p.pos} ${ovrNum(p)}</span></div><div class="psub">${mine ? 'Signed with you' : `Signed with the ${esc(G.teams[x.t].nick)}`}: ${money(x.apy)} × ${x.yrs} yr${!mine && x.offered === false ? ' · you met with him' : ''}</div></div>${mine ? '<span class="tag good">Yours</span>' : x.t ? badge(x.t, 1) : ''}</div>`; };
  const dec = G.fa.decisions.length;
  popup(`Wave ${wave} results`, r.you.length ? `${r.you.length} signed with you` : dec ? 'Decision time' : r.lost.length ? `${r.lost.length} you talked to went elsewhere` : `Wave ${wave} is over`,
    `${r.you.length ? `<h4 class="sub">Signed with you</h4>${r.you.map(x => line(x, true)).join('')}` : ''}
     ${dec ? vban('counter', `Outbid on ${dec} player${dec > 1 ? 's' : ''}`, `Another team offered more. Outbid them or let ${dec > 1 ? 'them' : 'him'} go on the free agency screen.`) : ''}
     ${r.lost.length ? `<h4 class="sub">Your targets who signed elsewhere</h4>${r.lost.map(x => line(x)).join('')}` : ''}
     ${r.notable.length ? `<h4 class="sub">Around the league</h4>${r.notable.slice(0, 8).map(x => line(x)).join('')}` : ''}
     ${!r.you.length && !r.lost.length && !r.notable.length && !dec ? '<p class="muted">No big names moved.</p>' : ''}${G.fa.wave <= 3 ? `<p class="small muted">Asking prices just dropped about 12% for wave ${G.fa.wave}.</p>` : ''}`);
}
function fairTag(f) {
  const [c, l] = f >= 1.12 ? ['good', 'Great for you'] : f >= .96 ? ['good', 'Fair'] : f >= .85 ? ['warn', 'You pay a bit more'] : ['bad', 'You overpay'];
  return `<span class="tag ${c}">${l}</span>`;
}
function seg(id, opts, cur) {
  return `<div class="seg" role="group">${opts.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-act="seg" data-seg="${id}" data-k="${k}" aria-pressed="${k === cur}">${l}</button>`).join('')}</div>`;
}
const SHEET_NAV = new Set(['box', 'player', 'injurySheet', 'needPos', 'faSheet', 'prospect', 'depthSheet', 'ownerSheet', 'faOpen', 'depthPos', 'findTrades', 'findFor']);
function modal(html, wide) {
  NEEDSET = null;
  if (UI.pushSheet) { (UI.sheetStack = UI.sheetStack || []).push(UI.pushSheet); UI.pushSheet = null; }
  else if (!$('#layer .modal:not(.closing)')) UI.sheetStack = [];
  UI.backing = false;
  const back = '<button class="sback" data-act="sheetBack" aria-label="Back">‹ Back</button>';
  if ((UI.sheetStack || []).length) html = html.includes('<div class="sheeth">') ? html.replace('<div class="sheeth">', '<div class="sheeth">' + back) : `<div class="sbackbar">${back}</div>` + html;
  modal0(html, wide);
}
function modal0(html, wide) { navMark(); clearTimeout(UI.closeT); const had = !!$('#layer .modal:not(.closing)'); const old = $('#layer .sheet'), oldKey = old && (old.querySelector('h3') || {}).textContent, oldTop = old ? old.scrollTop : 0, oldIn = old ? saveScroll(old) : {}; $('#layer').innerHTML = `<div class="modal" data-act="closeModal"><div class="sheet${wide ? ' wide' : ''}" data-stop="1" role="dialog" aria-modal="true">${html}</div></div>`; if (had) { const m = $('#layer .modal'); if (m) m.classList.add('still'); const sh = $('#layer .sheet'); if (sh && oldKey && (sh.querySelector('h3') || {}).textContent === oldKey) { sh.scrollTop = oldTop; restoreScroll(sh, oldIn); } } }
const closeModal = () => {
  UI.sheetStack = []; UI.pushSheet = null;
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
// ---------- cloud save ----------
// Inside Claude, your game also lives in your private area of the page's database, so it follows you to any device.
// A save is gzipped and split into parts under 256 KB; the index document is written last, so a half-written save is never loaded.
const PART = 180000;
const CLOUD = {t: null};
async function packSave(str) {
  const gz = new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = ''; for (let i = 0; i < gz.length; i += 0x8000) bin += String.fromCharCode.apply(null, gz.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function unpackSave(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
function cloudSave() {
  if (!C.db || !G || typeof CompressionStream === 'undefined') return;
  clearTimeout(CLOUD.t);
  CLOUD.t = setTimeout(async () => {
    try {
      const b64 = await packSave(E.save()), n = Math.ceil(b64.length / PART), base = `data/users/${C.uid}/profile`, ver = Date.now();
      for (let i = 0; i < n; i++) cloudWrite(`${base}/save/${i}`, {ver, part: b64.slice(i * PART, (i + 1) * PART)});
      cloudWrite(`${base}/savemeta/latest`, {ver, parts: n, team: G.user, season: G.season, updatedAt: ver});
    } catch (e) { /* the device save still has it */ }
  }, 4000);
}
function cloudClear() { if (C.db) cloudWrite(`data/users/${C.uid}/profile/savemeta/latest`, {ver: Date.now(), cleared: true}); }
// On open: if your account has a newer game than this device, pick it up
async function cloudResume(db, uid) {
  if (typeof DecompressionStream === 'undefined') return;
  const base = `data/users/${uid}/profile`, meta = await db.doc(`${base}/savemeta/latest`).get();
  if (!meta.exists) return;
  const m = meta.data();
  let localVer = 0; try { localVer = +(localStorage.getItem(SAVE_KEY + '-ver') || 0); } catch (e) { /* storage unavailable */ }
  if (m.cleared || !m.parts || m.ver <= localVer) return;
  const parts = await Promise.all(Array.from({length: m.parts}, (_, i) => db.doc(`${base}/save/${i}`).get()));
  if (parts.some(d => !d.exists || d.data().ver !== m.ver)) return;
  const str = await unpackSave(parts.map(d => d.data().part).join(''));
  try { localStorage.setItem(SAVE_KEY, str); localStorage.setItem(SAVE_KEY + '-ver', String(m.ver)); } catch (e) { return; }
  const b = document.createElement('button'); b.dataset.act = 'resume'; b.hidden = true; document.body.appendChild(b); b.click(); b.remove();
  toast('Picked up your game from your account.');
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
    cloudResume(db, uid).catch(() => { /* the device save still works */ });
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
  for (const s of Object.keys(G.playoffs || {}).map(Number)) {
    const P = G.playoffs[s];
    if (!P || !P.champ) continue;
    const f = E.userFinish(s), gm = E.goalMet(s);
    seasons[s] = {w: f.w, l: f.l, rw: f.rw, rl: f.rl, label: f.label, champ: P.champ === G.user, perfect: !!f.perfect, po: f.label !== 'Missed playoffs', sb: P.champ === G.user || f.label === 'Lost in the Super Bowl', goal: gm ? gm.goal : '', met: gm ? !!gm.met : null};
  }
  const run = Object.assign({}, prev, {team: G.user, startedAt: G.startedAt, updatedAt: Date.now(), startOvr: G.start ? G.start.ovr : G.startOvr, startRank: G.startRank || prev.startRank || null, seasons, trades: G.trades.length, goals: Object.values(G.goalsHit || {}).reduce((a, b) => a + b, 0), mode: G.mode || 'standard', fired: G.fired || null, extended: (G.extended || []).length});
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
    ['1 · Week 1 of 2026', 'Make trades before kickoff if you want, then Weeks 1 to 8 play out.'],
    ['2 · Week 9 trade deadline', 'Your one chance to trade in 2026. Take an offer from your inbox or build your own deal.'],
    ['3 · 2027 offseason', 'This is where you build the team: re-sign, free agency, the draft, then the final roster.'],
    ['4 · 2027 season', 'One more trade deadline, then one more shot at 21-0.'],
    ['The gold Next button', 'It always does the next step. On a computer, N does the same.']]],
  pre: ['Before the deadline', [
    ['What happens now', 'Trades are open until kickoff. The next window opens after Week 9.'],
    ['One game at a time', 'Play Week N plays just your next game and shows how it went. Or sim straight to the deadline.'],
    ['Team needs', 'Letter grades rank each position against the league. F and D spots are what to buy at the deadline.'],
    ['Outlook', 'Projected wins and odds come from hundreds of simulated seasons with the current rosters.']]],
  deadline: ['Trades', [
    ['Offers', 'Teams send offers. Every offer here is one they would accept.'],
    ['Trade block', 'Put your players up and teams make offers right there. You also see who other teams are shopping.'],
    ['Build a trade', 'Pick a team from the grid (it shows who wants your players), then what you want and what you send. Filter by position. The meter shows how they feel.'],
    ['Make the call', 'Every deal is a phone call. Their GM starts above fair value and comes down as you talk. Every answer comes with their reasons, and the bar at the top shows your offer against what they need. Lowballs and bluffs that miss cost patience.'],
    ['Ask around', 'On any of your players\' cards: see what teams would give for him, in picks, players or either.'],
    ['Picks', 'Seven rounds, like the real draft. Late picks are how role players change teams.'],
    ['Wins', 'Every trade shows what it is worth in wins a season for your team.']]],
  playoffs: ['Playoffs', [['How it works', 'Eight teams per conference, no byes. Win four in a row for the title. No moves during the playoffs.']]],
  progress: ['Progression', [['Ratings changed', 'Young players with upside grew, older players declined, and a big season can lift a rating more than one bad year can sink it.']]],
  resign: ['Re-signing', [
    ['Pay', 'Pay the asking price and he stays.'],
    ['Negotiate', 'Offer less. He can counter or walk, and his patience runs out after a few tries.'],
    ['Do nothing', 'Anyone you do not re-sign leaves for free agency when you move on. Starters are marked.'],
    ['Keep my starters', 'Re-signs every starter you can afford in one tap.']]],
  fa: ['Free agency', [
    ['Sign', 'Pay his ask and he signs on the spot.'],
    ['Offer less', 'Tap a player. He answers right away: yes, a counter you can accept, or no. Three misses and he stops talking until the next wave.'],
    ['Waves', 'When a wave ends, other teams sign players. You hear about anyone you talked to who went elsewhere.'],
    ['Prices', 'Asking prices drop about 12% each wave, but the best players go fast.']]],
  draft: ['The draft', [
    ['On the clock', 'The bar up top shows who is picking and how far away your next pick is. The strip below it shows the picks just made and the ones coming up.'],
    ['Big board', 'Seven rounds. 2027 is the real class at the top. Scouts give a range, and the real rating shows the moment a player is drafted.'],
    ['Draft order', 'Every pick, round by round, with who took whom. Gold rows are yours.'],
    ['Trades', 'Teams call to trade up into your pick. You can also trade up yourself.'],
    ['Auto', 'Auto-draft picks the best fit for your needs, handy for the late rounds.'],
    ['Next year', 'League › More shows the next class long before draft day.']]],
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
    <div class="row helpfoot">${G ? '<button class="btn ghost dangertxt" data-act="askReset">Start over</button>' : ''}${k !== 'run' ? '<button class="btn ghost" data-act="help" data-k="run">How a run works</button>' : G ? '<button class="btn ghost" data-act="guide">Show me around</button>' : ''}<button class="btn go" data-act="closeModal">Got it</button></div>`, true);
}
// ---------- first-time guide ----------
// Four stops, one thing lit up at a time: the goal, the button that moves the season, trades, and your roster.
const GUIDE = [
  {sel: ['.kpistrip'], k: 'Your job', t: 'Win, and keep the owner happy', b: 'These are your odds this season. The owner sets a goal, and you get three season goals of your own on top.'},
  {sel: ['#hdr .sidenext', '#bnav .bnext'], k: 'Moving forward', t: 'This button plays the season', b: 'It always does the next thing: play a week, sim to the trade deadline, start the offseason. Nothing happens until you press it.'},
  {sel: ['#hdr nav.tabs [data-tab=trade]', '#bnav [data-tab=trade]'], k: 'Making moves', t: 'Trades are where you win', b: 'Teams send offers, and you can call any GM. Every offer shows what it does to your wins this season.'},
  {sel: ['#hdr nav.tabs [data-tab=roster]', '#bnav [data-tab=roster]'], k: 'Your team', t: 'Check your roster', b: 'Your lineup, your biggest needs, and every player\'s rating with the reasons behind it. Then press play.'},
];
function guideTarget(i) {
  for (const q of GUIDE[i].sel) { const el = document.querySelector(q); if (el) { const r = el.getBoundingClientRect(); if (r.width && r.height) return r; } }
  return null;
}
function showGuide(i) {
  UI.guide = i;
  let g = $('#guide');
  if (i == null || i >= GUIDE.length) { if (g) g.remove(); UI.guide = null; return; }
  if (!g) { g = document.createElement('div'); g.id = 'guide'; document.body.appendChild(g); }
  const r = guideTarget(i), S = GUIDE[i], pad = 6;
  if (r && (r.top < 0 || r.bottom > innerHeight)) { window.scrollTo({top: Math.max(0, scrollY + r.top - 120)}); return setTimeout(() => showGuide(i), 60); }
  const spot = r ? `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px` : 'left:50%;top:50%;width:0;height:0';
  const W = Math.min(340, innerWidth - 32), below = r && r.bottom + 220 < innerHeight;
  let left = r ? Math.min(Math.max(16, r.left), innerWidth - W - 16) : (innerWidth - W) / 2;
  let top = r ? (below ? r.bottom + 16 : Math.max(16, r.top - 16 - 210)) : innerHeight / 2 - 110;
  if (r && r.right + W + 32 < innerWidth && r.height > 120) { left = r.right + 20; top = Math.max(16, Math.min(r.top, innerHeight - 240)); }   // a tall target: put the tip beside it
  if (r && r.left < 260 && r.width < 260 && innerWidth >= 1100) { left = r.right + 20; top = Math.max(16, Math.min(r.top - 20, innerHeight - 240)); }      // sidebar items: tip to the right
  g.innerHTML = `<div class="gspot" style="${spot}"></div><div class="gtip" role="dialog" aria-label="${esc(S.t)}" style="left:${left}px;top:${top}px">
    <div class="kicker">${esc(S.k)} · ${i + 1} of ${GUIDE.length}</div><h3>${esc(S.t)}</h3><p>${esc(S.b)}</p>
    <div class="gfoot"><span class="gdots">${GUIDE.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</span><span class="row nowrap"><button class="btn ghost sm" data-act="guideSkip">Skip</button><button class="btn go sm" data-act="guideNext">${i === GUIDE.length - 1 ? 'Let\'s go' : 'Next'}</button></span></div></div>`;
}
addEventListener('resize', () => { if (UI.guide != null) showGuide(UI.guide); });
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
  if (p === 'offseason') return `${G.season} offseason · ${({progress: 'Progression', resign: 'Re-sign', fa: 'Free agency', draft: 'Draft', cutdown: 'Final roster'})[G.step]}`;
  if (p === 'final') return 'Final results';
  return '';
}
// Trades are open before Week 1, at the Week 9 deadline and all offseason
function tradeOpen() { return G && (G.phase === 'deadline' || G.phase === 'offseason' || ((G.phase === 'preseason' || G.phase === 'season') && G.week < E.DEADLINE_WEEK)); }
// Weeks until the deadline, in words: "3 weeks left", "Deadline is now", or null once it has passed
function deadlineLine() {
  if (!G || G.phase === 'offseason') return null;
  if (G.phase === 'deadline') return 'Deadline day: last chance to trade until the offseason';
  if ((G.phase === 'preseason' || G.phase === 'season') && G.week < E.DEADLINE_WEEK) { const n = E.DEADLINE_WEEK - G.week; return `Trade deadline after Week ${E.DEADLINE_WEEK} · ${n} week${n > 1 ? 's' : ''} left`; }
  return null;
}
function deadlineBanner() {
  if (!G || G.phase !== 'deadline') return '';
  const n = (G.offers || []).length;
  return `<button class="dlbanner" data-act="openInbox"><span class="dlclock" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2.5h6"/></svg></span>
    <span class="dlmain"><span class="kicker">Trade deadline</span><b>Last chance to trade this season</b><span class="small">Trades close when you play Week ${E.DEADLINE_WEEK + 1}. They reopen in the offseason. Free agents can still be signed.</span></span>
    <span class="dlgo">${n ? `${n} offer${n > 1 ? 's' : ''} waiting` : 'Make a trade'} ›</span></button>`;
}
const offerCount = () => tradeOpen() ? ((G.offers || []).length + (G.step === 'draft' ? E.draftOffers().length : 0)) : 0;

const TAB_ICON = {home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', roster: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.8 14.2c2.8.1 5 2.2 5.7 5.8"/>',
  trade: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>', league: '<path d="M5 20V10M12 20V4M19 20v-7"/>', resume: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4M12 14v3M8.5 20h7"/>'};
function nextAction() {
  if (!G) return null;
  const P = G.phase, S = G.step;
  if ((P === 'preseason' || P === 'season') && G.week === 0) return {label: 'Play Week 1', act: 'playWeek', sub: `${G.season} season preview`, alt: {label: 'Sim to deadline', act: 'toDeadline'}};
  if (P === 'preseason' || P === 'season') return G.week < E.DEADLINE_WEEK ? {label: 'Sim to the trade deadline', act: 'toDeadline', sub: `Week ${G.week + 1} · deadline in ${E.DEADLINE_WEEK - G.week} wk${E.DEADLINE_WEEK - G.week > 1 ? 's' : ''}`} : {label: 'Sim rest of season', act: 'simRest', sub: `${G.season} · Week ${G.week + 1}`};
  if (P === 'deadline') { const n = offerCount(); return {label: 'Sim rest of season', act: 'simRest', sub: `Trade deadline${n ? ` · ${n} offer${n > 1 ? 's' : ''} waiting` : ': last chance'}`}; }
  if (P === 'playoffs') { const R = G.playoffs[G.season]; return {label: `Play the ${E.ROUND_NAMES[R.round]}`, act: 'poNext', sub: `${G.season} playoffs`, alt: {label: 'Skip', act: 'poSkip'}}; }
  if (P === 'seasondone' && G.fired && !(G.season === 2027 && !G.reported)) return {label: 'Pick a new team', act: 'newgame', sub: 'You were fired'};
  if (P === 'seasondone') return G.season === 2027 && !G.reported ? {label: 'See final results', act: 'final', sub: '2027 is over'} : {label: `Start the ${G.season + 1} offseason`, act: 'offseason', sub: `${G.season} is over`};
  if (P === 'offseason') {
    if (S === 'progress') return {label: 'Next: re-sign players', act: 'toResign', sub: 'Offseason · step 1 of 5'};
    if (S === 'resign') { const n = pendingResign().starters.length; return {label: 'Next: free agency', act: 'toFA', sub: n ? `${n} starter${n > 1 ? 's' : ''} unsigned` : 'Offseason · step 2 of 5'}; }
    if (S === 'fa') {
      if ((G.fa.decisions || []).length) return {label: 'Match or let go', act: 'tabHome', sub: `${G.fa.decisions.length} decision${G.fa.decisions.length > 1 ? 's' : ''} waiting`};
      return G.fa.wave <= 3 ? {label: `End wave ${G.fa.wave}`, act: 'faWave', sub: `Free agency · wave ${G.fa.wave} of 3`, alt: {label: 'Draft', act: 'toDraft'}} : {label: 'Next: the draft', act: 'toDraft', sub: 'Free agency is over'};
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
  const SHORT = {playWeek: 'Week 1', toDeadline: 'Deadline', simRest: 'Sim rest', poNext: 'Play', offseason: 'Offseason', final: 'Results', toResign: 'Re-sign', toFA: 'Free agency', faWave: 'End wave', toDraft: 'Draft',
    toMyPick: 'My pick', finishDraft: 'Finish', fillRoster: 'Fill roster', startS2: 'Start season', runback: 'Run back', tabHome: 'Go'};
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
  document.body.classList.toggle('ingame', !!G);
  try { document.title = G ? `${rec(G.user)} ${G.teams[G.user].nick} · 21-0` : '21-0: Run the Front Office'; } catch (e) { /* title is cosmetic */ }
  if (!G) {
    $('#hdr').innerHTML = `<div class="hbar"><button class="logo" data-tab="home" aria-label="21-0 home">21<span>-</span>0</button><div class="hmeta">Run the Front Office</div>
      <div class="hright"><button class="btn ghost sm" data-tab="${UI.tab === 'resume' ? 'home' : 'resume'}">${UI.tab === 'resume' ? 'Pick a team' : 'Your résumé'}</button></div></div>`;
    return;
  }
  const tr = E.teamRating(G.user), cap = G.cap[G.season], pay = E.payroll(G.user);
  const rank = E.teamList().map(t => E.teamRating(t).ovr).filter(o => o > tr.ovr).length + 1;
  const n = offerCount();
  const tabs = [['home', 'Home'], ['roster', 'Roster'], ['trade', 'Trade'], ['league', 'League'], ['resume', 'Résumé']];
  const a = nextAction();
  $('#hdr').innerHTML = `<div class="hbar">
    <button class="logo" data-tab="home" aria-label="Home" title="Shortcuts: N for the next step, 1 to 5 for sections">21<span>-</span>0</button>
    <div class="hteam">${badge(G.user)}<div class="hmeta"><b><em class="tfull">${esc(G.teams[G.user].name)}</em><em class="tnick">${esc(G.teams[G.user].nick)}</em>${perfectNow() ? ' <i class="perfect" title="Still unbeaten">Perfect</i>' : ''}</b><span>${esc(phaseLabel())}</span></div></div>
    <div class="hstats">
      <div class="stat"><b class="num">${rec(G.user)}</b><span>${(() => { const k = E.streak(G.user, G.season); return k && G.phase !== 'offseason' ? `<em class="${k.win ? 'good' : 'bad'}">${k.win ? 'W' : 'L'}${k.n}</em> streak` : 'Record'; })()}</span></div>
      <div class="stat"><b class="num ${oc(tr.ovr)}">${tr.ovr}</b><span>OVR · #${rank}</span></div>
      <div class="stat mobcap"><b class="num ${pay > cap ? 'bad' : ''}">${money(cap - pay).replace('.0M', 'M')}</b><span>Cap free</span></div>
    </div>
    <div class="capbox"><div class="caprow"><span>${G.season} cap</span><span class="num"><b>${money(cap - pay)}</b> free</span></div>
      <div class="capbar ${pay > cap ? 'over' : ''}"><i style="width:${Math.min(100, pay / cap * 100)}%"></i></div></div>
  </div>
  <nav class="tabs" aria-label="Sections">
    ${a ? `<button class="sidenext" data-act="${a.act}" ${a.k ? `data-k="${a.k}"` : ''} title="Shortcut: N"><span class="kicker">${esc(a.sub || 'Next')}</span><b>${esc(a.label)}</b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg></button>` : ''}
    ${tabs.map(([k, l]) => `<button data-tab="${k}" class="${UI.tab === k || (k === 'league' && UI.tab === 'league') ? 'on' : ''} ${k === 'resume' ? 'minor' : ''}" aria-current="${UI.tab === k ? 'page' : 'false'}"><svg viewBox="0 0 24 24" aria-hidden="true">${TAB_ICON[k]}</svg><span>${l}</span>${k === 'trade' && n ? ` <span class="count">${n}</span>` : k === 'trade' && tradeOpen() ? ' <span class="dot" aria-label="open"></span>' : ''}</button>`).join('')}
    <span class="tabtools">${a && UI.tab !== 'home' ? `<button class="btn go sm tabnext" data-act="${a.act}" title="Shortcut: N">Next: ${esc(a.label.replace(/^Next: /, ''))}</button>` : ''}<button class="btn ghost sm sidelink" data-act="guide">How to play</button><button class="btn ghost sm sidelink dangertxt" data-act="askReset">Start over</button><button class="ibtn2" data-act="help" data-k="${helpKey()}" aria-label="How this works" title="How this works">?</button></span></nav>`;
}

// ---------- team picker ----------
// First visit: what the game is, how you win, how you build, then pick a team. Skippable, replayable from the picker.
const ONB = [
  {k: 'Welcome', t: 'You run the front office', b: 'Pick an NFL team with its real 2026 roster, contracts and cap. You do not call plays. You build the team, and the games play out.', ico: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'},
  {k: 'The goal', t: 'Go 21-0', b: '17-0 in the regular season, then four playoff wins. You get two seasons, 2026 and 2027. The owner sets a goal each year, and if you keep missing it you can be fired.', ico: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4M12 14v3M8.5 20h7"/>'},
  {k: 'How you build', t: 'Trade, sign, draft', list: [['Trade', `Call any GM and negotiate. Trades are open every week until the deadline after Week 9, then all offseason.`], ['Sign', 'Pick up free agents any week of the season, and bid on the big names in the offseason.'], ['Draft', 'Seven rounds of the real 2027 class. Scouts can be wrong.']], ico: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>'},
  {k: 'Your call', t: 'Pick a team', b: 'A strong roster is the easier path to 21-0. A weak one is the bigger story. Tap a team to see its rating, cap space and what the owner expects.', ico: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>'},
];
let ONB_SEEN = false;
try { ONB_SEEN = localStorage.getItem('21-0-onboard') === '1'; } catch (e) { /* storage unavailable */ }
function renderOnboarding() {
  const i = Math.min(UI.onbStep || 0, ONB.length - 1), S = ONB[i], last = i === ONB.length - 1;
  $('#app').innerHTML = `<section class="onb"><div class="onbcard rise">
    <div class="onbico"><svg viewBox="0 0 24 24" aria-hidden="true">${S.ico}</svg></div>
    <div class="kicker">${esc(S.k)} · ${i + 1} of ${ONB.length}</div>
    <h1 class="display onbt">${esc(S.t)}</h1>
    ${S.b ? `<p class="lead">${esc(S.b)}</p>` : ''}
    ${S.list ? `<div class="onblist">${S.list.map(([h, t]) => `<div><b>${esc(h)}</b><span>${esc(t)}</span></div>`).join('')}</div>` : ''}
    <div class="onbfoot"><span class="gdots">${ONB.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</span>
      <span class="row nowrap">${i ? '<button class="btn ghost" data-act="onbBack">Back</button>' : '<button class="btn ghost" data-act="onbDone">Skip</button>'}<button class="btn go lg" data-act="${last ? 'onbDone' : 'onbNext'}">${last ? 'Pick a team' : 'Next'}</button></span></div>
  </div></section>`;
}
function renderPicker() {
  if (!ONB_SEEN && (!hasSave() || UI.onbStep != null)) return renderOnboarding();
  E.newGame(DATA, 'KC', 1);
  const tmp = E.G;
  const rows = Object.keys(DATA.teams).map(t => { const r = E.teamRating(t), qb = r.d.QB[0]; return {t, ovr: r.ovr, qb, cap: tmp.cap[2026] - E.payroll(t), div: DATA.teams[t].div}; });
  rows.forEach(r => { r.rank = rows.filter(x => x.ovr > r.ovr).length + 1; });
  const worst8 = new Set(rows.slice().sort((a, b) => a.ovr - b.ovr || a.t.localeCompare(b.t)).slice(0, 8).map(r => r.t));
  const coached = teamCareer();
  const divs = {};
  rows.forEach(r => (divs[r.div] = divs[r.div] || []).push(r));
  const order = ['AFC East', 'AFC North', 'AFC South', 'AFC West', 'NFC East', 'NFC North', 'NFC South', 'NFC West'];
  const goal = rank => [[4, 'Win it all'], [10, 'Deep run'], [18, 'Playoffs'], [25, 'Winning record'], [32, 'Show progress']].find(g => rank <= g[0])[1];
  $('#app').innerHTML = `
  <section class="hero picker-hero"><div>
    <h1 class="display">Go 21-0.</h1>
    <p class="lead">17-0, then four playoff wins. Pick a team. <button class="linkbtn" data-act="onbAgain">How it works</button> · <button class="linkbtn" data-act="modeSheet">${(UI.mode || 'standard') === 'standard' ? 'Try Worst to first' : 'Worst to first is on'}</button></p>
  </div>${hasSave() ? `<button class="btn go lg" data-act="resume">Resume saved game</button>` : ''}</section>
  <div class="mobonly confseg">${seg('pconf', [['AFC', 'AFC'], ['NFC', 'NFC']], UI.pconf || 'AFC')}</div>
  <div class="pickwrap show-${UI.pconf || 'AFC'}">${order.map(d => `<div class="div-${d.slice(0, 3)}"><h2 class="divh">${d}</h2><div class="teams">${(divs[d] || []).sort((a, b) => b.ovr - a.ovr).map(r => { const c = coached[r.t]; return `
    <button class="tcard ${UI.mode === 'worst' && !worst8.has(r.t) ? 'locked' : ''}" data-act="pick" data-t="${r.t}" ${UI.mode === 'worst' && !worst8.has(r.t) ? 'disabled title="Worst to first: bottom 8 rosters only"' : ''}>${badge(r.t)}<div class="tmid"><div class="tn">${esc(DATA.teams[r.t].name)}</div>
    ${c ? `<div class="ts gold">${c.titles ? c.titles + (c.titles > 1 ? ' titles' : ' title') : 'Coached'}</div>` : ''}</div>
    <div class="to ${oc(r.ovr)}"><b>${r.ovr}</b><span>#${r.rank}</span></div></button>`; }).join('')}</div></div>`).join('')}</div>
  <p class="legal">Unofficial fan project, not affiliated with the NFL, the NFLPA or any team. Names and photos belong to their owners. Stats, rosters, snap counts and trades come from <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener">nflverse</a> (CC BY 4.0). Ratings, values and results are simulated estimates.</p>`;
}

// ---------- outlook / expectations ----------
function confMeter() {
  const c = G.conf == null ? 55 : G.conf, last = (G.confLog || []).slice(-1)[0];
  const col = c >= 55 ? 'var(--good)' : c >= 35 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="conf"><div class="row" style="justify-content:space-between"><span class="kicker" style="color:var(--muted)">Owner confidence</span><b style="color:${col}">${E.confLabel(c)} · ${c}</b></div>
    <div class="gbar" title="${last ? esc((last.d >= 0 ? '+' : '') + last.d + ': ' + last.why) : ''}"><i style="width:${c}%;background:${col}"></i></div></div>`;
}

// ---------- needs ----------
function injuryCard() {
  const d = E.depth(G.user);
  const all = E.roster(G.user).filter(p => p.inj), wouldStart = p => { const L = d[p.pos], last = L[E.STARTERS[p.pos] - 1]; return !last || p.ovr > last.ovr; };
  const hurt = all.filter(wouldStart).sort((a, b) => b.ovr - a.ovr), backups = all.length - hurt.length;
  if (!hurt.length) return '';
  return `<div class="card injcard"><div class="cardh"><h3>Injured starters</h3><span class="tag bad">${hurt.length} out</span></div>${hurt.slice(0, 4).map(p => { const sub = d[p.pos][0]; return `<div class="prow resrow">${face(p, 'sm')}<div class="pmain"><div class="pn">${pname(p)} <span class="muted small">${p.pos} ${ovrNum(p)}</span></div><div class="psub">${p.injW === undefined || p.injW === 99 ? 'Out for the season' : `Back in about ${p.injW} week${p.injW > 1 ? 's' : ''}`}${sub ? ` · ${esc(sub.n)} (${sub.ovr}) starts` : ''}</div></div>${midseasonOpen() ? `<button class="btn sm" data-act="faSheet" data-k="${p.pos}">Replace</button>` : ''}</div>`; }).join('')}${backups ? `<div class="small muted injmore">Plus ${backups} backup${backups > 1 ? 's' : ''} out.</div>` : ''}</div>`;
}
// Sign a free agent mid-season, usually to replace an injured starter
const midseasonOpen = () => G && (G.phase === 'deadline' || G.phase === 'playoffs' || ((G.phase === 'preseason' || G.phase === 'season')));
function faSheet(pos) {
  UI.faSheetPos = pos || UI.faSheetPos || 'ALL';
  const d = E.depth(G.user), space = E.capSpace(G.user);
  const L = E.faPool().filter(p => inGroup(p.pos, UI.faSheetPos) || p.pos === UI.faSheetPos).slice(0, 30);
  modal(`<div class="sheeth"><div><div class="kicker">Free agents · ${money(space)} cap space</div><h3>Sign a free agent</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <p class="small muted">Signed for the rest of the season at about half his offseason price.</p>
    ${posChips('faSheetPos', UI.faSheetPos)}
    <div class="plist">${L.map(p => { const st = d[p.pos][E.STARTERS[p.pos] - 1], up = st ? p.ovr - st.ovr : p.ovr, price = E.midseasonPrice(p); return `<div class="trow">${pRow(p, `<span class="${up > 0 ? 'gold' : ''}">${!st ? 'Fills an empty spot' : up > 0 ? '+' + up + ' over your starter' : 'depth'}</span>`)}<button class="btn sm go" data-act="midSign" data-id="${p.id}" ${price > space ? 'disabled title="Not enough cap space"' : ''}>Sign ${money(price)}</button></div>`; }).join('') || '<p class="muted">Nobody available at that position.</p>'}</div>`, true);
}
function injuryPopup(mark) {
  if (G.phase === 'seasondone') return false;
  const L = (G.injLog || []).slice(mark).filter(x => G.players[x.id] && G.players[x.id].tm === G.user && G.players[x.id].inj);
  if (!L.length) return false;
  const d = E.depth(G.user);
  popup('Injury report', `${L.length} of your starters got hurt`, `<p class="small muted">The sim does not stop for injuries, so here is what happened. Backups moved up automatically. You can change the depth chart in the Roster tab.</p>${L.map(x => { const p = G.players[x.id], sub = d[p.pos][0]; return `<div class="prow resrow">${face(p, 'sm')}<div class="pmain"><div class="pn">${esc(p.n)} <span class="muted small">${p.pos} ${ovrNum(p)}</span></div><div class="psub">Hurt in Week ${x.week} · ${x.wk === 99 ? 'out for the season' : `out about ${x.wk} week${x.wk > 1 ? 's' : ''}`}${sub ? ` · ${esc(sub.n)} (${sub.ovr}) took over` : ''}</div></div><span class="tag ${x.wk === 99 ? 'bad' : 'warn'}">${x.wk === 99 ? 'Season' : x.wk + ' wk'}</span></div>`; }).join('')}<div class="row" style="margin-top:10px"><button class="btn" data-act="faSheet" data-k="${G.players[L[0].id].pos}">Find a replacement</button></div>`, 'loss');
  return true;
}
function needsList(limit) {
  const N = E.teamNeeds();
  return `<div class="needs">${N.slice(0, limit || N.length).map(n => `
    <button class="need" data-act="needPos" data-pos="${n.pos}">
      <span class="ng g${RANK_LETTER(n.rank)}">${RANK_LETTER(n.rank)}</span>
      <span class="nmain"><b>${n.pos}</b><span class="nfaces">${n.starters.map(p => face(p, 'xs')).join('')}</span>${n.starters.length ? '' : '<span class="small muted">Empty</span>'}</span>
      <span class="nright"><span class="tag ${n.level === 'High' ? 'bad' : n.level === 'Medium' ? 'warn' : ''}">${n.level}</span></span>
    </button>`).join('')}</div>`;
}
function needModal(pos) {
  const T = E.upgradeTargets(pos);
  const L = E.depth(G.user)[pos];
  const tierBlock = (tiers, kind) => tiers.map(t => `<div class="tierh"><b>${t.tier}</b><span class="small muted">${t.note}</span></div>${t.list.map(x => kind === 'fa'
    ? `<div class="trow">${pRow(x.p, `<span class="gold">+${x.gain}</span> · asks ${money(x.price)} · interest ${x.interest}${x.fits ? '' : ' · <span class="bad">over your cap</span>'}`)}<button class="btn sm go" data-act="faOpen" data-id="${x.p.id}" data-k="offer">Offer</button></div>`
    : `<div class="trow">${pRow(x.p, `<span class="gold">+${x.gain}</span> · ${esc(x.why)} · costs about ${pickEquiv(x.cost)}${x.fits ? '' : ' · <span class="warn">send salary back</span>'}`)}<button class="btn sm" data-act="findFor" data-id="${x.p.id}">Price it</button></div>`).join('')}`).join('');
  let fa = T.fa.length ? `<h4 class="sub">Free agents</h4>${tierBlock(T.fa, 'fa')}` : '';
  if (!fa && midseasonOpen() && G.phase !== 'playoffs' && G.phase !== 'offseason') {
    const space = E.capSpace(G.user), L = E.faPool().filter(p => p.pos === pos && p.ovr > T.worst - 3).slice(0, 5);
    if (L.length) fa = `<h4 class="sub">Free agents · sign today</h4>${L.map(p => { const price = E.midseasonPrice(p); return `<div class="trow">${pRow(p, `<span class="${p.ovr > T.worst ? 'gold' : ''}">${p.ovr > T.worst ? '+' + (p.ovr - T.worst) : 'depth'}</span> · ${money(price)} for the season${price > space ? ' · <span class="bad">not enough cap space</span>' : ''}`)}<button class="btn sm go" data-act="midSign" data-id="${p.id}" ${price > space ? 'disabled' : ''}>Sign</button></div>`; }).join('')}`;
  }
  const tr = tradeOpen() && T.tr.length ? `<h4 class="sub">Trade targets</h4>${tierBlock(T.tr, 'tr')}` : '';
  modal(`<div class="sheeth"><div><div class="kicker">${pos} · your starter is ${T.worst} OVR</div><h3>Upgrade ${pos}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="depthmini">${L.map((p, i) => `<span class="${i < E.STARTERS[pos] ? 'st' : ''}">${face(p, 'xs')} ${esc(lastName(p.n))} <b class="${inCamp(p) ? '' : oc(p.ovr)}">${ovrNum(p)}</b></span>`).join('')}</div>
    ${fa}${tr}${!fa && !tr ? `<p class="muted">${tradeOpen() ? 'Nobody available is a real upgrade here.' : `Trades are closed: ${G.phase === 'playoffs' ? 'no trades during the playoffs' : `the deadline after Week ${E.DEADLINE_WEEK} has passed`}. They reopen in the offseason.`}</p>` : ''}
    <div class="row end"><button class="btn" data-act="closeModal">Done</button></div>`, true);
}

// ---------- offers ----------
function offerCard(o, draft) {
  const ev = E.evalTrade(o.from, o.give, o.get);
  // the one line that decides it: what this does to your team this season
  const dw = E.winsDelta(G.user, o.get, o.give), onlyPicks = o.get.every(id => !G.players[id]);
  const ch = E.chemTrade(o.give, o.get).d, d0 = E.depth(G.user);
  const fills = o.get.map(id => G.players[id]).find(p => p && needSet().has(p.pos) && (!d0[p.pos][E.STARTERS[p.pos] - 1] || p.ovr > d0[p.pos][E.STARTERS[p.pos] - 1].ovr));
  const eff = (Math.abs(dw) < .05 ? 'No change this season' : `<b class="${dw > 0 ? 'good' : 'bad'}">${winsTxt(dw)}</b> this season${dw < 0 && onlyPicks ? ', picks for later' : ''}`) + (ch <= -3 ? ` · <span class="bad">locker room ${ch}</span>` : '');
  return `<div class="offer"><div class="offerh">${badge(o.from, 1)}<div title="${esc(o.msg || '')}"><b>${esc(G.teams[o.from].name)}</b><div class="small muted">${fills ? `<span class="good">Fills your ${fills.pos} need</span> · ` : ''}${eff}</div></div>${fairTag(ev.fair)}</div>
    <div class="offerb"><div><div class="lbl">Get</div>${assetGroupX(o.get, id => o.get.length > 1 ? `data-act="offerDrop" data-id="${o.id}" data-a="${id}" data-draft="${draft ? 1 : ''}"` : '')}</div><div><div class="lbl">Send</div>${assetGroupX(o.give, id => o.give.length > 1 ? `data-act="offerDrop" data-id="${o.id}" data-a="${id}" data-draft="${draft ? 1 : ''}"` : '')}</div></div>
    ${(() => { const pl = E.acceptPlan(o.give, o.get); UI.plans = UI.plans || {}; UI.plans[o.id] = pl;
      return pl.cuts.length || pl.fill || (pl.restr || []).length ? `<div class="small planline">${(pl.restr || []).length ? `To fit it, Accept restructures ${pl.restr.map(r => esc(lastName(G.players[r.id].n))).join(', ')}${pl.cuts.length ? ' and' : ''}` : ''}${pl.cuts.length ? `${(pl.restr || []).length ? ' releases' : 'To fit it, Accept also releases'} ${pl.cuts.map(id => esc(lastName(G.players[id].n))).join(', ')} (saves ${money(pl.save)}${pl.dead ? `, ${money(pl.dead)} dead money` : ''})` : ''}${pl.fill ? `${pl.cuts.length ? '. ' : ''}Signs ${pl.fill} minimum-salary player${pl.fill > 1 ? 's' : ''} to stay at 40` : ''}.</div>` : ''; })()}
    <div class="row end"><button class="btn ghost sm" data-act="${draft ? 'declineDraft' : 'decline'}" data-id="${o.id}">Decline</button><button class="btn sm" data-act="counter" data-id="${o.id}" data-draft="${draft ? 1 : ''}">Counter</button><button class="btn sm go" data-act="${draft ? 'acceptDraft' : 'accept'}" data-id="${o.id}">Accept${UI.plans[o.id].cuts.length ? ` · releases ${UI.plans[o.id].cuts.length}` : (UI.plans[o.id].restr || []).length ? ' · restructures' : ''}</button></div></div>`;
}
// ---------- home building blocks ----------
// Four numbers at a glance, then one row per thing that might need you. Every row opens the full detail.
const ICO = {flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', trade: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>', hurt: '<path d="M12 5v14M5 12h14"/>', target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
  goal: '<path d="M4 12.5l4.5 4.5L20 6"/>', chem: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19c.5-3 2.8-5 5.5-5 1.6 0 3 .7 4 1.8 1-1.1 2.4-1.8 4-1.8 2.7 0 5 2 5.5 5"/>',
  money: '<path d="M12 3v18M16.5 7.5c-.8-1.2-2.4-2-4.5-2-2.6 0-4 1.3-4 3s1.6 2.5 4 3 4 1.3 4 3-1.6 3-4.3 3c-2 0-3.6-.8-4.4-2"/>', list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'};
const srow = (ico, label, value, attrs, tone) => `<button class="srow ${tone || ''}" ${attrs}><span class="sicon"><svg viewBox="0 0 24 24" aria-hidden="true">${ICO[ico]}</svg></span><span class="slabel">${label}</span><span class="sval">${value}</span><span class="chev" aria-hidden="true">›</span></button>`;
function liveProj(season) { const key = season + '-' + G.week; if (!UI.proj || UI.proj.key !== key) UI.proj = {key, v: E.project(season, 500)[G.user]}; return UI.proj.v; }
function kpiStrip(season, live) {
  const e = E.setExpectations(season), pr = live ? liveProj(season) : null, shown = pr || {w: e.wins, po: e.po, sb: e.sb};
  const diff = pr ? Math.round((pr.w - e.wins) * 10) / 10 : null;
  const c = G.conf == null ? 55 : G.conf, col = c >= 55 ? 'var(--good)' : c >= 35 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="kpistrip ${shown.sb >= .05 ? '' : 'k3'}">
    <div class="kpi"><span>Projected wins</span><b class="num">${shown.w.toFixed(1)}</b>${diff != null ? `<em class="${diff >= 0 ? 'good' : 'bad'}">${diff >= 0 ? '+' : ''}${diff} vs preseason</em>` : `<em>#${e.rank} roster</em>`}</div>
    <div class="kpi"><span>Playoffs</span><b class="num">${pct(shown.po)}</b></div>
    ${shown.sb >= .05 ? `<div class="kpi"><span>Super Bowl</span><b class="num">${pct(shown.sb)}</b></div>` : ''}
    <button class="kpi" data-act="ownerSheet"><span>Owner</span><b style="color:${col}">${E.confLabel(c)}</b><i class="gbar"><i style="width:${c}%;background:${col}"></i></i></button></div>`;
}
function hurtStarters() {
  const d = E.depth(G.user), wouldStart = p => { const L = d[p.pos], last = L[E.STARTERS[p.pos] - 1]; return !last || p.ovr > last.ovr; };
  return E.roster(G.user).filter(p => p.inj).filter(wouldStart);
}
// The goal in as few words as possible: "Reach the conference title game" becomes "Conference title game"
const shortGoal = g => ({'Win the Super Bowl': 'Super Bowl', 'Reach the conference title game': 'Conference title game', 'Make the playoffs': 'Playoffs', 'Finish with a winning record': 'Winning record', 'Win at least 6 games': '6+ wins'})[g] || g;
// The biggest weakness so far this season: the stat where you rank worst in the league, and the positions behind it
function seasonIssue(season) {
  const R = (G.results[season] || []).filter(g => !g.po && g.ba && g.bh);
  if (R.length < 32) return null;
  const T = {};
  for (const t of E.teamList()) T[t] = {g: 0, pf: 0, pa: 0, py: 0, ry: 0, pya: 0, rya: 0, sk: 0, to: 0};
  const add = (t, me, op, pts, opp) => { const x = T[t]; x.g++; x.pf += pts; x.pa += opp; x.py += me.py || 0; x.ry += me.ry || 0; x.pya += op.py || 0; x.rya += op.ry || 0; x.sk += me.sk || 0; x.to += me.ints || 0; };
  for (const g of R) { add(g.a, g.ba, g.bh, g.as, g.hs); add(g.h, g.bh, g.ba, g.hs, g.as); }
  const M = [['Scoring', 'pf', false, v => `${v.toFixed(1)} points a game`, ['QB', 'WR', 'OT']], ['Points allowed', 'pa', true, v => `${v.toFixed(1)} points allowed a game`, ['CB', 'EDGE', 'S']],
    ['Passing game', 'py', false, v => `${Math.round(v)} pass yds a game`, ['QB', 'WR', 'TE']], ['Run game', 'ry', false, v => `${Math.round(v)} rush yds a game`, ['RB', 'IOL', 'OT']],
    ['Pass defense', 'pya', true, v => `${Math.round(v)} pass yds allowed a game`, ['CB', 'S', 'EDGE']], ['Run defense', 'rya', true, v => `${Math.round(v)} rush yds allowed a game`, ['DT', 'LB']],
    ['Pass protection', 'sk', true, v => `${v.toFixed(1)} sacks allowed a game`, ['OT', 'IOL']], ['Ball security', 'to', true, v => `${v.toFixed(1)} picks thrown a game`, ['QB']]];
  const per = (t, k) => T[t][k] / Math.max(1, T[t].g);
  let worst = null;
  for (const [label, k, low, fmt, pos] of M) {
    const mine = per(G.user, k), rank = E.teamList().filter(t => low ? per(t, k) < mine : per(t, k) > mine).length + 1;
    if (!worst || rank > worst.rank) worst = {label, rank, line: fmt(mine), pos};
  }
  const N = E.teamNeeds(), weakest = worst.pos.map(p => N.find(n => n.pos === p)).filter(Boolean).sort((a, b) => b.rank - a.rank)[0];
  worst.fix = weakest ? weakest.pos : worst.pos[0];
  return worst;
}
// Ordered by how much each one needs you: problems and offers first, then the season's scoreboard
function homeRows(season) {
  const e = E.setExpectations(season), rows = [];
  const hurt = hurtStarters();
  if (hurt.length) rows.push(srow('hurt', 'Injured starters', `${hurt.length} out`, 'data-act="injurySheet"', 'bad'));
  if (tradeOpen()) { const n = (G.offers || []).length; rows.push(srow('trade', 'Trade offers', n ? `${n} waiting` : 'None yet', 'data-act="openInbox"', n ? 'hot' : '')); }
  const iss = (G.phase === 'season' || G.phase === 'deadline') && G.week >= 2 ? seasonIssue(season) : null;
  if (iss && iss.rank > 16) rows.push(srow('target', 'Biggest issue', `<span title="${esc(iss.line)}">${esc(iss.label)} · ${ordinalJ(iss.rank)}</span>`, `data-act="needPos" data-pos="${iss.fix}"`, iss.rank >= 25 ? 'bad' : ''));
  const fa = bestFreeAgent();
  if (fa) rows.push(srow('money', 'Free agents', `${fa.p.pos} ${ovrNum(fa.p)} available`, `data-act="faSheet" data-k="${fa.p.pos}"`, 'hot'));
  rows.push(srow('flag', 'Owner expects', esc(shortGoal(e.goal)), 'data-act="ownerSheet"', G.mandate ? 'bad' : ''));
  const lt = (G.leagueTrades || []).filter(x => x.s === season);
  if (lt.length) rows.push(srow('trade', 'Around the league', `<span title="${esc(lt[0].star)}">${esc(G.teams[lt[0].b].nick)} land ${esc(lastName(lt[0].star || 'a player'))}</span>`, 'data-act="leagueTrades"'));
  const c = E.chemOf();
  rows.push(srow('chem', 'Locker room', E.chemLabel(c), 'data-act="chemSheet"', c >= 75 ? 'good' : c < 35 ? 'bad' : ''));
  return `<div class="card slist">${rows.join('')}</div>`;
}
// In season: the best unsigned player who would start for you at a position you need, if you can afford him
function bestFreeAgent() {
  if (!midseasonOpen() || G.phase === 'playoffs' || G.phase === 'offseason') return null;
  const d = E.depth(G.user), space = E.capSpace(G.user), NS = needSet();
  return E.faPool().filter(p => p.pos !== 'K' && p.pos !== 'P').map(p => { const st = d[p.pos][E.STARTERS[p.pos] - 1]; return {p, up: st ? p.ovr - st.ovr : p.ovr, price: E.midseasonPrice(p)}; })
    .filter(x => x.up >= 2 && x.price <= space && (NS.has(x.p.pos) || x.up >= 5)).sort((a, b) => b.up - a.up)[0] || null;
}
function ownerSheet() {
  const s = G.season, e = E.setExpectations(s);
  const log = (G.confLog || []).slice(-8).reverse();
  modal(`<div class="sheeth"><div><div class="kicker">${s} · #${e.rank} roster</div><h3>The owner</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="goal"><span class="kicker">Front office expects</span><b>${esc(e.goal)}</b></div>
    ${G.mandate ? `<div class="verdict bad">Hot seat: ${esc(G.mandate.goal.toLowerCase())} in ${G.mandate.season} or you are fired.</div>` : ''}
    ${confMeter()}
    ${log.length ? `<h4 class="sub">What moved it</h4>${log.map(x => `<div class="confline"><b class="${x.d >= 0 ? 'good' : 'bad'}">${x.d >= 0 ? '+' : ''}${x.d}</b><span>${esc(x.why)}</span><span class="small muted">${x.s}</span></div>`).join('')}` : '<p class="small muted">Win, hit your goal and make good trades to raise it. Losing streaks and bad deals lower it.</p>'}
    <div class="row end"><button class="btn go" data-act="closeModal">Done</button></div>`, true);
}
// Season goals: three a season on top of the owner's, each with live progress
function goalsList(season) {
  return `<div class="goallist">${E.goalStatus(season).map(x => `<div class="goalrow ${x.done ? 'done' : x.fail ? 'fail' : ''}"><span class="gmark" aria-hidden="true">${x.done ? '✓' : x.fail ? '×' : ''}</span><b>${esc(x.t)}</b><span class="small muted">${x.done ? 'Done' : x.fail ? 'Missed' : esc(x.line)}</span></div>`).join('')}</div>`;
}
function goalsSheet() {
  modal(`<div class="sheeth"><div><div class="kicker">${G.season} · on top of the owner's goal</div><h3>Season goals</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    ${goalsList(G.season)}
    <p class="small muted">Each one you hit raises the owner's confidence when the season ends and counts on your résumé.</p>
    <div class="row end"><button class="btn go" data-act="closeModal">Done</button></div>`, true);
}
// The locker room: what it is worth on Sundays and what moved it
function chemSheet() {
  const c = E.chemOf(), e = E.chemEdge(), col = c >= 55 ? 'var(--good)' : c >= 35 ? 'var(--warn)' : 'var(--bad)';
  const log = (G.chemLog || []).slice(-8).reverse();
  modal(`<div class="sheeth"><div><div class="kicker">${Math.abs(e) < .05 ? 'No effect on games' : `${e > 0 ? '+' : '−'}${Math.abs(e).toFixed(1)} points a game`}</div><h3>Locker room: ${E.chemLabel(c)}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="chemmeter"><i style="width:${c}%;background:${col}"></i></div>
    ${log.length ? `<h4 class="sub">What moved it</h4>${log.map(x => `<div class="confline"><b class="${x.d >= 0 ? 'good' : 'bad'}">${x.d >= 0 ? '+' : ''}${x.d}</b><span>${esc(x.why)}</span><span class="small muted">${x.s}</span></div>`).join('')}` : ''}
    <p class="small muted">Wins build it. Trading away or cutting players the room trusts costs it, veterans most of all. Landing a star lifts everyone.</p>
    <div class="row end"><button class="btn go" data-act="closeModal">Done</button></div>`, true);
}
// Every trade around the league this season, newest first
function leagueTradesSheet() {
  const L = (G.leagueTrades || []).filter(x => x.s === G.season);
  modal(`<div class="sheeth"><div><div class="kicker">${G.season} · ${L.length} trade${L.length === 1 ? '' : 's'}</div><h3>Around the league</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    ${L.map(x => `<div class="ltrade"><div class="ltop">${badge(x.b, 1)}<b>${esc(G.teams[x.b].nick)}</b><span class="small muted">get</span><span class="small muted ltwhen">${esc(x.when)}</span></div>
      <div class="lside"><span>${x.aGives.map(esc).join(', ')}</span></div>
      <div class="ltop">${badge(x.a, 1)}<b>${esc(G.teams[x.a].nick)}</b><span class="small muted">get</span></div><div class="lside"><span>${x.bGives.map(esc).join(', ')}</span></div></div>`).join('') || '<p class="muted">No trades yet this season.</p>'}
    <div class="row end"><button class="btn go" data-act="closeModal">Done</button></div>`, true);
}
// A bidding war for one of your players: who dropped out where, and who won
function bidSheet(id) {
  const r = E.biddingWar(id), p = G.players[id];
  if (!r || !r.winner) { popup('Bidding war', 'Not enough bidders', vban('warn', 'Only one team is really in', r && r.bids.length ? `The ${tname(r.bids[0].t)} want ${p.n}, but nobody is pushing them. Take their offer on the block, or wait.` : `Nobody is pushing for ${p.n} right now.`)); return; }
  const w = r.winner; UI.bidWin = w;
  modal(`<div class="sheeth"><div><div class="kicker">Bidding war · ${esc(p.n)}</div><h3>The ${esc(tname(w.t))} win it</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    ${vban('yes', `The ${tname(w.t)} outbid ${r.bids.length - 1} team${r.bids.length > 2 ? 's' : ''}`, `They beat the ${tname(w.beat)}, who dropped out last.`)}
    <div class="lbl">Dropped out</div><div class="bidout">${w.rounds.slice().reverse().map(x => `<span class="tag">${badge(x.t, 1)} ${esc(G.teams[x.t].nick)}</span>`).join('')}</div>
    <div class="pkdeal"><div><div class="lbl">You send</div>${assetGroup(w.give)}</div><div class="pkarrow" aria-hidden="true">→</div><div><div class="lbl">You get</div>${assetGroup(w.get)}</div></div>
    <div class="row end"><button class="btn ghost" data-act="closeModal">Keep him</button><button class="btn go" data-act="bidTake">Take the winning bid</button></div>`, true);
}
function injurySheet() {
  const c = injuryCard();
  modal(`<div class="sheeth"><div><div class="kicker">Backups moved up on their own</div><h3>Injuries</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>${c ? c.replace('<div class="card injcard">', '<div class="injcard">').replace(/<div class="cardh"><h3>Injured starters<\/h3>.*?<\/div>/, '') : '<p class="muted">Nobody important is hurt.</p>'}
    <div class="row end"><button class="btn" data-act="rview" data-k="lineup">Depth chart</button><button class="btn go" data-act="closeModal">Done</button></div>`, true);
}

// ---------- home by phase ----------
const homeFoot = () => `<div class="homefoot"><button class="btn ghost sm" data-act="guide">How to play</button><button class="btn ghost sm dangertxt" data-act="askReset">Start over</button></div>`;
function renderHome() {
  return renderHome0() + (G.phase === 'offseason' ? '' : homeFoot());
}
function renderHome0() {
  const p = G.phase;
  if (p === 'preseason' || p === 'season') return G.week > 0 ? homeSeason() : homePre();
  if (p === 'deadline') return homeDeadline();
  if (p === 'playoffs') return homePlayoffs();
  if (p === 'seasondone') return homeSeasonDone();
  if (p === 'offseason') return ({progress: homeProgress, resign: homeResign, fa: homeFA, draft: homeDraft, cutdown: homeCutdown})[G.step]();
  if (p === 'final') return homeFinal();
}
const poShort = r => /wild/i.test(r) ? 'WC' : /div/i.test(r) ? 'DIV' : /conf|champ/i.test(r) ? 'CONF' : /super/i.test(r) ? 'SB' : esc(r);
// Your games so far as small tappable results; each opens the box score
function resultsStrip(season) {
  const L = userGames(season);
  if (!L.length) return '';
  return `<div class="card resstrip"><div class="cardh"><h3>Your games</h3></div><div class="rstrip">${L.map(g => {
    const home = g.h === G.user, us = home ? g.hs : g.as, them = home ? g.as : g.hs, opp = home ? g.a : g.h, r = us > them ? 'w' : 'l';
    return `<button class="rchip ${r}" data-act="box" data-k="${gameKey(g)}" data-s="${season}"><b>${r.toUpperCase()}</b><span class="num">${us}-${them}</span><em>${home ? 'vs' : 'at'} ${esc(opp)}</em><em>${g.po ? poShort(g.po) : 'Wk ' + g.wk}</em></button>`;
  }).join('')}</div></div>`;
}
// ---------- one game at a time ----------
// Optional: instead of simming to the deadline or the end, play the next game and see how it went.
const playBtn = title => `<button class="btn playbtn" data-act="playWeek" ${title ? `title="${title}"` : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>Play Week ${G.week + 1}</button>`;
// Your next opponent and your division, for following the season one game at a time
function nextGameCard() {
  const s = G.season, games = E.seasonGames(s).filter(([w, a, h]) => w > G.week && (a === G.user || h === G.user));
  const g = games[0];
  if (!g || G.phase === 'playoffs' || G.phase === 'seasondone') return '';
  const [w, a, h] = g, home = h === G.user, opp = home ? a : h, bye = w > G.week + 1;
  const tr = E.teamRating(opp).ovr, M = E.matchup(opp, home), pc = Math.round(M.p * 100);
  UI.nextOpp = {opp, home, w};
  const key = (f, cls, kick) => `<div class="ngkey ${cls}"><span class="kicker">${kick}</span><b>${esc(f.label)}</b></div>`;
  return `<div class="card nextgame"><div class="cardh"><h3>Next game</h3><span class="small muted">Week ${w}${bye ? ` · bye in Week ${G.week + 1}` : ''}</span></div>
    <div class="ngrow">${badge(opp)}<span class="ngmain"><b>${home ? 'vs' : 'at'} ${esc(G.teams[opp].nick)}</b><span class="small muted">${rec(opp)} · ${tr} OVR${M.star ? ` · watch ${esc(lastName(M.star.n))} (${M.star.pos} ${ovrNum(M.star)})` : ''}</span></span><span class="ngodds ${pc >= 55 ? 'good' : pc <= 45 ? 'bad' : ''}"><b class="num">${pc}%</b><span class="small muted">to win</span></span></div>
    <div class="ngkeys">${M.worst.edge < 0 ? key(M.worst, 'bad', 'Watch out') : ''}${M.best.edge > 0 ? key(M.best, 'good', 'Lean on') : ''}</div>
    <div class="row ngacts"><button class="btn sm" data-act="matchSheet">Game plan</button>${M.worst.edge <= -2 ? `<button class="btn sm go" data-act="needPos" data-pos="${M.weakPos.pos}">Upgrade ${M.weakPos.pos}</button>` : ''}</div></div>`;
}
// The full game plan: every unit against theirs, who is hurt, and what you can still do about it
function matchSheet() {
  const N = UI.nextOpp; if (!N) return;
  const {opp, home, w} = N, M = E.matchup(opp, home), pc = Math.round(M.p * 100), mineHurt = hurtStarters();
  const bar = f => { const lo = Math.min(f.mine, f.theirs) - 6, span = Math.max(12, Math.max(f.mine, f.theirs) - lo + 2);
    return `<div class="mrowx"><div class="mlab"><span>${esc(f.label)}</span><b class="${f.edge > 1 ? 'good' : f.edge < -1 ? 'bad' : ''}">${f.edge > 1 ? 'Edge: you' : f.edge < -1 ? 'Edge: them' : 'Even'}</b></div>
      <div class="mbars"><span class="small">You</span><i class="mine" style="width:${(f.mine - lo) / span * 100}%"></i><b class="num">${f.mine}</b></div><div class="mbars"><span class="small">Them</span><i style="width:${(f.theirs - lo) / span * 100}%"></i><b class="num">${f.theirs}</b></div></div>`; };
  const tips = [];
  if (M.worst.edge <= -2) tips.push(`<div class="trow"><div class="pmain"><b>Shore up your ${esc(M.worst.name)}</b><div class="psub">Your weakest starter there is at ${M.weakPos.pos} (${M.weakPos.ovr}).</div></div><button class="btn sm go" data-act="needPos" data-pos="${M.weakPos.pos}">Upgrade ${M.weakPos.pos}</button></div>`);
  if (mineHurt.length) tips.push(`<div class="trow"><div class="pmain"><b>${mineHurt.length} starter${mineHurt.length > 1 ? 's' : ''} out</b><div class="psub">${mineHurt.map(p => `${esc(lastName(p.n))} (${p.pos})`).join(', ')}</div></div><button class="btn sm" data-act="faSheet" data-k="${mineHurt[0].pos}">Replace</button></div>`);
  if (M.best.edge > 1) tips.push(`<div class="trow"><div class="pmain"><b>Lean on your ${esc(M.best.name)}</b><div class="psub">It is ${M.best.edge} points better than what they line up against it.</div></div></div>`);
  if (M.theirHurt.length) tips.push(`<div class="trow"><div class="pmain"><b>They are banged up</b><div class="psub">${M.theirHurt.map(p => `${esc(p.n)} (${p.pos} ${ovrNum(p)})`).join(', ')} out.</div></div></div>`);
  if (pc < 45) tips.push(`<div class="trow"><div class="pmain"><b>You are the underdog</b><div class="psub">${tradeOpen() ? 'A trade or a signing before kickoff can swing it.' : 'A free-agent signing before kickoff can still help.'}</div></div></div>`);
  modal(`<div class="sheeth"><div><div class="kicker">Week ${w} · ${home ? 'home' : 'away'} · ${pc}% to win</div><h3>Game plan: ${home ? 'vs' : 'at'} ${esc(G.teams[opp].name)}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="matchgrid">${M.fights.map(bar).join('')}</div>
    ${tips.length ? `<h4 class="sub">What you can do</h4><div class="plist">${tips.join('')}</div>` : ''}
    ${M.last ? `<p class="small muted">Last time: ${(() => { const g = M.last, me = g.h === G.user ? g.hs : g.as, op = g.h === G.user ? g.as : g.hs; return `${me > op ? 'won' : 'lost'} ${me}-${op} in Week ${g.wk}`; })()}.</p>` : ''}
    <div class="row end"><button class="btn go" data-act="closeModal">Done</button></div>`, true);
}
function divisionCard() {
  const dv = E.divisions(), k = Object.keys(dv).find(x => dv[x].includes(G.user));
  if (!k) return '';
  return `<div class="card divcard"><div class="cardh"><h3>${k}</h3><button class="linkbtn" data-act="seg" data-seg="league" data-k="standings" data-go="league">All standings</button></div>
    ${dv[k].map((t, i) => { const r = E.record(t, G.season); return `<div class="divrow ${t === G.user ? 'me' : ''}"><span class="num muted">${i + 1}</span>${badge(t, 1)}<span class="dn">${esc(G.teams[t].nick)}</span><b class="num">${r.w}-${r.l}</b></div>`; }).join('')}</div>`;
}
// Your biggest holes: the grade, who starts there now, who is behind him, and one tap to find an upgrade
function needsCard() {
  if (!G.teams[G.user]) return '';
  const all = E.teamNeeds(), N = all.filter(n => n.level !== 'Low').slice(0, 4), d = E.depth(G.user);
  const L = N.length ? N : all.slice(0, 2);
  return `<div class="card needscard"><div class="cardh"><h3>Team needs</h3><button class="linkbtn" data-act="rview" data-k="needs">All positions</button></div>
    ${L.map(n => { const back = d[n.pos][E.STARTERS[n.pos]]; return `<button class="needrow" data-act="needPos" data-pos="${n.pos}"><span class="ng sm g${RANK_LETTER(n.rank)}">${RANK_LETTER(n.rank)}</span>
      <span class="nr-main"><b>${n.pos}</b><span class="small muted">${n.starters.map(p => esc(lastName(p.n))).join(', ') || '<span class="bad">Nobody starting</span>'}${back ? ` · next up ${esc(lastName(back.n))}` : ' · no backup'}</span></span>
      <span class="tag ${n.level === 'High' ? 'bad' : n.level === 'Medium' ? 'warn' : ''}">${N.length ? n.level : 'OK'}</span></button>`; }).join('')}
    ${N.length ? '' : '<p class="small muted">No big holes. These are your weakest spots.</p>'}</div>`;
}
// Home layout: on a computer, the next game and your to-do list on the left, needs and the division on the right.
// On a phone the cards fall into one column in order of importance: next game, to-do, needs, results, division.
const sideCards = () => { const b = divisionCard(), c = needsCard(); return b || c ? `<div class="homeside">${c ? c.replace('class="card needscard"', 'class="card needscard o3"') : ''}${b ? b.replace('class="card', 'class="card o5') : ''}</div>` : ''; };
const goalsCard = season => { const gs = E.goalStatus(season); return gs.length ? `<div class="card goalscard o2"><div class="cardh"><h3>Season goals</h3><span class="small muted">${gs.filter(x => x.done).length} of ${gs.length} done</span></div>${goalsList(season)}</div>` : ''; };
const homeMain = (season, extra) => `<div class="homemain">${(nextGameCard() || '').replace('class="card nextgame"', 'class="card nextgame o1"')}${homeRows(season).replace('class="card slist"', 'class="card slist o2"')}${goalsCard(season)}${extra || ''}${(resultsStrip(season) || '').replace(/^<div class="card/, '<div class="card o4')}</div>`;
const userGameIn = (s, w) => (G.results[s] || []).find(g => !g.po && g.wk === w && (g.a === G.user || g.h === G.user));
function playWeek() {
  const s = G.season, w = G.week + 1, mark = (G.injLog || []).length, wasDeadline = G.phase === 'deadline';
  closeModal();
  E.simWeek(w);
  G.phase = 'season';
  if (wasDeadline) { G.offers = []; UI.give = []; UI.get = []; }
  if (wasDeadline) toast('The trade deadline has passed. Trades reopen in the offseason.');
  if (w === E.DEADLINE_WEEK) { G.phase = 'deadline'; E.updateConfidence('deadline'); E.refreshOffers(); UI.tview = null; }
  UI.proj = null;
  const last = w >= 18;
  if (last) finishRegular();
  persist(); render();
  gameCard(s, w, mark, last);

}
function gameCard(s, w, mark, last) {
  const g = userGameIn(s, w), r = E.record(G.user, s), k = E.streak(G.user, s);
  const hurt = (G.injLog || []).slice(mark).filter(x => G.players[x.id] && G.players[x.id].tm === G.user);
  const more = !last && G.phase === 'season';
  const next = more ? `<button class="btn go" data-act="playWeek"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>Week ${w + 1}</button>` : `<button class="btn go" data-act="closeModal">${G.phase === 'deadline' ? 'To the deadline' : 'Continue'}</button>`;
  if (!g) { modal(`<div class="sheeth"><div><div class="kicker">${s} · Week ${w}</div><h3>Bye week</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div><p class="muted">Rest week. Still ${r.w}-${r.l}.</p><div class="row end">${next}</div>`); return; }
  const home = g.h === G.user, us = home ? g.hs : g.as, them = home ? g.as : g.hs, opp = home ? g.a : g.h, win = us > them;
  sfx(win ? 'win' : 'loss'); if (win) buzz(25);
  const all = [...(boxLines(g.ba) || []).map(x => ({...x, t: g.a})), ...(boxLines(g.bh) || []).map(x => ({...x, t: g.h}))];
  const mine = all.filter(x => x.t === G.user).sort((a, b) => gameScore(b.st) - gameScore(a.st))[0];
  modal(`<div class="sheeth"><div><div class="kicker">${s} · Week ${w}</div><h3>${win ? 'Win' : 'Loss'}${g.ot ? ' in overtime' : ''}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="gameres ${win ? 'w' : 'l'}"><div class="gteam">${badge(G.user)}<b class="num">${us}</b></div><span class="gvs">${home ? 'vs' : 'at'}</span><div class="gteam"><b class="num">${them}</b>${badge(opp)}</div></div>
    <div class="grec"><span><b class="num">${r.w}-${r.l}</b> record</span>${k ? `<span class="${k.win ? 'good' : 'bad'}">${k.win ? 'W' : 'L'}${k.n} streak</span>` : ''}</div>
    ${mine && gameScore(mine.st) > 0 ? `<div class="potg">${face(G.players[mine.id], 'sm')}<div><div class="kicker">Your star</div><b>${esc(G.players[mine.id].n)}</b><div class="small">${perfLine(mine.st)}</div></div></div>` : ''}
    ${hurt.length ? `<button class="srow bad" data-act="injurySheet"><span class="sicon"><svg viewBox="0 0 24 24" aria-hidden="true">${ICO.hurt}</svg></span><span class="slabel">${esc(G.players[hurt[0].id].n)} hurt</span><span class="sval">${hurt.length > 1 ? `+${hurt.length - 1} more` : hurt[0].wk === 99 ? 'Season' : hurt[0].wk + ' wk'}</span><span class="chev" aria-hidden="true">›</span></button>` : ''}
    ${afterGame()}
    <div class="row end"><button class="btn" data-act="box" data-k="${gameKey(g)}" data-s="${s}">Box score</button>${next}</div>`);
}
function afterGame() {
  const dl = G.phase === 'deadline' ? `<button class="dlbanner sm" data-act="openInbox"><span class="dlmain"><span class="kicker">Trade deadline</span><b>Last chance to trade this season</b><span class="small">Trades close when you play Week ${E.DEADLINE_WEEK + 1}.</span></span><span class="dlgo">Trades ›</span></button>` : '';
  const left = G.phase === 'season' && G.week < E.DEADLINE_WEEK && E.DEADLINE_WEEK - G.week <= 2 ? `<p class="small warn">Trade deadline in ${E.DEADLINE_WEEK - G.week} week${E.DEADLINE_WEEK - G.week > 1 ? 's' : ''}.</p>` : '';
  const nx = E.seasonGames(G.season).filter(([w, a, h]) => w > G.week && (a === G.user || h === G.user))[0];
  let up = '';
  if (nx && G.week < 18) {
    const [w, a, h] = nx, home = h === G.user, opp = home ? a : h, M = E.matchup(opp, home), pc = Math.round(M.p * 100);
    UI.nextOpp = {opp, home, w};
    up = `<div class="upnext">${badge(opp, 1)}<span class="unmain"><span class="kicker">Next · Week ${w}</span><b>${home ? 'vs' : 'at'} ${esc(G.teams[opp].nick)} · ${pc}% to win</b>${M.worst.edge < 0 ? `<span class="small muted">Watch their ${esc(M.worst.k === 'pass' ? 'pass defense' : M.worst.k === 'run' ? 'run defense' : M.worst.k === 'pd' ? 'passing game' : 'run game')}</span>` : ''}</span><button class="btn sm" data-act="matchSheet">Game plan</button></div>`;
  }
  return dl + left + up;
}
// Starters who joined this offseason: signings, trades and draft picks
function newFaces(s) {
  const d = E.depth(G.user), st = new Set(E.POS_ORDER.flatMap(pos => d[pos].slice(0, E.STARTERS[pos]).map(p => p.id)));
  const ids = new Set([...(G.signings || []).filter(x => x.season === s).map(x => x.id), ...(G.trades || []).filter(t => t.season === s).flatMap(t => t.getIds || [])]);
  return E.roster(G.user).filter(p => st.has(p.id) && (ids.has(p.id) || (p.draft && p.end === s + 3 && p.how === 'Draft'))).sort((a, b) => b.ovr - a.ovr);
}
function homeSeason() {
  const r = E.record(G.user, G.season), k = E.streak(G.user, G.season), pre = G.week < E.DEADLINE_WEEK;
  return `<section class="hero"><div><div class="kicker">${G.season} · after Week ${G.week}${pre ? ` · <span class="${E.DEADLINE_WEEK - G.week <= 2 ? 'warn' : ''}">trade deadline in ${E.DEADLINE_WEEK - G.week} week${E.DEADLINE_WEEK - G.week > 1 ? 's' : ''}</span>` : ' · past the trade deadline'}</div>
    <h2>${r.w}-${r.l}${k && k.n >= 2 ? ` · ${k.win ? 'won' : 'lost'} ${k.n} straight` : ''}${helpBtn('pre')}</h2>
    <p class="lead">${pre ? `<span class="${E.DEADLINE_WEEK - G.week <= 2 ? 'warn' : ''}">${esc(deadlineLine())}.</span> Trade and sign free agents any week until then.` : 'The trade deadline has passed. You can still sign free agents.'}</p></div>
    <div class="row">${playBtn()}<button class="btn go lg" data-act="${pre ? 'toDeadline' : 'simRest'}">${pre ? 'Sim to the trade deadline' : 'Sim rest of season'}</button></div></section>
  ${kpiStrip(G.season, true)}<div class="homegrid">${homeMain(G.season)}${sideCards()}</div>`;
}
function homePre() {
  const first = G.season === 2026;
  const s = G.season, fresh = first ? [] : newFaces(s);
  return `<section class="hero"><div><div class="kicker">${s} season preview · trades open until the Week ${E.DEADLINE_WEEK} deadline ${modeTag(G.mode)}</div>
    <h2>${first ? `Week 1 with the ${esc(G.teams[G.user].nick)}` : `Your ${s} team`}${helpBtn('pre')}</h2>
    <p class="lead">Trades are open every week until the deadline after Week ${E.DEADLINE_WEEK}. Take it one game at a time, or sim ahead.</p></div>
    <div class="row"><button class="btn keep" data-act="toDeadline">Sim to the trade deadline</button><button class="btn go lg playbtn" data-act="playWeek"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>Play Week 1</button></div></section>
  ${kpiStrip(s)}<div class="homegrid">${homeMain(s, fresh.length ? `<div class="card o4"><div class="cardh"><h3>New this year</h3><span class="small muted">${fresh.length} new starter${fresh.length > 1 ? 's' : ''}</span></div><div class="plist">${fresh.slice(0, 6).map(p => `<div class="trow">${pRow(p, `<span class="gold">${esc(p.how)}</span>`)}</div>`).join('')}</div></div>` : '')}${sideCards()}</div>`;
}
function homeDeadline() {
  const r = E.record(G.user, G.season);
  return `${deadlineBanner()}<section class="hero"><div><div class="kicker">${G.season} trade deadline · after Week ${G.week}</div>
    <h2>You are ${r.w}-${r.l}. ${r.l === 0 ? 'Still perfect.' : r.w >= 6 ? 'In the hunt.' : 'Buy or sell?'}${helpBtn('deadline')}</h2></div>
    <div class="row">${playBtn('Closes trades until the offseason')}<button class="btn go lg" data-act="simRest">Sim rest of season</button></div></section>
  ${kpiStrip(G.season, true)}<div class="homegrid">${homeMain(G.season)}${sideCards()}</div>`;
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
  ${resultsStrip(G.season)}${hurtStarters().length ? `<div class="card slist">${srow('hurt', 'Injured starters', `${hurtStarters().length} out`, 'data-act="injurySheet"', 'bad')}</div>` : ''}<div class="card">${bracket()}</div>`;
}
function homeSeasonDone() {
  const f = E.userFinish(G.season), P = G.playoffs[G.season], gm = E.goalMet(G.season);
  const two = G.season === 2026;
  return `<section class="hero"><div><div class="kicker">${G.season} final</div>
    <h2>${f.w}-${f.l}. ${esc(f.label)}.</h2>
    <p class="lead">${f.perfect ? 'You did it. 21-0.' : `${esc(G.teams[P.champ].nick)} won it all.`}${gm ? ` Goal <b class="${gm.met ? 'gold' : 'bad'}">${gm.met ? 'met' : 'missed'}</b>.` : ''}</p>${verdictLine(G.season)}</div>
    <button class="btn go lg" data-act="${G.season === 2027 && !G.reported ? 'final' : G.fired ? 'newgame' : 'offseason'}">${G.season === 2027 && !G.reported ? 'See final results' : G.fired ? 'Pick a new team' : `Start the ${G.season + 1} offseason`}</button></section>
  ${P.champ === G.user ? `<div class="champbanner"><span class="kicker">Super Bowl champions</span><b>${esc(G.teams[G.user].name)}</b><span class="small muted">${f.perfect ? 'And nobody beat them. 21-0.' : `${f.w}-${f.l}, ${G.season}`}</span></div>` : ''}
  ${resultsStrip(G.season)}${E.goalStatus(G.season).length ? `<div class="card"><div class="cardh"><h3>Season goals</h3><span class="small muted">${E.goalStatus(G.season).filter(x => x.done).length} of 3</span></div>${goalsList(G.season)}</div>` : ''}${awardsCard(G.season)}
  <details class="fold card" style="margin-top:14px" data-fold="bracket" ${foldOpen('bracket')}><summary>Playoff bracket</summary>${bracket()}</details>`;
}
function verdictLine(s) {
  const v = (G.verdicts || {})[s];
  if (!v) return '';
  const T = {hotseat: ['bad', `Hot seat: make the playoffs in ${s + 1} or you are fired.`], fired: ['bad', `You are fired. The owner wanted the playoffs in ${s}.`],
    saved: ['good', 'Mandate met. Your job is safe.'], extended: ['good', 'The owner gave you a contract extension.']}[v];
  return `<div class="verdict ${T[0]}">${esc(T[1])}</div>`;
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
  ${(() => { const ch = up.filter(x => x.now !== x.old).sort((a, b) => Math.abs(b.now - b.old) - Math.abs(a.now - a.old));
    const row = x => { const p = G.players[x.id]; return `<div class="prow">${face(p || {n: x.n, id: x.id}, 'sm')}<div class="pmain"><div class="pn">${p ? pname(p) : esc(x.n)}</div><div class="psub">${x.pos} · ${x.old} → ${x.now}</div></div><span class="tag ${x.now > x.old ? 'good' : x.now < x.old ? 'bad' : ''}">${x.now > x.old ? '+' : ''}${x.now - x.old}</span></div>`; };
    const gain = ch.filter(x => x.now > x.old).length;
    return `<div class="kpistrip three"><div class="kpi"><span>Improved</span><b class="num good">${gain}</b></div><div class="kpi"><span>Declined</span><b class="num bad">${ch.length - gain}</b></div><div class="kpi"><span>Retired</span><b class="num">${ret.length}</b></div></div>
    <div class="grid g2"><div class="card"><h3>Biggest changes</h3><div class="plist">${ch.slice(0, 8).map(row).join('') || '<p class="muted small">No changes.</p>'}</div>
    ${ch.length > 8 ? `<details class="fold" data-fold="progall" ${foldOpen('progall')}><summary>All ${ch.length} changes</summary><div class="plist">${ch.slice(8).map(row).join('')}</div></details>` : ''}</div>
    ${ret.length ? `<div class="card"><h3>Retired</h3><div class="plist">${ret.map(x => `<div class="prow">${face({n: x.n, id: x.id}, 'sm')}<div class="pmain"><div class="pn">${esc(x.n)}</div><div class="psub">${x.pos}</div></div><span class="tag bad">Retired</span></div>`).join('')}</div></div>` : ''}</div>`; })()}`;
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
    <p class="lead">${money(E.capSpace(G.user))} cap space. Anyone you do not keep becomes a free agent.</p></div>
    <div class="row">${pendingResign().starters.length ? '' : '<button class="btn ghost" data-act="capRoom">Make cap room</button>'}<button class="btn ${pendingResign().starters.length ? '' : 'go lg'}" data-act="toFA">Next: free agency</button></div></section>
  ${optionCard()}
  ${(() => { const R = pendingResign(); return R.starters.length ? `<div class="card resignwarn"><div><b>${R.starters.length} unsigned starter${R.starters.length > 1 ? 's' : ''}</b><span class="small muted">About ${R.wins.toFixed(1)} wins walk out the door if they leave</span></div>${R.fits.length ? `<button class="btn go" data-act="resignStarters">Keep ${R.fits.length < R.starters.length ? R.fits.length : 'my'} starters · ${money(R.fitCost)}</button>` : '<span class="small warn">Over your cap at their asking prices.</span>'}<button class="btn" data-act="capRoom">Make cap room</button></div>` : pending.length ? '' : '<div class="card resignwarn ok"><b>Your starters are signed.</b></div>'; })()}
  <div class="card"><div class="plist">${list.slice().sort((a, b) => (starter(b.p) - starter(a.p)) || b.p.ovr - a.p.ovr).map(({p, r}) => `<div class="trow ${r.done === 'signed' ? 'sel' : ''}" ${r.done ? '' : `data-act="negOpen" data-id="${p.id}"`}>${pRow(p, `${starter(p) ? '<b>Starter</b> · ' : ''}${r.done ? money(r.ask) + ' × ' + r.yrs + ' yr' : 'wants ' + E.yearsFor(p) + ' yr'}`)}
    ${r.done ? `<span class="tag ${r.done === 'signed' ? 'good' : 'bad'}">${r.done === 'signed' ? 'Re-signed' : 'Let go'}</span>` : `<div class="row nowrap"><span class="chev deskonly-inline" aria-hidden="true">›</span><button class="btn sm go" data-act="resign" data-id="${p.id}">Pay ${money(E.resignPrice(p, E.yearsFor(p)))} × ${E.yearsFor(p)}</button></div>`}</div>`).join('') || '<p class="muted">No expiring contracts.</p>'}</div></div>`;
}
// Fifth-year options: your first-round picks entering the last year of their rookie deals
function optionCard() {
  const L = E.optionList(); if (!L.length) return '';
  return `<div class="card optcard"><div class="cardh"><h3>Fifth-year options</h3><span class="small muted">First-round picks: keep them one more year at a set price</span></div>
    ${L.map(({p, price}) => `<div class="trow">${pRow(p, `option year ${G.season + 1}: <b>${money(price)}</b>`)}<div class="row nowrap"><button class="btn sm ghost" data-act="optNo" data-id="${p.id}">Decline</button><button class="btn sm go" data-act="optYes" data-id="${p.id}" ${price - p.cap > E.capSpace(G.user) + 40 ? 'disabled' : ''}>Pick up</button></div></div>`).join('')}
    <p class="small muted">Picking it up adds ${G.season + 1} at that salary. Declining means he can leave as a free agent after this season.</p></div>`;
}
const CAMP_WORD = {Steal: 'Ahead of schedule', 'As projected': 'On track', Bust: 'Needs time'};
const verdictTag = v => v ? `<span class="tag ${v === 'Steal' ? 'good' : v === 'Bust' ? 'warn' : ''}">${CAMP_WORD[v] || v}</span>` : '';
const myClass = () => (G.draft ? G.draft.order : []).filter(o => o.sel && o.owner === G.user);
function prospectModal(rank) {
  const p = G.draft.pool.find(x => x.rank === rank); if (!p) return;
  const slot = G.draft.order[G.draft.at], onClock = slot && slot.owner === G.user;
  const st = E.depth(G.user)[p.pos][Math.max(0, E.STARTERS[p.pos] - 1)];
  const scale = v => Math.max(0, Math.min(100, (v - 45) / 50 * 100));
  modal(`<div class="pchead">${face({n: p.n, id: 'pros-' + p.rank, tm: G.user}, 'xl')}<div class="pcmid"><div class="kicker">${p.pos} · ${esc(p.sch)} · big board #${p.rank}</div><h3>${esc(p.n)}</h3><span class="tag">${p.round} talent</span></div>
      <div class="pcovr"><b class="${oc(p.hi)}">${p.lo}–${p.hi}</b><span>PROJECTED</span></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    ${p.egg ? `<div class="eggnote"><span class="kicker">Scouting legend</span><span>${esc(p.egg)}</span></div>` : ''}
    ${p.path ? `<p class="small muted">${esc(p.path)}</p>` : ''}
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
    <div class="rlab small"><span>45</span><span>${st ? `Your ${p.pos} starter: ${esc(st.n)} ${ovrNum(st)}` : `You have no ${p.pos} starter`}</span><span>95</span></div>
    <p class="small muted">Scouts can be wrong. His real overall shows the moment he is drafted. Some picks land outside the range, mostly early ones where scouts commit to a tight range.</p>
    <div class="row end"><button class="btn" data-act="closeModal">Close</button>${onClock ? `<button class="btn go" data-act="draftP" data-rank="${p.rank}">Draft ${esc(lastName(p.n))}</button>` : ''}</div>`, true);
}
function fillPopup(list, kicker) {
  popup(kicker, `${list.length} minimum-salary signing${list.length > 1 ? 's' : ''}`, `<p class="small muted">Open roster spots went to the best leftover free agents on 1-year, $1.1M deals. Thin positions came first, then your biggest needs.</p>${list.map(x => { const p = G.players[x.id]; return `<div class="prow resrow">${face(p || {n: x.n, id: x.id}, 'sm')}<div class="pmain"><div class="pn">${p ? pname(p) : esc(x.n)}</div><div class="psub">${x.pos} · $1.1M × 1 yr</div></div>${ovrBadge(x, "sm")}</div>`; }).join('')}`);
}
function revealPopup(sel, no) {
  const p = G.players[sel.id];
  setTimeout(() => sfx('stamp'), 300);
  popup(`Pick #${no}`, `${esc(sel.n)} joins the ${esc(G.teams[G.user].nick)}`, `<div class="signhero">${face(p || {n: sel.n, id: sel.id}, 'xl')}<div><div class="kicker">${sel.pos} · ${esc(sel.sch)}</div>
    <div class="reveal"><span class="small muted">Scouts project</span><b>${sel.lo}–${sel.hi}</b></div>
    <div class="small muted" style="margin-top:6px">His real rating shows after training camp and the preseason, at final cuts.</div></div></div>`, 'win');
}
// Training camp is over: every rookie's real rating against what the scouts said
function draftRecap() {
  const mine = myClass(), all = G.draft.order.filter(o => o.sel && o.sel.ovr != null);
  const steals = all.filter(o => o.sel.verdict === 'Steal' && o.owner !== G.user).sort((a, b) => (b.sel.ovr - b.sel.hi) - (a.sel.ovr - a.sel.hi)).slice(0, 3);
  const row = o => `<div class="prow resrow"><span class="num pickno">#${o.no}</span>${badge(o.owner, 1)}<div class="pmain"><div class="pn">${esc(o.sel.n)} <span class="muted small">${o.sel.pos}</span></div><div class="psub">Scouts ${o.sel.lo}–${o.sel.hi}</div></div>${ovrBadge(o.sel, "sm")}${verdictTag(o.sel.verdict)}</div>`;
  const avg = mine.length ? Math.round(mine.reduce((a, o) => a + o.sel.ovr, 0) / mine.length) : 0;
  const n = k => mine.filter(o => o.sel.verdict === k).length;
  popup('Training camp is over', mine.length ? `Your rookies came in at ${avg} OVR` : 'Final cuts', `${mine.length ? `<p class="small muted">${[n('Steal') ? `${n('Steal')} ahead of schedule` : '', n('Bust') ? `${n('Bust')} need${n('Bust') > 1 ? '' : 's'} time` : ''].filter(Boolean).join(' · ') || 'Right about where the scouts had them. Their first season will tell the rest.'}</p><h4 class="sub">Your rookies</h4>${mine.map(row).join('')}` : ''}${steals.length ? `<h4 class="sub">Rookies who impressed around the league</h4>${steals.map(row).join('')}` : ''}`);
}
// The draft: a bar that says who is on the clock and when you pick, a ticker of the picks around now,
// and three tabs: the big board, the full draft order round by round, and your picks.
function homeDraft() {
  G.draft.pool.forEach(p => { if (p.lo == null) E.scoutProspect(p); });
  const D = G.draft, slot = D.order[D.at], onClock = slot && slot.owner === G.user;
  const left = D.order.slice(D.at).filter(o => o.owner === G.user), next = left[0];
  const tr = E.teamRating(G.user), trade = tradeOpen();
  const calls = onClock && trade ? E.draftOffers().filter(o => !(UI.declined || []).includes(o.id)) : [];
  const tab = slot ? UI.dtab || 'board' : 'mine';
  // the bar
  const away = next ? next.no - slot.no : 0;
  const bar = `<section class="draftbar"><div class="dclock ${onClock ? 'me' : ''}">
      ${slot ? `<div class="kicker">${G.season} draft · Round ${slot.rd}</div><div class="dpick"><span class="num">#${slot.no}</span>${badge(slot.owner)}<div><b>${onClock ? 'You are on the clock' : esc(tname(slot.owner)) + ' are up'}</b><span class="small muted">${onClock ? (calls.length ? `${calls.length} team${calls.length > 1 ? 's' : ''} calling about this pick` : 'Pick from the big board') : next ? `Your next pick: #${next.no}, ${away} pick${away === 1 ? '' : 's'} away` : 'You have no picks left'}</span></div></div>`
        : `<div class="kicker">${G.season} draft</div><div class="dpick"><div><b>Draft complete</b><span class="small muted">${myClass().length} player${myClass().length === 1 ? '' : 's'} added</span></div></div>`}
    </div><div class="row dbtns">${slot ? `${!onClock && trade && slot.pickId ? `<button class="btn" data-act="draftUp" data-id="${slot.pickId}">Trade for #${slot.no}</button>` : ''}${!onClock ? `<button class="btn" data-act="draftNext">Next pick</button>${next ? `<button class="btn go" data-act="toMyPick">Sim to my pick</button>` : ''}` : ''}${calls.length ? `<button class="btn" data-act="draftCalls">Calls · ${calls.length}</button>` : ''}<button class="btn ghost" data-act="finishDraft">Auto-draft the rest</button>` : `<button class="btn go lg" data-act="finishDraft">Next: final roster</button>`}${helpBtn('draft')}</div></section>`;
  // the ticker: the last few picks, the pick on the clock, the next ten
  const tick = D.order.slice(Math.max(0, D.at - 3), D.at + 11).map(o => {
    const cur = slot && o.no === slot.no, mine = o.owner === G.user;
    const tappable = trade && !o.sel && !mine && o.pickId;
    return `<div class="dtile ${cur ? 'cur' : ''} ${mine ? 'mine' : ''} ${o.sel ? 'done' : ''} ${tappable ? 'tap' : ''}" ${tappable ? `data-act="draftUp" data-id="${o.pickId}" role="button" tabindex="0" title="Trade for #${o.no}"` : ''}><div class="dtop"><span class="num">#${o.no}</span>${badge(o.owner, 1)}</div>${o.sel ? `<b>${esc(lastName(o.sel.n))}</b><span>${o.sel.pos}${o.sel.lo != null ? ` · ${o.sel.lo}–${o.sel.hi}` : ''}</span>` : cur ? `<b>${mine ? 'You' : esc(G.teams[o.owner].nick)}</b><span class="gold">${!mine && trade ? 'On the clock · trade' : 'On the clock'}</span>` : `<b>${mine ? 'You' : esc(G.teams[o.owner].nick)}</b><span>${trade && !mine && o.pickId ? `<button class="linkbtn" data-act="tradeUp" data-id="${o.pickId}">Trade up</button>` : 'Rd ' + o.rd}</span>`}</div>`;
  }).join('');
  const tabs = `<div class="seg dtabs">${[['board', 'Big board'], ['order', 'Draft order'], ...(trade ? [['trades', 'Trades']] : []), ['mine', `My picks · ${left.length + myClass().length}`]].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="seg" data-seg="dtab" data-k="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  // how many players go before your next pick: the board gets a line there
  const ahead = onClock ? 0 : next ? next.no - slot.no : null;
  const yourLine = k => (UI.dboardPos || 'ALL') !== 'ALL' || ahead == null || k !== ahead ? '' :
    `<div class="yourline"><span>${onClock ? 'You are on the clock' : `Your pick · #${next.no} · about ${ahead} player${ahead === 1 ? '' : 's'} go before it`}</span></div>`;
  if (tab === 'board') {
    const pos = UI.dboardPos || 'ALL', L = D.pool.filter(p => inGroup(p.pos, pos)).slice(0, 80);
    body = `${posChips('dboardPos', pos)}<div class="card dboard">${L.map((p, k) => { const line = yourLine(k); const st = tr.d[p.pos] && tr.d[p.pos][Math.max(0, E.STARTERS[p.pos] - 1)]; const fits = !st || p.hi > st.ovr;
      return `${line}<div class="dkrow"><span class="num drank">${p.rank}</span><div class="pmain" data-act="prospect" data-rank="${p.rank}"><div class="pn">${esc(p.n)} ${k === 0 && pos === 'ALL' ? '<span class="tag gold">Best available</span>' : ''}</div><div class="psub">${p.pos} · ${esc(p.sch)} · <span class="${p.potGrade === 'High' ? 'good' : p.potGrade === 'Medium' ? 'gold' : ''}">${p.potGrade} potential</span></div></div>
        <span class="dproj"><span class="projr ${fits ? 'gold' : ''}">${p.lo}–${p.hi}</span><span class="small muted">${fits ? (st ? 'Upgrade' : 'Fills a need') : 'Depth'}</span></span>
        <span class="dstart small deskonly">${st ? `Your ${p.pos}: <span class="${inCamp(st) ? '' : oc(st.ovr)}">${ovrNum(st)}</span> ${esc(lastName(st.n))}` : `<span class="tag bad">No ${p.pos}</span>`}</span>
        ${onClock ? `<button class="btn sm go" data-act="draftP" data-rank="${p.rank}">Draft</button>` : ''}</div>`; }).join('') || '<p class="muted">Nobody left at that position.</p>'}</div>`;
  } else if (tab === 'trades') {
    body = draftTradesTab(D, slot);
  } else if (tab === 'order') {
    const rd = +(UI.dround || (slot ? slot.rd : 1));
    const R = D.order.filter(o => o.rd === rd);
    body = `<div class="wkchips">${[1, 2, 3, 4, 5, 6, 7].map(r => `<button class="chip ${r === rd ? 'on' : ''}" data-act="seg" data-seg="dround" data-k="${r}">Round ${r}${D.order.some(o => o.rd === r && o.owner === G.user) ? ' ●' : ''}</button>`).join('')}</div>
      <div class="card dorder">${R.map(o => { const cur = slot && o.no === slot.no, mine = o.owner === G.user, past = D.order.indexOf(o) < D.at;
        return `<div class="dkrow ${mine ? 'me' : ''} ${cur ? 'cur' : ''}"><span class="num drank">#${o.no}</span>${badge(o.owner, 1)}<div class="pmain"><div class="pn">${esc(tname(o.owner))}${o.orig !== o.owner ? ` <span class="small muted">via ${esc(G.teams[o.orig].nick)}</span>` : ''}</div>
          <div class="psub">${o.sel ? `<b>${esc(o.sel.n)}</b> · ${o.sel.pos} · ${esc(o.sel.sch || '')}` : cur ? '<span class="gold">On the clock</span>' : past ? '' : mine ? 'Your pick' : 'Upcoming'}</div></div>
          ${o.sel && o.sel.ovr != null ? (G.draftDone ? `${ovrBadge(o.sel, "sm")}${verdictTag(o.sel.verdict)}` : `<span class="ovrb sm proj">${o.sel.lo}–${o.sel.hi}</span>`) : !o.sel && !mine && trade && o.pickId && !past ? `<button class="btn sm" data-act="draftUp" data-id="${o.pickId}">${cur ? 'Trade for it now' : 'Trade up'}</button>` : ''}</div>`; }).join('')}</div>`;
  } else {
    body = `<div class="grid g2"><div class="card"><h3>Picks left</h3>${left.map(o => `<div class="dkrow me"><span class="num drank">#${o.no}</span><div class="pmain"><div class="pn">Round ${o.rd}${o.orig !== G.user ? ` <span class="small muted">via ${esc(G.teams[o.orig].nick)}</span>` : ''}</div><div class="psub">${slot && o.no === slot.no ? '<span class="gold">On the clock</span>' : slot ? `${o.no - slot.no} picks away` : ''}</div></div></div>`).join('') || '<p class="muted small">No picks left.</p>'}</div>
      <div class="card"><h3>Your class</h3>${myClass().map(o => `<div class="dkrow"><span class="num drank">#${o.no}</span>${face(G.players[o.sel.id] || {n: o.sel.n, id: o.sel.id}, 'sm')}<div class="pmain"><div class="pn">${G.players[o.sel.id] ? pname(G.players[o.sel.id]) : esc(o.sel.n)}</div><div class="psub">${o.sel.pos} · ${G.draftDone ? `scouts ${o.sel.lo}–${o.sel.hi}` : 'real rating after training camp'}</div></div>${G.draftDone ? `${ovrBadge(o.sel, "sm")}${verdictTag(o.sel.verdict)}` : `<span class="ovrb sm proj">${o.sel.lo}–${o.sel.hi}</span>`}</div>`).join('') || '<p class="muted small">Nobody drafted yet.</p>'}</div></div>`;
  }
  const side = slot && (tab === 'board' || tab === 'order') ? `<aside class="draftside">${teamPanel('dNeedPos', UI.dboardPos)}</aside>` : '';
  return `${stepper(3)}${bar}<div class="dticker" role="list" aria-label="Draft order">${tick}</div>${slot ? tabs : ''}${side ? `<div class="draftgrid"><div class="draftmain">${body}</div>${side}</div>` : body}`;
}
// ---------- draft-day trades ----------
// Trade by pick (every upcoming pick, priced on the spot) or by team (their picks and what they would give for yours)
const pickChip = id => { const sl = E.draftSlotOf(id); return `<span class="pkchip ${sl && sl.rd === 1 ? 'r1' : ''}">${sl ? `<b>#${sl.no}</b> R${sl.rd}` : esc(E.assetName(id).replace(' Round ', ' R'))}</span>`; };
const pickChips = ids => ids.map(pickChip).join('<span class="pkplus">+</span>');
function upRow(o) {
  const r = E.moveUpPrice(o.pickId);
  return `<div class="dkrow tradepick"><span class="num drank">#${o.no}</span>${badge(o.owner, 1)}<div class="pmain"><div class="pn">${esc(tname(o.owner))} <span class="small muted">Round ${o.rd}${o.orig !== o.owner ? ` · via ${esc(G.teams[o.orig].nick)}` : ''}</span></div>
    <div class="psub">${r && r.give ? `<span class="small muted">Costs</span> ${pickChips(r.give)}` : `<span class="small muted">Out of reach: your picks after it add up to ${Math.round((r ? r.have / r.want : 0) * 100)}% of its value</span>`}</div></div>
    ${r && r.give ? `<button class="btn sm go" data-act="draftUp" data-id="${o.pickId}">Trade up</button>` : ''}</div>`;
}
function downRow(o) {
  const L = E.moveDownOffers(o.pickId), top = L[0];
  return `<div class="dkrow me tradepick"><span class="num drank">#${o.no}</span>${badge(G.user, 1)}<div class="pmain"><div class="pn">Your pick <span class="small muted">Round ${o.rd}</span></div>
    <div class="psub">${top ? `<span class="small muted">Best: ${esc(G.teams[top.from].nick)} gives</span> ${pickChips(top.get)}` : '<span class="small muted">Nobody behind you wants to move up right now</span>'}</div></div>
    ${L.length ? `<button class="btn sm" data-act="draftDown" data-id="${o.pickId}">Trade down · ${L.length}</button>` : ''}</div>`;
}
function draftTradesTab(D, slot) {
  const view = UI.dtrview || 'pick';
  const upcoming = D.order.slice(D.at).filter(o => o.pickId && !o.sel);
  const seg2 = `<div class="tfind-seg">${seg('dtrview', [['pick', 'By pick'], ['team', 'By team']], view)}</div>`;
  if (view === 'pick') {
    const rd = +(UI.dtround || (slot ? slot.rd : 1));
    const theirs = upcoming.filter(o => o.owner !== G.user && o.rd === rd && !(slot && o.no === slot.no && slot.owner !== G.user && false));
    const mine = upcoming.filter(o => o.owner === G.user);
    return `${seg2}<div class="grid g2 dtrades">
      <div class="card"><div class="cardh"><h3>Move up</h3><span class="small muted">Priced on the draft chart</span></div>
        <div class="wkchips">${[1, 2, 3, 4, 5, 6, 7].filter(r => upcoming.some(o => o.rd === r)).map(r => `<button class="chip ${r === rd ? 'on' : ''}" data-act="seg" data-seg="dtround" data-k="${r}">Round ${r}</button>`).join('')}</div>
        ${theirs.map(upRow).join('') || '<p class="small muted">No other team picks left in this round.</p>'}</div>
      <div class="card"><div class="cardh"><h3>Move down</h3><span class="small muted">Teams behind you that want your pick</span></div>
        ${mine.map(downRow).join('') || '<p class="small muted">You have no picks left in this draft.</p>'}</div></div>`;
  }
  // by team: every team with picks left, then that team's picks and what they would give for yours
  const teams = E.teamList().filter(t => t !== G.user && upcoming.some(o => o.owner === t)).sort((a, b) => upcoming.find(o => o.owner === a).no - upcoming.find(o => o.owner === b).no);
  const T = teams.includes(UI.dteam) ? UI.dteam : teams[0];
  if (!T) return seg2 + '<p class="muted">No other team has picks left.</p>';
  const needs = E.teamNeeds(T).filter(n => n.level !== 'Low' && n.pos !== 'K').slice(0, 3).map(n => n.pos);
  const theirPicks = upcoming.filter(o => o.owner === T);
  const offers = upcoming.filter(o => o.owner === G.user).flatMap(o => E.moveDownOffers(o.pickId).filter(x => x.from === T).map(x => ({...x, no: o.no})));
  return `${seg2}<div class="teamstrip">${teams.map(t => `<button class="tchip ${t === T ? 'on' : ''}" data-act="seg" data-seg="dteam" data-k="${t}">${badge(t, 1)}<span>#${upcoming.find(o => o.owner === t).no}</span></button>`).join('')}</div>
    <div class="grid g2 dtrades">
      <div class="card"><div class="cardh"><h3>${badge(T, 1)} ${esc(G.teams[T].name)}</h3><span class="small muted">${needs.length ? `Need ${needs.join(', ')}` : ''}</span></div>
        <div class="lbl">Their picks</div>${theirPicks.map(upRow).join('')}</div>
      <div class="card"><div class="cardh"><h3>For your picks</h3><span class="small muted">What the ${esc(G.teams[T].nick)} would give</span></div>
        ${offers.map((x, i) => { UI.dteamOffers = offers; return `<div class="dkrow tradepick"><span class="num drank">#${x.no}</span><div class="pmain"><div class="pn">Move down from #${x.no}</div><div class="psub"><span class="small muted">You get</span> ${pickChips(x.get)}</div></div><button class="btn sm go" data-act="draftTake" data-i="${i}">Take it</button></div>`; }).join('') || `<p class="small muted">The ${esc(G.teams[T].nick)} have nothing behind your picks to offer.</p>`}</div></div>`;
}
// One deal on one sheet, without leaving the draft
function draftUpSheet(pickId) {
  const r = E.moveUpPrice(pickId), sl = E.draftSlotOf(pickId), k = G.picks.find(x => x.id === pickId);
  if (!k) return;
  const who = k.owner, best = G.draft.pool[0];
  if (!r || !r.give) { popup('Draft day', `#${sl ? sl.no : ''} is out of reach`, `<p class="lead">The ${esc(G.teams[who].nick)} want about ${Math.round(r ? r.want : 0)} points on the draft chart for it. Your picks after it add up to ${Math.round(r ? r.have : 0)}.</p><p class="small muted">Picks in later years count too, and players can make up the rest.</p><div class="row"><button class="btn go" data-act="draftHaggle">Offer players too</button></div>`); UI.dealX = {partner: who, give: [], get: [pickId]}; return; }
  UI.dealX = {partner: who, give: r.give, get: r.get};
  const vg = r.give.reduce((a, id) => a + E.chartValue(id), 0), vt = E.chartValue(pickId);
  modal(`<div class="sheeth"><div><div class="kicker">Draft day · move up${sl ? ` to #${sl.no}` : ''}</div><h3>Trade with the ${esc(G.teams[who].nick)}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="pkdeal"><div><div class="lbl">You send</div>${pickChips(r.give)}</div><div class="pkarrow" aria-hidden="true">→</div><div><div class="lbl">You get</div>${pickChips(r.get)}</div></div>
    <p class="small muted">Draft chart: you give ${Math.round(vg)} points for ${Math.round(vt)}. Moving up always costs a little extra.${best && sl ? ` Best player on the board right now: ${esc(best.n)} (${best.pos}).` : ''}</p>
    <div class="row end"><button class="btn" data-act="draftHaggle">Haggle on the phone</button><button class="btn go" data-act="draftDo">Make the trade</button></div>`, true);
}
function draftDownSheet(pickId) {
  const L = E.moveDownOffers(pickId), sl = E.draftSlotOf(pickId);
  UI.dteamOffers = L;
  modal(`<div class="sheeth"><div><div class="kicker">Draft day · your pick${sl ? ` #${sl.no}` : ''}</div><h3>Trade down</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    ${L.map((x, i) => `<div class="dkrow tradepick">${badge(x.from, 1)}<div class="pmain"><div class="pn">${esc(G.teams[x.from].name)}</div><div class="psub"><span class="small muted">You get</span> ${pickChips(x.get)}</div></div><button class="btn sm go" data-act="draftTake" data-i="${i}">Take it</button></div>`).join('') || '<p class="muted">Nobody behind you wants to move up right now.</p>'}
    <div class="row end"><button class="btn" data-act="closeModal">Keep the pick</button></div>`, true);
}
function homeCutdown() {
  const issues = E.userReady();
  if (!UI.cutSel) UI.cutSel = E.cutPlan();
  UI.cutSel = UI.cutSel.filter(id => G.players[id] && G.players[id].tm === G.user);
  const ros = E.roster(G.user), cap = G.cap[G.season];
  const sel = UI.cutSel.map(id => G.players[id]);
  const save = sel.reduce((s, p) => s + E.cutCost(p).save, 0), dead = sel.reduce((s, p) => s + E.cutCost(p).dead, 0);
  const after = ros.length - sel.length, spaceAfter = cap - E.payroll(G.user) + save;
  const d = E.depth(G.user);
  const starters = new Set(E.POS_ORDER.flatMap(pos => d[pos].slice(0, E.STARTERS[pos]).map(p => p.id)));
  const others = ros.filter(p => !UI.cutSel.includes(p.id)).sort((a, b) => (starters.has(a.id) - starters.has(b.id)) || E.playerValue(a) - E.playerValue(b));
  const row = (p, on) => { const c = E.cutCost(p); return `<label class="trow cut ${on ? 'sel' : ''}"><input type="checkbox" data-cut="${p.id}" ${on ? 'checked' : ''}>${pRow(p, `${starters.has(p.id) ? '<b>Starter</b> · ' : ''}saves ${money(c.save)}${c.dead ? ` · ${money(c.dead)} dead` : ''}`)}</label>`; };
  return `${stepper(4)}<section class="hero"><div><h2>Final roster${helpBtn('cutdown')}</h2>
    <p class="lead">Get to ${E.ROSTER_MAX} players and under the cap. Suggested cuts are ready.</p></div>
    <button class="btn go lg" data-act="startS2" ${issues.length ? 'disabled' : ''}>Start the ${G.season} season</button></section>
  <div class="cutbar card"><div class="kpis">
    <div><b class="num ${after > 53 ? 'bad' : 'good'}">${after}</b><span>Players${sel.length ? ' after cuts' : ''}</span></div>
    <div><b class="num ${spaceAfter < 0 ? 'bad' : 'good'}">${money(spaceAfter)}</b><span>Cap space</span></div>
    ${dead ? `<div><b class="num">${money(dead)}</b><span>New dead money</span></div>` : ''}</div>
    <div class="row end">${ros.length < 53 ? `<button class="btn" data-act="fillRoster">Fill ${53 - ros.length} open spot${53 - ros.length > 1 ? 's' : ''} at the minimum</button>` : ''}${sel.length || ros.length > 53 ? `<button class="btn ghost" data-act="cutAuto">Suggest again</button><button class="btn go" data-act="cutApply" ${sel.length ? '' : 'disabled'}>Release ${sel.length} player${sel.length === 1 ? '' : 's'}</button>` : ''}</div>
    ${issues.length ? `<div class="small bad">${issues.map(esc).join(' ')}</div>` : (E.roster(G.user).length < E.ROSTER_MAX ? `<div class="small muted">Open spots fill with minimum-salary players when the season starts.</div>` : '<div class="small good">Roster is set at 53. You can start the season.</div>')}</div>
  ${ros.length > 53 || sel.length || UI.cutOpen ? `<div class="grid g2"><div class="card"><h3>Release list</h3><div class="plist">${sel.map(p => row(p, true)).join('') || '<p class="muted">Nobody selected.</p>'}</div></div>
  <div class="card"><h3>Everyone else</h3><div class="plist scroll">${others.map(p => row(p, false)).join('')}</div></div></div>` : `<button class="btn ghost sm" data-act="cutOpen">Release someone anyway</button>`}`;
}

// ---------- roster: lineup, depth, needs, stats ----------
const OFF_ROWS = [[['WR', 0], ['OT', 0], ['IOL', 0], ['IOL', 1], ['IOL', 2], ['OT', 1], ['TE', 0], ['WR', 1]], [['WR', 2], ['QB', 0]], [['RB', 0]]];
const DEF_ROWS = [[['S', 0], ['S', 1]], [['CB', 0], ['LB', 0], ['LB', 1], ['CB', 1]], [['CB', 2], ['EDGE', 0], ['DT', 0], ['DT', 1], ['EDGE', 1]]];
function slotChip(d, pos, i, needs) {
  const p = d[pos][i];
  const n = needs.find(x => x.pos === pos);
  const lab = E.STARTERS[pos] > 1 ? pos + (i + 1) : pos;
  if (!p) return `<button class="slot empty" data-act="depthPos" data-pos="${pos}"><span class="slab">${lab}</span><span class="sname">Empty</span></button>`;
  return `<button class="slot ${n && n.level === 'High' ? 'weak' : ''}" data-act="depthPos" data-pos="${pos}" aria-label="${lab}: ${esc(p.n)}, ${ovrNum(p)} overall">${face(p)}<span class="sovr ${inCamp(p) ? 'proj' : oc(p.ovr)}">${inCamp(p) ? '?' : p.ovr}</span>${E.formLabel(p) ? `<span class="sform ${E.formOf(p) > 0 ? 'up' : 'down'}" title="${E.formLabel(p)}">${E.formOf(p) > 0 ? '▲' : '▼'}</span>` : ''}<span class="sname">${esc(lastName(p.n))}${cPatch(p)}</span><span class="slab">${lab}</span></button>`;
}
function lineupView() {
  const d = E.depth(G.user), needs = E.teamNeeds(), tr = E.teamRating(G.user);
  const field = (title, rows, sub) => `<div class="card fieldcard"><div class="cardh"><h3>${title}</h3><span class="tag">${sub}</span></div>
    <div class="field">${rows.map(r => `<div class="frow">${r.map(([pos, i]) => slotChip(d, pos, i, needs)).join('')}</div>`).join('')}</div></div>`;
  const order = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P'];
  const bench = pos => d[pos].slice(E.STARTERS[pos]);
  const hurt = pos => E.roster(G.user).filter(p => p.inj && p.pos === pos);
  const mob = `<div class="mobonly card mdepth">${order.map(pos => { const L = d[pos], n = E.STARTERS[pos], nd = needs.find(x => x.pos === pos), B = bench(pos), H = hurt(pos); return `<button class="mrow" data-act="depthPos" data-pos="${pos}"><span class="dpos">${pos}${nd ? `<i class="g${RANK_LETTER(nd.rank)}">${RANK_LETTER(nd.rank)}</i>` : ''}</span><span class="mcol"><span class="mfaces">${L.slice(0, n).map(p => `<span class="mp">${face(p, 'sm')}<span><b class="${inCamp(p) ? '' : oc(p.ovr)}">${ovrNum(p)}</b> ${esc(lastName(p.n))}</span></span>`).join('') || '<span class="bad small">Empty</span>'}</span>${B.length || H.length ? `<span class="mbench">${B.map(p => `${esc(lastName(p.n))} <b>${ovrNum(p)}</b>`).join(' · ')}${H.length ? `${B.length ? ' · ' : ''}<span class="bad">${H.map(p => `${esc(lastName(p.n))} (hurt)`).join(' · ')}</span>` : ''}</span>` : ''}</span><span class="chev" aria-hidden="true">›</span></button>`; }).join('')}</div>`;
  // everyone who is not starting, by position, so nobody disappears off the depth chart
  const benchCard = `<div class="card benchcard"><div class="cardh"><h3>Bench</h3><span class="small muted">${order.reduce((a, pos) => a + bench(pos).length, 0)} backups · tap to change the depth chart</span></div>
    <div class="benchgrid">${order.filter(pos => bench(pos).length || hurt(pos).length).map(pos => `<button class="benchpos" data-act="depthPos" data-pos="${pos}"><span class="dpos">${pos}</span><span class="benchlist">${bench(pos).map(p => `<span class="bp">${face(p, 'xs')}<span class="bpn">${esc(lastName(p.n))}</span><b class="${inCamp(p) ? '' : oc(p.ovr)}">${ovrNum(p)}</b>${p.pos !== pos ? `<span class="small muted">${p.pos}</span>` : ''}</span>`).join('')}${hurt(pos).map(p => `<span class="bp hurt">${face(p, 'xs')}<span class="bpn">${esc(lastName(p.n))}</span><span class="tag bad">Hurt</span></span>`).join('')}</span></button>`).join('')}</div></div>`;
  return `${captainsCard()}${mob}<div class="deskonly"><p class="hint">Tap a player to change the depth chart. Red ring: a big need.</p>
    <div class="grid">${field('Offense', OFF_ROWS, `${tr.off} OVR`)}${field('Defense', DEF_ROWS, `${tr.def} OVR`)}</div>
    <div class="card" style="margin-top:14px"><div class="cardh"><h3>Specialists</h3></div><div class="frow left">${slotChip(d, 'K', 0, needs)}${slotChip(d, 'P', 0, needs)}</div></div>
    ${benchCard}</div>`;
}
// Captains: who wears the C on each side of the ball, and what it does for the room
function captainsCard() {
  const c = E.captains(), nm = side => { const p = G.players[c[side]]; return p ? `<button class="linkbtn" data-act="captSheet" data-k="${side}">${esc(lastName(p.n))}</button>` : `<button class="linkbtn" data-act="captSheet" data-k="${side}">pick one</button>`; };
  return `<p class="captline"><span class="cpatch">C</span> Captains: ${nm('off')} on offense, ${nm('def')} on defense</p>`;
}
function captSheet(side) {
  const c = E.captains(), L = E.captainCandidates(side).slice(0, 10);
  modal(`<div class="sheeth"><div><div class="kicker">${side === 'off' ? 'Offense' : 'Defense'} · starters only</div><h3>Pick a captain</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <p class="small muted">Veterans who play well lead best. Changing captains in the middle of a season can sting the room. Trading or cutting a captain costs much more than an ordinary player.</p>
    <div class="plist">${L.map(p => `<div class="trow ${c[side] === p.id ? 'sel' : ''}">${pRow(p, `${Math.floor(p.age) >= 28 ? 'Veteran' : 'Young leader'}`)}${c[side] === p.id ? '<span class="tag gold">Captain</span>' : `<button class="btn sm" data-act="captSet" data-k="${side}" data-id="${p.id}">Make captain</button>`}</div>`).join('')}</div>
    <div class="row end"><button class="btn go" data-act="closeModal">Done</button></div>`, true);
}
function depthModal(pos) {
  const L = E.depth(G.user)[pos];
  const n = E.STARTERS[pos];
  modal(`<div class="sheeth"><div><div class="kicker">Depth chart</div><h3>${pos}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <p class="small muted">The top ${n} start. Move a player up to start him over a higher-rated one.</p>
    <div class="plist">${L.map((p, i) => `<div class="trow ${i < n ? 'sel' : ''}"><span class="num pickno">${i + 1}</span>${pRow(p, (i < n ? '<b>Starter</b>' : 'Backup') + (p.pos !== pos ? ` · <span class="warn">from ${p.pos}, plays ${p.ovr - E.flexPen(p, pos)}</span> <button class="linkbtn" data-act="flexMove" data-id="${p.id}" data-k="">Send back</button>` : ''))}
      <div class="row nowrap"><button class="btn icon sm" data-act="depthMove" data-pos="${pos}" data-id="${p.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(p.n)} up">↑</button><button class="btn icon sm" data-act="depthMove" data-pos="${pos}" data-id="${p.id}" data-d="1" ${i === L.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(p.n)} down">↓</button></div></div>`).join('')}</div>
    ${(() => { const C = E.roster(G.user).filter(p => p.pos !== pos && !p.inj && E.canFlex(p, pos) && !L.includes(p)).sort((a, b) => (b.ovr - E.flexPen(b, pos)) - (a.ovr - E.flexPen(a, pos))).slice(0, 4);
      return C.length ? `<h4 class="sub">Can also play ${pos}</h4><div class="plist">${C.map(p => `<div class="trow">${pRow(p, `would play ${pos} at ${p.ovr - E.flexPen(p, pos)}`)}<button class="btn sm" data-act="flexMove" data-id="${p.id}" data-k="${pos}">Move here</button></div>`).join('')}</div>` : ''; })()}
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
        <td class="num">${Math.floor(p.age)}</td><td>${ovrBadge(p, "sm")}</td><td class="num">${money(p.cap)}</td><td class="num">${p.end}</td>
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
  const cf = V.steps.find(x => x.k === 'Status and cost');
  return `<div class="pchead">${face(p, 'xl')}<div class="pcmid"><div class="kicker">${p.pos} · ${tm ? esc(tm.name) : 'Free agent'}</div><h3>${esc(p.n)}</h3>
      <div class="pchips">${E.hasNTC(p) ? '<span class="tag warn" title="He can refuse a trade to a rebuilding or selling team">No-trade clause</span>' : ''}${p.why ? '' : p.prod >= 0 ? `<span class="tag ${p.prod >= 75 ? 'good' : p.prod <= 30 ? 'bad' : ''}">Production ${ordinalJ(p.prod)} pct</span>` : p.rook ? '<span class="tag">No NFL stats yet</span>' : ''}<span class="tag ${p.hype >= 70 ? 'gold' : ''}">Hype ${p.hype}</span>${E.FLEX[p.pos] ? `<span class="tag">Also plays ${Object.keys(E.FLEX[p.pos]).join(', ')}</span>` : ''}${cf ? `<span class="tag">${esc(cf.note.split('.')[0])}</span>` : ''}</div>
      <div class="small muted">Age ${Math.floor(p.age)} · ${p.tm === 'FA' ? `asks ${money(p.ask || E.market(p))}` : `${money(p.cap)} per year through ${p.end} (${yrsLeft} yr left)`}${p.draft ? ` · drafted #${p.draft}` : ''}</div></div>
      ${inCamp(p) ? `<div class="pcovr proj"><b>${p.proj[0]}–${p.proj[1]}</b><span>Scouts</span></div>` : `<div class="pcovr ${oc(p.ovr)}"><b>${p.ovr}</b><span>OVR</span></div>`}<button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="ratingrow">
      ${inCamp(p) ? `<div class="rh"><span class="kicker" style="color:var(--muted)">Scouts' range</span><b>${p.proj[0]}–${p.proj[1]}</b><span class="small muted">Real rating after training camp, at final cuts</span></div>` : `${(p.hist || []).map((h, i) => `<div class="rh"><span class="kicker" style="color:var(--muted)">${h[0]}${i === 0 ? ' start' : ''}</span><b class="${oc(h[1])}">${h[1]}</b><span class="small muted">${esc(i ? h[2] : 'Week 1')}</span></div>`).join('<span class="rarrow">→</span>')}
      ${winsBlock(p)}<div class="rh"><span class="kicker" style="color:var(--muted)">Track record</span><b class="${oc(p.prior || p.ovr)}">${p.prior || p.ovr}</b><span class="small muted">Last 4 seasons</span></div>`}
      ${p.age <= 27 ? `<div class="rh"><span class="kicker" style="color:var(--muted)">Potential</span><b class="${(p.pot || p.ovr) - p.ovr >= 8 ? 'good' : (p.pot || p.ovr) - p.ovr >= 4 ? 'gold' : ''}">${(p.pot || p.ovr) - p.ovr >= 8 ? 'High' : (p.pot || p.ovr) - p.ovr >= 4 ? 'Medium' : 'Low'}</b><span class="small muted">${esc(p.potWhy || "Scouts' read")}</span></div>` : ''}
      ${E.formLabel(p) ? `<div class="rh"><span class="kicker" style="color:var(--muted)">This season</span><b class="${E.formOf(p) > 0 ? 'good' : 'bad'}">${E.formLabel(p)}</b><span class="small muted">Shapes next year's rating</span></div>` : ''}
    </div>
    ${p.egg ? `<div class="eggnote"><span class="kicker">Scouting legend</span><span>${esc(p.egg)}</span></div>` : ''}
    ${attrBlock(p)}
    ${ratingWhy(p)}
    ${p.inj ? `<p class="small bad">Injured: ${p.injW === undefined || p.injW === 99 ? 'out for the season' : `out about ${p.injW} more week${p.injW > 1 ? 's' : ''}`}.</p>` : ''}
    <h4 class="sub">Stats</h4>
    <div class="tw"><table class="tbl"><thead><tr><th>Season</th>${cols.map(([, l]) => `<th class="num">${l}</th>`).join('')}</tr></thead><tbody>
      ${seasonsFor(p).map(x => `<tr><td>${x.label}</td>${cols.map(([k]) => `<td class="num">${x.s ? fmtStat(x.s[k]) : '<span class="muted">–</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${p.draft && p.st25 ? `<p class="small muted">${esc(p.st25)}</p>` : ''}
    <details class="fold" data-fold="value" ${foldOpen('value')}><summary><span>Trade value <b class="num">${Math.round(V.total)}</b> <span class="small muted">≈ ${pickEquiv(V.total)} · why?</span></span></summary>
    ${R ? `<div class="range"><div class="rbar"><i style="left:${Math.min(100, R.lo.v / R.hi.v * 100)}%;right:0"></i><em style="left:${Math.min(100, R.mid / R.hi.v * 100)}%"></em></div>
      <div class="rlab small"><span>${esc(tname(R.lo.t))} ${Math.round(R.lo.v)}</span><span>Most teams ${Math.round(R.mid)}</span><span class="gold">${esc(tname(R.hi.t))} ${Math.round(R.hi.v)}</span></div>
      <p class="small muted">No two teams value him the same. Scouting, GM style, team situation, cap room, need, scarcity and injuries all move the number. Top bidders: ${R.top.map(x => esc(tname(x.t)) + ' ' + Math.round(x.v)).join(', ')}.</p></div>` : ''}
    <div class="vbreak">${['Player', 'Contract'].map(gname => `<div class="vgroup"><div class="lbl">${gname === 'Player' ? 'The player' : 'The contract'}</div>${V.steps.filter(x => (x.g || 'Market') === gname).map(x => `<div class="vrow"><span class="vk">${esc(x.k)}</span><span class="vn small muted">${esc(x.note)}</span>${x.m != null ? `<span class="vm ${x.m > 1.005 ? 'up' : x.m < .995 ? 'down' : ''}">×${x.m.toFixed(2)}</span>` : `<span class="vm base">${x.v.toFixed(1)}</span>`}</div>`).join('')}</div>`).join('')}
      <div class="vtotal"><span>League value</span><b class="num">${V.total.toFixed(1)}</b><span class="small muted">≈ ${pickEquiv(V.total)}</span></div></div></details>
    ${p.tm === G.user && E.restructureInfo(p) ? `<div class="restrrow"><span class="small muted">Restructure: ${money(E.restructureInfo(p).save)} of room this year, ${money(E.restructureInfo(p).per)} more in each of the next ${E.restructureInfo(p).left}</span><button class="btn sm" data-act="restructure" data-id="${esc(p.id)}">Restructure</button></div>` : ''}
    <div class="row end">${tradeOpen() && tm && p.tm === G.user ? `<button class="btn" data-act="blockToggle" data-id="${esc(p.id)}">${E.blockOf().ids.includes(p.id) ? 'On your trade block ✓' : 'Add to trade block'}</button>` : ''}${tradeOpen() && tm ? `<button class="btn go" data-act="findTrades" data-id="${esc(p.id)}">${p.tm === G.user ? 'Ask around' : 'Find trades'}</button>` : ''}<button class="btn" data-act="closeModal">Close</button></div>`;
}
// Why he is rated what he is: his strongest and weakest measures, and where he ranks on play, role and market
// Madden-style attributes as bars: what he is good at, at a glance
function attrBlock(p) {
  if (inCamp(p)) return '';
  const L = E.attrList(p); if (!L.length) return '';
  return `<div class="attrs">${L.map(x => `<div class="attr"><span>${esc(x.k)}</span><i><b class="${x.v >= 85 ? 'hi' : x.v < 70 ? 'lo' : ''}" style="width:${Math.max(4, (x.v - 40) / 59 * 100)}%"></b></i><em class="${oc(x.v)}">${x.v}</em></div>`).join('')}</div>`;
}
function ratingWhy(p) {
  const w = p.why;
  if (!w || G.season > 2026 && p.ovr !== (p.hist && p.hist[0] && p.hist[0][1])) return w ? `<p class="small muted">Rated on his NFL play since 2019, role and contract, then moved by how he has developed since.</p>` : '';
  const pct = (k, lab) => w.p && w.p[k] != null ? `<span class="tag">${lab} ${ordinalJ(w.p[k])} pct</span>` : '';
  return `<div class="ratewhy"><span class="small muted">Rated on</span>${(w.s || []).map(x => `<span class="tag good">${esc(x)}</span>`).join('')}${(w.w || []).map(x => `<span class="tag bad">${esc(x)}</span>`).join('')}${pct('Production', 'Play')}${pct('Role', 'Snaps')}${pct('Market', 'Contract')}${pct('Winning', 'Wins')}${w.a ? '<span class="tag warn">Age</span>' : ''}</div>`;
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
    ${ovrBadge(p, "sm")}<span class="aval num" title="Value to the ${esc(tname(P))}">${Math.round(E.playerValue(p, P))}</span><button class="ibtn" data-act="player" data-id="${esc(p.id)}" aria-label="Card for ${esc(p.n)}">i</button></div>`;
}
// The phone call: you open with an offer and keep talking until you shake on it, they hang up, or you walk away.
// The phone call. Their GM, their read of the deal, the conversation with a reason under every answer,
// the deal on the table with an x on each piece, and everything you can say next.
const TALK_HINT = {ask: 'They name their price', middle: 'Split the gap, they may just agree', alt: 'Who else they would move', bluff: 'Can lower their bar · may cost patience',
  fit: 'Works if your player would start for them', final: 'Make or break · a no costs 2 patience', walk: 'Can shake a yes loose · costs patience', squeeze: 'Ask for a little extra on a done deal'};
function theirRead(P) {
  const T = E.talkWith(P), d = T.deal || {give: [], get: []};
  if (!d.get.length) return '';
  const ev = E.evalTrade(P, d.give, d.get), you = ev.vIn * (1 + T.boost), bar = ev.need * T.firm, top = Math.max(you, bar) * 1.15 || 1;
  const fmt = v => v < 20 ? v.toFixed(1) : String(Math.round(v));
  const sit = E.situations()[P], tmp = E.temperament(P), gm = E.gmOf(P);
  const prefer = sit.status === 'Contender' ? 'proven players who help now' : sit.status === 'Bubble' ? 'starters at their needs' : 'picks and young players';
  const needs = E.teamNeeds(P).filter(n => n.level !== 'Low').slice(0, 3).map(n => n.pos);
  const ok = you >= bar;
  return `<div class="tread">
    <div class="treadbar" role="img" aria-label="Your offer ${fmt(you)} against their bar ${fmt(bar)}"><i class="${ok ? 'ok' : you >= bar * .85 ? 'close' : ''}" style="width:${Math.min(100, you / top * 100)}%"></i><em style="left:${Math.min(100, bar / top * 100)}%"></em></div>
    <div class="treadnums"><span>Your offer <b class="num">${fmt(you)}</b></span><span>Their bar <b class="num">${fmt(bar)}</b></span><span>They give up <b class="num">${fmt(ev.vOut)}</b></span></div>
    <div class="treadtags"><span class="tag">${esc(sit.status)} · ${rec(P)}</span><span class="tag">Want ${prefer}</span>${needs.length ? `<span class="tag">Needs ${needs.join(', ')}</span>` : ''}<span class="tag" title="${esc(tmp.note)}">${esc(tmp.name)}</span><span class="tag">${esc(gm.style)}</span></div>
  </div>`;
}
function talkSheet(P, typing) {
  const T = E.talkWith(P), log = T.log.slice(-12), last = T.log[T.log.length - 1];
  const nick = esc(tname(P));
  const deal = (give, get) => `<div class="talkdeal"><div><div class="lbl">You send</div>${assetGroup(give)}</div><div><div class="lbl">You get</div>${assetGroup(get)}</div></div>`;
  const whyList = (w, open) => !w || !w.length ? '' : open ? `<ul class="whyl">${w.slice(0, 5).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<details class="whyd"><summary>Why</summary><ul class="whyl">${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
  const bubble = (m, i) => {
    if (m.me) return m.give ? `<div class="bub me"><div class="bubt">Your offer</div>${deal(m.give, m.get)}</div>` : `<div class="bub me"><div class="bubl">${esc(m.line)}</div></div>`;
    if (typing && i === log.length - 1) return `<div class="bub them">${badge(P, 1)}<div class="typing" aria-label="${nick} are typing"><i></i><i></i><i></i></div></div>`;
    const isLast = i === log.length - 1;
    let extra = '';
    if (isLast && m.kind === 'counter') { UI.counter = {partner: P, list: m.counters}; const base = T.deal || {give: [], get: []}; extra = m.counters.map((x, j) => `<div class="talkcounter"><div class="bubt">${esc(x.label)}</div>${x.why ? `<div class="small cwhy">${esc(x.why)}</div>` : ''}<div class="talkdeal"><div><div class="lbl">You send</div>${diffSide(x.give, base.give)}</div><div><div class="lbl">You get</div>${diffSide(x.get, base.get)}</div></div><div class="row"><button class="btn sm" data-act="talkMove" data-k="work" data-id="${j}">Work from this</button><button class="btn sm" data-act="counterAccept" data-i="${j}">Take it as is</button></div></div>`).join(''); }
    if (isLast && m.kind === 'alts') extra = `<div class="talkalts">${m.alts.map(id => `<div class="trow">${pRow(G.players[id])}<button class="btn sm" data-act="talkMove" data-k="swap" data-id="${id}">Ask about him</button></div>`).join('')}</div>`;
    return `<div class="bub them ${m.kind}">${badge(P, 1)}<div><div class="bubl">${esc(m.line)}</div>${whyList(m.why, isLast)}${extra}</div></div>`;
  };
  const pat = Math.max(0, T.patience), over = !last || last.done || pat <= 0;
  let say = '';
  if (!typing && !over && last && !last.me) {
    const M = E.TALK_MOVES;
    const chip = k => `<button class="talkchip2" data-act="talkMove" data-k="${k}"><b>${esc(M[k])}</b><span>${esc(TALK_HINT[k] || '')}</span></button>`;
    const hasPlayer = T.deal && T.deal.give.some(id => G.players[id]);
    const d = T.deal || {give: [], get: []};
    const pickChip = (k, label) => `<button class="chip talkchip ${UI.talkPick === k ? 'on' : ''}" data-act="talkPick" data-k="${k}">${label} ▾</button>`;
    const xs = (ids, k) => assetGroupX(ids, id => ids.length > 1 ? `data-act="talkMove" data-k="${k}" data-id="${id}"` : '');
    let pick = '';
    if (UI.talkPick) {
      const k = UI.talkPick, L = E.talkAssets(P, k);
      pick = `<div class="talkpick"><div class="bubt">${k === 'add' ? 'Add from your side' : 'Ask for from theirs'}</div>${L.map(x => `<button class="chip" data-act="talkMove" data-k="${k}" data-id="${x.id}">+ ${esc(E.assetName(x.id))} <span class="muted">${x.v < 20 ? x.v.toFixed(1) : Math.round(x.v)}</span></button>`).join('') || '<span class="small muted">Nothing to pick.</span>'}</div>`;
    }
    const table = `<div class="talktable"><div><div class="lbl">You send</div>${xs(d.give, 'remove')}</div><div><div class="lbl">You get</div>${xs(d.get, 'drop')}</div></div>
      <div class="saygroup"><span class="bubt">Change the deal</span>${pickChip('add', M.add)}${pickChip('more', M.more)}</div>${pick}`;
    const moves = ['ask', 'middle', 'alt', T.used.bluff ? '' : 'bluff', T.used.fit || !hasPlayer ? '' : 'fit', T.used.final ? '' : 'final', T.used.walk ? '' : 'walk'].filter(Boolean);
    say = last.kind === 'yes'
      ? `<div class="yesbar"><span><b>They would do this deal.</b> Take it, or keep pushing.</span><div class="row nowrap">${T.used.squeeze ? '' : `<button class="btn sm" data-act="talkMove" data-k="squeeze">${esc(M.squeeze)}</button>`}<button class="btn sm" data-act="talkDeal">Accept deal</button></div></div>${table}`
      : `${table}<div class="saygroup2"><span class="bubt">Say</span><div class="saygrid">${moves.map(chip).join('')}</div></div>`;
  }
  const gmName = `${nick} GM`;
  const V = typing || !last || last.me ? '' : last.kind === 'yes' ? vban('yes', 'They would say yes', 'Accept it below, or push for a little more.')
    : last.kind === 'counter' ? vban('counter', 'They countered', 'Their version is in the chat. Work from it or take it as is.')
    : over ? vban('no', 'They hung up', 'Out of patience. Try again later or call another team.')
    : last.kind === 'laugh' ? vban('no', 'They laughed it off', 'That offer was nowhere close. It cost you patience.')
    : last.kind === 'issue' ? vban('warn', 'It breaks a league rule', last.line)
    : vban('warn', 'Not yet', 'You are short. Add something or change the deal.');
  modal(`<div class="sheeth"><div><div class="kicker">On the phone · ${gmName}</div><h3>${typing ? 'Waiting on their answer' : esc(G.teams[P].name)}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    ${V}${theirRead(P)}
    <div class="talk">${log.map(bubble).join('')}</div>
    ${say ? `<div class="talksay">${say}</div>` : ''}
    ${UI.counterOf && (G.offers || []).some(o => o.id === UI.counterOf && o.from === P) ? `<div class="origbar"><span>Their original offer still stands.</span><button class="btn sm" data-act="accept" data-id="${UI.counterOf}">Take the original offer</button></div>` : ''}
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
// Position groups for quick filters
const POS_GROUPS = [['ALL', 'All'], ['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['TE', 'TE'], ['OL', 'OL'], ['DL', 'DL'], ['LB', 'LB'], ['DB', 'DB'], ['K', 'K/P']];
const inGroup = (pos, g) => !g || g === 'ALL' || g === pos || (g === 'NEEDS' && needSet().has(pos)) || (g === 'OL' && (pos === 'OT' || pos === 'IOL')) || (g === 'DL' && (pos === 'EDGE' || pos === 'DT')) || (g === 'DB' && (pos === 'CB' || pos === 'S')) || (g === 'K' && pos === 'P');
// Where you are shopping (free agents, the draft, other teams' players) there is a Needs chip, and need positions get a dot
const SHOP_KEYS = new Set(['faSheetPos', 'dboardPos', 'tposGet', 'tfPos', 'faPos']);
let NEEDSET = null;
const needSet = () => NEEDSET || (NEEDSET = new Set(G && G.teams[G.user] ? E.teamNeeds().filter(n => n.level !== 'Low').map(n => n.pos) : []));
const posChips = (key, cur) => { const shop = SHOP_KEYS.has(key), NS = shop ? needSet() : new Set(), hasNeed = g => [...NS].some(p => inGroup(p, g));
  return `<div class="poschips" role="group" aria-label="Filter by position">${(shop && NS.size ? [['NEEDS', 'My needs'], ...POS_GROUPS] : POS_GROUPS).map(([k, l]) => `<button class="pchip ${(cur || 'ALL') === k || (cur && cur !== k && k !== 'ALL' && k !== 'NEEDS' && cur !== 'NEEDS' && POS_GROUPS.every(([g]) => g !== cur) && inGroup(cur, k)) ? 'on' : ''} ${k === 'NEEDS' ? 'needchip' : ''}" data-act="posFilter" data-k="${key}" data-v="${k}">${l}${shop && k !== 'ALL' && k !== 'NEEDS' && hasNeed(k) ? '<i class="ndot" aria-label="a need"></i>' : ''}</button>`).join('')}</div>`; };
// One side of the deal, each item with an x to take it out
const dockSide = (ids, side) => ids.length ? ids.map(id => `<div class="dockitem">${assetMini(id)}<button class="xs" data-act="toggle" data-side="${side}" data-id="${id}" aria-label="Take ${esc(E.assetName(id))} out of the deal">×</button></div>`).join('') : '<span class="small muted">Nothing yet</span>';
function renderTrade() {
  if (!tradeOpen()) {
    const why = G.phase === 'playoffs' ? 'No trades during the playoffs.' : G.phase === 'final' ? 'The run is over.' : G.phase === 'seasondone' ? 'The season is over.' : `The trade deadline passed after Week ${E.DEADLINE_WEEK}, the same as in the NFL.`;
    return `<section class="hero"><div><div class="kicker">Trade center · closed</div><h2>Trades are closed</h2></div></section>
      <div class="card closedcard"><h3>${esc(why)}</h3><p class="muted">Trades reopen when the offseason starts and stay open through the draft, then every week of next season until the deadline after Week ${E.DEADLINE_WEEK}.</p>
      ${midseasonOpen() && G.phase !== 'playoffs' ? '<div class="row"><button class="btn go" data-act="faSheet">Sign a free agent instead</button></div>' : ''}</div>`;
  }
  const draftOffers = G.step === 'draft' ? E.draftOffers().filter(o => !(UI.declined || []).includes(o.id)) : [];
  const n = (G.offers || []).length + draftOffers.length;
  if (!UI.tview) UI.tview = n ? 'inbox' : 'make';
  const dl = deadlineLine();
  const head = `${deadlineBanner().replace('data-act="openInbox"', 'data-act="seg" data-seg="tview" data-k="inbox"')}<section class="hero tight"><div><div class="kicker">Trade center · ${G.phase === 'deadline' ? 'deadline day' : G.phase !== 'offseason' ? `<span class="${G.week >= E.DEADLINE_WEEK - 2 ? 'warn' : ''}">${esc(dl || G.season)}</span>` : G.step === 'draft' ? 'Draft day' : G.season + ' offseason'}</div><h2>Trades</h2></div>
    ${seg('tview', [['inbox', `Offers${n ? ' · ' + n : ''}`], ['block', 'Trade block'], ['make', 'Build a trade']], UI.tview)}</section>`;
  if (UI.tview === 'inbox') {
    const all = [...(G.offers || []).map(o => offerCard(o)), ...draftOffers.map(o => offerCard(o, true))];
    return head + (all.length ? `<div class="offers">${all.join('')}</div><div class="row" style="margin-top:14px"><button class="btn ghost" data-act="moreOffers">Ask around for more offers</button></div>`
      : `<div class="card empty"><h3>No offers right now</h3><p class="muted">Teams send offers at the trade deadline and at each step of the offseason. Put players on your trade block to draw more.</p><div class="row"><button class="btn" data-act="moreOffers">Ask around</button><button class="btn go" data-act="seg" data-seg="tview" data-k="make">Build a trade</button></div></div>`);
  }
  if (UI.tview === 'block') return head + blockTab();
  const others = E.teamList().filter(t => t !== G.user);
  const S = E.situations();
  if (!UI.partner || !others.includes(UI.partner)) return head + `<div class="tfind-seg">${seg('tfind', [['players', 'Find a player'], ['teams', 'Pick a team']], UI.tfind || 'players')}</div>` + ((UI.tfind || 'players') === 'players' ? playerFinder() : teamGrid(others, S));
  const P = UI.partner;
  const owns = (id, t) => (G.players[id] && G.players[id].tm === t) || G.picks.some(x => x.id === id && x.owner === t);
  UI.give = UI.give.filter(id => owns(id, G.user));
  UI.get = UI.get.filter(id => owns(id, P));
  const want = new Map(E.interestIn(P, 8).map(x => [x.p.id, x]));
  const mine = E.roster(G.user).filter(p => (p.ovr >= 60 || want.has(p.id)) && inGroup(p.pos, UI.tposGive)).sort((a, b) => (want.has(b.id) - want.has(a.id)) || b.ovr - a.ovr);
  const theirs = E.roster(P).filter(p => inGroup(p.pos, UI.tposGet)).sort((a, b) => b.ovr - a.ovr);
  const picks = t => G.picks.filter(x => x.owner === t).sort((a, b) => a.yr - b.yr || a.rd - b.rd);
  const ev = E.evalTrade(P, UI.give, UI.get);
  const ready = UI.give.length && UI.get.length;
  const v1 = x => x < 20 ? x.toFixed(1) : String(Math.round(x));
  const mood = !UI.get.length ? 'Pick what you want from them.' : !UI.give.length ? 'Now pick what you send, or tap Ask what they want.' : ev.issues.length ? `Can't happen: ${ev.issues[0]}` : ev.fleece ? 'They know that deal is too good for you.' : ev.ok && ev.badLook ? `They would take it, but that is ${ev.badLook} for less than a star's return.` : ev.ok ? 'They would take this deal.'
    : `${ev.ratio >= .85 ? 'Close' : 'Not close yet'}: your side is worth ${v1(ev.vIn)} to them and they want ${v1(ev.need)}.`;
  const dState = !ready ? '' : ev.issues.length ? 'no' : ev.fleece ? 'warn' : ev.ok ? 'yes' : ev.ratio >= .85 ? 'counter' : 'no';
  const pillMood = ready && ev.issues.length ? "Can't happen: tap Review" : ready && !ev.ok && !ev.fleece ? `${ev.ratio >= .85 ? 'Close' : 'Short'} · ${v1(ev.vIn)} of ${v1(ev.need)}` : mood;
  const row = (id, side) => { const w = side === 'give' && want.get(id); return assetRow(id, side, P, w ? '<span class="tag gold">Wanted</span>' : '').replace('class="asset ', `class="asset ${w ? 'wanted ' : ''}`); };
  const side = (key, list, pk, tposKey) => `${seg(key, [['players', 'Players'], ['picks', `Picks · ${pk.length}`]], UI[key] || 'players')}${(UI[key] || 'players') === 'players' ? posChips(tposKey, UI[tposKey]) : ''}<div class="alist">${(UI[key] || 'players') === 'players' ? list.map(p => row(p.id, key === 'tsGive' ? 'give' : 'get')).join('') || '<p class="small muted">Nobody at that position.</p>' : pk.map(x => row(x.id, key === 'tsGive' ? 'give' : 'get')).join('') || '<p class="small muted">No picks left.</p>'}</div>`;
  return head + `<div class="tradetop"><button class="btn ghost sm" data-act="tPartner" data-t="">‹ Teams</button>${badge(P)}<div><b>${esc(G.teams[P].name)}</b><div class="small muted">${rec(P)} · ${S[P].status} · ${money(E.capSpace(P))} cap space</div></div></div>
  <div class="mobonly tmobseg">${seg('tmob', [['give', 'Your team' + (UI.give.length ? ' · ' + UI.give.length : '')], ['get', esc(G.teams[P].nick) + (UI.get.length ? ' · ' + UI.get.length : '')], ['panel', 'Needs']], UI.tmob || 'give')}</div>
  <div class="tradecols m-${UI.tmob || 'give'}">
    <div class="card col-give"><div class="cardh"><h3>Your team</h3><span class="row nowrap">${want.size ? `<span class="tag gold">${want.size} they want</span>` : ''}<span class="small muted">Value to them</span></span></div>
      <div class="needline" title="Tap a need to see their players at that spot"><span class="lbl">You need</span>${needChips('tNeedPos', UI.tposGet)}<button class="linkbtn" data-act="depthSheet">Depth chart</button></div>${side('tsGive', mine, picks(G.user), 'tposGive')}</div>
    <div class="card col-get"><div class="cardh"><h3>${esc(G.teams[P].name)}</h3><span class="small muted">Value to them</span></div><div class="needline" title="Tap a need to see your players who could fill it"><span class="lbl">They need</span>${needChips('tTheirNeed', UI.tposGive, P)}</div>${side('tsGet', theirs, picks(P), 'tposGet')}</div>
    <div class="col-panel">${teamPanel('tNeedPos', UI.tposGet)}</div>
  </div>
  <button class="dockpill mobonly" data-act="dealSheet"><span class="dp-count">${UI.give.length} for ${UI.get.length}</span><span class="dp-mood ${ready ? (ev.ok ? 'good' : ev.ratio >= .85 ? 'warn' : 'bad') : ''}">${esc(pillMood)}</span><span class="dp-go">Review</span></button>
  <div class="dealdock card deskonly-grid"><div class="dock-sides"><div><div class="lbl">You send</div>${dockSide(UI.give, 'give')}</div><div><div class="lbl">You get</div>${dockSide(UI.get, 'get')}</div></div>
    <div class="dock-right"><b class="dmood ${dState} ${UI.lastMood !== mood ? 'flash' : ''}">${esc(mood)}</b>${(() => { UI.lastMood = mood; return ''; })()}${ready ? `<span class="small muted">For your team: <b class="${E.winsDelta(G.user, UI.get, UI.give) >= .05 ? 'good' : E.winsDelta(G.user, UI.get, UI.give) <= -.05 ? 'bad' : ''}">${winsTxt(E.winsDelta(G.user, UI.get, UI.give))}</b> a season${(() => { const ch = E.chemTrade(UI.give, UI.get).d; return ch ? ` · locker room <b class="${ch > 0 ? 'good' : 'bad'}">${ch > 0 ? '+' : ''}${ch}</b>` : ''; })()}</span>` : ''}${ready ? `<div class="meter ${ev.ok ? 'yes' : ev.ratio >= .85 ? 'close' : ''}" role="meter" aria-valuemin="0" aria-valuemax="125" aria-valuenow="${Math.round(Math.min(1.25, ev.ratio) * 100)}" aria-label="How they feel"><i style="width:${Math.min(100, ev.ratio * 80)}%"></i></div>` : ''}
      ${ready ? contractLines(ev) : ''}
      <div class="row nowrap">${ready && E.salaryBack(P, UI.give, UI.get) ? `<button class="btn" data-act="takeSalary">Take back salary</button>` : ''}<button class="btn" data-act="balance" ${UI.get.length ? '' : 'disabled'}>Ask what they want</button><button class="btn go" data-act="callTeam" ${ready ? '' : 'disabled'}>Make the call</button></div></div></div>`;
}
// Find anyone in the league by name or position, then trade for him straight from the list
function playerFinder() {
  const q = (UI.tsq || '').trim().toLowerCase(), pos = UI.tfPos || 'ALL', d = E.depth(G.user);
  let L = Object.values(G.players).filter(p => G.teams[p.tm] && p.tm !== G.user && p.pos !== 'P' && inGroup(p.pos, pos));
  if (q) L = L.filter(p => p.n.toLowerCase().includes(q) || p.pos.toLowerCase() === q);
  L = L.sort((a, b) => b.ovr - a.ovr).slice(0, 40);
  return `<div class="card"><div class="toolbar"><label class="search fasearch"><span class="sr">Search players</span><input id="tsq" type="search" placeholder="Search a name or position" value="${esc(UI.tsq || '')}" autocomplete="off"></label></div>
    ${posChips('tfPos', pos)}
    <div class="falist">${L.map(p => { const st = d[p.pos][E.STARTERS[p.pos] - 1], up = st ? p.ovr - st.ovr : p.ovr;
      return `<div class="farow2 nohover">${face(p, 'sm')}<div class="pmain"><div class="pn">${pname(p)}</div><div class="psub">${p.pos} · ${Math.floor(p.age)} · ${esc(G.teams[p.tm].nick)} · ${money(p.cap)} thru ${p.end}${up > 0 ? ` · <span class="good">+${up}</span>` : ''}</div></div>
        ${ovrBadge(p)}<div class="row nowrap"><button class="btn sm" data-act="findFor" data-id="${p.id}">Deals</button><button class="btn sm go" data-act="tradeFor" data-id="${p.id}">Trade for</button></div></div>`; }).join('') || '<p class="muted">Nobody matches.</p>'}</div></div>`;
}
// Build a trade starts here: every team, with how much they want your players, so you can pick a partner that fits
function teamGrid(others, S) {
  const rows = others.map(t => ({t, wants: E.interestIn(t, 8).length, s: S[t]})).filter(x => !UI.tgFilter || UI.tgFilter === 'all' || (UI.tgFilter === 'sell' ? /Seller|Rebuilding/.test(x.s.status) : /Contender|Bubble/.test(x.s.status)))
    .sort((a, b) => b.wants - a.wants || a.t.localeCompare(b.t));
  return `<div class="card"><div class="cardh"><h3>Pick a team</h3>${seg('tgFilter', [['all', 'All'], ['buy', 'Buying'], ['sell', 'Selling']], UI.tgFilter || 'all')}</div>
    <div class="teamgrid">${rows.map(({t, wants, s}) => `<button class="tgtile" data-act="tPartner" data-t="${t}">${badge(t)}<span class="tgmain"><b>${esc(G.teams[t].nick)}</b><span class="small muted">${rec(t)} · ${s.status}</span></span><span class="tgright">${wants ? `<span class="tag gold">Wants ${wants}</span>` : ''}<span class="small muted">${money(E.capSpace(t))} room</span></span></button>`).join('')}</div></div>`;
}
// The contract side of a deal, in plain lines
function contractLines(ev) {
  const L = [];
  for (const e of ev.ext || []) L.push(`<span class="cline warn">${esc(e.n)} wants an extension to come: ${e.yrs} yr at ${money(e.apy)}. It signs with the trade.</span>`);
  if (ev.deadOut >= .5) L.push(`<span class="cline">Dead money: ${money(ev.deadOut)} stays on your cap.</span>`);
  return L.length ? `<div class="clines">${L.join('')}</div>` : '';
}
// Your trade block, with each interested team's offer right there, and what other teams are shopping
function blockTab() {
  const B = E.blockOf();
  const mine = E.roster(G.user).filter(p => p.pos !== 'K' && p.pos !== 'P' && p.ovr >= 60 && !B.ids.includes(p.id) && inGroup(p.pos, UI.tposBlock)).sort((a, b) => b.ovr - a.ovr);
  const offersFor = id => E.cached(() => E.shopPlayer(id, B.want))().slice(0, 3);
  const yours = B.ids.map(id => { const p = G.players[id], L = offersFor(id); UI.blockDeals = UI.blockDeals || {}; UI.blockDeals[id] = L;
    return `<div class="blockplayer"><div class="bphead">${face(p, 'sm')}<div class="pmain"><div class="pn">${pname(p)} <span class="muted small">${p.pos} ${ovrNum(p)}</span></div><div class="psub">${money(p.cap)} thru ${p.end}</div></div><button class="btn sm" data-act="bidWar" data-id="${id}">Start a bidding war</button><button class="btn sm ghost" data-act="blockToggle" data-id="${id}">Take off</button></div>
      ${L.length ? L.map((x, i) => `<div class="bpoffer">${badge(x.partner, 1)}<span class="bpget">${x.get.map(g => esc(E.assetName(g))).join(' + ')}</span><button class="btn sm ghost" data-act="blockEdit" data-id="${id}" data-i="${i}">Edit</button><button class="btn sm go" data-act="blockAccept" data-id="${id}" data-i="${i}">Accept</button></div>`).join('') : `<div class="small muted">${esc(E.whyNoMarket(id, B.want))}</div>`}</div>`; }).join('');
  const league = E.cached(() => E.teamList().filter(t => t !== G.user).flatMap(t => E.onBlock(t, 3).map(x => ({...x, t}))).sort((a, b) => b.v - a.v).slice(0, 20))();
  return `<div class="grid g2">
    <div class="card"><div class="cardh"><h3>Your trade block</h3>${wantPicker('blockWant', B.want)}</div>
      ${yours || '<p class="small muted">Tap + to shop a player.</p>'}
      ${(() => { const pick = `${posChips('tposBlock', UI.tposBlock)}<div class="alist">${mine.map(p => `<div class="trow">${pRow(p)}<button class="btn sm" data-act="blockToggle" data-id="${p.id}">+ Block</button></div>`).join('') || '<p class="small muted">Nobody at that position.</p>'}</div>`;
        return B.ids.length ? `<details class="fold" data-fold="blockadd" ${foldOpen('blockadd')}><summary>Add players</summary>${pick}</details>` : `<div class="lbl" style="margin-top:12px">Your players</div>${pick}`; })()}</div>
    <div class="card"><h3>On other teams' blocks</h3><div class="alist">${league.map(x => `<div class="trow" title="${esc(x.why)}">${pRow(x.p, esc(G.teams[x.t].nick))}<button class="btn sm" data-act="findFor" data-id="${x.p.id}">Find a deal</button></div>`).join('') || '<p class="small muted">Nobody is being shopped right now.</p>'}</div></div>
  </div>`;
}

// ---------- league ----------
// The next draft class, ranked by the scouts. Ratings are ranges until the day a player is drafted.
function classView() {
  const yr = E.nextDraftYear(), L = E.scoutedClass(yr), d = E.depth(G.user);
  return `<div class="card"><div class="cardh"><h3>${yr} big board</h3><span class="small muted">${yr === 2027 ? 'The real class' : 'A projected class'} · ${L.length} prospects</span></div>
    <div class="tw"><table class="tbl"><thead><tr><th>Rank</th><th>Player</th><th>Pos</th><th>Projected</th><th>Your starter</th></tr></thead><tbody>${L.slice(0, 80).map(p => { const st = d[p.pos] && d[p.pos][Math.max(0, E.STARTERS[p.pos] - 1)]; return `<tr><td class="num">${p.rank}</td><td>${esc(p.n)} <span class="small muted">${esc(p.sch)}</span></td><td>${p.pos}</td><td class="num"><span class="projr ${!st || p.hi > st.ovr ? 'gold' : ''}">${p.lo}–${p.hi}</span></td><td class="small">${st ? `<span class="${inCamp(st) ? '' : oc(st.ovr)}">${ovrNum(st)}</span> ${esc(lastName(st.n))}` : '<span class="tag bad">Need</span>'}</td></tr>`; }).join('')}</tbody></table></div>
    </div>`;
}
function renderLeague() {
  const main = [['standings', 'Standings'], ['scores', 'Scores'], ['leaders', 'Leaders']];
  const more = [['schedule', 'Schedule'], ['awards', 'Awards'], ['moves', 'Your moves'], ['classview', `${E.nextDraftYear()} draft class`], ['resume', 'Résumé']];
  const cur = more.find(([k]) => k === UI.league), lg = UI.league || 'standings';
  const nav = `<div class="lgnav"><div class="seg">${main.map(([k, l]) => `<button class="${lg === k ? 'on' : ''}" data-act="seg" data-seg="league" data-k="${k}">${l}</button>`).join('')}</div><span class="moremenu"><button class="btn sm ${cur ? 'go' : 'ghost'}" data-act="lgMore" aria-expanded="${!!UI.lgMore}">${cur ? esc(cur[1]) : 'More'} ▾</button>${UI.lgMore ? `<span class="morepop down">${more.map(([k, l]) => `<button class="btn sm ${k === UI.league ? 'go' : 'ghost'}" data-act="seg" data-seg="league" data-k="${k}">${esc(l)}</button>`).join('')}</span>` : ''}</span></div>`;
  let body;
  if (UI.league === 'resume') return `<section class="hero tight"><div><h2>League</h2></div>${nav}</section>` + renderResume();
  if (UI.league === 'schedule') body = renderSchedule();
  else if (UI.league === 'scores') body = renderScores();
  else if (UI.league === 'leaders') body = renderLeaders();
  else if (UI.league === 'awards') { const yrs = Object.keys(G.awards || {}).map(Number).sort((a, b) => b - a); body = yrs.length ? `<div class="grid g2">${yrs.map(y => awardsCard(y)).join('')}</div>` : '<div class="card"><p class="muted">Awards are handed out when the season ends.</p></div>'; }
  else if (UI.league === 'classview') body = classView();
  else if (UI.league === 'moves') body = `<div class="grid g2"><div class="card"><h3>Your trades</h3>${G.trades.length ? G.trades.map(t => `<div class="offer slim"><div class="offerh">${badge(t.partner, 1)}<div><b>${t.season} ${esc(t.when)}</b></div></div><div class="small"><b>Got</b> ${t.got.map(esc).join(', ')}<br><span class="muted"><b>Gave</b> ${t.gave.map(esc).join(', ')}</span></div></div>`).join('') : '<p class="muted">No trades yet.</p>'}</div>
    <div class="card"><h3>League wire</h3><ul class="news">${G.news.map(n => `<li>${esc(n)}</li>`).join('') || '<li class="muted">Quiet so far.</li>'}</ul></div></div>
    <p style="margin-top:20px"><button class="btn danger" data-act="askReset">Start over with a new team</button></p>`;
  else body = G.phase === 'offseason' ? `<p class="muted">${G.season} has not started. Final ${G.season - 1} results set the draft order.</p>` : `<div class="grid g2">${divStandings('AFC')}${divStandings('NFC')}</div>`;
  return `<section class="hero tight"><div><div class="kicker">${G.phase === 'offseason' ? G.season - 1 : G.season}</div><h2>League</h2></div>${nav}</section>${body}`;
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
    ['Worst to first', 'Win a title starting from a bottom-8 roster', runs.some(r => r.mode === 'worst' && Object.values(r.seasons || {}).some(x => x.champ)), 'Not yet'],
    ['Every team', 'Run all 32 franchises', Object.keys(T.teams).length >= 32, `${Object.keys(T.teams).length}/32`],
  ];
  return T;
}
function renderResume() {
  const T = careerTotals();
  const name = C.gmName || 'Your name';
  const ini = (C.gmName || 'GM').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const store = C.cloud === 'on' ? 'Your résumé and game are saved to your account' : C.cloud === 'pending' ? 'Connecting to your account' : C.cloud === 'slow' ? 'Your account is slow to answer. Showing this device for now.' : 'Saved on this device only';
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
    <div class="card" style="margin-top:14px"><h3>Trophy case</h3>${T.titles.length ? `<div class="rings">${T.titles.map(s => `<div class="ring">${badge(s.team)}<div><b>${s.yr} ${esc(DATA.teams[s.team].name)}</b><div class="small muted">${s.w}-${s.l}${s.perfect ? ' · perfect' : ''}</div></div></div>`).join('')}</div>` : `<p class="muted">No rings yet. ${T.sb ? `You have reached ${T.sb} Super Bowl${T.sb > 1 ? 's' : ''}.` : 'Every title starts at the deadline.'}</p>`}</div>
    <details class="fold card" style="margin-top:14px" data-fold="ach" ${foldOpen('ach')}><summary>Achievements <span class="small muted">${T.ach.filter(a => a[2]).length} of ${T.ach.length} unlocked</span></summary><div class="ach">${T.ach.map(([n, d, ok, prog]) => `<div class="a ${ok ? 'on' : ''}"><b>${n}</b><span class="small muted">${d}</span><span class="tag ${ok ? 'good' : ''}">${ok ? 'Unlocked' : esc(prog)}</span></div>`).join('')}</div></details>
  <details class="fold card" style="margin-top:14px" data-fold="allteams" ${foldOpen('allteams')}><summary>Every team <span class="small muted">${Object.keys(T.teams).length} of 32 run</span></summary>
    <div class="allteams">${order.map(dv => `<div><div class="kicker muted">${dv}</div>${Object.keys(DATA.teams).filter(t => DATA.teams[t].div === dv).sort().map(t => { const c = T.teams[t]; return `<div class="tline ${c ? 'on' : ''}">${badge(t, 1)}<span>${esc(DATA.teams[t].nick)}</span><span class="small ${c ? '' : 'muted'}">${c ? `${c.w}-${c.l}${c.titles ? ' · <b class="gold">' + c.titles + '×</b>' : ''}${c.best ? ' · ' + c.best : ''}` : 'Not yet'}</span></div>`; }).join('')}</div>`).join('')}</div></details>
  ${leaderboardCard()}
  <div class="card" style="margin-top:14px"><h3>Run history</h3>${T.runs.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Team</th><th>2026</th><th>2027</th><th>Later</th><th>OVR</th><th>Grade</th><th>Style</th></tr></thead><tbody>
    ${T.runs.map(r => { const a = (r.seasons || {})[2026], b = (r.seasons || {})[2027]; const cell = s => s ? `<b class="num">${s.w}-${s.l}</b> <span class="small muted">${esc(s.label)}</span>${s.champ ? ' <span class="tag good">Champs</span>' : ''}` : '<span class="muted">In progress</span>'; return `<tr><td><div class="row nowrap">${badge(r.team, 1)} ${esc(DATA.teams[r.team].nick)} ${modeTag(r.mode)}${r.fired ? ' <span class="tag bad">Fired</span>' : ''}${r.extended ? ' <span class="tag good">Extended</span>' : ''}</div></td><td>${cell(a)}</td><td>${cell(b)}</td><td class="small">${Object.entries(r.seasons || {}).filter(([y]) => +y > 2027).map(([y, x]) => `${y}: <b class="num">${x.w}-${x.l}</b>${x.champ ? ' <span class="tag good">Champs</span>' : ''}`).join('<br>') || '<span class="muted">–</span>'}</td><td class="num">${r.startOvr || ''}${r.endOvr ? ' → ' + r.endOvr : ''}</td><td>${r.grade ? `<span class="tag ${gclass(r.grade)}">${r.grade}</span>` : ''}</td><td class="small">${esc(r.style || '')}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Finish a season and it shows up here.</p>'}</div>
  ${G ? '<p style="margin-top:20px"><button class="btn danger" data-act="askReset">Start over with a new team</button></p>' : ''}`;
}

function scoreCard(g, label, season) {
  const mine = g.a === G.user || g.h === G.user;
  const aw = g.as > g.hs;
  return `<button class="score ${mine ? 'mine' : ''}" data-act="box" data-k="${gameKey(g)}" data-s="${season || G.season}" aria-label="Box score: ${esc(tname(g.a))} ${g.as}, ${esc(tname(g.h))} ${g.hs}">
    ${label ? `<div class="tag">${esc(label)}</div>` : ''}
    <div class="t ${aw ? '' : 'l'}">${badge(g.a, 1)} ${esc(tname(g.a))}</div><div class="p num ${aw ? '' : 'l'}">${g.as}</div>
    <div class="t ${aw ? 'l' : ''}">${badge(g.h, 1)} ${esc(tname(g.h))}</div><div class="p num ${aw ? 'l' : ''}">${g.hs}${g.ot ? '<span class="small muted"> OT</span>' : ''}</div>
  </button>`;
}

// ---------- box scores ----------
const gameKey = g => `${g.a}-${g.h}-${g.wk || g.po || 0}`;
const findGame = (s, k) => (G.results[s] || []).find(g => gameKey(g) === k);
function boxLines(side) { return side && side.box ? E.unpackBox(side.box).filter(r => G.players[r.id]) : null; }
// One number per player for "player of the game"
const gameScore = st => (st.py || 0) / 25 + (st.ptd || 0) * 4 - (st.int || 0) * 2 + ((st.ry || 0) + (st.recy || 0)) / 10 + ((st.rtd || 0) + (st.rectd || 0)) * 6 + (st.sk || 0) * 4 + (st.dint || 0) * 5 + (st.tkl || 0) * .4;
function perfLine(st) {
  const n = v => (v || 0).toLocaleString(), out = [];
  if (st.att) out.push(`${st.cmp}/${st.att}, ${n(st.py)} yds${st.ptd ? `, ${st.ptd} TD` : ''}${st.int ? `, ${st.int} INT` : ''}`);
  if (st.car && (st.ry || 0) >= 20) out.push(`${st.car} car, ${n(st.ry)} yds${st.rtd ? `, ${st.rtd} TD` : ''}`);
  if (st.rec) out.push(`${st.rec} rec, ${n(st.recy)} yds${st.rectd ? `, ${st.rectd} TD` : ''}`);
  if (st.sk || st.dint || st.tkl) out.push([st.tkl ? `${st.tkl} tkl` : '', st.sk ? `${st.sk} sack${st.sk > 1 ? 's' : ''}` : '', st.dint ? `${st.dint} INT` : ''].filter(Boolean).join(', '));
  return out.filter(Boolean).join(' · ');
}
function boxSheet(s, k, side) {
  const g = findGame(s, k);
  if (!g) return;
  UI.boxAt = {s, k};
  const me = g.h === G.user ? 'h' : 'a';
  side = side || (UI.boxSide && UI.boxSide.k === k ? UI.boxSide.v : (g.a === G.user || g.h === G.user ? me : (g.as > g.hs ? 'a' : 'h')));
  UI.boxSide = {k, v: side};
  const A = g.ba || {}, H = g.bh || {}, la = boxLines(g.ba), lh = boxLines(g.bh);
  const when = g.po ? esc(g.po) : `Week ${g.wk}`;
  const n = v => v == null ? '–' : Math.round(v).toLocaleString();
  const ry = (B, L) => B.ry != null ? B.ry : L ? L.reduce((a, r) => a + (r.st.ry || 0), 0) : null;
  const tot = (B, L) => B.py != null && ry(B, L) != null ? B.py + ry(B, L) : null;
  const cmpRow = (lab, a, h) => `<tr><td class="num">${a}</td><td class="lbl2">${lab}</td><td class="num">${h}</td></tr>`;
  const team = `<table class="tbl boxcmp"><tbody>
    ${cmpRow('Total yards', n(tot(A, la)), n(tot(H, lh)))}
    ${cmpRow('Passing', A.att ? `${A.cmp}/${A.att} · ${n(A.py)}` : n(A.py), H.att ? `${H.cmp}/${H.att} · ${n(H.py)}` : n(H.py))}
    ${cmpRow('Rushing', A.car ? `${A.car} · ${n(ry(A, la))}` : n(ry(A, la)), H.car ? `${H.car} · ${n(ry(H, lh))}` : n(ry(H, lh)))}
    ${cmpRow('Turnovers', n(A.ints), n(H.ints))}
    ${cmpRow('Sacks taken', n(A.sk), n(H.sk))}</tbody></table>`;
  // the scoring plays, in order, and the conditions
  const WX = {snow: 'Snow', rain: 'Rain', wind: 'Wind'};
  const scoring = g.sc && g.sc.length ? `<h4 class="sub">Scoring${g.wx ? ` <span class="tag">${WX[g.wx] || g.wx}</span>` : ''}</h4><div class="scoring">${g.sc.map(([tm, t, txt]) => `<div class="scrow"><span class="small muted num">${esc(tm)}</span>${badge(t, 1)}<span>${esc(txt)}</span></div>`).join('')}</div>` : '';
  const all = [...(la || []).map(r => ({...r, t: g.a})), ...(lh || []).map(r => ({...r, t: g.h}))];
  const win = g.as > g.hs ? g.a : g.h, gs = r => gameScore(r.st) + (r.t === win ? 4 : 0);
  const star = all.slice().sort((x, y) => gs(y) - gs(x))[0];
  const L = side === 'a' ? la : lh, t = side === 'a' ? g.a : g.h;
  const nm = r => `<button class="pname" data-act="player" data-id="${esc(r.id)}">${esc(G.players[r.id].n)}</button> <span class="muted small">${G.players[r.id].pos}</span>`;
  const sect = (title, head, rows) => rows.length ? `<h4 class="sub">${title}</h4><div class="tw"><table class="tbl boxt"><thead><tr><th></th>${head.map(h => `<th class="num">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '';
  const tr = (r, cells) => `<tr><td>${nm(r)}</td>${cells.map(c => `<td class="num">${c}</td>`).join('')}</tr>`;
  const players = L ? [
    sect('Passing', ['C/Att', 'Yds', 'TD', 'INT'], L.filter(r => r.st.att).map(r => tr(r, [`${r.st.cmp || 0}/${r.st.att}`, n(r.st.py), r.st.ptd || 0, r.st.int || 0]))),
    sect('Rushing', ['Car', 'Yds', 'Avg', 'TD'], L.filter(r => r.st.car).sort((x, y) => (y.st.ry || 0) - (x.st.ry || 0)).map(r => tr(r, [r.st.car, n(r.st.ry), ((r.st.ry || 0) / r.st.car).toFixed(1), r.st.rtd || 0]))),
    sect('Receiving', ['Rec', 'Tgt', 'Yds', 'TD'], L.filter(r => r.st.tgt).sort((x, y) => (y.st.recy || 0) - (x.st.recy || 0)).map(r => tr(r, [r.st.rec || 0, r.st.tgt, n(r.st.recy), r.st.rectd || 0]))),
    sect('Defense', ['Tkl', 'Sk', 'INT', 'PD'], L.filter(r => r.st.tkl || r.st.sk || r.st.dint || r.st.pd).sort((x, y) => ((y.st.tkl || 0) + (y.st.sk || 0) * 3 + (y.st.dint || 0) * 4) - ((x.st.tkl || 0) + (x.st.sk || 0) * 3 + (x.st.dint || 0) * 4)).slice(0, 8).map(r => tr(r, [r.st.tkl || 0, r.st.sk || 0, r.st.dint || 0, r.st.pd || 0]))),
    sect('Kicking', ['FG', 'XP', 'Punts'], L.filter(r => r.st.fga || r.st.xp || r.st.punts).map(r => tr(r, [r.st.fga ? `${r.st.fg || 0}/${r.st.fga}` : '–', r.st.xp || '–', r.st.punts || '–']))),
  ].join('') : '<p class="muted small">Player stats are only kept for your own games from past seasons.</p>';
  const aw = g.as > g.hs;
  modal(`<div class="sheeth"><div><div class="kicker">${s} · ${when}${g.ot ? ' · OT' : ''}</div><h3>Box score</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="boxhead"><div class="bt ${aw ? '' : 'l'}">${badge(g.a, 1)}<span>${esc(G.teams[g.a].nick)}</span><b class="num">${g.as}</b></div><span class="muted">at</span><div class="bt ${aw ? 'l' : ''}"><b class="num">${g.hs}</b><span>${esc(G.teams[g.h].nick)}</span>${badge(g.h, 1)}</div></div>
    ${star && gameScore(star.st) > 0 ? `<div class="potg">${face(G.players[star.id], 'sm')}<div><div class="kicker">Player of the game</div><b>${esc(G.players[star.id].n)}</b> <span class="small muted">${G.players[star.id].pos} · ${esc(G.teams[star.t].nick)}</span><div class="small">${perfLine(star.st)}</div></div></div>` : ''}
    ${team}${scoring}
    <div class="seg boxseg"><button class="${side === 'a' ? 'on' : ''}" data-act="boxSide" data-k="a">${esc(G.teams[g.a].nick)}</button><button class="${side === 'h' ? 'on' : ''}" data-act="boxSide" data-k="h">${esc(G.teams[g.h].nick)}</button></div>
    ${players}`, true);
}
// Every game of one week, newest week first
function renderScores() {
  const s = G.phase === 'offseason' ? G.season - 1 : G.season;
  const R = G.results[s] || [];
  if (!R.length) return '<div class="card"><p class="muted">No games played yet this season.</p></div>';
  const weeks = [...new Set(R.map(g => g.po || g.wk))];
  const cur = weeks.includes(UI.scoreWk) ? UI.scoreWk : weeks[weeks.length - 1];
  const games = R.filter(g => (g.po || g.wk) === cur).sort((x, y) => (y.a === G.user || y.h === G.user) - (x.a === G.user || x.h === G.user));
  return `<div class="card"><div class="cardh"><h3>${s} scores</h3><span class="small muted">Tap a game for the box score</span></div>
    <div class="wkchips">${weeks.slice().reverse().map(w => `<button class="chip ${w === cur ? 'on' : ''}" data-act="scoreWk" data-k="${esc(String(w))}">${typeof w === 'number' ? 'Wk ' + w : poShort(w)}</button>`).join('')}</div>
    <div class="scoregrid">${games.map(g => scoreCard(g, '', s)).join('')}</div></div>`;
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
      <div class="stat"><b class="num">${Object.values(G.goalsHit || {}).reduce((a, b) => a + b, 0)}/6</b><span>Season goals hit</span></div>
    </div>
    ${prev ? `<p class="small" style="margin:14px 0 0;color:${beat ? 'var(--good)' : 'var(--muted)'}">${beat ? `New personal best with the ${esc(team.nick)}. Your old best was ${prev.grade} (${prev.score}).` : `Your best with the ${esc(team.nick)} is still ${prev.grade} (${prev.score}), ${esc(prev.rec)} in 2027.`}</p>` : ''}
    <div class="dare">Can you do better? Run it back with the same Week 1 roster, or take over a worse team.</div>
    <div class="row" style="justify-content:center;margin-top:12px"><button class="btn" data-act="share" data-k="final">Share my rebuild</button>${G.fired ? '<span class="tag bad">Fired</span>' : `<button class="btn go" data-act="keepGoing">Keep playing: ${G.season + 1}</button>`}<button class="btn" data-act="runback">Run it back</button><button class="btn ghost" data-act="newgame">New team</button></div>
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
  QB: [['g', 'G'], ['ca', 'C/Att'], ['pct', 'Pct'], ['py', 'Pass yds'], ['ptd', 'Pass TD'], ['int', 'INT'], ['ry', 'Rush yds']],
  RB: [['g', 'G'], ['car', 'Car'], ['ry', 'Rush yds'], ['ypc', 'Avg'], ['rtd', 'Rush TD'], ['rec', 'Rec'], ['recy', 'Rec yds']],
  REC: [['g', 'G'], ['tgt', 'Tgt'], ['rec', 'Rec'], ['recy', 'Yds'], ['avg', 'Avg'], ['rectd', 'TD']],
  OL: [['g', 'G']],
  DEF: [['g', 'G'], ['tkl', 'Tkl'], ['sk', 'Sacks'], ['dint', 'INT'], ['pd', 'PD']],
  K: [['g', 'G'], ['fg', 'FG'], ['xp', 'XP']],
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
  const o = {...s, g: s.gp}, r1 = v => Math.round(v * 10) / 10;
  if (SCHEMA[p.pos] !== 'QB' && SCHEMA[p.pos] !== 'RB') delete o.ry;
  if (s.att) { o.ca = `${s.cmp || 0}/${s.att}`; o.pct = r1((s.cmp || 0) / s.att * 100); }
  if (s.car) o.ypc = r1((s.ry || 0) / s.car);
  if (s.rec) o.avg = r1((s.recy || 0) / s.rec);
  if (s.fga) o.fg = `${s.fg || 0}/${s.fga}`;
  return o;
}
// Every season we have for a player, newest first
function seasonsFor(p) {
  const L = [];
  for (const yr of Object.keys(G.results).map(Number).sort((a, b) => b - a)) if ((G.results[yr] || []).length) L.push({key: 's' + yr, label: yr + ' sim', sim: true, s: simStats(p, yr)});
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
    if (g) { const my = home ? g.hs : g.as, op = home ? g.as : g.hs; res = `<button class="boxlink" data-act="box" data-k="${gameKey(g)}" data-s="${s}"><span class="pill ${my > op ? 'good' : 'bad'}">${my > op ? 'W' : 'L'}</span> <span class="num">${my}-${op}${g.ot ? ' OT' : ''}</span> <span class="chev">›</span></button>`; }
    return `<tr><td class="num">${w}</td><td><div class="row" style="gap:8px">${home ? 'vs' : '@'} ${badge(opp, 1)} ${esc(tname(opp))} <span class="muted small">${rec(opp, s)}</span></div></td><td>${res}</td></tr>`; }).join('')}
  ${played.filter(g => g.po).map(g => { const home = g.h === G.user, opp = home ? g.a : g.h, my = home ? g.hs : g.as, op = home ? g.as : g.hs; return `<tr><td>${esc(g.po)}</td><td><div class="row" style="gap:8px">${home ? 'vs' : '@'} ${badge(opp, 1)} ${esc(tname(opp))}</div></td><td><button class="boxlink" data-act="box" data-k="${gameKey(g)}" data-s="${s}"><span class="pill ${my > op ? 'good' : 'bad'}">${my > op ? 'W' : 'L'}</span> <span class="num">${my}-${op}</span> <span class="chev">›</span></button></td></tr>`; }).join('')}
  </table></div>`;
}
function renderLeaders() {
  const s = G.phase === 'offseason' ? 2026 : G.season;
  const st = G.stats[s] || {};
  const cats = [['py', 'Passing yards'], ['ptd', 'Passing TD'], ['ry', 'Rushing yards'], ['recy', 'Receiving yards'], ['rec', 'Receptions'], ['tkl', 'Tackles'], ['sk', 'Sacks'], ['dint', 'Interceptions'], ['rtd', 'Rushing TD']];
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
// ---------- card toolkit: two social sizes, team colors, one flowing layout ----------
const CARD_SIZES = {post: [1080, 1350, 'Post · 4:5'], story: [1080, 1920, 'Story · 9:16']};
const FD = '"Big Shoulders Display", Impact, sans-serif', FB = '"Barlow", sans-serif';
const CARD_URL = '21-0-rust.vercel.app';
function rgbOf(hex) { const n = parseInt(String(hex).replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function hexA(hex, a) { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${a})`; }
function lum(hex) { return rgbOf(hex).map(v => { v /= 255; return v <= .04 ? v / 12.9 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0); }
function mix(a, b, t) { const A = rgbOf(a), B = rgbOf(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
// The color that reads on a dark card: the primary if it is bright enough, else the secondary, else a lifted primary
function accentOf(t) {
  if (lum(t.c1) >= .045) return t.c1;
  if (lum(t.c2) >= .045) return t.c2;
  return mix(t.c1, '#ffffff', .4);
}
function txt(ctx, s, x, y, font, color, align) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y); }
function fitFont(ctx, s, weight, max, maxW, fam) { let size = max; do { ctx.font = `${weight} ${size}px ${fam || FD}`; size -= 4; } while (ctx.measureText(s).width > maxW && size > 20); return ctx.font; }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function tile(ctx, x, y, w, h, edge) {
  rrect(ctx, x, y, w, h, 22); ctx.fillStyle = 'rgba(255,255,255,.055)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = edge || 'rgba(255,255,255,.1)'; ctx.stroke();
}
function logo(ctx, x, y, size) {
  ctx.font = `900 ${size}px ${FD}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const a = ctx.measureText('21').width, b = ctx.measureText('-').width;
  ctx.fillStyle = '#f3b52f'; ctx.fillText('21', x, y); ctx.fillStyle = '#eef2f8'; ctx.fillText('-', x + a, y); ctx.fillStyle = '#f3b52f'; ctx.fillText('0', x + a + b, y);
  return a + b + ctx.measureText('0').width;
}
// Dark field tinted with the team, a diagonal color slash, a giant ghost number and yard lines
function cardBase(ctx, W, H, team, ghost) {
  const c1 = team.c1, acc = accentOf(team);
  const g = ctx.createLinearGradient(0, 0, W * .3, H); g.addColorStop(0, mix(c1, '#060a12', .55)); g.addColorStop(.55, '#070b14'); g.addColorStop(1, '#03050a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 2;
  for (let y = 0; y < H; y += 96) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
  // the slash
  ctx.save(); ctx.translate(W * .78, H * .02); ctx.rotate(-.42);
  const sg = ctx.createLinearGradient(-200, 0, 260, 0); sg.addColorStop(0, hexA(acc, 0)); sg.addColorStop(.5, hexA(acc, .55)); sg.addColorStop(1, hexA(acc, .15));
  ctx.fillStyle = sg; ctx.fillRect(-200, -H, 300, H * 2.4);
  ctx.fillStyle = hexA(lum(team.c2) > .02 ? team.c2 : '#f3b52f', .7); ctx.fillRect(130, -H, 26, H * 2.4);
  ctx.restore();
  // ghost number
  if (ghost) { ctx.save(); ctx.font = `900 ${Math.round(W * .62)}px ${FD}`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.strokeText(ghost, W + 30, H * .62); ctx.restore(); }
  const vg = ctx.createRadialGradient(W / 2, H * .45, H * .3, W / 2, H * .45, H * .85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}
// Stack blocks top to bottom and share the spare room between them
async function flow(ctx, H, top, bottom, blocks) {
  const room = H - top - bottom, need = B => B.reduce((s, b) => s + b.h, 0) + (B.length - 1) * 12;
  while (need(blocks) > room && blocks.some(b => b.opt)) { const drop = blocks.filter(b => b.opt).sort((a, b) => b.opt - a.opt)[0]; blocks = blocks.filter(b => b !== drop); }
  const used = blocks.reduce((s, b) => s + b.h, 0), gap = Math.min(60, Math.max(8, (room - used) / Math.max(1, blocks.length - 1)));
  let y = top + Math.max(0, (room - used - gap * (blocks.length - 1)) / 2);
  for (const b of blocks) { await b.draw(y); y += b.h + gap; }
}
// Gold band: the challenge on the left, the game and its link on the right. On a story it sits above the reply bar.
const FOOT = {post: [150, 0], story: [140, 130]};
function footer(ctx, W, H, line, story) {
  const [h, lift] = FOOT[story ? 'story' : 'post'], y = H - h - lift;
  ctx.fillStyle = '#f3b52f'; ctx.fillRect(0, y, W, h + lift);
  ctx.fillStyle = 'rgba(27,18,3,.9)'; ctx.fillRect(0, y, W, 6);
  txt(ctx, line, 64, y + h / 2 + 28, fitFont(ctx, line, 900, 84, W - 128 - 290), '#1b1203');
  txt(ctx, 'RUN THE FRONT OFFICE', W - 64, y + h / 2 - 6, `800 30px ${FD}`, '#1b1203', 'right');
  txt(ctx, CARD_URL, W - 64, y + h / 2 + 30, `600 24px ${FB}`, 'rgba(27,18,3,.75)', 'right');
}
const cardBottom = story => FOOT[story ? 'story' : 'post'][0] + FOOT[story ? 'story' : 'post'][1] + 24;
function header(ctx, W, y, right) {
  logo(ctx, 64, y + 58, 66);
  if (right) txt(ctx, right, W - 64, y + 52, '700 26px ' + FB, '#c9d2e2', 'right');
}
const gradeCol = g => g[0] === 'A' ? '#3fc07f' : g[0] === 'B' ? '#f3b52f' : g[0] === 'C' ? '#e8a33c' : '#ef5b51';
function shortFinish(f) {
  if (f.perfect) return ['PERFECT SEASON', '#f3b52f'];
  if (f.label === 'Won the Super Bowl') return ['SUPER BOWL CHAMPS', '#f3b52f'];
  if (f.label === 'Missed playoffs') return ['MISSED PLAYOFFS', '#8f9cb4'];
  return [f.label.replace('Lost in the ', 'LOST IN ').toUpperCase(), '#c9d2e2'];
}
function cardSeasons() {
  const S = Object.keys(G.history || {}).map(Number).filter(y => G.history[y] && G.history[y].finish).sort().map(y => ({yr: y, f: G.history[y].finish}));
  if (!S.find(s => s.yr === G.season) && G.playoffs[G.season] && G.playoffs[G.season].champ) S.push({yr: G.season, f: E.userFinish(G.season)});
  return S;
}
// The best season: a ring beats everything, then wins
function bestSeason(S) { return S.slice().sort((a, b) => (b.f.label === 'Won the Super Bowl') - (a.f.label === 'Won the Super Bowl') || b.f.w - a.f.w || b.yr - a.yr)[0]; }
function keyMoves(R) {
  const M = [];
  const grades = (G.trades || []).filter(t => t.got && t.got.length).map(t => ({t, k: ((t.getIds || []).some(id => G.players[id]) ? 100 : 0) + t.vGet})).sort((a, b) => b.k - a.k);
  for (const {t} of grades.slice(0, 2)) M.push(['TRADED FOR', t.got.slice(0, 2).join(' + ') + (t.got.length > 2 ? ` +${t.got.length - 2}` : ''), `from ${G.teams[t.partner].nick}`]);
  if (R && R.sign) M.push(['SIGNED', R.sign.now.n, `${R.sign.now.pos} · ${R.sign.now.ovr} OVR`]);
  if (R && R.rookies && R.rookies[0]) M.push(['DRAFTED', R.rookies[0].n, `${R.rookies[0].pos} · ${R.rookies[0].ovr} OVR`]);
  return M;
}

async function rebuildCard(size) {
  const [W, H] = CARD_SIZES[size] || CARD_SIZES.post, story = size === 'story';
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  try { await document.fonts.load(`900 100px ${FD}`); await document.fonts.load(`600 30px ${FB}`); await document.fonts.load(`700 30px ${FB}`); } catch (e) { /* fonts optional */ }
  const team = G.teams[G.user], acc = accentOf(team), R = E.cached(E.rebuildReport)();
  const S = cardSeasons(), best = bestSeason(S), perfect = S.some(s => s.f.perfect);
  const rings = S.filter(s => s.f.label === 'Won the Super Bowl').length;
  const yrs = S.length ? (S.length > 1 ? `${S[0].yr}–${S[S.length - 1].yr}` : String(S[0].yr)) : '';
  cardBase(ctx, W, H, team, best ? `${best.f.w}-${best.f.l}` : '');
  const name = team.name.toUpperCase(), d = E.depth(G.user);
  const starters = E.POS_ORDER.filter(p => p !== 'K' && p !== 'P').flatMap(pos => d[pos].slice(0, E.STARTERS[pos]));
  const core = starters.sort((a, b) => (b.how ? 3 : 0) + b.ovr - ((a.how ? 3 : 0) + a.ovr)).slice(0, 4);
  const moves = keyMoves(R).slice(0, story ? 3 : 1);
  const blocks = [
    {h: 70, draw: y => header(ctx, W, y, [C.gmName ? 'GM ' + C.gmName.toUpperCase() : '', yrs].filter(Boolean).join(' · '))},
    {h: story ? 210 : 186, draw: y => {
      txt(ctx, 'I REBUILT THE', 64, y + 40, `800 ${story ? 44 : 38}px ${FD}`, acc);
      txt(ctx, name, 60, y + (story ? 166 : 144), fitFont(ctx, name, 900, story ? 150 : 128, W - 124), '#ffffff');
      ctx.fillStyle = acc; ctx.fillRect(64, y + (story ? 192 : 168), 200, 12); ctx.fillStyle = lum(team.c2) > .02 ? team.c2 : '#f3b52f'; ctx.fillRect(264, y + (story ? 192 : 168), 100, 12);
    }},
    best && {h: story ? 260 : 214, draw: y => {
      const big = `${best.f.w}-${best.f.l}`, [lab, col] = shortFinish(best.f);
      txt(ctx, big, 56, y + (story ? 244 : 200), `900 ${story ? 300 : 246}px ${FD}`, perfect ? '#f3b52f' : '#ffffff');
      const bw = ctx.measureText(big).width, x = 56 + bw + 36, mw = W - 64 - x;
      txt(ctx, String(best.yr), x, y + (story ? 110 : 92), `800 ${story ? 56 : 46}px ${FD}`, '#8f9cb4');
      const lines = lab.split(' '), half = Math.ceil(lines.length / 2);
      const l1 = lines.slice(0, half).join(' '), l2 = lines.slice(half).join(' ');
      txt(ctx, l1, x, y + (story ? 178 : 148), fitFont(ctx, l1, 900, story ? 70 : 58, mw), col);
      if (l2) txt(ctx, l2, x, y + (story ? 244 : 200), fitFont(ctx, l2, 900, story ? 70 : 58, mw), col);
      if (rings > 1) txt(ctx, `${rings} RINGS`, x, y + (story ? 40 : 34), `800 ${story ? 34 : 28}px ${FD}`, '#f3b52f');
    }},
    {h: story ? 170 : 136, draw: y => {
      const h = story ? 170 : 136, gw = 28, w = (W - 128 - gw * 2) / 3;
      const T = [['TEAM OVR', `${R.then.ovr}→${R.now.ovr}`, R.now.ovr >= 90 ? '#f3b52f' : '#ffffff'], ['GRADE', R.grade, gradeCol(R.grade)], ['GM STYLE', R.style.name.toUpperCase(), '#ffffff']];
      T.forEach(([l, v, c], i) => {
        const x = 64 + i * (w + gw); tile(ctx, x, y, w, h, i === 1 ? hexA(gradeCol(R.grade), .6) : null);
        txt(ctx, l, x + 26, y + (story ? 44 : 38), `700 ${story ? 26 : 22}px ${FB}`, '#8f9cb4');
        txt(ctx, v, x + 24, y + h - (story ? 30 : 22), fitFont(ctx, v, 900, story ? 96 : 70, w - 48), c);
        if (i === 1) txt(ctx, `${R.score}/100`, x + w - 24, y + h - (story ? 34 : 26), `700 ${story ? 30 : 26}px ${FB}`, '#c9d2e2', 'right');
      });
    }},
    S.length > 1 && {h: story ? 140 : 112, opt: 1, draw: y => {
      const L = S.slice(-4), gw = 18, w = (W - 128 - gw * (L.length - 1)) / L.length, h = story ? 140 : 112;
      L.forEach((s, i) => {
        const x = 64 + i * (w + gw), [lab, col] = shortFinish(s.f), champ = s.f.label === 'Won the Super Bowl';
        rrect(ctx, x, y, w, h, 18); ctx.fillStyle = champ ? 'rgba(243,181,47,.14)' : 'rgba(255,255,255,.04)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = champ ? 'rgba(243,181,47,.7)' : 'rgba(255,255,255,.08)'; ctx.stroke();
        txt(ctx, String(s.yr), x + 20, y + (story ? 36 : 32), `800 ${story ? 28 : 24}px ${FD}`, '#8f9cb4');
        txt(ctx, `${s.f.w}-${s.f.l}`, x + 20, y + (story ? 98 : 80), `900 ${story ? 58 : 46}px ${FD}`, '#ffffff');
        txt(ctx, lab, x + 20, y + h - 14, fitFont(ctx, lab, 700, story ? 22 : 19, w - 40, FB), col);
      });
    }},
    moves.length && {h: (story ? 46 : 0) + moves.length * (story ? 80 : 66) - 10, opt: 2, draw: y => {
      let yy = y;
      if (story) { txt(ctx, 'KEY MOVES', 64, yy + 32, `800 36px ${FD}`, acc); yy += 46; }
      moves.forEach(([k, v, sub]) => {
        const h = story ? 70 : 56; tile(ctx, 64, yy, W - 128, h);
        txt(ctx, k, 92, yy + h / 2 + 10, `800 ${story ? 30 : 26}px ${FD}`, acc);
        const kx = 92 + (story ? 200 : 176);
        txt(ctx, v, kx, yy + h / 2 + 12, fitFont(ctx, v, 800, story ? 40 : 34, W - 128 - (kx - 64) - 260), '#ffffff');
        txt(ctx, sub, W - 92, yy + h / 2 + 9, `600 ${story ? 26 : 22}px ${FB}`, '#8f9cb4', 'right');
        yy += h + 10;
      });
    }},
    core.length && {h: story ? 50 + 152 + 92 : 50 + 116 + 78, draw: async y => {
      const r = story ? 76 : 58, cw = (W - 128) / 4;
      txt(ctx, 'THE CORE', 64, y + 30, `800 ${story ? 36 : 30}px ${FD}`, acc);
      for (let i = 0; i < core.length; i++) {
        const p = core[i], x = 64 + cw * i + cw / 2, cy = y + 50 + r;
        await drawFace(ctx, p, x, cy, r, p.how ? '#f3b52f' : 'rgba(255,255,255,.3)');
        rrect(ctx, x - 34, cy + r - 24, 68, 36, 18); ctx.fillStyle = p.ovr >= 90 ? '#f3b52f' : '#eef2f8'; ctx.fill();
        txt(ctx, String(p.ovr), x, cy + r + 4, `900 28px ${FD}`, '#0b1424', 'center');
        const ln = lastName(p.n).toUpperCase();
        txt(ctx, ln, x, cy + r + (story ? 54 : 46), fitFont(ctx, ln, 800, story ? 36 : 30, cw - 16), '#ffffff', 'center');
        txt(ctx, p.pos + (p.how ? ' · ' + p.how.toUpperCase() : ''), x, cy + r + (story ? 88 : 76), `700 ${story ? 24 : 20}px ${FB}`, p.how ? '#f3b52f' : '#8f9cb4', 'center');
      }
    }},
  ].filter(Boolean);
  await flow(ctx, H, story ? 130 : 50, cardBottom(story), blocks);
  footer(ctx, W, H, perfect ? 'PERFECT. 21-0.' : 'CAN YOU DO BETTER?', story);
  const f26 = G.history[2026] && G.history[2026].finish, f27 = G.history[2027] && G.history[2027].finish;
  const recs = S.map(s => `${s.f.w}-${s.f.l}`).join(', then ');
  const caption = `I rebuilt the ${team.name} in 21-0: ${R.then.ovr} → ${R.now.ovr} OVR, ${recs || (f26 && f27 ? `${f26.w}-${f26.l} then ${f27.w}-${f27.l}` : '')}${rings ? ` with ${rings > 1 ? rings + ' rings' : 'a ring'}` : ''}. Rebuild grade ${R.grade}. Can you do better?`;
  return {cv, caption, file: `21-0-${G.user}-rebuild-${size || 'post'}.png`};
}
async function resumeCard(size) {
  const [W, H] = CARD_SIZES[size] || CARD_SIZES.post, story = size === 'story';
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  try { await document.fonts.load(`900 100px ${FD}`); await document.fonts.load(`600 30px ${FB}`); await document.fonts.load(`700 30px ${FB}`); } catch (e) { /* fonts optional */ }
  const T = careerTotals();
  const fav = Object.entries(T.teams).sort((a, b) => (b[1].titles || 0) - (a[1].titles || 0) || (b[1].w || 0) - (a[1].w || 0))[0];
  const team = fav ? DATA.teams[fav[0]] : {c1: '#f3b52f', c2: '#0b1424'};
  cardBase(ctx, W, H, team, String(T.titles.length));
  const nm = (C.gmName || 'Anonymous GM').toUpperCase();
  const pctS = T.w + T.l ? (T.w / (T.w + T.l)).toFixed(3).replace(/^0/, '') : '.000';
  const rings = T.titles.slice(0, story ? 6 : 3);
  const unlocked = T.ach.filter(a => a[2]).map(a => a[0]);
  const runs = T.runs.filter(r => r.seasons && Object.keys(r.seasons).length).slice(0, story ? 5 : 3);
  const blocks = [
    {h: 80, draw: y => header(ctx, W, y, 'GM RÉSUMÉ')},
    {h: story ? 170 : 140, draw: y => { txt(ctx, nm, 60, y + (story ? 140 : 118), fitFont(ctx, nm, 900, story ? 160 : 130, W - 124), '#ffffff'); ctx.fillStyle = '#f3b52f'; ctx.fillRect(64, y + (story ? 160 : 132), 240, 10); }},
    {h: story ? 280 : 220, draw: y => {
      const n = String(T.titles.length);
      txt(ctx, n, 56, y + (story ? 250 : 200), `900 ${story ? 300 : 240}px ${FD}`, '#f3b52f');
      const x = 56 + ctx.measureText(n).width + 34;
      txt(ctx, T.titles.length === 1 ? 'SUPER' : 'SUPER', x, y + (story ? 150 : 120), `900 ${story ? 90 : 74}px ${FD}`, '#ffffff');
      txt(ctx, T.titles.length === 1 ? 'BOWL' : 'BOWLS', x, y + (story ? 240 : 194), `900 ${story ? 90 : 74}px ${FD}`, '#ffffff');
    }},
    {h: story ? 170 : 140, draw: y => {
      const st = [[`${T.w}-${T.l}`, 'RECORD'], [pctS, 'WIN PCT'], [String(T.perfect.length), 'PERFECT'], [`${Object.keys(T.teams).length}/32`, 'TEAMS']];
      const gw = 18, w = (W - 128 - gw * 3) / 4, h = story ? 170 : 140;
      st.forEach(([v, l], i) => { const x = 64 + i * (w + gw); tile(ctx, x, y, w, h); txt(ctx, l, x + 22, y + 40, `700 ${story ? 24 : 21}px ${FB}`, '#8f9cb4'); txt(ctx, v, x + 20, y + h - 28, fitFont(ctx, v, 900, story ? 74 : 62, w - 40), '#ffffff'); });
    }},
    {h: rings.length ? 46 + Math.ceil(rings.length / 3) * (story ? 120 : 104) : 100, draw: y => {
      txt(ctx, 'RINGS', 64, y + 32, `800 ${story ? 36 : 32}px ${FD}`, '#f3b52f');
      if (!rings.length) { txt(ctx, T.sb ? `${T.sb} Super Bowl trip${T.sb > 1 ? 's' : ''}. Still chasing the first ring.` : 'Still chasing the first ring.', 64, y + 86, `600 ${story ? 36 : 32}px ${FB}`, '#c9d2e2'); return; }
      const cw = (W - 128) / 3;
      rings.forEach((s, i) => {
        const x = 64 + (i % 3) * cw, yy = y + 52 + Math.floor(i / 3) * (story ? 120 : 104), t = DATA.teams[s.team], b = story ? 96 : 84;
        rrect(ctx, x, yy, b, b, 18); ctx.fillStyle = t.c1; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = hexA(accentOf(t), .9); ctx.stroke();
        txt(ctx, s.team, x + b / 2, yy + b / 2 + 13, `900 ${story ? 38 : 34}px ${FD}`, '#fff', 'center');
        txt(ctx, String(s.yr), x + b + 16, yy + 40, `800 ${story ? 40 : 36}px ${FD}`, '#ffffff');
        txt(ctx, `${s.w}-${s.l}`, x + b + 16, yy + 76, `700 ${story ? 26 : 24}px ${FB}`, '#8f9cb4');
      });
    }},
    runs.length && {h: 46 + runs.length * (story ? 86 : 70) - 10, opt: 1, draw: y => {
      txt(ctx, 'RUNS', 64, y + 32, `800 ${story ? 36 : 32}px ${FD}`, '#f3b52f');
      runs.forEach((r, i) => {
        const h = story ? 76 : 60, yy = y + 46 + i * (h + 10), t = DATA.teams[r.team], yrsR = Object.keys(r.seasons || {}).map(Number).sort();
        const w = Object.values(r.seasons || {}).reduce((s, x) => s + x.w, 0), l = Object.values(r.seasons || {}).reduce((s, x) => s + x.l, 0);
        const ringsR = Object.values(r.seasons || {}).filter(x => x.champ).length;
        tile(ctx, 64, yy, W - 128, h, ringsR ? 'rgba(243,181,47,.6)' : null);
        rrect(ctx, 64, yy, 14, h, 7); ctx.fillStyle = accentOf(t); ctx.fill();
        txt(ctx, t.name.toUpperCase(), 98, yy + h / 2 + 12, `800 ${story ? 38 : 32}px ${FD}`, '#ffffff');
        const meta = `${yrsR.length ? (yrsR.length > 1 ? yrsR[0] + '–' + yrsR[yrsR.length - 1] : yrsR[0]) + ' · ' : ''}${w}-${l}${ringsR ? ' · ' + ringsR + ' ring' + (ringsR > 1 ? 's' : '') : ''}${r.fired ? ' · fired' : ''}`;
        txt(ctx, meta, W - 64 - (r.grade ? 90 : 28), yy + h / 2 + 9, `600 ${story ? 26 : 22}px ${FB}`, ringsR ? '#f3b52f' : '#8f9cb4', 'right');
        if (r.grade) txt(ctx, r.grade, W - 92, yy + h / 2 + 15, `900 ${story ? 46 : 40}px ${FD}`, gradeCol(r.grade), 'right');
      });
    }},
    {h: 50, draw: y => { const s = unlocked.length ? unlocked.join(' · ').toUpperCase() : `${T.po} PLAYOFF TRIP${T.po === 1 ? '' : 'S'}`; txt(ctx, s, 64, y + 38, fitFont(ctx, s, 800, story ? 40 : 34, W - 128), '#c9d2e2'); }},
  ].filter(Boolean);
  await flow(ctx, H, story ? 130 : 50, cardBottom(story), blocks);
  footer(ctx, W, H, 'CAN YOU BEAT IT?', story);
  const caption = `My 21-0 GM résumé: ${T.titles.length} Super Bowl${T.titles.length === 1 ? '' : 's'}, ${T.w}-${T.l} career, ${Object.keys(T.teams).length} of 32 teams run. Can you beat it?`;
  return {cv, caption, file: `21-0-resume-${size || 'post'}.png`};
}
async function openShare(kind, size) {
  UI.shareKind = kind = kind || UI.shareKind || 'final'; UI.shareSize = size = size || UI.shareSize || 'post';
  modal(`<div class="sheeth"><div><div class="kicker">Share</div><h3>Making your card</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div><p class="muted">Drawing it now.</p>`, true);
  let r;
  try { r = kind === 'resume' ? await resumeCard(size) : await rebuildCard(size); } catch (e) { console.error(e); modal(`<div class="sheeth"><h3>Could not draw the card</h3><button class="x" data-act="closeModal" aria-label="Close">×</button></div><p class="muted">Copy the text version instead.</p><div class="row end"><button class="btn" data-act="copy">Copy text</button></div>`); return; }
  UI.shareCard = r; UI.share = r.caption;
  const url = r.cv.toDataURL('image/png');
  const enc = encodeURIComponent(r.caption);
  modal(`<div class="sheeth"><div><div class="kicker">Share</div><h3>${kind === 'resume' ? 'Your GM résumé' : 'Your rebuild'}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="seg sharesize">${Object.entries(CARD_SIZES).map(([k, v]) => `<button class="${k === size ? 'on' : ''}" data-act="shareSize" data-k="${k}">${v[2]}</button>`).join('')}</div>
    <img class="sharepreview ${size}" src="${url}" alt="${esc(r.caption)}">
    <div class="row end"><button class="btn" data-act="copy">Copy caption</button><a class="btn" href="https://twitter.com/intent/tweet?text=${enc}" target="_blank" rel="noopener">Post on X</a><a class="btn" href="https://www.threads.net/intent/post?text=${enc}" target="_blank" rel="noopener">Threads</a><button class="btn go" data-act="saveCard" id="saveCardBtn">Save image</button></div>
    <p class="small muted">${size === 'story' ? 'Sized for Instagram, TikTok and Snapchat stories.' : 'Sized for Instagram and X feeds.'} Save it, then attach it to your post.</p>`, true);
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
// Your needs as small grade chips; tapping one filters a list to that position
function needChips(act, cur, t) {
  const needs = E.teamNeeds(t).filter(n => n.level !== 'Low' && n.pos !== 'K').slice(0, 5);
  return `<span class="needchips2">${needs.map(n => `<button class="nchip ${n.level === 'High' ? 'hi' : ''} ${cur === n.pos ? 'on' : ''}" data-act="${act}" data-k="${cur === n.pos ? 'ALL' : n.pos}"><span class="ng sm g${RANK_LETTER(n.rank)}">${RANK_LETTER(n.rank)}</span>${n.pos}</button>`).join('') || '<span class="small muted">No big holes</span>'}</span>`;
}
function teamPanel(act, cur) {
  const N = E.teamNeeds(), d = E.depth(G.user), tr = E.teamRating(G.user);
  const order = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K'];
  const grade = pos => { const n = N.find(x => x.pos === pos); return n ? RANK_LETTER(n.rank) : ''; };
  const needs = N.filter(n => n.level !== 'Low');
  return `<div class="card tpanel"><div class="cardh"><h3>${act === 'tNeedPos' || act === 'dNeedPos' ? 'Needs & depth chart' : 'Your team'}</h3><span class="small muted">${tr.ovr} OVR · off ${tr.off} · def ${tr.def}</span></div>
    <div class="lbl">Needs${act ? ' · tap to filter' : ''}</div>
    <div class="needchips2">${needs.length ? needs.map(n => `<button class="nchip ${n.level === 'High' ? 'hi' : ''} ${cur === n.pos ? 'on' : ''}" ${act ? `data-act="${act}" data-k="${n.pos}"` : 'disabled'}><span class="ng sm g${RANK_LETTER(n.rank)}">${RANK_LETTER(n.rank)}</span>${n.pos}</button>`).join('') : '<span class="small muted">No big holes. Upgrade anywhere.</span>'}${act && cur && cur !== 'ALL' ? `<button class="nchip" data-act="${act}" data-k="ALL">Show all</button>` : ''}</div>
    <details class="fold dfold" data-fold="depth" ${foldOpen('depth')}><summary>Depth chart</summary>
    <div class="dchart">${order.map(pos => { const L = d[pos], n = E.STARTERS[pos]; return `<div class="drow ${cur === pos ? 'on' : ''}"><span class="dpos">${pos}<i class="g${grade(pos)}">${grade(pos)}</i></span><span class="dplayers">${L.slice(0, n).map(p => `<span class="dp">${face(p, 'xs')}<span>${esc(lastName(p.n))}</span><b class="${inCamp(p) ? '' : oc(p.ovr)}">${ovrNum(p)}</b></span>`).join('') || '<span class="dp bad">Empty</span>'}${L[n] ? `<span class="dp bk"><span>${esc(lastName(L[n].n))}</span><b>${L[n].ovr}</b></span>` : ''}</span></div>`; }).join('')}</div></details></div>`;
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
  return `<div class="ibar" title="Interest: how much he wants to play for you" aria-label="Interest ${it.score}"><i style="width:${it.score}%;background:${c}"></i></div><b class="num" style="color:${c}">${it.score}</b>`;
}
// Free agency: one list of everyone, an offer sheet that answers right away, and a short list of open talks.
const interestWord = n => n >= 65 ? ['good', 'Wants you'] : n >= 40 ? ['warn', 'Open'] : ['bad', 'Not keen'];
function homeFA() {
  G.fa.met = G.fa.met || {}; G.fa.offers = G.fa.offers || {}; G.fa.decisions = G.fa.decisions || []; G.fa.meetings = G.fa.meetings || 0; G.fa.counter = G.fa.counter || {};
  const F = G.fa, d = E.depth(G.user), space = E.capSpace(G.user);
  const N = E.teamNeeds(), needPos = new Set(N.filter(n => n.level !== 'Low').map(n => n.pos));
  const upOf = p => { const st = d[p.pos][E.STARTERS[p.pos] - 1]; return st ? p.ovr - st.ovr : p.ovr; };
  let pool = E.faPool();
  const q = (UI.faQ || '').trim().toLowerCase();
  if (q) pool = pool.filter(p => p.n.toLowerCase().includes(q) || p.pos.toLowerCase() === q);
  if (UI.faPos && UI.faPos !== 'ALL') pool = pool.filter(p => inGroup(p.pos, UI.faPos));
  if (UI.faAfford) pool = pool.filter(p => upOf(p) > 0 && E.faPrice(p) <= space);
  pool = pool.slice(0, 40);
  const mine = (G.signings || []).filter(x => G.players[x.id] && G.players[x.id].tm === G.user && G.players[x.id].end >= G.season && x.season === G.season).slice(-8).reverse();
  const talks = Object.entries(F.counter || {}).filter(([pid]) => G.players[pid] && G.players[pid].tm === 'FA');
  const legacy = (F.decisions || []).map(dc => { const p = G.players[dc.id]; return `<div class="outbid">${vban('counter', `The ${tname(dc.t)} outbid you`, `${p.n} has ${money(dc.apy)} × ${dc.yrs} yr from them against your ${money(dc.mine.apy)}. Beat it and he is yours.`)}
    <div class="trow">${pRow(p)}<div class="row nowrap"><button class="btn ghost" data-act="faPass" data-id="${p.id}">Let him go</button><button class="btn go" data-act="faMatch" data-id="${p.id}" ${dc.match > space ? 'disabled title="Not enough cap space"' : ''}>Outbid: ${money(dc.match)}</button></div></div></div>`; }).join('');
  const oldOffers = Object.entries(F.offers || {});
  const row = p => {
    const it = E.interest(p, G.user), [ic, il] = interestWord(it.score), up = upOf(p), price = E.faPrice(p), yrs = E.yearsFor(p), c = F.counter[p.id];
    return `<div class="farow2" data-act="faOpen" data-id="${p.id}">${face(p, 'sm')}<div class="pmain"><div class="pn">${esc(p.n)}${needPos.has(p.pos) && up > 0 ? ' <span class="tag gold">Need</span>' : ''}</div>
      <div class="psub">${p.pos} · ${Math.floor(p.age)} · <span class="${up > 0 ? 'good' : ''}">${!d[p.pos][E.STARTERS[p.pos] - 1] ? 'Fills an empty spot' : up > 0 ? '+' + up + ' over your starter' : 'Depth'}</span> · <span class="${ic}">${il}</span></div></div>
      ${ovrBadge(p)}
      <div class="faprice"><b class="num">${money(c ? c.apy : price)}</b><span class="small muted">${c ? 'his counter' : `× ${yrs} yr`}</span></div>
      <button class="btn sm ${price <= space ? 'go' : ''}" data-act="${price <= space ? 'faSign' : 'faOpen'}" data-id="${p.id}">${price <= space ? 'Sign' : 'Offer'}</button></div>`;
  };
  return `${stepper(2)}<section class="hero"><div><div class="kicker">Wave ${Math.min(F.wave, 3)} of 3 · prices drop each wave</div><h2>Free agency${helpBtn('fa')}</h2>
    <p class="lead">Every offer gets an answer right away.</p></div>
    <div class="row">${F.wave <= 3 && !F.decisions.length ? `<button class="btn go lg" data-act="faWave">End wave ${F.wave}</button>` : ''}<button class="btn" data-act="toDraft">${F.wave > 3 ? 'Next: the draft' : 'Skip to the draft'}</button></div></section>
  <div class="kpistrip three"><div class="kpi"><span>Cap space</span><b class="num ${space < 5 ? 'warn' : ''}">${money(space)}</b></div><div class="kpi"><span>Signed</span><b class="num">${mine.length}</b></div><div class="kpi"><span>Biggest need</span><b>${N[0] ? N[0].pos : '–'}</b></div></div>
  ${legacy ? `<div class="card outbidcard"><h3>Outbid</h3>${legacy}</div>` : ''}
  <div class="toolbar fatool"><label class="search fasearch"><span class="sr">Search free agents</span><input id="faQ" type="search" placeholder="Search a name or position" value="${esc(UI.faQ || '')}" autocomplete="off"></label>
    <button class="chip ${UI.faAfford ? 'on' : ''}" data-act="faAfford">Upgrades I can afford</button></div>
  ${posChips('faPos', UI.faPos || 'ALL')}
  <div class="grid fa-grid"><div class="card falist">${pool.map(row).join('') || (q ? `<p class="muted">Nobody matches "${esc(UI.faQ)}". He may have signed already.</p>` : UI.faAfford ? '<p class="muted">No upgrade fits your cap space. Turn off the filter to see everyone, or make cap room.</p>' : '<p class="muted">Nobody left at that position.</p>')}</div>
  <div class="grid">
    ${talks.length ? `<div class="card"><h3>Waiting on you</h3>${talks.map(([pid, c]) => `<div class="trow">${pRow(G.players[pid], `will sign for ${money(c.apy)} × ${c.yrs}`)}<button class="btn sm go" data-act="faTake" data-id="${pid}" ${c.apy > space ? 'disabled title="Not enough cap space"' : ''}>Accept</button></div>`).join('')}</div>` : ''}
    ${oldOffers.length ? `<div class="card"><h3>Your offers</h3>${oldOffers.map(([pid, o]) => `<div class="trow">${pRow(G.players[pid], `${money(o.apy)} × ${o.yrs} yr`)}<button class="xs" data-act="faCancel" data-id="${pid}" aria-label="Withdraw offer">×</button></div>`).join('')}</div>` : ''}
    <div class="card"><h3>Signed this offseason</h3>${mine.length ? mine.map(x => `<div class="trow">${pRow(G.players[x.id], `${money(x.apy)}`)}</div>`).join('') : '<p class="small muted">Nobody yet.</p>'}</div>
    <details class="fold card" data-fold="wire" ${foldOpen('wire')}><summary>Around the league <span class="small muted">${F.log.length}</span></summary><ul class="news">${F.log.slice(0, 40).map(n => `<li>${esc(n)}</li>`).join('') || '<li class="muted">Nobody has signed yet.</li>'}</ul></details>
  </div></div>`;
}
function stepperRow(id, val, min) {
  return `<div class="stepper2"><button class="btn icon" data-act="apyStep" data-id="${id}" data-d="-0.5" aria-label="Lower">−</button><label><span class="sr">Per year ($M)</span><input id="apy-${id}" type="number" step="0.1" min="${min}" value="${val}"></label><button class="btn icon" data-act="apyStep" data-id="${id}" data-d="0.5" aria-label="Raise">+</button><span class="small muted">$M per year</span></div>`;
}
function playerHead(p, it) {
  const {w} = E.priorities(p);
  const pri = [['Money', w.money], ['Winning', w.win], ['Role', w.role], ['Loyalty', w.loyal]].sort((a, b) => b[1] - a[1]);
  return `<div class="pchead">${face(p, 'xl')}<div class="pcmid"><div class="kicker">${p.pos} · ${Math.floor(p.age)} · ${p.fromTeam ? 'last ' + esc(tname(p.fromTeam)) : esc(tname(p.tm))}</div><h3>${esc(p.n)}</h3><span class="tag">${esc(it.persona)}</span> <span class="small muted">wants ${E.yearsFor(p)} years</span></div>
    ${inCamp(p) ? `<div class="pcovr proj"><b>${p.proj[0]}–${p.proj[1]}</b><span>Scouts</span></div>` : `<div class="pcovr ${oc(p.ovr)}"><b>${p.ovr}</b><span>OVR</span></div>`}<button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="grid g2 meetgrid"><div><h4 class="sub">What he cares about</h4>${pri.map(([k, v]) => `<div class="prio"><span>${k}</span><div class="ibar"><i style="width:${Math.round(v * 100 / pri[0][1])}%"></i></div><b class="num">${Math.round(v * 100)}%</b></div>`).join('')}</div>
    <div><h4 class="sub">How he sees you <b class="num">${it.score}</b></h4>${it.parts.map(x => `<div class="seeline"><span class="${x.v >= .6 ? 'good' : x.v <= .3 ? 'bad' : 'warn'}">${x.v >= .6 ? '✓' : x.v <= .3 ? '✗' : '•'}</span>${esc(x.note)}</div>`).join('')}
      <p class="small muted">${it.score >= 65 ? 'He wants to be here, so his price is lower.' : it.score >= 40 ? 'He is open to it at full price.' : 'You will have to pay a premium.'} Meet his ask and he signs on the spot.</p></div></div>`;
}
function faModal(id, msg, kind) {
  const p = G.players[id], F = G.fa;
  if (!p) return;
  if (p.tm !== 'FA') { modal(`<div class="sheeth"><h3>${esc(p.n)}</h3><button class="x" data-act="closeModal" aria-label="Close">×</button></div><div class="agent">${esc(msg || (p.tm === G.user ? 'He is yours.' : `He signed with the ${tname(p.tm)}.`))}</div><div class="row end"><button class="btn go" data-act="closeModal">Done</button></div>`); return; }
  const it = E.interest(p, G.user), [ic, il] = interestWord(it.score), space = E.capSpace(G.user);
  const yrs = UI.faYrs[id] || E.yearsFor(p), price = E.faPrice(p, yrs), c = (F.counter || {})[id], walked = (F.walked || {})[id];
  const d = E.depth(G.user), st = d[p.pos][E.STARTERS[p.pos] - 1], up = st ? p.ovr - st.ovr : p.ovr;
  const offer = (k, label) => { const v = Math.round(price * k * 10) / 10, odds = E.faOdds(p, v, yrs), over = v > space;
    return `<button class="offerbtn ${k === 1 ? 'main' : ''}" data-act="faBid" data-id="${id}" data-v="${v}" ${over || walked ? 'disabled' : ''}><b class="num">${money(v)}</b><span>${label}</span><em class="${odds === 'Long shot' ? 'bad' : odds === 'He may counter' ? 'warn' : 'good'}">${over ? 'Over your cap' : odds}</em></button>`; };
  const {w} = E.priorities(p), pri = [['Money', w.money], ['Winning', w.win], ['Role', w.role], ['Loyalty', w.loyal]].sort((a, b) => b[1] - a[1]);
  modal(`<div class="pchead">${face(p, 'xl')}<div class="pcmid"><div class="kicker">${p.pos} · ${Math.floor(p.age)} · ${p.fromTeam ? 'last ' + esc(tname(p.fromTeam)) : 'free agent'}</div><h3>${esc(p.n)}</h3>
      <div class="pchips"><span class="tag ${ic}">${il} · ${it.score}</span><span class="tag ${up > 0 ? 'gold' : ''}">${!st ? 'Fills an empty spot' : up > 0 ? '+' + up + ' over your starter' : 'Depth'}</span><span class="tag">Wants ${E.yearsFor(p)} yr</span></div></div>
      ${inCamp(p) ? `<div class="pcovr proj"><b>${p.proj[0]}–${p.proj[1]}</b><span>Scouts</span></div>` : `<div class="pcovr ${oc(p.ovr)}"><b>${p.ovr}</b><span>OVR</span></div>`}<button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    ${msg ? vban(kind || 'info', kind === 'counter' ? 'He countered' : kind === 'no' ? (walked ? 'He walked away' : 'He said no') : kind === 'yes' ? 'Good pitch' : kind === 'warn' ? 'Can\'t do that' : 'His agent', msg) : ''}
    ${c && !walked ? `<div class="counterbar"><div><b>He will sign for ${money(c.apy)} × ${c.yrs} yr</b><span class="small muted">Accept now, before another team does</span></div><button class="btn go" data-act="faTake" data-id="${id}" ${c.apy > space ? 'disabled' : ''}>Accept</button></div>` : ''}
    ${walked ? '<div class="agent">He stopped taking your calls. Try again next wave.</div>' : ''}
    <div class="lbl">Years</div><div class="seg yrs" role="group" aria-label="Contract length">${[1, 2, 3, 4, 5].map(y => `<button class="${y === yrs ? 'on' : ''}" data-act="faYrs" data-id="${id}" data-k="${y}"><b>${y}${y === E.yearsFor(p) ? ' ★' : ''}</b><small>${money(E.faPrice(p, y))}</small></button>`).join('')}</div>
    <div class="lbl">Offer per year · ${money(space)} cap space</div>
    <div class="offerbtns">${offer(1, 'His ask')}${offer(.93, '7% under')}${offer(.85, '15% under')}</div>
    <div class="waitrow"><div><b>Or bid and wait</b><span class="small muted">He weighs every team's offer when wave ${F.wave} ends. If someone beats you, you get a chance to outbid them.</span></div>
      ${F.offers[id] ? `<span class="tag gold">Your bid: ${money(F.offers[id].apy)} × ${F.offers[id].yrs}</span><button class="btn sm ghost" data-act="faCancel" data-id="${id}">Withdraw</button>` : [.88, .94].map(k => { const v = Math.round(price * k * 10) / 10; return `<button class="btn sm" data-act="faWait" data-id="${id}" data-v="${v}" ${walked || v > space ? 'disabled' : ''}>Bid ${money(v)}</button>`; }).join('')}</div>
    <details class="fold" data-fold="facustom" ${foldOpen('facustom')}><summary>Your own number</summary>${stepperRow(id, UI.faApy[id] != null ? UI.faApy[id] : Math.round(price * .9 * 10) / 10, 1)}<div class="row end"><button class="btn" data-act="faSubmit" data-id="${id}" ${walked ? 'disabled' : ''}>Offer</button></div></details>
    <details class="fold" data-fold="fapitch" ${foldOpen('fapitch')}><summary>Pitch him <span class="small muted">${3 - (F.meetings || 0)} of 3 left this wave</span></summary>
      <p class="small muted">He cares most about ${pri[0][0].toLowerCase()}, then ${pri[1][0].toLowerCase()}. ${it.parts.map(x => x.note).join('. ')}.</p>
      ${F.met[id] ? `<p class="small"><b class="${F.met[id].boost > 0 ? 'good' : 'bad'}">${F.met[id].boost > 0 ? '+' : ''}${F.met[id].boost} interest</b> from your pitch.</p>` : `<div class="row">${Object.entries(E.PITCHES).map(([k, v]) => `<button class="chip" data-act="faPitch" data-id="${id}" data-k="${k}" ${(F.meetings || 0) >= 3 ? 'disabled' : ''}>${esc(v[0])}</button>`).join('')}</div>`}</details>
    <div class="row end"><button class="btn" data-act="closeModal">Close</button></div>`, true);
}

const faKind = r => r.result === 'counter' ? 'counter' : r.result === 'no' || r.result === 'walked' ? 'no' : 'warn';
// ---------- re-sign negotiation ----------
function negModal(id, msg, kind) {
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
    ${msg ? vban(kind || 'info', kind === 'no' ? 'He walked away' : kind === 'counter' ? 'Not enough' : kind === 'warn' ? 'Can\'t do that' : 'His agent', msg) : ''}
    <div class="row end"><button class="btn ghost" data-act="${n.walked ? 'closeModal' : 'letgo'}" data-id="${id}">${n.walked ? 'Done' : 'Let him go'}</button>${n.walked ? '' : `<button class="btn" data-act="negAsk" data-id="${id}">Pay ${money(n.ask)}</button><button class="btn go" data-act="negSubmit" data-id="${id}">Make offer</button>`}</div>`, true);
}

// ---------- render ----------
// Scroll boxes inside a screen (trade lists, the big board, free agents) keep their place when a tap re-renders the screen
const SCROLLERS = '.alist, .plist, .dboard, .dorder, .tw, .mboard, .scroll, .poschips, .wkchips, .teamgrid, .news';
const scrollKey = e => [e.className, (e.closest('.card') && e.closest('.card').querySelector('h3') || {}).textContent || ''].join('|');
function saveScroll(root) {
  const seen = {}, out = {};
  for (const e of root.querySelectorAll(SCROLLERS)) { const k = scrollKey(e); const i = seen[k] = (seen[k] || 0) + 1; if (e.scrollTop || e.scrollLeft) out[k + '#' + i] = [e.scrollTop, e.scrollLeft]; }
  return out;
}
function restoreScroll(root, saved) {
  const seen = {};
  for (const e of root.querySelectorAll(SCROLLERS)) { const k = scrollKey(e); const i = seen[k] = (seen[k] || 0) + 1; const v = saved[k + '#' + i]; if (v) { e.scrollTop = v[0]; e.scrollLeft = v[1]; } }
}
const renderCached = () => { const app = $('#app'), saved = app ? saveScroll(app) : {}, y = window.scrollY; E.cached(renderInner)(); if (app) restoreScroll(app, saved); if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); };
function renderInner() {
  renderHeader();
  if (!G) { $('#app').innerHTML = ''; if (UI.tab === 'resume') $('#app').innerHTML = renderResume(); else renderPicker(); return; }
  const tabs = {home: renderHome, roster: renderRoster, trade: renderTrade, league: renderLeague, resume: renderResume};
  $('#app').innerHTML = (tabs[UI.tab] || renderHome)();
  // every tab carries the next step at the top of the page, not just the sidebar
  const a = nextAction(), hero = $('#app .hero');
  if (a && hero && UI.tab !== 'home') hero.insertAdjacentHTML('beforeend', `<button class="btn go pagenext" data-act="${a.act}" ${a.k ? `data-k="${a.k}"` : ''}><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>${esc(a.label)}</button>`);
}
function render() {
  NEEDSET = null;
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
  // the latest game in view in the results strip
  $$('.rstrip').forEach(rs => { if (rs.scrollWidth > rs.clientWidth) rs.scrollLeft = rs.scrollWidth; });
  // keep the pick on the clock in view in the draft ticker
  const cur = $('.dticker .dtile.cur'); if (cur) cur.parentNode.scrollLeft = Math.max(0, cur.offsetLeft - cur.parentNode.offsetLeft - 8 - cur.offsetWidth);
}
const OPEN_BY_DEFAULT = new Set(['fapitch', 'depth', 'bracket']);
const foldOpen = k => { const f = (UI.folds || {})[k]; return f === undefined ? (OPEN_BY_DEFAULT.has(k) ? 'open' : '') : f ? 'open' : ''; };
document.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.fold) (UI.folds = UI.folds || {})[d.dataset.fold] = d.open; }, true);
// 3. the back button: closes a sheet, then goes back to Home, before it ever leaves the game
const NAV = {pushed: false};
function navMark() { if (NAV.pushed) return; try { history.pushState({inGame: 1}, ''); NAV.pushed = true; } catch (e) { /* history unavailable */ } }
window.addEventListener('popstate', () => {
  NAV.pushed = false;
  if (UI.ddOpen) { UI.ddOpen = null; render(); }
  else if ($('#layer .modal:not(.closing)')) { closeModal(); UI.found = null; }
  else if (G && UI.tab !== 'home') { UI.tab = 'home'; render(); window.scrollTo(0, 0); }
  if ($('#layer .modal:not(.closing)') || (G && UI.tab !== 'home')) navMark();
});
function go(tab) { UI.tab = tab; UI.found = null; if (tab !== 'home') navMark(); render(); window.scrollTo(0, 0); }

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
    if (G.season >= 2027) G.history[G.season] = {finish: E.userFinish(G.season), champ: P.champ, ovr: E.teamRating(G.user).ovr};
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
  G.mode = UI.mode === 'worst' ? 'worst' : 'standard';
  UI.give = []; UI.get = []; UI.cutSel = null; UI.found = null; UI.proj = null; UI.tab = 'home'; UI.tview = null;
  E.refreshOffers();
}
function openFound(id, list) { UI.found = {id, list}; dealsSheet(id); }
// Ask around (your player) or Find trades (theirs): the deals on one sheet, the best first
function dealsSheet(id) {
  const p = G.players[id]; if (!p || !UI.found) return;
  const mine = p.tm === G.user, list = UI.found.list;
  const deal = (x, i) => `<div class="offer slim"><div class="offerh">${badge(x.partner, 1)}<div><b>${esc(G.teams[x.partner].name)}</b>${x.label && !mine ? `<div class="small muted">${esc(x.label.split(' · ')[0])}</div>` : ''}</div>${fairTag(x.ev.fair)}</div>
    <div class="offerb"><div><div class="lbl">You get</div>${x.get.map(assetMini).join('')}</div><div><div class="lbl">You send</div>${x.give.map(assetMini).join('')}</div></div>
    <div class="row end"><button class="btn sm ghost" data-act="loadFound" data-i="${i}">Edit</button><button class="btn sm go" data-act="proposeFound" data-i="${i}" ${x.ev.ok ? '' : 'disabled'}>Make this trade</button></div></div>`;
  modal(`<div class="sheeth"><div><div class="kicker">${mine ? 'Ask around' : 'Find a deal'}</div><h3>${esc(p.n)}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
    <div class="dealhead">${face(p, 'sm')}<span class="small muted">${p.pos} · ${Math.floor(p.age)} · <b class="${inCamp(p) ? '' : oc(p.ovr)}">${ovrNum(p)}</b> · ${money(p.cap)} thru ${p.end}</span><button class="linkbtn" data-act="player" data-id="${esc(p.id)}">Player card</button></div>
    ${mine ? wantPicker('shopWant', UI.shopWant || 'any') : ''}
    <div class="offers">${list.length ? list.map(deal).join('') : (mine ? `<div class="nobite"><b>Nobody wants him right now.</b><span class="small muted">${esc(E.whyNoMarket(p.id, UI.shopWant || 'any'))}</span></div>` : '<p class="muted">Nobody found a deal that works right now.</p>')}</div>`, true);
}

document.addEventListener('click', e => {
  if (UI.guide != null && !e.target.closest('#guide')) showGuide(null);
  if (UI.ddOpen && !e.target.closest('.dd')) { UI.ddOpen = null; if (!e.target.closest('[data-act],[data-tab]')) { render(); return; } }
  const tb = e.target.closest('[data-tab]');
  if (tb && !tb.closest('[data-act]')) { closeModal(); go(tb.dataset.tab); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'closeModal' && e.target.closest('[data-stop]') && !e.target.closest('button')) return;
  if (el.disabled) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (el.classList.contains('go')) sfx('tap');
  const fromSheet = el.closest('#layer .sheet');
  if (fromSheet && SHEET_NAV.has(a)) UI.pushSheet = {html: fromSheet.innerHTML, wide: fromSheet.classList.contains('wide')};
  else if (a !== 'sheetBack') UI.pushSheet = null;
  switch (a) {
    case 'sheetBack': { const prev = (UI.sheetStack || []).pop(); if (!prev) { closeModal(); return; } UI.backing = true; UI.pushSheet = null; modal(prev.html.replace(/<div class="sbackbar">[\s\S]*?<\/div>/, '').replace(/<button class="sback"[^>]*>‹ Back<\/button>/, ''), prev.wide); return; }
    case 'pick': {
      const t = el.dataset.t;
      modal(`<div class="sheeth"><div><div class="kicker">Take the job</div><h3>Run the ${esc(DATA.teams[t].name)}?</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>${(() => { E.newGame(DATA, t, 1); const r = E.teamRating(t), qb = r.d.QB[0], rank = E.teamList().filter(x => E.teamRating(x).ovr > r.ovr).length + 1, cap = E.G.cap[2026] - E.payroll(t); const goal = [[4, 'Win it all'], [10, 'Deep run'], [18, 'Playoffs'], [25, 'Winning record'], [32, 'Show progress']].find(g => rank <= g[0])[1]; return `<div class="kpis pickkpis"><div><b class="num ${oc(r.ovr)}">${r.ovr}</b><span>OVR · #${rank}</span></div><div><b class="num">${money(cap)}</b><span>Cap space</span></div><div><b>${esc(goal)}</b><span>Owner expects</span></div></div>${qb ? `<p class="small muted">QB ${esc(qb.n)} (${qb.ovr})</p>` : ''}`; })()}<div class="row end"><button class="btn" data-act="closeModal">Back</button><button class="btn go" data-act="confirmPick" data-t="${t}">Take the job</button></div>`);
      return;
    }
    case 'confirmPick': { startGame(el.dataset.t); closeModal(); window.scrollTo(0, 0); let seen = false; try { seen = localStorage.getItem('21-0-guide') === '1'; localStorage.setItem('21-0-guide', '1'); } catch (e) { /* storage unavailable */ } persist(); render(); if (!seen) setTimeout(() => showGuide(0), 300); return; }
    case 'runback': { const t = G.user; startGame(t); toast(`Back to Week 1 with the ${DATA.teams[t].nick}.`); window.scrollTo(0, 0); break; }
    case 'resume': try { G = E.load(localStorage.getItem(SAVE_KEY)); E.attachData(DATA); if (!G.start) G.start = E.snapshotFromData(DATA, G.user); G.offers = G.offers || []; if (!G.startedAt) G.startedAt = Date.now(); if (G.playoffs[2026] && G.playoffs[2026].champ) recordRun(G.phase === 'final'); } catch (err) { toast('Could not load the save.'); return; } UI.tab = 'home'; break;
    case 'closeModal': closeModal(); UI.found = null; return;
    case 'faSheet': faSheet(el.dataset.k); return;
    case 'flexMove': { const p = G.players[id], back = !el.dataset.k, from = back ? (G.flex || {})[id] : p.pos; E.setFlex(id, el.dataset.k || null); persist(); render(); depthModal(back ? from : el.dataset.k); toast(back ? `${p.n} is back at ${p.pos}.` : `${p.n} now plays ${el.dataset.k}.`); return; }
    case 'ownerSheet': ownerSheet(); return;
    case 'goalsSheet': goalsSheet(); return;
    case 'takeSalary': { const sid = E.salaryBack(UI.partner, UI.give, UI.get); if (sid) { UI.get.push(sid); toast(`Added ${G.players[sid].n}: his salary fixes their cap.`); } break; }
    case 'restructure': { const r = E.restructure(id); if (r) { persist(); render(); openPlayer(id); toast(`${money(r.save)} of cap room now.`); } return; }
    case 'leagueTrades': leagueTradesSheet(); return;
    case 'bidWar': bidSheet(id); return;
    case 'bidTake': { const w = UI.bidWin; if (!w) return; const r = E.doTrade(w.t, w.give, w.get, 'accepted'); closeModal(); if (r.ok) { persist(); render(); tradePopup(w.t, w.give, w.get, 'Sold to the highest bidder'); return; } popup('Trade', 'It fell apart', vban('no', 'No deal', r.issues[0] || 'Something changed.')); return; }
    case 'captSheet': captSheet(el.dataset.k); return;
    case 'captSet': { E.setCaptain(el.dataset.k, id); persist(); render(); captSheet(el.dataset.k); toast(`${G.players[id].n} wears the C.`); return; }
    case 'optYes': case 'optNo': { const p = G.players[id]; if (E.decideOption(id, a === 'optYes')) toast(a === 'optYes' ? `${p.n} is signed through ${p.end}.` : `Declined. ${p.n} plays out ${G.season}.`); break; }
    case 'matchSheet': matchSheet(); return;
    case 'chemSheet': chemSheet(); return;
    case 'depthSheet': modal(`<div class="sheeth"><h3>Your team</h3><button class="x" data-act="closeModal" aria-label="Close">×</button></div>${teamPanel(null).replace('<details class="fold dfold" data-fold="depth" ', '<details class="fold dfold" open ')}`, true); return;
    case 'injurySheet': injurySheet(); return;
    case 'midSign': { const r = E.signMidseason(id); if (!r.ok) { toast(r.msg); return; } persist(); render(); signPopup(id, r.price, 1); return; }
    case 'posFilter': UI[el.dataset.k] = el.dataset.v; if (el.dataset.k === 'faSheetPos') { faSheet(); return; } break;
    case 'tPartner': UI.partner = el.dataset.t || null; UI.get = []; UI.tposGet = 'ALL'; window.scrollTo(0, 0); break;
    case 'blockAccept': case 'blockEdit': {
      const x = ((UI.blockDeals || {})[id] || [])[+el.dataset.i]; if (!x) return;
      if (a === 'blockEdit') { UI.partner = x.partner; UI.give = x.give.slice(); UI.get = x.get.slice(); UI.tview = 'make'; break; }
      const r = E.doTrade(x.partner, x.give, x.get); if (r.ok) { E.toggleBlock(id); persist(); render(); tradePopup(x.partner, x.give, x.get, 'Trade block deal'); return; }
      toast(r.issues[0] || 'That deal fell apart.'); break;
    }
    case 'cutOpen': UI.cutOpen = true; break;
    case 'tradeUpOpen': UI.tradeUpOpen = true; break;
    case 'dockMore': UI.dockMore = !UI.dockMore; break;
    case 'lgMore': UI.lgMore = !UI.lgMore; break;
    case 'box': boxSheet(+el.dataset.s, el.dataset.k); return;
    case 'boxSide': if (UI.boxAt) boxSheet(UI.boxAt.s, UI.boxAt.k, el.dataset.k); return;
    case 'scoreWk': UI.scoreWk = isNaN(+el.dataset.k) ? el.dataset.k : +el.dataset.k; break;
    case 'modeSheet': modal(`<div class="sheeth"><div><div class="kicker">Optional</div><h3>Pick a mode</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div><div class="helplist">${Object.entries(MODES).map(([k, v]) => `<button class="modeopt ${(UI.mode || 'standard') === k ? 'on' : ''}" data-act="setMode" data-k="${k}"><b>${esc(v[0])}</b><span>${esc(v[1])}</span></button>`).join('')}</div>`, true); return;
    case 'setMode': UI.mode = el.dataset.k; closeModal(); renderPicker(); renderHeader(); return;
    case 'tAll': UI[el.dataset.k] = !UI[el.dataset.k]; break;
    case 'capRoom': capRoomSheet(); return;
    case 'cutNow': { const p = G.players[id]; if (!p) return; const dead = E.cutPlayer(id); toast(`Released ${p.n}. Cap space is now ${money(E.capSpace(G.user))}${dead ? ` (${money(dead)} dead money)` : ''}.`); persist(); render(); capRoomSheet(); return; }
    case 'blockWant': E.setBlockWant(el.dataset.k); persist(); break;
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
    case 'guideNext': showGuide(UI.guide + 1); return;
    case 'guideSkip': showGuide(null); return;
    case 'guide': closeModal(); window.scrollTo(0, 0); UI.tab = 'home'; render(); setTimeout(() => showGuide(0), 120); return;
    case 'sound': SND.on = !SND.on; try { localStorage.setItem('21-0-sound', SND.on ? 'on' : 'off'); } catch (e) { /* storage unavailable */ } if (SND.on) sfx('tap'); if ($('.helpfoot')) helpSheet(helpKey()); return;
    case 'seg': UI[el.dataset.seg] = el.dataset.k; if (el.dataset.seg === 'league') UI.lgMore = false; if (el.dataset.go) { go(el.dataset.go); return; } render(); return;
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
    case 'playWeek': playWeek(); return;
    case 'toDeadline': UI.tview = null; simWithReel(`${G.season} · Weeks ${G.week + 1}-${E.DEADLINE_WEEK}`, () => { E.simTo(E.DEADLINE_WEEK); G.phase = 'deadline'; E.updateConfidence('deadline'); E.refreshOffers(); UI.proj = null; }); return;
    case 'simRest': UI.give = []; UI.get = []; G.offers = []; simWithReel(`${G.season} · Weeks ${G.week + 1}-18`, () => { finishRegular(); UI.tab = 'home'; }); return;
    case 'poNext': simWithReel(`${G.season} playoffs`, () => { E.simPlayoffRound(); endSeasonIfDone(); }); return;
    case 'poSkip': simWithReel(`${G.season} playoffs`, () => { while (E.simPlayoffRound()); endSeasonIfDone(); }); return;
    case 'keepGoing': G.reported = true; G.phase = 'seasondone'; UI.tview = null; E.beginOffseason(); G.phase = 'offseason'; G.dead[G.user] = 0; E.refreshOffers(); toast(`On to ${G.season}. Your run's score is saved; this is a bonus season.`); break;
    case 'offseason': UI.tview = null; E.beginOffseason(); G.phase = 'offseason'; G.dead[G.user] = 0; E.refreshOffers(); break;
    case 'final': G.reported = true; G.phase = 'final'; recordRun(true); if ([2026, 2027].some(y => G.history[y] && G.history[y].finish && G.history[y].finish.perfect)) UI.celebrate = true; break;
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
      const yrs = E.yearsFor(p), r = E.faBid(id, E.faPrice(p, yrs), yrs);
      if (r.result === 'signed') { persist(); render(); signPopup(id, r.apy, r.yrs); return; } toast(r.msg);
      break;
    }
    case 'faBid': case 'faTake': {
      const p = G.players[id]; if (!p) return;
      const c = (G.fa.counter || {})[id], yrs = a === 'faTake' && c ? c.yrs : UI.faYrs[id] || E.yearsFor(p), v = a === 'faTake' && c ? c.apy : +el.dataset.v;
      const r = E.faBid(id, v, yrs); persist(); render();
      if (r.result === 'signed') { signPopup(id, r.apy, r.yrs); return; }
      faModal(id, r.msg, faKind(r));
      return;
    }
    case 'faAfford': UI.faAfford = !UI.faAfford; break;
    case 'faOpen': faModal(id); return;
    case 'faPitch': { const r = E.faMeet(id, el.dataset.k); persist(); render(); faModal(id, r.msg, r.boost > 0 ? 'yes' : r.boost < 0 ? 'no' : 'info'); return; }
    case 'faYrs': UI.faYrs[id] = +el.dataset.k; UI.faApy[id] = null; faModal(id); return;
    case 'faQuick': { const p = G.players[id], yrs = UI.faYrs[id] || E.yearsFor(p); UI.faApy[id] = Math.round(E.faPrice(p, yrs) * +el.dataset.k * 10) / 10; faModal(id); return; }
    case 'apyStep': { const i = $('#apy-' + id); if (!i) return; i.value = Math.max(1, Math.round((+i.value + +el.dataset.d) * 10) / 10); i.dispatchEvent(new Event('input', {bubbles: true})); return; }
    case 'faSubmit': {
      const p = G.players[id], yrs = UI.faYrs[id] || (G.fa.offers[id] && G.fa.offers[id].yrs) || E.yearsFor(p);
      const v = +($('#apy-' + id) || {}).value; if (!(v > 0)) { toast('Enter a yearly salary.'); return; }
      UI.faApy[id] = v;
      const r = E.faBid(id, v, yrs); persist(); render();
      if (r.result === 'signed') signPopup(id, r.apy, r.yrs); else faModal(id, r.msg, faKind(r));
      return;
    }
    case 'faCancel': E.faCancel(id); toast('Bid withdrawn.'); if ($('#layer .modal:not(.closing)')) { render(); faModal(id); return; } break;
    case 'faWait': { const p = G.players[id], yrs = UI.faYrs[id] || E.yearsFor(p); const r = E.faOffer(id, +el.dataset.v, yrs); persist(); render();
      if (r.signed) { signPopup(id, +el.dataset.v, yrs); return; } faModal(id, r.msg, r.ok ? 'info' : 'warn'); return; }
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
      if (r.ok) { const q = G.players[id]; signPopup(id, q.cap, Math.max(1, q.end - G.season + 1)); } else negModal(id, r.msg, r.walked ? 'no' : /cap space|no longer|already/.test(r.msg) ? 'warn' : 'counter');
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
    case 'draftNext': if (G.draft.order[G.draft.at] && G.draft.order[G.draft.at].owner !== G.user) E.aiPick(); persist(); break;
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
    case 'startS2': { E.startSeason2(); E.refreshOffers(); UI.tview = null; UI.tab = 'home'; UI.proj = null; persist(); render(); if (G.autoFilled && G.autoFilled.length) fillPopup(G.autoFilled, 'Before kickoff'); return; }
    case 'fillRoster': { const r = E.fillRoster(G.user); persist(); render(); if (r.length) fillPopup(r, 'Roster filled'); else toast('No affordable free agents left. Clear cap space first.'); return; }
    case 'toggle': { const L = UI[el.dataset.side]; const i = L.indexOf(id); i >= 0 ? L.splice(i, 1) : L.push(id); if (document.querySelector('#layer .dealsheet')) { render(); const ds = document.querySelector('[data-act=dealSheet]'); if (ds) ds.click(); return; }
      break; }
    case 'clearTrade': UI.give = []; UI.get = []; closeModal(); break;
    case 'faNeedPos': UI.faPos = el.dataset.k; UI.faFit = 'all'; break;
    case 'needsSheet': modal(`<div class="sheeth"><div><div class="kicker">Free agency</div><h3>Needs & depth chart</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>${teamPanel('faNeedPosM', UI.faPos)}<div class="row end"><button class="btn go" data-act="closeModal">Done</button></div>`, true); return;
    case 'faNeedPosM': UI.faPos = el.dataset.k; UI.faFit = 'all'; closeModal(); break;
    case 'tTheirNeed': UI.tposGive = el.dataset.k; UI.tsGive = 'players'; if (UI.tmob === 'panel' || UI.tmob === 'get') UI.tmob = 'give'; break;
    case 'dNeedPos': UI.dboardPos = el.dataset.k === 'ALL' || UI.dboardPos === el.dataset.k ? 'ALL' : el.dataset.k; UI.dtab = 'board'; break;
    case 'tNeedPos': UI.tposGet = el.dataset.k === 'ALL' ? 'ALL' : el.dataset.k; UI.tpos = el.dataset.k === 'ALL' ? null : el.dataset.k; if (UI.tmob === 'panel') UI.tmob = 'get'; break;
    case 'dealSheet': {
      const P = UI.partner, ev = E.evalTrade(P, UI.give, UI.get), ready = UI.give.length && UI.get.length;
      modal(`<div class="sheeth"><div><div class="kicker">Trade with the ${esc(tname(P))}</div><h3>${ready ? (ev.ok ? 'They would take this' : ev.fleece ? 'Too good for you' : ev.ratio >= .85 ? 'Close' : 'Not close yet') : 'Build the deal'}</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div>
        <div class="offerb dealsheet"><div><div class="lbl">You send</div>${dockSide(UI.give, 'give')}</div><div><div class="lbl">You get</div>${dockSide(UI.get, 'get')}</div></div>
        ${ready ? `<div class="meter ${ev.ok ? 'yes' : ev.ratio >= .85 ? 'close' : ''}"><i style="width:${Math.min(100, ev.ratio * 80)}%"></i></div>${fairTag(ev.fair)} <span class="small muted">For your team: <b>${winsTxt(E.winsDelta(G.user, UI.get, UI.give))}</b> a season</span>` : ''}
        ${ev.issues.filter(i => !i.startsWith('Both')).map(i => `<div class="small bad">${esc(i)}</div>`).join('')}
        <div class="row end"><button class="btn" data-act="balance" ${UI.get.length ? '' : 'disabled'}>Ask what they want</button><button class="btn go" data-act="callTeam" ${ready ? '' : 'disabled'}>Make the call</button></div>`, true);
      return;
    }
    case 'draftCalls': { const L = E.draftOffers().filter(o => !(UI.declined || []).includes(o.id)); modal(`<div class="sheeth"><div><div class="kicker">Draft day</div><h3>Teams want your pick</h3></div><button class="x" data-act="closeModal" aria-label="Close">×</button></div><div class="offers">${L.map(o => offerCard(o, true)).join('') || '<p class="muted">No calls right now.</p>'}</div>`, true); return; }
    case 'tabHome': go('home'); return;
    case 'openInbox': UI.tview = 'inbox'; go('trade'); return;
    case 'openMake': UI.tview = 'make'; go('trade'); return;
    case 'counterAccept': { const x = UI.counter.list[+el.dataset.i]; if (x.cond) E.applyCond(x.cond); if (x.prot) E.applyProt(x.prot); const r = E.doTrade(UI.counter.partner, x.give, x.get, x.cond || x.prot ? 'offer' : undefined); closeModal(); if (r.ok) { UI.give = []; UI.get = []; persist(); render(); tradePopup(UI.counter.partner, x.give, x.get); return; } popup('Trade', 'It fell apart', vban('no', 'No deal', r.issues[0] || 'Something changed.')); return; }
    case 'counterEdit': { const x = UI.counter.list[+el.dataset.i]; UI.give = x.give.slice(); UI.get = x.get.slice(); closeModal(); break; }
    case 'pickPartner': UI.partner = el.dataset.t; UI.give = [id]; UI.get = []; UI.tq = ''; { const pkg = E.cached(() => E.buildPackage(UI.partner, id) || E.buildPackage(UI.partner, id, true))(); if (pkg) { UI.get = pkg; toast(`The ${tname(UI.partner)} would give this for ${G.players[id].n}.`); } } break;
    case 'askOffer': { const pid = UI.give[0]; const pkg = E.cached(() => E.buildPackage(UI.partner, pid) || E.buildPackage(UI.partner, pid, true))(); if (pkg) { UI.get = pkg; toast(`Their offer for ${G.players[pid].n}. Review it, then propose.`); } else toast(`The ${tname(UI.partner)} do not have a fit for ${G.players[pid].n}.`); break; }
    case 'balance': { closeModal(); if (!UI.partner || !G.teams[UI.partner]) return;
      const g = E.balanceTrade(UI.partner, UI.give, UI.get);
      if (g) { UI.give = g; toast('They added what they want from you. Review it before proposing.'); } else toast('They do not see a deal here. Try asking for less.');
      break;
    }
    case 'propose':
    case 'callTeam': { closeModal(); if (!UI.partner || !G.teams[UI.partner]) return;
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
    case 'accept': { const o = (G.offers || []).find(x => x.id === id); const r = E.acceptOffer(id); closeModal(); if (r.ok && o) { UI.counterOf = null; persist(); render(); tradePopup(o.from, o.give, o.get, r.cuts && r.cuts.length ? `Offer accepted · released ${r.cuts.map(c => lastName(G.players[c].n)).join(', ')}` : 'Offer accepted'); return; } toast(r.msg); break; }
    case 'decline': { const o = (G.offers || []).find(x => x.id === id); G.offers = (G.offers || []).filter(x => x.id !== id); if (o) toast(`Declined the ${G.teams[o.from].nick} offer.`); break; }
    case 'draftUp': draftUpSheet(id); return;
    case 'draftDown': draftDownSheet(id); return;
    case 'draftDo': { const x = UI.dealX; if (!x) return; const r = E.draftDeal(x.partner, x.give, x.get); closeModal(); if (r.ok) { persist(); render(); tradePopup(x.partner, x.give, x.get, 'Moved up'); return; } popup('Draft day', 'That deal fell apart', `<p class="lead">${esc(r.issues[0] || 'They changed their mind.')}</p>`); return; }
    case 'draftHaggle': { const x = UI.dealX; if (!x) return; closeModal(); UI.partner = x.partner; UI.give = x.give.slice(); UI.get = x.get.slice(); UI.tview = 'make'; persist(); go('trade'); return; }
    case 'draftTake': { const x = (UI.dteamOffers || [])[+el.dataset.i]; if (!x) return; const r = E.draftDeal(x.from, x.give, x.get); closeModal(); if (r.ok) { persist(); render(); tradePopup(x.from, x.give, x.get, 'Traded down'); return; } popup('Draft day', 'That deal fell apart', `<p class="lead">${esc(r.issues[0] || 'They changed their mind.')}</p>`); return; }
    case 'acceptDraft': { const L = E.draftOffers(), o = L.find(x => x.id === id); if (!o) return; const r = E.acceptOffer(id, L); closeModal(); if (r.ok) { persist(); render(); tradePopup(o.from, o.give, o.get, 'Traded down'); return; } toast(r.msg); break; }
    case 'declineDraft': UI.declined = (UI.declined || []).concat(id); closeModal(); break;
    case 'offerDrop': {
      const o = el.dataset.draft ? E.draftOffers().find(x => x.id === id) : (G.offers || []).find(x => x.id === id);
      if (!o) return;
      const a = el.dataset.a;
      UI.partner = o.from; UI.give = o.give.filter(x => x !== a); UI.get = o.get.filter(x => x !== a); UI.tview = 'make'; closeModal(); go('trade');
      toast(`Took out ${E.assetName(a)}. Propose it or keep adjusting.`); return;
    }
    case 'counter': {
      const o = el.dataset.draft ? E.draftOffers().find(x => x.id === id) : (G.offers || []).find(x => x.id === id);
      if (!o) return;
      UI.partner = o.from; UI.give = o.give.slice(); UI.get = o.get.slice(); UI.tview = 'make'; closeModal();
      if (!el.dataset.draft) { UI.counterOf = o.id; persist(); go('trade'); toast('Change the deal, then make the call. Their original offer stays on the table.'); return; }
      go('trade'); toast('Adjust the deal, then propose it.'); return;
    }
    case 'moreOffers': { const before = (G.offers || []).map(o => o.id); const fresh = E.genOffers(3).filter(o => !before.includes(o.id)); G.offers = (G.offers || []).concat(fresh).slice(-4); toast(fresh.length ? `${fresh.length} new offer${fresh.length > 1 ? 's' : ''}.` : 'Nobody new is calling right now.'); break; }
    case 'findTrades': {
      const p = G.players[id]; if (!p) return;
      const list = p.tm === G.user ? E.shopPlayer(id, UI.shopWant || 'any') : E.findPackages(id).map(x => Object.assign(x, {label: x.label + ' · ' + G.teams[x.partner].nick}));
      openFound(id, list); return;
    }
    case 'tradeFor': {
      const p = G.players[id]; if (!p || !G.teams[p.tm]) return;
      UI.partner = p.tm; UI.get = [id]; UI.give = []; UI.tposGet = 'ALL';
      const g = E.balanceTrade(UI.partner, [], UI.get);
      if (!tradeOpen()) { closeModal(); popup('Trades are closed', 'Not right now', `<p class="lead">${esc(G.phase === 'playoffs' ? 'No trades during the playoffs. They reopen in the offseason.' : `The trade deadline after Week ${E.DEADLINE_WEEK} has passed. Trades reopen in the offseason.`)}</p>`); return; }
      if (g) { UI.give = g; toast('Here is what they would want. Take things out with ×, then make the call.'); UI.tview = 'make'; closeModal(); persist(); go('trade'); return; }
      UI.tview = 'make'; closeModal(); persist(); go('trade');
      popup(`No deal for ${esc(p.n)}`, 'Why it will not work', `<p class="lead">${esc(E.whyNoDeal(id))}</p><p class="small muted">You can still build a deal by hand below and make the call.</p>`);
      return;
    }
    case 'findFor': { const list = E.findPackages(id).map(x => Object.assign(x, {label: x.label + ' · ' + G.teams[x.partner].nick})); openFound(id, list); return; }
    case 'loadFound': { const x = UI.found.list[+el.dataset.i]; UI.partner = x.partner; UI.give = x.give.slice(); UI.get = x.get.slice(); UI.tview = 'make'; closeModal(); UI.found = null; go('trade'); return; }
    case 'proposeFound': { const x = UI.found.list[+el.dataset.i]; const r = E.doTrade(x.partner, x.give, x.get); closeModal(); UI.found = null; if (r.ok) { persist(); render(); tradePopup(x.partner, x.give, x.get); return; } popup('Trade', 'They said no', vban('no', 'No deal', r.issues[0] || 'They want more for it.')); return; }
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
    case 'shareSize': openShare(UI.shareKind, el.dataset.k); return;
    case 'saveCard': saveCard(); return;
    case 'onbNext': UI.onbStep = (UI.onbStep || 0) + 1; render(); window.scrollTo(0, 0); return;
    case 'onbBack': UI.onbStep = Math.max(0, (UI.onbStep || 0) - 1); render(); return;
    case 'onbDone': ONB_SEEN = true; try { localStorage.setItem('21-0-onboard', '1'); } catch (err) { /* storage unavailable */ } UI.onbStep = null; render(); window.scrollTo(0, 0); return;
    case 'onbAgain': ONB_SEEN = false; UI.onbStep = 0; render(); window.scrollTo(0, 0); return;
    case 'askReset': modal(`<div class="sheeth"><h3>Start over?</h3><button class="x" data-act="closeModal" aria-label="Close">×</button></div><p class="muted">This erases your current game. Your résumé keeps every finished season.</p><div class="row end"><button class="btn" data-act="closeModal">Cancel</button><button class="btn danger" data-act="newgame">Start over</button></div>`); return;
    case 'newgame': try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY + '-ver'); } catch (err) { /* storage unavailable */ } cloudClear(); G = null; closeModal(); UI.tab = 'home'; render(); window.scrollTo(0, 0); return;
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
  if (e.target.id === 'tsq') { UI.tsq = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#tsq'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (err) { /* search inputs may not support it */ } } return; }
  if (e.target.id === 'faQ') { UI.faQ = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#faQ'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (err) { /* search inputs may not support it */ } } return; } if (e.target.id && e.target.id.startsWith('apy-')) { const pid = e.target.id.slice(4); UI.faApy[pid] = +e.target.value; const p = G && G.players[pid], b = document.querySelector(`[data-act=faSubmit][data-id="${pid}"]`); if (p && b && G.fa) { const yrs = UI.faYrs[pid] || E.yearsFor(p); b.textContent = +e.target.value + .001 >= E.faPrice(p, yrs) ? 'Sign him now' : G.fa.offers[pid] ? 'Update offer' : 'Make offer'; } } if (e.target.id === 'tq' && !e.target.value && UI.tq) { UI.tq = ''; render(); } });

loadLocalCareer();
Promise.all([fetch('data.json').then(r => r.json()), fetch('heads.json').then(r => r.json()).catch(() => null)])
  .then(([d, h]) => {
    DATA = d; HEADS = h;
    if (hasSave()) { const b = document.createElement('button'); b.dataset.act = 'resume'; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); }
    else render();
    connectCareer();
  })
  .catch(() => { $('#app').innerHTML = '<p>Could not load the rosters. Reload the page to try again.</p>'; });
})();
