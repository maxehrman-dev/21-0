"""Real names for the draft classes after 2027, from the national recruiting rankings.

2028: the high school class of 2025, college sophomores in 2026. 2029: the class of 2026, college freshmen.
2030: the class of 2027, high school seniors in fall 2026. Only players whose position and school were confirmed
are listed; the game fills each class out to full size and mixes these players in, because a recruiting ranking
is not a draft ranking: some stars go early, some fade, and late bloomers pass them.

With the Wikipedia pages for each recruiting class saved in a folder (w2025.html, w2026.html, w2027.html from
https://en.wikipedia.org/wiki/2025_college_football_recruiting_class and so on), it also reads their table of top
recruits, orders them by their average ESPN, 247Sports and Rivals/On3 rank, and puts them first; the hand list fills in.

Writes data.json "classes": {year: [[recruit rank, position, name, school], ...]}.
Usage: python3 -I tools/futureclasses.py [folder with the Wikipedia pages]
"""
import html, json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
dpath = os.path.join(here, '..', 'data.json')

CLASSES = {
    2028: [
        ('QB', 'Bryce Underwood', 'Michigan'), ('OT', 'David Sanders Jr.', 'Tennessee'), ('DT', 'Elijah Griffin', 'Georgia'),
        ('QB', 'Keelon Russell', 'Alabama'), ('QB', 'Julian Lewis', 'Colorado'), ('WR', 'Dakorien Moore', 'Oregon'),
        ('OT', 'Michael Fasusi', 'Oklahoma'), ('CB', "Na'eem Offord", 'Oregon'), ('DT', 'Justus Terry', 'Texas'),
        ('QB', 'Tavien St. Clair', 'Ohio State'), ('S', 'Jonah Williams', 'Texas'), ('OT', 'Josh Petty', 'Georgia Tech'),
        ('CB', 'Devin Sanchez', 'Ohio State'), ('CB', 'DJ Pickett', 'LSU'), ('CB', 'Dijon Lee', 'Alabama'),
        ('S', 'Trey McNutt', 'Oregon'), ('OT', 'Will Black', 'Notre Dame'), ('WR', 'Malachi Toney', 'Miami'),
        ('QB', 'Jaron-Keawe Sagapolutele', 'California'),
    ],
    2029: [
        ('DT', 'Lamar Brown', 'LSU'), ('OT', 'Keenyi Pepe', 'USC'), ('WR', 'Chris Henry Jr.', 'Ohio State'),
        ('QB', 'Faizon Brandon', 'Tennessee'), ('QB', 'Jared Curtis', 'Vanderbilt'), ('QB', 'Dia Bell', 'Texas'),
        ('QB', 'Keisean Henderson', 'Houston'), ('QB', 'Ryder Lyons', 'BYU'), ('EDGE', 'Luke Wafle', 'USC'),
        ('DT', 'Jaimeon Winfield', 'USC'), ('LB', 'Xavier Griffin', 'Alabama'), ('RB', 'Ezavier Crowell', 'Alabama'),
        ('CB', 'Jorden Edmonds', 'Alabama'), ('EDGE', 'Anthony Jones', 'Oregon'), ('S', 'Jett Washington', 'Oregon'),
        ('IOL', 'Immanuel Iheanacho', 'Oregon'), ('EDGE', 'Rodney Dunham', 'Notre Dame'), ('EDGE', 'Carter Meadows', 'Michigan'),
        ('OT', 'Jackson Cantwell', 'Miami'), ('EDGE', 'Zion Elee', 'Maryland'), ('WR', 'Tristen Keys', 'Tennessee'),
    ],
    2030: [
        ('DT', 'Jalen Brewster', 'Texas Tech'), ('OT', 'Mark Matthews', 'Texas A&M'),
        ('CB', 'John Meredith III', 'Uncommitted'), ('WR', 'Jamier Brown', 'Ohio State'), ('TE', 'Ahmad Hudson', 'Ohio State'),
        ('EDGE', 'Anthony Sweeney', 'Texas Tech'), ('S', 'Kamarui Dorsey', 'Texas A&M'), ('IOL', 'Kennedy Brown', 'Texas A&M'),
        ('EDGE', 'Zyron Forstall', 'Texas A&M'), ('CB', 'Raylaun Henry', 'Texas A&M'), ('WR', 'Easton Royal', 'Texas'),
        ('OT', 'Cooper Hackett', 'Oklahoma'), ('RB', 'David Gabriel Georges', 'Tennessee'), ('IOL', 'Maxwell Hiller', 'Florida'),
        ('QB', 'Will Mencl', 'Oregon'), ('WR', 'Dakota Guerrant', 'Harper Woods HS (MI)'),
    ],
}

POS = {'quarterback': 'QB', 'qb': 'QB', 'running back': 'RB', 'rb': 'RB', 'wide receiver': 'WR', 'wr': 'WR', 'tight end': 'TE', 'te': 'TE',
       'offensive tackle': 'OT', 'ot': 'OT', 'offensive guard': 'IOL', 'og': 'IOL', 'g': 'IOL', 'guard': 'IOL', 'center': 'IOL', 'iol': 'IOL',
       'interior offensive lineman': 'IOL', 'offensive lineman': 'IOL', 'offensive line': 'IOL', 'ol': 'IOL', 'defensive tackle': 'DT', 'dt': 'DT',
       'defensive lineman': 'DT', 'dl': 'DT', 'defensive end': 'EDGE', 'de': 'EDGE', 'edge': 'EDGE', 'edge rusher': 'EDGE', 'linebacker': 'LB', 'lb': 'LB',
       'cornerback': 'CB', 'cb': 'CB', 'safety': 'S', 's': 'S', 'athlete': 'ATH', 'ath': 'ATH'}
def wiki(path):
    t = open(path, encoding='utf-8').read()
    tables = re.findall(r'<table class="wikitable[^"]*"[^>]*>(.*?)</table>', t, re.S)
    out = []
    for r in re.findall(r'<tr[^>]*>(.*?)</tr>', tables[1], re.S)[1:]:
        cells = [re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', '', c))).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, re.S)]
        if len(cells) < 4: continue
        name, pos = re.sub(r'\[.*?\]', '', cells[0]).strip(), POS.get(cells[1].lower().strip())
        if not pos: continue
        if pos == 'ATH': pos = ['WR', 'CB', 'S'][sum(map(ord, name)) % 3]     # athletes: the spot they are most likely to play
        ranks = [int(x) for x in cells[3:] if re.fullmatch(r'\d+', x)]
        out.append((sum(ranks) / len(ranks) if ranks else 60, pos, name, cells[2].replace('Miami (FL)', 'Miami')))
    return [(p, n, sc) for _, p, n, sc in sorted(out)]

folder = sys.argv[1] if len(sys.argv) > 1 else None
for draft, hs in ((2028, 2025), (2029, 2026), (2030, 2027)):
    f = folder and os.path.join(folder, f'w{hs}.html')
    if f and os.path.exists(f):
        W = wiki(f); names = {n for _, n, _ in W}
        CLASSES[draft] = W + [x for x in CLASSES[draft] if x[1] not in names]

data = json.load(open(dpath))
data['classes'] = {str(yr): [[i + 1, pos, n, sch] for i, (pos, n, sch) in enumerate(L)] for yr, L in CLASSES.items()}
json.dump(data, open(dpath, 'w'), separators=(',', ':'))
print({yr: len(L) for yr, L in CLASSES.items()})
