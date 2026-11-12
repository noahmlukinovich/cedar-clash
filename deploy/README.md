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
cedar-clash-admin passwd "Campus Name" newpassword123   # reset a password (logs them out)
cedar-clash-admin delete-user "Campus Name"
```

## 3. Deploy updates

Push your commits to GitHub, then run this from your computer:

```bash
deploy/push.sh <droplet-ip>
```

The droplet pulls the branch you have checked out (or the one you pass as the second argument), rebuilds, and restarts only the game. Player data is never touched. A deploy takes about a minute. Raids that are in progress during the restart are settled automatically with the moves already received.

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
