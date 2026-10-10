# Cluely overlay: rebuild spec (researched 10 October 2026)

Goal: let another agent rebuild Cluely's in-call overlay as an HTML mock. Everything below was seen in a source listed at the end, unless it is marked **(inferred)**. Frames live in `docs/research/cluely/frames/`.

Versions covered: macOS build documented by Cluely support on 9 to 12 December 2025 ("all versions after 1.88.6", transcript removed from widget in 1.89.0), and the Windows build "Cluely v2.0" filmed on 1 August 2026 (YouTube, StackWise, uploaded 27 August 2026). Both show the same layout. The cluely.com homepage carries an HTML replica of the same widget, which was the source for exact CSS values.

## 0. Overall anatomy

The overlay is two stacked, separate floating shapes, horizontally centred on each other, sitting at the top centre of the screen by default:

1. **Command bar** (pill): `[Cluely logo] [Hide | Ask] [Stop ■]`.
2. **Chat panel** (rounded rectangle) directly under the bar, about 8px gap. It contains, top to bottom: the conversation thread (only when there is one), the quick action row, and the input box.

There is no separate transcript pane, no live insights cards, and no timer in the current widget (frames 03, 06). The transcript lives only in the dashboard (support "How to copy transcript": "As of Dec 9, 2025, there is no more transcript in the widget").

## 1. Before the call (dashboard, not the overlay)

- Entry points: meeting notification "Zoom meeting detected" with button **Take Notes**; calendar card "Meeting in 2 minutes" with **Join and Take Notes**; dashboard button **Start Cluely** (frame 15, 01).
- Dashboard v2.0 (dark theme, frame 01): green chip "What's new in Cluely v2.0 ↗", title "Cluely", refresh icon, eye icon + "Detectable" toggle, blue gradient button "⊗ Start Cluely" with caption "3 free meetings left", link "Link your calendar to get notifications for upcoming meetings.", empty state card with monitor icon, "Start your first session", "Cluely provides live AI help during your conversation and generates searchable summaries afterwards.", small button "Start Cluely" which becomes a spinner + "Starting..." (ChyoDTs7RQY 04:56).

## 2. Session starts: bar + empty chat panel (frame 03)

- Appears about 2 s after "Starting..." (04:56 to 04:58). Opens directly in the "chat open" state: bar + panel with action row and input, no thread area.
- Bar: logo button (white Cluely logo, circular), a dark pill button "⌄ Hide", a dark circular button with a white rounded square (stop). Homepage CSS: container 167 x 46, padding 6px 12px, gap 4px; inner buttons 32px tall, fully rounded.
- Panel idle size (homepage replica): 518 x ~234 px with a thread; action row + input only is about 120 to 140px tall (inferred from frame 03 proportions).
- Action row (one line, left aligned, icons + labels separated by small 3px grey dots): **✦ Assist · (magic wand) What should I say? · (speech bubble) Follow-up questions · (circular arrow) Recap**.
- Input box (bordered, rounded 12px, inset in panel): placeholder "Ask about your screen or conversation, or [⌘] [↵] for Assist" (Windows shows "[Ctrl] [↵]"). Key caps are tiny bordered boxes inline in the placeholder. Bottom row of the box: **Smart** chip (grey, with lightning icon on homepage), a "⋯" button, and at far right a round navy send button with white arrow/triangle.
- macOS December 2025 variant (frame 09, support): no inner input border, the placeholder sits directly in the panel, the bottom row is "Smart" chip + sliders icon (settings) + navy send button.

## 3. Listening / recording state

- **No visible listening indicator in the widget**: no waveform, no timer, no transcript, no red dot in any app frame (frames 02, 03, 06). The only signal is the bar itself plus the stop button. Support: "Cluely will appear as a small pill on your desktop to let you know your meetings are being transcribed."
- The homepage marketing card shows "00:06" + red dot "Recording" + a waveform (frame 12b), but that is a marketing illustration, not the overlay.
- Screen context: "Screen context is always used in v.1.89.0". Each answer is labelled "Viewed screen" (v2.0) or "Sent with screenshot 🖼" (Dec 2025 mac).

## 4. Minimal state: chat hidden, "Ask" pill (frames 02, 02b)

- Clicking **Hide** collapses the chat panel completely; only the bar remains, and the middle button turns into a **bright blue filled pill "✦ Ask"** (sparkles icon, white bold text). Clicking Ask reopens the panel and the button returns to "⌄ Hide" (ChyoDTs7RQY 05:36 to 05:42).
- Support doc pill (Dec 2025): exactly `[logo] [✦ Ask (blue)] [■]`, the image is 170 x 49 px; if it is a 2x capture that is about 85 x 25 pt, but it looks downscaled, so use the replica bar size (167 x 46) instead **(inferred)**.
- On the macOS build the Hide button shows "^ Hide" (chevron up); Windows v2 and homepage show "⌄ Hide" (chevron down).

## 5. User asks

Three ways, all observed:
- Click a quick action. The label is posted as a **right-aligned user bubble** at the top of the new turn: "What should I say?" and "Follow-up questions" render as navy blue bubbles; "Assist" renders as a **blue-to-violet gradient bubble** (frames 06, 07, 08). Homepage replica uses navy for all.
- Press ⌘↵ / Ctrl↵ with an empty box = Assist (support: "Press ⌘/Ctrl + Enter again to submit without typing").
- Type in the box and press Enter or the send button; the typed text becomes the user bubble.
- Clicking a quick action is instant, with no confirmation and no mode switch.

## 6. Thinking and streaming answer (frames 04, 05, 11)

- Panel **expands immediately** to its tall state when a request is sent (05:16): a round dark **X** button appears at top left of the panel, the user bubble at top right, a thin scrollbar on the right edge.
- Under the bubble: small grey caption "Viewed screen", then a **single white dot (about 8px)** as the thinking indicator (05:20).
- Answer streams into the left column under "Viewed screen" in chunks of a few words: "Let me give you" ... "Cluely gives real-time" ... full text (05:21 to 05:25). Each new chunk **fades in** (new words appear at lower opacity then reach full white within about 300 ms, visible at 05:24.7 and in the homepage replica, where every word is its own span with a staggered opacity fade over about 1 s).
- Answer text: white, regular weight, about 15 to 16px, line height about 1.6, full panel width minus 16px padding. No avatar, no "AI" label, no card around the answer.
- Under each finished answer: a small **copy icon** (two overlapping squares), grey.
- Lists render as real bullets (Follow-up questions returned two bulleted questions, frame 07). Mac doc shows paragraphs with blank line between, and a final paragraph cut off with a bottom fade.

## 7. Expanded state, history and scrolling (frames 06, 07, 08)

- Tall panel, fixed height (about 740 px of a 1080 px screen on Windows; mac doc about 350pt), width unchanged. Thread scrolls; action row + input stay pinned at the bottom.
- **History is kept**: earlier turns stay above (05:26 shows the previous answer "Let me give you a quick overview of what makes it useful." above a new "What should I say?" bubble). Each new request scrolls so the new user bubble sits near the top of the viewport.
- When content is below the fold: a **round dark "↓" button** bottom right above the action row, and the last visible lines fade out (mac doc frame 08).
- Only one answer per request; **no multiple parallel suggestions**, no ranking, no cards. "What should I say?" returns one quoted line or short paragraph to say verbatim.
- ⌘R / Ctrl R: "Clear chat" (v2.0 menu) or "Collapse Chat" (Dec 2025 popover): clears the thread and collapses the panel. The top-left X likely does the same **(inferred)**.

## 8. Settings / more menu (frames 09, 10)

- v2.0 "⋯" menu (dark popover, rounded about 10px, rows about 34px): heading "Keybinds"; Show/hide Cluely `Ctrl+\`; Ask Cluely `Ctrl+↵`; Clear chat `Ctrl+R`; Stop session `Ctrl+Shift+\`; Move Cluely `Ctrl+ ↑↓←→`; Scroll Chat `Ctrl+Shift+ ↑↓`; divider; Undetectability (toggle); Hide Cluely hides widget (toggle); Modes ›, submenu "General ✓", "✎ Manage Modes".
- Dec 2025 mac popover (from sliders icon): Undetectability toggle; Show/Hide Chat `⌘ \`; Hide Chat Also Hides Widget toggle; Auto-Answer `⌘ ↵`; Move Cluely `⌘ ARROWS`; Scroll Chat `⇧ ⌘ ↑ ↓`; Collapse Chat `⌘ R`. Shortcuts shown as grey rounded key caps; hovered row has a darker highlight.

## 9. Hiding, moving, ending

- Hide all: ⌘\ / Ctrl\ (whole overlay disappears; optionally "Hide chat also hides widget"). Hovering the widget shows an X at its right to close it (support, not filmed).
- Move: drag anywhere on the bar (Windows video 05:44 to 05:52 shows bar + panel moving together), or ⌘ + arrows.
- End: click the stop square. It turns into a **spinner** in the same circle (05:26.5 to 05:28), the overlay disappears and the dashboard opens on the meeting (frame 13): "Today at 7:26 PM", big title "Summarizing", tabs **Summary | Transcript | Usage**, "Generating notes...", top-right "✉ Follow-up email", bottom bar "▶ Resume Session" + "Ask about this meeting..." input. Auto-end also happens at calendar meeting end, on mic change, or after 10 min without audio (support).
- Calendar meetings get a notification "Done with your meeting?" with a blue **Get Notes** button (frame 15).

## 10. After the call (frame 14)

Notes page: auto title ("Quarterly Goals Planning"), sections "Action Items" and "Discussion Highlights" as bullet lists, actions "↻ Regenerate", "Copy summary", "Follow-up email". Transcript tab lists speaker-labelled lines with timestamps ("Me" vs "Them"). Usage tab holds the chat history and AI usage of the call (support).

## Design tokens

Values from the cluely.com replica CSS (computed styles, 10 October 2026), cross-checked with pixels from support screenshots.

| Token | Value |
|---|---|
| Bar background | `rgba(24,23,28,0.8)`; on white it renders #17171c to #19191e |
| Bar ring | `0 0 0 1px rgba(207,226,255,0.24)`, plus top highlight `0 -0.5px 0 rgba(255,255,255,0.8)` |
| Bar buttons (Hide, Stop) | `linear-gradient(#2e3039, #272a31)`, inset top line `0 0.7px 0 #afb3c4`, radius 9999px, height 32px, Hide padding 0 12px, gap 4px |
| Hide label | 12px, weight 500, white |
| Ask button (collapsed) | blue vertical gradient, sampled #0447b3 (top) to #043b98 (bottom), white sparkles + "Ask"; same family as the navy bubble gradient |
| Panel background | `linear-gradient(rgba(24,23,28,0.75), rgba(24,23,28,0.8))` with backdrop blur; on white it reads #4a4a4d, on blue it reads dark navy |
| Panel border | `1px solid rgba(255,255,255,0.25)` + same ring and top highlight as bar |
| Panel radius | 16px; thread padding 16px 16px 8px; input area padding 0 12px 12px |
| Navy user bubble / send button | `linear-gradient(#0544a9, #022c70)`, ring `0 0 0 0.5px #0c44a1`, inset `0 0.5px 0 #81b6ff` and `0 -1px 0 #022c70` |
| Bubble shape | radius `12px 12px 2px 12px` (sharp bottom right), padding 6px 10px, 12px text (replica) |
| Assist bubble | gradient about #4153c0 to #865cf1 (blue to violet), soft glow |
| Answer text | #edeef2, replica 12px/19.2px; real app about 15 to 16px, line height about 1.6 |
| Action row | 12px, #edeef2, button padding 8px 8px 8px 6px, icon gap 6px, separators 3px dots #898b91 |
| Input box | radius 12px, `1px solid rgba(155,155,155,0.4)`, top highlight `0 -1px 0 rgba(255,255,255,0.25)`, placeholder 13px white at 60% |
| Key caps | 20 x 22, radius 4px, `1px solid rgba(255,255,255,0.2)`, 10px text white at 50% |
| Smart chip | 26px tall pill, `1px solid rgba(255,255,255,0.15)`, text 12px/500 white at 40% (Windows: filled grey) |
| Send button | 28px circle, navy gradient above |
| Caption "Viewed screen" | about 12px, grey (white at about 50%) |
| Font | replica: Geist; real app looks like a system sans (SF on mac, Segoe-like on Windows) **(inferred)** |

Sizes: replica bar 167 x 46, panel 518 wide; mac doc panel about 540pt wide; Windows v2 panel about 800 x 740 screen px when expanded at 1920 x 1080 (display scaling unknown).

## Interaction flow

1. Dashboard: click Start Cluely (or Take Notes on a meeting detected notification). Button shows "Starting...".
2. About 2 s later the overlay appears top centre: bar `[logo][⌄ Hide][■]` + compact panel (action row + input). Audio capture starts silently.
3. Optional: click Hide; panel vanishes and the middle button becomes blue "✦ Ask". Click Ask (or press ⌘↵) to bring it back.
4. Click "What should I say?" (or Assist, Follow-up questions, Recap, or type a question). A right-aligned bubble with that label appears; panel grows to its tall state; "Viewed screen" + white dot.
5. About 1 to 4 s later the answer streams in under the caption, chunk by chunk with a short fade. Copy icon appears when done.
6. Ask again: the new bubble is appended, the thread scrolls so it is at the top; old answers stay above. "↓" button if not at bottom.
7. ⌘R clears the thread and collapses the panel; ⌘\ hides everything; drag the bar or ⌘ + arrows to move.
8. Click ■: spinner, overlay closes, dashboard opens on "Summarizing / Generating notes...", then Summary with Action Items and Discussion Highlights, Transcript and Usage tabs, Follow-up email, Resume Session.

## Sources

- Cluely support, "How to use Cluely" (12 December 2025, images dated 9 December 2025): https://support.cluely.com/en/articles/12294306-how-to-use-cluely . Frames 02b, 08, 09, 15.
- Cluely support, "How to copy transcript": https://support.cluely.com/en/articles/12084603-how-to-copy-transcript (transcript removed from widget 9 December 2025).
- Cluely support, "How to use Cluely's settings": https://support.cluely.com/en/articles/12418681-how-to-use-cluely-s-settings ; "Ambient mode": https://support.cluely.com/en/articles/12886705-how-to-turn-on-ambient-mode-for-desktop-assistance-or-silent-meetings ; "Assist vs What should I say next": https://support.cluely.com/en/articles/12665135-assist-vs-what-should-i-say-next ; "Smart mode": https://support.cluely.com/en/articles/12063703-how-to-use-smart-mode ; "Dashboard app" (September 2025, older layout with Live Insights): https://support.cluely.com/en/articles/12101340-how-to-use-cluely-s-dashboard-app .
- cluely.com homepage, rendered in headless Chromium on 10 October 2026, hero animation sampled every 0.5 s for 32 s, computed CSS extracted. Frames 11, 12, 12b.
- YouTube, StackWise, "How to Use Cluely AI for Job Interviews (2026)", https://www.youtube.com/watch?v=ChyoDTs7RQY (uploaded 27 August 2026, recorded 1 August 2026, Windows, Cluely v2.0): 04:56 Starting (frame 01), 04:58 overlay appears (03), 05:16 expanded with Assist bubble, 05:20.5 thinking dot (04), 05:24.7 streaming (05), 05:26 answer + history (06), 05:26.5 to 05:28 stop spinner, 05:32 Summarizing (13), 05:38 Ask pill (02), 06:08 to 06:10 follow-up questions, 06:14 to 06:16 more menu (10), 06:54 history with pending Assist (07), 07:08 notes (14).
- Also skimmed: https://www.youtube.com/watch?v=vlO9DesN4t4 (6 August 2026, homepage only) and https://www.youtube.com/watch?v=45yLAUvbpYo (23 June 2026, light theme dashboard, Transcript tab, settings window).

## Uncertain / inferred

- Live Insights (dynamic keyword, question and objection cards plus "Show transcript") exist only in the September 2025 dashboard article. Not seen in any December 2025 or 2026 source, so treated as removed. No proactive or automatic suggestions were observed; every answer was user triggered.
- "Auto-Answer ⌘↵" in the mac popover appears to be the Assist keybind, not an always-on mode **(inferred)**.
- Exact real-app font sizes and panel heights are estimated from video pixels; display scaling of the Windows recording is unknown. Use the replica CSS values, scaled up about 1.2x for text, as the base.
- Purpose of the top-left X on the expanded panel (clear vs collapse) was not filmed being clicked.
- Behaviour of Recap and of Smart mode output was not filmed. Smart mode is documented as web search + deeper reasoning, 8 to 20 s.
- Open and close animations of the panel (height transition) were not measurable at 2 fps; the expansion looked instant.
- Light theme of the overlay was not observed; the overlay was dark in every source, even with a light dashboard.
