// Metadata only: screenshots/traces remain in the CI artifact, not in Git.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else files.push(file);
  }
}
await walk('test-results');
const screenshots = [];
const events = [];
for (const file of files) {
  if (file.endsWith('.png')) {
    screenshots.push({ path: file, bytes: (await stat(file)).size,
      sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
  }
  if (file.includes('browser-events') && file.endsWith('.json')) {
    const content = JSON.parse(await readFile(file, 'utf8'));
    events.push({ path: file, events: content });
  }
}
const summary = {
  head: process.env.BROWSER_HEAD_SHA,
  command: 'npm run test:e2e', exit_code: process.env.BROWSER_EXIT_CODE ?? 'UNEXECUTED',
  screenshots, events,
};
await writeFile('browser-evidence.json', JSON.stringify(summary, null, 2));
console.log(`::notice title=browser-evidence::head=${summary.head} exit_code=${summary.exit_code} screenshots=${screenshots.length} diagnostic_files=${events.length}; full data in browser-evidence.json artifact`);
