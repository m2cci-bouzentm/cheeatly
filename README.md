# Cheatly

AI meeting assistant. Live transcription, real-time suggestions, and auto-generated meeting notes.

> **Validated on macOS Apple Silicon.** Rust captures microphone and system audio; the Swift/Core ML sidecar transcribes it locally with Parakeet. Windows/Linux acceptance is not complete.

## Prerequisites

- **macOS 14+** (validated on Apple Silicon)
- **Node.js** 18+
- **Rust** (for Tauri and native audio) — install via [rustup](https://rustup.rs)
- **Swift 6.0+** (ships with Xcode 16+)

## Dev Setup

```bash
# install frontend dependencies
npm install

# copy env file
cp .env.example .env

# build the Swift sidecar and start Tauri + Vite
npm start
```

This launches Vite on port 5180 and opens the Tauri app. Configure your provider key in Settings and grant microphone and Screen Recording access when requested.

## Build (macOS .dmg)

```bash
npm run tauri:build
```

Output lands in `target/release/bundle/`. Builds for the current Mac architecture; the default signature is ad hoc.

For a signed build:

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)" npm run tauri:build
```

## Tests

```bash
npm run test:unit  # frontend checks
npm run test:rust  # Rust workspace tests
npm run test:e2e   # Playwright checks
npm run test:stt   # real Swift/Core ML transcription tests
```

See [native acceptance results](tests/native/README.md) for real macOS checks and remaining limits.

## License

[MIT](LICENSE)
