export type DialogueSpeaker = 'Me' | 'Them';

export interface DialogueTurn {
  speaker: DialogueSpeaker;
  text: string;
}

export function appendDialogueFinal(
  turns: DialogueTurn[],
  speaker: DialogueSpeaker,
  text: string
): DialogueTurn[] {
  const trimmed = text.trim();
  if (!trimmed) return turns;
  const last = turns[turns.length - 1];
  if (last && last.speaker === speaker && last.text === trimmed) return turns;
  if (last && last.speaker === speaker) {
    return [
      ...turns.slice(0, -1),
      { speaker, text: `${last.text} ${trimmed}` },
    ];
  }
  return [...turns, { speaker, text: trimmed }];
}

export type LivePartials = { Me: string | null; Them: string | null };
