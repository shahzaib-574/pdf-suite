import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createPublicKey, createHash, sign, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import JSZip from 'jszip';
const prefix = process.argv[2];
if (!['preview', 'production'].includes(prefix)) throw new Error('Choose preview or production explicitly.');
const { repository } = JSON.parse(readFileSync('ota.config.json', 'utf8'));
if (!/^[\w-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid update repository.');
const privateKey = readFileSync('.ota-private/signing.pem');
const publicKey = readFileSync('ota-public.pem', 'utf8');
if (createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }) !== publicKey) throw new Error('OTA signing keys do not match.');
const version = readFileSync('android/variables.gradle', 'utf8').match(/appVersionCode\s*=\s*(\d+)/)?.[1];
if (!version) throw new Error('Missing native version.');
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}
if (!process.env.npm_execpath) throw new Error('Run through npm run ota:push:preview or ota:push:production.');
for (const script of ['lint', 'quality-selfcheck', 'build']) run(process.execPath, [process.env.npm_execpath, 'run', script]);
const metadata = JSON.parse(readFileSync('dist/release-metadata.json', 'utf8'));
if (metadata.mode !== 'production' || metadata.advertising !== false) throw new Error('Expected ad-free production assets.');
const zip = new JSZip();
function add(dir, relative = '') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = relative + entry.name;
    if (entry.isDirectory()) add(path.join(dir, entry.name), name + '/');
    else {
      if (/\.(?:map|pem|jks|keystore)$/.test(name)) throw new Error('Unexpected sensitive/debug artifact: ' + name);
      zip.file(name, readFileSync(path.join(dir, entry.name)));
    }
  }
}
add('dist');
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
const sequence = Date.now();
const channel = `${prefix}-${version}`;
const bundleId = `ream-${channel}-${sequence}`;
const signature = sign('RSA-SHA256', bytes, privateKey).toString('base64');
if (!verify('RSA-SHA256', bytes, publicKey, Buffer.from(signature, 'base64'))) throw new Error('Bundle verification failed.');
const payload = JSON.stringify({ schema: 1, bundleId, channel, nativeVersion: version, sequence,
  url: `https://github.com/${repository}/releases/download/${bundleId}/bundle.zip`,
  checksum: createHash('sha256').update(bytes).digest('hex'), signature });
const dir = path.resolve('tmp/ota', bundleId);
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'bundle.zip'), bytes);
writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ payload, signature: sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64') }) + '\n');
writeFileSync(path.join(dir, 'notes.md'), `Signed Ream web update for Android native version ${version}, channel ${channel}.\n`);
if (process.argv.includes('--prepare-only')) { console.log(`OTA prepared: ${dir}`); process.exit(0); }
run('gh', ['release', 'create', bundleId, path.join(dir, 'bundle.zip'), '--repo', repository, '--title', bundleId, '--notes-file', path.join(dir, 'notes.md'), '--latest=false']);
const existing = spawnSync('gh', ['release', 'view', channel, '--repo', repository], { stdio: 'ignore' });
if (existing.status !== 0) run('gh', ['release', 'create', channel, '--repo', repository, '--title', `${channel} update channel`, '--notes-file', path.join(dir, 'notes.md'), '--latest=false']);
run('gh', ['release', 'upload', channel, path.join(dir, 'latest.json'), '--repo', repository, '--clobber']);
console.log(`Published ${bundleId}. Devices download automatically and activate on the next launch.`);
