import {
  DEVICE_NAME,
  KEYWORDS,
  POLL_INTERVAL_MS,
  STATE_FILE,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_IDS,
} from './config.js';
import { isFromLastDay, matchedKeyword, stripPageHeader } from './filter.js';
import { error, log } from './log.js';
import { closeBrowser, resetSession, scrapePosts } from './scrape.js';
import { loadState, saveState } from './state.js';
import { sendMessage } from './telegram.js';

const FAILURE_ALERT_THRESHOLD = 10;
const FAILURE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
// Facebook walls IPs that keep hammering while blocked; once several polls in
// a row fail, slow down to give the wall a chance to lift, and return to the
// normal cadence on the first success. A long streak slows down further —
// a wall that survives 20 polls won't lift in minutes.
const BACKOFF_THRESHOLD = 5;
const BACKOFF_INTERVAL_MS = 10 * 60 * 1000;
const EXTENDED_BACKOFF_THRESHOLD = 20;
const EXTENDED_BACKOFF_INTERVAL_MS = 30 * 60 * 1000;
// Resetting the session after EVERY failed poll means hitting Facebook with a
// brand-new anonymous identity each time — the exact pattern its anti-bot
// wall escalates on, turning one transient failure into a self-sustaining
// streak. During a streak, keep the session and reset at most this often.
const SESSION_RESET_COOLDOWN_MS = 30 * 60 * 1000;

if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
  error(
    'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_IDS/TELEGRAM_CHAT_ID — set them in .env (local) or service variables (Railway).',
  );
  process.exit(1);
}

async function pollOnce(state) {
  const posts = await scrapePosts();

  if (!state.seeded) {
    for (const post of posts) state.seen.add(post.id);
    state.seeded = true;
    await saveState(STATE_FILE, state);
    log(
      `First run: seeded ${posts.length} existing posts, no notifications sent.`,
    );
    return;
  }

  const newPosts = posts.filter((post) => !state.seen.has(post.id));
  let notified = 0;
  for (const post of newPosts) {
    const keyword = matchedKeyword(stripPageHeader(post.text), KEYWORDS);
    if (keyword && !isFromLastDay(post.text)) {
      log(`Skipping old matching post (late DOM appearance): ${post.url}`);
    } else if (keyword) {
      await sendMessage(
        `🆕 Maybelline Polska — nowy post pasuje do „${keyword}"\n\n${post.text.slice(0, 500)}\n\n${post.url}`,
      );
      notified += 1;
      log(`Notified: ${post.url} (keyword: ${keyword})`);
    }
    state.seen.add(post.id);
  }
  await saveState(STATE_FILE, state);
  log(
    `Poll OK: ${posts.length} posts visible, ${newPosts.length} new, ${notified} matched.`,
  );
}

async function main() {
  const runOnce = process.argv.includes('--once');
  const state = await loadState(STATE_FILE);
  log(
    `Watcher starting on "${DEVICE_NAME}" (state: ${STATE_FILE}, seeded: ${state.seeded}, seen: ${state.seen.size}).`,
  );

  // One startup message per launch so every deployment identifies itself —
  // a failed courtesy message must not kill the watcher, hence the catch.
  try {
    await sendMessage(
      `🟢 maybelline-fb-watcher wystartował na: ${DEVICE_NAME}\n(zapamiętane posty: ${state.seen.size}, interwał: ${POLL_INTERVAL_MS / 1000}s)`,
    );
  } catch (err) {
    error(`Could not send startup message: ${err.message ?? err}`);
  }

  let consecutiveFailures = 0;
  let lastFailureAlertAt = 0;
  let lastSessionResetAt = 0;

  do {
    const startedAt = Date.now();
    try {
      await pollOnce(state);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      error(
        `Poll failed (${consecutiveFailures} in a row): ${err.stack ?? err}`,
      );
      // A fresh identity is worth one try, but churning identities every poll
      // during a streak escalates the wall — so throttle the resets.
      if (Date.now() - lastSessionResetAt > SESSION_RESET_COOLDOWN_MS) {
        lastSessionResetAt = Date.now();
        log('Resetting browser session (next attempt uses a fresh identity).');
        await resetSession();
      } else {
        log(
          'Keeping current browser session (reset throttled to once per ' +
            `${SESSION_RESET_COOLDOWN_MS / 60000} min during failure streaks).`,
        );
      }
      if (
        consecutiveFailures >= FAILURE_ALERT_THRESHOLD &&
        Date.now() - lastFailureAlertAt > FAILURE_ALERT_COOLDOWN_MS
      ) {
        lastFailureAlertAt = Date.now();
        try {
          await sendMessage(
            `⚠️ maybelline-fb-watcher [${DEVICE_NAME}]: scraping failed ${consecutiveFailures} times in a row. Last error: ${String(err).slice(0, 500)}`,
          );
        } catch (alertErr) {
          error(`Failed to send failure alert: ${alertErr}`);
        }
      }
    }
    if (!runOnce) {
      const backedOff = consecutiveFailures >= BACKOFF_THRESHOLD;
      const baseInterval =
        consecutiveFailures >= EXTENDED_BACKOFF_THRESHOLD
          ? EXTENDED_BACKOFF_INTERVAL_MS
          : backedOff
            ? BACKOFF_INTERVAL_MS
            : POLL_INTERVAL_MS;
      if (backedOff) {
        log(
          `Backing off: ${consecutiveFailures} consecutive failures, next poll in ${baseInterval / 60000} min.`,
        );
      }
      // Jitter makes the request cadence less mechanical to anti-bot systems.
      const jitter = Math.floor(Math.random() * 15_000);
      const elapsed = Date.now() - startedAt;
      await new Promise((r) =>
        setTimeout(r, Math.max(0, baseInterval + jitter - elapsed)),
      );
    }
  } while (!runOnce);

  await closeBrowser();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    log(`Received ${signal}, shutting down.`);
    await closeBrowser();
    process.exit(0);
  });
}

main().catch(async (err) => {
  error(`Fatal: ${err.stack ?? err}`);
  await closeBrowser();
  process.exit(1);
});
