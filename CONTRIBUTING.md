# Contributing to Cedarville Clash

Using an AI coding agent? Point it at `AGENTS.md`, which has the rules and
code notes written for agents.

## Setup

Requires Node 22.13 or newer.

```bash
npm install
npm run dev     # http://localhost:5173, offline mode: no server needed
npm test        # run before opening a PR
npm run build   # type-check and build; CI runs this too
```

Offline mode covers almost all UI work. You only need `npm run dev:server` for
login, visiting other campuses or online raids (see the README).

## How changes reach `main`

`main` is live: every merge redeploys the game server within about 5
minutes. So nobody pushes to `main` directly.

1. Make a branch: `git checkout -b ui/shop-tweaks` (or let a Claude session make one).
2. Commit, push, open a pull request.
3. The **tests** check runs on the PR. It must pass.
4. Merge:
   - **UI-only PR** (only files in the UI zone below): you can merge it yourself once tests pass.
   - **Anything else**: Noah has to approve it first. GitHub enforces this via
     `.github/CODEOWNERS`.

Keep PRs small and pull `main` often to dodge merge conflicts.

## The UI zone

Change these freely:

| Path | What's in it |
| --- | --- |
| `src/ui/ui.ts` | All menus, panels, HUD and modals (see the screen map below) |
| `src/ui/icons.ts`, `src/ui/thumbs.ts` | Icons and the little building/unit pictures in menus |
| `src/style.css` | All styling. Sections are marked with `/* ---------- Name ---------- */` |
| `src/render/buildingSprites.ts` | How each building is drawn |
| `src/render/unitSprites.ts` | How troops, heroes and builders are drawn |
| `src/render/draw.ts` | The color palette (`C`) and drawing helpers |
| `src/render/world.ts` | Ground, grid, decorations, name plates |
| `src/config/humor.ts` | Jokes, loading tips, achievements, league names |
| `src/config/changelog.ts` | The "What's new" entries |
| `index.html` | The page shell |

Everything else (game rules, raids, economy, balance numbers, networking, the
server, tests, CI, dependencies) is the **core zone** and needs Noah's review.

You can still change core code. The PR just waits for Noah's review before it
can merge. If a UI idea needs something new from core (a new stat, a new
action, different numbers), either make the change in its own small PR so the
UI work isn't held up, or open a GitHub issue labeled `needs-core`.

## Screen map: where to find things in `src/ui/ui.ts` and `src/style.css`

Both files are split into sections with matching `---------- Name ----------` headers.

| On screen | `ui.ts` section | `style.css` section |
| --- | --- | --- |
| Pop-up messages | Toasts & banners | Toasts |
| Resource bars, buttons around the village | Village HUD | Top bars, Buttons |
| Panel when you click a building | Selection panel | Selection panel |
| Any pop-up window | Modals | Modals |
| Build shop | Shop | Modals |
| Building info | Info | Modals |
| Training troops | Army | Modals |
| Upgrade list | Upgrades list | Upgrades list |
| Library, Heroes, Chapel | Library / Heroes / Chapel | Modals |
| Achievements and leagues | Achievements / leagues | Modals |
| Picking a raid target | Attack | Modals |
| Settings and debug | Settings / debug | Modals |
| Saved base layouts and the editor | Base layouts | Base layouts & editor |
| Visiting another campus | Visiting another campus | Visiting another campus |
| What's new | What's new | What's new |
| Loading screen | Loading | Loading |
| HUD during a raid, results screen | (in `src/raid/raidScene.ts`, core zone) | Raid HUD, Results |

Restyling the raid HUD in `style.css` is fine. Changing its markup or behavior
means touching `raidScene.ts`, which needs review.
