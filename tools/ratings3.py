"""Player ratings, built the way Madden's behave, from everything public about how a player plays.

For every season 2023-2026 a player gets a production score from many position-specific measures
(box score, efficiency, Pro Football Reference advanced stats, NFL Next Gen Stats), each compared with the
other players at his position that season. Those seasons become three views of him:
  current form (2025-26), his four-year track record, and his best recent season (peak).
Ratings are sticky like Madden's: the three views are blended, so a hot half-season or an injury moves him
only a little. Then come his role (snap share in the games he played), the market (his contract), draft
pedigree while he is young, and a position-specific age curve. Positions are mapped onto Madden-like tiers:
the best at a spot about 95 (97 only when he is clearly ahead), 90+ only for the league's elite, an average starter in the mid 70s.

It writes OVR (field 5), track record (12), potential (13) and the reasons behind the rating (18) into
data.json and leaves every other field, contracts included, as it is.

Like Madden, reputation is sticky: a player's best seasons since 2019 (his legacy) still count, so a proven
star in a quieter year stays near the top while a one-year breakout climbs more slowly.

Quarterbacks also carry their winning, as in Madden: win rate in their starts since 2019 (recent years count
more), plus playoff wins and Super Bowl titles, from the nflverse schedule file (games.csv, with starting QBs).

Every player also gets Madden-style attributes (QB accuracy, arm, decisions, poise, mobility; a corner's coverage,
ball skills and tackling; and so on), built from the same measures. Linemen, who have almost no stats of their own,
are graded on how their line played while they were on the field: sack rate for pass blocking, yards per carry and
rushing EPA for run blocking. Attributes are stored as offsets from OVR, so they move with the player in the game.

Usage: python3 tools/ratings3.py <folder with the nflverse csvs> [folder with stats_player_reg_2019-2022.csv] [games.csv]
"""
import csv, json, math, os, statistics, sys
from collections import defaultdict

here = os.path.dirname(os.path.abspath(__file__))
dl = sys.argv[1]
dpath = os.path.join(here, '..', 'data.json')
data = json.load(open(dpath))
YEARS = (2023, 2024, 2025, 2026)
OLD = (2019, 2020, 2021, 2022)
old_dl = sys.argv[2] if len(sys.argv) > 2 else dl
games_csv = sys.argv[3] if len(sys.argv) > 3 else os.path.join(dl, 'games.csv')

def f(x):
    try: return float(x)
    except (TypeError, ValueError): return None
def n0(x): v = f(x); return 0.0 if v is None else v
def rows(name):
    with open(os.path.join(dl, name), newline='', encoding='utf-8') as fh:
        return list(csv.DictReader(fh))

meta = {r['gsis_id']: r for r in rows('players.csv')}
SP = {}
for yr in YEARS:
    for r in rows(f'stats_player_reg_{yr}.csv'): SP[(r['player_id'], yr)] = r
for yr in OLD:
    fp = os.path.join(old_dl, f'stats_player_reg_{yr}.csv')
    if os.path.exists(fp):
        with open(fp, newline='', encoding='utf-8') as fh:
            for r in csv.DictReader(fh): SP[(r['player_id'], yr)] = r
def by_pfr(name):
    out = {}
    for r in rows(name):
        if r.get('season'): out[(r['pfr_id'], int(r['season']))] = r
    return out
DEF, PAS, RUS, REC = by_pfr('advstats_season_def.csv'), by_pfr('advstats_season_pass.csv'), by_pfr('advstats_season_rush.csv'), by_pfr('advstats_season_rec.csv')
def ngs(name):
    out = {}
    for r in rows(name):
        if r['week'] == '0' and r['season_type'] == 'REG': out[(r['player_gsis_id'], int(r['season']))] = r
    return out
NP, NR, NU = ngs('ngs_passing.csv'), ngs('ngs_receiving.csv'), ngs('ngs_rushing.csv')

team_games, snaps = {}, defaultdict(lambda: [0.0, 0])
snap_team = defaultdict(lambda: defaultdict(int))
for yr in (2025, 2026):
    tg, rs = defaultdict(set), []
    for r in rows(f'snap_counts_{yr}.csv'):
        if r['game_type'] != 'REG': continue
        tg[r['team']].add(r['game_id']); rs.append(r)
    team_games[yr] = max(len(v) for v in tg.values())
    for r in rs:
        s = snaps[(r['pfr_player_id'], yr)]
        s[0] += max(n0(r['offense_pct']), n0(r['defense_pct'])); s[1] += 1
        if n0(r['offense_pct']) >= .5: snap_team[(r['pfr_player_id'], yr)][r['team']] += 1
def snap_share(pid, yr):
    pfr = meta.get(pid, {}).get('pfr_id')
    s = snaps.get((pfr, yr)) if pfr else None
    if not s or not s[1]: return None
    return s[0] / s[1] * (.85 + .15 * min(1.0, s[1] / team_games[yr]))   # missed games barely count, like Madden

def per(a, b): return a / b if b else None

# ---------- the measures: (label, weight, higher is better, function of one season) ----------
def M_QB(c):
    s, pa, ng = c['sp'], c['pass'], c['ngp']
    drop = n0(s.get('attempts')) + n0(s.get('sacks_suffered'))
    plays = drop + n0(s.get('carries'))
    any_a = per(n0(s.get('passing_yards')) - n0(s.get('sack_yards_lost')) + 20 * n0(s.get('passing_tds')) - 45 * n0(s.get('passing_interceptions')), drop)
    return [('EPA per play', .26, 1, per(n0(s.get('passing_epa')) + n0(s.get('rushing_epa')), plays)),
            ('Adjusted yards per attempt', .16, 1, any_a),
            ('Completion % over expected', .14, 1, f(ng.get('completion_percentage_above_expectation')) if ng else f(s.get('passing_cpoe'))),
            ('Accuracy (on target)', .1, 1, f(pa.get('on_tgt_pct')) if pa else None),
            ('Avoiding sacks', .08, -1, per(n0(s.get('sacks_suffered')), drop)),
            ('Avoiding interceptions', .08, -1, per(n0(s.get('passing_interceptions')), n0(s.get('attempts')))),
            ('Big plays', .06, 1, per(n0(s.get('passing_20')), n0(s.get('attempts')))),
            ('Running', .07, 1, per(n0(s.get('rushing_yards')), max(1, n0(s.get('games'))))),
            ('Under pressure', .05, -1, f(pa.get('bad_throw_pct')) if pa else None)]
def M_RB(c):
    s, ru, ng, g = c['sp'], c['rush'], c['ngu'], max(1, n0(c['sp'].get('games')))
    car, tch = n0(s.get('carries')), n0(s.get('carries')) + n0(s.get('targets'))
    return [('Yards after contact', .17, 1, f(ru.get('yac_att')) if ru else None),
            ('Rush yards over expected', .17, 1, f(ng.get('rush_yards_over_expected_per_att')) if ng else None),
            ('Breaking tackles', .1, 1, per(n0(ru.get('brk_tkl')), car) if ru else None),
            ('EPA per touch', .14, 1, per(n0(s.get('rushing_epa')) + n0(s.get('receiving_epa')), tch)),
            ('Scrimmage yards', .16, 1, (n0(s.get('rushing_yards')) + n0(s.get('receiving_yards'))) / g),
            ('Receiving', .1, 1, n0(s.get('receiving_yards')) / g),
            ('Explosive runs', .08, 1, per(n0(s.get('rushing_20')), car)),
            ('Ball security', .08, -1, per(n0(s.get('rushing_fumbles_lost')) + n0(s.get('receiving_fumbles_lost')), tch))]
def M_REC(c):
    s, re, ng, g = c['sp'], c['rec'], c['ngr'], max(1, n0(c['sp'].get('games')))
    tg = n0(s.get('targets'))
    return [('Yards per game', .2, 1, n0(s.get('receiving_yards')) / g),
            ('EPA per target', .15, 1, per(n0(s.get('receiving_epa')), tg)),
            ('Target share', .13, 1, f(s.get('target_share'))),
            ('Air yards share', .07, 1, f(s.get('air_yards_share'))),
            ('Getting open', .1, 1, f(ng.get('avg_separation')) if ng else None),
            ('After the catch', .1, 1, f(ng.get('avg_yac_above_expectation')) if ng else None),
            ('Hands', .1, -1, f(re.get('drop_percent')) if re else None),
            ('Moving the chains', .1, 1, n0(s.get('receiving_first_downs')) / g),
            ('Scoring', .05, 1, n0(s.get('receiving_tds')) / g)]
def M_PASSRUSH(c):
    s, d, g = c['sp'], c['def'], max(1, n0(c['sp'].get('games')))
    return [('Pressure', .3, 1, n0(d.get('prss')) / g if d else None),
            ('Sacks', .2, 1, n0(s.get('def_sacks')) / g),
            ('QB knockdowns', .1, 1, n0(d.get('qbkd')) / g if d else None),
            ('Run stops (TFL)', .17, 1, n0(s.get('def_tackles_for_loss')) / g),
            ('Tackling', .12, -1, f(d.get('m_tkl_percent')) if d else None),
            ('Forced fumbles', .06, 1, n0(s.get('def_fumbles_forced')) / g),
            ('Batted passes', .05, 1, n0(d.get('bats')) / g if d else None)]
def coverage(d):
    if not d or n0(d.get('tgt')) < 10: return None, None, None
    return f(d.get('rat')), f(d.get('yds_tgt')), f(d.get('cmp_percent'))
def M_LB(c):
    s, d, g = c['sp'], c['def'], max(1, n0(c['sp'].get('games')))
    rat, ypt, cmp = coverage(d)
    return [('Tackles', .14, 1, (n0(s.get('def_tackles_solo')) + .5 * n0(s.get('def_tackle_assists'))) / g),
            ('Tackling', .18, -1, f(d.get('m_tkl_percent')) if d else None),
            ('Run stops (TFL)', .14, 1, n0(s.get('def_tackles_for_loss')) / g),
            ('Pass rush', .12, 1, n0(d.get('prss')) / g if d else None),
            ('Coverage (rating allowed)', .18, -1, rat),
            ('Coverage (yards per target)', .12, -1, ypt),
            ('Ball skills', .12, 1, (n0(s.get('def_interceptions')) * 2 + n0(s.get('def_pass_defended'))) / g)]
def M_CB(c):
    s, d, g = c['sp'], c['def'], max(1, n0(c['sp'].get('games')))
    rat, ypt, cmp = coverage(d)
    return [('Coverage (rating allowed)', .26, -1, rat),
            ('Coverage (yards per target)', .2, -1, ypt),
            ('Coverage (catch rate allowed)', .14, -1, cmp),
            ('Interceptions', .12, 1, n0(s.get('def_interceptions')) / g),
            ('Pass breakups', .16, 1, n0(s.get('def_pass_defended')) / g),
            ('Tackling', .12, -1, f(d.get('m_tkl_percent')) if d else None)]
def M_S(c):
    s, d, g = c['sp'], c['def'], max(1, n0(c['sp'].get('games')))
    rat, ypt, cmp = coverage(d)
    return [('Coverage (rating allowed)', .2, -1, rat),
            ('Coverage (yards per target)', .14, -1, ypt),
            ('Interceptions', .14, 1, n0(s.get('def_interceptions')) / g),
            ('Pass breakups', .1, 1, n0(s.get('def_pass_defended')) / g),
            ('Tackling', .16, -1, f(d.get('m_tkl_percent')) if d else None),
            ('Tackles', .1, 1, (n0(s.get('def_tackles_solo')) + .5 * n0(s.get('def_tackle_assists'))) / g),
            ('Run stops (TFL)', .08, 1, n0(s.get('def_tackles_for_loss')) / g),
            ('Blitzing', .08, 1, n0(d.get('prss')) / g if d else None)]
def M_K(c):
    s = c['sp']; att = n0(s.get('fg_att'))
    long_att = n0(s.get('fg_made_50_59')) + n0(s.get('fg_made_60_')) + n0(s.get('fg_missed_50_59')) + n0(s.get('fg_missed_60_'))
    return [('Accuracy', .4, 1, per(n0(s.get('fg_made')), att)),
            ('Range (50+)', .3, 1, per(n0(s.get('fg_made_50_59')) + n0(s.get('fg_made_60_')), max(1, long_att)) if long_att >= 2 else None),
            ('Extra points', .15, 1, f(s.get('pat_pct'))),
            ('Long makes', .15, 1, n0(s.get('fg_made_50_59')) + 2 * n0(s.get('fg_made_60_')))]
def M_P(c):
    s = c['sp']; n = n0(s.get('pt_att'))
    return [('Net average', .45, 1, per(n0(s.get('pt_net_yards')), n)),
            ('Gross average', .2, 1, per(n0(s.get('pt_yards')), n)),
            ('Inside the 20', .25, 1, per(n0(s.get('pt_inside_20')), n)),
            ('Touchbacks', .1, -1, per(n0(s.get('pt_touchback')), n))]
def M_OL(c):
    s, g = c['sp'], max(1, n0(c['sp'].get('games')))
    return [('Clean play (penalties)', 1.0, -1, n0(s.get('penalties')) / g)]
MEAS = {'QB': M_QB, 'RB': M_RB, 'WR': M_REC, 'TE': M_REC, 'EDGE': M_PASSRUSH, 'DT': M_PASSRUSH, 'LB': M_LB, 'CB': M_CB, 'S': M_S, 'K': M_K, 'P': M_P, 'OT': M_OL, 'IOL': M_OL}
def qualifies(pos, s, d):
    gm = n0(s.get('games'))
    if gm < 3: return False
    if pos == 'QB': return n0(s.get('attempts')) >= 100
    if pos == 'RB': return n0(s.get('carries')) >= 40
    if pos in ('WR', 'TE'): return n0(s.get('targets')) >= 20
    if pos == 'K': return n0(s.get('fg_att')) >= 8
    if pos == 'P': return n0(s.get('pt_att')) >= 20
    if pos in ('OT', 'IOL'): return gm >= 6
    return gm >= 4

# ---------- one season's production, every player at a position against each other ----------
by_pos = defaultdict(list)
for p in data['players']: by_pos[p[2]].append(p)
def season_scores(pos, L, yr):
    vals, out = {}, {}
    for p in L:
        pid = p[0]; s = SP.get((pid, yr))
        if not s: continue
        pfr = meta.get(pid, {}).get('pfr_id')
        c = {'sp': s, 'def': DEF.get((pfr, yr)), 'pass': PAS.get((pfr, yr)), 'rush': RUS.get((pfr, yr)), 'rec': REC.get((pfr, yr)),
             'ngp': NP.get((pid, yr)), 'ngr': NR.get((pid, yr)), 'ngu': NU.get((pid, yr))}
        if not qualifies(pos, s, c['def']): continue
        vals[pid] = (MEAS[pos](c), n0(s.get('games')))
    if len(vals) < 4: return out
    labels = [m[0] for m in next(iter(vals.values()))[0]]
    stat = {}
    for i, lab in enumerate(labels):
        xs = [v[0][i][3] for v in vals.values() if v[0][i][3] is not None]
        stat[lab] = (statistics.mean(xs), statistics.pstdev(xs) or 1) if len(xs) >= 4 else None
    for pid, (ms, gm) in vals.items():
        tot = wsum = 0.0; zs = []
        for lab, w, sign, v in ms:
            if v is None or not stat[lab]: continue
            m, sd = stat[lab]
            zz = max(-2.5, min(2.5, sign * (v - m) / sd))
            tot += w * zz; wsum += w; zs.append((zz, lab))
        if wsum < .4: continue
        conf = min(1.0, gm / 12)                                     # a short season says less
        out[pid] = (tot / wsum * conf - .4 * (1 - conf), zs, gm)
    return out

def zmap(d):
    xs = [v for v in d.values() if v is not None]
    if len(xs) < 3: return {k: 0.0 for k in d}
    m, sd = statistics.mean(xs), statistics.pstdev(xs) or 1
    return {k: (None if v is None else (v - m) / sd) for k, v in d.items()}

# ---------- quarterback winning: starts, playoff wins and titles since 2019 ----------
QBW = {}
try:
    with open(games_csv, newline='', encoding='utf-8') as fh: G_ROWS = list(csv.DictReader(fh))
except (OSError, csv.Error): G_ROWS = []
acc = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])           # weighted wins, weighted starts, playoff wins, titles
for r in G_ROWS:
    yr = int(r['season'] or 0)
    if yr < 2019 or r['home_score'] in ('', 'NA') or r['away_score'] in ('', 'NA'): continue
    w = 1.0 if yr >= 2023 else .6
    hs, as_ = float(r['home_score']), float(r['away_score'])
    for qb, me, them in ((r['home_qb_id'], hs, as_), (r['away_qb_id'], as_, hs)):
        if not qb or qb == 'NA': continue
        a = acc[qb]
        if r['game_type'] == 'REG':
            a[0] += w * (1 if me > them else .5 if me == them else 0); a[1] += w
        elif me > them:
            a[2] += w
            if r['game_type'] == 'SB': a[3] += w
for qb, (wn, st, pw, sb) in acc.items():
    if st < 8: continue
    QBW[qb] = (wn + 4) / (st + 8) + .025 * pw + .05 * sb    # win rate pulled toward .500 for short careers, then the playoffs

# ---------- attributes ----------
ATTR = {
    'QB': {'Accuracy': ['Completion % over expected', 'Accuracy (on target)'], 'Arm': ['Big plays', 'Adjusted yards per attempt'],
           'Decisions': ['Avoiding interceptions', 'EPA per play'], 'Poise': ['Avoiding sacks', 'Under pressure'], 'Mobility': ['Running']},
    'RB': {'Vision': ['Rush yards over expected', 'Explosive runs'], 'Power': ['Yards after contact', 'Breaking tackles'],
           'Receiving': ['Receiving'], 'Ball security': ['Ball security']},
    'WR': {'Route running': ['Getting open', 'Target share'], 'Hands': ['Hands'], 'After the catch': ['After the catch'],
           'Deep threat': ['Air yards share', 'Yards per game'], 'Chains': ['Moving the chains', 'Scoring']},
    'EDGE': {'Pass rush': ['Pressure', 'Sacks', 'QB knockdowns'], 'Run defense': ['Run stops (TFL)'], 'Tackling': ['Tackling'], 'Playmaking': ['Forced fumbles', 'Batted passes']},
    'LB': {'Coverage': ['Coverage (rating allowed)', 'Coverage (yards per target)', 'Ball skills'], 'Run defense': ['Run stops (TFL)', 'Tackles'],
           'Tackling': ['Tackling'], 'Pass rush': ['Pass rush']},
    'CB': {'Coverage': ['Coverage (rating allowed)', 'Coverage (yards per target)', 'Coverage (catch rate allowed)'], 'Ball skills': ['Interceptions', 'Pass breakups'], 'Tackling': ['Tackling']},
    'S': {'Coverage': ['Coverage (rating allowed)', 'Coverage (yards per target)'], 'Ball skills': ['Interceptions', 'Pass breakups'],
          'Run support': ['Tackles', 'Run stops (TFL)'], 'Tackling': ['Tackling'], 'Blitzing': ['Blitzing']},
    'K': {'Accuracy': ['Accuracy', 'Extra points'], 'Power': ['Range (50+)', 'Long makes']},
    'P': {'Distance': ['Net average', 'Gross average'], 'Placement': ['Inside the 20']},
}
ATTR['TE'] = ATTR['WR']; ATTR['DT'] = ATTR['EDGE']
REC_W = {2026: .35, 2025: .3, 2024: .2, 2023: .15}
# the line: a team's sack rate and rushing, season by season, z-scored across the league
team_line = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0, 0.0])   # sacks, dropbacks, rush yds, carries, rush epa
for (gid, yr), r in SP.items():
    if yr not in (2025, 2026): continue
    t = r.get('recent_team'); x = team_line[(t, yr)]
    if r.get('position') == 'QB': x[0] += n0(r.get('sacks_suffered')); x[1] += n0(r.get('attempts')) + n0(r.get('sacks_suffered'))
    if r.get('position') in ('RB', 'FB'): x[2] += n0(r.get('rushing_yards')); x[3] += n0(r.get('carries')); x[4] += n0(r.get('rushing_epa'))
def zs_of(d):
    xs = [v for v in d.values() if v is not None]
    if len(xs) < 4: return {}
    m, sd = statistics.mean(xs), statistics.pstdev(xs) or 1
    return {k: (v - m) / sd for k, v in d.items() if v is not None}
LINE = {}
for yr in (2025, 2026):
    sk = zs_of({t: -(x[0] / x[1]) for (t, y), x in team_line.items() if y == yr and x[1] > 100})
    ru = zs_of({t: x[2] / x[3] for (t, y), x in team_line.items() if y == yr and x[3] > 80})
    ep = zs_of({t: x[4] / x[3] for (t, y), x in team_line.items() if y == yr and x[3] > 80})
    for t in sk: LINE[(t, yr)] = {'Pass blocking': sk[t], 'Run blocking': (ru.get(t, 0) + ep.get(t, 0)) / 2}
attr_z = {}

# role, market, pedigree weights by position (production takes the rest)
W = {'QB': (.36, .06, .36, .06), 'RB': (.52, .15, .23, .1), 'WR': (.52, .14, .26, .08), 'TE': (.47, .2, .23, .1),
     'OT': (.08, .36, .46, .1), 'IOL': (.08, .36, .46, .1), 'EDGE': (.52, .12, .29, .07), 'DT': (.48, .16, .28, .08),
     'LB': (.46, .18, .28, .08), 'CB': (.5, .14, .28, .08), 'S': (.48, .16, .28, .08), 'K': (.75, 0, .25, 0), 'P': (.75, 0, .25, 0)}
STARTERS = {'QB': 1, 'RB': 1, 'WR': 3, 'TE': 1, 'OT': 2, 'IOL': 3, 'EDGE': 2, 'DT': 2, 'LB': 2, 'CB': 3, 'S': 2, 'K': 1, 'P': 1}
AGE = {'RB': 29, 'WR': 31, 'TE': 31, 'CB': 30, 'S': 31, 'LB': 30, 'EDGE': 31, 'DT': 31, 'OT': 35, 'IOL': 34, 'QB': 37, 'K': 39, 'P': 39}
TIERS = [(0, 94), (.03, 91), (.1, 87), (.3, 81), (.6, 76), (1.0, 71), (1.5, 65), (2.5, 58), (4, 51), (6, 45)]
def tier(frac):
    for (a, oa), (b, ob) in zip(TIERS, TIERS[1:]):
        if frac <= b: return oa + (ob - oa) * (frac - a) / (b - a)
    return 45

new, prior, why = {}, {}, {}
for pos, L in by_pos.items():
    S = {yr: season_scores(pos, L, yr) for yr in OLD + YEARS}
    prod, track = {}, {}
    for p in L:
        pid = p[0]
        def blend(ws):
            have = [(S[yr][pid][0], w) for yr, w in ws if pid in S[yr]]
            return sum(v * w for v, w in have) / sum(w for _, w in have) if have else None
        cur = blend(((2026, .55), (2025, .45)))
        car = blend(((2026, .25), (2025, .3), (2024, .25), (2023, .2)))
        pk = max([S[yr][pid][0] for yr in YEARS if pid in S[yr] and S[yr][pid][2] >= 6] or [None], key=lambda v: -9 if v is None else v)
        # legacy: the average of his three best full seasons since 2019 (fewer if he has fewer)
        full = sorted([S[yr][pid][0] for yr in OLD + YEARS if pid in S[yr] and S[yr][pid][2] >= 8], reverse=True)[:3]
        leg = sum(full) / len(full) - .25 * (3 - len(full)) if full else None
        parts = [(v, w) for v, w in ((cur, .3), (car, .27), (pk, .18), (leg, .25)) if v is not None]
        prod[pid] = sum(v * w for v, w in parts) / sum(w for _, w in parts) if parts else None
        track[pid] = car
    role, mkt, ped = {}, {}, {}
    for p in L:
        pid = p[0]; m = meta.get(pid, {})
        have = [(v, w) for v, w in ((snap_share(pid, 2026), .55), (snap_share(pid, 2025), .45)) if v]
        role[pid] = sum(v * w for v, w in have) / sum(w for _, w in have) if have else None
        exp = n0(m.get('years_of_experience'))
        # a player still on his rookie deal has no market price yet
        mkt[pid] = None if exp <= 4 and m.get('draft_round') and (p[6] or 0) < 6 else math.log(max(.8, p[6] or .8))
        ped[pid] = -math.log(n0(m.get('draft_pick')) or 270) * max(0, 1 - exp / 6)
    zr, zm, zd = zmap(role), zmap(mkt), zmap(ped)
    zw = zmap({p[0]: QBW.get(p[0]) for p in L}) if pos == 'QB' else {}
    wp, wr, wm, wd = W[pos]
    score, trk = {}, {}
    for p in L:
        pid, age = p[0], p[4]
        pz = -1.0 if prod[pid] is None else prod[pid]
        rz = -1.0 if zr.get(pid) is None else zr[pid]
        dz = zd.get(pid) or 0.0
        mz = zm.get(pid)
        if mz is None: mz = .6 * pz + .2 * dz + .2 * rz            # still on his rookie deal: what he would be paid for his play
        agez = -.07 * (age - AGE[pos] - 1) if age > AGE[pos] + 1 else 0.0
        inj = -.05 if p[10] else 0.0
        wz = .16 * (-.8 if zw.get(pid) is None else zw[pid]) if pos == 'QB' else 0.0
        score[pid] = wp * pz + wr * rz + wm * mz + wd * dz + wz + agez + inj
        trk[pid] = wp * (-1.0 if track[pid] is None else track[pid]) + wr * rz + wm * mz + wd * dz + wz + agez
        # the reasons: his strongest and weakest measures over the seasons we have
        agg = defaultdict(list)
        for yr in YEARS:
            if pid in S[yr]:
                for zz, lab in S[yr][pid][1]: agg[lab].append(zz)
        avg = sorted(((sum(v) / len(v), lab) for lab, v in agg.items()), reverse=True)
        wz = defaultdict(lambda: [0.0, 0.0])
        for yr in YEARS:
            if pid in S[yr]:
                for zz, lab in S[yr][pid][1]: wz[lab][0] += zz * REC_W[yr]; wz[lab][1] += REC_W[yr]
        lab_z = {lab: a / b for lab, (a, b) in wz.items() if b}
        az = {}
        for name, labs in ATTR.get(pos, {}).items():
            vals = [lab_z[l] for l in labs if l in lab_z]
            if vals: az[name] = sum(vals) / len(vals)
        if pos in ('OT', 'IOL'):
            pfr = meta.get(pid, {}).get('pfr_id'); acc = defaultdict(lambda: [0.0, 0.0])
            for yr in (2025, 2026):
                tm = snap_team.get((pfr, yr))
                if not tm: continue
                t = max(tm, key=tm.get); sh = snap_share(pid, yr) or 0
                for k, v in LINE.get((t, yr), {}).items(): acc[k][0] += v * sh * REC_W[yr]; acc[k][1] += sh * REC_W[yr]
            for k, (a, b) in acc.items():
                if b: az[k] = a / b
            if 'Clean play (penalties)' in lab_z: az['Discipline'] = lab_z['Clean play (penalties)']
        if len(az) >= 2: attr_z[pid] = az
        why[pid] = {'s': [lab for zz, lab in avg[:2] if zz > .5], 'w': [lab for zz, lab in avg[-1:] if zz < -.5],
                    'parts': {'Production': pz, 'Role': rz, 'Market': mz, 'Pedigree': dz}, 'age': agez}
    Sx = 32 * STARTERS[pos]
    for sc, out in ((score, new), (trk, prior)):
        ranked = sorted(L, key=lambda p: -sc[p[0]])
        for i, p in enumerate(ranked):
            o = tier(i / Sx)
            if i == 0: o = 96 if sc[p[0]] - sc[ranked[1][0]] > .45 else 95 if sc[p[0]] - sc[ranked[1][0]] > .25 else 94
            elif i == 1 and sc[p[0]] - sc[ranked[2][0]] > .45: o = max(o, 93)
            out[p[0]] = int(max(40, min(99, round(o))))
    pct = lambda d, k: None if d.get(k) is None else round(100 * sum(1 for v in d.values() if v is not None and v < d[k]) / max(1, sum(1 for v in d.values() if v is not None) - 1))
    for p in L:
        pid = p[0]; w = why[pid]
        P = {k: zz for k, zz in w['parts'].items()}
        w['pct'] = {'Production': pct(prod, pid), 'Role': pct(role, pid), 'Market': pct(mkt, pid) if mkt.get(pid) is not None else None}
        if pos == 'QB' and QBW.get(pid) is not None: w['pct']['Winning'] = pct({k: QBW.get(k) for k in prod}, pid)

# rookies without a real sample sit below established starters, as in Madden
for p in data['players']:
    m = meta.get(p[0], {})
    if n0(m.get('years_of_experience')) <= 0:
        pk = n0(m.get('draft_pick')) or 300
        cap = 79 if pk <= 5 else 76 if pk <= 15 else 73 if pk <= 32 else 70 if pk <= 64 else 66
        new[p[0]] = min(new[p[0]], cap); prior[p[0]] = min(prior[p[0]], cap)

changed = []
for p in data['players']:
    old, o = p[5], new[p[0]]
    p[5], p[12] = o, prior[p[0]]
    p[13] = int(max(o, min(99, o + max(0, p[13] - old))))
    w = why[p[0]]
    rec = {'s': w['s'], 'w': w['w'], 'p': w['pct']}
    az = attr_z.get(p[0])
    if az:
        zbar = sum(az.values()) / len(az)
        rec['t'] = {k: int(max(-14, min(14, round(5.5 * (v - zbar))))) for k, v in az.items()}
    if w['age'] < 0: rec['a'] = 1
    while len(p) < 18: p.append(None)
    if len(p) == 18: p.append(rec)
    else: p[18] = rec
    changed.append((abs(o - old), p[1], p[2], old, o))

json.dump(data, open(dpath, 'w'), separators=(',', ':'))
P = data['players']
print('players with attributes:', sum(1 for p in P if isinstance(p[18], dict) and p[18].get('t')), 'of', len(P))
print('99:', sum(1 for p in P if p[5] >= 99), ' 95+:', sum(1 for p in P if p[5] >= 95), ' 90+:', sum(1 for p in P if p[5] >= 90), ' 80+:', sum(1 for p in P if p[5] >= 80), ' of', len(P))
for pos in STARTERS:
    top = sorted([p for p in P if p[2] == pos], key=lambda p: -p[5])[:10]
    print(pos.ljust(4), ' | '.join(f'{p[1]} {p[5]}' for p in top))
print('biggest moves:', ' | '.join(f'{n} {pos} {a}->{b}' for _, n, pos, a, b in sorted(changed, reverse=True)[:14]))
