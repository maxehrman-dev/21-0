"""Recalibrate every player's OVR the way Madden's ratings behave.

Madden's patterns, which this copies:
  - Ratings are sticky. A player's rating reflects years of work, so the multi-season track record and the
    market (his contract) carry most of the weight and one hot half-season moves him only a few points.
  - Tiers by position. The best at a position sits around 97, a 99 only when he is clearly ahead of everyone,
    the 10th best around 89-90, an average starter in the high 70s to low 80s, backups in the 60s.
    League-wide that gives a small 99 club, about 15 players at 95+ and 70-90 at 90+.
  - Young players are ranked mostly by draft slot and snaps until they have a real sample.
  - Age: running backs fade first, then defensive backs and linebackers; quarterbacks and kickers last.

Usage: python3 tools/ratings2.py <folder with nflverse csvs>
It reads data.json, rewrites only OVR (field 5), track record (12) and potential (13), and leaves every
other field, contracts included, as it is.
"""
import csv, json, math, os, statistics, sys
from collections import defaultdict

here = os.path.dirname(os.path.abspath(__file__))
dl = sys.argv[1]
dpath = os.path.join(here, '..', 'data.json')
data = json.load(open(dpath))

def f(x):
    try: return float(x)
    except (TypeError, ValueError): return 0.0

meta = {}
with open(os.path.join(dl, 'players.csv'), newline='', encoding='utf-8') as fh:
    for r in csv.DictReader(fh):
        meta[r['gsis_id']] = r
stats = {}
for yr in (2023, 2024, 2025, 2026):
    with open(os.path.join(dl, f'stats_player_reg_{yr}.csv'), newline='', encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            stats[(r['player_id'], yr)] = r
team_games, snaps = {}, defaultdict(lambda: [0.0, 0])
for yr in (2025, 2026):
    tg, rows = defaultdict(set), []
    with open(os.path.join(dl, f'snap_counts_{yr}.csv'), newline='', encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            if r['game_type'] != 'REG': continue
            tg[r['team']].add(r['game_id']); rows.append(r)
    team_games[yr] = max(len(v) for v in tg.values())
    for r in rows:
        s = snaps[(r['pfr_player_id'], yr)]
        s[0] += max(f(r['offense_pct']), f(r['defense_pct'])); s[1] += 1

def snap_share(pid, yr):
    pfr = meta.get(pid, {}).get('pfr_id')
    if not pfr: return None
    s = snaps.get((pfr, yr))
    if not s or not s[1]: return 0.0
    # Madden does not lower a rating for time missed: share of snaps in the games he played, barely touched by availability
    return s[0] / s[1] * (.85 + .15 * min(1.0, s[1] / team_games[yr]))

def g(r, k): return f(r.get(k)) if r else 0.0

def prod(pos, r):
    """One season's production per game, and how big the sample is. Efficiency over volume."""
    if not r: return None, 0
    gp = max(1.0, g(r, 'games'))
    if pos == 'QB':
        plays = g(r, 'attempts') + g(r, 'sacks_suffered') + g(r, 'carries')
        if plays < 40: return None, 0
        epa = (g(r, 'passing_epa') + g(r, 'rushing_epa')) / plays
        ypa = (g(r, 'passing_yards') - g(r, 'sack_yards_lost')) / max(1, g(r, 'attempts') + g(r, 'sacks_suffered'))
        return epa * 10 + g(r, 'passing_cpoe') * .1 + ypa * .25, plays / 120
    if pos == 'RB':
        t = g(r, 'carries') + g(r, 'targets')
        if t < 25: return None, 0
        epa = (g(r, 'rushing_epa') + g(r, 'receiving_epa')) / t
        return epa * 6 + (g(r, 'rushing_yards') + g(r, 'receiving_yards')) / gp / 30, t / 80
    if pos in ('WR', 'TE'):
        tg = g(r, 'targets')
        if tg < 12: return None, 0
        return g(r, 'receiving_yards') / gp / (20 if pos == 'WR' else 15) + g(r, 'receiving_epa') / tg * 3 + g(r, 'target_share') * 6, tg / 40
    if pos in ('EDGE', 'DT', 'LB', 'CB', 'S'):
        rush = g(r, 'def_sacks') + g(r, 'def_qb_hits') * .4 + g(r, 'def_fumbles_forced') * .5
        tfl, pd, it = g(r, 'def_tackles_for_loss'), g(r, 'def_pass_defended'), g(r, 'def_interceptions')
        tk = g(r, 'def_tackles_solo') + g(r, 'def_tackle_assists') * .5
        # tackles count little: a lot of tackles often means the play got past everyone else
        w = {'EDGE': (0.02, 1.0, .3, .1, .3), 'DT': (0.03, 1.0, .4, .1, .3), 'LB': (0.04, .7, .35, .3, .7),
             'CB': (0.0, .1, .1, .45, 1.0), 'S': (0.03, .3, .2, .4, .9)}[pos]
        return (tk * w[0] + rush * w[1] + tfl * w[2] + pd * w[3] + it * w[4]) / gp * 4, gp / 8
    if pos == 'K':
        att = g(r, 'fg_att')
        if att < 6: return None, 0
        return g(r, 'fg_pct') * 10 + g(r, 'fg_made_50_59') * .5 / max(1, gp / 17), att / 16
    if pos == 'P':
        n = g(r, 'pt_att')
        if n < 10: return None, 0
        return g(r, 'pt_net_yards') / n / 4 + g(r, 'pt_inside_20') / n * 4, n / 25
    return None, 0

def z(vals):
    xs = [v for v in vals.values() if v is not None]
    if len(xs) < 3: return {k: 0.0 for k in vals}
    m, sd = statistics.mean(xs), statistics.pstdev(xs) or 1
    return {k: (None if v is None else (v - m) / sd) for k, v in vals.items()}

# production, snaps, contract (the market's rating), draft pedigree
W = {'QB': (.32, .1, .5, .08), 'RB': (.4, .25, .25, .1), 'WR': (.4, .22, .3, .08), 'TE': (.38, .25, .27, .1),
     'OT': (0, .45, .45, .1), 'IOL': (0, .45, .45, .1), 'EDGE': (.38, .2, .34, .08), 'DT': (.34, .25, .33, .08),
     'LB': (.16, .34, .42, .08), 'CB': (.2, .35, .37, .08), 'S': (.25, .32, .35, .08), 'K': (.7, 0, .3, 0), 'P': (.7, 0, .3, 0)}
STARTERS = {'QB': 1, 'RB': 1, 'WR': 3, 'TE': 1, 'OT': 2, 'IOL': 3, 'EDGE': 2, 'DT': 2, 'LB': 2, 'CB': 3, 'S': 2, 'K': 1, 'P': 1}
AGE = {'RB': 29, 'WR': 31, 'TE': 31, 'CB': 30, 'S': 31, 'LB': 30, 'EDGE': 31, 'DT': 31, 'OT': 32, 'IOL': 32, 'QB': 36, 'K': 38, 'P': 38}

by_pos = defaultdict(list)
for p in data['players']: by_pos[p[2]].append(p)

def scores(YW):
    out = {}
    for pos, L in by_pos.items():
        P, PW, S, Cn, D = {}, {}, {}, {}, {}
        for p in L:
            pid, apy = p[0], p[6]
            m = meta.get(pid, {})
            parts = []
            for yr, wy in YW:
                sc, n = prod(pos, stats.get((pid, yr)))
                if sc is not None: parts.append((sc, wy * n / (n + 1.0)))
            P[pid] = sum(s * w for s, w in parts) / sum(w for _, w in parts) if parts else None
            PW[pid] = sum(w for _, w in parts)
            s26, s25 = snap_share(pid, 2026), snap_share(pid, 2025)
            have = [(v, w) for v, w in ((s26, .55), (s25, .45)) if v]   # a season he missed is no information, not zero
            S[pid] = (sum(v * w for v, w in have) / sum(w for _, w in have)) if have else (None if s26 is None and s25 is None else 0.0)
            exp = f(m.get('years_of_experience'))
            Cn[pid] = None if exp <= 3 and m.get('draft_round') else math.log(max(.8, apy))
            D[pid] = -math.log(f(m.get('draft_pick')) or 270) * max(0, 1 - exp / 6)
        zP, zS, zC, zD = z(P), z(S), z(Cn), z(D)
        wp, ws, wc, wd = W[pos]
        for p in L:
            pid, age = p[0], p[4]
            conf = min(1.0, PW[pid] / .9)
            pz = -1.0 if zP.get(pid) is None else zP[pid] * conf - .6 * (1 - conf)
            pz = max(-2.5, min(2.6, pz))                       # one season cannot make a superstar
            sz = -1.0 if zS.get(pid) is None else zS[pid]
            dz = zD.get(pid) or 0.0
            cz = zC.get(pid)
            if cz is None: cz = dz * .8 + sz * .4                 # rookie deal: draft slot and snaps
            tot = wp * pz + ws * sz + wc * cz + wd * dz
            if age > AGE[pos] + 1: tot -= .07 * (age - AGE[pos] - 1)
            if p[10]: tot -= .05
            out[pid] = tot
    return out

cur = scores(((2026, .55), (2025, .45)))
career = scores(((2026, .25), (2025, .3), (2024, .25), (2023, .2)))
# peak: his best recent season. A proven star keeps most of his rating through a down or injured year
seasons = [scores(((yr, 1.0),)) for yr in (2023, 2024, 2025, 2026)]
def sampled(pid, yr):
    r = stats.get((pid, yr))
    return bool(r) and f(r.get('games')) >= 6
peak = {pid: max([sc[pid] for sc, yr in zip(seasons, (2023, 2024, 2025, 2026)) if sampled(pid, yr)] or [cur[pid]]) for pid in cur}
blend = {pid: .35 * cur[pid] + .35 * career[pid] + .3 * peak[pid] for pid in cur}   # sticky, like Madden

# Madden-like tiers: position rank as a share of the league's starters at that spot
TIERS = [(0, 97), (.03, 94), (.1, 90), (.3, 85), (.6, 80), (1.0, 75), (1.5, 69), (2.5, 62), (4, 54), (6, 47)]
def tier(frac):
    for (a, oa), (b, ob) in zip(TIERS, TIERS[1:]):
        if frac <= b: return oa + (ob - oa) * (frac - a) / (b - a)
    return 45

def rate(sc):
    out = {}
    for pos, L in by_pos.items():
        ranked = sorted(L, key=lambda p: -sc[p[0]])
        Sx = 32 * STARTERS[pos]
        for i, p in enumerate(ranked):
            o = tier(i / Sx)
            if i == 0: o = 99 if sc[p[0]] - sc[ranked[1][0]] > .3 else 97
            elif i == 1 and sc[p[0]] - sc[ranked[2][0]] > .3: o = max(o, 96)
            out[p[0]] = int(max(40, min(99, round(o))))
    return out

new, prior = rate(blend), rate(career)
# rookies with no real sample stay below the established starters, the way Madden rates them
for p in data['players']:
    m = meta.get(p[0], {})
    exp = f(m.get('years_of_experience'))
    if exp <= 0:
        pk = f(m.get('draft_pick')) or 300
        cap = 84 if pk <= 5 else 80 if pk <= 15 else 77 if pk <= 32 else 73 if pk <= 64 else 69
        new[p[0]] = min(new[p[0]], cap); prior[p[0]] = min(prior[p[0]], cap)

changed = []
for p in data['players']:
    old = p[5]
    o = new[p[0]]
    p[5] = o
    p[12] = prior[p[0]]
    p[13] = int(max(o, min(99, o + max(0, p[13] - old))))   # keep his growth room
    changed.append((abs(o - old), p[1], p[2], old, o))

json.dump(data, open(dpath, 'w'), separators=(',', ':'))
P = data['players']
print('99:', sum(1 for p in P if p[5] >= 99), ' 95+:', sum(1 for p in P if p[5] >= 95), ' 90+:', sum(1 for p in P if p[5] >= 90), ' 80+:', sum(1 for p in P if p[5] >= 80), ' of', len(P))
for pos in STARTERS:
    top = sorted([p for p in P if p[2] == pos], key=lambda p: -p[5])[:10]
    print(pos.ljust(4), ' | '.join(f'{p[1]} {p[5]}' for p in top))
print('biggest moves:', ' | '.join(f'{n} {pos} {a}->{b}' for _, n, pos, a, b in sorted(changed, reverse=True)[:16]))
