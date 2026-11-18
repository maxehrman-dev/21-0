"""Study the last 1,000 NFL trades (nflverse trades data) to calibrate the 21-0 trade engine.

Outputs a summary to stdout and research.json beside the data.
"""
import csv, json, math, os, statistics
from collections import defaultdict, Counter
from datetime import date

base = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(base, 'trades')
rows = list(csv.DictReader(open(os.path.join(T, 'trades.csv'), newline='', encoding='utf-8')))
by = defaultdict(list)
for r in rows: by[r['trade_id']].append(r)
order = sorted(by, key=lambda t: by[t][0]['trade_date'])
last = order[-1000:]

f = lambda x: float(x) if x not in (None, '') else None
is_pick = lambda r: bool(r['pick_round'])
is_player = lambda r: bool(r['pfr_id']) and not r['pick_round']
meta = {}
with open(os.path.join(base, 'dl', 'players.csv'), newline='', encoding='utf-8') as fh:
    for r in csv.DictReader(fh):
        if r['pfr_id']: meta[r['pfr_id']] = r

GROUP = {'QB': 'QB', 'RB': 'RB', 'FB': 'RB', 'WR': 'WR', 'TE': 'TE', 'T': 'OT', 'OT': 'OT', 'G': 'IOL', 'C': 'IOL', 'OG': 'IOL', 'OL': 'IOL',
         'DE': 'EDGE', 'OLB': 'EDGE', 'DT': 'DT', 'NT': 'DT', 'DL': 'DT', 'LB': 'LB', 'ILB': 'LB', 'MLB': 'LB', 'CB': 'CB', 'DB': 'CB', 'S': 'S', 'SS': 'S', 'FS': 'S', 'K': 'K', 'P': 'P', 'LS': 'K'}

# --- snap share by player season ---
snap = defaultdict(lambda: [0.0, 0])
team_games = {}
for y in range(2012, 2027):
    p = os.path.join(T, f'snap_{y}.csv')
    if not os.path.exists(p): continue
    tg = defaultdict(set)
    with open(p, newline='', encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            if r['game_type'] != 'REG': continue
            tg[r['team']].add(r['game_id'])
            pct = max(f(r['offense_pct']) or 0, f(r['defense_pct']) or 0)
            s = snap[(r['pfr_player_id'], y)]; s[0] += pct; s[1] += 1
    if tg: team_games[y] = max(len(v) for v in tg.values())
def share(pid, y):
    s = snap.get((pid, y))
    return None if not s else s[0] / team_games[y]

# --- pick values: fit an exponential chart from pick-for-pick swaps with known pick numbers ---
def sides(tid):
    out = defaultdict(list)
    for r in by[tid]: out[r['received']].append(r)
    return out
pick_only = []
for tid in last:
    s = sides(tid)
    if len(s) != 2: continue
    a, b = list(s.values())
    if all(is_pick(r) and r['pick_number'] for r in a + b):
        fa = lambda L: [(int(r['pick_number']), int(r['pick_season'] or r['season']) > int(r['season'])) for r in L]
        pa, pb = fa(a), fa(b)
        if min(n for n, _ in pa) > min(n for n, _ in pb): pa, pb = pb, pa      # pa = side that receives the top pick (moved up)
        pick_only.append((pa, pb))
def chart(n, A, B): return math.exp(-A * (n - 1) ** B)
def fit():
    best = None
    for A in [i / 100 for i in range(2, 40)]:
        for B in [i / 100 for i in range(40, 101, 4)]:
            for prem in (0, .05, .1, .15, .2):
                for d in (.6, .7, .8, .9, 1.0):
                    err = 0
                    for up, down in pick_only:
                        vu = sum(chart(n, A, B) * (d if f_ else 1) for n, f_ in up) * (1 + prem)
                        vd = sum(chart(n, A, B) * (d if f_ else 1) for n, f_ in down)
                        err += math.log(vu / vd) ** 2
                    if best is None or err < best[0]: best = (err, A, B, prem, d)
    return best
err, CA, CB, PREM, FUT = fit()
K = None
V = lambda n: chart(n, CA, CB)          # 1.0 for the first pick
fut = {}
fut_disc = {'all rounds': FUT}

def pick_val(r):
    """Value of one traded pick on the fitted chart, future picks at a mid-round slot and discounted."""
    later = int(r['pick_season'] or r['season']) > int(r['season'])
    n = int(r['pick_number']) if r['pick_number'] else 16 + 32 * (int(r['pick_round'] or 7) - 1)
    return V(n) * (FUT if later else 1)

# --- player pricing: one player out, only picks back ---
priced = []
mix = Counter(); months = Counter()
for tid in last:
    s = sides(tid)
    allr = by[tid]
    np_ = sum(1 for r in allr if is_player(r)); nk = sum(1 for r in allr if is_pick(r))
    mix['picks only' if np_ == 0 else 'players only' if nk == 0 else 'players and picks'] += 1
    d = allr[0]['trade_date']; months[int(d[5:7])] += 1
    if len(s) != 2: continue
    for recv, other in ((list(s.values())[0], list(s.values())[1]), (list(s.values())[1], list(s.values())[0])):
        # 'other' side receives exactly one player and gives only picks back
        pl = [r for r in other if is_player(r)]
        if len(pl) == 1 and len(other) == 1 and recv and all(is_pick(r) for r in recv):
            r = pl[0]; m = meta.get(r['pfr_id'], {})
            pos = GROUP.get(m.get('position') or '', None)
            if not pos: continue
            td = date.fromisoformat(r['trade_date'])
            age = None
            if m.get('birth_date'):
                b = date.fromisoformat(m['birth_date']); age = (td - b).days / 365.25
            y = td.year if td.month >= 9 else td.year - 1
            sh = share(r['pfr_id'], y)
            if sh is None and td.month < 9: sh = share(r['pfr_id'], td.year - 2)
            role = None if sh is None else 'starter' if sh >= .6 else 'rotation' if sh >= .3 else 'backup'
            val = sum(pick_val(x) for x in recv)
            best = min((int(x['pick_round']) for x in recv), default=7)
            dl = (td.month == 10 or (td.month == 11 and td.day <= 8))
            priced.append({'name': r['pfr_name'], 'pos': pos, 'age': age, 'role': role, 'share': sh, 'val': val, 'best': best, 'deadline': dl, 'date': r['trade_date'], 'picks': len(recv)})

def eq(v):
    """Turn a chart value back into the pick it matches."""
    lo, hi = 1.0, 300.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if V(mid) > v: lo = mid
        else: hi = mid
    n = lo
    rd = int((n - 1) // 32) + 1
    return f'#{round(n)} (round {min(7, rd)})' if n <= 260 else 'below a 7th'
def med(xs): return statistics.median(xs) if xs else None

out = {'trades': len(last), 'span': [by[last[0]][0]['trade_date'], by[last[-1]][0]['trade_date']], 'mix': dict(mix),
       'months': dict(sorted(months.items())), 'chart': [CA, CB], 'trade_up_premium': PREM, 'pick_swaps': len(pick_only), 'future_discount_by_round': fut_disc}
print(f"{out['trades']} trades from {out['span'][0]} to {out['span'][1]}")
print('mix:', dict(mix))
print('by month:', {m: c for m, c in sorted(months.items())})
print(f'pick chart from {len(pick_only)} pick-for-pick swaps: V(n) = exp(-{CA} * (n-1)^{CB}); teams moving up pay a {PREM * 100:.0f}% premium; a next-year pick is worth {FUT:.0%} of the same slot now')
print('chart (pick 1 = 100):', ' '.join(f'#{n}:{100 * V(n):.0f}' for n in (1, 5, 10, 16, 24, 32, 48, 64, 96, 128, 160, 200, 250)))
print('future pick worth vs a mid-round current pick:', fut_disc)
print(f'{len(priced)} one-player-for-picks trades priced')

tbl = defaultdict(list)
for p in priced:
    if p['role']: tbl[(p['pos'], p['role'])].append(p['val'])
print('\nmedian return for one player, by position and role (as the pick it equals):')
out['by_pos_role'] = {}
for pos in ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K']:
    cells = []
    for role in ['starter', 'rotation', 'backup']:
        v = tbl.get((pos, role), [])
        if v: cells.append(f"{role} n={len(v)} {eq(med(v))}"); out['by_pos_role'][f'{pos}/{role}'] = {'n': len(v), 'median_val': med(v), 'pick': eq(med(v))}
    if cells: print(f'  {pos:5s}', ' | '.join(cells))

print('\nstarters by age (all positions):')
out['starter_age'] = {}
for lo, hi in ((20, 25), (25, 28), (28, 30), (30, 32), (32, 40)):
    v = [p['val'] for p in priced if p['role'] == 'starter' and p['age'] and lo <= p['age'] < hi]
    if v: print(f'  {lo}-{hi - 1}: n={len(v)} median {eq(med(v))}'); out['starter_age'][f'{lo}-{hi - 1}'] = {'n': len(v), 'pick': eq(med(v)), 'median_val': med(v)}
st = [p for p in priced if p['role'] == 'starter']
dl = [p['val'] for p in st if p['deadline']]; off = [p['val'] for p in st if not p['deadline']]
print(f"\nstarters at the deadline: n={len(dl)} median {eq(med(dl)) if dl else '-'} | rest of year: n={len(off)} median {eq(med(off)) if off else '-'}")
out['deadline'] = {'n': len(dl), 'pick': eq(med(dl)) if dl else None, 'offseason_pick': eq(med(off)) if off else None}
print('\nbiggest one-player hauls:')
for p in sorted(priced, key=lambda x: -x['val'])[:12]:
    print(f"  {p['date']} {p['name']} ({p['pos']}, {p['age'] and round(p['age'])}, {p['role']}) -> {p['picks']} pick(s), worth {eq(p['val'])}")
out['top'] = [{k: p[k] for k in ('date', 'name', 'pos', 'role')} | {'pick': eq(p['val'])} for p in sorted(priced, key=lambda x: -x['val'])[:12]]
rounds = Counter(p['best'] for p in st)
print('\nbest pick a starter fetched (round):', dict(sorted(rounds.items())))
out['starter_best_round'] = dict(sorted(rounds.items()))
json.dump(out, open(os.path.join(T, 'research.json'), 'w'), indent=1, default=str)
