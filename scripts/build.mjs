// Builds the Chrome extension into ./dist (the folder you load with "Load unpacked").
//  1. Bundles the JavaScript (pdf-lib and the Anthropic SDK are bundled in; no CDN at runtime).
//  2. Copies manifest, HTML, CSS and icons.
//  3. Downloads each blank form PDF from its official government URL (cached in .cache/forms).
import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMS } from '../src/forms/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const cache = path.join(root, '.cache', 'forms');

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'forms'), { recursive: true });
await mkdir(cache, { recursive: true });

// 1. JavaScript
const common = { bundle: true, target: 'chrome115', legalComments: 'none', logLevel: 'warning', minify: false };
await build({ ...common, entryPoints: ['app.js', 'options.js', 'background.js'].map(f => path.join(src, f)), outdir: dist, format: 'esm', splitting: false });
await build({ ...common, entryPoints: [path.join(src, 'content.js')], outdir: dist, format: 'iife' });

// 2. Static files
for (const f of ['manifest.json', 'app.html', 'options.html', 'app.css', 'content.css']) await cp(path.join(src, f), path.join(dist, f));
await cp(path.join(src, 'icons'), path.join(dist, 'icons'), { recursive: true });

// 3. Blank forms
for (const form of FORMS) {
  const cached = path.join(cache, form.templateFile);
  const exists = await access(cached).then(() => true, () => false);
  if (!exists) {
    process.stdout.write(`Downloading ${form.templateFile} from ${new URL(form.sourceUrl).host} … `);
    const res = await fetch(form.sourceUrl, { headers: { 'user-agent': 'Mozilla/5.0 doc-form-filler build' } });
    if (!res.ok) throw new Error(`Download failed (${res.status}) for ${form.sourceUrl}. Download it manually into .cache/forms/${form.templateFile}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 4).toString() !== '%PDF') throw new Error(`${form.sourceUrl} did not return a PDF. Save the PDF manually as .cache/forms/${form.templateFile}`);
    await writeFile(cached, buf);
    console.log('ok');
  }
  await cp(cached, path.join(dist, 'forms', form.templateFile));
}

const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
console.log(`\nBuilt ${manifest.name} ${manifest.version} → ${dist}`);
console.log('Load it in Chrome: chrome://extensions → turn on Developer mode → Load unpacked → choose the dist folder.');
