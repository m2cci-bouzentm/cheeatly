# Live call overlay v13: implementation spec and checklist

Source of truth: `docs/prototypes/live-call-v13.html` (built from `tmp/live-call-v13.template.html` by `tmp/build-v13.py`, which injects the v1 base CSS and v1 scenario data from `live-call.html`). Served at `http://127.0.0.1:5188/live-call-v13.html` (`?scenario=long` for the stress test).

Values below come from the source CSS and from `getComputedStyle` measured with Playwright (Chromium, viewport 1440x900, feedback tool blocked). Scripts: `tmp/v13-spec-measure.mjs`, `tmp/v13-spec-measure2.mjs`, `tmp/v13-spec-v1more.mjs`.

**Out of scope (prototype scaffolding, do not port):** the light header (brand, "Prototype v13" tag, scenario select, "Next moment →", "Reset"), the fake call room (title, "Fictional call" badge, video tiles, avatars, caption, call controls), the footer ("Mock call · no audio captured.", version links), and the review tool loaded by `feedback.js` ("💬 Comment / ✎ Edit" toolbar). Only `#overlay`, `#tip`, `#toast` and `#announcer` are the design.

---

## 0. Design history and intent (why things are the way they are)

Later versions supersede earlier ones.

| Version | User feedback | Result in v13 |
|---|---|---|
| v1 | KEEP the `···` button and its dropdown; KEEP the ASK/SAY/REMEMBER categories; KEEP "Help me respond ⌘↵"; KEEP the "Suggestions On" header; KEEP the view selector; DROP "More detail"; DROP the "Sales · Northstar ⌄" context button | `···` + Session options menu, category labels and Suggestions header use v1's exact CSS. View selector was later removed (v11). No context button, no "More detail". |
| v2 | KEEP the pill, KEEP the per-answer tools row, KEEP the ⚡ quick actions icon | Pill layout, tools row and ⚡ icon come from v2. |
| v3 | Put "Help me respond" with the rest of the quick actions | "Help me respond ⌘↵" is the first row of the ⚡ menu, not a separate button. |
| v4 | Remove "Affects Cheatly only, not your meeting microphone." and "Model selection is simulated." from the Session menu; add hover text to all icons | Session menu has no `<p>` notes. Every icon has a `data-tip` tooltip. |
| v7 | Center the Scan icon; stop flashing the red light | Scan is a 20x20 grid-centered button. Record dot is static (no pulse animation). |
| v8 | Suggestions toggle: a switch, no On/Off text | Bare switch, state only in hover text ("Suggestions on/off"). |
| v9 | No "Listening" indicator; suggestions list too long, cap it; answer panel: more height, smaller and less bold text, follow Cluely's thread UX | No listening row. Lists capped at 380px with fade + ↓. Answer text 15px/400. Thread of request bubble + answer, newest scrolled to top. |
| v11 | Whole suggestion card clickable to send; add × to dismiss | Card is one button that sends its prompt; × Dismiss on hover. |
| v12 to v13 | (no saved comment) | Card text is now the prompt (a question) and that exact text is what appears in the request bubble. |

**KEEP rule:** elements kept from v1 keep v1's exact CSS. Verified by measuring v1 and v13 side by side: `#more` (padding 8px 10px, radius 20px, 11px, 30x29), Session menu (264px wide, `#303034`, padding 15px), `.cue-label` (10px, 650, letter-spacing 0.4px, `#b3b7bb`, margin-bottom 8px), `.side-head` (padding 13px 16px 8px, height 41px, h2 12px/600). Two v1 notes were removed from the menu in v5 (v4 feedback). v1 had a `≤690px` rule `.pill button{padding:7px 6px}`; v13 does not carry it, keep v13 as is.

---

## 1. Component tree

```
Overlay                              div#overlay.overlay            (absolute, draggable)
├─ Pill                              div#pill.pill                  (hidden after End/Discard)
│  ├─ Grip                           span#grip.grip [role=img]      (6-dot drag handle)
│  ├─ Logo                           svg.pill-logo [aria-hidden]
│  ├─ Timer                          span#timer-wrap.timer
│  │  ├─ RecordDot                   i#record-dot.dot.live|.paused
│  │  └─ Time                        span#timer  ("12:08")
│  ├─ Separator                      span.sep
│  ├─ CaptureButton                  button#capture.ib              (pause / play icon)
│  ├─ HideButton                     button#hide.ib                 (eye-off / eye icon)
│  ├─ EndButton                      button#end.ib.stop[.confirm]   (square icon, armed: icon + "End & save")
│  └─ MoreButton                     button#more                    ("···", v1 KEEP)
├─ Panels                            div#panels.panels              (grid; hidden when Hidden or Ended)
│  ├─ AnswerPanel                    section.panel.main [aria-label=Assistant]
│  │  ├─ ScrollWrap                  div.scrollwrap
│  │  │  ├─ Thread                   div#body.body [role=region][aria-busy]
│  │  │  │  ├─ Turn × n              div.chat-turn#turn-{i}
│  │  │  │  │  ├─ RequestBubble      div.ub
│  │  │  │  │  └─ (pending) Skeleton div.skel + div.skel
│  │  │  │  │     or (done) Answer   p.answer
│  │  │  │  │              Tools     div.tools > button.ib × 3 (Shorter, Another angle, Copy)
│  │  │  │  └─ Spacer                div#spacer
│  │  │  └─ ScrollDown               button#body-down.down          (only while content is below)
│  │  ├─ Footer                      div.foot                       (v1 KEEP)
│  │  │  └─ Composer                 form#composer.compose
│  │  │     ├─ QuickActionsButton    button#actions.ib  (⚡)
│  │  │     ├─ label.sr              "Ask about this conversation"
│  │  │     ├─ Input                 input#question  placeholder "Ask anything"
│  │  │     └─ SendButton            button#send.ib.send (↑)
│  │  └─ SessionMenu                 div#session.popover            (v1 KEEP, anchored to AnswerPanel)
│  └─ SuggestionsPanel               aside#side.panel.side [aria-label="Live suggestions"]
│     ├─ Header                      div.side-head                  (v1 KEEP)
│     │  ├─ Title                    h2 "Suggestions"
│     │  └─ Tools                    div.side-tools
│     │     ├─ ScanButton            button#scan.ib[.scanning]      (hidden when suggestions off)
│     │     └─ Switch                label.suggestions-switch > input#auto.sw[role=switch]
│     └─ ScrollWrap                  div.scrollwrap
│        ├─ List                     div#cues
│        │  └─ Card × n              article.cue.k-{ask|say|remember}[.selected][.fresh]
│        │     ├─ CardButton         button.cue-open
│        │     │  ├─ Label           span.cue-label > span  ("ask" | "say" | "remember", shown uppercase)
│        │     │  └─ Prompt text     (text node)
│        │     └─ DismissButton      button.ib.cue-dismiss (×)
│        └─ ScrollDown               button#cues-down.down
├─ QuickActionsMenu                  div#popover.qa                 (anchored under #actions)
└─ FinishCard                        div#finish.finish              (Session saved / Discard confirm / Discarded)

Siblings outside the overlay (inside the stage / body):
Toast                                div#toast.toast [role=status]  (bottom center of the stage/screen)
Announcer                            div#announcer.sr [role=status][aria-live=polite]
Tooltip                              div#tip [role=tooltip]         (single, body level, position fixed)
```

Rendering notes:
- `#panels`, `#popover`, `#finish` are children of `#overlay`, so they move with it. `#session` is a child of the AnswerPanel (`position:absolute` relative to `.main`).
- `#tip` is a single shared element at body level so `overflow` on panels never clips it.
- `#toast` is a child of the stage, not of the overlay: it stays bottom center of the screen area even when the overlay is dragged.

---

## 2. Global foundations

### 2.1 Base (from v1 `:root` and resets)
- Font: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; `font-synthesis: none`; base text color `#e9e9ed` (rgb 233,233,237); base size 16px.
- Tokens: `--green: #81d5b2`, `--line: #ffffff12`, `--muted: #a6a6ad`, `--panel: #242427`.
- `* { box-sizing: border-box }`.
- `button, input, select { font: inherit }`; `button { color: inherit; border: 0; background: none; cursor: pointer; touch-action: manipulation }`.
- `button:disabled { cursor: default; opacity: .45 }`.
- `button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #81d5b2; outline-offset: 3px }`.
- Buttons keep the browser default padding `1px 6px` unless a rule overrides it (relevant for the Session close ×). With a CSS reset (Tailwind preflight sets 0) set paddings explicitly as listed below. Icon buttons are fixed-size grids, so their glyph stays centered either way.
- `[hidden] { display: none !important }`.
- `.sr`: `position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0)`.

### 2.2 Icon system
`svg.i`: `width:15px; height:15px; display:block; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round`, `viewBox="0 0 24 24"`.

| Name | Used by | SVG inner markup (copy verbatim) |
|---|---|---|
| pause | Capture (capturing) | `<path d="M9 6v12M15 6v12"/>` |
| play | Capture (paused) | `<path d="M8 6l10 6-10 6z" fill="currentColor"/>` |
| eyeOff | Hide (visible) | `<path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 8.5 4 9.5 6a13 13 0 0 1-2.6 3.4M6.5 7.6C4.5 9 3.2 10.8 2.5 12c1 2 4.5 6 9.5 6 1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>` |
| eye | Hide (hidden) | `<path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z"/><circle cx="12" cy="12" r="3"/>` |
| stop | End | `<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/>` |
| bolt | Quick actions | `<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>` |
| up | Send | `<path d="M12 19V5M6 11l6-6 6 6"/>` |
| shorter | Tools: Shorter | `<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>` |
| angle | Tools: Another angle | `<path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v3h3M4 13a8 8 0 0 0 14.6 4.5M20 20v-3h-3"/>` |
| copy | Tools: Copy | `<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>` |
| x | Card Dismiss | `<path d="M6 6l12 12M18 6L6 18"/>` |
| down | ↓ More below | `<path d="M12 5v14M6 13l6 6 6-6"/>` |
| scan | Scan now | `<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="11.5" cy="11.5" r="3.5"/><path d="M16 16l-2-2"/>` |
| loader | Scan now (scanning) | `<path d="M21 12a9 9 0 1 1-6.2-8.6"/>` |

Non `.i` SVGs:
- Grip: `viewBox="0 0 12 14" fill="currentColor"`, six circles r=1.3 at (3,3) (9,3) (3,7) (9,7) (3,11) (9,11). Rendered 12x14.
- Logo: `viewBox="0 0 24 24" fill="none" aria-hidden="true"`, `<path d="M18 6a8 8 0 1 0 0 12M17 8a5.5 5.5 0 1 0 0 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`. Rendered 18x18.

Defined in the prototype but unused in v13 (do not port): `why`, `back`, `check`, `spark`.

### 2.3 Keyframes
- `shine`: `to { background-position: -200% 0 }` (skeleton, 1s linear infinite).
- `tip`: `from { opacity: 0 } to { opacity: 1 }` (tooltip .12s, toast .15s, `both`).
- `fresh`: `0% { background: #81d5b230 } 100% { background: transparent }` (new card, 1.2s ease-out, 2 iterations).
- `spin`: `to { transform: rotate(360deg) }` (scan loader, .8s linear infinite).
- `pulse` and `bar` exist in the file but are unused (no flashing dot since v7, no Listening bars since v9). Do not port.

### 2.4 Reduced motion and responsive
- `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }`: no spinner rotation, no skeleton shine, no fresh flash, no tooltip/toast fade, no switch slide, no tools opacity fade. Verified: scan svg `animation-name: none` under reduced motion.
- `@media (max-width: 760px) { .panels { grid-template-columns: 1fr } }`: Suggestions panel stacks under the Answer panel, both full width (measured at 700px viewport: overlay 630px wide, both panels 630px).
- Overlay `max-width: calc(100% - 30px)`.

### 2.5 Scrollbars (Thread and Suggestions list only)
`scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.2) transparent`; WebKit: width 6px, thumb `rgba(255,255,255,.2)` radius 99px, track transparent.

---

## 3. Elements, styles and states

Colors are given as authored hex, with the computed rgba where it helps.

### 3.1 Overlay `#overlay`
- `position:absolute; width:712px; max-width:calc(100% - 30px); left:50%; top:62px; transform:translateX(-50%); z-index:2`.
- After a drag: `transform:none` and explicit `left/top` in px.
- Rest height (sales scenario): 283.8px (pill 40 + 8 gap + panels 235.8).

### 3.2 Pill `#pill`
- `width:max-content; display:flex; align-items:center; gap:2px; background:#252528f5; border:1px solid #ffffff17; border-radius:99px; padding:4px; margin-bottom:8px; box-shadow:0 5px 14px #0003; font-size:12px`.
- Measured: 270.8 x 40 at rest; 346.4 wide when End is armed.
- Order: Grip, Logo, Timer (dot + time), Separator, Capture, Hide, End, More.

**Grip `#grip`** (span, `role="img"`, `aria-label="Drag to move"`, `data-tip="Drag to move"`)
- `touch-action:none; cursor:grab; padding:6px 2px 6px 8px; color:#7d7d86; display:grid; user-select:none`; svg 12x14. Box 22x26.
- `:active { cursor: grabbing }`. No hover color change.

**Logo** `.pill-logo`: 18x18, `color:#a9a9b0`, `margin:0 4px`.

**Timer `#timer-wrap`**
- `display:flex; align-items:center; gap:7px; padding:0 10px 0 6px; font-variant-numeric:tabular-nums; color:#d9d9de`; 12px.
- Dot `#record-dot`: 7x7, radius 50%, `background:#ef6b6b` (live, static, no animation). `.paused`: `background:#d8b776; animation:none`.
- Time text format `m:ss` (minutes not padded, no hours), e.g. `12:08`. Ticks +1s every second while capturing and not ended; frozen while paused.

**Separator** `.sep`: 1x16, `background:#ffffff18`, `margin:0 4px`.

**Icon button `.ib`** (Capture, Hide, End)
- 30x30, `border-radius:99px; display:grid; place-items:center; color:#c4c4cb`.
- Hover and `[aria-expanded=true]`: `background:#ffffff10` (rgba 255,255,255,.063), `color:#fff`.
- Focus-visible: 2px `#81d5b2` outline, offset 3px.

**Capture `#capture`**
- Capturing: icon pause, `data-tip="Pause capture ⌘⇧P"`, `aria-label="Pause capture ⌘⇧P"`.
- Paused: icon play, `data-tip="Resume capture ⌘⇧P"`, `aria-label="Resume capture ⌘⇧P"`; dot turns `#d8b776`; timer stops.

**Hide `#hide`**
- Visible: icon eyeOff, `data-tip="Hide ⌘\"`, `aria-label="Hide overlay"`.
- Hidden: icon eye, `data-tip="Show ⌘\"`, `aria-label="Show overlay"`.

**End `#end`** (`.ib.stop`, `data-tip="End & save"`, `aria-label="End and save"`)
- Rest: 30x30 with `margin-left:6px`, stop icon.
- Armed (`.confirm`): `width:auto; padding:0 11px; background:#673b40; color:#ffdbdc; font-size:12px; gap:6px; display:flex; align-items:center`; content = stop icon + text `End & save`; measured 105.6x30.

**More `#more`** (v1 KEEP; plain button, not `.ib`)
- Text `···`; `aria-label="More session options"`, `aria-expanded="false|true"`, `data-tip="Session options"`.
- `border-radius:20px; padding:8px 10px; font-size:11px`; color inherits `#e9e9ed`; measured 30x29.
- Hover: `background:#ffffff0c` (rgba .047). No style for `aria-expanded=true` (it is not an `.ib`).

### 3.3 Panels `#panels`
- `display:grid; grid-template-columns:minmax(0,444px) 260px; gap:8px; align-items:start` (panels keep their own heights, top aligned).
- Shared `.panel`: `background:#242427; border:1px solid #ffffff13; box-shadow:0 8px 20px #0003; border-radius:14px`.
- Hidden (display none) when the overlay is Hidden or the session Ended.
- `.panels.solo` exists in CSS but is unused.

### 3.4 Answer panel `section.main`
- `display:flex; flex-direction:column; position:relative`. Width 444. Height follows content: 235.8 at rest (sales), max 445 (380 thread + 65 footer).

**Thread `#body`** (`role="region"`, `aria-label="Assistant content"`, `aria-busy="true|false"`)
- `padding:14px 18px 6px; max-height:380px; overflow:auto; position:relative`.
- Empty thread (no turns): only the spacer, height 20px (padding). No empty-state copy.

**Turn `.chat-turn#turn-{i}`**: `.chat-turn + .chat-turn { margin-top: 18px }`.

**Request bubble `.ub`**
- `width:fit-content; max-width:80%; margin:0 0 10px auto` (right aligned); `background:#34343a; color:#ededf1; font-size:13px; line-height:1.45` (18.85px); `padding:7px 11px; border-radius:12px 12px 3px 12px` (tail bottom right).
- Text: the request label (quick action name, typed question, or suggestion prompt).

**Answer `p.answer`**
- `font-size:15px; font-weight:400; line-height:1.6` (24px); `color:#f1f1f4; margin:0; text-wrap:pretty; transition:opacity .3s`.

**Skeleton (pending turn)**: two `div.skel` in place of answer + tools.
- `height:11px; border-radius:5px; background:linear-gradient(90deg,#ffffff0a,#ffffff16,#ffffff0a); background-size:200% 100%; animation:shine 1s linear infinite; margin:6px 0 12px`.
- Second bar `width:62%` (measured 251.7 of 406).

**Tools `.tools`** (per answered turn)
- `display:flex; gap:2px; margin:8px -7px 0; opacity:.75; transition:opacity .15s`.
- `opacity:1` when the Answer panel is hovered (`.main:hover`) or when a tool has focus (`:focus-within`).
- Buttons `.tools .ib`: 28x28, `border-radius:7px`, same colors and hover as `.ib`; icons 15x15.
  1. Shorter: `data-tip="Shorter"`, `aria-label="Shorter"`, `data-action="shorter"`. Disabled (opacity .45, cursor default, no action) when the answer already equals its short version.
  2. Another angle: `data-tip="Another angle"`, `aria-label="Another angle"`.
  3. Copy: `data-tip="Copy"`, `aria-label="Copy answer"`.

**Spacer `#spacer`**: empty div after the last turn; height computed (see 4.6).

**Scroll down `#body-down`** (`data-tip="More below"`, `aria-label="Scroll answer to the end"`): see 3.8.

**Footer `.foot`** (v1 KEEP): `border-top:1px solid #ffffff12; padding:10px 14px 14px; background:none`. Height 63.

**Composer `#composer.compose`** (form)
- `display:flex; align-items:center; gap:2px; margin:0; background:#ffffff06; border:1px solid #ffffff0d; border-radius:10px; padding:3px`. 414x38.
- `:focus-within { border-color: #81d5b244 }`.
- Quick actions `#actions` (`.ib`, `type=button`, bolt icon, `data-tip="Quick actions"`, `aria-label="Quick actions"`, `aria-expanded`): 28x28, radius 7; when open (`aria-expanded=true`) keeps the hover look (`#ffffff10`, `#fff`).
- Hidden label `label.sr[for=question]`: `Ask about this conversation`.
- Input `#question`: `placeholder="Ask anything"`, `autocomplete="off"`, `flex:1; min-width:0; border:0; background:none; color:#ededf1; font-size:13px; padding:7px 6px; outline:none`; placeholder color `#85858f`. No focus outline on the input itself (the composer border tints instead).
- Send `#send` (`.ib.send`, `type=submit`, up icon, `data-tip="Send ↵"`, `aria-label="Send question"`): 28x28, radius 7, `color:#b6d9c7`; hover `#ffffff10` bg, `#fff`. Never disabled.

### 3.5 Session menu `#session.popover` (v1 KEEP, exact v1 CSS)
- `position:absolute; right:12px; top:48px; width:264px; background:#303034; border:1px solid #ffffff1e; border-radius:12px; box-shadow:0 12px 30px #0007; padding:15px; z-index:10; font-size:12px; overflow:auto; max-height:258px`. Measured 264x218, anchored to the Answer panel (13px from its right outer edge, 49px from its top), so it overlaps the top right of the thread.
- Content, in order:
  1. Close button `button.close` text `×`, `aria-label="Close menu"`, `data-tip="Close"`: `float:right; color:#c4c7c7; font-size:16px` (default button padding 1px 6px; 21.8x20).
  2. `h3` `Session options`: 12px, bold (700), `margin:0 0 13px`.
  3. `label` `Capture my microphone` + `input[type=checkbox]` (checked by default).
  4. `label` `Capture call audio` + `input[type=checkbox]` (checked by default).
     Labels: `display:flex; align-items:center; justify-content:space-between; gap:15px; margin:13px 0; font-size:11px; color:#d0d2d7`. Checkboxes native, 13x13, `accent-color:#85d8b4`.
  5. `label[for=model]` `Model` (same label style).
  6. `select#model`: options `Qwen 3.7 Flash` (default), `GLM 5.3 Flash`. `width:100%; padding:7px; background:#252529; border:1px solid #ffffff20; color:#dadde0; border-radius:6px; font-size:11px`. 232x31.
  7. `button.text-btn` `Discard this session…` (with the ellipsis character): `font-size:11px; padding:6px 8px; border-radius:6px; color:#eda7a9; margin-top:12px`; hover `background:#ffffff09` (text stays `#eda7a9`).
- No `<p>` notes (removed after v4).
- `.popover p` rule (10px `#b4b7bd`) is part of the v1 block but has no element in v13.

### 3.6 Quick actions menu `#popover.qa`
- `position:absolute; z-index:10; width:236px; background:#2c2c30; border:1px solid #ffffff1c; border-radius:12px; box-shadow:0 12px 30px #0007; padding:6px; font-size:12px`. 236x101.
- Position: left edge aligned with `#actions` left edge, top = `#actions` bottom + 6px (computed in overlay coordinates on open, follows the overlay after drag).
- Rows `button.row` (each `display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; text-align:left; padding:7px 8px; border-radius:7px; color:#d4d5da`, 222x29). Hover: `background:#ffffff0a; color:#fff`.
  1. `Help me respond` + `<small>⌘↵</small>` (small: 10px, `#8e9097`), `id="respond"`, `data-request="respond"`.
  2. `Suggest a question` (`data-request="ask"`).
  3. `Recap the call` (`data-request="recap"`).
- Unused `.qa` helpers (do not port): `hr`, `.ctx`, `.row.danger`, `.row select`, `label.row`.

### 3.7 Suggestions panel `aside#side.panel.side`
- `overflow:hidden`; width 260. Height follows content (43 with no cards, 127.6 with one 2-line card, max 423 = 41 header + 380 list + 2 border).

**Header `.side-head`** (v1 KEEP): `display:flex; align-items:center; justify-content:space-between; padding:13px 16px 8px`. 41px tall with Scan visible; 36px when suggestions are off (Scan hidden, only the 15px switch remains).
- `h2` `Suggestions`: 12px, weight 600, margin 0.
- `.side-tools`: `display:flex; align-items:center; gap:8px`.

**Scan `#scan`** (`.ib`, `data-tip="Scan now"`, `aria-label="Scan now"`)
- `width:20px; height:20px; border-radius:5px; padding:0`; icon 13x13, centered (v7 fix). Colors as `.ib`; hover `#ffffff10` / `#fff`.
- Scanning (`.scanning`): icon loader, `color:#9cc6f1`, svg `animation:spin .8s linear infinite`, `disabled` (opacity .45, cursor default), `data-tip="Scanning…"` (aria-label stays "Scan now").
- Hidden entirely when suggestions are off.

**Switch** `label.suggestions-switch > input#auto.sw`
- Label: `display:flex; align-items:center; gap:5px; font-size:11px; color:#b7bbc0`; carries the hover text `data-tip="Suggestions on"` / `"Suggestions off"`; no visible text (v8).
- Input: `type=checkbox`, `role="switch"`, `aria-label="Automatic suggestions"`, checked by default.
- `.sw`: `appearance:none; width:26px; height:15px; border-radius:99px; background:#ffffff1f; position:relative; cursor:pointer; margin:0; flex:none; transition:background .15s`; checked `background:#5fa886`.
- Knob `::after`: `content:""; position:absolute; width:11px; height:11px; border-radius:50%; background:#d9d9de; top:2px; left:2px; transition:left .15s`; checked `left:13px`.
- Focus-visible: green 2px outline, offset 3px.

**List `#cues`**: `max-height:380px; overflow:auto`. Empty (zero height) when off or when no cards.

**Card `article.cue`** (`position:relative`; `.cue + .cue { border-top: 1px solid #ffffff0d }`)
- Card button `button.cue-open`: `display:block; width:100%; text-align:left; padding:12px 38px 12px 14px; font-size:14px; line-height:1.45` (20.3px); `color:#dcdce1`.
  - `aria-label="{Kind}: {prompt}. Send to assistant"`, Kind = `Ask` | `Say` | `Remember` (e.g. `Remember: Should I offer a discount now, or clarify the scope first?. Send to assistant`).
  - Hover and selected (`.cue.selected .cue-open`): `background:#ffffff09` (rgba .035), `color:#fff`.
  - Focus-visible: green outline 2px offset 3px.
- Kind modifier `.k-remember .cue-open`: `color:#c9c2b2; box-shadow:inset 2px 0 #d8b77699` (2px amber bar on the left). `ask` and `say` have no modifier.
- Category label `span.cue-label > span` (v1 KEEP): text is the lowercase kind (`ask`, `say`, `remember`) rendered uppercase. Final cascade: `display:flex; justify-content:space-between; align-items:center; font-size:10px; text-transform:uppercase; letter-spacing:.04em` (0.4px); `margin-bottom:8px; font-weight:650; color:#b3b7bb; line-height:normal` (12px tall). All three kinds use the same gray: v1's `.cue-label.ask` (`#9dbbdf`) and `.cue-label.remember` (`#b4a4ce`) rules exist but do not match, because the kind class sits on the article.
- Prompt text follows the label directly inside the same button.
- Dismiss `button.ib.cue-dismiss` (x icon, `data-tip="Dismiss"`, `aria-label="Dismiss suggestion"`): `.ib` 30x30 round, `position:absolute; right:6px; top:8px; opacity:0`; `opacity:1` on `.cue:hover` or `.cue:focus-within` (instant, no transition). Hover: `#ffffff10` bg, `#fff`.
- Fresh (`.cue.fresh`): `animation:fresh 1.2s ease-out 2` on the article (green tint `#81d5b230` fading to transparent, twice, about 2.4s).

**Scroll down `#cues-down`** (`data-tip="More below"`, `aria-label="Scroll suggestions to the end"`): see 3.8.

### 3.8 Overflow cue (both lists)
- Wrapper `.scrollwrap { position: relative }`.
- When content is below the fold, the scroll container gets `.more`: `mask-image: linear-gradient(#000 calc(100% - 44px), transparent)` (also `-webkit-mask-image`), i.e. the last 44px fade out.
- The ↓ button shows at the same time: `button.down`, `position:absolute; right:12px; bottom:8px; width:28px; height:28px; border-radius:50%; background:#2f2f33; box-shadow:0 0 0 1px #ffffff1f, 0 4px 10px #0006; display:grid; place-items:center; color:#d4d4da; padding:0`; icon down 14x14. Hover: `color:#fff; background:#3a3a3f`.
- Both disappear once scrolled to the end.

### 3.9 Tooltip `#tip`
- `position:fixed; white-space:nowrap; background:#111214; color:#e4e4e8; border:1px solid #ffffff14; font-size:11px; padding:5px 8px; border-radius:6px; pointer-events:none; z-index:30; animation:tip .12s both`. Height 25px.
- `role="tooltip"`; text = the target's `data-tip`.

### 3.10 Toast `#toast`
- `position:absolute; bottom:14px; left:50%; transform:translateX(-50%); z-index:20; background:#2c2c30; color:#e5e5ea; padding:8px 13px; border:1px solid #ffffff1c; border-radius:8px; font-size:12px; box-shadow:0 5px 22px #0005; pointer-events:none; animation:tip .15s both`. Height 33.
- `role="status"`. Positioned bottom center of the stage (screen area), not of the overlay.

### 3.11 Finish card `#finish.finish`
- `background:#28282cf7; border:1px solid #ffffff15; border-radius:16px; width:340px; max-width:100%; margin:0 auto; padding:20px; box-shadow:0 15px 50px #0006; font-size:13px`. Centered horizontally inside the overlay (712 wide), so it sits under/at the pill position.
- `h2`: 16px, weight 550, `margin:0 0 6px`.
- `p`: `color:#a9abb2; margin:0 0 14px; line-height:1.5` (19.5px).
- Buttons: `border-radius:8px; background:#ffffff10; padding:8px 12px; font-size:12px; margin-right:6px` (31px tall). `.danger`: `background:#673b40; color:#ffdbdc`.
- Variants (exact copy):
  - Session saved: `Session saved` / `Your recap is ready in Cheatly.` / button `Restart demo` (prototype only; real app: whatever follows the end of a session).
  - Discard confirm: `Discard this session?` / `Transcript and suggestions will be deleted.` / buttons `Keep` then `Discard` (danger).
  - Discarded: `Session discarded` / `No real data was changed.` (prototype copy) / `Restart demo` (prototype only).

### 3.12 Live region `#announcer`
`.sr`, `role="status"`, `aria-live="polite"`. Texts: `Scanning`, `New suggestion: {suggestion line}`, `Preparing a response`. Cleared on reset.

---

## 4. Behaviors and interactions

### 4.1 Drag (grip)
1. `pointerdown` on the grip: record pointer x/y and the overlay's current left/top relative to the stage; `setPointerCapture`.
2. `pointermove` while dragging: set `transform:none`; `left = clamp(0, stageWidth - overlayWidth, startLeft + dx)`, `top = clamp(0, stageHeight - overlayHeight, startTop + dy)`.
3. `pointerup` / `pointercancel`: stop.
- Only the grip starts a drag. Cursor `grab`, `grabbing` while pressed. Tooltip hides on pointerdown.
- Initial position: horizontally centered, 62px from the top.
- Tauri mapping: the stage is the screen; dragging moves the overlay window, kept fully on screen.

### 4.2 Pause / resume capture
- Click Capture or press ⌘⇧P (Ctrl+Shift+P): toggles capture.
- Paused: dot `#d8b776`, play icon, tip/aria "Resume capture ⌘⇧P", timer frozen, toast `Capture paused`.
- Resumed: dot `#ef6b6b`, pause icon, tip/aria "Pause capture ⌘⇧P", timer resumes, toast `Capture resumed`.
- While paused, no new moments/suggestions arrive (prototype: "Next moment" shows toast `Capture is paused`; same toast if "Capture call audio" is off).

### 4.3 Hide / show
- Click Hide or press ⌘\ (Ctrl+\): toggles hidden; closes any open popover.
- Hidden: panels disappear, pill stays (timer keeps running), icon eye, tip "Show ⌘\", aria "Show overlay". Toast `Hidden · still recording` if capturing, `Hidden` if paused. No toast when showing again.
- Clicking `···` while hidden first un-hides, then opens the Session menu.

### 4.4 End & save (two clicks)
1. First click: End arms: red pill `#673b40`, stop icon + `End & save`, pill grows.
2. Second click within 3s: session ends (Session saved card).
3. No second click within 3000ms: disarms back to the icon.
- Any re-render of the overlay state also disarms (prototype side effect: e.g. pausing while armed).
- On end: pending answer cancelled, popovers closed, capture stops, timer stops, pill hidden, panels hidden, finish card `Session saved` shown.

### 4.5 Session menu
- Click `···`: toggles the menu; `aria-expanded` follows. Opening it closes the Quick actions menu.
- Closes on: `×`, a second click on `···`, click anywhere outside `#popover`, `#session`, `#actions`, `#more`, Esc, Hide.
- Checkboxes update capture sources (mic, call audio) immediately; no toast.
- Model select change: toast `Demo model changed to {model}` (prototype wording; see open points).
- `Discard this session…`: closes the menu, hides panels, shows the Discard confirm card (pill stays, timer keeps running).
  - `Keep`: hides the card, panels come back.
  - `Discard`: ends the session, capture off, pill hidden, card `Session discarded`.

### 4.6 Thread model
- A turn = request bubble (right) + answer below (or skeleton while pending) + tools.
- Sending any request (quick action, composer, card):
  1. Ignored if a request is already pending or the session ended.
  2. Append turn `{label, pending:true}`; Thread `aria-busy="true"`; announcer `Preparing a response` (quick actions and composer only).
  3. Scroll the new turn to the top: `scrollTop = newTurn.offsetTop - 8`.
  4. Answer arrives (prototype: 550ms): turn becomes done, skeleton replaced by answer + tools, `aria-busy="false"`. Scroll position is not changed by the answer.
- Spacer: when there are 2+ turns, `spacerHeight = max(0, 366 - lastTurn.offsetHeight)` (366 = 380 max height - 14 top padding), so the newest turn can always scroll to the top even if it is short. With 1 turn: 0. Measured long scenario: last turn 319 tall, spacer 47, scrollTop 343 = offsetTop 351 - 8.
- Redrawing the thread (answer arrives, Shorter, Another angle) preserves `scrollTop` (the spacer briefly disappears during a redraw and would otherwise clamp it).
- The ↓/fade check ignores the spacer: `more = scrollTop + clientHeight < scrollHeight - spacerHeight - 4`.
- Initial thread: if the backend already has a "Help me respond" answer for the current moment, the thread starts with that one turn (`Help me respond` bubble). Otherwise it starts empty.

### 4.7 Per-turn tools
- Shorter: replaces the answer with its short version; button becomes disabled. There is no way back to the long version (Another angle swaps the current text with the alternate).
- Another angle: swaps answer and alternate; clicking again swaps back.
- Copy: copies the current answer text; toast `Copied`, or `Clipboard unavailable` on failure.
- Tools apply to their own turn (every answered turn has its own tools).

### 4.8 Quick actions ⚡
- Click ⚡: toggles the menu (`aria-expanded`); opening closes the Session menu. Placed under ⚡, left aligned, 6px gap.
- Rows send a request and close the menu. Bubble labels: `Help me respond`, `Suggest a question`, `Recap the call`.
- Closes on: second ⚡ click, outside click, Esc, Hide, End.

### 4.9 Composer
- Enter in the input (form submit) or ⌘↵ / Ctrl+↵ anywhere: submit.
- Submit: trim; clear the input; empty → `Help me respond` request; text → custom request whose bubble is the typed text.
- So ⌘↵ with an empty input = Help me respond; ⌘↵ with text = send that question.
- Prototype detail: the input is cleared even when the request is ignored because one is pending (see open points).

### 4.10 Suggestions
- Card text is the prompt (a question for the assistant), not the suggested line. Category label above it.
- Whole card is one button: click sends the prompt as a request (bubble = exact prompt text), marks the card selected; answer = the suggestion's answer. The card stays in the list. Only one card is selected at a time; selection persists until another card is clicked.
- Ignored while a request is pending or after end.
- × Dismiss (visible on card hover/focus): removes the card; it is remembered as handled so Scan does not bring it back. Dismissing does not touch the thread.
- New moment detected while suggestions are on: current cards move to handled, the list is replaced by the new suggestion(s), shown with the fresh highlight; announcer `New suggestion: {line}`. While off, nothing is added.
- Scan now: spinner, disabled, tip `Scanning…`, announcer `Scanning`; after the scan (prototype 900ms): if the suggestion for the current moment is not shown and not handled, insert it at the top with the fresh highlight and announce it; otherwise toast `No new suggestions`.
- Fresh highlight plays once per insertion (the flag is consumed on the next render).
- Switch off: cards hidden (not deleted), Scan hidden, header 36px, tip `Suggestions off`, toast `Suggestions paused`. On: cards back, Scan back, tip `Suggestions on`, toast `Suggestions on`.
- List capped at 380px; overflow shows fade + ↓ (see 4.12).

### 4.11 Tooltips
- Every element with `data-tip` gets the shared tooltip.
- Mouse: shows 250ms after `mouseover` (measured: hidden at 180ms, visible at 330ms). Any `mouseover` first hides the current tip and restarts the delay.
- Keyboard: shows immediately on `focusin` when the target matches `:focus-visible`.
- Hides on `focusout`, on any `pointerdown`, and on moving to an element without a tip.
- Position: horizontally centered on the target, clamped to `[4px, viewportWidth - tipWidth - 4px]`; vertically 7px **above** the target when it is inside the pill, 7px **below** otherwise. Examples: Capture (top 154) tip top 122; ⚡ (bottom 412.8) tip top 419.8; grip at the left edge: tip left clamped to 4px.
- Full hover text list: `Drag to move`, `Pause capture ⌘⇧P` / `Resume capture ⌘⇧P`, `Hide ⌘\` / `Show ⌘\`, `End & save`, `Session options`, `Close`, `Quick actions`, `Send ↵`, `Shorter`, `Another angle`, `Copy`, `More below`, `Scan now` / `Scanning…`, `Suggestions on` / `Suggestions off`, `Dismiss`.

### 4.12 Overflow (fade + ↓)
- Re-evaluated on scroll and after each render of the list.
- Thread: `more` ignores the spacer (see 4.6). Suggestions: `more = scrollTop + clientHeight < scrollHeight - 4`.
- ↓ click: smooth scroll to the end (`scrollTo({top: scrollHeight, behavior:'smooth'})`); for the thread, the end means the newest turn at the top (spacer included).
- Measured: suggestions with 5 cards in the long scenario: scrollHeight 427 vs 380 → fade + ↓; after ↓: scrollTop 47, both gone. Thread with 2 long turns scrolled to 0: fade + ↓; after ↓ scrollTop 343, both gone.

### 4.13 Keyboard shortcuts
| Keys | Action |
|---|---|
| ⌘↵ / Ctrl+↵ | Submit composer (empty = Help me respond, text = question). `preventDefault`. |
| ⌘\ / Ctrl+\ | Toggle hide/show. `preventDefault`. |
| ⌘⇧P / Ctrl+Shift+P | Toggle capture. `preventDefault`. |
| Esc | Close Session menu and Quick actions menu. |
| Enter (in input) | Submit composer. |
In the prototype they are listened to at document level; in the app, ⌘\ and ⌘⇧P likely need to be global shortcuts (overlay may not have focus).

### 4.14 Toasts
- One at a time; a new toast replaces the text and restarts the timer; auto hide after 2600ms.
- Product texts: `Capture paused`, `Capture resumed`, `Hidden · still recording`, `Hidden`, `Suggestions on`, `Suggestions paused`, `No new suggestions`, `Copied`, `Clipboard unavailable`, `Demo model changed to {model}`.
- Prototype only: `Restart the demo to continue`, `Capture is paused` (Next moment while paused / call audio off), `End of scenario`.

### 4.15 Popover exclusivity
Opening ⚡ closes `···` and vice versa. Both close on Esc, outside click, Hide, End. `aria-expanded` resets to `false` on close.

---

## 5. Data contract (neutral)

### 5.1 Suggestion
| Field | Meaning | Prototype source |
|---|---|---|
| `id` | Stable unique id (selection, dismiss, dedupe on Scan) | `initial`, `second`, `extra-0`, `moment-1` |
| `kind` | `ask` \| `say` \| `remember` (drives label text, aria Kind, remember styling) | `kind` |
| `prompt` | The question shown on the card and sent as the request bubble, verbatim | `PROMPTS[topic]` |
| `answer` | The assistant answer returned for that prompt | `response`, else `line` |
| `shortAnswer` (optional) | Short version for Shorter; if missing, the first sentence of `answer` | `short` |
| `alternateAnswer` (optional) | Another angle; if missing, a generic fallback question | `alternate` |
| `line` | The suggested line itself; used in the announcer text `New suggestion: {line}` | `line` |
| `topic` (internal) | Short title; not displayed in v13 | `topic` |
The UI also needs, per suggestion, whether it is handled (dismissed or superseded), which one is selected, and which one is new (fresh).

### 5.2 Thread turn
| Field | Meaning |
|---|---|
| `id` / index | Order in the thread |
| `label` | Request text shown in the bubble: `Help me respond`, `Suggest a question`, `Recap the call`, the typed question, or a suggestion prompt |
| `status` | `pending` (skeleton) \| `done` |
| `answer` | Current answer text (changes with Shorter / Another angle) |
| `short` | Short version (default: first sentence of the answer) |
| `alternate` | Alternate version (swapped by Another angle) |
Request kinds: `respond`, `ask` (suggest a question), `recap`, `custom` (typed text), `suggestion` (card).

### 5.3 Session state the UI reads
`elapsedSeconds` (timer `m:ss`), `capturing` (bool), `hidden` (bool), `ended` (bool), `micCapture` (bool), `callAudioCapture` (bool), `model` (string from list), `autoSuggestions` (bool), `scanning` (bool), `busy` (a request is pending), `selectedSuggestionId`, `freshSuggestionId`, overlay position.

---

## 6. Open points for the developer (prototype quirks, confirm before copying)
- Composer clears typed text even if the request is ignored (busy). Probably keep the text instead.
- Discard confirm (`finish(true)`) cancels the pending answer; after `Keep` the pending turn would stay as a skeleton. Real app: let the request finish or remove the turn.
- Copy `Demo model changed to {model}`, `No real data was changed.` and `Restart demo` are prototype wording.
- Empty thread and empty suggestion list have no copy (by design since v9 removed "Listening").

---

## 7. Checklist

1. [ ] Overlay is 712px wide, max-width `calc(100% - 30px)`, initially centered horizontally and 62px from the top.
2. [ ] Overlay z-index 2; tooltip z-index 30; toast z-index 20; popovers z-index 10.
3. [ ] Font stack `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`, `font-synthesis:none`, base color `#e9e9ed`.
4. [ ] Focus-visible ring on buttons, inputs, selects: 2px solid `#81d5b2`, offset 3px.
5. [ ] Disabled buttons: opacity .45, cursor default.
6. [ ] Pill: `max-content` width, flex, gap 2px, padding 4px, radius 99px, 40px tall.
7. [ ] Pill background `#252528f5`, border 1px `#ffffff17`, shadow `0 5px 14px #0003`, font-size 12px.
8. [ ] Pill has 8px margin below it before the panels.
9. [ ] Pill order: grip, logo, timer, separator, capture, hide, end, `···`.
10. [ ] Grip: 6-dot SVG 12x14 (circles r=1.3 at 3/9 x 3/7/11), color `#7d7d86`, padding `6px 2px 6px 8px`.
11. [ ] Grip cursor `grab`, `grabbing` while pressed; `touch-action:none`; `user-select:none`.
12. [ ] Grip has `role="img"`, `aria-label="Drag to move"`, hover text `Drag to move`.
13. [ ] Logo SVG 18x18, color `#a9a9b0`, margin `0 4px`, path `M18 6a8 8 0 1 0 0 12M17 8a5.5 5.5 0 1 0 0 8`, stroke 2.5 round, `aria-hidden`.
14. [ ] Timer: gap 7px, padding `0 10px 0 6px`, tabular numbers, color `#d9d9de`, 12px.
15. [ ] Timer format `m:ss` (no zero-padded minutes, no hours).
16. [ ] Timer ticks every second only while capturing and not ended.
17. [ ] Record dot 7x7 circle `#ef6b6b` while capturing, static (no pulse/flash).
18. [ ] Record dot `#d8b776` while paused.
19. [ ] Separator 1x16 `#ffffff18`, margin `0 4px`.
20. [ ] Pill icon buttons 30x30, radius 99px, centered glyph, color `#c4c4cb`.
21. [ ] Pill icon button hover: background `#ffffff10`, color `#fff`.
22. [ ] All `.i` icons: 15x15, stroke currentColor, width 1.8, round caps and joins, no fill.
23. [ ] Capture shows pause icon (`M9 6v12M15 6v12`) while capturing.
24. [ ] Capture shows filled play icon (`M8 6l10 6-10 6z`) while paused.
25. [ ] Capture hover text and aria-label `Pause capture ⌘⇧P` / `Resume capture ⌘⇧P`.
26. [ ] Pausing shows toast `Capture paused`; resuming shows `Capture resumed`.
27. [ ] ⌘⇧P / Ctrl+Shift+P toggles capture (default prevented).
28. [ ] Hide shows eye-off icon while visible, eye icon while hidden (paths as in 2.2).
29. [ ] Hide hover text `Hide ⌘\` / `Show ⌘\`; aria-label `Hide overlay` / `Show overlay`.
30. [ ] Hidden state hides both panels and keeps the pill visible.
31. [ ] Hiding shows toast `Hidden · still recording` when capturing, `Hidden` when paused; no toast on show.
32. [ ] Hiding closes any open popover.
33. [ ] ⌘\ / Ctrl+\ toggles hide (default prevented).
34. [ ] Hidden state does not stop capture or the timer.
35. [ ] End button: stop icon (rounded filled square rx 2.5), 6px left margin, hover text `End & save`, aria-label `End and save`.
36. [ ] First End click arms it: background `#673b40`, color `#ffdbdc`, padding `0 11px`, gap 6px, 12px text `End & save` after the icon, auto width.
37. [ ] Armed End disarms after 3000ms without a second click.
38. [ ] Second End click within 3s ends the session.
39. [ ] Ending hides the pill and panels and shows the `Session saved` card.
40. [ ] Ending stops capture and the timer and cancels a pending answer.
41. [ ] `···` button: text `···`, padding `8px 10px`, radius 20px, 11px, inherits `#e9e9ed`, about 30x29 (v1 KEEP).
42. [ ] `···` hover background `#ffffff0c`; no special style while expanded.
43. [ ] `···` aria-label `More session options`, `aria-expanded` true/false, hover text `Session options`.
44. [ ] Panels grid: `minmax(0,444px) 260px`, gap 8px, `align-items:start`.
45. [ ] Panel surface: `#242427`, border 1px `#ffffff13`, radius 14px, shadow `0 8px 20px #0003`.
46. [ ] Answer panel is a flex column, `position:relative`, 444px wide, `aria-label="Assistant"`.
47. [ ] Thread: padding `14px 18px 6px`, max-height 380px, scrolls vertically.
48. [ ] Thread has `role="region"`, `aria-label="Assistant content"`, `aria-busy` true while a request is pending.
49. [ ] Thread scrollbar thin, thumb `rgba(255,255,255,.2)` radius 99px, 6px, no track.
50. [ ] Empty thread renders nothing (no placeholder copy, no Listening indicator).
51. [ ] Turns are separated by 18px.
52. [ ] Request bubble right aligned, `max-width:80%`, fit-content width.
53. [ ] Request bubble: `#34343a`, text `#ededf1`, 13px, line-height 1.45, padding `7px 11px`.
54. [ ] Request bubble radius `12px 12px 3px 12px`, 10px gap below.
55. [ ] Answer text 15px, weight 400, line-height 1.6, `#f1f1f4`, `text-wrap:pretty`, no margin.
56. [ ] Pending turn shows two skeleton bars instead of answer and tools.
57. [ ] Skeleton bar: 11px tall, radius 5px, gradient `#ffffff0a / #ffffff16 / #ffffff0a`, 200% size, `shine` 1s linear infinite, margin `6px 0 12px`.
58. [ ] Second skeleton bar is 62% wide.
59. [ ] Tools row under each answered turn: flex, gap 2px, margin `8px -7px 0`.
60. [ ] Tools rest opacity .75; 1 while the answer panel is hovered or a tool is focused; transition .15s.
61. [ ] Tool buttons 28x28, radius 7px, `.ib` colors and hover.
62. [ ] Tool order: Shorter, Another angle, Copy, with the icons in 2.2.
63. [ ] Tool hover texts `Shorter`, `Another angle`, `Copy`; aria-labels `Shorter`, `Another angle`, `Copy answer`.
64. [ ] Shorter replaces the answer with its short version.
65. [ ] Shorter is disabled when the answer already equals the short version.
66. [ ] Short version defaults to the first sentence of the answer when not provided.
67. [ ] Another angle swaps answer and alternate, and swaps back on the next click.
68. [ ] Copy writes the current answer to the clipboard and toasts `Copied`.
69. [ ] Copy failure toasts `Clipboard unavailable`.
70. [ ] Each turn's tools act on that turn only.
71. [ ] New turn is appended in pending state and scrolled so its top is 8px below the thread top.
72. [ ] Answer arrival does not move the scroll position.
73. [ ] Spacer after the last turn: `max(0, 366 - lastTurnHeight)` when 2+ turns, 0 with one turn.
74. [ ] Thread scroll position is preserved across redraws (answer, Shorter, Another angle).
75. [ ] Requests are ignored while one is pending or after the session ended.
76. [ ] Announcer says `Preparing a response` when a quick action or composer request starts.
77. [ ] Initial thread contains one `Help me respond` turn when an answer for the current moment exists, else empty.
78. [ ] Footer: border-top 1px `#ffffff12`, padding `10px 14px 14px`, no background (v1 KEEP).
79. [ ] Composer: flex, gap 2px, background `#ffffff06`, border 1px `#ffffff0d`, radius 10px, padding 3px, about 38px tall.
80. [ ] Composer border becomes `#81d5b244` while anything inside has focus.
81. [ ] Input: 13px, color `#ededf1`, padding `7px 6px`, no border, no background, no outline.
82. [ ] Input placeholder `Ask anything` in `#85858f`; autocomplete off.
83. [ ] Input has a visually hidden label `Ask about this conversation`.
84. [ ] ⚡ button left in the composer: bolt icon `M13 3L5 14h6l-1 7 8-11h-6z`, 28x28, radius 7px.
85. [ ] ⚡ hover text and aria-label `Quick actions`; `aria-expanded` reflects the menu.
86. [ ] ⚡ keeps hover styling (`#ffffff10`, `#fff`) while its menu is open.
87. [ ] Send button right in the composer: up arrow `M12 19V5M6 11l6-6 6 6`, color `#b6d9c7`, 28x28, radius 7px.
88. [ ] Send hover text `Send ↵`, aria-label `Send question`; never disabled.
89. [ ] Enter in the input submits.
90. [ ] ⌘↵ / Ctrl+↵ submits from anywhere (default prevented).
91. [ ] Submitting trims and clears the input.
92. [ ] Empty submit sends `Help me respond`.
93. [ ] Non-empty submit sends the typed text as the bubble label.
94. [ ] Quick actions menu: 236px wide, `#2c2c30`, border 1px `#ffffff1c`, radius 12px, padding 6px, shadow `0 12px 30px #0007`, 12px.
95. [ ] Quick actions menu left edge aligned with ⚡, top 6px below ⚡.
96. [ ] Quick actions rows in order: `Help me respond ⌘↵`, `Suggest a question`, `Recap the call`.
97. [ ] `⌘↵` hint is a small 10px `#8e9097` text at the right of the first row.
98. [ ] Rows: flex space-between, gap 10px, padding `7px 8px`, radius 7px, color `#d4d5da`, left aligned.
99. [ ] Row hover: background `#ffffff0a`, color `#fff`.
100. [ ] Clicking a row sends that request (bubble = row label) and closes the menu.
101. [ ] Second ⚡ click closes the menu.
102. [ ] Session menu anchored to the answer panel: `right:12px; top:48px`, overlapping the thread.
103. [ ] Session menu: 264px wide, `#303034`, border 1px `#ffffff1e`, radius 12px, shadow `0 12px 30px #0007`, padding 15px, 12px, max-height 258px with scroll.
104. [ ] Session menu close `×` floated right, `#c4c7c7`, 16px, aria-label `Close menu`, hover text `Close`.
105. [ ] Session menu title `Session options`, 12px bold, 13px below.
106. [ ] Toggle row `Capture my microphone` with checkbox at the right, checked by default.
107. [ ] Toggle row `Capture call audio` with checkbox at the right, checked by default.
108. [ ] Toggle rows: flex space-between, gap 15px, margin 13px 0, 11px, `#d0d2d7`; checkbox accent `#85d8b4`.
109. [ ] `Model` label then select with `Qwen 3.7 Flash` (default) and `GLM 5.3 Flash`.
110. [ ] Model select: full width, padding 7px, `#252529`, border 1px `#ffffff20`, text `#dadde0`, radius 6px, 11px.
111. [ ] `Discard this session…` text button: 11px, padding `6px 8px`, radius 6px, color `#eda7a9`, 12px top margin, hover background `#ffffff09`.
112. [ ] Session menu has no explanatory notes (both v1 notes removed).
113. [ ] `···` toggles the Session menu; opening it closes the Quick actions menu.
114. [ ] Session menu closes on `×`, outside click, Esc, Hide.
115. [ ] Clicking `···` while hidden shows the overlay and opens the menu.
116. [ ] Microphone and call audio toggles take effect immediately.
117. [ ] Changing the model shows a toast naming the model.
118. [ ] Discard opens a confirm card: `Discard this session?` / `Transcript and suggestions will be deleted.` / `Keep`, `Discard`.
119. [ ] Discard confirm hides panels and keeps the pill.
120. [ ] `Keep` closes the card and restores the panels.
121. [ ] `Discard` ends the session, hides the pill, shows `Session discarded`.
122. [ ] Finish card: 340px (max 100%), centered, `#28282cf7`, border 1px `#ffffff15`, radius 16px, padding 20px, shadow `0 15px 50px #0006`, 13px.
123. [ ] Finish title 16px weight 550, 6px below; body `#a9abb2`, line-height 1.5, 14px below.
124. [ ] Finish buttons: radius 8px, `#ffffff10`, padding `8px 12px`, 12px, 6px apart; danger `#673b40` / `#ffdbdc`.
125. [ ] `Session saved` card copy: `Session saved` / `Your recap is ready in Cheatly.`.
126. [ ] Suggestions panel 260px wide, `overflow:hidden`, `aria-label="Live suggestions"`.
127. [ ] Suggestions header (v1 KEEP): padding `13px 16px 8px`, flex space-between, 41px tall.
128. [ ] Header title `Suggestions`, 12px, weight 600.
129. [ ] Header tools: Scan then switch, gap 8px.
130. [ ] Scan button 20x20, radius 5px, no padding, 13x13 icon centered.
131. [ ] Scan hover text and aria-label `Scan now`; hover `#ffffff10`, `#fff`.
132. [ ] Scanning: loader icon spinning (.8s linear), color `#9cc6f1`, disabled, hover text `Scanning…`.
133. [ ] Scanning announces `Scanning` to screen readers.
134. [ ] Scan result with a new suggestion: inserted at the top, fresh highlight, announcer `New suggestion: {line}`.
135. [ ] Scan result without a new suggestion: toast `No new suggestions`.
136. [ ] Scan never resurfaces a dismissed or already shown suggestion.
137. [ ] Scan hidden while suggestions are off.
138. [ ] Switch has no visible On/Off text.
139. [ ] Switch 26x15, radius 99px, off `#ffffff1f`, on `#5fa886`, background transition .15s.
140. [ ] Switch knob 11x11 `#d9d9de`, top 2px, left 2px off / 13px on, transition .15s.
141. [ ] Switch is a checkbox with `role="switch"` and aria-label `Automatic suggestions`.
142. [ ] Switch hover text `Suggestions on` / `Suggestions off` (on the label).
143. [ ] Switch off: cards hidden, header shrinks to 36px, toast `Suggestions paused`.
144. [ ] Switch on: cards return unchanged, toast `Suggestions on`.
145. [ ] While off, new moments add no cards.
146. [ ] List max-height 380px, vertical scroll, thin scrollbar.
147. [ ] Cards separated by a 1px `#ffffff0d` line.
148. [ ] Card is a single button covering the whole card, left aligned, padding `12px 38px 12px 14px`.
149. [ ] Card text 14px, line-height 1.45, color `#dcdce1`.
150. [ ] Card text is the prompt (question to the assistant), not the suggested line.
151. [ ] Card aria-label `{Ask|Say|Remember}: {prompt}. Send to assistant`.
152. [ ] Category label above the prompt: lowercase kind rendered uppercase, 10px, weight 650, letter-spacing .04em, `#b3b7bb`, 8px below, normal line-height (v1 KEEP).
153. [ ] All three categories use the same gray label color.
154. [ ] Remember cards: text `#c9c2b2` and a 2px inset left bar `#d8b77699`.
155. [ ] Card hover: background `#ffffff09`, text `#fff`.
156. [ ] Selected card keeps the hover look after the click.
157. [ ] Only one card is selected at a time.
158. [ ] Clicking a card sends its prompt verbatim as a request bubble and shows the suggestion's answer under it.
159. [ ] Clicked card stays in the list.
160. [ ] Card clicks are ignored while a request is pending or after end.
161. [ ] Dismiss × at top 8px, right 6px of the card, 30x30 round, hidden (opacity 0) until card hover or focus-within.
162. [ ] Dismiss hover text `Dismiss`, aria-label `Dismiss suggestion`, x icon `M6 6l12 12M18 6L6 18`.
163. [ ] Dismiss removes the card without sending anything.
164. [ ] New suggestions get the fresh animation: `#81d5b230` to transparent, 1.2s ease-out, 2 iterations, on the card.
165. [ ] A new moment replaces the list with the new suggestion(s) and retires the previous ones.
166. [ ] Announcer says `New suggestion: {line}` for automatically added suggestions.
167. [ ] Overflow fade: last 44px of the list masked to transparent while content is below.
168. [ ] Overflow ↓ button: 28x28 circle, `#2f2f33`, ring `0 0 0 1px #ffffff1f`, shadow `0 4px 10px #0006`, color `#d4d4da`, right 12px, bottom 8px.
169. [ ] ↓ button icon 14x14 down arrow `M12 5v14M6 13l6 6 6-6`.
170. [ ] ↓ button hover: `#3a3a3f`, `#fff`; hover text `More below`.
171. [ ] ↓ aria-labels `Scroll answer to the end` and `Scroll suggestions to the end`.
172. [ ] ↓ click smooth scrolls to the end; fade and ↓ disappear at the end.
173. [ ] Thread overflow check ignores the spacer (no fade when only the spacer is below).
174. [ ] Fade and ↓ update on scroll and after every list render.
175. [ ] Tooltip: one shared element, fixed, `#111214`, text `#e4e4e8`, border 1px `#ffffff14`, 11px, padding `5px 8px`, radius 6px, nowrap, 120ms fade in.
176. [ ] Tooltip appears 250ms after hover; moving to another element restarts the delay.
177. [ ] Tooltip appears immediately on keyboard focus (focus-visible only).
178. [ ] Tooltip hides on pointerdown, focusout and leaving to an element without hover text.
179. [ ] Tooltip sits 7px above pill controls and 7px below every other control.
180. [ ] Tooltip is centered on its target and clamped 4px inside the viewport edges.
181. [ ] Tooltip is never clipped by panel overflow.
182. [ ] Every icon-only control has hover text (list in 4.11).
183. [ ] Esc closes both menus.
184. [ ] Outside click (not on menus, ⚡ or `···`) closes both menus.
185. [ ] Only one of the two menus is open at a time.
186. [ ] Toast: bottom 14px, centered, `#2c2c30`, text `#e5e5ea`, padding `8px 13px`, border 1px `#ffffff1c`, radius 8px, 12px, shadow `0 5px 22px #0005`, 150ms fade in.
187. [ ] Toast is `role="status"`, not clickable, auto hides after 2600ms, a new toast replaces the old one.
188. [ ] Toast stays bottom center of the screen area, independent of overlay position.
189. [ ] Polite live region announces scanning, new suggestions and response preparation.
190. [ ] Drag only from the grip; overlay follows the pointer with pointer capture.
191. [ ] Drag clamps the overlay fully inside the screen area on both axes.
192. [ ] Quick actions menu follows the overlay after a drag (still under ⚡).
193. [ ] Reduced motion disables all animations and transitions (spinner, skeleton, fresh, fades, switch, tools opacity).
194. [ ] At 760px wide or less, the suggestions panel stacks under the answer panel at full width.
195. [ ] Answer panel grows with content up to 380px thread height plus footer (about 445px total).
196. [ ] Suggestions panel grows with content up to 380px list height (about 423px total).
197. [ ] No Listening indicator, no view selector, no context button, no `More detail`, no `Why this answer` tool.
198. [ ] Unused prototype CSS not ported (`.listening`, `.bars`, `.turn`, `.hist`, `.quiet`, `.ctx`, `.stale`, `.panels.solo`, `.ib.on`, `.text-btn.on`, `pulse`, `bar`).
199. [ ] No prototype scaffolding or feedback tool in the product.
