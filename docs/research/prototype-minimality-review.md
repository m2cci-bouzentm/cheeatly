# Minimal overlay review — 9 October 2026

Scope: standalone HTML prototype only. Independent sub-agent critique followed by revision and second review. Application code is unchanged.

## First verdict: too much visible interface

The reviewer found roughly 27 visible controls/disclosures in the original screenshot. This is an approximate visual count, not a usability measurement.

1. Answer tools, view tabs, request buttons and capture settings compete with the answer.
2. Suggestions repeat headings, relevance labels, counts and explanatory copy.
3. Main response and first suggestion repeat the same pricing advice.
4. Pin changes presentation but not retention behavior; answers already stay stable.
5. Two fixed 445px panels and translucent surfaces give a dashboard feel.

## Revision

- Preserve dark main panel, secondary suggestions panel and recording pill.
- Reduce overlay width from 890 to 770px; main panel from 445 to 320px high; suggestions size to their content.
- One view selector replaces three tabs. One switch controls suggestions.
- Keep Help me respond and the composer visible. Other request actions live in an attached menu.
- Keep Shorter visible; alternate answer, copy, rationale and source share one disclosure.
- Remove Pin, repeated labels and duplicate initial guidance. One Done action moves a suggestion to Earlier.
- Use opaque panels and quieter borders/shadows; preserve familiar system typography.
- Keep the original HTML available through Compare previous version.

## Independent second review

The reviewer judged all five visual issues substantially addressed, then identified two interaction regressions: response selection used the remaining reminder card, and the smaller panel could clip the session menu. Both were corrected. Requests now use the current scenario moment; the menu has a constrained, scrollable height. The suggestions switch also gained visible On/Off text.

## Click checks

Used the actual browser UI to check:
- Rendering and screenshot hierarchy.
- More → Another angle.
- Next moment preserves the open response; View latest explicitly replaces it.
- Done moves guidance to Earlier and it remains accessible.
- Help me respond returns a speakable response, not the reminder card.
- More assistant actions → Suggest a question returns the actual budget question.
- Suggestions switch shows Off / Suggestions paused.
- Session options → Discard opens confirmation; Keep session restores the overlay.

These are targeted prototype checks with scripted data, not tests of the installed app or live inference.

## Competitor evidence

Inspected the current public [Cluely homepage demo](https://cluely.com/) visually in a browser. It presents a compact answer area, a small recording pill, request actions, and a composer. Its restrained control grouping informs this revision. No Cluely installation or live account test was performed. The official support article was unavailable during this pass.

Final source review also caught an undefined topic in Quiet call → Recap. Added a fallback for that empty state before finishing.
