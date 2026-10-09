# Native acceptance — macOS, 2026-10-09

App under test: `/Applications/Cheatly.app`, release Tauri build on Apple Silicon.
**Acceptance is incomplete; see pending items below.**

Tests used real accessibility clicks through `@oai/sky`; no browser mocks.

## Observed

- Launcher starts; bundled skills load.
- Start launches the real Swift/Core ML sidecars; mic and system transcript events reach the overlay.
- Mic/system pause buttons switch to Resume and back.
- Discard returns without saving; both sidecars exit.
- Stop & Save persists a meeting. The transcript reopens from the launcher and survives quit/relaunch.
- Missing OpenRouter key yields a retryable failed summary. Retry is functional; successful generation remains untested.
- Settings, audio device enumeration, and the microphone dropdown respond after moving blocking OS calls off the UI thread.
- Native PDF and DOCX imports succeed. Persisted extracted text matches the fixture content.
- Markdown skill import, preview, description edit, save, and disabling succeed.
- Quit through Settings exits the app and leaves no speech sidecars.

## Fixes found through clicks

- Packaged sidecar lookup incorrectly used Tauri's `Executable` base directory on macOS.
- Blocking native file pickers, CoreAudio enumeration, and Keychain reads froze the UI thread.
- Starting gave no progress/error feedback.
- Bundle icons still contained Tauri branding; regenerated every existing icon from `assets/icon.png`.
- Removed the CoreGraphics permission gate before ScreenCaptureKit startup: on this Mac, TCC logged `Service kTCCServiceScreenCapture does not allow prompting; returning denied`, preventing the actual ScreenCaptureKit request.
- Enabled explicit bundle signing and the hardened runtime microphone entitlement. The old app had only a linker signature, a changing executable identifier, an unbound Info.plist and no sealed resources. The installed bundle now identifies as `com.cheatly.assistant` and passes strict signature verification.

## Automation detail

macOS open panels belong to `com.apple.appkit.xpc.openAndSavePanelService`.
Target that identity for picker clicks and Go to Folder. Targeting Cheatly while
its picker is open can return ScreenCaptureKit error -3812. Use `set_value` for
the path field; clipboard paste into the panel service can time out.

## Still pending

- Live OpenRouter chat, cancellation, skill retrieval, question detection, generated titles and summaries: no API key configured.
- Global hotkeys, stealth typing, content protection, tray interactions and disguise icons: not yet verified with native input.
- Capture accuracy: the synthetic clip transcribes correctly when fed directly to the real engine, but desktop capture produced different words while other audio was playing. A later CoreAudio startup stalled in `AudioDeviceStart_mac_imp`; ScreenCaptureKit comparison was blocked by macOS TCC denial (-3801). Its failed startup cleaned up both sidecars. Final signed build retest is waiting on the Keychain approval described below.
- Full cross-platform acceptance has not been performed.

- TCC logs confirmed Cheatly's enabled recording grant referred to an old executable hash. Toggling and re-adding did not replace it. Used the supported, app-specific `tccutil reset ScreenCapture com.cheatly.assistant`; no TCC database edits. The final signed build is installed and opens. Its real Start click initially waited in `SecKeychainFindGenericPassword`, then reached microphone startup. TCC confirms a native microphone prompt (`AUTHREQ_PROMPTING`, 12:48:01 local time). Startup subsequently reached ScreenCaptureKit and returned permission denial (-3801). Fresh System Settings inspection shows Cheatly's Screen Recording switch off. Requested user approval; Computer Use blocks the protected macOS consent application. Successful recording on this final build is **not yet verified**.
- This build uses ad hoc signing for local installation. It is not notarized; future changed builds may require renewed macOS approval. A Developer ID identity can override the local default via `APPLE_SIGNING_IDENTITY`.

## Test state

The imported PDF/DOCX fixtures and one saved recording remain in the app. The
custom `native-acceptance` skill is disabled. SCK is selected for the remaining
permission and capture checks.

## Automated checks

- Rust workspace: 38 passed.
- Frontend unit checks: 31 passed.
- Real local Core ML scenarios: 10 passed, 1 existing skipped case.
- Strict Clippy and release app build passed.
- PDFKit and textutil extraction are exercised by the Rust native-document test using these fixtures.
- Swift dead-code cleanup: release build and real STT suite passed (10 passed, 1 existing skip).
- Installed bundle signature and microphone entitlement: `node tests/native/check-bundle.mjs` passed. An optional app path can be supplied to check another release bundle.
- Final signed, installed sidecar: `STT_BINARY_PATH=/Applications/Cheatly.app/Contents/MacOS/speech-to-text node --test --test-concurrency=1 tests/stt/parakeet.e2e.test.mjs` passed (10 passed, 1 existing skip). Rust workspace rerun: 38 passed.

Local ignored evidence: `tmp/native-acceptance.json`, `tmp/port-tests.log`,
`tmp/frontend-tests.log`, `tmp/stt-tests.log`, `tmp/clippy.log`,
`tmp/native-build.log`, and sampled native call stacks. Raw UI evidence may
contain ambient transcript text and is intentionally not committed.
