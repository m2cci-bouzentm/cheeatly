// Text-side cleanup for the local STT engine. No electron imports — unit
// tests import the compiled module directly.

const FILLER_WORDS = [
  'uh',
  'um',
  'uhm',
  'umm',
  'uhh',
  'uhhh',
  'hmm',
  'hm',
  'mmm',
  'mm',
  'mh',
  'mhm',
  'ehh',
  'eh',
  'euh',
  'euhh',
  'auh',
  'ah',
  'ahh',
  'oh',
  'ooh',
  'er',
  'err',
  'erm',
  'urm',
  'emm',
  'ahem',
  'uh-huh',
  'mm-hmm',
  'mm-hm',
  'mm-mm',
  'nuh-uh',
];

const FILLER_PATTERN = new RegExp(
  FILLER_WORDS.sort((a, b) => b.length - a.length)
    .map((w) => `\\b${w.replace(/-/g, '[\\s-]?')}\\b[,.]?`)
    .join('|'),
  'gi'
);

const EXTENDED_FILLER = /\b(?:a+h+|e+h+|o+h+|u+h+|m+m+|h+m+)\b[,.]?/gi;

const TAG_BLOCK_PATTERN = /<([A-Za-z][A-Za-z0-9:_-]*)[^>]*>[\s\S]*?<\/\1>/g;
const HALLUCINATION_PATTERNS = [/\[.*?\]/g, /\(.*?\)/g, /\{.*?\}/g];

// Parakeet (like Whisper) decodes near-silence into these stock phrases —
// a quiet mic channel emits phantom "Thank you." turns all meeting long.
// Dropped ONLY when the artifact is the ENTIRE segment: a real "thank you"
// inside any longer sentence always survives.
const SILENCE_ARTIFACTS = new Set([
  'thank you',
  'thank you very much',
  'thanks for watching',
  'thank you for watching',
  'bye',
  'you',
]);

export function filterTranscript(text: string): string {
  let out = text;
  out = out.replace(TAG_BLOCK_PATTERN, '');
  for (const pat of HALLUCINATION_PATTERNS) {
    out = out.replace(pat, '');
  }
  out = out.replace(FILLER_PATTERN, '');
  out = out.replace(EXTENDED_FILLER, '');
  out = out.replace(/\s{2,}/g, ' ').trim();
  if (SILENCE_ARTIFACTS.has(out.toLowerCase().replace(/[.!?,\s]+$/, '')))
    return '';
  return out;
}
