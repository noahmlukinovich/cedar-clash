# Cedarville Clash: notes for Claude

Browser base-builder parody game (TypeScript + Vite, canvas rendering) with an
optional Node game server in `server/`. **Read `AGENTS.md` first**: it has the
full rules, the UI/core zones and notes on how the UI code works. See also
`README.md` and `CONTRIBUTING.md`.

## Commands

- `npm run dev`: game at http://localhost:5173 in offline mode
- `npm test`: vitest (raid determinism, economy, server end-to-end)
- `npm run build`: type-check plus build of the client and server

Run `npm test` and `npm run build` before every commit you push.

## Rules

- Never push to `main`. It deploys straight to the live site and game server.
  Work on a branch and open a pull request.
- Know which zone you're working in (full list in `CONTRIBUTING.md`):
  - **UI zone**: `src/ui/`, `src/render/`, `src/style.css`,
    `src/config/humor.ts`, `src/config/changelog.ts`, `index.html`.
  - **Core zone**: everything else, including `src/game/`, `src/raid/`,
    `src/net/`, `src/core/`, balance and data in `src/config/`, `server/`,
    `test/`, `.github/`, `deploy/` and `package.json`.
- **When the person you're working with is the UI collaborator (not
  noahmlukinovich), stay in the UI zone.** If a request needs a core-zone
  change, don't make it. Explain what would be needed and offer to draft a
  GitHub issue labeled `needs-core` instead. Calling existing core functions
  from UI code is fine.
- Keep raid simulation deterministic: replays and the server's checks depend on it.
- All art is drawn procedurally in code. Don't add third-party game assets,
  logos or fonts.
