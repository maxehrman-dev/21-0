// Engine tests: run with `npm test` (Node 20+, no dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const E = require('../engine.js');
const DATA = JSON.parse(readFileSync(new URL('../data.json', import.meta.url)));
const byName = n => Object.values(E.G.players).find(p => p.n === n);
const cached = f => E.cached(f)();

test('a new game has 32 teams, full rosters and draft picks', () => {
  E.newGame(DATA, 'KC', 1);
  assert.equal(E.teamList().length, 32);
  for (const t of E.teamList()) assert.ok(E.roster(t).length >= 45, `${t} roster is too small`);
  assert.equal(E.G.picks.length, 32 * 7 * 2);
  assert.ok(E.teamRating('KC').ovr > 50);
});

test('the 2026 season plays 272 games and crowns a champion', () => {
  E.newGame(DATA, 'NYJ', 2);
  E.simTo(18);
  assert.equal(E.G.results[2026].length, 272);
  E.startPlayoffs();
  while (E.simPlayoffRound());
  const P = E.G.playoffs[2026];
  assert.ok(P.champ, 'no champion');
  assert.equal(P.rounds.length, 4);
  const wins = E.teamList().reduce((s, t) => s + E.record(t, 2026).w, 0);
  assert.equal(wins, 272, 'every regular-season game has one winner');
});

test('trade values follow the real market', () => {
  E.newGame(DATA, 'NYJ', 3);
  const v = n => E.playerValue(byName(n));
  assert.ok(v("Ja'Marr Chase") > v('Garrett Wilson'), 'an elite WR is worth more than a good one');
  assert.ok(v('Josh Allen') > v("Ja'Marr Chase"), 'a top QB is worth more than any WR');
  assert.ok(v('Travis Kelce') < 3, 'a 36-year-old TE is worth very little');
  const pick = (yr, rd, t) => E.G.picks.find(k => k.yr === yr && k.rd === rd && k.orig === t);
  assert.ok(E.pickValue(pick(2027, 1, 'NYJ')) > E.pickValue(pick(2027, 2, 'NYJ')));
  assert.ok(E.pickValue(pick(2028, 1, 'NYJ')) < E.pickValue(pick(2027, 1, 'NYJ')), 'future picks are discounted');
});

test('teams refuse piles of backups for a star', () => {
  E.newGame(DATA, 'KC', 4);
  E.simTo(9); E.G.phase = 'deadline';
  const star = byName('Aidan Hutchinson');
  const pile = E.roster('KC').filter(p => p.ovr >= 70 && p.ovr < 80).slice(0, 5).map(p => p.id);
  const ev = cached(() => E.evalTrade(star.tm, pile, [star.id]));
  assert.equal(ev.ok, false);
  assert.ok(ev.ratio < 1);
});

test('AI offers are few, fair to you, and at most one costs you wins this season', () => {
  for (const [t, seed] of [['NYJ', 5], ['KC', 7], ['TEN', 9]]) {
    E.newGame(DATA, t, seed);
    E.simTo(9); E.G.phase = 'deadline';
    const offers = E.refreshOffers().filter(o => o.kind !== 'block');
    assert.ok(offers.length >= 1 && offers.length <= 3, `${t}: ${offers.length} offers`);
    let costly = 0;
    for (const o of offers) {
      const ev = cached(() => E.evalTrade(o.from, o.give, o.get));
      assert.ok(ev.fair >= .92, `${o.from} offer is unfair to you (${ev.fair.toFixed(2)})`);
      assert.equal(ev.issues.length, 0, ev.issues.join('; '));
      if (o.kind === 'want' && cached(() => E.winsDelta(t, o.get, o.give)) < -.25) costly++;
    }
    assert.ok(costly <= 1, `${t}: ${costly} offers make you worse`);
  }
});

test('season goals track progress and the locker room reacts to games and trades', () => {
  E.newGame(DATA, 'DET', 11);
  const G = E.G, goals = E.seasonGoals(2026);
  assert.equal(goals.length, 3);
  assert.ok(goals[0].t.startsWith('Win '));
  assert.equal(E.chemOf(), 60);
  E.simTo(17);
  assert.notEqual(E.chemOf(), 60, 'games should move the locker room');
  const st = E.goalStatus(2026);
  assert.ok(st.every(x => typeof x.line === 'string' && x.line.length));
  // trading away a star costs chemistry
  const star = E.roster('DET').filter(p => p.ovr >= 88).sort((a, b) => b.ovr - a.ovr)[0];
  assert.ok(E.chemTrade([star.id], []).d <= -5);
});

test('a full two-season run reaches the final report', () => {
  E.newGame(DATA, 'LAC', 6);
  const G = E.G;
  E.simTo(18); E.startPlayoffs(); while (E.simPlayoffRound());
  assert.equal(E.awards(2026).length, 5);
  E.beginOffseason(); G.phase = 'offseason';
  assert.equal(G.season, 2027);
  G.step = 'resign';
  E.finishResign();
  assert.equal(G.step, 'fa');
  // signing at the asking price is instant
  const fa = E.faPool().find(p => E.faPrice(p) < E.capSpace('LAC') - 5);
  const r = E.faOffer(fa.id, E.faPrice(fa), E.yearsFor(fa));
  assert.ok(r.signed, r.msg);
  assert.equal(G.players[fa.id].tm, 'LAC');
  E.finishFA();
  assert.equal(G.step, 'draft');
  E.finishDraft();
  assert.equal(G.step, 'camp', 'training camp comes after the draft');
  assert.ok(G.camp && G.camp.changes.length > 10, 'camp shows how the roster changed');
  E.toCutdown();
  assert.equal(G.step, 'cutdown');
  for (const id of E.cutPlan()) E.cutPlayer(id);
  E.fillRoster('LAC');
  assert.ok(E.roster('LAC').length <= 53);
  E.startSeason2();
  E.simTo(18); E.startPlayoffs(); while (E.simPlayoffRound());
  G.history[2027] = {finish: E.userFinish(2027), champ: G.playoffs[2027].champ, ovr: E.teamRating('LAC').ovr};
  const rep = E.rebuildReport();
  assert.match(rep.grade, /^[A-F][+-]?$/);
  assert.ok(rep.score >= 0 && rep.score <= 100);
});

test('drafted rookies reveal a real rating and a verdict', () => {
  E.newGame(DATA, 'CHI', 7);
  E.simTo(18); E.startPlayoffs(); while (E.simPlayoffRound());
  E.beginOffseason(); E.G.phase = 'offseason'; E.finishResign(); E.finishFA();
  const slot = E.G.draft.order[0], pros = E.G.draft.pool[0];
  E.makePick(pros);
  assert.ok(slot.sel.ovr >= 50 && slot.sel.ovr <= 84);
  assert.ok(['Steal', 'As projected', 'Bust'].includes(slot.sel.verdict));
  assert.ok(slot.sel.lo < slot.sel.hi);
});

test('draft day: move up or down by pick, and rookie ratings stay hidden until final cuts', () => {
  E.newGame(DATA, 'SEA', 7);
  E.simTo(18); E.startPlayoffs(); while (E.simPlayoffRound());
  E.beginOffseason(); E.G.phase = 'offseason'; E.finishResign(); E.finishFA();
  const D = E.G.draft;
  const mine = D.order.find(o => o.owner === 'SEA' && o.pickId);
  // moving up costs only picks that come after the one you get
  const target = D.order.find(o => o.owner !== 'SEA' && o.pickId && o.no > mine.no);
  const price = E.moveUpPrice(target.pickId);
  assert.ok(price && price.give && price.give.length, 'a pick behind your first one has a price');
  for (const id of price.give) { const sl = E.draftSlotOf(id); assert.ok(!sl || sl.no > target.no, 'never pay with an earlier pick'); }
  assert.ok(E.draftDeal(price.partner, price.give, price.get).ok, 'the priced deal goes through');
  assert.equal(E.G.picks.find(k => k.id === target.pickId).owner, 'SEA');
  // moving down: offers come from teams behind you, in their own picks
  const own = D.order.slice(D.at).find(o => o.owner === 'SEA' && o.pickId);
  if (own) for (const x of E.moveDownOffers(own.pickId)) { const first = E.draftSlotOf(x.get[0]); assert.ok(!first || first.no > own.no); }
  // a drafted rookie keeps only the scouts' range until camp is over
  while (D.at < D.order.length && D.order[D.at].owner !== 'SEA' && D.order.slice(D.at).some(o => o.owner === 'SEA')) E.aiPick();
  if (D.order[D.at].owner !== 'SEA') D.order[D.at].owner = 'SEA';
  const pros = D.pool[0]; E.makePick(pros);
  const rookie = Object.values(E.G.players).find(p => p.n === pros.n && p.tm === 'SEA');
  assert.ok(rookie.camp && rookie.proj[0] < rookie.proj[1], 'hidden during the draft');
  E.finishDraft();
  assert.ok(!rookie.camp && E.G.campReveal.includes(rookie.id), 'revealed at final cuts');
});

test('a trade offer a team sends you always goes through, clearing cap room for you if it has to', () => {
  E.newGame(DATA, 'NYJ', 21); E.simTo(9); E.G.phase = 'deadline';
  const G = E.G;
  // a deal that adds salary: a cheap backup of yours for a pricey starter of theirs
  const mine = E.roster('NYJ').filter(p => p.cap < 2 && p.ovr >= 60 && p.pos !== 'K' && p.pos !== 'P')[0];
  const theirs = E.roster('LV').filter(p => p.cap >= 15).sort((a, b) => a.ovr - b.ovr)[0];
  G.cap[2026] = E.payroll('NYJ') + 1;
  G.offers = [{id: 'oTEST', from: 'LV', kind: 'want', give: [mine.id], get: [theirs.id], msg: ''}];
  const plan = E.acceptPlan([mine.id], [theirs.id]);
  assert.ok(plan.cuts.length + plan.restr.length >= 1 && plan.ok, 'it plans restructures or releases to make room');
  const r = E.acceptOffer('oTEST');
  assert.ok(r.ok, r.msg);
  assert.equal(G.players[theirs.id].tm, 'NYJ');
  assert.ok(E.payroll('NYJ') <= G.cap[2026] + .01, 'still under the cap');
});

test('contracts in trades: no-trade clauses, restructures, extension asks, and named counters', () => {
  E.newGame(DATA, 'NYJ', 41); E.simTo(9); E.G.phase = 'deadline';
  const G = E.G;
  // a big-money veteran with a no-trade clause will not go to a rebuilding team
  const ntc = Object.values(G.players).find(p => G.teams[p.tm] && p.tm !== 'NYJ' && E.hasNTC(p));
  if (ntc) { const S = E.situations(); const reb = E.teamList().find(t => t !== ntc.tm && /Rebuilding|Seller/.test(S[t].status));
    if (reb === 'NYJ') assert.ok(E.evalTrade(ntc.tm, [E.roster('NYJ')[0].id], [ntc.id]).issues.some(i => /no-trade/.test(i))); }
  // restructuring frees room now and adds it back later
  const r = E.roster('NYJ').find(p => E.restructureInfo(p));
  if (r) { const cap0 = r.cap, info = E.restructure(r.id); assert.ok(r.cap < cap0 && info.save > 0 && r.restr); }
  // a counter can name a specific player of yours
  let named = false;
  for (const t of E.teamList().filter(t => t !== 'NYJ')) {
    const tgt = E.roster(t).filter(p => p.ovr >= 76 && p.ovr <= 86)[0]; if (!tgt) continue;
    const c = E.counterTrade(t, G.picks.filter(k => k.owner === 'NYJ' && k.rd >= 4).map(k => k.id).slice(0, 1), [tgt.id]);
    if (c && c.some(x => /^They want /.test(x.label))) { named = true; break; }
  }
  assert.ok(named, 'some GM asks for a player by name');
});

test('fifth-year options, captains, and ratings that do not inflate', () => {
  E.newGame(DATA, 'MIN', 2);
  const G = E.G, c = E.captains();
  assert.ok(c.off && c.def && G.players[c.off].tm === 'MIN', 'every team starts with captains');
  const plain = E.roster('MIN').find(p => p.ovr >= 86 && !E.isCaptain(p.id) && p.age < 29);
  if (plain) assert.ok(E.chemTrade([c.off], []).d < E.chemTrade([plain.id], []).d, 'trading a captain costs more');
  const before = Object.fromEntries(Object.values(G.players).filter(p => G.teams[p.tm]).map(p => [p.id, p.ovr]));
  E.simTo(18); E.startPlayoffs(); while (E.simPlayoffRound());
  E.beginOffseason(); E.runCamp();
  const ch = Object.keys(before).filter(id => G.players[id] && G.teams[G.players[id].tm]).map(id => G.players[id].ovr - before[id]);
  const avg = ch.reduce((a, b) => a + b, 0) / ch.length;
  assert.ok(Math.abs(avg) < 1.2, `the league average moved ${avg.toFixed(2)}`);
  assert.ok(Math.max(...ch) <= 13, 'nobody jumps more than 13 in a year, a mid-season breakout included');
  const L = E.optionList();
  assert.ok(L.length >= 1, 'a 2024 first-rounder is due for his option in 2027');
  const x = L[0], end = x.p.end;
  assert.ok(E.decideOption(x.p.id, true));
  assert.equal(x.p.end, end + 1);
  assert.ok(x.p.opt && x.p.opt.cap >= x.p.cap);
});

test('attributes and a deeper trade model: timelines, roster spots and memory', () => {
  E.newGame(DATA, 'NYJ', 31);
  const G = E.G, P = n => Object.values(G.players).find(x => x.n === n);
  // attributes follow the player: offsets from OVR, shown as 35-99
  const lamar = P('Lamar Jackson');
  const at = Object.fromEntries(E.attrList(lamar).map(x => [x.k, x.v]));
  assert.ok(at.Mobility > at.Accuracy, 'Lamar runs better than he throws on target');
  lamar.ovr += 3; assert.equal(E.attr(lamar, 'Mobility'), at.Mobility + 3); lamar.ovr -= 3;
  // a young riser suits a rebuilder's timeline better than a contender's
  const young = E.roster('NYJ').filter(p => p.age <= 24 && p.ovr >= 72 && p.end >= 2028)[0];
  if (young) assert.ok(E.timelineFactor(young, 'Rebuilding') >= E.timelineFactor(young, 'Contender'));
  // three players for one costs them roster spots
  const mine = E.roster('NYJ').filter(p => p.ovr >= 65 && p.pos !== 'K' && p.pos !== 'P').slice(0, 3).map(p => p.id);
  const theirs = E.roster('LV').filter(p => p.ovr >= 75)[0].id;
  const ev3 = E.evalTrade('LV', mine, [theirs]), ev1 = E.evalTrade('LV', mine.slice(0, 1), [theirs]);
  assert.ok(ev3.spotCost > ev1.spotCost, 'extra bodies cost roster spots');
  // fleece a team and they remember
  G.trust = {LV: -2};
  assert.ok(E.evalTrade('LV', mine.slice(0, 1), [theirs]).need > ev1.need, 'they ask for more after a lopsided deal');
});

test('future draft classes carry real names, and later years hide a few legends', () => {
  E.newGame(DATA, 'NYJ', 51);
  const c28 = E.scoutedClass(2028), c29 = E.scoutedClass(2029), c32 = E.scoutedClass(2032);
  assert.equal(c28.length, 260);
  assert.ok(c28.some(p => p.n === 'Bryce Underwood' && p.rank <= 40), 'the top 2025 recruits headline the 2028 class');
  // a recruit enters the draft the year the college model picked: Pepe barely played as a freshman, so he redshirts
  const c30 = E.scoutedClass(2030), pepe = [...c29, ...c30].find(p => p.n === 'Keenyi Pepe');
  assert.ok(pepe && pepe.path, 'top recruits carry their college path');
  assert.ok(c29.filter(p => p.path).length > 150, 'boards fill with real college players below the recruits');
  assert.ok(E.scoutedClass(2027).slice(150).some(p => p.path), 'the 2027 board past the top 150 uses real college seniors');
  assert.ok(c29.some(p => p.n === 'Willie Beamen') && !c28.some(p => p.egg), 'legends stay in the later years');
  assert.ok(c32.some(p => p.n === 'Baby Gronk' && p.egg), 'Baby Gronk is in the 2032 class');
  assert.equal(new Set(c28.map(p => p.rank)).size, 260, 'every board rank is unique');
});

test('no new injuries before the first deadline, and Week 1 injuries heal', () => {
  E.newGame(DATA, 'BUF', 8);
  const hurt = Object.values(E.G.players).filter(p => p.inj);
  assert.ok(hurt.every(p => p.injW >= 1), 'every kickoff injury has a return date');
  E.simTo(9);
  assert.equal((E.G.injLog || []).length, 0, 'the user got a new injury before taking control');
  assert.ok(hurt.filter(p => !p.inj).length > hurt.length / 3, 'most short-term injuries are healed by the deadline');
});

test('the upgrade finder offers fits, budget options and splashes', () => {
  E.newGame(DATA, 'NYJ', 9);
  E.simTo(9); E.G.phase = 'deadline';
  const T = E.upgradeTargets('QB');
  assert.deepEqual(T.tr.map(t => t.tier), ['Best fits', 'Budget', 'Splash']);
  const names = T.tr.flatMap(t => t.list.map(x => x.p.id));
  assert.equal(new Set(names).size, names.length, 'a player shows up in only one tier');
  for (const t of T.tr) for (const x of t.list) assert.ok(x.gain > 0);
});

test('a call takes some negotiating: a fair first offer gets a small ask, an overpay gets a yes, and every answer says why', () => {
  E.newGame(DATA, 'NYJ', 10);
  E.simTo(9); E.G.phase = 'deadline';
  const tgt = E.roster('WAS').filter(p => p.ovr >= 74 && p.ovr <= 86 && p.cap < 12 && p.pos !== 'K' && p.pos !== 'P').sort((a, b) => b.ovr - a.ovr)[0];
  const picks = E.G.picks.filter(k => k.owner === 'NYJ').sort((a, b) => a.yr - b.yr || a.rd - b.rd).map(k => k.id);
  const low = E.proposeTrade('WAS', [picks[picks.length - 1]], [tgt.id]);
  assert.ok(['laugh', 'close', 'counter'].includes(low.kind), low.kind);
  assert.ok(low.why && low.why.length >= 2 && /worth/.test(low.why.join(' ')), 'the answer comes with reasons');
  assert.ok(E.talkWith('WAS').patience < 3, 'a lowball costs patience');
  const big = E.proposeTrade('WAS', picks.slice(0, 2), [tgt.id]);
  assert.equal(big.kind, 'yes', big.line);
  while (E.talkWith('WAS').patience > 0) E.proposeTrade('WAS', [picks[picks.length - 1]], [tgt.id]);
  assert.equal(E.proposeTrade('WAS', picks.slice(0, 2), [tgt.id]).kind, 'done', 'out of patience means no more calls');
  // a fresh call at a fair price: they want one more piece first
  E.newGame(DATA, 'NYJ', 12); E.simTo(9); E.G.phase = 'deadline';
  const t2 = E.roster('WAS').filter(p => p.ovr >= 74 && p.ovr <= 86 && p.cap < 12 && p.pos !== 'K' && p.pos !== 'P').sort((a, b) => b.ovr - a.ovr)[0];
  const fair = E.balanceTrade('WAS', [], [t2.id]);
  if (fair) { const r = E.proposeTrade('WAS', fair, [t2.id]); assert.notEqual(r.kind, 'yes', 'a merely fair first offer is not an instant yes'); }
});

test('team quality drives wins about as much as in the real NFL, and a perfect season is possible but rare', () => {
  const sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
  const sds = [];
  for (let s = 1; s <= 12; s++) { E.newGame(DATA, 'NYJ', 500 + s); E.simTo(18); sds.push(sd(E.teamList().map(t => E.record(t, 2026).w))); }
  const avg = sds.reduce((a, x) => a + x, 0) / sds.length;
  assert.ok(avg > 2.6 && avg < 3.5, `league win spread ${avg.toFixed(2)} should be near the NFL's 3.1`);
  // a stacked team is a big favourite but never a lock
  E.newGame(DATA, 'DET', 1);
  for (const p of E.roster('DET')) p.ovr += 12;
  const p = E.winProbR(E.teamRating('DET'), E.teamRating('BUF'), true);
  assert.ok(p > .75 && p < .92, `a superteam beats a good team ${(p * 100).toFixed(0)}% of the time`);
});

test('an elite QB is worth several wins, a running back much less', () => {
  E.newGame(DATA, 'NYJ', 3);
  const qb = E.winsDelta('NYJ', [byName('Josh Allen').id], []), rb = E.winsDelta('NYJ', [byName('Bijan Robinson').id], []);
  assert.ok(qb > 3 && qb < 7, `QB ${qb.toFixed(1)} wins`);
  assert.ok(rb < 1, `RB ${rb.toFixed(1)} wins`);
});

test('leftover stars do not sign for the minimum', () => {
  E.newGame(DATA, 'LAC', 6);
  const G = E.G;
  E.simTo(18); E.startPlayoffs(); while (E.simPlayoffRound());
  E.beginOffseason(); G.phase = 'offseason'; G.step = 'resign';
  E.finishResign(); E.finishFA(); E.finishDraft();
  for (const id of E.cutPlan()) E.cutPlayer(id);
  E.startSeason2();
  assert.equal((G.autoFilled || []).filter(x => x.ovr >= 75).length, 0);
  for (const t of E.teamList()) assert.ok(Number.isFinite(E.capSpace(t)), `${t} cap space is not a number`);
});

test('a call can keep going: ask, sweeten, and a final offer that is too low ends it', () => {
  E.newGame(DATA, 'NYJ', 11);
  E.simTo(9); E.G.phase = 'deadline';
  const tgt = E.roster('WAS').filter(p => p.ovr >= 78 && p.cap < 15 && p.pos !== 'K' && p.pos !== 'P').sort((a, b) => b.ovr - a.ovr)[0];
  const picks = E.G.picks.filter(k => k.owner === 'NYJ').sort((a, b) => a.yr - b.yr || a.rd - b.rd).map(k => k.id);
  E.proposeTrade('WAS', [picks[picks.length - 1]], [tgt.id]);
  const ask = E.talkMove('WAS', 'ask');
  assert.equal(ask.kind, 'counter');
  assert.ok(ask.counters[0].give.length > 1 || ask.counters[0].give[0] !== picks[picks.length - 1], 'their ask is more than a late pick');
  const before = E.talkWith('WAS').deal.give.length;
  E.talkMove('WAS', 'add', E.talkAssets('WAS', 'add')[0].id);
  assert.equal(E.talkWith('WAS').deal.give.length, before + 1);
  const fin = E.talkMove('WAS', 'final');
  assert.notEqual(fin.kind, 'yes', 'a lowball final offer is not accepted');
});

test('the trade block brings offers for what you ask for, and says why when nobody bites', () => {
  E.newGame(DATA, 'NYJ', 3);
  E.simTo(9); E.G.phase = 'deadline';
  const lb = byName('Jamien Sherwood');
  E.toggleBlock(lb.id);
  E.setBlockWant('players', 'CB');
  const offers = E.blockOffers();
  assert.ok(offers.length >= 1);
  for (const o of offers) assert.ok(o.get.every(id => E.G.players[id] && E.G.players[id].pos === 'CB'), 'only corners come back');
  assert.match(E.whyNoMarket(byName('Breece Hall').id, 'any'), /\w/);
});

test('expiring contracts do not count against the cap while you decide, and cutting frees room', () => {
  E.newGame(DATA, 'BUF', 12);
  const G = E.G;
  E.simTo(18); E.startPlayoffs(); while (E.simPlayoffRound());
  E.beginOffseason(); G.phase = 'offseason'; G.step = 'resign';
  const pending = Object.keys(G.resign).map(id => G.players[id]);
  const counted = E.roster('BUF').filter(p => p.end >= G.season).reduce((a, p) => a + p.cap, 0) + (G.dead.BUF || 0);
  assert.ok(Math.abs(E.payroll('BUF') - counted) < .01, 'payroll counts only contracts that run into 2027');
  assert.ok(pending.length > 0 && pending.every(p => p.end < G.season));
  const before = E.capSpace('BUF');
  const cut = E.roster('BUF').filter(p => p.end > G.season && p.cap > 3).sort((a, b) => a.ovr - b.ovr)[0];
  E.cutPlayer(cut.id);
  assert.ok(E.capSpace('BUF') > before, 'cutting a player under contract frees cap room');
});

test('the league keeps going past 2027: new cap, new draft class, full rosters, valid contracts', () => {
  E.newGame(DATA, 'PHI', 13);
  const G = E.G;
  for (let yr = 2027; yr <= 2028; yr++) {
    E.simTo(18); E.startPlayoffs(); while (E.simPlayoffRound());
    E.beginOffseason(); G.phase = 'offseason'; G.step = 'resign';
    assert.equal(G.season, yr);
    assert.ok(G.cap[yr] > G.cap[yr - 1], 'the cap grows');
    E.finishResign(); E.finishFA();
    assert.equal(G.draft.pool.length, 260, `${yr} has a full draft class`);
    E.finishDraft();
    for (const id of E.cutPlan()) E.cutPlayer(id);
    E.startSeason2();
    for (const t of E.teamList()) assert.ok(E.roster(t).length >= 53, `${t} fields 53 in ${yr}`);
    assert.ok([yr + 1, yr + 2].every(y => G.picks.some(k => k.yr === y)), 'picks for the next two drafts');
  }
  const bad = Object.values(G.players).filter(p => G.teams[p.tm] && (p.end < G.season || !Number.isFinite(p.cap)));
  assert.equal(bad.length, 0, 'every rostered player has a live contract');
});

test('contracts match real lengths', () => {
  E.newGame(DATA, 'NYJ', 1);
  assert.equal(byName('Justin Herbert').end, 2029);
  assert.equal(byName('Joe Burrow').end, 2029);
  assert.equal(byName('Trevor Lawrence').end, 2030);
});

test('season stats land in real NFL ranges and every game keeps a box score', () => {
  E.newGame(DATA, 'DET', 11);
  E.simTo(18);
  const S = E.G.stats[E.G.season], rows = Object.entries(S).map(([id, s]) => ({p: E.G.players[id], s})).filter(x => x.p);
  const top = (pos, k) => Math.max(...rows.filter(x => pos.includes(x.p.pos)).map(x => x.s[k] || 0));
  const per = k => rows.reduce((a, x) => a + (x.s[k] || 0), 0) / 32;
  assert.ok(top(['QB'], 'py') > 4000 && top(['QB'], 'py') < 5600, 'top passer');
  assert.ok(top(['RB'], 'ry') > 1100 && top(['RB'], 'ry') < 2200, 'top rusher');
  assert.ok(top(['WR', 'TE'], 'recy') > 1300 && top(['WR', 'TE'], 'recy') < 2400, 'top receiver');
  assert.ok(top(['EDGE', 'DT', 'LB'], 'sk') >= 12 && top(['EDGE', 'DT', 'LB'], 'sk') <= 27, 'top pass rusher');
  assert.ok(top(['LB', 'S', 'CB'], 'tkl') > 110 && top(['LB', 'S', 'CB'], 'tkl') < 210, 'top tackler');
  const pct = per('cmp') / per('att');
  assert.ok(pct > .6 && pct < .7, `completion rate ${pct}`);
  assert.ok(per('sk') > 30 && per('sk') < 50, 'sacks per team');
  assert.ok(per('py') > 3300 && per('py') < 4300, 'pass yards per team');
  // the box score adds up to the team line and decodes back to players
  const g = E.G.results[E.G.season][0], L = E.unpackBox(g.ba.box);
  assert.ok(L.length >= 8 && L.every(r => E.G.players[r.id]));
  assert.equal(L.reduce((a, r) => a + (r.st.recy || 0), 0) <= g.ba.py + 2, true);
  assert.equal(L.reduce((a, r) => a + (r.st.att || 0), 0), g.ba.att);
});

test('free agents answer right away: a fair offer signs, a near miss gets a counter, lowballs end the talks', () => {
  E.newGame(DATA, 'NYJ', 21);
  E.simTo(18); E.startPlayoffs(); while (E.simPlayoffRound()); E.G.phase = 'seasondone';
  E.beginOffseason(); E.G.phase = 'offseason'; E.finishResign();
  const pool = E.faPool().filter(p => E.faPrice(p) * 1.1 < E.capSpace(E.G.user)).slice(0, 3);
  const [a, b, c] = pool, y = p => E.yearsFor(p);
  assert.equal(E.faBid(a.id, E.faPrice(a, y(a)), y(a)).result, 'signed');
  const r = E.faBid(b.id, E.faFloor(b, y(b)) * .95, y(b));          // just under what he will take
  assert.equal(r.result, 'counter');
  assert.equal(E.faBid(b.id, r.counter, y(b)).result, 'signed');
  for (let i = 0; i < 2; i++) assert.equal(E.faBid(c.id, 1, y(c)).result, 'no');
  assert.equal(E.faBid(c.id, 1, y(c)).result, 'walked');
  assert.equal(E.faBid(c.id, E.faPrice(c, y(c)), y(c)).result, 'walked');
});

test('the cut plan never suggests this year’s early draft picks, and players can cover a neighbouring position', () => {
  E.newGame(DATA, 'DAL', 22);
  E.simTo(18); E.startPlayoffs(); while (E.simPlayoffRound()); E.G.phase = 'seasondone';
  E.beginOffseason(); E.G.phase = 'offseason'; E.finishResign(); E.finishFA(); E.finishDraft();
  const plan = E.cutPlan().map(id => E.G.players[id]);
  assert.ok(!plan.some(p => p.draft && p.draft <= 128 && p.end === E.G.season + 3), 'an early-round rookie was suggested');
  const ot = E.cached(() => E.depth('DAL').OT[2])();
  E.setFlex(ot.id, 'IOL');
  assert.ok(E.cached(() => E.depth('DAL').IOL.includes(ot))());
  assert.equal(E.flexPen(ot, 'IOL'), 2);
  E.setFlex(ot.id, null);
  assert.ok(E.cached(() => E.depth('DAL').OT.includes(ot))());
});

test('coach plans: phasing a young player in takes four games, banks playing time, and teams pay less for the benched starter', () => {
  E.newGame(DATA, 'NYJ', 3);
  const G = E.G;
  const young = E.roster('NYJ').find(p => E.coachPlans(p.id) && p.pos === 'TE') || E.roster('NYJ').find(p => E.coachPlans(p.id));
  const C = E.coachPlans(young.id);
  assert.equal(C.opts.length, 4);
  assert.equal(C.opts.filter(o => o.pick).length, 1, 'the coach has one pick');
  const vet = C.v, other = E.teamList().find(t => t !== 'NYJ');
  const before = E.valueParts(vet, other).total;
  E.setCoachPlan(young.id, 'phase');
  assert.ok(E.valueParts(vet, other).total < before, 'a starter being phased out is worth less to other teams');
  G.phase = 'season';
  for (let w = 1; w <= 5; w++) E.simWeek(w);
  assert.equal(G.plans[young.id].plan, 'start', 'after four games he has the job');
  assert.ok(young.devShare > 1, 'his playing time counts toward his growth');
  const L = E.depth('NYJ')[young.pos];
  if (L.includes(vet) && L.includes(young)) assert.ok(L.indexOf(young) < L.indexOf(vet), 'he is ahead of the veteran on the depth chart');
});

test('in-season development: streaks move week to week, young players grow, a few break out', () => {
  E.newGame(DATA, 'KC', 7);
  const G = E.G, before = Object.fromEntries(Object.values(G.players).map(p => [p.id, p.ovr]));
  G.phase = 'season'; E.simTo(18);
  const brk = Object.values(G.players).filter(p => p.brk === 2026);
  assert.ok(brk.length >= 3 && brk.length <= 30, `breakouts this season: ${brk.length}`);
  const young = Object.values(G.players).filter(p => G.teams[p.tm] && p.age <= 23);
  const gain = young.reduce((a, p) => a + p.ovr - before[p.id], 0) / young.length;
  assert.ok(gain > 0.2, 'young players improve during the season');
  assert.ok(Object.values(G.streak).some(v => v >= 2) && Object.values(G.streak).some(v => v <= -2), 'hot and cold streaks');
});
