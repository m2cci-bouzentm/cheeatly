# Cheatly

AI meeting assistant. Live transcription, real-time suggestions, and auto-generated meeting notes.

> **macOS only.** The local speech-to-text engine (Parakeet) is built with Swift and uses macOS-native audio APIs. No Windows/Linux support.

## Prerequisites

- **macOS** (Apple Silicon or Intel)
- **Node.js** 18+
- **Rust** (for the native platform bridge) — install via [rustup](https://rustup.rs)
- **Swift 6.0+** (ships with Xcode 16+)

## Dev Setup

```bash
# install dependencies + build native modules
npm install

# copy env file
cp .env.example .env

# start dev (Vite + Electron)
npm start
```

This launches Vite on port 5180 and opens the Electron app pointing at it.

## Build (macOS .dmg)

```bash
npm run app:build
```

Output lands in `release/`. Builds native modules for both x64 and arm64.

For a signed build:

```bash
npm run app:build:signed
```

## Tests

```bash
npm test           # unit tests
npm run test:e2e   # playwright e2e
```

## License

[MIT](LICENSE)
