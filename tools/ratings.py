"""Rebuild every player's OVR from real 2025 + 2026 production, playing time, contract and draft pedigree.

Each position has its own production formula. Scores are blended, shrunk toward a low prior when the sample
is small, ranked within the position, then mapped onto a realistic curve: only the true elite reach 95+,
most starters land 72-90, backups 55-70.
"""
import csv, json, math, os, statistics, shutil
from collections import defaultdict

base = os.path.dirname(os.path.abspath(__file__))
dl = os.path.join(base, 'dl')
dpath = os.path.join(base, 'game', 'data.json')
orig = os.path.join(base, 'dl', 'data_orig.json')
if not os.path.exists(orig):
    shutil.copy(dpath, orig)
data = json.load(open(orig))

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

# snap share: mean snap % over the team's games (missed games count as 0)
team_games = {}
snaps = defaultdict(lambda: [0.0, 0])
for yr in (2025, 2026):
    tg = defaultdict(set)
    rows = []
    with open(os.path.join(dl, f'snap_counts_{yr}.csv'), newline='', encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            if r['game_type'] != 'REG':
                continue
            tg[r['team']].add(r['game_id'])
            rows.append(r)
    team_games[yr] = max(len(v) for v in tg.values())
    for r in rows:
        pct = max(f(r['offense_pct']), f(r['defense_pct']))
        s = snaps[(r['pfr_player_id'], yr)]
        s[0] += pct; s[1] += 1

def snap_share(pid, yr):
    pfr = meta.get(pid, {}).get('pfr_id')
    if not pfr: return None
    s = snaps.get((pfr, yr))
    if not s: return 0.0
    return s[0] / team_games[yr]

def g(r, k): return f(r.get(k)) if r else 0.0

def prod(pos, r):
    """(score, sample size) for one season; higher is better."""
    if not r: return None, 0
    gp = max(1.0, g(r, 'games'))
    if pos == 'QB':
        plays = g(r, 'attempts') + g(r, 'sacks_suffered') + g(r, 'carries')
        if plays < 20: return None, 0
        epa = (g(r, 'passing_epa') + g(r, 'rushing_epa')) / plays
        cpoe = g(r, 'passing_cpoe')
        ypa = (g(r, 'passing_yards') - g(r, 'sack_yards_lost')) / max(1, g(r, 'attempts') + g(r, 'sacks_suffered'))
        return epa * 10 + cpoe * .12 + ypa * .25, plays / 60
    if pos == 'RB':
        touches = g(r, 'carries') + g(r, 'targets')
        if touches < 10: return None, 0
        epa = (g(r, 'rushing_epa') + g(r, 'receiving_epa')) / touches
        scrim = (g(r, 'rushing_yards') + g(r, 'receiving_yards')) / gp
        return epa * 6 + scrim / 25 + (g(r, 'rushing_tds') + g(r, 'receiving_tds')) / gp, touches / 40
    if pos in ('WR', 'TE'):
        tg = g(r, 'targets')
        if tg < 5: return None, 0
        ypg = g(r, 'receiving_yards') / gp
        return ypg / (18 if pos == 'WR' else 14) + g(r, 'receiving_epa') / tg * 3 + g(r, 'target_share') * 8, tg / 18
    if pos in ('EDGE', 'DT', 'LB', 'CB', 'S'):
        tk = g(r, 'def_tackles_solo') + g(r, 'def_tackle_assists') * .5
        rush = g(r, 'def_sacks') + g(r, 'def_qb_hits') * .4 + g(r, 'def_fumbles_forced') * .6
        tfl, pd, it = g(r, 'def_tackles_for_loss'), g(r, 'def_pass_defended'), g(r, 'def_interceptions')
        w = {'EDGE': (0.04, 1.0, .35, .15, .4), 'DT': (0.07, 1.0, .45, .15, .4), 'LB': (0.1, .7, .35, .35, .9),
             'CB': (0.05, .2, .2, .7, 1.4), 'S': (0.08, .4, .25, .55, 1.2)}[pos]
        val = (tk * w[0] + rush * w[1] + tfl * w[2] + pd * w[3] + it * w[4]) / gp
        return val * 4, gp / 4
    if pos == 'K':
        att = g(r, 'fg_att')
        if att < 3: return None, 0
        return g(r, 'fg_pct') * 10 + g(r, 'fg_made_50_59') * .6 / max(1, gp / 17) + g(r, 'fg_made_60_') * 1.5, att / 8
    if pos == 'P':
        n = g(r, 'pt_att')
        if n < 5: return None, 0
        return g(r, 'pt_net_yards') / n / 4 + g(r, 'pt_inside_20') / n * 4, n / 12
    return None, 0  # OT, IOL: no box-score production

def z(vals):
    xs = [v for v in vals.values() if v is not None]
    if len(xs) < 3: return {k: 0.0 for k in vals}
    m, sd = statistics.mean(xs), statistics.pstdev(xs) or 1
    return {k: (None if v is None else (v - m) / sd) for k, v in vals.items()}

W = {  # production, snaps, contract, draft
    'QB': (.5, .1, .32, .08), 'RB': (.5, .2, .2, .1), 'WR': (.5, .2, .22, .08), 'TE': (.45, .25, .2, .1),
    'OT': (0, .45, .43, .12), 'IOL': (0, .45, .43, .12), 'EDGE': (.45, .2, .27, .08), 'DT': (.4, .25, .27, .08),
    'LB': (.32, .25, .35, .08), 'CB': (.25, .35, .3, .1), 'S': (.35, .3, .27, .08), 'K': (.8, 0, .2, 0), 'P': (.8, 0, .2, 0),
}
STARTERS = {'QB': 1, 'RB': 1, 'WR': 3, 'TE': 1, 'OT': 2, 'IOL': 3, 'EDGE': 2, 'DT': 2, 'LB': 2, 'CB': 3, 'S': 2, 'K': 1, 'P': 1}

by_pos = defaultdict(list)
for p in data['players']:
    by_pos[p[2]].append(p)

def compute(YW):
    new_ovr = {}
    report = {}
    for pos, L in by_pos.items():
        P, S, Cn, D = {}, {}, {}, {}
        for p in L:
            pid, age, apy = p[0], p[4], p[6]
            m = meta.get(pid, {})
            # production: 2026 weighs more once a player has real snaps this year
            parts = []
            for yr, wy in YW:
                sc, n = prod(pos, stats.get((pid, yr)))
                if sc is not None:
                    shrink = n / (n + 1.0)
                    parts.append((sc, wy * shrink))
            P[pid] = sum(s * w for s, w in parts) / sum(w for _, w in parts) if parts else None
            P[pid + ':w'] = sum(w for _, w in parts)
            s26, s25 = snap_share(pid, 2026), snap_share(pid, 2025)
            S[pid] = None if s26 is None and s25 is None else (s26 or 0) * .6 + (s25 or 0) * .4
            exp = f(m.get('years_of_experience'))
            rookie_deal = exp <= 3 and m.get('draft_round') not in (None, '')
            Cn[pid] = None if rookie_deal else math.log(max(.8, apy))
            pick = f(m.get('draft_pick')) or 270
            D[pid] = -math.log(pick) * max(0, 1 - exp / 6)
        zP = z({k: v for k, v in P.items() if not k.endswith(':w')}); zS = z(S); zC = z(Cn); zD = z(D)
        wp, ws, wc, wd = W[pos]
        score = {}
        for p in L:
            pid, age = p[0], p[4]
            pz = zP.get(pid)
            conf = min(1.0, P.get(pid + ':w', 0) / .6)
            pz = -1.2 if pz is None else pz * conf + (-1.2) * (1 - conf) * .5
            sz = -1.0 if zS.get(pid) is None else zS[pid]
            cz = zC.get(pid)
            dz = zD.get(pid) or 0.0
            if cz is None:  # rookie contract: lean on draft slot and snaps instead
                cz = dz * .8 + sz * .4
            tot = wp * pz + ws * sz + wc * cz + wd * dz
            if age >= 33: tot -= .12 * (age - 32) if pos not in ('K', 'P', 'QB') else .05 * (age - 32)
            if p[10]:  # injured reserve now: small hit, he still counts as a talent
                tot -= .05
            score[pid] = tot
        ranked = sorted(L, key=lambda p: -score[p[0]])
        Sx = 32 * STARTERS[pos]
        anchors = [(1, 98), (max(2, .1 * Sx), 91), (.45 * Sx, 83), (Sx, 73), (1.8 * Sx, 64), (3 * Sx, 55), (5 * Sx, 46)]
        def curve(r):
            for (r0, o0), (r1, o1) in zip(anchors, anchors[1:]):
                if r <= r1: return o0 + (o1 - o0) * (r - r0) / (r1 - r0)
            return 44
        for i, p in enumerate(ranked):
            o = round(curve(i + 1))
            if i == 0: o = 99 if score[p[0]] - score[ranked[1][0]] > .35 else 98
            new_ovr[p[0]] = max(40, min(99, o))
        report[pos] = [(p[1], new_ovr[p[0]], p[5]) for p in ranked[:12]]


    return new_ovr, report

cur, report = compute(((2026, .6), (2025, .4)))
# track record: four seasons, so one down year does not erase a career
prior, _ = compute(((2026, .25), (2025, .3), (2024, .25), (2023, .2)))
for p in data['players']:
    c, pr = cur[p[0]], prior[p[0]]
    p[5] = max(40, min(99, round(.7 * c + .3 * pr)))
    del p[12:]
    p.append(pr)

# Potential, from real signals: years before his prime, draft pedigree, and his 2025 -> 2026 trend.
r26, _ = compute(((2026, 1.0),))
r25, _ = compute(((2025, 1.0),))
def played(pid, yr):
    r = stats.get((pid, yr))
    return bool(r) and f(r.get('games')) >= 4
for p in data['players']:
    pid, age, ovr = p[0], p[4], p[5]
    m = meta.get(pid, {})
    rd = m.get('draft_round') or ''
    ped = {'1': 1.0, '2': .82, '3': .68}.get(rd, .55 if rd else .42)
    pk = f(m.get('draft_pick'))
    if rd == '1' and pk and pk <= 10: ped = 1.12
    exp = f(m.get('years_of_experience'))
    room = max(0.0, 27 - age) if p[2] != 'QB' else max(0.0, 29 - age)
    trend = r26[pid] - r25[pid] if played(pid, 2026) and played(pid, 2025) else 0
    growth = room * 1.5 * ped + max(-3, min(6, trend)) * .5
    if exp <= 1: growth += 2 * ped      # rookies are the least known
    pot = int(max(ovr, min(99, round(ovr + max(0, growth)))))
    why = []
    if rd == '1': why.append('first-round pick' if not (pk and pk <= 10) else 'top-10 pick')
    elif rd in ('2', '3'): why.append(f'round {rd} pick')
    elif rd: why.append('day 3 pick')
    else: why.append('undrafted')
    if room >= 3: why.append(f'{int(age)} years old')
    if trend >= 3: why.append('trending up')
    elif trend <= -3: why.append('trending down')
    p.append(pot); p.append(', '.join(why))

# Production rank (0-100 within position) and hype (0-100: how famous he is, which is not the same as how good)
def pctile(vals):
    xs = sorted(v for v in vals.values() if v is not None)
    out = {}
    for k, v in vals.items():
        if v is None or not xs: out[k] = None; continue
        lo = sum(1 for x in xs if x < v); out[k] = round(100 * lo / max(1, len(xs) - 1))
    return out
def fame(pos, r):
    if not r: return 0.0
    gp = max(1.0, g(r, 'games'))
    if pos in ('QB', 'RB', 'WR', 'TE'): return g(r, 'fantasy_points_ppr') / gp
    if pos in ('EDGE', 'DT', 'LB', 'CB', 'S'): return (g(r, 'def_sacks') * 4 + g(r, 'def_interceptions') * 5 + g(r, 'def_pass_defended') * 1.2 + g(r, 'def_tackles_for_loss') * 1.5 + (g(r, 'def_tackles_solo') + g(r, 'def_tackle_assists')) * .15) / gp
    if pos == 'K': return g(r, 'fg_made') / gp
    return 0.0
for pos, L in by_pos.items():
    P, F = {}, {}
    for p in L:
        pid = p[0]
        sc = [(prod(pos, stats.get((pid, y)))[0], w) for y, w in ((2026, .6), (2025, .4))]
        sc = [(v, w) for v, w in sc if v is not None]
        P[pid] = sum(v * w for v, w in sc) / sum(w for _, w in sc) if sc else None
        F[pid] = fame(pos, stats.get((pid, 2026))) * .6 + fame(pos, stats.get((pid, 2025))) * .4
    PP, FP = pctile(P), pctile(F)
    apy_rank = {p[0]: i for i, p in enumerate(sorted(L, key=lambda q: -q[6]))}
    for p in L:
        pid, m = p[0], meta.get(p[0], {})
        rd, pk = m.get('draft_round') or '', f(m.get('draft_pick'))
        hype = (FP.get(pid) or 0) * .55
        hype += 18 if rd == '1' and pk and pk <= 10 else 10 if rd == '1' else 4 if rd in ('2', '3') else 0
        hype += 14 if apy_rank[pid] < 5 else 7 if apy_rank[pid] < 15 else 0
        if p[4] <= 25 and (p[13] - p[5]) >= 6: hype += 8           # young and rising
        if p[4] >= 32: hype -= 10                                  # the league moves on
        p.append(PP.get(pid) if PP.get(pid) is not None else -1)    # 15: production percentile, -1 = no sample
        p.append(int(max(0, min(100, round(hype)))))                # 16: hype

json.dump(data, open(dpath, 'w'), separators=(',', ':'))
q = sorted([p for p in data['players'] if p[2] == 'QB'], key=lambda p: -p[5])
young = sorted([p for p in data['players'] if p[4] <= 25], key=lambda p: -(p[13] - p[5]))
top = sorted(data['players'], key=lambda p: -p[16])[:14]
print('most hyped:', ' | '.join(f'{p[1]} {p[2]} hype {p[16]} prod {p[15]} ovr {p[5]}' for p in top))
print('biggest potential gaps:', ' | '.join(f'{p[1]} {p[2]} {int(p[4])}: {p[5]}->{p[13]} ({p[14]})' for p in young[:10]))
print('examples:', ' | '.join(f'{p[1]} {p[5]}->{p[13]} ({p[14]})' for p in data['players'] if p[1] in ('Drake Maye', 'Caleb Williams', 'Malik Nabers', 'Cam Ward', 'Travis Hunter', 'Will Anderson Jr.', 'Patrick Mahomes')))
from collections import Counter
print('95+ total', sum(1 for p in data['players'] if p[5] >= 95), '90+', sum(1 for p in data['players'] if p[5] >= 90), 'of', len(data['players']))
