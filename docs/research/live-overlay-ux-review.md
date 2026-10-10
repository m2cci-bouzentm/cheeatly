# Cheatly live-call UX review

Reviewed 9 October 2026. Scope: sales calls first, interviews second. Preserve the existing floating overlay, dark visual style, and main/side-panel structure. Improve interaction and relevance rather than redesigning the shell.

## Evidence and limits

- Visually inspected Cluely's current public homepage demonstration in a browser; its example action buttons did not produce a different answer when clicked. This is presentation evidence, not a live inference test.
- Read Cluely's official support guide for versions after 1.88.6 and its customization guide. Those articles are dated December 2025. The older September guide shows a different layout, so it is not treated as the current interaction specification.
- Read Avoma's Answer Cards setup guide and real-time sales guidance page, and Clari's Copilot documentation/product material. These establish documented workflows, not independently measured effectiveness or latency.
- Opened Cheatly's actual overlay renderer using its existing mock desktop bridge, without recording a call. Reviewed native app settings and the overlay, transcript, suggestions, prompts, and scan-state code. Existing live-call observations in this conversation also inform the critique.
- No competitor installation, paid subscription, private account access, or measured sales-outcome comparison was performed.

## Verdict

Cheatly has a workable visual foundation. The weak point is the amount of interpretation and operation required during a conversation. Users must decide which suggestion matters, request an answer, wait, and extract a speakable line. The improvement should be fewer decisions and more relevant guidance inside the existing overlay.

The current generic AI-widget tells are nested translucent surfaces, many equally weighted small buttons, faint secondary text, and sparkle/technical status cues. They do not justify a new visual identity. Clearer hierarchy, legibility, and content would improve the experience more.

### Keep

- The movable floating window and attached selectors.
- Focus view's emphasis on the latest answer, with history available separately.
- Explicit user requests alongside optional proactive assistance.
- Transcript access for checking what the app heard.
- The existing main panel plus suggestions panel, with distinct purposes.

## Competitor patterns worth adapting

| Tool | Verified public pattern | Application to Cheatly |
| --- | --- | --- |
| [Cluely](https://support.cluely.com/en/articles/12294306-how-to-use-cluely) | A small recording widget opens assistance on demand; keyboard access and short task actions. Its guide says the transcript moved to the dashboard in v1.89.0. | Keep our transcript accessible, but make assistance the primary live task. Expose one memorable shortcut and clearer recording/hide states. |
| [Cluely Modes](https://support.cluely.com/en/articles/12006358-how-to-customize-cluely) | Custom prompts and uploaded documents provide call-specific knowledge. | Make the existing context and skills visible as the active call context before recording. |
| [Avoma](https://help.avoma.com/live-answer-assistant-setup) | Triggered answer cards contain brief talking points; cards can be dismissed and revisited in a drawer, with helpfulness feedback. The documented display timeout is 20 seconds. | Deliver useful guidance directly, keep a history, and learn which suggestions help. Do not automatically remove a card while someone is reading it. |
| [Clari Copilot](https://www.clari.com/blog/clari-labs-battlecards/) | Relevant talk tracks surface around triggers such as pricing and competitor discussions. | Give sales suggestions a specific purpose and use approved product information for factual claims. |

## Five priorities

### 1. Give the suggestions panel an immediately useful job

**Observed:** `QuestionsPanel.tsx` renders a prompt, intent, and age. Selecting it sends a new request to the main assistant. The backend already emits objection, buying-signal, clarification, and other types with priority; the card does not use type or priority to guide attention.

**Change:** Keep the panel. Give each item a short purpose label — **Say**, **Ask**, or **Remember** — plus its topic, one usable line, and an optional source phrase. Show the most relevant item first and at most three current items initially. Selecting it opens supporting detail in the main panel. Prepare the short line when detecting the opportunity instead of requiring another click before any help is available. Avoid generating long answers for every background suggestion.

Example, using a hypothetical price objection:

> **ASK · Budget concern**  
> “Is the concern the total budget, or whether the value justifies it?”  
> Heard: “This is more than we planned to spend.”  
> **More detail** · **Handled** · **Dismiss**

The main panel remains the place for a complete answer or a custom question. This makes the two surfaces complementary.

### 2. Manage relevance over time

**Observed:** Each scan can return up to five items. Scan state prepends new items, deduplicates exact normalized text, and retains previous suggestions until dismissal/reset. There is no general expiry, semantic duplicate merging, or automatic resolved-state handling. The default scan interval is 20 seconds, followed by model latency.

**Change:** Retire resolved and off-topic suggestions, merge repeated mentions of the same concern, and distinguish **new**, **handled**, and **earlier**. Retain history without making it compete with the current moment. Keep an opened answer stable; new suggestions should not replace text under the reader's eyes.

Then evaluate triggering analysis after meaningful completed speech turns, with debouncing and a minimum request interval. Measure delay before changing timing; simply scanning constantly increases cost and noise. Preserve manual assistance as the immediate override.

### 3. Make responses easy to say aloud

**Observed:** The system prompt asks for concise responses but gives no tight output structure. Focus view renders the complete response. A live response earlier in this session included an introduction, a long suggested speech, a shorter alternative, and a follow-up offer.

**Change:** Start with one or two natural sentences, targeting roughly 20–40 words for the first visible suggestion. Put rationale, evidence, and alternatives behind **More**. Make **Shorter** and **Another angle** act on the current response. Allow longer answers when explicitly requested or needed for an interview explanation.

Rename **What to answer?** to **Help me respond**, **Follow Up** to **Suggest a question**, and make the subject of **Clarify** explicit. These are different intentions, not interchangeable chat prompts. Sales mode should favor discovery, objections, and next steps; interview mode should favor explaining reasoning and clarifying the question.

### 4. Clarify recording, pausing, hiding, and ending

**Observed:** The pill has Hide Overlay, Discard, Stop & Save, and Back to App. Audio and analysis controls live elsewhere. Back to App deliberately keeps recording. There is no elapsed recording timer in `TopPill.tsx`. Q-Detect describes an internal feature rather than what the user receives.

**Change:** Keep the pill and add elapsed time plus an honest recording/audio status. Rename Q-Detect to **Suggestions**. Make **Pause suggestions** visibly distinct from **Pause recording**. Say that audio mute controls affect Cheatly capture, not the microphone in Zoom/Meet. Hiding or returning to the app should leave a clear “Recording continues” status. Move Discard into a secondary menu and confirm destructive discarding; keep End & Save easy to find.

Improve contrast and hit areas for secondary actions. Suggestion cards should be keyboard-operable controls with accessible names; their current clickable outer `div` has no native keyboard activation, and dismiss is hover-only and unlabeled.

### 5. Show what the assistant knows, and who actually spoke

**Observed:** Existing skills/context support is useful, but active call purpose and knowledge are not prominent in the overlay. The transcript's `Me | Them` represents microphone versus system-audio sources. Consecutive turns from the same source are combined. It does not identify each remote participant.

**Change:** Before a call, offer a small optional context summary: sales/interview, goal, company/role, and selected product documents or resume. During the call, expose that context in the existing settings/menu. For product claims, display a source or make uncertainty explicit rather than inventing a commitment.

Use **You** and **Other participants** until there is actual speaker identification. Multiple remote people must not be presented as one known buyer or interviewer. Later, add speaker labels with an explicit unknown state and manual correction; reliable diarization is a separate audio capability, not a visual-label change.

## Suggested implementation sequence

1. **Interaction polish:** clearer labels, timer/status, accessible cards, destructive-action handling, shorter first answers. Preserve the layout and existing functionality.
2. **Suggestion usefulness:** purpose/type/priority, directly useful text, handled state, semantic deduplication, ageing/history, stable reading state.
3. **Sales context and timing:** connect the current context/skills to call goals and approved answers; measure and improve trigger latency. Add speaker identification only when reliable.

Relevant design passes: `/clarify` for wording, `/harden` for states and accessible interactions, and `/polish` for contrast and click targets. No visual redesign is a prerequisite.

## How to judge improvement

Replay the same short sales scenarios through both versions: pricing objection, competitor comparison, unclear question, already-answered question, buying signal, overlapping remote speakers, silence, and missing product information.

Measure time from the end of the customer's turn to usable guidance; clicks needed to get a speakable response; stale/duplicate suggestions; unsupported product claims; and whether the user can identify the best next action with a brief glance. Include a real-call usability session with the main answer open while new suggestions arrive. Proposed reading target: understand the first suggestion in about two seconds. This is a design target, not a measured result.

## Implementation evidence

- `src/components/questions/QuestionsPanel.tsx`: prompt/intent cards, fixed 280px panel, interactions.
- `src/pages/AssistantOverlay/index.tsx`: 600px main shell, panel visibility, model/scanning/audio controls.
- `src/pages/AssistantOverlay/components/FocusView.tsx`: latest-answer presentation and 13px response text.
- `src/pages/AssistantOverlay/components/SuggestionControls.tsx`: action names and input flow.
- `src/components/ui/TopPill.tsx`: recording controls and navigation.
- `src-tauri/resources/prompts/question-detection.md`: existing semantic signal types and priority.
- `src-tauri/src/assistant/questions.rs`: scan interval, insertion, deduplication, and retention.
- `src/lib/dialogueTranscript.ts`: two audio-source labels and consecutive-turn merging.
