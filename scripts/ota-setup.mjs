import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';

const repository = process.argv[2];
if (!/^[\w-]+\/[\w.-]+$/.test(repository ?? '')) {
  throw new Error('Usage: npm run ota:setup -- owner/public-update-repository');
}
const privatePath = '.ota-private/signing.pem';
const publicPath = 'ota-public.pem';
if (existsSync(privatePath) !== existsSync(publicPath)) {
  throw new Error('Signing key pair is incomplete. Restore the existing key; do not replace it for installed apps.');
}
if (!existsSync(privatePath)) {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  mkdirSync('.ota-private', { recursive: true });
  writeFileSync(privatePath, keys.privateKey, { mode: 0o600, flag: 'wx' });
  writeFileSync(publicPath, keys.publicKey, { flag: 'wx' });
}
const derived = createPublicKey(readFileSync(privatePath)).export({ type: 'spki', format: 'pem' });
if (derived !== readFileSync(publicPath, 'utf8')) throw new Error('OTA signing keys do not match.');
writeFileSync('ota.config.json', JSON.stringify({ repository }, null, 2) + '\n');
console.log('OTA configured. Back up .ota-private/signing.pem securely; it is excluded from Git and EAS uploads. Build and install the new APK once.');
