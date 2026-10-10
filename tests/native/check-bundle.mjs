import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';

const bundle = process.argv[2] ?? '/Applications/Cheatly.app';
execFileSync('codesign', ['--verify', '--deep', '--strict', bundle]);
const signature = spawnSync('codesign', ['-d', '--verbose=4', bundle], {
  encoding: 'utf8',
});
assert.equal(signature.status, 0, signature.stderr);
assert.match(signature.stderr, /^Identifier=com\.cheatly\.assistant$/m);
assert.match(signature.stderr, /^Sealed Resources version=/m);
assert.doesNotMatch(signature.stderr, /linker-signed|Info\.plist=not bound/);
const entitlements = execFileSync('codesign', [
  '-d',
  '--entitlements',
  '-',
  '--xml',
  bundle,
]);
const microphone = execFileSync(
  'plutil',
  [
    '-extract',
    'com\\.apple\\.security\\.device\\.audio-input',
    'raw',
    '-o',
    '-',
    '-',
  ],
  { input: entitlements, encoding: 'utf8' }
);
assert.equal(microphone.trim(), 'true');
console.log(`Bundle signing and microphone entitlement verified: ${bundle}`);
