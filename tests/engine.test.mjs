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
  assert.equal(E.G.picks.length, 32 * 4 * 2);
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

test('AI offers come in at least threes and are fair to you', () => {
  E.newGame(DATA, 'NYJ', 5);
  E.simTo(9); E.G.phase = 'deadline';
  const offers = E.refreshOffers();
  assert.ok(offers.length >= 3, `only ${offers.length} offers`);
  for (const o of offers) {
    const ev = cached(() => E.evalTrade(o.from, o.give, o.get));
    assert.ok(ev.fair >= .85, `${o.from} offer is unfair to you (${ev.fair.toFixed(2)})`);
    assert.equal(ev.issues.length, 0, ev.issues.join('; '));
  }
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

test('a trade call answers with a yes, a counter or a laugh, and lowballs cost patience', () => {
  E.newGame(DATA, 'NYJ', 10);
  E.simTo(9); E.G.phase = 'deadline';
  const tgt = E.roster('WAS').filter(p => p.pos === 'WR').sort((a, b) => b.ovr - a.ovr)[0];
  const picks = E.G.picks.filter(k => k.owner === 'NYJ').sort((a, b) => a.yr - b.yr || a.rd - b.rd).map(k => k.id);
  const low = E.proposeTrade('WAS', [picks[picks.length - 1]], [tgt.id]);
  assert.ok(['laugh', 'close', 'counter'].includes(low.kind), low.kind);
  assert.ok(E.talkWith('WAS').patience < 3, 'a lowball costs patience');
  const big = E.proposeTrade('WAS', picks.slice(0, 2), [tgt.id]);
  assert.equal(big.kind, 'yes', big.line);
  while (E.talkWith('WAS').patience > 0) E.proposeTrade('WAS', [picks[picks.length - 1]], [tgt.id]);
  assert.equal(E.proposeTrade('WAS', picks.slice(0, 2), [tgt.id]).kind, 'done', 'out of patience means no more calls');
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

test('a call can keep going: ask, sweeten, bluff, and a final offer that is too low ends it', () => {
  E.newGame(DATA, 'NYJ', 11);
  E.simTo(9); E.G.phase = 'deadline';
  const star = byName('Josh Allen');
  const picks = E.G.picks.filter(k => k.owner === 'NYJ').sort((a, b) => a.yr - b.yr || a.rd - b.rd).map(k => k.id);
  E.proposeTrade(star.tm, [picks[picks.length - 1]], [star.id]);
  const ask = E.talkMove(star.tm, 'ask');
  assert.equal(ask.kind, 'counter');
  assert.ok(ask.counters[0].give.length > 1, 'their ask is more than a late pick');
  const before = E.talkWith(star.tm).deal.give.length;
  E.talkMove(star.tm, 'add', E.talkAssets(star.tm, 'add')[0].id);
  assert.equal(E.talkWith(star.tm).deal.give.length, before + 1);
  const fin = E.talkMove(star.tm, 'final');
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
