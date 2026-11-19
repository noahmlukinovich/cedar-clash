# AGENTS.md: working on Cedarville Clash

Instructions for any AI coding agent (Claude Code, Codex, Cursor, Copilot and
others) working in this repo.

## The project

Cedarville Clash is an affectionate, joke-heavy parody base-builder/raid game
that runs in the browser. It's TypeScript + Vite with canvas rendering and an
optional Node game server for online play. Two people work on it:

- **Noah** (GitHub `noahmlukinovich`, repo owner): everything.
- **The UI collaborator**: mostly menus, HUD, styling, art and jokes.

## Who you're working for

Work this out yourself at the start. Only ask if you can't tell.

1. Check which GitHub account the session is signed in as (the GitHub MCP
   `get_me` tool, or `gh api user --jq .login`). If you can't, use
   `git config user.email` and whatever other context you have.
2. **`noahmlukinovich` / Noah:** there are no zone limits. Change anything,
   core included, and don't mention zones at all.
3. **Anyone else:** follow "Zones" below.
4. **Can't tell:** treat the person as the collaborator, but don't open with
   a warning. It only comes up if a change touches core.

## Zones

GitHub enforces the zones, so you don't have to: `.github/CODEOWNERS` makes
any PR that touches a core file wait for Noah's review before it can merge.
Nothing reaches `main` by accident, so don't police the rules in conversation.

For the collaborator:

- **UI-zone work:** just do it. Skip the caveats and rule reminders.
- **Work that needs core changes:** say it in one line ("this touches
  `src/game/economy.ts`, so the PR will need Noah's review") and then do the
  work anyway. When you can, put the core part in its own small PR so the UI
  part can merge without waiting. Don't refuse, don't repeat the warning, and
  don't copy game logic into UI code to get around the review.
- If the person doesn't want to wait for a review, offer to write up a GitHub
  issue labeled `needs-core` instead.

### UI zone (merges without review once tests pass)

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

### Core zone (needs Noah's review to merge)

Everything else, including:

- `src/game/` (state, economy, upgrades, army, saves, actions),
  `src/raid/` (raid simulation, pathfinding, raid screen),
  `src/village/` (village, editor and visit scenes), `src/net/`, `src/core/`, `src/main.ts`
- `src/config/buildings.ts`, `troops.ts`, `spells.ts`, `balance.ts`, `types.ts`
  (stats, costs, timers: game balance)
- `server/`, `deploy/`, `test/`, `.github/`, `package.json`, `package-lock.json`,
  `tsconfig.json`, `vite.config.ts`
- The docs that hold the rules: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`

Typical core changes: new stats or numbers the game doesn't track yet, costs,
timers, damage or other balance, new player actions, saves, the server, login
or online play, new npm packages, and raid screen markup or behavior
(`src/raid/raidScene.ts`).

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
5. **Avoid new dependencies.** Use what's already there when you can. Adding a
   package changes `package.json`, so it needs Noah's review.
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
   mode covers almost every screen. Design targets: desktop (mouse and
   keyboard, 1280×800 and larger) and phones and tablets in landscape
   (touch). Phones in portrait get a "turn your phone" prompt instead.
3. Run `npm test` and `npm run build`. For layout changes, also run
   `npm run test:mobile` (see "Mobile layout tests" below).
4. Commit, push the branch and open a PR into `main`. Say what changed and
   which screens it affects; screenshots help.
5. Once `tests` passes, the collaborator can merge a UI-only PR. Anything that
   touches core waits for Noah's review. Noah can merge his own PRs.

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
refresh the view. If the action you need doesn't exist, add it in core (see
"Zones").

**Reacting to the game:** the game emits events on `bus` (from `core/bus`):
`'changed'`, `'selection'`, `'mode'`, `'buildingDone'`, `'toast'`. Listen with
`bus.on(...)` in the UI. A new event emit is a core change.

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

## Mobile layout tests

`npm run test:mobile` runs Playwright (`e2e/`). It opens the main screens on
landscape iPhone SE, iPhone 13, Pixel 7 and iPad, and checks for controls that
are off-screen, covered by something else, smaller than 44px, HUD widgets that
overlap, and dialog buttons that need scrolling to see. Screenshots are
attached to each test (`npx playwright show-report`).

`e2e/known-issues.ts` lists the problems that exist today. The tests expect
exactly that list: a new problem fails, and a fixed one fails until you delete
its line. That keeps the list honest as the mobile work lands.

## Gotchas

- Canvas input has two paths. Mouse uses the handlers in `src/main.ts`
  (`bindInput`); touch and pen go through `src/core/input.ts`, which passes
  one finger to the scene as a left-button mouse and handles two-finger pinch
  and pan on the camera itself. Every scene implements `onPointerCancel()`,
  which drops a press without acting on it, and may implement
  `onLongPress()`. Hover doesn't exist on touch.
- `touchMode` (from `core/input`) says whether the last press was a finger.
  Use it for touch-only UI (the floating ✔ / ✖ when placing, the raid deploy
  ring, touch wording) and leave mouse behaviour as it is. `sfx()` also
  vibrates on phones for some sounds (`core/haptics.ts`).
- Raids carry on without the player. Back from the background, `RaidScene.catchUp()`
  runs the missed ticks; offline, a raid left open when the page closes is
  saved (`savePendingRaid`) and settled on next launch; online, inputs are
  pushed when the page hides and the server settles abandoned raids.
- Graphics quality (`core/quality.ts`, Settings → Graphics) is per device:
  Auto lowers `game.dpr` when frames stay slow, Battery saver is 1x at 30 fps.
  Rendering only; never touch the raid clock for it.

- Wrap `localStorage` access in `try/catch`. It throws in private mode (see
  `seenChange()` in `ui.ts`).
- `UI.update()` runs every frame. To skip work when nothing changed, it
  compares "signatures" (fields like `chipSig` and `lastSelSig`).
  If your new panel content doesn't update, check whether the signature
  includes what you changed.
- The raid HUD and results screen are built in `src/raid/raidScene.ts` (core).
  You can restyle them in `style.css` (Raid HUD and Results sections), but
  changing their markup or behavior is a core change.
