import test from 'node:test';
import assert from 'node:assert/strict';
import { isFromLastDay, matchedKeyword, normalize, stripPageHeader } from '../src/filter.js';
import { KEYWORDS } from '../src/config.js';

test('normalize lowercases and strips Polish diacritics', () => {
  assert.equal(normalize('FESTIWALU MAKIJAŻU I MUZYKI'), 'festiwalu makijazu i muzyki');
  assert.equal(normalize('ąćęłńóśźż'), 'acelnoszz');
});

test('normalize collapses whitespace', () => {
  assert.equal(normalize('Maybelline   New\nYork\tMusic'), 'maybelline new york music');
});

test('matches the festival keyword across declensions via the stem', () => {
  for (const suffix of ['muzyki', 'muzyką', 'muzyka']) {
    const text = `Zapraszamy na FESTIWAL... o festiwalu makijażu i ${suffix} opowiemy więcej!`;
    assert.equal(matchedKeyword(text, KEYWORDS), 'festiwalu makijażu i muzyk');
  }
});

test('matches regardless of diacritics in the post text', () => {
  const text = 'wielki festiwalu makijazu i muzyki juz wkrotce';
  assert.equal(matchedKeyword(text, KEYWORDS), 'festiwalu makijażu i muzyk');
});

test('matches "Modelki" case-insensitively', () => {
  assert.equal(matchedKeyword('Szukamy MODELKI na nasz event!', KEYWORDS), 'modelki');
});

test('matches "Maybelline New York Music"', () => {
  assert.equal(
    matchedKeyword('Rusza Maybelline New York Music — bądźcie z nami', KEYWORDS),
    'maybelline new york music',
  );
});

test('matches the real "SECOND DROP" festival post', () => {
  const text =
    'WOW! Jesteście niesamowici! SECOND DROP biletów: SOLD OUT! ' +
    'Druga pula biletów na Maybelline New York Music Stories 2026 rozeszła się w mgnieniu oka! ' +
    'Najgorętszy festiwal makijażu i muzyki tego lata bije wszelkie rekordy';
  assert.notEqual(matchedKeyword(text, KEYWORDS), null);
  assert.equal(
    matchedKeyword('Najgorętszy festiwal makijażu i muzyki tego lata', KEYWORDS),
    'festiwal makijażu i muzyk',
  );
});

test('isFromLastDay accepts minutes, hours and "1 dzień" markers', () => {
  assert.equal(isFromLastDay('Maybelline New York 5 min · Nowość!'), true);
  assert.equal(isFromLastDay('Maybelline New York 3 godz. · Nowość!'), true);
  assert.equal(isFromLastDay('Maybelline New York 1 dzień · WOW!'), true);
});

test('isFromLastDay rejects multi-day and older markers', () => {
  assert.equal(isFromLastDay('Maybelline New York 4 dni · Wystartowała pula'), false);
  assert.equal(isFromLastDay('Maybelline New York 2 tyg. · Konkurs'), false);
});

test('isFromLastDay defaults to fresh for unknown formats', () => {
  assert.equal(isFromLastDay('Maybelline New York · Zapraszamy!'), true);
});

test('isFromLastDay resolves Page Plugin day names against today', () => {
  const monday = new Date('2026-07-06T12:00:00'); // getDay() === 1
  // yesterday (Sunday) and today (Monday) are fresh
  assert.equal(isFromLastDay('Maybelline New York W niedzielę WOW!', monday), true);
  assert.equal(isFromLastDay('Maybelline New York W poniedziałek Hej!', monday), true);
  // Thursday/Friday are 3-4 days back
  assert.equal(isFromLastDay('Maybelline New York W czwartek Wystartowała', monday), false);
  assert.equal(isFromLastDay('Maybelline New York W piątek Wskakuj', monday), false);
  // explicit "last week" and date markers are stale
  assert.equal(isFromLastDay('Maybelline New York W zeszłą środę Zgarnij', monday), false);
  assert.equal(isFromLastDay('Maybelline New York 2 lipca Konkurs', monday), false);
  // "Wczoraj"/"Dzisiaj" are fresh
  assert.equal(isFromLastDay('Maybelline New York Wczoraj Nowość', monday), true);
  assert.equal(isFromLastDay('Maybelline New York Dzisiaj Nowość', monday), true);
});

test('stripPageHeader strips the bare page name for Page Plugin texts (no separator)', () => {
  const plugin = 'Maybelline New York W czwartek Wystartowała pula biletów SECOND DROP!';
  assert.equal(
    stripPageHeader(plugin),
    'W czwartek Wystartowała pula biletów SECOND DROP!',
  );
  // brand keyword must not fire off the header alone
  assert.equal(
    matchedKeyword(stripPageHeader('Maybelline New York W piątek Nowy tusz do rzęs!'), KEYWORDS),
    null,
  );
});

test('returns null for unrelated posts', () => {
  assert.equal(matchedKeyword('Nowy tusz do rzęs już w drogeriach!', KEYWORDS), null);
});

test('stripPageHeader removes the page-name header so brand keywords only match the body', () => {
  const scraped = 'Maybelline New York 3 dni · Nowy tusz do rzęs już w drogeriach!';
  assert.equal(stripPageHeader(scraped), 'Nowy tusz do rzęs już w drogeriach!');
  // without stripping, "maybelline" in the header would match every post
  assert.notEqual(matchedKeyword(scraped, KEYWORDS), null);
  assert.equal(matchedKeyword(stripPageHeader(scraped), KEYWORDS), null);
  // text without a header separator is left untouched
  assert.equal(stripPageHeader('Zwykły tekst bez separatora'), 'Zwykły tekst bez separatora');
});

test('broad brand and event keywords match in the post body', () => {
  assert.equal(matchedKeyword('Kupuj produkty Maybelline w promocji', KEYWORDS), 'maybelline');
  assert.equal(matchedKeyword('Zgarnij bilety na koncert!', KEYWORDS), 'koncert');
  // "wejściówek" (gen. pl.) inserts an "e" into the stem, hence 'wejściów'
  assert.equal(matchedKeyword('Wielkie rozdanie wejściówek', KEYWORDS), 'wejściów');
  assert.equal(matchedKeyword('Złap wejściówki dla siebie', KEYWORDS), 'wejściów');
  assert.equal(matchedKeyword('Nasza ambasadorka zdradza sekrety', KEYWORDS), 'ambasador');
});
