# maybelline-fb-watcher

Watches the [Maybelline Polska Facebook page](https://www.facebook.com/maybellinepolska?locale=pl_PL)
**every 1 minute** and sends you a **Telegram message** when a new post matches any keyword from
the list (festival, tickets, concerts, giveaways, brand mentions — see `src/config.js`).
Matching is plain keyword search (no AI), case-insensitive and Polish-diacritics-insensitive.

> ⚠️ Run this on a **home/residential internet connection**. Facebook serves a login wall to
> cloud/datacenter IPs (Railway, AWS, VPS, most VPNs), so the watcher is blind when hosted there.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Your Telegram chat ID (see below)

## Setup (one time)

**1. Clone and enter the repo**

```powershell
git clone git@github.com:Adam903PL/maybelline-facebook-watcher.git
cd maybelline-facebook-watcher
```

**2. Create your `.env` file**

```powershell
Copy-Item .env.example .env
```

Then open `.env` in a text editor and fill in both values:

```
TELEGRAM_BOT_TOKEN=<token from @BotFather>
TELEGRAM_CHAT_ID=<your chat id>
```

To get your chat ID: send any message to your bot first (bots can't message you until you do),
then open this URL in a browser (with your token filled in) and read `"chat":{"id":...}`:

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

**3. Build and start**

```powershell
docker compose up -d --build
```

The first build downloads the Playwright browser image (a few GB) — later builds are fast.

## Everyday usage

| What | Command |
|---|---|
| Watch live logs | `docker compose logs -f` |
| Stop | `docker compose down` |
| Start again | `docker compose up -d` |
| Update after a `git pull` or config edit | `docker compose up -d --build` |
| Send a test Telegram message | `docker compose run --rm watcher node src/send-test-message.js` |

Healthy logs look like this (one line per minute):

```
Poll OK: 10 posts visible, 0 new, 0 matched.
```

## Auto-start when the PC boots

The container has `restart: unless-stopped`, so it starts automatically whenever Docker starts.
Just make sure Docker Desktop itself launches on login:
**Docker Desktop → Settings → General → "Start Docker Desktop when you sign in to your computer"**.

## How it behaves

- **First run**: all posts currently visible on the page are recorded silently (no notification
  spam for old posts). From then on, only genuinely new posts notify.
- **Already-seen posts survive restarts** — state lives in the `watcher-state` Docker volume.
  To reset it completely: `docker compose down -v` (next start re-seeds silently).
- Only posts **younger than ~24 h** can trigger a notification (Facebook sometimes reveals old
  posts late; those are absorbed silently).
- If scraping fails **10 times in a row** you get a ⚠️ Telegram alert (max one per hour), and
  polling slows to every 10 minutes until it recovers, then returns to 1-minute cadence.

## Changing the keywords

Edit the `KEYWORDS` list in [`src/config.js`](src/config.js) (ordered specific → generic; the
first match labels the notification), then rebuild:

```powershell
docker compose up -d --build
```

Run the tests after keyword changes if you have Node.js installed: `npm test`.

## Troubleshooting

- **`Poll failed ... Page title: "Facebook" ... Zaloguj się`** — Facebook is serving a login
  wall to your IP. On a home connection this happens when the IP gets temporarily flagged.
  What to do, in order:
  1. Make sure nothing routes your traffic through a VPN/proxy (system-wide VPN, "secure DNS"
     apps, etc.) — turn it off.
  2. **Restart your router** — most home ISPs assign a new IP on reconnect, which clears the
     flag immediately.
  3. Or just wait: after 20 consecutive failures the watcher slows to one poll per 30 minutes
     and keeps its browser session stable (resetting identity at most once per 30 min), which
     gives the flag time to expire. It returns to 1-minute polling on the first success.
- **Want to see what Facebook actually served?** On every failed scrape the watcher saves a
  screenshot + HTML of the served page to the data volume. Copy them out and open them:

  ```powershell
  docker compose cp watcher:/data/last-failure-main.png .
  docker compose cp watcher:/data/last-failure-plugin.png .
  ```

  (`-main` = the page itself, `-plugin` = the embed fallback; `.html` versions exist too.)
- **Reading logs**: `docker compose logs -f` — every line is timestamped, and each poll logs
  its steps (session start, page load + title, post counts), so the failing step is visible.
- **`Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID`** — your `.env` is missing or incomplete;
  fix it and run `docker compose up -d` again.
- **No Telegram messages arrive** — verify with the test-message command in the table above.
