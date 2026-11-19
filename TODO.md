# Multiplayer to-do

What Cedarville Clash still needs to work as a multiplayer game beyond a group of friends.
Roughly in priority order. Tick items off as they land.

Done: raids carry a `SIM_VERSION`. Raids started under older rules are voided with a refund,
and replays from older rules are marked outdated (see `src/raid/engine.ts`).

## Before opening it up more widely

- [ ] **Match by campus level, not just trophies.** `startRaid` in `server/game.ts` picks from the
      5 players with the closest trophy counts, so a DMC 8 campus can be matched against a DMC 1.
  - [ ] Limit candidates to DMC within ±1–2 of the attacker (widen it when nobody fits)
  - [ ] Or scale loot down when attacking a much lower DMC
  - [ ] Show the player when they got a computer-generated base because no real player fit
- [ ] **Fill a small player pool.** With few players, matchmaking often falls back to bot bases.
  - [ ] "Ghost" copies of real campuses (attackable, no loot taken from the owner)
  - [ ] Better bot bases at every DMC
- [ ] **Keep backups somewhere other than the game server.** `deploy/backup.sh` writes to the
      droplet's own disk, so losing the droplet loses the backups too.
  - [ ] Copy each daily backup off the machine (DigitalOcean Spaces or another bucket), or
        turn on droplet backups
  - [ ] Test a restore once

## Before letting strangers in

- [ ] **Account recovery.** Right now a lost password means running `cedar-clash-admin passwd`.
  - [ ] Optional email on the account
  - [ ] "Forgot password" email with a short-lived reset link
- [ ] **Moderation.**
  - [ ] Filter offensive campus names at sign-up and rename
  - [ ] Report and block players
  - [ ] Admin commands to ban, force a rename, and look at a player's recent raids
  - [ ] Detect loot feeding between alt accounts (same IP, one-sided raids)

## Keeping players coming back

- [ ] **Clans ("dorms").** The main thing that keeps people playing this kind of game.
  - [ ] Create, join and leave a dorm, with a member list and roles
  - [ ] Dorm chat (escaped and rate-limited, with reporting)
  - [ ] Troop donations between members
  - [ ] Friendly practice raids on dorm-mates' campuses (nothing lost or gained)
- [ ] **Notifications.** Players only find out they were raided the next time they open the game.
  - [ ] Web Push: "you were raided", "upgrade finished", "shield ending"
  - [ ] Settings to turn each one off
- [ ] **Seasons and leagues.** Trophies never reset, and the leaderboard is the all-time top 50.
  - [ ] Monthly seasons with a partial trophy reset
  - [ ] Use the league names from `src/config/humor.ts` as real leagues, with end-of-season rewards
  - [ ] Leaderboards for the current season, your league, and your dorm
- [ ] **Friends.** Add friends, see their campuses, and challenge them to practice raids.

## Scaling (when `/api/status` says it's needed)

- [ ] Move raid checks (full replays) into worker threads so they don't hold up other requests
- [ ] Spread the periodic sweep (`settleStaleRaids`) across ticks if it gets slow
- [ ] Plan the move off a single droplet: larger droplet first, then think about more servers
