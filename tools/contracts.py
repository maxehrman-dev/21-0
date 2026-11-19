"""Refresh contract lengths and salaries from OverTheCap's position pages.

Keeps each player's current-season cap hit (field 6), sets the real end year (field 7, the year before free agency)
and stores the real average salary per year (field 17), which takes over from the next season.
Run from the repo root:  python3 tools/contracts.py   (needs network access to overthecap.com)
"""
import html, json, re, unicodedata, urllib.request

PAGES = ['quarterback', 'running-back', 'fullback', 'wide-receiver', 'tight-end', 'left-tackle', 'right-tackle', 'guard', 'center',
         'interior-defensive-line', 'edge-rusher', 'linebacker', 'cornerback', 'safety', 'kicker', 'punter', 'long-snapper']
TEAM = {'LAR': 'LA', 'JAC': 'JAX', 'WSH': 'WAS', 'LVR': 'LV', 'ARZ': 'ARI'}

def norm(n):
    n = unicodedata.normalize('NFKD', n).encode('ascii', 'ignore').decode().lower()
    n = re.sub(r"[.,'’\-]", '', n)
    n = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', n)
    return re.sub(r'\s+', ' ', n).strip()

def fetch(page):
    req = urllib.request.Request(f'https://overthecap.com/position/{page}', headers={'User-Agent': 'Mozilla/5.0'})
    h = urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'ignore')
    body = h[h.find('<tbody'):h.find('</tbody>')]
    for tr in re.findall(r'<tr>(.*?)</tr>', body, re.S):
        tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
        if len(tds) < 8:
            continue
        team = re.search(r'team-link ([A-Z]+)', tds[1])
        fa = re.search(r'(\d{4})', tds[7])
        yield {'n': html.unescape(re.sub('<[^>]+>', '', tds[0])).strip(), 'tm': TEAM.get(team.group(1), team.group(1)) if team else '',
               'apy': float(re.sub(r'[^\d.]', '', tds[4]) or 0) / 1e6, 'fa': int(fa.group(1)) if fa else None}

def main():
    rows = [r for page in PAGES for r in fetch(page)]
    by, bylast = {}, {}
    for r in rows:
        k = norm(r['n'])
        by.setdefault(k, []).append(r)
        bylast.setdefault((k.split(' ')[-1], r['tm']), []).append(r)
    D = json.load(open('data.json'))
    hit = 0
    for p in D['players']:
        k = norm(p[1])
        c = by.get(k, [])
        if len(c) > 1:
            c = [x for x in c if x['tm'] == p[3]] or c
        if not c:
            c = bylast.get((k.split(' ')[-1], p[3]), [])
            if len(c) != 1:
                c = []
        while len(p) < 18:
            p.append(None)
        if not c:
            continue
        r = c[0]
        hit += 1
        if r['fa']:
            p[7] = r['fa'] - 1
        apy = round(r['apy'], 2)
        p[17] = apy if apy > 0 and abs(apy - p[6]) > .01 else None
    json.dump(D, open('data.json', 'w'), separators=(',', ':'))
    print(f'{len(rows)} contracts, matched {hit} of {len(D["players"])} players')

if __name__ == '__main__':
    main()
