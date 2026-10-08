const { execFileSync } = require('node:child_process');
const { copyFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const engine = path.join(root, 'local-stt-engine');
const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE;

if (process.platform !== 'darwin') {
  console.log('Local Parakeet sidecar is macOS-only; skipping Swift build.');
  process.exit(0);
}

const triple =
  targetTriple ||
  `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`;
const outputDirectory = path.join(root, 'src-tauri', 'binaries');
const output = path.join(outputDirectory, `speech-to-text-${triple}`);

execFileSync('swift', ['build', '-c', 'release'], {
  cwd: engine,
  stdio: 'inherit',
});
mkdirSync(outputDirectory, { recursive: true });
copyFileSync(path.join(engine, '.build', 'release', 'speech-to-text'), output);
console.log(`Prepared ${output}`);
