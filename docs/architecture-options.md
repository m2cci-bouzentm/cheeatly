# Cheatly architecture

Implemented: a modular monolith organized by feature, in one Rust package.
React renders UI and invokes commands. Rust services own application workflows.
Tauri connects those services to the desktop. Native capture remains in Rust;
the Swift sidecar performs speech inference on supplied audio.

```text
src/                           React UI + typed desktop bridge
src-tauri/src/
  meetings/
    commands.rs                Tauri arguments and response mapping
    service.rs                 Start, drain, save, discard, summary dispatch
    models.rs                  Transcript and saved-meeting response mapping
    summary.rs                 Summary jobs and stale-result protection
  assistant/
    commands.rs                Chat and question-state IPC adapters
    service.rs                 Context composition and model orchestration
    questions.rs               Scan scheduling, pause, dedup, cancellation
    intelligence.rs            Chat request state and cancellation
    openrouter.rs              Provider integration
  transcription/
    commands.rs                Device/configuration desktop adapters
    service.rs                 Capture boundary
    session.rs                 Capture worker, audio forwarding and drain
    local_coreml.rs             Swift process protocol
    paths.rs                   Desktop resource lookup
  context/, skills/            Commands plus import/validation services
  database/, settings/         SQLite, settings files, Keychain
  events.rs                    Application notifications
  desktop_events.rs            Tauri event names and serialization
  state.rs, startup.rs         Dependency construction and desktop startup
  windows.rs, permissions.rs,
  shortcuts.rs, screenshots.rs Desktop/OS integration
crates/cheatly-audio/           Microphone/system capture and audio processing
local-stt-engine/              Swift / Core ML inference
```

## Ownership and dependencies

- `MeetingService` exclusively owns the current transcript, partial speech,
  session generation and lifecycle lock. Capture reports transcript events through
  a callback; it cannot edit meeting state. Stop drains final speech before saving.
  A database failure retains the unsaved transcript for retry. Discard saves no row.
- `QuestionService` reads meeting snapshots and owns its timer, suggestions,
  pause state, deduplication and request cancellation. Automatic scans run only
  during an active meeting when enabled and unpaused. Manual scans remain available
  while automatic scanning is paused. Meeting/reset/pause/config changes invalidate
  pending responses. Failed scans remain retryable.
- The overlay subscribes to question state and fetches a snapshot on mount. A
  monotonically increasing revision prevents older IPC responses replacing newer
  events. Unmounting the overlay does not stop recording or question scanning.
- `AssistantService` composes context and orchestrates the provider. Summary jobs
  retain their existing generation checks. Neither requires `AppHandle`.
- Services receive concrete database/settings/credential dependencies. `Capture`
  has native and test implementations. `EventSink` carries application events;
  `desktop_events` maps them to the existing frontend protocol. UI notification
  failures are logged and do not turn successful persistence into a failed save.
- Simple settings/CRUD commands can call their stores directly. File picking,
  window management and permissions stay at the desktop boundary. Document and
  skill import work runs off the async executor's worker threads.

This is a source-module boundary, not an independently compiled core crate.
A source guard rejects Tauri/AppState dependencies in application services and the
capture worker. No new framework, HTTP server, generic repository layer, or crate
was introduced. Extract a core crate if a second host or stronger compile-time
isolation becomes necessary.

## Regression strategy

The pre-refactor baseline was 103 checks: 39 Node, 52 Rust and 12 browser tests.
`npm test` uses the existing runners and no new dependencies.

- Node exercises actual Tauri invocation names/arguments, error propagation,
  listener cleanup/readiness and queued chat cancellation, plus module boundaries.
- Rust service tests use real temporary SQLite/settings files and controlled
  capture/credentials. They exercise startup failure, final drain, duplicate stop,
  save retry, discard, stale callbacks, transcript windows/partials, scan intervals,
  retries, pause/cancellation, generation reset, and a running background scanner
  with no frontend listener.
- Playwright exercises the actual React UI with a controlled desktop bridge:
  attached selectors, stop/discard waiting and failure/retry, question-state
  rendering, pause commands, stale revisions and remount hydration. Scan algorithm
  tests moved into Rust with the algorithm; the browser fixture does not reimplement it.
- `tests/stt/parakeet.e2e.test.mjs` exercises the real Swift/Core ML process.
- [Native acceptance](../tests/native/README.md) records real desktop clicks and
  capture/provider/save checks. Headless tests cannot establish macOS permissions,
  window drag, content protection, or the installed bundle's behavior.

Run: `npm test`, `npm run build:frontend`, and
`cargo clippy --workspace --all-targets -- -D warnings`.
