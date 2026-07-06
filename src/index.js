import {
  KEYWORDS,
  POLL_INTERVAL_MS,
  STATE_FILE,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} from './config.js';
import { isFromLastDay, matchedKeyword, stripPageHeader } from './filter.js';
import { closeBrowser, resetSession, scrapePosts } from './scrape.js';
import { loadState, saveState } from './state.js';
import { sendMessage } from './telegram.js';

const FAILURE_ALERT_THRESHOLD = 10;
const FAILURE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
// Facebook walls IPs that keep hammering while blocked; once several polls in
// a row fail, slow down to give the wall a chance to lift, and return to the
// normal cadence on the first success.
const BACKOFF_THRESHOLD = 5;
const BACKOFF_INTERVAL_MS = 10 * 60 * 1000;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error(
    'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID — set them in .env (local) or service variables (Railway).',
  );
  process.exit(1);
}

async function pollOnce(state) {
  const posts = await scrapePosts();

  if (!state.seeded) {
    for (const post of posts) state.seen.add(post.id);
    state.seeded = true;
    await saveState(STATE_FILE, state);
    console.log(
      `First run: seeded ${posts.length} existing posts, no notifications sent.`,
    );
    return;
  }

  const newPosts = posts.filter((post) => !state.seen.has(post.id));
  let notified = 0;
  for (const post of newPosts) {
    const keyword = matchedKeyword(stripPageHeader(post.text), KEYWORDS);
    if (keyword && !isFromLastDay(post.text)) {
      console.log(`Skipping old matching post (late DOM appearance): ${post.url}`);
    } else if (keyword) {
      await sendMessage(
        `🆕 Maybelline Polska — nowy post pasuje do „${keyword}"\n\n${post.text.slice(0, 500)}\n\n${post.url}`,
      );
      notified += 1;
      console.log(`Notified: ${post.url} (keyword: ${keyword})`);
    }
    state.seen.add(post.id);
  }
  await saveState(STATE_FILE, state);
  console.log(
    `Poll OK: ${posts.length} posts visible, ${newPosts.length} new, ${notified} matched.`,
  );
}

async function main() {
  const runOnce = process.argv.includes('--once');
  const state = await loadState(STATE_FILE);
  console.log(
    `Watcher starting (state: ${STATE_FILE}, seeded: ${state.seeded}, seen: ${state.seen.size}).`,
  );

  let consecutiveFailures = 0;
  let lastFailureAlertAt = 0;

  do {
    const startedAt = Date.now();
    try {
      await pollOnce(state);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      console.error(
        `Poll failed (${consecutiveFailures} in a row): ${err.stack ?? err}`,
      );
      // Discard the (possibly flagged) session so the next poll starts with a
      // fresh identity.
      await resetSession();
      if (
        consecutiveFailures >= FAILURE_ALERT_THRESHOLD &&
        Date.now() - lastFailureAlertAt > FAILURE_ALERT_COOLDOWN_MS
      ) {
        lastFailureAlertAt = Date.now();
        try {
          await sendMessage(
            `⚠️ maybelline-fb-watcher: scraping failed ${consecutiveFailures} times in a row. Last error: ${String(err).slice(0, 300)}`,
          );
        } catch (alertErr) {
          console.error(`Failed to send failure alert: ${alertErr}`);
        }
      }
    }
    if (!runOnce) {
      const backedOff = consecutiveFailures >= BACKOFF_THRESHOLD;
      if (backedOff) {
        console.log(
          `Backing off: ${consecutiveFailures} consecutive failures, next poll in ${BACKOFF_INTERVAL_MS / 60000} min.`,
        );
      }
      const baseInterval = backedOff ? BACKOFF_INTERVAL_MS : POLL_INTERVAL_MS;
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
    console.log(`Received ${signal}, shutting down.`);
    await closeBrowser();
    process.exit(0);
  });
}

main().catch(async (err) => {
  console.error(`Fatal: ${err.stack ?? err}`);
  await closeBrowser();
  process.exit(1);
});
