import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

export const PAGE_URL = 'https://www.facebook.com/maybellinepolska?locale=pl_PL';

export const POLL_INTERVAL_MS = 60_000;

// Keyword filter — no AI. Each entry is a { label, pattern } where `pattern`
// is a RegExp tested against the normalized (lowercased, diacritics-stripped)
// post BODY (the "Maybelline New York … ·" page header is stripped first,
// otherwise brand keywords would match every post).
//
// Patterns use \w* to absorb Polish declension suffixes automatically:
//   festiwal\w* → festiwal, festiwalu, festiwale, festiwali, festiwalowy…
// For stems that are too short / ambiguous, \b word boundaries prevent false
// positives (e.g. \bscen\w* avoids matching "scenariusz").
//
// Order matters: the FIRST match's label is shown in the Telegram notification,
// so specific phrases come before generic single words.
export const KEYWORDS = [
  // ── Core event phrases ────────────────────────────────────────────────
  { label: 'festiwal makijażu i muzyki',  pattern: /festiwal\w* makijaz\w* i muzyk\w*/ },
  { label: 'festiwal Maybelline',         pattern: /festiwal\w* maybelline/ },
  { label: 'strefa Maybelline',           pattern: /stref\w* maybelline/ },
  { label: 'Maybelline New York Music',   pattern: /maybelline new york music/ },

  // ── Brand ─────────────────────────────────────────────────────────────
  { label: '#maybellinepolska',           pattern: /#maybellinepolska/ },
  { label: 'Maybelline NY',              pattern: /maybelline ny\b/ },
  { label: 'Maybelline Polska',          pattern: /maybelline polska/ },
  { label: 'Maybelline',                 pattern: /maybelline/ },
  { label: 'modelka',                    pattern: /modele?k\w*/ },

  // ── Festival & music ──────────────────────────────────────────────────
  { label: 'strefa festiwalowa',          pattern: /stref\w* festiwal\w*/ },
  { label: 'festiwal',                   pattern: /festiwal\w*/ },
  { label: 'koncert',                    pattern: /koncert\w*/ },
  { label: 'muzyka',                     pattern: /muzyk\w*/ },
  { label: 'scena',                      pattern: /\bscen[aeyio](?!riusz)\w*/ },
  { label: 'line-up',                    pattern: /line-?up\w*/ },
  { label: 'artysta',                    pattern: /artyst\w*/ },
  { label: 'event',                      pattern: /\bevent\w*/ },
  { label: 'impreza',                    pattern: /imprez\w*/ },
  { label: 'występ',                     pattern: /wystep\w*/ },

  // ── Tickets & access ──────────────────────────────────────────────────
  { label: 'bilet',                      pattern: /bilet\w*/ },
  { label: 'wejściówka',                 pattern: /wejsciow\w*/ },
  { label: 'konkurs',                    pattern: /konkurs\w*/ },
  { label: 'rozdanie',                   pattern: /rozdan\w*/ },
  { label: 'zaproszenie',                pattern: /zaproszen\w*/ },
  { label: 'ambasador',                  pattern: /ambasador\w*/ },
];

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Supports multiple chat IDs (comma-separated) so the bot can notify both
// a private chat and a group simultaneously. TELEGRAM_CHAT_IDS takes priority;
// falls back to legacy TELEGRAM_CHAT_ID for backwards compatibility.
const rawChatIds = process.env.TELEGRAM_CHAT_IDS ?? process.env.TELEGRAM_CHAT_ID ?? '';
export const TELEGRAM_CHAT_IDS = rawChatIds
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

export const STATE_FILE = process.env.STATE_FILE ?? './state.json';

// Identifies WHICH deployment a Telegram message came from (startup message
// and failure alerts) — two deployments sharing one bot are otherwise
// indistinguishable, which is how Railway's alerts got blamed on the home PC.
// In Docker the hostname is a random container id, so docker-compose.yml
// passes the host's computer name in explicitly.
export const DEVICE_NAME = process.env.DEVICE_NAME || os.hostname();

// Where failed-scrape evidence (screenshot + HTML of whatever Facebook served)
// is written. Defaults next to the state file so it lands on the persistent
// volume in Docker and can be copied out with `docker compose cp`.
export const EVIDENCE_DIR =
  process.env.EVIDENCE_DIR ?? path.dirname(STATE_FILE);
