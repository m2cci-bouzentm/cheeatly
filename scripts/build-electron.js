#!/usr/bin/env node
/**
 * Fast main build using esbuild (transpile-only, no type checking).
 * ~10-50x faster than `tsc` for dev builds.
 * Run `npm run typecheck:main` separately for type safety.
 */

const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'dist-main');

const entryPoints = [];

// Function to recursively find all .ts files in a directory
const findTs = (dir) => {
  const results = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) results.push(...findTs(full));
    const isSourceTs = f.name.endsWith('.ts') && !f.name.endsWith('.d.ts');
    if (!f.isDirectory() && isSourceTs) results.push(full);
  }
  return results;
};

const mainDir = path.resolve(rootDir, 'main');
if (fs.existsSync(mainDir)) {
  entryPoints.push(...findTs(mainDir).map((f) => path.relative(rootDir, f)));
}

// Also include premium main files if they exist
const premiumDir = path.resolve(rootDir, 'premium/main');
if (fs.existsSync(premiumDir)) {
  entryPoints.push(...findTs(premiumDir).map((f) => path.relative(rootDir, f)));
}

const start = Date.now();

build({
  entryPoints,
  bundle: true, // resolve all static + dynamic imports so postProcessor
  // is inlined and the path rewrite works (vs bundle:false
  // which copies files as-is and leaves unresolved relative paths)
  outdir: outDir,
  outbase: rootDir, // preserve directory structure (main/main.ts → dist-main/main/main.js)
  platform: 'node',
  target: 'node20',
  format: 'cjs', // Electron loads package.json main as CommonJS in this repo
  // (package.json has no "type": "module").
  external: [
    'electron',
    'better-sqlite3',
    '@prisma/client',
    '.prisma/client',
    '@opendocsg/pdf2md',
    'mammoth',
  ],
  sourcemap: true,
  jsx: 'automatic',
  loader: {
    '.ts': 'ts',
    '.js': 'js',
  },
  logLevel: 'warning',
})
  .then(() => {
    console.log(`[build-main] Done in ${Date.now() - start}ms`);
  })
  .catch((err) => {
    console.error('[build-main] Build failed:', err.message);
    process.exit(1);
  });
