export function sanitizePartialMarkdown(text: string): string {
  let result = text;

  // Close unclosed fenced code blocks (```)
  const fenceCount = (result.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    result += '\n```';
  }

  // Close unclosed inline code (`)
  const backtickCount = (result.match(/(?<!`)`(?!`)/g) || []).length;
  if (backtickCount % 2 !== 0) {
    result += '`';
  }

  // Close unclosed bold (**)
  const boldCount = (result.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) {
    result += '**';
  }

  // Close unclosed italic (single * not part of **)
  const singleStarCount = (result.match(/(?<!\*)\*(?!\*)/g) || []).length;
  if (singleStarCount % 2 !== 0) {
    result += '*';
  }

  // Close unclosed strikethrough (~~)
  const strikeCount = (result.match(/~~/g) || []).length;
  if (strikeCount % 2 !== 0) {
    result += '~~';
  }

  // Remove trailing incomplete link/image syntax that would render as broken
  // e.g. "[text" or "[text](" or "![alt"
  result = result.replace(/!?\[[^\]]*$/, '');
  result = result.replace(/\]\([^)]*$/, '');

  return result;
}
