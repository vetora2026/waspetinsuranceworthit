#!/usr/bin/env node
/**
 * Canonical / sitemap consistency check.
 *
 * For every dist/**\/index.html:
 *   - exactly one <link rel="canonical">
 *   - the href is absolute https://waspetinsuranceworthit.com/... with a trailing slash
 *   - the href equals that page's own URL
 *   - the href appears byte-for-byte as a <loc> in dist/sitemap-0.xml
 *
 * Pages marked noindex must NOT appear in the sitemap.
 * Every <loc> in the sitemap must have a built page.
 *
 * Exits non-zero on any failure. Runs as a postbuild hook.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://waspetinsuranceworthit.com';
const DIST = path.resolve('dist');
const SITEMAP = path.join(DIST, 'sitemap-0.xml');

const failures = [];
const fail = (page, msg) => failures.push(`${page}: ${msg}`);

if (!existsSync(SITEMAP)) {
  console.error(`check-canonical: missing ${path.relative(process.cwd(), SITEMAP)} — run \`npm run build\` first.`);
  process.exit(1);
}

const xml = await readFile(SITEMAP, 'utf8');
const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
const locSet = new Set(locs);

if (locs.length === 0) {
  console.error('check-canonical: no <loc> entries found in the sitemap.');
  process.exit(1);
}

const dupLocs = locs.filter((l, i) => locs.indexOf(l) !== i);
for (const l of new Set(dupLocs)) fail('sitemap', `duplicate <loc> ${l}`);

/** Collect dist/**\/index.html as dist-relative posix paths, sorted for stable output. */
async function findIndexHtml(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await findIndexHtml(path.join(dir, entry.name), rel)));
    else if (entry.name === 'index.html') out.push(rel);
  }
  return out;
}

const files = (await findIndexHtml(DIST)).sort();

if (files.length === 0) {
  console.error('check-canonical: no index.html files found under dist/.');
  process.exit(1);
}

/** dist-relative "about/index.html" -> "https://origin/about/" */
function urlForFile(rel) {
  const dir = path.posix.dirname(rel);
  return dir === '.' ? `${ORIGIN}/` : `${ORIGIN}/${dir}/`;
}

const seenInSitemap = new Set();
const rows = [];

for (const rel of files) {
  const page = rel;
  const expected = urlForFile(rel);
  const html = await readFile(path.join(DIST, rel), 'utf8');

  const canonicals = [...html.matchAll(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi)];
  const noindex = /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*noindex/i.test(html);

  if (canonicals.length !== 1) {
    fail(page, `expected exactly 1 canonical link, found ${canonicals.length}`);
    rows.push([page, `(${canonicals.length} canonicals)`, 'FAIL']);
    continue;
  }

  const hrefMatch = canonicals[0][0].match(/\bhref=["']([^"']*)["']/i);
  const href = hrefMatch ? hrefMatch[1] : '';

  const pageFailures = [];
  if (!href.startsWith(`${ORIGIN}/`)) pageFailures.push(`not absolute under ${ORIGIN}`);
  if (!href.endsWith('/')) pageFailures.push('missing trailing slash');
  if (href !== expected) pageFailures.push(`does not match page URL ${expected}`);

  if (noindex) {
    if (locSet.has(href)) pageFailures.push('noindex page is present in the sitemap');
  } else if (!locSet.has(href)) {
    pageFailures.push('canonical is not a <loc> in sitemap-0.xml');
  } else {
    seenInSitemap.add(href);
  }

  for (const msg of pageFailures) fail(page, msg);
  rows.push([page, href, pageFailures.length ? 'FAIL' : noindex ? 'OK (noindex)' : 'OK']);
}

for (const loc of locSet) {
  if (!seenInSitemap.has(loc)) fail('sitemap', `<loc> ${loc} has no matching built page with that canonical`);
}

const width = Math.max(...rows.map((r) => r[0].length));
for (const [page, href, result] of rows) {
  console.log(`${result.padEnd(12)} ${page.padEnd(width)}  ${href}`);
}

console.log('');
if (failures.length) {
  console.error(`check-canonical: ${failures.length} failure(s) across ${files.length} page(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`check-canonical: ${files.length} page(s), ${locs.length} sitemap URL(s), 0 failures.`);
