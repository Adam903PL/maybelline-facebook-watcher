import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// State shape on disk: { "seeded": boolean, "seen": string[] }
// "seeded" distinguishes a genuine first run (notify nothing, record all
// currently visible posts) from a normal run with an empty seen-set.
export async function loadState(file) {
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    return { seeded: data.seeded === true, seen: new Set(data.seen ?? []) };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { seeded: false, seen: new Set() };
    }
    throw err;
  }
}

export async function saveState(file, state) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const payload = JSON.stringify({ seeded: state.seeded, seen: [...state.seen] });
  await writeFile(tmp, payload, 'utf8');
  await rename(tmp, file);
}
