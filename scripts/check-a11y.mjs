#!/usr/bin/env node
/**
 * Accessibility check: runs axe-core against every page in the sitemap at a
 * 375px-wide mobile viewport.
 *
 * Starts `astro preview` itself, so it is NOT part of `npm run build`.
 * Usage: npm run check:a11y
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const DIST = path.resolve('dist');
const SITEMAP = path.join(DIST, 'sitemap-0.xml');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];
const PORT = 4321;
const BASE = `http://localhost:${PORT}`;

if (!existsSync(SITEMAP)) {
  console.error('check-a11y: missing dist/sitemap-0.xml — run `npm run build` first.');
  process.exit(1);
}

const xml = await readFile(SITEMAP, 'utf8');
const paths = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

console.log(`check-a11y: ${paths.length} page(s), tags: ${TAGS.join(', ')}, viewport 375px\n`);

const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

const shutdown = () => {
  if (!server.killed) server.kill();
};
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(130); });

/** Poll until the preview server answers. */
async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`preview server did not start on ${BASE}`);
}

let exitCode = 0;

try {
  await waitForServer();

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();

  const totals = new Map();
  let grandTotal = 0;

  for (const p of paths) {
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    if (violations.length === 0) {
      console.log(`OK    ${p}`);
      continue;
    }

    console.log(`FAIL  ${p}`);
    for (const v of violations) {
      console.log(`        ${v.id} (${v.impact}) x${v.nodes.length} — ${v.help}`);
      for (const node of v.nodes.slice(0, 5)) {
        console.log(`          ${node.target.join(' ')}`);
        const summary = (node.failureSummary || '').split('\n').map((s) => s.trim()).filter(Boolean);
        if (summary.length > 1) console.log(`            ${summary.slice(1).join(' | ')}`);
      }
      if (v.nodes.length > 5) console.log(`          ...and ${v.nodes.length - 5} more`);

      totals.set(v.id, (totals.get(v.id) || 0) + v.nodes.length);
      grandTotal += v.nodes.length;
    }
  }

  await browser.close();

  console.log('\n=== violations by rule (nodes) ===');
  if (totals.size === 0) {
    console.log('none');
  } else {
    for (const [id, n] of [...totals].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${id}`);
    exitCode = 1;
  }
  console.log(`total: ${grandTotal}`);
} catch (err) {
  console.error(`check-a11y: ${err.message}`);
  exitCode = 1;
} finally {
  shutdown();
}

process.exit(exitCode);
