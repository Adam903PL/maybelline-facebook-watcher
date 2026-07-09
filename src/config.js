import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

export const PAGE_URL = 'https://www.facebook.com/maybellinepolska?locale=pl_PL';

export const POLL_INTERVAL_MS = 60_000;

// Plain keyword filter — no AI. Matched case-insensitively against a
// diacritics-stripped copy of the post BODY (the "Maybelline New York … ·"
// page header is stripped first, otherwise brand keywords would match every
// post). Entries are stems where Polish declension allows it ("bilet" covers
// bilety/biletów/bilecie; "imprez" covers impreza/imprezie). Multiword
// phrases need per-case variants because substring matching is contiguous.
// Order matters: the FIRST match labels the Telegram notification, so
// specific phrases come before generic single words.
export const KEYWORDS = [
  // Trzon i marka
  'festiwalu makijażu i muzyk',
  'festiwal makijażu i muzyk',
  'festiwal maybelline',
  'festiwalu maybelline',
  'strefa maybelline',
  'strefie maybelline',
  'maybelline new york music',
  '#maybellinepolska',
  'maybelline ny',
  'maybelline polska',
  'maybelline',
  'modelki',
  // Festiwal i muzyka
  'strefa festiwalow',
  'strefie festiwalow',
  'festiwal',
  'koncert',
  'muzyk',
  'scen',
  'line-up',
  'lineup',
  'artyści',
  'artyst',
  'event',
  'imprez',
  'występ',
  // Akcja i dostępność
  'bilet',
  'wejściów',
  'konkurs',
  'rozdani',
  'zaproszeni',
  'ambasador',
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
