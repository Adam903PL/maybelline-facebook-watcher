import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState, saveState } from '../src/state.js';

async function withTmpDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'watcher-state-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('loadState returns unseeded empty state when file is missing', async () => {
  await withTmpDir(async (dir) => {
    const state = await loadState(join(dir, 'state.json'));
    assert.equal(state.seeded, false);
    assert.equal(state.seen.size, 0);
  });
});

test('saveState/loadState round-trips the seen set and seeded flag', async () => {
  await withTmpDir(async (dir) => {
    const file = join(dir, 'state.json');
    const state = { seeded: true, seen: new Set(['a', 'b']) };
    await saveState(file, state);

    const loaded = await loadState(file);
    assert.equal(loaded.seeded, true);
    assert.deepEqual([...loaded.seen].sort(), ['a', 'b']);
    assert.equal(loaded.seen.has('c'), false);
  });
});

test('saveState creates missing parent directories', async () => {
  await withTmpDir(async (dir) => {
    const file = join(dir, 'nested', 'deeper', 'state.json');
    await saveState(file, { seeded: false, seen: new Set(['x']) });
    const loaded = await loadState(file);
    assert.deepEqual([...loaded.seen], ['x']);
  });
});

test('loadState throws on corrupt JSON instead of silently resetting', async () => {
  await withTmpDir(async (dir) => {
    const file = join(dir, 'state.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, '{not json', 'utf8');
    await assert.rejects(loadState(file), SyntaxError);
  });
});
