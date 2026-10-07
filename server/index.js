'use strict';
// Uruchomienie: npm start (tylko ten komputer) lub npm run start:siec (telefony w sieci firmowej).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('./db');
const { ensureReference } = require('./reference');
const { createApp } = require('./app');
const { recomputeAlerts } = require('./domain/exits');

const ROOT = path.join(__dirname, '..');
const DB_FILE = process.env.CNC_DB || path.join(ROOT, 'data', 'cnc-team.db');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
// Certyfikat HTTPS: CNC_TLS_CERT / CNC_TLS_KEY albo pliki data/tls/cert.pem i data/tls/key.pem, jeśli istnieją.
const CERT = process.env.CNC_TLS_CERT || path.join(ROOT, 'data', 'tls', 'cert.pem');
const KEY = process.env.CNC_TLS_KEY || path.join(ROOT, 'data', 'tls', 'key.pem');

function boot(dbFile = DB_FILE) {
  const db = openDb(dbFile);
  ensureReference(db);
  // Zaległe alerty sprawdzane przy każdym starcie aplikacji.
  const created = recomputeAlerts(db);
  return { db, created };
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
}

function loadTls() {
  if (process.env.CNC_HTTPS === '0') return null;
  if (fs.existsSync(CERT) && fs.existsSync(KEY)) return { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) };
  if (process.env.CNC_TLS_CERT || process.env.CNC_TLS_KEY) throw new Error(`Nie znaleziono certyfikatu: ${CERT} / ${KEY}`);
  return null;
}

function main() {
  const { db, created } = boot();
  const users = db.get('SELECT COUNT(*) n FROM users').n;
  const tls = loadTls();
  const scheme = tls ? 'https' : 'http';
  // Za firmowym reverse proxy (HTTPS w internecie): CNC_TRUST_PROXY=1. Cookie Secure wymuszone: CNC_SECURE_COOKIE=1.
  // CNC_PROXY_IPS: adresy reverse proxy (po przecinku), gdy proxy jest na innym serwerze.
  const server = createApp(db, { tls, trustProxy: process.env.CNC_TRUST_PROXY === '1', proxyIps: String(process.env.CNC_PROXY_IPS || '').split(',').filter(Boolean),
    secure: process.env.CNC_SECURE_COOKIE === '1' });
  // Serwer działa całą dobę — alerty zależne od daty (koniec miesiąca) przeliczane co godzinę.
  setInterval(() => { try { recomputeAlerts(db); } catch (e) { console.log(`Alerty: ${e.message}`); } }, 3600e3).unref();
  server.listen(PORT, HOST, () => {
    console.log(`CNC Team: ${scheme}://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (baza: ${DB_FILE})`);
    if (HOST === '0.0.0.0') {
      const ips = lanAddresses();
      console.log('Adresy dla telefonów w tej samej sieci:');
      for (const ip of ips) console.log(`  ${scheme}://${ip}:${PORT}`);
      if (!tls) console.log('Uwaga: połączenie bez szyfrowania (http). Telefon utworzy skrót do przeglądarki; pełna aplikacja wymaga https — patrz docs/MOBILE.md.');
    }
    if (created.length) console.log(`Nowe alerty po starcie: ${created.length}`);
    if (!users) console.log('Brak kont. Uruchom: npm run init-admin  (lub npm run seed dla danych demonstracyjnych)');
  });
}

if (require.main === module) main();

module.exports = { boot, lanAddresses, main };
