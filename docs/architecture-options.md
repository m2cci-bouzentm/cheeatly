# Refactor baseline and architecture options

Status: proposed; no architecture refactor implemented.

## Behavior baseline

The application behavior is unchanged. New checks exercise production functions,
React components, and hooks; external OS/provider boundaries are controlled.
They add no dependencies and use the existing Rust, Node, and Playwright runners.

| Suite | Before | Now | New coverage |
| --- | ---: | ---: | --- |
| Node/frontend | 35 | 39 | Actual Tauri bridge command names/arguments, response/error propagation, event cleanup, listener readiness, queued/active chat cancellation |
| Rust workspace | 39 | 52 | Settings reopen/write failure/corruption; SQLite meeting edits/deletion, context files, skill seeding/protection; assistant request ordering/cancellation; summary job isolation; saved-meeting response contract |
| Browser | 3 | 12 | Embedded selectors; stop/discard wait, duplicate prevention, failure and retry; empty/partial/manual scans, deduplication, stale responses after pause, automatic timing/window/pause |

The existing Settings smoke test now waits for first-run permissions to appear
and dismiss, and asserts both opening and closing Settings instead of silently
skipping missing controls.

Run the repeatable baseline with `npm test`. Browser tests are headless; they do
not move the user's workspaces or use their saved app data, audio, or API key.
Use a free port 5180: the existing Playwright config can reuse a running server,
which must have been started with `VITE_E2E=true`.

Two deliberate, temporary regressions were checked: routing Stop to Discard must
fail the bridge contract, and swallowing a save error must fail the browser retry
test. Both mutations are restored before the final baseline run.

### What this does not prove

The browser suite mocks the desktop boundary. Its successful Stop/Discard tests
verify UI orchestration, not actual capture shutdown or database writes. Separate
Rust tests use real temporary SQLite files, but do not execute the complete Tauri
meeting command lifecycle. The current concrete AppHandle dependency makes that
path harder to run without the native runtime.

The existing [native acceptance record](../tests/native/README.md) covers the
installed Mac recording/scan/save/discard path. Repeat that after refactoring,
on workspace **10**. OS permissions, Keychain, capture, global hotkeys, window drag,
and content protection cannot be established by headless Chromium tests.
Real Swift/Core ML tests were previously 10 passed / 1 skip; they were not rerun
for these test-only additions. Source-pattern tests already in the repository are
supplemental checks and may need adjustment when files move.

## Options

All three retain React, the Rust audio crate, and the Swift transcription sidecar.
None requires a new backend process or an HTTP server. Tauri commands remain the
frontend boundary; services own workflows. These are project design options,
not a mandatory layout prescribed by Tauri.

### 1. Layers within the existing Rust package — recommended

Closest to connectAI's controllers/services/integrations separation:

```text
src/                         React UI and desktop bridge
src-tauri/src/
  commands/                  Tauri arguments, responses, event forwarding
  services/                  Meeting, assistant, question detection, summaries
  models/                    Shared application data and typed errors
  integrations/              SQLite, OpenRouter, credentials, Swift process
  platform/                  Permissions, windows, shortcuts, screenshots
  startup.rs                 Construct dependencies and register services
crates/cheatly-audio/         Capture and audio processing
local-stt-engine/            Swift/Core ML inference
```

Commands receive services through Tauri State. Services use Rust structs and
methods, accept ordinary data, and return Result values. Keep AppHandle and
frontend event names in the Tauri adapter; use callbacks or existing channels
where a service needs to report progress. Use traits at boundaries that need
replacement in tests, such as a capture session or model provider. Concrete
SQLite/settings types can already be tested with temporary files.

Advantages: familiar navigation, small migration, no new crate needed. Tradeoff:
the dependency boundary is a convention checked by review, not a crate boundary.

### 2. Feature modules with a service layer

```text
src-tauri/src/
  meetings/{commands,service,models}.rs
  assistant/{commands,service,models}.rs
  transcription/{commands,service,provider}.rs
  integrations/
  platform/
```

Uses the same responsibilities as option 1, but keeps each feature together.
This is the smallest folder change from today. The important work is extracting
workflow logic from commands, not renaming directories. Shared integration
ownership must stay explicit to prevent feature modules calling one another's
Tauri commands.

### 3. Core library plus Tauri host in a Cargo workspace

```text
crates/cheatly-core/          Services, models, application contracts; no Tauri
crates/cheatly-audio/         Existing native audio package
src-tauri/                   Commands, OS adapters, dependency construction
local-stt-engine/            Swift inference sidecar
```

The Tauri host depends on the core, and the core never depends on the host.
This gives the strongest dependency boundary and independently runnable core
tests. It becomes useful for a second host (CLI/MCP), separate reuse, or an explicit
requirement to enforce isolation. It requires more public APIs and integration
contracts than the single-package options. It still runs in one Rust process.

## Suggested migration after an option is selected

1. Keep command names, argument shapes, serialized results, and event payloads
   stable so the bridge/browser tests remain meaningful.
2. Extract meeting lifecycle first. Add direct service tests for real save,
   discard without saving, repeated stop, capture failure, and database failure
   retaining unsaved transcript. Preserve the existing lifecycle lock.
3. Extract assistant/question/summary orchestration. Keep cancellation and stale
   generation protections covered by the current tests.
4. Move question-scan scheduling to the backend only as a separate behavior change:
   today it depends on the mounted overlay. Define its intended lifecycle first.
5. Run `npm test` after each extraction, then the native acceptance flow and real
   STT suite before replacing the installed build.

## Official references

- [Tauri commands](https://v2.tauri.app/develop/calling-rust/): typed invocation and Result responses.
- [Tauri managed state](https://v2.tauri.app/develop/state-management/): service/state ownership, mutex and async considerations.
- [Tauri process model](https://v2.tauri.app/concept/process-model/): Rust core process and frontend webviews.
- [Cargo workspaces](https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html): multiple packages with shared build output and workspace tests.
- [Rust test organization](https://doc.rust-lang.org/book/ch11-03-test-organization.html): unit and integration test boundaries.
