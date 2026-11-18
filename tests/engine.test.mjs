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
