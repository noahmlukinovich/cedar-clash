# Hosting Cedar Clash online

The game runs on its own small DigitalOcean droplet, separate from anything else you host:

- **Caddy** serves the built game over HTTPS and forwards `/api/*` to the game server.
- **The game server** is a systemd service called `cedar-clash`. It runs as the unprivileged user `cedarclash`, listens only on `127.0.0.1:8787`, and has strict systemd sandboxing plus memory and CPU limits.
- **Player data** is one SQLite file, `/var/lib/cedar-clash/cedar-clash.db`. It's backed up daily to `/var/backups/cedar-clash/` and backups are kept for 14 days.
- **Firewall:** only SSH, HTTP and HTTPS are open.
- **SSH:** set up for keys only, but only when a key is installed, so you can't lock yourself out.

## 1. Create the droplet (one time)

In the DigitalOcean control panel, choose **Create → Droplets**:

| Setting | Choice |
|---|---|
| Region | Toronto |
| Image | Ubuntu 24.04 (LTS) x64 |
| Size | Basic → Regular → **$6/mo (1 GB RAM)**. The 512 MB size can run out of memory during the build. |
| Authentication | SSH key: the same `~/.ssh/id_ed25519.pub` you use for the thermostat |
| Advanced options | Tick **Add Initialization scripts** and paste all of [`cloud-init.yaml`](cloud-init.yaml) |
| Backups | Optional (about +$1.20/mo). Worth it once friends are playing. |

Create it, then wait about 5 minutes. To watch the setup:

```bash
ssh root@<droplet-ip> tail -f /var/log/cedar-clash-setup.log
```

When it prints `Done`, open `https://<ip-with-dashes>.sslip.io`. For example, IP `203.0.113.7` becomes `https://203-0-113-7.sslip.io`. The first invite code (good for 5 sign-ups) is in a file on the droplet:

```bash
ssh root@<droplet-ip> cat /root/cedar-clash-first-invite.txt
```

## 2. Invite people

```bash
deploy/invite.sh <droplet-ip> 3 "dorm floor"
```

That prints one code good for 3 sign-ups. Other admin commands, run on the droplet:

```bash
cedar-clash-admin users                    # list players
cedar-clash-admin invites                  # unused codes
cedar-clash-admin invite-uses ABCD-EFGH-JKLM 10   # change how many sign-ups a code has left (0 turns it off)
cedar-clash-admin passwd "Campus Name" newpassword123   # reset a password (logs them out)
cedar-clash-admin delete-user "Campus Name"
```

## 3. Deploy updates

**Automatic.** Every 5 minutes the droplet checks GitHub. When `main` has new commits, it:

1. checks out the new commit and runs the test suite
2. if the tests pass, rebuilds and restarts the game
3. if the new version doesn't start, puts the previous version back

A commit that fails the tests, or fails to start, stays undeployed and isn't retried until a newer commit arrives. Builds run at low priority so the game stays responsive. Player data is never touched. Raids in progress during the restart are settled automatically with the moves already received.

So **merging a pull request into `main` is publishing it**. It goes live within about 5 minutes.

To check what's deployed, open `https://<ip-with-dashes>.sslip.io/deploy-status.json`, or run:

```bash
ssh root@<droplet-ip> journalctl -u cedar-clash-update -n 50 --no-pager
```

To pause automatic updates:

```bash
ssh root@<droplet-ip> systemctl disable --now cedar-clash-update.timer
```

To resume them:

```bash
ssh root@<droplet-ip> systemctl enable --now cedar-clash-update.timer
```

**Manual.** To deploy right away, or to try a branch other than `main`, push to GitHub and run this from your computer:

```bash
deploy/push.sh <droplet-ip> [branch]
```

It deploys the branch you have checked out, or the one you name. Deploying any branch other than `main` pauses automatic updates until you deploy `main` again with `deploy/push.sh <droplet-ip> main`.

## Checking on it

```bash
ssh root@<droplet-ip> systemctl status cedar-clash
```

```bash
ssh root@<droplet-ip> journalctl -u cedar-clash -n 100 --no-pager
```

```bash
ssh root@<droplet-ip> journalctl -u caddy -n 50 --no-pager
```

## Backups

Copy the latest backup to your computer:

```bash
scp root@<droplet-ip>:/var/backups/cedar-clash/latest.db ./cedar-clash-backup.db
```

To restore a backup, stop the game, put the file back, and start the game again:

```bash
ssh root@<droplet-ip> systemctl stop cedar-clash
```

```bash
scp ./cedar-clash-backup.db root@<droplet-ip>:/var/lib/cedar-clash/cedar-clash.db
```

```bash
ssh root@<droplet-ip> "rm -f /var/lib/cedar-clash/cedar-clash.db-wal /var/lib/cedar-clash/cedar-clash.db-shm && chown cedarclash:cedarclash /var/lib/cedar-clash/cedar-clash.db && systemctl start cedar-clash"
```

## Rolling back

To go back to an older commit:

```bash
ssh root@<droplet-ip> "cd /opt/cedar-clash/repo && git checkout --quiet <commit> && bash deploy/setup.sh --update"
```

## What's where on the droplet

| Path | What |
|---|---|
| `/opt/cedar-clash/repo` | git checkout used for builds |
| `/opt/cedar-clash/app` | the installed build (read-only to the game) |
| `/var/lib/cedar-clash` | the database (only the `cedarclash` user can read it) |
| `/etc/systemd/system/cedar-clash.service` | the service and its sandbox |
| `/etc/caddy/Caddyfile` | HTTPS and routing |
| `/var/log/cedar-clash-setup.log` | first-boot log |
| `/etc/systemd/system/cedar-clash-update.timer` | the every-5-minutes update check (`/usr/local/sbin/cedar-clash-auto-update`) |
| `/opt/cedar-clash/app.prev` | the previous version, kept for automatic rollback |
