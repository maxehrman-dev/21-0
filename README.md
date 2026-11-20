<p align="center"><img src="icon-192.png" width="96" height="96" alt="21-0 logo"></p>

<h1 align="center">21-0: Run the Front Office</h1>

<p align="center">A pro football front-office game. Take over any team as it stood at Week 1 of 2026 and build the first team to go 21-0: 17-0 in the regular season, then four playoff wins.</p>

<p align="center"><img src="docs/desktop.png" width="640" alt="21-0 on desktop at the trade deadline"> <img src="docs/phone.png" width="200" alt="21-0 on a phone"></p>

## How a run works

| Phase | What you do |
|---|---|
| **2026, first half** | Plays out with the team's real roster. No moves. |
| **Week 9 deadline** | Your one stop: take offers from your inbox or build your own trades. |
| **Playoffs** | 8 teams per conference and no byes, so 21-0 is possible. Watch round by round or skip ahead. |
| **2027 offseason** | Progression and regression, re-sign negotiations, three free-agency waves, the 2027 draft, and the cut to 53. |
| **2027 season** | One more deadline and one more shot. |
| **The end** | A rebuild report card, season awards, your GM résumé and a share card. |

## What's inside

- **Real starting point.** 2026 rosters, contracts and cap hits. Ratings work like Madden's. They draw on box scores, efficiency, advanced and Next Gen stats since 2019, snap share, contracts, draft pedigree and age curves, plus winning and playoff success for quarterbacks. Proven stars stay near the top through a quiet year, and every player card shows what his rating rests on.
- **A trade market calibrated on real deals.** Values were fitted to the last 1,000 trades (2013–2026): the pick chart from 375 pick-for-pick swaps, future picks worth about 60% of the same slot, and star prices matching what Tyreek Hill, Davante Adams and Jalen Ramsey actually fetched. Each team also weighs its own situation, needs, GM style, scouting, cap room and division rivalries.
- **Trading like a front office.** Offers come to you every window. Put players on your trade block and teams bid. Build a trade from a grid of teams that shows who wants your players, filter by position, and see every deal's value in wins. Ask around on any player for what teams would give. Seven-round picks, so role players move for late picks.
- **Trade calls.** Pitch a deal on the phone and negotiate. Every GM opens above fair value, and a bar shows your offer against their price. Every answer comes with their reasons, and the price comes down as you talk. Sweeten it, take something off, meet in the middle, ask who else they would move, bluff, or walk away. Each GM's temperament changes how the call goes.
- **Free agency with people in it.** Players care about money, winning, role and loyalty in different amounts. Every offer gets an answer right away: yes, a counter you can accept, or no. Pitch them to raise their interest, and hear about anyone you talked to who signs elsewhere.
- **Trade for anyone.** Search the league by name or position and trade for a player straight from the list. Every deal, offer and call has an × on each piece to take it out.
- **Position flexibility.** Move a tackle to guard or a corner to safety in the depth chart, a few points worse than at his own spot.
- **The real 2027 draft class**, with scouting ranges that can be wrong. Every pick's true rating is revealed on the spot: steal, as projected, or bust.
- **Seasons that feel alive.** Hidden form drives breakout years and slumps, injuries happen, owner confidence rises and falls, and awards are handed out at the end.
- **A game model tuned to the real league.** Team wins spread like they do in the NFL (best record usually 13 to 15 wins). Position value follows real analytics: the quarterback explains about 30% of the gap between teams, so an elite QB is worth about +5 wins and a star running back well under one. Every player card and trade shows what a move is worth in wins.
- **21-0 is a moonshot, not a lottery.** A team as it stands has about a 1 in 20,000 shot. A well-built team has about 1%, and a true superteam about 3%. Any given Sunday still applies.
- **Worst to first:** an optional mode limited to the 8 worst rosters.
- **Real contracts.** Lengths and salaries come from OverTheCap: this season's cap hit now, then each deal's real average from next season. The cap is the real $301.2M for 2026 and $327M for 2027, then grows about 7% a year.
- **Keep playing.** The scored run is 2026 and 2027, but after the final report you can keep going: a new offseason, a new draft class and a new season every year. Players age, retire and get replaced by drafted and undrafted rookies, so the league stays near the real average age of about 26.
- **Scout ahead.** The next draft class is in League › More, well before draft day.
- **Box scores for every game.** Tap any result for passing, rushing, receiving, defense and kicking lines and a player of the game. Season stats (completions, carries, targets, tackles, pass breakups, field goals) are built play by play and land in real NFL ranges.
- **A draft you can follow.** The draft shows who is on the clock, a ticker of the picks around now, the big board, and the full order round by round.
- **Calm by default.** Home shows four numbers and a short list of things that might need you: the owner, trade offers, injuries, needs. Each one opens the full detail. On a wide screen the sections and the next step live in a sidebar; on a phone they live in the bottom bar.
- **Built for phones.** A bottom tab bar with one big Next button, plus installable to your home screen.

## Controls

| Key | Action |
|---|---|
| `N` | Do the next step (sim, play the next round, end the wave...) |
| `1`–`5` | Home, Roster, Trade, League, Résumé |
| `Esc` | Close a pop-up or menu |

On a phone, the gold ▶ button in the middle of the tab bar always does the next step.

## Run it locally

It's a static site with no build step and no dependencies.

```bash
npm run dev
```

Then open http://localhost:8000. Opening `index.html` straight from disk won't load the data files.

## Tests

```bash
npm test
```

They play the engine end to end: a full 2026 season, trade-value sanity checks, AI offer fairness, the whole offseason, a 2027 season and the final report. GitHub Actions runs them on every push.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Page shell and every style |
| `engine.js` | Game engine: ratings, trade values, the sim, offseason, draft, free agency, awards |
| `app.js` | Interface |
| `data.json` | Rosters, contracts, ratings, potential, production, hype, schedule and 2027 prospects |
| `heads.json`, `img/` | Player headshot sprite sheets, one per team |
| `tests/` | Engine tests (`node --test`) |
| `tools/` | Scripts that built the ratings, contracts, headshots and trade research, plus a local server |

## Data and credits

- Rosters, stats, snap counts, draft history and trades: [nflverse](https://github.com/nflverse/nflverse-data), licensed CC BY 4.0.
- Player headshots: NFL.com images, matched through nflverse player IDs.

## Legal

21-0 is an unofficial fan project. It is not affiliated with, endorsed by or licensed by the National Football League, the NFL Players Association or any team. Team names, player names and player photos are the property of their respective owners. Ratings, trade values and results are simulated estimates.
