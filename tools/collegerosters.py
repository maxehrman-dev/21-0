"""Real college players for the draft classes, from the 2026 college rosters, and when each one turns pro.

Reads each school's 2026 season page from Wikipedia, saved in a folder as "<School>.html" (for example
https://en.wikipedia.org/wiki/2026_Alabama_Crimson_Tide_football_team saved as Alabama.html). From each roster it
takes every player's class, redshirt flag and injury flag. From the rest of the page (game recaps, stat leaders,
depth chart, injury report) it measures how much he plays and produces. Then it decides the draft he enters.

When does a player turn pro? A player can enter the draft three years after high school and must leave once his
eligibility runs out (four seasons to play, inside five years; a redshirt year is the fifth). In between, every
spring he decides, and the odds depend on:
  - performance and playing time: starters who produce leave early; little-used players stay,
  - his team: a starter on a national contender leaves early (scouts see him every week); a backup on a stacked
    roster waits his turn and stays longer; a starter at a smaller program often stays another year,
  - injuries: a player hurt in 2026 usually comes back to rebuild his stock, and if he had not redshirted yet,
    the injury (a medical redshirt) gives him an extra year,
  - redshirts: a freshman who barely plays in 2026 is redshirting, which adds a year to his clock.
The decision is seeded by his name, so it is the same every time the tool runs.

Run after tools/futureclasses.py. It also moves top recruits from data.json "classes" to the year the model picks
for them, and writes data.json "pool": {year: [[position, name, school, note], ...]}, best first, which the game
uses to fill each draft board below the ranked recruits.
Usage: python3 -I tools/collegerosters.py <folder with the saved pages>
"""
import glob, hashlib, html, json, math, os, re, sys, unicodedata

here = os.path.dirname(os.path.abspath(__file__))
dpath = os.path.join(here, '..', 'data.json')
folder = sys.argv[1]

# how strong each program is (0 to 1): contenders play on TV every week, and their depth charts are stacked
TOP = ('Alabama|Georgia|Ohio State|Texas|Oregon|LSU|Michigan|Notre Dame|Penn State|Miami|Clemson|USC|Texas A&M|Tennessee|Oklahoma|Ole Miss|'
       'Indiana|Florida').split('|')
MID = ('Florida State|Auburn|Missouri|South Carolina|Arkansas|Kentucky|Washington|UCLA|Wisconsin|Iowa|Nebraska|Utah|BYU|Texas Tech|Louisville|SMU|'
       'Arizona State|Kansas State|Iowa State|Colorado|Illinois|Vanderbilt|Mississippi State|Minnesota|Baylor|TCU|North Carolina|Duke|Georgia Tech|'
       'Virginia Tech|Pittsburgh|Boise State').split('|')
def strength(sch):
    return 1.0 if sch in TOP else .7 if sch in MID else .45

POS = {'QB': 'QB', 'RB': 'RB', 'FB': 'RB', 'WR': 'WR', 'TE': 'TE', 'OT': 'OT', 'T': 'OT', 'OG': 'IOL', 'G': 'IOL', 'C': 'IOL', 'IOL': 'IOL', 'OL': 'OL',
       'DE': 'EDGE', 'EDGE': 'EDGE', 'OLB': 'EDGE', 'DT': 'DT', 'NT': 'DT', 'DL': 'DL', 'LB': 'LB', 'ILB': 'LB', 'MLB': 'LB', 'CB': 'CB', 'S': 'S',
       'FS': 'S', 'SS': 'S', 'DB': 'DB', 'NB': 'CB', 'STAR': 'S', 'K': 'K', 'PK': 'K', 'ATH': 'ATH'}
HEAD = [(r'Quarterbacks?', 'QB'), (r'Running ?backs?', 'RB'), (r'Wide receivers?', 'WR'), (r'Tight ends?', 'TE'), (r'Offensive (?:line(?:m[ae]n)?|tackles?)', 'OL'),
        (r'Offensive guards?|Centers?', 'IOL'), (r'Defensive (?:line(?:m[ae]n)?)', 'DL'), (r'Defensive ends?|Edge(?: rushers?)?', 'EDGE'), (r'Defensive tackles?', 'DT'),
        (r'(?:Inside |Outside )?Linebackers?', 'LB'), (r'Defensive backs?', 'DB'), (r'Cornerbacks?', 'CB'), (r'Safet(?:y|ies)', 'S'),
        (r'Specials? teams?|Kickers?|Punters?|Long snappers?', 'ST')]
CLS = {'fr': 1, 'freshman': 1, 'so': 2, 'sophomore': 2, 'jr': 3, 'junior': 3, 'sr': 4, 'senior': 4, 'gr': 5, 'gs': 5, 'graduate': 5, '5th year': 5, 'fifth year': 5}

def key(n):
    n = unicodedata.normalize('NFKD', n).encode('ascii', 'ignore').decode().lower()
    n = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b\.?', '', n)
    return re.sub(r'[^a-z]', '', n)
def rnd(*a):
    return int(hashlib.md5('|'.join(map(str, a)).encode()).hexdigest()[:8], 16) / 0xffffffff
def flat(s):
    s = re.sub(r'<img[^>]*alt="(Redshirt|Injured)"[^>]*>', r' [\1] ', s)
    s = re.sub(r'<(style|script)[^>]*>.*?</\1>', ' ', s, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s)))

def side(pos, name, ht=None, wt=None):
    """Turn a roster group into one of the game's positions."""
    if pos == 'OL': return 'OT' if (ht or 0) >= 77 else 'IOL' if ht else ['OT', 'IOL', 'IOL'][int(rnd('ol', name) * 3)]
    if pos == 'DL': return 'DT' if (wt or 0) >= 280 else 'EDGE' if wt else ['EDGE', 'DT'][int(rnd('dl', name) * 2)]
    if pos == 'DB': return ['CB', 'CB', 'S'][int(rnd('db', name) * 3)]
    if pos == 'ATH': return ['WR', 'CB', 'S', 'RB'][int(rnd('ath', name) * 4)]
    return pos

def parse(path):
    sch = os.path.basename(path)[:-5]
    raw = open(path, encoding='utf-8').read()
    out = []
    # 1. pages built on the roster template: every player is a {{American football roster/Player|...}} call
    for p in re.findall(r'\{\{American football roster/Player\|([^}]*)\}\}', html.unescape(raw)):
        kv = dict((x.split('=', 1) + [''])[:2] for x in p.split('|'))
        kv = {k.strip().lower(): v.strip() for k, v in kv.items()}
        pos = POS.get(kv.get('pos', '').upper().split('/')[0])
        cl = CLS.get(kv.get('class', '').lower().rstrip('.'))
        name = re.sub(r'\s+', ' ', (kv.get('first', '') + ' ' + kv.get('last', '')).strip())
        if not pos or not cl or len(name) < 4: continue
        out.append(dict(n=name, pos=side(pos, name), cl=cl, rs=kv.get('rs', '').lower() in ('y', 'yes'), inj=kv.get('inj', '').lower() in ('y', 'yes'), sch=sch))
    if not out:
        # 2. pages with a written-out roster: "Quarterbacks 10 – Austin Mack – [Redshirt] Senior (6'6, 226)"
        i = raw.find('id="Roster')
        if i < 0: return sch, [], flat(raw)
        seg = raw[i:]; j = seg.find('<h2', 50); seg = seg[:j if j > 0 else len(seg)]
        txt = flat(seg)
        heads = sorted((m.start(), g) for rx, g in HEAD for m in re.finditer(r'\b(?:' + rx + r')\b', txt, re.I))
        ent = re.compile(r"(?<![\d'])(\d{1,2})\s+(?:[–-]\s+)?([A-Z][^\d\[\]()–]{2,40}?)\s+[–-]\s+(?:[A-Z]{1,4}/[A-Z]{1,4}\s+[–-]\s+)?((?:\[(?:Injured|Redshirt)\]\s*)*)"
                         r"(?:Redshirt\s+)?(freshman|sophomore|junior|senior|graduate|5th year|Fr\.|So\.|Jr\.|Sr\.|Gr\.)\s*(?:\((\d)'(\d{1,2}),?\s*(\d{3})\))?", re.I)
        for m in ent.finditer(txt):
            g = [h for at, h in heads if at < m.start()]
            grp = g[-1] if g else None
            if not grp or grp == 'ST': continue
            name = m.group(2).strip()
            ht = int(m.group(5)) * 12 + int(m.group(6)) if m.group(5) else None
            wt = int(m.group(7)) if m.group(7) else None
            out.append(dict(n=name, pos=side(grp, name, ht, wt), cl=CLS[m.group(4).lower().rstrip('.')], rs='[Redshirt]' in m.group(3) or 'redshirt' in m.group(0).lower().split(m.group(4).lower())[0][-10:],
                            inj='[Injured]' in m.group(3), sch=sch))
    # the rest of the page, without the roster: recaps, box score leaders, stats, depth chart, injury report
    i = raw.find('id="Roster'); rest = raw
    if i > 0:
        j = raw.find('<h2', i + 50); rest = raw[:i] + (raw[j:] if j > 0 else '')
    return sch, out, flat(rest)

STARTERS = {'QB': 1, 'RB': 1, 'WR': 3, 'TE': 1, 'OT': 2, 'IOL': 3, 'EDGE': 2, 'DT': 2, 'LB': 2, 'CB': 2, 'S': 2, 'K': 1}
# the game's draft class mix, so the pool has as many linemen and corners as a real draft
MIX = {'QB': 9, 'RB': 10, 'WR': 21, 'TE': 9, 'OT': 13, 'IOL': 13, 'EDGE': 17, 'DT': 15, 'LB': 12, 'CB': 19, 'S': 11, 'K': 1}
INJ = re.compile(r'injur|torn|\bACL\b|surgery|out for the (?:season|year)|season-ending|medical redshirt|fracture|sprain', re.I)
players = []
for f in sorted(glob.glob(os.path.join(folder, '*.html'))):
    sch, ps, txt = parse(f)
    if not ps: continue
    ts = strength(sch)
    seen = set()
    for p in ps:
        k = key(p['n'])
        if k in seen: continue
        seen.add(k)
        hits = [m.start() for m in re.finditer(re.escape(p['n']), txt)]
        p['m'] = len(hits)
        # hurt this season: flagged on the roster, or named right next to an injury in the recaps or injury report
        p['inj'] = p['inj'] or any(INJ.search(txt[max(0, h - 160):h + 200]) for h in hits)
        p['ts'] = ts
        players.append(p)
    # playing time, 0 to 1, against the teammates at his position: recaps name a lineman far less often than a
    # receiver, so a player is judged inside his own position group. The most-named players start; where nobody at
    # a position is named (linemen, often), the older players start.
    for pos, n in STARTERS.items():
        grp = [p for p in players if p['sch'] == sch and p['pos'] == pos]
        grp.sort(key=lambda p: -(p['m'] * 3 + p['cl'] + (1 if p['rs'] else 0) + rnd('pt', p['n']) * 1.5))
        for r, p in enumerate(grp):
            p['pt'], p['start'] = max(0, 1 - r / (2.2 * n)), r < n
    for p in players:
        if p['sch'] == sch and 'pt' not in p: p['pt'], p['start'] = 0, False

data = json.load(open(dpath))
recruits = {}
for yr, L in data.get('classes', {}).items():
    for row in L: recruits[key(row[2]) + '@' + row[3]] = (int(yr), row)     # same name at the same school
board27 = {key(r[2]) for r in data['prospects']}
nfl = {key(p[1]) for p in data['players']} if isinstance(data['players'], list) else set()

WORD = {3: 'three', 4: 'four', 5: 'five'}
def decide(p):
    """The draft he enters, and the one-line story of how he got there."""
    n, cl, rs, pt, ts, inj = p['n'], p['cl'], p['rs'], p['pt'], p['ts'], p['inj']
    if cl >= 5: return 2027, 'Final year of eligibility in 2026'
    sp = cl + (1 if rs else 0)                     # years in school, counting 2026
    first = 2027 + max(0, 3 - sp)                  # three years out of high school
    redshirting = not rs and cl <= 2 and pt < .22 and not inj      # barely plays in 2026: this is his redshirt year
    medical = not rs and inj                                      # hurt before using his redshirt: the injury becomes it
    later_rs = not rs and not redshirting and not medical and rnd('rs', n) < .2  # sits out a year later on (injury, transfer)
    last = 2027 + (4 - cl) + (1 if (redshirting or medical or later_rs) else 0)
    if rs: last = 2027 + (4 - cl)
    last = max(last, first)
    t = p['talent']
    for y in range(first, last + 1):
        if y == last: break
        yrs = sp + (y - 2027)
        z = (-1.0 + 6.0 * (t - .62) + .9 * (y - first) + 1.2 * ts * pt - 1.5 * ts * max(0, .45 - pt) - (.4 if ts < .6 and pt > .6 else 0)
             - (1.8 if inj and y == 2027 else 0))
        if rnd('go', n, y) < 1 / (1 + math.exp(-z)): break
    yrs = sp + (y - 2027)
    if inj and y > 2027 and (medical or rs):
        why = 'Hurt in 2026; ' + ('takes a medical redshirt and ' if medical else '') + f'comes back to rebuild his stock, declares after {WORD.get(yrs, yrs)} years'
    elif inj and y > 2027:
        why = 'Hurt in 2026; comes back for another season to prove he is healthy'
    elif y == first and pt >= .5:
        why = f'Starter who leaves as soon as he is eligible' + (' (scouts see him every week)' if ts >= 1 else '')
    elif y == first:
        why = 'Leaves as soon as he is eligible, betting on his tools'
    elif y == last and ts >= .9 and pt < .4:
        why = f'Waits his turn behind a deep {p["sch"]} depth chart and uses every year'
    elif y == last and yrs >= 5:
        why = 'Redshirting in 2026, plays out all five years' if redshirting else 'Redshirted early, plays out all five years' if rs else 'Plays out all five years'
    elif y == last:
        why = 'Plays out his eligibility'
    elif ts < .6 and pt >= .5:
        why = f'Stays another year as the face of the program, declares after {WORD.get(yrs, yrs)} years'
    else:
        why = ('Redshirting in 2026; declares' if redshirting else 'Declares') + f' after {WORD.get(yrs, yrs)} years in school'
    return y, why

# how good is he? the top recruits carry their ranking; everyone else is judged on playing time, program and class
for p in players:
    k = key(p['n'])
    p['rk'] = k + '@' + p['sch']
    base = .45 * p['pt'] + .3 * p['ts'] + .15 * (1 if p['start'] else 0) + .1 * min(1, p['m'] / 12)
    if p['cl'] <= 2: base += .08 * (1 - p['pt'])              # young players who are not starting yet still have upside
    if p['rk'] in recruits: base = max(base, .8 + .2 * max(0, 1 - recruits[p['rk']][1][0] / 50))
    p['talent'] = base + (rnd('t', p['n']) - .5) * .08
    p['year'], p['why'] = decide(p)

moved, pool = 0, {}
by, done = {}, set()
for p in players:
    k = key(p['n'])
    if k in board27 or k in nfl or k in done: continue      # a transfer can show up on two rosters: count him once
    done.add(k)
    if p['rk'] in recruits:
        yr, row = recruits[p['rk']]
        if p['year'] != yr:                         # a ranked recruit whose clock the model changed: move him
            data['classes'][str(yr)].remove(row)
            data['classes'].setdefault(str(p['year']), []).append(row[:4] + [p['why']])
            moved += 1
        elif len(row) < 5: row.append(p['why'])
        continue
    by.setdefault(p['year'], []).append(p)
for yr in data['classes']:
    data['classes'][yr].sort(key=lambda r: r[0])
for yr, L in sorted(by.items()):
    L.sort(key=lambda p: -(p['talent'] - (.35 if p['pos'] == 'K' else 0)))      # kickers go late, as in a real draft
    room = {pos: math.ceil(240 * n / sum(MIX.values()) * 1.15) for pos, n in MIX.items()}
    keep = []
    for p in L:
        if p['talent'] >= .42 and room.get(p['pos'], 0) > 0: keep.append(p); room[p['pos']] -= 1
    pool[str(yr)] = [[p['pos'], p['n'], p['sch'], p['why']] for p in keep]
data['pool'] = pool
json.dump(data, open(dpath, 'w'), separators=(',', ':'))
print('players read:', len(players), '| recruits moved:', moved, '| pool:', {y: len(v) for y, v in pool.items()},
      '| classes:', {y: len(v) for y, v in data['classes'].items()})
