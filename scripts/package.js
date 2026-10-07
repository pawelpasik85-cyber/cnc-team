'use strict';
// Paczka instalacyjna dla IT: dist/cnc-team-serwer.zip (+ suma SHA-256).
// Zawiera tylko to, co potrzebne na serwerze firmowym: aplikację, skrypty, konfigurację wdrożenia, dokumentację i testy.
// Bez narzędzi deweloperskich (.github, recenzja), zrzutów ekranu i plików z danymi. Bez zależności — własny zapis ZIP (deflate).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'cnc-team-serwer.zip');
const TOP = 'cnc-team';
const INCLUDE = ['server', 'public', 'deploy', 'docs', 'test', 'scripts', 'package.json', 'README.md', 'TESTOWANIE.md', 'TEST-START.cmd', 'TEST-RESET.cmd', 'DEPENDENCIES.md', 'INTEGRATIONS.md'];
const EXCLUDE = [/^docs\/screenshots\//, /^scripts\/.*\.py$/, /(^|\/)\.DS_Store$/, /^data\//];

function walk(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [rel];
  return fs.readdirSync(abs).sort().flatMap(n => walk(path.posix.join(rel, n)));
}

function dosTime(d) {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

function buildZip(files) {
  const parts = []; const central = []; let offset = 0;
  const { time, date } = dosTime(new Date());
  for (const rel of files) {
    const data = fs.readFileSync(path.join(ROOT, rel));
    const name = Buffer.from(`${TOP}/${rel}`, 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const files = INCLUDE.flatMap(walk).filter(f => !EXCLUDE.some(re => re.test(f)));
const zip = buildZip(files);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, zip);
const sha = crypto.createHash('sha256').update(zip).digest('hex');
fs.writeFileSync(`${OUT}.sha256`, `${sha}  cnc-team-serwer.zip\n`);
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
console.log(`Paczka: ${OUT} (wersja ${version}, plików: ${files.length}, ${(zip.length / 1024).toFixed(0)} KB)\nSHA-256: ${sha}`);
