# Architecture refactor acceptance — macOS, 2026-10-09

Installed `/Applications/Cheatly.app`, release executable SHA256:
`d56a44b92188161f814ac14078e9b98db4cecac426294f089b48570b6513b3e0`.
Installed executable matches the generated bundle; strict/deep code-signature
verification passed. All Cheatly windows stayed on AeroSpace workspace **10**.

## This pass

- Real `cua_repl` accessibility clicks started microphone/system capture using
  both installed Swift speech processes. The changed ad hoc executable first hit
  macOS error `-3801` despite its old enabled grant. Removed that obsolete entry,
  re-added `/Applications/Cheatly.app` through System Settings, and reopened it.
  Capture then worked. No protected database edits or authentication bypasses.
- Played the synthetic database/payment question fixture through system audio.
  Automatic detection produced suggestions through real OpenRouter calls.
- Returned to the launcher while recording. Backend scans continued: reopening
  the overlay hydrated 13 suggestions, up from 5 before leaving, including the
  synthetic PostgreSQL/MongoDB and idempotent-payment questions.
- Pause/resume reset suggestions correctly. Manual Scan now completed with
  “5 new suggestions.” Selecting the synthetic payment suggestion consumed it
  and streamed a complete assistant response.
- Model selector and quick settings opened inside the one existing Cheatly
  window. Actual screenshots showed the overlay when Detectable, and blank
  capture when Undetectable. Restored GPT-OSS 120B and Undetectable.
- Stop & Save showed its busy state, returned to the launcher, and added exactly
  one meeting (3 → 4). Title and summary completed. Reopened Transcript through
  the UI and verified the synthetic database question persisted.
- Started a fresh meeting: prior suggestions/chat were cleared and both audio
  mute states reset. Muted both channels and clicked Discard. Returned to the
  launcher with 4 saved meetings and no remaining speech processes.
- Finished with recording stopped and the launcher open on workspace 10.
  Temporary AeroSpace routing was removed after testing.

## Repeatable checks

- `npm test`: **40 Node + 61 Rust + 12 browser tests passed**.
- Strict workspace Clippy and release/frontend builds passed.
- Real installed Swift/Core ML suite: **10 passed, 1 existing skip**. The sidecar
  is byte-for-byte identical in the tested prior install and the new bundle.
- Logs: `tmp/refactor-acceptance-suite.log`, `tmp/refactor-clippy-final.log`,
  `tmp/refactor-release-final.log`, `tmp/refactor-stt.log`.
- UI snapshots/screenshots are in this task's computer-use transcript. Application
  logs show question completion through `assistant::service`, including scans
  while the overlay was unmounted.

Other system audio was playing, so the saved test meeting includes ambient audio.
The new test meeting remains alongside the three existing meetings. This pass
checks workflow behavior, not isolated transcription or generated-summary accuracy.
Dragging remains the previously user-confirmed implementation; it was not re-tested
in this pass. Cross-platform, hotkey, and notarization limitations below still apply.

---

# Native acceptance — macOS, 2026-10-09

App: `/Applications/Cheatly.app`, Apple Silicon release at `491947c`.
Tests used real accessibility clicks through `@oai/sky`, actual local Swift/Core ML
speech processes, ScreenCaptureKit recording, and real OpenRouter requests.

## Requested flows verified

- **Recording permission:** the stale grant referred to an earlier ad hoc executable.
  After quitting the app, an app-specific `tccutil reset ScreenCapture
  com.cheatly.assistant`, fresh addition of `/Applications/Cheatly.app` in Screen
  Recording, and native Quit & Reopen, Start successfully captured audio. The user
  completed protected macOS authentication. No TCC database edits were used.
  Capture denial automatically opens the correct permission pane; the app cannot
  grant itself consent. Future changed ad hoc builds may need renewed approval.
- **Provider:** securely saved the user-authorized connectAI OpenRouter key through
  Cheatly. Test returned Connected; a real overlay chat streamed a complete answer.
  No key was printed or committed.
- **Live question detection:** played the synthetic questions through system audio
  while recording. Automatic scans produced suggestions. Scan now completed with
  “2 new suggestions”, covering PostgreSQL versus MongoDB and idempotent payments.
  Pause scanning changed to Resume scanning and showed Analysis paused.
- **Stop & Save:** stopped the real recording, returned to the launcher, and added
  one meeting. Generated title and summary completed. Reopened the saved meeting
  and verified its transcript contained the synthetic PostgreSQL question.
- **Discard:** started a second real recording, paused both audio channels, then
  clicked Discard. It returned to the launcher with the same three saved meetings;
  neither speech process remained running.
- **Selectors:** both menus open inside the existing overlay. Selected GLM 4.7,
  then restored GPT-OSS 120B. Screenshots show compact attached menus with readable
  dark backgrounds. AeroSpace reported one Cheatly window.
- **Dragging:** uses Tauri's built-in deep drag regions. The user physically
  dragged this installed build and confirmed “ok dragging works”. Automated drag
  was inconclusive: the same tool also failed to move native System Settings.
- **Content protection:** on a visible workspace, actual ScreenCaptureKit app
  screenshots showed the overlay with protection off and blank output with it on.
  This verifies this Mac/capture path, not every screen-sharing application.
- **Final state:** Local Parakeet, SCK, GPT-OSS 120B, and Undetectable restored.
  App remains open on AeroSpace workspace **10**, the user's second monitor.
  Earlier tests used workspace 5; the user requested 10 to avoid focus disruption.

## Fixes exercised

- Embedded selectors, busy/error feedback for stopping, reliable return to launcher.
- Question scans include live partial speech, show errors, allow retries after
  failure, and reject stale results after reset.
- Recording startup errors open Screen Recording settings with recovery guidance.
- Native drag regions and explicit dragging capability.
- Bundled sidecar lookup, nonblocking native pickers/audio enumeration/Keychain reads.
- Cheatly icons, sealed bundle signature, and hardened runtime microphone entitlement.
- Removed unused Swift transcription paths.

## Other checks already completed

Native PDF/DOCX import and extracted text, skill import/preview/edit/save/disable,
audio device selectors, microphone/system pause and resume, Settings Quit, and
saved transcript persistence across relaunch were exercised through the app.

- Frontend: **35 passed** (including four supplemental source regression checks).
- Rust: **39 passed**.
- Installed Swift/Core ML: **10 passed, 1 existing skip**.
- Release build and installed bundle signature/entitlement check passed.
- Strict Clippy passed during the earlier port validation.

## Limits and retained state

Other desktop audio was playing during the live capture test, so the saved
transcript mixes the fixture and ambient audio. This verifies the complete path,
not isolated transcription accuracy. Raw UI evidence stays ignored locally.
Global hotkeys, stealth typing, tray interactions, disguise icons, chat
cancellation, and cross-platform behavior were not fully verified in this pass.
The app is locally ad hoc signed, not notarized.

The successful test meeting remains alongside the two pre-existing meetings.
Imported PDF/DOCX fixtures remain; the custom native-acceptance skill is disabled.
A speculative custom pointer-drag implementation was reverted and never installed.
The installed application remains the verified built-in drag implementation.

## Local evidence

- `tmp/native-acceptance.json`: timestamped real UI states, including saved results.
- `tmp/final-model-selector.png`, `tmp/final-quick-settings.png`: embedded menus.
- `tmp/final-detectable-sck.png`, `tmp/final-undetectable-sck.png`: protection comparison.
- `tmp/final-drag-build.log`, `tmp/final-drag-unit-tests.log`.
- `tmp/permission-recovery-rust-tests.log`, `tmp/permission-recovery-stt-tests.log`.
- `tmp/openrouter-question-check.json`: supplemental direct provider/prompt check.

macOS open panels belong to `com.apple.appkit.xpc.openAndSavePanelService`.
Use that app identity for picker clicks and Go to Folder; use set_value for the
path field. Secure provider fields require actual typing to trigger React changes.
