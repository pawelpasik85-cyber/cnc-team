'use strict';
// Tworzy lokalny urząd certyfikacji (CA) i certyfikat HTTPS dla komputera z aplikacją — do użytku w sieci firmowej,
// aby telefony mogły zainstalować CNC Team jako pełną aplikację (PWA). Wymaga programu openssl
// (w Windows dostępny np. z Git for Windows: C:\Program Files\Git\usr\bin\openssl.exe — dodaj do PATH lub ustaw OPENSSL).
// Użycie: npm run make-cert -- [dodatkowa-nazwa-lub-IP ...]
// Wynik: data/tls/cert.pem, key.pem (serwer), cnc-team-ca.crt (do zainstalowania na telefonach), ca.key (chroń!).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { lanAddresses } = require('../server/index');

const OPENSSL = process.env.OPENSSL || 'openssl';
const dir = path.join(__dirname, '..', 'data', 'tls');
fs.mkdirSync(dir, { recursive: true });
const f = (n) => path.join(dir, n);
const run = (args) => execFileSync(OPENSSL, args, { stdio: ['ignore', 'ignore', 'inherit'] });

try { execFileSync(OPENSSL, ['version'], { stdio: 'ignore' }); } catch {
  console.error('Nie znaleziono openssl. Zainstaluj Git for Windows lub ustaw zmienną OPENSSL na ścieżkę do openssl.exe.');
  process.exit(1);
}

const names = ['localhost', os.hostname(), ...process.argv.slice(2)];
const ips = ['127.0.0.1', ...lanAddresses(), ...process.argv.slice(2).filter(x => /^\d+\.\d+\.\d+\.\d+$/.test(x))];
const san = [...new Set(names.filter(n => !/^\d+\.\d+\.\d+\.\d+$/.test(n)))].map(n => `DNS:${n}`)
  .concat([...new Set(ips)].map(ip => `IP:${ip}`)).join(',');

if (!fs.existsSync(f('ca.key'))) {
  run(['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-keyout', f('ca.key'), '-out', f('cnc-team-ca.crt'), '-days', '3650',
    '-subj', '/CN=CNC Team - lokalny CA/O=CNC Team', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
  console.log('Utworzono lokalny CA: data/tls/cnc-team-ca.crt (zainstaluj na telefonach), data/tls/ca.key (NIE udostępniaj).');
} else console.log('Używam istniejącego CA z data/tls.');

const ext = f('server.ext');
fs.writeFileSync(ext, `basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`);
run(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('key.pem'), '-out', f('server.csr'), '-subj', `/CN=${os.hostname()}`]);
// 397 dni — limit akceptowany przez iOS/Android dla certyfikatów serwera
run(['x509', '-req', '-in', f('server.csr'), '-CA', f('cnc-team-ca.crt'), '-CAkey', f('ca.key'), '-CAcreateserial', '-out', f('cert.pem'), '-days', '397', '-sha256', '-extfile', ext]);
fs.unlinkSync(f('server.csr')); fs.unlinkSync(ext);
console.log(`Certyfikat serwera: data/tls/cert.pem (ważny 397 dni) dla: ${san}`);
console.log('Uruchom: npm run start:siec  → aplikacja pod adresem https://<adres-komputera>:3000');
