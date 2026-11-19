# Plan: rebuild PRs #18 and #21 on current `main`

PRs #18 and #21 were written against a `main` from Nov 16–17. Since then `main` has
gained about 45 commits: the DMC cap went to 8, and new troops, defenses, traps and spells
were added (the Casserole Catapult, The Rock, the Senior, the Thesis Defender, the Fire
Alarm, the Dean's Office, the Parking Gate Arm and Syllabus Week), plus a lot of art. Both
PRs now conflict, and #18 conflicts in 10 files. Rather than merging `main` into them, we
rebuild what they intended on top of today's `main` and close the old PRs.

The old branches stay on GitHub as reference until the replacements merge:

- #21: `origin/claude/kind-knuth-m9n57s` (merge-base `ecd2094`)
- #18: `origin/claude/fervent-goodall-7c5vjp` (merge-base `053847d`)

To read a feature from an old branch:
`git diff <merge-base> origin/<branch> -- <path>` or `git show origin/<branch>:<path>`.

## The new PRs

| New PR | Replaces | Size | Depends on |
| --- | --- | --- | --- |
| **A. Smarter wall pathing** | all of #21 | small | nothing (doesn't touch #43's files) |
| **B. Daily Challenge, matchmaking, rival layouts** | the features in #18 | large | merge #43 (mobile) first: both touch `ui.ts` and `raidScene.ts` |
| *(later, optional)* C. Split the sim and UI into modules | the refactor in #18 | large | A and B merged |

**#18's refactor is not being ported.** It split `sim.ts` into `src/raid/sim/` and
`ui.ts` into `src/ui/modals/`. Since then, `main` has added about 370 lines to `sim.ts` and
about 880 to `ui.ts`, and #43 edits `ui.ts` and `raidScene.ts` again. Porting the split would
mean rewriting all of that code by hand, inside a feature PR, with no committed proof that
the sim still runs tick for tick the same. B builds the features into the current file layout
instead. If we still want the split, it gets its own PR (C, below).

---

## PR A: Smarter wall pathing (from #21)

**What #21 intended:** troops stopped to bash a wall when a gap was a few tiles away,
because a wall tile cost a flat 9 tiles of walking (`WALL_COST`), however much HP it had.
Troops also never reconsidered once they had started hitting a wall.

### Port these changes
1. **`src/raid/pathfind.ts`**
   - `findPath` takes an optional `wallCost?: (i) => number` before `maxIter`, and uses it for
     tiles whose cost is `WALL_COST`.
   - A stale heap entry (`closed[cur]`) no longer counts against `maxIter`.
2. **`src/raid/sim.ts`**
   - Add `wallCheckAt` to `RU`, initialized to 0 in the spawn code.
   - Add the constants `WALL_HELP_RADIUS = 3`, `WALL_HELPERS_MAX = 8`, `WALL_COST_MAX = 60`,
     `WALL_RECHECK = 1` and `WALL_STAY = 0.75`. #21 put them between the
     `/** What a Business Major goes for first. */` comment and `RESOURCE_TYPES`, which
     separated that comment from the thing it describes. Put them somewhere else.
   - Add `wallCostFor(u, current)`. It prices a wall as how far the troop could walk in the time
     it takes to break that wall. It counts the wall's current HP, the troop's damage with
     spells and the Engineer `wallMul`, ground helpers within 3 tiles, and the damage of troops
     already hitting that wall. Above 60 tiles the cost grows slowly. The troop's current wall
     is multiplied by 0.75.
   - `computePath` remembers `prevWall` and passes `wallCostFor` to non-jumping troops.
     Setting `u.wall` also sets `wallCheckAt`.
   - In the troop update, before the in-range check: a troop on a wall sets `needsPath` about
     once a second, and re-plans if it has `needsPath`, a wall and path budget left.
   - When a building dies: if it was a wall, troops currently bashing some other wall re-plan
     (`if (!b.isWall || u.wall) u.needsPath = true`). Today only non-wall deaths trigger this.
     On `main` this line is now around `sim.ts:1162`.
3. **`test/pathing.test.ts`**: bring over #21's 7 tests as they are (nearby gap, far gap,
   switching to a new breach, focusing on one piece, weak over strong, switching to a wall that
   becomes weak, no flip-flopping), and re-tune their numbers if `main`'s balance changes have
   moved them.
4. **What's New:** a new entry (v41, the next free number) with #21's four bullets, including
   the note that older replays may play differently.

### New on `main` since #21: decide how each should interact
- **Parking Gate Arm** (`gate`, a wall-category tile): while it is still armed
  (`charge < 1`), walking into it means getting swung at. Either add a fixed cost while it is
  armed, or treat it like any other wall. Write a test for whichever you choose.
- **Bible Prof** heals nearby walls. `wallCostFor` already uses current HP, so this needs no
  change, but confirm the recheck copes with a wall whose HP goes back up.
- **The Rock and Pebbles, the Senior, the Thesis Defender:** check that their speed and
  damage multipliers flow through `mulDmg` and `mulSpeed`, and add any per-type damage
  multiplier against walls the way the Engineer's is added.
- **Fire Alarm** (moves raiders) and **gate knockback** set `needsPath`. Make sure the new
  recheck doesn't overspend the path budget after one of these.
- **Determinism:** use only sim state and `this.rng`, never `Math.random`, and iterate in a
  fixed order. The `Map` in `wallCostFor` is only read by key, so that's fine.

### Check before opening
- `npm test` (including raid determinism) and `npm run build`.
- Re-run #21's before/after comparison: 24 generated bases with the same mixed army. Add
  bases at DMC 7–8 this time. For reference, #21 measured destruction 32.1% → 31.2%, walls
  damaged 62 → 18, raid length 98 s → 81 s and sim time +20%. Put the table in the PR, and
  don't commit the throwaway script.
- Watch at least one live raid in the browser (#21 never did).

---

## PR B: Daily Challenge, trophy matchmaking, six rival layouts (from #18)

Wait for #43 to merge, then branch from `main`. One commit per part, so each part can be
reviewed on its own. Port the logic from #18's files and change the call sites in today's
`sim.ts`, `ui.ts` and `raidScene.ts` by hand.

### B1. Achievements as a rules table, typed stats
- New `src/game/achievements.ts` (from #18): `stat`, `bump`, `ACHIEVEMENT_RULES` and
  `checkAchievements`. Remove `bump` and `unlock` from `economy.ts`. Game code only calls
  `bump(state, key)`.
- Add `StatKey` and `EventType` to `src/config/types.ts`. Make `GameState.stats` and
  `GameState.achievements` typed partial records. `AchievementId` comes from `humor.ts`.
- Replace the existing `unlock(...)` call sites in `economy.ts` and `outcome.ts` with the
  matching `bump`. Search the code for other `unlock(` uses that `main` has added since.
- Add three achievements: Extra Credit (`dailyfirst`), Perfect Attendance (`dailyfive`) and
  Declared a Major (`climber`, 700 trophies).
- Typed event bus (`src/core/bus.ts`): port it if it fits cleanly; it's optional.
- Tests: `test/achievements.test.ts`.

### B2. Save validation, import and backup
- Port `src/game/save.ts` from #18:
  - field-by-field `sanitize`;
  - keep a backup of the last good save under `cedarville-clash-save-backup`;
  - set aside an unreadable save instead of overwriting it, and restore the backup with a popup
    (`recovered: 'backup' | 'lost'`);
  - an **Import** button in Settings.
- Update it for what `main` has added since: `BuildingInst.mode` (the Stinger beam mode), the
  troop levels `rock`, `senior` and `thesis`, and anything else in today's `GameState`. Compare
  it field by field with `newGame()`.
- `SAVE_VERSION` 4 → 5, adding `daily`. Server-side validation goes through the same
  `sanitize`.
- Tests: `test/save.test.ts`.

### B3. Six rival layouts and trophy matchmaking
- `src/raid/basegen.ts`: `generateBase({ dmc, seed, strength, archetype })`, and the
  archetypes Gated Community (`fortress`), Departmental Silos (`compartments`), Commuter Sprawl
  (`sprawl`), Lakefront Property (`lakeside`), Back-Corner Campus (`corner`) and Endowment Vault
  (`donut`). Names and descriptions go in `LAYOUT_INFO` in `humor.ts`.
  - **Rebuild this on `main`'s basegen, not #18's.** `main` now places the Catapult and the
    Dean's Office (they prefer the middle), Parking Gate Arms in the inner wall ring, Fire
    Alarms, Stinger beam modes and the 9-entry `BASE_LOOT` for DMC 1–8. Every archetype has
    to do all of this.
  - Bases include the Stinger Statue and the Business and Music buildings, which #18 added to
    `CAMPUS`.
- `src/raid/matchmaking.ts`: port it as it is (`TROPHIES_PER_DMC = 350`, `findRival` and
  `baseForMatchup`). Rivals stay within one DMC level of the player. It already uses `MAX_DMC`,
  which is now 8. Add `DIFFICULTY_LABELS` to `humor.ts`.
- `GameState.lastRival`, so the same layout doesn't come up twice in a row.
- `outcome.ts` `localSetup`: `random` uses `findRival`, and `elephant` uses
  `generateBase({ dmc, seed, strength: 0.4 })`.
- Server: real players near your trophy count are still matched first. The computer fallback
  uses `findRival` with `cryptoRand`.
- Raid HUD: show the layout name, the difficulty label and the trophies at stake.
- Tests: `test/basegen.test.ts` (base legality for every archetype at **every DMC 1–8**),
  `test/matchmaking.test.ts`, and a server test for matched rivals.

### B4. Daily Challenge
- `src/game/daily.ts`: port it. It covers UTC `dayKey`, the FNV seed, the six objectives
  (`stars2`, `wreck`, `dmcrush`, `disarm`, `survivors` and `heist`), lent armies, the
  once-a-day reward and `recordDaily`.
  - **Extend it for DMC 7–8.** `DAILY_ARMY_HOUSING` has entries only up to DMC 6, and the army
    recipes stop at DMC 4. Add housing for DMC 7–8, and recipes that use The Rock, the Senior
    and the Thesis Defender. Spells can include Syllabus Week where it's unlocked.
  - Balance: put `DAILY_REWARD_BASE` (10), `DAILY_REWARD_PER_DMC` (2), `DAILY_ARMY_HOUSING`
    and `DAILY_BASE_STRENGTH` (0.2) in `balance.ts`, and `DAILY_TITLES` in `humor.ts`.
- `GameState.daily: { day, done, attempts, bestStars }`.
- Engine: add `RaidKind` `'daily'` and `RaidSetup.daily: { day, dmc }`, and give `RaidResult`
  a `metrics: DailyMetrics` built by `RaidEngine.metrics()`.
- **Sim additions** in today's `sim.ts`: `dmcDeadAt` (seconds after the first deployment, or
  -1), `deployed` (troops and heroes sent in), and `defensesLeft()`. `aliveAttackers()` and
  `lootAvail` already exist. These are new counters: they must not change any existing raid
  outcome, so the determinism tests must pass unchanged.
- `outcome.ts`: `dailySetup(s, day)` and `challengeOf(setup)`. `applyRaidOutcome`
  short-circuits for daily raids: no loot, no trophies, no troops spent. It only calls
  `recordDaily`.
- Server: `kind: 'daily'` in `/api/raid/start` builds the setup with `dailySetup(s, dayKey(now))`
  and judges the replay like any other raid. Add `'daily'` to `RaidStartRequest.kind` in
  `src/net/protocol.ts`.
- UI:
  - an entry point in the Attack menu and the Chapel menu;
  - a live objective readout in the raid HUD;
  - a **Try again** button next to **Watch replay** on the results screen.
- Raid Log: daily raids appear as 0-trophy attacks, so they can be watched. That's fine to keep.
- Tests: `test/daily.test.ts` through the engine, and a server end-to-end test (the replay is
  verified, the reward is paid once per day and the army is untouched).
- Check difficulty with #18's bot approach. #18 found DMC 5–6 too hard: the bot cleared 4–5
  of 10 days. Tune `DAILY_ARMY_HOUSING` and `DAILY_BASE_STRENGTH`, and sample DMC 7–8 too.

### B5. Wrap-up
- One What's New entry covering B1–B4. `README.md` updates come from #18's README diff.
- `npm test`, `npm run build`, and `npm run test:mobile` (it exists once #43 is merged). If
  the new HUD or results buttons trip the layout checks, fix them. Don't add them to
  `known-issues.ts`.
- Play it in headless Chromium:
  - **Offline:** a daily raid, a retry, its replay, matched rivals, and recovery from a
    deliberately corrupted save.
  - **Online:** a local server with a fresh account and a daily attempt.

---

## C (optional, later). Split the sim and UI into modules

Do this only after A and B are merged, and only as a pure refactor with no behavior changes:

- `src/raid/sim/` with `sim`, `units`, `defenses`, `spatial` and `types`. Add the per-tile
  spatial grid (units returned in spawn order) and shared path searches for troops with the
  same start tile and target. This also wins back the ~20% sim time PR A adds.
- **Commit a tick-for-tick comparison test** against a frozen copy of the old sim, run over
  many raids at DMC 1–8. #18 ran this check but didn't commit it.
- Split the `ui.ts` modals into `src/ui/modals/*`, and split `raidScene.ts` into `raidHud`,
  `raidDraw`, `raidEffects` and `raidResults`. **This changes the UI zone:** update the zone
  table in `AGENTS.md` and `.github/CODEOWNERS` so the collaborator's paths stay correct, and
  check with the collaborator first, because it moves the files they work in.

## Closing the old PRs
- #18 and #21 are closed without merging, with a comment pointing here.
- Keep their branches until the PR that replaces each one has merged, then delete them.
