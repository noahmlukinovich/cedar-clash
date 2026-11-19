# Cedarville Clash: notes for Claude

Browser base-builder parody game (TypeScript + Vite, canvas rendering) with an
optional Node game server in `server/`. `AGENTS.md` has the zones, the
"who you're working for" check and notes on how the UI code works. See also
`README.md` and `CONTRIBUTING.md`.

## Commands

- `npm run dev`: game at http://localhost:5173 in offline mode
- `npm test`: vitest (raid determinism, economy, server end-to-end)
- `npm run build`: type-check plus build of the client and server

Run `npm test` and `npm run build` before every commit you push.

## Rules

- Never push to `main`. It deploys straight to the live site and game server.
  Work on a branch and open a pull request.
- Find out who you're working for by checking the signed-in GitHub account
  (`get_me`). If it's `noahmlukinovich` (Noah, the owner), there are no zone
  limits and no zone warnings. For anyone else, follow "Zones" in `AGENTS.md`:
  do UI work freely. If something touches core, mention once that the PR will
  need Noah's review, then do it anyway.
- Keep raid simulation deterministic: replays and the server's checks depend on it.
- Bump `SIM_VERSION` in `src/raid/engine.ts` whenever raids would play out differently
  (sim code, stats, balance), and update the fingerprint in `test/simVersion.test.ts`.
- All art is drawn procedurally in code. Don't add third-party game assets,
  logos or fonts.
