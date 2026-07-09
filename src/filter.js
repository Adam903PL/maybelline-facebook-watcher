// "ł" is a stroked letter, not a base letter + combining mark, so NFD does not
// decompose it — map it explicitly before stripping combining marks.
export function normalize(text) {
  return text
    .toLowerCase()
    .replaceAll('ł', 'l')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns the label of the first keyword whose pattern matches in the
// normalized text, or null when nothing matches.
export function matchedKeyword(text, keywords) {
  const haystack = normalize(text);
  return keywords.find((kw) => kw.pattern.test(haystack))?.label ?? null;
}

// Scraped article text begins with the page-name header ("Maybelline New York
// 3 dni ·" on the main page, "Maybelline New York W czwartek" in the Page
// Plugin). It must not participate in keyword matching — brand keywords like
// "maybelline" would otherwise match every single post regardless of content.
// Main page: the header ends at the first "·". Plugin: no separator, so only
// the page name is stripped (the age phrase that remains contains no
// keyword-colliding words).
export function stripPageHeader(text) {
  const idx = text.indexOf('·');
  if (idx !== -1 && idx < 60) return text.slice(idx + 1).trim();
  return text.replace(/^maybelline new york\s*/i, '').trim();
}

// Facebook renders a fluctuating subset of old posts to anonymous visitors, so
// a post can enter the DOM days after publication and look "new" to the
// dedupe. The post header carries an age marker; only markers up to ~one day
// count as fresh. Main page uses relative forms ("5 min", "3 godz.",
// "1 dzień", "4 dni"); the Page Plugin uses words and day names ("Wczoraj",
// "W niedzielę", "W zeszłą środę", "2 lipca") — a plain day name can be today
// or up to 6 days back, so it is resolved against `now`. An unrecognized
// format counts as fresh — better a rare stale notification than a missed
// new post.
const DAY_STEMS = ['niedziel', 'poniedzial', 'wtor', 'srod', 'czwart', 'piat', 'sobot'];
const MONTH_DATE =
  /\d+\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|wrzesnia|pazdziernika|listopada|grudnia)/;

export function isFromLastDay(text, now = new Date()) {
  const head = normalize(text.slice(0, 80));
  if (/\d+\s*(min|godz)/.test(head)) return true;
  if (/przed chwila|dzis|wczoraj/.test(head)) return true;
  if (/1\s*dzien/.test(head)) return true;
  if (/\d+\s*(dni|tyg|mies)/.test(head)) return false;
  if (/w zeszl/.test(head)) return false;
  if (MONTH_DATE.test(head)) return false;
  for (let day = 0; day < 7; day += 1) {
    if (new RegExp(`w ${DAY_STEMS[day]}`).test(head)) {
      const distance = (now.getDay() - day + 7) % 7;
      return distance <= 1;
    }
  }
  return true;
}
