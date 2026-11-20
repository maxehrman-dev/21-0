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
  const r = E.faBid(b.id, E.faPrice(b, y(b)) * .85, y(b));
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
