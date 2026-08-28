export function readingInfo(body: string): { words: number; minutes: number } {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ');
  const cjk = (text.match(/[一-龥]/g) || []).length;
  const en = (text.match(/[A-Za-z0-9]+/g) || []).length;
  const words = cjk + en;
  const minutes = Math.max(1, Math.round(words / 400));
  return { words, minutes };
}
