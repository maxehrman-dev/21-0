"""Old cap liabilities and old pick trades, from the real league.

Dead money: every team carries money for players who are gone (released, traded, retired) and for contracts whose
void years kick in. From each team's OverTheCap page (https://overthecap.com/salary-cap/<team>, one tab per year),
for 2026 to 2028: the Dead Money table's total, plus the voided-contract charges listed in that year's tab.
Cap space: each team's real cap space for the year (with its carryover and adjustments). The game's contract numbers are
not exact cap hits, so at the start the game sets a per-team adjustment that makes each team's cap space match this.

Pick trades: the 2027 and 2028 NFL draft pages on Wikipedia list every pick already traded ("Green Bay → Dallas").
Each hop moves one pick of that round the sender holds: his own if he still has it, otherwise one he received.

Writes data.json "realCap": {team: {year: {dead, space}}} in $M, and "pickTrades": [[year, round, from, to], ...].
Usage: python3 -I tools/realcap.py <folder with the saved pages: <team-slug>.html, 2027_NFL_draft.html, 2028_NFL_draft.html>
"""
import glob, html, json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
dpath = os.path.join(here, '..', 'data.json')
folder = sys.argv[1]
SLUG = {'arizona-cardinals': 'ARI', 'atlanta-falcons': 'ATL', 'baltimore-ravens': 'BAL', 'buffalo-bills': 'BUF', 'carolina-panthers': 'CAR',
        'chicago-bears': 'CHI', 'cincinnati-bengals': 'CIN', 'cleveland-browns': 'CLE', 'dallas-cowboys': 'DAL', 'denver-broncos': 'DEN',
        'detroit-lions': 'DET', 'green-bay-packers': 'GB', 'houston-texans': 'HOU', 'indianapolis-colts': 'IND', 'jacksonville-jaguars': 'JAX',
        'kansas-city-chiefs': 'KC', 'las-vegas-raiders': 'LV', 'los-angeles-chargers': 'LAC', 'los-angeles-rams': 'LA', 'miami-dolphins': 'MIA',
        'minnesota-vikings': 'MIN', 'new-england-patriots': 'NE', 'new-orleans-saints': 'NO', 'new-york-giants': 'NYG', 'new-york-jets': 'NYJ',
        'philadelphia-eagles': 'PHI', 'pittsburgh-steelers': 'PIT', 'san-francisco-49ers': 'SF', 'seattle-seahawks': 'SEA',
        'tampa-bay-buccaneers': 'TB', 'tennessee-titans': 'TEN', 'washington-commanders': 'WAS'}
WIKI = {'Arizona': 'ARI', 'Atlanta': 'ATL', 'Baltimore': 'BAL', 'Buffalo': 'BUF', 'Carolina': 'CAR', 'Chicago': 'CHI', 'Cincinnati': 'CIN',
        'Cleveland': 'CLE', 'Dallas': 'DAL', 'Denver': 'DEN', 'Detroit': 'DET', 'Green Bay': 'GB', 'Houston': 'HOU', 'Indianapolis': 'IND',
        'Jacksonville': 'JAX', 'Kansas City': 'KC', 'Las Vegas': 'LV', 'LA Chargers': 'LAC', 'LA Rams': 'LA', 'Miami': 'MIA', 'Minnesota': 'MIN',
        'New England': 'NE', 'New Orleans': 'NO', 'NY Giants': 'NYG', 'NY Jets': 'NYJ', 'Philadelphia': 'PHI', 'Pittsburgh': 'PIT',
        'San Francisco': 'SF', 'Seattle': 'SEA', 'Tampa Bay': 'TB', 'Tennessee': 'TEN', 'Washington': 'WAS'}
def money(s): return float(re.sub(r'[^\d.]', '', s) or 0) / 1e6
def flat(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s)))

def team(path):
    t = open(path, encoding='utf-8').read()
    out = {}
    for yr in (2026, 2027, 2028):
        i = t.find(f'id="y{yr}"'); j = t.find(f'id="y{yr + 1}"')
        if i < 0: continue
        blk = t[i:j if j > 0 else len(t)]
        txt = flat(blk)
        dead = re.search(r'Dead Money Name Cap Number .*? TOTAL \$([\d,]+)', txt)
        d = money(dead.group(1)) if dead else 0
        # voided contracts: the row's base salary reads "Void"; what accelerates is in the dead-money column
        void = 0
        for row in re.findall(r'<tr>(.*?)</tr>', blk, re.S):
            tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
            if len(tds) > 12 and flat(tds[1]).strip() == 'Void':
                cut = re.search(r'class="cut"[^>]*>\$?([\d,]+)', row)
                if cut: void += money(cut.group(1))
        tot = re.search(r'Total Cap Liabilities: \$([\d,]+) Top 51: \$([\d,]+) Team Cap Space: (-?\(?)\$([\d,]+)', txt)   # ($x) is over the cap
        out[yr] = {'dead': round(d + void, 1), 'liab': money(tot.group(1)) if tot else None, 'space': (-1 if tot and tot.group(3) else 1) * money(tot.group(4)) if tot else None}
    return out

def picks(path, yr):
    t = open(path, encoding='utf-8').read()
    moves = []
    for r in range(1, 8):
        i = t.find(f'id="Round_{r}"')
        if i < 0: continue
        j = min([k for k in (t.find(f'id="Round_{x}"') for x in range(r + 1, 9)) if k > i] + [t.find('id="References"')])
        for chain, _ in re.findall(r'((?:[A-Z][A-Za-z.]*(?: [A-Z][A-Za-z.]*)* → )+[A-Z][A-Za-z.]*(?: [A-Z][A-Za-z.]*)*) \((\w+)\)', flat(t[i:j])):
            hops = [WIKI.get(x.strip()) for x in chain.split('→')]
            if all(hops): moves.extend([yr, r, a, b] for a, b in zip(hops, hops[1:]))
    return moves

data = json.load(open(dpath))
real = {}
for f in glob.glob(os.path.join(folder, '*.html')):
    slug = os.path.basename(f)[:-5]
    if slug not in SLUG: continue
    real[SLUG[slug]] = {str(y): {'dead': v['dead'], 'space': round(v['space'], 1) if v['space'] is not None else None} for y, v in team(f).items()}
moves = []
for yr in (2027, 2028):
    p = os.path.join(folder, f'{yr}_NFL_draft.html')
    if os.path.exists(p): moves += picks(p, yr)
data.pop('dead', None); data.pop('capAdj', None)
data['realCap'], data['pickTrades'] = real, moves
json.dump(data, open(dpath, 'w'), separators=(',', ':'))
print('teams', len(real), '| dead 2026 total', round(sum(v['2026']['dead'] for v in real.values()), 1), '| pick moves', len(moves))
for t in sorted(real, key=lambda t: -real[t]['2026']['dead'])[:6]: print(' ', t, real[t])
