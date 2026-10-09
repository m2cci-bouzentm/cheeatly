# Native acceptance — macOS, 2026-10-09

App under test: `/Applications/Cheatly.app`, release Tauri build on Apple Silicon.
**Acceptance is incomplete; see pending items below.**

Tests used real accessibility clicks through `@oai/sky`; no browser mocks.

## Credential and permission follow-up

- At the user's request, copied connectAI's local OpenRouter key into Cheatly's secure provider field and saved it through the app. The key was never printed or committed. The real **Test** button returned **Connected**.
- Typed a synthetic token-bucket question into the actual overlay and submitted with Return. A complete OpenRouter answer streamed into the UI. Discard returned to the launcher and left the two existing meetings unchanged.
- A separate real OpenRouter request using the shipped question-detection prompt identified the synthetic API rate-limiter question. This checks the provider and prompt, **not** the live recording-to-detection UI path.
- Toggled the stale Screen Recording entry off after the user handled macOS authentication. Installed the revised bundle, then toggled the entry back on. The latest app is waiting for fresh Keychain authorization; final recording acceptance is still incomplete.
- Capture denial now automatically opens the Screen Recording permission pane and explains how to recover from a stale app entry. The regression test distinguishes TCC denial from device errors.
- Visible-workspace real dragging exposed a failure in the custom handler. Replaced it with Tauri's built-in `data-tauri-drag-region="deep"`, which supports noninteractive descendants and leaves buttons usable. The installed follow-up needs the final physical drag retest after Keychain approval. Added a darker background to both dropdowns after inspecting real screenshots.
- Follow-up validation: 35 frontend checks, 39 Rust tests, release build and bundle verification passed. Installed Swift/Core ML suite passed 10 tests with 1 existing skip. Evidence is in `tmp/final-drag-build.log`, `tmp/final-drag-unit-tests.log`, `tmp/permission-recovery-rust-tests.log`, `tmp/permission-recovery-stt-tests.log`, and `tmp/native-acceptance.json`.

## Earlier overlay follow-up

- All Cheatly test windows were routed to AeroSpace workspace **5**. The user's focused workspace stayed **1**.
- Model and quick-settings menus now render inside the overlay's existing window. Real accessibility clicks opened both menus, selected GLM 4.7, restored GPT-OSS 120B, and dismissed quick settings by clicking Transcript. AeroSpace reported just one Cheatly window throughout.
- Stop & Save returned to the launcher on the latest build. Discard returned to the launcher on the preceding build with the same lifecycle fix. These checks used STT Disabled; the two existing saved sessions stayed unchanged. They do **not** verify saving a fresh recording.
- Restored Local Parakeet, SCK, GPT-OSS 120B and Undetectable mode after testing.
- Retrying real recording on the latest installed build reached ScreenCaptureKit and failed with **-3801 (TCC denied)**. Both speech sidecars cleaned up. OS consent remains a blocker; the computer-use service blocks the protected macOS consent UI.
- Question scans now include live partial speech, expose errors, permit retries after failure, and reject stale results after reset. Logs identify a missing OpenRouter key. Successful live detection remains unverified until recording consent and credentials are available.
- Native dragging now calls Tauri's startDragging API and excludes interactive controls. A real mouse-drag check remains pending: AeroSpace parks workspace 5 offscreen while the user works in workspace 1. Asked before switching their workspace.
- Before the workspace restriction, actual ScreenCaptureKit app screenshots showed General settings visible with protection off and blank with it on (`tmp/detectable-sck.png`, `tmp/undetectable-sck.png`). Latest-build offscreen screenshots are blank even when detectable, so they are **not** evidence of protection or visual menu layout. Rechecking the final build on a visible workspace remains pending.
- Latest checks: frontend build, 35 frontend checks (including four source regression checks), 38 Rust tests, release app build, and installed-bundle signature/entitlement verification passed.

Latest evidence: `tmp/native-acceptance.json`, `tmp/overlay-unit-tests.log`,
`tmp/overlay-final-rust-tests.log`, `tmp/overlay-final-build.log`.

## Earlier observed results

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
