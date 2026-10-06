'use strict';
// Buduje aplikację pracownika do folderu dist-mobile/ (strona na GitHub Pages i zawartość APK).
// Użycie: node scripts/build-mobile.js [katalog]   (BUILD_ID — oznaczenie wersji, domyślnie data i godzina)
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist-mobile'));
const build = process.env.BUILD_ID || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'mobile'))) fs.copyFileSync(path.join(ROOT, 'mobile', f), path.join(out, f));
fs.copyFileSync(path.join(ROOT, 'public', 'tokens.css'), path.join(out, 'tokens.css'));
fs.copyFileSync(path.join(ROOT, 'public', 'icons.js'), path.join(out, 'icons.js'));
for (const f of fs.readdirSync(path.join(ROOT, 'public', 'icons'))) fs.copyFileSync(path.join(ROOT, 'public', 'icons', f), path.join(out, 'icons', f));
const sub = (file, a, b) => { const p = path.join(out, file); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split(a).join(b)); };
sub('sw.js', '__BUILD__', build);
sub('config.js', "version: 'dev'", `version: '${build}'`);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Aplikacja pracownika (${build}) → ${out}`);
