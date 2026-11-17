# AGENTS.md: working on Cedarville Clash

Instructions for any AI coding agent (Claude Code, Codex, Cursor, Copilot and
others) working in this repo. Read all of it before you change anything.

## The project

Cedarville Clash is an affectionate, joke-heavy parody base-builder/raid game
that runs in the browser. It's TypeScript + Vite with canvas rendering and an
optional Node game server for online play. Two people work on it:

- **noahmlukinovich** (repo owner): everything, especially core game code.
- **The UI collaborator**: menus, HUD, styling, art and jokes.

**If you are working for the UI collaborator, you work only in the UI zone
below.** That's a team rule, and GitHub enforces it: `.github/CODEOWNERS`
means any PR that touches a file outside the UI zone can't merge without
Noah's approval.

## Zones

### UI zone (change freely)

| Path | What's in it |
| --- | --- |
| `src/ui/ui.ts` | Every menu, panel, HUD element and modal |
| `src/ui/icons.ts` | Inline SVG icons (`icon(name, size)`, `ICONS`) |
| `src/ui/thumbs.ts` | Small building, unit and spell pictures used in menus |
| `src/style.css` | All styling |
| `src/render/buildingSprites.ts` | How each building is drawn |
| `src/render/unitSprites.ts` | How troops, heroes and builders are drawn |
| `src/render/draw.ts` | Color palette `C`, outline color `OUT`, drawing primitives |
| `src/render/world.ts` | Ground, grid, decorations, name plates |
| `src/config/humor.ts` | Jokes, loading tips, achievements, league names, chapel lines |
| `src/config/changelog.ts` | Player-facing "What's new" entries |
| `index.html` | Page shell |

### Core zone (do not edit when working for the UI collaborator)

Everything else, including:

- `src/game/` (state, economy, upgrades, army, saves, actions),
  `src/raid/` (raid simulation, pathfinding, raid screen),
  `src/village/` (village, editor and visit scenes), `src/net/`, `src/core/`, `src/main.ts`
- `src/config/buildings.ts`, `troops.ts`, `spells.ts`, `balance.ts`, `types.ts`
  (stats, costs, timers: game balance)
- `server/`, `deploy/`, `test/`, `.github/`, `package.json`, `package-lock.json`,
  `tsconfig.json`, `vite.config.ts`
- The docs that hold the rules: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`

**Reading** core code is fine and often necessary. **Calling** existing core
functions and exports from UI code is fine too. **Changing** core files is
not.

### When a request needs core changes

Don't make the change, and don't work around it by duplicating game logic in
UI code. Instead:

1. Tell the person which core change is needed and why.
2. Offer to draft a GitHub issue labeled `needs-core`, with:
   - **What the UI needs** (for example: "the Army screen needs each troop's
     win rate").
   - **Suggested core change** (which file or function, and what it should
     expose).
   - **The UI work it unblocks.**
3. Build any part of the UI that doesn't depend on it, if that makes sense.

Examples that need core: new stats or numbers the game doesn't track yet,
changing costs, timers, damage or other balance, new player actions, anything
about saves, the server, login or online play, new npm packages, raid screen
markup or behavior (`src/raid/raidScene.ts`).

## Hard rules

1. **Never push to `main`.** Merging to `main` deploys to the live game
   server within about 5 minutes. Always use a branch and a pull request.
2. **Run `npm test` and `npm run build` before every push.** CI runs both as
   the `tests` check, and a PR can't merge until it passes.
3. **Escape player text.** Campus and player names come from other people. Wrap
   any of them in `esc()` before putting them into `innerHTML` or a template
   string.
4. **No third-party assets.** All art is drawn procedurally in code. Don't add
   images, sprite sheets, logos, icon packs or web fonts.
5. **No new dependencies.** `package.json` is core. If you think a library is
   needed, raise it as a `needs-core` issue.
6. **Keep the tone affectionate.** It's a good-natured parody. Rival schools
   are fictional. Jokes shouldn't target real individuals or be mean-spirited.

## Workflow

```bash
npm install
npm run dev            # http://localhost:5173, offline mode (no server needed)
npm test
npm run build          # type-check plus full build
```

1. Branch from the latest `main`, named something like `ui/<short-topic>`.
2. Make the change and check it in the running game with `npm run dev`. Offline
   mode covers almost every screen. Design target: desktop, mouse and
   keyboard, 1280×800 and larger.
3. Run `npm test` and `npm run build`.
4. Commit, push the branch and open a PR into `main`. Say what changed and
   which screens it affects; screenshots help.
5. Once `tests` passes, a UI-only PR can be merged by the collaborator.
   Anything that touches core waits for Noah.

Keep PRs small and focused. Pull `main` often: `ui.ts` and `style.css` are big
shared files, and small PRs avoid painful conflicts.

## How the UI code works

### `src/ui/ui.ts`

One `UI` class builds and updates all the HTML on top of the canvas. It's
split into sections marked `// ---------- Name ----------` (Village HUD,
Selection panel, Modals, Shop, Army, Upgrades list, Settings / debug, and so
on). Put new code in the matching section.

Helpers to use instead of reinventing:

- `el(tag, className, html)` creates an element.
- `esc(text)` escapes text for HTML. Required for player-provided names.
- `fmt(n)` formats numbers (`12.5K`, `1.2M`).
- `costHtml(resource, amount, ok)` renders a price chip.
- `icon(name, size)` (from `icons.ts`) returns an inline SVG icon.
- `this.modal(title, { narrow, tabs, activeTab, onTab, headIcon })` opens a
  modal and returns `{ body, close, setTitle }`. Only one modal is open at a
  time.
- `this.toast(text, kind)` shows a pop-up message; `kind` is `'info'`,
  `'good'`, `'bad'` or `'event'`. Use `this.banner(text, color)` for big
  centered text.
- `sfx('click')`, `sfx('error')` and similar (from `core/audio`) play sound
  effects. Buttons usually play `click`.
- `textOn(hex)` picks dark or white text for a colored background.

**Changing game state:** UI code never edits `this.state` directly. It calls
`this.game.act({ k: '<action>', ... })`, which returns `{ err }`. Check `err`,
show it with `this.toast(err, 'bad')` and `sfx('error')`, and otherwise
refresh the view. If the action you need doesn't exist, that's a `needs-core`
issue.

**Reacting to the game:** the game emits events on `bus` (from `core/bus`):
`'changed'`, `'selection'`, `'mode'`, `'buildingDone'`, `'toast'`. Listen with
`bus.on(...)` in the UI. Don't add new event emits in core.

### `src/style.css`

Sections are marked `/* ---------- Name ---------- */` and mostly match the
`ui.ts` sections. Conventions:

- `.stroke` gives text the game's dark outline. Don't use it on text sitting on
  a solid panel or chip; it smears there.
- Buttons are `.btn` plus an optional color class (`.blue`, `.gold`, `.gray`,
  `.purple`, `.red`) and size class (`.big`, `.small`, `.round`, `.square`).
  See the Buttons section.
- The game's dark ink color is `#1e1b2b`, the same as `OUT` in `draw.ts`.

### `src/render/`

- `draw.ts` holds the shared palette (`C.brick`, `C.gold`, `C.navy` and so on)
  and the isometric drawing primitives (`box`, `poly`, `gable`, `dome`,
  `windowsL`/`windowsR`, `door`, `flag`, `sign`...). Reuse palette colors so
  new art matches.
- Building sprites are drawn once per `(type, level, variant)` and cached in
  offscreen canvases (`getBuildingSprite`). A change shows up after a page
  reload.
- Rendering is completely separate from the raid simulation and the server, so
  art changes can't break raid determinism or replays.

### Content files

- `src/config/humor.ts`: add or edit jokes, tips, achievement text and league
  names. Keep the same data shapes, because core code reads them.
- `src/config/changelog.ts`: for a change players will notice, add an entry
  at the **top** with the next `v` number, today's date, a short title and
  plain-language items. Players see it once in the What's New pop-up.

## Gotchas

- Wrap `localStorage` access in `try/catch`. It throws in private mode (see
  `seenChange()` in `ui.ts`).
- `UI.update()` runs every frame. To skip work when nothing changed, it
  compares "signatures" (fields like `chipSig` and `lastSelSig`).
  If your new panel content doesn't update, check whether the signature
  includes what you changed.
- The raid HUD and results screen are built in `src/raid/raidScene.ts` (core).
  You can restyle them in `style.css` (Raid HUD and Results sections), but
  changing their markup or behavior needs a `needs-core` issue.
