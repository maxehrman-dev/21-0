# 21-0

An NFL front-office game. Pick any team as it stood at Week 1 of 2026 and try to build the first team to go 21-0: 17-0 in the regular season and 4-0 in the playoffs. You get the 2026 and 2027 seasons.

## How it plays

- **2026:** the first half plays out with the real roster. You get one stop at the Week 9 trade deadline, then the sim runs to the end. Playoffs use 8 teams per conference with no byes, so 21-0 is possible.
- **2027 offseason:** progression and regression, re-signing with contract negotiation, three waves of free agency with meetings and rival bids, the real 2027 draft class with scouting ranges, and the cut to 53.
- **2027:** one more deadline, one more season, then a rebuild report card and a shareable result.

Trades run on a value model calibrated against the last 1,000 real NFL trades (2013 to 2026). It accounts for talent, positional value, position-specific aging, real production, hype, contract status and cost, plus each team's situation, needs, GM style and cap room.

## Run it

It is a static site with no build step.

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly from disk will not load the data files.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell and all styles |
| `engine.js` | Game engine: ratings, trade values, sim, offseason, draft, free agency |
| `app.js` | Interface |
| `data.json` | Rosters, contracts, ratings, potential, production, hype, schedule, 2027 prospects |
| `heads.json`, `img/` | Player headshot sprite sheets, one per team |
| `tools/` | Scripts that built the ratings, headshots and trade research |

## Data sources

- Rosters, stats, snap counts, draft history and trades: [nflverse](https://github.com/nflverse/nflverse-data)
- Player headshots: NFL.com images, matched through nflverse player IDs

Player headshots and team names are the property of the NFL and its teams. This is an unofficial fan project and is not affiliated with or endorsed by the NFL.
