// 21-0 game engine: pure logic, no DOM. Works in browser and Node.
(function (root) {
'use strict';

const POS_ORDER = ['QB','RB','WR','TE','OT','IOL','EDGE','DT','LB','CB','S','K','P'];
const STARTERS = {QB:1,RB:1,WR:3,TE:1,OT:2,IOL:3,EDGE:2,DT:2,LB:2,CB:3,S:2,K:1,P:1};
const MIN_DEPTH = {QB:2,RB:2,WR:4,TE:2,OT:3,IOL:4,EDGE:3,DT:3,LB:3,CB:4,S:3,K:1,P:1};
// How much each position group moves the team. Set so that, across the league, the quarterback explains about 30% of the
// difference between teams, pass rush and coverage about 17% each, receivers 15%, the line 10%, and backs and linebackers little.
// QBs spread widest in talent, so one QB still outweighs any other single player by a lot. Offense counts a bit more than defense.
const OFF_W = {QB:.23,RB:.05,WR:.31,TE:.08,OT:.16,IOL:.17};
const DEF_W = {EDGE:.22,DT:.16,LB:.12,CB:.34,S:.16};
// Game model, calibrated to the real 17-game NFL: team wins spread with a standard deviation near 3.1, the best record
// usually 13 to 15 wins, and the final margin landing about 13.5 points either side of the expected one.
// talent: points per rating point of edge. cap: the most a matchup can tilt (any given Sunday). rep: an empty starting spot plays like a street free agent.
const SIM = {talent: 2.6, cap: 14, hfa: 1.6, teamNoise: 7.2, sharedNoise: 4, rep: 50};
const POS_MULT = {QB:2.4,EDGE:1.25,OT:1.15,CB:1.1,WR:1.1,DT:1.0,IOL:.85,LB:.8,S:.85,TE:.85,RB:.7,K:.3,P:.25};
const MARKET_TOP = {QB:60,EDGE:40,WR:38,OT:30,DT:32,CB:28,LB:20,S:20,TE:18,IOL:22,RB:14,K:6,P:4};
const ROSTER_MAX = 53;

// ---------- rng ----------
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  const f = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  f.state = () => s; f.set = v => { s = v >>> 0 || 1; };
  return f;
}
let R = makeRng(Date.now());
const rand = () => R();
const randn = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const rint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const poisson = l => { let L = Math.exp(-Math.max(0, l)), k = 0, p = 1; do { k++; p *= rand(); } while (p > L); return k - 1; };

// ---------- state ----------
let G = null;

function newGame(DATA, userTeam, seed) {
  R = makeRng(seed || Date.now());
  const players = {};
  for (const a of DATA.players) {
    const [id, n, pos, tm, age, ovr, cap, end, st25, st26, inj, rook, prior, pot, potWhy, prod, hype, apy, why, r1] = a;
    players[id] = {id, n, pos, tm, age, ovr, cap, end, st25, st26, inj: !!inj, rook: !!rook, prior: prior || ovr, pot: pot || null, potWhy: potWhy || '', prod: prod == null ? -1 : prod, hype: hype == null ? 30 : hype, hist: [[2026, ovr, 'Week 1']]};
    if (why) { players[id].why = why; if (why.t) players[id].at = why.t; }
    if (r1) players[id].r1 = r1;
    // contracts that pay more after this season (extensions, back-loaded deals) switch to their real average next year
    if (apy != null && end >= 2027) players[id].apy = apy;
    // hurt at kickoff: most come back during the season, about one in five is out for the year
    if (inj) { const h = hashStr(id) % 100; players[id].injW = h < 30 ? 1 + h % 4 : h < 80 ? 5 + h % 6 : 99; players[id].injPre = true; }
  }
  const picks = [];
  for (const yr of [2027, 2028]) for (let rd = 1; rd <= ROUNDS; rd++) for (const t of Object.keys(DATA.teams)) picks.push({id: `${yr}-${rd}-${t}`, yr, rd, orig: t, owner: t});
  G = {
    v: 1, rng: 0, user: userTeam, season: 2026, phase: 'preseason', week: 0,
    cap: {2026: DATA.cap26, 2027: DATA.cap27},
    teams: DATA.teams, games: DATA.games, prospects: DATA.prospects,
    players, picks, dead: {}, results: {2026: [], 2027: []}, stats: {2026: {}, 2027: {}},
    playoffs: {}, trades: [], news: [], history: {}, fa: null, draft: null, resign: null, prog: null,
  };
  G.startOvr = teamRating(userTeam).ovr;
  G.offers = []; G.expect = {}; G.conf = 55; G.confLog = []; G.chem = 60; G.chemLog = []; G.goals = {};
  // hidden potential: young players can grow past their current rating
  // potential comes from real data (age, draft pedigree, 2025 to 2026 trend); older saves fall back to an age estimate
  for (const p of Object.values(G.players)) if (!p.pot) p.pot = p.age <= 25 ? clamp(Math.round(p.ovr + (26 - p.age) * 1.5), p.ovr, 99) : p.ovr;
  startForm();
  G.start = snapshot(roster(userTeam), DATA.cap26);
  G.signings = [];
  for (const t of teamList()) G.dead[t] = 0;
  // the other 31 teams trim their camp rosters to 53 before Week 1; the players they cut are the street free agents
  // you can sign during the season. Starters are never cut, so the season plays the same.
  for (const t of teamList()) {
    if (t === userTeam) continue;
    const d = depth(t), st = new Set(POS_ORDER.flatMap(pos => d[pos].slice(0, STARTERS[pos]).map(p => p.id)));
    const cut = roster(t).filter(p => !st.has(p.id)).sort((a, b) => (a.ovr + (a.age <= 24 ? 3 : 0)) - (b.ovr + (b.age <= 24 ? 3 : 0)));
    const counts = {}; for (const p of roster(t)) counts[p.pos] = (counts[p.pos] || 0) + 1;
    for (const p of cut) {
      if (roster(t).length <= ROSTER_MAX) break;
      if (counts[p.pos] <= (MIN_DEPTH[p.pos] || 1)) continue;
      counts[p.pos]--; p.fromTeam = t; p.tm = 'FA'; p.cap = 0; p.end = 2025; p.ask = askFor(p);
    }
  }
  return G;
}

// Each season every player gets a hidden form: a breakout year, a normal year, or a slump.
// It drives his sim stats and, after the season, his progression.
function startForm() {
  G.form = {};
  for (const p of Object.values(G.players)) { const sd = p.age <= 24 ? 4 : p.age <= 28 ? 3 : 2.5; G.form[p.id] = Math.round(randn() * sd * 10) / 10; }
}
const formOf = p => (G.form && G.form[p.id]) || 0;
function formLabel(p) {
  if (G.phase === 'preseason' || G.phase === 'offseason' || G.phase === 'final' || (G.phase === 'season' && (G.week || 0) < 3)) return null;
  const f = formOf(p);
  return f >= 3.5 ? 'Breakout year' : f >= 1.5 ? 'Trending up' : f <= -3.5 ? 'Slumping' : f <= -1.5 ? 'Trending down' : null;
}
// Owner confidence, 0 to 100: results against what the front office expected
function updateConfidence(event) {
  const s = G.season, e = setExpectations(s);
  const r = record(G.user, s);
  let d = 0, why = '';
  if (event === 'deadline') {
    const exp = e.wins * (G.week / 17);
    d = Math.round((r.w - exp) * 4); why = `${r.w}-${r.l} at the deadline vs ${exp.toFixed(1)} expected wins`;
  } else {
    const gm = goalMet(s), P = G.playoffs[s];
    const poW = (G.results[s] || []).filter(g => g.po && ((g.h === G.user && g.hs > g.as) || (g.a === G.user && g.as > g.hs))).length;
    const hit = goalStatus(s).filter(x => x.done).length;
    d = Math.round((r.w - e.wins) * 3 + (gm && gm.met ? 15 : -12) + poW * 4 + (P && P.champ === G.user ? 15 : 0) + hit * 4);
    why = `${s} season: ${gm && gm.met ? 'met' : 'missed'} the goal (${e.goal})${hit ? `, ${hit} of 3 season goals` : ''}`;
    (G.goalsHit = G.goalsHit || {})[s] = hit;
  }
  G.conf = clamp((G.conf == null ? 55 : G.conf) + d, 0, 100);
  (G.confLog = G.confLog || []).push({s, event, d, why, now: G.conf});
  if (event === 'season') ownerVerdict(s);
  else if (G.conf < 25) G.news.unshift('The owner is losing patience. You are on the hot seat.');
  return d;
}
// What the owner decides when a season ends: a mandate from the hot seat, firing if you miss it, an extension if he loves you
function ownerVerdict(s) {
  const f = userFinish(s), madePO = f.label !== 'Missed playoffs';
  G.verdicts = G.verdicts || {};
  if (G.mandate && G.mandate.season === s) {
    if (madePO) { G.verdicts[s] = 'saved'; G.mandate = null; G.conf = Math.max(G.conf, 45); G.news.unshift('You met the owner\'s mandate. Your job is safe.'); }
    else { G.verdicts[s] = 'fired'; G.fired = s; G.news.unshift(`Fired. The ${G.teams[G.user].nick} missed the playoffs again.`); }
    return;
  }
  if (G.conf < 25) { G.verdicts[s] = 'hotseat'; G.mandate = {season: s + 1, goal: 'Make the playoffs'}; G.news.unshift(`Hot seat: make the playoffs in ${s + 1} or you are fired.`); }
  else if (G.conf >= 80) { G.verdicts[s] = 'extended'; (G.extended = G.extended || []).push(s); G.news.unshift('The owner gave you a contract extension.'); }
}
const confLabel = c => c >= 75 ? 'Untouchable' : c >= 55 ? 'Secure' : c >= 35 ? 'Warm seat' : 'Hot seat';
// Week 1 picture of a roster, kept so the final screen can show what you inherited
function snapshot(list, cap) {
  const act = list.filter(p => !p.inj);
  const r = ratingOf(act);
  const starters = {};
  for (const pos of POS_ORDER) starters[pos] = r.d[pos].slice(0, STARTERS[pos]).map(p => ({id: p.id, n: p.n, ovr: p.ovr, age: p.age}));
  const pay = list.reduce((s, p) => s + p.cap, 0);
  return {ovr: r.ovr, off: r.off, def: r.def, age: starterAge(r.d), payroll: pay, space: cap - pay, ids: list.map(p => p.id), starters};
}
function starterAge(d) {
  let s = 0, n = 0;
  for (const pos of POS_ORDER) { if (pos === 'K' || pos === 'P') continue; for (const p of d[pos].slice(0, STARTERS[pos])) { s += p.age; n++; } }
  return n ? Math.round(s / n * 10) / 10 : 0;
}
// For saves made before snapshots existed: rebuild the Week 1 picture from the raw data
function snapshotFromData(DATA, t) {
  const list = DATA.players.filter(a => a[3] === t).map(a => ({id: a[0], n: a[1], pos: a[2], tm: a[3], age: a[4], ovr: a[5], cap: a[6], inj: !!a[10]}));
  return snapshot(list, DATA.cap26);
}

const teamList = () => Object.keys(G.teams).sort();
// Read-only work (rendering, trade searches) runs inside cached(): rosters, depth charts and ratings are computed once.
let CACHE = null;
function cached(fn) { return function () { if (CACHE) return fn.apply(this, arguments); CACHE = {r: null, d: {}, tr: {}, rb: {}}; try { return fn.apply(this, arguments); } finally { CACHE = null; } }; }
function rosterRaw(t) { return Object.values(G.players).filter(p => p.tm === t); }
function roster(t) {
  if (!CACHE) return rosterRaw(t);
  if (!CACHE.r) { CACHE.r = {}; for (const p of Object.values(G.players)) (CACHE.r[p.tm] = CACHE.r[p.tm] || []).push(p); }
  return (CACHE.r[t] || []).slice();
}
// Contracts that ended before this season do not count, so expiring players you are still deciding on cost nothing until you re-sign them
const payroll = t => roster(t).reduce((s, p) => s + (p.end >= G.season ? p.cap : 0), 0) + (G.dead[t] || 0);
const capSpace = t => G.cap[G.season] - payroll(t);
const activeRoster = t => roster(t).filter(p => !p.inj);

function depthOf(list) {
  const d = {};
  for (const pos of POS_ORDER) d[pos] = [];
  for (const p of list) if (d[p.pos]) d[p.pos].push(p);
  for (const pos of POS_ORDER) d[pos].sort((a, b) => b.ovr - a.ovr);
  return d;
}
function depth(t) {
  if (CACHE && CACHE.d[t]) return CACHE.d[t];
  const d = depthOf(activeRoster(t));
  if (t === G.user && G.flex) for (const id of Object.keys(G.flex)) {
    const p = G.players[id], pos = G.flex[id];
    if (!p || p.tm !== t || !canFlex(p, pos)) { delete G.flex[id]; continue; }
    const i = d[p.pos].indexOf(p); if (i < 0) continue;
    d[p.pos].splice(i, 1); d[pos].push(p); d[pos].sort((a, b) => (b.ovr - flexPen(b, pos)) - (a.ovr - flexPen(a, pos)));
  }
  if (CACHE) CACHE.d[t] = d;
  const o = t === G.user && G.depthOrder;
  if (o) for (const pos of POS_ORDER) {
    const L = o[pos];
    if (!L || !L.length) continue;
    const r = p => { const i = L.indexOf(p.id); return i < 0 ? 1000 - p.ovr : i; };
    d[pos].sort((a, b) => r(a) - r(b));
  }
  return d;
}
// Your own depth chart order: move a player up or down at his position
// Position flexibility: some players can cover a neighbouring spot, a few points worse than at their own
const FLEX = {OT: {IOL: 2}, IOL: {OT: 4}, CB: {S: 3}, S: {CB: 4, LB: 5}, EDGE: {LB: 4, DT: 5}, DT: {EDGE: 5}, LB: {EDGE: 5, S: 6}, WR: {TE: 7, RB: 8}, TE: {WR: 5}, RB: {WR: 6}};
const flexPen = (p, pos) => p.pos === pos ? 0 : ((FLEX[p.pos] || {})[pos] || 0);
const canFlex = (p, pos) => p.pos === pos || !!(FLEX[p.pos] && FLEX[p.pos][pos] != null);
function setFlex(id, pos) {
  G.flex = G.flex || {}; const p = G.players[id];
  if (!p) return;
  if (!pos || pos === p.pos) delete G.flex[id]; else if (canFlex(p, pos)) G.flex[id] = pos;
  if (G.depthOrder) for (const k in G.depthOrder) G.depthOrder[k] = G.depthOrder[k].filter(x => x !== id);
}
function setDepth(pos, ids) { G.depthOrder = G.depthOrder || {}; G.depthOrder[pos] = ids.slice(); }

function teamRating(t) { if (CACHE && CACHE.tr[t]) return CACHE.tr[t]; const r = ratingOf(null, depth(t)); if (CACHE) CACHE.tr[t] = r; return r; }
function ratingOf(list, dd) {
  const d = dd || depthOf(list);
  const avg = (pos) => {
    const n = STARTERS[pos], L = d[pos];
    let s = 0; for (let i = 0; i < n; i++) s += L[i] ? L[i].ovr - flexPen(L[i], pos) : SIM.rep;
    return s / n;
  };
  let off = 0, def = 0;
  for (const k in OFF_W) off += OFF_W[k] * avg(k);
  for (const k in DEF_W) def += DEF_W[k] * avg(k);
  const k = avg('K');
  const raw = off * .57 + def * .41 + k * .02;
  // whole numbers for display; the sim reads the unrounded values so every upgrade counts
  return {off: Math.round(off), def: Math.round(def), k, ovr: Math.round(raw), d, x: {off, def, ovr: raw}};
}

// ---------- contracts / value ----------
// QBs age slower, running backs faster
function ageAdj(p) { return p.pos === 'QB' ? p.age - 4 : p.pos === 'RB' ? p.age + 2 : p.age; }
function market(p) {
  const top = MARKET_TOP[p.pos] || 10;
  let v = top * Math.pow(clamp((p.ovr - 52) / 40, 0, 1.1), 2.3);
  const a = ageAdj(p);
  if (a >= 33) v *= .55; else if (a >= 31) v *= .75; else if (a >= 29) v *= .9;
  return Math.max(1.1, Math.round(v * 10) / 10);
}

// Trade value uses one points scale for players and picks:
// a young 99 OVR non-QB is about 100 points, the #1 pick about 70, a late 1st about 26.
// Order from real returns for traded starters: QB and EDGE first, then WR, CB, OT, then DT, then IOL, S, TE, then LB and RB
const TV_POS = {QB: 2.3, EDGE: 1.15, WR: 1.08, CB: 1.0, OT: 1.0, DT: .9, IOL: .72, S: .72, TE: .7, LB: .65, RB: .6, K: .15, P: .1};
// Value roughly doubles every 5 OVR, and climbs faster still for stars: 70 is a 6th-round pick, 75 a 4th, 80 a 3rd,
// 85 a 2nd, 90 a first and a second, and the best player at a position about two firsts, like Ramsey, Parsons or Hill.
const ordinal = n => { const r = n % 100, t = n % 10; return n + (r >= 11 && r <= 13 ? 'th' : t === 1 ? 'st' : t === 2 ? 'nd' : t === 3 ? 'rd' : 'th'); };
// Calibrated on the last 1,000 NFL trades: the best non-QBs ever moved (Tyreek Hill, Davante Adams, Jalen Ramsey,
// DeForest Buckner) cost about a #12-16 pick; a typical traded starter costs a day 3 pick.
const ratingPts = ovr => ovr < 58 ? .2 : 1.2 * Math.exp(.13 * (ovr - 66)) * (1 + Math.max(0, ovr - 82) * .06);
const ageMult = a => a <= 23 ? 1.12 : a <= 25 ? 1.08 : a <= 27 ? 1 : a <= 28 ? .94 : a <= 29 ? .86 : a <= 30 ? .76 : a <= 31 ? .66 : a <= 32 ? .55 : a <= 33 ? .44 : .3;
function playerValue(p, forTeam) { return valueParts(p, forTeam).total; }
// Each front office is different. Built from a fixed hash so a team's taste never changes mid-game.
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const GM_STYLES = [
  ['Trenches first', {OT: 1.15, IOL: 1.15, EDGE: 1.1, DT: 1.1, WR: .9, RB: .85}],
  ['Air raid', {QB: 1.08, WR: 1.15, TE: 1.08, OT: 1.05, LB: .9, S: .9}],
  ['No-fly zone', {CB: 1.15, S: 1.12, EDGE: 1.05, RB: .85, TE: .9}],
  ['Ground and pound', {RB: 1.2, IOL: 1.1, TE: 1.1, WR: .9}],
  ['Pass rush or bust', {EDGE: 1.2, DT: 1.08, OT: .95, RB: .85}],
  ['Best player available', {}],
];
function gmOf(t) {
  const h = hashStr('gm:' + t);
  const style = GM_STYLES[h % GM_STYLES.length];
  return {style: style[0], pos: style[1], youth: ((h >>> 8) % 100) / 100, risk: ((h >>> 16) % 100) / 100};
}
// ---------- team situation ----------
// Every team is a Contender, Bubble team, Seller or Rebuilding, from playoff odds in season and roster rank otherwise.
function situations() {
  const key = `${G.season}-${G.phase}-${G.week}-${G.step || ''}`;
  if (G._sit && G._sit.key === key) return G._sit.map;
  const map = {};
  const ts = teamList();
  const inSeason = G.phase === 'deadline' || (G.phase === 'season' && G.week > 0);
  const pr = inSeason ? project(G.season, 200) : null;
  const ranked = ts.map(t => ({t, o: teamRating(t).ovr})).sort((a, b) => b.o - a.o);
  for (const t of ts) {
    const rank = ranked.findIndex(x => x.t === t) + 1;
    const po = pr ? pr[t].po : clamp(1 - (rank - 1) / 24, .02, .95);
    const status = po >= .65 ? 'Contender' : po >= .3 ? 'Bubble' : inSeason ? 'Seller' : 'Rebuilding';
    const nextCap = G.cap[G.season + 1] || G.cap[G.season] * 1.07;
    const committed = rosterRaw(t).filter(p => p.end > G.season).reduce((s, p) => s + p.cap, 0);
    map[t] = {status, po, rank, tightNext: committed / nextCap > .88};
  }
  // league-wide supply of good starters at each position
  const good = {};
  for (const p of Object.values(G.players)) if (G.teams[p.tm] && p.ovr >= 85) good[p.pos] = (good[p.pos] || 0) + 1;
  map._scarce = {};
  for (const pos of POS_ORDER) map._scarce[pos] = clamp((32 * STARTERS[pos] * .45) / Math.max(4, good[pos] || 4), .92, 1.12);
  G._sit = {key, map};
  return map;
}
const situation = t => situations()[t];
// How much this team's scouts like this player, from about 0.88 to 1.12
const scoutView = (t, p) => .88 + (hashStr(t + ':' + p.id) % 1000) / 1000 * .24;
// Position-specific aging: [young until, prime until, yearly decline after prime]
const AGE_CURVE = {QB: [24, 33, .07], RB: [22, 26, .16], WR: [23, 29, .1], TE: [24, 30, .09], OT: [24, 31, .07], IOL: [24, 31, .07],
  EDGE: [23, 29, .1], DT: [23, 30, .09], LB: [23, 29, .1], CB: [22, 28, .12], S: [23, 29, .1], K: [24, 36, .04], P: [24, 36, .04]};
function ageFactor(p) {
  const [young, prime, rate] = AGE_CURVE[p.pos] || [23, 29, .1], a = p.age;
  if (a <= young) return {m: 1.1, note: `${Math.floor(a)}: still years from his ${p.pos} prime`};
  if (a <= prime) return {m: 1, note: `${Math.floor(a)}: in his prime (${p.pos}s peak until about ${prime})`};
  const m = Math.max(.25, Math.exp(-rate * 2.2 * (a - prime)));
  return {m: Math.round(m * 100) / 100, note: `${Math.floor(a)}: past the ${p.pos} prime of ${prime}. ${p.pos}s fall off ${rate >= .14 ? 'fast' : rate >= .1 ? 'quickly' : 'slowly'}`};
}
// Contract: what he costs against what his play would earn, for every year a team controls him
function contractFactor(p) {
  const mk = market(p), live = G.phase === 'deadline' || G.phase === 'season';
  const left = Math.max(0, p.end - G.season) + (live ? .5 : 1);   // years of control, this season counted if still ahead
  let surplus = 0, yrs = Math.min(4, Math.ceil(left));
  for (let t = 0; t < yrs; t++) {
    const mkt = market({...p, age: p.age + t, ovr: Math.min(99, p.ovr + (p.age + t <= 25 && p.pot > p.ovr ? Math.min(p.pot - p.ovr, 2 * (t + 1)) : 0))});
    surplus += Math.pow(.85, t) * (mkt - p.cap) * (t === 0 && live ? .5 : 1);
  }
  let m = clamp(1 + surplus / Math.max(8, mk * 2.2) * .5, .65, 1.3);
  const notes = [`$${p.cap.toFixed(1)}M cap hit vs about $${mk.toFixed(1)}M of play`];
  let status = '';
  if (p.end <= G.season && live) { status = 'Expiring: a rental for the rest of this season'; m *= .8; }
  else if (p.end <= G.season + 1 && mk > p.cap * 1.6 && p.ovr >= 85) { status = 'Due a big raise after next season'; m *= .94; }
  else if (Math.ceil(left) >= 3 && p.cap < mk * .7) status = `${Math.ceil(left)} cheap years of control`;
  else if (p.cap > mk * 1.3) status = 'Overpaid for what he gives you';
  else status = `${Math.ceil(left)} year${Math.ceil(left) === 1 ? '' : 's'} left at a fair price`;
  return {m: Math.round(m * 100) / 100, note: notes[0], status, mk, yrs: Math.ceil(left)};
}
function valueParts(p, forTeam) {
  const steps = [];
  // --- the player ---
  const eff = p.age <= 25 && p.pot > p.ovr ? p.ovr + (p.pot - p.ovr) * .4 : p.ovr;
  let v = ratingPts(eff);
  steps.push({g: 'Player', k: 'Talent', note: eff > p.ovr + .5 ? `${p.ovr} OVR with room to grow: valued like a ${eff.toFixed(0)}` : `${p.ovr} OVR. Value doubles about every 6 points`, v});
  const pm = p.pos === 'QB' ? Math.round((1 + 1.4 * clamp((p.ovr - 70) / 16, 0, 1)) * 100) / 100 : (TV_POS[p.pos] || 1);
  v *= pm; steps.push({g: 'Player', k: 'Positional value', note: p.pos === 'QB' ? `Starting-caliber QBs carry a premium that grows with how good he is` : pm >= 1.05 ? `${p.pos} is a premium position` : pm >= .95 ? `${p.pos} is valued at par` : `${p.pos}s are cheaper to replace`, m: pm, v});
  const af = ageFactor(p), a = ageAdj(p);
  v *= af.m; steps.push({g: 'Player', k: 'Age', note: af.note, m: af.m, v});
  if (p.prod != null && p.prod >= 0) {
    const pf = Math.round((.9 + .2 * p.prod / 100) * 100) / 100;
    v *= pf; steps.push({g: 'Player', k: 'Production', note: `His real stats rank in the ${ordinal(p.prod)} percentile among ${p.pos}s`, m: pf, v});
  }
  const live = (G.phase === 'deadline' || G.phase === 'season') && G.week >= 3;
  if (live && Math.abs(formOf(p)) >= 1.5) { const ff = Math.round(clamp(1 + formOf(p) / 30, .88, 1.12) * 100) / 100; v *= ff; steps.push({g: 'Player', k: 'This season', note: `${formLabel(p) || (formOf(p) > 0 ? 'Playing well' : 'Struggling')} so far`, m: ff, v}); }
  if (p.hype != null) {
    const hf = Math.round((.92 + .16 * p.hype / 100) * 100) / 100;
    v *= hf; steps.push({g: 'Player', k: 'Hype', note: p.hype >= 70 ? 'A household name. Teams pay for the brand' : p.hype >= 40 ? 'Known around the league' : 'Flies under the radar', m: hf, v});
  }
  // --- the contract ---
  const cf = contractFactor(p), mk = cf.mk, yrs = Math.max(1, cf.yrs);
  const rental = G.phase === 'deadline' && p.end <= G.season;
  v *= cf.m; steps.push({g: 'Contract', k: 'Status and cost', note: `${cf.status}. ${cf.note}`, m: cf.m, v});
  if (p.inj) { const im = p.injW === 99 || p.injW === undefined ? .7 : .9; v *= im; steps.push({g: 'Contract', k: 'Injury', note: p.injW === 99 || p.injW === undefined ? 'Out for the season' : `Out about ${p.injW} more weeks`, m: im, v}); }
  const vBase = v;
  if (forTeam && G.teams[forTeam]) {
    const gm = gmOf(forTeam), nick = G.teams[forTeam].nick;
    const own = p.tm === forTeam;
    const sv = own ? 1 + (scoutView(forTeam, p) - 1) * .25 : scoutView(forTeam, p);
    v *= sv; steps.push({k: 'Scouting', note: own ? `${nick} know him best: ×${sv.toFixed(2)}` : `${nick} scouts ${sv >= 1.04 ? 'like him more than most' : sv <= .96 ? 'are lower on him than most' : 'grade him about the same as everyone'}: ×${sv.toFixed(2)}`, m: sv, v});
    const gp = gm.pos[p.pos] || 1;
    if (gp !== 1) { v *= gp; steps.push({k: 'GM style', note: `${nick} front office is "${gm.style}": ${p.pos} ×${gp}`, m: gp, v}); }
    const ya = a <= 25 ? 1 + (gm.youth - .5) * .2 : a >= 29 ? 1 - (gm.youth - .5) * .2 : 1;
    if (Math.abs(ya - 1) > .02) { v *= ya; steps.push({k: 'Age taste', note: `${nick} ${gm.youth > .5 ? 'lean young' : 'trust veterans'}: ×${ya.toFixed(2)}`, m: ya, v}); }
    const space = capSpace(forTeam);
    const cf = p.cap >= 15 && space < 12 ? .85 : p.cap >= 15 && space > 45 ? 1.05 : 1;
    if (cf !== 1) { v *= cf; steps.push({k: 'Cap room', note: `${nick} have ${space < 12 ? 'little' : 'lots of'} cap space for a $${p.cap.toFixed(1)}M deal: ×${cf}`, m: cf, v}); }
    if (p.inj) { const ri = .85 + gm.risk * .3; v *= ri; steps.push({k: 'Risk', note: `${nick} ${gm.risk > .5 ? 'will gamble on' : 'shy away from'} injured players: ×${ri.toFixed(2)}`, m: ri, v}); }
    const sit = situation(forTeam);
    const contend = sit.status === 'Contender', sell = sit.status === 'Seller' || sit.status === 'Rebuilding';
    let tm = 1, why = '';
    if (contend && a >= 27) { tm = 1.12; why = 'contending and pay for proven veterans'; }
    else if (sell && a >= 28) { tm = .72; why = `${sit.status === 'Seller' ? 'selling' : 'rebuilding'} and do not want veterans`; }
    else if (sell && a <= 25) { tm = 1.1; why = `${sit.status === 'Seller' ? 'selling' : 'rebuilding'} and want young players`; }
    else if (sit.status === 'Bubble' && needBoost(forTeam, p) > 1) { tm = 1.06; why = 'on the playoff bubble and need help now'; }
    if (tm !== 1) { v *= tm; steps.push({k: 'Situation', note: `${nick} are ${why} (${Math.round(sit.po * 100)}% playoff odds): ×${tm}`, m: tm, v}); }
    if (G.phase === 'deadline' && contend && needBoost(forTeam, p) > 1) { const u = 1 + .35 * sit.po; v *= u; steps.push({k: 'Deadline push', note: `A starter now matters to a contender: ×${u.toFixed(2)}`, m: u, v}); }
    if (rental) { const rr = contend ? 1.15 : sell ? .7 : 1; if (rr !== 1) { v *= rr; steps.push({k: 'Rental', note: contend ? 'Contenders still want half a season of him: ×1.15' : 'A seller gets nothing from an expiring deal: ×0.7', m: rr, v}); } }
    const sc = situations()._scarce[p.pos] || 1;
    if (Math.abs(sc - 1) > .03) { v *= sc; steps.push({k: 'Scarcity', note: `${sc > 1 ? 'Few' : 'Plenty of'} good ${p.pos}s around the league: ×${sc.toFixed(2)}`, m: sc, v}); }
    const theirs = depth(forTeam)[p.pos] || [];
    const hurt = rosterRaw(forTeam).some(q => q.pos === p.pos && q.inj && q.ovr >= 78);
    if (hurt && p.tm !== forTeam) { v *= 1.1; steps.push({k: 'Injury need', note: `${nick} lost a starter at ${p.pos}: ×1.1`, m: 1.1, v}); }
    if (sit.tightNext && p.cap >= 15 && p.end > G.season) { v *= .88; steps.push({k: 'Next year cap', note: `${nick} are tight against next year's cap: ×0.88`, m: .88, v}); }
    if (sell && yrs >= 3 && p.cap < mk * .7) { v *= 1.08; steps.push({k: 'Control', note: `Cheap for ${yrs} more years, which rebuilders love: ×1.08`, m: 1.08, v}); }
    if (own && needBoost(forTeam, p) === 1 && p.ovr >= 75) { v *= 1.1; steps.push({k: 'Our guy', note: `${nick} do not like giving up a starter: ×1.1`, m: 1.1, v}); }
    if (p.pos === 'QB' && p.ovr >= 84 && p.tm !== forTeam) {
      const theirQB = (depth(forTeam).QB[0] || {ovr: 50}).ovr;
      if (theirQB < p.ovr - 4) { const fq = theirQB < 78 ? 1.3 : 1.15; v *= fq; steps.push({k: 'Franchise QB', note: `${nick} ${theirQB < 78 ? 'have no answer' : 'would upgrade'} at quarterback (${theirQB} OVR starter): ×${fq}`, m: fq, v}); }
    }
    const fit = needBoost(forTeam, p);
    if (fit !== 1) { v *= fit; steps.push({k: 'Fit', note: fit > 1 ? `Would start for the ${G.teams[forTeam].nick}: ×${fit}` : `Would be a backup for the ${G.teams[forTeam].nick}: ×${fit}`, m: fit, v}); }
    // how much a win is worth to them right now: most for a bubble team, least for one that is tanking
    const lev = 4 * sit.po * (1 - sit.po), nowShare = a >= 29 ? .8 : a >= 26 ? .5 : .25, lm = Math.round((1 + nowShare * (lev - .5) * .36) * 100) / 100;
    if (Math.abs(lm - 1) >= .03) { v *= lm; steps.push({k: 'Win leverage', note: lev > .6 ? `Every win swings their playoff chances (${Math.round(sit.po * 100)}%), and he helps now` : `A few more wins barely move their season (${Math.round(sit.po * 100)}% playoff odds)`, m: lm, v}); }
    // the years they care about: contenders value this season most, rebuilders the seasons after
    const tw = timelineFactor(p, sit.status);
    if (Math.abs(tw - 1) >= .03) { v *= tw; steps.push({k: 'Timeline', note: tw > 1 ? `His best years line up with when the ${nick} plan to win` : contend ? `His best years are still ahead, and the ${nick} are trying to win now` : `His best years are now, and the ${nick} are building for later`, m: tw, v}); }
    // already deep at the spot: another one is worth less
    const deep = rosterRaw(forTeam).filter(q => q.pos === p.pos && q.id !== p.id && !q.inj && q.ovr >= p.ovr - 3).length - STARTERS[p.pos];
    if (deep >= 1 && p.tm !== forTeam) { const gm2 = deep >= 2 ? .8 : .9; v *= gm2; steps.push({k: 'Depth glut', note: `The ${nick} already have ${deep + STARTERS[p.pos]} ${p.pos}s at his level`, m: gm2, v}); }
  }
  if (forTeam && G.teams[forTeam]) {
    // no single team's view strays too far from the league
    // factors compound gently and stay within 0.65× to 1.45× of the league view
    const raw = v / Math.max(.01, vBase), soft = clamp(Math.pow(raw, .7), .8, 1.25);
    if (Math.abs(soft - raw) > .01) { v = vBase * soft; steps.push({k: 'Overall', note: `All ${G.teams[forTeam].nick} factors together: ×${soft.toFixed(2)} on the league view (teams stay within 0.8× to 1.25×)`, v}); }
  }
  return {steps, total: Math.max(.3, v), market: mk, yrs};
}
// Value by season over the years of control, weighted by when a team wants to win, against a neutral team's weights
function timelineFactor(p, status) {
  const yrs = Math.max(1, Math.min(4, p.end - G.season + 1));
  const W = status === 'Contender' ? [1, .7, .5, .35] : status === 'Rebuilding' ? [.55, .9, 1, 1] : status === 'Seller' ? [.65, .9, .95, .9] : [1, .85, .7, .55];
  const N = [1, .85, .72, .6];
  // the shape of his years against the shape of their window: average value per year, each team weighting its own years
  let t = 0, tw = 0, n = 0, nw = 0;
  for (let y = 0; y < yrs; y++) {
    const age = ageAdj(p) + y, d = age <= 25 ? 2 : age <= 29 ? 0 : age <= 32 ? -2 : -4;
    const o = clamp(p.ovr + d * y, 40, 99), val = ratingPts(o);
    t += W[y] * val; tw += W[y]; n += N[y] * val; nw += N[y];
  }
  return Math.round(clamp((t / tw) / Math.max(.01, n / nw), .85, 1.15) * 100) / 100;
}
// How much a team cares about a player given its depth chart
// What every other team would pay, low to high
function valueRange(p) {
  const L = teamList().filter(t => t !== p.tm).map(t => ({t, v: playerValue(p, t)})).sort((a, b) => b.v - a.v);
  return {hi: L[0], lo: L[L.length - 1], top: L.slice(0, 3), mid: L[Math.floor(L.length / 2)].v};
}
function needBoost(t, p) {
  const d = depth(t)[p.pos] || [], n = STARTERS[p.pos];
  if (p.tm === t) { const i = d.indexOf(p); return i >= 0 && i < n ? 1 : (p.pos === 'K' || p.pos === 'P') ? .3 : .8; }
  const worst = d[n - 1] ? d[n - 1].ovr : 40;
  if (p.ovr > worst + 3) return 1.15;
  if (p.ovr >= worst - 4) return 1;
  return (p.pos === 'K' || p.pos === 'P') ? .3 : .7;
}
function projectedSlot(team, yr) {
  // lower = earlier pick
  if (yr === G.season && G.phase === 'offseason' && G.draftOrder) return G.draftOrder.indexOf(team) + 1;
  const ts = teamList().map(t => ({t, s: (yr === G.season + 1 && G.phase !== 'offseason' && G.week > 0) ? winPct(t) * 100 + teamRating(t).ovr * .3 : teamRating(t).ovr}));
  ts.sort((a, b) => a.s - b.s);
  return ts.findIndex(x => x.t === team) + 1;
}
// Fitted from 375 real pick-for-pick swaps (2013-2026): #1 = 100, #10 = 56, #32 = 26, #64 = 11, #128 = 3 (scaled so #1 is 71.5)
const pickPts = slot => 71.5 * Math.exp(-.13 * Math.pow(Math.max(0, slot - 1), .68)) + .2;
function pickSlot(pk) {
  let s = projectedSlot(pk.orig, pk.yr);
  if (pk.yr > nextDraftYear()) s = 16.5 * .6 + s * .4; // a year out: nobody knows where it lands
  return Math.round(s) + (pk.rd - 1) * 32;
}
function pickValue(pk, forTeam) {
  let v = pickPts(pickSlot(pk));
  if (pk.yr > nextDraftYear()) v *= .62; // real teams treat next year's pick as about 60% of the same slot now
  if (forTeam && G.teams[forTeam]) {
    const st = situation(forTeam).status;
    v *= st === 'Rebuilding' ? 1.22 : st === 'Seller' ? 1.15 : st === 'Bubble' ? .95 : .82;
    v *= .92 + gmOf(forTeam).youth * .16; // some front offices love the draft
  }
  return v;
}
// The draft that comes next: in the offseason it is this one until it is done, otherwise next spring's
function nextDraftYear() { return G.phase === 'offseason' && !G.draftDone ? G.season : G.season + 1; }
function rebuilding(t) {
  if (CACHE && t in CACHE.rb) return CACHE.rb[t];
  const v = rebuildingRaw(t);
  if (CACHE) CACHE.rb[t] = v;
  return v;
}
function rebuildingRaw(t) {
  if (G.teams[t]) { const st = situation(t).status; return st === 'Seller' || st === 'Rebuilding'; }
  if (G.week === 0 || G.phase === 'offseason') return teamRating(t).ovr < 70;
  const rec = record(t, G.season);
  const gp = rec.w + rec.l;
  if (gp < 4) return teamRating(t).ovr < 70;
  return rec.w / gp < .4;
}
function pickLabel(pk) {
  const pre = pk.yr === G.season && G.phase === 'offseason' && G.draftOrder ? `#${G.draftOrder.indexOf(pk.orig) + 1 + (pk.rd - 1) * 32}` : '';
  return `${pk.yr} Round ${pk.rd}${pk.orig !== pk.owner ? ' (' + pk.orig + ')' : ''}${pre ? ' ' + pre : ''}`;
}
const pickById = id => G.picks.find(x => x.id === id);
function assetValue(id, forTeam) { const p = G.players[id]; if (p) return playerValue(p, forTeam); const k = pickById(id); return k ? pickValue(k, forTeam) : 0; }
function assetName(id) { const p = G.players[id]; if (p) return `${p.n} (${p.pos} ${p.ovr})`; const k = pickById(id); return k ? pickLabel(k) : 'Unknown'; }
// Several pieces are worth less than one: teams pay for stars, not piles
const STACK = [1, .75, .55, .4, .3, .25];
const stacked = vals => vals.slice().sort((a, b) => b - a).reduce((s, v, i) => s + v * (STACK[i] || .2), 0);

// ---------- trades ----------
function tradeOpenNow() { return G.phase === 'deadline' || G.phase === 'offseason' || ((G.phase === 'preseason' || G.phase === 'season') && G.week === 0); }
function rosterLimit() { return G.phase === 'offseason' && G.step !== 'cutdown' ? 90 : 75; }
// How a deal looks, not just what it is worth. Real teams do not move a star for role players, even when the
// numbers add up: the best piece coming back has to be close to his level, or two strong pieces have to come back.
// Picks count by where they land: an early first is a star's worth, a third is a solid starter.
function assetLook(id) {
  const p = G.players[id]; if (p) return p.ovr;
  const k = pickById(id); if (!k) return 0;
  if (k.rd === 1) { const sl = pickSlot(k); return sl <= 10 ? 88 : sl <= 20 ? 85 : 83; }
  return k.rd === 2 ? 77 : k.rd === 3 ? 73 : 68;
}
function looksOk(out, back) {
  const star = out.map(id => G.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr)[0];
  if (!star || star.ovr < 84) return {ok: true};
  const L = back.map(assetLook).sort((a, b) => b - a), S = star.ovr;
  const ok = (L[0] || 0) >= S - 6 || ((L[0] || 0) >= S - 10 && (L[1] || 0) >= S - 14);
  return {ok, star};
}
function evalTrade(partner, give, get) {
  // give = assets the user sends, get = assets the user receives. Scored from the partner's side.
  const vIn = stacked(give.map(id => assetValue(id, partner)));
  const vOut = get.reduce((s, id) => s + assetValue(id, partner), 0);
  const capOf = ids => ids.reduce((s, id) => s + (G.players[id] ? G.players[id].cap : 0), 0);
  const capGive = capOf(give), capGet = capOf(get);
  const issues = [];
  const uAfter = payroll(G.user) - capGive + capGet, pAfter = payroll(partner) - capGet + capGive;
  const cap = G.cap[G.season];
  if (uAfter > cap && capGet > capGive) issues.push(`You would be $${(uAfter - cap).toFixed(1)}M over the cap. Send back more salary.`);
  if (pAfter > cap && capGive > capGet) issues.push(`${G.teams[partner].nick} would be over the cap. Take back more salary.`);
  const pc = ids => ids.filter(id => G.players[id]).length;
  const uRoster = roster(G.user).length - pc(give) + pc(get);
  if (uRoster < 40 && pc(give) > pc(get)) issues.push('Your roster would drop under 40 players.');
  if (uRoster > rosterLimit()) issues.push(`Your roster would go over ${rosterLimit()}. Release someone first.`);
  if (!give.length || !get.length) issues.push('Both sides need at least one asset.');
  // they will not hand over a star for spare parts, however the values add up
  const look = give.length ? looksOk(get, give) : {ok: true};
  if (!look.ok) issues.push(`The ${G.teams[partner].nick} will not move ${look.star.n} for that. A star needs a player close to his level back, or a first-round pick and a strong second piece.`);
  const lookMine = get.length ? looksOk(give, get) : {ok: true};
  const rival = G.teams[partner].div === G.teams[G.user].div;
  // every extra body they take on costs a roster spot: someone gets cut to make room
  const extraIn = pc(give) - pc(get), full = roster(partner).length + extraIn > rosterLimit() - 2;
  const spotCost = extraIn > 0 ? extraIn * (full ? 1.6 : .7) : 0;
  // they remember how the last deals with you went
  const trust = (G.trust || {})[partner] || 0;
  // teams want a little extra to say yes; the premium scales with the deal, so a late-pick swap is not priced like a blockbuster
  const need = (vOut * (rival ? 1.15 : 1.05) + Math.min(1.5, .1 + vOut * .12) + spotCost) * (1 + Math.max(0, -trust) * .06 - Math.max(0, trust) * .02);
  const ratio = need > 0 ? vIn / need : 1;
  // what a neutral observer thinks: is this fair to you?
  const fair = get.reduce((s, id) => s + assetValue(id), 0) / Math.max(1, give.reduce((s, id) => s + assetValue(id), 0));
  const st = G.teams[partner] ? situation(partner).status : '';
  const dump = (st === 'Seller' || st === 'Rebuilding') && get.every(id => { const q = G.players[id]; return q && ageAdj(q) >= 28; });
  const fleece = give.length > 0 && get.length > 0 && fair > (dump ? 1.4 : 1.25);
  return {rival, spotCost, trust, vIn, vOut, need, ratio, fair, fleece, ok: ratio >= 1 && !issues.length && !fleece, issues, capGive, capGet, badLook: lookMine.ok ? null : lookMine.star.n};
}
function doTrade(partner, give, get, how) {
  const ev = evalTrade(partner, give, get);
  if (!ev.ok && how !== 'offer' && how !== 'accepted') return ev;
  // a deal they proposed: only your side's limits can stop it, and acceptOffer clears those first
  const block = how === 'accepted' ? ev.issues.filter(i => i.startsWith('You') || i.startsWith('Your')) : ev.issues;
  if (block.length) return {...ev, issues: block};
  const when = G.phase === 'offseason' ? (G.step === 'draft' ? 'Draft day' : 'Offseason') : `Week ${G.week}`;
  const rec = {season: G.season, when, partner, gave: give.map(assetName), got: get.map(assetName), giveIds: give.slice(), getIds: get.slice(),
    vGive: give.reduce((s, id) => s + assetValue(id), 0), vGet: get.reduce((s, id) => s + assetValue(id), 0)};
  const ch = chemTrade(give, get);
  for (const id of give) { if (G.players[id]) G.players[id].tm = partner; else { pickById(id).owner = partner; syncDraftSlot(id, partner); } }
  for (const id of get) { if (G.players[id]) { G.players[id].tm = G.user; G.players[id].how = 'Trade'; G.players[id].joined = G.season; } else { pickById(id).owner = G.user; syncDraftSlot(id, G.user); } }
  rec.chem = chemShift(ch.d, ch.why);
  G.trust = G.trust || {};
  const won = rec.vGet / Math.max(.5, rec.vGive);
  if (won > 1.15) G.trust[partner] = Math.max(-3, (G.trust[partner] || 0) - 1);
  else if (won < .9) G.trust[partner] = Math.min(3, (G.trust[partner] || 0) + 1);
  G.trades.push(rec);
  G.news.unshift(`Trade with ${G.teams[partner].nick}: you get ${rec.got.join(', ')}.`);
  G.offers = (G.offers || []).filter(o => ![...o.give, ...o.get].some(id => give.includes(id) || get.includes(id)));
  return {...ev, ok: true};
}
function syncDraftSlot(pickId, owner) { if (G.draft) for (const s of G.draft.order) if (s.pickId === pickId && !s.sel) s.owner = owner; }

// Fill one side from a pool so the other team says yes, overpaying as little as possible.
function fillSide(partner, give, get, pool) {
  const g = give.slice();
  let ev = evalTrade(partner, g, get);
  for (let step = 0; step < 5 && ev.ratio < 1; step++) {
    const cands = pool.filter(id => !g.includes(id)).map(id => ({id, v: assetValue(id, partner)})).sort((a, b) => a.v - b.v);
    if (!cands.length) break;
    let best = null;
    for (const c of cands) { const e = evalTrade(partner, [...g, c.id], get); if (e.ratio >= 1) { best = c.id; break; } }
    g.push(best || cands[cands.length - 1].id);
    ev = evalTrade(partner, g, get);
  }
  for (let step = 0; step < 2 && ev.issues.some(i => i.includes('will not move')); step++) {
    // the cheapest piece that makes it look right, not the best thing you own
    const fix = pool.filter(id => !g.includes(id) && looksOk(get, [...g, id]).ok).sort((a, b) => assetValue(a, partner) - assetValue(b, partner));
    const c = fix[0] || pool.filter(id => !g.includes(id)).sort((a, b) => assetLook(b) - assetLook(a))[0];
    if (!c) break;
    g.push(c); ev = evalTrade(partner, g, get);
  }
  for (let step = 0; step < 4 && ev.ratio >= 1 && ev.issues.some(i => i.startsWith('You would be')); step++) {
    const short = payroll(G.user) - ev.capGive + ev.capGet - G.cap[G.season];
    const cands = roster(G.user).filter(p => !g.includes(p.id) && p.cap > 1.5 && pool.includes(p.id)).sort((a, b) => playerValue(a) / a.cap - playerValue(b) / b.cap);
    const c = cands.find(p => p.cap >= short) || cands[0];
    if (!c) break;
    g.push(c.id); ev = evalTrade(partner, g, get);
  }
  return ev.ok ? g : null;
}
function userPool(kind, keep) {
  const starters = new Set(Object.values(depth(G.user)).flatMap((L, i) => L.slice(0, STARTERS[POS_ORDER[i]] || 1).map(p => p.id)));
  const picks = G.picks.filter(p => p.owner === G.user).map(p => p.id);
  const pl = roster(G.user).filter(p => p.ovr >= 58 && p.pos !== 'K' && p.pos !== 'P' && !(keep || []).includes(p.id));
  const players = kind === 'picks' ? [] : kind === 'depth' ? pl.filter(p => !starters.has(p.id)).map(p => p.id) : pl.map(p => p.id);
  return kind === 'players' || kind === 'depth' ? players : [...picks, ...players];
}
function balanceTrade(partner, give, get) { return fillSide(partner, give, get, userPool('all', get)); }
// ---------- trade talks ----------
// A phone call with their GM. You open with an offer, then keep talking: ask what it takes, sweeten it, ask for more,
// bluff, pitch the fit, or call it your final offer. Every GM reacts a little differently. Pushing too hard costs
// patience, and at zero they hang up until the next trade window.
const TALK = {
  yes: ['You have got a deal.', 'Done. Send the paperwork over.', 'We can live with that. Deal.', 'That works for us. Shake on it?', 'Yeah, we will do that.'],
  eager: ['Deal! Before you change your mind.', 'Yes. Absolutely yes.', 'Wow. Okay. Deal.', 'We accept. Quickly.'],
  nibble: ['Almost. One more piece and we are there.', 'That is fair, but we want a little something for our trouble.', 'Close. Throw in one small thing.', 'We can get there. We just need a touch more.'],
  counter: ['Not quite. Here is what gets it done.', 'Close. Meet us here.', 'We like where your head is at, but not at that price.', 'Cannot do that one. How about this instead?'],
  close: ['We are close. Find a little more.', 'Not there yet, but we are listening.', 'Nudge it a bit and we can talk.'],
  far: ['That is not close.', 'We are a long way apart.', 'You will need a lot more than that.'],
  laugh: ['Is this a joke?', 'Ha. No.', 'Our whole front office just laughed out loud.', 'Did you dial the wrong team?'],
  fleece: ['Nice try. We are not giving that away.', 'Do you think we were born yesterday?', 'We know what that is worth.'],
  done: ['We are done talking for now. Call us next window.', 'Lose our number until the next window.', 'That is enough for today.'],
  ask: ['For that, we would want this.', 'Here is what it would take.', 'Put this together and we have a deal.'],
  noask: ['Honestly, nothing you have gets that done.', 'We do not see a deal there.'],
  bluffWin: ['Who? ...Fine. We would rather he come here.', 'Okay, you have our attention.', 'We do not want to lose him to them. Let us talk.'],
  bluffLose: ['Then go call them.', 'Sure they are. Nice try.', 'Good luck with that.'],
  fitWin: ['You are not wrong. We could use him.', 'Fair point. He fills a hole for us.', 'That does help us.'],
  fitLose: ['We are set there.', 'We do not need that.', 'That is not a need for us.'],
  finalWin: ['Fine. You win. Deal.', 'Okay. We will take it.', 'Alright, alright. Deal.'],
  finalLose: ['Then we are done here.', 'Then it is a no.', 'Final? Then we pass.'],
  middleWin: ['Fine. Middle it is. Deal.', 'Okay, we can meet you there.', 'Split the difference? Done.'],
  middleTry: ['Here is our middle.', 'Meet us here and it is done.', 'Halfway looks like this.'],
  walkWin: ['Wait. Okay, we will do it.', 'Hold on. Fine, deal.', 'Do not hang up. Deal.'],
  walkLose: ['Then walk.', 'Door is that way.', 'Suit yourself.'],
  alts: ['We would move one of these instead.', 'Not him. But we would talk about these guys.', 'He is off the table. Try one of these.'],
  noalts: ['We are not moving anyone else there.', 'Nobody else at that spot is available.'],
  workFrom: ['Okay. What are you thinking?', 'Go ahead.', 'We are listening.'],
  squeezeWin: ['Fine, throw it in. Deal.', 'Greedy. But okay.', 'Sure. Now we are done.'],
  squeezeLose: ['Do not push it. The deal stands as is.', 'No. Take it or leave it.', 'Nope. Original deal or nothing.'],
};
const say = k => TALK[k][Math.floor(Math.random() * TALK[k].length)];
// A point that lands still has to be followed by where the deal stands
const andYet = r => r.kind === 'laugh' ? 'But you are still way off.' : r.line;
const talkKey = () => `${G.season}-${G.phase}-${G.step || ''}`;
function talkWith(partner) {
  G.talks = G.talks || {};
  let T = G.talks[partner];
  if (!T || T.key !== talkKey()) T = G.talks[partner] = {key: talkKey(), patience: 3, log: [], deal: null, boost: 0, used: {}};
  T.used = T.used || {}; T.boost = T.boost || 0;
  if (T.firm == null) T.firm = 1 + openingAnchor(partner);
  return T;
}
// Every GM opens above fair value. Gamblers ask a little more than fair, hard bargainers a lot more,
// and a contender at the deadline is in a hurry. The bar comes down as you keep talking.
function temperament(partner) {
  const r = gmOf(partner).risk;
  return r > .66 ? {name: 'Gambler', note: 'moves fast and bites on a good story'} : r < .33 ? {name: 'Hard bargainer', note: 'starts high and makes you earn every point'} : {name: 'Fair dealer', note: 'starts a little high, meets you if you are reasonable'};
}
function openingAnchor(partner) {
  const gm = gmOf(partner), sit = situation(partner);
  let a = .06 + .14 * (1 - gm.risk);
  if (G.phase === 'deadline' && sit.status === 'Contender') a -= .03;
  return Math.round(clamp(a, .04, .2) * 100) / 100;
}
// Their reasons, in plain words: how they value each side, what moves their price, and where their bar is
function talkWhy(partner, give, get) {
  const T = talkWith(partner), ev = evalTrade(partner, give, get), nick = G.teams[partner].nick, out = [];
  const fmt = v => v < 20 ? v.toFixed(1) : String(Math.round(v)), vin = fmt(ev.vIn * (1 + T.boost)), need = fmt(ev.need * T.firm), vout = fmt(ev.vOut);
  out.push(`To us, what we give up is worth ${vout}. Your side is worth ${vin}. Our bar right now is about ${need}.`);
  const team = st => ['Scouting', 'GM style', 'Age taste', 'Situation', 'Deadline push', 'Fit', 'Our guy', 'Franchise QB', 'Cap room', 'Rental', 'Control', 'Scarcity', 'Next year cap', 'Injury need', 'Risk', 'Win leverage', 'Timeline', 'Depth glut'].includes(st.k) && st.m != null && Math.abs(st.m - 1) >= .04;
  const top = ids => ids.filter(id => G.players[id]).map(id => G.players[id]).sort((a, b) => playerValue(b, partner) - playerValue(a, partner))[0];
  const key = (p, mine) => {
    if (!p) return;
    const st = valueParts(p, partner).steps.filter(team).sort((a, b) => Math.abs(Math.log(b.m)) - Math.abs(Math.log(a.m))).slice(0, 2);
    for (const x of st) out.push(`${mine ? 'On ' : 'On our '}${p.n}: ${x.note.replace(/: ×[\d.]+$/, '').replace(/\.$/, '')}. ${x.m > 1 ? 'Worth more' : 'Worth less'} to us.`);
  };
  key(top(get), false); key(top(give), true);
  const picks = give.filter(id => !G.players[id]);
  if (picks.length) { const sit = situation(partner); out.push(sit.status === 'Rebuilding' || sit.status === 'Seller' ? 'Picks are exactly what a team like ours wants.' : sit.status === 'Contender' ? 'Picks do not help us win this year, so they count for less.' : 'Picks are fine, but we would rather help now.'); }
  if (T.firm > 1.005) out.push(`We started above fair, as everyone does. Keep talking and that comes down.`);
  if (ev.spotCost > .1) out.push(`We would have to cut someone to fit ${give.filter(id => G.players[id]).length} players. That costs us too.`);
  if (ev.trust < 0) out.push('We remember the last deal with you. We want a little more this time.');
  else if (ev.trust > 0) out.push('You have been fair with us before. That helps.');
  ev.issues.filter(i => !i.startsWith('Both')).forEach(i => out.push(i));
  return out;
}
// How their GM sees the deal on the table right now, with what you have talked them into.
function talkEval(partner, give, get) {
  const T = talkWith(partner), ev = evalTrade(partner, give, get);
  const ratio = ev.ratio * (1 + T.boost);
  const blocking = ev.issues.filter(i => !i.startsWith('Both'));
  return {ev, ratio, blocking, ok: ratio >= 1 && !blocking.length && !ev.fleece};
}
// Their answer to the deal on the table. Only lowballs and greed cost patience.
function nibble(partner, give, get, target) {
  // the smallest piece from your side that lifts the deal over their bar
  const T = talkWith(partner);
  const pool = userPool('all', get).filter(id => !give.includes(id)).map(id => ({id, v: assetValue(id, partner)})).filter(x => x.v >= .3).sort((a, b) => a.v - b.v);
  return pool.find(x => { const e = talkEval(partner, [...give, x.id], get); return e.ok && e.ratio >= target; });
}
function talkRespond(partner, free) {
  const T = talkWith(partner), {give, get} = T.deal, E2 = talkEval(partner, give, get);
  const cost = n => { if (!free) T.patience -= n; };
  let r;
  const why = talkWhy(partner, give, get);
  if (E2.ok && E2.ratio >= T.firm + .3) r = {kind: 'yes', line: say('eager'), why: ['That is more than we hoped for.', ...why]};
  else if (E2.ok && E2.ratio >= T.firm) r = {kind: 'yes', line: say('yes'), why};
  else if (E2.ok) {
    // fair, but not yet over their bar: they ask for one small thing, and the bar comes down a little anyway
    const n = nibble(partner, give, get, T.firm);
    r = n ? {kind: 'counter', line: say('nibble'), counters: [{label: 'Add one piece', give: [...give, n.id], get: get.slice()}], why: [`We are close. Add ${assetName(n.id)} and it is done.`, ...why]} : {kind: 'close', line: say('close'), why};
    T.firm = Math.max(1, T.firm - .05);
    if (r) return r;
  }
  else if (E2.ratio >= 1 && E2.blocking.length && !E2.ev.fleece) r = {kind: 'issue', line: `We would do it, but the league will not. ${E2.blocking[0]}`, why};
  else if (E2.ev.fleece) { cost(1); r = {kind: 'laugh', line: say('fleece'), why: ['We know what we are giving up, and that deal is too good for you.', ...why]}; }
  else if (E2.ratio < .55) { cost(1); r = {kind: 'laugh', line: say('laugh'), why: [`You are offering about ${Math.round(E2.ratio * 100)}% of what we need.`, ...why]}; }
  else if (E2.ratio >= .85) { const c = counterTrade(partner, give, get); r = c ? {kind: 'counter', line: say('counter'), counters: c, why} : {kind: 'close', line: say('close'), why}; }
  else r = {kind: 'close', line: say('far'), why: [`You are offering about ${Math.round(E2.ratio * 100)}% of what we need.`, ...why]};
  // every exchange brings their bar down a little
  T.firm = Math.max(1, T.firm - .03);
  return r;
}
function talkReply(partner, r) {
  const T = talkWith(partner);
  if (r.kind !== 'yes' && T.patience <= 0) { r.line += ' ' + say('done'); r.done = true; r.kind = r.kind === 'yes' ? 'yes' : 'done'; }
  if (r.kind === 'yes') { r.give = T.deal.give.slice(); r.get = T.deal.get.slice(); }
  T.log.push({me: false, ...r});
  return r;
}
function hungUp(T) { if (T.patience > 0) return null; const r = {kind: 'done', line: say('done'), done: true}; T.log.push({me: false, ...r}); return r; }
// Open the call with an offer
function proposeTrade(partner, give, get) {
  const T = talkWith(partner);
  T.deal = {give: give.slice(), get: get.slice()}; T.boost = 0; T.used = {};
  T.log.push({me: true, give: give.slice(), get: get.slice()});
  return hungUp(T) || talkReply(partner, talkRespond(partner));
}
// Everything you can say once the call is going
const TALK_MOVES = {ask: 'What would it take?', add: 'Sweeten it', more: 'Ask for more', remove: 'Take something off', drop: 'Leave something out', middle: 'Meet me in the middle', alt: 'Who else would you move?', walk: 'I am walking away', work: 'Let us work from your number', swap: 'What about him instead?', bluff: 'Another team is interested', fit: 'He fills a need for you', final: 'That is my final offer', squeeze: 'Throw in a little more?'};
function talkMove(partner, move, arg) {
  const T = talkWith(partner);
  if (!T.deal) return null;
  const gm = gmOf(partner), d = T.deal;
  const me = {me: true, move, line: TALK_MOVES[move]};
  if (move === 'add' || move === 'more') {
    const into = move === 'add' ? d.give : d.get;
    if (!arg || into.includes(arg)) return null;
    into.push(arg);
    me.line = `${move === 'add' ? 'I can add' : 'I would need'} ${assetName(arg)}.`;
  }
  if (move === 'remove' || move === 'drop') {
    const from = move === 'remove' ? d.give : d.get;
    if (!arg || !from.includes(arg) || (move === 'drop' && from.length < 2) || (move === 'remove' && from.length < 2)) return null;
    from.splice(from.indexOf(arg), 1);
    me.line = move === 'remove' ? `Take ${assetName(arg)} off my side.` : `Leave ${assetName(arg)} out of it.`;
  }
  if (move === 'swap') {
    if (!arg || !G.players[arg] || G.players[arg].tm !== partner) return null;
    d.get = [arg];
    me.line = `What about ${assetName(arg)} instead?`;
  }
  if (move === 'work') {
    const c = (T.log.slice().reverse().find(m => !m.me && m.counters) || {}).counters;
    const x = c && c[+arg || 0];
    if (!x) return null;
    d.give = x.give.slice(); d.get = x.get.slice();
  }
  T.log.push(me);
  const h = hungUp(T); if (h) return h;
  if (move === 'add' || move === 'more' || move === 'remove' || move === 'drop' || move === 'swap') return talkReply(partner, talkRespond(partner));
  if (move === 'work') return talkReply(partner, {kind: 'close', line: say('workFrom')});
  if (move === 'alt') {
    // other players at the same spots that they would actually move
    const want = d.get.map(id => G.players[id]).filter(Boolean), posSet = new Set(want.map(q => q.pos));
    const top = want.length ? Math.max(...want.map(q => q.ovr)) : 99;
    const st = new Set(POS_ORDER.flatMap(pos => depth(partner)[pos].slice(0, STARTERS[pos]).map(q => q.id)));
    const alts = roster(partner).filter(q => posSet.has(q.pos) && !d.get.includes(q.id) && q.ovr >= 65 && (!st.has(q.id) || q.ovr < top)).sort((a, b) => b.ovr - a.ovr).slice(0, 3).map(q => q.id);
    return talkReply(partner, alts.length ? {kind: 'alts', line: say('alts'), alts} : {kind: 'close', line: say('noalts')});
  }
  if (move === 'ask') {
    const g = balanceTrade(partner, d.give, d.get);
    return talkReply(partner, g ? {kind: 'counter', line: say('ask'), counters: [{label: 'Their ask', give: g, get: d.get.slice()}]} : {kind: 'close', line: say('noask')});
  }
  T.used[move] = 1;
  if (move === 'bluff') {
    // Gamblers bite more often; careful GMs call your bluff
    if (rand() < .3 + .35 * gm.risk) { T.boost += .07; T.firm = Math.max(1, T.firm - .04); const r = talkRespond(partner, true); r.line = say('bluffWin') + ' ' + andYet(r); r.why = [`They believed you: your side now looks about 7% better to them.`, ...(r.why || [])]; return talkReply(partner, r); }
    T.patience -= 1; const r = talkRespond(partner, true); r.line = say('bluffLose') + (r.kind === 'yes' ? ' But the deal still stands.' : ''); r.why = [`${temperament(partner).name}s call bluffs. That cost you patience.`, ...(r.why || [])]; return talkReply(partner, r);
  }
  if (move === 'fit') {
    const fills = d.give.some(id => G.players[id] && needBoost(partner, G.players[id]) > 1);
    const r = talkRespond(partner, true);
    if (fills) { T.boost += .05; const r2 = talkRespond(partner, true); r2.line = say('fitWin') + ' ' + andYet(r2); r2.why = ['Your player fills a real hole for them, so your side counts for about 5% more.', ...(r2.why || [])]; return talkReply(partner, r2); }
    r.line = say('fitLose') + (r.kind === 'yes' ? ' The deal still stands, though.' : ''); r.why = ['Nobody you are sending would start for them.', ...(r.why || [])]; return talkReply(partner, r);
  }
  if (move === 'final') {
    const {ratio} = talkEval(partner, d.give, d.get);
    if (ratio >= .9 && rand() < (ratio - .85) / .15) { T.boost = Math.max(T.boost, 1 / Math.max(.01, talkEval(partner, d.give, d.get).ev.ratio) - 1 + .001); return talkReply(partner, {kind: 'yes', line: say('finalWin')}); }
    T.patience -= 2; return talkReply(partner, {kind: 'close', line: say('finalLose'), final: true});
  }
  if (move === 'middle') {
    const {ratio} = talkEval(partner, d.give, d.get);
    if (ratio >= .88 && rand() < .55 + gm.risk * .2) { T.boost = Math.max(T.boost, 1 / Math.max(.01, talkEval(partner, d.give, d.get).ev.ratio) - 1 + .001); return talkReply(partner, {kind: 'yes', line: say('middleWin')}); }
    // otherwise they name a middle: the smallest single piece from your side that gets it done
    const pool = userPool('all', d.get).filter(id => !d.give.includes(id)).map(id => ({id, v: assetValue(id, partner)})).sort((a, b) => a.v - b.v);
    const one = pool.find(x => talkEval(partner, [...d.give, x.id], d.get).ok);
    if (one) return talkReply(partner, {kind: 'counter', line: say('middleTry'), counters: [{label: 'Their middle', give: [...d.give, one.id], get: d.get.slice()}]});
    T.patience -= 1; return talkReply(partner, {kind: 'close', line: say('far')});
  }
  if (move === 'walk') {
    const {ratio} = talkEval(partner, d.give, d.get);
    if (ratio >= .92 && rand() < .5) { T.boost = Math.max(T.boost, 1 / Math.max(.01, talkEval(partner, d.give, d.get).ev.ratio) - 1 + .001); return talkReply(partner, {kind: 'yes', line: say('walkWin')}); }
    T.patience -= 1; return talkReply(partner, {kind: 'close', line: say('walkLose')});
  }
  if (move === 'squeeze') {
    // Ask them to add their cheapest asset to a deal they already said yes to
    const theirs = [...roster(partner).filter(p => p.pos !== 'K' && p.pos !== 'P').map(p => p.id), ...G.picks.filter(k => k.owner === partner).map(k => k.id)]
      .filter(id => !d.get.includes(id)).map(id => ({id, v: assetValue(id, partner)})).sort((a, b) => a.v - b.v);
    const x = theirs.find(o => o.v >= .5) || theirs[0];
    if (x && talkEval(partner, d.give, [...d.get, x.id]).ok) { d.get.push(x.id); return talkReply(partner, {kind: 'yes', line: `${say('squeezeWin')} You get ${assetName(x.id)} too.`}); }
    T.patience -= 1; return talkReply(partner, {kind: 'yes', line: say('squeezeLose')});
  }
  return null;
}
// What you could add to sweeten it, and what you could ask for: cheapest first for them to say yes
function talkAssets(partner, side) {
  const T = talkWith(partner), d = T.deal || {give: [], get: []};
  if (side === 'add') {
    // every pick you own, plus your 8 cheapest useful players, cheapest first
    const L = userPool('all').filter(id => !d.give.includes(id)).map(id => ({id, v: assetValue(id, partner), pick: !G.players[id]})).filter(x => x.v >= 1).sort((a, b) => a.v - b.v);
    return [...L.filter(x => x.pick), ...L.filter(x => !x.pick).slice(0, 8)].sort((a, b) => a.v - b.v);
  }
  return [...roster(partner).filter(p => p.pos !== 'K' && p.pos !== 'P' && p.ovr >= 60).map(p => p.id), ...G.picks.filter(k => k.owner === partner).map(k => k.id)]
    .filter(id => !d.get.includes(id)).map(id => ({id, v: assetValue(id, partner)})).filter(x => x.v >= 1).sort((a, b) => a.v - b.v).slice(0, 8);
}
// Packages you could send for one of their players
function findPackages(pid) {
  const p = G.players[pid];
  if (!p || p.tm === G.user || !G.teams[p.tm]) return [];
  const out = [], seen = new Set();
  for (const [kind, label] of [['picks', 'Picks only'], ['depth', 'Backups only'], ['all', 'Best mix']]) {
    const g = fillSide(p.tm, [], [pid], userPool(kind));
    if (!g) continue;
    const key = g.slice().sort().join();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({label, partner: p.tm, give: g, get: [pid], ev: evalTrade(p.tm, g, [pid])});
  }
  return out;
}
// A team builds an offer for one of your players from its own assets
// want: 'picks', 'players' or 'any'; pos narrows the players you will take
function buildPackage(t, pid, loose, kind, pos) {
  const want = assetValue(pid);
  const d = depth(t);
  const starterIds = new Set(POS_ORDER.flatMap(pos => d[pos].slice(0, STARTERS[pos]).map(p => p.id)));
  const picks = G.picks.filter(k => k.owner === t).map(k => ({id: k.id, v: assetValue(k.id)})).sort((a, b) => b.v - a.v);
  const forPlayers = kind === 'players';
  const players = roster(t).filter(p => p.ovr >= (forPlayers ? 65 : 62) && p.pos !== 'K' && p.pos !== 'P' && !p.inj
    && (forPlayers ? (!pos || pos === 'ANY' || p.pos === pos) && !(p.pos === 'QB' && starterIds.has(p.id)) : !starterIds.has(p.id)))
    .map(p => ({id: p.id, v: assetValue(p.id)})).sort((a, b) => b.v - a.v);
  // Real teams pay mostly in picks: 95% of trades include picks, only 5% are player-for-player.
  const tryPool = pool => {
    const pkg = []; let sum = 0;
    for (const c of pool) {
      if (sum >= want * .92 || pkg.length >= 3) break;
      if (sum + c.v <= want * 1.08 || (pkg.length === 2 && sum + c.v <= want * 1.3)) { pkg.push(c.id); sum += c.v; }
    }
    return sum >= want * (loose ? .75 : .85) ? pkg : null;
  };
  // 'any' tries picks, then picks with backups, then players who start for them
  const starters = kind === 'picks' || forPlayers ? [] : roster(t).filter(p => p.ovr >= 65 && starterIds.has(p.id) && p.pos !== 'QB' && p.pos !== 'K' && p.pos !== 'P' && !p.inj).map(p => ({id: p.id, v: assetValue(p.id)})).sort((a, b) => b.v - a.v);
  const pools = kind === 'picks' ? [picks] : forPlayers ? [players] : [picks, [...picks, ...players].sort((a, b) => b.v - a.v), [...players, ...starters].sort((a, b) => b.v - a.v)];
  for (const pool of pools) {
    const pkg = tryPool(pool);
    if (!pkg || !pkg.length) continue;
    const ev = evalTrade(t, [pid], pkg);
    if (!ev.issues.length && !ev.badLook && ev.ratio >= (loose ? .9 : .95)) return pkg;
  }
  return null;
}
// Offers other teams send you
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// What an offer does to your team this season, and whether it is one worth showing you at all.
// Teams do not call to take a starter for picks unless you are selling, or unless they really pay.
function offerSense(give, get, fair) {
  if (fair < .95) return {ok: false};
  if (fair >= 1.15 || rebuilding(G.user)) return {ok: true};
  // a starter is the usual target: check what losing him costs you before you ever see the offer
  const gone = give.some(id => G.players[id] && depth(G.user)[G.players[id].pos].slice(0, STARTERS[G.players[id].pos]).some(p => p.id === id));
  return {ok: !gone || winsDelta(G.user, get, give) >= -.25};
}
function genOffers(n, minimum) {
  n = n || 3; minimum = minimum == null ? 1 : minimum;
  const offers = [];
  const used = new Set();
  const mine = roster(G.user).filter(p => p.ovr >= 70 && !p.inj && p.pos !== 'K' && p.pos !== 'P');
  for (const t of shuffle(teamList().filter(x => x !== G.user))) {
    if (offers.length >= n) break;
    const rb = rebuilding(t);
    if (rb && rand() < .5) {
      // a rebuilding team shops a veteran you could use
      const vet = roster(t).filter(p => ageAdj(p) >= 27 && p.ovr >= 76 && !p.inj && p.pos !== 'K' && p.pos !== 'P' && needBoost(G.user, p) > 1).sort((a, b) => b.ovr - a.ovr)[0];
      if (vet) {
        // like real sellers, ask for picks first and players only if picks will not do it
        const ask = fillSide(t, [], [vet.id], userPool('picks')) || fillSide(t, [], [vet.id], userPool('all'));
        if (ask) for (let k = 0; k < 2 && evalTrade(t, ask, [vet.id]).fair > 1.4; k++) {
          const extra = userPool('all', [vet.id]).filter(id => !ask.includes(id)).map(id => ({id, v: assetValue(id)})).sort((a, b) => a.v - b.v).find(x => x.v >= 2);
          if (extra) ask.push(extra.id);
        }
        const fv = ask ? evalTrade(t, ask, [vet.id]).fair : 0;
        if (ask && ask.length <= 3 && !ask.some(id => used.has(id)) && fv <= 1.35 && fv >= .93 && winsDelta(G.user, [vet.id], ask) >= .15) {
          ask.forEach(id => used.add(id));
          offers.push({id: 'o' + G.week + t + vet.id, from: t, kind: 'sell', give: ask, get: [vet.id], msg: `The ${G.teams[t].nick} are rebuilding and will move ${vet.n}.`});
          continue;
        }
      }
    }
    const targets = mine.filter(p => !used.has(p.id) && needBoost(t, p) > 1 && (!rb || ageAdj(p) <= 26)).sort((a, b) => assetValue(b.id, t) - assetValue(a.id, t));
    const tgt = targets[Math.min(targets.length - 1, rint(0, 2))];
    if (!tgt) continue;
    const pkg = buildPackage(t, tgt.id);
    if (!pkg || !offerSense([tgt.id], pkg, evalTrade(t, [tgt.id], pkg).fair).ok) continue;
    used.add(tgt.id);
    offers.push({id: 'o' + G.week + t + tgt.id, from: t, kind: 'want', give: [tgt.id], get: pkg, msg: `The ${G.teams[t].nick} want ${tgt.n} to fill their ${tgt.pos} spot.`});
  }
  // second pass: looser terms so you always hear from a few teams
  for (const t of shuffle(teamList().filter(x => x !== G.user && !offers.some(o => o.from === x)))) {
    if (offers.length >= minimum) break;
    const tgt = mine.filter(p => !used.has(p.id) && needBoost(t, p) >= 1).sort((a, b) => assetValue(b.id, t) - assetValue(a.id, t))[rint(0, 3)];
    if (!tgt) continue;
    const pkg = buildPackage(t, tgt.id, true);
    if (!pkg || !offerSense([tgt.id], pkg, evalTrade(t, [tgt.id], pkg).fair).ok) continue;
    used.add(tgt.id);
    offers.push({id: 'o' + G.week + (G.step || '') + t + tgt.id, from: t, kind: 'want', give: [tgt.id], get: pkg, msg: `The ${G.teams[t].nick} called about ${tgt.n}.`});
  }
  // at most one offer that makes you worse this season: a seller hears from buyers, but not all day
  let costly = 0;
  const keep = offers.filter(o => o.kind !== 'want' || winsDelta(G.user, o.get, o.give) >= -.25 || ++costly <= 1);
  // best for you first
  return keep.sort((a, b) => evalTrade(b.from, b.give, b.get).fair - evalTrade(a.from, a.give, a.get).fair);
}
function refreshOffers() { G.offers = [...blockOffers(), ...genOffers(3, 1)]; return G.offers; }
// ---------- your trade block ----------
// Put players on the block, say what you want back, and teams send offers for them into your inbox.
function blockOf() {
  G.block = G.block || {ids: [], want: 'any', pos: 'ANY'};
  G.block.ids = G.block.ids.filter(id => G.players[id] && G.players[id].tm === G.user);
  return G.block;
}
// When nobody bites, say why in plain words
function whyNoMarket(pid, kind, pos) {
  const p = G.players[pid]; if (!p) return '';
  const POS = {QB: 'quarterback', RB: 'running back', WR: 'receiver', TE: 'tight end', OT: 'tackle', IOL: 'guard or center', EDGE: 'pass rusher', DT: 'defensive tackle', LB: 'linebacker', CB: 'cornerback', S: 'safety', K: 'kicker', P: 'punter'};
  if (!teamList().some(t => t !== G.user && needBoost(t, p) >= 1)) return `No team needs a ${POS[p.pos] || p.pos} right now.`;
  if (p.end > G.season && p.cap > market(p) * 1.4) return `His contract scares teams off: ${p.cap.toFixed(1)}M a year through ${p.end}.`;
  if (ageAdj(p) >= 31) return 'Teams think his best years are behind him.';
  if (p.ovr < 70) return 'Teams see him as a backup.';
  if (kind === 'picks') return 'Teams would have to send salary back. Try asking for players, or either.';
  if (kind === 'players' && pos && pos !== 'ANY') return `Nobody has a ${POS[pos] || pos} they would move for him. Try any position.`;
  return 'Nobody will pay what he is worth to you right now.';
}
// During the season, unsigned players take short, cheap deals: the rest of this season at about half their offseason ask
function midseasonPrice(p) { return Math.max(1.1, Math.round(askOf(p) * .5 * 10) / 10); }
function signMidseason(id) {
  const p = G.players[id];
  if (!p || p.tm !== 'FA') return {ok: false, msg: 'He already signed somewhere.'};
  const price = midseasonPrice(p);
  if (price > capSpace(G.user) + .001) return {ok: false, msg: `Not enough cap space: he wants ${price.toFixed(1)}M and you have ${capSpace(G.user).toFixed(1)}M.`};
  p.tm = G.user; p.cap = price; p.end = G.season; p.how = 'Free agent'; p.inj = false;
  G.news.unshift(`Signed ${p.n} (${p.pos} ${p.ovr}) for the rest of the season.`);
  return {ok: true, price};
}
function toggleBlock(id) { const B = blockOf(), i = B.ids.indexOf(id); if (i >= 0) B.ids.splice(i, 1); else if (G.players[id] && G.players[id].tm === G.user) B.ids.push(id); return B.ids.includes(id); }
function setBlockWant(want, pos) { const B = blockOf(); if (want) B.want = want; if (pos) B.pos = pos; return B; }
// Offers for one player the moment you put him on the block
function blockOffersFor(pid) {
  const p = G.players[pid]; if (!p) return [];
  return shopPlayer(pid, blockOf().want).slice(0, 3).map(x => ({id: `b${G.season}${G.phase}${G.step || ''}${x.partner}${pid}`, from: x.partner, kind: 'block', give: [pid], get: x.get, msg: `For ${p.n}, off your trade block.`}));
}
function blockOffers() {
  const B = blockOf(), out = [];
  for (const id of B.ids) for (const x of shopPlayer(id, B.want, B.pos).slice(0, 2)) {
    out.push({id: `b${G.season}${G.phase}${G.step || ''}${x.partner}${id}`, from: x.partner, kind: 'block', give: [id], get: x.get, msg: `For ${G.players[id].n}, off your trade block.`});
  }
  return out;
}
// Which of your players a team wants most, by how far above the league baseline they value him
function interestIn(t, limit) {
  return roster(G.user).filter(p => p.ovr >= 65 && p.pos !== 'K' && p.pos !== 'P').map(p => {
    const base = playerValue(p), mine = playerValue(p, t);
    return {p, v: mine, lift: mine / Math.max(1, base)};
  }).filter(x => x.v >= 6 && x.lift >= 1.05).sort((a, b) => b.v * b.lift - a.v * a.lift).slice(0, limit || 6);
}
// Players a team will move, and why
function onBlock(t, limit) {
  const d = depth(t), st = situation(t).status;
  const starters = new Set(POS_ORDER.flatMap(pos => d[pos].slice(0, STARTERS[pos]).map(p => p.id)));
  return roster(t).filter(p => p.ovr >= 70 && !p.inj && p.pos !== 'K' && p.pos !== 'P').map(p => {
    let why = null;
    if ((st === 'Seller' || st === 'Rebuilding') && ageAdj(p) >= 28) why = 'Veteran on a rebuilding team';
    else if (!starters.has(p.id) && p.ovr >= 74) why = 'Stuck behind a starter';
    else if (p.end <= G.season && G.phase === 'deadline' && st !== 'Contender') why = 'Contract is up';
    else if (situation(t).tightNext && p.cap >= 15 && p.end > G.season) why = 'They need cap room';
    return why ? {p, why, v: playerValue(p)} : null;
  }).filter(Boolean).sort((a, b) => b.v - a.v).slice(0, limit || 6);
}
// Every team's top target on your roster
function marketBoard(limit) {
  const out = [];
  for (const t of teamList().filter(x => x !== G.user)) { const top = interestIn(t, 1)[0]; if (top) out.push({t, ...top}); }
  return out.sort((a, b) => b.v * b.lift - a.v * a.lift).slice(0, limit || 8);
}
// What you would have to do to take a deal: release players to fit the cap or the roster limit, or sign
// minimum-salary players to stay above 40. Cheapest loss first, never a player in the deal, never a starter if avoidable.
function acceptPlan(give, get) {
  const pc = ids => ids.filter(id => G.players[id]).length;
  const capOf = ids => ids.reduce((a, id) => a + (G.players[id] ? G.players[id].cap : 0), 0);
  const cap = G.cap[G.season];
  let over = payroll(G.user) - capOf(give) + capOf(get) - cap;
  let extra = roster(G.user).length - pc(give) + pc(get) - rosterLimit();
  const short = 40 - (roster(G.user).length - pc(give) + pc(get));
  const d = depth(G.user), starters = new Set(POS_ORDER.flatMap(pos => d[pos].slice(0, STARTERS[pos]).map(p => p.id)));
  const pool = roster(G.user).filter(p => !give.includes(p.id) && !get.includes(p.id) && p.pos !== 'K' && p.pos !== 'P')
    .map(p => ({p, c: cutCost(p), v: playerValue(p), st: starters.has(p.id)}));
  const cuts = [];
  if (over > 0) {
    const L = pool.filter(x => x.c.save > .3).sort((a, b) => (a.st - b.st) || a.v / a.c.save - b.v / b.c.save);
    for (const x of L) { if (over <= 0) break; cuts.push(x); over -= x.c.save; extra--; }
  }
  if (extra > 0) for (const x of pool.filter(x => !cuts.includes(x)).sort((a, b) => (a.st - b.st) || a.v - b.v)) { if (extra <= 0) break; cuts.push(x); extra--; }
  return {cuts: cuts.map(x => x.p.id), save: Math.round(cuts.reduce((a, x) => a + x.c.save, 0) * 10) / 10, dead: Math.round(cuts.reduce((a, x) => a + x.c.dead, 0) * 10) / 10, fill: Math.max(0, short), ok: over <= 0};
}
function acceptOffer(oid, list) {
  const o = (list || G.offers || []).find(x => x.id === oid);
  if (!o) return {ok: false, msg: 'That offer is gone.'};
  const stillMine = o.give.every(id => (G.players[id] && G.players[id].tm === G.user) || (pickById(id) && pickById(id).owner === G.user));
  const stillTheirs = o.get.every(id => (G.players[id] && G.players[id].tm === o.from) || (pickById(id) && pickById(id).owner === o.from));
  if (!stillMine || !stillTheirs) { G.offers = (G.offers || []).filter(x => x !== o); return {ok: false, msg: 'Something in that offer already moved.'}; }
  const plan = acceptPlan(o.give, o.get);
  if (!plan.ok) return {ok: false, msg: 'Even releasing players would not fit that deal under your cap.'};
  for (const id of plan.cuts) cutPlayer(id);
  const r = doTrade(o.from, o.give, o.get, 'accepted');
  if (r.ok && plan.fill) fillRoster(G.user, 40);
  return r.ok ? {ok: true, cuts: plan.cuts, msg: `Done. You got ${o.get.map(assetName).join(', ')}.`} : {ok: false, msg: r.issues[0] || 'It no longer works under the cap.'};
}
// Teams that would trade for one of your players, best offer first
function shopPlayer(pid, kind, pos) {
  const p = G.players[pid]; if (!p) return [];
  const want = assetValue(pid), out = [];
  // ask the teams that need him most first; a team with a mild need still picks up the phone
  const teams = teamList().filter(x => x !== G.user).map(t => ({t, nb: needBoost(t, p)})).filter(x => x.nb >= .95).sort((a, b) => b.nb - a.nb);
  for (const {t} of teams) {
    let pkg = buildPackage(t, pid, false, kind, pos) || buildPackage(t, pid, true, kind, pos);
    // role players move for a single pick, often a late one: the most common trade in the league
    if (!pkg && kind !== 'players') {
      const pk = G.picks.filter(k => k.owner === t).map(k => ({id: k.id, v: assetValue(k.id)})).filter(x => x.v >= want * .6 && x.v <= want * 1.5).sort((a, b) => a.v - b.v)[0];
      if (pk) { const ev = evalTrade(t, [pid], [pk.id]); if (!ev.issues.length && !ev.badLook && ev.ratio >= .9) pkg = [pk.id]; }
    }
    if (pkg) out.push({partner: t, give: [pid], get: pkg, ev: evalTrade(t, [pid], pkg)});
    if (out.length >= 8) break;
  }
  return out.sort((a, b) => b.ev.fair - a.ev.fair).slice(0, 5);
}
// Draft day: teams behind you offer to move up into your pick
function draftOffers() {
  const D = G.draft; if (!D) return [];
  const slot = D.order[D.at];
  if (!slot || slot.owner !== G.user || !slot.pickId) return [];
  const mine = pickById(slot.pickId); if (!mine) return [];
  const want = pickPts(slot.no) * 1.05;
  const out = [];
  for (const s of D.order.slice(D.at + 2, D.at + 20)) {
    if (out.length >= 3) break;
    if (s.owner === G.user || !s.pickId || out.some(o => o.from === s.owner)) continue;
    const theirs = pickById(s.pickId); if (!theirs) continue;
    const pkg = [theirs.id]; let sum = pickPts(s.no);
    const extras = G.picks.filter(k => k.owner === s.owner && k.id !== theirs.id && !(k.yr === G.season && D.order.findIndex(o => o.pickId === k.id) < D.at)).map(k => ({id: k.id, v: k.yr === 2027 ? pickPts(D.order.find(o => o.pickId === k.id)?.no || 200) : pickValue(k)})).sort((a, b) => a.v - b.v);
    for (const e of extras) { if (sum >= want) break; if (sum + e.v >= want * .9) { pkg.push(e.id); sum += e.v; } }
    if (sum < want * .95) { const big = extras.filter(e => !pkg.includes(e.id)).pop(); if (big) { pkg.push(big.id); sum += big.v; } }
    if (sum >= want * .95 && pkg.length <= 3) out.push({id: 'd' + slot.no + s.owner, from: s.owner, kind: 'draft', give: [mine.id], get: pkg, msg: `The ${G.teams[s.owner].nick} want to move up from #${s.no} to #${slot.no}.`});
  }
  return out;
}

// ---------- draft-day trades, pick for pick ----------
// Priced on the draft chart like real draft-day deals: moving up costs your later pick plus a little more.
// Picks already used this draft are gone; picks in later years count at their projected spot.
function draftSlotOf(id) { const D = G.draft; if (!D) return null; const i = D.order.findIndex(o => o.pickId === id); return i >= D.at ? D.order[i] : null; }
function livePick(id) { const k = pickById(id); if (!k) return false; if (!G.draft || k.yr !== G.season) return true; return !!draftSlotOf(id); }
function chartValue(id) { const sl = draftSlotOf(id); if (sl) return pickPts(sl.no); const k = pickById(id); return k ? pickValue(k) : 0; }
function pickTag(id) { const sl = draftSlotOf(id); return sl ? `#${sl.no} (round ${sl.rd})` : assetName(id); }
// What it takes to move up to one of their picks, from your picks only
function moveUpPrice(pickId) {
  const target = pickById(pickId); if (!target || target.owner === G.user || !livePick(pickId)) return null;
  const want = chartValue(pickId) * 1.08 + .4;
  const mine = G.picks.filter(k => k.owner === G.user && livePick(k.id)).map(k => ({id: k.id, v: chartValue(k.id)}));
  // start from your best pick that comes after theirs, then add the smallest picks that close the gap
  const tSlot = draftSlotOf(pickId), after = mine.filter(x => { const sl = draftSlotOf(x.id); return !tSlot || !sl || sl.no > tSlot.no; }).sort((a, b) => b.v - a.v);
  if (!after.length) return {give: null, want, have: 0};
  const pkg = [after[0]]; let sum = after[0].v;
  // never a pick that comes before theirs: that would be moving down, not up
  const rest = after.filter(x => x.id !== after[0].id).sort((a, b) => a.v - b.v);
  while (sum < want && pkg.length < 4) {
    const fit = rest.find(x => !pkg.includes(x) && sum + x.v >= want) || rest.filter(x => !pkg.includes(x)).pop();
    if (!fit) break; pkg.push(fit); sum += fit.v;
  }
  const total = after.reduce((a, x) => a + x.v, 0);
  return sum >= want ? {give: pkg.map(x => x.id), get: [pickId], partner: target.owner, want, have: sum} : {give: null, want, have: Math.min(sum, total)};
}
// Teams behind you that would move up into one of your picks, each paying with their own picks
function moveDownOffers(pickId) {
  const mine = pickById(pickId); if (!mine || mine.owner !== G.user || !livePick(pickId)) return [];
  const mySlot = draftSlotOf(pickId), want = chartValue(pickId) * 1.04;
  const out = [];
  for (const t of teamList().filter(x => x !== G.user)) {
    const theirs = G.picks.filter(k => k.owner === t && livePick(k.id)).map(k => ({id: k.id, v: chartValue(k.id), sl: draftSlotOf(k.id)}));
    const behind = theirs.filter(x => mySlot ? x.sl && x.sl.no > mySlot.no : x.v < chartValue(pickId)).sort((a, b) => b.v - a.v)[0];
    if (!behind) continue;
    const pkg = [behind]; let sum = behind.v;
    // no filler: every extra pick has to be worth something on its own
    const extras = theirs.filter(x => x !== behind && x.v >= 1.5).sort((a, b) => a.v - b.v);
    for (const e of extras) { if (sum >= want * .97 || pkg.length >= 3) break; if (sum + e.v >= want * .97 || e === extras[extras.length - 1]) { pkg.push(e); sum += e.v; } }
    if (sum >= want * .95 && sum <= want * 1.35) out.push({from: t, give: [pickId], get: pkg.map(x => x.id), gain: sum / chartValue(pickId), first: behind.sl ? behind.sl.no : null});
  }
  return out.sort((a, b) => (a.first || 999) - (b.first || 999)).slice(0, 5);
}
// Make a draft-chart deal; the price already has their premium built in
function draftDeal(partner, give, get) { return doTrade(partner, give, get, 'offer'); }

// ---------- season sim ----------
function seasonGames(season) {
  if (season === 2026) return G.games;
  // 2027: same opponents, home and away flipped
  if (season === 2027) return G.games.map(([w, a, h]) => [w, h, a]);
  // later seasons: home and away alternate each year and the weeks are reshuffled, so no two years look alike
  G.sched = G.sched || {};
  if (!G.sched[season]) {
    const flip = (season - 2026) % 2 === 1, rng = makeRng(hashStr('sched' + season + G.user));
    const weeks = [...new Set(G.games.map(g => g[0]))].sort((a, b) => a - b), perm = weeks.slice();
    for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const to = {}; weeks.forEach((w, i) => { to[w] = perm[i]; });
    G.sched[season] = G.games.map(([w, a, h]) => [to[w], flip ? h : a, flip ? a : h]).sort((x, y) => x[0] - y[0]);
  }
  return G.sched[season];
}
function record(t, season) {
  const r = {w: 0, l: 0, pf: 0, pa: 0, dw: 0, dl: 0, cw: 0, cl: 0};
  for (const g of G.results[season] || []) {
    if (g.po) continue;
    const isH = g.h === t, isA = g.a === t;
    if (!isH && !isA) continue;
    const my = isH ? g.hs : g.as, op = isH ? g.as : g.hs, opp = isH ? g.a : g.h;
    const win = my > op;
    win ? r.w++ : r.l++;
    r.pf += my; r.pa += op;
    if (G.teams[opp].div === G.teams[t].div) win ? r.dw++ : r.dl++;
    if (G.teams[opp].conf === G.teams[t].conf) win ? r.cw++ : r.cl++;
  }
  return r;
}
function winPct(t) { const r = record(t, G.season); return (r.w + r.l) ? r.w / (r.w + r.l) : .5; }

function addStat(pid, k, v) {
  const S = G.stats[G.season];
  S[pid] = S[pid] || {};
  S[pid][k] = (S[pid][k] || 0) + v;
}
// One team's box score, built play-count first so the numbers hang together like a real stat sheet:
// attempts and carries follow the game script, completion rate and yards per play follow the matchup,
// targets and carries are shared out by role and talent with game-to-game swings, and the defense gets
// tackles, sacks, interceptions and pass breakups. Season totals land in real NFL ranges.
const ov = p => p ? p.ovr + formOf(p) * 1.5 : 60;
const mean = L => { const v = L.filter(Boolean); return v.length ? v.reduce((a, p) => a + ov(p), 0) / v.length : 60; };
function share(n, W) { // hand out n events by weight
  const out = W.map(() => 0), tot = W.reduce((a, w) => a + w, 0);
  if (tot <= 0) return out;
  for (let i = 0; i < n; i++) { let x = rand() * tot, k = 0; for (; k < W.length - 1; k++) { x -= W[k]; if (x <= 0) break; } out[k]++; }
  return out;
}
// Box scores are kept as short text, one letter per stat: "00-0012345:a31c22y268t2" is 22 of 31 for 268 yards and 2 TD
const BOXK = {att: 'a', cmp: 'c', py: 'y', ptd: 't', int: 'i', sacked: 's', car: 'r', ry: 'R', rtd: 'T', tgt: 'g', rec: 'e', recy: 'Y', rectd: 'D', sk: 'k', dint: 'n', pd: 'p', tkl: 'l', fg: 'f', fga: 'F', xp: 'x', punts: 'u'};
const BOXR = Object.fromEntries(Object.entries(BOXK).map(([k, v]) => [v, k]));
function unpackBox(str) {
  if (!str) return [];
  return str.split(';').map(r => {
    const c = r.lastIndexOf(':'), raw = r.slice(0, c), id = /^\d+$/.test(raw) ? '00-00' + raw : raw, st = {}, re = /([a-zA-Z])(\d+)/g; let x;
    while ((x = re.exec(r.slice(c + 1)))) st[BOXR[x[1]]] = +x[2];
    return {id, st};
  });
}
function genBox(t, opp, pts, tr, otr, oppPts) {
  const d = tr.d, od = otr.d, L = {};
  const put = (p, k, v) => { if (!p || !v) return; (L[p.id] = L[p.id] || {})[k] = ((L[p.id] || {})[k] || 0) + v; };
  const qb = d.QB[0], rbs = d.RB.slice(0, 2), wrs = d.WR.slice(0, 4), tes = d.TE.slice(0, 2), k = d.K[0], pn = d.P && d.P[0];
  const ol = mean([...d.OT.slice(0, 2), ...d.IOL.slice(0, 3)]), rush = mean([...od.EDGE.slice(0, 2), ...od.DT.slice(0, 2)]);
  const cov = mean([...od.CB.slice(0, 3), ...od.S.slice(0, 2)]), runD = mean([...od.DT.slice(0, 2), ...od.LB.slice(0, 2)]);
  const recQ = mean([...wrs.slice(0, 3), tes[0]]), q = ov(qb), diff = pts - (oppPts == null ? 22 : oppPts);
  // game script: teams that trail throw, teams that lead run
  const att = clamp(Math.round(33 - diff * .28 + randn() * 4.5), 18, 58);
  const car = clamp(Math.round(25 + diff * .3 + randn() * 3.5), 12, 42);
  const sk = poisson(Math.max(.4, att * (.072 + (rush - ol) * .0022)));
  const pct = clamp(.622 + (q - 75) * .0042 + (recQ - cov) * .0018 + randn() * .065, .4, .86);
  const cmp = Math.round(att * pct);
  const ypc = clamp(10.05 + (q - 75) * .045 + (recQ - cov) * .035 + (pts - 22) * .07 + randn() * 1.6, 5.5, 17);
  const py = Math.round(cmp * ypc);
  const ints = poisson(Math.max(.15, att * (.022 - (q - 75) * .0005 + (cov - 75) * .00025)));
  const ypcR = clamp(4.3 + (ov(rbs[0]) - 75) * .018 + (ol - runD) * .028 + randn() * .85, 1.8, 8);
  // scoring: field goals first, then touchdowns split 60/40 pass and run
  const fg = clamp(Math.round(pts / 9 + randn() * .5), 0, Math.floor(pts / 3));
  let tds = Math.max(0, Math.round((pts - fg * 3) / 7)), ptd = 0, rtd = 0;
  for (let i = 0; i < tds; i++) rand() < .6 ? ptd++ : rtd++;
  // the quarterback
  if (qb) { put(qb, 'att', att); put(qb, 'cmp', cmp); put(qb, 'py', py); put(qb, 'ptd', ptd); put(qb, 'int', ints); put(qb, 'sacked', sk); }
  // carries: the starter's share grows with the gap over his backup; the quarterback scrambles a few times
  const qcar = qb ? poisson(2.6 + Math.max(0, diff) * .05) : 0;
  const rcar = Math.max(0, car - qcar);
  const s1 = rbs[1] ? clamp(.5 + (ov(rbs[0]) - ov(rbs[1])) * .01 + randn() * .06, .36, .78) : 1;
  const c1 = Math.round(rcar * s1), c2 = rcar - c1;
  const ry1 = Math.round(c1 * ypcR * (.8 + rand() * .4)), ry2 = Math.round(c2 * ypcR * (.75 + rand() * .4)), qry = Math.round(qcar * (4.4 + randn() * 2));
  put(rbs[0], 'car', c1); put(rbs[0], 'ry', ry1); put(rbs[1], 'car', c2); put(rbs[1], 'ry', ry2);
  if (qb) { put(qb, 'car', qcar); put(qb, 'ry', qry); }
  const rtdTo = share(rtd, [rbs[0] ? .62 * c1 / Math.max(1, rcar) * 1.3 : 0, rbs[1] ? .3 * c2 / Math.max(1, rcar) * 1.3 : 0, qb ? .14 : 0]);
  put(rbs[0], 'rtd', rtdTo[0]); put(rbs[1], 'rtd', rtdTo[1]); put(qb, 'rtd', rtdTo[2]);
  // targets: role weight, bent toward the better players, with week-to-week swings
  const R = [[wrs[0], .22, .64, 13], [wrs[1], .17, .63, 12.5], [wrs[2], .12, .62, 12], [wrs[3], .05, .6, 11.5], [tes[0], .15, .7, 10.2], [tes[1], .05, .68, 9.5], [rbs[0], .13, .78, 7.4], [rbs[1], .06, .77, 7]].filter(x => x[0]);
  const tw = R.map(([p, w]) => w * Math.pow(ov(p) / 75, 1.25) * (.55 + rand() * .9));
  const tg = share(att, tw);
  const cw = R.map(([, , c], i) => tg[i] * c);
  const rec = share(cmp, cw).map((c, i) => Math.min(c, tg[i]));
  const raw = R.map(([p, , , y], i) => rec[i] * y * Math.pow(ov(p) / 75, .35) * (.6 + rand() * .8));
  const rsum = raw.reduce((a, v) => a + v, 0) || 1;
  R.forEach(([p], i) => { put(p, 'tgt', tg[i]); put(p, 'rec', rec[i]); put(p, 'recy', Math.round(py * raw[i] / rsum)); });
  const tdTo = share(ptd, R.map(([p], i) => raw[i] * (p.pos === 'TE' ? 1.25 : 1) + .01));
  R.forEach(([p], i) => put(p, 'rectd', tdTo[i]));
  // the other defense: sacks to the pass rushers, picks and breakups to the secondary, tackles to everyone
  const rushers = [[od.EDGE[0], .28], [od.EDGE[1], .23], [od.DT[0], .16], [od.DT[1], .1], [od.LB[0], .12], [od.LB[1], .06], [od.S[0], .05]].filter(x => x[0]);
  const skTo = share(sk, rushers.map(([p, w]) => w * Math.pow(ov(p) / 75, 1.5)));
  rushers.forEach(([p], i) => put(p, 'sk', skTo[i]));
  const dbs = [[od.CB[0], .27], [od.CB[1], .23], [od.S[0], .17], [od.S[1], .14], [od.CB[2], .1], [od.LB[0], .06], [od.LB[1], .03]].filter(x => x[0]);
  const dbw = dbs.map(([p, w]) => w * Math.pow(ov(p) / 75, 3));
  share(ints, dbw).forEach((n, i) => put(dbs[i][0], 'dint', n));
  share(Math.round((att - cmp) * .36), dbw).forEach((n, i) => put(dbs[i][0], 'pd', n));
  const tk = [[od.LB[0], .12], [od.LB[1], .1], [od.S[0], .095], [od.S[1], .085], [od.CB[0], .07], [od.CB[1], .065], [od.CB[2], .045], [od.EDGE[0], .05], [od.EDGE[1], .045], [od.DT[0], .045], [od.DT[1], .04], [od.LB[2], .03]].filter(x => x[0]);
  share(Math.round((car + cmp + sk) * 1.1 + randn() * 3), tk.map(([p, w]) => w * (.8 + rand() * .4))).forEach((n, i) => put(tk[i][0], 'tkl', n));
  // kicking
  const fga = fg + poisson(.28);
  if (k) { put(k, 'fg', fg); put(k, 'fga', fga); put(k, 'xp', tds); }
  if (pn) put(pn, 'punts', clamp(poisson(4.6 - pts / 11), 0, 10));
  // season totals, games played, and the compact box kept on the game
  for (const pos of POS_ORDER) for (const p of d[pos].slice(0, STARTERS[pos])) addStat(p.id, 'gp', 1);
  const starters = new Set(POS_ORDER.flatMap(pos => d[pos].slice(0, STARTERS[pos]).map(p => p.id)));
  const box = [];
  for (const id in L) {
    if (!starters.has(id)) addStat(id, 'gp', 1);
    let row = (id.startsWith('00-00') ? id.slice(5) : id) + ':';
    for (const kk in L[id]) { addStat(id, kk, L[id][kk]); row += BOXK[kk] + L[id][kk]; }
    box.push(row);
  }
  const ry = ry1 + ry2 + qry;
  return {py, ptd, rtd, ints, sk, ry, att, cmp, car, box: box.join(';')};
}
function simGame(a, h, opts = {}) {
  const ta = teamRating(a), th = teamRating(h);
  const hfa = opts.neutral ? 0 : SIM.hfa, T = SIM.talent, A = ta.x || ta, H = th.x || th;
  const ce = t => t === G.user ? chemEdge() : 0;
  const um = (o, d) => { const U = k => unitRatingC(o, k), V = k => unitRatingC(d, k); return ((U('pass') - V('pd')) * .6 + (U('run') - V('rd')) * .4) * .18; };
  const ra = ((A.off - H.def) * .62 + (A.ovr - H.ovr) * .12) * T + ce(a) + um(a, h), rh = ((H.off - A.def) * .62 + (H.ovr - A.ovr) * .12) * T + ce(h) + um(h, a);
  // Any given Sunday: the edge from talent flattens out, so even a juggernaut loses now and then.
  const edge = softCap(rh - ra), mid = (ra + rh) / 2;
  const ea = 22.5 + mid - edge / 2 - hfa / 2, eh = 22.5 + mid + edge / 2 + hfa / 2;
  const noise = randn() * SIM.sharedNoise;
  let as = Math.round(ea + randn() * SIM.teamNoise - noise), hs = Math.round(eh + randn() * SIM.teamNoise + noise);
  as = clamp(as, 0, 62); hs = clamp(hs, 0, 62);
  const snap = x => { const ok = [0, 3, 6, 7, 9, 10, 13, 14, 16, 17, 20, 21, 23, 24, 26, 27, 28, 30, 31, 33, 34, 35, 37, 38, 41, 42, 44, 45, 48, 49, 51, 52, 55, 56, 59]; let b = ok[0]; for (const v of ok) if (Math.abs(v - x) < Math.abs(b - x)) b = v; return b; };
  as = snap(as); hs = snap(hs);
  let ot = false;
  if (as === hs) { ot = true; const pa = 1 / (1 + Math.exp(-(ta.ovr - th.ovr - hfa) / 6)); rand() < pa ? as += 3 : hs += 3; }
  const ba = genBox(a, h, as, ta, th, hs), bh = genBox(h, a, hs, th, ta, as);
  const hurt = [...injuries(a, ta), ...injuries(h, th)];
  return {a, h, as, hs, ot, ba, bh, hurt};
}
// About one starter in a hundred gets hurt each game: most miss a few weeks, some the season.
// Injuries: none while the 2026 first half plays out on autopilot, rare after that, rarer still for quarterbacks.
// Every injury to your team goes in G.injLog so the game can tell you the moment you get control back.
function injuries(t, tr) {
  const out = [];
  if (G.season === 2026 && (G.phase === 'preseason' || (G.phase === 'season' && G.week < DEADLINE_WEEK))) return out;
  for (const pos of POS_ORDER) for (const p of tr.d[pos].slice(0, STARTERS[pos])) {
    if (pos === 'K' || pos === 'P') continue;
    if (rand() > .0045 * (pos === 'QB' ? .5 : 1)) continue;
    const r = rand(), wk = r < .65 ? rint(1, 3) : r < .94 ? rint(4, 7) : 99;
    p.inj = true; p.injW = wk;
    out.push(p.id);
    if (t === G.user) {
      (G.injLog = G.injLog || []).push({id: p.id, wk, season: G.season, week: G.week + 1});
      G.news.unshift(`${p.n} (${p.pos}) is hurt: ${wk === 99 ? 'out for the season' : `out about ${wk} week${wk > 1 ? 's' : ''}`}.`);
    }
  }
  return out;
}
const simWeek = w => cached(simWeekRaw)(w);
function simWeekRaw(w) {
  const out = [];
  for (const [wk, a, h] of seasonGames(G.season)) {
    if (wk !== w) continue;
    const g = simGame(a, h);
    g.wk = w;
    G.results[G.season].push(g);
    chemGame(g);
    out.push(g);
  }
  for (const p of Object.values(G.players)) if (p.injW !== undefined && p.injW !== 99) { p.injW--; if (p.injW <= 0) { p.inj = false; delete p.injW; delete p.injPre; } }
  G.week = w;
  return out;
}
function simTo(week) { while (G.week < week) simWeek(G.week + 1); }
const DEADLINE_WEEK = 9;

// ---------- standings / playoffs ----------
function sortTeams(ts) {
  return ts.slice().sort((x, y) => {
    const a = record(x, G.season), b = record(y, G.season);
    const pa = a.w / Math.max(1, a.w + a.l), pb = b.w / Math.max(1, b.w + b.l);
    if (pb !== pa) return pb - pa;
    const da = a.dw / Math.max(1, a.dw + a.dl), db = b.dw / Math.max(1, b.dw + b.dl);
    if (G.teams[x].div === G.teams[y].div && db !== da) return db - da;
    const ca = a.cw / Math.max(1, a.cw + a.cl), cb = b.cw / Math.max(1, b.cw + b.cl);
    if (cb !== ca) return cb - ca;
    return (b.pf - b.pa) - (a.pf - a.pa);
  });
}
function divisions() {
  const d = {};
  for (const t of teamList()) { const k = G.teams[t].div; (d[k] = d[k] || []).push(t); }
  for (const k in d) d[k] = sortTeams(d[k]);
  return d;
}
function seeds(conf) {
  const divs = divisions();
  const winners = sortTeams(Object.keys(divs).filter(k => k.startsWith(conf)).map(k => divs[k][0]));
  const rest = sortTeams(teamList().filter(t => G.teams[t].conf === conf && !winners.includes(t))).slice(0, 4);
  return [...winners, ...rest]; // 8 seeds, no byes (21-0 rules)
}
function startPlayoffs() {
  const P = {round: 0, rounds: [], seeds: {AFC: seeds('AFC'), NFC: seeds('NFC')}, alive: {}, champ: null, elim: {}};
  for (const c of ['AFC', 'NFC']) P.alive[c] = P.seeds[c].slice();
  G.playoffs[G.season] = P;
  return P;
}
const ROUND_NAMES = ['Wild Card', 'Divisional', 'Conference Championship', 'Super Bowl'];
function simPlayoffRound() {
  const P = G.playoffs[G.season];
  if (P.champ) return null;
  const games = [];
  if (P.round < 3) {
    for (const c of ['AFC', 'NFC']) {
      const al = P.alive[c].slice().sort((x, y) => P.seeds[c].indexOf(x) - P.seeds[c].indexOf(y));
      const next = [];
      for (let i = 0; i < al.length / 2; i++) {
        const hi = al[i], lo = al[al.length - 1 - i];
        const g = simGame(lo, hi); g.po = ROUND_NAMES[P.round]; g.conf = c;
        G.results[G.season].push(g); games.push(g);
        const win = g.hs > g.as ? hi : lo, lose = win === hi ? lo : hi;
        P.elim[lose] = P.round; next.push(win);
      }
      P.alive[c] = next;
    }
  } else {
    const a = P.alive.AFC[0], n = P.alive.NFC[0];
    const g = simGame(a, n, {neutral: true}); g.po = 'Super Bowl';
    G.results[G.season].push(g); games.push(g);
    P.champ = g.hs > g.as ? n : a;
    P.elim[P.champ === a ? n : a] = 3;
    P.elim[P.champ] = 4;
  }
  P.rounds.push(games);
  P.round++;
  return games;
}
function inPlayoffs(t) { const P = G.playoffs[G.season]; return P && (P.seeds.AFC.includes(t) || P.seeds.NFC.includes(t)); }
function userFinish(season) {
  const P = G.playoffs[season], t = G.user;
  const r = record(t, season);
  const poW = (G.results[season] || []).filter(g => g.po && (g.a === t || g.h === t) && ((g.h === t) === (g.hs > g.as))).length;
  const poL = (G.results[season] || []).filter(g => g.po && (g.a === t || g.h === t) && ((g.h === t) !== (g.hs > g.as))).length;
  let label = 'Missed playoffs';
  if (P && (P.seeds.AFC.includes(t) || P.seeds.NFC.includes(t))) {
    if (P.champ === t) label = 'Won the Super Bowl';
    else if (P.elim[t] !== undefined) label = 'Lost in the ' + ROUND_NAMES[P.elim[t]];
    else label = 'In the playoffs';
  }
  return {w: r.w + poW, l: r.l + poL, rw: r.w, rl: r.l, label, perfect: r.l === 0 && poL === 0 && P && P.champ === t};
}
function draftOrder(season) {
  season = season || G.season;
  const P = G.playoffs[season];
  const ts = teamList();
  const key = t => {
    const r = record(t, season), pct = r.w / Math.max(1, r.w + r.l);
    const po = P.elim[t] !== undefined ? P.elim[t] + 1 : 0;
    return po * 10 + pct + teamRating(t).ovr / 10000;
  };
  return ts.sort((a, b) => key(a) - key(b));
}

// ---------- offseason ----------
function beginOffseason() {
  const prev = G.season, next = prev + 1;
  G.history[prev] = G.history[prev] || {finish: userFinish(prev), champ: G.playoffs[prev].champ, ovr: teamRating(G.user).ovr};
  G.draftOrder = draftOrder(prev);
  G.phase = 'offseason'; G.step = 'progress'; G.season = next; G.week = 0; G.draftDone = false; G.draft = null;
  if (G.chem != null) G.chem = Math.round(G.chem + (60 - G.chem) / 3);
  for (const p of Object.values(G.players)) if (p.opt && p.opt.year === next) { p.cap = p.opt.cap; delete p.opt; }
  aiOptions();
  // the cap: real figures through 2027, then about 7% a year, the league's recent pace
  G.cap[next] = G.cap[next] || Math.round(G.cap[prev] * 1.07 * 10) / 10;
  G.results[next] = G.results[next] || []; G.stats[next] = G.stats[next] || {};
  // last season's box scores: keep your own games, drop the rest so the save stays small
  for (const g of G.results[prev] || []) if (g.a !== G.user && g.h !== G.user) { if (g.ba) delete g.ba.box; if (g.bh) delete g.bh.box; }
  // picks: every team always holds its picks for the next two drafts
  for (const yr of [next, next + 1]) for (let rd = 1; rd <= ROUNDS; rd++) for (const t of teamList()) if (!G.picks.some(k => k.yr === yr && k.rd === rd && k.orig === t)) G.picks.push({id: `${yr}-${rd}-${t}`, yr, rd, orig: t, owner: t});
  // contracts that step up after this season (extensions, back-loaded deals) now pay their real average
  for (const p of Object.values(G.players)) if (p.apy != null) { if (p.end >= next) p.cap = p.apy; delete p.apy; }
  // progression: age, hidden potential, how the season went, and the player's track record.
  // The league as a whole does not get better every year: young players rise, veterans fall, and the average holds.
  const prog = [];
  const progParts = p => {
    const a = ageAdj(p), f = formOf(p);
    const st = (G.stats[prev] || {})[p.id], gp = st ? st.gp || 0 : 0;
    const played = Math.min(1, gp / 8);
    const age = a <= 22 ? 2 : a <= 24 ? 1.5 : a <= 26 ? .5 : a <= 28 ? 0 : a <= 30 ? -1 : a <= 32 ? -2.5 : -4.5 - Math.max(0, a - 34);
    const parts = {age, dev: 0, form: f * 1.0 * played, track: 0};
    if (p.pot > p.ovr) parts.dev = (p.pot - p.ovr) * (a <= 25 ? .2 : .06);
    const prior = p.prior || p.ovr;
    if (prior > p.ovr && f > 0) parts.track = (prior - p.ovr) * .5 * played;        // proved himself again
    else if (prior < p.ovr && f < -1) parts.track = -(p.ovr - prior) * .4 * played; // fell back to his track record
    let d = parts.age + parts.dev + parts.form + parts.track + (p.rook ? .5 : 0);
    if (d > 0 && p.ovr >= 86) d *= p.ovr >= 90 ? .35 : .6;                            // the top is hard to reach and harder to climb
    return {parts, d, prior};
  };
  const rostered = Object.values(G.players).filter(p => G.teams[p.tm]);
  const drift = rostered.reduce((s, p) => s + progParts(p).d, 0) / Math.max(1, rostered.length);
  for (const p of Object.values(G.players)) {
    const {parts, prior} = progParts(p);
    let d = progParts(p).d - drift + randn() * 1.2;
    d = clamp(Math.round(d), -10, 8);
    const why = d >= 4 && parts.track >= 2 ? 'Proved himself' : d >= 4 && parts.form >= 2 ? 'Breakout season' : d >= 3 && parts.dev >= 1.5 ? 'Development'
      : d <= -4 && parts.form <= -2 ? 'Down year' : d <= -2 && parts.age <= -2.5 ? 'Age decline' : d <= -3 && parts.track < 0 ? 'Regressed' : d > 0 ? 'Improved' : d < 0 ? 'Slipped' : 'Steady';
    const old = p.ovr;
    p.ovr = clamp(p.ovr + d, 40, 99);
    p.prior = Math.round(prior * .6 + p.ovr * .4);
    if (p.pot < p.ovr) p.pot = p.ovr;
    p.age = Math.round((p.age + 1) * 10) / 10;
    p.inj = false; delete p.injW; delete p.injPre; p.rook = false;
    (p.hist = p.hist || [[2026, old, 'Week 1']]).push([next, p.ovr, why]);
    if (p.tm === G.user) prog.push({id: p.id, n: p.n, pos: p.pos, old, now: p.ovr, why});
    // retirement: rare before 30, likely by 36; fringe players go sooner, stars hang on; nobody signing you is a hint
    const ra = p.pos === 'K' || p.pos === 'P' ? p.age - 6 : ageAdj(p);
    let rp = ra >= 36 ? .65 : ra >= 34 ? .35 : ra >= 32 ? .15 : ra >= 30 ? .05 : 0;
    if (p.ovr < 70) rp *= 1.6; else if (p.ovr >= 85) rp *= .5;
    if (p.tm === 'FA' && ra >= 30) rp = Math.max(rp, .5);
    if (rand() < Math.min(.9, rp)) p.retired = true;
  }
  for (const p of Object.values(G.players)) if (p.retired) { if (p.tm === G.user) prog.push({id: p.id, n: p.n, pos: p.pos, old: p.ovr, now: 0, ret: true}); delete G.players[p.id]; }
  G.prog = prog.sort((a, b) => (b.now - b.old) - (a.now - a.old));
  // expiring
  const exp = Object.values(G.players).filter(p => p.end <= prev && G.teams[p.tm]);
  G.resign = {};
  for (const p of exp) {
    if (p.tm === G.user) { G.resign[p.id] = {ask: resignPrice(p), yrs: yearsFor(p), done: null}; continue; }
    const keep = (p.ovr >= 82 ? .8 : p.ovr >= 72 ? .55 : p.ovr >= 62 ? .35 : .15) * (ageAdj(p) >= 32 ? .6 : 1);
    if (rand() < keep) { p.cap = askFor(p); p.end = prev + yearsFor(p); }
    else { p.fromTeam = p.tm; p.tm = 'FA'; p.cap = 0; }
  }
  G.news.unshift(`${next} offseason is open. Contracts that ended after ${prev} are up for renewal.`);
}
// Every player has a preferred length. Young players charge more to give up their next payday;
// veterans charge more for a short deal and take less per year for security.
function lenFactor(p, yrs) {
  const pref = yearsFor(p), a = ageAdj(p), dl = yrs - pref;
  if (!dl) return 1;
  if (a <= 26) return dl > 0 ? 1 + .05 * dl : 1 + .02 * -dl;
  if (a >= 30) return dl < 0 ? 1 + .06 * -dl : 1 - .025 * dl;
  return 1 + .035 * Math.abs(dl);
}
function resignPrice(p, yrs) { return Math.round(askFor(p) * lenFactor(p, yrs || yearsFor(p)) * .97 * interest(p, G.user).mult * 10) / 10; }
// A free agent's current asking price; players cut late in the offseason get one on the spot.
function askOf(p) { if (!(p.ask > 0)) p.ask = askFor(p); return p.ask; }
function askFor(p) { const m = market(p); return Math.round(m * (1 + (p.ovr >= 80 ? .08 : 0)) * 10) / 10; }
function yearsFor(p) { const a = ageAdj(p); return a <= 28 ? 4 : a <= 31 ? 3 : a <= 33 ? 2 : 1; }
function resignPlayer(id, yes, yrs) {
  const p = G.players[id], r = G.resign[id];
  if (!p || !r) return;
  if (yrs) { r.yrs = yrs; r.ask = resignPrice(p, yrs); }
  if (yes) { p.cap = r.ask; p.end = G.season - 1 + r.yrs; r.done = 'signed'; if (p.ovr >= 78) chemShift(1, `Re-signed ${p.n}`); }
  else { p.fromTeam = p.tm; p.tm = 'FA'; p.cap = 0; r.done = 'released'; }
}
function finishResign() {
  for (const id in G.resign) if (!G.resign[id].done) resignPlayer(id, false);
  G.step = 'fa'; startFA();
}
function cutPlayer(id) {
  const p = G.players[id];
  if (!p || p.tm !== G.user) return;
  const left = p.end - G.season + 1;
  const dead = left <= 0 ? 0 : Math.round(p.cap * (left >= 2 ? .5 : .25) * 10) / 10;
  G.dead[G.user] = (G.dead[G.user] || 0) + (G.season > 2026 ? dead : 0);
  chemShift(chemCut(p), `Released ${p.n}`);
  p.fromTeam = p.tm; p.tm = 'FA'; p.cap = 0; p.end = G.season - 1;
  G.news.unshift(`Released ${p.n}. Dead money: $${dead.toFixed(1)}M.`);
  return dead;
}

// ---------- player interest ----------
// Every player weighs money, winning, his role and loyalty differently. Age sets the base; personality nudges it.
const PERSONAS = ['Follows the money', 'Ring chaser', 'Wants the ball', 'Hometown guy'];
function priorities(p) {
  const h = hashStr('pri:' + p.id), a = p.age, kind = h % 4;
  const w = {money: .45, win: a >= 30 ? .32 : a >= 27 ? .22 : .12, role: a <= 27 ? .3 : .14, loyal: .08};
  if (kind === 0) w.money += .2; if (kind === 1) w.win += .2; if (kind === 2) w.role += .2; if (kind === 3) w.loyal += .2;
  const t = w.money + w.win + w.role + w.loyal;
  for (const k in w) w[k] = w[k] / t;
  return {w, persona: PERSONAS[kind]};
}
// How much a player wants to play for team t, from 0 to 100, with the reasons
function interest(p, t) {
  const {w, persona} = priorities(p);
  const sit = situation(t);
  const win = sit.status === 'Contender' ? 1 : sit.status === 'Bubble' ? .65 : .25;
  const L = depth(t)[p.pos] || [], n = STARTERS[p.pos];
  const worst = L[n - 1] ? L[n - 1].ovr : 0, rank = L.filter(q => q.id !== p.id && q.ovr > p.ovr).length;
  const role = rank < n || p.ovr > worst ? 1 : rank < n + 1 ? .55 : .2;
  const home = p.fromTeam || (p.tm !== 'FA' ? p.tm : null);
  const loyal = home === t ? 1 : .35;
  const meet = t === G.user && G.fa && G.fa.met && G.fa.met[p.id] ? G.fa.met[p.id].boost / 100 : 0;
  const non = clamp((win * w.win + role * w.role + loyal * w.loyal) / (w.win + w.role + w.loyal) + meet, 0, 1);
  const parts = [
    {k: 'Winning', v: win, w: w.win, note: win >= 1 ? 'You are a contender' : win >= .6 ? 'You are on the bubble' : 'You are rebuilding'},
    {k: 'Role', v: role, w: w.role, note: role >= 1 ? 'He would start' : role >= .5 ? 'He would rotate in' : 'He would be a backup'},
    {k: 'Loyalty', v: loyal, w: w.loyal, note: home === t ? 'This is his team' : 'No ties to you'},
  ];
  if (meet) parts.push({k: 'Meeting', v: meet > 0 ? 1 : 0, w: 0, note: meet > 0 ? `Your pitch landed (+${Math.round(meet * 100)})` : `Your pitch missed (${Math.round(meet * 100)})`});
  let mult = 1.15 - .3 * non;
  if (w.win >= .3 && win < .3 && p.ovr >= 78) mult += .1; // ring chasers do not join rebuilds cheaply
  return {score: Math.round(non * 100), mult: Math.round(mult * 100) / 100, parts, persona, w};
}

// Free agency: 3 waves. User offers resolve instantly; AI signs between waves.
function startFA() {
  G.fa = {wave: 1, log: [], offers: {}, met: {}, meetings: 0, decisions: []};
  for (const p of Object.values(G.players)) if (p.tm === 'FA') { p.ask = askFor(p); p.want = 1 + (p.ovr >= 80 ? rand() * .18 : rand() * .08); }
}
function faPool() { return Object.values(G.players).filter(p => p.tm === 'FA').sort((a, b) => b.ovr - a.ovr); }
// The yearly salary this player takes from you right now, at his preferred length
function faPrice(p, yrs) {
  yrs = yrs || yearsFor(p);
  const wave = G.fa ? G.fa.wave : 1;
  const need = (p.want || 1) * (wave === 1 ? 1 : wave === 2 ? .96 : .9);
  return Math.ceil(p.ask * need * lenFactor(p, yrs) * interest(p, G.user).mult * 10) / 10;
}
// How many other teams have the cap room and the need to chase him
function faSuitors(p) { return teamList().filter(t => t !== G.user && capSpace(t) > p.ask + 4 && needBoost(t, p) > 1).length; }
function contenderBonus(t) { const o = teamRating(t).ovr; return clamp((o - 74) / 100, -.05, .08); }
function offerFA(id, apy, yrs) {
  const p = G.players[id];
  if (!p || p.tm !== 'FA') return {ok: false, msg: 'Already signed elsewhere.'};
  if (apy > capSpace(G.user) + .001) return {ok: false, msg: `You only have $${capSpace(G.user).toFixed(1)}M in cap space.`};
  if (roster(G.user).length >= 90) return {ok: false, msg: 'Your offseason roster is full (90). Release someone first.'};
  const price = faPrice(p, yrs);
  if (apy + .001 >= price) {
    p.tm = G.user; p.cap = Math.round(apy * 10) / 10; p.end = G.season - 1 + yrs; p.how = 'Free agent';
    (G.signings = G.signings || []).push({id, n: p.n, pos: p.pos, ovr: p.ovr, apy: p.cap, yrs, from: p.fromTeam || ''});
    G.fa.log.unshift(`${p.n} signed with you: ${yrs} yr, $${p.cap}M per year.`);
    return {ok: true, msg: `${p.n} signed: ${yrs} yr at $${p.cap}M per year.`};
  }
  return {ok: false, msg: `${p.n} turned it down. For ${yrs} years he wants $${price}M per year.`};
}
// ---------- negotiation ----------
// Each player has a hidden minimum below his asking price. Offers at or above it sign him. Lowballs cost patience;
// when patience runs out he walks for the rest of this window. While you haggle, a rival can sign him.
function negPrice(p, yrs, kind) { return kind === 're' ? resignPrice(p, yrs) : faPrice(p, yrs); }
function negStart(id, kind, yrs) {
  const p = G.players[id]; if (!p) return null;
  G.neg = G.neg || {};
  const key = kind + ':' + id;
  const n = G.neg[key];
  yrs = yrs || (n && n.yrs) || yearsFor(p);
  if (n && n.walked) return n;
  const ask = negPrice(p, yrs, kind);
  if (n && n.yrs === yrs) return n;
  const disc = n ? n.disc : .88 + rand() * .07;
  G.neg[key] = {id, kind, yrs, ask, floor: Math.round(ask * disc * 10) / 10, disc, patience: n ? n.patience : 3, log: n ? n.log : [], walked: false};
  return G.neg[key];
}
function negOffer(id, kind, apy, yrs) {
  const p = G.players[id];
  const n = negStart(id, kind, yrs);
  if (!p || !n) return {ok: false, msg: 'He is no longer available.'};
  if (n.walked) return {ok: false, msg: `${p.n} is done talking to you.`};
  if (kind === 'fa' && p.tm !== 'FA') return {ok: false, msg: `${p.n} already signed with the ${G.teams[p.tm] ? G.teams[p.tm].nick : 'another team'}.`};
  if (apy > capSpace(G.user) + .001) return {ok: false, msg: `You only have $${capSpace(G.user).toFixed(1)}M in cap space.`};
  apy = Math.round(apy * 10) / 10;
  const it = interest(p, G.user);
  if (apy + .001 >= n.floor) {
    n.log.push({you: apy, him: 'Deal'});
    if (kind === 're') { resignPlayer(id, true, n.yrs); p.cap = apy; G.resign[id].ask = apy; }
    else {
      p.tm = G.user; p.cap = apy; p.end = G.season - 1 + n.yrs; p.how = 'Free agent';
      (G.signings = G.signings || []).push({id, n: p.n, pos: p.pos, ovr: p.ovr, apy, yrs: n.yrs, from: p.fromTeam || ''});
      G.fa.log.unshift(`${p.n} signed with you: ${n.yrs} yr, $${apy}M per year.`);
    }
    const saved = Math.round((n.ask - apy) * n.yrs * 10) / 10;
    return {ok: true, signed: true, msg: `${p.n} signed: ${n.yrs} yr at $${apy}M per year${saved > .05 ? `. You saved $${saved}M off his ask` : ''}.`};
  }
  const gap = (n.floor - apy) / n.floor;
  n.patience -= gap > .15 ? 2 : 1;
  if (n.patience <= 0) {
    n.walked = true; n.log.push({you: apy, him: 'Walked away'});
    if (kind === 're') { resignPlayer(id, false); return {ok: false, walked: true, msg: `${p.n} felt disrespected and will test free agency.`}; }
    return {ok: false, walked: true, msg: `${p.n} walked away from the table.`};
  }
  // a rival can swoop in while you haggle
  if (kind === 'fa') {
    const rivals = teamList().filter(t => t !== G.user && capSpace(t) > n.ask + 4 && needBoost(t, p) > 1 && interest(p, t).score >= it.score);
    if (rivals.length && rand() < .12 + .04 * Math.min(4, rivals.length)) {
      const t = rivals[rint(0, rivals.length - 1)];
      p.tm = t; p.cap = Math.round(n.ask * (.95 + rand() * .1) * 10) / 10; p.end = G.season - 1 + yearsFor(p);
      G.fa.log.unshift(`${p.n} (${p.pos} ${p.ovr}) signed with the ${G.teams[t].nick} while you negotiated.`);
      n.log.push({you: apy, him: `Signed with the ${G.teams[t].nick}`});
      return {ok: false, lost: true, msg: `Too slow. ${p.n} signed with the ${G.teams[t].nick}.`};
    }
  }
  const counter = Math.max(n.floor, Math.round((n.ask - (n.ask - apy) * .35) * 10) / 10);
  n.ask = counter;
  const top = it.parts.slice().sort((a, b) => b.w - a.w)[0];
  const line = gap > .15 ? 'That is not a serious offer.' : gap > .07 ? 'We are still apart.' : 'We are close.';
  const why = top.v >= .9 ? ` He likes that ${top.note.toLowerCase()}.` : top.v <= .3 ? ` ${top.note}, so it will cost you.` : '';
  n.log.push({you: apy, him: counter});
  return {ok: false, countered: true, msg: `${line} He will do $${counter}M per year.${why}`};
}
// Trades: when a deal falls short, the other team answers with what would get it done
function counterTrade(partner, give, get) {
  const ev = evalTrade(partner, give, get);
  if (ev.ok || ev.ratio < .55 || ev.fleece) return null;
  const out = [];
  const add = fillSide(partner, give, get, userPool('all', get));
  if (add && add.length > give.length && add.length - give.length <= 2) out.push({label: 'Add to your side', give: add, get: get.slice()});
  if (get.length > 1) {
    for (const id of get.slice().sort((a, b) => assetValue(a) - assetValue(b))) {
      const g2 = get.filter(x => x !== id);
      if (evalTrade(partner, give, g2).ok) { out.push({label: 'Take less back', give: give.slice(), get: g2}); break; }
    }
  }
  return out.length ? out : null;
}

function aiFAWave() {
  const pool = faPool();
  const ts = teamList().filter(t => t !== G.user).sort(() => rand() - .5);
  for (const t of ts) {
    const signs = G.fa.wave === 3 ? 4 : 2;
    let n = 0;
    for (const p of pool) {
      if (n >= signs) break;
      if (p.tm !== 'FA') continue;
      const space = capSpace(t);
      const price = Math.round(askOf(p) * (.92 + rand() * .2) * 10) / 10;
      if (price > space - 4) continue;
      if (needBoost(t, p) < 1 && G.fa.wave < 3) continue;
      if (rand() < .55) continue;
      if (interest(p, t).score < 30 && rand() < .6) continue;
      p.tm = t; p.cap = price; p.end = G.season - 1 + yearsFor(p);
      if (p.ovr >= 76) G.fa.log.unshift(`${p.n} (${p.pos} ${p.ovr}) signed with the ${G.teams[t].nick}: $${price}M per year.`);
      n++;
    }
  }
  G.fa.wave++;
  for (const p of faPool()) p.ask = Math.max(1.1, Math.round(askOf(p) * .88 * 10) / 10);
}
function finishFA() {
  for (const d of (G.fa.decisions || []).slice()) faDecide(d.id, false);
  while (G.fa.wave <= 3) faEndWave();
  G.step = 'draft'; startDraft();
}
// ---------- free agency: meetings, offers and waves ----------
const PITCHES = {win: ['Win now', 'win'], role: ['A starting role', 'role'], money: ['A big payday', 'money'], home: ['Come home', 'loyal']};
function faMeet(id, pitch) {
  const p = G.players[id], F = G.fa;
  if (!p || p.tm !== 'FA') return {ok: false, msg: 'He is no longer available.'};
  if (F.met[id]) return {ok: false, msg: `You already met with ${p.n} this wave.`};
  if (F.meetings >= 3) return {ok: false, msg: 'You have used all 3 meetings this wave.'};
  const {w} = priorities(p), key = PITCHES[pitch][1];
  const order = Object.keys(w).sort((a, b) => w[b] - w[a]);
  let boost = order[0] === key ? 10 : order[1] === key ? 4 : -3;
  let note = boost >= 10 ? 'That is exactly what he wanted to hear.' : boost > 0 ? 'He liked it, but it is not his top concern.' : 'That is not what he cares about.';
  const it = interest(p, G.user);
  if (key === 'win' && situation(G.user).status === 'Rebuilding') { boost = Math.min(boost, 2); note = 'He does not buy it. Your roster says rebuild.'; }
  if (key === 'role' && it.parts[1].v < .5) { boost = Math.min(boost, -2); note = 'He looked at your depth chart. He would not start.'; }
  if (key === 'loyal' && p.fromTeam !== G.user) { boost = Math.min(boost, -3); note = 'He has no ties to your team.'; }
  F.met[id] = {pitch, boost}; F.meetings++;
  return {ok: true, boost, msg: note};
}
// How good an offer looks to the player: money, length and how much he wants that team
function faUtility(p, t, apy, yrs) {
  const {w} = priorities(p);
  const len = 1 - .03 * Math.abs(yrs - yearsFor(p));
  return w.money * (apy / Math.max(.5, p.ask)) * len + (1 - w.money) * interest(p, t).score / 100 * 1.1;
}
function signFA(p, t, apy, yrs) {
  p.tm = t; p.cap = Math.round(apy * 10) / 10; p.end = G.season - 1 + yrs;
  if (t === G.user) {
    p.how = 'Free agent';
    (G.signings = G.signings || []).push({id: p.id, n: p.n, pos: p.pos, ovr: p.ovr, apy: p.cap, yrs, from: p.fromTeam || '', season: G.season});
    G.fa.log.unshift(`${p.n} signed with you: ${yrs} yr, $${p.cap}M per year.`);
  } else if (p.ovr >= 74) G.fa.log.unshift(`${p.n} (${p.pos} ${p.ovr}) signed with the ${G.teams[t].nick}: $${p.cap}M per year.`);
}
const pendingCap = () => Object.values(G.fa.offers || {}).reduce((a, o) => a + o.apy, 0);
// Make an offer. A player who really wants you signs on the spot; otherwise he waits for the end of the wave.
function faOffer(id, apy, yrs) {
  const p = G.players[id], F = G.fa;
  if (!p || p.tm !== 'FA') return {ok: false, msg: 'He is no longer available.'};
  apy = Math.round(apy * 10) / 10;
  const prev = F.offers[id] ? F.offers[id].apy : 0;
  if (apy - prev > capSpace(G.user) - pendingCap() + .001) return {ok: false, msg: `Your open offers already use your cap space. You have $${(capSpace(G.user) - pendingCap() + prev).toFixed(1)}M left to offer.`};
  if (roster(G.user).length >= 90) return {ok: false, msg: 'Your offseason roster is full (90). Release someone first.'};
  const price = faPrice(p, yrs), it = interest(p, G.user);
  if (apy < price * .85) return {ok: false, msg: `${p.n} will not consider that. He is looking for about $${price}M per year over ${yrs} years.`};
  if (apy + .001 >= price) { delete F.offers[id]; signFA(p, G.user, apy, yrs); return {ok: true, signed: true, msg: `${p.n} signed on the spot: ${yrs} yr at $${apy}M per year.`}; }
  F.offers[id] = {apy, yrs};
  return {ok: true, msg: `Offer in at ${Math.round(apy / price * 100)}% of his ask. ${p.n} will compare it with other teams when wave ${F.wave} ends. Pay $${price}M to sign him now.`};
}
function faCancel(id) { delete G.fa.offers[id]; }
// Free agency talks: every offer gets an answer right away. He signs, he names his number, or he says no.
// His floor sits a little under his ask, lower in later waves, higher when other teams want him.
// Three misses and he is done talking to you until the next wave.
function faFloor(p, yrs) {
  const F = G.fa, base = F.wave === 1 ? .88 : F.wave === 2 ? .85 : .8;
  return faPrice(p, yrs) * (base + Math.min(.04, faSuitors(p) * .008));
}
function faOdds(p, apy, yrs) {
  const price = faPrice(p, yrs), floor = faFloor(p, yrs);
  return apy + .001 >= floor ? (apy + .001 >= price ? 'Signs now' : 'Likely yes') : apy >= floor * .9 ? 'He may counter' : 'Long shot';
}
function faBid(id, apy, yrs) {
  const p = G.players[id], F = G.fa;
  F.tries = F.tries || {}; F.counter = F.counter || {}; F.walked = F.walked || {};
  if (!p || p.tm !== 'FA') return {ok: false, result: 'gone', msg: 'He already signed somewhere else.'};
  apy = Math.round(apy * 10) / 10; yrs = yrs || yearsFor(p);
  if (F.walked[id]) return {ok: false, result: 'walked', msg: `${p.n} is done talking until the next wave.`};
  if (apy > capSpace(G.user) + .001) return {ok: false, result: 'cap', msg: `That is more than your $${capSpace(G.user).toFixed(1)}M of cap space.`};
  if (roster(G.user).length >= 90) return {ok: false, result: 'full', msg: 'Your offseason roster is full (90). Release someone first.'};
  const price = faPrice(p, yrs), floor = faFloor(p, yrs);
  if (apy + .001 >= floor) { delete F.counter[id]; delete F.offers[id]; signFA(p, G.user, apy, yrs); return {ok: true, result: 'signed', apy, yrs, msg: `${p.n} signed: ${yrs} yr at $${apy}M per year.`}; }
  F.tries[id] = (F.tries[id] || 0) + 1;
  if (apy >= floor * .9) {
    const c = Math.ceil((floor + (price - floor) * .35) * 10) / 10;
    F.counter[id] = {apy: c, yrs};
    if (F.tries[id] >= 3) F.walked[id] = true;
    return {ok: true, result: 'counter', counter: c, yrs, msg: `Close. He will sign for $${c}M per year over ${yrs} years.`};
  }
  if (F.tries[id] >= 3) { F.walked[id] = true; return {ok: false, result: 'walked', msg: `${p.n} is insulted and stops taking your calls this wave.`}; }
  return {ok: false, result: 'no', msg: `Not close. He is looking for about $${price}M per year.`};
}
// End the wave: rival teams bid, players choose, and close calls come back to you to match.
function faEndWave() {
  const F = G.fa;
  if (F.wave > 3) return {you: [], lost: []};
  const res = {you: [], lost: [], notable: [], decisions: 0};
  const signedBy = {};
  const pool = faPool().slice(0, 160);
  for (const p of pool) {
    const bids = [];
    for (const t of teamList()) {
      if (t === G.user || (signedBy[t] || 0) >= (F.wave === 3 ? 4 : 2)) continue;
      if (needBoost(t, p) <= 1 && F.wave < 3) continue;
      const apy = Math.round(askOf(p) * (.94 + rand() * .16) * 10) / 10;
      if (capSpace(t) < apy + 3 || rand() < .5) continue;
      bids.push({t, apy, yrs: yearsFor(p), u: 0});
    }
    for (const b of bids) b.u = faUtility(p, b.t, b.apy, b.yrs);
    bids.sort((a, b) => b.u - a.u);
    const mine = F.offers[p.id];
    const uMine = mine ? faUtility(p, G.user, mine.apy, mine.yrs) : -1;
    const best = bids[0];
    if (mine && (!best || uMine >= best.u)) { signFA(p, G.user, mine.apy, mine.yrs); res.you.push({id: p.id, apy: mine.apy, yrs: mine.yrs}); continue; }
    if (mine && best && uMine >= best.u - .12) {
      // close call: the player gives you a chance to match
      const need = (best.u - (uMine - priorities(p).w.money * (mine.apy / p.ask) * (1 - .03 * Math.abs(mine.yrs - yearsFor(p))))) / (priorities(p).w.money * (1 - .03 * Math.abs(best.yrs - yearsFor(p))) / p.ask);
      F.decisions.push({id: p.id, t: best.t, apy: best.apy, yrs: best.yrs, mine, match: Math.ceil(Math.max(need, best.apy) * 10) / 10 + .1});
      res.decisions++;
      continue;
    }
    if (best && (mine || rand() < .85)) {
      signFA(p, best.t, best.apy, best.yrs); signedBy[best.t] = (signedBy[best.t] || 0) + 1;
      if (mine || F.met[p.id] || (F.tries && F.tries[p.id])) { res.lost.push({id: p.id, t: best.t, apy: best.apy, yrs: best.yrs, offered: !!mine}); if (mine) G.fa.log.unshift(`${p.n} chose the ${G.teams[best.t].nick} over you.`); }
      else if (p.ovr >= 80) res.notable.push({id: p.id, t: best.t, apy: best.apy, yrs: best.yrs});
    }
  }
  F.offers = {};
  if (!F.decisions.length) faNextWave();
  return res;
}
function faNextWave() {
  const F = G.fa;
  F.wave++; F.met = {}; F.meetings = 0; F.offers = {}; F.tries = {}; F.counter = {}; F.walked = {};
  for (const p of faPool()) p.ask = Math.max(1.1, Math.round(askOf(p) * .88 * 10) / 10);
}
// Match the rival offer (at the price that wins him) or let him go
function faDecide(id, match) {
  const F = G.fa, i = F.decisions.findIndex(d => d.id === id);
  if (i < 0) return {ok: false, msg: 'That decision is closed.'};
  const d = F.decisions[i], p = G.players[id];
  F.decisions.splice(i, 1);
  let msg;
  if (match && d.match <= capSpace(G.user) + .001 && roster(G.user).length < 90) { signFA(p, G.user, d.match, d.yrs); msg = `You matched. ${p.n} signed: ${d.yrs} yr at $${d.match}M per year.`; }
  else { signFA(p, d.t, d.apy, d.yrs); msg = match ? `You could not fit $${d.match}M under the cap. ${p.n} signed with the ${G.teams[d.t].nick}.` : `${p.n} signed with the ${G.teams[d.t].nick}.`; }
  if (!F.decisions.length) faNextWave();
  return {ok: true, msg};
}

// Draft: 7 rounds. The real 2027 big board covers the first 150 picks; the late rounds come from a generated tail.
function startDraft() {
  const order = [];
  for (let rd = 1; rd <= ROUNDS; rd++) for (let i = 0; i < 32; i++) {
    const orig = G.draftOrder[i];
    const pk = G.picks.find(x => x.yr === G.season && x.rd === rd && x.orig === orig);
    order.push({no: (rd - 1) * 32 + i + 1, rd, orig, owner: pk ? pk.owner : orig, pickId: pk && pk.id, sel: null});
  }
  G.draft = {order, at: 0, pool: scoutedClass(G.season).map(p => Object.assign({}, p))};
}
// Draft classes. 2027 is the real class. Later classes are generated: same size, the real mix of positions,
// and invented names, since those players have not been ranked yet.
const ROUNDS = 7, CLASS_SIZE = 260;
const CLASS_MIX = [['QB', 9], ['RB', 10], ['WR', 21], ['TE', 9], ['OT', 13], ['IOL', 13], ['EDGE', 17], ['DT', 15], ['LB', 12], ['CB', 19], ['S', 11], ['K', 1]];
const FIRST = ['Jaylen', 'Marcus', 'Tyler', 'Jordan', 'Caleb', 'Malik', 'Elijah', 'Isaiah', 'Cameron', 'Xavier', 'Darius', 'Trey', 'Mason', 'Logan', 'Bryce', 'Kendrick', 'Andre', 'Devin', 'Jalen', 'Micah', 'Owen', 'Carson', 'Quentin', 'Rashad', 'Tavion', 'Nolan', 'Gavin', 'Javon', 'Cole', 'Desmond', 'Keon', 'Landon', 'Dominic', 'Terrell', 'Brady', 'Amari', 'Zion', 'Corey', 'Myles', 'Jace'];
const LAST = ['Washington', 'Carter', 'Brooks', 'Mitchell', 'Coleman', 'Hayes', 'Price', 'Bennett', 'Sanders', 'Jenkins', 'Porter', 'Ellis', 'Reed', 'Graham', 'Fields', 'Hunter', 'Dixon', 'Wallace', 'Burke', 'Holloway', 'Freeman', 'Stewart', 'Barnes', 'Fletcher', 'Lawson', 'Moss', 'Tate', 'Vaughn', 'Rhodes', 'McCoy', 'Shaw', 'Pruitt', 'Calloway', 'Whitfield', 'Booker', 'Ingram', 'Dawson', 'Kirkland', 'Lockett', 'Pryor'];
const SCHOOLS = ['Alabama', 'Ohio State', 'Georgia', 'Texas', 'Michigan', 'LSU', 'Oregon', 'Penn State', 'Notre Dame', 'Clemson', 'USC', 'Florida', 'Miami', 'Oklahoma', 'Tennessee', 'Texas A&M', 'Auburn', 'Washington', 'Utah', 'Iowa', 'Wisconsin', 'Florida State', 'Ole Miss', 'Missouri', 'Kansas State', 'Arizona State', 'Boise State', 'Louisville', 'Colorado', 'TCU'];
function genClass(yr, from, count) {
  from = from || 1; count = count || CLASS_SIZE;
  const rng = makeRng(hashStr('class' + yr + from + G.user)), pick = a => a[Math.floor(rng() * a.length)];
  const total = CLASS_MIX.reduce((a, [, n]) => a + n, 0), pos = () => { let r = rng() * total; for (const [p, n] of CLASS_MIX) { if ((r -= n) < 0) return p; } return 'WR'; };
  const used = new Set(), out = [];
  for (let i = 0; i < count; i++) { let n; do { n = pick(FIRST) + ' ' + pick(LAST); } while (used.has(n)); used.add(n); out.push([from + i, pos(), n, pick(SCHOOLS)]); }
  return out;
}
function classFor(yr) {
  G.classes = G.classes || {};
  if (yr === 2027) return (G.classes[2027] = G.classes[2027] || [...G.prospects, ...genClass(2027, G.prospects.length + 1, CLASS_SIZE - G.prospects.length)]);
  return (G.classes[yr] = G.classes[yr] || genClass(yr));
}
// A class is scouted once, the first time anyone looks, so the big board does not change between visits
function scoutedClass(yr) {
  G.scouted = G.scouted || {};
  const C = classFor(yr), have = G.scouted[yr] || [];
  if (have.length < C.length) G.scouted[yr] = have.concat(C.slice(have.length).map(([rank, pos, n, sch]) => scoutProspect({rank, pos, n, sch})));
  return G.scouted[yr];
}
// Every prospect has a true rating, hidden until he is drafted, and a scouting range that can be wrong.
const MEAS = {QB: [74, 6, 218, 14, 4.78], RB: [70.5, 4, 210, 14, 4.48], WR: [72.5, 6, 198, 18, 4.45], TE: [76.5, 3, 248, 14, 4.68], OT: [77.5, 3, 315, 16, 5.2],
  IOL: [75.5, 3, 312, 14, 5.25], EDGE: [75.5, 4, 255, 18, 4.65], DT: [75, 4, 302, 18, 4.98], LB: [73.5, 3, 236, 12, 4.6], CB: [71.5, 4, 192, 12, 4.44], S: [72, 4, 204, 12, 4.5], K: [72, 4, 200, 20, 5], P: [74, 4, 210, 20, 5]};
const TRAITS = {QB: ['Arm strength', 'Accuracy', 'Pocket poise', 'Mobility', 'Reads defenses'], RB: ['Vision', 'Burst', 'Contact balance', 'Pass catching', 'Pass protection'],
  WR: ['Route running', 'Hands', 'Deep speed', 'Yards after catch', 'Contested catches'], TE: ['Blocking', 'Hands', 'Seam speed', 'Route running', 'Red zone target'],
  OT: ['Pass sets', 'Anchor', 'Run blocking', 'Length', 'Footwork'], IOL: ['Anchor', 'Run blocking', 'Pulling', 'Hand fighting', 'Awareness'],
  EDGE: ['First step', 'Bend', 'Power rush', 'Run defense', 'Motor'], DT: ['Penetration', 'Run stopping', 'Power', 'Hand usage', 'Motor'],
  LB: ['Range', 'Tackling', 'Coverage', 'Blitzing', 'Instincts'], CB: ['Man coverage', 'Zone instincts', 'Ball skills', 'Speed', 'Press'], S: ['Range', 'Ball skills', 'Tackling', 'Versatility', 'Instincts'],
  K: ['Leg strength', 'Accuracy', 'Clutch', 'Consistency', 'Kickoffs'], P: ['Hang time', 'Placement', 'Leg strength', 'Consistency', 'Directional']};
function scoutProspect(pr) {
  const h = hashStr('pros:' + pr.n), r = k => ((h >>> k) % 1000) / 1000;
  const ovr = Math.round(clamp(75 - .1 * pr.rank + randn() * 3.2, 50, 84));
  const est = ovr + randn() * 3;                       // what scouts think, give or take
  const width = 3 + Math.min(4, pr.rank / 30);
  const m = MEAS[pr.pos] || MEAS.LB;
  const ht = Math.round(m[0] + (r(1) - .5) * m[1]), wt = Math.round(m[2] + (r(5) - .5) * m[3]);
  const forty = Math.round((m[4] + (r(9) - .5) * .22) * 100) / 100;
  const tl = (TRAITS[pr.pos] || TRAITS.LB).slice();
  const traits = [tl.splice(h % tl.length, 1)[0], tl.splice((h >>> 3) % tl.length, 1)[0]];
  const weak = tl[(h >>> 6) % tl.length];
  // prospects' ceilings follow the consensus big board: the higher he ranks, the more room scouts see
  const pot = clamp(Math.round(ovr + 3 + (pr.rank <= 10 ? 8 : pr.rank <= 32 ? 6 : pr.rank <= 64 ? 4 : 2) + randn() * 1.5), ovr, 96);
  return Object.assign(pr, {ovr, pot, lo: Math.round(est - width), hi: Math.round(est + width), est: Math.round(est), ht: `${Math.floor(ht / 12)}'${ht % 12}"`, wt, forty, traits, weak,
    potGrade: pot - est >= 10 ? 'High' : pot - est >= 6 ? 'Medium' : 'Low', potWhy: `big board #${pr.rank}, ${pr.sch}`, round: pr.rank <= 32 ? '1st round' : pr.rank <= 64 ? '2nd round' : pr.rank <= 100 ? '3rd round' : 'Day 3'});
}
const draftVerdict = (ovr, lo, hi) => ovr > hi ? 'Steal' : ovr < lo ? 'Bust' : 'As projected';
function rookieOvr(rank) { return Math.round(clamp(72 - .1 * rank + randn() * 2.5, 50, 79)); }
function rookieCap(no) { return Math.round(Math.max(1.0, 11.5 * Math.exp(-.045 * (no - 1)) + .9) * 10) / 10; }
function makePick(prospect) {
  const D = G.draft, slot = D.order[D.at];
  const id = 'R27-' + prospect.rank;
  if (prospect.ovr == null) scoutProspect(prospect);
  const verdict = draftVerdict(prospect.ovr, prospect.lo, prospect.hi);
  G.players[id] = {id, n: prospect.n, pos: prospect.pos, tm: slot.owner, age: 21.5, ovr: prospect.ovr, pot: prospect.pot, potWhy: `drafted #${slot.no}, ${prospect.sch}`, prior: prospect.ovr, cap: rookieCap(slot.no), end: G.season + 3, st25: `${prospect.sch} (big board #${prospect.rank})`, st26: '', inj: false, rook: true, draft: slot.no, how: slot.owner === G.user ? 'Draft' : undefined,
    proj: [prospect.lo, prospect.hi], camp: 1, verdict, r1: slot.no <= 32 ? [G.season, slot.no] : undefined, prod: -1, hype: Math.max(10, Math.round(70 - slot.no * .5)), hist: [[G.season, prospect.ovr, `Drafted #${slot.no}, scouts said ${prospect.lo}-${prospect.hi}`]]};
  slot.sel = {id, n: prospect.n, pos: prospect.pos, sch: prospect.sch, rank: prospect.rank, ovr: prospect.ovr, lo: prospect.lo, hi: prospect.hi, verdict};
  D.pool = D.pool.filter(x => x !== prospect);
  if (slot.pickId) G.picks = G.picks.filter(x => x.id !== slot.pickId);
  D.at++;
}
function aiPick() {
  const D = G.draft, slot = D.order[D.at];
  let best = null, bs = -1e9;
  for (const p of D.pool.slice(0, 20)) {
    const fake = {pos: p.pos, ovr: p.est != null ? p.est : rookieOvr(p.rank)};
    const s = -p.rank + (needBoost(slot.owner, fake) > 1 ? 6 : 0) + randn() * 3 + (p.pos === 'QB' && depth(slot.owner).QB[0] && depth(slot.owner).QB[0].ovr > 82 ? -10 : 0) + ((p.pos === 'RB' || p.pos === 'S') ? -3 : 0);
    if (s > bs) { bs = s; best = p; }
  }
  makePick(best || D.pool[0]);
}
function simDraftToUser() {
  const D = G.draft;
  while (D.at < D.order.length && D.order[D.at].owner !== G.user) aiPick();
  return D.at < D.order.length;
}
function finishDraft() {
  const D = G.draft;
  while (D.at < D.order.length) { if (D.order[D.at].owner === G.user) { makePick(D.pool[0]); } else aiPick(); }
  G.draftDone = true;
  G.picks = G.picks.filter(k => k.yr > G.season);   // used picks are spent
  for (const yr of [G.season + 1, G.season + 2]) for (let rd = 1; rd <= ROUNDS; rd++) for (const t of teamList()) if (!G.picks.some(k => k.yr === yr && k.rd === rd && k.orig === t)) G.picks.push({id: `${yr}-${rd}-${t}`, yr, rd, orig: t, owner: t});
  addUndrafted();
  // training camp and the preseason are over: the rookies' real ratings are known at final cuts
  G.campReveal = Object.values(G.players).filter(p => p.camp && p.tm === G.user).map(p => p.id);
  for (const p of Object.values(G.players)) delete p.camp;
  G.step = 'cutdown';
  aiCleanup();
}
// Undrafted rookies: the rest of the class plus a wave of camp bodies, all young and cheap
function addUndrafted() {
  const rng = makeRng(hashStr('udfa' + G.season + G.user)), pick = a => a[Math.floor(rng() * a.length)];
  const left = (G.draft ? G.draft.pool : []).map(x => ({n: x.n, pos: x.pos, ovr: Math.max(48, (x.ovr || 60) - 2), sch: x.sch}));
  const POSN = CLASS_MIX.flatMap(([pos, n]) => Array(n).fill(pos));
  for (let i = 0; i < 120; i++) left.push({n: pick(FIRST) + ' ' + pick(LAST), pos: pick(POSN), ovr: Math.round(50 + rng() * 11), sch: pick(SCHOOLS)});
  left.forEach((x, i) => {
    const id = `U${G.season}-${i}`;
    if (G.players[id]) return;
    G.players[id] = {id, n: x.n, pos: x.pos, tm: 'FA', age: 22 + Math.round(rng() * 10) / 10, ovr: x.ovr, pot: Math.min(80, x.ovr + 4 + Math.round(rng() * 8)), potWhy: `undrafted, ${x.sch}`, prior: x.ovr, cap: 0, end: G.season - 1, st25: '', st26: '', inj: false, rook: true, prod: -1, hype: 5, ask: 0.9, hist: [[G.season, x.ovr, 'Undrafted rookie']]};
  });
}
function aiCleanup() {
  for (const t of teamList()) {
    if (t === G.user) continue;
    // fill holes from FA pool
    const d = depth(t);
    for (const pos of POS_ORDER) {
      while ((d[pos] = depth(t)[pos]).length < MIN_DEPTH[pos]) {
        const fa = faPool().find(p => p.pos === pos);
        if (fa) { fa.tm = t; fa.cap = Math.max(1.1, Math.round(askOf(fa) * .7 * 10) / 10); fa.end = G.season; }
        else { const id = 'G-' + t + pos + rint(1, 1e6); G.players[id] = {id, n: 'Depth ' + pos, pos, tm: t, age: 25, ovr: 52, cap: 1.1, end: G.season, st25: '', st26: '', inj: false, rook: false}; }
      }
    }
    const keepScore = p => p.ovr + (p.rook ? 6 : 0) + (p.age <= 24 ? 4 : p.age <= 27 ? 2 : p.age <= 29 ? 0 : p.age <= 31 ? -3 : p.age <= 33 ? -6 : -9) - Math.max(0, p.cap - market(p)) * .5;
    // camp: the best undrafted rookies get a shot, like every real team's summer
    faPool().filter(p => p.rook && p.age <= 23.5).sort((a, b) => (b.ovr + (b.pot || b.ovr) / 4) - (a.ovr + (a.pot || a.ovr) / 4)).slice(0, 4).forEach(p => { p.tm = t; p.cap = .9; p.end = G.season + 1; });
    // cut to 53 and under the cap: aging backups and overpaid veterans go first, young cheap players stay
    // roster churn: a veteran backup loses his spot when a younger player is the better value, as on every real team
    const starters = new Set(POS_ORDER.flatMap(pos => depth(t)[pos].slice(0, STARTERS[pos]).map(p => p.id)));
    for (let k = 0; k < 10; k++) {
      const vet = roster(t).filter(p => !starters.has(p.id) && p.age >= 27 && !p.rook && p.pos !== 'K' && p.pos !== 'P').sort((a, b) => keepScore(a) - keepScore(b))[0];
      const kid = vet && faPool().filter(p => p.pos === vet.pos && p.age <= 25).sort((a, b) => keepScore(b) - keepScore(a))[0];
      if (!vet || !kid || keepScore(kid) <= keepScore(vet) + 1) break;
      vet.tm = 'FA'; vet.cap = 0; vet.end = G.season - 1;
      kid.tm = t; kid.cap = Math.max(.9, Math.min(askOf(kid), 2)); kid.end = G.season + 1;
    }
    let ros = roster(t).sort((a, b) => keepScore(a) - keepScore(b));
    const counts = {}; for (const p of roster(t)) counts[p.pos] = (counts[p.pos] || 0) + 1;
    for (const p of ros) {
      if (roster(t).length <= ROSTER_MAX && payroll(t) <= G.cap[G.season]) break;
      if (counts[p.pos] <= MIN_DEPTH[p.pos]) continue;
      counts[p.pos]--; p.tm = 'FA'; p.cap = 0; p.end = G.season - 1;
    }
  }
}
function userReady() {
  const issues = [];
  const n = roster(G.user).length;
  if (n > ROSTER_MAX) issues.push(`Cut down to ${ROSTER_MAX} players (you have ${n}).`);
  if (capSpace(G.user) < 0) issues.push(`Get under the ${G.season} cap (you are $${(-capSpace(G.user)).toFixed(1)}M over).`);
  const d = depth(G.user);
  return issues;
}
// Fill empty roster spots with leftover free agents on 1-year minimum deals: thin positions first, then the biggest needs.
function fillRoster(t, target) {
  t = t || G.user; target = target || ROSTER_MAX;
  const signed = [], MIN = 1.1;
  // Only players who would really take the minimum: a starter-quality free agent wants a real contract.
  const cheap = p => askOf(p) <= 2 || p.ovr < 70;
  const depthScore = p => p.ovr + (p.age <= 24 ? 3 : p.age >= 31 ? -3 : 0);
  const pick = pos => faPool().filter(p => (!pos || p.pos === pos) && cheap(p)).sort((a, b) => depthScore(b) - depthScore(a))[0];
  const sign = p => { p.tm = t; p.cap = MIN; p.end = G.season; p.how = t === G.user ? 'Free agent' : p.how; signed.push({id: p.id, n: p.n, pos: p.pos, ovr: p.ovr}); };
  for (const pos of POS_ORDER) {
    while (roster(t).filter(p => p.pos === pos && !p.inj).length < MIN_DEPTH[pos] && roster(t).length < target && capSpace(t) >= MIN) { const p = pick(pos); if (!p) break; sign(p); }
  }
  const needs = teamNeeds(t).map(n => n.pos);
  let i = 0;
  while (roster(t).length < target && capSpace(t) >= MIN && i < 200) { const p = pick(needs[i % needs.length]) || pick(); i++; if (p) sign(p); else if (!faPool().length) break; }
  if (signed.length && t === G.user) G.news.unshift(`Filled ${signed.length} roster spot${signed.length > 1 ? 's' : ''} with minimum-salary free agents.`);
  return signed;
}
// After the draft, the other 31 teams sign the good free agents still out there at their asking price, then fill to 53.
function lateMarket() {
  const ts = teamList().filter(t => t !== G.user);
  for (const p of faPool().filter(q => q.ovr >= 68).sort((a, b) => b.ovr - a.ovr)) {
    const price = Math.max(1.1, Math.round(askOf(p) * 10) / 10);
    const t = ts.filter(x => capSpace(x) >= price + 1 && roster(x).length < ROSTER_MAX + 2).sort((a, b) => needBoost(b, p) - needBoost(a, p) || capSpace(b) - capSpace(a))[0];
    if (!t) continue;
    p.tm = t; p.cap = price; p.end = G.season - 1 + yearsFor(p);
  }
  for (const t of ts) {
    fillRoster(t);
    while (roster(t).length < ROSTER_MAX) {
      const p = faPool().filter(q => q.ovr < 70).sort((a, b) => (b.age <= 24) - (a.age <= 24) || b.ovr - a.ovr)[0];
      if (!p) break;
      p.tm = t; p.cap = .9; p.end = G.season;
    }
  }
}
function startSeason2() {
  lateMarket();
  G.autoFilled = fillRoster(G.user);
  while (roster(G.user).length < ROSTER_MAX) {
    const p = faPool().filter(q => q.ovr < 70).sort((a, b) => (b.age <= 24) - (a.age <= 24) || b.ovr - a.ovr)[0];
    if (!p) break;
    p.tm = G.user; p.cap = .9; p.end = G.season; p.how = 'Free agent';
    G.autoFilled.push({id: p.id, n: p.n, pos: p.pos, ovr: p.ovr});
  }
  // user fills any empty depth with replacement-level players automatically
  for (const pos of POS_ORDER) {
    while (depth(G.user)[pos].length < STARTERS[pos] || (depth(G.user)[pos].length < MIN_DEPTH[pos] && roster(G.user).length < ROSTER_MAX)) {
      const id = 'G-U' + pos + rint(1, 1e6);
      G.players[id] = {id, n: 'Depth ' + pos, pos, tm: G.user, age: 25, ovr: 52, cap: .9, end: G.season, st25: '', st26: '', inj: false, rook: false};
    }
  }
  G.phase = 'season'; G.week = 0; G.step = null;
  startForm();
  G.news.unshift(`${G.season} regular season is underway.`);
}

// ---------- end ----------
function tradeGrades() {
  return G.trades.map(t => {
    const now = (ids) => ids.reduce((s, id) => {
      if (G.players[id]) return s + playerValue(G.players[id]);
      const pk = G.picks.find(x => x.id === id); if (pk) return s + pickValue(pk);
      // drafted or gone: look for drafted player from that pick
      return s + 4;
    }, 0);
    const got = t.vGet, gave = t.vGive;
    const r = got / Math.max(.5, gave);
    const grade = r >= 1.5 ? 'A+' : r >= 1.25 ? 'A' : r >= 1.1 ? 'B+' : r >= .95 ? 'B' : r >= .8 ? 'C' : r >= .6 ? 'D' : 'F';
    return {...t, grade};
  });
}

// ---------- roster tools ----------
function cutCost(p) {
  const left = p.end - G.season + 1;
  const dead = left <= 0 ? 0 : Math.round(p.cap * (left >= 2 ? .5 : .25) * 10) / 10;
  return {dead, save: Math.round((p.cap - dead) * 10) / 10};
}
// Who to release to reach 53 players and get under the cap, cheapest loss first
function cutPlan() {
  const d = depth(G.user);
  const starters = new Set(POS_ORDER.flatMap(pos => d[pos].slice(0, STARTERS[pos]).map(p => p.id)));
  const counts = {}; for (const p of roster(G.user)) counts[p.pos] = (counts[p.pos] || 0) + 1;
  let n = roster(G.user).length, pay = payroll(G.user);
  const cap = G.cap[G.season], plan = [];
  // this year's draft picks get a season before anyone judges them: rounds 1-4 are never suggested, late-rounders go last
  const freshPick = p => p.draft && p.end === G.season + 3;
  const cands = roster(G.user).filter(p => !starters.has(p.id) && !(freshPick(p) && p.draft <= 128))
    .sort((a, b) => (freshPick(a) - freshPick(b)) || playerValue(a) / Math.max(1, a.cap) - playerValue(b) / Math.max(1, b.cap));
  for (const p of cands) {
    if (n <= ROSTER_MAX && pay <= cap) break;
    if (counts[p.pos] <= MIN_DEPTH[p.pos]) continue;
    const c = cutCost(p);
    if (n <= ROSTER_MAX && c.save <= 0) continue;
    plan.push(p.id); counts[p.pos]--; n--; pay -= c.save;
  }
  return plan;
}
// Team needs: each position group vs the league, with a plain-language need level
function teamNeeds(t) {
  t = t || G.user;
  const teams = teamList();
  const avgPos = (tm, pos) => { const L = depth(tm)[pos], n = STARTERS[pos]; let s = 0; for (let i = 0; i < n; i++) s += L[i] ? L[i].ovr : 40; return s / n; };
  return POS_ORDER.filter(p => p !== 'P').map(pos => {
    const me = avgPos(t, pos);
    const rank = teams.filter(x => avgPos(x, pos) > me).length + 1;
    const w = (OFF_W[pos] || DEF_W[pos] || .03);
    const level = rank >= 24 && w >= .1 ? 'High' : rank >= 20 || (rank >= 16 && w >= .2) ? 'Medium' : 'Low';
    const L = depth(t)[pos];
    return {pos, avg: Math.round(me), rank, level, weight: w, starters: L.slice(0, STARTERS[pos]), backup: L[STARTERS[pos]] || null};
  }).sort((a, b) => ({High: 0, Medium: 1, Low: 2}[a.level] - {High: 0, Medium: 1, Low: 2}[b.level]) || b.weight - a.weight || b.rank - a.rank);
}
// Upgrade targets at a position: free agents in the offseason, trade targets otherwise
// Realistic upgrade options, not just the best players at the position.
// Each candidate is scored on how much he helps, what he costs his team to give up, whether they would move him,
// and whether his salary fits. Returned in tiers so you see best fits, budget moves and splash moves.
function upgradeTargets(pos) {
  const L = depth(G.user)[pos], n = STARTERS[pos];
  const worst = L[n - 1] ? L[n - 1].ovr : 40;
  const space = capSpace(G.user);
  const out = {worst, fa: [], tr: []};
  if (G.phase === 'offseason' && G.step === 'fa') {
    const cands = faPool().filter(p => p.pos === pos && p.ovr > worst).map(p => {
      const price = faPrice(p), it = interest(p, G.user).score;
      const gain = p.ovr - worst, fits = price <= space;
      const score = gain / (1 + price / 6) * (.6 + it / 100) * (fits ? 1 : .4) * (ageAdj(p) >= 32 ? .75 : 1);
      return {p, gain, price, interest: it, fits, score};
    });
    out.fa = tierUp(cands, x => x.price);
  }
  const S = situations();
  const cands = Object.values(G.players).filter(p => p.pos === pos && G.teams[p.tm] && p.tm !== G.user && p.ovr > worst + 1 && !p.inj).map(p => {
    const gain = p.ovr - worst, cost = playerValue(p, p.tm);
    const theirs = depth(p.tm)[pos], starter = theirs.indexOf(p) > -1 && theirs.indexOf(p) < n;
    const st = S[p.tm].status;
    const avail = !starter ? 1.35 : st === 'Seller' || st === 'Rebuilding' ? 1.25 : st === 'Bubble' ? .95 : .7;
    const why = !starter ? `a backup for the ${G.teams[p.tm].nick}` : st === 'Seller' || st === 'Rebuilding' ? `${G.teams[p.tm].nick} are ${st === 'Seller' ? 'selling' : 'rebuilding'}` : st === 'Bubble' ? `${G.teams[p.tm].nick} are on the bubble` : `starter on a contender`;
    const fits = p.cap <= space + 1;
    const score = gain / Math.sqrt(1 + cost) * avail * (fits ? 1 : .6) * (ageAdj(p) >= 32 ? .8 : 1);
    return {p, gain, cost, avail, why, fits, score};
  });
  out.tr = tierUp(cands, x => x.cost);
  return out;
}
// Split candidates into Best fits (score), Budget (cheapest real upgrades) and Splash (biggest gains)
function tierUp(cands, price) {
  const used = new Set(), take = (L, k) => L.filter(x => !used.has(x.p.id)).slice(0, k).map(x => { used.add(x.p.id); return x; });
  const best = take(cands.slice().sort((a, b) => b.score - a.score), 4);
  const med = cands.length ? cands.map(price).sort((a, b) => a - b)[Math.floor(cands.length / 2)] : 0;
  const budget = take(cands.filter(x => x.gain >= 2 && price(x) <= med).sort((a, b) => price(a) - price(b) || b.gain - a.gain), 3);
  const splash = take(cands.slice().sort((a, b) => b.gain - a.gain || price(a) - price(b)), 2);
  return [{tier: 'Best fits', note: 'Most upgrade for the price', list: best}, {tier: 'Budget', note: 'Cheap real upgrades', list: budget}, {tier: 'Splash', note: 'The biggest upgrade, at a price', list: splash}].filter(t => t.list.length);
}

// ---------- projections ----------
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + .3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x)); }
const Phi = x => .5 * (1 + erf(x / Math.SQRT2));
// What a set of moves is worth in regular-season wins: 17 games against an average team on a neutral field, same model the sim uses.
function leagueAvgRating() {
  const L = teamList().map(t => teamRating(t).x), n = L.length;
  return {off: L.reduce((a, r) => a + r.off, 0) / n, def: L.reduce((a, r) => a + r.def, 0) / n, ovr: L.reduce((a, r) => a + r.ovr, 0) / n};
}
function winsDelta(t, add, remove) {
  add = (add || []).filter(id => G.players[id]); remove = remove || [];
  const base = activeRoster(t);
  const list = base.filter(p => !remove.includes(p.id)).concat(add.map(id => G.players[id]).filter(p => !p.inj && !base.includes(p)));
  const avg = leagueAvgRating(), w = r => 17 * winProbR(r, avg, true);
  return w(ratingOf(list)) - w(ratingOf(base));
}
function softCap(m) { return SIM.cap * Math.tanh(m / SIM.cap); }
function winProbR(ta, th, neutral) {
  const hfa = neutral ? 0 : SIM.hfa;
  const A = ta.x || ta, H = th.x || th;
  const m = softCap(((A.off - H.def) * .62 - (H.off - A.def) * .62 + (A.ovr - H.ovr) * .24) * SIM.talent) - hfa;
  return Phi(m / Math.sqrt(2 * SIM.teamNoise ** 2 + 4 * SIM.sharedNoise ** 2));
}
// Monte Carlo the rest of a season. Uses its own random stream so it never changes your sim.
function project(season, sims) {
  sims = sims || 400;
  const rng = makeRng(7919 + season * 31 + G.week * 7);
  const ts = teamList(), R = {};
  for (const t of ts) R[t] = teamRating(t);
  const live = season === G.season && G.phase !== 'offseason' && G.phase !== 'preseason';
  const base = {}; for (const t of ts) base[t] = live ? record(t, season).w : 0;
  const games = seasonGames(season).filter(([w]) => !live || w > G.week).map(([w, a, h]) => [a, h, winProbR(R[a], R[h])]);
  const out = {}; for (const t of ts) out[t] = {w: 0, po: 0, div: 0, sb: 0};
  const divs = {}; for (const t of ts) (divs[G.teams[t].div] = divs[G.teams[t].div] || []).push(t);
  for (let i = 0; i < sims; i++) {
    const W = {...base};
    for (const [a, h, p] of games) rng() < p ? W[a]++ : W[h]++;
    const key = t => W[t] + rng() * .5;
    const field = {};
    for (const conf of ['AFC', 'NFC']) {
      const winners = Object.keys(divs).filter(k => k.startsWith(conf)).map(k => divs[k].slice().sort((x, y) => key(y) - key(x))[0]);
      const rest = ts.filter(t => G.teams[t].conf === conf && !winners.includes(t)).sort((x, y) => key(y) - key(x)).slice(0, 4);
      winners.sort((x, y) => key(y) - key(x));
      field[conf] = [...winners, ...rest];
      winners.forEach(t => out[t].div++);
      field[conf].forEach(t => out[t].po++);
    }
    const champ = {};
    for (const conf of ['AFC', 'NFC']) {
      let al = field[conf];
      while (al.length > 1) { const nx = []; for (let j = 0; j < al.length / 2; j++) { const hi = al[j], lo = al[al.length - 1 - j]; nx.push(rng() < winProbR(R[hi], R[lo]) ? hi : lo); } al = nx; }
      champ[conf] = al[0];
    }
    out[rng() < winProbR(R[champ.AFC], R[champ.NFC], true) ? champ.AFC : champ.NFC].sb++;
    for (const t of ts) out[t].w += W[t];
  }
  for (const t of ts) { const o = out[t]; o.w = Math.round(o.w / sims * 10) / 10; o.po = o.po / sims; o.div = o.div / sims; o.sb = o.sb / sims; }
  return out;
}
// What the front office expects from this roster, set once per season
const GOALS = [
  [4, 'title', 'Win the Super Bowl'], [10, 'deep', 'Reach the conference title game'], [18, 'playoffs', 'Make the playoffs'],
  [25, 'winning', 'Finish with a winning record'], [32, 'progress', 'Win at least 6 games'],
];
function setExpectations(season) {
  G.expect = G.expect || {};
  if (G.expect[season]) return G.expect[season];
  const ovr = teamRating(G.user).ovr;
  const rank = teamList().filter(t => teamRating(t).ovr > ovr).length + 1;
  const g = GOALS.find(x => rank <= x[0]);
  const pr = project(season, 500)[G.user];
  G.expect[season] = {rank, key: g[1], goal: g[2], wins: pr.w, po: pr.po, div: pr.div, sb: pr.sb};
  return G.expect[season];
}
function goalMet(season) {
  const e = G.expect && G.expect[season]; if (!e) return null;
  const P = G.playoffs[season]; if (!P || !P.champ) return null;
  const r = record(G.user, season), el = P.elim[G.user];
  const met = {title: P.champ === G.user, deep: el !== undefined && el >= 2, playoffs: el !== undefined, winning: r.w > r.l, progress: r.w >= 6}[e.key];
  return {met, goal: e.goal, wins: r.w, proj: e.wins};
}

// ---------- attributes ----------
// Madden-style attributes, stored as offsets from OVR so they move with the player as he develops or declines.
const attr = (p, k) => p.at && p.at[k] != null ? clamp(p.ovr + p.at[k], 35, 99) : p.ovr;
const attrList = p => p.at ? Object.keys(p.at).map(k => ({k, v: attr(p, k)})) : [];
// What each position brings to each unit: the attributes that matter there, falling back to OVR
const UNIT_ATTR = {
  pass: {QB: ['Accuracy', 'Decisions', 'Arm', 'Poise'], WR: ['Route running', 'Hands', 'Deep threat'], TE: ['Route running', 'Hands'], OT: ['Pass blocking'], IOL: ['Pass blocking'], RB: ['Receiving']},
  run: {RB: ['Vision', 'Power'], IOL: ['Run blocking'], OT: ['Run blocking'], QB: ['Mobility'], TE: ['After the catch']},
  pd: {CB: ['Coverage', 'Ball skills'], S: ['Coverage', 'Ball skills'], EDGE: ['Pass rush'], DT: ['Pass rush'], LB: ['Coverage']},
  rd: {DT: ['Run defense', 'Tackling'], LB: ['Run defense', 'Tackling'], EDGE: ['Run defense'], S: ['Run support', 'Tackling']},
};
const unitScore = (p, k) => { const L = (UNIT_ATTR[k][p.pos] || []).filter(a => p.at && p.at[a] != null); return L.length ? L.reduce((s, a) => s + attr(p, a), 0) / L.length : p.ovr; };

// ---------- next game ----------
// How you match up, unit against unit, with the one thing to fix and the one thing to lean on
const UNITS = {
  pass: {name: 'passing game', pos: {QB: 2, WR: 1.4, TE: .6, OT: 1}}, run: {name: 'run game', pos: {RB: 1, IOL: 1.4, OT: .8}},
  pd: {name: 'pass defense', pos: {CB: 1.4, S: 1, EDGE: 1.2}}, rd: {name: 'run defense', pos: {DT: 1.3, LB: 1.2, EDGE: .5}},
};
function unitRatingC(t, k) { if (CACHE) { const key = 'u' + t + k; if (CACHE.tr[key] != null) return CACHE.tr[key]; return (CACHE.tr[key] = unitRating(t, k)); } return unitRating(t, k); }
function unitRating(t, k) {
  const d = depth(t); let s = 0, w = 0;
  for (const [pos, wt] of Object.entries(UNITS[k].pos)) { const L = d[pos], n = STARTERS[pos]; for (let i = 0; i < n; i++) { s += (L[i] ? unitScore(L[i], k) : 45) * wt; w += wt; } }
  return Math.round(s / w);
}
function matchup(opp, home) {
  const me = teamRating(G.user), th = teamRating(opp);
  const p = home ? 1 - winProbR(th, me) : winProbR(me, th);
  const U = k => unitRating(G.user, k), V = k => unitRating(opp, k);
  const fights = [
    {k: 'pass', mine: U('pass'), theirs: V('pd'), label: 'Your passing game vs their pass defense'},
    {k: 'run', mine: U('run'), theirs: V('rd'), label: 'Your run game vs their run defense'},
    {k: 'pd', mine: U('pd'), theirs: V('pass'), label: 'Your pass defense vs their passing game'},
    {k: 'rd', mine: U('rd'), theirs: V('run'), label: 'Your run defense vs their run game'},
  ].map(f => ({...f, name: UNITS[f.k].name, edge: f.mine - f.theirs}));
  const worst = fights.slice().sort((a, b) => a.edge - b.edge)[0], best = fights.slice().sort((a, b) => b.edge - a.edge)[0];
  // the weakest starter in your worst matchup is the spot to fix
  const d = depth(G.user);
  const weakPos = Object.keys(UNITS[worst.k].pos).map(pos => ({pos, ovr: d[pos][STARTERS[pos] - 1] ? d[pos][STARTERS[pos] - 1].ovr : 40})).sort((a, b) => a.ovr - b.ovr)[0];
  const star = roster(opp).filter(x => !x.inj).sort((a, b) => b.ovr - a.ovr)[0];
  const theirHurt = roster(opp).filter(x => x.inj && x.ovr >= 75).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  const last = (G.results[G.season] || []).filter(g => (g.h === opp && g.a === G.user) || (g.a === opp && g.h === G.user)).pop();
  return {p, fights, worst, best, weakPos, star, theirHurt, last, me: me.ovr, them: th.ovr};
}
// Why no deal for one of their players comes together, in plain words
function whyNoDeal(pid) {
  const p = G.players[pid]; if (!p || !G.teams[p.tm]) return 'He is not on a team you can trade with.';
  const t = p.tm, nick = G.teams[t].nick;
  const need = evalTrade(t, [], [pid]).need;
  const pool = userPool('all', [pid]).map(id => ({id, v: assetValue(id, t)})).sort((a, b) => b.v - a.v);
  const best = stacked(pool.slice(0, 3).map(x => x.v));
  const sendable = roster(G.user).filter(x => x.pos !== 'K' && x.pos !== 'P').map(x => x.cap).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const money = v => '$' + v.toFixed(1) + 'M';
  if (p.cap > capSpace(G.user) + sendable) return `His ${money(p.cap)} salary will not fit under your cap, even if you send big contracts back.`;
  if (best < need) {
    const sit = situation(t).status;
    return `The ${nick} value him at about ${Math.round(need)}. Your best three assets add up to ${Math.round(best)}${sit === 'Contender' ? ', and a contender does not sell a starter cheap' : ''}.`;
  }
  if (p.cap > capSpace(G.user)) return `You can only afford him by sending salary back, and no mix of your players both clears the cap and gets the ${nick} to yes. Free up cap space first.`;
  return `No mix of three of your assets gets the ${nick} to yes without breaking the cap or roster limits. Try a bigger package in Build a trade.`;
}

// ---------- fifth-year option ----------
// A first-round pick's rookie deal runs four years; before year four ends the team can add a fifth at a set price:
// based on the 3rd to 25th highest salaries at his position, a little less for picks after the top 10.
function optionPrice(p) {
  const caps = Object.values(G.players).filter(x => x.pos === p.pos && G.teams[x.tm]).map(x => x.cap).sort((a, b) => b - a);
  // like the CBA: the 3rd to 25th highest salaries at his spot, a step lower for picks after the top 10
  const top = caps.slice(2, 25), avg = top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  return Math.round(Math.max(p.cap, avg * (p.r1 && p.r1[1] <= 10 ? .9 : .78)) * 10) / 10;
}
// Due this offseason: a first-rounder entering the last year of his rookie deal
const optionDue = p => p.r1 && G.phase === 'offseason' && G.season === p.r1[0] + 3 && p.end === G.season && !p.optDone;
function optionList() { return roster(G.user).filter(optionDue).map(p => ({p, price: optionPrice(p)})).sort((a, b) => b.p.ovr - a.p.ovr); }
function decideOption(id, yes) {
  const p = G.players[id]; if (!p || !optionDue(p)) return false;
  p.optDone = yes ? 'picked' : 'declined';
  if (yes) { p.opt = {year: G.season + 1, cap: optionPrice(p)}; p.end = G.season + 1; G.news.unshift(`Picked up ${p.n}'s fifth-year option: $${p.opt.cap.toFixed(1)}M in ${p.opt.year}.`); }
  else G.news.unshift(`Declined ${p.n}'s fifth-year option. He can be a free agent after ${G.season}.`);
  return true;
}
// Other teams decide theirs at the start of the offseason: they keep the good ones
function aiOptions() {
  for (const p of Object.values(G.players)) if (G.teams[p.tm] && p.tm !== G.user && optionDue(p)) {
    if (p.ovr >= 74 || (p.pos === 'QB' && p.ovr >= 70)) { p.optDone = 'picked'; p.opt = {year: G.season + 1, cap: optionPrice(p)}; p.end = G.season + 1; } else p.optDone = 'declined';
  }
}

// ---------- locker room ----------
// Chemistry runs 0-100. Winning builds it; trading away or cutting players the room trusts costs it.
// It is worth up to about 2 points a game either way, a bit under a win a season at the extremes.
const chemOf = () => G.chem == null ? 60 : G.chem;
const chemLabel = c => c >= 75 ? 'Tight' : c >= 55 ? 'Solid' : c >= 35 ? 'Uneasy' : 'Fractured';
const chemEdge = () => (chemOf() - 50) / 25;
function chemShift(d, why) {
  d = Math.round(d);
  if (!d || !G.teams[G.user]) return 0;
  const was = chemOf();
  G.chem = clamp(was + d, 0, 100);
  const real = G.chem - was;
  if (real) (G.chemLog = G.chemLog || []).push({s: G.season, d: real, why, now: G.chem});
  return real;
}
// What a trade does to the room, before you make it: losing respected players hurts, landing a star lifts everyone
function chemTrade(give, get) {
  let d = 0; const lost = [];
  for (const id of give) {
    const p = G.players[id]; if (!p || p.tm !== G.user) continue;
    let hit = p.ovr >= 86 ? 5 : p.ovr >= 78 ? 3 : p.ovr >= 72 ? 1 : 0;
    if (hit && ageAdj(p) >= 29) hit += 2;                         // a veteran leader
    if (hit && p.how === 'Trade' && p.joined === G.season) hit = Math.min(hit, 1);   // he just got here
    if (isCaptain(p.id)) { hit += 4; lost.unshift(p.n + ' (captain)'); }
    if (hit >= 3) lost.push(p.n);
    d -= hit;
  }
  for (const id of get) { const p = G.players[id]; if (p && p.ovr >= 86) d += 2; }
  d = Math.max(-10, d);
  return {d, why: lost.length ? `Traded away ${lost.slice(0, 2).join(' and ')}` : d > 0 ? 'A star joined the team' : 'Trade'};
}
// ---------- captains ----------
// One captain on offense, one on defense. Respected veterans steady the room: losses sting less,
// and naming one gives the locker room a lift. Trading or cutting a captain costs a lot more than an ordinary player.
const OFF_POS = new Set(['QB', 'RB', 'WR', 'TE', 'OT', 'IOL']), DEF_POS = new Set(['EDGE', 'DT', 'LB', 'CB', 'S']);
const leadScore = p => p.ovr + Math.min(10, Math.max(0, ageAdj(p) - 24) * 1.6) + (p.pos === 'QB' ? 4 : p.pos === 'LB' || p.pos === 'S' ? 2 : 0) + (p.how ? 0 : 3);
function captainCandidates(side) {
  const d = depth(G.user), set = side === 'off' ? OFF_POS : DEF_POS;
  return Object.keys(d).filter(pos => set.has(pos)).flatMap(pos => d[pos].slice(0, STARTERS[pos])).filter(p => !p.inj || p.injW !== 99).sort((a, b) => leadScore(b) - leadScore(a));
}
function captains() {
  G.captains = G.captains || {};
  for (const side of ['off', 'def']) { const id = G.captains[side]; if (!id || !G.players[id] || G.players[id].tm !== G.user) G.captains[side] = (captainCandidates(side)[0] || {}).id || null; }
  return G.captains;
}
const isCaptain = id => { const c = G.captains || {}; return c.off === id || c.def === id; };
// How much the captains steady the room: veterans who play well count most
function leadership() {
  const c = captains();
  return ['off', 'def'].reduce((a, side) => { const p = G.players[c[side]]; return a + (p ? (ageAdj(p) >= 28 ? 1 : .55) * (p.ovr >= 80 ? 1 : .7) : 0); }, 0);
}
function setCaptain(side, id) {
  const p = G.players[id]; if (!p || p.tm !== G.user) return false;
  const c = captains(), was = G.players[c[side]];
  if (c[side] === id) return true;
  c[side] = id;
  const vet = ageAdj(p) >= 28 && p.ovr >= 78;
  if (G.phase === 'offseason' || G.phase === 'preseason' || G.week === 0) chemShift(vet ? 2 : 0, `${p.n} named ${side === 'off' ? 'offensive' : 'defensive'} captain`);
  else chemShift(vet ? 0 : -2, `Took the C from ${was ? was.n : 'a captain'} midseason`);
  G.news.unshift(`${p.n} is the new ${side === 'off' ? 'offensive' : 'defensive'} captain.`);
  return true;
}
function chemCut(p) {
  if (!p) return 0;
  const vet = ageAdj(p) >= 28 && p.ovr >= 73, young = p.draftYr === G.season || p.rook;
  return (vet ? -3 : young && p.ovr >= 65 ? -2 : 0) + (isCaptain(p.id) ? -5 : 0);
}
function chemGame(g) {
  if (g.h !== G.user && g.a !== G.user) return;
  const me = g.h === G.user ? g.hs : g.as, op = g.h === G.user ? g.as : g.hs;
  const opp = g.h === G.user ? g.a : g.h;
  if (me > op) chemShift(g.po ? 3 : 2, g.po ? 'Playoff win' : `Beat the ${G.teams[opp].nick}`);
  else { const steady = leadership() >= 1.5 ? 1 : 0; chemShift(-((op - me >= 17 ? 3 : 2) - steady), op - me >= 17 ? `Blown out by the ${G.teams[opp].nick}` : `Lost to the ${G.teams[opp].nick}${steady ? ', the captains kept the room together' : ''}`); }
}

// ---------- season goals ----------
// Three goals a season on top of the owner's: hit them for owner confidence, and they count on your résumé.
// Picked from your roster and schedule, the same way every time for the same team and season.
function hashStr(x) { let h = 2166136261; for (const c of String(x)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function seasonGoals(season) {
  G.goals = G.goals || {};
  if (G.goals[season]) return G.goals[season];
  if (!G.teams[G.user] || !G.results[season]) return [];
  const e = setExpectations(season), div = teamList().filter(t => t !== G.user && G.teams[t].div === G.teams[G.user].div);
  const rival = div.slice().sort((a, b) => teamRating(b).ovr - teamRating(a).ovr)[0];
  const wins = clamp(Math.round(e.wins + 1.5), 4, 15);
  const pool = [
    e.div >= .2 ? {k: 'div', t: 'Win the division'} : {k: 'divw', n: 4, t: 'Win 4 division games'},
    {k: 'off', n: 10, t: 'Top-10 scoring offense'},
    {k: 'def', n: 10, t: 'Top-10 scoring defense'},
    rival ? {k: 'rival', opp: rival, t: `Sweep the ${G.teams[rival].nick}`} : null,
    {k: 'streak', n: 4, t: 'Win 4 in a row'},
  ].filter(Boolean);
  let h = hashStr(G.user + season);
  const pick = [];
  while (pick.length < 2 && pool.length) { pick.push(pool.splice(h % pool.length, 1)[0]); h = Math.floor(h / 7) + 13; }
  G.goals[season] = [{k: 'wins', n: wins, t: `Win ${wins} games`}, ...pick];
  return G.goals[season];
}
// Live progress on each goal: done (locked in), failed (out of reach), or still open, with a short line
function goalStatus(season) {
  const L = seasonGoals(season); if (!L.length) return [];
  const R = (G.results[season] || []).filter(g => !g.po), mine = R.filter(g => g.h === G.user || g.a === G.user);
  const r = record(G.user, season), played = r.w + r.l, left = 17 - played, over = played >= 17 || season < G.season || ['playoffs', 'seasondone', 'final'].includes(G.phase);
  const won = g => (g.h === G.user ? g.hs > g.as : g.as > g.hs);
  const rankOf = k => {
    const T = {};
    for (const g of R) { for (const [t, me, op] of [[g.h, g.hs, g.as], [g.a, g.as, g.hs]]) { const x = T[t] = T[t] || {g: 0, pf: 0, pa: 0}; x.g++; x.pf += me; x.pa += op; } }
    const v = t => T[t] ? T[t][k] / T[t].g : (k === 'pf' ? 0 : 99), my = v(G.user);
    return teamList().filter(t => k === 'pf' ? v(t) > my : v(t) < my).length + 1;
  };
  return L.map(x => {
    let done = false, fail = false, line = '';
    if (x.k === 'wins') { done = r.w >= x.n; fail = !done && r.w + left < x.n; line = `${r.w} of ${x.n}`; }
    else if (x.k === 'divw') { done = r.dw >= x.n; fail = !done && r.dw + Math.max(0, 6 - r.dw - r.dl) < x.n; line = `${r.dw} of ${x.n}`; }
    else if (x.k === 'div') { const rk = teamList().filter(t => t !== G.user && G.teams[t].div === G.teams[G.user].div && record(t, season).w > r.w).length + 1; done = over && rk === 1; fail = over && rk > 1; line = played ? `${ordinal(rk)} in the division` : 'Not started'; }
    else if (x.k === 'off' || x.k === 'def') { const rk = played ? rankOf(x.k === 'off' ? 'pf' : 'pa') : null; done = over && rk <= x.n; fail = over && rk > x.n; line = rk ? `${ordinal(rk)} so far` : 'Not started'; }
    else if (x.k === 'rival') { const vs = mine.filter(g => g.h === x.opp || g.a === x.opp); const w = vs.filter(won).length; fail = vs.length > w; done = !fail && w >= 2; line = `${w} of 2`; }
    else if (x.k === 'streak') { let best = 0, cur = 0; for (const g of mine.sort((a, b) => a.wk - b.wk)) { cur = won(g) ? cur + 1 : 0; best = Math.max(best, cur); } done = best >= x.n; fail = !done && over; line = `Best ${best} straight`; }
    return {...x, done, fail, line};
  });
}

// ---------- season awards ----------
// Built from the simulated season's box scores, credited to the player's current team.
function awards(season) {
  const S = G.stats[season] || {};
  const rows = Object.entries(S).map(([id, st]) => ({p: G.players[id], st})).filter(x => x.p && G.teams[x.p.tm]);
  const wins = t => record(t, season).w;
  const qbScore = st => (st.py || 0) / 25 + (st.ptd || 0) * 4 - (st.int || 0) * 2 + (st.ry || 0) / 10;
  const offScore = st => ((st.ry || 0) + (st.recy || 0)) / 10 + ((st.rtd || 0) + (st.rectd || 0)) * 6;
  const defScore = st => (st.sk || 0) * 4 + (st.dint || 0) * 5;
  const any = x => x.p.pos === 'QB' ? qbScore(x.st) : ['EDGE', 'DT', 'LB', 'CB', 'S'].includes(x.p.pos) ? defScore(x.st) * 1.6 : offScore(x.st);
  const line = x => {
    const st = x.st, n = v => Math.round(v || 0).toLocaleString();
    if (x.p.pos === 'QB') return `${n(st.py)} pass yds, ${n(st.ptd)} TD, ${n(st.int)} INT`;
    if (['EDGE', 'DT', 'LB', 'CB', 'S'].includes(x.p.pos)) return `${n(st.sk)} sacks, ${n(st.dint)} INT`;
    return `${n((st.ry || 0) + (st.recy || 0))} scrimmage yds, ${n((st.rtd || 0) + (st.rectd || 0))} TD`;
  };
  const best = (L, f) => L.slice().sort((a, b) => f(b) - f(a) || b.p.ovr - a.p.ovr)[0];
  const pick = (award, x) => x ? {award, id: x.p.id, n: x.p.n, pos: x.p.pos, tm: x.p.tm, line: line(x)} : null;
  // a 2026 rookie has no 2025 NFL season; a 2027 rookie came out of this game's draft
  const isRookie = x => season === 2026 ? !x.p.st25 && x.p.age < 24.5 && !x.p.draft : x.p.draft != null;
  return [
    pick('MVP', best(rows.filter(x => x.p.pos === 'QB'), x => qbScore(x.st) + wins(x.p.tm) * 3)),
    pick('Offensive Player of the Year', best(rows.filter(x => ['RB', 'WR', 'TE'].includes(x.p.pos)), x => offScore(x.st))),
    pick('Defensive Player of the Year', best(rows.filter(x => ['EDGE', 'DT', 'LB', 'CB', 'S'].includes(x.p.pos)), x => defScore(x.st))),
    pick('Rookie of the Year', best(rows.filter(isRookie), any)),
    pick('Your team MVP', best(rows.filter(x => x.p.tm === G.user), any)),
  ].filter(Boolean);
}
// Current run of wins or losses, playoffs included
function streak(t, season) {
  const L = (G.results[season] || []).filter(g => g.a === t || g.h === t);
  if (!L.length) return null;
  const won = g => (g.h === t) === (g.hs > g.as);
  const last = won(L[L.length - 1]);
  let n = 0;
  for (let i = L.length - 1; i >= 0 && won(L[i]) === last; i--) n++;
  return {win: last, n};
}

// ---------- rebuild report ----------
const LETTERS = [[93, 'A+'], [88, 'A'], [84, 'A-'], [80, 'B+'], [75, 'B'], [70, 'B-'], [66, 'C+'], [60, 'C'], [55, 'C-'], [48, 'D'], [0, 'F']];
const letter = s => LETTERS.find(([m]) => s >= m)[1];
const STAGE_BONUS = {miss: 0, 0: 12, 1: 20, 2: 28, 3: 34, 4: 40};
const PICK_W = {1: 3, 2: 2, 3: 1, 4: .5, 5: .25, 6: .15, 7: .1};

function seasonScore(season) {
  const f = G.history[season] && G.history[season].finish;
  if (!f) return 0;
  const P = G.playoffs[season];
  const stage = P && P.elim[G.user] !== undefined ? P.elim[G.user] : 'miss';
  return clamp(f.rw / 17 * 60 + STAGE_BONUS[stage], 0, 100);
}
function picksWeight(yr, t) { return G.picks.filter(x => x.yr === yr && x.owner === t).reduce((s, x) => s + PICK_W[x.rd], 0); }

function rebuildReport() {
  const S = G.start, u = G.user;
  const tr = teamRating(u), d = tr.d;
  const rank = teamList().filter(t => teamRating(t).ovr > tr.ovr).length + 1;
  const ros = roster(u);
  const cap27 = G.cap[2027], proj28 = Math.round(cap27 * 1.07 * 10) / 10;
  const commit28 = ros.filter(p => p.end >= 2028).reduce((s, p) => s + p.cap, 0);
  const space = cap27 - payroll(u);
  const age = starterAge(d);
  const pk28 = G.picks.filter(x => x.yr === 2028 && x.owner === u).sort((a, b) => a.rd - b.rd);
  const pw = picksWeight(2028, u);
  const core = ros.filter(p => p.age <= 26 && p.ovr >= 78);

  // results: 2027 counts more, since that is the team you built
  const s26 = seasonScore(2026), s27 = seasonScore(2027);
  const results = Math.round(s26 * .35 + s27 * .65);
  const delta = tr.ovr - S.ovr;
  const rosterS = Math.round(clamp(.5 * clamp(50 + delta * 5, 0, 100) + .5 * clamp(100 - (rank - 1) * 3.2, 0, 100), 0, 100));
  const grades = tradeGrades();
  const avgR = grades.length ? grades.reduce((s, t) => s + t.vGet / Math.max(.5, t.vGive), 0) / grades.length : null;
  const tradeS = avgR == null ? null : Math.round(clamp(70 + (avgR - .95) * 120, 15, 100));
  const ageS = clamp(100 - (age - 26) * 15, 0, 100), pickS = clamp(50 + (pw - 6.5) * 8, 0, 100), coreS = clamp(25 + core.length * 20, 0, 100);
  const future = Math.round((ageS + pickS + coreS) / 3);
  const dead = G.dead[u] || 0;
  const capS = Math.round(clamp(40 + (space < 0 ? space * 3 : Math.min(space, 30)) + (1 - commit28 / proj28) * 60 - dead * 2, 0, 100));

  const cats = [
    {k: 'results', label: 'Results', w: .35, s: results, why: `${G.history[2026].finish.w}-${G.history[2026].finish.l} then ${G.history[2027].finish.w}-${G.history[2027].finish.l}. 2027 counts for about two thirds.`},
    {k: 'roster', label: 'Roster upgrade', w: .25, s: rosterS, why: `Team OVR ${S.ovr} to ${tr.ovr} (${delta >= 0 ? '+' : ''}${delta}). Now #${rank} of 32.`},
    {k: 'trades', label: 'Trades', w: .15, s: tradeS, why: grades.length ? `${grades.length} trade${grades.length > 1 ? 's' : ''}. You got back ${Math.round(avgR * 100)}% of the value you sent.` : 'No trades. This one is left out of your grade.'},
    {k: 'future', label: 'Future', w: .15, s: future, why: `Starters average ${age} years old. ${core.length} young core player${core.length === 1 ? '' : 's'} (26 or under, 78+). ${pk28.length} 2028 pick${pk28.length === 1 ? '' : 's'}.`},
    {k: 'cap', label: 'Cap health', w: .10, s: capS, why: `${space >= 0 ? '$' + space.toFixed(1) + 'M under' : '$' + (-space).toFixed(1) + 'M over'} the 2027 cap${space > 40 ? ', much of it unused' : ''}. $${commit28.toFixed(1)}M already owed for 2028.`},
  ];
  for (const c of cats) c.g = c.s == null ? '-' : letter(c.s);
  const used = cats.filter(c => c.s != null), wsum = used.reduce((s, c) => s + c.w, 0);
  const score = Math.round(used.reduce((s, c) => s + c.s * c.w, 0) / wsum);

  // what kind of GM you were
  const changed = ros.filter(p => !S.ids.includes(p.id) && !String(p.id).startsWith('G-')).length;
  let style;
  if (grades.length === 0 && (G.signings || []).length <= 1) style = {name: 'Stood pat', line: 'You trusted the roster you were handed.'};
  else if (pw <= 4 && age >= S.age) style = {name: 'All in', line: 'You traded the future to win now.'};
  else if (pw >= 8 && age < S.age) style = {name: 'Teardown', line: 'You sold veterans for picks and youth.'};
  else if (changed >= 10) style = {name: 'Overhaul', line: `${changed} new faces on the 53.`};
  else style = {name: 'Retool', line: 'You kept the core and patched the holes.'};

  // lineup before and after
  const kept = new Set(S.ids);
  const lineup = POS_ORDER.map(pos => {
    const n = STARTERS[pos], rows = [];
    for (let i = 0; i < n; i++) {
      const b = S.starters[pos][i] || null, a = d[pos][i] || null;
      let how = null;
      if (a) how = String(a.id).startsWith('G-') ? 'Fill-in' : a.how ? a.how : kept.has(a.id) ? (G.resign && G.resign[a.id] && G.resign[a.id].done === 'signed' ? 'Re-signed' : 'Kept') : (a.how || 'Added');
      rows.push({pos, slot: n > 1 ? pos + (i + 1) : pos, before: b, after: a ? {id: a.id, n: a.n, ovr: a.ovr, age: a.age} : null, how});
    }
    return rows;
  }).flat();

  // headline moves
  const bestTrade = grades.slice().sort((a, b) => b.vGet / Math.max(.5, b.vGive) - a.vGet / Math.max(.5, a.vGive))[0] || null;
  const sign = (G.signings || []).map(s => ({...s, now: G.players[s.id]})).filter(s => s.now && s.now.tm === u).sort((a, b) => b.now.ovr - a.now.ovr)[0] || null;
  const rookies = ros.filter(p => p.how === 'Draft').sort((a, b) => b.ovr - a.ovr);

  return {
    score, grade: letter(score), cats, style, lineup, rank, delta,
    then: {ovr: S.ovr, off: S.off, def: S.def, age: S.age, payroll: S.payroll, space: S.space, picks: 4},
    now: {ovr: tr.ovr, off: tr.off, def: tr.def, age, payroll: payroll(u), space, picks: pk28.length, commit28, proj28},
    bestTrade, sign, rookies, changed,
  };
}

function save() { return JSON.stringify({G, rs: R.state()}); }
function load(str) { const o = JSON.parse(str); G = o.G; R.set(o.rs); return G; }

const interestInC = cached(interestIn), onBlockC = cached(onBlock), marketBoardC = cached(marketBoard), valueRangeC = cached(valueRange), genOffersC = cached(genOffers), findPackagesC = cached(findPackages), shopPlayerC = cached(shopPlayer), draftOffersC = cached(draftOffers),
  cutPlanC = cached(cutPlan), teamNeedsC = cached(teamNeeds), projectC = cached(project), setExpectationsC = cached(setExpectations), balanceTradeC = cached(balanceTrade);
function refreshOffersC() { G.offers = [...blockOffers(), ...genOffersC(3, 1)]; return G.offers; }
const api = {
  POS_ORDER, STARTERS, ROSTER_MAX, ROUND_NAMES, DEADLINE_WEEK,
  newGame, get G() { return G; }, awards, streak, draftVerdict, fillRoster, scoutProspect, faMeet, faOffer, faCancel, faEndWave, faDecide, faUtility, PITCHES, interest: cached(interest), priorities, negStart, negOffer, counterTrade: cached(counterTrade), formOf, formLabel, updateConfidence, confLabel, lenFactor, resignPrice, setDepth, faPrice, faSuitors, cutCost, cutPlan: cutPlanC, teamNeeds: teamNeedsC, upgradeTargets, project: projectC, setExpectations: setExpectationsC, goalMet, winProbR,
  interestIn: interestInC, onBlock: onBlockC, marketBoard: marketBoardC, situations: cached(situations), valueRange: valueRangeC, gmOf, cached, findPackages: findPackagesC, whyNoMarket, talkWhy: cached(talkWhy), temperament, unpackBox, setFlex, canFlex, flexPen, FLEX, faBid, faOdds, faFloor, midseasonPrice, signMidseason, blockOf, toggleBlock, setBlockWant, blockOffers: cached(blockOffers), blockOffersFor: cached(blockOffersFor), proposeTrade: cached(proposeTrade), talkWith, talkMove: cached(talkMove), talkAssets: cached(talkAssets), talkEval, TALK_MOVES, winsDelta: cached(winsDelta), shopPlayer: shopPlayerC, buildPackage, genOffers: genOffersC, refreshOffers: refreshOffersC, acceptOffer, acceptPlan: cached(acceptPlan), attr, attrList, timelineFactor, captains, captainCandidates, setCaptain, isCaptain, leadership, optionList, optionPrice, decideOption, offerSense, moveUpPrice: cached(moveUpPrice), moveDownOffers: cached(moveDownOffers), draftDeal, pickTag, chartValue, draftSlotOf, matchup: cached(matchup), whyNoDeal: cached(whyNoDeal), unitRating, chemOf, chemLabel, chemEdge, chemTrade, seasonGoals, goalStatus, draftOffers: draftOffersC, assetValue, assetName, pickSlot, rosterLimit, stacked, teamList, roster, payroll, capSpace, depth, teamRating, market, playerValue, valueParts, needBoost, pickValue, pickLabel, nextDraftYear,
  evalTrade, doTrade, balanceTrade: balanceTradeC, record, simWeek, simTo, divisions, seeds, startPlayoffs, simPlayoffRound, inPlayoffs, userFinish,
  beginOffseason, resignPlayer, finishResign, cutPlayer, faPool, offerFA, aiFAWave, finishFA, startDraft, makePick, aiPick, simDraftToUser, finishDraft,
  userReady, startSeason2, scoutedClass, nextDraftYear, classFor, tradeGrades, rebuildReport, snapshotFromData, save, load, seasonGames, winPct, askFor, yearsFor, rookieOvr, rebuilding, projectedSlot,
};
if (typeof module !== 'undefined') module.exports = api; else root.E = api;
})(this);
