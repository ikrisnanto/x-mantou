/* Assembles src/dashboard/* into a single self-contained index.html.
 *
 * The output must stay a single file: Cloudflare Pages serves it directly, and
 * the published Artifact copy has to be self-contained (its CSP blocks external
 * scripts and stylesheets, so nothing can be split out).
 *
 * assumptions.js and dashboard.js are concatenated inside one IIFE, which is why
 * they are plain scripts rather than ES modules — no bundler needed, and the
 * consts in assumptions.js are simply in scope for dashboard.js.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src', 'dashboard');
const outDir = join(root, 'dist');

const read = (f) => readFileSync(join(src, f), 'utf8');

const styles = read('styles.css');
const body = read('body.html');
const assumptionsCard = read('assumptions-card.html');
const assumptions = read('assumptions.js');
const dashboard = read('dashboard.js');

// The public page and the admin page share everything except the assumptions
// editor, which is only ever emitted into the admin page. Cloudflare Access
// guards /admin, and the API verifies the Access session independently.
const page = (bodyHtml, title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${styles}</style>
</head>
<body>
${bodyHtml}
<script>
(function(){
"use strict";

${assumptions}
${dashboard}
})();
</script>
</body>
</html>
`;

const publicHtml = page(body, 'SpaceX Business Case — Interactive P&amp;L &amp; Balance Sheet');
const adminHtml = page(body + '\n' + assumptionsCard, 'Admin — SpaceX Business Case');

// index.html at the repo root is a BUILD OUTPUT — edit src/dashboard/* instead.
writeFileSync(join(root, 'index.html'), publicHtml);

mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'admin'), { recursive: true });
writeFileSync(join(outDir, 'index.html'), publicHtml);
writeFileSync(join(outDir, 'admin', 'index.html'), adminHtml);

// Static assets served as-is by Pages (_headers, favicon, …).
const pub = join(root, 'public');
for (const f of readdirSync(pub)) copyFileSync(join(pub, f), join(outDir, f));

console.log(`built dist/index.html        ${(publicHtml.length/1024).toFixed(1)} kB`);
console.log(`built dist/admin/index.html  ${(adminHtml.length/1024).toFixed(1)} kB`);
console.log(`  styles ${styles.split('\n').length} lines · assumptions ${assumptions.split('\n').length} · engine+ui ${dashboard.split('\n').length}`);
