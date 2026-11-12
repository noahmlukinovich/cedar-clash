# Cedarville Clash 🐝

An affectionate, joke-heavy parody of Cedarville University in the style of the mobile base-builder / raid genre. Build up campus, train students and profs, and raid (entirely fictional) rival schools.

> Unofficial fan parody. Not affiliated with or endorsed by Cedarville University or any game studio. All art is drawn procedurally in code; no third-party game assets, logos, or fonts are used.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (offline mode unless the game server is running)
npm run dev:server # game server for online mode, on 127.0.0.1:8787 (Vite proxies /api to it)
npm test           # raid replay determinism + server end-to-end tests
npm run build      # type-check, build the game into dist/ and the server into server-dist/
```

To try online mode locally, create an invite code first:

```bash
npm run build:server && DB_PATH=./data/dev.db npm run admin -- invite 5
```

Desktop browser with mouse and keyboard; designed for 1280×800 and up. Requires Node 22.13 or newer.

**Single-player build:** https://noahmlukinovich.github.io/cedar-clash/ (deployed by `.github/workflows/deploy.yml` on every push to `main`; Pages must be set to *Source: GitHub Actions* in the repo settings). GitHub Pages has no game server, so the game runs in offline mode there.

**Multiplayer server:** see [`deploy/README.md`](deploy/README.md) for setting up a droplet. The droplet deploys new commits on `main` by itself within about 5 minutes, once they pass the tests.

## Online multiplayer

When the page is served with the game server behind it, players log in (invite-only) and their campus lives on the server. **Find a Rival** matches you against real players near your trophy count, or against a computer-generated campus if nobody is available.

- **Raids are verified by the server.** The raid simulation is deterministic: a fixed 30 Hz timestep and a seeded RNG, with no `Math.random`, `cos` or `sin` in gameplay code. The browser sends only *what you deployed, where, and on which tick*. The server replays that against the same setup and decides the stars, loot and trophies. If the browser's raid and the server's replay ever disagree, the server's result counts and the results screen says so.
- **The server runs the economy.** Every village action (build, upgrade, collect, train…) goes through `applyAction` (`src/game/actions.ts`). The browser applies it immediately, and the server applies the same code to its copy, which is the one that counts. Action batches carry sequence numbers, so a retried request never applies twice.
- **Defending.** While you're offline, others can raid a snapshot of your campus. You lose the loot they take: 35% of stored Tuition and Coffee, plus some of what's waiting in collectors. You get a popup next time you play. A raid with 40% or more destruction gives you a 6-hour shield (12 hours for 3 stars). Attacking a real player drops your own shield.
- **Visiting.** The **Visit** button on the Leaderboard (and on the "you were raided" popup) opens another player's campus to look around. It is read-only, shows only the layout and building levels, and leaves out hidden traps.
- **Abandoned raids** are settled automatically with the moves the server already received. Closing the tab mid-raid doesn't undo it.
- **Security:**
  - Passwords are hashed with scrypt.
  - Sessions are random tokens in `HttpOnly; Secure; SameSite=Strict` cookies, and only hashes of the tokens are stored.
  - POST requests need a custom header, a JSON body, and a same-origin `Origin`.
  - Logins, sign-ups and requests are rate-limited.
  - Campus names are restricted to a safe character set and escaped wherever they're displayed.
- **Known limits:**
  - The browser knows a raid's random seed, so a determined cheater could rehearse a raid offline before playing it. This is fine for friends; a public game would need more.
  - Different browsers' JavaScript engines can occasionally disagree in the last decimal place of a calculation, which could nudge a raid's result. The server's result always wins.

## How to play

1. **Collect** Tuition (Admissions Office) and Coffee (Coffee Cart) by clicking the bubbles over them, or use the green "collect all" button.
2. **Build and upgrade** from the **Shop**. Each job ties up a Facilities Crew builder; build more sheds for more builders. Click the **Facilities Crew** counter for a list of every upgrade you can do right now (its badge shows how many). The **DMC** level caps everything else.
3. **Train** troops in the **Army** menu. Residence halls set your army capacity. Click a troop to recruit one, or hold to keep recruiting; click a tile in the queue to cancel one for a full refund.
4. **Attack!** Start with the hand-built tutorial base, *Rival State U*, then use **Find a Rival** for procedurally generated campuses. You earn stars, loot, and trophies.
5. Unlock the **Library** (research), **The Hive**, the **Brew Lab** (spells), and the heroes **The Prof** and **The President** as the DMC levels up.

### Controls

| Village | Raid |
|---|---|
| Drag / WASD / arrows: pan | Click a card, then click or hold on grass outside the white zone to deploy |
| Mouse wheel or `+`/`-`: zoom | `1`–`9`: select a card |
| Click: select or collect | Click a deployed hero's card (or press `Space`): hero ability |
| Drag a selected building: move it | Drag on a building or blocked area: pan |
| `Esc`: cancel / deselect, `Del`: remove decor | **End Raid** gives up (free if nothing was deployed) |
| `` ` ``: cycle debug speed (1x / 10x / 60x) | |

The **⚙ Settings** panel has debug tools: speed toggle, free resources, finish all timers, trigger any event, copy/reset save.

## Features

- **Isometric canvas renderer** with procedurally drawn buildings, troops, trees, and particles: thick outlines, squash-and-stretch, confetti, screen shake, and Web Audio synthesized sound effects. There are no image or audio files.
- **Economy**: three resources (Tuition / Coffee / Chapel Credits), collectors, storage caps, builder-limited upgrade timers, DMC gating, and instant-finish with Chapel Credits.
- **Raids**: A* pathfinding on the grid, where walls are breakable high-cost tiles. Targeting AI per troop type, projectiles, building loot, 0–3 stars (50% / DMC destroyed / 100%), a 3-minute timer, and trophies with a league ladder.
- **Defenses**: RA Tower (rapid write-ups), Campus Safety Cart (parking tickets), Cedar Sprayer (40% slow, charged 2s freeze), Bible Prof Tower (prayer splash that targets the densest clump and blesses walls at Lv3+), Yellow Jacket Nest (hidden swarm trap), The Hive (student-section fans), brick walls, and Cedar Lake (blocks pathing).
- **Troops**: Freshman (gets lost), Engineering Major (10x wall damage), Nursing Student (healer), Theology Major (buff aura), Athlete (targets defenses). Business Major (targets storages, bonus loot), Music Major (ranged, every fourth hit doubles), Cross Country Runner (goes over walls and the lake, momentum), RA (tank that draws tower fire and sets off traps early), GO Team (a Global Outreach van that unloads five short-lived team members). **Heroes**: The Prof (*Pop Quiz* stun) and The President (*Convocation* rally).
- **Spells**: All-Nighter (rage), Snow Day (freeze defenses), Chapel Announcement (ignore traps).
- **Events**: Ring by Spring (pair-up buff, ring on the HUD, always on in real-world spring), Ohio wind (mid-raid push), Finals Week, campus construction fencing, Elephant Run (a limited-time freshmen conga-line raid mode), Campus Safety ticketing idle troops, "waiting in line at Chuck's…" training delays, and daily Chapel attendance (with a stern popup if you skip).
- **Achievements** such as *Dean's List*, *Academic Probation*, and *Walked Across the Lake Bridge*.
- **Saves**: `localStorage` with a versioned schema and step-by-step migrations (`src/game/save.ts`), offline progress, autosave, and export/reset.
- **Updates**: each build gets an id, which is baked into the bundle and published as `version.json`. Open tabs check it every 3 minutes and on refocus, and show a "new version — reload" bar. A tab running an older build than the one that last saved stops autosaving and asks the player to reload, so it can never overwrite newer progress.

## Project layout

```
src/
  config/     # ALL balancing data: buildings, troops, spells, balance knobs, humor text
  core/       # iso math, camera, RNG, particles, Web Audio synth, event bus
  game/       # state, save/migration, economy, army/research/heroes, events & chapel
  render/     # procedural drawing primitives, building + unit sprites, world/ground
  village/    # village scene: placement, moving, selection, collection; read-only scene for visiting another campus
  raid/       # base generator, A* pathfinding, raid simulation, deterministic raid engine,
              # raid outcome rules, raid scene + HUD
  net/        # online client: login screen, API calls, state sync, shared protocol types
  ui/         # DOM HUD, modals, icons, thumbnails
server/       # game server (Node + built-in SQLite): accounts, sync, matchmaking, raid replay
deploy/       # droplet setup: cloud-init, setup.sh, systemd unit, Caddyfile, push/invite scripts
test/         # vitest: replay determinism, server end-to-end
```

Code shared by the browser and the server (`config/`, `core/rng`, `core/bus`, `game/`, `raid/engine`, `raid/sim`, `raid/outcome`) must not touch the DOM.

### Balancing

Everything numeric lives in typed tables under `src/config/`:

- `buildings.ts`: per-level cost, time, HP, production, capacity, defense stats, and per-DMC count limits
- `troops.ts`: per-level HP, DPS, training cost, and research cost/time (plus heroes)
- `spells.ts`, `balance.ts`: spell stats and global knobs (raid time, loot %, chapel rewards, event odds)

### Announcing an update

Add an entry at the top of `src/config/changelog.ts` with the next `v` number. Players see the **What's New** popup once, the first time they load a build with a newer entry than their browser has shown, and can reread the list from **⚙ Settings**. Brand-new players don't get the popup.

### Adding jokes

All flavor text lives in `src/config/humor.ts` (loading tips, rival names, league names, win/lose lines, chapel messages, Campus Safety tickets, achievements). Building and troop descriptions are in their config files. Add your own inside jokes there.
