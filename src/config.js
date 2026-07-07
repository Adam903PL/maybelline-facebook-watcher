import 'dotenv/config';
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
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
export const STATE_FILE = process.env.STATE_FILE ?? './state.json';

// Where failed-scrape evidence (screenshot + HTML of whatever Facebook served)
// is written. Defaults next to the state file so it lands on the persistent
// volume in Docker and can be copied out with `docker compose cp`.
export const EVIDENCE_DIR =
  process.env.EVIDENCE_DIR ?? path.dirname(STATE_FILE);
