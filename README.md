# Cedarville Clash 🐝

An affectionate, joke-heavy parody of Cedarville University in the style of the mobile base-builder / raid genre. Build up campus, train students and profs, and raid (entirely fictional) rival schools.

> Unofficial fan parody. Not affiliated with or endorsed by Cedarville University or any game studio. All art is drawn procedurally in code; no third-party game assets, logos, or fonts are used.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + tests + production build into dist/
```

Desktop browser with mouse and keyboard; designed for 1280×800 and up.

**Play online:** https://noahmlukinovich.github.io/cedar-clash/ (deployed by `.github/workflows/deploy.yml` on every push to the default branch or `main`; Pages must be set to *Source: GitHub Actions* in the repo settings).

## How to play

1. **Collect** Tuition (Admissions Office) and Coffee (Coffee Cart) by clicking the bubbles over them, or use the green "collect all" button.
2. **Build and upgrade** from the **Shop**. Each job ties up a Facilities Crew builder; build more sheds for more builders. The **DMC** level caps everything else.
3. **Train** troops in the **Army** menu. Residence halls set your army capacity.
4. **Attack!** Start with the hand-built tutorial base, *Rival State U*, then use **Find a Rival** for procedurally generated campuses matched to your trophies. You earn stars, loot, and trophies.
5. Play the **Daily Challenge** (Attack or Chapel menu) for Chapel Credits: a fixed campus, a lent army, and one objective per day.
6. Unlock the **Library** (research), **The Hive**, the **Brew Lab** (spells), and the heroes **The Prof** and **The President** as the DMC levels up.

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
- **Matchmaking**: your trophies imply a DMC level the ladder expects (one level per 350 trophies). Trophies ahead of your campus get you bigger, better-built rivals that pay more trophies and loot; trophies behind get you softer ones. The raid HUD shows the rival's layout, a difficulty label, and the trophies at stake (`src/raid/matchmaking.ts`).
- **Rival layouts**: six generated campus shapes (`src/raid/basegen.ts`): Gated Community (one ring), Departmental Silos (walled cells), Commuter Sprawl (defenses penned individually), Lakefront Property (lakes guard one flank), Back-Corner Campus (DMC tucked in a corner), and Endowment Vault (DMC outside as bait, loot inside).
- **Daily Challenge**: one seeded raid per calendar day, identical for everyone at the same DMC level. The army is lent, there is no loot or trophy change, and retries are free. Meeting the day's objective (2 stars, 70% destruction, DMC inside 75s, all defenses down, a third of the army surviving, or 60% of the loot) pays Chapel Credits once (`src/game/daily.ts`).
- **Defenses**: RA Tower (rapid write-ups), Campus Safety Cart (parking tickets), Cedar Sprayer (40% slow, charged 2s freeze), Bible Prof Tower (prayer splash that targets the densest clump and blesses walls at Lv3+), Yellow Jacket Nest (hidden swarm trap), The Hive (student-section fans), brick walls, and Cedar Lake (blocks pathing).
- **Troops**: Freshman (gets lost), Engineering Major (10x wall damage), Nursing Student (healer), Theology Major (buff aura), Athlete (targets defenses). **Heroes**: The Prof (*Pop Quiz* stun) and The President (*Convocation* rally).
- **Spells**: All-Nighter (rage), Snow Day (freeze defenses), Chapel Announcement (ignore traps).
- **Events**: Ring by Spring (pair-up buff, ring on the HUD, always on in real-world spring), Ohio wind (mid-raid push), Finals Week, campus construction fencing, Elephant Run (a limited-time freshmen conga-line raid mode), Campus Safety ticketing idle troops, "waiting in line at Chuck's…" training delays, and daily Chapel attendance (with a stern popup if you skip).
- **Achievements** such as *Dean's List*, *Academic Probation*, and *Walked Across the Lake Bridge*.
- **Saves**: `localStorage` with a versioned schema and step-by-step migrations (`src/game/save.ts`), offline progress, autosave, and export/import/reset. Every field is validated on load. Each session keeps a backup of the save it loaded; an unreadable save is set aside (never overwritten) and the backup is restored.
- **Updates**: each build gets an id, which is baked into the bundle and published as `version.json`. Open tabs check it every 3 minutes and on refocus, and show a "new version — reload" bar. A tab running an older build than the one that last saved stops autosaving and asks the player to reload, so it can never overwrite newer progress.

## Project layout

```
src/
  config/     # ALL balancing data: buildings, troops, spells, balance knobs, humor text
  core/       # iso math, camera, seeded RNG, particles, Web Audio synth, typed event bus
  game/       # state, save/validation, economy, army, events & chapel, achievements, daily challenge
  render/     # procedural drawing primitives, building + unit sprites, world/ground
  village/    # village scene: placement, moving, selection, collection
  raid/       # base generator, matchmaking, A* pathfinding, and the raid scene:
              #   raidScene (input/update), raidHud, raidDraw, raidEffects, raidResults
    sim/      # the raid simulation: sim (core loop), units, defenses, spatial grid, types
  ui/         # HUD + modal shell (ui.ts), DOM helpers, icons, thumbnails
    modals/   # one module per menu: shop, army, attack, chapel, progress, settings
tests/        # Vitest: sim, pathfinding, base generator, matchmaking, saves, economy, daily
```

### The raid simulation

`src/raid/sim` has no DOM, canvas or clock access. Every random roll comes from a seeded RNG and time advances in fixed 1/60s steps, so the same seed and the same inputs replay the same raid at any frame rate. That is what lets the tests (and the Daily Challenge) run whole raids headlessly. A per-tile spatial grid backs the "who is near this point" queries, and troops that share a start tile and target share one path search.

### Achievements

Text and rewards are in `src/config/humor.ts`; each unlock rule is one row in `src/game/achievements.ts`. Game code only records what happened with `bump(state, 'statName')`.

### Balancing

Everything numeric lives in typed tables under `src/config/`:

- `buildings.ts`: per-level cost, time, HP, production, capacity, defense stats, and per-DMC count limits
- `troops.ts`: per-level HP, DPS, training cost, and research cost/time (plus heroes)
- `spells.ts`, `balance.ts`: spell stats and global knobs (raid time, loot %, chapel rewards, event odds)

### Adding jokes

All flavor text lives in `src/config/humor.ts` (loading tips, rival names, league names, win/lose lines, chapel messages, Campus Safety tickets, achievements). Building and troop descriptions are in their config files. Add your own inside jokes there.
