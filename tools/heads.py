"""Download NFL.com headshots for every rostered player and pack them into one sprite sheet per team."""
import csv, json, os, sys, io, re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

base = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(base, 'game', 'data.json')))
heads = {}
with open(os.path.join(base, 'dl', 'players.csv'), newline='', encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if r['headshot']:
            heads[r['gsis_id']] = r['headshot']

CELL, COLS = 96, 10
cache = os.path.join(base, 'dl', 'hs')
os.makedirs(cache, exist_ok=True)

def url_for(u):
    m = re.search(r'/league/([^/?]+)$', u)
    if not m:
        return None
    return f'https://static.www.nfl.com/image/upload/c_thumb,g_face,w_{CELL},h_{CELL},f_png/league/{m.group(1)}'

def fetch(pid):
    out = os.path.join(cache, pid + '.png')
    if os.path.exists(out):
        return pid, True
    u = url_for(heads.get(pid, ''))
    if not u:
        return pid, False
    try:
        with urllib.request.urlopen(u, timeout=20) as r:
            b = r.read()
        Image.open(io.BytesIO(b)).verify()
        open(out, 'wb').write(b)
        return pid, True
    except Exception:
        return pid, False

ids = [p[0] for p in data['players']]
with ThreadPoolExecutor(16) as ex:
    res = dict(ex.map(fetch, ids))
print('downloaded', sum(res.values()), 'of', len(ids), flush=True)

by_team = {}
for p in data['players']:
    if res.get(p[0]):
        by_team.setdefault(p[3], []).append(p[0])
os.makedirs(os.path.join(base, 'game', 'img'), exist_ok=True)
index = {}
total = 0
for t, L in by_team.items():
    rows = (len(L) + COLS - 1) // COLS
    sheet = Image.new('RGBA', (COLS * CELL, rows * CELL), (0, 0, 0, 0))
    for i, pid in enumerate(L):
        im = Image.open(os.path.join(cache, pid + '.png')).convert('RGBA').resize((CELL, CELL))
        sheet.paste(im, ((i % COLS) * CELL, (i // COLS) * CELL))
        index[pid] = [t, i]
    path = os.path.join(base, 'game', 'img', t + '.webp')
    sheet.save(path, 'WEBP', quality=72, method=6)
    total += os.path.getsize(path)
json.dump({'cols': COLS, 'rows': {t: (len(L) + COLS - 1) // COLS for t, L in by_team.items()}, 'ix': index},
          open(os.path.join(base, 'game', 'heads.json'), 'w'), separators=(',', ':'))
print('sheets', len(by_team), 'bytes', total)
