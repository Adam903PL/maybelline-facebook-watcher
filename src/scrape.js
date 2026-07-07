import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { EVIDENCE_DIR, PAGE_URL } from './config.js';
import { log, warn } from './log.js';

// Facebook's embeddable Page Plugin renders the page timeline without login
// and is served even when the main page is login-walled (which Facebook does
// permanently to datacenter IPs like Railway's). The main page is still tried
// first — it exposes more posts and richer age markers.
const PLUGIN_URL =
  'https://www.facebook.com/plugins/page.php?href=' +
  encodeURIComponent('https://www.facebook.com/maybellinepolska') +
  '&tabs=timeline&width=500&height=1500&locale=pl_PL';

let browser = null;
let context = null;
let page = null;
let consentHandled = false;

// One long-lived session (cookies included) across polls: a brand-new
// anonymous identity every 60s is exactly the pattern Facebook's anti-bot
// wall reacts to. After a failed poll the caller resets the session via
// resetSession() so the next attempt starts with a fresh identity.
async function getPage() {
  if (!browser?.isConnected()) {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    context = null;
  }
  if (!context) {
    log('Starting a new browser session (fresh anonymous identity).');
    context = await browser.newContext({
      locale: 'pl-PL',
      viewport: { width: 1280, height: 1600 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        return route.abort();
      }
      return route.continue();
    });
    page = await context.newPage();
    consentHandled = false;
  }
  return page;
}

export async function resetSession() {
  try {
    await context?.close();
  } catch {
    // context may already be gone with the browser — nothing to release
  }
  context = null;
  page = null;
}

export async function closeBrowser() {
  await resetSession();
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// Dump what Facebook actually served (screenshot + full HTML) so a failure
// can be diagnosed after the fact. Overwrites the previous dump for the same
// source, so disk usage stays bounded. Best-effort: evidence saving must
// never turn a scrape failure into a different failure.
export async function saveEvidence(p, source) {
  try {
    await mkdir(EVIDENCE_DIR, { recursive: true });
    const png = path.join(EVIDENCE_DIR, `last-failure-${source}.png`);
    const html = path.join(EVIDENCE_DIR, `last-failure-${source}.html`);
    await p.screenshot({ path: png, fullPage: true });
    await writeFile(html, await p.content());
    log(`Saved failure evidence: ${png} and ${html}`);
  } catch (err) {
    warn(`Could not save failure evidence for ${source}: ${err.message}`);
  }
}

async function renderTimeoutError(p, what) {
  // Fail loud WITH evidence: what did Facebook serve instead of the feed?
  const title = await p.title().catch(() => '<unreadable>');
  const snippet = await p
    .evaluate(() => (document.body?.innerText ?? '').slice(0, 200))
    .catch(() => '<unreadable>');
  return new Error(
    `${what} never rendered. Page title: "${title}". Body starts: "${snippet.replace(/\s+/g, ' ')}"`,
  );
}

// Canonicalize permalinks (strip tracking params) so the same post always
// produces the same id across polls and across both scrape sources.
function canonicalizePosts(rawPosts) {
  const byId = new Map();
  for (const post of rawPosts) {
    const u = new URL(post.url);
    const id = u.origin + u.pathname;
    if (!byId.has(id)) {
      byId.set(id, { id, url: id, text: post.text });
    }
  }
  return [...byId.values()];
}

async function scrapeMainPage(p) {
  await p.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  log(`Main page loaded (title: "${await p.title().catch(() => '?')}").`);

  // The cookie-consent dialog only shows on the session's first visit in some
  // regions; its absence is normal, so a click timeout here is not an error.
  if (!consentHandled) {
    const decline = p
      .getByRole('button', { name: /odrzuć|decline optional cookies/i })
      .first();
    try {
      await decline.click({ timeout: 5_000 });
    } catch {
      // no consent dialog — continue
    }
    consentHandled = true;
  }

  try {
    await p.waitForSelector('[role="article"]', { timeout: 20_000 });
  } catch {
    await saveEvidence(p, 'main');
    throw await renderTimeoutError(p, 'Main page articles');
  }

  // Scroll a few times so more than the top post is in the DOM — a pinned
  // post on top must not hide newer posts below it. Facebook shows a login
  // popup to anonymous visitors on scroll; close it so the feed keeps
  // rendering (its absence is normal, hence the swallowed click timeout).
  const closePopup = p
    .locator('[aria-label="Zamknij"], [aria-label="Close"]')
    .first();
  for (let i = 0; i < 3; i += 1) {
    await p.mouse.wheel(0, 2500);
    await p.waitForTimeout(1_500);
    try {
      await closePopup.click({ timeout: 1_000 });
    } catch {
      // no login popup this round — continue
    }
  }

  // Expand truncated post texts so keywords beyond the preview fold are
  // matchable. DOM click() is enough to trigger the expander handler.
  await p.evaluate(() => {
    for (const btn of document.querySelectorAll('[role="article"] [role="button"]')) {
      const label = (btn.textContent ?? '').trim().toLowerCase();
      if (label === 'wyświetl więcej' || label === 'see more') btn.click();
    }
  });
  await p.waitForTimeout(1_000);

  // Playwright's $$eval runs this static function in the page context; it is
  // not eval() of a dynamic string.
  const rawPosts = await p.$$eval('[role="article"]', (articles) =>
    articles
      .map((article) => {
        const link = [...article.querySelectorAll('a[href]')]
          .map((a) => a.href)
          // Comments are also [role=article]; their anchors point at
          // commenter profiles (/people/, profile.php), so requiring a page
          // content permalink filters them out.
          .find((href) =>
            /\/posts\/|\/reels?\/|\/videos\/|story_fbid/.test(href),
          );
        const text = (article.innerText ?? '').replace(/\s+/g, ' ').trim();
        return { url: link ?? null, text };
      })
      .filter((post) => post.url && post.text),
  );

  const posts = canonicalizePosts(rawPosts);
  log(
    `Main page: ${rawPosts.length} article nodes with post permalinks, ${posts.length} unique posts.`,
  );
  return posts;
}

async function scrapePlugin(p) {
  await p.goto(PLUGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  log(`Page Plugin loaded (title: "${await p.title().catch(() => '?')}").`);
  try {
    await p.waitForSelector(
      'a[href*="/posts/"], a[href*="/reel"], a[href*="/videos/"]',
      { timeout: 20_000 },
    );
  } catch {
    await saveEvidence(p, 'plugin');
    throw await renderTimeoutError(p, 'Page Plugin posts');
  }
  await p.waitForTimeout(2_000);

  // The plugin has no [role=article] containers. For each unique permalink,
  // climb ancestors while the subtree still contains only that one permalink —
  // the highest such ancestor is the post container holding its text.
  // (page.evaluate runs this static function in the page context; it is not
  // eval() of a dynamic string.)
  const rawPosts = await p.evaluate(() => {
    const isPostHref = (h) => /\/posts\/|\/reels?\/|\/videos\/|story_fbid/.test(h);
    const canonical = (h) => {
      const u = new URL(h);
      return u.origin + u.pathname;
    };
    const anchors = [...document.querySelectorAll('a[href]')].filter((a) =>
      isPostHref(a.href),
    );
    const seen = new Map();
    for (const a of anchors) {
      const id = canonical(a.href);
      if (!seen.has(id)) seen.set(id, a);
    }
    const results = [];
    for (const [, anchor] of seen) {
      let node = anchor;
      let best = anchor;
      while (node.parentElement) {
        const parent = node.parentElement;
        const ids = new Set(
          [...parent.querySelectorAll('a[href]')]
            .filter((a) => isPostHref(a.href))
            .map((a) => canonical(a.href)),
        );
        if (ids.size > 1) break;
        best = parent;
        node = parent;
      }
      results.push({
        url: anchor.href,
        text: (best.innerText ?? '').replace(/\s+/g, ' ').trim(),
      });
    }
    return results.filter((post) => post.text);
  });

  return canonicalizePosts(rawPosts);
}

// Scrapes the page and returns [{ id, url, text }] for every post currently
// visible. Throws on any failure, including "0 posts extracted" (usually a
// login wall or changed selectors) — callers must never interpret a scrape
// failure as "no new posts".
export async function scrapePosts() {
  const p = await getPage();

  let posts;
  try {
    posts = await scrapeMainPage(p);
  } catch (mainErr) {
    warn(
      `Main page scrape failed (${mainErr.message}) — falling back to the Page Plugin.`,
    );
    try {
      posts = await scrapePlugin(p);
    } catch (pluginErr) {
      // Surface BOTH failures — the alert previously showed only the plugin
      // error, hiding why the primary path broke.
      throw new Error(
        `Both scrape paths failed. Main page: ${mainErr.message} | Page Plugin: ${pluginErr.message}`,
      );
    }
    log(`Page Plugin fallback returned ${posts.length} posts.`);
  }

  if (posts.length === 0) {
    throw new Error(
      'Scrape extracted 0 posts — likely a login wall or changed selectors',
    );
  }
  return posts;
}
