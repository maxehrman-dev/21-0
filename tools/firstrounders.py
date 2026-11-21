"""Mark first-round picks still on their rookie deals, so the game can offer the fifth-year option.

Adds field 19 to each player in data.json: [draft year, draft pick] for first-round picks drafted 2023 or later,
or null. The 2023 class's options were decided in spring 2026, so their 2026 contracts already reflect it;
the game offers the option for the 2024 class in its 2027 offseason, and so on.

Usage: python3 -I tools/firstrounders.py <folder with nflverse players.csv>
"""
import csv, json, os, sys

here = os.path.dirname(os.path.abspath(__file__))
dpath = os.path.join(here, '..', 'data.json')
data = json.load(open(dpath))
with open(os.path.join(sys.argv[1], 'players.csv'), newline='', encoding='utf-8') as fh:
    meta = {r['gsis_id']: r for r in csv.DictReader(fh)}

n = 0
for p in data['players']:
    m = meta.get(p[0], {})
    try: yr, rd, pk = int(m.get('draft_year') or 0), int(m.get('draft_round') or 0), int(m.get('draft_pick') or 0)
    except ValueError: yr = rd = pk = 0
    while len(p) < 19: p.append(None)
    val = [yr, pk] if rd == 1 and yr >= 2023 else None
    if len(p) == 19: p.append(val)
    else: p[19] = val
    n += bool(val)
json.dump(data, open(dpath, 'w'), separators=(',', ':'))
print('first-round picks on rookie deals:', n)
