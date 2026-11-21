"""Real names for the draft classes after 2027, from the national recruiting rankings.

2028: the high school class of 2025, college sophomores in 2026. 2029: the class of 2026, college freshmen.
2030: the class of 2027, high school seniors in fall 2026. Only players whose position and school were confirmed
are listed; the game fills each class out to full size and mixes these players in, because a recruiting ranking
is not a draft ranking: some stars go early, some fade, and late bloomers pass them.

Writes data.json "classes": {year: [[recruit rank, position, name, school], ...]}.
Usage: python3 -I tools/futureclasses.py
"""
import json, os

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
        ('DT', 'Jalen Brewster', 'Texas Tech'), ('EDGE', 'David Jacobs', 'Ohio State'), ('OT', 'Mark Matthews', 'Texas A&M'),
        ('CB', 'John Meredith III', 'Uncommitted'), ('WR', 'Jamier Brown', 'Ohio State'), ('TE', 'Ahmad Hudson', 'Ohio State'),
        ('EDGE', 'Anthony Sweeney', 'Texas Tech'), ('S', 'Kamarui Dorsey', 'Texas A&M'), ('IOL', 'Kennedy Brown', 'Texas A&M'),
        ('EDGE', 'Zyron Forstall', 'Texas A&M'), ('CB', 'Raylaun Henry', 'Texas A&M'), ('WR', 'Easton Royal', 'Texas'),
        ('OT', 'Cooper Hackett', 'Oklahoma'), ('RB', 'David Gabriel Georges', 'Tennessee'), ('IOL', 'Maxwell Hiller', 'Florida'),
        ('QB', 'Will Mencl', 'Oregon'), ('WR', 'Dakota Guerrant', 'Harper Woods HS (MI)'),
    ],
}

data = json.load(open(dpath))
data['classes'] = {str(yr): [[i + 1, pos, n, sch] for i, (pos, n, sch) in enumerate(L)] for yr, L in CLASSES.items()}
json.dump(data, open(dpath, 'w'), separators=(',', ':'))
print({yr: len(L) for yr, L in CLASSES.items()})
