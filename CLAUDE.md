# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**maybelline-fb-watcher** — a 24/7 worker that polls the public Facebook page
https://www.facebook.com/maybellinepolska?locale=pl_PL every 60 seconds, detects new posts about
the "FESTIWALU MAKIJAŻU I MUZYKI" event by plain keyword matching (**no AI filtering** — hard
requirement), and sends a Telegram notification via `t.me/maybaline_watcher_bot`.

## Commands

- `npm test` — unit tests (node:test; filter + state logic, no network)
- `npm run once` — single poll cycle (needs `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` env vars)
- `npm start` — the 60s watcher loop
- `npm run test-message` — send a test Telegram message
- Local Playwright needs `npx playwright install chromium` once

## Architecture

Single Node.js 22+ ESM process, no framework. Flow per poll (`src/index.js`):
scrape → dedupe against seen-set → keyword filter → Telegram notify → persist state.

- `src/config.js` — **the keyword list lives here**, ordered specific→generic because the first
  match labels the notification. Keywords are matched as contiguous substrings of lowercased,
  diacritics-stripped text (`src/filter.js`), so Polish declension needs stems ("bilet",
  "imprez", "wejściów" — note "wejściówek" inserts an "e" into the stem) and multiword phrases
  need per-case variants (`festiwalu/festiwal makijażu i muzyk`). The list includes very broad
  terms ("maybelline", "muzyk", "event") by owner request — most new posts will notify.
- `src/filter.js` — `normalize()` maps `ł→l` explicitly (NFD does not decompose it) before
  stripping combining marks. `stripPageHeader()` cuts the "Maybelline New York 3 dni ·" header
  before keyword matching (brand keywords would otherwise match 100% of posts);
  `isFromLastDay()` reads the age marker from the *raw* head and gates notifications to posts
  ≤1 day old — Facebook reveals old posts to anonymous visitors unpredictably, and without this
  gate they'd fire as "new".
- `src/scrape.js` — Playwright Chromium, one persistent context reused across polls (a fresh
  anonymous identity every 60s trips Facebook's wall; `resetSession()` after a failed poll is
  **throttled in index.js to once per 30 min** — resetting on every failure of a streak churns
  identities each poll, which escalates the wall and made a 2026-07-07 home-PC flag
  self-sustaining for 130+ polls). On render timeout it throws with the served page title +
  body snippet, saves a screenshot + HTML dump to `EVIDENCE_DIR` (default: dirname of
  `STATE_FILE`, so `/data/last-failure-{main,plugin}.{png,html}` in Docker), and when both the
  main page AND the Page Plugin fallback fail, the thrown error carries both messages (the
  alert used to show only the plugin one). Non-obvious, empirically required behavior:
  - scrolls 3× and closes Facebook's anonymous-visitor login popup, otherwise only the top post
    is in the DOM (a pinned post would then hide new ones);
  - clicks "Wyświetl więcej"/"See more" expanders before extraction, otherwise keyword text
    beyond the preview fold is invisible;
  - **comments also have `role=article`** — posts are distinguished by requiring a
    `/posts/|/reels?/|/videos/|story_fbid` permalink (comment anchors point at profiles);
  - post ID = permalink origin+pathname (query params are volatile tracking);
  - extracting 0 posts **throws** (login wall / broken selectors) — never treat a scrape
    failure as "no new posts".
- `src/state.js` — seen-set JSON at `STATE_FILE` (default `./state.json`, `/data/state.json` on
  Railway). The `seeded` flag makes the first run record all visible posts without notifying.
- `src/index.js` — after 10 consecutive scrape failures sends a Telegram alert (max 1/hour).
  Backoff tiers: ≥5 failures → 10-min polls, ≥20 → 30-min polls; back to 60s on first success.
  Every start sends a 🟢 Telegram message and alerts are tagged with `DEVICE_NAME` (env,
  falls back to `os.hostname()`; docker-compose passes the host's `COMPUTERNAME`) — the
  2026-07-07 postmortem lesson: untagged alerts from two deployments are unattributable.
- `src/log.js` — ISO-timestamped `log/warn/error` used everywhere (don't add bare `console.*`).

## Secrets & env

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS` (comma-separated list of chat IDs — supports
  both private chats and groups simultaneously; falls back to legacy `TELEGRAM_CHAT_ID` for
  backwards compatibility), optional `STATE_FILE`. Local `.env` is hook-protected — the user
  edits it themselves; for ad-hoc local runs pass env vars inline instead.

## Deployment

**Primary hosting: the owner's home PC via Docker Compose** (`docker compose up -d --build`,
see README.md) — chosen because Facebook login-walls all datacenter IPs, and only a residential
IP can scrape. State persists in the `watcher-state` named volume; `restart: unless-stopped`
plus Docker Desktop autostart covers reboots. GitHub remote:
`github.com/Adam903PL/maybelline-facebook-watcher`.

- The `Dockerfile` base image tag (`mcr.microsoft.com/playwright:vX.Y.Z-noble`) **must match the
  `playwright` version in package.json**, or the npm package won't find the browsers.

### Railway (DELETED 2026-07-07)

The legacy Railway project was **deleted with owner confirmation on 2026-07-07** (it was blind
behind the datacenter-IP wall and its hourly failure alerts were being mistaken for home-PC
failures). `railway.json` is kept in the repo in case cloud hosting is revisited
(`sleepApplication: false` — owner requires sleeping disabled). If redeploying to any
datacenter, a static residential/ISP proxy is mandatory (see Operational notes). Known gotcha:
the Railway **MCP server** can hold stale credentials from session start — use the Railway CLI
or GraphQL with the token at `~/.railway/config.json` `.user.accessToken`.

## Operational notes

- **2026-07-07 false-alarm postmortem**: the "scraping failed 130/136 times in a row" Telegram
  alerts came from the still-running **legacy Railway watcher** (blind behind the IP wall,
  10-min backoff polls = ~6 failures/hour, alert cooldown 1 h), NOT from the home PC — the home
  PC polled `Poll OK` the whole time. Lesson: with two deployments sharing one Telegram bot,
  alerts are unattributable; if a second deployment ever exists again, put a hostname tag in
  the alert text. The Railway project was deleted to end the spam.
- **Home PC quirk (open, 2026-07-07)**: its polls see only **1 unique post** per scrape
  (dev machine sees 10 with identical code) — Facebook serves that IP a limited/teaser page
  variant. Detection still works because a new post lands on top, but a *pinned* post would
  mask newer ones. If it persists, consider a warning + periodic session refresh on low counts.
- **Facebook login-walls all datacenter IPs** — confirmed 2026-07-06 on Railway EU and
  us-east4, on both the main page and the Page Plugin embed. Only residential IPs can scrape.
  If cloud hosting is ever revisited: flat-rate static residential/ISP proxy wired as a
  `PROXY_URL` env var passed to `chromium.launch({ proxy })` in `src/scrape.js`. Consumer VPNs
  do NOT work (datacenter exit IPs, no TUN in containers). Plain-HTTP fetching doesn't work
  either — the Page Plugin is client-side rendered (raw HTML contains zero post content).
- `state.json` / the `/data` volume is runtime state — never commit it, never reset it casually
  (a reset re-seeds silently, which is safe but loses nothing; a *deleted seeded flag with kept
  history* is not a state that occurs naturally).
